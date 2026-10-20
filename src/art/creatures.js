// Procedural picture-book art for every critter. All creatures face right,
// centred on (0,0), in world units. Feet rest at y = foot (see FOOT below).
import {
  INK, TAU, PAL, ell, circ, fill, stroke, paint, blob, smoothPath, fuzzPath, highlight, cheek, eye, dotEye,
  smile, line, bent, curve, antenna, wing, drawHat, drawNeckwear, isNeckwear,
} from './ink.js';

export const PALETTES = {
  ant: [
    { body: '#c4553b', light: '#e07a5a' },
    { body: '#6e4630', light: '#97664a' },
    { body: '#d1873a', light: '#efaa60' },
  ],
  cricket: [
    { body: '#b98a52', dark: '#8a643b', light: '#d9b07a' },
    { body: '#8d6b4a', dark: '#5f4632', light: '#b08b66' },
    { body: '#a7955a', dark: '#7a6a3a', light: '#c9b97c' },
  ],
  grasshopper: [
    { body: '#8cbf4a', dark: '#5f9a32', light: '#b6dc7a' },
    { body: '#c9b44a', dark: '#9a8a2a', light: '#e6d68a' },
    { body: '#7fb86a', dark: '#4f8a3c', light: '#a8d68a' },
  ],
  gecko: [
    { body: '#f2c94c', spot: '#8a5a2b', belly: '#fbeac0' },
    { body: '#f39a4a', spot: '#7a4a2a', belly: '#fde2c4' },
    { body: '#9ccf6a', spot: '#d9483b', belly: '#e8f4c8' },
    { body: '#e9dcc0', spot: '#6b5a4a', belly: '#fff7e6' },
  ],
  beetle: [
    { shell: '#45507f', head: '#323a5e' },
    { shell: '#3f7d4f', head: '#2c5a38' },
    { shell: '#8a5a2c', head: '#5f3d1f' },
    { shell: '#6a3f6f', head: '#4a2a4f' },
  ],
  goldfish: [
    { body: '#f08a3c', fin: '#f7b26b', belly: '#fbd29a' },
    { body: '#f2c14e', fin: '#f8da8a', belly: '#fff0bf' },
    { body: '#f7f0e2', fin: '#f6c9a8', belly: '#ffffff', cap: '#e8603c' },
    { body: '#e2553f', fin: '#f39a7a', belly: '#fbc7aa' },
  ],
  frog: [
    { body: '#6fae4a', belly: '#d6e59a', spot: '#4f8a3c', sac: '#f4eeb0' },
    { body: '#58b85b', belly: '#e9f2b8', spot: '#3f8a3f', sac: '#f4eeb0', eyeWhite: '#e8473c' },
    { body: '#9b7a4a', belly: '#e8d6a8', spot: '#6b5233', sac: '#f6e6c0' },
    { body: '#4d8fd6', belly: '#9cc9ee', spot: '#2a3a5a', sac: '#cfe6f7' },
  ],
  turtle: [
    { shell: '#6c8a3f', rim: '#c9b458', belly: '#efd77a', skin: '#9cb64f', stripe: '#f0e08a', ear: true },
    { shell: '#8a6a3f', rim: '#c9a46a', belly: '#f2dc9a', skin: '#a8a45a', stripe: '#f0e08a' },
    { shell: '#4f7a5a', rim: '#a8c48a', belly: '#e6e2a0', skin: '#8fb07a', stripe: '#e8eaa8' },
  ],
  pondsnail: [
    { shell: '#c08a4a', body: '#b9a58a', kind: 'cone' },
    { shell: '#c95b4a', body: '#c7a99a', kind: 'ramshorn' },
    { shell: '#5a4a3a', body: '#a69a8a', kind: 'cone' },
    { shell: '#efe3c4', body: '#d8c8b0', kind: 'ramshorn' },
  ],
  shrimp: [
    { body: 'rgba(226,82,74,0.93)' },
    { body: 'rgba(95,143,216,0.92)' },
    { body: 'rgba(232,194,61,0.93)' },
    { body: 'rgba(214,200,182,0.9)' },
  ],
  ladybug: [
    { shell: '#d9433a', spots: true },
    { shell: '#f08a2c', spots: true },
    { shell: '#e8c53a', spots: true },
  ],
  aphid: [{ body: '#9cc95a' }, { body: '#c2d66a' }, { body: '#f0a0a8' }],
  butterfly: [
    { wing: '#f08a2c', border: '#2d2622', dots: '#ffffff', under: '#f4b26a', cat: '#f2d24a', catStripe: '#2d2622', chrys: '#7ccf9a' },
    { wing: '#4f9be0', border: '#22304a', dots: '#d9ecff', under: '#a9c9e8', cat: '#8cc152', catStripe: '#f0bf45', chrys: '#a7d27a' },
    { wing: '#f2d24a', border: '#2d2622', dots: '#ffffff', under: '#f6e38c', cat: '#9cd27a', catStripe: '#2d2622', chrys: '#c7d98a' },
    { wing: '#f39ac0', border: '#7a3a5a', dots: '#ffffff', under: '#f7c6da', cat: '#f2b5c4', catStripe: '#7a3a5a', chrys: '#e8c7d6' },
  ],
  snail: [
    { shell: '#d4a46a', band: '#a8743f', body: '#cdbba0' },
    { shell: '#f2b5c4', band: '#d6809a', body: '#d9c8b8' },
    { shell: '#b8d99a', band: '#7fae5f', body: '#cdbba0' },
    { shell: '#c9b8e8', band: '#9a85c4', body: '#d4c4b4' },
  ],
  bee: [
    { yellow: '#f5c53d', black: '#3d3029' },
    { yellow: '#f7a83d', black: '#3d3029' },
  ],
  firefly: [{ body: '#4a3a2e', shield: '#e8763c', elytra: '#5a4636', lantern: '#f2eb94' }],
  pillbug: [{ body: '#8f96a3' }, { body: '#7d8aa0' }, { body: '#9a8a7a' }, { body: '#e89a5a', spots: true }],
  fruitfly: [{ body: '#d8b072' }],
  worm: [
    { body: '#e89a9a', band: '#f4bcb2' },
    { body: '#d98a8a', band: '#ecaaa2' },
  ],
};

// Distance from body centre to feet, per species/stage.
export function footOf(sp, stage) {
  switch (sp) {
    case 'ant':
      return stage === 'queen' ? 5.4 : 4.0;
    case 'cricket':
      return 4.6;
    case 'grasshopper':
      return 5.4;
    case 'gecko':
      return 7.2;
    case 'beetle':
      return 5.0;
    case 'frog':
      return stage === 'adult' ? 8.4 : stage === 'froglet' ? 4.6 : 3.5;
    case 'turtle':
      return stage === 'hatchling' ? 3.6 : 8.0;
    case 'pondsnail':
      return 2.6;
    case 'shrimp':
      return 3.8;
    case 'ladybug':
      return 3.6;
    case 'aphid':
      return 2.6;
    case 'butterfly':
      return stage === 'caterpillar' ? 2.6 : stage === 'adult' ? 2.0 : 1.5;
    case 'snail':
      return stage === 'baby' ? 1.2 : 2.4;
    case 'bee':
      return 4.5;
    case 'firefly':
      return 3.2;
    case 'pillbug':
      return 3.0;
    case 'fruitfly':
      return 2.2;
    case 'goldfish':
      return 0;
    default:
      return 3;
  }
}

function legsTripod(g, xs, y0, footY, spread, frame, walking, lw, color = INK) {
  const ph = walking ? [[1.2, -1.2, 1.2], [0.5, -0.5, 0.5], [-1.2, 1.2, -1.2], [-0.5, 0.5, -0.5]][frame % 4] : [0, 0, 0];
  for (let i = 0; i < xs.length; i++) {
    const bx = xs[i];
    const fx = bx + spread[i] + ph[i % 3];
    const kx = bx + (fx - bx) * 0.55;
    const ky = y0 + (footY - y0) * 0.2 - 1.1;
    bent(g, bx, y0, kx, ky, fx, footY, lw, color);
  }
}

