// Picture-book art for the visitors who drop in from the garden outside
// (see data/visitors.js): a hedgehog, a mole, a robin, a kingfisher, a
// water vole, a hermit crab and a tortoise, each with a little something
// to wear, as everyone in Busytown has. Same conventions as the critters:
// ink outline over flat washes, facing right, in world units, but standing
// with their feet on y = 0 (a swimmer: the water's surface).
//   pose: 'idle' | 'walk' | 'fly' | 'swim' | 'pop' (the mole, coming up),
//   frame: 0 or 1 (a step, or a wingbeat); for 'pop', how far up (0..2)
import { INK, ell, circ, fill, stroke, paint, highlight, cheek, dotEye, smile, line, curve, drawHat, drawNeckwear } from './ink.js';

const LW = 0.85;

function legs(g, xs, top, frame, col, w = 2.2) {
  xs.forEach((x, i) => {
    const sw = (i % 2 === frame % 2 ? 1 : -1) * (frame >= 0 ? 1.1 : 0);
    paint(g, col, LW * 0.7, () => {
      g.beginPath();
      g.moveTo(x - w / 2, top);
      g.lineTo(x - w / 2 + sw, -0.2);
      g.lineTo(x + w / 2 + sw + 0.6, -0.2);
      g.lineTo(x + w / 2, top);
      g.closePath();
    });
  });
}

// ------------------------------------------------------------- hedgehog
// Hazel: a round little hedgehog with a red neckerchief.
function hedgehog(g, pose, frame) {
  const step = pose === 'walk' ? frame : -1;
  legs(g, [-8, 5], -4, step, '#8a6a4a', 2.6);
  // the prickly coat: a zigzag dome of spines
  const cx = -3;
  const cy = -9;
  g.beginPath();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * 0.92 + (i / n) * Math.PI * 0.86;
    const r = i % 2 ? 1.28 : 1;
    const x = cx + Math.cos(a) * 14 * r;
    const y = cy + Math.sin(a) * 10.5 * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.lineTo(cx + 12, cy + 7);
  g.lineTo(cx - 13, cy + 7.5);
  g.closePath();
  fill(g, '#6e5238');
  stroke(g, LW);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 1.05 + (i / 8) * Math.PI * 0.7;
    line(g, cx + Math.cos(a) * 6, cy + Math.sin(a) * 4.5, cx + Math.cos(a) * 12, cy + Math.sin(a) * 9, LW * 0.6, '#c9a87a');
  }
  // a soft tummy
  paint(g, '#e8d2ae', LW * 0.7, () => ell(g, cx + 2, cy + 4.5, 10, 4));
  // the pointy face
  paint(g, '#e8d2ae', LW, () => {
    g.beginPath();
    g.moveTo(5, -14);
    g.quadraticCurveTo(12, -12, 17.5, -6.8);
    g.quadraticCurveTo(13, -2, 6, -2.5);
    g.quadraticCurveTo(3, -8, 5, -14);
    g.closePath();
  });
  circ(g, 17.6, -6.8, 1.5);
  fill(g, INK);
  paint(g, '#d9b48a', LW * 0.7, () => ell(g, 6.5, -13.5, 2, 1.6, -0.4));
  dotEye(g, 11, -9.4, 1.05, false);
  cheek(g, 11.5, -6, 1.7);
  smile(g, 14.2, -5, 2, LW * 0.6);
  drawNeckwear(g, 'scarf', 5.5, -4, 3.4, LW * 0.8, '#d9483b');
}

