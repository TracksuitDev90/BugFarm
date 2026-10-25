// Painted back walls for the tank (the "aquarium poster" behind the glass),
// done in a soft picture-book style. Rendered once into a cached canvas.
import { W, H, ZONE_X } from '../config.js';
import { ell, circ, fill, stroke, paint, smoothPath, INK } from './ink.js';
import { RNG, fbm1 } from '../util/rng.js';
import { blooms, poolEdge } from './paper.js';

export const BACKDROPS = {
  meadow: { name: 'Sunny meadow' },
  town: { name: 'Busy little town' },
  desert: { name: 'Desert sunset' },
  seaside: { name: 'Seaside' },
  night: { name: 'Starry night' },
  paper: { name: 'Plain paper' },
};

function cloud(g, x, y, s) {
  paint(g, '#ffffff', 1.4, () => {
    g.beginPath();
    g.moveTo(x - 30 * s, y + 8 * s);
    g.bezierCurveTo(x - 42 * s, y + 6 * s, x - 38 * s, y - 12 * s, x - 22 * s, y - 8 * s);
    g.bezierCurveTo(x - 20 * s, y - 26 * s, x + 4 * s, y - 28 * s, x + 8 * s, y - 12 * s);
    g.bezierCurveTo(x + 18 * s, y - 22 * s, x + 38 * s, y - 14 * s, x + 32 * s, y + 2 * s);
    g.bezierCurveTo(x + 44 * s, y + 6 * s, x + 36 * s, y + 14 * s, x + 26 * s, y + 10 * s);
    g.closePath();
  });
}

function hills(g, baseY, amp, color, seed, freq = 0.004) {
  const top = new Path2D();
  const area = new Path2D();
  area.moveTo(-10, H);
  for (let x = -10; x <= W + 10; x += 10) {
    const y = baseY - fbm1(x * freq, seed) * amp;
    area.lineTo(x, y);
    if (x === -10) top.moveTo(x, y);
    else top.lineTo(x, y);
  }
  area.lineTo(W + 10, H);
  area.closePath();
  g.fillStyle = color;
  g.fill(area);
  // a watercolour wash darkens where it dries, along its top edge
  g.save();
  g.clip(area);
  poolEdge(g, top, 'rgba(46,60,24,0.16)', 16);
  g.restore();
  g.lineWidth = 1.3;
  g.strokeStyle = 'rgba(58,42,31,0.55)';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke(top);
}

function lollipopTree(g, x, y, s, col) {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - 18 * s);
  stroke(g, 3 * s, '#8a5a35');
  stroke(g, 0.8, 'rgba(58,42,31,0.6)');
  paint(g, col, 1.2, () => ell(g, x, y - 26 * s, 11 * s, 13 * s));
}

function house(g, x, y, w, h, wall, roof) {
  paint(g, wall, 1.3, () => {
    g.beginPath();
    g.rect(x, y - h, w, h);
  });
  paint(g, roof, 1.3, () => {
    g.beginPath();
    g.moveTo(x - 4, y - h);
    g.lineTo(x + w / 2, y - h - w * 0.55);
    g.lineTo(x + w + 4, y - h);
    g.closePath();
  });
  // windows & door
  const ww = Math.max(4, w * 0.18);
  paint(g, '#fff4c2', 0.9, () => g.rect(x + w * 0.15, y - h * 0.75, ww, ww));
  paint(g, '#fff4c2', 0.9, () => g.rect(x + w * 0.85 - ww, y - h * 0.75, ww, ww));
  paint(g, '#8a5a35', 0.9, () => {
    g.beginPath();
    g.rect(x + w / 2 - ww * 0.55, y - h * 0.42, ww * 1.1, h * 0.42);
  });
}

