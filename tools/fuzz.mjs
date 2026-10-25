// Headless fuzz test: random player actions + extreme settings over several
// game days. Checks that nothing throws, nothing goes NaN and nobody leaves
// the tank. usage: node tools/fuzz.mjs [days=4] [seed=1]
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { W, H, SIM_DT, DAY_LEN } from '../src/config.js';
import { ADOPT_ORDER } from '../src/data/species.js';
import { WARES } from '../src/data/market.js';
import { buy } from '../src/sim/market.js';
import { FOOD_ORDER } from '../src/data/foods.js';
import { PLANT_ORDER } from '../src/data/plants.js';
import { DECOR_ORDER } from '../src/data/decor.js';
import { mulberry32 } from '../src/util/rng.js';
import { Journal } from '../src/sim/journal.js';
import { VISITOR_ORDER } from '../src/data/visitors.js';
import { OUTFIT_ORDER, canWear } from '../src/data/outfits.js';

const days = +(process.argv[2] || 4);
const seed = +(process.argv[3] || 1);
const R = mulberry32(seed);
const pick = (a) => a[Math.floor(R() * a.length)];
const w = new World();
w.newGame(seed, seed % 2 ? 'farm' : true);
const j = new Journal();
j.attach(w);
j.sandbox = true; // (so the Market sells everything, for free)
let issues = 0;
const report = (msg) => {
  if (issues++ < 15) console.log('  ! ' + msg);
};
const steps = Math.round((days * DAY_LEN) / SIM_DT);
const actions = {};
for (let i = 0; i < steps; i++) {
  if (i % 90 === 0) {
    const a = Math.floor(R() * 15);
    const x = R() * W;
    const y = R() * H;
    try {
      switch (a) {
        case 0: for (let k = 0; k < 5; k++) w.dropFood(pick(FOOD_ORDER), x + R() * 40, y); actions.feed = (actions.feed || 0) + 1; break;
        case 1: w.adopt(pick(ADOPT_ORDER), x, y); actions.adopt = (actions.adopt || 0) + 1; break;
        case 2: w.placePlant(pick(PLANT_ORDER), x); actions.plant = (actions.plant || 0) + 1; break;
        case 3: w.placeDecor(pick(DECOR_ORDER), x, y); actions.decor = (actions.decor || 0) + 1; break;
        case 4: w.sculpt(x, y, 10 + R() * 40, pick(['sand', 'soil', 'rock', 'gravel', 'dig', 'dig'])); actions.sculpt = (actions.sculpt || 0) + 1; break;
        case 5: w.setWaterLevel(w.terrain.waterLevel + (R() - 0.5) * 80); actions.water = (actions.water || 0) + 1; break;
        case 6: {
          const z = pick(['desert', 'pond', 'jungle']);
          w.env[z].lamp = R() < 0.3 ? 0 : R() < 0.5 ? 1 : R();
          if (w.env[z].mister != null) w.env[z].mister = R();
          if (z === 'pond') {
            w.env.pond.heater = R() < 0.5;
            w.env.pond.heaterTarget = 10 + R() * 24;
            w.env.pond.filter = R();
          }
          actions.climate = (actions.climate || 0) + 1;
          break;
        }
        case 7: w.tapGlass(x, y); break;
        case 8: if (w.creatures.length) w.pet(pick(w.creatures)); break;
        case 9: w.env.lightsMode = pick(['auto', 'auto', 'day', 'night']); break;
        case 10: {
          // keeper chores and the weather switch
          const k = Math.floor(R() * 5);
          if (k === 0) w.refillMister(pick(['desert', 'jungle']));
          else if (k === 1) w.rinseFilter();
          else if (k === 2) w.topUpPond();
          else if (k === 3) w.env.weatherOn = !w.env.weatherOn;
          else w.cleanPond();
          actions.chore = (actions.chore || 0) + 1;
          break;
        }
        case 11: {
          // goods and Busytown's orders
          const k = Math.floor(R() * 3);
          if (k === 0 && w.goods.length) w.collectGood(pick(w.goods));
          else if (k === 1) for (const o of j.orders.ready()) j.orders.send(o, o.critter ? pick(j.orders.eligible(o)) : undefined);
          else if (j.orders.list.length) j.orders.decline(pick(j.orders.list));
          actions.orders = (actions.orders || 0) + 1;
          break;
        }
        case 12: {
          // the Busytown Market
          buy(j, w, pick(WARES));
          actions.market = (actions.market || 0) + 1;
          break;
        }
        case 13: {
          // a visitor from the garden, and saying yes (or no) to their idea
          const v = j.visitors.current();
          if (!v) j.visitors.arrive(pick(VISITOR_ORDER));
          else if (v.waiting) {
            if (R() < 0.7) j.visitors.accept(v.type, v.offer, v);
            else j.visitors.decline(v.type, v.offer, v);
          } else if (R() < 0.2) v.leave(w);
          actions.visitor = (actions.visitor || 0) + 1;
          break;
        }
        case 14: {
          // dressing up
          const c = pick(w.creatures.filter((k) => canWear(k)));
          if (c) w.dress(c, R() < 0.15 ? null : pick(OUTFIT_ORDER), pick(['#d9483b', '#4c8fd6', null]));
          actions.dress = (actions.dress || 0) + 1;
          break;
        }
      }
    } catch (e) {
      report('action ' + a + ' threw: ' + (e.stack || e));
    }
  }
  try {
    w.step(SIM_DT);
    j.update(SIM_DT);
  } catch (e) {
    report('step threw: ' + (e.stack || e).split('\n').slice(0, 4).join(' | '));
    break;
  }
  if (i % 300 === 0) {
    for (const c of w.creatures) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.hunger) || !Number.isFinite(c.health)) report(`NaN in ${c.sp}/${c.stage} mode=${c.mode} b=${c.brain.b && c.brain.b.id} x=${c.x} y=${c.y}`);
      else if (c.x < -5 || c.x > W + 5 || c.y < -30 || c.y > H + 5) report(`${c.sp}/${c.stage} out of tank at ${c.x.toFixed(0)},${c.y.toFixed(0)} mode=${c.mode}${c.climb && c.climb.plant ? ` on a ${c.climb.plant.type} (planted at ${c.climb.plant.y.toFixed(0)})` : ''}`);
    }
    for (const f of w.foods) if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || f.y > H + 5) report(`food ${f.type} bad pos ${f.x},${f.y} state=${f.state}`);
    for (const p of w.plants) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !p.shape.box.every(Number.isFinite)) report(`plant ${p.type} bad`);
    for (const g of w.goods) if (!Number.isFinite(g.x) || !Number.isFinite(g.y) || g.y > H + 5) report(`good ${g.type} bad pos ${g.x},${g.y}`);
    for (const [k, v] of Object.entries(w.pantry)) if (!Number.isFinite(v) || v < 0) report(`pantry ${k} = ${v}`);
    for (const [k, L] of Object.entries(w.flavours)) {
      const sum = Object.values(L).reduce((a, n) => a + n, 0);
      if (sum !== w.pantry[k] || Object.values(L).some((n) => !(n > 0))) report(`basket flavours of ${k} don't add up: ${JSON.stringify(L)} vs ${w.pantry[k]}`);
    }
    for (const v of w.visitors) if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < -5 || v.x > W + 5 || v.y > H + 5) report(`visitor ${v.type} out of the tank at ${v.x},${v.y} (${v.state})`);
    if (!Number.isFinite(w.coins) || w.coins < 0) report(`coins = ${w.coins}`);
    if (w.creatures.filter((c) => c.role === 'courier' && !c.dead).length > 1) report('more than one mail dragonfly');
  }
}
const env = w.env;
console.log(`fuzz ${days} days seed ${seed}: ${issues} issue(s); actions ${JSON.stringify(actions)}`);
console.log(`end: ${w.creatures.length} critters, ${w.plants.length} plants, ${w.foods.length} foods, ${w.decor.length} decor; O2 ${env.pond.oxygen.toFixed(2)} clarity ${env.pond.clarity.toFixed(2)}; water ${w.terrain.waterLevel}`);
console.log('counts', JSON.stringify(w.counts));
console.log(`goods waiting ${w.goods.length}, basket ${JSON.stringify(w.pantry)}, orders open ${j.orders.list.length}, sent ${j.orders.sent}`);
console.log(`market: ${Object.keys(w.perks).join(', ') || 'nothing'}; coins ${w.coins}; colonies ${w.colonies.map((c) => c.kind).join(', ')}`);
process.exit(issues ? 1 : 0);
