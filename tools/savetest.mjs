// Headless check: save -> load round trip, then the "while you were away" catch-up.
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { SIM_DT, DAY_LEN } from '../src/config.js';
import { catchUp } from '../src/sim/away.js';

globalThis.setTimeout = globalThis.setTimeout || ((f) => f());
const w = new World();
w.newGame(99, true);
for (let i = 0; i < (DAY_LEN * 0.6) / SIM_DT; i++) w.step(SIM_DT);
const before = JSON.stringify(w.counts);
const str = JSON.stringify(w.serialize());
console.log('save size', (str.length / 1024).toFixed(1) + 'KB');
const w2 = new World();
w2.load(JSON.parse(str));
const after = JSON.stringify(w2.counts);
console.log('counts equal after load:', before === after);
if (before !== after) console.log(before, '\n', after);
console.log('terrain equal:', w.terrain.mat.every((v, i) => v === w2.terrain.mat[i]), 'water level', w.terrain.waterLevel, w2.terrain.waterLevel);
console.log('plants', w.plants.length, w2.plants.length, 'foods', w.foods.length, w2.foods.length, 'decor', w.decor.length, w2.decor.length, 'goods', w.goods.length, w2.goods.length, 'colonies', w2.colonies.length, 'climbing', w2.creatures.filter((c) => c.mode === 'climb').length);
console.log('basket equal:', JSON.stringify(w.pantry) === JSON.stringify(w2.pantry), JSON.stringify(w2.pantry));
for (let i = 0; i < 600; i++) w2.step(SIM_DT);
console.log('stepped loaded world ok, creatures', w2.creatures.length);
const t0 = performance.now();
const s = await catchUp(w2, DAY_LEN * 1.25);
console.log('catch-up 1.25 days took', (performance.now() - t0).toFixed(0) + 'ms', JSON.stringify({ born: s.born, died: s.died.length, eaten: s.eaten, dug: s.dug, sprouts: s.sprouts, meta: s.metamorph }));
console.log('after catch-up', JSON.stringify(w2.counts));
