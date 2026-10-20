// Plays a new farm headless with a simple, attentive keeper and reports how
// the zones level up, so the goals stay reachable as the game changes.
// The keeper feeds each zone, follows the clipboard's advice on the climate,
// refills misters, rinses the filter and tops up the pond.
// usage: node tools/progresstest.mjs [days=10] [seed=3]
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { Journal } from '../src/sim/journal.js';
import { zoneStatus, tankNeeds, favouriteFoods, residents } from '../src/sim/care.js';
import { maxLevel } from '../src/data/progression.js';
import { SIM_DT, DAY_LEN, ZONE_X } from '../src/config.js';

const days = +(process.argv[2] || 10);
const seed = +(process.argv[3] || 3);
const w = new World();
w.newGame(seed, 'farm');
const j = new Journal();
j.attach(w);
j.reset();
const levels = [];
j.progress.onLevel = (z, lv) => levels.push(`day ${w.env.day} ${w.env.hour.toFixed(0)}h: ${z} -> level ${lv}`);
const canUse = (k, id) => j.canUse(k, id);
const mid = { desert: 280, pond: 810, jungle: 1330 };
const steps = Math.round((days * DAY_LEN) / SIM_DT);
const errors = [];
let fed = 0;
for (let i = 0; i < steps; i++) {
  // every game hour the keeper has a look
  if (i % Math.round(DAY_LEN / 24 / SIM_DT) === 0) {
    const env = w.env;
    for (const z of ['desert', 'pond', 'jungle']) {
      const st = zoneStatus(w, z);
      if (z === 'pond') {
        const p = env.pond;
        if (st.tState === 'cold') {
          p.heater = true;
          p.heaterTarget = Math.min(30, (st.band.t[0] + st.band.t[1]) / 2);
        } else if (st.tState === 'hot') {
          if (p.heater) p.heaterTarget -= 2;
          else p.lamp = Math.max(0, p.lamp - 0.1);
        }
      } else {
        const e = env[z];
        if (st.tState === 'hot') e.lamp = Math.max(0, e.lamp - 0.1);
        else if (st.tState === 'cold') e.lamp = Math.min(1, e.lamp + 0.1);
        if (st.mState === 'dry') e.mister = Math.min(1, e.mister + 0.1);
        else if (st.mState === 'wet') e.mister = Math.max(0, e.mister - 0.1);
      }
    }
    for (const n of tankNeeds(w, canUse)) {
      if (!n.act) continue;
      if (n.act.kind === 'refill') w.refillMister(n.act.zone);
      if (n.act.kind === 'rinse') w.rinseFilter();
      if (n.act.kind === 'topup') w.topUpPond();
      if (n.act.kind === 'clean') w.cleanPond();
      if (n.act.kind === 'tidy') w.tidyLand();
    }
    // snacks twice a day in each zone, chosen for whoever lives there
    if (Math.round(env.hour) % 12 === 8) {
      for (const z of ['desert', 'pond', 'jungle']) {
        const sps = [...new Set(residents(w, z).map((c) => c.sp))];
        for (const f of favouriteFoods(sps, canUse, 2)) {
          const x = mid[z] + (Math.random() - 0.5) * 200;
          w.dropFood(f, x, z === 'pond' ? w.terrain.waterLevel - 20 : 60);
          fed++;
        }
      }
    }
    // plant and adopt what's unlocked, like a curious keeper would
    if (j.canUse('plant', 'eelgrass') && !w.plants.some((p) => p.type === 'eelgrass' && p.growth < 0.5)) w.placePlant('eelgrass', 700 + Math.random() * 250);
    if (Math.round(env.hour) === 10 && Math.random() < 0.5) w.placePlant('fern', 1150 + Math.random() * 350);
    for (const sp of ['butterfly', 'beetle', 'shrimp', 'frog', 'worm', 'pillbug', 'aphid', 'ladybug', 'bee', 'gecko', 'turtle']) {
      if (j.canUse('adopt', sp) && !w.count(sp)) {
        const z = { beetle: 'desert', gecko: 'desert', shrimp: 'pond', frog: 'pond', turtle: 'pond' }[sp] || 'jungle';
        const x = mid[z] + (sp === 'frog' || sp === 'shrimp' || sp === 'turtle' ? 0 : 60);
        for (let k = 0; k < 2; k++) w.adopt(sp, x + k * 30, z === 'pond' ? 520 : 300);
        if (sp === 'bee') w.placeDecor('beeHouse', 1370);
      }
    }
  }
  try {
    w.step(SIM_DT);
    j.update(SIM_DT);
  } catch (e) {
    errors.push(e.stack);
    break;
  }
  if (i % Math.round(DAY_LEN / SIM_DT) === 0 && i) {
    const L = j.progress.levels;
    const goals = ['desert', 'pond', 'jungle'].map((z) => j.progress.goals(z).map((g) => (j.progress.done[g.id] ? '✓' : '·') + g.id).join(' ')).join(' | ');
    console.log(`day ${w.env.day}: levels D${L.desert} P${L.pond} J${L.jungle} | ${w.creatures.length} critters | ${w.env.weather.name} | ${goals}`);
  }
}
console.log('\n' + (levels.join('\n') || 'no level-ups'));
const L = j.progress.levels;
console.log(`\nfinal levels: desert ${L.desert}/${maxLevel('desert')}, pond ${L.pond}/${maxLevel('pond')}, jungle ${L.jungle}/${maxLevel('jungle')}; ${fed} snacks; counts ${JSON.stringify(w.counts)}`);
if (errors.length) {
  console.log(errors[0]);
  process.exit(1);
}
// a new farm should get every zone off level 1 within a week of good care
const ok = L.desert > 1 && L.pond > 1 && L.jungle > 1;
console.log(ok ? 'progression ok' : 'some zone never levelled up');
process.exit(ok ? 0 : 1);
