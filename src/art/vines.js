// Vines trailing from the lid over the jungle. Every one is a different
// plant (pothos in a pot, string of pearls on a moss ball, a woody liana
// looping between two hooks, Spanish moss on a twig, pitcher plants...) so
// the canopy reads as a rainforest rather than a row of copies.
// Drawn hanging from (0,0) at the underside of the lid, +y is down.
import { INK, TAU, ell, circ, fill, stroke, paint, highlight, line, curve, fuzzPath } from './ink.js';
import { hash1 } from '../util/rng.js';
import { mix } from './plants.js';

const LW = 0.75;

function darker(c, t = 0.3) {
  return mix(c, '#24301a', t);
}
function lighter(c, t = 0.3) {
  return mix(c, '#fffbe8', t);
}

// A hanging strand: mostly straight near the top, swinging out more toward
// the tip like real trailing stems. Returns at(t) -> [x, y] for t in 0..1.
function hang(len, seed, { sway = 10, waves = 1.2, lean = 0, x0 = 0, y0 = 0 } = {}) {
  const a = (hash1(seed, 1) - 0.5) * 2 * sway;
  const ph = hash1(seed, 2) * TAU;
  const k = 0.6 + hash1(seed, 3) * 0.8;
  return (t) => [x0 + lean * t * t + a * Math.sin(t * Math.PI * waves * k + ph) * t, y0 + t * len];
}
function dirAt(at, t) {
  const a = at(Math.max(0, t - 0.01));
  const b = at(Math.min(1, t + 0.01));
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function trace(g, at, n, t0 = 0, t1 = 1) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const [x, y] = at(t0 + ((t1 - t0) * i) / n);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
}
// Ink-edged stem of width w.
function stem(g, at, w, col, n = 24, t0 = 0, t1 = 1) {
  trace(g, at, n, t0, t1);
  stroke(g, w + LW * 2, INK);
  trace(g, at, n, t0, t1);
  stroke(g, w, col);
}

// --------------------------------------------------------------- leaves
function heart(g, x, y, a, L, W, col, opts = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const path = () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-W * 0.35, -W * 0.95, L * 0.45, -W * 1.15, L * 0.7, -W * 0.5);
    g.quadraticCurveTo(L * 0.92, -W * 0.18, L * 1.15, 0);
    g.quadraticCurveTo(L * 0.92, W * 0.18, L * 0.7, W * 0.5);
    g.bezierCurveTo(L * 0.45, W * 1.15, -W * 0.35, W * 0.95, 0, 0);
    g.closePath();
  };
  paint(g, col, LW, path);
  if (opts.vari) {
    // cream marbling, like golden pothos
    g.save();
    path();
    g.clip();
    for (let i = 0; i < 3; i++) {
      const s = (hash1(opts.seed || 1, i) - 0.5) * W * 1.2;
      curve(g, L * 0.1, s * 0.2, L * 0.5, s, L * 1.05, s * 0.3, W * (0.18 + hash1(opts.seed || 1, i + 9) * 0.22), opts.vari);
    }
    g.restore();
    paint(g, null, LW, path);
  }
  if (opts.silver) {
    // string-of-hearts marbling: a pale heart inside the heart
    g.save();
    g.translate(L * 0.2, 0);
    g.scale(0.62, 0.62);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-W * 0.35, -W * 0.95, L * 0.45, -W * 1.15, L * 0.7, -W * 0.5);
    g.quadraticCurveTo(L * 0.92, -W * 0.18, L * 1.15, 0);
    g.quadraticCurveTo(L * 0.92, W * 0.18, L * 0.7, W * 0.5);
    g.bezierCurveTo(L * 0.45, W * 1.15, -W * 0.35, W * 0.95, 0, 0);
    g.fillStyle = opts.silver;
    g.fill();
    g.restore();
  }
  if (!opts.plain) line(g, 0, 0, L * 1.02, 0, LW * 0.55, darker(col, 0.35));
  highlight(g, L * 0.5, -W * 0.4, L * 0.24, W * 0.14, 0.24, 0);
  g.restore();
}