// ---------------------------------------------------------------- ANT
function drawAnt(g, o) {
  const q = o.stage === 'queen';
  const s = q ? 1.35 : 1;
  const P = o.pal;
  const lw = o.lw;
  const walking = o.pose === 'walk' || o.pose === 'carry' || o.pose === 'dig';
  const foot = footOf('ant', o.stage);
  legsTripod(g, [-0.3 * s, 1.0 * s, 2.3 * s], 0.9 * s, foot, [-3.2 * s, 0.2 * s, 3.2 * s], o.frame, walking, lw * 0.75);
  if (q) {
    // wing stubs
    wing(g, -1.8, -3.4, 3.2, 1.2, -0.25, lw, 'rgba(214,236,250,0.55)');
  }
  // gaster
  const gx = q ? -5.6 : -4.3;
  const grx = q ? 5.2 : 3.7;
  const gry = q ? 3.8 : 2.9;
  blob(g, gx, -0.2 * s, grx, gry, P.body, lw, -0.12);
  highlight(g, gx - grx * 0.15, -0.2 * s - gry * 0.45, grx * 0.5, gry * 0.28, 0.4);
  if (q) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const x = gx - 2 + i * 2.2;
      g.moveTo(x, -gry + 0.6);
      g.quadraticCurveTo(x - 0.6, 0, x, gry - 0.9);
      stroke(g, lw * 0.5, 'rgba(58,42,31,0.5)');
    }
  }
  blob(g, -0.9 * s, 0.3 * s, 0.9 * s, 0.75 * s, P.body, lw * 0.8);
  blob(g, 1.3 * s, 0.1 * s, 2.1 * s, 1.45 * s, P.body, lw, 0.1);
  // head
  const hx = 4.7 * s;
  const hy = -0.4 * s;
  // antennae (back one first)
  bent(g, hx + 0.1 * s, hy - 2.0 * s, hx + 1.3 * s, hy - 5.6 * s, hx + 3.2 * s, hy - 5.0 * s, lw * 0.6);
  blob(g, hx, hy, 2.5 * s, 2.3 * s, P.body, lw);
  highlight(g, hx - 0.6 * s, hy - 1.1 * s, 1.0 * s, 0.6 * s, 0.4);
  bent(g, hx + 0.7 * s, hy - 2.0 * s, hx + 2.2 * s, hy - 5.4 * s, hx + 4.3 * s, hy - 4.2 * s, lw * 0.6);
  circ(g, hx + 4.3 * s, hy - 4.2 * s, 0.45 * s);
  fill(g, INK);
  dotEye(g, hx + 0.9 * s, hy - 0.5 * s, 0.85 * s, o.closed);
  cheek(g, hx + 1.4 * s, hy + 0.9 * s, 0.65 * s);
  curve(g, hx + 2.1 * s, hy + 1.0 * s, hx + 2.9 * s, hy + 1.6 * s, hx + 2.5 * s, hy + 2.0 * s, lw * 0.7);
  if (q) drawHat(g, 'crown', hx - 0.2, hy - 2.1 * s, 2.0 * s, lw * 0.8, '#f3c43c');
  else if (o.acc === 'hardhat') drawHat(g, 'hardhat', hx - 0.3, hy - 1.6, 2.3, lw * 0.8, '#f6c832');
}

// ---------------------------------------------------------------- CRICKET / GRASSHOPPER
function drawHopper(g, o, grass) {
  const P = o.pal;
  const lw = o.lw;
  const s = grass ? 1.15 : 1;
  const foot = footOf(grass ? 'grasshopper' : 'cricket');
  const walking = o.pose === 'walk';
  const jump = o.pose === 'jump';
  // antennae
  if (grass) {
    curve(g, 7 * s, -3.4, 9 * s, -10, 4 * s, -12, lw * 0.6);
    curve(g, 6.5 * s, -3.2, 7.5 * s, -9.5, 2 * s, -11, lw * 0.6);
  } else {
    curve(g, 7, -3, 5, -15, -9, -12, lw * 0.55);
    curve(g, 6.5, -3, 7, -13, -5, -14.5, lw * 0.55);
  }
  // far legs (thin)
  legsTripod(g, [2.6 * s, 1.0 * s], 2.0, foot, [1.6, 0.2], o.frame, walking, lw * 0.7);
  // body
  blob(g, -0.5 * s, 0, 6.6 * s, 3.2 * s, P.body, lw);
  highlight(g, -1.5 * s, 1.4, 4 * s, 0.9, 0.25, 0);
  // folded wings
  const lift = o.pose === 'chirp' ? (o.frame % 2 ? -0.32 : -0.18) : 0;
  g.save();
  g.translate(3 * s, -2.2);
  g.rotate(lift);
  paint(g, P.dark, lw, () => {
    g.beginPath();
    g.moveTo(0.4, -0.4);
    g.quadraticCurveTo(-5 * s, -1.8, (grass ? -12.5 : -10.2) * s, -0.2);
    g.lineTo((grass ? -12 : -9.8) * s, 1.3);
    g.quadraticCurveTo(-5 * s, 0.6, 0.2, 1.6);
    g.closePath();
  });
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(-i * 2.4 * s, -0.6);
    g.lineTo(-i * 2.4 * s - 1.2, 1.2);
    stroke(g, lw * 0.4, 'rgba(58,42,31,0.5)');
  }
  g.restore();
  // big hind leg
  const hip = [-0.6 * s, 1.2];
  const knee = jump ? [-6.5 * s, 1.6] : [-6.2 * s, -2.4];
  const ft = jump ? [-11.5 * s, 3.8] : [-7.2 * s, foot];
  const ang = Math.atan2(knee[1] - hip[1], knee[0] - hip[0]);
  blob(g, (hip[0] + knee[0]) / 2, (hip[1] + knee[1]) / 2, 3.8 * s, 1.55 * s, P.light, lw, ang);
  for (let i = 0; i < 3; i++) {
    const t = 0.3 + i * 0.2;
    const x = hip[0] + (knee[0] - hip[0]) * t;
    const y = hip[1] + (knee[1] - hip[1]) * t;
    line(g, x - 0.4, y - 0.8, x + 0.4, y + 0.8, lw * 0.4, 'rgba(58,42,31,0.45)');
  }
  line(g, knee[0], knee[1], ft[0], ft[1], lw * 1.0);
  line(g, ft[0], ft[1], ft[0] + 1.6, ft[1], lw * 0.9);
  // front leg (near)
  legsTripod(g, [3.6 * s], 2.2, foot, [1.8], o.frame + 1, walking, lw * 0.75);
  // head
  const hx = 6.2 * s;
  blob(g, hx, -0.5, 3.2 * s, 3.0 * s, P.body, lw);
  highlight(g, hx - 0.8, -2, 1.4, 0.8, 0.35);
  eye(g, hx + 0.8, -1.3, 1.45, lw, { closed: o.closed, pupil: 0.55 });
  cheek(g, hx + 1.6, 0.7, 0.85);
  smile(g, hx + 2.1, 1.0, 0.8, lw * 0.8);
  if (!grass) {
    line(g, -6.8, 0, -9.6, -0.8, lw * 0.6);
    line(g, -6.8, 0.6, -9.4, 1.2, lw * 0.6);
  }
  accessory(g, o, hx, -3.3, 2.6, hx - 2.5, 1.6, 1.8, true);
}

// ---------------------------------------------------------------- GECKO
function drawGecko(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const s = o.stage === 'baby' ? 1 : 1;
  const walking = o.pose === 'walk';
  const f = o.frame % 4;
  const off = walking ? [1.6, 0.6, -1.6, -0.6][f] : 0;
  const foot = footOf('gecko');
  const leg = (bx, by, fx, near) => {
    const kx = (bx + fx) / 2 + (near ? 0.6 : -0.6);
    const ky = by + 2.8;
    g.beginPath();
    g.moveTo(bx, by);
    g.quadraticCurveTo(kx, ky + 1.2, fx, foot - 0.6);
    stroke(g, lw * 3.2, INK);
    stroke(g, lw * 3.2 - lw * 1.4, near ? P.body : shade(P.body));
    for (let i = -1; i <= 1; i++) {
      circ(g, fx + i * 1.1 + 0.4, foot - 0.2, 0.75);
      fill(g, near ? P.body : shade(P.body));
      stroke(g, lw * 0.6);
    }
  };
  // far legs
  leg(9, 2, 11 - off, false);
  leg(-6, 2, -8 + off, false);
  // tail
  paint(g, P.body, lw, () => {
    g.beginPath();
    g.moveTo(-7, -3.8);
    g.bezierCurveTo(-14, -4.5, -19, -1.5, -25, 2.6);
    g.quadraticCurveTo(-25.6, 3.6, -24.2, 3.6);
    g.bezierCurveTo(-18, 2.8, -13, 4.6, -7, 4.4);
    g.closePath();
  });
  for (let i = 0; i < 4; i++) {
    const x = -10 - i * 3.6;
    g.beginPath();
    g.moveTo(x + 0.6, -3.4 + i * 1.2);
    g.quadraticCurveTo(x - 0.6, 0.4 + i * 0.6, x + 0.2, 3.6 + i * 0.1);
    stroke(g, lw * 1.1, P.spot);
  }
  // body
  blob(g, 1, 0, 11, 5.2, P.body, lw);
  ell(g, 1.5, 2.8, 8.6, 2.0);
  fill(g, P.belly);
  highlight(g, -1, -2.6, 6, 1.4, 0.3, 0);
  const spots = [[-5, -2.4], [-1.5, -3.4], [2.2, -2.6], [5.8, -3.2], [-3.2, 0.2], [3.4, 0.4], [7.6, -0.6]];
  for (const [x, y] of spots) {
    circ(g, x, y, 0.85);
    fill(g, P.spot);
  }
  // near legs
  leg(9.5, 3, 12 + off, true);
  leg(-5.5, 3, -7 - off, true);
  // head
  blob(g, 15, -1.6, 7, 5.4, P.body, lw, -0.08);
  highlight(g, 13.5, -4.6, 3, 1.1, 0.3, 0);
  circ(g, 12.6, -4.6, 0.7);
  fill(g, P.spot);
  circ(g, 14.4, -5.6, 0.6);
  fill(g, P.spot);
  eye(g, 17.2, -3.0, 2.4, lw, { closed: o.closed, pupil: 0.62, lookX: 0.45 });
  cheek(g, 18.8, 0.6, 1.4);
  curve(g, 21.6, 0.0, 19.6, 2.4, 15.4, 1.4, lw);
  circ(g, 21.2, -1.8, 0.35);
  fill(g, INK);
  if (o.pose === 'eat') {
    curve(g, 21.4, 0.6, 23.5, 1.4, 25, 0.8, lw * 1.3, '#e8737a');
    circ(g, 25, 0.8, 0.8);
    fill(g, '#e8737a');
  }
  accessory(g, o, 15.2, -6.6, 3.4, 9.5, 1.6, 2.6);
}

