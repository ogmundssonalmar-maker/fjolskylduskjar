import { household } from './household.js';
import { dateMenuDinners, loadKronanDinners } from './menu-automation.js';

const week = '2026-11-23';
const originalDinner = 'Ofnbakaður lax með kartöflum og dillssósu';
const slugs = ['plokkfiskur', 'rjomapesto_kjuklingur', 'kjotbollur_vidirholm', 'carbonara',
  'lax_saetkartoflu', 'graenmetissupa', 'pinsa'];
const respond = (body, status = 200) => Response.json(body, { status, headers:{ 'Cache-Control':'private, no-store' } });
const matches = ({ meals }) => meals.length === slugs.length && meals.every((meal,index) =>
  meal.source === 'Krónan' && meal.url === 'https://kronan.is/uppskriftir/' + slugs[index] &&
  meal.ingredients?.length > 0 && Boolean(meal.recipe?.instructions));
const count = plan => respond({ week, status:plan.status, recipes:plan.meals.length,
  friday:plan.meals[4].url, hasInstructions:plan.meals.every(meal => Boolean(meal.recipe?.instructions)) });

export async function refreshKronanDraft(request, env) {
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (request.method !== 'POST' || !token || new URL(request.url).hostname !== 'fjolskylduskjar.ogmundssonalmar.workers.dev' ||
      Date.now() >= Date.parse('2026-11-23T13:16:59+00:00')) return respond({ error:'Not found.' },404);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
  if (digest !== 'a49daa7318a84f38f03ea71fe4c88fa7038e9571ac4e26a0e97457bee014dbee') return respond({ error:'Not found.' },404);
  const url = new URL('/api/household/menu?week=' + week, request.url);
  const read = await household(new Request(url), env);
  if (!read.ok) return respond({ error:'Could not read the menu.' },502);
  const current = await read.json();
  if (matches(current)) return count(current);
  if (current.status !== 'draft' || current.version !== 4 || current.meals.length !== 7 ||
      current.meals[4].name !== originalDinner || current.meals.some(meal => meal.url || !meal.source?.includes('OpenAI'))) {
    return respond({ week, status:current.status, error:'The draft was edited or approved.' },409);
  }
  const recipes = await loadKronanDinners(slugs);
  if (!matches({ meals:recipes })) return respond({ error:'Could not fetch all seven verified recipes.' },502);
  const write = await household(new Request(url,{ method:'POST',
    headers:{ Origin:url.origin, 'Content-Type':'application/json' },
    body:JSON.stringify({ version:current.version, data:{ week, meals:dateMenuDinners(week, recipes) } }),
  }),env);
  if (!write.ok) return respond({ error:'Could not save the revised draft.' },write.status);
  const saved = await write.json();
  return matches(saved) ? count(saved) : respond({ error:'Saved recipes did not match.' },502);
}
