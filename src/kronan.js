import { defaultRecipes } from './kronan-default-recipes.js';
import { validIngredientLines, validMinutes, validRecipe } from './menu-import.js';
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

export async function fetchKronanDinner(slug) {
  const recipe = await readRecipe(slug);
  if (!recipe || recipe.servings !== 4 || recipeSlug(recipe.recipeButton?.url) !== slug) return null;

  const sourceLines = recipe.ingredientGroups?.flatMap(group => group.ingredients || []);
  if (!sourceLines?.length || !validIngredientLines(sourceLines)) return null;
  const groups = recipe.stepGroups || [];
  const steps = groups.flatMap(group => group.steps || []);
  if (steps.length < 2 || steps.some(step => typeof step?.text !== 'string' || !step.text.trim())) return null;

  const instructions = groups.map(group => {
    const lines = (group.steps || []).map(({ text }, index) => `${index + 1}. ${text.trim()}`);
    return [group.name, ...lines].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n');
  const details = { title:recipe.name, servings:recipe.servings, instructions };
  if (!validRecipe(details)) return null;
  return { name:recipe.name, minutes:validMinutes(recipe.totalMinutes) ? recipe.totalMinutes : null,
    url:recipe.recipeButton.url, ingredients:sourceLines, recipe:details, source:'Krónan' };
}

export async function readKronanLibrary(db) {
  try {
    const row = await db.prepare('SELECT recipes FROM kronan_recipe_library WHERE id = 1').first();
    return new Map(Object.entries(row ? JSON.parse(row.recipes) : {}));
  } catch (error) {
    if (!/no such table: kronan_recipe_library\b/i.test(error?.message ?? '')) throw error;
    return new Map();
  }
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