function shade(hex) {
  // darken a hex colour a little for far-side limbs
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) - 28);
  const gg = Math.max(0, ((n >> 8) & 255) - 28);
  const b = Math.max(0, (n & 255) - 28);
  return `rgb(${r},${gg},${b})`;
}

// ---------------------------------------------------------------- BEETLE
function drawBeetle(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const foot = footOf('beetle');
  legsTripod(g, [-3, 0.4, 3.2], 1.6, foot, [-1.8, 0, 1.8], o.frame, o.pose === 'walk', lw * 0.8);
  paint(g, P.shell, lw, () => {
    g.beginPath();
    g.moveTo(-7.6, 2);
    g.bezierCurveTo(-8.2, -6.6, 3.2, -8, 4.4, 2);
    g.closePath();
  });
  // elytra seam and grooves
  curve(g, 3.6, -3.2, -2.5, -6.5, -7.4, 0.8, lw * 0.6, 'rgba(255,255,255,0.35)');
  curve(g, 3.2, -1.2, -2.2, -3.8, -6.6, 1.4, lw * 0.5, 'rgba(0,0,0,0.25)');
  highlight(g, -2.6, -4.2, 3.2, 1.1, 0.45, -0.25);
  blob(g, 4.8, -0.4, 2.4, 2.6, P.head, lw);
  highlight(g, 4.4, -1.8, 0.9, 0.5, 0.4);
  blob(g, 7.4, 0.5, 2.1, 2.0, P.head, lw);
  bent(g, 8.2, -1.0, 9.6, -3.4, 11, -2.6, lw * 0.6);
  dotEye(g, 8.0, -0.2, 0.8, o.closed, '#1b1714');
  circ(g, 8.0, -0.2, 0.9);
  stroke(g, lw * 0.4, '#fff');
  cheek(g, 8.5, 1.2, 0.65);
  accessory(g, o, 6.8, -1.2, 1.9, 5.6, 1.4, 1.5);
}

// ---------------------------------------------------------------- GOLDFISH
function drawFish(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const fry = o.stage === 'fry' || o.stage === 'egg';
  if (o.stage === 'egg') {
    for (let i = 0; i < 6; i++) {
      circ(g, (i % 3) * 2.2 - 2.2, Math.floor(i / 3) * 2 - 1, 1.0);
      fill(g, 'rgba(255,240,200,0.8)');
      stroke(g, lw * 0.4);
    }
    return;
  }
  if (fry) {
    g.save();
    g.scale(0.5, 0.5);
    g.globalAlpha *= 0.9;
  }
  const f = o.frame % 4;
  const tail = [0.32, 0, -0.32, 0][f];
  // tail
  g.save();
  g.translate(-8, 0);
  g.rotate(tail);
  paint(g, P.fin, lw, () => {
    g.beginPath();
    g.moveTo(0.5, -1.8);
    g.quadraticCurveTo(-4.5, -8.5, -10.5, -8.8);
    g.quadraticCurveTo(-7.5, -2.5, -8.8, 0);
    g.quadraticCurveTo(-7.5, 2.5, -10.5, 8.8);
    g.quadraticCurveTo(-4.5, 8.5, 0.5, 1.8);
    g.closePath();
  });
  for (let i = -2; i <= 2; i++) curve(g, -1, 0, -5, i * 2.2, -8.4, i * 3.4, lw * 0.4, 'rgba(58,42,31,0.35)');
  g.restore();
  // dorsal & belly fins
  paint(g, P.fin, lw, () => {
    g.beginPath();
    g.moveTo(-4.5, -5.6);
    g.quadraticCurveTo(-1.5, -11.5, 4, -9);
    g.quadraticCurveTo(3.4, -6.6, 4.4, -5.4);
    g.closePath();
  });
  paint(g, P.fin, lw, () => {
    g.beginPath();
    g.moveTo(-5, 5);
    g.quadraticCurveTo(-7.5, 9, -3.4, 8.6);
    g.quadraticCurveTo(-2, 7, -0.5, 6);
    g.closePath();
  });
  // body
  blob(g, 0, 0, 9.5, 6.6, P.body, lw);
  ell(g, 1.5, 2.6, 7, 3.2);
  g.save();
  g.globalAlpha *= 0.6;
  fill(g, P.belly);
  g.restore();
  if (P.cap) {
    paint(g, P.cap, 0, () => ell(g, 4.6, -3.6, 4.2, 2.6, 0.3));
  }
  // scales
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x = -4 + c * 2.8 + r * 1.4;
      const y = -1.6 + r * 2.4;
      g.beginPath();
      g.arc(x, y, 1.3, -0.6 * Math.PI, 0.6 * Math.PI);
      stroke(g, lw * 0.45, 'rgba(58,42,31,0.3)');
    }
  }
  highlight(g, -0.5, -3.8, 5, 1.4, 0.35, -0.1);
  curve(g, 4.4, -4.6, 3.2, 0, 4.6, 4.6, lw * 0.6);
  // pectoral fin flutter
  paint(g, P.fin, lw * 0.8, () => ell(g, 2.4, 3.0, 2.6, 1.2, 0.5 + (f % 2 ? 0.3 : -0.1)));
  eye(g, 6.0, -1.4, fry ? 2.8 : 2.2, lw, { closed: o.closed, pupil: 0.58, lookX: 0.5 });
  cheek(g, 7.4, 1.8, 1.2);
  if (o.pose === 'gasp') {
    ell(g, 9.4, 0.9, 1.1, 1.5);
    fill(g, '#7a2e2e');
    stroke(g, lw * 0.7);
  } else {
    ell(g, 9.4, 1.0, 0.7, 0.8);
    stroke(g, lw * 0.7);
  }
  if (fry) g.restore();
}

