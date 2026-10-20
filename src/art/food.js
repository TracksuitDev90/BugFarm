// Parametric food art. Every food is drawn from a small set of shapes,
// coloured by its catalog entry. Spoiling adds bruises and fuzzy mould.
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, line, curve, smoothPath, fuzzPath } from './ink.js';
import { hash1 } from '../util/rng.js';

const SHAPES = {
  appleSlice(g, c, lw) {
    paint(g, c[1], lw, () => {
      g.beginPath();
      g.arc(0, 1, 6, Math.PI, 0);
      g.closePath();
    });
    paint(g, c[0], lw * 0.7, () => {
      g.beginPath();
      g.arc(0, 1, 4.8, Math.PI, 0);
      g.closePath();
    });
    ell(g, -1.2, -1.2, 0.5, 0.9, 0.4);
    fill(g, '#5a3a2a');
    ell(g, 1.2, -1.2, 0.5, 0.9, -0.4);
    fill(g, '#5a3a2a');
  },
  pearSlice(g, c, lw) {
    paint(g, c[1], lw, () => {
      g.beginPath();
      g.moveTo(-5, 1.5);
      g.bezierCurveTo(-5, -3, -2, -3, -1.5, -5);
      g.bezierCurveTo(-1, -7, 2, -6, 2, -4);
      g.bezierCurveTo(3, -3, 5.5, -2, 5.5, 1.5);
      g.closePath();
    });
    paint(g, c[0], lw * 0.6, () => {
      g.beginPath();
      g.moveTo(-4, 1);
      g.bezierCurveTo(-4, -2.4, -1.2, -2.4, -0.8, -4);
      g.bezierCurveTo(-0.4, -5.6, 1.4, -5, 1.4, -3.4);
      g.bezierCurveTo(2.4, -2.4, 4.5, -1.6, 4.5, 1);
      g.closePath();
    });
    ell(g, 0.6, -0.8, 0.45, 0.8, 0.2);
    fill(g, '#5a3a2a');
  },
  coin(g, c, lw) {
    blob(g, 0, -1.6, 5.4, 2.6, c[1], lw);
    ell(g, 0, -2.0, 4.3, 1.9);
    fill(g, c[0]);
    if (c[2]) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        circ(g, Math.cos(a) * 2.2, -2 + Math.sin(a) * 0.9, 0.35);
        fill(g, c[2]);
      }
    }
    highlight(g, -1.6, -2.6, 1.6, 0.5, 0.5, 0);
  },
  strawberry(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(0, 2.5);
      g.bezierCurveTo(-5.5, 0, -5.5, -6, 0, -5.4);
      g.bezierCurveTo(5.5, -6, 5.5, 0, 0, 2.5);
      g.closePath();
    });
    for (let i = 0; i < 8; i++) {
      const x = (hash1(i, 3) - 0.5) * 6;
      const y = -3.5 + hash1(i, 4) * 4.5;
      ell(g, x, y, 0.3, 0.5);
      fill(g, '#f6e27a');
    }
    paint(g, c[1], lw * 0.7, () => {
      g.beginPath();
      g.moveTo(-3, -5.2);
      g.lineTo(-1, -4.4);
      g.lineTo(0, -6.4);
      g.lineTo(1, -4.4);
      g.lineTo(3, -5.2);
      g.lineTo(1.4, -6.4);
      g.lineTo(-1.4, -6.4);
      g.closePath();
    });
    highlight(g, -2, -3.4, 1.2, 0.6, 0.45);
  },
  tomato(g, c, lw) {
    blob(g, 0, -2.6, 4, 3.6, c[0], lw);
    highlight(g, -1.4, -4, 1.4, 0.7, 0.5);
    paint(g, c[1], lw * 0.6, () => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        g.lineTo(Math.cos(a) * 2, -6 + Math.sin(a) * 0.9);
        g.lineTo(Math.cos(a + 0.6) * 0.6, -6 + Math.sin(a + 0.6) * 0.3);
      }
      g.closePath();
    });
  },
  berries(g, c, lw) {
    for (const [x, y, r] of [[-2.6, -1.8, 2.2], [2.2, -1.6, 2.1], [0, -4.4, 2.2]]) {
      blob(g, x, y, r, r, c[0], lw);
      highlight(g, x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.2, 0.6);
      if (c[0] === '#5a6fc0') {
        circ(g, x + r * 0.3, y - r * 0.5, 0.35);
        fill(g, c[1]);
      }
    }
  },
  grape(g, c, lw) {
    for (const [x, y] of [[-2.4, 0], [2.4, 0]]) {
      paint(g, c[0], lw, () => {
        g.beginPath();
        g.ellipse(x, 0, 2.6, 3.4, 0, Math.PI, 0);
        g.closePath();
      });
      ell(g, x, -1.4, 1.2, 1.6);
      fill(g, '#e8f2b0');
    }
  },
  cube(g, c, lw) {
    paint(g, c[1], lw, () => {
      g.beginPath();
      g.moveTo(-4, 0.5);
      g.lineTo(-4, -5);
      g.lineTo(-1.5, -7);
      g.lineTo(4.5, -7);
      g.lineTo(4.5, -1.5);
      g.lineTo(2, 0.5);
      g.closePath();
    });
    paint(g, c[0], lw * 0.7, () => {
      g.beginPath();
      g.rect(-4, -5, 6, 5.5);
    });
    for (let i = 0; i < 4; i++) {
      circ(g, -2.8 + i * 1.3, -2.5 + (i % 2), 0.3);
      fill(g, '#f9d9a8');
    }
  },
  wedge(g, c, lw) {
    paint(g, c[1], lw, () => {
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(6, 0);
      g.lineTo(0, -8);
      g.closePath();
    });
    paint(g, c[0], lw * 0.7, () => {
      g.beginPath();
      g.moveTo(-4.4, -1.2);
      g.lineTo(4.4, -1.2);
      g.lineTo(0, -7.2);
      g.closePath();
    });
    if (c[2]) {
      for (const [x, y] of [[-1.5, -3], [1.5, -3], [0, -5], [0, -2.2]]) {
        ell(g, x, y, 0.35, 0.6);
        fill(g, c[2]);
      }
    }
  },
  cheese(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(6, 0);
      g.lineTo(6, -4);
      g.lineTo(-6, -7);
      g.closePath();
    });
    line(g, -6, -7, 6, -4, lw * 0.6);
    for (const [x, y, r] of [[-3, -3, 1], [1.5, -2, 0.8], [3.8, -1, 0.6], [-0.6, -4.6, 0.6]]) {
      circ(g, x, y, r);
      fill(g, c[1]);
      stroke(g, lw * 0.5);
    }
  },
  segment(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-6, 0);
      g.quadraticCurveTo(0, -11, 6, 0);
      g.quadraticCurveTo(0, -3, -6, 0);
      g.closePath();
    });
    for (let i = -2; i <= 2; i++) curve(g, i * 1.4, -1.8, i * 1.8, -4, i * 2.2, -6 + Math.abs(i) * 1.2, lw * 0.4, c[1]);
  },
  leaf(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-7, -1);
      g.bezierCurveTo(-5, -9, 5, -9, 7.5, -2);
      g.bezierCurveTo(5, 1.5, -4, 1.5, -7, -1);
      g.closePath();
    });
    curve(g, -6.5, -1, 0, -4.8, 7, -2, lw * 0.7, c[1]);
    for (let i = -2; i <= 2; i++) line(g, i * 2, -3.6 + Math.abs(i) * 0.3, i * 2 + 1.2, -6.6 + Math.abs(i) * 0.6, lw * 0.4, c[1]);
  },
  curlyLeaf(g, c, lw) {
    const pts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const r = (i % 2 ? 5.6 : 6.6) + (hash1(i, 9) - 0.5);
      pts.push([Math.cos(a) * r, -3.6 + Math.sin(a) * r * 0.55]);
    }
    paint(g, c[0], lw, () => smoothPath(g, pts, true));
    curve(g, -6, -3.4, 0, -5, 6, -3.6, lw * 0.6, '#b6d68a');
  },
  broccoli(g, c, lw) {
    paint(g, c[1], lw, () => {
      g.beginPath();
      g.moveTo(-1.6, 0);
      g.lineTo(-1.2, -4);
      g.lineTo(1.4, -4);
      g.lineTo(1.6, 0);
      g.closePath();
    });
    for (const [x, y, r] of [[-3, -5.4, 2.6], [3, -5.4, 2.6], [0, -7.4, 2.8]]) {
      fuzzPath(g, x, y, r, r, 10, 0.12, x * 3 + 7);
      fill(g, c[0]);
      stroke(g, lw * 0.8);
    }
  },
  kernels(g, c, lw) {
    for (const [x, y, a] of [[-3, -1.6, -0.3], [0.4, -2.2, 0.2], [3.2, -1.4, 0.5], [-1.2, -4.4, 0.1], [2, -4.6, -0.4]]) {
      blob(g, x, y, 1.5, 1.9, c[0], lw * 0.8, a);
      ell(g, x, y + 0.9, 1.0, 0.6, a);
      fill(g, '#fbf3df');
    }
  },
  chunk(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-5, 0);
      g.lineTo(-4.4, -5);
      g.lineTo(0.6, -6.6);
      g.lineTo(5, -4.4);
      g.lineTo(5.2, 0);
      g.closePath();
    });
    paint(g, c[1], lw * 0.6, () => {
      g.beginPath();
      g.moveTo(-4.4, -5);
      g.lineTo(0.6, -6.6);
      g.lineTo(5, -4.4);
      g.lineTo(0.2, -3.2);
      g.closePath();
    });
  },
  mushroom(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-5.6, -3.4);
      g.bezierCurveTo(-5.6, -9, 5.6, -9, 5.6, -3.4);
      g.lineTo(1.8, -3.4);
      g.lineTo(1.8, 0);
      g.lineTo(-1.8, 0);
      g.lineTo(-1.8, -3.4);
      g.closePath();
    });
    curve(g, -5.2, -4.6, 0, -8, 5.2, -4.6, lw * 1.4, c[1]);
    for (let i = -2; i <= 2; i++) line(g, i * 0.8, -3.6, i * 1.8, -5.4, lw * 0.4, c[1]);
  },
  seeds(g, c, lw) {
    for (let i = 0; i < 7; i++) {
      const x = (hash1(i, 21) - 0.5) * 9;
      const y = -1.2 - hash1(i, 22) * 4;
      const a = hash1(i, 23) * 3;
      const col = c[i % (c.length > 2 ? 3 : 1)];
      blob(g, x, y, 1.0, 1.7, col, lw * 0.6, a);
      if (c.length === 2) {
        line(g, x - Math.sin(a) * 1.2, y + Math.cos(a) * 1.2 * -1, x + Math.sin(a) * 1.2, y - Math.cos(a) * 1.2 * -1, lw * 0.5, c[1]);
      }
    }
  },
  flakes(g, c, lw) {
    for (let i = 0; i < 7; i++) {
      const x = (hash1(i, 31) - 0.5) * 10;
      const y = -1 - hash1(i, 32) * 3.5;
      const pts = [];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + hash1(i * 7 + k, 33);
        const r = 1.1 + hash1(i * 7 + k, 34) * 0.8;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6]);
      }
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.closePath();
      fill(g, c[i % c.length]);
      stroke(g, lw * 0.5);
    }
  },
  crumbs(g, c, lw) {
    for (let i = 0; i < 6; i++) {
      const x = (hash1(i, 41) - 0.5) * 9;
      const y = -1.4 - hash1(i, 42) * 3.4;
      const r = 1.2 + hash1(i, 43) * 1.2;
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        pts.push([x + Math.cos(a) * r * (0.8 + hash1(i * 9 + k, 44) * 0.4), y + Math.sin(a) * r * (0.8 + hash1(i * 9 + k, 45) * 0.4)]);
      }
      paint(g, c[0], lw * 0.7, () => smoothPath(g, pts, true));
      if (i % 2) {
        circ(g, x + 0.3, y - 0.2, 0.45);
        fill(g, c[1]);
      }
    }
  },
  donut(g, c, lw) {
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-6, 0);
      g.bezierCurveTo(-6, -8, 6, -8, 6, 0);
      g.closePath();
    });
    paint(g, c[1], lw * 0.7, () => {
      g.beginPath();
      g.moveTo(-5.4, -2.2);
      g.bezierCurveTo(-5.2, -8, 5.2, -8, 5.4, -2.2);
      g.bezierCurveTo(4, -3.6, 3, -2, 1.6, -3.4);
      g.bezierCurveTo(0, -2, -2, -3.8, -3, -2.6);
      g.closePath();
    });
    const cols = ['#fff', '#7cc0e6', '#f0bf45', '#77b255'];
    for (let i = 0; i < 7; i++) {
      const x = -3.6 + i * 1.2;
      const y = -4.2 - Math.sin((i / 6) * Math.PI) * 1.6;
      line(g, x, y, x + 0.5, y - 0.4, lw * 0.8, cols[i % 4]);
    }
  },
  drop(g, c, lw) {
    g.save();
    g.globalAlpha *= 0.92;
    paint(g, c[0], lw, () => {
      g.beginPath();
      g.moveTo(-5, 0);
      g.bezierCurveTo(-5, -4.5, 5, -4.5, 5, 0);
      g.closePath();
    });
    g.restore();
    highlight(g, -1.6, -2.4, 1.6, 0.6, 0.8, 0);
  },
  fuzzball(g, c, lw) {
    fuzzPath(g, 0, -3.2, 3.4, 3.2, 14, 0.12, 2);
    fill(g, c[0]);
    stroke(g, lw * 0.8);
    for (let i = 0; i < 5; i++) {
      circ(g, (hash1(i, 51) - 0.5) * 4, -3.2 + (hash1(i, 52) - 0.5) * 4, 0.45);
      fill(g, c[1]);
    }
  },
  pellets(g, c, lw) {
    for (const [x, y] of [[-3, -1.4], [0, -1.6], [3, -1.3], [-1.5, -4], [1.6, -4.1]]) {
      blob(g, x, y, 1.5, 1.4, c[0], lw * 0.7);
      highlight(g, x - 0.5, y - 0.5, 0.5, 0.3, 0.5);
    }
  },
  wafer(g, c, lw) {
    blob(g, 0, -1.4, 5.6, 2.2, c[0], lw);
    for (let i = 0; i < 6; i++) {
      circ(g, (hash1(i, 61) - 0.5) * 7, -1.4 + (hash1(i, 62) - 0.5) * 2, 0.5);
      fill(g, c[1]);
    }
  },
  sticks(g, c, lw) {
    for (const [x, y, a] of [[-2.4, -1.5, 0.2], [1.6, -1.3, -0.15], [-0.2, -3.6, 0.05]]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      paint(g, c[0], lw * 0.8, () => {
        g.beginPath();
        g.rect(-3.4, -0.9, 6.8, 1.8);
      });
      line(g, -2, 0, 2, 0, lw * 0.6, c[1]);
      g.restore();
    }
  },
  shards(g, c, lw) {
    for (let i = 0; i < 5; i++) {
      const x = (hash1(i, 71) - 0.5) * 9;
      const y = -1.2 - hash1(i, 72) * 3;
      paint(g, c[0], lw * 0.7, () => {
        g.beginPath();
        g.moveTo(x - 1.6, y + 0.8);
        g.lineTo(x - 0.4, y - 1.4);
        g.lineTo(x + 1.6, y - 0.6);
        g.lineTo(x + 1.0, y + 1.0);
        g.closePath();
      });
    }
  },
  deadleaf(g, c, lw) {
    for (const [x, y, a, col] of [[-2.4, -1.6, -0.4, c[0]], [2.2, -2.2, 0.5, c[1]]]) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      paint(g, col, lw * 0.8, () => {
        g.beginPath();
        g.moveTo(-4.5, 0);
        g.bezierCurveTo(-3, -4, 3, -4, 4.8, 0);
        g.bezierCurveTo(3, 2.6, -3, 2.6, -4.5, 0);
        g.closePath();
      });
      line(g, -4.2, 0, 4.4, 0, lw * 0.5, 'rgba(58,42,31,0.6)');
      g.restore();
    }
  },
};

