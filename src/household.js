import { CalendarError, addCalendarEvent, readCalendar } from './calendar.js';
import { fillKronanIngredients } from './kronan.js';
import { buildShopping } from './shopping.js';

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
});

async function withHouseholdTable(database, operation) {
  try {
    return await operation();
  } catch (error) {
    if (!/no such table: household\b/i.test(error?.message ?? '')) throw error;
    await database.prepare(`CREATE TABLE IF NOT EXISTS household (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      tasks TEXT NOT NULL,
      meals TEXT NOT NULL
    )`).run();
    return operation();
  }
}

function storedMenu(row) {
  const value = row ? JSON.parse(row.meals) : [];
  return Array.isArray(value) ? { meals: value, shopping: null } : value;
}

function readHousehold(db) {
  return withHouseholdTable(db, () => db.prepare('SELECT version, tasks, meals FROM household WHERE id = 1').first());
}

export async function readApprovedShopping(db) {
  return storedMenu(await readHousehold(db)).shopping;
}

function validState(state) {
  return Number.isSafeInteger(state?.version) && state.version >= 0
    && Array.isArray(state.tasks) && state.tasks.length <= 250
    && state.tasks.every(task => typeof task?.name === 'string' && task.name.trim().length > 0
      && task.name.length <= 180 && typeof task.done === 'boolean')
    && Array.isArray(state.meals) && state.meals.length === 7
    && state.meals.every(meal => typeof meal?.name === 'string' && meal.name.trim().length > 0
      && meal.name.length <= 180 && typeof meal.day === 'string' && meal.day.length <= 4
      && (meal.minutes === null || (Number.isInteger(meal.minutes) && meal.minutes >= 0 && meal.minutes <= 1440))
      && (meal.ingredients === undefined || (Array.isArray(meal.ingredients) && meal.ingredients.length <= 48
        && meal.ingredients.every(line => typeof line === 'string' && line.trim() && line.length <= 180)))
      && typeof meal.url === 'string' && meal.url.length <= 1024
      && (meal.url === '' || URL.canParse(meal.url) && ['https:', 'http:'].includes(new URL(meal.url).protocol)));
}

export async function household(request, env) {
  const { pathname, searchParams } = new URL(request.url);
  if (pathname === '/api/calendar' && request.method === 'GET') {
    const month = searchParams.get('month');
    if (month !== null && !/^[2-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
      return response({ error: 'Ógildur mánuður.' }, 400);
    }
    try {
      return response(await readCalendar(env, new Date(), month));
    } catch (error) {
      const code = error instanceof CalendarError ? error.code : 'google_calendar_failed';
      return response({ error: 'Ekki náðist í Google Calendar.', code }, 502);
    }
  }
  if (pathname === '/api/calendar/events' && request.method === 'POST') {
    if (request.headers.get('Origin') !== new URL(request.url).origin ||
        request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
      return response({ error: 'Beiðni óheimil.' }, 403);
    }
    const input = await request.json().catch(() => null);
    try {
      return response(await addCalendarEvent(env, input), 201);
    } catch (error) {
      if (error.code === 'calendar_write_disabled') {
        return response({ error: 'Skrifaðgangur að Google Calendar er óvirkur.' }, 403);
      }
      if (error.code === 'invalid_calendar_event') {
        return response({ error: 'Athugaðu dagsetningu og tímasetningu viðburðarins.' }, 400);
      }
      if (error.code === 'google_calendar_http_409') {
        return response({ error: 'Viðburður var þegar vistaður. Lokaðu glugganum og endurhladdu dagskránni.' }, 409);
      }
      if (error.code === 'google_calendar_http_403') {
        return response({ error: 'Google heimilar ekki vistun á þessu dagatali.' }, 502);
      }
      return response({ error: 'Ekki tókst að vista í Google Calendar. Reyndu aftur.' }, 502);
    }
  }
  if (pathname !== '/api/household') return response({ error: 'Slóð fannst ekki.' }, 404);
  if (!env.DB) return response({ error: 'Gagnagrunnur hefur ekki verið tengdur.' }, 503);

  if (request.method === 'GET') {
    const state = await readHousehold(env.DB);
    const menu = storedMenu(state);
    return response(state ? { version: state.version, tasks: JSON.parse(state.tasks), ...menu } : { version: 0 });
  }
  if (request.method !== 'PUT') return response({ error: 'Aðferð óheimil.' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return response({ error: 'Beiðni óheimil.' }, 403);
  }

  const input = await request.text();
  if (input.length > 150000) return response({ error: 'Beiðni er of stór.' }, 413);
  let state;
  try {
    state = JSON.parse(input);
  } catch {
    return response({ error: 'Ógild beiðni.' }, 400);
  }
  if (!validState(state)) return response({ error: 'Ógild gögn.' }, 400);

  const row = await readHousehold(env.DB);
  if ((row?.version || 0) !== state.version) return response({ error: 'Breyting var vistuð úr öðru tæki.' }, 409);
  const menu = storedMenu(row);
  let meals = state.meals.map(({ day, name, minutes, url, ingredients }, index) => {
    const previous = menu.meals[index];
    const lines = ingredients ?? (previous?.name === name && previous?.url === url ? previous.ingredients : undefined);
    return { day, name, minutes, url, ...(lines ? { ingredients: lines.map(line => line.trim()) } : {}) };
  });
  let shopping = menu.shopping;
  const action = state.shoppingAction;
  if (action?.type === 'approve') {
    meals = await fillKronanIngredients(meals);
    shopping = buildShopping(meals, shopping);
  } else if (action?.type === 'toggle') {
    if (typeof action.done !== 'boolean' || !shopping?.items.some(item => item.id === action.id)) {
      return response({ error: 'Atriðið er ekki á innkaupalistanum.' }, 400);
    }
    shopping = { ...shopping, items: shopping.items.map(item => item.id === action.id ? { ...item, done: action.done } : item) };
  } else if (action !== undefined) {
    return response({ error: 'Ógild innkaupaaðgerð.' }, 400);
  }

  const tasks = JSON.stringify(state.tasks.map(({ name, done }) => ({ name, done })));
  const stored = JSON.stringify({ meals, shopping });
  // One conditional write prevents simultaneous edits from overwriting one another.
  const result = await withHouseholdTable(env.DB, () => {
    const statement = state.version === 0
      ? env.DB.prepare('INSERT INTO household VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(tasks, stored)
      : env.DB.prepare('UPDATE household SET version = version + 1, tasks = ?, meals = ? WHERE id = 1 AND version = ?')
        .bind(tasks, stored, state.version);
    return statement.run();
  });
  return result.meta.changes
    ? response({ version: state.version + 1, meals, shopping })
    : response({ error: 'Breyting var vistuð úr öðru tæki.' }, 409);
}
