import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { household, readApprovedShopping } from '../src/household.js';
import { readCalendar } from '../src/calendar.js';
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
  const { addCalendarEvent } = await import('../src/calendar.js');
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
  assert.equal((await call(weeklyMenu,'PUT',{version:0,meals,shoppingAction:{type:'approve'}},cookie)).status,200);
  const followingWeek = await (await call('/api/todo/export','POST',{week:nextWeek},cookie)).json();
  assert.deepEqual(followingWeek,{added:1,updated:0,skipped:0,failed:0});
  assert.equal(batches[1][0].body.title,'gulrót · 2 stk');
});
