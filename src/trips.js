import { addCalendarEvent, dateAtMidnight } from './calendar.js';

const legacyTrips = new Set(['kanari-2026', 'skidi-2027']);
const tripId = id => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);
const reply = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

async function withTripsTable(db, operation) {
  try {
    return await operation();
  } catch (error) {
    if (!/no such table: trip_plans\b/i.test(error?.message ?? '')) throw error;
    await db.prepare(`CREATE TABLE IF NOT EXISTS trip_plans (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      calendar_link TEXT NOT NULL DEFAULT '',
      calendar_synced INTEGER NOT NULL DEFAULT 0,
      checklist TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL DEFAULT 0
    )`).run();
    return operation();
  }
}

const fromRow = row => ({
  id: row.id, title: row.title, start: row.start_date, end: row.end_date,
  htmlLink: row.calendar_link, synced: row.calendar_synced === 1,
  checklist: JSON.parse(row.checklist), version: row.version,
});
const readTrip = (db, id) => db.prepare('SELECT * FROM trip_plans WHERE id = ?').bind(id).first();

async function saveTrip(db, env, input) {
  if (!tripId(input?.id) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160 ||
      !Number.isFinite(dateAtMidnight(input.start)) || !Number.isFinite(dateAtMidnight(input.end)) ||
      input.start > input.end) {
    return reply({ error: 'Athugaðu heiti ferðar, upphafsdag og lokadag.' }, 400);
  }

  const title = input.title.trim();
  const row = await withTripsTable(db, async () => {
    await db.prepare(`INSERT INTO trip_plans (id, title, start_date, end_date)
      VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`).bind(input.id, title, input.start, input.end).run();
    return readTrip(db, input.id);
  });
  if (row.title !== title || row.start_date !== input.start || row.end_date !== input.end) {
    return reply({ error: 'Ferð með þessu auðkenni var þegar skráð.' }, 409);
  }
  if (row.calendar_synced) return reply({ trip: fromRow(row) });

  let calendar;
  try {
    calendar = await addCalendarEvent(env, {
      id: row.id, title: row.title, date: row.start_date, endDate: row.end_date, owner: 'family',
    }, { trip: true });
  } catch {
    // Retrying always uses the same Google event ID, even after a lost response.
    return reply({ trip: fromRow(row), warning: 'Ferðin var vistuð. Dagatalssamstilling bíður.' }, 202);
  }
  await db.prepare(`UPDATE trip_plans SET calendar_synced = 1, calendar_link = ?
    WHERE id = ?`).bind(calendar.htmlLink, row.id).run();
  return reply({ trip: fromRow(await readTrip(db, row.id)) }, 201);
}

async function saveChecklist(db, input) {
  const id = input?.id;
  if ((!tripId(id) && !legacyTrips.has(id)) || !Number.isSafeInteger(input.version) || input.version < 0 ||
      !Array.isArray(input.checklist) || input.checklist.length > 120 || !input.checklist.every(item =>
        typeof item?.name === 'string' && item.name.trim().length > 0 &&
        item.name.length <= 160 && typeof item.done === 'boolean')) {
    return reply({ error: 'Ógild gátlistagögn.' }, 400);
  }
  const checklist = JSON.stringify(input.checklist.map(({ name, done }) => ({ name: name.trim(), done })));
  return withTripsTable(db, async () => {
    if (legacyTrips.has(id)) {
      await db.prepare(`INSERT INTO trip_plans (id) VALUES (?) ON CONFLICT(id) DO NOTHING`).bind(id).run();
    }
    const result = await db.prepare(`UPDATE trip_plans SET checklist = ?, version = version + 1
      WHERE id = ? AND version = ?`).bind(checklist, id, input.version).run();
    if (!result.meta.changes) return reply({ error: 'Gátlistinn breyttist í öðru tæki. Prófaðu aftur.' }, 409);
    return reply({ trip: fromRow(await readTrip(db, id)) });
  });
}

export async function trips(request, env) {
  const db = env.DB;
  if (!db) return reply({ error: 'Gagnagrunnur hefur ekki verið tengdur.' }, 503);
  if (request.method === 'GET') {
    const { results } = await withTripsTable(db, () => db.prepare('SELECT * FROM trip_plans ORDER BY start_date, id').all());
    return reply({ trips: results.map(fromRow) });
  }
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return reply({ error: 'Aðferð óheimil.' }, 405);
  }
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return reply({ error: 'Beiðni óheimil.' }, 403);
  }
  const body = await request.text();
  if (body.length > 30000) return reply({ error: 'Beiðni er of stór.' }, 413);
  let input;
  try {
    input = JSON.parse(body);
  } catch {
    return reply({ error: 'Ógild beiðni.' }, 400);
  }
  return request.method === 'POST' ? saveTrip(db, env, input) : saveChecklist(db, input);
}
