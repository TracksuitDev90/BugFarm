import { W, H, CELL, GW, GH, MAT, OOB, ZONE_X, ZONE_MID } from '../config.js';
import { RNG, fbm1 } from '../util/rng.js';
import { clamp } from '../util/math.js';
import { WaterSim } from './water.js';

export const CHUNK = 32; // cells per chunk side
export const CHW = Math.ceil(GW / CHUNK);
export const CHH = Math.ceil(GH / CHUNK);

export const POND_L = Math.floor(ZONE_X.pond[0] / CELL);
export const POND_R = Math.floor(ZONE_X.pond[1] / CELL) - 1;
export const ISLAND_CX = 156;
// The desert's basking rock sits under its heat lamp, in the middle of the
// sand, and a new farm's ant nest starts somewhere off to the side of it.
export const BASK_CX = Math.round(ZONE_MID.desert / CELL);
export const NEST_CX = [20, 46];

const N8X = [-1, 0, 1, -1, 1, -1, 0, 1];
const N8Y = [-1, -1, -1, 0, 0, 1, 1, 1];

// Side-view cross-section of the tank, stored as a grid of material cells.
export class Terrain {
  constructor() {
    this.mat = new Uint8Array(GW * GH);
    this.water = new Uint8Array(GW * GH); // 1 where a cell is mostly water (derived from the flowing sim)
    this.groundTop = new Int16Array(GW); // sculpted ground line: air below this is "tunnel"
    this.top = new Int16Array(GW); // first solid row in each column
    this.waterTop = new Int16Array(GW).fill(-1); // topmost open water surface row per column
    this.surfY = new Float32Array(GW).fill(-1); // ...and its height in world units
    this.surfSegs = []; // every open water surface, as polylines (for drawing)
    this.waterLevel = 425; // the pond's surface
    this.version = 0;
    this.waterVersion = 0;
    this.dirtyChunks = new Set();
    this.waterChunks = new Set(); // chunks whose water outline changed
    this.waterDirty = false;
    this.tunnelCells = 0;
    this._q = new Int32Array(GW * GH);
    this.wsim = new WaterSim(this);
    this.wsim.seepL = POND_L - 3;
    this.wsim.seepR = POND_R + 3;
    this.deriveT = 0;
    this.dbox = [0, 0, GW - 1, GH - 1];
    this.pourMark = null; // (stroke stamps for pour(), made when first needed)
    this.pourGen = 1;
    this.pourSpan = [GW, -1];
  }

  idx(cx, cy) {
    return cy * GW + cx;
  }
  inside(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < GW && cy < GH;
  }
  get(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return OOB;
    return this.mat[cy * GW + cx];
  }
  solid(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return true;
    return this.mat[cy * GW + cx] !== 0;
  }
  // Solid terrain (excluding the glass walls of the tank).
  ground(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    return this.mat[cy * GW + cx] !== 0;
  }
  isWater(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    return this.water[cy * GW + cx] === 1;
  }
  solidAt(x, y) {
    return this.solid(Math.floor(x / CELL), Math.floor(y / CELL));
  }
  waterAt(x, y) {
    return this.isWater(Math.floor(x / CELL), Math.floor(y / CELL));
  }
  matAt(x, y) {
    return this.get(Math.floor(x / CELL), Math.floor(y / CELL));
  }
  colOf(x) {
    return clamp(Math.floor(x / CELL), 0, GW - 1);
  }
  // World-y of the top solid surface at x, interpolated between columns for smooth walking.
  surfaceY(x) {
    const t = x / CELL - 0.5;
    let c0 = Math.floor(t);
    const f = t - c0;
    c0 = clamp(c0, 0, GW - 1);
    const c1 = clamp(c0 + 1, 0, GW - 1);
    return (this.top[c0] + (this.top[c1] - this.top[c0]) * f) * CELL;
  }
  groundY(x) {
    return this.groundTop[this.colOf(x)] * CELL;
  }
  isUnderground(x, y) {
    return y > this.groundTop[this.colOf(x)] * CELL + CELL;
  }
  // Water surface y at column if the column has open water, else -1.
  waterSurfaceAt(x) {
    return this.surfY[this.colOf(x)];
  }

