// Headless simulation test: runs the world for N game days without a browser
// and reports populations, events and timing. usage: node tools/simtest.mjs [days] [seed]
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { DAY_LEN, SIM_DT } from '../src/config.js';

const days = +(process.argv[2] || 2);
const seed = +(process.argv[3] || 42);
const w = new World();
w.newGame(seed, true);
const ev = {};
w.events.on('*', (type) => (ev[type] = (ev[type] || 0) + 1));
const logs = [];
w.events.on('log', (l) => logs.push(`d${l.day} ${l.hour.toFixed(1)}h ${l.text}`));
const t0 = performance.now();
const steps = Math.round((days * DAY_LEN) / SIM_DT);
let worst = 0;
for (let i = 0; i < steps; i++) {
  const s = performance.now();
  w.step(SIM_DT);
  const d = performance.now() - s;
  if (d > worst) worst = d;
  if (i % Math.round(DAY_LEN / 4 / SIM_DT) === 0) {
    const counts = Object.entries(w.counts).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(' ');
    const col = w.colonies[0];
    console.log(`day ${w.env.day} ${w.env.hour.toFixed(1)}h | ${counts} | food ${w.foods.length} plants ${w.plants.length} | col food ${col ? col.food.toFixed(2) : '-'} dug ${col ? col.dug : '-'} brood ${col ? col.brood.length : '-'} | O2 ${w.env.pond.oxygen.toFixed(2)} clar ${w.env.pond.clarity.toFixed(2)} algae ${w.env.pond.algae.toFixed(2)}`);
  }
}
const ms = performance.now() - t0;
console.log(`\n${steps} steps in ${ms.toFixed(0)}ms (${(ms / steps).toFixed(3)} ms/step, worst ${worst.toFixed(1)}ms)`);
console.log('events:', JSON.stringify(ev));
console.log('\nlog:\n' + logs.slice(-40).join('\n'));
// behaviour census
const beh = {};
for (const c of w.creatures) {
  const k = c.sp + ':' + (c.brain.b ? c.brain.b.id : '-');
  beh[k] = (beh[k] || 0) + 1;
}
console.log('\nbehaviours now:', JSON.stringify(beh));