// ------------------------------------------------------------- tortoise
// Tobias: an old tortoise in a straw sun hat.
function tortoise(g, pose, frame) {
  const step = pose === 'walk' ? frame : -1;
  legs(g, [-11, -2, 7], -6, step, '#9aa77a', 4);
  // the shell: a high dome of plates
  paint(g, '#a8814a', LW, () => {
    g.beginPath();
    g.moveTo(-19, -5);
    g.quadraticCurveTo(-18, -27, 0, -27);
    g.quadraticCurveTo(15, -27, 15, -5);
    g.closePath();
  });
  paint(g, '#8a6a3a', LW * 0.7, () => {
    g.beginPath();
    g.moveTo(-6, -24.5);
    g.lineTo(3, -24.5);
    g.lineTo(6, -17);
    g.lineTo(1, -11);
    g.lineTo(-7, -11);
    g.lineTo(-10, -17);
    g.closePath();
  });
  for (const [x0, y0, x1, y1] of [[-10, -17, -17, -18], [6, -17, 13, -18], [-7, -11, -11, -6], [1, -11, 4, -6], [-6, -24.5, -12, -25], [3, -24.5, 8, -25.5]]) line(g, x0, y0, x1, y1, LW * 0.7, '#6e4f2a');
  paint(g, '#c9a66a', LW * 0.8, () => {
    g.beginPath();
    g.moveTo(-20, -5);
    g.lineTo(16, -5);
    g.lineTo(15, -3);
    g.lineTo(-19, -3);
    g.closePath();
  });
  highlight(g, -9, -21, 4, 2, 0.3, -0.3);
  // the wrinkly head on its long neck
  paint(g, '#9aa77a', LW, () => {
    g.beginPath();
    g.moveTo(12, -9);
    g.quadraticCurveTo(17, -15, 21, -15);
    g.quadraticCurveTo(28, -15, 27.5, -10.5);
    g.quadraticCurveTo(27, -7.5, 21, -8);
    g.quadraticCurveTo(17, -6, 14, -4);
    g.closePath();
  });
  for (const y of [-11, -8.5]) curve(g, 14.5, y, 16, y - 1, 17.5, y + 0.4, LW * 0.45);
  dotEye(g, 23.5, -12.2, 1, false);
  cheek(g, 24, -10, 1.4);
  smile(g, 26, -9.6, 1.6, LW * 0.6);
  drawHat(g, 'sunhat', 22.5, -14.6, 3.6, LW * 0.8, '#77b255');
}

