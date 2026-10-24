// Gadgets from the Busytown Market that live on the tank rather than in it:
// Farmer Furrow's rain barrel, Sprocket's clockwork climate keeper, Gus's
// brass sprinklers and the Mayor's notice board. Each is drawn standing on
// (0,0), up being negative y, in the tank's ink and wash.
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, line, curve } from './ink.js';

const LW = 1.0;

function rect(g, x, y, w, h, col, lw = LW) {
  paint(g, col, lw, () => {
    g.beginPath();
    g.rect(x, y, w, h);
  });
}

export function rainBarrel(g) {
  // a wooden barrel with iron hoops and a tap, rain brimming at the top
  paint(g, '#b77d4b', LW, () => {
    g.beginPath();
    g.moveTo(-10, 0);
    g.bezierCurveTo(-13, -8, -13, -22, -10, -30);
    g.lineTo(10, -30);
    g.bezierCurveTo(13, -22, 13, -8, 10, 0);
    g.closePath();
  });
  for (const x of [-5, 0, 5]) line(g, x, -29, x * 1.08, -1, LW * 0.5, 'rgba(58,42,31,0.45)');
  for (const y of [-25, -15, -5]) {
    g.beginPath();
    g.moveTo(-11.6, y);
    g.quadraticCurveTo(0, y + 1.6, 11.6, y);
    stroke(g, LW * 1.6, '#5e5a62');
  }
  paint(g, '#7cc0e6', LW * 0.8, () => ell(g, 0, -30, 10, 2.4));
  highlight(g, -3, -30.6, 4, 0.8, 0.6, 0);
  // the tap
  rect(g, 10, -9, 5, 2.4, '#9aa0a6', LW * 0.7);
  paint(g, '#7cc0e6', 0, () => ell(g, 14.5, -5, 0.9, 1.6));
}

// Sprocket's climate keeper: a brass box of gears and dials with a little
// weather vane on top. t turns the gears.
export function climateKeeper(g, t = 0) {
  rect(g, -14, -18, 28, 18, '#d4a24a');
  rect(g, -14, -18, 28, 3, '#b8863a', LW * 0.7);
  for (const [x, r, s] of [[-7, 4.6, 1], [3, 3.4, -1.4]]) {
    g.save();
    g.translate(x, -8);
    g.rotate(t * s);
    paint(g, '#c9962a', LW * 0.8, () => {
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const rr = i % 2 ? r : r * 0.78;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    });
    circ(g, 0, 0, r * 0.25);
    fill(g, INK);
    g.restore();
  }
  // a dial
  paint(g, '#fbf3df', LW * 0.7, () => circ(g, 9.6, -11, 3));
  line(g, 9.6, -11, 9.6 + Math.cos(t * 0.3) * 2.2, -11 + Math.sin(t * 0.3) * 2.2, LW * 0.7, '#d9483b');
  // weather vane
  line(g, 0, -18, 0, -27, LW);
  paint(g, '#d9483b', LW * 0.7, () => {
    g.beginPath();
    g.moveTo(0, -27);
    g.lineTo(6, -25.5);
    g.lineTo(0, -24);
    g.closePath();
  });
  paint(g, '#f3c43c', LW * 0.6, () => circ(g, 0, -27.6, 1.2));
  highlight(g, -9, -15, 3, 0.8, 0.5, 0);
}

// A brass sprinkler head hanging from the lid (drawn downward from 0).
export function sprinklerHead(g) {
  line(g, 0, 0, 0, 7, LW * 1.4, '#9aa0a6');
  paint(g, '#d4a24a', LW, () => {
    g.beginPath();
    g.moveTo(-5, 7);
    g.lineTo(5, 7);
    g.lineTo(3.4, 11.5);
    g.lineTo(-3.4, 11.5);
    g.closePath();
  });
  for (const x of [-2.4, 0, 2.4]) {
    circ(g, x, 11.6, 0.55);
    fill(g, INK);
  }
  highlight(g, -2, 8.4, 1.4, 0.6, 0.6, 0);
}

export function noticeBoard(g) {
  line(g, -12, 0, -12, -26, LW * 2, '#8a5a35');
  line(g, 12, 0, 12, -26, LW * 2, '#8a5a35');
  rect(g, -15, -30, 30, 20, '#c98f4a');
  rect(g, -13, -28, 26, 16, '#e8c48a', LW * 0.6);
  for (const [x, y, c, a] of [[-6.5, -24, '#fffdf6', -0.1], [5, -23, '#f6d64a', 0.12], [-1, -16.5, '#cfe8f6', 0.05]]) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    rect(g, -4.5, -3.2, 9, 6.4, c, LW * 0.6);
    for (let i = 0; i < 3; i++) line(g, -3, -1.6 + i * 1.5, 3, -1.6 + i * 1.5, LW * 0.35, 'rgba(58,42,31,0.5)');
    circ(g, 0, -3, 0.8);
    fill(g, '#d9483b');
    g.restore();
  }
}

export const WARE_ART = {
  rainBarrel: { box: [-16, -34, 18, 3], draw: rainBarrel },
  climate: { box: [-16, -30, 16, 2], draw: (g) => climateKeeper(g, 0.4) },
  sprinkler: { box: [-8, -2, 8, 14], draw: sprinklerHead },
  noticeBoard: { box: [-17, -32, 17, 2], draw: noticeBoard },
};
