import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { household, readApprovedShopping } from '../src/household.js';
import { addCalendarEvent, readCalendar } from '../src/calendar.js';
import { generateWeeklyDraft, kronanDinnerCatalog } from '../src/menu-automation.js';
import { weekStart } from '../src/shopping.js';
import worker from '../src/worker.js';

function testD1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      function statement(values) {
        return {
          first: () => stmt.get(...values),
          all: () => ({ results: stmt.all(...values) }),
          run: () => ({ meta: stmt.run(...values) }),
        };
      }
      return { ...statement([]), bind: (...values) => statement(values) };
    },
  };
}

test('first access initializes an empty D1 database and stale writes cannot replace shared state', async t => {
  const DB = testD1(t);
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

test('calendar links and household-authorized writes use only the configured family calendar', async t => {
  const base = 'https://example.com';
  const googleLink = 'https://calendar.google.com/calendar/event?eid=example';
  const env = {
    HOUSEHOLD_EDIT_CODE: 'local-test-edit-code',
    GOOGLE_CALENDAR_IDS: 'family-calendar',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'refresh',
  };
  const post = (path, body, cookie = '') => new Request(base + path, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const session = await worker.fetch(post('/api/household/session', { code: env.HOUSEHOLD_EDIT_CODE }), env);
  assert.equal(session.status, 200);
  const cookie = session.headers.get('Set-Cookie').split(';')[0];
  const draft = { id: '12345678123412341234123456789abc', title: 'Fjölskyldufundur',
    date: '2026-12-31', owner: 'oddny', startTime: '', endTime: '' };
  assert.equal((await worker.fetch(post('/api/calendar/events', draft, cookie), env)).status, 403);
  env.GOOGLE_CALENDAR_WRITES_ENABLED = 'true';
  assert.equal((await worker.fetch(post('/api/calendar/events', draft), env)).status, 403);
  assert.equal((await worker.fetch(post('/api/calendar/events', { ...draft, date: '2026-02-30' }, cookie), env)).status, 400);

  let created;
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'token' });
    assert.equal(options.headers.Authorization, 'Bearer token');
    const pathname = new URL(url).pathname;
    if (options.method === 'POST') {
      assert.match(pathname, /\/family-calendar\/events$/);
      const event = JSON.parse(options.body);
      assert.equal(event.colorId, '3');
      assert.equal(event.extendedProperties.private.dashboardOwner, 'oddny');
      assert.deepEqual(event.start, { date: '2026-12-31' });
      assert.deepEqual(event.end, { date: '2027-01-01' });
      if (writes++ > 0) return new Response(null, { status: 409 });
      created = { ...event, htmlLink: googleLink };
      return Response.json(created);
    }
    if (pathname.endsWith(draft.id)) return Response.json(created);
    return Response.json({ items: [
      created,
      { ...created, id: 'other', summary: 'Fundur - Almar', htmlLink: 'https://example.net/calendar/event',
        extendedProperties: undefined },
    ] });
  });

  for (let i = 0; i < 2; i++) {
    const response = await worker.fetch(post('/api/calendar/events', draft, cookie), env);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).htmlLink, googleLink);
  }
  const calendar = await (await worker.fetch(new Request(base + '/api/calendar'), env)).json();
  assert.equal(calendar.canCreateEvents, true);
  assert.deepEqual(calendar.events.map(({ owner, htmlLink }) => [owner, htmlLink]),
    [['oddny', googleLink], ['almar', '']]);
});

test('multi-day events include the last date and support overnight timed events', async t => {
  const env = {
    GOOGLE_CALENDAR_WRITES_ENABLED: 'true',
    GOOGLE_CALENDAR_IDS: 'family-calendar',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'refresh',
  };
  const draft = { id: '12345678123412341234123456789abc', title: 'Ferð',
    date: '2026-12-30', endDate: '2027-01-02', owner: 'family' };
  let saved;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'token' });
    saved = JSON.parse(options.body);
    return Response.json({});
  });

  await addCalendarEvent(env, draft);
  assert.deepEqual(saved.start, { date: '2026-12-30' });
  assert.deepEqual(saved.end, { date: '2027-01-03' });

  await addCalendarEvent(env, { ...draft, startTime: '23:00', endTime: '10:00' });
  assert.equal(saved.start.dateTime, '2026-12-30T23:00:00Z');
  assert.equal(saved.end.dateTime, '2027-01-02T10:00:00Z');

  for (const invalid of [
    { ...draft, endDate: '2026-12-29' },
    { ...draft, endDate: '2027-02-30' },
    { ...draft, startTime: '23:00' },
    { ...draft, endDate: '', startTime: '23:00', endTime: '10:00' },
  ]) {
    await assert.rejects(addCalendarEvent(env, invalid), { code: 'invalid_calendar_event' });
  }
});

