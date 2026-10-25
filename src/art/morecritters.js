// Picture-book art for the newer critters: guppies, neon tetras, koi, pea
// puffers and the axolotl in the pond; dragonflies (nymph and grown-up) and
// moths in the air. Same conventions as creatures.js: facing right, centred
// on (0,0), in world units, inked outlines over flat washes.
import {
  INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, cheek, eye, dotEye, smile, line, bent, curve, antenna, fuzzPath,
  drawHat, drawNeckwear, isNeckwear,
} from './ink.js';

function hatOn(g, o, hx, hy, s, nx, ny, ns) {
  if (!o.acc) return;
  if (isNeckwear(o.acc)) drawNeckwear(g, o.acc, nx, ny, ns, o.lw * 0.8, o.accColor);
  else drawHat(g, o.acc, hx, hy, s, o.lw * 0.8, o.accColor);
}

function fishEggs(g, lw, col = 'rgba(255,240,200,0.8)') {
  for (let i = 0; i < 6; i++) {
    circ(g, (i % 3) * 2 - 2, Math.floor(i / 3) * 1.8 - 0.9, 0.85);
    fill(g, col);
    stroke(g, lw * 0.4);
  }
}

// ---------------------------------------------------------------- GUPPY
// A slim little body and a tail half as big as the rest of it.
export function drawGuppy(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'fry') {
    g.save();
    g.scale(0.55, 0.55);
  }
  const f = o.frame % 4;
  const wag = [0.28, 0, -0.28, 0][f];
  g.save();
  g.translate(-3.4, 0);
  g.rotate(wag);
  paint(g, P.tail, lw, () => {
    g.beginPath();
    g.moveTo(0.4, -1);
    g.bezierCurveTo(-3, -5.6, -8.4, -6.6, -9.4, -3.6);
    g.quadraticCurveTo(-10.4, 0, -9.4, 3.6);
    g.bezierCurveTo(-8.4, 6.6, -3, 5.6, 0.4, 1);
    g.closePath();
  });
  // speckles and rays on the fan
  g.save();
  g.beginPath();
  g.moveTo(0.4, -1);
  g.bezierCurveTo(-3, -5.6, -8.4, -6.6, -9.4, -3.6);
  g.quadraticCurveTo(-10.4, 0, -9.4, 3.6);
  g.bezierCurveTo(-8.4, 6.6, -3, 5.6, 0.4, 1);
  g.clip();
  if (P.pattern === 'spots') {
    for (const [x, y] of [[-3, -2], [-5.5, 1.5], [-7, -3.4], [-4.4, 3.6], [-8, 0.4], [-6.2, -0.8]]) {
      circ(g, x, y, 0.8);
      fill(g, P.tail2);
    }
  } else {
    paint(g, P.tail2, 0, () => ell(g, -8.6, 0, 2.6, 5.6));
  }
  g.restore();
  for (let i = -2; i <= 2; i++) curve(g, -0.6, 0, -4.5, i * 1.6, -8.4, i * 2.6, lw * 0.35, 'rgba(58,42,31,0.3)');
  g.restore();
  // dorsal fin
  paint(g, P.tail, lw * 0.8, () => {
    g.beginPath();
    g.moveTo(-1.6, -2.2);
    g.quadraticCurveTo(-1, -5.4, 2.4, -2.6);
    g.closePath();
  });
  blob(g, 1, 0, 4.6, 2.5, P.body, lw);
  if (P.shine) {
    ell(g, -0.6, 0.2, 2.6, 1.4);
    g.save();
    g.globalAlpha *= 0.8;
    fill(g, P.shine);
    g.restore();
  }
  highlight(g, 1, -1.3, 2.6, 0.6, 0.4);
  eye(g, 3.6, -0.5, 1.25, lw, { closed: o.closed, pupil: 0.6, lookX: 0.5 });
  ell(g, 5.5, 0.4, 0.35, 0.4);
  stroke(g, lw * 0.6);
  if (o.stage === 'fry') g.restore();
}

