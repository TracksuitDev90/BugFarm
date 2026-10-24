import { W, H } from '../config.js';

// Uniform-grid spatial hash rebuilt every tick. Queries write into a reused
// array to avoid garbage on hot paths.
export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.cols = Math.ceil((W + 200) / cell);
    this.rows = Math.ceil((H + 200) / cell);
    this.buckets = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.buckets.push([]);
    this.used = []; // buckets with something in (so clearing skips the empty ones)
    this.out = [];
  }
  clear() {
    for (let i = 0; i < this.used.length; i++) this.buckets[this.used[i]].length = 0;
    this.used.length = 0;
  }
  key(x, y) {
    let cx = Math.floor((x + 100) / this.cell);
    let cy = Math.floor((y + 100) / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }
  insert(obj) {
    const k = this.key(obj.x, obj.y);
    const b = this.buckets[k];
    if (!b.length) this.used.push(k);
    b.push(obj);
  }
  // Returns objects within radius r (shared array, copy if you keep it).
  query(x, y, r, filter) {
    const out = this.out;
    out.length = 0;
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r + 100) / c));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r + 100) / c));
    const y0 = Math.max(0, Math.floor((y - r + 100) / c));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r + 100) / c));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const o = b[i];
          const dx = o.x - x;
          const dy = o.y - y;
          if (dx * dx + dy * dy <= r2 && (!filter || filter(o))) out.push(o);
        }
      }
    }
    return out;
  }
  // Nearest object within r that passes filter.
  nearest(x, y, r, filter) {
    const c = this.cell;
    const x0 = Math.max(0, Math.floor((x - r + 100) / c));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r + 100) / c));
    const y0 = Math.max(0, Math.floor((y - r + 100) / c));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r + 100) / c));
    let best = null;
    let bd = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets[cy * this.cols + cx];
        for (let i = 0; i < b.length; i++) {
          const o = b[i];
          const dx = o.x - x;
          const dy = o.y - y;
          const d = dx * dx + dy * dy;
          if (d < bd && (!filter || filter(o))) {
            bd = d;
            best = o;
          }
        }
      }
    }
    return best;
  }
}