// Bite marks, in shape units, added level by level as a snack gets eaten.
// Each is a scalloped mouthful [x, y, r] taken from the right-hand side
// (the renderer mirrors the sprite when the eater is on the left).
const BITES = [
  [[5.4, -3.6, 2.6]],
  [[2.6, -6.4, 2.7]],
  [[5.8, 0.2, 3.0], [3.4, -2.6, 2.8]],
  [[0.2, -4.6, 3.3], [-2.6, -6.6, 2.6], [1.2, 0.4, 2.8]],
];

function biteOut(g, b, lw) {
  const marks = [];
  for (let l = 0; l < b; l++) marks.push(...BITES[l]);
  // the mouthfuls, with a frill of little tooth scallops round each one
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (const [x, y, r] of marks) {
    circ(g, x, y, r);
    g.fill();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.6 + i * 0.42;
      circ(g, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.26);
      g.fill();
    }
  }
  // re-ink the bitten edge, only where food is left
  g.globalCompositeOperation = 'source-atop';
  for (const [x, y, r] of marks) {
    circ(g, x, y, r + lw * 0.9);
    g.lineWidth = lw * 1.6;
    g.strokeStyle = 'rgba(255,248,230,0.55)';
    g.stroke();
    circ(g, x, y, r + lw * 0.25);
    g.lineWidth = lw;
    g.strokeStyle = INK;
    g.stroke();
    // and round each tooth scallop, which the ring above can't reach
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * 0.6 + i * 0.42;
      circ(g, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.26 + lw * 0.25);
      g.lineWidth = lw;
      g.stroke();
    }
  }
  g.restore();
}

