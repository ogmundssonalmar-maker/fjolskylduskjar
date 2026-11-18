import { defaultRecipes } from './kronan-default-recipes.js';
import { scaleIngredient } from './shopping.js';

function recipeSlug(link) {
  if (!link || !URL.canParse(link)) return '';
  const url = new URL(link);
  if (!['https://kronan.is', 'https://www.kronan.is'].includes(url.origin)) return '';
  return /^\/(?:snjallverslun\/)?uppskriftir\/([a-z0-9_-]{1,100})\/?$/i.exec(url.pathname)?.[1] || '';
}

async function readRecipe(slug) {
  const response = await fetch('https://kronan.is/api/v3/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'fetch_recipe', arguments: { slug } } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const body = await response.text();
  const chunks = response.headers.get('Content-Type')?.includes('text/event-stream')
    ? body.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/)
      .filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean)
    : [body];
  for (const chunk of chunks) {
    const data = JSON.parse(chunk);
    const recipe = data.result?.structuredContent?.recipe;
    if (data.id === 1 && !data.result?.isError && recipe) return recipe;
  }
  return null;
}

export async function fillKronanIngredients(meals) {
  const lookups = new Map();
  return Promise.all(meals.map(async meal => {
    const slug = recipeSlug(meal.url);
    if (!slug || meal.ingredients?.length) return meal;
    try {
      if (!lookups.has(slug)) lookups.set(slug, readRecipe(slug).catch(() => null));
      const recipe = await lookups.get(slug);
      const fallback = defaultRecipes.get(slug);
      const liveLines = recipe?.ingredientGroups?.flatMap(group => group.ingredients || []);
      const lines = liveLines?.length ? liveLines : fallback?.ingredients;
      if (!Array.isArray(lines)) return meal;
      const servings = liveLines?.length ? recipe.servings : fallback.servings;
      const ratio = Number.isFinite(servings) && servings > 0 ? 4 / servings : 1;
      const ingredients = lines.filter(line => typeof line === 'string' && line.trim() && line.length <= 160)
        .slice(0, 48).map(line => scaleIngredient(line.trim(), ratio));
      return { ...meal, ingredients };
    } catch {
      return meal;
    }
  }));
}
