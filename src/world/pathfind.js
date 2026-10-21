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
      const ng = gc + COST[d] * (terrain.solid(nx, ny + 1) ? 1 : 1.3);
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
  return (dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx) * 1.05;
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
export function smoothPath(terrain, path, CELL) {
  const n = path.length;
  const raw = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    raw[k * 2] = (path[k] % GW) * CELL + CELL / 2;
    raw[k * 2 + 1] = Math.floor(path[k] / GW) * CELL + CELL / 2;
  }
  if (n < 3) return raw;
  let a = raw;
  let b = new Float32Array(n * 2);
  const W5 = [1, 2, 3, 2, 1];
  for (let pass = 0; pass < 2; pass++) {
    b[0] = a[0];
    b[1] = a[1];
    b[(n - 1) * 2] = a[(n - 1) * 2];
    b[(n - 1) * 2 + 1] = a[(n - 1) * 2 + 1];
    for (let k = 1; k < n - 1; k++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let o = -2; o <= 2; o++) {
        const j = k + o;
        if (j < 0 || j >= n) continue;
        const wgt = W5[o + 2];
        sx += a[j * 2] * wgt;
        sy += a[j * 2 + 1] * wgt;
        sw += wgt;
      }
      const x = sx / sw;
      const y = sy / sw;
      // only accept the smoothed point if it's still somewhere an ant can be
      if (terrain.walkable(Math.floor(x / CELL), Math.floor(y / CELL))) {
        b[k * 2] = x;
        b[k * 2 + 1] = y;
      } else {
        b[k * 2] = a[k * 2];
        b[k * 2 + 1] = a[k * 2 + 1];
      }
    }
    const tmp = a;
    a = b;
    b = tmp === raw ? new Float32Array(n * 2) : tmp;
  }
  return a;
}
