// Headless check: save -> load round trip, then the "while you were away" catch-up.
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { SIM_DT, DAY_LEN } from '../src/config.js';
import { catchUp } from '../src/sim/away.js';
import { Journal } from '../src/sim/journal.js';
import { buy } from '../src/sim/market.js';

globalThis.setTimeout = globalThis.setTimeout || ((f) => f());
let failed = 0;
const expect = (ok, msg) => {
  if (!ok) {
    failed++;
    console.log('  ✗ ' + msg);
  }
};
const w = new World();
w.newGame(99, true);
// the Market, ant kinds and the new critters all need to survive a save
const j = new Journal();
j.attach(w);
j.sandbox = true;
for (const id of ['courier', 'rainBarrel', 'clinic', 'koi', 'buns', 'butterflyHouse']) buy(j, w, id);
w.adopt('honeypotAnt', 150, 300);
w.adopt('tetra', 820, 500);
w.adopt('dragonfly', 870, 560);
w.adopt('moth', 1250, 300);
w.coins = 123;
j.orders.hearts = { baker: 2, postie: 1 };
for (let i = 0; i < (DAY_LEN * 0.6) / SIM_DT; i++) w.step(SIM_DT);
const someone = w.creatures.find((c) => !c.dead && c.isAdult && c.sp === 'cricket');
someone.memory.dream = { i: 0, n: 7 };
someone.memory.master = 'Star of the night chorus';
const before = JSON.stringify(w.counts);
const str = JSON.stringify(w.serialize());
const jstr = JSON.stringify(j.serialize());
console.log('save size', (str.length / 1024).toFixed(1) + 'KB');
const w2 = new World();
w2.load(JSON.parse(str));
const after = JSON.stringify(w2.counts);
console.log('counts equal after load:', before === after);
if (before !== after) console.log(before, '\n', after);
console.log('terrain equal:', w.terrain.mat.every((v, i) => v === w2.terrain.mat[i]), 'water level', w.terrain.waterLevel, w2.terrain.waterLevel);
console.log('plants', w.plants.length, w2.plants.length, 'foods', w.foods.length, w2.foods.length, 'decor', w.decor.length, w2.decor.length, 'goods', w.goods.length, w2.goods.length, 'colonies', w2.colonies.length, 'climbing', w2.creatures.filter((c) => c.mode === 'climb').length);
console.log('basket equal:', JSON.stringify(w.pantry) === JSON.stringify(w2.pantry), JSON.stringify(w2.pantry));
expect(before === after, 'critter counts survive');
expect(w2.coins === w.coins && JSON.stringify(w2.perks) === JSON.stringify(w.perks) && w2.stock.buns === w.stock.buns, `coins, wares and buns survive (${w2.coins}, ${Object.keys(w2.perks).join(' ')}, ${w2.stock.buns} buns)`);
expect(w2.colonies.map((c) => c.kind).join() === w.colonies.map((c) => c.kind).join(), 'ant colony kinds survive');
expect(w2.creatures.filter((c) => c.role === 'courier').length === 1, 'the mail dragonfly survives');
const vineKey = (ww) => ww.vines.list.map((v) => `${v.kind}@${v.x}:${Math.round(v.len)}:${v.wither.toFixed(2)}`).join();
expect(w.vines.list.length > 0 && vineKey(w2) === vineKey(w), `the jungle's vines survive (${w2.vines.list.length})`);
w.keeper = { name: 'Juniper', kind: 'town' };
const w3 = new World();
w3.load(JSON.parse(JSON.stringify(w.serialize())));
expect(w3.keeper && w3.keeper.name === 'Juniper' && w3.keeper.kind === 'town', 'the farm\'s name survives');
const twin = w2.byId(someone.id);
expect(twin && twin.memory.dream.n === 7 && twin.memory.master === someone.memory.master, 'dreams survive');
const j2 = new Journal();
j2.attach(w2);
j2.load(JSON.parse(jstr));
expect(j2.orders.heartsOf('baker') === 2 && j2.orders.heartsOf('postie') === 1, 'friendships survive');
for (let i = 0; i < 600; i++) w2.step(SIM_DT);
console.log('stepped loaded world ok, creatures', w2.creatures.length);
const t0 = performance.now();
const s = await catchUp(w2, DAY_LEN * 1.25);
console.log('catch-up 1.25 days took', (performance.now() - t0).toFixed(0) + 'ms', JSON.stringify({ born: s.born, died: s.died.length, eaten: s.eaten, dug: s.dug, sprouts: s.sprouts, meta: s.metamorph }));
console.log('after catch-up', JSON.stringify(w2.counts));
console.log(failed ? `${failed} check(s) failed` : 'save checks ok');
process.exit(failed ? 1 : 0);
