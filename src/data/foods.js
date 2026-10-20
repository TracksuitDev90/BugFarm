// Food catalog. Add a line here to add a food: it gets art from its `shape`,
// critters decide whether they like it from its `tags`.
//   amount:  how much eating it holds (an ant needs ~0.08, a turtle ~1.8)
//   decay:   game days until it starts to spoil
//   float:   seconds it floats on water before sinking (0 = sinks right away)
//   rot:     what happens as it spoils: 'flies' (fruit flies), 'mold', 'cloudy'
export const FOODS = {
  apple: { name: 'Apple slice', tags: ['fruit', 'sweet'], amount: 2.0, shape: 'appleSlice', colors: ['#f6efcf', '#d9483b'], decay: 2.5, rot: 'flies', size: 1 },
  banana: { name: 'Banana coin', tags: ['fruit', 'sweet'], amount: 1.4, shape: 'coin', colors: ['#f8eebd', '#f0d26a', '#8a6a3a'], decay: 1.5, rot: 'flies', size: 0.9 },
  strawberry: { name: 'Strawberry', tags: ['fruit', 'sweet'], amount: 1.3, shape: 'strawberry', colors: ['#e2453f', '#77b255'], decay: 1.6, rot: 'flies', size: 1 },
  blueberry: { name: 'Blueberries', tags: ['fruit', 'sweet'], amount: 0.8, shape: 'berries', colors: ['#5a6fc0', '#3d4f99'], decay: 2.5, rot: 'flies', size: 0.8 },
  grape: { name: 'Grape halves', tags: ['fruit', 'sweet'], amount: 0.9, shape: 'grape', colors: ['#b7d36a', '#8fb04a'], decay: 2, rot: 'flies', size: 0.9 },
  melon: { name: 'Melon cube', tags: ['fruit', 'sweet'], amount: 1.6, shape: 'cube', colors: ['#f7b26b', '#e8944a'], decay: 1.5, rot: 'flies', size: 1 },
  watermelon: { name: 'Watermelon', tags: ['fruit', 'sweet'], amount: 2.2, shape: 'wedge', colors: ['#f2696a', '#77b255', '#3a2a1f'], decay: 1.5, rot: 'flies', size: 1.2 },
  orange: { name: 'Orange segment', tags: ['fruit', 'sweet'], amount: 1.2, shape: 'segment', colors: ['#f6a03a', '#fbd08a'], decay: 2, rot: 'flies', size: 1 },
  pear: { name: 'Pear slice', tags: ['fruit', 'sweet'], amount: 1.6, shape: 'pearSlice', colors: ['#f4efc8', '#b9cf5a'], decay: 2.2, rot: 'flies', size: 1 },
  tomato: { name: 'Cherry tomato', tags: ['fruit', 'veg'], amount: 1.0, shape: 'tomato', colors: ['#e2453f', '#77b255'], decay: 2.5, rot: 'flies', size: 0.9 },
  cucumber: { name: 'Cucumber slice', tags: ['veg'], amount: 1.4, shape: 'coin', colors: ['#e6f2c4', '#5f9e45', '#c7dd8f'], decay: 2.5, rot: 'mold', size: 1, float: 20 },
  lettuce: { name: 'Lettuce leaf', tags: ['veg', 'leaf'], amount: 2.5, shape: 'leaf', colors: ['#b6dc7a', '#8cc152'], decay: 2, rot: 'mold', size: 1.3, float: 60 },
  kale: { name: 'Kale', tags: ['veg', 'leaf'], amount: 2.0, shape: 'curlyLeaf', colors: ['#5f9e45', '#4f8a3c'], decay: 3, rot: 'mold', size: 1.2, float: 40 },
  spinach: { name: 'Spinach', tags: ['veg', 'leaf'], amount: 1.6, shape: 'leaf', colors: ['#5c9a3c', '#3f7a2e'], decay: 2, rot: 'mold', size: 1.1, float: 40 },
  carrot: { name: 'Carrot coin', tags: ['veg'], amount: 1.2, shape: 'coin', colors: ['#f39a3a', '#e07a2a', '#f6b45a'], decay: 4, rot: 'mold', size: 0.9 },
  pea: { name: 'Peas', tags: ['veg'], amount: 0.6, shape: 'berries', colors: ['#9ccf5a', '#77b255'], decay: 3, rot: 'mold', size: 0.7 },
  broccoli: { name: 'Broccoli', tags: ['veg'], amount: 1.2, shape: 'broccoli', colors: ['#5f9e45', '#b6d68a'], decay: 3, rot: 'mold', size: 1 },
  corn: { name: 'Corn kernels', tags: ['seed', 'veg', 'grain'], amount: 0.8, shape: 'kernels', colors: ['#f6d64a', '#e8b83a'], decay: 4, rot: 'mold', size: 0.8 },
  pumpkin: { name: 'Pumpkin bit', tags: ['veg', 'fruit'], amount: 1.5, shape: 'chunk', colors: ['#f0913a', '#f6c06a'], decay: 3, rot: 'mold', size: 1 },
  mushroom: { name: 'Mushroom slice', tags: ['fungus', 'veg'], amount: 0.9, shape: 'mushroom', colors: ['#efe3c8', '#a9825a'], decay: 2, rot: 'mold', size: 0.9 },
  sunflower: { name: 'Sunflower seeds', tags: ['seed'], amount: 1.0, shape: 'seeds', colors: ['#5a4a3a', '#efe6d0'], decay: 12, rot: 'mold', size: 0.9 },
  seedmix: { name: 'Seed mix', tags: ['seed', 'grain'], amount: 1.0, shape: 'seeds', colors: ['#d9b072', '#a9825a', '#f2e2b0'], decay: 12, rot: 'mold', size: 0.9 },
  oats: { name: 'Oat flakes', tags: ['grain'], amount: 0.8, shape: 'flakes', colors: ['#e8d6a8', '#d4bd88'], decay: 8, rot: 'mold', size: 0.9, float: 15 },
  bread: { name: 'Bread crumbs', tags: ['grain'], amount: 0.8, shape: 'crumbs', colors: ['#f2dca6', '#c98f4a'], decay: 1.5, rot: 'mold', cloudy: 2, size: 0.9, float: 25 },
  cookie: { name: 'Cookie crumb', tags: ['grain', 'sweet'], amount: 0.7, shape: 'crumbs', colors: ['#d9a35a', '#5a3a2a'], decay: 5, rot: 'mold', size: 0.9 },
  doughnut: { name: 'Doughnut bit', tags: ['grain', 'sweet'], amount: 1.0, shape: 'donut', colors: ['#d9a35a', '#f39ac0'], decay: 4, rot: 'mold', size: 1 },
  cheese: { name: 'Cheese nibble', tags: ['protein'], amount: 0.8, shape: 'cheese', colors: ['#f6d64a', '#e8b83a'], decay: 3, rot: 'mold', size: 0.9 },
  honey: { name: 'Honey drop', tags: ['sweet', 'nectar'], amount: 0.7, shape: 'drop', colors: ['#f2b23a', '#f7d27a'], decay: 40, rot: 'mold', size: 0.8 },
  sugarwater: { name: 'Sugar water', tags: ['sweet', 'nectar'], amount: 0.5, shape: 'drop', colors: ['#cfe8f6', '#ffffff'], decay: 3, rot: 'mold', size: 0.8 },
  jelly: { name: 'Fruit jelly', tags: ['sweet', 'fruit'], amount: 0.7, shape: 'drop', colors: ['#e8475a', '#f58a9a'], decay: 6, rot: 'flies', size: 0.8 },
  pollen: { name: 'Pollen ball', tags: ['pollen', 'protein'], amount: 0.4, shape: 'fuzzball', colors: ['#f6c83a', '#f39a2a'], decay: 8, rot: 'mold', size: 0.7 },
  flakes: { name: 'Fish flakes', tags: ['flake'], amount: 0.6, shape: 'flakes', colors: ['#e8603c', '#f6d64a', '#77b255'], decay: 2, rot: 'cloudy', cloudy: 1.5, size: 0.9, float: 45 },
  pellets: { name: 'Sinking pellets', tags: ['pellet', 'protein'], amount: 0.8, shape: 'pellets', colors: ['#9a6a3f', '#7a4f2e'], decay: 3, rot: 'cloudy', cloudy: 1, size: 0.8 },
  algae: { name: 'Algae wafer', tags: ['algae', 'veg'], amount: 1.0, shape: 'wafer', colors: ['#5f8a3c', '#9cbf6a'], decay: 4, rot: 'cloudy', size: 0.9 },
  sticks: { name: 'Turtle sticks', tags: ['pellet', 'protein'], amount: 1.2, shape: 'sticks', colors: ['#c98f4a', '#e8603c'], decay: 3, rot: 'cloudy', size: 1, float: 90 },
  bugbites: { name: 'Bug bites', tags: ['protein'], amount: 0.7, shape: 'pellets', colors: ['#c9a46a', '#a9825a'], decay: 4, rot: 'mold', size: 0.8 },
  eggshell: { name: 'Eggshell bits', tags: ['calcium'], amount: 0.5, shape: 'shards', colors: ['#fbf6ea', '#e9dcc0'], decay: 60, rot: 'mold', size: 0.9 },
  leaves: { name: 'Fallen leaves', tags: ['leaflitter', 'decay'], amount: 1.5, shape: 'deadleaf', colors: ['#c98a4a', '#a9682f'], decay: 25, rot: 'mold', size: 1.2, float: 120 },
};

export const FOOD_ORDER = Object.keys(FOODS);
for (const id of FOOD_ORDER) FOODS[id].id = id;

// Who loves a food (for UI hints).
export function lovedBy(foodId, SPECIES) {
  const f = FOODS[foodId];
  const out = [];
  for (const sp of Object.keys(SPECIES)) {
    const s = SPECIES[sp];
    let best = 0;
    const diets = [s.diet, ...s.stages.map((st) => st.diet).filter(Boolean)];
    for (const d of diets) for (const t of f.tags) best = Math.max(best, d[t] || 0);
    if (best >= 0.75) out.push(sp);
  }
  return out;
}
