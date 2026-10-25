// Portraits of the Busytown neighbours: animals dressed for their jobs, the
// way the townsfolk look in a picture book. Head and shoulders, facing us,
// in the same ink line and watercolour wash as the tank. Each neighbour's
// look (which animal, their colours, clothes, hat and odds and ends) lives
// with them in data/neighbours.js; this file only knows how to draw it.
//   mood: 'ask' (a hopeful little smile) or 'happy' (eyes screwed up with
//   delight, mouth open, extra rosy)
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, cheek, line, curve } from './ink.js';

export const FOLK_BOX = [-33, -44, 33, 33];

const LW = 1.1;
const HY = -6; // head centre

// Head shape and features for each kind of animal.
const ANIMALS = {
  bear: { rx: 15, ry: 13.5, ears: 'round', snout: 'muzzle' },
  pig: { rx: 15.5, ry: 13, ears: 'pig', snout: 'pig' },
  cat: { rx: 14, ry: 12.5, ears: 'point', snout: 'cat', whiskers: true },
  rabbit: { rx: 13, ry: 13, ears: 'tall', snout: 'rabbit', whiskers: true },
  mouse: { rx: 12.5, ry: 11.5, ears: 'mouse', snout: 'mouse', whiskers: true },
  dog: { rx: 13.5, ry: 13.5, ears: 'droop', snout: 'dog' },
  toad: { rx: 17, ry: 11.5, ears: 'none', snout: 'toad' },
  owl: { rx: 15, ry: 14.5, ears: 'tuft', snout: 'beak' },
  fox: { rx: 14, ry: 12.5, ears: 'point', snout: 'fox', whiskers: true },
  squirrel: { rx: 13, ry: 12.5, ears: 'tufted', snout: 'mouse', whiskers: true, tail: true },
  beaver: { rx: 15, ry: 13.5, ears: 'small', snout: 'beaver' },
  otter: { rx: 14.5, ry: 12.5, ears: 'small', snout: 'otter', whiskers: true },
};

