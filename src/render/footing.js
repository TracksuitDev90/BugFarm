// Where a decoration meets the ground. It's sunk in a little (see seatOf in
// world.js), so the ground in front covers its base; a drift of the same
// sand, gravel or soil heaps against it and fills any dip under it; it's in
// shade where it sits; and a few things grow round its foot: weed in the
// pond, grass in the jungle, a dry sprig in the desert. Together they make a
// castle look settled into the gravel rather than stood on top of it.
import { MAT, INK, ZONE_X } from '../config.js';
import { hash2, noise1 } from '../util/rng.js';
import { clamp, smoothstep } from '../util/math.js';

const N = 28; // samples across a footing

// The ground's surface as it's drawn: the cells' tops softened, as the
// terrain's outline is (so a line along it doesn't step from cell to cell).
function surfaceAt(t, x) {
  return (t.surfaceY(x - 5) + 2 * t.surfaceY(x - 2.5) + 3 * t.surfaceY(x) + 2 * t.surfaceY(x + 2.5) + t.surfaceY(x + 5)) / 9;
}

// The shape of a decoration's footing, worked out again only when it's been
// moved or the ground under it has changed. Everything is in tank units:
//   xs: sample x's; ground: the ground's surface; top: the drift's top (or
//   the ground, where there's no drift); buried: how far down the
//   decoration reaches (the ground covers it down to there).
export function footingOf(d, t) {
  const def = d.def;
  const half = def.w / 2;
  const spread = clamp(def.w * 0.18, 5, 14);
  const x0 = d.x - half - spread;
  const x1 = d.x + half + spread;
  let f = d.ft;
  if (!f) f = d.ft = { xs: new Float32Array(N), ground: new Float32Array(N), top: new Float32Array(N), buried: new Float32Array(N), ink: new Uint8Array(N), key: '' };
  const { xs, ground, top, buried, ink } = f;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const x = x0 + ((x1 - x0) * i) / (N - 1);
    xs[i] = x;
    ground[i] = surfaceAt(t, x);
    sum += ground[i] * (i + 1);
  }
  const key = d.x + '|' + d.y + '|' + (d.lean || 0) + '|' + Math.round(sum);
  if (key === f.key) return f;
  f.key = key;
  const tl = Math.tan(d.lean || 0);
  // how high the drift piles against it (a little higher up its sides)
  const pile = clamp(def.h * 0.07, 2, 6);
  const midG = surfaceAt(t, d.x);
  const rest = Math.min(d.y, midG);
  for (let i = 0; i < N; i++) {
    const x = xs[i];
    const u = (x - d.x) / half;
    const base = d.y + tl * (x - d.x);
    // (gently uneven, as heaped-up ground is)
    const lump = (noise1(x * 0.14, d.id % 997) - 0.5) * 2;
    let line;
    if (Math.abs(u) <= 1) {
      // against the base: the ground's level here, or the base's if it
      // stands proud of a dip, with the drift heaped on top
      const lvl = Math.min(base, Math.max(ground[i], rest + tl * (x - d.x)));
      line = lvl - pile - 2.2 * smoothstep(0.5, 1, Math.abs(u)) + lump;
    } else {
      // running out from its sides and down to the ground
      const e = Math.min(base, ground[i]) - pile;
      const k = 1 - smoothstep(1, 1 + spread / half, Math.abs(u));
      line = ground[i] + (e - ground[i]) * k * k + lump * k;
    }
    top[i] = Math.min(ground[i], line);
    // (its outline dips a pixel or two below its base)
    buried[i] = Math.abs(u) <= 1.04 ? base + 1.5 : ground[i];
    // (the ground's own ink line is still there wherever it isn't covered)
    ink[i] = Math.abs(u) <= 1.04 || top[i] < ground[i] - 0.25 ? 1 : 0;
  }
  f.paths = null;
  return f;
}

