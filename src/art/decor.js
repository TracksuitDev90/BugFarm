// Decoration art: little picture-book buildings and props. Drawn standing on
// (0,0) with "up" being negative y.
import { INK, TAU, ell, circ, fill, stroke, paint, blob, highlight, line, curve, fuzzPath } from './ink.js';

const LW = 1.0;

function rect(g, x, y, w, h, col, lw = LW) {
  paint(g, col, lw, () => {
    g.beginPath();
    g.rect(x, y, w, h);
  });
}
function archDoor(g, x, y, w, h, col = '#8a5a35', lw = LW) {
  paint(g, col, lw, () => {
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x - w / 2, y - h + w / 2);
    g.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
    g.lineTo(x + w / 2, y);
    g.closePath();
  });
  circ(g, x + w * 0.25, y - h * 0.4, 0.8);
  fill(g, '#f0bf45');
}
function roundWindow(g, x, y, r, lw = LW) {
  paint(g, '#cfe8f6', lw, () => circ(g, x, y, r));
  line(g, x - r, y, x + r, y, lw * 0.6);
  line(g, x, y - r, x, y + r, lw * 0.6);
  highlight(g, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.2, 0.6);
}
function wheel(g, x, y, r, hub = '#f6d64a') {
  paint(g, '#4a4450', LW, () => circ(g, x, y, r));
  paint(g, hub, LW * 0.7, () => circ(g, x, y, r * 0.45));
  circ(g, x, y, r * 0.15);
  fill(g, INK);
}
function text(g, str, x, y, size, col = INK) {
  g.save();
  g.font = `bold ${size}px 'Patrick Hand', 'Comic Sans MS', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(str, x, y);
  g.restore();
}

export const DECOR_ART = {
  library(g) {
    // tree behind
    fuzzPath(g, 14, -50, 16, 18, 16, 0.12, 7);
    fill(g, '#8cc152');
    stroke(g, LW);
    rect(g, -21, -46, 42, 46, '#d9606a');
    // chimney
    rect(g, -15, -64, 7, 14, '#b84a4a');
    rect(g, -16, -66, 9, 3, '#fbf3df');
    // roof
    paint(g, '#b8963a', LW, () => {
      g.beginPath();
      g.moveTo(-25, -44);
      g.quadraticCurveTo(-18, -46, -14, -56);
      g.lineTo(-6, -62);
      g.lineTo(6, -62);
      g.lineTo(14, -56);
      g.quadraticCurveTo(18, -46, 25, -44);
      g.closePath();
    });
    for (let i = -2; i <= 2; i++) line(g, i * 4, -61, i * 7, -45, LW * 0.5, 'rgba(58,42,31,0.5)');
    rect(g, -15, -40, 30, 7, '#f6d3cf', LW * 0.8);
    text(g, 'LIBRARY', 0, -36.4, 5.6);
    archDoor(g, -9, 0, 12, 24, '#f39a9a');
    paint(g, '#f6d3cf', LW, () => {
      g.beginPath();
      g.moveTo(3, -10);
      g.lineTo(3, -22);
      g.arc(9, -22, 6, Math.PI, 0);
      g.lineTo(15, -10);
      g.closePath();
    });
    line(g, 3, -21, 15, -21, LW * 0.6);
    // book in the window
    rect(g, 6, -18, 6, 5, '#7cc0e6', LW * 0.6);
    fuzzPath(g, 16, -2, 6, 3, 10, 0.2, 3);
    fill(g, '#77b255');
    stroke(g, LW * 0.7);
  },
  mushroomHouse(g) {
    paint(g, '#fbf3df', LW, () => {
      g.beginPath();
      g.moveTo(-13, 0);
      g.quadraticCurveTo(-15, -20, -11, -32);
      g.lineTo(11, -32);
      g.quadraticCurveTo(15, -20, 13, 0);
      g.closePath();
    });
    archDoor(g, -2, 0, 10, 17);
    roundWindow(g, 7, -21, 3.4);
    paint(g, '#e2453f', LW, () => {
      g.beginPath();
      g.moveTo(-22, -28);
      g.bezierCurveTo(-24, -62, 24, -62, 22, -28);
      g.quadraticCurveTo(0, -24, -22, -28);
      g.closePath();
    });
    for (const [x, y, r] of [[-12, -40, 3.4], [0, -48, 4], [12, -38, 3], [5, -34, 2], [-5, -32, 2.2]]) {
      paint(g, '#fffaf0', LW * 0.6, () => ell(g, x, y, r, r * 0.8));
    }
    highlight(g, -8, -50, 6, 2, 0.35, -0.3);
  },
  teapot(g) {
    paint(g, '#7cc0e6', LW, () => {
      g.beginPath();
      g.moveTo(16, -22);
      g.quadraticCurveTo(26, -26, 30, -36);
      g.lineTo(33, -34);
      g.quadraticCurveTo(28, -18, 18, -12);
      g.closePath();
    });
    g.beginPath();
    g.arc(-20, -22, 8, Math.PI * 0.5, Math.PI * 1.5);
    stroke(g, 3.2 + LW * 2, INK);
    stroke(g, 3.2, '#7cc0e6');
    blob(g, 0, -20, 21, 20, '#7cc0e6', LW);
    rect(g, -21, -3, 42, 3, '#5aa0cf', LW * 0.8);
    paint(g, '#5aa0cf', LW, () => ell(g, 0, -39, 12, 3.4));
    blob(g, 0, -44, 3.4, 3.4, '#f0bf45', LW);
    // flowers painted on
    for (const [x, y] of [[-12, -26], [12, -14]]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        circ(g, x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8, 1.3);
        fill(g, '#ffffff');
      }
      circ(g, x, y, 0.9);
      fill(g, '#f0bf45');
    }
    archDoor(g, 2, 0, 10, 16, '#f0bf45');
    roundWindow(g, -8, -16, 3.4);
    highlight(g, -8, -32, 6, 2.6, 0.35, -0.4);
  },
  boot(g) {
    paint(g, '#9a6a3f', LW, () => {
      g.beginPath();
      g.moveTo(-18, 0);
      g.lineTo(-18, -46);
      g.lineTo(4, -46);
      g.lineTo(4, -22);
      g.quadraticCurveTo(24, -22, 24, -8);
      g.lineTo(24, 0);
      g.closePath();
    });
    rect(g, -20, -50, 26, 5, '#7a4f2e');
    rect(g, -19, -3, 44, 3, '#5a3a2a', LW * 0.8);
    for (let i = 0; i < 4; i++) {
      line(g, -2, -42 + i * 6, 3, -40 + i * 6, LW * 0.7, '#fbf3df');
      line(g, -2, -40 + i * 6, 3, -42 + i * 6, LW * 0.7, '#fbf3df');
    }
    archDoor(g, 14, -3, 9, 14, '#f0bf45');
    roundWindow(g, -9, -30, 4);
    rect(g, -14, -60, 5, 10, '#b84a4a');
    highlight(g, -12, -40, 2, 6, 0.3, 0);
  },
  appleHouse(g) {
    blob(g, 0, -22, 20, 21, '#e2453f', LW);
    line(g, 0, -42, 2, -50, LW * 2.4, INK);
    line(g, 0, -42, 2, -50, LW * 1.2, '#8a5a35');
    paint(g, '#77b255', LW, () => {
      g.beginPath();
      g.moveTo(2, -48);
      g.quadraticCurveTo(10, -56, 16, -50);
      g.quadraticCurveTo(10, -44, 2, -48);
      g.closePath();
    });
    paint(g, '#cfe8f6', LW, () => ell(g, 6, -26, 7, 8));
    // little worm in the window
    blob(g, 6, -24, 3, 3, '#e89a9a', LW * 0.7);
    circ(g, 7, -25, 0.6);
    fill(g, INK);
    paint(g, '#77b255', LW * 0.6, () => ell(g, 5.6, -27.4, 3.6, 1.2));
    archDoor(g, -8, -1, 9, 15, '#8a5a35');
    highlight(g, -9, -34, 5, 2.6, 0.4, -0.4);
  },
  doughnutShop(g) {
    rect(g, -24, -30, 48, 30, '#f6efe0');
    paint(g, '#f39ac0', LW, () => {
      g.beginPath();
      g.moveTo(-27, -30);
      for (let i = 0; i <= 8; i++) {
        const x = -27 + i * 6.75;
        g.lineTo(x, -30);
        g.quadraticCurveTo(x + 3.4, -24, x + 6.75, -30);
      }
      g.lineTo(27, -34);
      g.lineTo(-27, -34);
      g.closePath();
    });
    // giant doughnut sign
    paint(g, '#d9a35a', LW, () => {
      g.beginPath();
      g.arc(0, -46, 12, 0, TAU);
      g.arc(0, -46, 4.5, 0, TAU, true);
    });
    paint(g, '#f39ac0', LW * 0.7, () => {
      g.beginPath();
      g.arc(0, -46, 10.5, Math.PI * 1.05, Math.PI * 1.95);
      g.arc(0, -46, 6, Math.PI * 1.95, Math.PI * 1.05, true);
      g.closePath();
    });
    const cols = ['#fff', '#7cc0e6', '#f0bf45', '#77b255'];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (1.12 + i * 0.13);
      line(g, Math.cos(a) * 8.2, -46 + Math.sin(a) * 8.2, Math.cos(a) * 8.8, -46 + Math.sin(a) * 8.8 - 0.6, LW * 0.9, cols[i % 4]);
    }
    rect(g, -20, -22, 24, 13, '#cfe8f6');
    text(g, 'DOUGHNUTS', -8, -15.6, 4.4, '#9a3c2e');
    archDoor(g, 13, 0, 11, 20, '#8a5a35');
  },
  log(g) {
    paint(g, '#9a6a3f', LW, () => {
      g.beginPath();
      g.moveTo(-34, -1);
      g.lineTo(-34, -27);
      g.quadraticCurveTo(0, -30, 30, -27);
      g.lineTo(30, -1);
      g.quadraticCurveTo(0, 1, -34, -1);
      g.closePath();
    });
    for (let i = 0; i < 6; i++) curve(g, -28 + i * 10, -24, -26 + i * 10, -14, -29 + i * 10, -4, LW * 0.5, 'rgba(58,42,31,0.5)');
    blob(g, 30, -14, 7, 13.5, '#d9b07a', LW);
    blob(g, 30, -14, 4.6, 9.6, '#3a2a1f', LW * 0.7);
    ell(g, 30, -14, 5.8, 11.6);
    stroke(g, LW * 0.4, 'rgba(58,42,31,0.5)');
    blob(g, -34, -14, 4, 13, '#c9a06a', LW);
    for (const [x, w] of [[-18, 10], [4, 8]]) {
      fuzzPath(g, x, -27, w, 3, 10, 0.25, x);
      fill(g, '#8cc152');
      stroke(g, LW * 0.6);
    }
  },
  flowerpot(g) {
    paint(g, '#d9784a', LW, () => {
      g.beginPath();
      g.moveTo(-20, -2);
      g.lineTo(14, -6);
      g.lineTo(14, -30);
      g.lineTo(-20, -24);
      g.closePath();
    });
    blob(g, 16, -18, 6, 14, '#e8935f', LW);
    blob(g, 16, -18, 3.8, 10.6, '#3a2a1f', LW * 0.7);
    rect(g, -22, -27, 5, 27, '#c96a3a', LW);
    line(g, -10, -24, -10, -4, LW * 0.5, 'rgba(58,42,31,0.4)');
    highlight(g, -4, -22, 8, 1.6, 0.3, -0.1);
  },
  beeHouse(g) {
    line(g, 0, 0, 0, -20, LW * 4, INK);
    line(g, 0, 0, 0, -20, LW * 2.4, '#8a5a35');
    rect(g, -13, -46, 26, 26, '#d9a35a');
    paint(g, '#9a3c2e', LW, () => {
      g.beginPath();
      g.moveTo(-17, -45);
      g.lineTo(0, -56);
      g.lineTo(17, -45);
      g.closePath();
    });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        paint(g, '#f6e0b0', LW * 0.6, () => circ(g, -8.4 + c * 5.6, -40 + r * 7, 2.4));
        circ(g, -8.4 + c * 5.6, -40 + r * 7, 1.1);
        fill(g, '#3a2a1f');
      }
    }
  },
  lampPost(g) {
    rect(g, -4, -3, 8, 3, '#3d3a44');
    line(g, 0, -2, 0, -58, LW * 3.6, INK);
    line(g, 0, -2, 0, -58, LW * 1.8, '#4a4652');
    paint(g, '#4a4652', LW, () => {
      g.beginPath();
      g.moveTo(-6, -58);
      g.lineTo(6, -58);
      g.lineTo(4, -60);
      g.lineTo(-4, -60);
      g.closePath();
    });
    paint(g, '#fff4b0', LW, () => {
      g.beginPath();
      g.moveTo(-5, -60);
      g.lineTo(-6.5, -70);
      g.lineTo(6.5, -70);
      g.lineTo(5, -60);
      g.closePath();
    });
    paint(g, '#4a4652', LW, () => {
      g.beginPath();
      g.moveTo(-8, -70);
      g.lineTo(0, -76);
      g.lineTo(8, -70);
      g.closePath();
    });
  },
  bench(g) {
    for (const x of [-15, 15]) line(g, x, 0, x, -12, LW * 2.4, '#3d3a44');
    rect(g, -20, -13, 40, 3.4, '#b77d4b');
    rect(g, -20, -21, 40, 3.2, '#b77d4b');
    rect(g, -20, -17, 40, 2.6, '#b77d4b');
  },
  fence(g) {
    rect(g, -30, -15, 60, 3, '#fbf3df', LW * 0.8);
    rect(g, -30, -8, 60, 3, '#fbf3df', LW * 0.8);
    for (let i = 0; i < 5; i++) {
      const x = -26 + i * 13;
      paint(g, '#fffaf0', LW, () => {
        g.beginPath();
        g.moveTo(x - 3, 0);
        g.lineTo(x - 3, -18);
        g.lineTo(x, -22);
        g.lineTo(x + 3, -18);
        g.lineTo(x + 3, 0);
        g.closePath();
      });
    }
  },
  sign(g) {
    line(g, 0, 0, 0, -22, LW * 4, INK);
    line(g, 0, 0, 0, -22, LW * 2.2, '#8a5a35');
    paint(g, '#f0bf45', LW, () => {
      g.beginPath();
      g.moveTo(-24, -22);
      g.lineTo(24, -22);
      g.lineTo(24, -40);
      g.lineTo(-24, -40);
      g.closePath();
    });
    text(g, 'BUG FARM', 0, -31, 8.6, '#9a3c2e');
  },
  // bare: leave the flag off, so the tank can raise it when letters come
  mailbox(g, t, bare) {
    line(g, 0, 0, 0, -20, LW * 3.6, INK);
    line(g, 0, 0, 0, -20, LW * 2, '#8a5a35');
    paint(g, '#4c8fd6', LW, () => {
      g.beginPath();
      g.moveTo(-9, -20);
      g.lineTo(-9, -30);
      g.arc(0, -30, 9, Math.PI, 0);
      g.lineTo(9, -20);
      g.closePath();
    });
    if (!bare) DECOR_ART.mailboxFlag(g, true);
  },
  mailboxFlag(g, up) {
    if (up) {
      line(g, 8, -27, 8, -38, LW * 1.2);
      rect(g, 8, -38, 6, 4, '#e2453f', LW * 0.7);
    } else {
      line(g, 8, -27, 14, -27, LW * 1.2);
      rect(g, 13, -28, 4, 6, '#e2453f', LW * 0.7);
    }
  },
  windmill(g) {
    paint(g, '#f6efe0', LW, () => {
      g.beginPath();
      g.moveTo(-14, 0);
      g.lineTo(-9, -52);
      g.lineTo(9, -52);
      g.lineTo(14, 0);
      g.closePath();
    });
    paint(g, '#9a3c2e', LW, () => {
      g.beginPath();
      g.moveTo(-12, -51);
      g.quadraticCurveTo(0, -66, 12, -51);
      g.closePath();
    });
    archDoor(g, 0, 0, 8, 13, '#8a5a35');
    roundWindow(g, 0, -34, 3);
  },
  windmillBlades(g, t) {
    g.save();
    g.translate(0, -52);
    g.rotate(t * 0.8);
    for (let i = 0; i < 4; i++) {
      g.rotate(TAU / 4);
      paint(g, '#fbf3df', LW * 0.8, () => {
        g.beginPath();
        g.rect(2, -3.2, 22, 6.4);
      });
      for (let k = 1; k < 4; k++) line(g, 2 + k * 5.5, -3.2, 2 + k * 5.5, 3.2, LW * 0.4);
    }
    circ(g, 0, 0, 2.2);
    fill(g, '#8a5a35');
    stroke(g, LW);
    g.restore();
  },
  bananaCar(g) {
    wheel(g, -16, -5, 5, '#f6d64a');
    wheel(g, 17, -5, 5, '#f6d64a');
    paint(g, '#f6d64a', LW, () => {
      g.beginPath();
      g.moveTo(-30, -16);
      g.quadraticCurveTo(-26, -6, -10, -6);
      g.lineTo(18, -6);
      g.quadraticCurveTo(30, -8, 30, -22);
      g.lineTo(27, -24);
      g.quadraticCurveTo(24, -14, 10, -15);
      g.quadraticCurveTo(0, -15, -6, -22);
      g.quadraticCurveTo(-14, -22, -26, -18);
      g.closePath();
    });
    paint(g, '#8a6a3a', LW, () => {
      g.beginPath();
      g.rect(-32, -19, 4, 4);
    });
    paint(g, '#c9a46a', LW * 0.8, () => ell(g, 2, -16, 7, 2.6));
    circ(g, 23, -12, 1.8);
    fill(g, '#fff');
    stroke(g, LW * 0.6);
    curve(g, -24, -12, 0, -9, 26, -14, LW * 0.5, 'rgba(58,42,31,0.4)');
  },
  pickleCar(g) {
    wheel(g, -14, -5, 5.2, '#e8e2d6');
    wheel(g, 15, -5, 5.2, '#e8e2d6');
    paint(g, '#77b255', LW, () => {
      g.beginPath();
      g.moveTo(-26, -14);
      g.bezierCurveTo(-28, -28, 24, -30, 27, -16);
      g.bezierCurveTo(28, -8, 20, -6, 0, -6);
      g.bezierCurveTo(-20, -6, -26, -8, -26, -14);
      g.closePath();
    });
    for (let i = 0; i < 12; i++) {
      circ(g, -20 + i * 3.6, -14 - Math.sin(i * 1.7) * 4, 0.9);
      fill(g, '#9ccf6a');
      stroke(g, LW * 0.4);
    }
    paint(g, '#f39a9a', LW, () => ell(g, 0, -23, 6, 3));
    circ(g, -28, -13, 1.4);
    fill(g, '#5a7a3a');
    stroke(g, LW * 0.6);
  },
  castle(g) {
    const sand = '#e8cfa0';
    const tower = (x, w, h) => {
      rect(g, x - w / 2, -h, w, h, sand);
      for (let i = 0; i < 3; i++) rect(g, x - w / 2 + i * (w / 2.5), -h - 4, w / 5, 4, sand, LW * 0.8);
    };
    tower(-20, 16, 56);
    tower(20, 16, 50);
    rect(g, -14, -40, 28, 40, sand);
    for (let i = 0; i < 4; i++) rect(g, -14 + i * 7.5, -44, 4, 4, sand, LW * 0.8);
    tower(0, 14, 66);
    archDoor(g, 0, 0, 12, 18, '#5a3a2a');
    for (const [x, y] of [[-20, -40], [20, -34], [0, -50]]) {
      paint(g, '#3a2a1f', LW * 0.7, () => {
        g.beginPath();
        g.rect(x - 2, y - 4, 4, 7);
      });
    }
    line(g, 0, -70, 0, -84, LW * 0.9);
    paint(g, '#e2453f', LW * 0.7, () => {
      g.beginPath();
      g.moveTo(0, -84);
      g.lineTo(10, -80.5);
      g.lineTo(0, -77);
      g.closePath();
    });
    for (let i = 0; i < 14; i++) {
      circ(g, -26 + ((i * 37) % 52), -4 - ((i * 23) % 50), 0.6);
      fill(g, 'rgba(160,120,70,0.5)');
    }
  },
  chest(g, t = 0) {
    const open = Math.max(0, Math.sin(t * 0.6)) * 0.5;
    rect(g, -17, -18, 34, 18, '#a8743f');
    rect(g, -17, -10, 34, 3, '#f0bf45', LW * 0.7);
    g.save();
    g.translate(-17, -18);
    g.rotate(-open);
    paint(g, '#b8844f', LW, () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -6);
      g.quadraticCurveTo(17, -14, 34, -6);
      g.lineTo(34, 0);
      g.closePath();
    });
    g.restore();
    if (open > 0.05) {
      for (const [x, c] of [[-8, '#f6d64a'], [-2, '#f0bf45'], [5, '#f6d64a']]) {
        circ(g, x, -19, 2.4);
        fill(g, c);
        stroke(g, LW * 0.6);
      }
    }
    rect(g, -3, -14, 6, 6, '#f0bf45', LW * 0.7);
  },
  diver(g) {
    blob(g, 0, -18, 16, 17, '#d9a35a', LW);
    rect(g, -15, -5, 30, 5, '#a8743f');
    paint(g, '#7a9ab8', LW, () => circ(g, 2, -19, 8));
    paint(g, '#3a4a5a', LW * 0.5, () => circ(g, 2, -19, 6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      circ(g, 2 + Math.cos(a) * 7, -19 + Math.sin(a) * 7, 0.7);
      fill(g, '#f0bf45');
    }
    highlight(g, -6, -28, 5, 2, 0.4, -0.4);
  },
  shell(g) {
    paint(g, '#f7d6c8', LW, () => {
      g.beginPath();
      g.moveTo(-16, -2);
      g.quadraticCurveTo(-18, -22, 0, -24);
      g.quadraticCurveTo(18, -22, 16, -2);
      g.closePath();
    });
    for (let i = -3; i <= 3; i++) line(g, 0, -1, i * 5, -22 + Math.abs(i) * 1.6, LW * 0.6, 'rgba(180,100,90,0.6)');
    rect(g, -5, -4, 10, 4, '#f2c2b0');
  },
  bubbler(g) {
    blob(g, 0, -3.4, 8, 3.6, '#9aa0a6', LW);
    for (let i = 0; i < 5; i++) {
      circ(g, -5 + i * 2.5, -4 + (i % 2), 0.6);
      fill(g, '#6a7076');
    }
    line(g, 7, -4, 12, -12, LW * 1.4, 'rgba(255,255,255,0.7)');
  },
  feeder(g) {
    // hangs from the lid: drawn downward from 0
    line(g, 0, -2, 0, 6, LW * 1.2);
    paint(g, '#f6efe0', LW, () => {
      g.beginPath();
      g.rect(-12, 6, 24, 16);
    });
    paint(g, '#e2453f', LW, () => {
      g.beginPath();
      g.moveTo(-14, 6);
      g.lineTo(14, 6);
      g.lineTo(12, 2);
      g.lineTo(-12, 2);
      g.closePath();
    });
    paint(g, '#cfe8f6', LW * 0.7, () => {
      g.beginPath();
      g.rect(-8, 9, 16, 9);
    });
    for (let i = 0; i < 6; i++) {
      circ(g, -5 + i * 2, 15 - (i % 2) * 2, 1);
      fill(g, ['#e8603c', '#f6d64a', '#77b255'][i % 3]);
    }
    paint(g, '#c9c2b0', LW, () => {
      g.beginPath();
      g.moveTo(-6, 22);
      g.lineTo(6, 22);
      g.lineTo(2, 30);
      g.lineTo(-2, 30);
      g.closePath();
    });
    text(g, 'zZ', 9, 13, 4, '#4c8fd6');
  },
  // rocks are stamped into terrain; this is only for the menu icon
  boulder(g) {
    blob(g, 0, -11, 20, 12, '#a7a39a', LW);
    highlight(g, -6, -17, 6, 2.4, 0.4);
  },
  pebble(g) {
    blob(g, 0, -5, 9, 5.4, '#b9b3a6', LW);
    highlight(g, -3, -7, 3, 1.2, 0.4);
  },
  flatRock(g) {
    blob(g, 0, -7, 26, 8, '#a7a39a', LW);
    highlight(g, -8, -11, 9, 2, 0.4);
  },
};

// Bounds (relative to base point) for sprite sizing: [x0, y0, x1, y1]
// Busytown's thank-you gifts.
DECOR_ART.farmStand = function farmStand(g) {
  // posts
  for (const x of [-22, 22]) {
    line(g, x, 0, x, -44, LW * 3.4, INK);
    line(g, x, 0, x, -44, LW * 1.8, '#9a6a3f');
  }
  // the counter, with a sign
  rect(g, -25, -17, 50, 17, '#c98f4a');
  for (const y of [-11, -5]) line(g, -25, y, 25, y, LW * 0.5, 'rgba(58,42,31,0.45)');
  rect(g, -14, -14, 28, 8, '#fbf3df', LW * 0.8);
  text(g, 'BUG FARM', 0, -9.8, 5.2, '#9a3c2e');
  // goods on the counter: honey, a basket of seed heads, a lily in a jug
  paint(g, '#f0a830', LW * 0.8, () => {
    g.beginPath();
    g.rect(-21, -25, 7, 8);
  });
  paint(g, '#d9483b', LW * 0.7, () => {
    g.beginPath();
    g.rect(-22, -27, 9, 2.5);
  });
  paint(g, '#b8864a', LW * 0.8, () => {
    g.beginPath();
    g.moveTo(-9, -22);
    g.lineTo(5, -22);
    g.lineTo(3, -17);
    g.lineTo(-7, -17);
    g.closePath();
  });
  for (const x of [-6, -2, 2]) {
    circ(g, x, -23, 2);
    fill(g, '#7a4f2e');
    stroke(g, LW * 0.5);
  }
  paint(g, '#cfe8f6', LW * 0.8, () => {
    g.beginPath();
    g.rect(11, -24, 7, 7);
  });
  line(g, 14.5, -24, 14.5, -29, LW * 0.8, '#5f9e45');
  for (const a of [-0.7, 0, 0.7]) paint(g, '#f4b3cc', LW * 0.5, () => ell(g, 14.5 + Math.sin(a) * 2.4, -31 + Math.abs(a) * 1.4, 1.4, 2.8, a));
  // striped awning with a scalloped edge
  paint(g, '#fbf3df', LW, () => {
    g.beginPath();
    g.moveTo(-28, -38);
    g.lineTo(-24, -50);
    g.lineTo(24, -50);
    g.lineTo(28, -38);
    g.closePath();
  });
  for (let i = 0; i < 4; i++) {
    const x0 = -24 + i * 12;
    paint(g, '#d9483b', 0, () => {
      g.beginPath();
      g.moveTo(x0, -50);
      g.lineTo(x0 + 6, -50);
      g.lineTo(x0 + 7.5, -38);
      g.lineTo(x0 + 1.5, -38);
      g.closePath();
    });
  }
  g.beginPath();
  g.moveTo(-28, -38);
  for (let i = 0; i < 8; i++) g.quadraticCurveTo(-28 + i * 7 + 3.5, -33.5, -28 + (i + 1) * 7, -38);
  g.lineTo(28, -38);
  fill(g, '#d9483b');
  stroke(g, LW);
  g.beginPath();
  g.moveTo(-28, -38);
  g.lineTo(-24, -50);
  g.lineTo(24, -50);
  g.lineTo(28, -38);
  stroke(g, LW);
};

DECOR_ART.deliveryVan = function deliveryVan(g) {
  // parcels on the roof rack
  paint(g, '#c98f4a', LW * 0.8, () => {
    g.beginPath();
    g.rect(-20, -40, 12, 8);
  });
  paint(g, '#e8c48a', LW * 0.8, () => {
    g.beginPath();
    g.rect(-7, -38, 9, 6);
  });
  line(g, -14, -40, -14, -32, LW * 0.6, '#9a3c2e');
  line(g, -20, -36, -8, -36, LW * 0.6, '#9a3c2e');
  line(g, -22, -31.5, 6, -31.5, LW * 1.2, '#5e5a62');
  // body
  paint(g, '#f0bf45', LW, () => {
    g.beginPath();
    g.moveTo(-28, -8);
    g.lineTo(-28, -27);
    g.quadraticCurveTo(-28, -31, -24, -31);
    g.lineTo(10, -31);
    g.quadraticCurveTo(15, -31, 18, -24);
    g.lineTo(22, -17);
    g.quadraticCurveTo(28, -16, 28, -10);
    g.lineTo(28, -8);
    g.closePath();
  });
  // windscreen and a round porthole window
  paint(g, '#cfe8f6', LW * 0.8, () => {
    g.beginPath();
    g.moveTo(11, -28);
    g.quadraticCurveTo(14, -28, 16, -23);
    g.lineTo(19, -17);
    g.lineTo(11, -17);
    g.closePath();
  });
  highlight(g, 13, -23, 1, 3, 0.6, 0.3);
  // the farm's name and a ladybug on the side
  text(g, 'BUG FARM', -8, -23, 6.4, '#9a3c2e');
  text(g, 'deliveries', -8, -16.5, 4.6, INK);
  blob(g, 4, -13.5, 3, 2.4, '#d9483b', LW * 0.7);
  line(g, 4, -15.9, 4, -11.1, LW * 0.5);
  for (const [x, y] of [[2.6, -14.4], [5.4, -12.6]]) {
    circ(g, x, y, 0.55);
    fill(g, INK);
  }
  // bumper, light and wheels
  paint(g, '#e8e2d6', LW * 0.8, () => {
    g.beginPath();
    g.rect(24, -11, 5, 3);
  });
  circ(g, 26.5, -14.5, 1.3);
  fill(g, '#fff6c0');
  stroke(g, LW * 0.5);
  wheel(g, -17, -6, 6, '#e8e2d6');
  wheel(g, 16, -6, 6, '#e8e2d6');
};

export function decorBox(def) {
  if (def.place === 'top') return [-def.w / 2 - 6, -6, def.w / 2 + 6, def.h + 6];
  return [-def.w / 2 - 10, -def.h - 22, def.w / 2 + 10, 6];
}

export { text };