  // Crawlers (ants) can stand in an air cell that touches real ground.
  walkable(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    const i = cy * GW + cx;
    if (this.mat[i] !== 0 || this.water[i] === 1) return false;
    for (let k = 0; k < 8; k++) {
      const nx = cx + N8X[k];
      const ny = cy + N8Y[k];
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      if (this.mat[ny * GW + nx] !== 0) return true;
    }
    return false;
  }

  markDirty(cx, cy) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        this.dirtyChunks.add(Math.floor(y / CHUNK) * CHW + Math.floor(x / CHUNK));
      }
    }
  }
  markColumnDirty(cx, y0, y1) {
    const a = Math.max(0, Math.floor(Math.min(y0, y1) / CHUNK) - 1);
    const b = Math.min(CHH - 1, Math.floor(Math.max(y0, y1) / CHUNK) + 1);
    const kx = Math.floor(cx / CHUNK);
    for (let ky = a; ky <= b; ky++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = kx + dx;
        if (x >= 0 && x < CHW) this.dirtyChunks.add(ky * CHW + x);
      }
    }
  }
  markAllDirty() {
    for (let i = 0; i < CHW * CHH; i++) this.dirtyChunks.add(i);
  }

  computeTop(cx) {
    const m = this.mat;
    for (let cy = 0; cy < GH; cy++) {
      if (m[cy * GW + cx] !== 0) {
        this.top[cx] = cy;
        return;
      }
    }
    this.top[cx] = GH;
  }

  set(cx, cy, m) {
    if (!this.inside(cx, cy)) return false;
    const i = cy * GW + cx;
    const old = this.mat[i];
    if (old === m) return false;
    this.mat[i] = m;
    this.version++;
    this.markDirty(cx, cy);
    const ws = this.wsim;
    if (m !== 0 && ws.mass[i] > 0) ws.displace(cx, cy);
    else if (ws.x1 >= ws.x0 && cx >= ws.x0 - 2 && cx <= ws.x1 + 2 && cy >= ws.y0 - 2 && cy <= ws.y1 + 2) ws.wake(cx, cy);
    // (the column's top only moves if this cell was or becomes it)
    const oldTop = this.top[cx];
    if (m !== 0 && cy < oldTop) this.top[cx] = cy;
    else if (m === 0 && cy === oldTop) this.computeTop(cx);
    if (this.top[cx] !== oldTop) this.markColumnDirty(cx, oldTop - 4, this.top[cx] + 4);
    if (m === 0 && cy > this.groundTop[cx]) this.tunnelCells++;
    else if (old === 0 && cy > this.groundTop[cx]) this.tunnelCells = Math.max(0, this.tunnelCells - 1);
    return true;
  }

  setGroundTop(cx, row) {
    row = clamp(row, 0, GH);
    if (this.groundTop[cx] === row) return;
    const old = this.groundTop[cx];
    this.groundTop[cx] = row;
    this.markColumnDirty(cx, old, row);
    this.version++;
  }

  // Remove a disc of diggable cells. Returns number of cells removed.
  dig(cx, cy, r, canDig) {
    let n = 0;
    const r2 = r * r + 0.5;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const m = this.get(x, y);
        if (m === 0 || m === OOB) continue;
        if (canDig && !canDig(x, y, m)) continue;
        if (this.set(x, y, 0)) n++;
      }
    }
    return n;
  }

  // Fill a disc of air with material m. Returns cells added.
  fill(cx, cy, r, m, canFill) {
    let n = 0;
    const r2 = r * r + 0.5;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        if (!this.inside(x, y)) continue;
        if (this.mat[y * GW + x] !== 0) continue;
        if (canFill && !canFill(x, y)) continue;
        if (this.set(x, y, m)) n++;
      }
    }
    return n;
  }

  // The keeper's brush pours material m rather than stamping it in place:
  // each cell of air the brush passes over gives one grain, once a stroke
  // (so a stroke lays down as much as it covers, however often the brush
  // goes back over a spot), and the grain falls until it lands, through air
  // and water alike. So the new ground settles onto the old instead of
  // hanging in mid-air, and never piles higher than the brush. A loose grain
  // rolls on down the side of a slope steeper than it can hold: slide is
  // how far below it the next column must be before it rolls (1 for sand
  // and gravel, 2 for soil, which holds a steeper bank, 3 for rock, which
  // stacks into a crag; 0 drops straight down). Returns cells added;
  // this.pourSpan holds the first and last columns they landed in.
  pour(cx, cy, r, m, slide, canFill) {
    const mark = (this.pourMark = this.pourMark || new Uint32Array(GW * GH));
    const gen = this.pourGen;
    let n = 0;
    let lo = GW;
    let hi = -1;
    const r2 = r * r + 0.5;
    const xa = Math.max(0, Math.floor(cx - r));
    const xb = Math.min(GW - 1, Math.ceil(cx + r));
    // bottom row first, so each layer lands on the one before; and from
    // alternate sides, so the heap doesn't lean one way
    let row = 0;
    for (let y = Math.ceil(cy + r); y >= Math.floor(cy - r); y--, row++) {
      if (y < 0 || y >= GH) continue;
      for (let k = 0; k <= xb - xa; k++) {
        const x = row & 1 ? xb - k : xa + k;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * GW + x;
        if (this.mat[i] !== 0 || mark[i] === gen) continue;
        if (canFill && !canFill(x, y)) continue;
        mark[i] = gen;
        let gx = x;
        let gy = y;
        for (let guard = 0; guard < GH * 2; guard++) {
          if (!this.solid(gx, gy + 1)) {
            gy++;
            continue;
          }
          if (!slide) break;
          const d = Math.random() < 0.5 ? -1 : 1;
          // (soil and rock now and then give a little, so banks aren't ruler-straight)
          const s = slide > 1 && Math.random() < 0.5 ? slide - 1 : slide;
          const roll = (nx) => {
            if (this.solid(nx, gy)) return false;
            for (let j = 1; j <= s; j++) if (this.solid(nx, gy + j)) return false;
            return true;
          };
          if (roll(gx + d)) gx += d;
          else if (roll(gx - d)) gx -= d;
          else break;
          gy++;
        }
        if (this.set(gx, gy, m)) {
          n++;
          if (gx < lo) lo = gx;
          if (gx > hi) hi = gx;
        }
      }
    }
    this.pourSpan = [lo, hi];
    return n;
  }

  // A new brush stroke: every cell can give a grain again.
  newStroke() {
    this.pourGen++;
  }

  // Sand pile physics for deposits: add one cell of sand near column cx,
  // letting it slide downhill so mounds keep a natural angle of repose.
  deposit(cx, m = MAT.SAND, spread = 6, avoidA = -9, avoidB = -9) {
    let best = clamp(cx, 1, GW - 2);
    const bad = (x) => x >= avoidA && x <= avoidB;
    for (let step = 0; step < spread; step++) {
      const t = this.top[best];
      const l = best > 1 && !bad(best - 1) ? this.top[best - 1] : -1;
      const r = best < GW - 2 && !bad(best + 1) ? this.top[best + 1] : -1;
      // Grains roll toward lower neighbours, giving a gentle cone.
      const lDrop = l - t;
      const rDrop = r - t;
      const need = Math.random() < 0.65 ? 1 : 2;
      if (lDrop >= need && (lDrop > rDrop || (lDrop === rDrop && Math.random() < 0.5))) best -= 1;
      else if (rDrop >= need) best += 1;
      else break;
    }
    if (bad(best)) return false;
    const row = this.top[best] - 1;
    if (row < 8) return false;
    if (this.isWater(best, row) || this.isWater(best, row + 1)) return false;
    this.set(best, row, m);
    if (row < this.groundTop[best]) this.setGroundTop(best, row);
    return true;
  }

  generate(seed) {
    const rng = new RNG(seed);
    this.mat.fill(0);
    this.tunnelCells = 0;
    const desertY = (cx) => 98 + Math.round((fbm1(cx * 0.045, seed) - 0.5) * 14);
    const jungleY = (cx) => 93 + Math.round((fbm1(cx * 0.05, seed + 7) - 0.5) * 12);
    const leftY = desertY(POND_L);
    const rightY = jungleY(POND_R);
    const sandEdge = new Float32Array(GH);
    for (let cy = 0; cy < GH; cy++) sandEdge[cy] = (POND_L + POND_R) / 2 + (fbm1(cy * 0.07, seed + 9) - 0.5) * 34 - (cy - 150) * 0.25;
    for (let cx = 0; cx < GW; cx++) {
      let gy;
      let kind;
      if (cx < POND_L) {
        gy = desertY(cx);
        kind = 0;
      } else if (cx > POND_R) {
        gy = jungleY(cx);
        kind = 2;
      } else {
        const t = (cx - POND_L) / (POND_R - POND_L);
        const base = leftY + (rightY - leftY) * t;
        const depth = Math.pow(Math.sin(Math.PI * t), 0.55) * 78;
        gy = Math.round(base + depth);
        kind = 1;
      }
      this.groundTop[cx] = gy;
      // under the pond: gravel bed, a clay liner, then the desert sand or
      // jungle soil carries on underneath with a wavy boundary (one crossing
      // per row, so no thin slivers)
      for (let cy = gy; cy < GH; cy++) {
        let m;
        if (kind === 0) m = MAT.SAND;
        else if (kind === 2) m = MAT.SOIL;
        else if (cy < gy + 4) m = MAT.GRAVEL;
        else if (cy < gy + 10) m = MAT.CLAY;
        else m = cx < sandEdge[cy] ? MAT.SAND : MAT.SOIL;
        this.mat[cy * GW + cx] = m;
      }
    }
    // Sandy beach where the desert meets the pond.
    for (let cx = POND_L; cx < POND_L + 10; cx++) {
      const gy = this.groundTop[cx];
      for (let cy = gy; cy < gy + 3; cy++) this.mat[cy * GW + cx] = MAT.SAND;
    }

    const rockBlob = (ccx, ccy, rx, ry, onlyBelow = -1) => {
      for (let y = Math.floor(ccy - ry); y <= Math.ceil(ccy + ry); y++) {
        for (let x = Math.floor(ccx - rx); x <= Math.ceil(ccx + rx); x++) {
          if (!this.inside(x, y)) continue;
          const dx = (x - ccx) / rx;
          const dy = (y - ccy) / ry;
          if (dx * dx + dy * dy > 1) continue;
          if (onlyBelow >= 0 && y < onlyBelow) continue;
          this.mat[y * GW + x] = MAT.ROCK;
        }
      }
    };
    // Basking rock in the desert, under the heat lamp.
    {
      const cx = BASK_CX;
      const gy = this.groundTop[cx];
      rockBlob(cx, gy + 1, 11, 6.5);
    }
    // A pile of boulders by the beach: turtles & frogs climb out here to bask.
    {
      const cx = ISLAND_CX;
      const topRow = Math.floor(this.waterLevel / CELL) - 5;
      const floorRow = this.groundTop[cx] + 3;
      for (let y = topRow; y <= floorRow && y < GH; y++) {
        const k = (y - topRow) / Math.max(1, floorRow - topRow);
        // widen steadily downward so there are no overhangs
        const half = 4.5 + Math.pow(k, 0.8) * 9;
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          if (!this.inside(x, y)) continue;
          for (let yy = y; yy < GH && this.mat[yy * GW + x] === 0; yy++) this.mat[yy * GW + x] = MAT.ROCK;
        }
      }
      for (let x = cx - 6; x <= cx + 6; x++) {
        for (let y = topRow - 3; y < topRow + 3; y++) {
          const dx = (x - cx) / 5.5;
          const dy = (y - topRow - 2) / 3.2;
          if (this.inside(x, y)) {
            if (dx * dx + dy * dy <= 1) this.mat[y * GW + x] = MAT.ROCK;
            else if (y < topRow + 1 && this.mat[y * GW + x] === MAT.ROCK) this.mat[y * GW + x] = 0;
          }
        }
      }
    }
    // Pebbles buried deep in the sand, away from the starter nest.
    for (let i = 0; i < 7; i++) {
      const cx = rng.int(6, POND_L - 12);
      if (cx > NEST_CX[0] - 10 && cx < NEST_CX[1] + 10) continue;
      const cy = rng.int(this.groundTop[cx] + 30, GH - 6);
      rockBlob(cx, cy, rng.range(1.6, 3.4), rng.range(1.4, 2.6));
    }
    // A few stones in the jungle soil and a little outcrop on the surface.
    for (let i = 0; i < 5; i++) {
      const cx = rng.int(POND_R + 12, GW - 6);
      const cy = rng.int(this.groundTop[cx] + 14, GH - 6);
      rockBlob(cx, cy, rng.range(1.8, 3.6), rng.range(1.5, 2.8));
    }
    {
      const cx = 372;
      rockBlob(cx, this.groundTop[cx] + 1, 7, 4.5);
    }

    for (let cx = 0; cx < GW; cx++) this.computeTop(cx);
    // Ground line follows the generated surface (rocks included).
    for (let cx = 0; cx < GW; cx++) this.groundTop[cx] = this.top[cx];

    this.markAllDirty();
    this.recomputeWater();
    this.version++;
  }

  // Dig the starter ant nest: an entrance, a winding tunnel and the queen's
  // room. It's different every time: the tunnel's bends, depth and lean,
  // and the size of the room.
  carveStarterNest(entranceCx, rand = Math.random) {
    const safe = (x, y, m) => m === MAT.SAND;
    // Little mound first so the entrance sits on a hill.
    for (let i = 0; i < 26; i++) this.deposit(entranceCx + ((i % 2) * 2 - 1) * ((i * 7) % 4), MAT.SAND, 4);
    const gy = this.top[entranceCx];
    const lean = rand() < 0.5 ? -1 : 1;
    const want = Math.PI / 2 - lean * (0.2 + rand() * 0.5);
    let x = entranceCx;
    let y = gy;
    let ang = Math.PI / 2 + (rand() * 2 - 1) * 0.3;
    let turn = 0;
    const steps = 13 + Math.floor(rand() * 11);
    for (let i = 0; i < steps; i++) {
      turn = turn * 0.82 + (rand() * 2 - 1) * 0.16;
      ang += turn + (want - ang) * 0.1;
      ang = clamp(ang, 0.35, Math.PI - 0.35);
      const nx = clamp(x + Math.cos(ang) * 1.6, 12, POND_L - 30);
      const ny = y + Math.sin(ang) * 1.6;
      this.dig((x + nx) / 2, (y + ny) / 2, 1.2, safe);
      this.dig(nx, ny, 1.25, safe);
      x = nx;
      y = ny;
    }
    // the queen's room: flat floor, domed roof
    const rx = 5 + Math.floor(rand() * 3);
    const ry = 2 + (rand() < 0.6 ? 1 : 0);
    const ccx = Math.round(clamp(x + lean * (rx - 2), rx + 4, POND_L - 30));
    const floor = Math.round(y) + 1;
    for (let yy = -ry; yy <= 0; yy++) {
      for (let xx = -rx; xx <= rx; xx++) {
        if ((xx * xx) / (rx * rx) + (yy * yy) / ((ry + 0.5) * (ry + 0.5)) <= 1) this.dig(ccx + xx, floor + yy, 0.5, safe);
      }
    }
    // join the tunnel's end to the room in case the room sits to one side
    for (let k = 0; k <= 4; k++) this.dig(x + ((ccx - x) * k) / 4, y + ((floor - 1 - y) * k) / 4, 1.1, safe);
    return { entrance: { cx: entranceCx, cy: gy - 1 }, chamber: { cx: ccx, cy: floor, rx, ry } };
  }

  // Flood-fill the pond basin up to a level into `out` (1 = water). Returns
  // how many cells it covers and whether it stays inside the pond.
  floodAt(level, out) {
    const w = out;
    const m = this.mat;
    const q = this._q;
    w.fill(0);
    const wl = Math.ceil(level / CELL);
    let head = 0;
    let tail = 0;
    for (let cx = POND_L; cx <= POND_R; cx++) {
      for (let cy = wl; cy < GH; cy++) {
        const i = cy * GW + cx;
        if (m[i] !== 0) break;
        if (!w[i]) {
          w[i] = 1;
          q[tail++] = i;
        }
      }
    }
    while (head < tail) {
      const i = q[head++];
      const cx = i % GW;
      const cy = (i / GW) | 0;
      if (cx > 0) {
        const j = i - 1;
        if (!w[j] && m[j] === 0) {
          w[j] = 1;
          q[tail++] = j;
        }
      }
      if (cx < GW - 1) {
        const j = i + 1;
        if (!w[j] && m[j] === 0) {
          w[j] = 1;
          q[tail++] = j;
        }
      }
      if (cy > wl) {
        const j = i - GW;
        if (!w[j] && m[j] === 0) {
          w[j] = 1;
          q[tail++] = j;
        }
      }
      if (cy < GH - 1) {
        const j = i + GW;
        if (!w[j] && m[j] === 0) {
          w[j] = 1;
          q[tail++] = j;
        }
      }
    }
    let ok = true;
    if (wl < GH) {
      for (let cx = 0; cx < GW; cx++) {
        if (w[wl * GW + cx] && (cx < POND_L - 14 || cx > POND_R + 14)) {
          ok = false;
          break;
        }
      }
    }
    return { n: tail, ok };
  }

  // Instantly fill the pond basin to `waterLevel` (new tanks, old saves,
  // and the test tools). Any other water is cleared. Returns false if the
  // water would spill outside the pond.
  recomputeWater() {
    const scratch = this._flood || (this._flood = new Uint8Array(GW * GH));
    const r = this.floodAt(this.waterLevel, scratch);
    const mass = this.wsim.mass;
    for (let i = 0; i < mass.length; i++) mass[i] = scratch[i];
    this.wsim.refit();
    this.wsim.awake = false;
    this.deriveWater(true);
    this.waterDirty = false;
    return r.ok;
  }

  setWaterLevel(y) {
    y = clamp(Math.round(y), 260, H - 40);
    const old = this.waterLevel;
    this.waterLevel = y;
    if (!this.recomputeWater()) {
      this.waterLevel = old;
      this.recomputeWater();
      return false;
    }
    return true;
  }

  // Instant fill that backs off until nothing spills (used for old saves).
  settleWater() {
    let guard = 0;
    while (!this.recomputeWater() && guard++ < 200) this.waterLevel += CELL;
  }

  // How many cells of water the pond holds when filled to `level`, and
  // whether that would spill over the banks.
  pondVolumeAt(level) {
    const scratch = this._flood || (this._flood = new Uint8Array(GW * GH));
    return this.floodAt(level, scratch);
  }

  // Run the flowing water. Returns true if anything visible changed.
  stepWater(dt) {
    const ws = this.wsim;
    const was = ws.awake;
    if (!was && !this.waterDirty) return false;
    this.waterDirty = false;
    ws.step(dt);
    this.deriveT -= dt;
    // binary water, outlines and surfaces follow the flow a few times a second
    if (this.deriveT <= 0 || !ws.awake) {
      this.deriveT = 0.12;
      return this.deriveWater(false);
    }
    return false;
  }

  // Pour in or take out water (cells' worth) at the pond.
  addWater(v, cxa = POND_L, cxb = POND_R) {
    const n = this.wsim.add(v, cxa, cxb);
    this.deriveWater(false);
    return n;
  }
  removeWater(v, cxa = POND_L - 14, cxb = POND_R + 14) {
    const n = this.wsim.remove(v, Math.max(0, cxa), Math.min(GW - 1, cxb));
    this.deriveWater(false);
    return n;
  }

  // Turn water amounts into the yes/no water grid everything else reads,
  // plus each column's surface and the pond's level.
  deriveWater(full) {
    const ws = this.wsim;
    const mass = ws.mass;
    const wat = this.water;
    const db = this.dbox;
    let x0;
    let x1;
    let y0;
    let y1;
    if (full) {
      x0 = 0;
      y0 = 0;
      x1 = GW - 1;
      y1 = GH - 1;
    } else {
      // everywhere that held water last time, plus where it may be now
      x0 = Math.min(db[0], ws.x0);
      y0 = Math.min(db[1], ws.y0);
      x1 = Math.max(db[2], ws.x1);
      y1 = Math.max(db[3], ws.y1);
    }
    let changed = false;
    let bx0 = GW;
    let bx1 = -1;
    let by0 = GH;
    let by1 = -1;
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * GW;
      for (let cx = x0; cx <= x1; cx++) {
        const i = row + cx;
        const v = mass[i] >= 0.5 && this.mat[i] === 0 ? 1 : 0;
        if (v) {
          if (cx < bx0) bx0 = cx;
          if (cx > bx1) bx1 = cx;
          if (cy < by0) by0 = cy;
          if (cy > by1) by1 = cy;
        }
        if (wat[i] !== v) {
          wat[i] = v;
          changed = true;
          this.markWaterDirty(cx, cy);
        }
      }
    }
    if (bx1 >= 0) {
      db[0] = Math.max(0, bx0 - 1);
      db[1] = Math.max(0, by0 - 1);
      db[2] = Math.min(GW - 1, bx1 + 1);
      db[3] = Math.min(GH - 1, by1 + 1);
    } else {
      db[0] = GW;
      db[1] = GH;
      db[2] = -1;
      db[3] = -1;
    }
    this.findSurfaces(bx0, bx1, by0, by1);
    if (changed || full) this.waterVersion++;
    return changed;
  }

  markWaterDirty(cx, cy) {
    const a = Math.floor((cx - 3) / CHUNK);
    const b = Math.floor((cx + 3) / CHUNK);
    const c = Math.floor((cy - 3) / CHUNK);
    const d = Math.floor((cy + 3) / CHUNK);
    for (let ky = Math.max(0, c); ky <= Math.min(CHH - 1, d); ky++) {
      for (let kx = Math.max(0, a); kx <= Math.min(CHW - 1, b); kx++) this.waterChunks.add(ky * CHW + kx);
    }
  }

  // Open water surfaces: water cells with air above them.
  findSurfaces(x0, x1, y0, y1) {
    const wat = this.water;
    const mat = this.mat;
    const mass = this.wsim.mass;
    this.waterTop.fill(-1);
    this.surfY.fill(-1);
    const segs = [];
    let active = [];
    if (x1 >= x0) {
      for (let cx = x0; cx <= x1; cx++) {
        const next = [];
        for (let cy = Math.max(1, y0); cy <= y1; cy++) {
          const i = cy * GW + cx;
          if (!wat[i] || wat[i - GW] || mat[i - GW] !== 0) continue;
          const y = (cy + 1 - Math.min(1, mass[i]) - Math.min(0.5, mass[i - GW])) * CELL;
          if (this.waterTop[cx] < 0) {
            this.waterTop[cx] = cy;
            this.surfY[cx] = y;
          }
          let seg = null;
          for (let k = 0; k < active.length; k++) {
            const s = active[k];
            if (s && Math.abs(s.ys[s.ys.length - 1] - y) <= CELL * 1.6) {
              seg = s;
              active[k] = null;
              break;
            }
          }
          if (!seg) {
            seg = { cx: cx, ys: [] };
            segs.push(seg);
          }
          seg.ys.push(y);
          next.push(seg);
        }
        active = next;
      }
    }
    this.surfSegs = segs;
    // the pond's level: the middle surface height across the pond
    const ys = [];
    for (let cx = POND_L; cx <= POND_R; cx++) if (this.surfY[cx] >= 0) ys.push(this.surfY[cx]);
    if (ys.length) {
      ys.sort((a, b) => a - b);
      this.waterLevel = Math.round(ys[ys.length >> 1] * 10) / 10;
    }
  }

  // Surface height of the water in this column (or the pond's, if none).
  waterSurfY(x) {
    const s = this.surfY[this.colOf(x)];
    return s >= 0 ? s : this.waterLevel;
  }

  pondFloorY(x) {
    return this.surfaceY(x);
  }

  // Run-length encode the material grid.
  serialize() {
    const runs = [];
    const m = this.mat;
    let v = m[0];
    let n = 0;
    for (let i = 0; i < m.length; i++) {
      if (m[i] === v) n++;
      else {
        runs.push(v, n);
        v = m[i];
        n = 1;
      }
    }
    runs.push(v, n);
    return {
      runs: runs.join(','),
      groundTop: Array.from(this.groundTop).join(','),
      waterLevel: this.waterLevel,
      water: this.wsim.serialize(),
    };
  }

  load(data) {
    const runs = data.runs.split(',').map(Number);
    let i = 0;
    for (let r = 0; r < runs.length; r += 2) {
      const v = runs[r];
      const n = runs[r + 1];
      this.mat.fill(v, i, i + n);
      i += n;
    }
    const gt = data.groundTop.split(',').map(Number);
    for (let cx = 0; cx < GW; cx++) this.groundTop[cx] = gt[cx] || 0;
    for (let cx = 0; cx < GW; cx++) this.computeTop(cx);
    this.waterLevel = data.waterLevel;
    this.tunnelCells = 0;
    for (let cx = 0; cx < GW; cx++) {
      for (let cy = this.groundTop[cx] + 1; cy < GH; cy++) if (this.mat[cy * GW + cx] === 0) this.tunnelCells++;
    }
    if (data.water) {
      this.wsim.load(data.water);
      this.deriveWater(true);
    } else this.settleWater();
    this.markAllDirty();
    this.version++;
  }
}

export { W, H };