// ---------------------------------------------------------------- NEON TETRA
export function drawTetra(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    fishEggs(g, lw, 'rgba(240,236,220,0.75)');
    return;
  }
  if (o.stage === 'fry') {
    g.save();
    g.scale(0.55, 0.55);
  }
  const f = o.frame % 4;
  const wag = [0.25, 0, -0.25, 0][f];
  g.save();
  g.translate(-4.6, 0);
  g.rotate(wag);
  paint(g, 'rgba(232,240,236,0.7)', lw * 0.8, () => {
    g.beginPath();
    g.moveTo(0.3, -0.5);
    g.lineTo(-3.4, -2.8);
    g.quadraticCurveTo(-2.4, 0, -3.4, 2.8);
    g.lineTo(0.3, 0.5);
    g.closePath();
  });
  g.restore();
  paint(g, 'rgba(232,240,236,0.7)', lw * 0.7, () => {
    g.beginPath();
    g.moveTo(-1.2, -1.8);
    g.lineTo(0.2, -3.6);
    g.lineTo(1.4, -1.9);
    g.closePath();
  });
  // a slim torpedo: olive back, silver belly, red rear, glowing stripe
  const body = () => ell(g, 0.4, 0, 5.4, 2.1);
  paint(g, P.back, lw, body);
  g.save();
  body();
  g.clip();
  g.fillStyle = P.belly;
  g.fillRect(-6, 0.3, 13, 3);
  g.fillStyle = P.red;
  g.fillRect(P.full ? -6 : -5.2, 0.3, P.full ? 10 : 4.2, 3);
  g.fillStyle = P.stripe;
  g.beginPath();
  g.moveTo(-4.8, -0.3);
  g.quadraticCurveTo(0, -1.2, 4.4, -0.7);
  g.lineTo(4.4, 0.4);
  g.quadraticCurveTo(0, -0.1, -4.8, 0.6);
  g.closePath();
  g.fill();
  g.restore();
  body();
  stroke(g, lw);
  highlight(g, 0, -1.2, 2.4, 0.45, 0.45);
  eye(g, 3.8, -0.4, 1.1, lw, { closed: o.closed, pupil: 0.6, lookX: 0.5 });
  if (o.stage === 'fry') g.restore();
}

