// Draws a plant from its procedural shape (see entities/plant.js).
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, line, curve, smoothPath, fuzzPath } from './ink.js';
import { hash1 } from '../util/rng.js';

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bb = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bb).toString(16).slice(1);
}
function darker(c, t = 0.25) {
  return mix(c, '#2a2a1a', t);
}

function stemPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    g.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const l = pts[pts.length - 1];
  g.lineTo(l[0], l[1]);
}

function ribbon(g, pts, w0, w1) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const t = i / (pts.length - 1);
    const w = (w0 * (1 - t) + w1 * t) / 2;
    left.push([pts[i][0] - (dy / l) * w, pts[i][1] + (dx / l) * w]);
    right.push([pts[i][0] + (dy / l) * w, pts[i][1] - (dx / l) * w]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
}

function ovateLeaf(g, l, col, lw) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.a);
  const L = l.len;
  const W = l.wid;
  const bitten = l.eaten > 0.25;
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.3, -W, L * 0.75, -W * 0.85, L, 0);
    if (bitten) {
      g.lineTo(L * 0.85, W * 0.25);
      g.lineTo(L * 0.92, W * 0.45);
      g.lineTo(L * 0.72, W * 0.55);
    }
    g.bezierCurveTo(L * 0.75, W * 0.85, L * 0.3, W, 0, 0);
    g.closePath();
  });
  line(g, 0, 0, L * 0.85, 0, lw * 0.5, darker(col, 0.35));
  highlight(g, L * 0.45, -W * 0.35, L * 0.22, W * 0.18, 0.25, 0);
  g.restore();
}

function bladeLeaf(g, l, col, lw) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.a);
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0, -l.wid * 0.5);
    g.quadraticCurveTo(l.len * 0.6, -l.wid * 0.6, l.len, 0);
    g.quadraticCurveTo(l.len * 0.6, l.wid * 0.6, 0, l.wid * 0.5);
    g.closePath();
  });
  g.restore();
}

function heartLeaf(g, l, col, lw) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.a);
  const L = l.len;
  const W = l.wid;
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-W * 0.4, -W * 0.9, W * 0.4, -W * 1.2, L * 0.6, -W * 0.6);
    g.bezierCurveTo(L * 0.9, -W * 0.35, L * 1.05, -W * 0.1, L * 1.2, 0);
    g.bezierCurveTo(L * 1.05, W * 0.1, L * 0.9, W * 0.35, L * 0.6, W * 0.6);
    g.bezierCurveTo(W * 0.4, W * 1.2, -W * 0.4, W * 0.9, 0, 0);
    g.closePath();
  });
  line(g, 0, 0, L * 1.1, 0, lw * 0.6, darker(col, 0.3));
  for (let i = 1; i <= 3; i++) {
    const x = (i / 4) * L;
    curve(g, x, 0, x + L * 0.12, -W * 0.3, x + L * 0.2, -W * 0.5 * (1 - i * 0.15), lw * 0.4, darker(col, 0.3));
    curve(g, x, 0, x + L * 0.12, W * 0.3, x + L * 0.2, W * 0.5 * (1 - i * 0.15), lw * 0.4, darker(col, 0.3));
  }
  highlight(g, L * 0.5, -W * 0.4, L * 0.25, W * 0.15, 0.22, 0);
  g.restore();
}

