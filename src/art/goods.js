// Goods waiting in the tank, ready to collect. Drawn at the good's spot:
// on the ground for honey and compost, hanging from a plant for seeds and
// silk, floating on the water for lilies.
import { INK, TAU, ell, circ, fill, stroke, paint, highlight, line, curve } from './ink.js';
import { flavourOf } from '../data/goods.js';

const LW = 0.8;

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bb = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bb).toString(16).slice(1);
}

function honey(g, look, f) {
  // a glass jar of honey with a gingham lid tied on with string; the honey
  // is the colour of the flowers it came from
  paint(g, 'rgba(250,236,200,0.9)', LW, () => {
    g.beginPath();
    if (g.roundRect) g.roundRect(-5.5, -12, 11, 12, 2.5);
    else g.rect(-5.5, -12, 11, 12);
  });
  paint(g, f ? f.col : '#f0a830', 0, () => {
    g.beginPath();
    if (g.roundRect) g.roundRect(-4.6, -9.6, 9.2, 8.8, 2);
    else g.rect(-4.6, -9.6, 9.2, 8.8);
  });
  highlight(g, -2.8, -6, 0.9, 2.6, 0.7, 0);
  // label with a bee stripe (in the colour of the flowers it came from)
  paint(g, f && f.label ? f.label : '#fbf3df', LW * 0.6, () => {
    g.beginPath();
    g.rect(-3.6, -7, 7.2, 3.8);
  });
  line(g, -1.2, -6.4, -1.2, -3.8, 1, INK);
  line(g, 1.2, -6.4, 1.2, -3.8, 1, INK);
  // cloth lid
  paint(g, '#d9483b', LW, () => {
    g.beginPath();
    g.moveTo(-7, -11.6);
    g.quadraticCurveTo(0, -16.5, 7, -11.6);
    g.lineTo(5.5, -10.4);
    g.lineTo(-5.5, -10.4);
    g.closePath();
  });
  for (const [x, y] of [[-3.5, -12.2], [0, -13.4], [3.5, -12.2], [-1.6, -11.2], [1.8, -11.2]]) {
    circ(g, x, y, 0.55);
    fill(g, '#fffdf6');
  }
  line(g, -5.6, -10.8, 5.6, -10.8, 0.7, '#c9a66a');
}

function seeds(g, look, f) {
  // a ripe seed head where the flower was, its petals dried and curled back
  // (and still a little the colour they were)
  const petal = f ? mix(f.col, '#d9b072', 0.45) : '#d9b072';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    paint(g, petal, LW * 0.5, () => ell(g, Math.cos(a) * 4.6, Math.sin(a) * 4.6, 2, 1, a));
  }
  paint(g, '#7a4f2e', LW, () => circ(g, 0, 0, 4.2));
  // seeds packed in a spiral
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = Math.sqrt(i / 16) * 3.4;
    paint(g, '#efe2c0', 0, () => ell(g, Math.cos(a) * r, Math.sin(a) * r, 0.7, 0.45, a));
  }
}

function compost(g, look) {
  if (look === 'castings') {
    // a little coiled heap of worm castings
    for (const [x, y, r] of [[-3, -1.2, 2.4], [2.6, -1.2, 2.2], [0, -3.4, 2.1], [0.6, -5.4, 1.4]]) {
      paint(g, '#5e4230', LW * 0.8, () => ell(g, x, y, r * 1.3, r));
      curve(g, x - r * 0.9, y, x, y - r * 0.6, x + r * 0.9, y, LW * 0.5, '#3e2a1c');
    }
    return;
  }
  // a beetle's compost ball, half buried, with a seedling already enjoying it
  paint(g, '#6a4a30', LW, () => {
    g.beginPath();
    g.arc(0, 0, 4.6, Math.PI, 0);
    g.closePath();
  });
  for (const [x, y] of [[-2.2, -1.6], [1.4, -2.8], [2.6, -1], [-0.6, -3.4]]) {
    circ(g, x, y, 0.6);
    fill(g, '#3e2a1c');
  }
  curve(g, 0, -4.4, 0.4, -7, 0, -9, LW, '#5f9e45');
  paint(g, '#8cc152', LW * 0.6, () => ell(g, -2, -8.6, 2.2, 1.1, 0.4));
  paint(g, '#8cc152', LW * 0.6, () => ell(g, 2, -9.2, 2.2, 1.1, -0.4));
  paint(g, '#8a6a4a', LW * 0.6, () => ell(g, 0, 0.2, 7, 1.3));
}

