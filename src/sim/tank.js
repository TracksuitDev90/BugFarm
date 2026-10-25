// Making the tank bigger. Busytown's builder can widen each zone a couple of
// times: fresh sand opens up on the desert's far side, the pond is dug wider
// down its middle (gravel, water and all), and new ground opens on the
// jungle's far side. The tank's size is fixed once the game is running (the
// terrain, water and every cached picture are sized to it), so building
// works on a save: the new columns are let into the ground and the water,
// everything to the right of them moves along, and the game reloads into
// the bigger tank. Pure data in, data out, so it's testable headless.
import { BASE_W, CELL, GH, MAT, POND_SPLIT, TANK_STEP, TANK_MAX, parseTank } from '../config.js';

export const BUILD_ZONES = ['desert', 'pond', 'jungle'];

// How many times a zone has been widened, and how many it can be.
export function tankTier(tank, z) {
  return Math.round((tank[z] || 0) / TANK_STEP[z]);
}
export function tankTiers(z) {
  return Math.round(TANK_MAX[z] / TANK_STEP[z]);
}
export function sameTank(a, b) {
  return BUILD_ZONES.every((z) => (a[z] || 0) === (b[z] || 0));
}

function decodeRuns(str, size) {
  const runs = str.split(',').map(Number);
  const out = new Int16Array(size);
  let i = 0;
  for (let r = 0; r + 1 < runs.length; r += 2) {
    out.fill(runs[r], i, Math.min(size, i + runs[r + 1]));
    i += runs[r + 1];
  }
  return out;
}
function encodeRuns(a) {
  const runs = [];
  let v = a[0];
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === v) n++;
    else {
      runs.push(v, n);
      v = a[i];
      n = 1;
    }
  }
  runs.push(v, n);
  return runs.join(',');
}
function smooth01(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

// Widen one zone of a saved tank by one step. Returns a new save (the old
// one is left alone); throws if that zone can't grow any more.
export function expandSave(data, zone) {
  if (!BUILD_ZONES.includes(zone)) throw new Error('No such zone: ' + zone);
  const d = JSON.parse(JSON.stringify(data));
  const w = d.world;
  const from = parseTank(w.tank);
  const step = TANK_STEP[zone];
  if (from[zone] + step > TANK_MAX[zone]) throw new Error(`The ${zone} is as big as it can be.`);
  const to = { ...from, [zone]: from[zone] + step };
  const gwo = (BASE_W + from.desert + from.pond + from.jungle) / CELL;
  const n = step / CELL;
  const gwn = gwo + n;
  // the new columns go in at `at` (old cells): the desert's at its far
  // (left) side, the pond's down its middle, the jungle's on its far (right)
  // side. Anything at or right of there moves along by `step`.
  const at = zone === 'desert' ? 0 : zone === 'pond' ? (POND_SPLIT + from.desert) / CELL : gwo;
  const atX = at * CELL;
  const moveX = (x) => (x >= atX ? x + step : x);
  const moveC = (cx) => (cx * CELL >= atX ? cx + n : cx);

  // ---- the ground, its sculpted surface line, and the water
  const tr = w.terrain;
  const mat = decodeRuns(tr.runs, gwo * GH);
  const top = tr.groundTop.split(',').map(Number);
  const water = tr.water ? decodeRuns(tr.water, gwo * GH) : null;
  const src = zone === 'desert' ? 0 : zone === 'pond' ? at : gwo - 1;
  const fillMat = zone === 'jungle' ? MAT.SOIL : MAT.SAND;
  const g0 = top[src] || 0;
  // new ground: the pond's middle copied across; new land rolls gently and
  // meets the old ground exactly where they join
  const rowOf = (k) => {
    if (zone === 'pond') return g0;
    const fromJoin = zone === 'desert' ? n - k : k + 1;
    const dune = (zone === 'desert' ? 5 : 2.5) * Math.sin(k * 0.09 + 0.7) + (zone === 'desert' ? 3 : 1.5) * Math.sin(k * 0.031 + 2);
    return Math.max(8, Math.min(GH - 24, g0 + Math.round(dune * smooth01(fromJoin / 14))));
  };
  const mat2 = new Uint8Array(gwn * GH);
  const water2 = water ? new Int16Array(gwn * GH) : null;
  const top2 = new Array(gwn);
  for (let cx = 0; cx < gwn; cx++) {
    const old = cx < at ? cx : cx >= at + n ? cx - n : -1;
    if (old >= 0) {
      top2[cx] = top[old];
      for (let cy = 0; cy < GH; cy++) {
        mat2[cy * gwn + cx] = mat[cy * gwo + old];
        if (water) water2[cy * gwn + cx] = water[cy * gwo + old];
      }
      continue;
    }
    const k = cx - at;
    const r = rowOf(k);
    top2[cx] = r;
    for (let cy = 0; cy < GH; cy++) {
      const m = mat[cy * gwo + src];
      if (zone === 'pond') {
        mat2[cy * gwn + cx] = m;
        if (water) water2[cy * gwn + cx] = water[cy * gwo + src];
      } else if (cy >= r) {
        // the old column's deeper layers carry on; its tunnels don't
        mat2[cy * gwn + cx] = cy >= g0 && m !== MAT.AIR ? m : fillMat;
      }
    }
  }
  tr.runs = encodeRuns(mat2);
  tr.groundTop = top2.join(',');
  if (water) tr.water = encodeRuns(water2);

  // ---- everything in the tank moves along with the ground under it
  for (const list of [w.creatures, w.plants, w.foods, w.decor, w.goods, w.visitors]) for (const e of list || []) if (typeof e.x === 'number') e.x = moveX(e.x);
  const shiftColony = (o) => {
    if (Array.isArray(o)) return o.forEach(shiftColony);
    if (!o || typeof o !== 'object') return;
    for (const key of Object.keys(o)) {
      const v = o[key];
      if (typeof v === 'number') {
        if (key === 'x') o[key] = moveX(v);
        else if (key === 'cx' || key === 'ox') o[key] = moveC(v);
      } else if (v && typeof v === 'object') shiftColony(v);
    }
  };
  for (const col of w.colonies || []) shiftColony([col.entrance, col.chamber, col.larder, col.chambers, col.fronts, col.foodSpots, col.brood]);
  if (w.vines && Array.isArray(w.vines.list)) for (const v of w.vines.list) v.x = moveX(v.x);
  if (w.feed && typeof w.feed.x === 'number') w.feed.x = moveX(w.feed.x);
  if (d.cam && typeof d.cam.x === 'number') d.cam.x = moveX(d.cam.x);

  w.tank = to;
  // (so the game can show off the new ground once it's back)
  d.built = { zone, x0: at * CELL, x1: (at + n) * CELL };
  d.savedAt = Date.now();
  return d;
}
