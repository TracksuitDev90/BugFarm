// Drawing helpers that give everything a hand-inked, watercolour picture-book
// look: uniform warm ink outlines, flat fills nudged slightly off the line
// (like old offset printing), soft highlights and rosy cheeks.
import { INK } from '../config.js';
import { hash1 } from '../util/rng.js';

export { INK };
export const TAU = Math.PI * 2;

export const PAL = {
  cream: '#fbf3df',
  paper: '#f7eed6',
  red: '#d9483b',
  tomato: '#e2553f',
  orange: '#f0913a',
  mustard: '#f0bf45',
  yellow: '#f6d64a',
  leaf: '#77b255',
  grass: '#8cc152',
  darkLeaf: '#4f8a3c',
  sky: '#7cc0e6',
  blue: '#4c8fd6',
  navy: '#36507f',
  pink: '#f39a9a',
  rose: '#e57a8a',
  cheek: 'rgba(238,110,110,0.55)',
  white: '#fffdf6',
  brown: '#9a6a3f',
  dark: '#3a2a1f',
  grey: '#9aa0a6',
  purple: '#8d6cc0',
};

// Fill offset used to fake print misregistration; scaled by line width.
let MIS = 0.35;
export function setMisregistration(v) {
  MIS = v;
}

export function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
}
export function circ(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.abs(r), 0, TAU);
}
export function stroke(ctx, lw, color = INK) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}
export function fill(ctx, color) {
  ctx.fillStyle = color;
  ctx.fill();
}

// Draw the current path filled (slightly offset) then inked.
export function paint(ctx, color, lw, pathFn) {
  if (color) {
    ctx.save();
    ctx.translate(MIS * lw, MIS * lw * 0.6);
    pathFn();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  if (lw) {
    pathFn();
    stroke(ctx, lw);
  }
}

export function blob(ctx, x, y, rx, ry, color, lw, rot = 0) {
  paint(ctx, color, lw, () => ell(ctx, x, y, rx, ry, rot));
}

// Wobbly closed shape through points (hand-drawn feel) using quadratic midpoints.
export function smoothPath(ctx, pts, closed = true) {
  const n = pts.length;
  ctx.beginPath();
  if (!closed) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    return;
  }
  const m0x = (pts[n - 1][0] + pts[0][0]) / 2;
  const m0y = (pts[n - 1][1] + pts[0][1]) / 2;
  ctx.moveTo(m0x, m0y);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}

// Fuzzy outline (for bees, pollen, moss).
export function fuzzPath(ctx, x, y, rx, ry, bumps, amp, seed = 1) {
  const pts = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * TAU;
    const k = 1 + (i % 2 ? amp : -amp * 0.4) + (hash1(i, seed) - 0.5) * amp * 0.6;
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  smoothPath(ctx, pts, true);
}

export function highlight(ctx, x, y, rx, ry, alpha = 0.35, rot = -0.4) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ell(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

export function shadowBlob(ctx, x, y, rx, ry, alpha = 0.18) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ell(ctx, x, y, rx, ry);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.restore();
}

export function cheek(ctx, x, y, r) {
  ell(ctx, x, y, r * 1.15, r * 0.8);
  ctx.fillStyle = PAL.cheek;
  ctx.fill();
}

// Picture-book eye: white oval, ink outline, dark pupil with a glint.
export function eye(ctx, x, y, r, lw, opts = {}) {
  const closed = opts.closed;
  if (closed) {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.2, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
    stroke(ctx, lw * 0.9);
    return;
  }
  const lx = opts.lookX == null ? 0.35 : opts.lookX;
  const ly = opts.lookY == null ? 0 : opts.lookY;
  ell(ctx, x, y, r * 0.85, r);
  fill(ctx, opts.white || PAL.white);
  stroke(ctx, lw * 0.8);
  const pr = r * (opts.pupil || 0.5);
  circ(ctx, x + lx * r * 0.4, y + ly * r * 0.35, pr);
  fill(ctx, opts.pupilColor || INK);
  circ(ctx, x + lx * r * 0.4 + pr * 0.35, y + ly * r * 0.35 - pr * 0.4, pr * 0.35);
  fill(ctx, '#ffffff');
}

// Tiny bug eye: a glossy dot.
export function dotEye(ctx, x, y, r, closed, color = INK) {
  if (closed) {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x, y + r * 0.9, x + r, y);
    stroke(ctx, r * 0.6, color);
    return;
  }
  circ(ctx, x, y, r);
  fill(ctx, color);
  circ(ctx, x + r * 0.35, y - r * 0.35, r * 0.38);
  fill(ctx, '#ffffff');
}

