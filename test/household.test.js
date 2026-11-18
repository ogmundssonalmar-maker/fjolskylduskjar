import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { household } from '../src/household.js';
import { readCalendar } from '../src/calendar.js';
import worker from '../src/worker.js';

test('two devices share a D1 state and a stale write cannot replace it', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_household.sql', 'utf8'));
  const DB = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        first: () => stmt.get(),
        bind: (...values) => ({ run: () => ({ meta: stmt.run(...values) }) }),
      };
    },
  };
  const url = 'https://example.com/api/household';
  const get = async () => (await household(new Request(url), { DB })).json();
  const put = (state, origin = 'https://example.com') => household(new Request(url, {
    method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }), { DB });

  const empty = await get();
  assert.deepEqual(empty, { version: 0 });
  const meals = Array.from({ length: 7 }, () => ({ name: 'Matur', day: 'Mán', minutes: null, url: '' }));
  const first = { ...empty, tasks: [{ name: 'Verk', done: false }], meals };
  assert.equal((await put(first, 'https://external.example')).status, 403);
  assert.equal((await put(first)).status, 200);
  assert.equal((await put(first)).status, 409);
  const second = await get();
  second.tasks[0].done = true;
  assert.equal((await put(second)).status, 200);
  assert.deepEqual(await get(), { ...second, version: 2 });
  assert.equal((await worker.fetch(new Request(url), { DB })).status, 403);
  sqlite.close();
});

test('calendar uses OAuth, follows pages and preserves recurring occurrences', async (t) => {
  const event = (date, end) => ({ iCalUID: 'weekly', summary: 'Æfing', start: { date }, end: { date: end } });
  t.mock.method(globalThis, 'fetch', async (value, options) => {
    const url = new URL(value);
    if (url.hostname === 'oauth2.googleapis.com') {
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      return Response.json({ access_token: 'test-token' });
    }
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(url.searchParams.get('singleEvents'), 'true');
    return Response.json(url.searchParams.has('pageToken')
      ? { items: [event('2026-11-26', '2026-11-27')] }
      : { items: [event('2026-11-19', '2026-11-20')], nextPageToken: 'next' });
  });
  const data = await readCalendar({
    GOOGLE_CALENDAR_IDS: 'first,second',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'refresh',
  }, new Date('2026-11-18'));
  assert.equal(data.connected, true);
  assert.deepEqual(data.events.map(({ start, end }) => [start, end]),
    [['2026-11-19', '2026-11-19'], ['2026-11-26', '2026-11-26']]);
});

test('Worker serves calendar reads without signing in while protecting shared state', async () => {
  const base = 'https://example.com';
  const calendar = await worker.fetch(new Request(base + '/api/calendar'), {});
  assert.equal(calendar.status, 200);
  assert.deepEqual(await calendar.json(), { connected: false, events: [] });

  for (const [path, method] of [['/api/calendar', 'POST'], ['/api/household', 'GET'], ['/api/household', 'PUT']]) {
    assert.equal((await worker.fetch(new Request(base + path, { method }), {})).status, 403);
  }
});


test('public calendar diagnoses OAuth rejection without exposing Google response details', async t => {
  const request = new Request('https://example.com/api/calendar');
  const env = { GOOGLE_CALENDAR_IDS: 'test-id' };
  assert.equal((await (await worker.fetch(request, env)).json()).code, 'missing_google_credentials');

  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: 'invalid_grant', error_description: 'Sensitive provider text',
  }, { status: 400 }));
  const response = await worker.fetch(request, {
    ...env, GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh',
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error: 'Ekki náðist í Google Calendar.', code: 'google_refresh_token_rejected',
  });
});

test('calendar can fetch the full selected month including days before today', async t => {
  const env = {
    GOOGLE_CALENDAR_IDS: 'first',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'refresh',
  };
  const google = t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'token' });
    assert.equal(url.searchParams.get('timeMin'), '2026-12-01T00:00:00.000Z');
    assert.equal(url.searchParams.get('timeMax'), '2027-01-01T00:00:00.000Z');
    return Response.json({ items: [] });
  });
  const valid = await worker.fetch(new Request('https://example.com/api/calendar?month=2026-12'), env);
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).connected, true);
  const invalid = await worker.fetch(new Request('https://example.com/api/calendar?month=2026-13'), env);
  assert.equal(invalid.status, 400);
  assert.equal(google.mock.callCount(), 2);
});
