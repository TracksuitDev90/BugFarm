// Renders the terrain grid into cached chunk canvases using marching squares
// so tunnels and banks get smooth, inked edges. Chunks are only redrawn when
// cells inside them change (ants digging, player sculpting).
import { CELL, GW, GH, MAT, INK, W, H, ZONE_X } from '../config.js';
import { CHUNK, CHW, CHH } from '../world/terrain.js';
import { hash2, noise1 } from '../util/rng.js';
import { ell, circ, fill, stroke } from '../art/ink.js';

const TEX = 64; // texture tile size in world units

export const SAND_STYLES = {
  golden: { name: 'Golden sand', base: '#e8c483', grains: ['#c99c5f', '#f6e4b8', '#d9b072', '#b58a52'], strata: ['#d6ad6c', '#f1d59c'], strataAlpha: 0.22 },
  white: { name: 'Beach white', base: '#efe5cf', grains: ['#d8c9a8', '#ffffff', '#cbbd9e', '#e2d5b8'], strata: ['#ddd0b3', '#fbf6ea'], strataAlpha: 0.2 },
  red: { name: 'Red desert', base: '#d9946a', grains: ['#b8714a', '#efb48c', '#c9825a', '#9e5f3e'], strata: ['#c47c54', '#eaa67c'], strataAlpha: 0.24 },
  rainbow: { name: 'Rainbow layers', base: '#f0d8a8', grains: ['#d4b37a', '#fff2d2', '#c9a46b'], strata: ['#f2a7b5', '#9fd0ef', '#f6dd78', '#a9dc94', '#c8b2ea'], strataAlpha: 0.62 },
};
export const SOIL_STYLES = {
  loam: { name: 'Garden loam', base: '#7d5538', grains: ['#5f3e28', '#9a6f4e', '#6b4a33', '#a58063'] },
  dark: { name: 'Dark peat', base: '#5b3f2c', grains: ['#43301f', '#7a5a42', '#4e3726', '#8a6a52'] },
  clay: { name: 'Red clay', base: '#94573b', grains: ['#71402a', '#b27257', '#83503a', '#c08a6c'] },
};
export const GRAVEL_STYLES = {
  natural: { name: 'River pebbles', base: '#8c7a62', pebbles: ['#cfc3ad', '#a69a87', '#e3d8c3', '#8f8576', '#b89f80'] },
  rainbow: { name: 'Rainbow gravel', base: '#7c6f85', pebbles: ['#f28fa5', '#7fc4ef', '#f5d76e', '#93d88a', '#c4a0ee', '#ffffff'] },
  ocean: { name: 'Ocean blue', base: '#4d6a82', pebbles: ['#9cc9e6', '#6aa3cc', '#d9eef8', '#4f86b0', '#b6d6c9'] },
};
const ROCK = { base: '#a7a39a', grains: ['#8d887f', '#c4c0b6', '#97928a'] };
const CLAY = { base: '#a1775b', grains: ['#8a634a', '#b88d70'] };
const TUNNEL = { base: '#5e3f29', grains: ['#4d331f', '#6d4b33', '#553823'] };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Draw something on a seamless tile, wrapping copies across edges.
function wrapped(fn, x, y, r) {
  fn(x, y);
  const xs = [0];
  const ys = [0];
  if (x - r < 0) xs.push(TEX);
  if (x + r > TEX) xs.push(-TEX);
  if (y - r < 0) ys.push(TEX);
  if (y + r > TEX) ys.push(-TEX);
  for (const dx of xs) for (const dy of ys) if (dx || dy) fn(x + dx, y + dy);
}

