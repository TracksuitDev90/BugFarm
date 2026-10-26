// Building a bigger tank: grows a farm at the original size, widens each
// zone in turn (desert, pond, jungle, and all of them twice), and loads every
// result into a tank of the new size (a fresh process, since the tank's size
// is fixed when the game starts). Checks the ground, the water, the ant
// nest, the critters and the plants all came through in the right places,
// and that the bigger tank runs.
// usage: node tools/tanktest.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);

if (process.argv[2] === '--load') {
  // (child) load the widened save into a tank of its size and run it
  const fs = await import('node:fs');
  const { World } = await import('../src/world/world.js');
  await import('../src/ai/ants.js');
  const { SIM_DT, DAY_LEN, W, CELL, ZONE_X, TANK } = await import('../src/config.js');
  const d = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const before = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  const w = new World();
  w.load(d.world);
  const t = w.terrain;
  const out = { W, tank: TANK, ok: [] , bad: [] };
  const check = (ok, msg) => (ok ? out.ok : out.bad).push(msg);
  check(w.creatures.length === before.creatures, `critters all moved in (${w.creatures.length} of ${before.creatures})`);
  check(Math.abs(t.waterLevel - before.waterLevel) < 2, `the pond's level held (${before.waterLevel} -> ${t.waterLevel})`);
  // as much open water as before (more, if the pond was widened)
  let wet = 0;
  for (let x = 0; x < W; x += 8) if (t.waterAt(x, t.waterLevel + 20)) wet++;
  check(wet >= before.wet - 2, `the pond has all its water (${wet * 8} units across, was ${before.wet * 8})`);
  // the ant nest came with its ground: its rooms are still open
  for (const col of w.colonies) {
    const room = col.chambers[0];
    check(t.get(room.cx, room.cy) === 0, `the ant colony's first room is still dug out (cell ${room.cx},${room.cy})`);
  }
  const queen = w.creatures.find((c) => c.sp === 'ant' && c.stage === 'queen');
  check(!queen || t.get(Math.floor(queen.x / CELL), Math.floor(queen.y / CELL)) === 0, 'the ant queen is still in her nest, not in solid sand');
  const fish = w.creatures.filter((c) => c.def.fish && c.stage !== 'egg');
  check(fish.every((c) => t.waterAt(c.x, c.y)), `every fish is still in the water (${fish.filter((c) => !t.waterAt(c.x, c.y)).length} out)`);
  // every plant sits as high above (or below) the ground under it as it did
  const off = w.plants.map((p) => Math.round(p.y - t.surfaceY(p.x))).sort((a, b) => a - b).join();
  check(off === before.plantOff, 'the plants are still in their soil');
  check(w.decor.every((dd) => dd.x > 0 && dd.x < W), 'every decoration is inside the tank');
  // a new ground strip is real ground: walkable and solid underneath
  if (d.built) {
    const mid = (d.built.x0 + d.built.x1) / 2;
    const sy = t.surfaceY(mid);
    check(sy > 200 && sy < 800 && t.solidAt(mid, sy + 8), `the new ${d.built.zone} has ground (surface at ${Math.round(sy)})`);
  }
  for (let i = 0; i < Math.round((DAY_LEN * 0.4) / SIM_DT); i++) w.step(SIM_DT);
  check(w.creatures.every((c) => isFinite(c.x) && isFinite(c.y) && c.x >= 0 && c.x <= W), 'everyone stays in the tank after a while');
  check(Math.abs(w.terrain.waterLevel - t.waterLevel) < 6, 'the water stays put');
  console.log(JSON.stringify(out));
  process.exit(0);
}

const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const { World } = await import('../src/world/world.js');
await import('../src/ai/ants.js');
const { SIM_DT, DAY_LEN } = await import('../src/config.js');
const { expandSave } = await import('../src/sim/tank.js');

const w = new World();
w.newGame(11, true);
for (let i = 0; i < Math.round((DAY_LEN * 0.5) / SIM_DT); i++) w.step(SIM_DT);
const base = { v: 1, app: 'critterfarm', savedAt: Date.now(), world: w.serialize(), cam: { x: 800, y: 450, zoom: 1 }, speed: 1, journal: {} };
let wet0 = 0;
for (let x = 0; x < 1600; x += 8) if (w.terrain.waterAt(x, w.terrain.waterLevel + 20)) wet0++;
const before = {
  creatures: w.creatures.filter((c) => !c.dead).length,
  waterLevel: w.terrain.waterLevel,
  wet: wet0,
  plantOff: w.plants.map((p) => Math.round(p.y - w.terrain.surfaceY(p.x))).sort((a, b) => a - b).join(),
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'critterfarm-tank-'));
fs.writeFileSync(path.join(dir, 'before.json'), JSON.stringify(before));

let failed = 0;
const plans = [['desert'], ['pond'], ['jungle'], ['desert', 'pond', 'jungle', 'desert', 'pond', 'jungle']];
for (const plan of plans) {
  let d = base;
  for (const z of plan) d = expandSave(d, z);
  const file = path.join(dir, plan.join('-') + '.json');
  fs.writeFileSync(file, JSON.stringify(d));
  const r = spawnSync(process.execPath, [self, '--load', file, path.join(dir, 'before.json')], { env: { ...process.env, CRITTERFARM_TANK: JSON.stringify(d.world.tank) }, encoding: 'utf8' });
  let res = null;
  try {
    res = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch (e) {
    console.log(`✗ ${plan.join(' + ')}: could not load\n${r.stdout}\n${r.stderr}`);
    failed++;
    continue;
  }
  console.log(`${plan.join(' + ')} -> ${res.W} wide ${JSON.stringify(res.tank)}`);
  for (const m of res.ok) console.log('  ✓ ' + m);
  for (const m of res.bad) console.log('  ✗ ' + m);
  failed += res.bad.length;
}
// it stops at the biggest size
let full = base;
for (const z of ['desert', 'desert']) full = expandSave(full, z);
let threw = false;
try {
  expandSave(full, 'desert');
} catch (e) {
  threw = true;
}
console.log((threw ? '  ✓ ' : '  ✗ ') + 'a zone stops growing at its biggest size');
if (!threw) failed++;
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `${failed} check(s) failed` : 'tank checks ok');
process.exit(failed ? 1 : 0);
