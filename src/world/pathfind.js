// A* over the terrain grid for crawlers (ants). Typed arrays are reused and
// "cleared" with a generation stamp so a search costs only what it touches.
import { GW, GH } from '../config.js';

const N = GW * GH;
const g = new Float32Array(N);
const came = new Int32Array(N);
const stamp = new Uint32Array(N);
const closed = new Uint32Array(N);
let gen = 1;

// Binary heap of [f, idx]
let heapF = new Float32Array(4096);
let heapI = new Int32Array(4096);
let hn = 0;
function push(f, i) {
  if (hn >= heapF.length) {
    const nf = new Float32Array(heapF.length * 2);
    nf.set(heapF);
    heapF = nf;
    const ni = new Int32Array(heapI.length * 2);
    ni.set(heapI);
    heapI = ni;
  }
  let k = hn++;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[p] <= f) break;
    heapF[k] = heapF[p];
    heapI[k] = heapI[p];
    k = p;
  }
  heapF[k] = f;
  heapI[k] = i;
}
function pop() {
  const top = heapI[0];
  const lf = heapF[--hn];
  const li = heapI[hn];
  let k = 0;
  while (true) {
    let c = 2 * k + 1;
    if (c >= hn) break;
    if (c + 1 < hn && heapF[c + 1] < heapF[c]) c++;
    if (heapF[c] >= lf) break;
    heapF[k] = heapF[c];
    heapI[k] = heapI[c];
    k = c;
  }
  heapF[k] = lf;
  heapI[k] = li;
  return top;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

export let lastExpanded = 0;

// Returns array of cell indices from start to goal (inclusive), or null.
export function findPath(terrain, sx, sy, tx, ty, maxExpand = 7000) {
  if (!terrain.walkable(tx, ty)) {
    const alt = nearestWalkable(terrain, tx, ty, 4);
    if (!alt) return null;
    tx = alt[0];
    ty = alt[1];
  }
  if (!terrain.walkable(sx, sy)) {
    const alt = nearestWalkable(terrain, sx, sy, 3);
    if (!alt) return null;
    sx = alt[0];
    sy = alt[1];
  }
  gen++;
  if (gen > 4e9) {
    gen = 1;
    stamp.fill(0);
    closed.fill(0);
  }
  hn = 0;
  const s = sy * GW + sx;
  const t = ty * GW + tx;
  g[s] = 0;
  stamp[s] = gen;
  came[s] = -1;
  push(heur(sx, sy, tx, ty), s);
  let expanded = 0;
  while (hn > 0) {
    const cur = pop();
    if (cur === t) {
      lastExpanded = expanded;
      const path = [];
      let k = cur;
      while (k !== -1) {
        path.push(k);
        k = came[k];
      }
      path.reverse();
      return path;
    }
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (++expanded > maxExpand) break;
    const cx = cur % GW;
    const cy = (cur / GW) | 0;
    const gc = g[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!terrain.walkable(nx, ny)) continue;
      if (d >= 4 && (!terrain.walkable(cx + DX[d], cy) && !terrain.walkable(cx, cy + DY[d]))) continue;
      const ni = ny * GW + nx;
      if (closed[ni] === gen) continue;
      // ants keep their feet on the floor where they can, rather than
      // creeping along walls and ceilings
      const ng = gc + COST[d] * (terrain.solid(nx, ny + 1) ? 1 : 1.2);
      if (stamp[ni] !== gen || ng < g[ni]) {
        stamp[ni] = gen;
        g[ni] = ng;
        came[ni] = cur;
        push(ng + heur(nx, ny, tx, ty), ni);
      }
    }
  }
  lastExpanded = expanded;
  return null;
}

function heur(x, y, tx, ty) {
  const dx = Math.abs(x - tx);
  const dy = Math.abs(y - ty);
  // (a little over the true distance: paths come out nearly as good and the
  // search looks at far fewer cells, which matters with lots of ants)
  return (dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx) * 1.15;
}

