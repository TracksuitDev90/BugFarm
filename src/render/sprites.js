// Caches procedurally drawn art into small canvases at a few resolution
// "buckets" so per-frame drawing is just drawImage. A per-frame budget keeps
// zooming from causing a hitch: if over budget, an existing lower-res
// version is used until there's time to draw the crisp one.
const BUCKETS = [0.75, 1, 1.5, 2, 3, 4];

export function bucketFor(pxPerUnit) {
  for (const b of BUCKETS) if (pxPerUnit <= b * 1.08) return b;
  return BUCKETS[BUCKETS.length - 1];
}

export class SpriteCache {
  constructor(max = 900) {
    this.map = new Map();
    this.max = max;
    this.budget = 12;
    this.made = 0;
  }
  frame(budget = 12) {
    this.budget = budget;
  }
  clear() {
    this.map.clear();
  }
  // box: [x0, y0, x1, y1] in local units. draw(g) draws in local units.
  get(key, bucket, box, draw) {
    const k = key + '@' + bucket;
    let s = this.map.get(k);
    if (s) return s;
    if (this.budget <= 0) {
      for (const b of BUCKETS) {
        const alt = this.map.get(key + '@' + b);
        if (alt) return alt;
      }
    }
    this.budget--;
    this.made++;
    const [x0, y0, x1, y1] = box;
    const w = Math.max(1, Math.ceil((x1 - x0) * bucket));
    const h = Math.max(1, Math.ceil((y1 - y0) * bucket));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.setTransform(bucket, 0, 0, bucket, -x0 * bucket, -y0 * bucket);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    try {
      draw(g);
    } catch (e) {
      console.warn('sprite draw failed', key, e);
    }
    s = { canvas: c, x0, y0, w: w / bucket, h: h / bucket };
    this.map.set(k, s);
    if (this.map.size > this.max) {
      // evict the oldest ~15%
      let n = Math.floor(this.max * 0.15);
      for (const kk of this.map.keys()) {
        this.map.delete(kk);
        if (--n <= 0) break;
      }
    }
    return s;
  }
}