// ---------------------------------------------------------------- FROG (spawn, tadpole, froglet, adult)
function drawFrog(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const st = o.stage;
  if (st === 'egg') {
    const pts = [[0, 0], [2.4, 0.6], [-2.2, 0.8], [1, 2.3], [-1.2, -2], [1.4, -2.1], [3.6, -1.2], [-3.4, -1.0], [-0.6, 2.6]];
    for (const [x, y] of pts) {
      circ(g, x, y, 1.45);
      fill(g, 'rgba(225,240,235,0.7)');
      stroke(g, lw * 0.45);
      circ(g, x + 0.2, y + 0.1, 0.5);
      fill(g, INK);
    }
    return;
  }
  if (st === 'tadpole' || st === 'froglet') {
    const f = o.frame % 4;
    const ph = f * (Math.PI / 2);
    const len = st === 'froglet' ? 6 : 11;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = -1.5 - t * len;
      const y = Math.sin(t * 3.2 - ph) * 1.4 * t;
      pts.push([x, y, 1.9 * (1 - t * 0.85)]);
    }
    paint(g, 'rgba(118,128,82,0.75)', lw * 0.8, () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1] - pts[0][2]);
      for (const p of pts) g.lineTo(p[0], p[1] - p[2]);
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], pts[i][1] + pts[i][2]);
      g.closePath();
    });
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    stroke(g, lw * 0.5, 'rgba(58,42,31,0.45)');
    const body = st === 'froglet' ? P.body : '#5c6b3a';
    if (st === 'froglet') {
      bent(g, -1, 2, -3.5, 2.5, -3, 4.4, lw * 1.4);
      line(g, -3, 4.4, -1.6, 4.6, lw);
      bent(g, 3.4, 2.4, 4.4, 3.4, 4.2, 4.4, lw * 1.1);
    }
    blob(g, 2, 0, 4.6, 3.7, body, lw);
    ell(g, 2.6, 1.6, 2.8, 1.4);
    g.save();
    g.globalAlpha *= 0.45;
    fill(g, '#e8e6b0');
    g.restore();
    highlight(g, 1.2, -1.8, 2, 0.8, 0.3);
    circ(g, 4.4, -1.6, 1.3);
    fill(g, '#fff');
    stroke(g, lw * 0.5);
    dotEye(g, 4.7, -1.6, 0.75, o.closed);
    cheek(g, 5.4, 0.9, 0.7);
    smile(g, 5.9, 0.8, 0.7, lw * 0.7);
    return;
  }
  // adult frog
  const pose = o.pose;
  const sitting = pose !== 'jump' && pose !== 'swim';
  if (pose === 'swim') {
    g.rotate(0.12);
  }
  // far eye bump
  blob(g, 3.4, -7.9, 2.9, 2.9, shade(P.body), lw);
  if (sitting) {
    blob(g, -5.6, 3.4, 6.2, 4.0, P.body, lw, -0.25);
    paint(g, P.body, lw, () => {
      g.beginPath();
      g.moveTo(-3.5, 7.2);
      g.quadraticCurveTo(2, 6.6, 5.8, 7.6);
      g.lineTo(6.6, 8.6);
      g.lineTo(5.0, 8.4);
      g.lineTo(4.4, 9.0);
      g.lineTo(3.2, 8.4);
      g.lineTo(-3.6, 8.8);
      g.closePath();
    });
  } else {
    const kick = pose === 'swim' ? (o.frame % 2 ? 1 : 0) : 1;
    const kx = kick ? -11 : -7;
    blob(g, -7, 2.4, 5.4, 2.6, P.body, lw, 0.15);
    line(g, kx, 3.6, kx - (kick ? 6 : 2), 5.5, lw * 2.4, INK);
    line(g, kx, 3.6, kx - (kick ? 6 : 2), 5.5, lw * 1.2, P.body);
    paint(g, P.body, lw * 0.8, () => ell(g, kx - (kick ? 7.2 : 3), 5.8, 2.4, 1.0, 0.3));
  }
  blob(g, 0, 0, 10.5, 7.2, P.body, lw, -0.32);
  ell(g, 3.4, 3.2, 6, 3.8, -0.4);
  fill(g, P.belly);
  stroke(g, lw * 0.4, 'rgba(58,42,31,0.35)');
  const spots = [[-4.4, -3.2], [-1, -5.4], [-6.2, 0], [1.8, -2.4]];
  for (const [x, y] of spots) {
    circ(g, x, y, 1.1);
    fill(g, P.spot);
  }
  highlight(g, -2.5, -4.6, 4, 1.3, 0.3, -0.3);
  if (pose === 'croak') {
    blob(g, 8.2, 3.8, 3.8, 3.4, P.sac, lw);
    highlight(g, 7.4, 2.6, 1.4, 0.8, 0.5);
  }
  // near eye bump & eye
  blob(g, 6.2, -7.2, 3.8, 3.8, P.body, lw);
  eye(g, 6.6, -7.4, 2.6, lw, { closed: o.closed, pupil: 0.6, white: P.eyeWhite || PAL.white });
  circ(g, 12.0, -4.3, 0.35);
  fill(g, INK);
  curve(g, 12.8, -2.0, 9.6, 1.6, 4.4, 0.6, lw);
  cheek(g, 9.4, -0.8, 1.6);
  // front leg
  if (sitting) {
    line(g, 6.2, 2.8, 7.6, 7.8, lw * 2.6, INK);
    line(g, 6.2, 2.8, 7.6, 7.8, lw * 1.3, P.body);
    for (let i = -1; i <= 1; i++) line(g, 7.6, 7.8, 8.4 + i * 1.2, 8.6, lw * 0.9);
  } else {
    line(g, 5.6, 3.4, 10.6, 5.2, lw * 2.4, INK);
    line(g, 5.6, 3.4, 10.6, 5.2, lw * 1.2, P.body);
  }
  accessory(g, o, 5.4, -10.4, 2.6, 7.4, 3.2, 2.4);
}

// ---------------------------------------------------------------- TURTLE
function drawTurtle(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    blob(g, -2, 0, 2.6, 2.3, '#fbf3df', lw * 0.7);
    blob(g, 2.4, 0.6, 2.6, 2.3, '#f7ead0', lw * 0.7);
    highlight(g, -2.6, -0.8, 1, 0.6, 0.6);
    return;
  }
  const baby = o.stage === 'hatchling';
  if (baby) g.scale(0.45, 0.45);
  const pose = o.pose;
  const f = o.frame % 4;
  const swim = pose === 'swim';
  const hide = pose === 'hide';
  const bask = pose === 'bask';
  const step = pose === 'walk' ? [1.5, 0.5, -1.5, -0.5][f] : 0;
  const legC = P.skin;
  const legs = () => {
    if (hide) return;
    if (swim) {
      const a = f % 2 ? 0.9 : 0.2;
      blob(g, 12, 4.4, 6, 1.9, legC, lw, a);
      blob(g, -12, 4.4, 4.6, 1.7, legC, lw, -a);
      return;
    }
    if (bask) {
      blob(g, 13, 4.6, 2.4, 3.4, legC, lw, -0.6);
      blob(g, -15, 4.8, 4.2, 1.8, legC, lw, 0.15);
      return;
    }
    blob(g, 11 + step, 5.2, 2.4, 3.2, legC, lw, 0.25);
    blob(g, -11 - step, 5.2, 2.6, 3.0, legC, lw, -0.25);
    for (const x of [11 + step, -11 - step]) {
      for (let i = -1; i <= 1; i++) {
        circ(g, x + i * 0.9 + 0.6, 8.0, 0.35);
        fill(g, INK);
      }
    }
  };
  // tail
  if (!hide) {
    paint(g, P.skin, lw, () => {
      g.beginPath();
      g.moveTo(-16, 2);
      g.lineTo(-21, 4);
      g.lineTo(-15.6, 4.6);
      g.closePath();
    });
  }
  // head + neck
  if (!hide) {
    const hy = bask ? -5.5 : swim ? -0.5 : -2.5;
    const hx = bask ? 22.5 : 22.5;
    paint(g, P.skin, lw, () => {
      g.beginPath();
      g.moveTo(12, -2.5);
      g.quadraticCurveTo(16, hy - 3.2, hx - 2, hy - 2.8);
      g.lineTo(hx - 2, hy + 3);
      g.quadraticCurveTo(16, 3, 12, 3);
      g.closePath();
    });
    for (let i = 0; i < 3; i++) curve(g, 13 + i * 2, -1.5 + i * 0.4, 15 + i * 2, hy - 1 + i, 17 + i * 1.6, hy + i * 1.2, lw * 0.7, P.stripe);
    blob(g, hx, hy, 5.8, 4.4, P.skin, lw, -0.1);
    highlight(g, hx - 1, hy - 2.4, 2.4, 0.9, 0.3);
    curve(g, hx - 4, hy + 1.4, hx - 1, hy + 2.4, hx + 3, hy + 2.6, lw * 0.6, P.stripe);
    if (P.ear) {
      ell(g, hx - 2.8, hy - 0.2, 2.1, 0.95, -0.1);
      fill(g, '#d9483b');
    }
    eye(g, hx + 1.6, hy - 1.2, 1.7, lw, { closed: o.closed, pupil: 0.6 });
    curve(g, hx + 5.2, hy + 1.4, hx + 3.6, hy + 2.8, hx + 0.8, hy + 2.2, lw * 0.9);
    cheek(g, hx + 2.6, hy + 1.6, 1.15);
    circ(g, hx + 5.4, hy - 0.6, 0.32);
    fill(g, INK);
    accessory(g, o, hx - 0.2, hy - 4.0, 3.2, hx - 4.5, hy + 3.2, 2.2);
  }
  legs();
  // plastron and rim
  paint(g, P.belly, lw, () => {
    g.beginPath();
    g.moveTo(-15, 3.2);
    g.lineTo(15, 3.2);
    g.quadraticCurveTo(13, 6, 9, 6);
    g.lineTo(-9, 6);
    g.quadraticCurveTo(-13, 6, -15, 3.2);
    g.closePath();
  });
  // shell dome
  paint(g, P.shell, lw, () => {
    g.beginPath();
    g.moveTo(-17.4, 2.6);
    g.bezierCurveTo(-17.4, -10.5, -8, -14.6, 1, -14.6);
    g.bezierCurveTo(10, -14.6, 17.6, -9, 17.4, 2.6);
    g.closePath();
  });
  paint(g, P.rim, lw * 0.8, () => {
    g.beginPath();
    g.moveTo(-17.6, 0.4);
    g.quadraticCurveTo(0, -1.2, 17.6, 0.4);
    g.lineTo(17.4, 3.4);
    g.quadraticCurveTo(0, 2.2, -17.4, 3.4);
    g.closePath();
  });
  for (let i = -3; i <= 3; i++) line(g, i * 4.8, -0.8 + Math.abs(i) * 0.25, i * 4.9, 2.8 - Math.abs(i) * 0.1, lw * 0.5);
  // scutes
  curve(g, -15.5, -4.5, 0, -10, 15.5, -4.5, lw * 0.7);
  for (const x of [-8.5, 0, 8.5]) {
    curve(g, x * 0.9, -13.6 + Math.abs(x) * 0.35, x * 1.05, -8, x * 1.1, -0.6, lw * 0.6);
  }
  highlight(g, -5, -10, 5.5, 1.8, 0.28, -0.2);
  highlight(g, 6, -6, 2.4, 1.2, 0.18, -0.3);
}

