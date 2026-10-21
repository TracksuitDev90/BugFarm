// Shafts of light. Each beam is a small soft-edged texture (bright in the
// middle, feathered at the sides, fading as it falls) stretched along its
// path and added onto the scene, so beams glow rather than sit on top like
// flat panes. Beams breathe slowly, dust motes drift and twinkle inside
// them, and they stop at the ground: sunlight through the glass over the
// desert and pond, dappled shafts through the jungle canopy, rippling rays
// under the water, and a soft cone under each heat lamp.
import { W, H, GW, CELL } from '../config.js';
import { hash1 } from '../util/rng.js';
import { clamp01 } from '../util/math.js';

const TW = 32;
const TH = 128;
const SUN_TILT = -0.3; // the window is up to the left: rays slant down to the right

// [x at the top of the tank, width, strength]
const SUN = [[40, 70, 0.9], [170, 34, 0.7], [300, 96, 1], [470, 44, 0.75], [620, 80, 0.85], [800, 40, 0.6], [930, 64, 0.8]];
// [x, width, strength] dropping from under the canopy
const CANOPY = [[1110, 30, 0.9], [1205, 18, 0.7], [1300, 44, 1], [1420, 22, 0.8], [1500, 36, 0.9], [1575, 16, 0.6]];

export class LightRays {
  constructor() {
    this.tex = {};
    this.airKey = '';
    this.air = null;
    this.motes = [];
    for (let i = 0; i < 70; i++) this.motes.push({ u: Math.random(), v: Math.random(), b: i % (SUN.length + CANOPY.length), ph: Math.random() * 6.3, r: 0.5 + Math.random() * 0.8 });
  }

  // A beam texture tinted one colour: a soft bell across, a quick fade-in
  // at the top and a long fall-off toward the bottom.
  texture(rgb) {
    if (this.tex[rgb]) return this.tex[rgb];
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    const g = c.getContext('2d');
    const img = g.createImageData(TW, TH);
    const [r, gg, b] = rgb.split(',').map(Number);
    for (let y = 0; y < TH; y++) {
      const v = y / (TH - 1);
      const along = Math.min(1, v / 0.08) * Math.pow(1 - v, 1.6);
      for (let x = 0; x < TW; x++) {
        const u = (x + 0.5) / TW - 0.5;
        const across = Math.exp(-(u * u) / 0.045);
        const o = (y * TW + x) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = Math.round(255 * along * across);
      }
    }
    g.putImageData(img, 0, 0);
    this.tex[rgb] = c;
    return c;
  }

  // Everything above the ground (water included): light stops at the dirt.
  airPath(t) {
    const key = t.version;
    if (key === this.airKey && this.air) return this.air;
    if (this.air && t.version - this.airVer < 40 && performance.now() - this.airT < 400) return this.air;
    this.airKey = key;
    this.airVer = t.version;
    this.airT = performance.now();
    const p = new Path2D();
    p.moveTo(0, 0);
    p.lineTo(W, 0);
    for (let cx = GW - 1; cx >= 0; cx -= 2) p.lineTo(cx * CELL + CELL / 2, t.surfaceY(cx * CELL + CELL / 2));
    p.lineTo(0, t.surfaceY(0));
    p.closePath();
    this.air = p;
    return p;
  }

  // Draw one beam: from (x, y) heading `ang` from straight down.
  beam(r, g, tex, x, y, ang, w, len, alpha) {
    if (alpha < 0.004) return;
    r.put(g, x, y, ang, w / TW, len / TH);
    g.globalAlpha = alpha;
    g.drawImage(tex, -TW / 2, 0);
  }

  // Warm cones under the heat lamps, for the cached background.
  lampCone(r, g, x, power, sun) {
    const tex = this.texture('255,226,150');
    const a = 0.32 * power * (0.55 + 0.45 * sun);
    for (const [ang, wd, k] of [[0, 120, 1], [-0.22, 70, 0.55], [0.22, 70, 0.55], [-0.4, 46, 0.3], [0.4, 46, 0.3]]) this.beam(r, g, tex, x, 10, ang, wd, 430, a * k);
    g.globalAlpha = 1;
  }

