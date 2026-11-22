import { menuWeekExists, saveGeneratedMenu } from './household.js';
import { weekStart } from './shopping.js';
import { emptyMealName, importMeals } from './menu-import.js';
import { fallbackMenu } from './menu-fallback.js';

const maxOutputTokens = 3500;
const daysOff = new Set(['Afgangadagur', 'Frjáls dagur']);
const recipeFormat = {
  type:'json_schema', name:'weekly_family_menu', strict:true,
  schema:{
    type:'object', additionalProperties:false, required:['week', 'meals'],
    properties:{
      week:{ type:'string' },
      meals:{ type:'array', items:{
        type:'object', additionalProperties:false, required:['date', 'name', 'minutes', 'ingredients', 'recipe'],
        properties:{
          date:{ type:'string' }, name:{ type:'string' }, minutes:{ type:'integer' },
          ingredients:{ type:'array', items:{ type:'string' } },
          recipe:{ anyOf:[{ type:'null' }, {
            type:'object', additionalProperties:false, required:['title', 'servings', 'steps'],
            properties:{ title:{ type:'string' }, servings:{ type:'integer', enum:[4] },
              steps:{ type:'array', items:{ type:'string' } } },
          }] },
        },
      } },
    },
  },
};

function validateGeneratedMenu(data, week) {
  if (data?.week !== week || !Array.isArray(data.meals) || data.meals.length !== 7) {
    throw new Error('Expected seven dinners in the requested week.');
  }
  const exceptions = new Set();
  const meals = data.meals.map(({ date, name, minutes, ingredients, recipe }) => {
    if (daysOff.has(name)) {
      if (exceptions.has(name)) throw new Error('Repeated no-cooking day.');
      exceptions.add(name);
      return { date, name, minutes:null, ingredients:[] };
    }
    if (name?.trim() === emptyMealName || !Array.isArray(ingredients) || ingredients.length === 0 ||
        recipe?.servings !== 4 || !Array.isArray(recipe.steps) || recipe.steps.length < 2 || recipe.steps.length > 3 ||
        recipe.steps.some(step => typeof step !== 'string' || !step.trim())) {
      throw new Error('A dinner is missing ingredients or cooking instructions.');
    }
    const instructions = recipe.steps.map((step, index) => `${index + 1}. ${step.trim()}`).join('\n\n');
    return { date, name, minutes, ingredients, recipe:{ title:recipe.title, servings:4, instructions } };
  });
  return importMeals({ week, meals }, week);
}

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
  if (await menuWeekExists(env.DB, week) || !await reserveGeneration(env.DB, week)) return;

  const meals = await fetchGeneratedMenu(env, week).catch(() => {
    console.warn('Weekly menu used saved recipes because generation did not return a usable plan.');
    return fallbackMenu(week);
  });
  await saveGeneratedMenu(env.DB, week, meals);
}

async function fetchGeneratedMenu(env, week) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{ Authorization:'Bearer ' + env.OPENAI_API_KEY, 'Content-Type':'application/json' },
    body:JSON.stringify({
      model:env.OPENAI_MENU_MODEL,
      store:false,
      max_output_tokens:maxOutputTokens,
      text:{ format:recipeFormat },
      input:`Create an Icelandic meal plan for four for the week starting ${week}. Return one dinner per day from Monday to Sunday. ` +
        'For each cooked dinner, give a name, time in minutes, all ingredients with quantities, and a recipe with 2–3 short, ' +
        'practical cooking steps in Icelandic. If useful, include one Afgangadagur and one Frjáls dagur at most. ' +
        'Those exact names are the only days that may have null recipes and empty ingredient lists. ' +
        'Use ordinary ingredients and include some quick dinners.',
    }),
    signal:AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`OpenAI menu request failed (${response.status}).`);
  const result = await response.json();
  const output = result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text')
    .map(item => item.text).join('');
  if (result.status !== 'completed' || !output) throw new Error('OpenAI returned no complete menu.');
  return validateGeneratedMenu(JSON.parse(output), week);
}