// ---------------------------------------------------------------- POND SNAIL
function drawPondSnail(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    paint(g, 'rgba(230,240,220,0.55)', lw * 0.6, () => ell(g, 0, 0, 4.2, 2.4));
    for (let i = 0; i < 7; i++) {
      circ(g, -3 + i, (i % 2) * 0.8 - 0.4, 0.55);
      fill(g, 'rgba(240,220,160,0.9)');
    }
    return;
  }
  if (o.stage === 'baby') g.scale(0.55, 0.55);
  if (o.pose !== 'shell') {
    paint(g, P.body, lw, () => {
      g.beginPath();
      g.moveTo(-5.6, 2.3);
      g.lineTo(5.2, 2.3);
      g.bezierCurveTo(7.2, 2.3, 7.4, -1.1, 5.2, -1.3);
      g.lineTo(-3.6, 0.4);
      g.closePath();
    });
    paint(g, P.body, lw * 0.7, () => {
      g.beginPath();
      g.moveTo(5.0, -0.9);
      g.lineTo(7.8, -3.6);
      g.lineTo(5.9, -0.4);
      g.closePath();
    });
    dotEye(g, 5.3, -1.0, 0.5, o.closed);
    cheek(g, 6.0, 0.8, 0.5);
  }
  if (P.kind === 'ramshorn') {
    blob(g, -1.2, -2.6, 4.4, 4.2, P.shell, lw);
    g.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.3) {
      const r = 3.8 * (1 - a / (TAU * 2.6));
      const x = -1.2 + Math.cos(a) * r;
      const y = -2.6 + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    stroke(g, lw * 0.6);
    highlight(g, -2.4, -4.6, 1.6, 0.7, 0.45);
  } else {
    blob(g, -4.6, -6.0, 1.3, 1.2, P.shell, lw * 0.8, -0.6);
    blob(g, -3.3, -4.6, 2.4, 2.1, P.shell, lw * 0.9, -0.6);
    blob(g, -1, -2.2, 4.2, 3.4, P.shell, lw, -0.6);
    curve(g, -3.8, -2.8, -1.4, -5.2, 1.6, -3.8, lw * 0.5, 'rgba(58,42,31,0.6)');
    highlight(g, -2.0, -3.6, 1.6, 0.8, 0.4);
  }
}

// ---------------------------------------------------------------- SHRIMP
function drawShrimp(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'baby') g.scale(0.5, 0.5);
  const f = o.frame % 2;
  curve(g, 6.4, -1.2, 11, -7, 16, -4.5, lw * 0.5);
  curve(g, 6.6, -0.6, 11, -3, 15.5, 0.5, lw * 0.5);
  for (let i = 0; i < 5; i++) {
    const x = 0.6 + i * 1.2;
    line(g, x, 1.4, x + (f ? 0.6 : -0.4) + 0.4, 3.8, lw * 0.5);
  }
  for (let i = 0; i < 3; i++) line(g, -1.5 - i * 1.6, 1.4 + i * 0.4, -1.8 - i * 1.6 + (f ? 0.5 : -0.5), 3.0 + i * 0.4, lw * 0.4);
  // tail fan
  paint(g, P.body, lw * 0.7, () => {
    g.beginPath();
    g.moveTo(-6.2, 2.4);
    g.lineTo(-9.2, 2.0);
    g.lineTo(-8.8, 3.6);
    g.lineTo(-9.4, 5.0);
    g.lineTo(-6.4, 3.8);
    g.closePath();
  });
  const segs = [[-5.6, 2.0, 1.3, 1.5], [-4.4, 0.8, 1.5, 1.8], [-2.9, -0.2, 1.7, 2.0], [-1.1, -0.8, 1.9, 2.2]];
  for (const [x, y, rx, ry] of segs) blob(g, x, y, rx, ry, P.body, lw * 0.7);
  blob(g, 3, -0.4, 4.2, 2.5, P.body, lw * 0.8, 0.08);
  highlight(g, 2, -1.8, 2.4, 0.6, 0.45);
  line(g, 6.8, -1.4, 9.2, -2.2, lw * 0.7);
  circ(g, 6.2, -1.9, 0.95);
  fill(g, INK);
  circ(g, 6.5, -2.2, 0.3);
  fill(g, '#fff');
  cheek(g, 5.4, 0.5, 0.5);
}

// ---------------------------------------------------------------- LADYBUG
function drawLadybug(g, o) {
  const lw = o.lw;
  const young = o.stage === 'young';
  const P = young ? { shell: '#f3e2a0', spots: false } : o.pal;
  if (o.stage === 'egg') {
    for (let i = 0; i < 5; i++) {
      blob(g, -2.4 + i * 1.2, (i % 2) * 0.4, 0.55, 1.1, '#f6d24a', lw * 0.4);
    }
    return;
  }
  if (young) g.scale(0.75, 0.75);
  const fly = o.pose === 'fly';
  legsTripod(g, [-1.4, 0.8, 2.6], 1.2, 3.6, [-1.2, 0, 1.2], o.frame, o.pose === 'walk', lw * 0.7);
  if (fly && !o.liveWings) stillWing(g, 'ladybug', lw, true);
  g.save();
  if (fly) {
    g.translate(3.6, -0.8);
    g.rotate(-0.55);
    g.translate(-3.6, 0.8);
  }
  paint(g, P.shell, lw, () => {
    g.beginPath();
    g.moveTo(-5.8, 1.2);
    g.bezierCurveTo(-6.0, -5.8, 4.2, -6.4, 4.6, 1.2);
    g.closePath();
  });
  if (P.spots) {
    for (const [x, y, r] of [[-3, -2, 1.1], [0.4, -3.6, 1.2], [2.6, -0.8, 1.0], [-1.6, 0.0, 0.8], [-4.6, -0.1, 0.6]]) {
      circ(g, x, y, r);
      fill(g, '#2d2a2a');
    }
  }
  highlight(g, -1.8, -3.6, 2.2, 0.8, 0.5, -0.3);
  g.restore();
  if (fly && !o.liveWings) stillWing(g, 'ladybug', lw, false);
  blob(g, 4.6, -0.2, 1.8, 2.0, '#2d2a2a', lw);
  ell(g, 5.0, -1.0, 0.7, 0.55);
  fill(g, '#fff');
  blob(g, 6.4, 0.6, 1.8, 1.7, '#2d2a2a', lw);
  ell(g, 6.9, 1.3, 0.8, 0.5);
  fill(g, '#fff');
  if (o.closed) curve(g, 6.3, -0.2, 6.9, 0.3, 7.5, -0.2, lw * 0.6, '#fff');
  else {
    circ(g, 6.9, -0.2, 0.72);
    fill(g, '#fff');
    circ(g, 7.1, -0.2, 0.38);
    fill(g, INK);
  }
  antenna(g, 6.9, -1.0, 7.6, -2.6, 8.4, -2.8, lw * 0.6, 0.45);
  cheek(g, 7.6, 1.5, 0.45);
}

// ---------------------------------------------------------------- APHID
function drawAphid(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'baby') g.scale(0.6, 0.6);
  legsTripod(g, [-0.6, 0.6, 1.6], 1.2, 2.6, [-0.6, 0, 0.6], o.frame, o.pose === 'walk', lw * 0.7);
  curve(g, 2.8, -0.6, 1, -3.6, -2.4, -3.6, lw * 0.6);
  blob(g, -0.5, 0, 2.9, 2.2, P.body, lw, -0.1);
  highlight(g, -1.0, -1.0, 1.4, 0.6, 0.5);
  line(g, -2.2, -1.4, -3.0, -2.6, lw * 0.9);
  blob(g, 2.5, 0.3, 1.25, 1.15, P.body, lw);
  dotEye(g, 2.9, -0.1, 0.42, o.closed);
}