// ---------------------------------------------------------------- KOI
// A long, gentle fish with whiskers and splashes of colour.
export function drawKoi(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    fishEggs(g, lw);
    return;
  }
  if (o.stage === 'fry') {
    g.save();
    g.scale(0.5, 0.5);
  }
  const f = o.frame % 4;
  const wag = [0.22, 0, -0.22, 0][f];
  g.save();
  g.translate(-12, 0);
  g.rotate(wag);
  paint(g, P.fin, lw, () => {
    g.beginPath();
    g.moveTo(0.5, -1.4);
    g.bezierCurveTo(-3.5, -5.4, -8, -7, -10, -6);
    g.quadraticCurveTo(-7, -1, -9, 0);
    g.quadraticCurveTo(-7, 1, -10, 6);
    g.bezierCurveTo(-8, 7, -3.5, 5.4, 0.5, 1.4);
    g.closePath();
  });
  for (let i = -2; i <= 2; i++) curve(g, -1, 0, -5, i * 1.8, -8.6, i * 2.6, lw * 0.35, 'rgba(58,42,31,0.3)');
  g.restore();
  paint(g, P.fin, lw, () => {
    g.beginPath();
    g.moveTo(-8, -3.8);
    g.quadraticCurveTo(-3, -9, 4, -5.2);
    g.closePath();
  });
  // long body
  const body = () => {
    g.beginPath();
    g.moveTo(13, 0.4);
    g.bezierCurveTo(12.6, -6, 2, -6.6, -6, -4.4);
    g.bezierCurveTo(-11, -3, -13, -1.4, -13, 0);
    g.bezierCurveTo(-13, 1.6, -11, 3, -6, 4.2);
    g.bezierCurveTo(2, 6.4, 12.6, 5.4, 13, 0.4);
    g.closePath();
  };
  paint(g, P.body, lw, body);
  g.save();
  body();
  g.clip();
  for (const [x, y, rx, ry, c] of P.patches || []) {
    ell(g, x, y, rx, ry, 0.2);
    fill(g, c);
  }
  if (P.metal) {
    const grd = g.createLinearGradient(0, -6, 0, 6);
    grd.addColorStop(0, 'rgba(255,255,255,0.0)');
    grd.addColorStop(0.35, 'rgba(255,250,220,0.55)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.0)');
    g.fillStyle = grd;
    g.fillRect(-14, -7, 28, 14);
  }
  // scales
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      g.beginPath();
      g.arc(-7 + c * 3.2 + r * 1.6, -1.6 + r * 2.6, 1.4, -0.6 * Math.PI, 0.6 * Math.PI);
      stroke(g, lw * 0.4, 'rgba(58,42,31,0.25)');
    }
  }
  g.restore();
  body();
  stroke(g, lw);
  highlight(g, 1, -3.6, 6, 1.2, 0.35, -0.05);
  curve(g, 8, -4, 6.8, 0, 8.2, 4.2, lw * 0.6);
  // pectoral fin
  paint(g, P.fin, lw * 0.8, () => ell(g, 5, 3.8, 3.4, 1.4, 0.6 + (f % 2 ? 0.25 : 0)));
  // whiskers
  curve(g, 12.4, 1.6, 14.4, 2.4, 15.2, 4.4, lw * 0.6);
  curve(g, 12, 2, 13.4, 3.6, 13.4, 5.6, lw * 0.6);
  eye(g, 9.4, -1.6, 1.5, lw, { closed: o.closed, pupil: 0.62, lookX: 0.5 });
  cheek(g, 10.6, 1.4, 1.1);
  ell(g, 12.9, 1.0, 0.7, 0.6);
  stroke(g, lw * 0.7);
  if (o.stage !== 'fry') hatOn(g, o, 8.8, -4.8, 2.6, 11.6, 4.2, 1.6);
  if (o.stage === 'fry') g.restore();
}