// Monstera: a heart-shaped leaf with slits running in from the edges.
function monsteraLeaf(g, l, col, lw) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.a);
  const L = l.len;
  const W = l.wid;
  const N = 14;
  const slitAt = l.splits >= 3 ? [4, 7, 10] : l.splits >= 1 ? [7] : [];
  const edge = (side) => {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -0.24 * L + 1.38 * L * t;
      const w = W * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.7) * (1 - 0.3 * t);
      pts.push([x, side * w]);
      if (slitAt.includes(i) && !(l.eaten > 0.3 && side > 0 && i === 10)) {
        // a narrow cut toward the midrib, angled back to the stalk
        pts.push([x - L * 0.1, side * w * 0.32]);
        pts.push([x + L * 0.035, side * w * 1.02]);
      }
    }
    return pts;
  };
  const top = edge(-1);
  const bot = edge(1).reverse();
  const outline = () => {
    g.beginPath();
    g.moveTo(0, 0);
    for (const p of top) g.lineTo(p[0], p[1]);
    for (const p of bot) g.lineTo(p[0], p[1]);
    g.closePath();
  };
  paint(g, col, lw, outline);
  line(g, -0.05 * L, 0, 1.08 * L, 0, lw * 0.6, darker(col, 0.3));
  for (let i = 1; i <= 4; i++) {
    const x = (i / 5) * L;
    curve(g, x, 0, x + L * 0.1, -W * 0.3, x + L * 0.08, -W * 0.62, lw * 0.35, darker(col, 0.25));
    curve(g, x, 0, x + L * 0.1, W * 0.3, x + L * 0.08, W * 0.62, lw * 0.35, darker(col, 0.25));
  }
  // a couple of little window holes near the midrib
  if (l.splits >= 3) {
    for (const [hx, hy] of [[0.36, -0.22], [0.58, 0.2]]) {
      ell(g, hx * L, hy * W, L * 0.05, W * 0.08, 0.3);
      g.fillStyle = darker(col, 0.55);
      g.fill();
      stroke(g, lw * 0.5);
    }
  }
  highlight(g, L * 0.45, -W * 0.38, L * 0.25, W * 0.14, 0.25, 0);
  g.restore();
}

// Palm frond: an arching midrib with narrow leaflets hanging off both sides.
function palmFrond(g, l, col, lw) {
  const pts = l.pts;
  const dark = darker(col, 0.18);
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i - 1];
    const [nx, ny] = pts[i];
    const a = Math.atan2(ny - y, nx - x);
    const s = (1 - i / (pts.length + 1)) * l.len * 0.16 + 2.5;
    for (const side of [-1, 1]) {
      // leaflets droop: bend them toward straight down
      let la = a + side * 1.0;
      la += (Math.PI / 2 - la) * 0.35;
      const mx = (x + nx) / 2;
      const my = (y + ny) / 2;
      blob(g, mx + Math.cos(la) * s * 0.5, my + Math.sin(la) * s * 0.5, s * 0.55, s * 0.14, side > 0 ? col : dark, lw * 0.55, la);
    }
  }
  stemPath(g, pts);
  stroke(g, lw * 2.4, INK);
  stroke(g, lw * 1.1, darker(col, 0.05));
}

function trefoil(g, l, col, lw) {
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k - 1) * 2.1;
    const x = l.x + Math.cos(a) * l.r * 0.8;
    const y = l.y + Math.sin(a) * l.r * 0.8;
    blob(g, x, y, l.r * 0.75, l.r * 0.65, col, lw, a);
    line(g, l.x, l.y, x, y, lw * 0.4, darker(col, 0.35));
  }
}

function frond(g, l, col, lw) {
  const pts = l.pts;
  stemPath(g, pts);
  stroke(g, lw * 2.4, INK);
  stroke(g, lw * 1.2, darker(col, 0.15));
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const a = Math.atan2(ny - y, nx - x);
    const s = (1 - i / pts.length) * 4 + 1.2;
    for (const side of [-1, 1]) {
      const la = a + side * 1.1;
      blob(g, x + Math.cos(la) * s * 0.7, y + Math.sin(la) * s * 0.7, s * 0.85, s * 0.42, col, lw * 0.7, la);
    }
  }
}