function path(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

// ------------------------------------------------------------------ body
function shoulders(g) {
  g.beginPath();
  g.moveTo(-8, 4);
  g.bezierCurveTo(-16, 6, -24, 10, -26, 20);
  g.lineTo(-27, 34);
  g.lineTo(27, 34);
  g.lineTo(26, 20);
  g.bezierCurveTo(24, 10, 16, 6, 8, 4);
  g.closePath();
}

function clothes(g, L) {
  const o = L.outfit || {};
  const col = o.color || '#4c8fd6';
  paint(g, col, LW, () => shoulders(g));
  // a soft fold of shade down each side
  g.save();
  shoulders(g);
  g.clip();
  g.globalAlpha = 0.14;
  g.fillStyle = INK;
  g.fillRect(-27, 14, 6, 22);
  g.fillRect(21, 14, 6, 22);
  g.restore();
  switch (o.kind) {
    case 'apron': {
      // a bib apron over the shirt, straps round the neck
      line(g, -7, 6, -6, 13, LW * 2.2, o.trim || '#fffdf6');
      line(g, 7, 6, 6, 13, LW * 2.2, o.trim || '#fffdf6');
      paint(g, o.trim || '#fffdf6', LW, () => {
        g.beginPath();
        g.moveTo(-9, 12);
        g.lineTo(9, 12);
        g.lineTo(10, 34);
        g.lineTo(-10, 34);
        g.closePath();
      });
      paint(g, o.trim || '#fffdf6', LW * 0.8, () => {
        g.beginPath();
        g.rect(-5, 22, 10, 6);
      });
      break;
    }
    case 'overalls': {
      paint(g, o.trim || '#4c6fa8', LW, () => {
        g.beginPath();
        g.moveTo(-10, 15);
        g.lineTo(10, 15);
        g.lineTo(11, 34);
        g.lineTo(-11, 34);
        g.closePath();
      });
      line(g, -9, 15, -14, 6.5, LW * 2.6, o.trim || '#4c6fa8');
      line(g, 9, 15, 14, 6.5, LW * 2.6, o.trim || '#4c6fa8');
      for (const x of [-7, 7]) {
        circ(g, x, 16.6, 1.3);
        fill(g, '#f0bf45');
        stroke(g, LW * 0.6);
      }
      if (o.patch) {
        paint(g, o.patch, LW * 0.7, () => {
          g.beginPath();
          g.rect(2, 24, 6, 6);
        });
        for (let i = 0; i < 4; i++) line(g, 2.6 + i * 1.6, 23.4, 2.6 + i * 1.6, 24.6, LW * 0.4);
      }
      break;
    }
    case 'coat': {
      // a white coat with lapels, shirt and tie peeking out
      paint(g, o.trim || '#cfe3f2', LW * 0.8, () => path(g, [[-6, 5], [6, 5], [0, 18]]));
      line(g, -6, 5, -3, 34, LW);
      line(g, 6, 5, 3, 34, LW);
      paint(g, o.color || '#fffdf6', LW, () => path(g, [[-7, 5], [-12, 12], [-5, 18]]));
      paint(g, o.color || '#fffdf6', LW, () => path(g, [[7, 5], [12, 12], [5, 18]]));
      paint(g, o.color || '#fffdf6', LW * 0.7, () => {
        g.beginPath();
        g.rect(12, 20, 7, 5);
      });
      line(g, 14, 19, 14, 21.5, LW * 1.3, '#4c8fd6');
      break;
    }
    case 'jacket':
    case 'double': {
      paint(g, o.shirt || '#fffdf6', LW * 0.8, () => path(g, [[-7, 5], [7, 5], [0, 20]]));
      paint(g, col, LW, () => path(g, [[-8, 5], [-13, 13], [-1, 22]]));
      paint(g, col, LW, () => path(g, [[8, 5], [13, 13], [1, 22]]));
      const bx = o.kind === 'double' ? [-4, 4] : [0];
      for (const x of bx) {
        for (const y of [25, 30]) {
          circ(g, x, y, 1.2);
          fill(g, o.buttons || '#f0bf45');
          stroke(g, LW * 0.5);
        }
      }
      break;
    }
    case 'dress': {
      // a round white collar
      for (const s of [-1, 1]) {
        paint(g, o.trim || '#fffdf6', LW, () => {
          g.beginPath();
          g.moveTo(0, 7);
          g.bezierCurveTo(s * 4, 6, s * 13, 6, s * 13, 10);
          g.bezierCurveTo(s * 12, 15, s * 3, 15, 0, 11);
          g.closePath();
        });
      }
      if (o.dots) {
        g.save();
        shoulders(g);
        g.clip();
        g.fillStyle = o.dots;
        for (let y = 16; y < 34; y += 5) for (let x = -24 + ((y / 5) % 2) * 2.5; x < 26; x += 5) {
          g.beginPath();
          g.arc(x, y, 0.9, 0, TAU);
          g.fill();
        }
        g.restore();
      }
      break;
    }
    case 'cardigan': {
      paint(g, o.shirt || '#fffdf6', LW * 0.8, () => path(g, [[-6, 5], [6, 5], [0, 22]]));
      line(g, -6, 5, -1, 34, LW);
      line(g, 6, 5, 1, 34, LW);
      for (const y of [24, 29]) {
        circ(g, 1.8, y, 1);
        fill(g, '#fffdf6');
        stroke(g, LW * 0.5);
      }
      break;
    }
    case 'stripes': {
      g.save();
      shoulders(g);
      g.clip();
      g.fillStyle = o.trim || '#fffdf6';
      for (let y = 9; y < 36; y += 5) g.fillRect(-28, y, 56, 2.4);
      g.restore();
      shoulders(g);
      stroke(g, LW);
      paint(g, o.collar || '#2f5d8a', LW, () => path(g, [[-9, 4.5], [9, 4.5], [5, 12], [0, 15], [-5, 12]]));
      break;
    }
    default:
      break;
  }
}

// Bits worn on the chest, over the clothes.
function chestExtras(g, L) {
  const ex = L.extras || [];
  if (ex.includes('tape')) {
    // a tailor's measuring tape draped round the neck
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 7, 5);
      g.bezierCurveTo(s * 10, 12, s * 9, 22, s * 8, 32);
      stroke(g, LW * 3.6, INK);
      stroke(g, LW * 2.4, '#f6d64a');
      for (let i = 0; i < 6; i++) {
        const y = 10 + i * 4;
        line(g, s * 8.8 - 0.9, y, s * 8.8 + 0.4, y, LW * 0.4);
      }
    }
  }
  if (ex.includes('stethoscope')) {
    g.beginPath();
    g.moveTo(-6, 6);
    g.bezierCurveTo(-11, 16, -4, 22, 0, 22);
    g.bezierCurveTo(4, 22, 11, 16, 6, 6);
    stroke(g, LW * 1.4, '#5a5f6a');
    line(g, 0, 22, 0, 27, LW * 1.4, '#5a5f6a');
    paint(g, '#c9ced6', LW, () => circ(g, 0, 28.5, 2.4));
  }
  if (ex.includes('sash')) {
    paint(g, '#d9483b', LW, () => path(g, [[-20, 9], [-14, 6], [20, 30], [14, 34]]));
    paint(g, '#f3c43c', LW, () => circ(g, 4, 21, 2.6));
  }
  if (ex.includes('chain')) {
    g.beginPath();
    g.moveTo(-10, 8);
    g.quadraticCurveTo(0, 20, 10, 8);
    stroke(g, LW * 1.4, '#c9962a');
    paint(g, '#f3c43c', LW, () => circ(g, 0, 15.5, 2.8));
  }
  if (ex.includes('pearls')) {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (0.15 + (i / 8) * 0.7);
      paint(g, '#fffdf6', LW * 0.4, () => circ(g, Math.cos(a) * 8.5, 5 + Math.sin(a) * 4.5, 1.05));
    }
  }
  if (ex.includes('satchel')) {
    // a postbag on a strap across the chest
    line(g, -14, 7, 18, 30, LW * 3.4, INK);
    line(g, -14, 7, 18, 30, LW * 2.2, '#8a5a2c');
    paint(g, '#a8743f', LW, () => {
      g.beginPath();
      g.rect(10, 24, 15, 10);
    });
    paint(g, '#8a5a2c', LW, () => path(g, [[10, 24], [25, 24], [24, 29], [11, 29]]));
    paint(g, '#fffdf6', LW * 0.6, () => path(g, [[13, 21], [21, 21], [21, 24.5], [13, 24.5]]));
  }
  if (ex.includes('tools')) {
    // a pencil and a spanner in a bib pocket
    line(g, -4, 18, -3, 25, LW * 1.6, '#f0bf45');
    line(g, 1, 17, 2, 25, LW * 1.4, '#9aa0a6');
    circ(g, 1, 16.6, 1.4);
    stroke(g, LW * 1.1, '#9aa0a6');
  }
}