function silk(g, look, f) {
  // an empty chrysalis on its silk thread, split open where the butterfly
  // climbed out; the silk has the sheen of whoever spun it
  const sheen = f ? f.col : '#ffffff';
  line(g, 0, -4, 0, 0, LW * 0.6, '#e8e2d6');
  paint(g, f ? f.chrys : 'rgba(214,236,206,0.95)', LW, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(5.5, 2, 5.4, 11, 0, 14.5);
    g.bezierCurveTo(-5.4, 11, -5.5, 2, 0, 0);
    g.closePath();
  });
  // the split
  g.beginPath();
  g.moveTo(-1, 3.4);
  g.lineTo(0.8, 6);
  g.lineTo(-0.6, 8.2);
  g.lineTo(1, 10.6);
  stroke(g, LW * 0.8, INK);
  // the little gold dots chrysalises have
  for (const x of [-2.4, -0.8, 0.8, 2.4]) {
    circ(g, x, 4.4 - Math.abs(x) * 0.2, 0.55);
    fill(g, '#e8b83a');
  }
  highlight(g, -2.2, 8, 0.9, 3.4, 0.7, 0.1);
  // wisps of silk
  curve(g, 2.4, 2, 6, 3, 7, 6.4, LW * (f ? 0.9 : 0.45), sheen);
  curve(g, -2.4, 12, -6, 12.6, -7, 15, LW * (f ? 0.9 : 0.45), sheen);
  if (f) curve(g, 2.6, 9, 6.4, 9.6, 7.4, 12.6, LW * 0.7, sheen);
}

function lily(g, look, f) {
  // a water lily in full bloom, floating on its own little pad, the colour
  // the pond made it (or a lotus bloom, up on its stalk)
  if (f && f.adj === 'lotus') {
    lotus(g);
    return;
  }
  const outer = f ? mix(f.col, '#ffffff', 0.05) : '#f4b3cc';
  const inner = f ? mix(f.col, '#ffffff', 0.4) : '#fbd6e4';
  paint(g, '#6fae4a', LW, () => {
    g.beginPath();
    g.ellipse(0, 0.6, 9, 2.6, 0, 0.25, TAU - 0.25);
    g.lineTo(0, 0.6);
    g.closePath();
  });
  const petal = (a, len, col) =>
    paint(g, col, LW * 0.7, () => {
      g.save();
      g.translate(0, -2);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-2.2, -len * 0.6, 0, -len);
      g.quadraticCurveTo(2.2, -len * 0.6, 0, 0);
      g.closePath();
      g.restore();
    });
  for (const a of [-1.25, 1.25, -0.85, 0.85]) petal(a, 7.4, outer);
  for (const a of [-0.45, 0.45, 0]) petal(a, 8.2, inner);
  paint(g, '#f6d64a', LW * 0.6, () => ell(g, 0, -3.2, 2.2, 1.3));
}

function lotus(g) {
  // a lotus bloom held up on its stalk over a round pad
  paint(g, '#5f9e6a', LW, () => ell(g, 0, 0.6, 9, 2.4));
  curve(g, 0, 0, 1, -3, 0, -5.5, LW * 1.4, '#5f8a4a');
  const petal = (a, len, col) =>
    paint(g, col, LW * 0.7, () => {
      g.save();
      g.translate(0, -5.5);
      g.rotate(a);
      g.beginPath();
      g.moveTo(-2, 0);
      g.quadraticCurveTo(-3, -len * 0.7, 0, -len);
      g.quadraticCurveTo(3, -len * 0.7, 2, 0);
      g.closePath();
      g.restore();
    });
  for (const a of [-1.1, 1.1, -0.6, 0.6]) petal(a, 7.6, '#f9b8d0');
  for (const a of [-0.25, 0.25]) petal(a, 8.6, '#fbe3ec');
  paint(g, '#f6d64a', LW * 0.6, () => ell(g, 0, -6.6, 2.4, 1.2));
}

// A prize good wears a little gold rosette.
function rosette(g, x, y) {
  for (const dx of [-1, 1]) {
    paint(g, '#d9483b', LW * 0.5, () => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx * 2.6, y + 5.4);
      g.lineTo(x + dx * 1.2, y + 4.6);
      g.lineTo(x + dx * 0.2, y + 5.8);
      g.closePath();
    });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    circ(g, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.05);
    fill(g, '#f3c43c');
  }
  paint(g, '#f6d64a', LW * 0.6, () => circ(g, x, y, 2.2));
  paint(g, '#fffdf6', LW * 0.4, () => circ(g, x, y, 1));
}
const ROSETTE_AT = { honey: [5, -12], seeds: [5, -5], compost: [6, -8], silk: [5, 2], lily: [7, -8] };

export const GOOD_ART = { honey, seeds, compost, silk, lily };

export function goodBox(type, prize) {
  const b = baseBox(type);
  if (!prize) return b;
  const [rx, ry] = ROSETTE_AT[type] || [5, -5];
  return [Math.min(b[0], rx - 4), Math.min(b[1], ry - 4), Math.max(b[2], rx + 4), Math.max(b[3], ry + 7)];
}
function baseBox(type) {
  switch (type) {
    case 'honey':
      return [-9, -19, 9, 2];
    case 'seeds':
      return [-8, -8, 8, 8];
    case 'compost':
      return [-9, -12, 9, 3];
    case 'silk':
      return [-9, -6, 9, 17];
    case 'lily':
      return [-11, -16, 11, 5];
    default:
      return [-8, -8, 8, 8];
  }
}

// flav: its flavour (see FLAVOURS in data/goods.js); prize: wears a rosette
export function drawGood(g, type, look, flav, prize) {
  const f = GOOD_ART[type];
  if (f) f(g, look, flav ? flavourOf(type, flav) : null);
  if (prize) {
    const [rx, ry] = ROSETTE_AT[type] || [5, -5];
    rosette(g, rx, ry);
  }
}
