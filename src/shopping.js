const measures = new Map([
  ['g', ['g', 1]], ['gr', ['g', 1]], ['kg', ['g', 1000]], ['mg', ['g', 0.001]],
  ['ml', ['ml', 1]], ['cl', ['ml', 10]], ['dl', ['ml', 100]], ['l', ['ml', 1000]],
  ['tsk', ['tsk', 1]], ['msk', ['msk', 1]], ['stk', ['stk', 1]],
  ['dós', ['dós', 1]], ['dósir', ['dós', 1]],
  ['pakki', ['pk', 1]], ['pakkar', ['pk', 1]], ['pk', ['pk', 1]],
]);

function parseIngredient(line) {
  const match = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[,.]\d+)?)\s+(\S.*)$/.exec(line);
  if (!match) return { name: line, amount: null, unit: '' };
  const [whole, fraction] = match[1].split(/\s+/);
  const [numerator, denominator] = (fraction || whole).split('/').map(part => Number(part.replace(',', '.')));
  const amount = denominator === undefined ? numerator : (fraction ? Number(whole) : 0) + numerator / denominator;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return { name: line, amount: null, unit: '' };
  }

  const unit = /^(\S+)\s+(.+)$/.exec(match[2]);
  const measure = unit && measures.get(unit[1].toLocaleLowerCase('is').replace(/\.$/, ''));
  return measure
    ? { name: unit[2], amount: amount * measure[1], unit: measure[0] }
    : { name: match[2], amount, unit: 'stk' };
}

const round = amount => Math.round(amount * 1000) / 1000;

export function scaleIngredient(line, ratio) {
  const { name, amount, unit } = parseIngredient(line);
  return amount === null || ratio === 1 ? line : `${round(amount * ratio)} ${unit} ${name}`;
}

export function menuSignature(meals) {
  return JSON.stringify(meals.map(({ name, ingredients = [] }) => [name, ...ingredients]));
}

export function weekStart(date = new Date()) {
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday.toISOString().slice(0, 10);
}

export function validWeek(week) {
  if (typeof week !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(week)) return false;
  const date = new Date(week + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && weekStart(date) === week;
}

export function buildShopping(meals, previous, now = new Date()) {
  const week = weekStart(now);
  const checked = new Map((previous?.week === week ? previous.items : []).map(item => [item.id, item]));
  const items = new Map();
  const missing = [];

  for (const meal of meals) {
    if (!meal.ingredients?.length && !/^(?:óskráð|afgang(?:ar|adagur)?|frjáls dagur)(?:\s*\/\s*afgangar)?$/iu.test(meal.name.trim())) {
      missing.push(meal.name);
    }
    for (const line of meal.ingredients || []) {
      const { name, amount, unit } = parseIngredient(line.trim().replace(/\s+/g, ' '));
      const id = JSON.stringify([name.normalize('NFC').toLocaleLowerCase('is'), unit]);
      const item = items.get(id);
      if (item && amount !== null) item.amount += amount;
      else if (!item) items.set(id, { id, name, amount, unit });
    }
  }

  const combined = [...items.values()].map(item => {
    const amount = item.amount === null ? null : round(item.amount);
    const old = checked.get(item.id);
    return { ...item, amount, done: Boolean(old?.done && old.amount === amount) };
  }).sort((a, b) => a.name.localeCompare(b.name, 'is'));
  return { week, menu: menuSignature(meals), items: combined, missing: [...new Set(missing)] };
}