function neckwear(g, L) {
  const ex = L.extras || [];
  if (ex.includes('bowtie')) {
    const c = L.bowtie || '#d9483b';
    paint(g, c, LW, () => {
      g.beginPath();
      g.moveTo(0, 7);
      g.lineTo(-5, 4);
      g.lineTo(-5, 10);
      g.closePath();
      g.moveTo(0, 7);
      g.lineTo(5, 4);
      g.lineTo(5, 10);
      g.closePath();
    });
    paint(g, c, LW * 0.8, () => circ(g, 0, 7, 1.3));
  }
  if (ex.includes('neckerchief')) {
    const c = L.kerchief || '#d9483b';
    paint(g, c, LW, () => path(g, [[-9, 4], [9, 4], [0, 13]]));
    paint(g, c, LW * 0.8, () => ell(g, 0, 6, 2.4, 1.8));
  }
}

// ------------------------------------------------------------------ head
function ears(g, A, L) {
  const fur = L.fur;
  const inner = L.inner || '#f2b5b0';
  const rx = A.rx;
  const top = HY - A.ry;
  switch (A.ears) {
    case 'round':
    case 'small': {
      const r = A.ears === 'round' ? 5 : 3.2;
      for (const s of [-1, 1]) {
        const x = s * (rx * 0.72);
        const y = top + (A.ears === 'round' ? 3 : 4);
        paint(g, fur, LW, () => circ(g, x, y, r));
        circ(g, x, y + 0.4, r * 0.55);
        fill(g, inner);
      }
      break;
    }
    case 'mouse': {
      for (const s of [-1, 1]) {
        const x = s * (rx * 0.85);
        const y = top + 1;
        paint(g, fur, LW, () => circ(g, x, y, 7.5));
        circ(g, x + s * 0.4, y + 0.6, 5);
        fill(g, inner);
      }
      break;
    }
    case 'point':
    case 'tufted': {
      for (const s of [-1, 1]) {
        paint(g, fur, LW, () => path(g, [[s * 4, top + 3], [s * 9, top - 9], [s * 13, top + 6]]));
        paint(g, inner, 0, () => path(g, [[s * 6, top + 3], [s * 9, top - 5], [s * 11, top + 4]]));
        if (A.ears === 'tufted') {
          g.beginPath();
          g.moveTo(s * 9, top - 9);
          g.quadraticCurveTo(s * 10.5, top - 13, s * 8, top - 14);
          stroke(g, LW * 1.4, fur);
          g.beginPath();
          g.moveTo(s * 9, top - 9);
          g.quadraticCurveTo(s * 10.5, top - 13, s * 8, top - 14);
          stroke(g, LW * 0.6);
        }
      }
      break;
    }
    case 'tall': {
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * 5.5, top + 2);
        g.rotate(s * 0.16);
        paint(g, fur, LW, () => ell(g, 0, -10, 4.4, 12));
        ell(g, 0, -9.5, 2.2, 9);
        fill(g, inner);
        g.restore();
      }
      break;
    }
    case 'pig': {
      for (const s of [-1, 1]) {
        paint(g, fur, LW, () => path(g, [[s * 6, top + 3], [s * 14, top - 4], [s * 14, top + 7]]));
        paint(g, inner, 0, () => path(g, [[s * 8, top + 3], [s * 12.6, top - 1.4], [s * 12.6, top + 5]]));
      }
      break;
    }
    case 'droop': {
      // long floppy ears hanging down beside the face (drawn in front later)
      break;
    }
    case 'tuft': {
      for (const s of [-1, 1]) paint(g, fur, LW, () => path(g, [[s * 5, top + 2], [s * 12, top - 6], [s * 12.5, top + 5]]));
      break;
    }
    default:
      break;
  }
}