test('recurring and single events write distinct Google Calendar rules and retry safely', async t => {
  const env = {
    GOOGLE_CALENDAR_WRITES_ENABLED:'true', GOOGLE_CALENDAR_IDS:'family-calendar',
    GOOGLE_CLIENT_ID:'client', GOOGLE_CLIENT_SECRET:'secret', GOOGLE_REFRESH_TOKEN:'refresh',
  };
  const draft = { id:'12345678123412341234123456789abc', title:'Æfing', date:'2026-11-23', owner:'children' };
  const existingLink = 'https://calendar.google.com/calendar/event?eid=existing';
  let saved;
  let conflict = false;
  const google = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token:'token' });
    if (options.method !== 'POST') return Response.json({ ...saved,
      recurrence:['RRULE:COUNT=4;WKST=SU;FREQ=WEEKLY;INTERVAL=1'], htmlLink:existingLink });
    if (conflict) return new Response(null, { status:409 });
    saved = JSON.parse(options.body);
    return Response.json({});
  });
  await addCalendarEvent(env, draft);
  assert.equal(saved.recurrence, undefined);
  await addCalendarEvent(env, { ...draft, recurrence:{ frequency:'daily' } });
  assert.deepEqual(saved.recurrence, ['RRULE:FREQ=DAILY']);
  await addCalendarEvent(env, { ...draft, endDate:'2026-11-24', recurrence:{ frequency:'biweekly', until:'2026-12-21' } });
  assert.deepEqual(saved.start, { date:'2026-11-23' });
  assert.deepEqual(saved.end, { date:'2026-11-25' });
  assert.deepEqual(saved.recurrence, ['RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261221']);
  await addCalendarEvent(env, { ...draft, startTime:'17:15', endTime:'18:00', recurrence:{ frequency:'monthly', until:'2027-01-23' } });
  assert.deepEqual(saved.start, { dateTime:'2026-11-23T17:15:00Z', timeZone:'Atlantic/Reykjavik' });
  assert.deepEqual(saved.recurrence, ['RRULE:FREQ=MONTHLY;UNTIL=20270123T235959Z']);
  await addCalendarEvent(env, { ...draft, recurrence:{ frequency:'yearly' } });
  assert.deepEqual(saved.recurrence, ['RRULE:FREQ=YEARLY']);

  const weekly = { ...draft, recurrence:{ frequency:'weekly', count:4 } };
  await addCalendarEvent(env, weekly);
  assert.deepEqual(saved.recurrence, ['RRULE:FREQ=WEEKLY;COUNT=4']);
  conflict = true;
  assert.deepEqual(await addCalendarEvent(env, weekly), { htmlLink:existingLink });
  await assert.rejects(addCalendarEvent(env, { ...weekly, recurrence:{ frequency:'weekly', count:5 } }), { code:'google_calendar_http_409' });
  await assert.rejects(addCalendarEvent(env, draft), { code:'google_calendar_http_409' });
  const calls = google.mock.callCount();
  for (const recurrence of [null, { frequency:'HOURLY' }, { frequency:'weekly', until:'2026-11-22' },
    { frequency:'daily', until:'2026-11-31' }, { frequency:'daily', until:'2026-11-30', count:2 },
    { frequency:'weekly', count:0 }, { frequency:'weekly', count:2.5 }, { frequency:'weekly', count:'2' }]) {
    const request = new Request('https://example.com/api/calendar/events', { method:'POST',
      headers:{ Origin:'https://example.com', 'Content-Type':'application/json' }, body:JSON.stringify({ ...draft, recurrence }) });
    const response = await household(request, env);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /tíðni/);
  }
  assert.equal(google.mock.callCount(), calls);
});

test('trips retry the same Google event and keep each checklist private', async t => {
  const base = 'https://example.com';
  const env = {
    DB: testD1(t),
    HOUSEHOLD_EDIT_CODE: 'local-test-edit-code',
    GOOGLE_CALENDAR_WRITES_ENABLED: 'true',
    GOOGLE_CALENDAR_IDS: 'family-calendar',
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REFRESH_TOKEN: 'refresh',
  };
  const request = (path, method = 'GET', data, cookie = '') => new Request(base + path, {
    method, headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const call = (...args) => worker.fetch(request(...args), env);
  const session = await call('/api/household/session', 'POST', { code: env.HOUSEHOLD_EDIT_CODE });
  const cookie = session.headers.get('Set-Cookie').split(';')[0];
  const draft = { id: '12345678123412341234123456789abc', title: 'Helgarferð', start: '2026-12-30', end: '2027-01-02' };
  assert.equal((await call('/api/trips')).status, 403);
  assert.equal((await call('/api/trips', 'POST', draft)).status, 403);

  const htmlLink = 'https://calendar.google.com/calendar/event?eid=test';
  let created;
  let writes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com')) return Response.json({ access_token:'test-token' });
    if (options.method === 'POST') {
      const event = JSON.parse(options.body);
      assert.equal(event.id, draft.id);
      assert.deepEqual(event.start, { date: draft.start });
      assert.deepEqual(event.end, { date: '2027-01-03' });
      assert.equal(event.extendedProperties.private.dashboardEventType, 'trip');
      created = { ...event, htmlLink };
      if (++writes === 1) return new Response(null, { status: 503 });
      return new Response(null, { status: 409 });
    }
    if (String(url).endsWith('/' + draft.id)) return Response.json(created);
    return Response.json({ items: [created] });
  });
  const pending = await call('/api/trips', 'POST', draft, cookie);
  assert.equal(pending.status, 202);
  assert.equal((await pending.json()).trip.synced, false);
  const synced = await call('/api/trips', 'POST', draft, cookie);
  assert.equal(synced.status, 201);
  assert.equal((await synced.json()).trip.htmlLink, htmlLink);
  assert.equal((await call('/api/trips', 'POST', draft, cookie)).status, 200);
  assert.equal(writes, 2);

  const checklist = [{ name: 'Athuga flug', done: true }];
  for (const id of [draft.id, 'kanari-2026']) {
    const change = { id, version:0, checklist };
    const saved = await call('/api/trips', 'PUT', change, cookie);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).trip.version, 1);
    assert.equal((await call('/api/trips', 'PUT', change, cookie)).status, 409);
  }
  const data = await (await call('/api/trips', 'GET', undefined, cookie)).json();
  assert.equal(data.trips.length, 2);
  assert.deepEqual(data.trips.find(trip => trip.id === draft.id).checklist, checklist);
  const publicCalendar = await (await call('/api/calendar')).json();
  assert.equal(publicCalendar.events[0].type, 'ferd');
  assert.equal(publicCalendar.events[0].checklist, undefined);
});

