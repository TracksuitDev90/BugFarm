// Little hand-inked icons for emotes and the UI. Drawn in a 24x24 box
// centred on (0,0).
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, line, curve } from './ink.js';

const LW = 1.6;

export const ICONS = {
  heart(g) {
    paint(g, '#e8475a', LW, () => {
      g.beginPath();
      g.moveTo(0, 7);
      g.bezierCurveTo(-10, 0, -8, -9, -2.5, -7);
      g.bezierCurveTo(-1, -6.4, 0, -5, 0, -4);
      g.bezierCurveTo(0, -5, 1, -6.4, 2.5, -7);
      g.bezierCurveTo(8, -9, 10, 0, 0, 7);
      g.closePath();
    });
    highlight(g, -3.5, -3.8, 2, 1, 0.6);
  },
  food(g) {
    blob(g, 0, 1.5, 7.5, 7, '#e2453f', LW);
    line(g, 0, -5, 1, -9, LW, INK);
    paint(g, '#77b255', LW * 0.8, () => {
      g.beginPath();
      g.moveTo(1, -7.5);
      g.quadraticCurveTo(6, -11, 8, -7);
      g.quadraticCurveTo(4, -5, 1, -7.5);
      g.closePath();
    });
    highlight(g, -3, -1.5, 2, 1.2, 0.6);
  },
  zzz(g) {
    g.font = "bold 13px 'Patrick Hand', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#4c8fd6';
    g.fillText('z', -4, 3);
    g.font = "bold 10px 'Patrick Hand', sans-serif";
    g.fillText('z', 3, -2);
    g.font = "bold 8px 'Patrick Hand', sans-serif";
    g.fillText('z', 8, -7);
  },
  hot(g) {
    blob(g, -1, 0, 6.5, 6.5, '#f0bf45', LW);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      line(g, -1 + Math.cos(a) * 8.5, Math.sin(a) * 8.5, -1 + Math.cos(a) * 10.5, Math.sin(a) * 10.5, LW * 0.8, '#e8803a');
    }
    paint(g, '#8fc8ea', LW * 0.7, () => {
      g.beginPath();
      g.moveTo(7, -3);
      g.quadraticCurveTo(10, 2, 7, 3.5);
      g.quadraticCurveTo(4, 2, 7, -3);
      g.closePath();
    });
  },
  cold(g) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      line(g, Math.cos(a) * -8, Math.sin(a) * -8, Math.cos(a) * 8, Math.sin(a) * 8, LW * 1.6, INK);
      line(g, Math.cos(a) * -8, Math.sin(a) * -8, Math.cos(a) * 8, Math.sin(a) * 8, LW * 0.7, '#9fd0ef');
    }
    circ(g, 0, 0, 2);
    fill(g, '#fff');
    stroke(g, LW * 0.6);
  },
  drop(g) {
    paint(g, '#7cc0e6', LW, () => {
      g.beginPath();
      g.moveTo(0, -9);
      g.quadraticCurveTo(8, 2, 0, 8);
      g.quadraticCurveTo(-8, 2, 0, -9);
      g.closePath();
    });
    highlight(g, -2, 1, 1.4, 2.4, 0.6, 0);
  },
  '!'(g) {
    g.font = "bold 20px 'Chewy', 'Patrick Hand', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.strokeText('!', 0, 1);
    g.fillStyle = '#e2453f';
    g.fillText('!', 0, 1);
  },
  '?'(g) {
    g.font = "bold 18px 'Chewy', 'Patrick Hand', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.strokeText('?', 0, 1);
    g.fillStyle = '#4c8fd6';
    g.fillText('?', 0, 1);
  },
  note(g) {
    blob(g, -4, 5, 3, 2.3, INK, 0, -0.4);
    blob(g, 5, 3, 3, 2.3, INK, 0, -0.4);
    line(g, -1.4, 4.4, -1.4, -7, LW);
    line(g, 7.6, 2.4, 7.6, -9, LW);
    line(g, -1.4, -7, 7.6, -9, LW * 1.8);
  },
  sun(g) {
    blob(g, 0, 0, 6, 6, '#f6d64a', LW);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      line(g, Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * 10.5, Math.sin(a) * 10.5, LW, '#f0a03a');
    }
    curve(g, -2.5, 1.5, 0, 3.5, 2.5, 1.5, LW * 0.7);
  },
  star(g) {
    paint(g, '#f6d64a', LW, () => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU - Math.PI / 2;
        const r = i % 2 ? 4 : 9.5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    });
  },
  leaf(g) {
    paint(g, '#77b255', LW, () => {
      g.beginPath();
      g.moveTo(-8, 7);
      g.bezierCurveTo(-8, -6, 4, -9, 9, -9);
      g.bezierCurveTo(8, 2, 0, 8, -8, 7);
      g.closePath();
    });
    curve(g, -8, 7, 0, -1, 7, -7, LW * 0.6, '#4f8a3c');
  },
  flower(g) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      blob(g, Math.cos(a) * 5, Math.sin(a) * 5, 3.8, 3.8, '#8fc4f0', LW * 0.7);
    }
    blob(g, 0, 0, 3, 3, '#f6d64a', LW * 0.7);
  },
  crown(g) {
    paint(g, '#f3c43c', LW, () => {
      g.beginPath();
      g.moveTo(-9, 6);
      g.lineTo(-10, -5);
      g.lineTo(-4.5, 0);
      g.lineTo(0, -8);
      g.lineTo(4.5, 0);
      g.lineTo(10, -5);
      g.lineTo(9, 6);
      g.closePath();
    });
    circ(g, 0, 2, 1.6);
    fill(g, '#e2453f');
  },
  paw(g) {
    blob(g, 0, 3, 5, 4, '#c98a5a', LW);
    for (const [x, y] of [[-6, -3], [-2, -7], [2.5, -7], [6.5, -3]]) blob(g, x, y, 2.1, 2.4, '#c98a5a', LW * 0.8);
  },
  // ------------------------------------------------------------ UI tools
  hand(g) {
    paint(g, '#f6d3b0', LW, () => {
      g.beginPath();
      g.moveTo(-5, 9);
      g.lineTo(-7, 0);
      g.quadraticCurveTo(-8, -3, -5.5, -2.5);
      g.lineTo(-4, 1);
      g.lineTo(-4, -8);
      g.quadraticCurveTo(-2.5, -10, -1, -8);
      g.lineTo(-1, -2);
      g.lineTo(-1, -9.5);
      g.quadraticCurveTo(0.5, -11.5, 2, -9.5);
      g.lineTo(2, -2);
      g.lineTo(2.2, -8.5);
      g.quadraticCurveTo(3.8, -10.4, 5.2, -8.5);
      g.lineTo(5.2, -1);
      g.lineTo(5.5, -5.5);
      g.quadraticCurveTo(7, -7, 8, -5.5);
      g.lineTo(7.5, 3);
      g.quadraticCurveTo(7, 8, 4, 9);
      g.closePath();
    });
  },
  shovel(g) {
    line(g, -8, -9, 2, 1, LW * 2.6, INK);
    line(g, -8, -9, 2, 1, LW * 1.2, '#b77d4b');
    line(g, -10, -7, -6, -11, LW * 2, INK);
    paint(g, '#9aa0a6', LW, () => {
      g.beginPath();
      g.moveTo(0, -1);
      g.lineTo(4, -3);
      g.quadraticCurveTo(11, 4, 9, 9);
      g.quadraticCurveTo(4, 11, -3, 4);
      g.closePath();
    });
    highlight(g, 4, 2, 2, 1, 0.5, 0.8);
  },
  thermo(g) {
    paint(g, '#fffdf6', LW, () => {
      g.beginPath();
      g.moveTo(-2.6, 3);
      g.lineTo(-2.6, -8);
      g.arc(0, -8, 2.6, Math.PI, 0);
      g.lineTo(2.6, 3);
      g.arc(0, 6, 4.5, -0.95, Math.PI + 0.95);
      g.closePath();
    });
    blob(g, 0, 6, 3.2, 3.2, '#e2453f', 0);
    g.fillStyle = '#e2453f';
    g.fillRect(-1.1, -4, 2.2, 8);
    for (let i = 0; i < 4; i++) line(g, 3.5, -7 + i * 3, 5.5, -7 + i * 3, LW * 0.6);
  },
  book(g) {
    paint(g, '#77b255', LW, () => {
      g.beginPath();
      g.rect(-9, -8, 18, 16);
    });
    paint(g, '#fbf3df', LW * 0.8, () => {
      g.beginPath();
      g.rect(-7, -6, 14, 12);
    });
    line(g, 0, -6, 0, 6, LW * 0.8);
    for (let i = 0; i < 3; i++) {
      line(g, -5.5, -3 + i * 3, -1.8, -3 + i * 3, LW * 0.5, '#a89a80');
      line(g, 1.8, -3 + i * 3, 5.5, -3 + i * 3, LW * 0.5, '#a89a80');
    }
  },
  clip(g) {
    // the keeper's clipboard: a ticked checklist
    paint(g, '#c98f4a', LW, () => {
      g.beginPath();
      g.roundRect ? g.roundRect(-8, -8.5, 16, 19, 2.5) : g.rect(-8, -8.5, 16, 19);
    });
    paint(g, '#fffdf6', LW * 0.7, () => {
      g.beginPath();
      g.rect(-6, -5.5, 12, 14);
    });
    paint(g, '#9aa0a6', LW * 0.8, () => {
      g.beginPath();
      g.rect(-3.5, -10, 7, 4);
    });
    for (let i = 0; i < 3; i++) {
      const y = -2.5 + i * 3.8;
      if (i < 2) {
        g.beginPath();
        g.moveTo(-4.6, y);
        g.lineTo(-3.4, y + 1.2);
        g.lineTo(-1.6, y - 1.2);
        stroke(g, LW * 0.75, '#4f8a3c');
      } else {
        circ(g, -3.4, y, 1);
        stroke(g, LW * 0.5);
      }
      line(g, 0, y, 4, y, LW * 0.55, '#a89a80');
    }
  },
  gear(g) {
    paint(g, '#c9c2b0', LW, () => {
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const r = i % 2 ? 7 : 9.5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    });
    circ(g, 0, 0, 3);
    fill(g, '#fbf3df');
    stroke(g, LW);
  },
  sprout(g) {
    paint(g, '#9a6a3f', LW, () => {
      g.beginPath();
      g.moveTo(-8, 9);
      g.lineTo(8, 9);
      g.lineTo(6, 3);
      g.lineTo(-6, 3);
      g.closePath();
    });
    line(g, 0, 3, 0, -4, LW * 2, INK);
    line(g, 0, 3, 0, -4, LW, '#4f8a3c');
    blob(g, -4, -6, 4.5, 2.4, '#77b255', LW, -0.4);
    blob(g, 4, -7, 4.5, 2.4, '#8cc152', LW, 0.4);
  },
  house(g) {
    paint(g, '#e2453f', LW, () => {
      g.beginPath();
      g.moveTo(-10, -1);
      g.lineTo(0, -10);
      g.lineTo(10, -1);
      g.closePath();
    });
    paint(g, '#fbf3df', LW, () => {
      g.beginPath();
      g.rect(-7, -1, 14, 10);
    });
    paint(g, '#8a5a35', LW * 0.8, () => {
      g.beginPath();
      g.rect(-2, 3, 4, 6);
    });
  },
  bug(g) {
    paint(g, '#d9433a', LW, () => {
      g.beginPath();
      g.arc(1, 1, 8, Math.PI, 0);
      g.closePath();
    });
    for (const [x, y] of [[-3, -3], [3, -4], [5, -0.5], [-5, -0.5]]) {
      circ(g, x, y, 1.5);
      fill(g, INK);
    }
    blob(g, -8, 1.4, 3.2, 3, '#2d2a2a', LW);
    circ(g, -9, 0.6, 0.8);
    fill(g, '#fff');
    line(g, -3, 1, -4, 5, LW * 0.8);
    line(g, 2, 1, 2, 5, LW * 0.8);
    line(g, 6, 1, 7, 5, LW * 0.8);
  },
  lens(g) {
    line(g, 4, 4, 9, 9, LW * 3, INK);
    line(g, 4, 4, 9, 9, LW * 1.4, '#b77d4b');
    paint(g, 'rgba(180,225,245,0.8)', LW, () => circ(g, -2, -2, 7));
    highlight(g, -4, -4, 2.2, 1.2, 0.8);
  },
  play(g) {
    paint(g, '#77b255', LW, () => {
      g.beginPath();
      g.moveTo(-5, -8);
      g.lineTo(8, 0);
      g.lineTo(-5, 8);
      g.closePath();
    });
  },
  pause(g) {
    paint(g, '#f0bf45', LW, () => {
      g.beginPath();
      g.rect(-7, -8, 5, 16);
      g.rect(2, -8, 5, 16);
    });
  },
  fast(g) {
    for (const x of [-7, 1]) {
      paint(g, '#4c8fd6', LW, () => {
        g.beginPath();
        g.moveTo(x, -7);
        g.lineTo(x + 8, 0);
        g.lineTo(x, 7);
        g.closePath();
      });
    }
  },
  tap(g) {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(-2, -2, 3 + i * 3.4, -0.9, 0.9);
      stroke(g, LW * 0.8, '#4c8fd6');
    }
    blob(g, -4, 2, 3, 6, '#f6d3b0', LW, 0.5);
  },
  lock(g) {
    g.beginPath();
    g.arc(0, -3, 5, Math.PI, 0);
    stroke(g, LW * 2.2, INK);
    stroke(g, LW * 0.9, '#c9c2b0');
    paint(g, '#f0bf45', LW, () => {
      g.beginPath();
      g.rect(-7.5, -3, 15, 11);
    });
    circ(g, 0, 1.5, 1.6);
    fill(g, INK);
    line(g, 0, 2, 0, 5, LW);
  },
  moon(g) {
    paint(g, '#fff0a8', LW, () => {
      g.beginPath();
      g.arc(0, 0, 9, 0.6, Math.PI * 2 - 0.6);
      g.quadraticCurveTo(0, 0, Math.cos(0.6) * 9, Math.sin(0.6) * 9);
      g.closePath();
    });
  },
  camera(g) {
    paint(g, '#7cc0e6', LW, () => {
      g.beginPath();
      g.rect(-10, -6, 20, 14);
    });
    paint(g, '#fbf3df', LW, () => circ(g, 0, 1, 4.5));
    paint(g, '#4a4652', LW, () => {
      g.beginPath();
      g.rect(-4, -9, 8, 3);
    });
  },
};

export function drawIcon(g, name, size = 24) {
  const f = ICONS[name];
  if (!f) return;
  g.save();
  g.scale(size / 24, size / 24);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  f(g);
  g.restore();
}

// Make a crisp icon canvas for the DOM.
export function iconCanvas(name, cssSize = 28, dpr = Math.min(3, window.devicePixelRatio || 1)) {
  const c = document.createElement('canvas');
  c.width = Math.round(cssSize * dpr);
  c.height = Math.round(cssSize * dpr);
  c.style.width = cssSize + 'px';
  c.style.height = cssSize + 'px';
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  drawIcon(g, name, cssSize * dpr * 0.9);
  return c;
}