function fleshy(g, l, col, lw) {
  g.save();
  g.translate(l.x, l.y);
  g.rotate(l.a);
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0, -l.wid);
    g.quadraticCurveTo(l.len * 0.7, -l.wid * 0.8, l.len, 0);
    g.quadraticCurveTo(l.len * 0.7, l.wid * 0.8, 0, l.wid);
    g.closePath();
  });
  for (let i = 1; i < 4; i++) {
    circ(g, (i / 4) * l.len, -l.wid * (1 - i / 4) * 0.7, 0.4);
    fill(g, '#eef6e0');
  }
  highlight(g, l.len * 0.4, -l.wid * 0.3, l.len * 0.25, l.wid * 0.25, 0.3, 0);
  g.restore();
}

function flower(g, f, def, lw) {
  const r = f.r;
  if (r < 0.4) return;
  const pc = def.petals || '#fff';
  const cc = def.center || '#f0bf45';
  switch (f.shape) {
    case 'sun': {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        g.save();
        g.translate(f.x + Math.cos(a) * r * 0.9, f.y + Math.sin(a) * r * 0.9);
        g.rotate(a);
        paint(g, pc, lw * 0.7, () => {
          g.beginPath();
          g.moveTo(-r * 0.25, -r * 0.18);
          g.quadraticCurveTo(r * 0.5, -r * 0.2, r * 0.75, 0);
          g.quadraticCurveTo(r * 0.5, r * 0.2, -r * 0.25, r * 0.18);
          g.closePath();
        });
        g.restore();
      }
      blob(g, f.x, f.y, r * 0.62, r * 0.62, cc, lw);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4;
        const rr = Math.sqrt(i / 10) * r * 0.5;
        circ(g, f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, r * 0.06);
        fill(g, '#3a2a1f');
      }
      break;
    }
    case 'moon': {
      // a wide white moonflower with a pale five-pointed star
      paint(g, pc, lw, () => circ(g, f.x, f.y, r * 1.15));
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * TAU;
        const rr = i % 2 ? r * 0.35 : r * 1.05;
        g.lineTo(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
      }
      g.closePath();
      fill(g, 'rgba(232,236,200,0.75)');
      circ(g, f.x, f.y, r * 0.3);
      fill(g, cc);
      highlight(g, f.x - r * 0.4, f.y - r * 0.4, r * 0.35, r * 0.2, 0.5);
      break;
    }
    case 'tulip': {
      paint(g, pc, lw, () => {
        g.beginPath();
        g.moveTo(f.x - r, f.y - r * 0.4);
        g.quadraticCurveTo(f.x - r * 1.05, f.y + r * 1.1, f.x, f.y + r);
        g.quadraticCurveTo(f.x + r * 1.05, f.y + r * 1.1, f.x + r, f.y - r * 0.4);
        g.lineTo(f.x + r * 0.5, f.y - r * 0.05);
        g.lineTo(f.x, f.y - r * 0.6);
        g.lineTo(f.x - r * 0.5, f.y - r * 0.05);
        g.closePath();
      });
      highlight(g, f.x - r * 0.4, f.y + r * 0.1, r * 0.25, r * 0.5, 0.3, 0);
      break;
    }
    case 'puff': {
      fuzzPath(g, f.x, f.y, r, r, 14, 0.15, 4);
      fill(g, pc);
      stroke(g, lw * 0.7);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        line(g, f.x, f.y, f.x + Math.cos(a) * r * 0.7, f.y + Math.sin(a) * r * 0.7, lw * 0.35, 'rgba(160,60,90,0.4)');
      }
      break;
    }
    case 'bract': {
      // bromeliad: a spike of glossy red bracts tipped with little flowers
      const n = 5;
      for (let i = n - 1; i >= 0; i--) {
        const yy = f.y - i * r * 0.42;
        const w = r * (1 - i * 0.14);
        for (const side of [-1, 1]) {
          g.save();
          g.translate(f.x, yy);
          g.rotate(side * (0.7 - i * 0.05));
          paint(g, i % 2 ? pc : mix(pc, '#ffffff', 0.12), lw * 0.7, () => {
            g.beginPath();
            g.moveTo(-w * 0.18, 0);
            g.quadraticCurveTo(-w * 0.2, -w * 0.6, 0, -w * 0.95);
            g.quadraticCurveTo(w * 0.2, -w * 0.6, w * 0.18, 0);
            g.closePath();
          });
          g.restore();
        }
        if (f.open > 0.5 && i % 2 === 0) {
          circ(g, f.x + (i % 4 ? 1 : -1) * w * 0.5, yy - w * 0.7, r * 0.13);
          fill(g, f.pollinated ? '#c98a3a' : cc);
          stroke(g, lw * 0.4);
        }
      }
      highlight(g, f.x - r * 0.25, f.y - r * 0.9, r * 0.12, r * 0.5, 0.35, 0);
      break;
    }
    case 'lotus': {
      for (let i = -2; i <= 2; i++) {
        g.save();
        g.translate(f.x, f.y + r * 0.3);
        g.rotate(i * 0.42);
        paint(g, i % 2 ? pc : '#fbe3ec', lw * 0.8, () => {
          g.beginPath();
          g.moveTo(-r * 0.3, 0);
          g.quadraticCurveTo(-r * 0.35, -r * 0.9, 0, -r * 1.2);
          g.quadraticCurveTo(r * 0.35, -r * 0.9, r * 0.3, 0);
          g.closePath();
        });
        g.restore();
      }
      blob(g, f.x, f.y, r * 0.3, r * 0.2, cc, lw * 0.6);
      break;
    }
    default: {
      // daisy-style
      const n = def.memorial ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.2;
        blob(g, f.x + Math.cos(a) * r * 0.75, f.y + Math.sin(a) * r * 0.75, r * 0.55, r * 0.24, pc, lw * 0.6, a);
      }
      blob(g, f.x, f.y, r * 0.38, r * 0.38, f.pollinated ? '#c98a3a' : cc, lw * 0.8);
      break;
    }
  }
}