export function smile(ctx, x, y, w, lw, open = false) {
  ctx.beginPath();
  if (open) {
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + w * 1.4, x + w, y);
    ctx.closePath();
    fill(ctx, '#b3473f');
    stroke(ctx, lw);
    return;
  }
  ctx.moveTo(x - w, y - w * 0.15);
  ctx.quadraticCurveTo(x, y + w * 0.8, x + w, y - w * 0.15);
  stroke(ctx, lw);
}

export function line(ctx, x1, y1, x2, y2, lw, color = INK) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  stroke(ctx, lw, color);
}
export function bent(ctx, x1, y1, kx, ky, x2, y2, lw, color = INK) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(kx, ky);
  ctx.lineTo(x2, y2);
  stroke(ctx, lw, color);
}
export function curve(ctx, x1, y1, cx, cy, x2, y2, lw, color = INK) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  stroke(ctx, lw, color);
}

// Antenna with a little knob on the end.
export function antenna(ctx, x1, y1, cx, cy, x2, y2, lw, knob = 0) {
  curve(ctx, x1, y1, cx, cy, x2, y2, lw);
  if (knob > 0) {
    circ(ctx, x2, y2, knob);
    fill(ctx, INK);
  }
}

export function wing(ctx, x, y, rx, ry, rot, lw, tint = 'rgba(214,236,250,0.62)') {
  ell(ctx, x, y, rx, ry, rot);
  fill(ctx, tint);
  stroke(ctx, lw * 0.7);
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(rot) * rx * 0.8, y - Math.sin(rot) * rx * 0.8);
  ctx.lineTo(x + Math.cos(rot) * rx * 0.6, y + Math.sin(rot) * rx * 0.6);
  stroke(ctx, lw * 0.35, 'rgba(58,42,31,0.5)');
}

// ---------------------------------------------------------------------------
// Accessories: tiny hats, bows and scarves, placed at a head anchor.
// (x,y) is the top of the head, s is a size unit (~head radius), lw the ink width.
export const ACCESSORIES = ['beret', 'cap', 'bow', 'scarf', 'bowtie', 'flower', 'sunhat', 'bowler', 'beanie'];
const ACC_COLORS = ['#d9483b', '#4c8fd6', '#f0bf45', '#77b255', '#e57a8a', '#8d6cc0', '#f0913a'];

export function accessoryColor(seed) {
  return ACC_COLORS[Math.floor(hash1(seed, 77) * ACC_COLORS.length)];
}