function floppyEars(g, A, L) {
  if (A.ears !== 'droop') return;
  const c = L.ear || L.fur;
  for (const s of [-1, 1]) {
    paint(g, c, LW, () => {
      g.beginPath();
      g.moveTo(s * (A.rx - 4), HY - A.ry + 3);
      g.bezierCurveTo(s * (A.rx + 8), HY - A.ry + 2, s * (A.rx + 6), HY + 10, s * (A.rx + 1), HY + 11);
      g.bezierCurveTo(s * (A.rx - 3), HY + 11, s * (A.rx - 2), HY - 2, s * (A.rx - 4), HY - A.ry + 3);
      g.closePath();
    });
  }
}

function headShape(g, A, L) {
  if (A.snout === 'toad') {
    // a wide flat head with two bulging eyes on top
    for (const s of [-1, 1]) paint(g, L.fur, LW, () => circ(g, s * 8, HY - A.ry + 2, 5.6));
  }
  paint(g, L.fur, LW, () => ell(g, 0, HY, A.rx, A.ry));
  if (L.spots) {
    // a spaniel's patches, a tabby's stripes
    g.save();
    ell(g, 0, HY, A.rx, A.ry);
    g.clip();
    if (L.spots === 'stripes') {
      for (const x of [-4, 0, 4]) curve(g, x, HY - A.ry - 1, x * 0.7, HY - A.ry + 4, x * 0.9, HY - A.ry + 7, LW * 1.4, L.spotColor || '#6b6f78');
    } else {
      paint(g, L.spotColor || '#8a5a36', 0, () => ell(g, -7, HY - 6, 6, 7, 0.3));
    }
    g.restore();
    ell(g, 0, HY, A.rx, A.ry);
    stroke(g, LW);
  }
  if (A.snout === 'owl' || A.snout === 'beak') {
    // the pale face disc
    for (const s of [-1, 1]) paint(g, L.face || '#f4e6c8', LW * 0.6, () => circ(g, s * 5.8, HY - 1, 6.6));
  } else if (L.face && A.snout !== 'pig' && A.snout !== 'toad') {
    // a pale muzzle and cheeks
    g.save();
    ell(g, 0, HY, A.rx, A.ry);
    g.clip();
    ell(g, 0, HY + 6, A.rx * 0.78, A.ry * 0.62);
    fill(g, L.face);
    g.restore();
  }
  highlight(g, -A.rx * 0.4, HY - A.ry * 0.55, A.rx * 0.35, A.ry * 0.18, 0.28, -0.3);
}

function eyes(g, A, L, happy) {
  const owl = A.snout === 'beak';
  const toad = A.snout === 'toad';
  const ex = owl ? 5.8 : toad ? 8 : A.rx * 0.38;
  const ey = owl ? HY - 1 : toad ? HY - A.ry + 2 : HY - 2.5;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (happy) {
      g.beginPath();
      g.arc(x, ey + 1, owl || toad ? 2.6 : 2, Math.PI * 1.1, Math.PI * 1.9);
      stroke(g, LW * 1.2);
      continue;
    }
    if (owl || toad) {
      paint(g, owl ? '#f6d64a' : '#fbf3df', LW * 0.7, () => circ(g, x, ey, owl ? 3.6 : 3.4));
      circ(g, x + 0.3, ey + 0.2, owl ? 2.1 : 1.9);
      fill(g, INK);
      circ(g, x + 0.9, ey - 0.6, 0.7);
      fill(g, '#fff');
    } else {
      ell(g, x, ey, 1.55, 2.1);
      fill(g, INK);
      circ(g, x + 0.5, ey - 0.8, 0.6);
      fill(g, '#fff');
    }
    // eyebrows lifted hopefully
    if (!owl) curve(g, x - s * 2, ey - 4.2, x, ey - 5.6 - (toad ? 1.5 : 0), x + s * 1.8, ey - 4.6, LW * 0.8);
  }
}