function oval(g, x, y, a, L, W, col, opts = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  paint(g, col, LW, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.25, -W, L * 0.8, -W * 0.9, L, 0);
    g.bezierCurveTo(L * 0.8, W * 0.9, L * 0.25, W, 0, 0);
    g.closePath();
  });
  if (opts.vein !== false) line(g, L * 0.08, 0, L * 0.86, 0, LW * 0.5, darker(col, 0.35));
  if (opts.speckle) {
    for (let i = 0; i < 5; i++) {
      circ(g, L * (0.2 + hash1(opts.seed || 3, i) * 0.6), (hash1(opts.seed || 3, i + 7) - 0.5) * W * 1.1, 0.35);
      fill(g, opts.speckle);
    }
  }
  highlight(g, L * 0.45, -W * 0.35, L * 0.28, W * 0.2, opts.gloss || 0.25, 0);
  g.restore();
}

// Three-lobed passion-vine leaf.
function trilobe(g, x, y, a, s, col) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  paint(g, col, LW, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(s * 0.3, -s * 0.9, s * 0.55, -s * 0.95);
    g.quadraticCurveTo(s * 0.62, -s * 0.5, s * 0.6, -s * 0.28);
    g.quadraticCurveTo(s * 1.0, -s * 0.38, s * 1.25, 0);
    g.quadraticCurveTo(s * 1.0, s * 0.38, s * 0.6, s * 0.28);
    g.quadraticCurveTo(s * 0.62, s * 0.5, s * 0.55, s * 0.95);
    g.quadraticCurveTo(s * 0.3, s * 0.9, 0, 0);
    g.closePath();
  });
  line(g, 0, 0, s * 1.1, 0, LW * 0.5, darker(col, 0.35));
  line(g, s * 0.25, 0, s * 0.5, -s * 0.75, LW * 0.45, darker(col, 0.35));
  line(g, s * 0.25, 0, s * 0.5, s * 0.75, LW * 0.45, darker(col, 0.35));
  g.restore();
}

// A curly tendril: a spiral that unwinds from the stem.
function tendril(g, x, y, a, r, turns, col) {
  g.beginPath();
  const n = Math.round(turns * 18);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = a + t * turns * TAU;
    const rr = r * (1 - t * 0.85);
    const px = x + Math.cos(a) * r * 1.6 * t + Math.cos(ang) * rr;
    const py = y + Math.sin(a) * r * 1.6 * t + Math.sin(ang) * rr;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  stroke(g, LW * 0.9, col);
}

// Leafy tuft where a vine pokes out from under the lid.
function tuft(g, seed, cols, n = 5, size = 8) {
  for (let k = 0; k < n; k++) {
    const a = Math.PI / 2 + (k / (n - 1) - 0.5) * 2.6;
    heart(g, 0, 2, a, size * (0.75 + hash1(seed, 40 + k) * 0.5), size * 0.62, cols[k % cols.length], { plain: true });
  }
}