test('approval imports recipe ingredients and shares checked items while preserving older saved menus', async t => {
  const DB = testD1(t);
  const url = 'https://example.com/api/household';
  const get = async () => (await household(new Request(url), { DB })).json();
  const put = data => household(new Request(url, {
    method: 'PUT', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }), { DB });
  assert.deepEqual(await get(), { version: 0 });
  const base = { day:'Mán', minutes:null, url:'' };
  const legacy = Array.from({ length:7 }, () => ({ ...base, name:'Afgangar' }));
  legacy[0] = { ...base, name:'Krónuréttur', url:'https://kronan.is/uppskriftir/profun' };
  DB.prepare('INSERT INTO household VALUES (1, 1, ?, ?)').bind('[]', JSON.stringify(legacy)).run();

  const recipe = { servings:2, ingredientGroups:[{ ingredients:['250 g Hakk','1 dl Mjólk'] }] };
  const kronan = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://kronan.is/api/v3/mcp');
    assert.equal(JSON.parse(options.body).params.arguments.slug, 'profun');
    return new Response('event: message\ndata: ' + JSON.stringify({
      id:1, result:{ structuredContent:{ recipe } },
    }) + '\n\n', { headers:{ 'Content-Type':'text/event-stream' } });
  });
  const initial = await get();
  assert.equal(initial.shopping, null);
  assert.deepEqual(initial.meals, legacy);
  initial.meals[1] = { ...base, name:'Annar réttur', ingredients:['0,5 kg hakk','3 dl mjólk','1 stk. laukur'] };
  const approval = await put({ ...initial, shoppingAction:{ type:'approve' } });
  assert.equal(approval.status, 200);
  assert.equal(kronan.mock.callCount(), 1);
  const approved = await get();
  assert.equal(approved.shopping.missing.length, 0);
  const beef = approved.shopping.items.find(item => item.unit === 'g');
  assert.equal(beef.amount, 1000);
  assert.equal(approved.shopping.items.find(item => item.unit === 'ml').amount, 500);

  const toggled = await put({ ...approved, shoppingAction:{ type:'toggle', id:beef.id, done:true } });
  assert.equal(toggled.status, 200);
  assert.equal((await get()).shopping.items.find(item => item.id === beef.id).done, true);
  assert.equal((await put({ ...approved, shoppingAction:{ type:'toggle', id:beef.id, done:false } })).status, 409);

  const olderBrowser = await get();
  olderBrowser.meals = olderBrowser.meals.map(({ ingredients, ...meal }) => meal);
  assert.equal((await put(olderBrowser)).status, 200);
  const current = await get();
  assert.deepEqual(current.meals[0].ingredients, ['500 g Hakk','200 ml Mjólk']);
  assert.ok(current.shopping.items.find(item => item.id === beef.id).done);

  current.meals[1].ingredients = ['1 kg hakk'];
  assert.equal((await put(current)).status, 200);
  const edited = await get();
  assert.equal(edited.shopping.items.find(item => item.id === beef.id).amount, 1000);
  const legacyWeek = await (await household(new Request(url + '/menu?week=' + edited.shopping.week), { DB })).json();
  assert.equal(legacyWeek.status, 'active_with_draft');
  assert.notDeepEqual(legacyWeek.activeMeals[1].ingredients, edited.meals[1].ingredients);
  assert.equal(legacyWeek.home[edited.shopping.week][1].name, 'Annar réttur');
  const updated = await (await put({ ...edited, shoppingAction:{ type:'approve' } })).json();
  assert.equal(updated.shopping.items.find(item => item.id === beef.id).amount, 1500);
  assert.equal(updated.shopping.items.find(item => item.id === beef.id).done, false);
  assert.equal(kronan.mock.callCount(), 1);
});