function makeTexture(kind, style, S, seed) {
  const c = makeCanvas(TEX * S, TEX * S);
  const g = c.getContext('2d');
  g.scale(S, S);
  g.fillStyle = style.base;
  g.fillRect(0, 0, TEX, TEX);
  let s = seed * 1000;
  const r = () => hash2(s++, seed, 91);
  // Watercolour blotches
  for (let i = 0; i < 10; i++) {
    const x = r() * TEX;
    const y = r() * TEX;
    const rad = 8 + r() * 14;
    const light = kind === 'sand' ? true : r() < 0.5;
    wrapped(
      (px, py) => {
        g.globalAlpha = kind === 'soil' || kind === 'tunnel' ? 0.03 : 0.035;
        ell(g, px, py, rad, rad * (0.6 + r() * 0.4));
        g.fillStyle = light ? '#ffffff' : '#3a2a1f';
        g.fill();
      },
      x,
      y,
      rad
    );
  }
  g.globalAlpha = 1;
  if (kind === 'gravel') {
    for (let i = 0; i < 70; i++) {
      const x = r() * TEX;
      const y = r() * TEX;
      const rx = 1.3 + r() * 1.6;
      const ry = rx * (0.65 + r() * 0.3);
      const col = style.pebbles[Math.floor(r() * style.pebbles.length)];
      const rot = r() * 3;
      wrapped(
        (px, py) => {
          ell(g, px, py, rx, ry, rot);
          fill(g, col);
          stroke(g, 0.35, 'rgba(58,42,31,0.75)');
          ell(g, px - rx * 0.3, py - ry * 0.35, rx * 0.35, ry * 0.25, rot);
          g.fillStyle = 'rgba(255,255,255,0.5)';
          g.fill();
        },
        x,
        y,
        rx + 1
      );
    }
    return c;
  }
  const grains = style.grains;
  const count = kind === 'sand' ? 260 : kind === 'tunnel' ? 120 : 180;
  for (let i = 0; i < count; i++) {
    const x = r() * TEX;
    const y = r() * TEX;
    const rad = kind === 'sand' ? 0.2 + r() * 0.35 : 0.3 + r() * 0.55;
    g.globalAlpha = 0.55 + r() * 0.45;
    g.fillStyle = grains[Math.floor(r() * grains.length)];
    g.fillRect(x, y, rad * 1.4, rad * 1.1);
  }
  g.globalAlpha = 1;
  if (kind === 'soil') {
    // tiny pebbles and rootlets
    for (let i = 0; i < 6; i++) {
      const x = r() * TEX;
      const y = r() * TEX;
      const rx = 0.9 + r() * 1.2;
      wrapped(
        (px, py) => {
          ell(g, px, py, rx, rx * 0.7);
          fill(g, '#a39a8c');
          stroke(g, 0.3);
        },
        x,
        y,
        rx + 1
      );
    }
    for (let i = 0; i < 4; i++) {
      const x = r() * (TEX - 16) + 8;
      const y = r() * (TEX - 16) + 8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (r() - 0.5) * 10, y + 4, x + (r() - 0.5) * 8, y + 8);
      stroke(g, 0.35, 'rgba(58,42,31,0.45)');
    }
  }
  if (kind === 'rock') {
    for (let i = 0; i < 5; i++) {
      const x = r() * (TEX - 12) + 6;
      const y = r() * (TEX - 12) + 6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 7, y + (r() - 0.5) * 7);
      g.lineTo(x + (r() - 0.5) * 9, y + (r() - 0.5) * 9);
      stroke(g, 0.35, 'rgba(58,42,31,0.5)');
    }
  }
  if (kind === 'sand') {
    for (let i = 0; i < 2; i++) {
      const x = r() * TEX;
      const y = r() * TEX;
      wrapped(
        (px, py) => {
          ell(g, px, py, 0.6, 0.45);
          fill(g, '#c2b49e');
          stroke(g, 0.2, 'rgba(58,42,31,0.45)');
        },
        x,
        y,
        2
      );
    }
  }
  return c;
}

// Marching squares polygon table: for each case, list of corner/midpoint ids.
// ids: 0=A(tl) 1=B(tr) 2=C(br) 3=D(bl) 4=T 5=R 6=Bm 7=L
const POLY = [
  null,
  [7, 6, 3],
  [6, 5, 2],
  [7, 5, 2, 3],
  [4, 1, 5],
  [4, 1, 5, 6, 3, 7],
  [4, 1, 2, 6],
  [4, 1, 2, 3, 7],
  [0, 4, 7],
  [0, 4, 6, 3],
  [0, 4, 5, 2, 6, 7],
  [0, 4, 5, 2, 3],
  [0, 1, 5, 7],
  [0, 1, 5, 6, 3],
  [0, 1, 2, 6, 7],
  null,
];
const EDGES = [null, [7, 6], [6, 5], [7, 5], [4, 5], [4, 7, 5, 6], [4, 6], [4, 7], [7, 4], [4, 6], [4, 5, 7, 6], [4, 5], [7, 5], [5, 6], [7, 6], null];

const SAMPLE_N = CHUNK + 3;
const RAW_N = SAMPLE_N + 2;
const raw = new Uint8Array(RAW_N * RAW_N);
const samples = new Float32Array(SAMPLE_N * SAMPLE_N);

// Builds a smoothed density field for cells matching `test` so the contour
// comes out as gentle curves instead of stair steps.
function buildMask(terrain, i0, j0, test) {
  const m = terrain.mat;
  return buildMaskXY(i0, j0, (i, j) => test(m[j * GW + i]));
}