// ---------------------------------------------------------------- PEA PUFFER
export function drawPuffer(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    fishEggs(g, lw, 'rgba(250,246,220,0.8)');
    return;
  }
  if (o.stage === 'fry') {
    g.save();
    g.scale(0.55, 0.55);
  }
  const puff = o.pose === 'puff';
  const f = o.frame % 4;
  if (puff) {
    // a prickly little balloon
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      line(g, Math.cos(a) * 6.4, Math.sin(a) * 6.4, Math.cos(a) * 7.8, Math.sin(a) * 7.8, lw * 0.6);
    }
    blob(g, 0, 0, 6.8, 6.8, P.body, lw);
    g.save();
    circ(g, 0, 0, 6.8);
    g.clip();
    ell(g, 0, 4.6, 6, 3.6);
    fill(g, P.belly);
    for (const [x, y] of [[-3, -3], [1, -4.6], [-4.4, 0.4], [3.6, -2], [-0.6, -1]]) {
      circ(g, x, y, 1.1);
      fill(g, P.spot);
    }
    g.restore();
    circ(g, 0, 0, 6.8);
    stroke(g, lw);
    highlight(g, -2.4, -3.6, 2.4, 1.2, 0.5);
    eye(g, 3.4, -1.4, 1.9, lw, { closed: o.closed, pupil: 0.55, lookX: 0.2, white: '#fbf0c0' });
    circ(g, 6.2, 1.4, 0.7);
    fill(g, '#b3473f');
    stroke(g, lw * 0.6);
    if (o.stage === 'fry') g.restore();
    return;
  }
  // tail
  paint(g, P.fin, lw * 0.8, () => {
    g.beginPath();
    g.moveTo(-4.4, -0.6);
    g.lineTo(-7.6, -2.6 + (f % 2) * 0.8);
    g.lineTo(-7.2, 2.4 + (f % 2) * 0.8);
    g.lineTo(-4.4, 0.8);
    g.closePath();
  });
  // a tadpole-ish round body
  const body = () => {
    g.beginPath();
    g.moveTo(-4.8, 0);
    g.bezierCurveTo(-4.6, -3.8, 0, -4.8, 3, -3.6);
    g.bezierCurveTo(5.6, -2.4, 5.8, 2.4, 3, 3.4);
    g.bezierCurveTo(0, 4.4, -4.6, 3, -4.8, 0);
    g.closePath();
  };
  paint(g, P.body, lw, body);
  g.save();
  body();
  g.clip();
  ell(g, 0.6, 3.2, 5, 2);
  fill(g, P.belly);
  for (const [x, y] of [[-2.6, -1.6], [0, -2.8], [-0.6, -0.4], [1.8, -1.6], [-3.4, 0.6]]) {
    circ(g, x, y, 0.75);
    fill(g, P.spot);
  }
  if (P.stripe) line(g, -3.6, 2, 2.6, 2.4, lw * 1.4, P.stripe);
  g.restore();
  body();
  stroke(g, lw);
  // fluttering fins like a hummingbird
  paint(g, 'rgba(240,248,236,0.7)', lw * 0.6, () => ell(g, 0.6, 0.8, 1.5, 0.9, f % 2 ? 0.8 : -0.2));
  paint(g, 'rgba(240,248,236,0.7)', lw * 0.6, () => ell(g, -1.4, -3.8, 1.4, 0.8, f % 2 ? -0.5 : 0.3));
  highlight(g, -1, -2.6, 2, 0.6, 0.45);
  // big rolling eyes with a golden rim
  eye(g, 2.8, -1.4, 1.75, lw, { closed: o.closed, pupil: 0.6, lookX: (o.frame % 3) - 0.6, white: '#fbf0c0' });
  cheek(g, 3.9, 1.2, 0.8);
  ell(g, 5.3, 0.6, 0.45, 0.4);
  stroke(g, lw * 0.6);
  if (o.stage === 'fry') g.restore();
}

