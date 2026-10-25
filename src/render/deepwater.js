// The pond has depth. Looking in through the front glass the water goes back
// and back: it darkens with depth, the gravel floor recedes into a haze, and
// far off behind the fish there are fronds and stones, fainter the further
// away they are, drifting past more slowly than the near things as you look
// around (parallax), so the eye reads a volume of water rather than a flat
// blue panel. All of it is drawn behind everything in the water and clipped
// to the water's own shape (see TerrainRenderer.waterShape), so a channel
// dug off the pond or a flooded tunnel is deep water too.
import { CELL } from '../config.js';
import { hash1, hash2 } from '../util/rng.js';

const TILE_W = 720; // far scenery repeats every this many units (seamlessly)

function rgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function mixRGB(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class DeepWater {
  constructor() {
    this.key = '';
    this.layers = [];
    this.floor = null;
    this.floorKey = '';
  }

  // look: { key, top, mid, deep: [r,g,b], gravel: [r,g,b] }, wl: water level,
  // bottom: the deepest floor, res: pixels per unit for the far scenery.
  setLook(look, wl, bottom, res) {
    const key = look.key + '|' + Math.round(wl / 12) + '|' + Math.round(bottom / 12) + '|' + res;
    if (key === this.key) return;
    this.key = key;
    this.look = look;
    this.y0 = wl - 12;
    this.bottom = bottom;
    // two bands of far scenery: the farthest barely there and slow to move,
    // a nearer one a little clearer
    this.layers = [
      { f: 0.34, sway: 0.6, tile: this.paintFar(look, 1, res), res },
      { f: 0.16, sway: 1.4, tile: this.paintFar(look, 2, res), res },
    ];
    this.pats = null;
    this.floorKey = '';
  }

  // Fronds, reeds and stones, faded into the water's colour, on a tile that
  // wraps left to right.
  paintFar(look, layer, res) {
    const H = this.bottom - this.y0 + 30;
    const c = canvas(TILE_W * res, H * res);
    const g = c.getContext('2d');
    g.scale(res, res);
    g.lineCap = 'round';
    const near = layer === 2;
    const ink = mixRGB(look.deep, [18, 40, 52], near ? 0.45 : 0.25);
    const base = H - 30;
    const clumps = near ? 7 : 13;
    for (let i = 0; i < clumps; i++) {
      const cx = hash2(i, layer, 11) * TILE_W;
      const by = base - hash2(i, layer, 12) * (near ? 40 : 90);
      const n = 2 + Math.floor(hash2(i, layer, 13) * (near ? 4 : 5));
      for (let k = 0; k < n; k++) {
        const h = (near ? 90 : 70) + hash2(i * 7 + k, layer, 14) * (near ? 200 : 160);
        const lean = (hash2(i * 7 + k, layer, 15) - 0.5) * 40;
        const w = (near ? 3.2 : 2.4) + hash2(i * 7 + k, layer, 16) * (near ? 3 : 2);
        const x = cx + (k - n / 2) * (near ? 7 : 5);
        for (const dx of [0, -TILE_W, TILE_W]) {
          if (x + dx < -60 || x + dx > TILE_W + 60) continue;
          // a soft blade: a wide faint stroke under a narrower, stronger one
          for (const [ww, a] of [[w * 2.4, near ? 0.16 : 0.1], [w, near ? 0.42 : 0.26]]) {
            g.beginPath();
            g.moveTo(x + dx, by);
            g.bezierCurveTo(x + dx + lean * 0.2, by - h * 0.4, x + dx + lean * 1.1, by - h * 0.6, x + dx + lean * 0.6, by - h);
            g.lineWidth = ww;
            g.strokeStyle = rgba(ink, a);
            g.stroke();
          }
        }
      }
    }
    // stones and humps of gravel along the far floor
    const stones = near ? 5 : 9;
    for (let i = 0; i < stones; i++) {
      const x = hash2(i, layer, 21) * TILE_W;
      const rx = (near ? 26 : 18) + hash2(i, layer, 22) * (near ? 44 : 34);
      const ry = rx * (0.35 + hash2(i, layer, 23) * 0.25);
      const y = base - hash2(i, layer, 24) * (near ? 30 : 70) + ry * 0.4;
      for (const dx of [0, -TILE_W, TILE_W]) {
        if (x + dx + rx < 0 || x + dx - rx > TILE_W) continue;
        g.beginPath();
        g.ellipse(x + dx, y, rx, ry, 0, Math.PI, 0);
        g.closePath();
        g.fillStyle = rgba(mixRGB(ink, look.gravel, 0.25), near ? 0.34 : 0.22);
        g.fill();
      }
    }
    // the tops melt away into the water (light comes from above, the far
    // things are only shapes in the haze)
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.25, 'rgba(0,0,0,0.35)');
    fade.addColorStop(0.65, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, TILE_W, H);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // The gravel floor seen going back into the water: a soft band just above
  // the real floor, fading upward, with a few far-off pebbles in it. Follows
  // the floor's shape, so it's redrawn when the water or ground changes.
  ensureFloor(t, shape, res, ver) {
    const key = ver + '|' + this.key;
    if (key === this.floorKey && this.floor) return;
    this.floorKey = key;
    const { x0, y0, x1, y1 } = shape;
    const c = this.floor && this.floor.c.width === Math.ceil((x1 - x0) * res) && this.floor.c.height === Math.ceil((y1 - y0) * res) ? this.floor.c : canvas((x1 - x0) * res, (y1 - y0) * res);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    const look = this.look;
    // runs of floor under open water
    const runs = [];
    let run = null;
    for (let x = x0; x <= x1; x += 3) {
      const fy = t.surfaceY(x);
      if (fy > y0 && fy < y1 && t.waterAt(x, fy - CELL * 0.75)) {
        if (!run) runs.push((run = []));
        run.push(x, fy);
      } else run = null;
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // (lit from above, so it reads lighter than the water behind it)
    const col = mixRGB(mixRGB(look.gravel, look.top, 0.35), look.deep, 0.2);
    for (const r of runs) {
      if (r.length < 4) continue;
      // stacked bands, so it's solid near the floor and soft along the top
      for (const [h, a] of [[30, 0.12], [22, 0.16], [15, 0.2], [9, 0.24]]) {
        g.beginPath();
        for (let k = 0; k < r.length; k += 2) {
          if (k) g.lineTo(r[k], r[k + 1] - h);
          else g.moveTo(r[k], r[k + 1] - h);
        }
        for (let k = r.length - 2; k >= 0; k -= 2) g.lineTo(r[k], r[k + 1] + 2);
        g.closePath();
        g.fillStyle = rgba(col, a);
        g.fill();
      }
      // far pebbles
      for (let k = 0; k < r.length; k += 2) {
        if (hash1(Math.round(r[k]), 31) > 0.45) continue;
        const py = r[k + 1] - 3 - hash1(Math.round(r[k]), 32) * 18;
        g.beginPath();
        g.ellipse(r[k], py, 1.4 + hash1(Math.round(r[k]), 33) * 1.8, 0.9, 0, 0, Math.PI * 2);
        g.fillStyle = rgba(mixRGB(look.gravel, look.top, 0.25), 0.5 * (1 - (r[k + 1] - py) / 26));
        g.fill();
      }
    }
    this.floor = { c, x0, y0, x1, y1 };
  }

  // Draw behind everything in the water. r: the renderer (its transform,
  // camera, clock and view).
  draw(g, r, t, shape, ver) {
    if (!shape || !this.look) return;
    const v = r.view;
    if (shape.x1 < v.x0 || shape.x0 > v.x1 || shape.y1 < v.y0 || shape.y0 > v.y1) return;
    const look = this.look;
    const res = this.layers.length ? this.layers[0].res : 0.5;
    this.ensureFloor(t, shape, res, ver);
    r.setWorld(g);
    g.save();
    g.clip(shape.path);
    // the far wall of water: lighter near the top where the sun gets in,
    // deep and dark toward the bottom
    const bx0 = Math.max(shape.x0, v.x0);
    const bx1 = Math.min(shape.x1, v.x1);
    const by0 = Math.max(shape.y0, v.y0);
    const by1 = Math.min(shape.y1, v.y1);
    if (!this.grad || this.gradFor !== g || this.gradKey !== this.key) {
      const gr = g.createLinearGradient(0, this.y0, 0, this.bottom + 20);
      gr.addColorStop(0, rgba(look.top, 1));
      gr.addColorStop(0.45, rgba(look.mid, 1));
      gr.addColorStop(1, rgba(look.deep, 1));
      this.grad = gr;
      this.gradFor = g;
      this.gradKey = this.key;
      this.pats = null;
    }
    g.fillStyle = this.grad;
    g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // far scenery, moving less than the near things as the camera pans
    if (r.q.rays) {
      if (!this.pats) this.pats = this.layers.map((L) => g.createPattern(L.tile, 'repeat-x'));
      const cx = (shape.x0 + shape.x1) / 2;
      const cy = (shape.y0 + shape.y1) / 2;
      const tm = r.time;
      this.layers.forEach((L, i) => {
        const p = this.pats[i];
        if (!p || !p.setTransform || typeof DOMMatrix === 'undefined') return;
        const dx = (r.cam.x - cx) * L.f + Math.sin(tm * 0.11 + i * 2) * L.sway * 4;
        const dy = (r.cam.y - cy) * L.f * 0.35;
        p.setTransform(new DOMMatrix().translateSelf(dx, this.y0 + dy).scaleSelf(1 / L.res, 1 / L.res));
        g.fillStyle = p;
        g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      });
    }
    const fl = this.floor;
    if (fl) g.drawImage(fl.c, fl.x0, fl.y0, fl.x1 - fl.x0, fl.y1 - fl.y0);
    g.restore();
  }
}