test('weekly menus preserve the existing plan and track approval, checkmarks and revisions per week', async t => {
  const DB = testD1(t);
  const base = 'https://example.com';
  const originalWeek = '2026-11-16';
  const previousWeek = '2026-11-09';
  const nextWeek = '2026-11-23';
  const menuPath = week => '/api/household/menu?week=' + week;
  const call = (path, data) => household(new Request(base + path, data && {
    method:'PUT', headers:{ Origin:base, 'Content-Type':'application/json' }, body:JSON.stringify(data),
  }), { DB });
  const read = async week => (await call(menuPath(week))).json();
  const write = (week, data) => call(menuPath(week), data);
  const legacy = ['Mán','Þri','Mið','Fim','Fös','Lau','Sun'].map(day => ({ day, name:'Afgangar', minutes:null, url:'' }));
  legacy[0] = { ...legacy[0], name:'Súpa', ingredients:['2 stk. laukur'] };

  assert.equal((await call('/api/household', { meals:legacy, tasks:[], version:0 })).status, 200);
  assert.equal((await call('/api/household', { tasksOnly:true, tasks:[{ name:'Verk', done:true }], version:1 })).status, 200);
  assert.equal((await call(menuPath('2026-11-17'))).status, 400);
  assert.equal((await worker.fetch(new Request(base + menuPath(originalWeek)), { DB })).status, 403);
  assert.deepEqual((await read(originalWeek)).meals, legacy);
  assert.deepEqual((await read(previousWeek)).meals, []);
  assert.deepEqual((await read(nextWeek)).meals, []);

  const future = legacy.map(meal => ({ day:meal.day, name:'Óskráð', minutes:null, url:'' }));
  future[0] = { ...future[0], name:'Pasta', ingredients:['3 stk. laukur'] };
  const [original, next] = await Promise.all([
    write(originalWeek, { meals:legacy, version:0, shoppingAction:{ type:'approve' } }),
    write(nextWeek, { meals:future, version:0, shoppingAction:{ type:'approve' } }),
  ]);
  assert.equal(original.status, 200);
  assert.equal(next.status, 200);
  const nextState = await next.json();
  assert.equal(nextState.shopping.week, nextWeek);
  assert.deepEqual(nextState.shopping.missing, []);
  const [onion] = nextState.shopping.items;
  assert.equal((await write(nextWeek, { ...nextState, shoppingAction:{ type:'toggle', id:onion.id, done:true } })).status, 200);
  assert.equal((await write(nextWeek, { ...nextState })).status, 409);
  const originalList = await readApprovedShopping(DB, originalWeek);
  const nextList = await readApprovedShopping(DB, nextWeek);
  assert.equal(originalList.items[0].amount, 2);
  assert.equal(originalList.items[0].done, false);
  assert.equal(nextList.items[0].amount, 3);
  assert.equal(nextList.items[0].done, true);
  assert.equal(await readApprovedShopping(DB, previousWeek), null);
  assert.deepEqual((await read(nextWeek)).meals, future);

  const changeShopping = async action => {
    const response = await write(nextWeek, { ...await read(nextWeek), shoppingAction:action });
    assert.equal(response.status, 200);
    return (await response.json()).shopping;
  };
  const withExtra = await changeShopping({ type:'add', line:'2 stk. epli' });
  const extra = withExtra.items.find(item => item.manual);
  assert.equal(extra.name, 'epli');
  assert.equal(extra.amount, 2);
  await changeShopping({ type:'exclude', id:onion.id, excluded:true });
  const regenerated = await changeShopping({ type:'approve' });
  assert.deepEqual(regenerated.items.find(item => item.manual), extra);
  assert.equal(regenerated.items.find(item => item.id === onion.id).excluded, true);
  const restored = await changeShopping({ type:'exclude', id:onion.id, excluded:false });
  assert.equal(restored.items.find(item => item.id === onion.id).excluded, false);
  assert.deepEqual(await readApprovedShopping(DB, originalWeek), originalList);
});