export function drawPlant(g, p, time) {
  const S = p.shape;
  const def = p.def;
  const lw = 0.75;
  const wither = p.dead ? 0.85 : Math.max(0, (0.75 - p.health) * 0.9);
  const leafCol = mix(def.leaf || '#77b255', '#b39a5a', wither);
  const stemCol = darker(leafCol, 0.12);

  if (S.extra) {
    for (const e of S.extra) {
      if (e.type !== 'trunk') continue;
      // ringed palm trunk, tapering to the crown
      const col = mix(def.trunk || '#9a7650', '#b39a5a', wither * 0.5);
      paint(g, col, lw, () => ribbon(g, e.pts, e.w, e.w * 0.6));
      for (let i = 1; i < e.pts.length - 1; i++) {
        const [x, y] = e.pts[i];
        const w = (e.w * (1 - (i / e.pts.length) * 0.4)) / 2;
        curve(g, x - w, y + 0.6, x, y - 0.8, x + w, y + 0.6, lw * 0.5, darker(col, 0.3));
      }
      highlight(g, e.pts[3][0] - e.w * 0.2, e.pts[3][1], e.w * 0.15, Math.abs(e.pts[6][1] - e.pts[1][1]) * 0.3, 0.25, 0);
    }
  }
  for (const s of S.stems) {
    stemPath(g, s.pts);
    stroke(g, s.w + lw * 2, INK);
    stroke(g, s.w, s.underwater ? '#7aa35a' : stemCol);
  }
  for (const b of S.blades) {
    const col = def.kind === 'eelgrass' ? mix('#5f9e45', '#b39a5a', wither) : leafCol;
    paint(g, col, lw * 0.8, () => ribbon(g, b.pts, b.w, 0.3));
    if (b.w > 2.5) {
      stemPath(g, b.pts);
      stroke(g, lw * 0.4, darker(col, 0.3));
    }
  }
  for (const l of S.leaves) {
    switch (l.shape) {
      case 'blade':
        bladeLeaf(g, l, leafCol, lw);
        break;
      case 'frond':
        frond(g, l, leafCol, lw);
        break;
      case 'trefoil':
        trefoil(g, l, leafCol, lw);
        break;
      case 'heart':
        heartLeaf(g, l, leafCol, lw);
        break;
      case 'fleshy':
        fleshy(g, l, leafCol, lw);
        break;
      case 'monstera':
        monsteraLeaf(g, l, leafCol, lw);
        break;
      case 'palmFrond':
        palmFrond(g, l, leafCol, lw);
        break;
      default:
        ovateLeaf(g, l, leafCol, lw);
    }
  }
  for (const pd of S.pads) {
    const col = mix('#6fae4a', '#b39a5a', wither);
    paint(g, col, lw, () => {
      g.beginPath();
      g.ellipse(pd.x, pd.y, pd.r, pd.r * 0.32, 0, pd.notch + 0.35, pd.notch + TAU - 0.35);
      g.lineTo(pd.x, pd.y);
      g.closePath();
    });
    ell(g, pd.x - pd.r * 0.25, pd.y - pd.r * 0.08, pd.r * 0.45, pd.r * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fill();
  }
  if (S.extra) {
    for (const e of S.extra) {
      if (e.type === 'mushroom') {
        paint(g, '#f6f0e0', lw, () => {
          g.beginPath();
          g.moveTo(-2.4, 0);
          g.quadraticCurveTo(-3, -e.sh * 0.6, -2, -e.sh);
          g.lineTo(2, -e.sh);
          g.quadraticCurveTo(3, -e.sh * 0.6, 2.4, 0);
          g.closePath();
        });
        const cap = mix(def.cap, '#9a7a5a', wither);
        paint(g, cap, lw, () => {
          g.beginPath();
          g.moveTo(-e.cr, -e.sh + 1);
          g.bezierCurveTo(-e.cr, -e.sh - e.cr * 1.25, e.cr, -e.sh - e.cr * 1.25, e.cr, -e.sh + 1);
          if (e.eaten > 0.2) {
            g.lineTo(e.cr * 0.6, -e.sh - 0.5);
            g.lineTo(e.cr * 0.4, -e.sh + 1);
          }
          g.closePath();
        });
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + 0.4 + i * 0.55;
          circ(g, Math.cos(a) * e.cr * 0.6, -e.sh - e.cr * 0.25 + Math.sin(a) * e.cr * 0.55, e.cr * 0.13);
          fill(g, def.spots);
        }
        highlight(g, -e.cr * 0.3, -e.sh - e.cr * 0.7, e.cr * 0.3, e.cr * 0.12, 0.4, -0.2);
      } else if (e.type === 'cactus') {
        const col = mix(def.leaf, '#b39a5a', wither);
        const arm = (side, y0, h) => {
          paint(g, col, lw, () => {
            g.beginPath();
            const x0 = side * e.w * 0.7;
            const x1 = side * (e.w + 9);
            g.moveTo(x0, y0 + 2.5);
            g.lineTo(x1 - side * 2, y0 + 2.5);
            g.quadraticCurveTo(x1 + side * 2.5, y0 + 2.5, x1 + side * 2.5, y0 - 2);
            g.lineTo(x1 + side * 2.5, y0 - h);
            g.quadraticCurveTo(x1, y0 - h - 3.5, x1 - side * 2.5, y0 - h);
            g.lineTo(x1 - side * 2.5, y0 - 2.5);
            g.lineTo(x0, y0 - 2.5);
            g.closePath();
          });
        };
        if (e.arms >= 1) arm(1, -e.h * 0.45, e.armH * 0.6);
        if (e.arms >= 2) arm(-1, -e.h * 0.6, e.armH * 0.45);
        paint(g, col, lw, () => {
          g.beginPath();
          g.moveTo(-e.w, 0);
          g.lineTo(-e.w, -e.h + e.w);
          g.quadraticCurveTo(-e.w, -e.h, 0, -e.h);
          g.quadraticCurveTo(e.w, -e.h, e.w, -e.h + e.w);
          g.lineTo(e.w, 0);
          g.closePath();
        });
        for (const x of [-e.w * 0.45, e.w * 0.45]) line(g, x, -2, x, -e.h + e.w * 0.8, lw * 0.5, darker(col, 0.3));
        for (let i = 0; i < 8; i++) {
          const y = -4 - i * (e.h / 9);
          for (const x of [-e.w, 0, e.w]) {
            line(g, x, y, x + (x < 0 ? -1.4 : x > 0 ? 1.4 : 0.5), y - 0.9, lw * 0.35);
          }
        }
        highlight(g, -e.w * 0.4, -e.h * 0.55, e.w * 0.25, e.h * 0.25, 0.25, 0);
      } else if (e.type === 'cattail' && e.h > 0.5) {
        blob(g, e.x, e.y - e.h / 2, 2.2, e.h / 2, def.head, lw);
        line(g, e.x, e.y - e.h, e.x, e.y - e.h - 3, lw * 0.8);
      }
    }
  }
  for (const f of S.flowers) flower(g, f, def, lw);
  for (const fr of S.fruits) {
    const col = mix('#9ccf5a', def.fruit || '#e2453f', Math.min(1, fr.ripe * 1.2));
    const r = fr.r * (1 - fr.eaten * 0.6);
    paint(g, col, lw * 0.8, () => {
      g.beginPath();
      g.moveTo(fr.x, fr.y + r);
      g.bezierCurveTo(fr.x - r * 1.2, fr.y + r * 0.2, fr.x - r, fr.y - r, fr.x, fr.y - r * 0.9);
      g.bezierCurveTo(fr.x + r, fr.y - r, fr.x + r * 1.2, fr.y + r * 0.2, fr.x, fr.y + r);
      g.closePath();
    });
    for (let i = 0; i < 4; i++) {
      circ(g, fr.x + (hash1(i, 5) - 0.5) * r, fr.y + (hash1(i, 6) - 0.5) * r, 0.25);
      fill(g, '#f6e27a');
    }
    blob(g, fr.x, fr.y - r * 0.9, r * 0.6, r * 0.25, '#77b255', lw * 0.6);
  }
}

