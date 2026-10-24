// Headless check that every ware from the Busytown Market does its job:
// buy it in a fresh tank, set up the situation it's for, run the tank for a
// while and look for the difference it makes.
// usage: node tools/markettest.mjs
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { Journal } from '../src/sim/journal.js';
import { buy } from '../src/sim/market.js';
import { WARES } from '../src/data/market.js';
import { zoneStatus } from '../src/sim/care.js';
import { SIM_DT, DAY_LEN } from '../src/config.js';

let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg);
  if (!ok) failed++;
};
// A full tank, with friends enough in Busytown to buy anything.
function tank(seed = 11) {
  const w = new World();
  w.newGame(seed, true);
  const j = new Journal();
  j.attach(w);
  j.reset();
  for (const wr of WARES) j.orders.hearts[wr.who] = 5;
  w.coins = 10000;
  return { w, j };
}
function run(w, j, days) {
  for (let i = 0; i < (days * DAY_LEN) / SIM_DT; i++) {
    w.step(SIM_DT);
    j.update(SIM_DT);
  }
}

// buying: friendship and coins are checked, and coins are spent
{
  const { w, j } = tank();
  j.orders.hearts.postie = 0;
  check(!buy(j, w, 'courier').ok, 'a neighbour only sells to friends');
  j.orders.hearts.postie = 1;
  w.coins = 5;
  check(!buy(j, w, 'courier').ok, 'nobody sells for less than the price');
  w.coins = 100;
  check(buy(j, w, 'courier').ok && w.coins === 70 && w.owns('courier'), 'buying pays the price and the ware is yours');
  check(!buy(j, w, 'courier').ok, 'a ware is only bought once');
}

// mail dragonfly: goods get collected without the keeper
{
  const { w, j } = tank();
  buy(j, w, 'courier');
  run(w, j, 0.5);
  check(w.creatures.filter((c) => c.role === 'courier').length === 1, 'the mail dragonfly reports for duty');
  check((w.stats.collected || 0) > 0, `the mail dragonfly collects goods into the basket (${w.stats.collected || 0})`);
}

// rain barrel: the misters never run dry
{
  const { w, j } = tank();
  buy(j, w, 'rainBarrel');
  w.env.jungle.mister = 1;
  w.env.desert.mister = 1;
  run(w, j, 1.2);
  check(w.env.jungle.water > 0.9 && w.env.desert.water > 0.9, `the rain barrel keeps the misters' jugs full (${w.env.jungle.water.toFixed(2)})`);
}

// climate keeper: a zone left far too hot comes back to comfy
{
  const { w, j } = tank();
  buy(j, w, 'climate');
  w.env.desert.lamp = 1;
  w.env.jungle.lamp = 0;
  w.env.jungle.mister = 0;
  run(w, j, 0.6);
  const d = zoneStatus(w, 'desert');
  const jg = zoneStatus(w, 'jungle');
  check(d.tState === 'ok' && jg.tState === 'ok', `the climate keeper sets the lamps right (desert ${d.tState}, jungle ${jg.tState})`);
}

// sprinklers: plants grow faster
{
  const a = tank(3);
  const b = tank(3);
  buy(b.j, b.w, 'sprinkler');
  for (const { w } of [a, b]) for (const p of w.plants) p.growth = 0.2;
  run(a.w, a.j, 0.4);
  run(b.w, b.j, 0.4);
  const g = (w) => w.plants.reduce((s, p) => s + p.growth, 0) / w.plants.length;
  check(g(b.w) > g(a.w) * 1.2, `plants grow faster under the sprinklers (${g(a.w).toFixed(2)} → ${g(b.w).toFixed(2)})`);
}

// notice board: more letters at once
{
  const { w, j } = tank();
  buy(j, w, 'noticeBoard');
  run(w, j, 2);
  check(j.orders.list.length > 3, `the notice board lets more letters wait (${j.orders.list.length} open)`);
}