// ---------------------------------------------------------- hermit crab
// Hector: a hermit crab in a borrowed whelk shell, with a tiny bow tie.
function crab(g, pose, frame) {
  // thin legs, walking sideways
  const k = pose === 'walk' ? (frame ? 1 : -1) : 0;
  for (const [x, s] of [[2, -1], [5, 1], [8, -1]]) {
    curve(g, x, -5, x + 2 + s * k * 0.8, -4, x + 3 + s * k, 0, LW * 0.9, '#d9483b');
  }
  // the body poking out of the front of the shell
  paint(g, '#e8643f', LW, () => ell(g, 6, -7, 5.5, 3.8));
  // claws
  paint(g, '#e8643f', LW * 0.8, () => ell(g, 12.5, -5.5, 2.8, 2, 0.4));
  paint(g, '#e8643f', LW * 0.8, () => ell(g, 11, -3, 2.4, 1.7, 0.2));
  line(g, 13.6, -6.4, 15.2, -6.8, LW * 0.6);
  // eyes up on their stalks
  line(g, 7.5, -10, 8, -15, LW * 0.8, '#d9483b');
  line(g, 9.5, -10, 11, -14.5, LW * 0.8, '#d9483b');
  circ(g, 8, -15.4, 1.3);
  fill(g, '#fffdf6');
  stroke(g, LW * 0.5);
  circ(g, 11.1, -14.9, 1.3);
  fill(g, '#fffdf6');
  stroke(g, LW * 0.5);
  circ(g, 8.3, -15.4, 0.6);
  fill(g, INK);
  circ(g, 11.4, -14.9, 0.6);
  fill(g, INK);
  smile(g, 9.8, -6.5, 1.6, LW * 0.5);
  cheek(g, 8.5, -6, 1.1);
  // the shell, a whelk spiral
  paint(g, '#f2dcc0', LW, () => {
    g.beginPath();
    g.moveTo(3, -2);
    g.quadraticCurveTo(-9, -1, -10, -10);
    g.quadraticCurveTo(-9, -19, 0, -17);
    g.quadraticCurveTo(5, -15, 4, -9);
    g.closePath();
  });
  g.beginPath();
  for (let i = 0; i <= 30; i++) {
    const a = i * 0.32;
    const r = 7 - i * 0.2;
    const x = -3.5 + Math.cos(a) * r;
    const y = -10 + Math.sin(a) * r * 0.9;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  stroke(g, LW * 0.6, '#b08a6a');
  highlight(g, -5, -14, 2.4, 1.2, 0.4, -0.4);
  drawNeckwear(g, 'bowtie', 7, -4, 2, LW * 0.7, '#4c8fd6');
}

// ------------------------------------------------------------- mole
// Mortimer: a velvety mole in round spectacles, popping out of a molehill.
// frame: how far up he is (0 just a nose, 2 all the way)
function mole(g, pose, frame) {
  const up = pose === 'pop' ? [5, 10, 14][Math.max(0, Math.min(2, frame))] : 14;
  g.save();
  g.beginPath();
  g.rect(-20, -40, 40, 37.5);
  g.clip();
  g.translate(0, 14 - up);
  // the velvet body
  paint(g, '#4a4552', LW, () => ell(g, 0, -11, 7.5, 9.5));
  highlight(g, -3, -15, 2, 4, 0.25, 0.2);
  // pink snout, pointing up and out
  paint(g, '#f2a8b0', LW * 0.8, () => {
    g.beginPath();
    g.moveTo(3, -18.5);
    g.quadraticCurveTo(9, -21, 9.5, -17.5);
    g.quadraticCurveTo(8.5, -15, 4, -15.5);
    g.closePath();
  });
  circ(g, 9.2, -18.2, 0.9);
  fill(g, '#c9707a');
  // spectacles over tiny eyes
  for (const x of [0.5, 4]) {
    circ(g, x, -16, 1.9);
    fill(g, 'rgba(220,236,246,0.5)');
    stroke(g, LW * 0.6);
    circ(g, x + 0.3, -16, 0.5);
    fill(g, INK);
  }
  line(g, 2.4, -16, 2.1, -16, LW * 0.6);
  cheek(g, 3, -13, 1.4);
  smile(g, 5.5, -13.4, 1.6, LW * 0.6);
  // big digging paws resting on the hill
  paint(g, '#f2a8b0', LW * 0.8, () => ell(g, -6.5, -5, 3.4, 2.2, -0.4));
  paint(g, '#f2a8b0', LW * 0.8, () => ell(g, 6.5, -5, 3.4, 2.2, 0.4));
  for (const s of [-1, 1]) for (const d of [-1.2, 0, 1.2]) line(g, s * 6.5 + s * 2.6 + d * 0.3, -5 + d, s * 6.5 + s * 3.6 + d * 0.3, -5.2 + d, LW * 0.4);
  g.restore();
  // the molehill in front
  paint(g, '#6a4a30', LW, () => {
    g.beginPath();
    g.moveTo(-15, 0);
    g.quadraticCurveTo(-9, -6, 0, -5.5);
    g.quadraticCurveTo(9, -6, 15, 0);
    g.closePath();
  });
  for (const [x, y] of [[-8, -2.2], [-3, -3.6], [3.5, -3.2], [9, -1.8], [0, -1.4]]) {
    circ(g, x, y, 0.8);
    fill(g, '#4a3220');
  }
}

// ------------------------------------------------------------- birds
function bird(g, pose, frame, P) {
  const fly = pose === 'fly';
  if (!fly) {
    line(g, -1.5, -3.5, -2, 0, LW * 0.8, P.feet);
    line(g, 1.5, -3.5, 1.6, 0, LW * 0.8, P.feet);
    line(g, -3.5, 0, 0, 0, LW * 0.7, P.feet);
    line(g, 0, 0, 3, 0, LW * 0.7, P.feet);
  }
  // tail
  paint(g, P.back, LW * 0.8, () => {
    g.beginPath();
    g.moveTo(-5, -8);
    g.lineTo(-P.tail - 7, -10 - P.tail * 0.6);
    g.lineTo(-P.tail - 5.5, -7.5 - P.tail * 0.3);
    g.lineTo(-4, -5);
    g.closePath();
  });
  // the far wing, beating, when flying
  if (fly) {
    paint(g, P.wing, LW * 0.7, () => {
      g.beginPath();
      g.moveTo(-1, -12);
      g.quadraticCurveTo(-4, frame ? -22 : -4, -11, frame ? -25 : -2);
      g.quadraticCurveTo(-4, frame ? -17 : -6, 2, -10);
      g.closePath();
    });
  }
  // body and head
  paint(g, P.back, LW, () => ell(g, 0, -9.5, 8, 6.6, -0.12));
  paint(g, P.breast, LW * 0.8, () => {
    g.beginPath();
    g.moveTo(2, -14.5);
    g.quadraticCurveTo(9, -12, 7, -6);
    g.quadraticCurveTo(3, -2.6, -2, -4);
    g.quadraticCurveTo(1, -9, 2, -14.5);
    g.closePath();
  });
  if (P.belly) paint(g, P.belly, LW * 0.5, () => ell(g, 1, -4.6, 4, 1.8, -0.1));
  paint(g, P.back, LW, () => circ(g, 5, -15, 4.8));
  if (P.cap) {
    g.save();
    circ(g, 5, -15, 4.8);
    g.clip();
    paint(g, P.cap, 0, () => ell(g, 5, -19, 6, 3.4));
    g.restore();
    circ(g, 5, -15, 4.8);
    stroke(g, LW);
  }
  if (P.throat) paint(g, P.throat, LW * 0.5, () => ell(g, 8.2, -13, 1.8, 1.4));
  if (P.cheekPatch) paint(g, P.cheekPatch, LW * 0.5, () => ell(g, 5, -14, 2.2, 1.5, -0.2));
  // beak
  paint(g, P.beak, LW * 0.7, () => {
    g.beginPath();
    g.moveTo(9, -16.6);
    g.lineTo(9 + P.bill, -15.4 + P.bill * 0.06);
    g.lineTo(9, -14.2);
    g.closePath();
  });
  dotEye(g, 6.4, -16.2, 1, false);
  cheek(g, 6.2, -13.6, 1.2);
  // the near wing
  if (fly) {
    paint(g, P.wing, LW * 0.8, () => {
      g.beginPath();
      g.moveTo(-2, -11);
      g.quadraticCurveTo(0, frame ? -24 : -2, -6, frame ? -27 : 1);
      g.quadraticCurveTo(-1, frame ? -18 : -4, 4, -9);
      g.closePath();
    });
  } else {
    paint(g, P.wing, LW * 0.8, () => ell(g, -2, -9.5, 5.2, 3.4, -0.25));
    for (const d of [0, 1.4]) curve(g, -5.5, -9 + d, -3, -8 + d, -0.5, -9 + d, LW * 0.4);
  }
  if (P.wear) P.wear(g);
}
const ROBIN = { back: '#8a6a4a', wing: '#76583c', breast: '#e8643f', belly: '#f6ead0', beak: '#e0a83a', feet: '#c98a6a', tail: 4, bill: 3.2, wear: (g) => drawHat(g, 'beanie', 4.6, -19.2, 3, LW * 0.7, '#4c8fd6') };
const KINGFISHER = { back: '#2f8ad0', wing: '#2470b0', breast: '#f08a2c', throat: '#fffdf6', cheekPatch: '#f08a2c', cap: '#1f5f9a', beak: '#3a2a1f', feet: '#e2553f', tail: 1.5, bill: 9, wear: (g) => drawNeckwear(g, 'bowtie', 5, -10.6, 1.6, LW * 0.6, '#f3c43c') };
function robin(g, pose, frame) {
  bird(g, pose, frame, ROBIN);
}
function kingfisher(g, pose, frame) {
  bird(g, pose, frame, KINGFISHER);
}

// ------------------------------------------------------------- water vole
// Wilma: a round brown water vole with a flower behind her ear. Swimming,
// only her top half is above the water (y = 0 is the surface).
function vole(g, pose, frame) {
  const swim = pose === 'swim';
  if (swim) {
    // the little V of ripples she leaves behind
    curve(g, -16, 1.2, -9, -0.4, -2, 0.8, LW * 0.6, 'rgba(255,255,255,0.8)');
    curve(g, -14, 2.8, -8, 1.4, -1, 2.2, LW * 0.5, 'rgba(255,255,255,0.6)');
  } else {
    legs(g, [-6, 6], -3, pose === 'walk' ? frame : -1, '#e8b0a0', 2.2);
    curve(g, -11, -5, -17, -3, -21, -6, LW * 1.4, '#6e4f3a');
  }
  g.save();
  if (swim) {
    g.beginPath();
    g.rect(-24, -30, 48, 30.5);
    g.clip();
    g.translate(0, 4);
  }
  paint(g, '#7a5a40', LW, () => ell(g, 0, -8, 11.5, 7.5));
  highlight(g, -4, -12, 3, 1.6, 0.25, -0.2);
  paint(g, '#a07a58', LW * 0.6, () => ell(g, 1, -3.8, 7, 2.6));
  // head and blunt nose
  paint(g, '#7a5a40', LW, () => ell(g, 9.5, -11, 6, 5));
  paint(g, '#5f4430', LW * 0.6, () => circ(g, 7, -15.4, 1.8));
  circ(g, 15.4, -10.6, 1.2);
  fill(g, '#3a2a1f');
  for (const d of [-0.8, 0.8]) line(g, 14, -9.8 + d * 0.4, 18.5, -10 + d * 1.4, LW * 0.35);
  dotEye(g, 11.2, -12.6, 1, false);
  cheek(g, 11.5, -9.8, 1.4);
  smile(g, 13.6, -8.8, 1.4, LW * 0.5);
  drawHat(g, 'flower', 6, -15.2, 2.6, LW * 0.7, '#f39ac0');
  g.restore();
}

export const VISITOR_ART = {
  hedgehog: { box: [-20, -24, 21, 2], draw: hedgehog },
  tortoise: { box: [-22, -31, 31, 2], draw: tortoise },
  crab: { box: [-13, -20, 17, 2], draw: crab },
  mole: { box: [-17, -26, 17, 2], draw: mole },
  robin: { box: [-14, -29, 15, 2], draw: robin },
  kingfisher: { box: [-12, -29, 20, 2], draw: kingfisher },
  vole: { box: [-23, -21, 21, 4], draw: vole },
};

export function drawVisitor(g, type, pose = 'idle', frame = 0) {
  const a = VISITOR_ART[type];
  if (a) a.draw(g, pose, frame);
}