// ---------------------------------------------------------------- BUTTERFLY (egg, caterpillar, chrysalis, adult)
function drawButterfly(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const st = o.stage;
  if (st === 'egg') {
    blob(g, 0, 0, 1.1, 1.5, '#f6f0d6', lw * 0.5);
    for (let i = -1; i <= 1; i++) line(g, i * 0.5, -1.2, i * 0.5, 1.2, lw * 0.25, 'rgba(58,42,31,0.4)');
    return;
  }
  if (st === 'caterpillar') {
    const f = o.frame % 4;
    const hc = (f / 4) * 7;
    const seg = [];
    for (let i = 0; i < 7; i++) {
      const x = -7 + i * 2.05;
      const y = -1.7 * Math.exp(-((i - hc) * (i - hc)) / 1.6);
      seg.push([x, y]);
    }
    line(g, -7.2, -2.0, -9.2, -4.4, lw * 0.6);
    line(g, -6.8, -2.2, -8.2, -5.0, lw * 0.6);
    for (const [x, y] of seg) {
      ell(g, x, y + 2.3, 0.7, 0.55);
      fill(g, INK);
    }
    for (const [x, y] of seg) {
      g.save();
      circ(g, x, y, 2.45);
      g.clip();
      g.fillStyle = P.cat;
      g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = P.catStripe;
      g.fillRect(x + 0.4, y - 3, 0.9, 6);
      g.fillStyle = '#fffaf0';
      g.fillRect(x - 0.6, y - 3, 0.55, 6);
      g.restore();
      circ(g, x, y, 2.45);
      stroke(g, lw * 0.85);
    }
    const hy = seg[6][1] - 0.5;
    blob(g, 7.8, hy, 2.9, 2.8, P.cat, lw);
    highlight(g, 7.2, hy - 1.4, 1.2, 0.6, 0.4);
    antenna(g, 8.0, hy - 2.6, 8.4, hy - 4.2, 9.2, hy - 5.2, lw * 0.55, 0.45);
    eye(g, 8.9, hy - 0.8, 1.05, lw, { closed: o.closed, pupil: 0.55 });
    cheek(g, 9.4, hy + 0.9, 0.7);
    smile(g, 9.9, hy + 1.2, 0.55, lw * 0.6);
    return;
  }
  if (st === 'chrysalis') {
    line(g, 0, -9.5, 0, -7, lw * 0.5);
    paint(g, P.chrys, lw, () => {
      g.beginPath();
      g.moveTo(0, -7);
      g.bezierCurveTo(4.4, -6, 4.6, 4, 0, 6.8);
      g.bezierCurveTo(-4.6, 4, -4.4, -6, 0, -7);
      g.closePath();
    });
    line(g, -3.2, -2, 3.2, -2, lw * 0.9, '#2d2622');
    for (let i = -2; i <= 2; i++) {
      circ(g, i * 1.2, -2.0, 0.42);
      fill(g, '#f3c43c');
    }
    circ(g, -1.4, -4.6, 0.4);
    fill(g, '#f3c43c');
    circ(g, 1.4, -4.6, 0.4);
    fill(g, '#f3c43c');
    highlight(g, -1.2, 0.6, 1.1, 3, 0.35, 0.1);
    return;
  }
  // adult: wings drawn in side profile; a perched butterfly shows the
  // pale underside with wings held together. In flight the renderer beats
  // the wings live (o.liveWings); still pictures get them half open.
  const fly = o.pose === 'fly';
  if (!(fly && o.liveWings)) {
    g.save();
    g.translate(0, WINGS.butterfly.hy);
    g.scale(1, fly ? 0.62 : 1);
    g.translate(0, -WINGS.butterfly.hy);
    drawButterflyWings(g, P, lw, fly ? P.wing : P.under);
    g.restore();
  }
  // slim fuzzy body
  blob(g, -1.2, 0.3, 4.6, 1.15, '#5a4636', lw);
  for (let i = 0; i < 3; i++) line(g, -4.2 + i * 1.6, -0.6, -4.4 + i * 1.6, 1.2, lw * 0.4, 'rgba(255,255,255,0.35)');
  blob(g, 3.6, -0.2, 1.7, 1.3, '#5a4636', lw);
  blob(g, 5.9, -0.4, 1.7, 1.6, '#5a4636', lw);
  antenna(g, 6.6, -1.6, 7.8, -5.5, 10.4, -7.0, lw * 0.5, 0.55);
  antenna(g, 6.1, -1.8, 6.6, -6, 8.2, -8.0, lw * 0.5, 0.5);
  if (o.closed) curve(g, 6.0, -0.6, 6.5, -0.1, 7.1, -0.6, lw * 0.6, '#fff');
  else {
    circ(g, 6.6, -0.7, 0.75);
    fill(g, '#fff');
    circ(g, 6.8, -0.7, 0.4);
    fill(g, INK);
  }
  cheek(g, 6.9, 0.5, 0.5);
  line(g, 2.6, 0.8, 3.4, 2.0, lw * 0.5);
  line(g, 3.8, 0.8, 4.8, 2.0, lw * 0.5);
}

// Both butterfly wings (hind and fore) in body coordinates, hinged along y = -0.6.
export function drawButterflyWings(g, P, lw, col) {
  // hind wing
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(-0.8, -0.6);
    g.bezierCurveTo(-6, -2, -11, -8, -8.6, -11.4);
    g.bezierCurveTo(-5, -13.4, -1.6, -8, 1.2, -1);
    g.closePath();
  });
  // fore wing
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0.2, -0.8);
    g.bezierCurveTo(-2.6, -7, -3.6, -16, 2.4, -17.2);
    g.bezierCurveTo(8.4, -18, 11, -13, 9.6, -10.4);
    g.bezierCurveTo(7.4, -6.6, 4.6, -3.4, 2.8, -0.8);
    g.closePath();
  });
  g.beginPath();
  g.moveTo(-0.9, -14.4);
  g.bezierCurveTo(0.6, -18.2, 8.6, -18.4, 9.7, -10.8);
  stroke(g, lw * 2.4, P.border);
  g.beginPath();
  g.moveTo(-7.8, -11.8);
  g.bezierCurveTo(-11, -9, -8, -4.6, -4, -2.2);
  stroke(g, lw * 2.0, P.border);
  for (const [x, y] of [[0.6, -16.4], [3.6, -17.2], [6.6, -16.4], [8.8, -13.2], [-8.8, -9.6], [-7.6, -6.6]]) {
    circ(g, x, y, 0.5);
    fill(g, P.dots);
  }
  for (const [x2, y2] of [[3.6, -14.6], [7.4, -11.2], [-5.6, -9.4], [-1.6, -13]]) line(g, 1.2, -1.2, x2, y2, lw * 0.4, 'rgba(45,38,34,0.5)');
  highlight(g, 2.2, -12.4, 2.4, 1.0, 0.3, -0.5);
}

// ---------------------------------------------------------------- SNAIL
function drawSnail(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    for (let i = 0; i < 6; i++) {
      blob(g, -2.4 + (i % 3) * 2.4, Math.floor(i / 3) * 1.8 - 0.9, 1.15, 1.15, '#f6f0e0', lw * 0.4);
    }
    return;
  }
  if (o.stage === 'baby') g.scale(0.5, 0.5);
  const retract = o.pose === 'shell';
  if (!retract) {
    const rip = o.frame % 2 ? 0.5 : -0.5;
    paint(g, P.body, lw, () => {
      g.beginPath();
      g.moveTo(-12, 2.3);
      g.quadraticCurveTo(-9, -0.4, -5, -0.2);
      g.lineTo(5, -1.4);
      g.quadraticCurveTo(6.8, -5.8, 9.4, -4.6);
      g.quadraticCurveTo(11.6, -3.0, 10.8, 0.4);
      g.quadraticCurveTo(10.4, 2.4, 7.5, 2.4);
      g.closePath();
    });
    for (let i = 0; i < 6; i++) {
      const x = -9 + i * 3;
      curve(g, x, 2.4, x + 1.5, 1.6 + rip * (i % 2 ? 1 : -1), x + 3, 2.4, lw * 0.4, 'rgba(58,42,31,0.35)');
    }
    highlight(g, 7, -3, 1.6, 0.6, 0.35);
    line(g, 8.7, -4.3, 10.8, -10.4, lw * 1.6, INK);
    line(g, 8.7, -4.3, 10.8, -10.4, lw * 0.8, P.body);
    line(g, 7.6, -4.6, 8.0, -11.2, lw * 1.6, INK);
    line(g, 7.6, -4.6, 8.0, -11.2, lw * 0.8, P.body);
    dotEye(g, 8.0, -11.4, 0.85, o.closed);
    dotEye(g, 10.9, -10.6, 0.95, o.closed);
    line(g, 10.6, -2.0, 12.2, -2.8, lw * 0.9);
    smile(g, 10.2, -0.4, 0.8, lw * 0.7);
    cheek(g, 9.0, -1.4, 0.9);
    accessory(g, o, 8.9, -4.9, 2.5, 6, -0.8, 1.6, true);
  }
  // shell
  const sx = -2.5;
  const sy = retract ? -4.2 : -6.2;
  blob(g, sx, sy, 6.8, 6.6, P.shell, lw);
  g.beginPath();
  let first = true;
  for (let a = 0; a < TAU * 2.6; a += 0.22) {
    const r = 6.0 * (1 - a / (TAU * 2.9));
    const x = sx + 0.6 + Math.cos(a + 1.2) * r;
    const y = sy + Math.sin(a + 1.2) * r;
    if (first) {
      g.moveTo(x, y);
      first = false;
    } else g.lineTo(x, y);
  }
  stroke(g, lw * 2.0, P.band);
  stroke(g, lw * 0.6);
  highlight(g, sx - 2.4, sy - 3.2, 2.4, 1.0, 0.4);
  if (retract) {
    paint(g, '#f6f0e0', lw * 0.7, () => ell(g, sx + 5.2, sy + 4.2, 1.8, 1.4));
  }
}