// clinic: poorly critters check in and get better; everyone lives longer
{
  const { w, j } = tank();
  const r = buy(j, w, 'clinic');
  check(!!r.d, 'the clinic is put up in the tank');
  let visits = 0;
  w.events.on('clinic', () => visits++);
  // (critters on its side of the pond: nobody walks across the water)
  const z = w.env.zoneAt(r.d.x);
  const poorly = w.creatures.filter((c) => !c.dead && c.isAdult && !c.def.colony && c.mode === 'walk' && w.env.zoneAt(c.x) === z).slice(0, 4);
  for (const c of poorly) c.health = 0.3;
  run(w, j, 0.5);
  check(visits > 0, `poorly critters check into the clinic (${visits})`);
  check(poorly.filter((c) => !c.dead).every((c) => c.health > 0.5), 'and come out feeling better');
}

// butterfly house: rare butterflies hatch there
{
  const { w, j } = tank();
  const r = buy(j, w, 'butterflyHouse');
  let rare = 0;
  w.events.on('rare', () => rare++);
  for (let i = 0; i < 6; i++) {
    const c = w.spawn('butterfly', r.d.x + (i - 3) * 20, null, { stage: 'chrysalis' });
    c.mode = 'still';
    c.stageAge = c.stageDur - 1;
  }
  run(w, j, 0.05);
  check(rare > 0, `rare butterflies hatch in the butterfly house (${rare} of 6)`);
}

// schoolhouse: the young grow up twice as fast
{
  const a = tank(5);
  const b = tank(5);
  buy(b.j, b.w, 'schoolhouse');
  const nymphs = (t) => {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(t.w.spawn('cricket', 200 + i * 30, null, { stage: 'nymph' }));
    return out;
  };
  const na = nymphs(a);
  const nb = nymphs(b);
  run(a.w, a.j, 0.75);
  run(b.w, b.j, 0.75);
  const grown = (list) => list.filter((c) => c.isAdult).length;
  check(grown(nb) > grown(na), `the schoolhouse helps the young grow up (${grown(na)} → ${grown(nb)} of 4 nymphs grown up)`);
}

// picnic hamper: feeds its corner at breakfast and supper
{
  const { w, j } = tank();
  buy(j, w, 'hamper');
  let meals = 0;
  w.events.on('hamper', () => meals++);
  run(w, j, 1.1);
  check(meals >= 2, `the picnic hamper serves breakfast and supper (${meals} meals)`);
}

// busy buns: whoever nibbles one works double-time
{
  const { w, j } = tank();
  buy(j, w, 'buns');
  check(w.stock.buns === 3, 'a bag of busy buns holds three');
  const bee = w.creatures.find((c) => c.sp === 'bee');
  const f = w.addFood('bun', bee.x, bee.y, {});
  w.eat(bee, { kind: 'food', food: f });
  check(bee.busyT > 0 && w.workRate(bee) >= 2, 'a nibble of busy bun means double-time');
}

// the pet shop: koi find coins, the axolotl's fans pay extra
{
  const { w, j } = tank();
  buy(j, w, 'koi');
  check(w.count('koi') === 2, 'koi arrive in the pond');
  const c0 = w.coins;
  run(w, j, 1.5);
  check(w.coins > c0, `koi turn up lost coins (${w.coins - c0})`);
  buy(j, w, 'axolotl');
  const o = { who: 'baker', needs: { honey: 1 }, stars: 2, coins: 8 };
  check(j.orders.pay(o).fans === 3, 'the axolotl\'s fans pay extra on every order');
}

// moonflowers: planted, and they glow by night
{
  const { w, j } = tank();
  buy(j, w, 'moonflower');
  check(w.plants.filter((p) => p.type === 'moonflower').length === 2 && j.canUse('plant', 'moonflower'), 'moonflower seeds are sown and can be planted');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nevery ware does its job');
process.exit(failed ? 1 : 0);