// ---------------------------------------------------------------- AXOLOTL
// A smiling salamander with three feathery gills on each side of its head.
export function drawAxolotl(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const f = o.frame % 4;
  const walking = o.pose === 'walk';
  const swim = o.pose === 'swim';
  const step = walking ? [1, 0.3, -1, -0.3][f] : 0;
  // tail with a soft fin crest
  const sway = swim ? [2, 0, -2, 0][f] : 0;
  paint(g, P.fin, lw * 0.7, () => {
    g.beginPath();
    g.moveTo(-5, -1.6);
    g.bezierCurveTo(-10, -4.6, -15, -3 + sway * 0.4, -18, sway);
    g.bezierCurveTo(-15, 3.8 + sway * 0.4, -10, 3.6, -5, 2.6);
    g.closePath();
  });
  paint(g, P.body, lw, () => {
    g.beginPath();
    g.moveTo(-4, -1.4);
    g.quadraticCurveTo(-11, -1.6, -16, sway * 0.8);
    g.quadraticCurveTo(-11, 1.8, -4, 2.4);
    g.closePath();
  });
  // legs (the far pair first)
  const leg = (x, dir, far) => {
    const c = far ? P.fin : P.body;
    paint(g, c, lw * 0.8, () => ell(g, x + dir * 0.6, 3.4, 0.9, 2, dir * 0.4));
    for (let i = -1; i <= 1; i++) line(g, x + dir * 1, 5, x + dir * 1 + i * 0.6 + 0.4, 6, lw * 0.4);
  };
  if (!swim) {
    leg(-3.5 - step, -1, true);
    leg(5.5 + step, 1, true);
  }
  // body and head
  blob(g, 0.5, 0.4, 7, 3.4, P.body, lw);
  highlight(g, 0, -1.6, 3.6, 0.8, 0.35);
  blob(g, 8.2, -0.4, 4.8, 3.9, P.body, lw);
  highlight(g, 7.4, -2.6, 2, 0.7, 0.4);
  // gills: three feathery fronds behind the head
  for (let i = 0; i < 3; i++) {
    const a = -2.2 + i * 0.55;
    const bx = 5.4;
    const by = -2.4 + i * 0.9;
    const ex = bx + Math.cos(a) * 5.4;
    const ey = by + Math.sin(a) * 5.4;
    curve(g, bx, by, (bx + ex) / 2 - 0.6, (by + ey) / 2 - 0.4, ex, ey, lw * 1.5, P.gill);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const px = bx + (ex - bx) * t;
      const py = by + (ey - by) * t;
      line(g, px, py, px + Math.cos(a - 1.2) * 1.4, py + Math.sin(a - 1.2) * 1.4, lw * 0.9, P.gill);
      line(g, px, py, px + Math.cos(a + 1.2) * 1.2, py + Math.sin(a + 1.2) * 1.2, lw * 0.9, P.gill);
    }
  }
  if (!swim) {
    leg(-2.5 + step, -1, false);
    leg(6.5 - step, 1, false);
  } else {
    paint(g, P.body, lw * 0.7, () => ell(g, -2, 3, 1.8, 0.7, -0.4));
    paint(g, P.body, lw * 0.7, () => ell(g, 6, 3.2, 1.8, 0.7, -0.4));
  }
  // a wide, happy face
  dotEye(g, 10, -1.6, 0.75, o.closed, P.eye || INK);
  g.beginPath();
  g.moveTo(8.4, 1.2);
  g.quadraticCurveTo(10.8, 2.6, 12.6, 0.8);
  stroke(g, lw * 0.8);
  cheek(g, 10.4, 0.6, 0.8);
  hatOn(g, o, 8.2, -4.2, 2.6, 5.8, 2.6, 1.8);
}