// --------------------------------------------------------------- hangers
function strings(g, pts, col = '#c9a66a') {
  for (const [x, y] of pts) line(g, 0, -2, x, y, LW * 0.8, col);
  circ(g, 0, -1.5, 1.6);
  fill(g, '#b8a27a');
  stroke(g, LW * 0.6);
}
function terracotta(g, y) {
  strings(g, [[-9, y], [9, y]]);
  paint(g, '#d07a4a', LW, () => {
    g.beginPath();
    g.moveTo(-10, y);
    g.lineTo(10, y);
    g.lineTo(7.5, y + 12);
    g.lineTo(-7.5, y + 12);
    g.closePath();
  });
  paint(g, '#df8d5c', LW, () => {
    g.beginPath();
    g.rect(-11, y - 1.5, 22, 4);
  });
  highlight(g, -5, y + 6, 1.5, 4, 0.3, 0);
  return y + 1;
}
function coconut(g, y) {
  strings(g, [[-10, y + 1], [0, y - 1], [10, y + 1]], '#8a8a8a');
  paint(g, '#8a5a35', LW, () => {
    g.beginPath();
    g.moveTo(-11, y);
    g.quadraticCurveTo(-11, y + 13, 0, y + 13);
    g.quadraticCurveTo(11, y + 13, 11, y);
    g.closePath();
  });
  // coir fibres
  for (let i = 0; i < 7; i++) {
    const x = -8 + i * 2.7;
    curve(g, x, y + 1, x + 1, y + 6, x - 0.5, y + 11 - Math.abs(x) * 0.25, LW * 0.45, '#5e3c22');
  }
  paint(g, '#b88a52', LW * 0.8, () => ell(g, 0, y, 11, 2));
  return y + 1;
}
function mossBall(g, y, seed) {
  line(g, 0, -2, 0, y - 8, LW * 0.9, '#c9a66a');
  fuzzPath(g, 0, y, 9, 8.5, 18, 0.13, seed);
  fill(g, '#5f8a3c');
  stroke(g, LW);
  for (let i = 0; i < 9; i++) {
    circ(g, (hash1(seed, i) - 0.5) * 12, y + (hash1(seed, i + 20) - 0.5) * 11, 0.9);
    fill(g, i % 2 ? '#4a7232' : '#7aa64e');
  }
  // twine wrapped round it
  curve(g, -8, y - 3, 0, y + 1, 8, y - 4, LW * 0.7, '#c9a66a');
  curve(g, -8, y + 3, 0, y + 7, 8, y + 2, LW * 0.7, '#c9a66a');
  return y + 6;
}

// --------------------------------------------------------------- the vines
// Pothos: big variegated heart leaves on a sturdy stem, from a clay pot.
function pothos(g, v) {
  const top = terracotta(g, 8) + 10;
  const cols = ['#4f9a3c', '#5aa544', '#448a36'];
  for (const [n, f, s] of [[0, 1, 1], [1, 0.62, 2]]) {
    const at = hang(v.len * f - top, v.seed + n * 13, { sway: 9, lean: n ? -8 : 6, x0: n ? -5 : 4, y0: top });
    stem(g, at, 2.1, '#6a9a3a');
    const m = Math.floor(((v.len * f - top) / 15) * 1.1);
    for (let k = 1; k <= m; k++) {
      const t = k / (m + 0.4);
      const [x, y] = at(t);
      const side = (k + n) % 2 ? 1 : -1;
      const sz = (10 + hash1(v.seed + n, k) * 3) * (1 - t * 0.45);
      heart(g, x, y, dirAt(at, t) + side * (1.05 + hash1(v.seed, k + 30) * 0.4), sz, sz * 0.72, cols[k % 3], { vari: 'rgba(240,232,170,0.85)', seed: v.seed + k });
      // little aerial root at the node
      if (k % 3 === 0) curve(g, x, y, x - side * 3, y + 2, x - side * 4, y + 6, LW * 0.8, '#8a6a44');
    }
    // a pale new leaf still unrolling at the tip
    const [ex, ey] = at(1);
    oval(g, ex, ey, dirAt(at, 1), 6, 1.6, '#a6d36a', { vein: false });
  }
  // leaves spilling over the pot rim
  for (let k = 0; k < 4; k++) heart(g, (k - 1.5) * 6, top - 8, Math.PI / 2 + (k - 1.5) * 0.7, 8, 5.6, cols[k % 3], { vari: 'rgba(240,232,170,0.8)', seed: k });
}

