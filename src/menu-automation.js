import { menuWeekExists, saveGeneratedMenu } from './household.js';
import { fetchKronanDinner, readKronanLibrary } from './kronan.js';
import { fallbackMenu } from './menu-fallback.js';
import { importMeals } from './menu-import.js';
import { weekStart } from './shopping.js';

// Four-serving dinners from the Krónan recipe collection.
export const kronanDinnerCatalog = [
  ['plokkfiskur', 'Plokkfiskur'],
  ['rjomapesto_kjuklingur', 'Rjóma pestó kjúklingur'],
  ['kjotbollur_vidirholm', 'Ítalskar kjötbollur'],
  ['chana_masala', 'Chana masala með hrísgrjónum og naanbrauði'],
  ['lax_saetkartoflu', 'Lax með sætkartöflumús'],
  ['pinsa', 'Pinsa-pítsur'],
  ['graenmetissupa', 'Grænmetissúpa með túrmeriki'],
  ['carbonara', 'Spaghetti Carbonara með tvisti'],
  ['bleikja', 'Ofnbökuð teriyaki-bleikja'],
  ['kjuklingur_tikkamasala', 'Kjúklingur í tikka masala'],
  ['hakk_spaghetti', 'Hakk og spaghetti'],
  ['fajitas_graenmetis', 'Fajitas með sveppum og svörtum baunum'],
  ['fiskibollur_lindaben', 'Ljúffengar fiskibollur'],
  ['kokos-kjuklingur', 'Kókoskarrí kjúklingur og hrísgrjón'],
  ['mexikosupa', 'Mexíkósúpa með sætum kartöflum og baunum'],
  ['alfredo', 'Kjúklingapasta Alfredo'],
  ['fiskitaco', 'Æðislegt fiski takkó'],
  ['ostafylltar_kjotbollur', 'Ostafylltar kjötbollur'],
  ['svartbauna_burrito', 'Svartbauna burrito'],
  ['lax-bulgursalat', 'Lax með bulgursalati og jógúrtsósu'],
  ['kjuklinga_pasta', 'Kjúklingapasta'],
];

async function reserveGeneration(db, week) {
  await db.prepare('CREATE TABLE IF NOT EXISTS menu_generation (week TEXT PRIMARY KEY NOT NULL)').run();
  const { meta } = await db.prepare('INSERT INTO menu_generation (week) VALUES (?) ON CONFLICT(week) DO NOTHING')
    .bind(week).run();
  return Boolean(meta.changes);
}

export async function loadKronanDinners(slugs, count = slugs.length, library = new Map()) {
  const meals = [];
  for (let index = 0; index < slugs.length && meals.length < count; index += 4) {
    const batch = slugs.slice(index, index + 4);
    const recipes = await Promise.all(batch.map(slug => library.get(slug) || fetchKronanDinner(slug).catch(() => null)));
    meals.push(...recipes.filter(Boolean));
  }
  return meals.slice(0, count);
}

export function dateMenuDinners(week, meals) {
  const monday = new Date(`${week}T00:00:00Z`).getTime();
  return meals.map((meal, index) => ({ ...meal, date:new Date(monday + index * 86400000).toISOString().slice(0, 10) }));
}

export async function generateWeeklyDraft(env, scheduledTime) {
  if (env.WEEKLY_MENU_AUTOMATION_ENABLED !== 'true') return;
  if (!env.DB) throw new Error('Weekly menu database is not configured.');
  const next = new Date(scheduledTime);
  next.setUTCDate(next.getUTCDate() + 7);
  const week = weekStart(next);
  if (await menuWeekExists(env.DB, week) || !await reserveGeneration(env.DB, week)) return;

  const offset = Math.floor(next.getTime() / (7 * 86400000)) % kronanDinnerCatalog.length;
  const candidates = [...kronanDinnerCatalog.slice(offset), ...kronanDinnerCatalog.slice(0, offset)];
  const selected = env.OPENAI_API_KEY && env.OPENAI_MENU_MODEL
    ? await chooseDinners(env, week, candidates).catch(() => []) : [];
  const choices = [...new Set([...selected, ...candidates.map(([slug]) => slug)])].slice(0, 12);
  const dinners = await loadKronanDinners(choices, 7, await readKronanLibrary(env.DB));
  if (dinners.length < 7) console.warn('Weekly menu used adapted Krónan recipes because the catalog was incomplete.');
  const meals = dinners.length === 7 ? importMeals({ week, meals:dateMenuDinners(week, dinners) }, week) : fallbackMenu(week);
  await saveGeneratedMenu(env.DB, week, meals);
}

async function chooseDinners(env, week, candidates) {
  const allowed = candidates.map(([slug]) => slug);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + env.OPENAI_API_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model:env.OPENAI_MENU_MODEL,
      store:false,
      max_output_tokens:500,
      text:{ format:{ type:'json_schema', name:'weekly_recipe_selection', strict:true,
        schema:{ type:'object', additionalProperties:false, required:['slugs'],
          properties:{ slugs:{ type:'array', items:{ type:'string', enum:allowed } } } } } },
      input:`Pick seven different dinners for four people for the week starting ${week}. ` +
        'Return the recipe slugs in Monday-to-Sunday order. Pick a mix of fish, meat, chicken and vegetarian recipes, ' +
        'with quick options on weekdays. Prefer recipes nearer the top of the list when equally suitable. ' +
        'Choose from this list of [slug, title] pairs: ' + JSON.stringify(candidates),
    }),
    signal:AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`OpenAI selection request failed (${response.status}).`);
  const result = await response.json();
  const output = result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text).join('');
  if (result.status !== 'completed' || !output) throw new Error('OpenAI returned no complete selection.');
  const { slugs } = JSON.parse(output);
  if (!Array.isArray(slugs) || slugs.length !== 7 || new Set(slugs).size !== 7 || slugs.some(slug => !allowed.includes(slug))) {
    throw new Error('Expected seven different recipes from the catalog.');
  }
  return slugs;
}
