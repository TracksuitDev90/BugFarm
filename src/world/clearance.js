// How far each spot in and around the water is from the ground: a signed
// distance field in tank units (positive in the open, negative inside the
// ground), with the way out of the ground as its slope. Swimmers use it to
// keep every bit of their bodies off the bottom and the banks, and to pick
// spots with room to swim. Only the patch round the water is worked out,
// and only again when the ground or the water there has changed.
import { CELL, GW, GH } from '../config.js';

const MARGIN = 20; // cells of ground round the water worth knowing about
const FAR = 99; // (anywhere outside the patch counts as wide open)
const INF = 1e20;

// The 1-D squared distance transform (Felzenszwalb & Huttenlocher): for each
// q, the least of (q - p)^2 + f[p].
function edt1(f, d, n, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

export class Clearance {
  constructor() {
    this.terrain = null;
    this.stamp = 0; // goes up every time it's worked out afresh
    this.tv = -1; // the terrain and water versions it was worked out for
    this.wv = -1;
    this.t = -Infinity;
    this.x0 = 0;
    this.y0 = 0;
    this.w = 0;
    this.h = 0;
    this.field = null;
    this.mask = null;
  }

  // Bring it up to date if the ground or the water has changed (at most
  // every `every` seconds of tank time, or straight away the first time).
  update(t, time, every = 0.5) {
    if (t === this.terrain && t.version === this.tv && t.waterVersion === this.wv) return;
    // (a loaded tank can turn the clock back: that's a change, not a wait)
    if (this.field && t === this.terrain && time >= this.t && time - this.t < every) return;
    this.terrain = t;
    this.tv = t.version;
    this.wv = t.waterVersion;
    this.t = time;
    // the patch: round all the water, with room to spare
    let cx0 = GW;
    let cy0 = GH;
    let cx1 = -1;
    let cy1 = -1;
    const wat = t.water;
    for (let cy = 0; cy < GH; cy++) {
      const row = cy * GW;
      for (let cx = 0; cx < GW; cx++) {
        if (wat[row + cx] !== 1) continue;
        if (cx < cx0) cx0 = cx;
        if (cx > cx1) cx1 = cx;
        if (cy < cy0) cy0 = cy;
        if (cy > cy1) cy1 = cy;
      }
    }
    if (cx1 < 0) {
      this.field = null;
      this.w = this.h = 0;
      this.stamp++;
      return;
    }
    // (one cell past the tank's edge, so the glass counts as ground)
    const x0 = Math.max(-1, cx0 - MARGIN);
    const y0 = Math.max(-1, cy0 - MARGIN);
    const w = Math.min(GW, cx1 + MARGIN + 1) - x0 + 1;
    const h = Math.min(GH, cy1 + MARGIN + 1) - y0 + 1;
    const n = w * h;
    // nothing new in the patch (an ant dug elsewhere, the water only rippled)?
    const same = this.field && x0 === this.x0 && y0 === this.y0 && w === this.w && h === this.h;
    const mask = same ? this.mask : new Uint8Array(n);
    let changed = !same;
    for (let j = 0; j < h; j++) {
      const cy = y0 + j;
      for (let i = 0; i < w; i++) {
        const cx = x0 + i;
        const s = cx < 0 || cy < 0 || cx >= GW || cy >= GH || t.mat[cy * GW + cx] !== 0 ? 1 : 0;
        const k = j * w + i;
        if (mask[k] !== s) {
          mask[k] = s;
          changed = true;
        }
      }
    }
    if (!changed) return;
    this.x0 = x0;
    this.y0 = y0;
    this.w = w;
    this.h = h;
    this.mask = mask;
    const out = this.dist(mask, 1); // open water: how far to the ground
    const inn = this.dist(mask, 0); // in the ground: how far to the open
    const field = this.field && this.field.length === n ? this.field : new Float32Array(n);
    // measured to the edge of the cells (half a cell short of their middles)
    for (let k = 0; k < n; k++) field[k] = mask[k] ? -(Math.sqrt(inn[k]) - 0.5) * CELL : (Math.sqrt(out[k]) - 0.5) * CELL;
    this.field = field;
    this.stamp++;
  }

  // Squared distance (in cells) from every cell to the nearest cell whose
  // mask is `to`.
  dist(mask, to) {
    const { w, h } = this;
    const n = w * h;
    const m = Math.max(w, h);
    if (!this.buf || this.buf.f.length < m || this.buf.g.length < n) {
      this.buf = { f: new Float64Array(m), d: new Float64Array(m), v: new Int32Array(m), z: new Float64Array(m + 1), g: new Float64Array(n), g2: new Float64Array(n) };
    }
    const { f, d, v, z } = this.buf;
    const g = to ? this.buf.g : this.buf.g2;
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) f[j] = mask[j * w + i] === to ? 0 : INF;
      edt1(f, d, h, v, z);
      for (let j = 0; j < h; j++) g[j * w + i] = d[j];
    }
    for (let j = 0; j < h; j++) {
      const row = j * w;
      for (let i = 0; i < w; i++) f[i] = g[row + i];
      edt1(f, d, w, v, z);
      for (let i = 0; i < w; i++) g[row + i] = d[i];
    }
    return g;
  }

  // How far (x, y) is from the ground, smoothly between cells: positive in
  // the open, negative inside the ground.
  at(x, y) {
    const f = this.field;
    if (!f) return FAR;
    const gx = x / CELL - 0.5 - this.x0;
    const gy = y / CELL - 0.5 - this.y0;
    const w = this.w;
    if (gx < 0 || gy < 0 || gx >= w - 1 || gy >= this.h - 1) return FAR;
    const i = gx | 0;
    const j = gy | 0;
    const fx = gx - i;
    const fy = gy - j;
    const k = j * w + i;
    const a = f[k] + (f[k + 1] - f[k]) * fx;
    const b = f[k + w] + (f[k + w + 1] - f[k + w]) * fx;
    return a + (b - a) * fy;
  }

  // Which way is away from the ground at (x, y), as a unit vector in out
  // (straight up if there's no telling).
  away(x, y, out) {
    const e = 2;
    const gx = this.at(x + e, y) - this.at(x - e, y);
    const gy = this.at(x, y + e) - this.at(x, y - e);
    const l = Math.hypot(gx, gy);
    if (l < 1e-4) {
      out[0] = 0;
      out[1] = -1;
    } else {
      out[0] = gx / l;
      out[1] = gy / l;
    }
    return out;
  }
}