// String of pearls: bead-like leaves on thread-thin stems, from a moss ball.
function pearls(g, v) {
  const top = mossBall(g, 18, v.seed);
  for (let n = 0; n < 4; n++) {
    const L = (v.len - top) * [1, 0.78, 0.6, 0.86][n];
    const at = hang(L, v.seed + n * 7, { sway: 6, waves: 0.9, x0: (n - 1.5) * 4, y0: top, lean: (n - 1.5) * 3 });
    stem(g, at, 0.7, '#7b8f4a', 30);
    const m = Math.floor(L / 4.6);
    for (let k = 1; k <= m; k++) {
      const t = k / m;
      const [x, y] = at(t);
      const side = k % 2 ? 1 : -1;
      const r = 2.3 - t * 0.6;
      const bx = x + side * r * 0.7;
      paint(g, k % 5 === 0 ? '#93c75a' : '#7cb84c', LW * 0.75, () => circ(g, bx, y, r));
      // the little translucent "window" stripe each pearl has
      curve(g, bx - r * 0.5, y - r * 0.2, bx, y - r * 0.6, bx + r * 0.5, y - r * 0.2, LW * 0.45, 'rgba(230,250,200,0.9)');
      circ(g, bx + r * 0.1, y + r * 0.85, 0.35);
      fill(g, INK);
    }
  }
}

// Woody liana: a thick twisted rope looping between two hooks in the lid,
// with a tail swinging from the far end.
function liana(g, v) {
  const span = v.span;
  const sag = v.sag;
  const loop = (t) => [t * span, Math.sin(t * Math.PI) * sag + Math.sin(t * Math.PI * 2) * sag * 0.06];
  const tail = hang(v.len, v.seed, { sway: 8, waves: 0.8, x0: span, y0: 0, lean: 6 });
  for (const at of [loop, tail]) {
    stem(g, at, 4.4, '#8a6a44', 30);
    // twisted bark: diagonal ridges along the rope
    for (let i = 1; i < 26; i++) {
      const t = i / 26;
      const [x, y] = at(t);
      const a = dirAt(at, t) + 0.9;
      line(g, x - Math.cos(a) * 2, y - Math.sin(a) * 2, x + Math.cos(a) * 2, y + Math.sin(a) * 2, LW * 0.55, '#5e4630');
    }
    // a thinner vine corkscrewing round the big one
    g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const [x, y] = at(t);
      const a = dirAt(at, t) + Math.PI / 2;
      const o = Math.sin(t * 34) * 3.2;
      if (i) g.lineTo(x + Math.cos(a) * o, y + Math.sin(a) * o);
      else g.moveTo(x + Math.cos(a) * o, y + Math.sin(a) * o);
    }
    stroke(g, 1.2 + LW * 2, INK);
    stroke(g, 1.2, '#7a9a4a');
  }
  // leaves sprouting along it
  const cols = ['#3f7a34', '#4f8a3c'];
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    const [x, y] = loop(t);
    const s = k % 2 ? 1 : -1;
    oval(g, x, y + 2, Math.PI / 2 + s * 0.8, 9 + hash1(v.seed, k) * 3, 3.6, cols[k % 2]);
  }
  for (let k = 1; k <= 3; k++) {
    const t = k / 3.6;
    const [x, y] = tail(t);
    oval(g, x, y, dirAt(tail, t) + (k % 2 ? 1 : -1) * 1.1, 8, 3.2, cols[k % 2]);
  }
  // the tail ends in a coil
  const [ex, ey] = tail(1);
  tendril(g, ex, ey, dirAt(tail, 1), 4, 1.6, '#8a6a44');
  // hooks in the lid
  for (const x of [0, span]) {
    curve(g, x - 2, -2, x - 3, 3, x, 4, LW * 1.4, '#9aa0a6');
    tuft(g, v.seed + x, ['#4f8a3c', '#6fae4a'], 3, 6);
  }
}