// Same as buildMask but the predicate gets cell coordinates.
function buildMaskXY(i0, j0, fn) {
  let any = false;
  let all = true;
  for (let jj = 0; jj < RAW_N; jj++) {
    const j = j0 - 2 + jj;
    for (let ii = 0; ii < RAW_N; ii++) {
      let i = i0 - 2 + ii;
      let v;
      if (j < 0) v = 0;
      else {
        const jc = j >= GH ? GH - 1 : j;
        if (i < 0) i = 0;
        else if (i >= GW) i = GW - 1;
        v = fn(i, jc) ? 1 : 0;
      }
      raw[jj * RAW_N + ii] = v;
    }
  }
  for (let jj = 0; jj < SAMPLE_N; jj++) {
    for (let ii = 0; ii < SAMPLE_N; ii++) {
      const r0 = jj * RAW_N + ii;
      const r1 = r0 + RAW_N;
      const r2 = r1 + RAW_N;
      const v =
        (raw[r0] + raw[r0 + 2] + raw[r2] + raw[r2 + 2] + 2 * (raw[r0 + 1] + raw[r1] + raw[r1 + 2] + raw[r2 + 1]) + 4 * raw[r1 + 1]) / 16;
      samples[jj * SAMPLE_N + ii] = v;
      if (v >= 0.5) any = true;
      else all = false;
    }
  }
  return any ? (all ? 2 : 1) : 0;
}

