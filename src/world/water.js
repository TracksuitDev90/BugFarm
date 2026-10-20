// Flowing water. Every cell holds an amount of water (0 = dry, 1 = full).
// Two cheap rules make it behave like water:
//   1. Flow: water falls into the cell below if there's room, otherwise it
//      spreads sideways toward drier neighbours (a classic falling-sand rule).
//   2. Pressure: within one connected body of water, if some opening sits
//      at least two rows below the top of the body, water is moved from the
//      top to that opening. That's what makes a pond drain through a hole,
//      fill a tunnel from the bottom up, and level out on both sides of a
//      U-bend, without simulating real pressure.
// The sim only runs while something is moving: once the water has been
// still for a moment it goes to sleep and costs nothing until the terrain
// next to it changes or water is added or taken away.
import { GW, GH, CELL } from '../config.js';

const EPS = 0.002; // less than this is a dry cell
const SPREAD_MIN = 0.03; // thinner films stop spreading (and slowly dry up)
const LEVEL_DIFF = 0.012; // smaller differences between neighbours are left alone
const QUIET = 0.02; // moving less than this in a pass counts as still
const FULL = 0.985;
const PRESSURE_EVERY = 2; // flow iterations between pressure passes
const SLEEP_AFTER = 45; // quiet iterations before the water goes to sleep
const SEEP = 0.006; // per second, for stray water soaking into sand and soil
const SEEP_BODY = 160; // puddles smaller than this (in cells) soak away
const SEEP_DT = PRESSURE_EVERY / 60;

export class WaterSim {
  constructor(terrain) {
    this.t = terrain;
    this.mass = new Float32Array(GW * GH);
    this.awake = false;
    this.quiet = 0;
    this.iter = 0;
    this.acc = 0;
    this.moved = 0;
    // bounding box (cells) of everywhere that may hold water
    this.x0 = 0;
    this.x1 = -1;
    this.y0 = 0;
    this.y1 = -1;
    this.lab = new Uint32Array(GW * GH);
    this.gen = 1;
    this.q = new Int32Array(GW * GH);
    this.list = new Int32Array(GW * GH);
    this.deriveT = 0;
    this.seepL = 0;
    this.seepR = GW;
  }

  wake(cx, cy) {
    this.awake = true;
    this.quiet = 0;
    if (cx != null) this.grow(cx - 2, cy - 2, cx + 2, cy + 2);
  }

  grow(ax, ay, bx, by) {
    if (this.x1 < this.x0) {
      this.x0 = ax;
      this.y0 = ay;
      this.x1 = bx;
      this.y1 = by;
    } else {
      if (ax < this.x0) this.x0 = ax;
      if (ay < this.y0) this.y0 = ay;
      if (bx > this.x1) this.x1 = bx;
      if (by > this.y1) this.y1 = by;
    }
    if (this.x0 < 0) this.x0 = 0;
    if (this.y0 < 0) this.y0 = 0;
    if (this.x1 > GW - 1) this.x1 = GW - 1;
    if (this.y1 > GH - 1) this.y1 = GH - 1;
  }

  // Recompute the bounding box from scratch (after loads and resets).
  refit() {
    const m = this.mass;
    let x0 = GW;
    let x1 = -1;
    let y0 = GH;
    let y1 = -1;
    for (let cy = 0; cy < GH; cy++) {
      const row = cy * GW;
      for (let cx = 0; cx < GW; cx++) {
        if (m[row + cx] > EPS) {
          if (cx < x0) x0 = cx;
          if (cx > x1) x1 = cx;
          if (cy < y0) y0 = cy;
          if (cy > y1) y1 = cy;
        }
      }
    }
    this.x0 = 0;
    this.x1 = -1;
    if (x1 >= 0) this.grow(x0 - 2, y0 - 2, x1 + 2, y1 + 2);
  }

  // A cell just turned solid: push its water to the nearest room through
  // the water around it (usually up to the surface), so dumping sand in the
  // pond raises the water instead of deleting it.
  displace(cx, cy) {
    const m = this.mass;
    const t = this.t;
    const i0 = cy * GW + cx;
    let left = m[i0];
    m[i0] = 0;
    if (left <= EPS) return;
    const q = this.q;
    const lab = this.lab;
    if (++this.gen > 4e9) {
      this.gen = 1;
      lab.fill(0);
    }
    const gen = this.gen;
    let head = 0;
    let tail = 0;
    q[tail++] = i0;
    lab[i0] = gen;
    // breadth-first, trying up before sideways before down
    const step = [-GW, -1, 1, GW];
    while (head < tail && left > EPS && tail < 20000) {
      const i = q[head++];
      const y = (i / GW) | 0;
      const x = i - y * GW;
      for (let k = 0; k < 4; k++) {
        const j = i + step[k];
        if ((k === 1 && x === 0) || (k === 2 && x === GW - 1) || (k === 0 && y === 0) || (k === 3 && y === GH - 1)) continue;
        if (lab[j] === gen || t.mat[j] !== 0) continue;
        lab[j] = gen;
        const room = 1 - m[j];
        if (room > EPS) {
          const put = Math.min(left, room);
          m[j] += put;
          left -= put;
          if (left <= EPS) break;
        }
        // only travel on through water; dry cells are where it lands
        if (m[j] >= FULL) q[tail++] = j;
      }
    }
    this.wake(cx, cy);
  }