// Spanish moss draped over a twig hung on two strings.
function moss(g, v) {
  const y = 12;
  const w = 22;
  line(g, -w, y - 1, -w + 4, -2, LW * 0.8, '#c9a66a');
  line(g, w, y - 1, w - 4, -2, LW * 0.8, '#c9a66a');
  // the twig
  g.beginPath();
  g.moveTo(-w - 4, y + 1);
  g.quadraticCurveTo(0, y - 3, w + 4, y);
  stroke(g, 3.2 + LW * 2, INK);
  stroke(g, 3.2, '#8a6a44');
  curve(g, 6, y - 1, 10, y - 6, 15, y - 8, 1.4 + LW, INK);
  curve(g, 6, y - 1, 10, y - 6, 15, y - 8, 1.4, '#8a6a44');
  // the moss: soft crinkly grey-green strands, layered for fluff
  const shades = ['#a8b9a2', '#bccab3', '#93a68f', '#c9d4c0'];
  for (let layer = 0; layer < 2; layer++) {
    const N = layer ? 16 : 22;
    for (let i = 0; i < N; i++) {
      const sd = v.seed + i * 3 + layer * 100;
      const x0 = -w + ((i + 0.5) / N) * w * 2 + (hash1(sd, 1) - 0.5) * 3;
      const L = (v.len - y) * (layer ? 0.25 + hash1(sd, 2) * 0.45 : 0.35 + hash1(sd, 2) * 0.65) * (1 - Math.abs(x0) / (w * 2.4));
      const at = hang(L, sd, { sway: 3, waves: 0.7, x0, y0: y + 1 });
      g.beginPath();
      const n = Math.max(6, Math.round(L / 2.6));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const [x, yy] = at(t);
        const zig = Math.sin(k * 2.1 + hash1(sd, 3) * 6) * (0.8 + t * 0.9) * (0.6 + hash1(sd, k + 9) * 0.6);
        if (k) g.lineTo(x + zig, yy);
        else g.moveTo(x, yy);
      }
      stroke(g, layer ? 0.9 : 1.4, shades[(i + layer) % shades.length]);
      if (!layer && i % 4 === 0) stroke(g, 0.4, 'rgba(58,42,31,0.35)');
    }
  }
}

// Hoya: pairs of thick waxy leaves and balls of pink star flowers.
function hoya(g, v) {
  tuft(g, v.seed, ['#3f7a44', '#4a8a4c'], 4, 8);
  const at = hang(v.len, v.seed, { sway: 7, waves: 1.1, y0: 3 });
  stem(g, at, 1.8, '#7a7a4a');
  const m = Math.floor(v.len / 22);
  for (let k = 1; k <= m; k++) {
    const t = k / (m + 0.3);
    const [x, y] = at(t);
    const d = dirAt(at, t);
    for (const s of [-1, 1]) oval(g, x, y, d + s * 1.25, 9 - t * 2, 4.2 - t, '#3f7a44', { speckle: 'rgba(230,240,210,0.8)', seed: k * 2 + s, gloss: 0.45 });
  }
  // flower umbels
  for (const t of [0.42, 0.78]) {
    const [x, y] = at(t);
    const cx = x + 6;
    const cy = y + 10;
    curve(g, x, y, x + 6, y + 2, cx, cy - 4, LW, '#7a7a4a');
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 1.15 - Math.PI * 0.07;
      const r = i % 2 ? 6.6 : 4.4;
      star(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85, 3, '#f8d3dc');
    }
    star(g, cx, cy + 1.5, 3.1, '#f8d3dc');
  }
}
function star(g, x, y, r, col) {
  paint(g, col, LW * 0.4, () => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  });
  circ(g, x, y, r * 0.28);
  fill(g, '#b0303a');
}