export function drawHat(ctx, kind, x, y, s, lw, color, facing = 1) {
  ctx.save();
  ctx.translate(x, y);
  switch (kind) {
    case 'beret': {
      paint(ctx, color, lw, () => ell(ctx, 0, -s * 0.15, s * 1.05, s * 0.42, -0.12));
      line(ctx, -s * 0.05, -s * 0.55, s * 0.08, -s * 0.85, lw);
      break;
    }
    case 'cap': {
      paint(ctx, color, lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.85, 0);
        ctx.quadraticCurveTo(-s * 0.8, -s * 1.0, 0, -s * 1.0);
        ctx.quadraticCurveTo(s * 0.8, -s * 1.0, s * 0.85, 0);
        ctx.closePath();
      });
      paint(ctx, color, lw, () => ell(ctx, s * 0.95, -s * 0.02, s * 0.6, s * 0.16));
      circ(ctx, 0, -s * 1.02, s * 0.14);
      fill(ctx, '#fff');
      break;
    }
    case 'bowler': {
      paint(ctx, '#4a3a33', lw, () => ell(ctx, 0, 0, s * 1.15, s * 0.22));
      paint(ctx, '#4a3a33', lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, 0);
        ctx.quadraticCurveTo(-s * 0.75, -s * 1.1, 0, -s * 1.1);
        ctx.quadraticCurveTo(s * 0.75, -s * 1.1, s * 0.7, 0);
        ctx.closePath();
      });
      line(ctx, -s * 0.7, -s * 0.22, s * 0.7, -s * 0.22, lw * 1.6, color);
      break;
    }
    case 'sunhat': {
      paint(ctx, '#f2d48a', lw, () => ell(ctx, 0, 0, s * 1.6, s * 0.3));
      paint(ctx, '#f2d48a', lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.75, 0);
        ctx.quadraticCurveTo(-s * 0.7, -s * 0.95, 0, -s * 0.95);
        ctx.quadraticCurveTo(s * 0.7, -s * 0.95, s * 0.75, 0);
        ctx.closePath();
      });
      line(ctx, -s * 0.72, -s * 0.2, s * 0.72, -s * 0.2, lw * 1.8, color);
      break;
    }
    case 'beanie': {
      paint(ctx, color, lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.9, 0);
        ctx.quadraticCurveTo(-s * 0.9, -s * 1.1, 0, -s * 1.1);
        ctx.quadraticCurveTo(s * 0.9, -s * 1.1, s * 0.9, 0);
        ctx.closePath();
      });
      line(ctx, -s * 0.9, -s * 0.12, s * 0.9, -s * 0.12, lw * 2.2, '#fff');
      circ(ctx, 0, -s * 1.2, s * 0.28);
      fill(ctx, '#fff');
      stroke(ctx, lw * 0.8);
      break;
    }
    case 'bow': {
      paint(ctx, color, lw, () => {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.2);
        ctx.lineTo(-s * 0.8, -s * 0.65);
        ctx.lineTo(-s * 0.8, s * 0.25);
        ctx.closePath();
        ctx.moveTo(0, -s * 0.2);
        ctx.lineTo(s * 0.8, -s * 0.65);
        ctx.lineTo(s * 0.8, s * 0.25);
        ctx.closePath();
      });
      circ(ctx, 0, -s * 0.2, s * 0.22);
      fill(ctx, color);
      stroke(ctx, lw * 0.8);
      break;
    }
    case 'flower': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        paint(ctx, '#fff', lw * 0.7, () => ell(ctx, Math.cos(a) * s * 0.42, -s * 0.3 + Math.sin(a) * s * 0.42, s * 0.3, s * 0.3));
      }
      circ(ctx, 0, -s * 0.3, s * 0.24);
      fill(ctx, '#f0bf45');
      stroke(ctx, lw * 0.6);
      break;
    }
    case 'hardhat': {
      paint(ctx, '#f6c832', lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.85, 0);
        ctx.quadraticCurveTo(-s * 0.85, -s * 1.05, 0, -s * 1.05);
        ctx.quadraticCurveTo(s * 0.85, -s * 1.05, s * 0.85, 0);
        ctx.closePath();
      });
      line(ctx, -s * 1.05, 0, s * 1.15, 0, lw * 1.4, '#e0a91f');
      line(ctx, 0, -s * 1.0, 0, -s * 0.15, lw * 0.6);
      break;
    }
    case 'crown': {
      paint(ctx, '#f3c43c', lw, () => {
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, 0);
        ctx.lineTo(-s * 0.85, -s * 0.9);
        ctx.lineTo(-s * 0.4, -s * 0.45);
        ctx.lineTo(0, -s * 1.05);
        ctx.lineTo(s * 0.4, -s * 0.45);
        ctx.lineTo(s * 0.85, -s * 0.9);
        ctx.lineTo(s * 0.8, 0);
        ctx.closePath();
      });
      circ(ctx, 0, -s * 0.3, s * 0.16);
      fill(ctx, '#d9483b');
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

export function drawNeckwear(ctx, kind, x, y, s, lw, color) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'scarf') {
    paint(ctx, color, lw, () => ell(ctx, 0, 0, s * 0.45, s * 0.95, 0.15));
    paint(ctx, color, lw, () => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, s * 0.3);
      ctx.lineTo(-s * 1.2, s * 0.9);
      ctx.lineTo(-s * 1.0, s * 1.35);
      ctx.lineTo(s * 0.1, s * 0.75);
      ctx.closePath();
    });
  } else if (kind === 'bowtie') {
    paint(ctx, color, lw, () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-s * 0.5, -s * 0.45);
      ctx.lineTo(-s * 0.5, s * 0.45);
      ctx.closePath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.5, -s * 0.45);
      ctx.lineTo(s * 0.5, s * 0.45);
      ctx.closePath();
    });
    circ(ctx, 0, 0, s * 0.16);
    fill(ctx, INK);
  }
  ctx.restore();
}

export function isNeckwear(kind) {
  return kind === 'scarf' || kind === 'bowtie';
}

// Wobbly helper: deterministic offset for hand-drawn jitter.
export function jit(i, seed, amp) {
  return (hash1(i, seed) - 0.5) * 2 * amp;
}