// ---------------------------------------------------------------- BEE
function drawBee(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (!o.liveWings) stillWing(g, 'bee', lw, true);
  for (let i = 0; i < 3; i++) {
    const x = -1.2 + i * 1.6;
    line(g, x, 3.6, x - 0.9, 5.6, lw * 0.7);
  }
  if (o.pose === 'pollen') {
    circ(g, -2.2, 5.4, 1.1);
    fill(g, '#f39a2a');
    stroke(g, lw * 0.5);
  }
  // abdomen with stripes
  g.save();
  fuzzPath(g, -2.2, 0.8, 5.4, 4.5, 22, 0.05, 3);
  g.save();
  g.translate(lw * 0.3, lw * 0.2);
  fill(g, P.yellow);
  g.restore();
  g.clip();
  g.fillStyle = P.black;
  g.fillRect(-5.0, -5, 1.6, 12);
  g.fillRect(-1.8, -5, 1.6, 12);
  g.fillRect(-8.2, -5, 1.5, 12);
  g.restore();
  fuzzPath(g, -2.2, 0.8, 5.4, 4.5, 22, 0.05, 3);
  stroke(g, lw);
  highlight(g, -2.8, -1.8, 2.4, 0.9, 0.35);
  paint(g, P.black, lw * 0.7, () => {
    g.beginPath();
    g.moveTo(-7.4, 1.0);
    g.lineTo(-9.0, 1.6);
    g.lineTo(-7.2, 2.2);
    g.closePath();
  });
  g.save();
  fuzzPath(g, 2.5, -0.4, 2.8, 2.9, 14, 0.07, 5);
  g.fillStyle = P.yellow;
  g.fill();
  stroke(g, lw);
  g.restore();
  if (!o.liveWings) stillWing(g, 'bee', lw, false);
  blob(g, 5, 0.6, 2.5, 2.4, P.black, lw);
  antenna(g, 5.2, -1.6, 6.4, -4.6, 7.8, -4.4, lw * 0.6, 0.45);
  eye(g, 5.8, -0.1, 1.05, lw, { closed: o.closed, pupil: 0.55 });
  cheek(g, 6.3, 1.7, 0.6);
  accessory(g, o, 4.8, -1.8, 1.9, 3.6, 2.4, 1.4);
}

// ---------------------------------------------------------------- FIREFLY
function drawFirefly(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const fly = o.pose === 'fly';
  legsTripod(g, [-1, 0.8, 2.4], 1.2, 3.2, [-1, 0, 1], o.frame, o.pose === 'walk', lw * 0.7);
  if (fly && !o.liveWings) stillWing(g, 'firefly', lw, true);
  blob(g, -2.6, 0.6, 4.6, 2.4, P.body, lw);
  blob(g, -5.3, 1.0, 2.0, 1.9, P.lantern, lw * 0.8);
  g.save();
  if (fly) {
    g.translate(1.6, -0.8);
    g.rotate(-0.6);
    g.translate(-1.6, 0.8);
  }
  paint(g, P.elytra, lw * 0.8, () => {
    g.beginPath();
    g.moveTo(1.6, -1.8);
    g.quadraticCurveTo(-3, -3.6, -6.8, -0.6);
    g.lineTo(-6.4, 0.4);
    g.quadraticCurveTo(-2.6, -1.6, 1.6, -0.2);
    g.closePath();
  });
  curve(g, -6.4, 0.2, -2.6, -1.6, 1.4, -0.4, lw * 0.6, '#e8d36a');
  g.restore();
  if (fly && !o.liveWings) stillWing(g, 'firefly', lw, false);
  blob(g, 2.6, -0.6, 2.4, 2.0, P.shield, lw);
  ell(g, 2.8, -0.9, 0.8, 0.7);
  fill(g, INK);
  blob(g, 4.6, 0.5, 1.5, 1.4, P.body, lw);
  antenna(g, 5.0, -0.5, 6.2, -2.6, 7.4, -3.4, lw * 0.55, 0);
  if (o.closed) curve(g, 4.6, 0.1, 5.0, 0.4, 5.4, 0.1, lw * 0.5, '#fff');
  else {
    circ(g, 5.0, 0.1, 0.6);
    fill(g, '#fff');
    circ(g, 5.2, 0.1, 0.3);
    fill(g, INK);
  }
  cheek(g, 5.2, 1.2, 0.45);
}

// ---------------------------------------------------------------- PILL BUG
function drawPillbug(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'baby') g.scale(0.55, 0.55);
  if (o.pose === 'ball') {
    blob(g, 0, 0.4, 4.6, 4.6, P.body, lw);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.ellipse(0, 0.4, 4.6 - Math.abs(i) * 0.2, 4.6, 0, -Math.PI / 2 + i * 0.35, Math.PI / 2 + i * 0.35);
      stroke(g, lw * 0.4, 'rgba(58,42,31,0.45)');
    }
    for (let i = 1; i <= 3; i++) {
      g.beginPath();
      g.arc(0, 0.4, 4.6 - i * 1.2, Math.PI * 0.9, Math.PI * 1.9);
      stroke(g, lw * 0.45, 'rgba(58,42,31,0.5)');
    }
    highlight(g, -1.6, -1.8, 1.6, 0.8, 0.45);
    return;
  }
  const f = o.frame % 4;
  for (let i = 0; i < 6; i++) {
    const x = -4 + i * 1.5;
    const sw = o.pose === 'walk' ? (((i + f) % 2) - 0.5) * 0.8 : 0;
    line(g, x, 2.2, x + sw, 3.2, lw * 0.6);
  }
  paint(g, P.body, lw, () => {
    g.beginPath();
    g.moveTo(-6.2, 2.4);
    g.bezierCurveTo(-6.4, -4.6, 4.8, -5.2, 5.4, 2.4);
    g.closePath();
  });
  for (let k = 0; k < 6; k++) {
    const x = -4.6 + k * 1.7;
    const nx = (x + 0.4) / 5.8;
    const top = 2.4 - 6.0 * Math.sqrt(Math.max(0, 1 - nx * nx));
    curve(g, x + 0.3, top + 0.4, x + 0.6, (top + 2.2) / 2, x - 0.2, 2.2, lw * 0.5, 'rgba(58,42,31,0.55)');
  }
  if (P.spots) {
    for (const [x, y] of [[-3, -1], [0, -2.4], [2.6, -0.6]]) {
      circ(g, x, y, 0.6);
      fill(g, '#fff4d8');
    }
  }
  highlight(g, -1.4, -2.6, 3, 0.8, 0.4, -0.1);
  line(g, -6.0, 2.0, -7.6, 2.6, lw * 0.6);
  blob(g, 5.6, 1.2, 1.6, 1.5, shade(P.body.length === 7 ? P.body : '#8f96a3'), lw);
  bent(g, 6.4, 0.2, 8.2, -1.4, 9.4, 0.4, lw * 0.6);
  dotEye(g, 6.0, 0.8, 0.55, o.closed);
  cheek(g, 6.5, 1.9, 0.45);
}

// ---------------------------------------------------------------- FRUIT FLY
function drawFruitfly(g, o) {
  const lw = o.lw;
  for (let i = 0; i < 3; i++) line(g, -0.6 + i * 0.9, 1.0, -0.8 + i * 0.9, 2.2, lw * 0.6);
  if (!o.liveWings) stillWing(g, 'fruitfly', lw, true);
  blob(g, -0.7, 0.2, 2.2, 1.4, '#d8b072', lw);
  line(g, -1.4, -1.0, -1.6, 1.4, lw * 0.6, 'rgba(90,60,30,0.6)');
  line(g, -2.4, -0.8, -2.6, 1.2, lw * 0.6, 'rgba(90,60,30,0.6)');
  blob(g, 1.4, -0.1, 1.2, 1.15, '#c99b5c', lw);
  circ(g, 2.0, -0.3, 0.85);
  fill(g, '#d33b2c');
  stroke(g, lw * 0.5);
  circ(g, 2.25, -0.55, 0.28);
  fill(g, '#fff');
  if (!o.liveWings) stillWing(g, 'fruitfly', lw, false);
}

