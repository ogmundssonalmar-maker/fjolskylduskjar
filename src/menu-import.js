import { validWeek } from './shopping.js';

const days = ['Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau', 'Sun'];
export const emptyMealName = 'Óskráð';
export const emptyMenu = () => days.map(day => ({ day, name:emptyMealName, minutes:null, url:'' }));

const isText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
export const validRecipeSource = source => source == null || isText(source, 140);
export const validIngredientLines = lines => Array.isArray(lines) && lines.length <= 48 && lines.every(line => isText(line, 180));
export const validMinutes = value => value === null || (Number.isInteger(value) && value >= 0 && value <= 1440);
export const validRecipeUrl = value => typeof value === 'string' && value.length <= 1024 &&
  (value === '' || (URL.canParse(value) && ['https:', 'http:'].includes(new URL(value).protocol)));
export const validRecipe = recipe => recipe === undefined || (recipe !== null && typeof recipe === 'object' &&
  isText(recipe.title, 180) && (recipe.servings === undefined ||
    (Number.isInteger(recipe.servings) && recipe.servings >= 1 && recipe.servings <= 100)) &&
  (recipe.instructions === undefined || isText(recipe.instructions, 2000)));

export function normalizeRecipe({ title, servings, instructions }) {
  return { title:title.trim(), ...(servings === undefined ? {} : { servings }),
    ...(instructions === undefined ? {} : { instructions:instructions.trim() }) };
}

export function importMeals(data, week, base = emptyMenu()) {
  if (!validWeek(week) || data?.week !== week) throw new Error('Vikudagsetning JSON þarf að vera mánudagur í valinni viku.');
  if (!Array.isArray(data.meals) || data.meals.length < 1 || data.meals.length > 7) {
    throw new Error('JSON þarf að innihalda eina til sjö máltíðir í meals.');
  }
  const monday = new Date(week + 'T00:00:00Z');
  const dates = days.map((_, index) => new Date(monday.getTime() + index * 86400000).toISOString().slice(0, 10));
  const meals = [...base];
  const seen = new Set();
  for (const input of data.meals) {
    const index = dates.indexOf(input?.date);
    if (index < 0 || seen.has(index)) throw new Error('Hver máltíð þarf einstaka dagsetningu innan valinnar viku.');
    seen.add(index);
    const { name, minutes = null, url = '', ingredients = [], recipe, source } = input;
    if (!isText(name, 180) || !validMinutes(minutes) || !validRecipeUrl(url) ||
        !validIngredientLines(ingredients) || !validRecipe(recipe) || !validRecipeSource(source)) {
      throw new Error(`Athugaðu heiti, uppskrift og hráefni fyrir ${dates[index]}.`);
    }
    meals[index] = { day:days[index], name:name.trim(), minutes, url, ingredients:ingredients.map(line => line.trim()),
      ...(recipe ? { recipe:normalizeRecipe(recipe) } : {}), ...(source ? { source:source.trim() } : {}) };
  }
  return meals;
}
