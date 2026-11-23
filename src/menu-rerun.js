import { household } from './household.js';
import { validRecipe } from './menu-import.js';

const week = '2026-11-23';
const noCooking = /^(?:óskráð$|afgang|frjáls dagur)/iu;
const hasDirections = meal => Boolean(meal.recipe?.instructions?.trim());

const format = { type:'json_schema', name:'family_recipe_directions', strict:true, schema:{
  type:'object', additionalProperties:false, required:['recipes'], properties:{
    recipes:{ type:'array', items:{ type:'object', additionalProperties:false, required:['index','steps'], properties:{
      index:{ type:'integer' }, steps:{ type:'array', items:{ type:'string' } },
    } } },
  },
} };

async function writeDirections(env, dishes) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method:'POST', headers:{ Authorization:'Bearer ' + env.OPENAI_API_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({ model:env.OPENAI_MENU_MODEL, store:false, max_output_tokens:2300, text:{ format },
      input:'Write complete cooking instructions in Icelandic for each dish in this JSON. Use only the listed ingredients and keep their quantities. ' +
       'For each dish return its index and 2–4 concise, practical steps. Give appropriate time and temperature where helpful. ' +
       'For poultry specify an internal temperature of 74 °C. Do not invent sources or web addresses. Data: ' + JSON.stringify(dishes),
    }), signal:AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error('OpenAI request returned ' + res.status + '.');
  const response = await res.json();
  const output = response.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text).join('');
  if (response.status !== 'completed' || !output) throw new Error('OpenAI returned no complete result.');
  const { recipes } = JSON.parse(output);
  if (!Array.isArray(recipes) || recipes.length !== dishes.length) throw new Error('Missing directions.');
  const requested = new Set(dishes.map(dish => dish.index));
  const directions = new Map();
  for (const { index, steps } of recipes) {
    if (!requested.has(index) || directions.has(index) || !Array.isArray(steps) || steps.length < 2 || steps.length > 4 ||
      steps.some(step => typeof step !== 'string' || !step.trim())) throw new Error('Invalid directions.');
    directions.set(index, steps.map((step,i) => `${i+1}. ${step.trim()}`).join('\n\n'));
  }
  return directions;
}

export async function rerunSubmittedWeek(request, env) {
  const respond = (body, status = 200) => Response.json(body, { status, headers:{ 'Cache-Control':'private, no-store' } });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'POST' || !token || Date.now() >= Date.parse('2026-11-23T11:27:08+00:00')) return respond({ error:'Not found.' },404);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (digest !== '2153d9a7ca5945834407355d6e3e73d061c3f127036c833dbcfc3136600142e1') return respond({ error:'Not found.' },404);
  if (!env.OPENAI_API_KEY || !env.OPENAI_MENU_MODEL || !env.DB) return respond({ error:'Missing runtime settings.' },503);
  const url = new URL('/api/household/menu?week=' + week, request.url);
  const read = await household(new Request(url), env);
  if (!read.ok) return respond({ error:'Could not read the menu.' },502);
  const current = await read.json();
  if (current.meals.length !== 7 || current.version < 1) return respond({ error:'The target draft was not found.' },409);
  const dishes = current.meals.flatMap((meal,index) => noCooking.test(meal.name) || hasDirections(meal)
    ? [] : [{ index, name:meal.name, minutes:meal.minutes, ingredients:meal.ingredients || [] }]);
  if (!dishes.length) return respond({ week, status:current.status, recipesUpdated:0 });
  if (dishes.some(dish => !dish.ingredients.length)) return respond({ error:'A dish has no ingredients saved.' },409);

  await env.DB.prepare('CREATE TABLE IF NOT EXISTS menu_generation (week TEXT PRIMARY KEY NOT NULL)').run();
  const { meta } = await env.DB.prepare('INSERT INTO menu_generation (week) VALUES (?) ON CONFLICT(week) DO NOTHING')
    .bind('rerun:' + week).run();
  if (!meta.changes) return respond({ error:'This rerun has already been attempted.' },409);
  let directions;
  try {
    directions = await writeDirections(env,dishes);
  } catch (error) {
    const code = /^OpenAI request returned \d{3}\.$/.test(error.message) ? error.message : 'Could not generate complete recipes.';
    return respond({ error:code },502);
  }
  const meals = current.meals.map((meal,index) => directions.has(index) ? { ...meal,
    source:meal.source || (meal.url ? undefined : 'Eldunarskref samin með OpenAI'),
    recipe:{ title:meal.name, servings:4, ...meal.recipe, instructions:directions.get(index) },
  } : meal);
  if (meals.some(meal => !validRecipe(meal.recipe) || (!noCooking.test(meal.name) && !hasDirections(meal)))) {
    return respond({ error:'The complete recipe check failed.' },502);
  }
  const write = await household(new Request(url,{ method:'PUT',
    headers:{ Origin:url.origin, 'Content-Type':'application/json' },
    body:JSON.stringify({ version:current.version, meals }),
  }),env);
  if (!write.ok) return respond({ error:'The recipe update could not be saved.' },write.status);
  const saved = await write.json();
  return respond({ week, status:saved.status, recipesUpdated:directions.size,
    dishesWithDirections:saved.meals.filter(hasDirections).length, days:saved.meals.length });
}