  // Advance by dt seconds. Runs about 60 flow iterations a second of tank
  // time, capped per call so fast-forward and catch-up stay cheap.
  step(dt) {
    if (!this.awake) return false;
    this.acc += dt * 60;
    let n = Math.min(Math.floor(this.acc), dt > 0.1 ? 6 : 3);
    this.acc -= Math.floor(this.acc);
    if (n < 1) n = 1;
    let any = false;
    for (let k = 0; k < n && this.awake; k++) {
      this.moved = 0;
      this.flow();
      if (++this.iter % PRESSURE_EVERY === 0) this.pressure();
      if (this.moved > QUIET) {
        this.quiet = 0;
        any = true;
      } else if (++this.quiet > SLEEP_AFTER) this.awake = false;
    }
    return any;
  }

  flow() {
    const t = this.t;
    const mat = t.mat;
    const m = this.mass;
    const x0 = this.x0;
    const x1 = this.x1;
    if (x1 < x0) return;
    const y0 = this.y0;
    const y1 = Math.min(this.y1, GH - 1);
    const flip = this.iter & 1;
    let nx0 = GW;
    let nx1 = -1;
    let ny0 = GH;
    let ny1 = -1;
    let moved = 0;
    // bottom row first, so each bit of water moves at most one row per pass
    for (let cy = y1; cy >= y0; cy--) {
      const row = cy * GW;
      for (let k = x0; k <= x1; k++) {
        const cx = flip ? x1 - (k - x0) : k;
        const i = row + cx;
        let w = m[i];
        if (w <= EPS) {
          if (w !== 0) m[i] = 0;
          continue;
        }
        if (mat[i] !== 0) {
          m[i] = 0;
          continue;
        }
        if (cx < nx0) nx0 = cx;
        if (cx > nx1) nx1 = cx;
        if (cy < ny0) ny0 = cy;
        if (cy > ny1) ny1 = cy;
        // fall
        if (cy < GH - 1) {
          const j = i + GW;
          if (mat[j] === 0) {
            const room = 1 - m[j];
            if (room > EPS) {
              const f = w < room ? w : room;
              m[j] += f;
              w -= f;
              moved += f;
              if (cy + 1 > ny1) ny1 = cy + 1;
              if (w <= EPS) {
                m[i] = 0;
                continue;
              }
            }
          }
        }
        // spread sideways toward lower neighbours
        if (w > SPREAD_MIN) {
          const canL = cx > 0 && mat[i - 1] === 0;
          const canR = cx < GW - 1 && mat[i + 1] === 0;
          const mL = canL ? m[i - 1] : 9;
          const mR = canR ? m[i + 1] : 9;
          if (mL < w - LEVEL_DIFF || mR < w - LEVEL_DIFF) {
            const first = flip ? 1 : -1;
            for (let s = 0; s < 2; s++) {
              const d = s === 0 ? first : -first;
              const j = i + d;
              const mn = d < 0 ? mL : mR;
              if (mn >= w - LEVEL_DIFF) continue;
              let f = (w - mn) * 0.32;
              if (f > w) f = w;
              m[j] += f;
              w -= f;
              moved += f;
              if (d < 0 && cx - 1 < nx0) nx0 = cx - 1;
              if (d > 0 && cx + 1 > nx1) nx1 = cx + 1;
            }
          }
        }
        m[i] = w;
      }
    }
    this.moved += moved;
    if (nx1 >= 0) {
      this.x0 = 0;
      this.x1 = -1;
      this.grow(nx0 - 2, ny0 - 2, nx1 + 2, ny1 + 2);
    } else {
      this.x0 = 0;
      this.x1 = -1;
      this.awake = false;
    }
  }