function snout(g, A, L, happy) {
  const lw = LW;
  const nose = L.nose || INK;
  const my = HY + 6.5; // mouth line
  const mouth = (w, y = my) => {
    if (happy) {
      g.beginPath();
      g.moveTo(-w, y - 0.4);
      g.quadraticCurveTo(0, y + w * 1.25, w, y - 0.4);
      g.closePath();
      fill(g, '#b3473f');
      stroke(g, lw * 0.9);
      ell(g, 0, y + w * 0.62, w * 0.45, w * 0.28);
      fill(g, '#e8737a');
    } else {
      g.beginPath();
      g.moveTo(-w, y - 0.6);
      g.quadraticCurveTo(0, y + w * 0.7, w, y - 0.6);
      stroke(g, lw * 0.9);
    }
  };
  const whiskers = () => {
    for (const s of [-1, 1]) {
      for (const k of [-1, 0, 1]) line(g, s * 4.5, HY + 3.4 + k * 0.6, s * 12.5, HY + 2.2 + k * 2.2, lw * 0.4, 'rgba(58,42,31,0.6)');
    }
  };
  switch (A.snout) {
    case 'muzzle':
    case 'beaver':
    case 'otter': {
      paint(g, L.face || '#e9cfa0', lw * 0.8, () => ell(g, 0, HY + 4.5, 6.4, 4.8));
      paint(g, nose, lw * 0.6, () => ell(g, 0, HY + 1.6, 2.6, 1.8));
      highlight(g, -0.8, HY + 1, 0.9, 0.5, 0.6, 0);
      line(g, 0, HY + 3.4, 0, HY + 5.2, lw * 0.8);
      mouth(3, HY + 5.6);
      if (A.snout === 'beaver') {
        paint(g, '#f6e2a8', lw * 0.7, () => {
          g.beginPath();
          g.rect(-2.2, HY + 6.2, 4.4, 3.8);
        });
        line(g, 0, HY + 6.2, 0, HY + 10, lw * 0.5);
      }
      if (A.snout === 'otter') whiskers();
      break;
    }
    case 'pig': {
      paint(g, L.snout || '#f7c6c0', lw, () => ell(g, 0, HY + 2.5, 5.4, 3.8));
      for (const s of [-1, 1]) {
        ell(g, s * 1.8, HY + 2.5, 0.8, 1.3);
        fill(g, '#9a4a4a');
      }
      mouth(3.4, HY + 8.2);
      break;
    }
    case 'cat':
    case 'fox':
    case 'mouse':
    case 'rabbit': {
      paint(g, nose, lw * 0.6, () => path(g, [[-1.8, HY + 2.2], [1.8, HY + 2.2], [0, HY + 4]]));
      line(g, 0, HY + 4, 0, HY + 5, lw * 0.8);
      if (happy) mouth(2.8, HY + 5.4);
      else {
        g.beginPath();
        g.moveTo(-2.6, HY + 5.2);
        g.quadraticCurveTo(-1.3, HY + 6.6, 0, HY + 5);
        g.quadraticCurveTo(1.3, HY + 6.6, 2.6, HY + 5.2);
        stroke(g, lw * 0.8);
      }
      if (A.snout === 'rabbit') {
        paint(g, '#fffdf6', lw * 0.6, () => {
          g.beginPath();
          g.rect(-1.6, HY + 5.6, 3.2, 2.6);
        });
        line(g, 0, HY + 5.6, 0, HY + 8.2, lw * 0.4);
      }
      whiskers();
      break;
    }
    case 'dog': {
      paint(g, L.face || '#fffdf6', lw * 0.8, () => ell(g, 0, HY + 4.6, 6, 4.6));
      paint(g, nose, lw * 0.7, () => ell(g, 0, HY + 2, 3, 2.1));
      highlight(g, -1, HY + 1.3, 1, 0.55, 0.6, 0);
      line(g, 0, HY + 4, 0, HY + 5.6, lw * 0.8);
      mouth(3.2, HY + 5.8);
      if (happy) {
        // tongue lolling
        paint(g, '#e8737a', lw * 0.7, () => ell(g, 1.4, HY + 10, 1.6, 2.2));
      }
      break;
    }
    case 'toad': {
      for (const s of [-1, 1]) {
        circ(g, s * 1.4, HY - 1, 0.55);
        fill(g, INK);
      }
      // a great wide smile
      if (happy) {
        g.beginPath();
        g.moveTo(-10, HY + 2);
        g.quadraticCurveTo(0, HY + 12, 10, HY + 2);
        g.closePath();
        fill(g, '#b3473f');
        stroke(g, lw);
      } else {
        g.beginPath();
        g.moveTo(-11, HY + 2.4);
        g.quadraticCurveTo(0, HY + 9, 11, HY + 2.4);
        stroke(g, lw);
      }
      break;
    }
    case 'beak': {
      paint(g, '#f0913a', lw * 0.8, () => path(g, [[-2.2, HY + 2.4], [2.2, HY + 2.4], [0, HY + 7]]));
      if (happy) curve(g, -2, HY + 8.5, 0, HY + 10.4, 2, HY + 8.5, lw * 0.8);
      break;
    }
    default:
      break;
  }
}

