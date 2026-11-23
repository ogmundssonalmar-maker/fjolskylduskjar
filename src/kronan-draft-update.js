import { household } from './household.js';
import { readKronanLibrary } from './kronan.js';
import { dateMenuDinners, kronanDinnerCatalog } from './menu-automation.js';
import { validIngredientLines, validMinutes, validRecipe } from './menu-import.js';

const week = '2026-11-23';
const originalDinner = 'Ofnbakaður lax með kartöflum og dillssósu';
const slugs = ['plokkfiskur', 'rjomapesto_kjuklingur', 'kjotbollur_vidirholm', 'carbonara',
  'lax_saetkartoflu', 'graenmetissupa', 'pinsa'];
const respond = (body, status = 200) => Response.json(body, { status, headers:{ 'Cache-Control':'private, no-store' } });
const matches = ({ meals }) => meals.length === slugs.length && meals.every((meal,index) =>
  meal?.source === 'Krónan' && meal.url === 'https://kronan.is/uppskriftir/' + slugs[index] &&
  meal.ingredients?.length > 0 && Boolean(meal.recipe?.instructions));
const catalogSlugs = kronanDinnerCatalog.map(([slug]) => slug);
const count = (plan, library) => respond({ week, status:plan.status, recipes:plan.meals.length, library:library.size,
  friday:plan.meals[4].url, hasInstructions:plan.meals.every(meal => Boolean(meal.recipe?.instructions)) });

export async function refreshKronanDraft(request, env) {
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'POST' || !token || new URL(request.url).hostname !== 'fjolskylduskjar.ogmundssonalmar.workers.dev' ||
      Date.now() >= Date.parse('2026-11-23T13:16:59+00:00')) return respond({ error:'Not found.' },404);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (digest !== 'a49daa7318a84f38f03ea71fe4c88fa7038e9571ac4e26a0e97457bee014dbee') return respond({ error:'Not found.' },404);
  const body = await request.text();
  let supplied;
  try { supplied = body.length < 80000 ? JSON.parse(body) : null; }
  catch { return respond({ error:'Invalid recipe library.' },400); }
  if (!supplied || Object.keys(supplied).length !== catalogSlugs.length || !catalogSlugs.every(slug => {
    const meal = supplied[slug];
    return meal?.source === 'Krónan' && meal.url === 'https://kronan.is/uppskriftir/' + slug &&
      validIngredientLines(meal.ingredients) && meal.ingredients.length && validMinutes(meal.minutes) &&
      meal.recipe?.title === meal.name && meal.recipe?.servings === 4 && meal.recipe?.instructions &&
      validRecipe(meal.recipe);
  })) return respond({ error:'Incomplete recipe library.' },400);

  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS kronan_recipe_library (id INTEGER PRIMARY KEY CHECK (id = 1), recipes TEXT NOT NULL)',
  ).run();
  await env.DB.prepare('INSERT INTO kronan_recipe_library VALUES (1, ?) ON CONFLICT(id) DO NOTHING')
    .bind(JSON.stringify(supplied)).run();
  const library = await readKronanLibrary(env.DB);
  const url = new URL('/api/household/menu?week=' + week, request.url);
  const read = await household(new Request(url), env);
  if (!read.ok) return respond({ error:'Could not read the menu.' },502);
  const current = await read.json();
  if (matches(current)) return count(current, library);
  if (current.status !== 'draft' || current.version !== 4 || current.meals.length !== 7 ||
      current.meals[4].name !== originalDinner || current.meals.some(meal => meal.url || !meal.source?.includes('OpenAI'))) {
    return respond({ week, status:current.status, library:library.size, error:'The draft was edited or approved.' },409);
  }
  const recipes = slugs.map(slug => library.get(slug));
  if (!matches({ meals:recipes })) return respond({ error:'Could not fetch all seven verified recipes.' },502);
  const write = await household(new Request(url,{ method:'POST',
    headers:{ Origin:url.origin, 'Content-Type':'application/json' },
    body:JSON.stringify({ version:current.version, data:{ week, meals:dateMenuDinners(week, recipes) } }),
  }),env);
  if (!write.ok) return respond({ error:'Could not save the revised draft.' },write.status);
  const saved = await write.json();
  return matches(saved) ? count(saved, library) : respond({ error:'Saved recipes did not match.' },502);
}
