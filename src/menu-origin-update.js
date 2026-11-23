const week = '2026-11-23';
const firstMeals = ['Plokkfiskur með rúgbrauði', 'Kjúklingapanna með grænmeti og hrísgrjónum'];
const respond = (body, status = 200) => Response.json(body, { status, headers:{ 'Cache-Control':'private, no-store' } });

function addKnownSources(meals) {
  return meals?.map((meal, index) => firstMeals[index] === meal.name && !meal.source?.trim() && !meal.url
    ? { ...meal, source:'Samsett fyrir fjölskylduskjáinn með OpenAI' } : meal) ?? meals;
}

export async function fillKnownRecipeOrigins(request, env) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'POST' || !token || new URL(request.url).hostname !== 'fjolskylduskjar.ogmundssonalmar.workers.dev' ||
      Date.now() >= Date.parse('2026-11-23T11:41:33+00:00')) return respond({ error:'Not found.' },404);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (digest !== '0e47c4f0cafd04de19eecf5607b422806ff574fdfd003652018914aa3cf1921a') return respond({ error:'Not found.' },404);
  if (!env.DB) return respond({ error:'D1 unavailable.' },503);

  const current = await env.DB.prepare('SELECT version, meals FROM household_menu_weeks WHERE week = ?').bind(week).first();
  if (!current) return respond({ error:'Week not found.' },409);
  const plan = JSON.parse(current.meals);
  if (plan?.meals?.length !== 7) return respond({ error:'Unexpected menu shape.' },409);

  const meals = addKnownSources(plan.meals);
  const next = { ...plan, meals, activeMeals:addKnownSources(plan.activeMeals) };
  const changed = JSON.stringify(next) !== JSON.stringify(plan);
  if (changed) {
    const { meta } = await env.DB.prepare(
      'UPDATE household_menu_weeks SET version = version + 1, meals = ? WHERE week = ? AND version = ?',
    ).bind(JSON.stringify(next), week, current.version).run();
    if (!meta.changes) return respond({ error:'Week changed concurrently.' },409);
  }
  const friday = meals[4];
  return respond({ week, changed, attributed:meals.filter(meal => meal.source?.trim() || meal.url).length,
    days:meals.length, approved:Boolean(next.activeMeals),
    friday:{ expectedDish:friday.name === 'Ofnbakaður lax með kartöflum og dillssósu',
      hasOrigin:Boolean(friday.source?.trim()), hasExternalLink:Boolean(friday.url), hasInstructions:Boolean(friday.recipe?.instructions) } });
}