// Passion flower twining round a jute cord.
function passion(g, v) {
  const L = v.len;
  // the cord
  line(g, 0, -2, 0, L, 1.6 + LW * 2, INK);
  line(g, 0, -2, 0, L, 1.6, '#d6b77a');
  for (let y = 4; y < L; y += 5) line(g, -0.8, y, 0.8, y + 2, LW * 0.5, '#9a7a4a');
  const helix = (t) => [Math.sin(t * 11) * 4.5, t * (L - 6) + 4];
  // back half of the twist first, then the front, so it wraps round the cord
  for (const front of [false, true]) {
    for (let i = 0; i < 44; i++) {
      const t0 = i / 44;
      const t1 = (i + 1) / 44;
      if (Math.cos(((t0 + t1) / 2) * 11) > 0 !== front) continue;
      g.beginPath();
      const a = helix(t0);
      const b = helix(t1);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      stroke(g, 1.5 + LW * 2, INK);
      stroke(g, 1.5, front ? '#5f9e45' : '#3f6e30');
    }
  }
  const cols = ['#4f8a3c', '#5f9e45'];
  const m = Math.floor(L / 20);
  for (let k = 1; k <= m; k++) {
    const t = k / (m + 0.5);
    const [x, y] = helix(t);
    const s = Math.sin(t * 11) > 0 ? 1 : -1;
    trilobe(g, x, y, s > 0 ? -0.35 : Math.PI + 0.35, 8 + hash1(v.seed, k) * 2, cols[k % 2]);
    if (k % 2) tendril(g, x - s * 2, y + 2, s > 0 ? Math.PI * 0.8 : Math.PI * 0.2, 3, 2.2, '#6f9a3c');
  }
  // flowers and a fruit
  passionFlower(g, 9, L * 0.36, 7.2);
  passionFlower(g, -8, L * 0.74, 6.2);
  const [fx, fy] = helix(0.56);
  curve(g, fx, fy, fx - 5, fy + 3, fx - 8, fy + 8, LW, '#6f9a3c');
  paint(g, '#7a4a8a', LW, () => ell(g, fx - 8, fy + 13, 4.2, 5.2));
  highlight(g, fx - 9.5, fy + 11, 1.3, 2, 0.4, 0);
}
function passionFlower(g, x, y, r) {
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    paint(g, i % 2 ? '#f4eefa' : '#e4dcf2', LW * 0.6, () => ell(g, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, r * 0.2, a));
  }
  // the fringed corona: purple at the heart, white band, purple tips
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    line(g, x + c * r * 0.2, y + s * r * 0.2, x + c * r * 0.45, y + s * r * 0.45, LW * 0.6, '#5a2d82');
    line(g, x + c * r * 0.45, y + s * r * 0.45, x + c * r * 0.62, y + s * r * 0.62, LW * 0.6, '#ffffff');
    line(g, x + c * r * 0.62, y + s * r * 0.62, x + c * r * 0.85, y + s * r * 0.85, LW * 0.6, '#7a4ab0');
  }
  paint(g, '#9ac25a', LW * 0.6, () => circ(g, x, y, r * 0.2));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    line(g, x, y, x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, LW * 0.6, '#6a8a3a');
    circ(g, x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 0.7);
    fill(g, '#f0bf45');
  }
}