  draw(r, g, w, time) {
    const env = w.env;
    const t = w.terrain;
    const sun = env.sun;
    if (sun < 0.04) return;
    r.setWorld(g);
    g.save();
    g.clip(this.airPath(t));
    g.globalCompositeOperation = 'lighter';
    const sunTex = this.texture('255,244,214');
    const leafTex = this.texture('236,250,190');
    const day = clamp01((sun - 0.04) / 0.6);
    // sunlight through the glass
    SUN.forEach(([x, wd, k], i) => {
      const breathe = 0.72 + 0.28 * Math.sin(time * 0.23 + i * 1.9) * Math.sin(time * 0.11 + i);
      const drift = Math.sin(time * 0.05 + i * 2.3) * 14;
      this.beam(r, g, sunTex, x + drift, -10, SUN_TILT, wd * 1.15, 760, 0.12 * k * breathe * day);
    });
    // dappled light under the canopy: leaves stirring overhead make it flicker
    CANOPY.forEach(([x, wd, k], i) => {
      const flick = 0.6 + 0.4 * Math.max(0, Math.sin(time * 0.9 + i * 2.1) * 0.6 + Math.sin(time * 2.3 + i * 4.7) * 0.4);
      this.beam(r, g, leafTex, x + Math.sin(time * 0.17 + i) * 6, 70, SUN_TILT * 0.7, wd, 420, 0.15 * k * flick * day);
    });
    // rays under the water, swaying with the ripples above
    const wl = t.waterLevel;
    const clear = env.pond.clarity;
    if (clear > 0.15 && r.visible(810, wl + 100, 300)) {
      const wTex = this.texture('214,246,255');
      for (let i = 0; i < 6; i++) {
        const x = 640 + i * 70 + Math.sin(time * 0.31 + i * 1.7) * 20;
        if (!t.waterAt(x, wl + 6)) continue;
        const ang = SUN_TILT * 0.6 + Math.sin(time * 0.43 + i) * 0.06;
        this.beam(r, g, wTex, x, wl + 2, ang, 16 + 10 * hash1(i, 3) + Math.sin(time * 0.7 + i) * 5, 280, 0.12 * clear * day);
      }
    }
    // dust motes floating in the sunbeams
    g.globalCompositeOperation = 'lighter';
    g.setTransform(1, 0, 0, 1, 0, 0);
    const all = SUN.length;
    for (const m of this.motes) {
      const sunBeam = m.b < all;
      const [bx, wd] = sunBeam ? SUN[m.b] : CANOPY[m.b - all];
      const y0 = sunBeam ? -10 : 70;
      const len = sunBeam ? 520 : 300;
      const tilt = sunBeam ? SUN_TILT : SUN_TILT * 0.7;
      m.v = (m.v + 0.004 * (0.3 + m.r) * (r.paused ? 0 : 1) * 0.25) % 1;
      const along = m.v * len;
      const across = (m.u - 0.5) * wd * 0.8 + Math.sin(time * 0.6 + m.ph) * 3;
      const x = bx + -Math.sin(tilt) * along + Math.cos(tilt) * across;
      const y = y0 + Math.cos(tilt) * along + Math.sin(tilt) * across;
      if (!r.visible(x, y, 4) || t.solidAt(x, y)) continue;
      const tw = 0.5 + 0.5 * Math.sin(time * 2.2 + m.ph * 3);
      const fade = Math.sin(m.v * Math.PI);
      const [sx, sy] = r.cam.toScreen(x, y);
      g.globalAlpha = 0.5 * tw * fade * day;
      g.fillStyle = sunBeam ? '#fff6dc' : '#f2ffd0';
      g.beginPath();
      g.arc(sx * r.dpr, sy * r.dpr, m.r * r.dpr * Math.max(0.7, Math.min(1.6, r.cam.zoom)), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    r.setWorld(g);
  }
}

export { H };
