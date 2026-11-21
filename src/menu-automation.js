import { menuWeekExists, saveGeneratedMenu } from './household.js';
import { weekStart } from './shopping.js';

const maxOutputTokens = 3500;

async function reserveGeneration(db, week) {
  await db.prepare('CREATE TABLE IF NOT EXISTS menu_generation (week TEXT PRIMARY KEY NOT NULL)').run();
  const { meta } = await db.prepare('INSERT INTO menu_generation (week) VALUES (?) ON CONFLICT(week) DO NOTHING')
    .bind(week).run();
  return Boolean(meta.changes);
}

export async function generateWeeklyDraft(env, scheduledTime) {
  if (env.WEEKLY_MENU_AUTOMATION_ENABLED !== 'true') return;
  if (!env.DB || !env.OPENAI_API_KEY || !env.OPENAI_MENU_MODEL) {
    throw new Error('Weekly menu generation configuration is incomplete.');
  }
  const next = new Date(scheduledTime);
  next.setUTCDate(next.getUTCDate() + 7);
  const week = weekStart(next);
  if (await menuWeekExists(env.DB, week)) return 'existing';
  if (!await reserveGeneration(env.DB, week)) return 'already_attempted';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + env.OPENAI_API_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model:env.OPENAI_MENU_MODEL,
      store:false,
      max_output_tokens:maxOutputTokens,
      text:{ format:{ type:'json_object' } },
      input:`Return JSON for an Icelandic meal plan for four, with week set to ${week} and a meals array of seven dinners. ` +
        'Use objects with date (YYYY-MM-DD, consecutive starting on week), name, minutes (integer), and ingredients ' +
        '(Icelandic strings with quantities). Optional recipe has title, servings (integer), and brief instructions. ' +
        'Use ordinary ingredients, include some quick dinners, and leave out prices and external URLs.',
    }),
    signal:AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`OpenAI menu request failed (${response.status}).`);
  const result = await response.json();
  const output = result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text).join('');
  if (result.status !== 'completed' || !output) throw new Error('OpenAI returned no complete menu.');
  try {
    const data = JSON.parse(output);
    if (!Array.isArray(data?.meals) || data.meals.length !== 7) throw new Error('Expected seven meals.');
    return await saveGeneratedMenu(env.DB, week, data) ? 'created' : 'existing';
  } catch {
    throw new Error('Could not validate or save the generated menu.');
  }
}

// Short-lived access for an operator to invoke the scheduled handler once.
export async function runMenuCheck(request, env) {
  const headers = { 'Cache-Control':'private, no-store' };
  const respond = (body, status = 200) => Response.json(body, { status, headers });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'POST' || !token || Date.now() >= Date.parse('2026-11-21T23:32:49+00:00')) {
    return respond({ error:'Not found.' }, 404);
  }
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== 'b34458ffcb81f03bd86e976e251cff8813dbd121eda95b370082d8144d069774') return respond({ error:'Not found.' }, 404);

  try {
    const outcome = await generateWeeklyDraft(env, Date.parse('2026-11-22T17:00:00Z'));
    return respond({ outcome:outcome ?? 'disabled', week:'2026-11-23' });
  } catch {
    return respond({ error:'The scheduled handler failed.' }, 502);
  }
}