// Morning glory: two stems twisted together, heart leaves and blue trumpets.
function morning(g, v) {
  tuft(g, v.seed, ['#6fae4a', '#7fbf5a'], 4, 7);
  const base = hang(v.len, v.seed, { sway: 10, waves: 1, y0: 2 });
  const twin = (o) => (t) => {
    const [x, y] = base(t);
    return [x + Math.sin(t * 26 + o) * 2.2, y];
  };
  stem(g, twin(0), 1.1, '#6a9a3a', 50);
  stem(g, twin(Math.PI), 1.1, '#5f8a34', 50);
  const m = Math.floor(v.len / 16);
  for (let k = 1; k <= m; k++) {
    const t = k / (m + 0.4);
    const [x, y] = base(t);
    const s = k % 2 ? 1 : -1;
    heart(g, x, y, dirAt(base, t) + s * 1.2, 7.5 - t * 1.5, 5.4 - t, k % 3 ? '#6fae4a' : '#7fbf5a');
  }
  const flowers = [[0.28, 1, '#5b8fe0'], [0.5, -1, '#7a6ad8'], [0.7, 1, '#5b8fe0'], [0.9, -1, '#e27aa8']];
  for (const [t, s, col] of flowers) {
    const [x, y] = base(t);
    trumpet(g, x + s * 3, y + 2, Math.PI / 2 - s * 0.9, 13, col);
  }
  // a twisted bud
  const [bx, by] = base(0.6);
  paint(g, '#c27ab8', LW * 0.8, () => ell(g, bx - 5, by + 4, 1.4, 3.6, 0.4));
  line(g, bx - 6, by + 2, bx - 4, by + 6, LW * 0.5, '#7a3a72');
}
function trumpet(g, x, y, a, s, col) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  paint(g, lighter(col, 0.5), LW * 0.8, () => {
    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(s * 0.6, -s * 0.22);
    g.lineTo(s * 0.6, s * 0.22);
    g.lineTo(0, 1);
    g.closePath();
  });
  paint(g, col, LW * 0.8, () => ell(g, s * 0.7, 0, s * 0.22, s * 0.5));
  for (let i = 0; i < 5; i++) {
    const b = (i / 5) * TAU;
    line(g, s * 0.7, 0, s * 0.7 + Math.cos(b) * s * 0.18, Math.sin(b) * s * 0.42, LW * 0.45, 'rgba(255,255,255,0.85)');
  }
  circ(g, s * 0.7, 0, s * 0.09);
  fill(g, '#fff6c0');
  g.restore();
}

// String of hearts: thread-thin purple stems with pairs of tiny marbled
// hearts, spilling from a coconut-shell basket.
function hearts(g, v) {
  const top = coconut(g, 9) + 8;
  for (let n = 0; n < 3; n++) {
    const L = (v.len - top) * [1, 0.66, 0.84][n];
    const at = hang(L, v.seed + n * 5, { sway: 5, waves: 0.8, x0: (n - 1) * 5, y0: top, lean: -3 - n * 2 });
    stem(g, at, 0.6, '#9a5a7a', 30);
    const m = Math.floor(L / 14);
    for (let k = 1; k <= m; k++) {
      const t = k / (m + 0.2);
      const [x, y] = at(t);
      for (const s of [-1, 1]) heartShape(g, x + s * 3.8, y + 0.6, s * 0.5, 3.3);
      if (k === Math.floor(m * 0.55) && n % 2 === 0) {
        // a little lantern flower
        g.save();
        g.translate(x + 1, y + 3);
        g.rotate(-0.25);
        paint(g, '#e7b9cf', LW * 0.6, () => ell(g, 0, 2.4, 1.3, 2.6));
        paint(g, '#7a3a5a', LW * 0.6, () => ell(g, 0, 5.8, 1.1, 1.4));
        g.restore();
      }
    }
  }
}
// A little heart, point down, dark green with a silvery heart inside.
function heartShape(g, x, y, a, r) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const path = (k) => {
    g.beginPath();
    g.moveTo(0, r * 0.9 * k);
    g.bezierCurveTo(-r * 1.3 * k, -r * 0.1 * k, -r * 0.9 * k, -r * 1.1 * k, 0, -r * 0.45 * k);
    g.bezierCurveTo(r * 0.9 * k, -r * 1.1 * k, r * 1.3 * k, -r * 0.1 * k, 0, r * 0.9 * k);
    g.closePath();
  };
  paint(g, '#6a9466', LW * 0.45, () => path(1));
  path(0.5);
  g.fillStyle = 'rgba(214,230,212,0.8)';
  g.fill();
  g.restore();
}