// The footing's outlines as paths: the ground to put back over the buried
// base, the drift, everything below the drift's top (for shading in), and
// the top line itself (for inking).
export function footingPaths(f) {
  if (f.paths) return f.paths;
  const { xs, ground, top, buried, ink } = f;
  const under = new Path2D();
  under.moveTo(xs[0], ground[0] - 1);
  for (let i = 1; i < N; i++) under.lineTo(xs[i], ground[i] - 1);
  for (let i = N - 1; i >= 0; i--) under.lineTo(xs[i], Math.max(ground[i] - 1, buried[i]));
  under.closePath();
  const drift = new Path2D();
  drift.moveTo(xs[0], top[0]);
  for (let i = 1; i < N; i++) drift.lineTo(xs[i], top[i]);
  for (let i = N - 1; i >= 0; i--) drift.lineTo(xs[i], ground[i] + 1.5);
  drift.closePath();
  const below = new Path2D();
  below.moveTo(xs[0], top[0] - 0.5);
  for (let i = 1; i < N; i++) below.lineTo(xs[i], top[i] - 0.5);
  for (let i = N - 1; i >= 0; i--) below.lineTo(xs[i], Math.max(ground[i], buried[i]) + 7);
  below.closePath();
  const line = new Path2D();
  for (let i = 0; i < N; i++) {
    if (!ink[i]) continue;
    if (i && ink[i - 1]) line.lineTo(xs[i], top[i]);
    else line.moveTo(xs[i], top[i]);
  }
  f.paths = { under, drift, below, line };
  return f.paths;
}

// The bottom of a decoration is in shade where it meets the ground (baked
// into its picture, in its own units: (0, 0) is the middle of its base).
export function baseShade(g, def) {
  const h = clamp(def.h * 0.28, 6, 16);
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, -h, 0, 2);
  gr.addColorStop(0, 'rgba(46,30,16,0)');
  gr.addColorStop(1, 'rgba(46,30,16,0.3)');
  g.fillStyle = gr;
  g.fillRect(-def.w / 2 - 12, -h, def.w + 24, h + 8);
  g.restore();
}

const POND_WEED = ['#5f9e45', '#77b255', '#4f8a3c', '#8cc152'];
const JUNGLE_GRASS = ['#4f8a3c', '#5f9e45', '#3f7a34', '#6fae4a'];
const GRASS = ['#7cb85b', '#9bcc68'];

function blade(g, x, y, h, lean, w, col) {
  g.beginPath();
  g.moveTo(x - w, y);
  g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
  g.quadraticCurveTo(x + lean * 0.4, y - h * 0.5, x + w, y);
  g.closePath();
  g.fillStyle = col;
  g.fill();
  g.lineWidth = 0.55;
  g.strokeStyle = 'rgba(58,42,31,0.85)';
  g.stroke();
}

// What grows round its foot (drawn in tank units; sway: how far the water or
// the breeze is pushing things over just now).
export function drawGrowth(g, d, f, t, time, sway) {
  const def = d.def;
  const { xs, top } = f;
  const mid = t.surfaceY(d.x);
  const m = t.matAt(d.x, mid + 2);
  const wet = t.waterAt(d.x, mid - 4);
  const jungle = d.x > ZONE_X.jungle[0] - 30 && m === MAT.SOIL;
  const at = (x) => {
    const i = clamp(Math.round(((x - xs[0]) / (xs[N - 1] - xs[0])) * (N - 1)), 0, N - 1);
    return top[i] + 0.6;
  };
  const half = def.w / 2;
  const h0 = (k) => hash2(d.id, k, 71);
  if (wet) {
    // a few sprigs of pond weed taking hold round its foot, nodding in the current
    const n = 2 + Math.floor(h0(0) * 3);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const x = d.x + side * half * (0.75 + h0(k + 1) * 0.45);
      const hh = 6 + h0(k + 9) * 9;
      const lean = sway * hh * 0.5 + Math.sin(time * 1.3 + d.id + k * 2.1) * 1.4 + side * 1.2;
      blade(g, x, at(x), hh, lean, 1.1, POND_WEED[Math.floor(h0(k + 17) * POND_WEED.length)]);
    }
    // and a fuzz of moss on the drift
    for (let k = 0; k < 6; k++) {
      const x = d.x + (h0(k + 30) - 0.5) * def.w * 1.1;
      g.beginPath();
      g.ellipse(x, at(x) - 0.4, 1.4 + h0(k + 40) * 1.6, 0.7, 0, 0, Math.PI * 2);
      g.fillStyle = h0(k + 50) < 0.5 ? 'rgba(111,160,72,0.55)' : 'rgba(141,186,92,0.5)';
      g.fill();
    }
    return;
  }
  if (m === MAT.SOIL) {
    const cols = jungle ? JUNGLE_GRASS : GRASS;
    const n = jungle ? 5 + Math.floor(h0(0) * 3) : 3 + Math.floor(h0(0) * 2);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const x = d.x + side * half * (0.7 + h0(k + 1) * 0.5);
      const hh = (jungle ? 6 : 4) + h0(k + 9) * (jungle ? 10 : 6);
      const lean = sway * hh * 0.4 + (h0(k + 21) - 0.5) * 5 + side * 1.5;
      blade(g, x, at(x), hh, lean, jungle ? 1.3 : 1.1, cols[Math.floor(h0(k + 17) * cols.length)]);
    }
    if (jungle && h0(60) < 0.6) {
      // a moss cushion on one side
      const x = d.x + (h0(61) < 0.5 ? -1 : 1) * half * 0.9;
      const r = 2.6 + h0(62) * 2;
      g.beginPath();
      g.ellipse(x, at(x) - 0.4, r, r * 0.45, 0, 0, Math.PI * 2);
      g.fillStyle = '#6a9a3c';
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = 'rgba(58,42,31,0.8)';
      g.stroke();
    }
    return;
  }
  if (m === MAT.SAND || m === MAT.GRAVEL) {
    // a pebble or two rolled against it, and in the desert a dry sprig
    for (let k = 0; k < 2; k++) {
      const x = d.x + (k ? 1 : -1) * half * (0.85 + h0(k + 3) * 0.35);
      const r = 1.2 + h0(k + 5) * 1.3;
      g.beginPath();
      g.ellipse(x, at(x) - r * 0.4, r, r * 0.7, h0(k + 7), 0, Math.PI * 2);
      g.fillStyle = m === MAT.GRAVEL ? '#cfc3ad' : h0(k + 11) < 0.5 ? '#c9bfae' : '#dcc9a0';
      g.fill();
      g.lineWidth = 0.45;
      g.strokeStyle = INK;
      g.stroke();
    }
    if (m === MAT.SAND && h0(80) < 0.55) {
      const x = d.x + (h0(81) < 0.5 ? -1 : 1) * half * (0.8 + h0(82) * 0.3);
      const y = at(x);
      for (let b = -1; b <= 1; b++) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + b * 2 + sway * 2, y - 4, x + b * 3.5 + sway * 4, y - 6 - Math.abs(b));
        g.lineWidth = 0.6;
        g.strokeStyle = '#a89255';
        g.stroke();
      }
    }
  }
}