function faceExtras(g, A, L, happy) {
  const ex = L.extras || [];
  const owl = A.snout === 'beak';
  const ex0 = owl ? 5.8 : A.rx * 0.38;
  const ey = owl ? HY - 1 : HY - 2.5;
  if (ex.includes('moustache')) {
    for (const s of [-1, 1]) {
      paint(g, L.moustache || '#6b4a32', LW * 0.8, () => {
        g.beginPath();
        g.moveTo(0, HY + 4.4);
        g.bezierCurveTo(s * 3, HY + 2.6, s * 7, HY + 3.4, s * 8.5, HY + 1.4);
        g.bezierCurveTo(s * 9.6, HY + 4.4, s * 5, HY + 6.6, 0, HY + 5.2);
        g.closePath();
      });
    }
  }
  if (ex.includes('flour')) {
    g.save();
    g.globalAlpha = 0.85;
    for (const [x, y, r] of [[-9, HY + 3, 1.6], [-7.4, HY + 4.8, 1], [6, HY - 9, 1.3], [8, HY - 8, 0.8]]) {
      circ(g, x, y, r);
      fill(g, '#fffdf6');
    }
    g.restore();
  }
  if (ex.includes('wheat')) {
    line(g, 4, HY + 6.4, 13, HY + 1, LW * 0.8, '#c9a54a');
    for (let i = 0; i < 3; i++) paint(g, '#e8c45a', LW * 0.5, () => ell(g, 11 + i * 1.3, HY + 1.6 - i * 0.9, 1.2, 0.6, -0.5));
  }
  if (ex.includes('pencil')) {
    g.save();
    g.translate(A.rx - 1, HY - 6);
    g.rotate(-0.7);
    paint(g, '#f0bf45', LW * 0.6, () => {
      g.beginPath();
      g.rect(-1, -6, 2, 10);
    });
    paint(g, '#efd9b0', LW * 0.5, () => path(g, [[-1, 4], [1, 4], [0, 6.5]]));
    g.restore();
  }
  if (ex.includes('daisy')) {
    const x = -A.rx + 1;
    const y = HY - A.ry + 5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      paint(g, '#fffdf6', LW * 0.5, () => ell(g, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.5, 1.1, a));
    }
    paint(g, '#f0bf45', LW * 0.5, () => circ(g, x, y, 1.3));
  }
  if (ex.includes('glasses') || ex.includes('monocle')) {
    const both = ex.includes('glasses');
    for (const s of both ? [-1, 1] : [1]) {
      circ(g, s * ex0, ey + 0.4, owl ? 4.6 : 3.6);
      g.save();
      g.globalAlpha = 0.18;
      fill(g, '#cfe8f6');
      g.restore();
      stroke(g, LW * 0.9);
    }
    if (both) curve(g, -ex0 + (owl ? 4.6 : 3.6), ey, 0, ey - 1.6, ex0 - (owl ? 4.6 : 3.6), ey, LW * 0.9);
    else line(g, ex0 + 3, ey + 3, ex0 + 4, ey + 12, LW * 0.4, '#c9962a');
  }
  if (happy) {
    for (const s of [-1, 1]) cheek(g, s * (A.rx * 0.62), HY + 3, 2.6);
  } else for (const s of [-1, 1]) cheek(g, s * (A.rx * 0.62), HY + 3, 2);
}