// ---------------------------------------------------------------- DRAGONFLY
export function drawDragonfly(g, o) {
  const P = o.pal;
  const lw = o.lw;
  if (o.stage === 'egg') {
    for (let i = 0; i < 5; i++) blob(g, -2 + i, (i % 2) * 0.6, 0.5, 0.9, '#efe4b8', lw * 0.35);
    return;
  }
  if (o.stage === 'nymph') {
    // a squat little hunter that walks along the bottom of the pond
    const f = o.frame % 4;
    const walking = o.pose === 'walk';
    for (let i = 0; i < 3; i++) {
      const x = -1 + i * 2.4;
      const sw = walking ? ((i + f) % 2 ? 0.9 : -0.9) : 0;
      bent(g, x, 1, x + sw - 1.2, 3.2, x + sw - 2, 4.4, lw * 0.6);
    }
    paint(g, P.nymph, lw, () => {
      g.beginPath();
      g.moveTo(-7, 0);
      g.bezierCurveTo(-7, -3.4, 2, -3.6, 3, -1.6);
      g.lineTo(3, 1.8);
      g.bezierCurveTo(2, 3.2, -7, 3, -7, 0);
      g.closePath();
    });
    for (let i = 0; i < 4; i++) curve(g, -5.6 + i * 1.8, -2.4, -5 + i * 1.8, 0, -5.6 + i * 1.8, 2.4, lw * 0.4, 'rgba(58,42,31,0.5)');
    paint(g, P.nymph, lw * 0.8, () => ell(g, -0.4, -2.2, 2.6, 1, -0.1));
    blob(g, 4.8, -0.2, 2.4, 2.2, P.nymph, lw);
    dotEye(g, 5.6, -1.2, 0.95, o.closed);
    cheek(g, 6.1, 0.8, 0.5);
    highlight(g, -3, -1.8, 2.4, 0.5, 0.35);
    return;
  }
  // grown-up: a long thin tail, a stout thorax and great big eyes. Wings are
  // beaten live by the renderer in flight; perched, they rest flat out.
  if (!o.liveWings) {
    for (const [dx, a] of [[0.8, 0.5], [-0.6, 0.26]]) {
      g.save();
      g.translate(dx, -1.6);
      g.rotate(Math.PI + a);
      drawDragonWing(g, 12.5, 2.1, lw, false, P);
      g.restore();
    }
  }
  // abdomen: segments tapering back
  for (let i = 0; i < 7; i++) {
    const x = -1.4 - i * 1.9;
    const r = 1.25 - i * 0.07;
    paint(g, i % 2 ? P.body : P.body2 || P.body, lw * 0.7, () => ell(g, x, 0.2, 1.15, r));
  }
  paint(g, P.body, lw * 0.6, () => {
    g.beginPath();
    g.moveTo(-14.4, -0.4);
    g.lineTo(-16.4, -1.2);
    g.lineTo(-15.8, 0.6);
    g.closePath();
  });
  // legs
  for (let i = 0; i < 3; i++) bent(g, 1 + i * 1.2, 1.4, 1.6 + i * 1.2, 3, 0.8 + i * 1.4, 4, lw * 0.5);
  blob(g, 1.6, -0.2, 2.8, 2.2, P.thorax || P.body, lw);
  highlight(g, 1, -1.4, 1.4, 0.5, 0.4);
  // eyes: two big glossy domes
  paint(g, P.eye, lw, () => circ(g, 5.2, -1.2, 2.4));
  paint(g, P.eye, lw, () => circ(g, 5.6, 0.6, 1.8));
  highlight(g, 4.6, -2.2, 1.1, 0.6, 0.7);
  if (o.closed) curve(g, 4.6, -1.2, 5.4, -0.6, 6.2, -1.2, lw * 0.7);
  else {
    circ(g, 5.8, -1.2, 0.7);
    fill(g, INK);
    circ(g, 6.0, -1.5, 0.25);
    fill(g, '#fff');
  }
  cheek(g, 6.6, 1.6, 0.55);
  smile(g, 6.7, 1.9, 0.6, lw * 0.6);
  if (o.acc === 'post') {
    // the mail dragonfly's cap and satchel
    drawHat(g, 'cap', 5.2, -3.3, 2.1, lw * 0.8, '#3f6aa8');
    paint(g, '#a8743f', lw * 0.7, () => {
      g.beginPath();
      g.rect(-1.6, 1.6, 3.4, 2.6);
    });
    line(g, -1.4, 1.6, 2.4, -1.4, lw * 0.7, '#8a5a2c');
    paint(g, '#fffdf6', lw * 0.4, () => {
      g.beginPath();
      g.rect(-1, 1, 2.2, 1.2);
    });
  }
}

// One glassy dragonfly wing, root at the origin, pointing along +x, with a
// little dark spot near the tip.
export function drawDragonWing(g, len, wid, lw, far, P) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(len * 0.15, -wid * 1.1, len * 0.8, -wid * 1.05, len, -wid * 0.3);
  g.bezierCurveTo(len * 1.02, wid * 0.5, len * 0.4, wid * 0.7, 0, 0);
  g.closePath();
  g.fillStyle = far ? 'rgba(190,214,230,0.5)' : 'rgba(226,242,252,0.62)';
  g.fill();
  stroke(g, lw * 0.6, far ? 'rgba(58,42,31,0.55)' : INK);
  g.beginPath();
  g.moveTo(len * 0.05, -wid * 0.1);
  g.lineTo(len * 0.95, -wid * 0.45);
  g.moveTo(len * 0.2, -wid * 0.55);
  g.lineTo(len * 0.7, wid * 0.25);
  stroke(g, lw * 0.3, 'rgba(58,42,31,0.4)');
  ell(g, len * 0.86, -wid * 0.5, len * 0.05, wid * 0.22, -0.2);
  fill(g, (P && P.spot) || '#5a4636');
  highlight(g, len * 0.45, -wid * 0.5, len * 0.2, wid * 0.2, 0.6, -0.1);
}