// The drift's top, made of what it's made of: a row of pebbles heaped along
// gravel, crumbs of soil, the odd grain of sand (pebbles: the gravel's colours).
export function drawDriftTop(g, d, f, mat, pebbles) {
  const { xs, top, ground } = f;
  if (mat === MAT.GRAVEL) {
    for (let i = 1; i < N - 1; i++) {
      const piled = ground[i] - top[i];
      if (piled < 0.8) continue;
      for (let k = 0; k < 2; k++) {
        const h = hash2(d.id, i * 2 + k, 91);
        const x = xs[i] + (h - 0.5) * 3;
        const rx = 1.2 + hash2(d.id, i * 2 + k, 92) * Math.min(1.2, piled * 0.4);
        const ry = rx * (0.65 + hash2(d.id, i * 2 + k, 93) * 0.3);
        const y = top[i] + ry * 0.55 + k * 1.6;
        const rot = hash2(d.id, i * 2 + k, 94) * 3;
        g.beginPath();
        g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        g.fillStyle = pebbles[Math.floor(hash2(d.id, i * 2 + k, 95) * pebbles.length)];
        g.fill();
        g.lineWidth = 0.35;
        g.strokeStyle = 'rgba(58,42,31,0.75)';
        g.stroke();
        g.beginPath();
        g.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.25, rot, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fill();
      }
    }
    return;
  }
  const crumb = mat === MAT.SOIL ? ['#5f3e28', '#9a6f4e', '#6b4a33'] : mat === MAT.SAND ? ['#c99c5f', '#f6e4b8', '#b58a52'] : null;
  if (!crumb) return;
  for (let i = 1; i < N - 1; i++) {
    if (ground[i] - top[i] < 0.8 || hash2(d.id, i, 96) > 0.45) continue;
    const x = xs[i] + (hash2(d.id, i, 97) - 0.5) * 3;
    const r = 0.45 + hash2(d.id, i, 98) * 0.5;
    g.beginPath();
    g.ellipse(x, top[i] + r + 0.6, r * 1.3, r, 0, 0, Math.PI * 2);
    g.fillStyle = crumb[Math.floor(hash2(d.id, i, 99) * crumb.length)];
    g.fill();
  }
}

// What the drift is made of, as the terrain paints it (its pattern if there
// is one, else a plain wash).
export function driftMaterial(d, t) {
  const m = t.matAt(d.x, t.surfaceY(d.x) + 2);
  return m || MAT.SAND;
}
