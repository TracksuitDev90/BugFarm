// The picture-book finish for everything inside the tank: cold-press
// watercolour paper grain, a soft painted light-and-shade wash on each
// sprite, and helpers for pigment pooling at the edge of a wash.
// (The room around the tank and the UI keep their own flat look.)
import { hash2 } from '../util/rng.js';

const TILE = 192;
let grain = null;

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Tileable value noise: lattice of `period` cells across the tile.
function vnoise(x, y, period, seed) {
  const fx = x / (TILE / period);
  const fy = y / (TILE / period);
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const h = (i, j) => hash2(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = h(ix, iy);
  const b = h(ix + 1, iy);
  const c = h(ix, iy + 1);
  const d = h(ix + 1, iy + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// Paper grain as a see-through tile: warm dark tooth and pale flecks.
export function grainTile() {
  if (grain) return grain;
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const g = c.getContext('2d');
  const img = g.createImageData(TILE, TILE);
  const d = img.data;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = vnoise(x, y, 48, 3) * 0.55 + vnoise(x, y, 16, 5) * 0.3 + hash2(x, y, 9) * 0.15;
      const o = (y * TILE + x) * 4;
      const dark = Math.max(0, v - 0.58) * 0.38 + (hash2(x, y, 11) < 0.012 ? 0.05 : 0);
      const light = Math.max(0, 0.36 - v) * 0.55;
      if (dark >= light) {
        d[o] = 74;
        d[o + 1] = 52;
        d[o + 2] = 34;
        d[o + 3] = Math.round(Math.min(0.11, dark) * 255);
      } else {
        d[o] = 255;
        d[o + 1] = 252;
        d[o + 2] = 240;
        d[o + 3] = Math.round(Math.min(0.16, light) * 255);
      }
    }
  }
  g.putImageData(img, 0, 0);
  grain = c;
  return c;
}

// Give a freshly drawn sprite its painted finish: a little light on top,
// a little shade underneath, and the paper's tooth. Only touches pixels
// that are already painted. g's transform maps box units to the canvas.
export function finishSprite(g, box, opts = {}) {
  const [x0, y0, x1, y1] = box;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  if (opts.shade !== false) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(255,250,232,0.2)');
    gr.addColorStop(0.5, 'rgba(255,250,232,0)');
    gr.addColorStop(1, 'rgba(84,46,22,0.15)');
    g.fillStyle = gr;
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = opts.grain == null ? 0.9 : opts.grain;
  g.fillStyle = g.createPattern(grainTile(), 'repeat');
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
}

// Watercolour pigment pools at the edge of a wash: stroke the edge wide
// and soft, but only on the inside of the shape (clip to it first).
export function poolEdge(g, edge, color, width = 7) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke(edge);
  g.lineWidth = width * 0.4;
  g.stroke(edge);
}

// Soft blooms of lighter and darker pigment, laid on a world-space grid so
// they continue seamlessly from one cached chunk to the next.
export function blooms(g, x0, y0, x1, y1, spacing, rMin, rMax, light, dark, seed) {
  const G = spacing;
  for (let gy = Math.floor((y0 - rMax) / G); gy <= Math.ceil((y1 + rMax) / G); gy++) {
    for (let gx = Math.floor((x0 - rMax) / G); gx <= Math.ceil((x1 + rMax) / G); gx++) {
      const h = hash2(gx, gy, seed);
      const bx = (gx + hash2(gx, gy, seed + 1)) * G;
      const by = (gy + hash2(gx, gy, seed + 2)) * G;
      const r = rMin + (rMax - rMin) * hash2(gx, gy, seed + 3);
      if (bx + r < x0 || bx - r > x1 || by + r < y0 || by - r > y1) continue;
      const c = h < 0.5 ? light : dark;
      if (!c) continue;
      const rg = g.createRadialGradient(bx, by, r * 0.15, bx, by, r);
      rg.addColorStop(0, c);
      rg.addColorStop(0.7, c.replace(/[\d.]+\)$/, (m) => String(parseFloat(m) * 0.5) + ')'));
      rg.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = rg;
      g.beginPath();
      g.ellipse(bx, by, r, r * (0.6 + hash2(gx, gy, seed + 4) * 0.4), hash2(gx, gy, seed + 5) * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}