// ---------------------------------------------------------------- MOTH
// Moth wings: broad forewings and rounded hindwings (a luna's have long
// trailing tails), hinged like a butterfly's along y = -0.6.
export function drawMothWings(g, P, lw, col, under) {
  const hind = () => {
    g.beginPath();
    g.moveTo(-0.6, -0.6);
    if (P.tails) {
      g.bezierCurveTo(-5, -1.6, -8.6, -6, -8.2, -10);
      g.bezierCurveTo(-7, -12.6, -2.4, -10, 0.6, -2);
      g.closePath();
      // the long trailing tail
      g.moveTo(-6.4, -2.6);
      g.bezierCurveTo(-9, -1, -12.4, 1.8, -13.6, 4.6);
      g.bezierCurveTo(-11.4, 2.8, -8, -0.4, -5.4, -1.4);
      g.closePath();
    } else {
      g.bezierCurveTo(-5.6, -1.6, -10.4, -6.6, -8.6, -10.6);
      g.bezierCurveTo(-5.6, -12.6, -1.6, -8.4, 1, -1);
      g.closePath();
    }
  };
  paint(g, under ? P.under : P.hind || col, lw, hind);
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(0.2, -0.8);
    g.bezierCurveTo(-1.6, -7, -1.2, -15.6, 3.6, -16.8);
    g.bezierCurveTo(9.6, -17.6, 12, -13.4, 11, -10.8);
    g.bezierCurveTo(8.6, -6.6, 5, -3.4, 2.8, -0.8);
    g.closePath();
  });
  if (!under) {
    // soft fur at the wing roots, and an eyespot on each wing
    if (P.band) {
      g.save();
      g.beginPath();
      g.moveTo(0.2, -0.8);
      g.bezierCurveTo(-1.6, -7, -1.2, -15.6, 3.6, -16.8);
      g.bezierCurveTo(9.6, -17.6, 12, -13.4, 11, -10.8);
      g.bezierCurveTo(8.6, -6.6, 5, -3.4, 2.8, -0.8);
      g.closePath();
      g.clip();
      ell(g, 1, -9, 4.4, 12, 0.35);
      fill(g, P.band);
      g.restore();
    }
    if (P.eyespot) {
      for (const [x, y, r] of [[5.6, -11.6, 1.5], [-5.6, -7, 1.3]]) {
        paint(g, P.eyespot, lw * 0.5, () => circ(g, x, y, r));
        circ(g, x + 0.2, y - 0.2, r * 0.45);
        fill(g, P.eyeCore || INK);
        circ(g, x + 0.5, y - 0.5, r * 0.18);
        fill(g, '#fff');
      }
    }
    g.beginPath();
    g.moveTo(-0.6, -14.6);
    g.bezierCurveTo(0.8, -18.2, 9, -18.2, 10.6, -11);
    stroke(g, lw * 1.6, P.edge || 'rgba(58,42,31,0.45)');
  }
  highlight(g, 3, -12.4, 2.4, 1, 0.25, -0.5);
}