// ------------------------------------------------------------------ hats
function hat(g, A, L) {
  const h = L.hat;
  if (!h) return;
  const top = HY - A.ry;
  const c = L.hatColor || '#d9483b';
  switch (h) {
    case 'bakercap': {
      paint(g, '#fffdf6', LW, () => ell(g, 0, top + 1, 15, 4.2));
      paint(g, '#fffdf6', LW, () => {
        g.beginPath();
        g.moveTo(-13, top + 1);
        g.bezierCurveTo(-17, top - 10, -4, top - 13, 2, top - 9);
        g.bezierCurveTo(10, top - 14, 18, top - 6, 13, top + 1);
        g.closePath();
      });
      curve(g, -4, top - 2, -2, top - 7, 2, top - 9, LW * 0.5, 'rgba(58,42,31,0.5)');
      break;
    }
    case 'toque': {
      paint(g, '#fffdf6', LW, () => {
        g.beginPath();
        g.moveTo(-10, top + 3);
        g.lineTo(-11, top - 8);
        g.bezierCurveTo(-17, top - 11, -14, top - 20, -6, top - 17);
        g.bezierCurveTo(-4, top - 23, 5, top - 23, 6, top - 17);
        g.bezierCurveTo(14, top - 20, 17, top - 11, 11, top - 8);
        g.lineTo(10, top + 3);
        g.closePath();
      });
      for (const x of [-4.5, 0, 4.5]) line(g, x, top - 10, x * 1.1, top - 1, LW * 0.5, 'rgba(58,42,31,0.45)');
      line(g, -10.5, top - 3, 10.5, top - 3, LW * 0.7);
      break;
    }
    case 'straw': {
      paint(g, '#f2d48a', LW, () => ell(g, 0, top + 2, 22, 5));
      paint(g, '#f2d48a', LW, () => {
        g.beginPath();
        g.moveTo(-11, top + 2);
        g.bezierCurveTo(-11, top - 10, 11, top - 10, 11, top + 2);
        g.closePath();
      });
      line(g, -10.6, top - 1, 10.6, top - 1, LW * 2.4, c);
      for (let i = -3; i <= 3; i++) line(g, i * 5, top + 4.6, i * 5.6, top + 6.4, LW * 0.4, '#c9a54a');
      break;
    }
    case 'bucket': {
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(-16, top + 4);
        g.quadraticCurveTo(0, top - 2, 16, top + 4);
        g.lineTo(11, top - 1);
        g.lineTo(-11, top - 1);
        g.closePath();
      });
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(-11, top);
        g.bezierCurveTo(-10, top - 11, 10, top - 11, 11, top);
        g.closePath();
      });
      // a sprig in the band
      line(g, 7, top - 3, 11, top - 11, LW * 0.8, '#4f8a3c');
      paint(g, '#77b255', LW * 0.5, () => ell(g, 11, top - 10, 2.6, 1.3, -0.8));
      paint(g, '#77b255', LW * 0.5, () => ell(g, 9, top - 7, 2.2, 1.1, 0.4));
      break;
    }
    case 'hardhat': {
      // a builder's hard hat: a shiny dome with a ridge, and a little peak
      paint(g, c, LW, () => ell(g, 0, top + 3, 17, 2.8));
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(-13.5, top + 3);
        g.bezierCurveTo(-13.5, top - 13, 13.5, top - 13, 13.5, top + 3);
        g.closePath();
      });
      curve(g, 0, top - 9, 0.6, top - 3, 0, top + 2.5, LW * 2.4, 'rgba(58,42,31,0.22)');
      highlight(g, -6, top - 4.5, 3.4, 1.8, 0.55, -0.5);
      break;
    }
    case 'tophat': {
      paint(g, '#3d3632', LW, () => ell(g, 0, top + 3, 14, 3.2));
      paint(g, '#3d3632', LW, () => {
        g.beginPath();
        g.rect(-8.5, top - 16, 17, 19);
      });
      paint(g, '#3d3632', LW, () => ell(g, 0, top - 16, 8.5, 2));
      line(g, -8.3, top - 1, 8.3, top - 1, LW * 3, c);
      highlight(g, -4.5, top - 9, 1.2, 5, 0.25, 0);
      break;
    }
    case 'mailcap': {
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(-12, top + 4);
        g.bezierCurveTo(-13, top - 9, 13, top - 9, 12, top + 4);
        g.closePath();
      });
      paint(g, '#3d3632', LW, () => {
        g.beginPath();
        g.moveTo(-12, top + 4);
        g.quadraticCurveTo(0, top + 9, 12, top + 4);
        g.quadraticCurveTo(0, top + 6, -12, top + 4);
        g.closePath();
      });
      line(g, -11.6, top + 2, 11.6, top + 2, LW * 1.6, '#2a3a5a');
      paint(g, '#f3c43c', LW * 0.7, () => {
        g.beginPath();
        g.moveTo(0, top - 5.5);
        for (let i = 1; i <= 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * TAU;
          const r = i % 2 ? 1.4 : 3;
          g.lineTo(Math.cos(a) * r, top - 2.5 + Math.sin(a) * r);
        }
        g.closePath();
      });
      break;
    }
    case 'goggles': {
      line(g, -A.rx + 0.5, top + 6, A.rx - 0.5, top + 6, LW * 3.2, INK);
      line(g, -A.rx + 0.5, top + 6, A.rx - 0.5, top + 6, LW * 2, '#7a5236');
      for (const s of [-1, 1]) {
        paint(g, '#c9962a', LW, () => circ(g, s * 5, top + 5, 4));
        circ(g, s * 5, top + 5, 2.7);
        fill(g, '#9fd4f0');
        highlight(g, s * 5 - 0.8, top + 4, 1, 0.6, 0.8, -0.4);
      }
      break;
    }
    case 'flowers': {
      const cols = ['#f39ac0', '#fffdf6', '#f6d64a', '#e57a8a', '#8fc4f0'];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.12 + (i / 6) * 0.76);
        const x = Math.cos(a) * (A.rx - 0.5);
        const y = HY + Math.sin(a) * (A.ry - 0.5);
        for (let k = 0; k < 5; k++) {
          const b = (k / 5) * TAU;
          paint(g, cols[i % cols.length], LW * 0.4, () => circ(g, x + Math.cos(b) * 1.6, y + Math.sin(b) * 1.6, 1.3));
        }
        paint(g, '#f0913a', LW * 0.4, () => circ(g, x, y, 0.9));
      }
      break;
    }
    case 'mirror': {
      line(g, -A.rx + 0.5, top + 6, A.rx - 0.5, top + 6, LW * 2.6, INK);
      line(g, -A.rx + 0.5, top + 6, A.rx - 0.5, top + 6, LW * 1.6, '#5a5f6a');
      paint(g, '#dfe6ee', LW, () => circ(g, 0, top + 4, 5));
      circ(g, 0, top + 4, 1.4);
      fill(g, INK);
      highlight(g, -2, top + 2.4, 1.6, 0.8, 0.9, -0.5);
      break;
    }
    case 'kerchief': {
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(-A.rx - 0.5, HY - 1);
        g.bezierCurveTo(-A.rx, top - 6, A.rx, top - 6, A.rx + 0.5, HY - 1);
        g.bezierCurveTo(A.rx * 0.5, top + 5, -A.rx * 0.5, top + 5, -A.rx - 0.5, HY - 1);
        g.closePath();
      });
      for (const [x, y] of [[-6, top - 1], [0, top - 2.5], [6, top - 1], [-3, top + 2], [3, top + 2]]) {
        circ(g, x, y, 0.8);
        fill(g, '#fffdf6');
      }
      // knot and tails
      paint(g, c, LW, () => ell(g, A.rx - 1, top + 1, 2.6, 2.2));
      paint(g, c, LW, () => path(g, [[A.rx, top + 1], [A.rx + 7, top - 3], [A.rx + 5, top + 3]]));
      paint(g, c, LW, () => path(g, [[A.rx, top + 1], [A.rx + 6, top + 6], [A.rx + 2, top + 6]]));
      break;
    }
    case 'beret': {
      paint(g, c, LW, () => ell(g, 2, top + 1, 13, 4.6, -0.12));
      line(g, 2, top - 3.4, 3, top - 6, LW);
      break;
    }
    case 'bow': {
      g.save();
      g.translate(-A.rx * 0.55, top + 2);
      paint(g, c, LW, () => {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-5, -3.6);
        g.lineTo(-5, 3);
        g.closePath();
        g.moveTo(0, 0);
        g.lineTo(5, -3.6);
        g.lineTo(5, 3);
        g.closePath();
      });
      paint(g, c, LW * 0.8, () => circ(g, 0, 0, 1.4));
      g.restore();
      break;
    }
    default:
      break;
  }
}

