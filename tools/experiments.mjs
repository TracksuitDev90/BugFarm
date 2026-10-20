// Checks that the player's "experiments" produce visible results.
// usage: node tools/experiments.mjs
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { Journal } from '../src/sim/journal.js';
import { SIM_DT, DAY_LEN } from '../src/config.js';

function run(name, setup, hours, probe) {
  const w = new World();
  w.newGame(5, true);
  const j = new Journal();
  j.attach(w);
  const ev = {};
  w.events.on('*', (t) => (ev[t] = (ev[t] || 0) + 1));
  setup(w);
  const samples = [];
  const steps = Math.round((hours / 24) * DAY_LEN / SIM_DT);
  for (let i = 0; i < steps; i++) {
    w.step(SIM_DT);
    j.update(SIM_DT);
    if (probe && i % 300 === 0) samples.push(probe(w));
  }
  console.log(`\n== ${name} (${hours}h)`);
  console.log('  discoveries:', Object.keys(j.unlocked).join(', ') || '-');
  const keys = ['gasp', 'antHide', 'estivate', 'huddle', 'wormRain', 'headstand', 'fruitfly', 'stuffed', 'bask', 'death', 'chirp', 'plantDied'];
  console.log('  events:', keys.filter((k) => ev[k]).map((k) => `${k}:${ev[k]}`).join(' '));
  if (probe) console.log('  probe:', samples.filter((_, i) => i % Math.ceil(samples.length / 6) === 0).map((s) => JSON.stringify(s)).join(' '));
  return w;
}

run('Overfeed the pond', (w) => {
  for (let i = 0; i < 40; i++) w.dropFood(i % 2 ? 'flakes' : 'bread', 650 + Math.random() * 350, 480);
}, 24, (w) => ({ O2: +w.env.pond.oxygen.toFixed(2), clear: +w.env.pond.clarity.toFixed(2), algae: +w.env.pond.algae.toFixed(2), food: w.foods.filter((f) => f.inWater).length }));

run('Warm water, filter off', (w) => {
  Object.assign(w.env.pond, { heater: true, heaterTarget: 33, filter: 0, lamp: 1 });
  for (let i = 0; i < 15; i++) w.dropFood('pellets', 700 + Math.random() * 300, 480);
}, 24, (w) => ({ T: +w.env.pond.temp.toFixed(1), O2: +w.env.pond.oxygen.toFixed(2), clear: +w.env.pond.clarity.toFixed(2) }));

run('Desert heat wave', (w) => {
  w.env.desert.lamp = 1;
}, 10, (w) => {
  const ants = w.creatures.filter((c) => c.sp === 'ant');
  const deep = ants.filter((c) => w.terrain.isUnderground(c.x, c.y + 4)).length;
  return { T: +w.env.desert.temp.toFixed(1), antsUnderground: `${deep}/${ants.length}` };
});

run('Cold snap', (w) => {
  w.env.desert.lamp = 0;
  w.env.jungle.lamp = 0;
  w.env.pond.lamp = 0;
  w.env.lightsMode = 'night';
  w.env.roomSet = 9;
}, 12, (w) => ({ Tj: +w.env.jungle.temp.toFixed(1), Td: +w.env.desert.temp.toFixed(1) }));

run('Jungle drought', (w) => {
  w.env.jungle.mister = 0;
  w.env.jungle.lamp = 1;
}, 24, (w) => ({ M: +w.env.jungle.moist.toFixed(2), T: +w.env.jungle.temp.toFixed(1), wilted: w.plants.filter((p) => p.health < 0.5).length }));

run('Rainy jungle', (w) => {
  w.env.jungle.mister = 1;
}, 10, (w) => ({ M: +w.env.jungle.moist.toFixed(2) }));

run('Leave fruit to rot', (w) => {
  for (let i = 0; i < 4; i++) w.dropFood('banana', 1200 + i * 60, 400);
}, 48, (w) => ({ flies: w.count('fruitfly'), rotten: w.foods.filter((f) => f.rot > 0).length }));

run('Overfeed the gecko', (w) => {
  for (let i = 0; i < 12; i++) w.dropFood('bugbites', 380 + Math.random() * 80, 400);
}, 24, (w) => {
  const g = w.creatures.find((c) => c.sp === 'gecko');
  return g ? { plump: +g.plump.toFixed(2), hunger: +g.hunger.toFixed(2) } : {};
});
