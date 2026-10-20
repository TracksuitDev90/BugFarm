import { W, H, CELL, GW, GH, MAT, OOB, ZONE_X } from '../config.js';
import { RNG, fbm1 } from '../util/rng.js';
import { clamp } from '../util/math.js';

export const CHUNK = 32; // cells per chunk side
export const CHW = Math.ceil(GW / CHUNK);
export const CHH = Math.ceil(GH / CHUNK);

export const POND_L = Math.floor(ZONE_X.pond[0] / CELL);
export const POND_R = Math.floor(ZONE_X.pond[1] / CELL) - 1;
export const ISLAND_CX = 156;

const N8X = [-1, 0, 1, -1, 1, -1, 0, 1];
const N8Y = [-1, -1, -1, 0, 0, 1, 1, 1];

// Side-view cross-section of the tank, stored as a grid of material cells.
export class Terrain {
  constructor() {
    this.mat = new Uint8Array(GW * GH);
    this.water = new Uint8Array(GW * GH);
    this.groundTop = new Int16Array(GW); // sculpted ground line: air below this is "tunnel"
    this.top = new Int16Array(GW); // first solid row in each column
    this.waterTop = new Int16Array(GW).fill(-1); // first water row (open surface) per column
    this.waterLevel = 505;
    this.version = 0;
    this.waterVersion = 0;
    this.dirtyChunks = new Set();
    this.waterDirty = false;
    this.tunnelCells = 0;
    this._q = new Int32Array(GW * GH);
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
    const wt = this.waterTop[this.colOf(x)];
    return wt >= 0 ? this.waterLevel : -1;
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
    const oldTop = this.top[cx];
    this.computeTop(cx);
    if (this.top[cx] !== oldTop) this.markColumnDirty(cx, oldTop - 4, this.top[cx] + 4);
    if (cx >= POND_L - 20 && cx <= POND_R + 20) this.waterDirty = true;
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
    const desertY = (cx) => 118 + Math.round((fbm1(cx * 0.045, seed) - 0.5) * 14);
    const jungleY = (cx) => 112 + Math.round((fbm1(cx * 0.05, seed + 7) - 0.5) * 12);
    const leftY = desertY(POND_L);
    const rightY = jungleY(POND_R);
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
      // jungle soil carries on underneath with a wavy boundary
      const mid = (POND_L + POND_R) / 2 + (fbm1(cx * 0.1, seed + 9) - 0.5) * 30;
      for (let cy = gy; cy < GH; cy++) {
        let m;
        if (kind === 0) m = MAT.SAND;
        else if (kind === 2) m = MAT.SOIL;
        else if (cy < gy + 4) m = MAT.GRAVEL;
        else if (cy < gy + 10) m = MAT.CLAY;
        else m = cx + (cy - gy) * 0.15 < mid ? MAT.SAND : MAT.SOIL;
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
      const cx = 104;
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
      if (cx > 30 && cx < 80) continue;
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

  // Dig the starter ant nest: an entrance, a winding tunnel and a chamber.
  carveStarterNest(entranceCx) {
    const safe = (x, y, m) => m === MAT.SAND;
    // Little mound first so the entrance sits on a hill.
    for (let i = 0; i < 26; i++) this.deposit(entranceCx + ((i % 2) * 2 - 1) * ((i * 7) % 4), MAT.SAND, 4);
    const gy = this.top[entranceCx];
    const pts = [
      [entranceCx, gy],
      [entranceCx + 1, gy + 6],
      [entranceCx - 1, gy + 12],
      [entranceCx + 2, gy + 18],
      [entranceCx + 6, gy + 24],
      [entranceCx + 10, gy + 28],
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.dig(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 1.2, safe);
      }
    }
    // Queen's chamber
    const ccx = entranceCx + 13;
    const ccy = gy + 30;
    for (let y = -3; y <= 2; y++) {
      for (let x = -6; x <= 6; x++) {
        if ((x * x) / 36 + (y * y) / 9 <= 1) this.dig(ccx + x, ccy + y, 0.5, safe);
      }
    }
    return { entrance: { cx: entranceCx, cy: gy - 1 }, chamber: { cx: ccx, cy: ccy + 2 } };
  }

  // Flood-fill water from the pond basin. Returns false if water would spill
  // outside the pond (caller should then lower the water level).
  recomputeWater() {
    const w = this.water;
    const m = this.mat;
    const q = this._q;
    w.fill(0);
    const wl = Math.ceil(this.waterLevel / CELL);
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
    for (let cx = 0; cx < GW; cx++) {
      this.waterTop[cx] = -1;
      if (wl < GH && w[wl * GW + cx]) this.waterTop[cx] = wl;
      if (this.waterTop[cx] >= 0 && (cx < POND_L - 14 || cx > POND_R + 14)) ok = false;
    }
    this.waterDirty = false;
    this.waterVersion++;
    return ok;
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

  // After terrain edits the pond may overflow; lower water until it fits.
  settleWater() {
    let guard = 0;
    while (!this.recomputeWater() && guard++ < 200) this.waterLevel += CELL;
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
    this.settleWater();
    this.markAllDirty();
    this.version++;
  }
}

export { W, H };