// A squirrel's bushy tail curls up behind its shoulder.
function tail(g, A, L) {
  if (!A.tail) return;
  paint(g, L.fur, LW, () => {
    g.beginPath();
    g.moveTo(18, 30);
    g.bezierCurveTo(34, 26, 36, 4, 28, -12);
    g.bezierCurveTo(22, -24, 10, -26, 14, -16);
    g.bezierCurveTo(24, -8, 24, 8, 12, 18);
    g.closePath();
  });
  curve(g, 20, 20, 30, 4, 22, -14, LW * 0.5, 'rgba(58,42,31,0.4)');
  highlight(g, 24, -6, 2.5, 7, 0.3, 0.3);
}

// The backdrop: a soft wash of the neighbour's colour in an inked ring.
function backdrop(g, L) {
  g.save();
  circ(g, 0, -2, 31);
  g.clip();
  circ(g, 0, -2, 31);
  fill(g, L.bg || '#cfe8f6');
  const grd = g.createRadialGradient(-8, -14, 2, 0, -2, 34);
  grd.addColorStop(0, 'rgba(255,253,246,0.55)');
  grd.addColorStop(1, 'rgba(255,253,246,0)');
  g.fillStyle = grd;
  g.fillRect(-32, -34, 64, 64);
  g.restore();
}

// Draw a neighbour. framed: inside a round wash (for cards), or just the
// figure (for little icons).
export function drawFolk(g, L, mood = 'ask', framed = true) {
  const A = ANIMALS[L.animal] || ANIMALS.bear;
  const happy = mood === 'happy';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (framed) {
    // (hats and tall ears may poke out over the top of the frame)
    backdrop(g, L);
    circ(g, 0, -2, 31);
    stroke(g, LW * 1.6);
    g.save();
    g.beginPath();
    g.arc(0, -2, 31, 0, TAU);
    g.rect(-40, -60, 80, 58);
    g.clip();
  }
  tail(g, A, L);
  clothes(g, L);
  chestExtras(g, L);
  ears(g, A, L);
  headShape(g, A, L);
  floppyEars(g, A, L);
  eyes(g, A, L, happy);
  snout(g, A, L, happy);
  neckwear(g, L);
  faceExtras(g, A, L, happy);
  hat(g, A, L);
  if (framed) {
    g.restore();
    g.beginPath();
    g.arc(0, -2, 31, -0.08, Math.PI + 0.08);
    stroke(g, LW * 1.6);
  }
}

export { ANIMALS };