test('JSON imports and meal edits stay private drafts until approval while prices stay with matching quantities', async t => {
  const base = 'https://example.com';
  const DB = testD1(t);
  const env = { DB, HOUSEHOLD_EDIT_CODE:'menu-test-edit-code' };
  const week = '2026-12-07';
  const path = `/api/household/menu?week=${week}`;
  const call = (url, method = 'GET', data, cookie = '', origin = base) => worker.fetch(new Request(base + url, {
    method, headers:{ Origin:origin, Cookie:cookie, 'Content-Type':'application/json' },
    body:data === undefined ? undefined : JSON.stringify(data),
  }), env);
  const session = await call('/api/household/session', 'POST', { code:env.HOUSEHOLD_EDIT_CODE });
  const cookie = session.headers.get('Set-Cookie').split(';')[0];
  const read = async () => {
    const response = await call(path, 'GET', undefined, cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    return response.json();
  };
  const write = (method, data, origin) => call(path, method, data, cookie, origin);
  const recipe = { title:'Einföld súpa', servings:4, instructions:'Sjóðið tómatana.', extra:'strip this' };
  const data = { week, meals:[{ date:week, name:'Tómatsúpa', ingredients:['500 g tómatar'], recipe, source:'  Matreiðslubókin  ' },
    { date:'2026-12-08', name:'Pasta', ingredients:['250 g pasta'] }] };

  assert.equal((await call(path)).status, 403);
  assert.equal((await call(path, 'POST', { version:0, data })).status, 403);
  assert.equal((await write('POST', { version:0, data }, 'https://other.example')).status, 403);
  assert.equal((await write('POST', { version:0, data:{ ...data, meals:[data.meals[0], data.meals[0]] } })).status, 400);
  assert.equal((await write('POST', { version:0, data:{ ...data,
    meals:[{ ...data.meals[0], url:'javascript:alert(1)' }] } })).status, 400);
  assert.equal((await read()).version, 0);

  const imported = await write('POST', { version:0, data, shoppingAction:{ type:'approve' } });
  assert.equal(imported.status, 200);
  let state = await read();
  assert.equal(state.status, 'draft');
  assert.equal(state.home[week], null);
  assert.equal(state.shopping, null);
  assert.equal(state.meals[6].name, 'Óskráð');
  assert.deepEqual(state.meals[0].recipe, { title:recipe.title, servings:4, instructions:recipe.instructions });
  assert.equal(state.meals[0].source, 'Matreiðslubókin');
  assert.equal((await write('POST', { version:0, data })).status, 409);
  const action = async shoppingAction => {
    const response = await write('PUT', { ...await read(), shoppingAction });
    assert.equal(response.status, 200);
    return response.json();
  };
  state = await action({ type:'approve' });
  assert.equal(state.status, 'active');
  assert.equal(state.activeMeals[0].source, 'Matreiðslubókin');
  assert.match(state.approvedAt, /^20\d\d-/);
  const tomato = state.shopping.items.find(item => item.name === 'tómatar');
  const pasta = state.shopping.items.find(item => item.name === 'pasta');
  assert.equal((await write('PUT', { ...state, shoppingAction:{ type:'price', id:tomato.id,
    price:{ amount:-5, status:'confirmed' } } })).status, 400);
  await action({ type:'price', id:tomato.id, price:{ amount:699, status:'estimated' } });
  await action({ type:'price', id:pasta.id, price:{ amount:349, status:'confirmed' } });
  const update = { week, meals:[{ date:week, name:'Tómatsósa', ingredients:['750 g tómatar'] }] };
  assert.equal((await write('POST', { version:(await read()).version, data:update })).status, 200);
  state = await read();
  assert.equal(state.status, 'active_with_draft');
  assert.equal(state.meals[0].name, 'Tómatsósa');
  assert.equal(state.meals[1].name, 'Pasta');
  assert.equal(state.home[week][0].name, 'Tómatsúpa');
  assert.deepEqual(state.shopping.items.find(item => item.id === tomato.id).price, { amount:699, status:'estimated' });
  state = await action({ type:'approve' });
  assert.equal(state.activeMeals[0].name, 'Tómatsósa');
  assert.equal(state.shopping.items.find(item => item.id === tomato.id).price, undefined);
  assert.deepEqual(state.shopping.items.find(item => item.id === pasta.id).price, { amount:349, status:'confirmed' });
  state = await action({ type:'price', id:pasta.id, price:null });
  assert.equal(state.shopping.items.find(item => item.id === pasta.id).price, null);
});

function kronanDinnerResponse(slug) {
  return Response.json({ id:1, result:{ structuredContent:{ recipe:{ name:slug, totalMinutes:30, servings:4,
    recipeButton:{ url:`https://kronan.is/uppskriftir/${slug}` }, ingredientGroups:[{ ingredients:['500 g gulrætur'] }],
    stepGroups:[{ name:'Súpa', steps:[{ text:'Skerið gulræturnar niður.' }, { text:'Sjóðið þær og maukið.' }] }],
  } } } });
}

const selectionResponse = slugs => Response.json({ status:'completed', output:[{
  content:[{ type:'output_text', text:JSON.stringify({ slugs }) }],
}] });

test('scheduled selection writes only verified Krónan recipes into an empty draft and runs once per week', async t => {
  const DB = testD1(t);
  const env = { DB, OPENAI_API_KEY:'test-key', OPENAI_MENU_MODEL:'test-model' };
  const scheduledTime = Date.parse('2026-12-06T17:00:00Z');
  const week = '2026-12-07';
  const selected = ['plokkfiskur', 'pinsa', 'graenmetissupa', 'carbonara', 'lax_saetkartoflu', 'hakk_spaghetti', 'alfredo'];
  const lookups = [];
  let openaiCalls = 0;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    if (url === 'https://kronan.is/api/v3/mcp') {
      assert.equal(body.params.name, 'fetch_recipe');
      const { slug } = body.params.arguments;
      lookups.push(slug);
      return kronanDinnerResponse(slug);
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    openaiCalls++;
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(body.store, false);
    assert.equal(body.model, 'test-model');
    assert.equal(body.max_output_tokens, 500);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.ok(selected.every(slug => body.text.format.schema.properties.slugs.items.enum.includes(slug)));
    assert.match(body.input, /2026-12-07/);
    return selectionResponse(selected);
  });
  await generateWeeklyDraft(env, scheduledTime);
  assert.equal(fetchMock.mock.callCount(), 0);
  env.WEEKLY_MENU_AUTOMATION_ENABLED = 'true';
  await Promise.all([generateWeeklyDraft(env, scheduledTime), generateWeeklyDraft(env, scheduledTime)]);
  assert.equal(openaiCalls, 1);
  assert.deepEqual(lookups.slice(0, 7), selected);
  const request = new Request('https://example.com/api/household/menu?week=' + week);
  const state = await (await household(request, env)).json();
  assert.equal(state.status, 'draft');
  assert.deepEqual(state.meals.map(meal => meal.name), selected);
  assert.equal(state.meals[0].url, 'https://kronan.is/uppskriftir/plokkfiskur');
  assert.equal(state.meals[0].source, 'Krónan');
  assert.deepEqual(state.meals[0].ingredients, ['500 g gulrætur']);
  assert.equal(state.meals[0].recipe.instructions, 'Súpa\n1. Skerið gulræturnar niður.\n2. Sjóðið þær og maukið.');
  assert.equal(state.meals[6].recipe.servings, 4);
  assert.equal(state.home[week], null);
  assert.equal(state.shopping, null);
  const calls = fetchMock.mock.callCount();
  await generateWeeklyDraft(env, scheduledTime);
  assert.equal(fetchMock.mock.callCount(), calls);
});

