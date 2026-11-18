import { CalendarError, readCalendar } from './calendar.js';

const response = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
});

function validState(state) {
  return Number.isSafeInteger(state?.version) && state.version >= 0
    && Array.isArray(state.tasks) && state.tasks.length <= 250
    && state.tasks.every(task => typeof task?.name === 'string' && task.name.trim().length > 0
      && task.name.length <= 180 && typeof task.done === 'boolean')
    && Array.isArray(state.meals) && state.meals.length === 7
    && state.meals.every(meal => typeof meal?.name === 'string' && meal.name.trim().length > 0
      && meal.name.length <= 180 && typeof meal.day === 'string' && meal.day.length <= 4
      && (meal.minutes === null || (Number.isInteger(meal.minutes) && meal.minutes >= 0 && meal.minutes <= 1440))
      && typeof meal.url === 'string' && meal.url.length <= 1024
      && (meal.url === '' || URL.canParse(meal.url) && ['https:', 'http:'].includes(new URL(meal.url).protocol)));
}

export async function household(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/calendar' && request.method === 'GET') {
    try {
      return response(await readCalendar(env));
    } catch (error) {
      const code = error instanceof CalendarError ? error.code : 'google_calendar_failed';
      return response({ error: 'Ekki náðist í Google Calendar.', code }, 502);
    }
  }
  if (pathname !== '/api/household') return response({ error: 'Slóð fannst ekki.' }, 404);
  if (!env.DB) return response({ error: 'Gagnagrunnur hefur ekki verið tengdur.' }, 503);

  if (request.method === 'GET') {
    const state = await env.DB.prepare('SELECT version, tasks, meals FROM household WHERE id = 1').first();
    return response(state ? { version: state.version, tasks: JSON.parse(state.tasks),
      meals: JSON.parse(state.meals) } : { version: 0 });
  }
  if (request.method !== 'PUT') return response({ error: 'Aðferð óheimil.' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') {
    return response({ error: 'Beiðni óheimil.' }, 403);
  }

  const input = await request.text();
  if (input.length > 70000) return response({ error: 'Beiðni er of stór.' }, 413);
  let state;
  try {
    state = JSON.parse(input);
  } catch {
    return response({ error: 'Ógild beiðni.' }, 400);
  }
  if (!validState(state)) return response({ error: 'Ógild gögn.' }, 400);

  const tasks = JSON.stringify(state.tasks.map(({ name, done }) => ({ name, done })));
  const meals = JSON.stringify(state.meals.map(({ day, name, minutes, url }) => ({ day, name, minutes, url })));
  // One conditional write prevents simultaneous edits from overwriting one another.
  const statement = state.version === 0
    ? env.DB.prepare('INSERT INTO household VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(tasks, meals)
    : env.DB.prepare('UPDATE household SET version = version + 1, tasks = ?, meals = ? WHERE id = 1 AND version = ?')
      .bind(tasks, meals, state.version);
  const result = await statement.run();
  return result.meta.changes
    ? response({ version: state.version + 1 })
    : response({ error: 'Breyting var vistuð úr öðru tæki.' }, 409);
}