// The rainforest painted behind the jungle side of the tank: a wall of far
// canopy, tall buttressed trunks, hanging lianas, big understory leaves and
// a low mist. It fades out toward the pond so each backdrop still shows.
const FOREST_TONES = {
  night: { far: '#2d4a52', mid: '#2f5646', near: '#2a4a3a', trunk: '#4d4a52', vine: '#2c4434', mist: 'rgba(160,180,220,0.18)', light: 'rgba(200,220,255,0.05)' },
  desert: { far: '#a8b47e', mid: '#7f9c5c', near: '#668a48', trunk: '#9a7a5c', vine: '#557a3a', mist: 'rgba(255,236,210,0.3)', light: 'rgba(255,240,200,0.1)' },
  seaside: { far: '#8fbca0', mid: '#5f9e66', near: '#4c8a4c', trunk: '#9a8a72', vine: '#4a7a3c', mist: 'rgba(240,250,250,0.32)', light: 'rgba(255,255,240,0.1)' },
  default: { far: '#8cb98c', mid: '#5f9e5a', near: '#4a8644', trunk: '#9c8466', vine: '#4a7a36', mist: 'rgba(245,250,240,0.34)', light: 'rgba(255,252,220,0.12)' },
};

function rainforest(scale, kind) {
  const T = FOREST_TONES[kind] || FOREST_TONES.default;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * scale);
  c.height = Math.ceil(H * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.translate(0, -80);
  const rng = new RNG(4242);
  // (it starts where the jungle does, and a bigger jungle gets more forest)
  const jo = ZONE_X.jungle[0] - 1060;
  const x0 = 930 + jo;
  // 1) far canopy: a soft wall of treetops
  const bumps = (y, amp, step, color, ink) => {
    g.beginPath();
    g.moveTo(x0, H + 100);
    let x = x0;
    g.lineTo(x, y);
    while (x < W + 40) {
      const nx = x + step * rng.range(0.7, 1.3);
      const ny = y + rng.range(-amp, amp);
      g.quadraticCurveTo((x + nx) / 2, ny - step * 0.7, nx, ny);
      x = nx;
    }
    g.lineTo(W + 40, H + 100);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.save();
    g.clip();
    g.lineWidth = 14;
    g.strokeStyle = 'rgba(30,50,26,0.14)';
    g.stroke();
    g.restore();
    if (ink) stroke(g, 1.2, ink);
  };
  bumps(150, 26, 48, T.far, 'rgba(58,42,31,0.3)');
  // 2) tall trunks with buttress roots
  const trunk = (x, w, top, col) => {
    paint(g, col, 1.2, () => {
      g.beginPath();
      g.moveTo(x - w * 1.9, 470);
      g.quadraticCurveTo(x - w * 0.6, 455, x - w * 0.5, 400);
      g.lineTo(x - w * 0.4, top);
      g.lineTo(x + w * 0.4, top);
      g.lineTo(x + w * 0.5, 400);
      g.quadraticCurveTo(x + w * 0.6, 455, x + w * 1.9, 470);
      g.closePath();
    });
    for (let y = top + 30; y < 440; y += rng.range(22, 40)) {
      g.beginPath();
      g.moveTo(x - w * 0.3, y);
      g.quadraticCurveTo(x, y + 4, x + w * 0.3, y - 2);
      stroke(g, 0.8, 'rgba(58,42,31,0.3)');
    }
  };
  const trunks = [[1020, 16], [1180, 22], [1395, 26], [1560, 18]].map(([x, w]) => [x + jo, w]);
  for (let x = 1560 + jo + 170; x < W + 20; x += rng.range(150, 210)) trunks.push([x, rng.range(15, 26)]);
  for (const [x, w] of trunks) trunk(x, w, 120, T.trunk);
  // 3) mid canopy clumps over the trunk tops
  const clump = (cx, cy, r, col) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      paint(g, col, 1.1, () => ell(g, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.35, r * 0.6, r * 0.42));
    }
    paint(g, col, 1.1, () => ell(g, cx, cy, r * 0.75, r * 0.5));
  };
  const clumps = [[990, 140, 60], [1110, 120, 70], [1260, 110, 80], [1420, 115, 76], [1560, 130, 70], [1640, 160, 60]].map(([x, y, r]) => [x + jo, y, r]);
  for (let x = 1640 + jo + 140; x < W + 60; x += rng.range(120, 160)) clumps.push([x, rng.range(110, 150), rng.range(60, 80)]);
  for (const [x, y, r] of clumps) clump(x, y, r, T.mid);
  // 4) lianas looping down from the canopy
  for (let i = 0; i < Math.round((W - 990 - jo) / 68); i++) {
    const x = rng.range(990 + jo, W);
    const len = rng.range(140, 300);
    const sway = rng.range(-30, 30);
    g.beginPath();
    g.moveTo(x, 150);
    g.bezierCurveTo(x + sway, 150 + len * 0.4, x - sway, 150 + len * 0.7, x + sway * 0.3, 150 + len);
    stroke(g, 2.2, T.vine);
    stroke(g, 0.6, 'rgba(58,42,31,0.45)');
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const lx = x + sway * (3 * t * (1 - t) * (1 - t) - 3 * t * t * (1 - t)) + sway * 0.3 * t * t * t;
      const ly = 150 + len * t;
      paint(g, T.near, 0.7, () => ell(g, lx + (k % 2 ? 4 : -4), ly, 4, 2.2, k % 2 ? 0.5 : -0.5));
    }
  }
  // 5) understory: big fan leaves, palms and ferns along the ground
  const fanLeaf = (x, y, len, a, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    paint(g, col, 1, () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(len * 0.3, -len * 0.32, len * 0.8, -len * 0.3, len, 0);
      g.bezierCurveTo(len * 0.8, len * 0.22, len * 0.3, len * 0.22, 0, 0);
      g.closePath();
    });
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len * 0.95, 0);
    stroke(g, 0.7, 'rgba(58,42,31,0.4)');
    g.restore();
  };
  for (let i = 0; i < Math.round((W - 980 - jo) / 39); i++) {
    const x = rng.range(980 + jo, W + 10);
    const n = rng.int(3, 6);
    for (let k = 0; k < n; k++) fanLeaf(x, 470, rng.range(40, 80), -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2, rng.chance(0.5) ? T.near : T.mid);
  }
  // 6) low mist hanging over the forest floor
  const mist = g.createLinearGradient(0, 360, 0, 470);
  mist.addColorStop(0, 'rgba(255,255,255,0)');
  mist.addColorStop(1, T.mist);
  g.fillStyle = mist;
  g.fillRect(x0, 360, W - x0 + 40, 120);
  // fade in from the pond side
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient((980 + jo) * scale, 0, (1120 + jo) * scale, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function paintBackdrop(kind, scale) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * scale);
  c.height = Math.ceil(H * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const rng = new RNG(1234);

  // a sky laid in with a wet brush: an uneven wash, never a perfect fade
  const sky = (top, bottom, deep = 'rgba(70,130,190,0.08)') => {
    const gr = g.createLinearGradient(0, 0, 0, 520);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H + 80);
    blooms(g, 0, 0, W, 520, 150, 60, 140, 'rgba(255,255,250,0.28)', deep, 5);
  };

  // paint a little higher than the tank middle so the horizon sits just
  // above the ground line
  g.fillStyle = '#e9e2c8';
  g.fillRect(0, 0, W, H);
  g.translate(0, -80);
  switch (kind) {
    case 'town': {
      sky('#bfe2f2', '#f6efd9');
      cloud(g, 260, 120, 1.2);
      cloud(g, 980, 90, 0.9);
      cloud(g, 1380, 160, 1.1);
      hills(g, 430, 60, '#b9d98f', 3);
      const cols = ['#e2553f', '#f0bf45', '#7cc0e6', '#f39a9a', '#77b255', '#f6efe0'];
      const roofs = ['#9a3c2e', '#4c6fa8', '#b8662e', '#6a4a8a'];
      let x = 20;
      while (x < W - 40) {
        const w = rng.range(46, 74);
        const h = rng.range(40, 78);
        house(g, x, 470, w, h, rng.pick(cols), rng.pick(roofs));
        if (rng.chance(0.4)) lollipopTree(g, x + w + 10, 470, rng.range(0.8, 1.1), rng.pick(['#77b255', '#8cc152', '#5f9e45']));
        x += w + rng.range(22, 40);
      }
      // clock tower
      paint(g, '#f6efe0', 1.4, () => g.rect(770, 300, 56, 170));
      paint(g, '#9a3c2e', 1.4, () => {
        g.beginPath();
        g.moveTo(762, 300);
        g.lineTo(798, 248);
        g.lineTo(834, 300);
        g.closePath();
      });
      paint(g, '#ffffff', 1.4, () => circ(g, 798, 330, 16));
      g.beginPath();
      g.moveTo(798, 330);
      g.lineTo(798, 320);
      g.moveTo(798, 330);
      g.lineTo(806, 334);
      stroke(g, 1.5);
      break;
    }
    case 'desert': {
      const gr = g.createLinearGradient(0, 0, 0, 520);
      gr.addColorStop(0, '#f6a37a');
      gr.addColorStop(0.55, '#f8d39a');
      gr.addColorStop(1, '#fbe9c4');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      blooms(g, 0, 0, W, 520, 150, 60, 140, 'rgba(255,250,235,0.26)', 'rgba(200,90,60,0.08)', 6);
      paint(g, '#fff0a8', 1.4, () => circ(g, 1180, 250, 70));
      // mesas
      const mesa = (x, w, h, col) => {
        paint(g, col, 1.4, () => {
          g.beginPath();
          g.moveTo(x, 480);
          g.lineTo(x + 18, 480 - h);
          g.lineTo(x + w - 18, 480 - h);
          g.lineTo(x + w, 480);
          g.closePath();
        });
      };
      mesa(80, 260, 120, '#d98763');
      mesa(560, 200, 90, '#e09a72');
      mesa(1320, 240, 140, '#cf7a58');
      hills(g, 470, 40, '#efc08a', 9, 0.006);
      for (let i = 0; i < 9; i++) {
        const x = rng.range(40, W - 40);
        const y = 470 - rng.range(0, 20);
        const s = rng.range(0.5, 0.9);
        paint(g, '#7aa35a', 1.1, () => {
          g.beginPath();
          g.roundRect ? g.roundRect(x - 5 * s, y - 40 * s, 10 * s, 40 * s, 5 * s) : g.rect(x - 5 * s, y - 40 * s, 10 * s, 40 * s);
        });
        paint(g, '#7aa35a', 1.1, () => {
          g.beginPath();
          g.roundRect ? g.roundRect(x + 4 * s, y - 28 * s, 10 * s, 6 * s, 3 * s) : g.rect(x + 4 * s, y - 28 * s, 10 * s, 6 * s);
          g.roundRect ? g.roundRect(x + 9 * s, y - 38 * s, 6 * s, 14 * s, 3 * s) : g.rect(x + 9 * s, y - 38 * s, 6 * s, 14 * s);
        });
      }
      break;
    }
    case 'seaside': {
      sky('#a9d8f0', '#eef6f0');
      cloud(g, 320, 130, 1.1);
      cloud(g, 1200, 100, 1.3);
      g.fillStyle = '#6fb3d9';
      g.fillRect(0, 360, W, H);
      g.beginPath();
      g.moveTo(0, 360);
      g.lineTo(W, 360);
      stroke(g, 1.4);
      for (let i = 0; i < 40; i++) {
        const x = rng.range(0, W);
        const y = rng.range(375, 460);
        g.beginPath();
        g.moveTo(x - 8, y);
        g.quadraticCurveTo(x, y - 4, x + 8, y);
        stroke(g, 1, 'rgba(255,255,255,0.8)');
      }
      // sailboat
      paint(g, '#e2553f', 1.4, () => {
        g.beginPath();
        g.moveTo(1000, 352);
        g.lineTo(1080, 352);
        g.lineTo(1066, 366);
        g.lineTo(1014, 366);
        g.closePath();
      });
      paint(g, '#ffffff', 1.4, () => {
        g.beginPath();
        g.moveTo(1040, 348);
        g.lineTo(1040, 280);
        g.lineTo(1080, 346);
        g.closePath();
      });
      // lighthouse
      paint(g, '#ffffff', 1.4, () => {
        g.beginPath();
        g.moveTo(240, 360);
        g.lineTo(252, 230);
        g.lineTo(276, 230);
        g.lineTo(288, 360);
        g.closePath();
      });
      for (const y of [260, 300, 340]) {
        g.fillStyle = '#e2553f';
        g.fillRect(250, y, 28, 12);
      }
      paint(g, '#e2553f', 1.4, () => {
        g.beginPath();
        g.moveTo(246, 230);
        g.lineTo(264, 205);
        g.lineTo(282, 230);
        g.closePath();
      });
      break;
    }
    case 'night': {
      sky('#1f2a52', '#3b4a7a', 'rgba(10,14,40,0.18)');
      for (let i = 0; i < 140; i++) {
        const x = rng.range(0, W);
        const y = rng.range(0, 470);
        const r = rng.range(0.6, 1.8);
        circ(g, x, y, r);
        fill(g, rng.chance(0.2) ? '#ffe9a8' : '#ffffff');
      }
      paint(g, '#fff6c9', 1.4, () => circ(g, 1250, 150, 46));
      g.save();
      circ(g, 1272, 138, 42);
      g.fillStyle = '#25305c';
      g.fill();
      g.restore();
      hills(g, 450, 70, '#2c3a5e', 5);
      break;
    }
    case 'paper': {
      g.fillStyle = '#f8f1dc';
      g.fillRect(0, 0, W, H);
      for (let y = 20; y < H; y += 26) {
        for (let x = 20 + ((y / 26) % 2) * 13; x < W; x += 26) {
          circ(g, x, y, 1.6);
          fill(g, 'rgba(226,85,63,0.25)');
        }
      }
      break;
    }
    default: {
      // meadow
      sky('#b7e0f3', '#f4f0d8');
      paint(g, '#fff0a8', 1.4, () => circ(g, 1350, 120, 44));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(1350 + Math.cos(a) * 54, 120 + Math.sin(a) * 54);
        g.lineTo(1350 + Math.cos(a) * 70, 120 + Math.sin(a) * 70);
        stroke(g, 2.2, '#f0bf45');
      }
      cloud(g, 220, 120, 1.2);
      cloud(g, 760, 80, 0.9);
      cloud(g, 1080, 170, 1.0);
      hills(g, 400, 110, '#c6e09b', 21, 0.003);
      hills(g, 450, 70, '#a6cf7f', 22, 0.005);
      // little farm far away
      house(g, 640, 400, 52, 34, '#e2553f', '#7a3a2e');
      paint(g, '#f6efe0', 1.2, () => g.rect(700, 372, 14, 30));
      paint(g, '#9a3c2e', 1.2, () => ell(g, 707, 372, 8, 5));
      for (let i = 0; i < 12; i++) {
        lollipopTree(g, rng.range(30, W - 30), rng.range(420, 470), rng.range(0.7, 1.2), rng.pick(['#77b255', '#8cc152', '#5f9e45', '#9bcc68']));
      }
      // fence
      for (let x = 900; x < 1200; x += 16) {
        g.beginPath();
        g.moveTo(x, 452);
        g.lineTo(x, 432);
        stroke(g, 2, '#fbf3df');
        stroke(g, 0.7, 'rgba(58,42,31,0.6)');
      }
      g.beginPath();
      g.moveTo(896, 440);
      g.lineTo(1200, 440);
      stroke(g, 1.6, '#fbf3df');
      break;
    }
  }
  if (kind !== 'paper') {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(rainforest(scale, kind), 0, 0);
    g.restore();
  }
  // Glass haze so the backdrop reads as "behind" the tank contents.
  g.fillStyle = 'rgba(240,248,250,0.18)';
  g.fillRect(0, 0, W, H + 80);
  return c;
}