test('invalid model selections use the catalog and a Krónan outage uses complete saved recipes', async t => {
  const options = { OPENAI_API_KEY:'test-key', OPENAI_MENU_MODEL:'test-model', WEEKLY_MENU_AUTOMATION_ENABLED:'true' };
  const week = '2026-12-07';
  const scheduledTime = Date.parse('2026-12-06T17:00:00Z');
  const request = new Request('https://example.com/api/household/menu?week=' + week);
  let kronanAvailable = true;
  let openaiCalls = 0;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') {
      openaiCalls++;
      return selectionResponse(['plokkfiskur', 'pinsa', 'graenmetissupa', 'carbonara', 'lax_saetkartoflu', 'hakk_spaghetti', 'unlisted']);
    }
    const { slug } = JSON.parse(options.body).params.arguments;
    assert.notEqual(slug, 'unlisted');
    return kronanAvailable ? kronanDinnerResponse(slug) : new Response(null, { status:503 });
  });
  const env = { ...options, DB:testD1(t) };
  await generateWeeklyDraft(env, scheduledTime);
  const live = await (await household(request, env)).json();
  assert.equal(live.status, 'draft');
  assert.equal(new Set(live.meals.map(meal => meal.url)).size, 7);
  assert.ok(live.meals.every(meal => meal.source === 'Krónan' && meal.recipe.instructions));
  assert.equal(openaiCalls, 1);

  kronanAvailable = false;
  const noKey = { WEEKLY_MENU_AUTOMATION_ENABLED:'true', DB:testD1(t) };
  await generateWeeklyDraft(noKey, scheduledTime);
  const saved = await (await household(request, noKey)).json();
  assert.equal(saved.status, 'draft');
  assert.equal(saved.activeMeals, null);
  assert.equal(saved.meals.length, 7);
  for (const meal of saved.meals.slice(0, 5)) {
    assert.ok(meal.ingredients.length);
    assert.equal(meal.recipe.servings, 4);
    assert.match(meal.recipe.instructions, /1\. .+\n\n2\. /);
    assert.match(meal.url, /^https:\/\/kronan\.is\/uppskriftir\//);
    assert.equal(meal.source, 'Aðlöguð uppskrift frá Krónunni');
  }
  assert.deepEqual(saved.meals.slice(5).map(meal => meal.name), ['Afgangadagur', 'Frjáls dagur']);
  assert.equal(openaiCalls, 1);
  const calls = fetchMock.mock.callCount();
  await generateWeeklyDraft(noKey, scheduledTime);
  assert.equal(fetchMock.mock.callCount(), calls);
});

test('weekly drafts can use the verified Krónan library without an upstream connection', async t => {
  const DB = testD1(t);
  DB.prepare('CREATE TABLE kronan_recipe_library (id INTEGER PRIMARY KEY, recipes TEXT NOT NULL)').run();
  const library = Object.fromEntries(kronanDinnerCatalog.map(([slug, name]) => [slug, {
    name, minutes:30, source:'Krónan', url:`https://kronan.is/uppskriftir/${slug}`,
    ingredients:['500 g gulrætur'], recipe:{ title:name, servings:4, instructions:'Skerið og sjóðið gulræturnar.' },
  }]));
  DB.prepare('INSERT INTO kronan_recipe_library VALUES (1, ?)').bind(JSON.stringify(library)).run();
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status:503 }));
  const env = { DB, WEEKLY_MENU_AUTOMATION_ENABLED:'true' };
  await generateWeeklyDraft(env, Date.parse('2026-12-06T17:00:00Z'));
  const request = new Request('https://example.com/api/household/menu?week=2026-12-07');
  const draft = await (await household(request, env)).json();
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.activeMeals, null);
  assert.equal(draft.meals.length, 7);
  assert.equal(new Set(draft.meals.map(meal => meal.url)).size, 7);
  assert.ok(draft.meals.every(meal => meal.source === 'Krónan' && meal.recipe.instructions));
});