// ---------------------------------------------------------------- WINGS
// Insect wings hinge at the shoulder (hx, hy) and sweep between
// base - amp (swept back) and base + amp (raised), angles in radians with the
// critter facing right. In the tank the renderer beats them every frame from
// a cached wing sprite (see drawWingBlade), so the motion is smooth instead of
// snapping between two poses. The far wing sits slightly lower and lags.
//   hz: beats per second, blur: strength of the motion-blur fan, bob: how far
//   the body lifts with each downstroke.
export const WINGS = {
  ladybug: { hx: 1.4, hy: -3.0, len: 7.4, wid: 2.2, base: -2.4, amp: 0.68, hz: 6.5, blur: 0.22, bob: 0.45 },
  bee: { hx: 1.9, hy: -2.4, len: 6.2, wid: 2.5, base: -2.2, amp: 0.75, hz: 8, blur: 0.5, bob: 0.35 },
  firefly: { hx: 0.8, hy: -1.9, len: 6.0, wid: 1.9, base: -2.45, amp: 0.62, hz: 5.5, blur: 0.18, bob: 0.4 },
  fruitfly: { hx: 0.3, hy: -1.0, len: 3.3, wid: 1.25, base: -2.35, amp: 0.75, hz: 11, blur: 0.55, bob: 0.15 },
  butterfly: { hx: 0, hy: -0.6, hz: 2.4, bob: 1.5, butterfly: true },
};

// Wing angle at beat phase ph. The downstroke (rising sine) is a little
// quicker than the recovery, which reads as a push rather than a wobble.
export function wingAngle(spec, ph) {
  return spec.base + spec.amp * Math.sin(ph + 0.35 * Math.sin(ph));
}
// Butterfly wings flatten to a sliver as they pass edge-on, then open below.
export function butterflyLift(ph) {
  const s = Math.cos(ph + 0.3 * Math.sin(ph));
  return s >= 0 ? 0.12 + 0.88 * s : 0.12 + 0.7 * s;
}

// One wing, root at the origin, pointing along +x.
export function drawWingBlade(g, len, wid, lw, far) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.18, -wid * 1.2, len * 0.72, -wid * 1.1, len, -wid * 0.2);
  g.bezierCurveTo(len * 1.04, wid * 0.55, len * 0.5, wid * 0.9, 0, 0);
  g.closePath();
  g.fillStyle = far ? 'rgba(178,204,222,0.6)' : 'rgba(222,240,252,0.66)';
  g.fill();
  stroke(g, lw * 0.7, far ? 'rgba(58,42,31,0.6)' : INK);
  g.beginPath();
  g.moveTo(len * 0.06, -wid * 0.05);
  g.quadraticCurveTo(len * 0.5, -wid * 0.55, len * 0.9, -wid * 0.3);
  g.moveTo(len * 0.35, -wid * 0.32);
  g.quadraticCurveTo(len * 0.6, wid * 0.05, len * 0.8, wid * 0.25);
  stroke(g, lw * 0.35, 'rgba(58,42,31,0.45)');
  highlight(g, len * 0.5, -wid * 0.55, len * 0.22, wid * 0.22, 0.6, -0.1);
}
// Half-extent box of a wing blade sprite.
export function wingBox(spec) {
  return [-1, -spec.wid * 1.5 - 1, spec.len + 1.5, spec.wid * 1.2 + 1];
}

// A wing frozen mid-beat, for portraits and the gallery.
function stillWing(g, sp, lw, far) {
  const s = WINGS[sp];
  g.save();
  g.translate(s.hx + (far ? 0.6 : 0), s.hy + (far ? 0.4 : 0));
  g.rotate(wingAngle(s, far ? 0.1 : 0.35));
  if (far) g.scale(0.88, 0.88);
  drawWingBlade(g, s.len, s.wid, lw, far);
  g.restore();
}

// ---------------------------------------------------------------- accessory helper
function accessory(g, o, hx, hy, s, nx, ny, ns, hatOnly) {
  if (!o.acc) return;
  if (isNeckwear(o.acc)) {
    if (!hatOnly) drawNeckwear(g, o.acc, nx, ny, ns, o.lw * 0.8, o.accColor);
  } else drawHat(g, o.acc, hx, hy, s, o.lw * 0.8, o.accColor);
}

// Registry: half-extent boxes (generous, for sprite canvas sizing) and draw fns.
export const CREATURE_ART = {
  ant: { box: (st) => (st === 'queen' ? [17, 12] : [12, 9]), lw: 0.75, draw: drawAnt },
  cricket: { box: () => [14, 16], lw: 0.8, draw: (g, o) => drawHopper(g, o, false) },
  grasshopper: { box: () => [17, 14], lw: 0.85, draw: (g, o) => drawHopper(g, o, true) },
  gecko: { box: () => [28, 13], lw: 1.0, draw: drawGecko },
  beetle: { box: () => [13, 10], lw: 0.8, draw: drawBeetle },
  goldfish: { box: () => [21, 14], lw: 0.9, draw: drawFish },
  frog: { box: (st) => (st === 'adult' ? [22, 16] : [14, 8]), lw: 0.9, draw: drawFrog },
  turtle: { box: () => [31, 18], lw: 1.1, draw: drawTurtle },
  pondsnail: { box: () => [9, 9], lw: 0.65, draw: drawPondSnail },
  shrimp: { box: () => [17, 9], lw: 0.65, draw: drawShrimp },
  ladybug: { box: () => [11, 12], lw: 0.7, draw: drawLadybug },
  aphid: { box: () => [5, 5], lw: 0.45, draw: drawAphid },
  butterfly: { box: (st) => (st === 'adult' ? [14, 20] : st === 'caterpillar' ? [12, 8] : [6, 11]), lw: 0.75, draw: drawButterfly },
  snail: { box: () => [15, 14], lw: 0.85, draw: drawSnail },
  bee: { box: () => [10, 10], lw: 0.7, draw: drawBee },
  firefly: { box: () => [10, 9], lw: 0.65, draw: drawFirefly },
  pillbug: { box: () => [10, 7], lw: 0.65, draw: drawPillbug },
  fruitfly: { box: () => [5, 5], lw: 0.4, draw: drawFruitfly },
};

// Worms are soft-bodied and drawn live from their trail of body points.
export function drawWorm(g, pts, pal, lw, closed, acc, accColor, thick = 3.4) {
  if (pts.length < 2) return;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.lineWidth = thick + lw * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.lineWidth = thick;
  g.strokeStyle = pal.body;
  g.stroke();
  // highlight
  g.lineWidth = thick * 0.3;
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.stroke();
  // clitellum band near the head
  const bi = Math.min(pts.length - 1, 2);
  circ(g, pts[bi].x, pts[bi].y, thick * 0.62);
  fill(g, pal.band);
  // segment rings
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * thick * 0.48;
    const ny = (dx / l) * thick * 0.48;
    line(g, pts[i].x - nx, pts[i].y - ny, pts[i].x + nx, pts[i].y + ny, lw * 0.45, 'rgba(58,42,31,0.35)');
  }
  // head
  const h = pts[0];
  const n = pts[1];
  const ang = Math.atan2(h.y - n.y, h.x - n.x);
  g.save();
  g.translate(h.x, h.y);
  g.rotate(ang);
  const flip = Math.cos(ang) < 0;
  if (flip) g.scale(1, -1);
  blob(g, 0.3, 0, thick * 0.72, thick * 0.62, pal.body, lw);
  dotEye(g, 0.6, -thick * 0.22, thick * 0.17, closed);
  cheek(g, 1.0, thick * 0.2, thick * 0.15);
  if (acc && !isNeckwear(acc)) drawHat(g, acc, 0, -thick * 0.5, thick * 0.55, lw * 0.7, accColor);
  g.restore();
}

// Ant brood drawn inside the nest.
export function drawBrood(g, kind, lw) {
  if (kind === 'egg') {
    blob(g, 0, 0, 0.9, 1.25, '#fffaf0', lw * 0.5, 0.4);
  } else if (kind === 'larva') {
    paint(g, '#fbf3e4', lw * 0.6, () => {
      g.beginPath();
      g.arc(0, 0, 2.1, 0.3, Math.PI * 1.8);
      g.arc(0, 0, 0.8, Math.PI * 1.8, 0.3, true);
      g.closePath();
    });
    circ(g, 1.6, -1.0, 0.25);
    fill(g, INK);
  } else {
    blob(g, 0, 0, 1.4, 2.5, '#efe0c0', lw * 0.6, 0.3);
    line(g, -0.6, -0.6, 0.8, -1.0, lw * 0.35, 'rgba(58,42,31,0.4)');
  }
}

// Gentle "spirit" for creatures that pass away: a little halo and soft glow.
export function drawHalo(g, r, lw) {
  ell(g, 0, 0, r, r * 0.32);
  stroke(g, lw * 1.8, '#f3c43c');
  stroke(g, lw * 0.6, '#fff4b0');
}

export { smoothPath };
