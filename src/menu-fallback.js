import { defaultRecipes } from './kronan-default-recipes.js';
import { importMeals } from './menu-import.js';

const dinners = [
  ['hakk_spaghetti', 'Hakk og spaghetti', 20,
    'Sjóðið spaghettíið samkvæmt leiðbeiningum á pakkanum.',
    'Brúnið hakkið og bætið söxuðum lauk og papriku út í. Hellið pastasósunni yfir og látið malla. Berið fram með spaghettíinu.'],
  ['kjuklingur_tikkamasala', 'Kjúklingur í tikka masala', 25,
    'Skerið kjúklinginn í bita. Steikið hann í olíu með söxuðum lauk og papriku.',
    'Bætið tikka masala-sósu og kókosmjólk út í. Látið malla þar til kjúklingurinn nær 74 °C í kjarna og smakkið til.'],
  ['plokkfiskur', 'Plokkfiskur', 50,
    'Mýkið saxaðan lauk í smjöri. Hrærið hveitinu saman við og bætið mjólkinni smám saman út í til að mynda sósu.',
    'Hrærið soðnum fiski og kartöflum út í sósuna og kryddið. Stráið osti yfir, bakið þar til yfirborðið gyllist og berið fram með steinselju.'],
  ['alfredo', 'Kjúklingapasta Alfredo', 30,
    'Sjóðið pastað. Kryddið kjúklinginn og steikið í olíu þar til hann nær 74 °C í kjarna.',
    'Mýkið skalottlauk í smjöri. Hrærið rjóma og parmesan saman við. Blandið pastanu og kjúklingnum út í og stráið steinselju yfir.'],
  ['rjomapesto_kjuklingur', 'Rjóma-pestó kjúklingur', 30,
    'Sjóðið hrísgrjónin og brúnið kjúklingabringurnar á pönnu.',
    'Bætið rjóma, pestói og mexíkóosti út í. Látið malla þar til osturinn bráðnar og kjúklingurinn nær 74 °C í kjarna. Berið fram með hrísgrjónunum.'],
];

export function fallbackMenu(week) {
  const monday = Date.parse(week + 'T00:00:00Z');
  const date = index => new Date(monday + 86400000 * index).toISOString().slice(0, 10);
  const meals = dinners.map(([slug, name, minutes, ...steps], index) => {
    const { ingredients, servings } = defaultRecipes.get(slug);
    return { date:date(index), name, minutes, ingredients, url:`https://kronan.is/uppskriftir/${slug}`,
      source:'Aðlöguð uppskrift frá Krónunni',
      recipe:{ title:name, servings, instructions:steps.map((step, i) => `${i + 1}. ${step}`).join('\n\n') } };
  });
  meals.push({ date:date(5), name:'Afgangadagur' }, { date:date(6), name:'Frjáls dagur' });
  return importMeals({ week, meals }, week);
}