test('household recipe ideas and link imports use the saved library and the official Krónan endpoint', async t => {
  const DB = testD1(t);
  const env = { DB, HOUSEHOLD_EDIT_CODE:'recipe-tests-only' };
  const origin = 'https://example.com';
  const endpoint = origin + '/api/household/recipes';
  const stored = { name:'Plokkfiskur', minutes:50, url:'https://kronan.is/uppskriftir/plokkfiskur', source:'Krónan',
    ingredients:['400 g ýsa'], recipe:{ title:'Plokkfiskur', servings:4, instructions:'Blandið fiskinum saman við sósuna.' } };
  DB.prepare('CREATE TABLE kronan_recipe_library (id INTEGER PRIMARY KEY, recipes TEXT NOT NULL)').run();
  DB.prepare('INSERT INTO kronan_recipe_library VALUES (1, ?)').bind(JSON.stringify({ plokkfiskur:stored })).run();
  const session = await worker.fetch(new Request(origin + '/api/household/session', { method:'POST',
    headers:{ Origin:origin, 'Content-Type':'application/json' }, body:JSON.stringify({ code:env.HOUSEHOLD_EDIT_CODE }) }), env);
  assert.equal(session.status, 200);
  const cookie = session.headers.get('Set-Cookie').split(';')[0];
  const send = (url, from = origin) => worker.fetch(new Request(endpoint, { method:'POST',
    headers:{ Origin:from, 'Content-Type':'application/json', Cookie:cookie }, body:JSON.stringify({ url }) }), env);
  assert.equal((await worker.fetch(new Request(endpoint), env)).status, 403);
  const list = await worker.fetch(new Request(endpoint, { headers:{ Cookie:cookie } }), env);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { recipes:[stored] });

  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://kronan.is/api/v3/mcp');
    const { name, arguments:{ slug } } = JSON.parse(options.body).params;
    assert.equal(name, 'fetch_recipe');
    assert.equal(slug, 'ny-uppskrift');
    const body = await kronanDinnerResponse(slug).json();
    body.result.structuredContent.recipe.servings = 2;
    return Response.json(body);
  });
  assert.equal((await send(stored.url, 'https://other.example')).status, 403);
  assert.equal((await send('javascript:alert(1)')).status, 400);
  assert.deepEqual(await (await send('https://www.kronan.is/snjallverslun/uppskriftir/plokkfiskur/?ref=recipe-list')).json(), { recipe:stored });
  assert.deepEqual(await (await send('https://kronan.is.example.org/uppskriftir/plokkfiskur')).json(), { recipe:null });
  assert.equal(fetchMock.mock.callCount(), 0);
  const live = await (await send('https://kronan.is/uppskriftir/ny-uppskrift')).json();
  assert.equal(live.recipe.recipe.servings, 2);
  assert.equal(live.recipe.source, 'Krónan');
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('the current week response shows upcoming drafts to authenticated household members', async t => {
  const DB = testD1(t);
  const current = weekStart();
  const next = new Date(current);
  next.setUTCDate(next.getUTCDate() + 7);
  const nextWeek = weekStart(next);
  const base = 'https://example.com';
  const menuPath = week => `${base}/api/household/menu?week=${week}`;
  const headers = { Origin:base, 'Content-Type':'application/json' };
  const data = { week:nextWeek, meals:[{ date:nextWeek, name:'Súpa', ingredients:['500 g tómatar'] }] };
  const future = await household(new Request(menuPath(nextWeek), {
    method:'POST', headers, body:JSON.stringify({ version:0, data }),
  }), { DB });
  assert.equal(future.status, 200);
  const viewCurrent = async () => (await household(new Request(menuPath(current)), { DB })).json();
  assert.deepEqual((await viewCurrent()).draftWeeks, [nextWeek]);
  const denied = await worker.fetch(new Request(menuPath(current)), { DB });
  assert.equal(denied.status, 403);
  assert.doesNotMatch(await denied.text(), /draftWeeks/);

  const approved = await household(new Request(menuPath(nextWeek), {
    method:'PUT', headers, body:JSON.stringify({ ...await future.json(), shoppingAction:{ type:'approve' } }),
  }), { DB });
  assert.equal(approved.status, 200);
  assert.deepEqual((await viewCurrent()).draftWeeks, []);
});

