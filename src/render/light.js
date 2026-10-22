// Shafts of light. Each beam is a small soft-edged texture (bright in the
// middle, feathered at the sides, fading as it falls) stretched along its
// path and added onto the scene, so beams glow rather than sit on top like
// flat panes: sunlight through the glass over the desert and pond, dappled
// shafts through the jungle canopy, a soft cone under each heat lamp, rays
// swaying under the water, and dust motes twinkling in the sunbeams.
import { W, H } from '../config.js';
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

  // Draw one beam: from (x, y) heading `ang` from straight down. `m` is
  // the world-to-canvas transform [k, ox, oy] to draw with.
  beam(m, g, tex, x, y, ang, w, len, alpha) {
    if (alpha < 0.004) return;
    const [k, ox, oy] = m;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sx = w / TW;
    const sy = len / TH;
    g.setTransform(k * c * sx, k * s * sx, -k * s * sy, k * c * sy, k * x + ox, k * y + oy);
    g.globalAlpha = alpha;
    g.drawImage(tex, -TW / 2, 0);
  }

  // Warm cones under the heat lamps, for the cached background.
  lampCone(m, g, x, power, sun) {
    const tex = this.texture('255,226,150');
    const a = 0.32 * power * (0.55 + 0.45 * sun);
    for (const [ang, wd, k] of [[0, 120, 1], [-0.22, 70, 0.55], [0.22, 70, 0.55], [-0.4, 46, 0.3], [0.4, 46, 0.3]]) this.beam(m, g, tex, x, 24, ang, wd, 420, a * k);
    g.globalAlpha = 1;
  }

  // The big shafts of sunlight and canopy light barely move, so they're
  // painted into the cached background, behind the ground (which hides
  // them below the surface for free). They brighten and fade with the day
  // as the background is refreshed. m: [scale, offset x, offset y].
  // `water`: also paint still rays into the pond (seen through the water)
  // when there's no budget for live ones.
  bake(g, m, w, water) {
    const day = clamp01((w.env.sun - 0.04) / 0.6);
    if (day <= 0) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    const sunTex = this.texture('255,244,214');
    const leafTex = this.texture('236,250,190');
    SUN.forEach(([x, wd, s], i) => this.beam(m, g, sunTex, x + Math.sin(i * 2.3) * 10, -10, SUN_TILT, wd * 1.15, 760, 0.13 * s * (0.85 + 0.15 * Math.sin(i * 1.9)) * day));
    CANOPY.forEach(([x, wd, s]) => this.beam(m, g, leafTex, x, 70, SUN_TILT * 0.7, wd, 420, 0.15 * s * day));
    if (water) this.waterRays(m, g, w, 0, day, 1.7);
    g.restore();
  }

  // Rays fanning down from the pond's surface, cut to its depth so they
  // stay in the water. time sways them; boost makes up for being painted
  // under the water's wash.
  waterRays(m, g, w, time, day, boost = 1) {
    const t = w.terrain;
    const wl = t.waterLevel;
    const clear = w.env.pond.clarity;
    if (clear <= 0.15) return;
    const wTex = this.texture('214,246,255');
    for (let i = 0; i < 6; i++) {
      const x = 640 + i * 70 + Math.sin(time * 0.31 + i * 1.7) * 20;
      if (!t.waterAt(x, wl + 6)) continue;
      const ang = SUN_TILT * 0.6 + Math.sin(time * 0.43 + i) * 0.06;
      const reach = 0.92 * (t.surfaceY(x - Math.sin(ang) * 160) - wl);
      if (reach < 30) continue;
      this.beam(m, g, wTex, x, wl + 2, ang, 16 + 10 * hash1(i, 3) + Math.sin(time * 0.7 + i) * 5, Math.min(300, reach / 0.75), 0.12 * clear * day * boost);
    }
  }

  // Live light, drawn every frame: dust motes twinkling as they drift down
  // through the sunbeams, and (when there's budget) the pond's rays swaying
  // with the ripples.
  draw(r, g, w, time, opts) {
    const day = clamp01((w.env.sun - 0.04) / 0.6);
    if (!opts.rays || day <= 0) return;
    if (opts.liveWater && r.visible(810, w.terrain.waterLevel + 100, 300)) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      this.waterRays([r.k, r.ox, r.oy], g, w, time, day);
      g.restore();
    }
    this.drawMotes(r, g, w.terrain, time, day);
    r.setWorld(g);
  }

  // Faint, soft-edged glare streaks across the front glass. They never
  // move, so they're painted into the cached background.
  glare(g, m) {
    const [k, ox, oy] = m;
    g.save();
    g.setTransform(k, 0, 0, k, ox, oy);
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    for (const [x, wd, a] of [[36, 60, 0.08], [108, 14, 0.07], [W - 120, 40, 0.05]]) {
      const gr = g.createLinearGradient(x, 0, x + wd, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(k, 0, 0, k, ox, oy);
      g.transform(1, 0, -0.18, 1, 0, 0);
      g.fillStyle = gr;
      g.fillRect(x, 0, wd, H);
    }
    g.restore();
  }

  // Dust motes floating in the sunbeams (drawn sharp, on the scene itself,
  // with a plain blend: switching blend modes mid-frame is slow on phones
  // that paint the canvas without the GPU).
  drawMotes(r, g, t, time, day) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const all = SUN.length;
    const zr = r.dpr * Math.max(0.7, Math.min(1.6, r.cam.zoom));
    for (const mo of this.motes) {
      const sunBeam = mo.b < all;
      const [bx, wd] = sunBeam ? SUN[mo.b] : CANOPY[mo.b - all];
      const y0 = sunBeam ? -10 : 70;
      const len = sunBeam ? 520 : 300;
      const tilt = sunBeam ? SUN_TILT : SUN_TILT * 0.7;
      if (!r.paused) mo.v = (mo.v + 0.001 * (0.3 + mo.r)) % 1;
      const along = mo.v * len;
      const across = (mo.u - 0.5) * wd * 0.8 + Math.sin(time * 0.6 + mo.ph) * 3;
      const x = bx - Math.sin(tilt) * along + Math.cos(tilt) * across;
      const y = y0 + Math.cos(tilt) * along + Math.sin(tilt) * across;
      if (!r.visible(x, y, 4) || t.solidAt(x, y)) continue;
      const tw = 0.5 + 0.5 * Math.sin(time * 2.2 + mo.ph * 3);
      const [sx, sy] = r.cam.toScreen(x, y);
      g.globalAlpha = 0.5 * tw * Math.sin(mo.v * Math.PI) * day;
      g.fillStyle = sunBeam ? '#fff6dc' : '#f2ffd0';
      g.beginPath();
      g.arc(sx * r.dpr, sy * r.dpr, mo.r * zr, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

export { H };