function cross(a, b) {
  const d = b - a;
  if (Math.abs(d) < 1e-6) return 0.5;
  const t = (0.5 - a) / d;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function maskPaths(i0, j0, wantFill, wantEdge) {
  const fillP = wantFill ? new Path2D() : null;
  const edgeP = wantEdge ? new Path2D() : null;
  const px = new Float32Array(8);
  const py = new Float32Array(8);
  for (let jj = 0; jj < SAMPLE_N - 1; jj++) {
    let runStart = -1;
    const y0 = (j0 - 1 + jj + 0.5) * CELL;
    const y1 = y0 + CELL;
    for (let ii = 0; ii < SAMPLE_N - 1; ii++) {
      const va = samples[jj * SAMPLE_N + ii];
      const vb = samples[jj * SAMPLE_N + ii + 1];
      const vc = samples[(jj + 1) * SAMPLE_N + ii + 1];
      const vd = samples[(jj + 1) * SAMPLE_N + ii];
      const a = va >= 0.5 ? 1 : 0;
      const b = vb >= 0.5 ? 1 : 0;
      const c = vc >= 0.5 ? 1 : 0;
      const d = vd >= 0.5 ? 1 : 0;
      const cs = a * 8 + b * 4 + c * 2 + d;
      const x0 = (i0 - 1 + ii + 0.5) * CELL;
      if (cs === 15) {
        if (runStart < 0) runStart = x0;
        continue;
      }
      if (runStart >= 0 && fillP) {
        fillP.rect(runStart, y0, x0 - runStart + 0.02, CELL);
      }
      runStart = -1;
      if (cs === 0) continue;
      const x1 = x0 + CELL;
      px[0] = x0; py[0] = y0;
      px[1] = x1; py[1] = y0;
      px[2] = x1; py[2] = y1;
      px[3] = x0; py[3] = y1;
      px[4] = x0 + CELL * cross(va, vb); py[4] = y0;
      px[5] = x1; py[5] = y0 + CELL * cross(vb, vc);
      px[6] = x0 + CELL * cross(vd, vc); py[6] = y1;
      px[7] = x0; py[7] = y0 + CELL * cross(va, vd);
      if (fillP) {
        const poly = POLY[cs];
        fillP.moveTo(px[poly[0]], py[poly[0]]);
        for (let k = 1; k < poly.length; k++) fillP.lineTo(px[poly[k]], py[poly[k]]);
        fillP.closePath();
      }
      if (edgeP) {
        const e = EDGES[cs];
        for (let k = 0; k < e.length; k += 2) {
          edgeP.moveTo(px[e[k]], py[e[k]]);
          edgeP.lineTo(px[e[k + 1]], py[e[k + 1]]);
        }
      }
    }
    if (runStart >= 0 && fillP) {
      const xEnd = (i0 - 1 + SAMPLE_N - 1 + 0.5) * CELL;
      fillP.rect(runStart, y0, xEnd - runStart, CELL);
    }
  }
  return { fill: fillP, edge: edgeP };
}

const LAYERS = [MAT.SAND, MAT.SOIL, MAT.CLAY, MAT.GRAVEL, MAT.ROCK];
const ORDER = [];
LAYERS.forEach((m, i) => (ORDER[m] = i));

export class TerrainRenderer {
  constructor(terrain) {
    this.terrain = terrain;
    this.S = 1.5;
    this.pad = 2;
    this.chunks = new Array(CHW * CHH).fill(null);
    this.wchunks = new Array(CHW * CHH);
    this.waterLook = null;
    this.style = { sand: 'golden', soil: 'loam', gravel: 'natural' };
    this.patterns = null;
  }

  setScale(S) {
    if (S === this.S && this.patterns) return;
    this.version = (this.version || 0) + 1;
    this.S = S;
    this.chunks.fill(null);
    if (this.waterLook) this.waterLook = { ...this.waterLook, key: '' };
    this.buildPatterns();
    this.terrain.markAllDirty();
  }

  setStyle(style) {
    this.version = (this.version || 0) + 1;
    Object.assign(this.style, style);
    this.buildPatterns();
    this.terrain.markAllDirty();
  }

  buildPatterns() {
    const S = this.S;
    const tmp = makeCanvas(1, 1).getContext('2d');
    const mk = (kind, style, seed) => {
      const tex = makeTexture(kind, style, S, seed);
      const p = tmp.createPattern(tex, 'repeat');
      if (p.setTransform && typeof DOMMatrix !== 'undefined') {
        p.setTransform(new DOMMatrix().scaleSelf(1 / S, 1 / S));
        return p;
      }
      // Fallback: texture at 1x world scale.
      const tex1 = makeTexture(kind, style, 1, seed);
      return tmp.createPattern(tex1, 'repeat');
    };
    this.patterns = {
      [MAT.SAND]: mk('sand', SAND_STYLES[this.style.sand] || SAND_STYLES.golden, 1),
      [MAT.SOIL]: mk('soil', SOIL_STYLES[this.style.soil] || SOIL_STYLES.loam, 2),
      [MAT.ROCK]: mk('rock', ROCK, 3),
      [MAT.GRAVEL]: mk('gravel', GRAVEL_STYLES[this.style.gravel] || GRAVEL_STYLES.natural, 4),
      [MAT.CLAY]: mk('clay', CLAY, 5),
      tunnel: mk('tunnel', TUNNEL, 6),
    };
  }

  // Redraw up to `budget` dirty chunks, visible ones first.
  // Redraw up to `budget` dirty chunks, visible ones first. Returns the list
  // of chunk indices redrawn (so cached layers can patch just those areas).
  update(view, budget = 3) {
    const dirty = this.terrain.dirtyChunks;
    const out = (this.lastRendered = this.lastRendered || []);
    out.length = 0;
    if (!dirty.size) return out;
    if (view) {
      for (const k of dirty) {
        const kx = k % CHW;
        const ky = (k / CHW) | 0;
        const x = kx * CHUNK * CELL;
        const y = ky * CHUNK * CELL;
        const s = CHUNK * CELL;
        if (x + s < view.x0 || x > view.x1 || y + s < view.y0 || y > view.y1) continue;
        this.renderChunk(k);
        dirty.delete(k);
        out.push(k);
        if (out.length >= budget) return out;
      }
    }
    for (const k of dirty) {
      this.renderChunk(k);
      dirty.delete(k);
      out.push(k);
      if (out.length >= budget) break;
    }
    return out;
  }

  chunkRect(k) {
    const kx = k % CHW;
    const ky = (k / CHW) | 0;
    const pad = this.pad;
    return [kx * CHUNK * CELL - pad, ky * CHUNK * CELL - pad, CHUNK * CELL + pad * 2, CHUNK * CELL + pad * 2];
  }

  renderAll() {
    for (const k of this.terrain.dirtyChunks) this.renderChunk(k);
    this.terrain.dirtyChunks.clear();
    this.version = (this.version || 0) + 1;
  }

  // ------------------------------------------------------------------ water
  // The water is painted into its own chunks (like the ground), so when it
  // flows only the chunks it moved through are repainted. `look` sets the
  // colours; changing it repaints every water chunk over a few frames.
  setWaterLook(look) {
    if (this.waterLook && this.waterLook.key === look.key) return;
    this.waterLook = look;
    const t = this.terrain;
    for (let k = 0; k < CHW * CHH; k++) if (this.wchunks[k] !== undefined || this.hasWater(k)) t.waterChunks.add(k);
  }

  hasWater(k) {
    const t = this.terrain;
    const i0 = (k % CHW) * CHUNK;
    const j0 = ((k / CHW) | 0) * CHUNK;
    for (let j = Math.max(0, j0 - 2); j < Math.min(GH, j0 + CHUNK + 2); j++) {
      const row = j * GW;
      for (let i = Math.max(0, i0 - 2); i < Math.min(GW, i0 + CHUNK + 2); i++) if (t.water[row + i]) return true;
    }
    return false;
  }

  // Repaint up to `budget` changed water chunks, visible ones first.
  updateWater(view, budget = 3) {
    const dirty = this.terrain.waterChunks;
    if (!dirty.size || !this.waterLook) return 0;
    let n = 0;
    const span = CHUNK * CELL;
    for (const pass of [0, 1]) {
      for (const k of dirty) {
        if (pass === 0 && view) {
          const x = (k % CHW) * span;
          const y = ((k / CHW) | 0) * span;
          if (x + span < view.x0 || x > view.x1 || y + span < view.y0 || y > view.y1) continue;
        }
        this.paintWaterChunk(k);
        dirty.delete(k);
        if (++n >= budget) return n;
      }
    }
    return n;
  }

  paintWaterChunk(k) {
    const t = this.terrain;
    const look = this.waterLook;
    const kx = k % CHW;
    const ky = (k / CHW) | 0;
    const i0 = kx * CHUNK;
    const j0 = ky * CHUNK;
    const kind = buildMaskXY(i0, j0, (i, j) => t.water[j * GW + i] === 1);
    if (!kind) {
      this.wchunks[k] = undefined;
      return;
    }
    // (no overlap between water chunks: they're see-through, so an overlap
    // would show as a darker seam)
    const S = Math.min(this.S, 1.5);
    const size = CHUNK * CELL;
    const wx = i0 * CELL;
    const wy = j0 * CELL;
    const px = Math.ceil(size * S);
    let ch = this.wchunks[k];
    if (!ch || ch.S !== S) {
      const c = makeCanvas(px, px);
      ch = { canvas: c, ctx: c.getContext('2d'), x: wx, y: wy, size, S };
      this.wchunks[k] = ch;
    }
    const g = ch.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.setTransform(S, 0, 0, S, -wx * S, -wy * S);
    const { fill: fp, edge } = maskPaths(i0, j0, true, true);
    // a wash that deepens with depth
    const grad = g.createLinearGradient(0, look.top, 0, H);
    grad.addColorStop(0, look.c0);
    grad.addColorStop(0.45, look.c1);
    grad.addColorStop(1, look.c2);
    g.fillStyle = grad;
    g.fill(fp);
    g.save();
    g.clip(fp);
    // pigment pooling where the wash meets the banks
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.strokeStyle = look.pool;
    g.stroke(edge);
    g.lineWidth = 3.5;
    g.stroke(edge);
    // soft blooms of lighter and deeper colour, continuous across chunks
    const G = 72;
    for (let gy = Math.floor((wy - 60) / G); gy <= Math.ceil((wy + size + 60) / G); gy++) {
      for (let gx = Math.floor((wx - 60) / G); gx <= Math.ceil((wx + size + 60) / G); gx++) {
        const h = hash2(gx, gy, 77);
        const bx = (gx + hash2(gx, gy, 78)) * G;
        const by = (gy + hash2(gx, gy, 79)) * G;
        const r = 26 + h * 34;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, r);
        const c = h < 0.5 ? look.bloomLight : look.bloomDark;
        rg.addColorStop(0, c);
        rg.addColorStop(1, c.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = rg;
        g.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
    // a few hand-drawn ripple strokes
    for (let n = 0; n < 5; n++) {
      const h = hash2(kx * 7 + n, ky, 41);
      const x = wx + hash2(kx, ky * 5 + n, 42) * size;
      const y = wy + hash2(kx * 3 + n, ky, 43) * size;
      if (!t.water[Math.floor(y / CELL) * GW + Math.floor(x / CELL)]) continue;
      const len = 10 + h * 16;
      g.beginPath();
      g.moveTo(x - len / 2, y);
      g.quadraticCurveTo(x, y - 1.6, x + len / 2, y);
      g.lineWidth = 0.9;
      g.strokeStyle = 'rgba(255,255,255,0.32)';
      g.stroke();
    }
    g.restore();
  }

  // k, ox, oy: the world-to-device transform. Chunks are placed on whole
  // device pixels so neighbours meet exactly, with no seam or gap.
  drawWater(ctx, view, alpha, k, ox, oy) {
    const span = CHUNK * CELL;
    const kx0 = Math.max(0, Math.floor(view.x0 / span));
    const kx1 = Math.min(CHW - 1, Math.floor(view.x1 / span));
    const ky0 = Math.max(0, Math.floor(view.y0 / span));
    const ky1 = Math.min(CHH - 1, Math.floor(view.y1 / span));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    for (let ky = ky0; ky <= ky1; ky++) {
      const ya = Math.round(k * ky * span + oy);
      const yb = Math.round(k * (ky + 1) * span + oy);
      for (let kx = kx0; kx <= kx1; kx++) {
        const ch = this.wchunks[ky * CHW + kx];
        if (!ch) continue;
        const xa = Math.round(k * kx * span + ox);
        const xb = Math.round(k * (kx + 1) * span + ox);
        ctx.drawImage(ch.canvas, xa, ya, xb - xa, yb - ya);
      }
    }
    ctx.globalAlpha = 1;
  }

  renderChunk(k) {
    const t = this.terrain;
    const kx = k % CHW;
    const ky = (k / CHW) | 0;
    const i0 = kx * CHUNK;
    const j0 = ky * CHUNK;
    const S = this.S;
    const pad = this.pad;
    const size = CHUNK * CELL;
    const wx = i0 * CELL;
    const wy = j0 * CELL;

    // Does this chunk contain anything (solid or tunnel backdrop)?
    let hasSolid = buildMask(t, i0, j0, (m) => m !== 0) !== 0;
    let belowGround = false;
    for (let i = i0; i < Math.min(GW, i0 + CHUNK); i++) {
      if (t.groundTop[i] < j0 + CHUNK) {
        belowGround = true;
        break;
      }
    }
    // Grass/pebbles from the chunk below can poke up into this one.
    let surfaceNear = false;
    for (let i = Math.max(0, i0 - 2); i < Math.min(GW, i0 + CHUNK + 2); i++) {
      const top = t.top[i];
      // (jungle roots and humus reach down into the chunk below the surface)
      if (top >= j0 - 12 && top <= j0 + CHUNK + 4) {
        surfaceNear = true;
        break;
      }
    }
    if (!hasSolid && !belowGround && !surfaceNear) {
      this.chunks[k] = null;
      return;
    }
    let ch = this.chunks[k];
    const px = Math.ceil((size + pad * 2) * S);
    if (!ch) {
      const c = makeCanvas(px, px);
      ch = { canvas: c, ctx: c.getContext('2d'), x: wx - pad, y: wy - pad, size: size + pad * 2 };
      this.chunks[k] = ch;
    }
    const g = ch.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.setTransform(S, 0, 0, S, -(wx - pad) * S, -(wy - pad) * S);

    const xL = wx - pad;
    const yT = wy - pad;
    const xR = wx + size + pad;
    const yB = wy + size + pad;
    // never paint outside the glass
    g.save();
    g.beginPath();
    g.rect(0, -40, W, H + 40);
    g.clip();

    // 1) Tunnel backdrop below the (smoothed) ground line.
    let below = null;
    if (belowGround && buildMaskXY(i0, j0, (i, j) => j >= t.groundTop[i] && t.water[j * GW + i] !== 1)) {
      below = maskPaths(i0, j0, true, false).fill;
      g.fillStyle = this.patterns.tunnel;
      g.fill(below);
      // deeper is darker
      const grad = g.createLinearGradient(0, 380, 0, 900);
      grad.addColorStop(0, 'rgba(30,18,10,0)');
      grad.addColorStop(1, 'rgba(30,18,10,0.35)');
      g.fillStyle = grad;
      g.fill(below);
    }

    if (hasSolid) {
      // 2) Solid fills, layered so there are no seams between materials.
      const present = new Set();
      for (let j = Math.max(0, j0 - 1); j < Math.min(GH, j0 + CHUNK + 2); j++) {
        for (let i = Math.max(0, i0 - 1); i < Math.min(GW, i0 + CHUNK + 2); i++) {
          const m = t.mat[j * GW + i];
          if (m) present.add(m);
        }
      }
      let firstLayer = true;
      let sandPath = null;
      for (const L of LAYERS) {
        if (!present.has(L)) continue;
        const ord = ORDER[L];
        const test = firstLayer ? (m) => m !== 0 : (m) => m !== 0 && ORDER[m] >= ord;
        if (!buildMask(t, i0, j0, test)) continue;
        const { fill: fp } = maskPaths(i0, j0, true, false);
        g.fillStyle = this.patterns[L];
        g.fill(fp);
        if (L === MAT.SAND) sandPath = fp;
        firstLayer = false;
      }
      // The first layer covers every solid cell, so give the strata a mask of
      // just the sand when other materials share this chunk.
      if (sandPath && present.size > 1) sandPath = buildMask(t, i0, j0, (m) => m === MAT.SAND) ? maskPaths(i0, j0, true, false).fill : null;
      // Sand strata (layered ant-farm sand).
      if (sandPath) {
        const st = SAND_STYLES[this.style.sand] || SAND_STYLES.golden;
        g.save();
        g.clip(sandPath);
        const band = 30;
        const startB = Math.floor(yT / band) - 1;
        const endB = Math.ceil(yB / band) + 1;
        for (let b = startB; b <= endB; b++) {
          const col = st.strata[((b % st.strata.length) + st.strata.length) % st.strata.length];
          g.globalAlpha = st.strataAlpha;
          g.fillStyle = col;
          g.beginPath();
          const yb = b * band;
          g.moveTo(xL, yb);
          for (let x = xL; x <= xR + 8; x += 8) g.lineTo(x, yb + (noise1(x * 0.02, b * 13) - 0.5) * 14);
          for (let x = xR + 8; x >= xL - 8; x -= 8) g.lineTo(x, yb + band * 0.55 + (noise1(x * 0.025, b * 17 + 5) - 0.5) * 12);
          g.closePath();
          g.fill();
        }
        g.globalAlpha = 1;
        g.restore();
      }

      // 3) Edges: soft shadow inside tunnels, then crisp ink.
      buildMask(t, i0, j0, (m) => m !== 0);
      const { edge } = maskPaths(i0, j0, false, true);
      if (below) {
        g.save();
        g.clip(below);
        g.lineWidth = 3.2;
        g.strokeStyle = 'rgba(35,20,10,0.35)';
        g.lineCap = 'round';
        g.stroke(edge);
        g.restore();
      }
      g.lineWidth = 1.25;
      g.lineCap = 'round';
      g.strokeStyle = INK;
      g.stroke(edge);

      if (present.has(MAT.ROCK)) {
        buildMask(t, i0, j0, (m) => m === MAT.ROCK);
        const { edge: re } = maskPaths(i0, j0, false, true);
        g.lineWidth = 1.1;
        g.strokeStyle = INK;
        g.stroke(re);
      }
    }

    // 4) Surface details: grass on soil, pebbles on sand.
    if (surfaceNear) this.drawSurfaceDetail(g, i0, j0, yT, yB);
    g.restore();
  }

  drawSurfaceDetail(g, i0, j0, yT, yB) {
    const t = this.terrain;
    const jx = ZONE_X.jungle[0] - 30;
    this.drawHumus(g, Math.max(1, i0 - 3), Math.min(GW - 1, i0 + CHUNK + 3), jx);
    for (let i = Math.max(1, i0 - 3); i < Math.min(GW - 1, i0 + CHUNK + 3); i++) {
      const top = t.top[i];
      if (top >= GH) continue;
      const m = t.mat[top * GW + i];
      const y = top * CELL;
      const x = i * CELL + CELL / 2;
      const jungle = x > jx && m === MAT.SOIL;
      if (y < yT - (jungle ? 48 : 16) || y > yB + 16) continue;
      if (t.isWater(i, top - 1)) continue;
      const h = hash2(i, 3, 11);
      if (jungle) {
        this.drawForestFloor(g, t, i, x, h);
        continue;
      }
      if (m === MAT.SOIL) {
        const n = 2 + Math.floor(h * 2);
        for (let b = 0; b < n; b++) {
          const hx = x + (hash2(i, b, 5) - 0.5) * CELL * 1.6;
          const hh = 4 + hash2(i, b, 6) * 7;
          const lean = (hash2(i, b, 7) - 0.5) * 4;
          const col = hash2(i, b, 8) < 0.5 ? '#7cb85b' : '#9bcc68';
          const by = t.surfaceY(hx) + 0.8;
          g.beginPath();
          g.moveTo(hx - 1.1, by);
          g.quadraticCurveTo(hx + lean * 0.3, by - hh * 0.6, hx + lean, by - hh);
          g.quadraticCurveTo(hx + lean * 0.4, by - hh * 0.5, hx + 1.1, by);
          g.closePath();
          g.fillStyle = col;
          g.fill();
          g.lineWidth = 0.55;
          g.strokeStyle = 'rgba(58,42,31,0.85)';
          g.stroke();
        }
      } else if (m === MAT.SAND && h < 0.16) {
        const by = t.surfaceY(x);
        ell(g, x, by - 0.6, 1.4 + h * 4, 1.0 + h * 2);
        fill(g, h < 0.08 ? '#c9bfae' : '#dcc9a0');
        stroke(g, 0.45);
      } else if (m === MAT.SAND && h > 0.93) {
        // sparse dry grass sprigs in the desert
        const by = t.surfaceY(x);
        for (let b = -1; b <= 1; b++) {
          g.beginPath();
          g.moveTo(x, by);
          g.quadraticCurveTo(x + b * 2, by - 4, x + b * 3.5, by - 6 - Math.abs(b));
          g.lineWidth = 0.6;
          g.strokeStyle = '#a89255';
          g.stroke();
        }
      }
    }
  }

  // Dark humus under the jungle floor: soft bands that follow the surface.
  drawHumus(g, ia, ib, jx) {
    const t = this.terrain;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        for (const [off, w, a] of [[5, 9, 0.26], [14, 12, 0.12]]) {
          g.beginPath();
          run.forEach(([x, y], k) => (k ? g.lineTo(x, y + off) : g.moveTo(x, y + off)));
          g.lineWidth = w;
          g.lineCap = 'butt';
          g.lineJoin = 'round';
          g.strokeStyle = `rgba(38,24,12,${a})`;
          g.stroke();
        }
        g.lineCap = 'round';
      }
      run = [];
    };
    for (let i = ia; i < ib; i++) {
      const top = t.top[i];
      const x = i * CELL + CELL / 2;
      if (x > jx && top < GH && t.mat[top * GW + i] === MAT.SOIL && !t.isWater(i, top - 1)) run.push([x, t.surfaceY(x)]);
      else flush();
    }
    flush();
  }

  // Rainforest floor: roots, leaf litter, moss and lush undergrowth.
  drawForestFloor(g, t, i, x, h) {
    const by = t.surfaceY(x);
    if (h < 0.17) {
      // a root wandering down, with a side rootlet
      const len = 14 + hash2(i, 1, 21) * 22;
      const sw = (hash2(i, 2, 21) - 0.5) * 10;
      g.beginPath();
      g.moveTo(x, by + 2);
      g.bezierCurveTo(x + sw, by + len * 0.35, x - sw, by + len * 0.7, x + sw * 0.5, by + len);
      g.moveTo(x + sw * 0.15, by + len * 0.45);
      g.quadraticCurveTo(x + sw + 5, by + len * 0.55, x + sw + 7, by + len * 0.75);
      g.lineWidth = 0.7;
      g.strokeStyle = 'rgba(74,47,28,0.55)';
      g.stroke();
    }
    if (h > 0.4 && h < 0.52) {
      // moss cushion
      const r = 3 + h * 4;
      ell(g, x, by - 0.5, r, r * 0.45);
      fill(g, h < 0.46 ? '#7fae4a' : '#6a9a3c');
      stroke(g, 0.45, 'rgba(58,42,31,0.8)');
      for (let k = 0; k < 3; k++) {
        circ(g, x - r * 0.5 + k * r * 0.5, by - r * 0.3, 0.45);
        fill(g, '#a8cf6a');
      }
    }
    // lush, dark undergrowth blades
    const n = 3 + Math.floor(h * 3);
    for (let b = 0; b < n; b++) {
      const hx = x + (hash2(i, b, 5) - 0.5) * CELL * 1.8;
      const hh = 6 + hash2(i, b, 6) * 12;
      const lean = (hash2(i, b, 7) - 0.5) * 7;
      const cols = ['#4f8a3c', '#5f9e45', '#3f7a34', '#6fae4a'];
      const sy = t.surfaceY(hx) + 0.8;
      g.beginPath();
      g.moveTo(hx - 1.3, sy);
      g.quadraticCurveTo(hx + lean * 0.3, sy - hh * 0.6, hx + lean, sy - hh);
      g.quadraticCurveTo(hx + lean * 0.4, sy - hh * 0.5, hx + 1.3, sy);
      g.closePath();
      g.fillStyle = cols[Math.floor(hash2(i, b, 8) * cols.length)];
      g.fill();
      g.lineWidth = 0.55;
      g.strokeStyle = 'rgba(58,42,31,0.85)';
      g.stroke();
    }
    if (h > 0.86) {
      // a little fern sprig
      for (const side of [-1, 0, 1]) {
        const len = 10 + h * 6 - Math.abs(side) * 3;
        const a = -Math.PI / 2 + side * 0.7;
        const ex = x + Math.cos(a) * len;
        const ey = by + Math.sin(a) * len;
        g.beginPath();
        g.moveTo(x, by);
        g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, by + Math.sin(a) * len * 0.6 - 2, ex + side * 2, ey + 2);
        g.lineWidth = 0.7;
        g.strokeStyle = '#3f7a34';
        g.stroke();
        for (let k = 1; k <= 4; k++) {
          const tt = k / 5;
          const px = x + (ex - x) * tt;
          const py = by + (ey - by) * tt;
          for (const s of [-1, 1]) {
            ell(g, px + s * 1.4, py + 0.4, 1.5 * (1 - tt * 0.5), 0.6, a + s * 1.1);
            fill(g, '#5f9e45');
          }
        }
      }
    }
    // fallen leaves on top of everything
    if (h > 0.18 && h < 0.42 || h > 0.72 && h < 0.8) {
      const cols = ['#b9733a', '#c98a4a', '#8a5a2c', '#d9a050', '#8f9a42'];
      const lx = x + (hash2(i, 9, 3) - 0.5) * 3;
      const rot = (hash2(i, 9, 4) - 0.5) * 1.2;
      ell(g, lx, t.surfaceY(lx) - 0.4, 2.6, 1.1, rot);
      fill(g, cols[Math.floor(hash2(i, 9, 5) * cols.length)]);
      stroke(g, 0.45, 'rgba(58,42,31,0.85)');
      g.beginPath();
      g.moveTo(lx - Math.cos(rot) * 2.2, t.surfaceY(lx) - 0.4 - Math.sin(rot) * 2.2);
      g.lineTo(lx + Math.cos(rot) * 2.2, t.surfaceY(lx) - 0.4 + Math.sin(rot) * 2.2);
      g.lineWidth = 0.3;
      g.strokeStyle = 'rgba(58,42,31,0.5)';
      g.stroke();
    }
  }

  draw(ctx, view) {
    const span = CHUNK * CELL;
    const kx0 = Math.max(0, Math.floor(view.x0 / span));
    const kx1 = Math.min(CHW - 1, Math.floor(view.x1 / span));
    const ky0 = Math.max(0, Math.floor(view.y0 / span));
    const ky1 = Math.min(CHH - 1, Math.floor(view.y1 / span));
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const ch = this.chunks[ky * CHW + kx];
        if (!ch) continue;
        ctx.drawImage(ch.canvas, ch.x, ch.y, ch.size, ch.size);
      }
    }
  }
}

export { circ };