// rot: 0 fresh, 1 overripe, 2 rotten/mouldy; bites: 0 untouched .. 4 nearly gone
export function drawFood(g, def, rot, lw = 0.7, bites = 0) {
  const s = def.size || 1;
  g.save();
  g.scale(s, s);
  const shape = SHAPES[def.shape] || SHAPES.crumbs;
  shape(g, def.colors, lw / s);
  if (rot >= 1) {
    // bruises
    for (let i = 0; i < (rot === 2 ? 4 : 2); i++) {
      ell(g, (hash1(i, 81) - 0.5) * 7, -1.5 - hash1(i, 82) * 3.5, 1.3, 0.9);
      g.fillStyle = rot === 2 ? 'rgba(90,70,40,0.55)' : 'rgba(120,80,40,0.35)';
      g.fill();
    }
  }
  if (rot === 2) {
    // fuzzy mould tufts
    for (let i = 0; i < 4; i++) {
      const x = (hash1(i, 91) - 0.5) * 8;
      const y = -2.5 - hash1(i, 92) * 3;
      fuzzPath(g, x, y, 1.6, 1.2, 9, 0.25, i + 3);
      g.fillStyle = i % 2 ? '#c8d8b0' : '#e2ead2';
      g.fill();
      g.lineWidth = lw * 0.4 / s;
      g.strokeStyle = 'rgba(58,42,31,0.5)';
      g.stroke();
    }
  }
  if (bites > 0) biteOut(g, bites, lw / s);
  g.restore();
}

export const FOOD_BOX = [9, 10];
export { INK };