export function drawMoth(g, o) {
  const P = o.pal;
  const lw = o.lw;
  const st = o.stage;
  if (st === 'egg') {
    for (let i = 0; i < 4; i++) blob(g, -1.8 + i * 1.2, (i % 2) * 0.6, 0.65, 0.65, '#f1ead2', lw * 0.4);
    return;
  }
  if (st === 'caterpillar') {
    const f = o.frame % 4;
    const hc = (f / 4) * 7;
    const seg = [];
    for (let i = 0; i < 7; i++) seg.push([-7 + i * 2.05, -1.6 * Math.exp(-((i - hc) * (i - hc)) / 1.6)]);
    for (const [x, y] of seg) {
      ell(g, x, y + 2.3, 0.7, 0.55);
      fill(g, INK);
    }
    for (const [x, y] of seg) {
      blob(g, x, y, 2.45, 2.45, P.cat, lw * 0.85);
      // little tufts of hair
      for (const a of [-2.2, -1.6, -1.0]) line(g, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, x + Math.cos(a) * 3.6, y + Math.sin(a) * 3.6, lw * 0.4, P.hair);
    }
    const hy = seg[6][1] - 0.5;
    blob(g, 7.8, hy, 2.9, 2.8, P.cat, lw);
    highlight(g, 7.2, hy - 1.4, 1.2, 0.6, 0.4);
    eye(g, 8.9, hy - 0.8, 1.05, lw, { closed: o.closed, pupil: 0.55 });
    cheek(g, 9.4, hy + 0.9, 0.7);
    smile(g, 9.9, hy + 1.2, 0.55, lw * 0.6);
    return;
  }
  if (st === 'cocoon') {
    // a fluffy silk cocoon, wrapped round and round
    line(g, 0, -9.5, 0, -7, lw * 0.5);
    paint(g, P.cocoon, lw, () => ell(g, 0, 0, 4.2, 7.2));
    g.save();
    ell(g, 0, 0, 4.2, 7.2);
    g.clip();
    for (let i = -6; i <= 6; i += 1.4) curve(g, -5, i - 1, 0, i + 1.4, 5, i - 0.6, lw * 0.45, 'rgba(120,100,70,0.35)');
    g.restore();
    highlight(g, -1.4, -2, 1.1, 3, 0.45, 0.1);
    return;
  }
  const fly = o.pose === 'fly';
  if (!(fly && o.liveWings)) {
    g.save();
    g.translate(0, -0.6);
    g.scale(1, fly ? 0.62 : 0.86);
    g.translate(0, 0.6);
    drawMothWings(g, P, lw, P.wing, false);
    g.restore();
  }
  // a stout, furry body
  fuzzPath(g, -2, 0.4, 5, 1.8, 14, 0.18, 3);
  fill(g, P.body);
  stroke(g, lw * 0.8);
  for (let i = 0; i < 3; i++) line(g, -5 + i * 1.8, -0.8, -5.2 + i * 1.8, 1.6, lw * 0.4, 'rgba(58,42,31,0.3)');
  fuzzPath(g, 3.6, -0.3, 2.6, 2.2, 12, 0.22, 7);
  fill(g, P.fur || P.body);
  stroke(g, lw * 0.8);
  // feathery antennae
  for (const [ex, ey, k] of [[9.6, -7.2, 1], [7.8, -8.2, 0.85]]) {
    curve(g, 5.6, -1.8, 6.8, -5, ex, ey, lw * 0.5);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const x = 5.6 + (ex - 5.6) * t;
      const y = -1.8 + (ey + 1.8) * t;
      line(g, x, y, x - 0.9 * k, y - 0.6 * k, lw * 0.35);
      line(g, x, y, x + 0.6 * k, y + 0.5 * k, lw * 0.35);
    }
  }
  blob(g, 6, -0.2, 1.7, 1.6, P.fur || P.body, lw * 0.8);
  if (o.closed) curve(g, 5.8, -0.4, 6.3, 0.1, 6.9, -0.4, lw * 0.6, INK);
  else {
    circ(g, 6.5, -0.5, 0.8);
    fill(g, INK);
    circ(g, 6.75, -0.8, 0.3);
    fill(g, '#fff');
  }
  cheek(g, 6.9, 0.7, 0.5);
}