export function nearestWalkable(terrain, cx, cy, r) {
  for (let rr = 0; rr <= r; rr++) {
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        if (terrain.walkable(cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
    }
  }
  return null;
}

// Turn a path of cells into a smooth line of points (world units) that
// still only passes through walkable cells: grid staircases become straight
// runs and corners become curves, so crawlers glide instead of zigzagging.
const W7 = [1, 2, 3, 4, 3, 2, 1];
export function smoothPath(terrain, path, CELL) {
  const n = path.length;
  const out = new Float32Array(n * 2);
  const half = CELL / 2;
  for (let k = 0; k < n; k++) {
    const cx = path[k] % GW;
    const cy = (path[k] / GW) | 0;
    let sx = 0;
    let sy = 0;
    let sw = 0;
    if (k > 0 && k < n - 1) {
      for (let o = -3; o <= 3; o++) {
        const j = k + o;
        if (j < 0 || j >= n) continue;
        const wgt = W7[o + 3];
        sx += (path[j] % GW) * wgt;
        sy += ((path[j] / GW) | 0) * wgt;
        sw += wgt;
      }
    }
    if (sw) {
      const x = (sx / sw) * CELL + half;
      const y = (sy / sw) * CELL + half;
      // only use the smoothed point if it's still somewhere an ant can be
      if (terrain.walkable(Math.floor(x / CELL), Math.floor(y / CELL))) {
        out[k * 2] = x;
        out[k * 2 + 1] = y;
        continue;
      }
    }
    out[k * 2] = cx * CELL + half;
    out[k * 2 + 1] = cy * CELL + half;
  }
  return out;
}

// ------------------------------------------------------------------ swimming
// Is there open water all the way along this line? (Swimmers head straight
// for anywhere they can see; only round a corner do they need a route.)
export function lineOfWater(terrain, x0, y0, x1, y1, CELL) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / (CELL * 0.75));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    if (!terrain.isWater(Math.floor((x0 + (x1 - x0) * u) / CELL), Math.floor((y0 + (y1 - y0) * u) / CELL))) return false;
  }
  return true;
}

// A* through water cells, for a fish finding its way along a channel or
// into a flooded tunnel. Returns cell indices, start to goal, or null.
export function findWaterPath(terrain, sx, sy, tx, ty, maxExpand = 6000) {
  if (!terrain.isWater(sx, sy) || !terrain.isWater(tx, ty)) return null;
  gen++;
  if (gen > 4e9) {
    gen = 1;
    stamp.fill(0);
    closed.fill(0);
  }
  hn = 0;
  const s = sy * GW + sx;
  const t = ty * GW + tx;
  g[s] = 0;
  stamp[s] = gen;
  came[s] = -1;
  push(heur(sx, sy, tx, ty), s);
  let expanded = 0;
  while (hn > 0) {
    const cur = pop();
    if (cur === t) {
      const path = [];
      let k = cur;
      while (k !== -1) {
        path.push(k);
        k = came[k];
      }
      path.reverse();
      return path;
    }
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (++expanded > maxExpand) break;
    const cx = cur % GW;
    const cy = (cur / GW) | 0;
    const gc = g[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (!terrain.isWater(nx, ny)) continue;
      if (d >= 4 && !(terrain.isWater(cx + DX[d], cy) && terrain.isWater(cx, cy + DY[d]))) continue;
      const ni = ny * GW + nx;
      if (closed[ni] === gen) continue;
      // keep off the walls where there's room
      const ng = gc + COST[d] * (terrain.isWater(nx, ny + 1) && terrain.isWater(nx, ny - 1) ? 1 : 1.3);
      if (stamp[ni] !== gen || ng < g[ni]) {
        stamp[ni] = gen;
        g[ni] = ng;
        came[ni] = cur;
        push(ng + heur(nx, ny, tx, ty), ni);
      }
    }
  }
  return null;
}