// The room around the tank: wallpaper and a wooden table.
export function makeWallpaperTile(style) {
  const s = 48;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const g = c.getContext('2d');
  const styles = {
    cream: ['#f6ead0', '#e9b98a', '#9cc87a'],
    mint: ['#dff0e3', '#f39a9a', '#7cc0e6'],
    sky: ['#dcecf6', '#f0bf45', '#e2553f'],
    rose: ['#f8e1dc', '#77b255', '#f0bf45'],
  };
  const [bg, a, b] = styles[style] || styles.cream;
  g.fillStyle = bg;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fillRect(0, 0, 6, s);
  g.fillRect(24, 0, 6, s);
  // little flowers
  const flower = (x, y, col) => {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      circ(g, x + Math.cos(ang) * 2.6, y + Math.sin(ang) * 2.6, 2);
      fill(g, col);
    }
    circ(g, x, y, 1.4);
    fill(g, '#f0bf45');
  };
  flower(12, 12, a);
  flower(36, 36, b);
  return c;
}

export function makeWoodTile() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#b77d4b';
  g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    const y = 3 + i * 3.4;
    g.moveTo(0, y);
    for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.2);
    g.strokeStyle = i % 2 ? 'rgba(120,70,35,0.35)' : 'rgba(230,180,130,0.3)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, 31.5);
  g.lineTo(128, 31.5);
  g.strokeStyle = 'rgba(58,42,31,0.5)';
  g.stroke();
  return c;
}

export { INK, smoothPath };