test('Microsoft To Do connects an owned shared list and exports shopping without duplicate tasks', async t => {
  const base = 'https://fjolskylduskjar.ogmundssonalmar.workers.dev';
  const DB = testD1(t);
  const env = { DB, HOUSEHOLD_EDIT_CODE:'local-test-edit-code',
    MS_TODO_CLIENT_ID:'test-microsoft-client', MS_TODO_CLIENT_SECRET:'test-microsoft-long-secret' };
  const call = (path, method='GET', body, cookie='') => worker.fetch(new Request(base+path,{
    method, headers:{ Origin:base, Cookie:cookie, 'Content-Type':'application/json' },
    body:body === undefined ? undefined : JSON.stringify(body),
  }),env);
  assert.equal((await call('/api/todo')).status,403);
  const session = await call('/api/household/session','POST',{code:env.HOUSEHOLD_EDIT_CODE});
  const cookie = session.headers.get('Set-Cookie').split(';')[0];
  const start = await call('/api/todo/connect','POST',{},cookie);
  assert.equal(start.status,200);
  const stateCookie = start.headers.get('Set-Cookie').split(';')[0];
  const auth = new URL((await start.json()).url);
  assert.equal(auth.origin,'https://login.microsoftonline.com');
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
  assert.match(auth.searchParams.get('scope'),/Tasks.ReadWrite/);
  assert.equal(auth.searchParams.get('redirect_uri'),base+'/api/todo/callback');

  const microsoftTasks = [{id:'manual-1',title:'Salt',status:'notStarted',body:{content:'Handskráð'}}];
  const batches = [];
  t.mock.method(globalThis,'fetch',async (url,options) => {
    const address = new URL(url);
    if (address.hostname === 'login.microsoftonline.com') {
      assert.equal(options.body.get('grant_type'),'authorization_code');
      assert.match(options.body.get('code_verifier'),/^[a-zA-Z0-9_-]{43,128}$/);
      return Response.json({access_token:'test-ms-access-token',refresh_token:'test-ms-refresh-token',expires_in:3600});
    }
    assert.equal(options.headers.Authorization,'Bearer test-ms-access-token');
    if (address.pathname === '/v1.0/me/todo/lists') return Response.json({value:[
      {id:'list-family',displayName:'Innkaup',isShared:true,isOwner:true},
      {id:'list-other',displayName:'Annar listi',isShared:true,isOwner:false},
    ]});
    if (address.pathname === '/v1.0/me/todo/lists/list-family/tasks') return Response.json({value:microsoftTasks});
    assert.equal(address.pathname,'/v1.0/$batch');
    const { requests } = JSON.parse(options.body);
    batches.push(requests);
    for (const task of requests) {
      assert.equal(task.url,'/me/todo/lists/list-family/tasks');
      assert.equal(task.method,'POST');
      microsoftTasks.push({id:'shopping-'+task.id,status:'notStarted',...task.body});
    }
    return Response.json({responses:requests.map(task=>({id:task.id,status:201}))});
  });
  const invalid = await call('/api/todo/callback?code=test&state=wrong','GET',undefined,stateCookie);
  assert.equal(invalid.headers.get('Location'),'/?todo=villa');
  const callback = await call('/api/todo/callback?code=test&state='+auth.searchParams.get('state'),'GET',undefined,stateCookie);
  assert.equal(callback.headers.get('Location'),'/?todo=tengt');
  const row = DB.prepare('SELECT tokens FROM todo_connection').first();
  assert.equal(row.tokens.includes('test-ms-refresh-token'),false);
  const lists = await (await call('/api/todo/lists','GET',undefined,cookie)).json();
  assert.deepEqual(lists.lists,[{id:'list-family',name:'Innkaup'}]);
  assert.equal((await call('/api/todo/list','PUT',{id:'list-other'},cookie)).status,400);
  assert.equal((await call('/api/todo/list','PUT',{id:'list-family'},cookie)).status,200);
  const meals = Array.from({length:7},()=>({day:'Mán',name:'Afgangar',minutes:null,url:''}));
  meals[0] = {...meals[0], name:'Súpa',ingredients:['2 dl mjólk','Salt']};
  await call('/api/household','PUT',{version:0,tasks:[],meals,shoppingAction:{type:'approve'}},cookie);
  const first = await (await call('/api/todo/export','POST',{},cookie)).json();
  assert.deepEqual(first,{added:1,updated:0,skipped:1,failed:0});
  const second = await (await call('/api/todo/export','POST',{},cookie)).json();
  assert.deepEqual(second,{added:0,updated:0,skipped:2,failed:0});
  assert.equal(batches.length,1);
  assert.deepEqual(microsoftTasks[0],{id:'manual-1',title:'Salt',status:'notStarted',body:{content:'Handskráð'}});
  const nextWeek = '2026-11-23';
  const weeklyMenu = '/api/household/menu?week=' + nextWeek;
  meals[0] = {...meals[0], name:'Salat', ingredients:['2 stk. gulrót']};
  const approval = await call(weeklyMenu,'PUT',{version:0,meals,shoppingAction:{type:'approve'}},cookie);
  assert.equal(approval.status,200);
  const approved = await approval.json();
  const carrot = approved.shopping.items[0];
  const exclude = await call(weeklyMenu,'PUT',{
    ...approved, shoppingAction:{type:'exclude',id:carrot.id,excluded:true},
  },cookie);
  assert.equal(exclude.status,200);
  assert.equal((await call(weeklyMenu,'PUT',{
    ...await exclude.json(), shoppingAction:{type:'add',line:'2 stk. epli'},
  },cookie)).status,200);
  const followingWeek = await (await call('/api/todo/export','POST',{week:nextWeek},cookie)).json();
  assert.deepEqual(followingWeek,{added:1,updated:0,skipped:0,failed:0});
  assert.equal(batches[1][0].body.title,'epli · 2 stk');
});