// A trailing vine hanging from the tank lid in the jungle: a leafy clump at
// the top and heart-shaped leaves alternating down a wandering stem.
export function drawVine(g, len, seed) {
  const lw = 0.75;
  const h = (k) => hash1(seed, k);
  const sway = (h(1) - 0.5) * 16;
  const at = (t) => [sway * Math.sin(t * Math.PI * (1 + h(2))) * t, t * len];
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push(at(i / 12));
  stemPath(g, pts);
  stroke(g, 2.2 + lw * 2, INK);
  stroke(g, 2.2, '#5a7a32');
  const cols = ['#4f8a3c', '#5f9e45', '#3f7a34', '#6fae4a'];
  const n = Math.floor(len / 11);
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 0.5);
    const [x, y] = at(t);
    const side = k % 2 ? 1 : -1;
    const size = (5.5 + h(10 + k) * 3) * (1 - t * 0.35);
    heartLeaf(g, { x, y, a: Math.PI / 2 + side * (0.9 + h(30 + k) * 0.5), len: size, wid: size * 0.75 }, cols[Math.floor(h(20 + k) * cols.length)], lw);
  }
  // the clump where it hangs from the lid
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k / 4 - 0.5) * 2.6;
    heartLeaf(g, { x: 0, y: 2, a, len: 8 + h(40 + k) * 4, wid: 6 }, cols[k % cols.length], lw);
  }
}

export { mix };