// Pitcher plant: strap leaves whose tips curl down into lidded cups.
function pitcher(g, v) {
  const cols = ['#6fae4a', '#7fbf5a', '#5f9e45'];
  for (let k = 0; k < 4; k++) oval(g, 0, 2, Math.PI / 2 + (k - 1.5) * 0.7, 13, 3, cols[k % 3]);
  const at = hang(v.len * 0.55, v.seed, { sway: 12, waves: 1.4, y0: 4, lean: -6 });
  stem(g, at, 1.6, '#7a8a3a');
  const cups = [[0.3, -1, 0.75, 1], [0.62, 1, 0.9, 0.85], [1, -1, 1.1, 1.15]];
  for (const [t, s, drop, size] of cups) {
    const [x, y] = at(t);
    // strap leaf out to one side
    oval(g, x, y, s > 0 ? -0.15 : Math.PI + 0.15, 14, 3.2, cols[Math.round(t * 3) % 3]);
    // tendril from the leaf tip down to the cup
    const tx = x + s * 14;
    const cy = y + 18 * drop;
    curve(g, tx, y, tx + s * 4, y + 6 * drop, tx + s * 2, cy - 10 * size, LW * 0.9, '#6f8a3a');
    cup(g, tx + s * 2, cy, size, s);
  }
}
function cup(g, x, y, s, side) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  // body: narrow at the top, round belly at the bottom
  paint(g, '#a6c85a', LW, () => {
    g.beginPath();
    g.moveTo(-3.2, -10);
    g.quadraticCurveTo(-3.4, -4, -5.4, 0);
    g.quadraticCurveTo(-6.4, 5.4, 0, 6);
    g.quadraticCurveTo(6.4, 5.4, 5.4, 0);
    g.quadraticCurveTo(3.4, -4, 3.2, -10);
    g.closePath();
  });
  // red blush and speckles
  g.save();
  g.beginPath();
  g.moveTo(-3.2, -10);
  g.quadraticCurveTo(-3.4, -4, -5.4, 0);
  g.quadraticCurveTo(-6.4, 5.4, 0, 6);
  g.quadraticCurveTo(6.4, 5.4, 5.4, 0);
  g.quadraticCurveTo(3.4, -4, 3.2, -10);
  g.clip();
  g.fillStyle = 'rgba(194,69,58,0.45)';
  g.fillRect(-7, -1, 14, 8);
  for (let i = 0; i < 7; i++) {
    circ(g, -3.5 + (i % 4) * 2.4, -6 + Math.floor(i / 2) * 2.4, 0.45);
    fill(g, '#a8382e');
  }
  g.restore();
  // ribbed wings down the front
  line(g, -1, -8, -1.6, 4, LW * 0.5, 'rgba(58,42,31,0.45)');
  line(g, 1, -8, 1.6, 4, LW * 0.5, 'rgba(58,42,31,0.45)');
  // the red lip and a lid propped open
  paint(g, '#c2453a', LW, () => ell(g, 0, -10, 3.8, 1.3));
  paint(g, '#8cbf4a', LW, () => {
    g.beginPath();
    g.moveTo(-side * 3, -11);
    g.quadraticCurveTo(-side * 4, -17, side * 2, -16);
    g.quadraticCurveTo(side * 3.5, -13.5, -side * 1, -11.4);
    g.closePath();
  });
  highlight(g, -2.6, 1, 1, 2.6, 0.4, 0);
  g.restore();
}

export const VINE_ART = { pothos, pearls, liana, moss, hoya, passion, morning, hearts, pitcher };

// Local drawing bounds for a vine's sprite.
export function vineBox(v) {
  if (v.kind === 'liana') return [-16, -6, v.span + 24, Math.max(v.sag, v.len) + 18];
  if (v.kind === 'pitcher') return [-30, -6, 30, v.len + 26];
  if (v.kind === 'moss') return [-32, -6, 32, v.len + 8];
  return [-28, -6, 28, v.len + 14];
}

export function drawVine(g, v) {
  const f = VINE_ART[v.kind] || pothos;
  f(g, v);
}