  // Connected bodies of water: move water from the top of each body to its
  // lowest opening, and keep each body's top row level.
  pressure() {
    const t = this.t;
    const mat = t.mat;
    const m = this.mass;
    const lab = this.lab;
    const q = this.q;
    if (++this.gen > 4e9) {
      this.gen = 1;
      lab.fill(0);
    }
    const gen = this.gen;
    const stamp = gen;
    const x0 = this.x0;
    const x1 = this.x1;
    if (x1 < x0) return;
    for (let cy = this.y0; cy <= this.y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const s = cy * GW + cx;
        if (lab[s] === stamp || m[s] <= EPS) continue;
        // flood one body
        let head = 0;
        let tail = 0;
        q[tail++] = s;
        lab[s] = stamp;
        let top = GH;
        while (head < tail) {
          const i = q[head++];
          const y = (i / GW) | 0;
          if (y < top) top = y;
          const x = i - y * GW;
          if (x > 0 && lab[i - 1] !== stamp && m[i - 1] > EPS) {
            lab[i - 1] = stamp;
            q[tail++] = i - 1;
          }
          if (x < GW - 1 && lab[i + 1] !== stamp && m[i + 1] > EPS) {
            lab[i + 1] = stamp;
            q[tail++] = i + 1;
          }
          if (y > 0 && lab[i - GW] !== stamp && m[i - GW] > EPS) {
            lab[i - GW] = stamp;
            q[tail++] = i - GW;
          }
          if (y < GH - 1 && lab[i + GW] !== stamp && m[i + GW] > EPS) {
            lab[i + GW] = stamp;
            q[tail++] = i + GW;
          }
        }
        if (tail < SEEP_BODY) this.seepBody(tail, mat, m);
        if (tail < 3) continue;
        this.settleBody(tail, top, mat, m);
      }
    }
  }

  settleBody(n, top, mat, m) {
    const q = this.q;
    const L = this.list;
    // the lowest place this body could pour into: a part-filled cell of the
    // body or an empty cell right next to it
    let sinkRow = -1;
    for (let k = 0; k < n; k++) {
      const i = q[k];
      const y = (i / GW) | 0;
      if (y <= sinkRow) continue;
      if (m[i] < FULL) sinkRow = y;
      else {
        const x = i - y * GW;
        if (y < GH - 1 && mat[i + GW] === 0 && m[i + GW] <= EPS) sinkRow = y + 1;
        else if ((x > 0 && mat[i - 1] === 0 && m[i - 1] <= EPS) || (x < GW - 1 && mat[i + 1] === 0 && m[i + 1] <= EPS)) sinkRow = y;
      }
    }
    // level the top row of the body (it's all one connected pool)
    let topSum = 0;
    let topN = 0;
    for (let k = 0; k < n; k++) {
      const i = q[k];
      if (((i / GW) | 0) === top) {
        topSum += m[i];
        L[topN++] = i;
      }
    }
    if (topN > 1) {
      const avg = topSum / topN;
      for (let k = 0; k < topN; k++) {
        const i = L[k];
        this.moved += Math.abs(m[i] - avg) * 0.25;
        m[i] = avg;
      }
    }
    if (sinkRow - top < 2) return;
    // gather the sinks on the lowest row
    let ns = 0;
    let room = 0;
    for (let k = 0; k < n; k++) {
      const i = q[k];
      const y = (i / GW) | 0;
      if (y === sinkRow && m[i] < FULL) {
        L[ns++] = i;
        room += 1 - m[i];
      } else if (y === sinkRow - 1 && m[i] >= FULL && mat[i + GW] === 0 && m[i + GW] <= EPS) {
        L[ns++] = i + GW;
        room += 1;
      } else if (y === sinkRow) {
        const x = i - y * GW;
        if (x > 0 && mat[i - 1] === 0 && m[i - 1] <= EPS) {
          L[ns++] = i - 1;
          room += 1;
        }
        if (x < GW - 1 && mat[i + 1] === 0 && m[i + 1] <= EPS) {
          L[ns++] = i + 1;
          room += 1;
        }
      }
    }
    if (!ns || topSum <= EPS) return;
    // how fast it pours: a little faster through a wide opening
    let amount = Math.min(room, topSum, 1.2 + ns * 0.35);
    // take evenly from the top row
    const takeK = amount / topSum;
    // (topN cells were collected first into L[0..topN) but L was reused for
    // sinks, so walk the body again)
    for (let k = 0; k < n; k++) {
      const i = q[k];
      if (((i / GW) | 0) === top) m[i] -= m[i] * takeK;
    }
    // pour into the sinks, evenly, de-duplicated by the room check
    let left = amount;
    for (let pass = 0; pass < 3 && left > EPS; pass++) {
      const share = left / ns;
      for (let k = 0; k < ns && left > EPS; k++) {
        const j = L[k];
        const put = Math.min(share, 1 - m[j], left);
        if (put <= 0) continue;
        m[j] += put;
        left -= put;
      }
    }
    if (left > EPS) {
      // nowhere left to go: give it back to the top
      for (let k = 0; k < n; k++) {
        const i = q[k];
        if (((i / GW) | 0) === top) m[i] += left / topN;
      }
    }
    this.moved += amount;
    const sy = (L[0] / GW) | 0;
    const sx = L[0] - sy * GW;
    this.grow(sx - 2, sy - 2, sx + 2, sy + 2);
  }

  // A small puddle away from the pond slowly soaks into the sand and soil
  // it touches, so spills and flooded tunnels dry out again. (Water still
  // joined to the pond doesn't, or a breach would drain it forever.)
  seepBody(n, mat, m) {
    const q = this.q;
    const k = SEEP * SEEP_DT;
    let wet = false;
    for (let j = 0; j < n; j++) {
      const i = q[j];
      const y = (i / GW) | 0;
      const x = i - y * GW;
      if (x >= this.seepL && x <= this.seepR && n > 6) return;
      const w = m[i];
      if (w < SPREAD_MIN) {
        m[i] = w > k ? w - k : 0;
        wet = true;
        continue;
      }
      const b = y < GH - 1 ? mat[i + GW] : 3;
      const l = x > 0 ? mat[i - 1] : 3;
      const r = x < GW - 1 ? mat[i + 1] : 3;
      if (b === 1 || b === 2 || l === 1 || l === 2 || r === 1 || r === 2) {
        m[i] = w > k ? w - k : 0;
        wet = true;
      }
    }
    if (wet) this.moved += QUIET * 1.01;
  }

  // Total water in a column range (cells' worth).
  volume(cxa = 0, cxb = GW - 1) {
    const m = this.mass;
    let v = 0;
    for (let cy = 0; cy < GH; cy++) {
      const row = cy * GW;
      for (let cx = cxa; cx <= cxb; cx++) v += m[row + cx];
    }
    return v;
  }

  // Pour water in from above the open surface between two columns.
  add(v, cxa, cxb) {
    const t = this.t;
    const m = this.mass;
    const cols = [];
    for (let cx = Math.max(0, cxa); cx <= Math.min(GW - 1, cxb); cx++) {
      const r = t.waterTop[cx];
      if (r >= 0) cols.push([cx, r]);
    }
    if (!cols.length) return 0;
    const per = v / cols.length;
    let added = 0;
    for (const [cx, r] of cols) {
      let left = per;
      for (let y = r; y >= 1 && left > EPS; y--) {
        if (t.solid(cx, y)) break;
        const i = y * GW + cx;
        const put = Math.min(left, 1 - m[i]);
        if (put > 0) {
          m[i] += put;
          left -= put;
          added += put;
        }
      }
      this.grow(cx - 2, r - 8, cx + 2, r + 2);
    }
    this.wake();
    return added;
  }

  // Take water from the top of the water between two columns.
  remove(v, cxa, cxb) {
    const m = this.mass;
    let left = v;
    for (let cy = Math.max(0, this.y0); cy < GH && left > EPS; cy++) {
      const row = cy * GW;
      let sum = 0;
      for (let cx = cxa; cx <= cxb; cx++) sum += m[row + cx];
      if (sum <= EPS) continue;
      const take = Math.min(left, sum);
      const k = take / sum;
      for (let cx = cxa; cx <= cxb; cx++) m[row + cx] -= m[row + cx] * k;
      left -= take;
    }
    this.wake();
    return v - left;
  }

  // Quantised run-length encoding for saves.
  serialize() {
    const m = this.mass;
    const runs = [];
    let v = Math.round(Math.min(1.2, m[0]) * 200);
    let n = 0;
    for (let i = 0; i < m.length; i++) {
      const q = Math.round(Math.min(1.2, m[i]) * 200);
      if (q === v) n++;
      else {
        runs.push(v, n);
        v = q;
        n = 1;
      }
    }
    runs.push(v, n);
    return runs.join(',');
  }

  load(str) {
    const runs = str.split(',').map(Number);
    const m = this.mass;
    let i = 0;
    for (let r = 0; r < runs.length; r += 2) {
      m.fill(runs[r] / 200, i, Math.min(m.length, i + runs[r + 1]));
      i += runs[r + 1];
    }
    // never keep water inside solid ground
    for (let k = 0; k < m.length; k++) if (this.t.mat[k] !== 0) m[k] = 0;
    this.refit();
    this.wake();
  }
}

export { EPS as WATER_EPS, CELL };
