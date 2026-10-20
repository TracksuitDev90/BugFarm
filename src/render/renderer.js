// Draws the tank. Static things (terrain, backdrop, water body, plants) are
// cached; per frame we mostly blit sprites with a single setTransform each.
import { W, H, CELL, GW, INK, ZONE_X } from '../config.js';
import { TerrainRenderer } from './terrainRender.js';
import { SpriteCache, bucketFor } from './sprites.js';
import { Particles } from './particles.js';
import { CREATURE_ART, PALETTES, WINGS, wingAngle, butterflyLift, drawWingBlade, wingBox, drawButterflyWings, drawWorm, drawBrood, drawHalo } from '../art/creatures.js';
import { drawFood } from '../art/food.js';
import { drawPlant, drawVine } from '../art/plants.js';
import { DECOR_ART, decorBox } from '../art/decor.js';
import { drawIcon } from '../art/icons.js';
import { paintBackdrop, makeWallpaperTile, makeWoodTile } from '../art/backdrops.js';
import { setMisregistration } from '../art/ink.js';
import { LAMP_X, MISTER_X } from '../world/environment.js';
import { zoneBand, zoneStatus } from '../sim/care.js';
import { angleDiff, clamp, clamp01, lerp } from '../util/math.js';
import { hash1 } from '../util/rng.js';

const TAU = Math.PI * 2;
const QUALITY = {
  low: { dprCap: 1, terrainS: 1, backdrop: 0.4, particles: 110, rays: false, reflections: false, budget: 6, maxBucket: 2 },
  medium: { dprCap: 2, terrainS: 1.5, backdrop: 0.6, particles: 220, rays: true, reflections: true, budget: 10, maxBucket: 4 },
  high: { dprCap: 3, terrainS: 2, backdrop: 0.8, particles: 320, rays: true, reflections: true, budget: 16, maxBucket: 4 },
};

// Which art poses exist per species (others fall back to idle).
const POSES = {
  ant: ['idle', 'walk', 'carry', 'dig'],
  cricket: ['idle', 'walk', 'jump', 'chirp'],
  grasshopper: ['idle', 'walk', 'jump', 'chirp'],
  gecko: ['idle', 'walk', 'eat'],
  beetle: ['idle', 'walk'],
  goldfish: ['swim', 'gasp'],
  frog: ['idle', 'croak', 'jump', 'swim'],
  turtle: ['idle', 'walk', 'swim', 'bask', 'hide'],
  pondsnail: ['idle', 'shell'],
  shrimp: ['idle', 'walk'],
  ladybug: ['idle', 'walk', 'fly'],
  aphid: ['idle', 'walk'],
  butterfly: ['idle', 'walk', 'fly'],
  snail: ['idle', 'walk', 'shell'],
  bee: ['fly', 'pollen'],
  firefly: ['idle', 'walk', 'fly'],
  pillbug: ['idle', 'walk', 'ball'],
  fruitfly: ['fly'],
};
const FRAMES = { walk: 4, fly: 2, swim: 4, chirp: 2 };
// Stick-on strip thermometers on the glass, one per zone.
export const GAUGE_AT = { desert: [34, 40], pond: [580, 40], jungle: [1492, 40] };
// Vines trailing from the lid over the jungle: [x, length]. They keep clear
// of the jungle lamp and mister.
const VINES = [[1078, 150], [1132, 240], [1186, 120], [1402, 200], [1452, 110], [1528, 260], [1584, 170]];

function artPose(c) {
  let p = c.pose;
  if (c.dead) p = 'idle';
  else if (c.mode === 'fly') p = c.sp === 'bee' && (c.memory.pollen || 0) > 0 ? 'pollen' : 'fly';
  else if (c.mode === 'swim' && p !== 'gasp') p = 'swim';
  else if (c.mode === 'air') p = 'jump';
  else if (p === 'sleep' || p === 'idle' || p === 'eat') {
    if (c.moving && p !== 'sleep') p = c.carry ? 'carry' : 'walk';
    else if (p === 'sleep') p = 'idle';
  }
  if (c.sp === 'ant' && c.moving && c.carry) p = c.pose === 'dig' ? 'dig' : 'carry';
  if (c.sp === 'butterfly' && c.stage !== 'adult') p = c.moving ? 'walk' : 'idle';
  if (c.sp === 'bee' && p !== 'pollen') p = 'fly';
  if (c.sp === 'fruitfly') p = 'fly';
  if (c.sp === 'goldfish' && p !== 'gasp') p = 'swim';
  if (c.sp === 'frog' && c.stage !== 'adult') p = c.stage === 'egg' ? 'idle' : 'swim';
  const ok = POSES[c.sp];
  if (ok && !ok.includes(p)) p = ok[0];
  return p;
}

export class Renderer {
  constructor(canvas, world, camera) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.world = world;
    this.cam = camera;
    this.tr = new TerrainRenderer(world.terrain);
    this.sprites = new SpriteCache(900);
    this.plantCache = new Map();
    this.fx = new Particles(220);
    world.fx = this.fx;
    this.q = QUALITY.medium;
    this.qualityName = 'medium';
    this.dpr = 1;
    this.time = 0;
    this.lens = 'none';
    this.selected = null;
    this.ghost = null;
    this.backdrop = null;
    this.backdropKey = '';
    this.water = null;
    this.waterKey = '';
    this.bg = null;
    this.bgKey = '';
    this.lensCanvas = null;
    this.lensT = 0;
    this.glow = {};
    this.patterns = {};
    this.emoteSprites = {};
    this.screenScale = 1;
    this.paused = false;
    this.flapT = 0; // wing-beat clock: real time, but stops while paused
    this.setQuality('medium', true);
  }

  setQuality(name, force) {
    if (!QUALITY[name]) name = 'medium';
    if (name === this.qualityName && !force) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.fx.setMax(this.q.particles);
    this.tr.setScale(this.q.terrainS);
    this.tr.setStyle({ sand: this.world.style.sand, soil: this.world.style.soil, gravel: this.world.style.gravel });
    this.backdropKey = '';
    this.resize(this.cssW || 400, this.cssH || 700);
  }

  applyStyle() {
    const s = this.world.style;
    this.tr.setStyle({ sand: s.sand, soil: s.soil, gravel: s.gravel });
    this.backdropKey = '';
    this.waterKey = '';
    this.patterns = {};
    this.bgKey = '';
  }

  resize(cssW, cssH) {
    this.cssW = cssW;
    this.cssH = cssH;
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.dpr = dpr;
    this.cv.width = Math.round(cssW * dpr);
    this.cv.height = Math.round(cssH * dpr);
    this.cv.style.width = cssW + 'px';
    this.cv.style.height = cssH + 'px';
  }

  // world->device transform
  setWorld(g) {
    const k = this.cam.zoom * this.dpr;
    this.k = k;
    this.ox = (this.cam.vw / 2 - this.cam.x * this.cam.zoom) * this.dpr;
    this.oy = (this.cam.centerY - this.cam.y * this.cam.zoom) * this.dpr;
    g.setTransform(k, 0, 0, k, this.ox, this.oy);
  }
  put(g, x, y, ang, sx, sy) {
    const k = this.k;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    g.setTransform(k * c * sx, k * s * sx, -k * s * sy, k * c * sy, k * x + this.ox, k * y + this.oy);
  }

  ensureBackdrop() {
    const key = this.world.style.backdrop + '|' + this.q.backdrop;
    if (key === this.backdropKey) return;
    this.backdropKey = key;
    this.backdrop = paintBackdrop(this.world.style.backdrop, this.q.backdrop);
  }

  ensureWater() {
    const t = this.world.terrain;
    const p = this.world.env.pond;
    const tint = this.world.style.water || 'clear';
    const key = t.waterVersion + '|' + Math.round(p.clarity * 10) + '|' + Math.round(p.algae * 10) + '|' + tint;
    if (key === this.waterKey) return;
    this.waterKey = key;
    // bounding box of water cells
    let x0 = GW;
    let x1 = -1;
    let y0 = 1e9;
    let y1 = -1;
    const GHn = t.water.length / GW;
    for (let cx = 0; cx < GW; cx++) {
      for (let cy = 0; cy < GHn; cy++) {
        if (t.water[cy * GW + cx] !== 1) continue;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
      }
    }
    if (x1 < 0) {
      this.water = null;
      return;
    }
    x0 = Math.max(0, x0 - 2);
    y0 = Math.max(0, y0 - 2);
    x1 = Math.min(GW - 1, x1 + 2);
    y1 = Math.min(GHn - 1, y1 + 2);
    const wx = x0 * CELL;
    const wy = y0 * CELL;
    const ww = (x1 - x0 + 1) * CELL;
    const wh = (y1 - y0 + 1) * CELL;
    const c = document.createElement('canvas');
    c.width = ww;
    c.height = wh;
    const g = c.getContext('2d');
    g.translate(-wx, -wy);
    const base = {
      clear: [[150, 212, 238], [52, 112, 168]],
      teal: [[136, 216, 206], [34, 118, 132]],
      green: [[166, 212, 160], [56, 112, 84]],
      blue: [[126, 184, 242], [36, 74, 160]],
    }[tint] || [[150, 212, 238], [52, 112, 168]];
    const murk = 1 - p.clarity;
    const algae = Math.min(1, p.algae * 1.5);
    const mixc = (col) => {
      const r = lerp(lerp(col[0], 150, algae * 0.6), 150, murk * 0.7);
      const gg = lerp(lerp(col[1], 190, algae * 0.6), 135, murk * 0.7);
      const b = lerp(lerp(col[2], 110, algae * 0.6), 90, murk * 0.7);
      return `rgb(${Math.round(r)},${Math.round(gg)},${Math.round(b)})`;
    };
    const grad = g.createLinearGradient(0, t.waterLevel, 0, H);
    grad.addColorStop(0, mixc(base[0]));
    grad.addColorStop(1, mixc(base[1]));
    this.tr.paintWater(g, x0, y0, x1, y1, grad);
    this.water = c;
    this.waterRect = [wx, wy, ww, wh];
    this.waterAlpha = 0.42 + murk * 0.4;
  }

  drawWater(g) {
    if (!this.water) return;
    const [x, y, w, h] = this.waterRect;
    g.globalAlpha = this.waterAlpha;
    g.drawImage(this.water, x, y, w, h);
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ static background cache
  // Room, back wall, lamp glow, terrain and frame are painted into one
  // oversized offscreen layer; each frame is then a single 1:1 blit.
  ensureBg(chunks) {
    const cw = this.cv.width;
    const ch = this.cv.height;
    const mx = Math.ceil(cw * 0.25);
    const my = Math.ceil(ch * 0.25);
    if (!this.bg || this.bg.width !== cw + mx * 2 || this.bg.height !== ch + my * 2) {
      this.bg = document.createElement('canvas');
      this.bg.width = cw + mx * 2;
      this.bg.height = ch + my * 2;
      this.bgCtx = this.bg.getContext('2d', { alpha: false });
      this.bgKey = '';
      this.patterns = {};
    }
    this.bgM = [mx, my];
    const env = this.world.env;
    const st = this.world.style;
    const key = [this.k.toFixed(5), this.backdropKey, st.frame, st.wallpaper, Math.round(env.desert.lamp * 10), Math.round(env.pond.lamp * 10), Math.round(env.jungle.lamp * 10), Math.round(env.sun * 6), this.tr.version || 0].join('|');
    let dx = this.ox - this.bgOx;
    let dy = this.oy - this.bgOy;
    if (key !== this.bgKey || !(Math.abs(dx) < mx - 2 && Math.abs(dy) < my - 2)) {
      this.bgKey = key;
      this.bgOx = this.ox;
      this.bgOy = this.oy;
      this.paintBg(null);
      dx = 0;
      dy = 0;
    } else if (chunks.length) this.paintBg(chunks);
    this.bgDX = Math.round(dx - mx);
    this.bgDY = Math.round(dy - my);
  }

  paintBg(chunks) {
    const g = this.bgCtx;
    const k = this.k;
    const [mx, my] = this.bgM;
    const ox = this.bgOx + mx;
    const oy = this.bgOy + my;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (chunks) {
      g.save();
      g.beginPath();
      for (const c of chunks) {
        const [x, y, w, h] = this.tr.chunkRect(c);
        g.rect(Math.floor(k * x + ox) - 1, Math.floor(k * y + oy) - 1, Math.ceil(k * w) + 3, Math.ceil(k * h) + 3);
      }
      g.clip();
    }
    g.setTransform(k, 0, 0, k, ox, oy);
    const view = { x0: -ox / k, y0: -oy / k, x1: (this.bg.width - ox) / k, y1: (this.bg.height - oy) / k };
    this.drawRoom(g, view);
    g.drawImage(this.backdrop, 0, 0, W, H);
    this.drawLampCones(g);
    this.tr.draw(g, view);
    this.drawFrame(g, view);
    if (chunks) g.restore();
  }

  glowSprite(color) {
    if (this.glow[color]) return this.glow[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color);
    gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this.glow[color] = c;
    return c;
  }

  emoteSprite(name) {
    const dpr = this.dpr;
    const key = name + '@' + dpr;
    if (this.emoteSprites[key]) return this.emoteSprites[key];
    const s = 30;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(s * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(s / 2, s / 2 - 1);
    g.beginPath();
    g.arc(0, 0, 12, 0, TAU);
    g.fillStyle = '#fffdf6';
    g.fill();
    g.lineWidth = 1.6;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.moveTo(-3, 11);
    g.lineTo(0, 15);
    g.lineTo(3, 11);
    g.fillStyle = '#fffdf6';
    g.fill();
    drawIcon(g, name, 16);
    this.emoteSprites[key] = c;
    return c;
  }

  // ------------------------------------------------------------------ frame
  frame(alpha, dt) {
    const g = this.g;
    const w = this.world;
    const t = w.terrain;
    const cam = this.cam;
    this.time += dt;
    if (!this.paused) this.flapT += dt;
    this.fx.update(dt, t, this.time);
    this.ensureBackdrop();
    this.ensureWater();
    const view = cam.view(40);
    this.view = view;
    this.sprites.frame(this.q.budget);
    const chunks = this.tr.update(view, 3);
    const px = cam.zoom * this.dpr;
    this.bucket = Math.min(this.q.maxBucket, bucketFor(px));
    setMisregistration(0.35);

    this.setWorld(g);
    this.ensureBg(chunks);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, this.bgDX, this.bgDY);
    this.setWorld(g);

    // --- underwater layer (drawn before the water so it looks submerged)
    const sel = this.selected;
    for (const p of w.plants) if (p.def.aquatic && this.visible(p.x, p.y, 120)) this.drawPlantE(g, p);
    for (const d of w.decor) if (d.def.place === 'floor' && t.waterAt(d.x, d.y - 4) && this.visible(d.x, d.y, 80)) this.drawDecorE(g, d);
    for (const f of w.foods) if (f.inWater && f.state !== 'float' && this.visible(f.x, f.y, 20)) this.drawFoodE(g, f, alpha);
    for (const c of w.creatures) {
      if (!this.visible(c.x, c.y, 40)) continue;
      if (t.waterAt(c.x, c.y) && c.sp !== 'worm') this.drawCreatureE(g, c, alpha);
    }
    this.setWorld(g);
    this.drawWater(g);
    // --- underground: ant brood & stores, worms
    this.drawColonies(g);
    for (const c of w.creatures) if (c.sp === 'worm' && this.visible(c.x, c.y, 60)) this.drawWormE(g, c, alpha);
    // --- land layer
    this.setWorld(g);
    for (const d of w.decor) if (!d.def.shelter && !(d.def.place === 'floor' && t.waterAt(d.x, d.y - 4)) && this.visible(d.x, d.y, 90)) this.drawDecorE(g, d);
    for (const p of w.plants) if (!p.def.aquatic && this.visible(p.x, p.y, 120)) this.drawPlantE(g, p);
    this.drawVines(g);
    for (const f of w.foods) if ((!f.inWater || f.state === 'float') && this.visible(f.x, f.y, 20)) this.drawFoodE(g, f, alpha);
    for (const c of w.creatures) {
      if (c.sp === 'worm' || !this.visible(c.x, c.y, 40)) continue;
      if (!t.waterAt(c.x, c.y)) this.drawCreatureE(g, c, alpha);
    }
    this.setWorld(g);
    for (const d of w.decor) if (d.def.shelter && !(d.def.place === 'floor' && t.waterAt(d.x, d.y - 4)) && this.visible(d.x, d.y, 90)) this.drawDecorE(g, d);
    this.drawWaterSurface(g);
    this.fx.draw(g, view, cam.zoom);
    this.drawEquipment(g);
    this.drawGauges(g);
    if (sel && !sel.removed) this.drawSelection(g, sel, alpha);
    if (this.q.reflections) this.drawGlass(g);
    this.drawNight(g, view);
    if (this.lens !== 'none') this.drawLens(g, view, dt);
    if (this.ghost) this.drawGhost(g);
    this.drawEmotes(g, alpha);
  }

  visible(x, y, m) {
    const v = this.view;
    return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  }

  drawRoom(g, view) {
    if (!this.patterns.wall || this.patterns.ctx !== g) {
      this.patterns.ctx = g;
      const tile = makeWallpaperTile(this.world.style.wallpaper);
      this.patterns.wall = g.createPattern(tile, 'repeat');
      this.patterns.wood = g.createPattern(makeWoodTile(), 'repeat');
    }
    g.fillStyle = this.patterns.wall;
    g.fillRect(view.x0 - 10, view.y0 - 10, view.x1 - view.x0 + 20, view.y1 - view.y0 + 20);
    if (view.y1 > H + 18) {
      g.fillStyle = this.patterns.wood;
      g.fillRect(view.x0 - 10, H + 18, view.x1 - view.x0 + 20, view.y1 - H);
      g.fillStyle = 'rgba(58,42,31,0.25)';
      g.fillRect(view.x0 - 10, H + 60, view.x1 - view.x0 + 20, view.y1 - H);
      g.beginPath();
      g.moveTo(view.x0 - 10, H + 18);
      g.lineTo(view.x1 + 10, H + 18);
      g.moveTo(view.x0 - 10, H + 60);
      g.lineTo(view.x1 + 10, H + 60);
      g.lineWidth = 2;
      g.strokeStyle = INK;
      g.stroke();
      // soft shadow of the tank on the table
      g.fillStyle = 'rgba(58,42,31,0.18)';
      g.beginPath();
      g.ellipse(W / 2, H + 34, W * 0.55, 14, 0, 0, TAU);
      g.fill();
    }
  }

  drawLampCones(g) {
    const env = this.world.env;
    for (const z of ['desert', 'pond', 'jungle']) {
      const p = env[z].lamp;
      if (p < 0.05) continue;
      const x = LAMP_X[z];
      const a = 0.08 * p * (0.6 + 0.4 * env.sun);
      const gr = g.createLinearGradient(0, 10, 0, 400);
      gr.addColorStop(0, `rgba(255,236,170,${a * 2})`);
      gr.addColorStop(1, 'rgba(255,236,170,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x - 16, 14);
      g.lineTo(x + 16, 14);
      g.lineTo(x + 130, 400);
      g.lineTo(x - 130, 400);
      g.closePath();
      g.fill();
    }
  }

  drawRays(g) {
    const t = this.world.terrain;
    const wl = t.waterLevel;
    const tm = this.time;
    g.save();
    g.globalAlpha = 0.07 * (0.3 + 0.7 * this.world.env.sun) * this.world.env.pond.clarity;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const x = 600 + i * 95 + Math.sin(tm * 0.25 + i * 1.7) * 30;
      const wdt = 18 + Math.sin(tm * 0.4 + i) * 8;
      g.beginPath();
      g.moveTo(x, wl);
      g.lineTo(x + wdt, wl);
      g.lineTo(x + wdt + 60, wl + 300);
      g.lineTo(x + 40, wl + 300);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ entities
  drawPlantE(g, p) {
    const S = p.shape;
    if (!S) return;
    let e = this.plantCache.get(p);
    const b = Math.min(this.bucket, 3);
    if (!e || e.ver !== p.shapeVersion || e.b !== b) {
      if (this.sprites.budget <= 0 && e) {
        // reuse stale sprite this frame
      } else {
        this.sprites.budget--;
        const [x0, y0, x1, y1] = S.box;
        const c = (e && e.canvas) || document.createElement('canvas');
        c.width = Math.max(1, Math.ceil((x1 - x0) * b));
        c.height = Math.max(1, Math.ceil((y1 - y0) * b));
        const gg = c.getContext('2d');
        gg.setTransform(b, 0, 0, b, -x0 * b, -y0 * b);
        gg.lineCap = 'round';
        gg.lineJoin = 'round';
        drawPlant(gg, p, this.time);
        e = { canvas: c, ver: p.shapeVersion, b, x0, y0, w: x1 - x0, h: y1 - y0 };
        this.plantCache.set(p, e);
      }
    }
    if (!e) return;
    const sway = p.sway(this.world.time);
    this.put(g, p.x, p.y, sway, 1, 1);
    g.drawImage(e.canvas, e.x0, e.y0, e.w, e.h);
    if (this.plantCache.size > 200) {
      for (const k of this.plantCache.keys()) if (k.removed) this.plantCache.delete(k);
    }
  }

  drawVines(g) {
    const b = Math.min(this.bucket, 3);
    VINES.forEach(([x, len], i) => {
      if (!this.visible(x, len / 2, len / 2 + 30)) return;
      const s = this.sprites.get('vine|' + i, b, [-24, -6, 24, len + 10], (gg) => drawVine(gg, len, i * 7 + 3));
      this.put(g, x, 0, Math.sin(this.world.time * 0.5 + i * 1.7) * 0.025, 1, 1);
      g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
    });
    this.setWorld(g);
  }

  drawDecorE(g, d) {
    const def = d.def;
    const box = decorBox(def);
    const s = this.sprites.get('d|' + d.type, Math.min(this.bucket, 3), box, (gg) => DECOR_ART[d.type](gg, 0));
    this.put(g, d.x, d.y, 0, d.flip ? -1 : 1, 1);
    g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
    if (d.type === 'windmill') DECOR_ART.windmillBlades(g, this.world.time);
  }

  drawFoodE(g, f, alpha) {
    const rot = f.rot;
    const bites = f.bites;
    const s = this.sprites.get('f|' + f.type + '|' + rot + '|' + bites, Math.min(this.bucket, 3), [-10, -12, 10, 3], (gg) => drawFood(gg, f.def, rot, 0.7, bites));
    const x = f.px + (f.x - f.px) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const sc = f.scale;
    // a little squash-and-wobble on every chomp
    const chomp = f.biteT > 0 ? Math.sin(f.biteT * 40) * f.biteT * 0.3 : 0;
    this.put(g, x, y + 0.5, f.state === 'fall' ? f.angle : chomp * 0.6, sc * (f.biteSide < 0 ? -1 : 1) * (1 + chomp), sc * (1 - chomp));
    g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
  }

  drawCreatureE(g, c, alpha) {
    if (c.hidden) {
      if (c.pose === 'burrow') this.drawBuried(g, c);
      return;
    }
    const art = CREATURE_ART[c.sp];
    if (!art) return;
    const pose = artPose(c);
    // flyers get their wings beaten live, so the body sprite has none
    const wspec = !c.dead && (pose === 'fly' || pose === 'pollen') ? WINGS[c.sp] : null;
    let frame = 0;
    const nf = wspec ? 1 : FRAMES[pose] || 1;
    if (nf > 1) {
      if (pose === 'walk' || pose === 'carry') frame = Math.floor(c.anim * (c.sp === 'ant' ? 14 : 9)) % nf;
      else if (pose === 'swim') frame = Math.floor(this.time * (c.sp === 'turtle' ? 2.5 : c.sp === 'frog' && c.stage === 'adult' ? 3 : 8) + c.id) % nf;
      else if (pose === 'chirp') frame = c.frame % 2;
    }
    // blinking
    let closed = c.dead || c.pose === 'sleep';
    if (!closed) {
      const bt = (this.time + c.id * 1.7) % 4.3;
      closed = bt < 0.13;
    }
    const acc = c.sp === 'ant' && (c.pose === 'dig' || c.carry === 'sand') ? 'hardhat' : c.acc;
    const key = c.sp + '|' + c.stage + '|' + pose + '|' + frame + '|' + c.palIdx + '|' + (acc || '') + '|' + (closed ? 1 : 0) + '|' + c.accSeed % 7 + (wspec ? '|w' : '');
    const [bw, bh] = art.box(c.stage);
    const bucket = Math.min(this.q.maxBucket, bucketFor(this.k * c.drawScale));
    const spr = this.sprites.get(key, bucket, [-bw, -bh, bw, bh], (gg) =>
      art.draw(gg, { stage: c.stage, pose, frame, pal: c.pal, acc, accColor: c.accColor, lw: art.lw, closed, liveWings: !!wspec })
    );
    let x = c.px + (c.x - c.px) * alpha;
    let y = c.py + (c.y - c.py) * alpha;
    let ang = c.pangle + angleDiff(c.pangle, c.angle) * alpha;
    if (c.mode === 'crawl' && this.world.terrain.solidAt(x, y + CELL)) y -= 1.8;
    const ds = c.drawScale;
    let sx = ds * (c.plump >= 1 ? 1 + (c.plump - 1) * 0.55 : 1 - (1 - c.plump) * 0.3);
    let sy = ds * (c.plump >= 1 ? 1 + (c.plump - 1) * 0.3 : 1 - (1 - c.plump) * 0.15);
    if (c.pose === 'eat') sy *= 1 + Math.sin(this.time * 18 + c.id) * 0.035;
    if (c.pose === 'sleep' && !c.dead) sy *= 1 + Math.sin(this.time * 2 + c.id) * 0.025;
    if (c.pose === 'headstand') ang += -0.55 * c.facing;
    if (c.stage === 'chrysalis') ang = Math.sin(this.time * 0.8 + c.id) * 0.04;
    if (c.dead) {
      g.globalAlpha = clamp01(1 - c.deadT / 4);
      ang = lerp(ang, 0.2 * c.facing, clamp01(c.deadT));
    } else if (c.mode === 'swim' && !c.aquatic && c.paddling) ang += Math.sin(this.time * 10) * 0.2;
    let ph = 0;
    if (wspec) {
      ph = this.flapT * wspec.hz * TAU + c.id * 2.3;
      y -= Math.sin(ph) * wspec.bob * ds; // each downstroke lifts the body a touch
    }
    this.put(g, x, y, ang, c.facing * sx, sy);
    if (wspec) this.drawWings(g, c, wspec, ph, true, bucket);
    g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
    if (wspec && !wspec.butterfly) this.drawWings(g, c, wspec, ph, false, bucket);
    if (c.carry) this.drawCarry(g, c);
    g.globalAlpha = 1;
    if (c.dead && c.cause !== 'eaten' && c.deadT < 4) this.drawSpirit(g, c, x, y);
    if (c.tongue) {
      this.setWorld(g);
      const mx = x + c.facing * c.size * 0.42;
      const my = y - c.size * 0.04;
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(c.tongue.x, c.tongue.y);
      g.lineCap = 'round';
      g.lineWidth = 2.6;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = '#e8737a';
      g.stroke();
    }
  }

  // Wings hinge at the shoulder and are drawn in the critter's own transform.
  // far = the wing on the other side of the body: lower, smaller, lagging.
  drawWings(g, c, s, ph, far, bucket) {
    g.save();
    if (s.butterfly) {
      const lw = CREATURE_ART.butterfly.lw;
      const P = c.pal;
      const near = this.sprites.get('bw|' + c.palIdx, bucket, [-13, -20, 12, 2], (gg) => drawButterflyWings(gg, P, lw, P.wing));
      const back = this.sprites.get('bwu|' + c.palIdx, bucket, [-13, -20, 12, 2], (gg) => drawButterflyWings(gg, P, lw, P.under));
      // the far pair peeks out behind, showing its paler underside
      for (const [spr, lag, dx, a] of [[back, 0.18, 1.1, 0.85], [near, 0, 0, 1]]) {
        g.save();
        g.globalAlpha *= a;
        g.translate(dx, s.hy);
        g.scale(1, butterflyLift(ph - lag));
        g.translate(0, -s.hy);
        g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
        g.restore();
      }
    } else {
      g.translate(s.hx + (far ? 0.6 : 0), s.hy + (far ? 0.4 : 0));
      if (!far && s.blur) {
        // fast wings blur into a soft fan across their sweep
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, s.len * 0.96, s.base - s.amp, s.base + s.amp);
        g.closePath();
        g.fillStyle = `rgba(232,244,252,${(s.blur * 0.5).toFixed(3)})`;
        g.fill();
      }
      const spr = this.sprites.get('wg|' + c.sp + (far ? 'f' : ''), bucket, wingBox(s), (gg) => drawWingBlade(gg, s.len, s.wid, CREATURE_ART[c.sp].lw, far));
      const sc = far ? 0.88 : 1;
      if (!far && s.blur > 0.4) {
        // a fading after-image of where the wing just was
        g.save();
        g.globalAlpha *= 0.35;
        g.rotate(wingAngle(s, ph - 0.9));
        g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
        g.restore();
      }
      g.rotate(wingAngle(s, far ? ph - 0.4 : ph));
      g.scale(sc, sc);
      g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
    }
    g.restore();
  }

  drawCarry(g, c) {
    const s = c.stage === 'queen' ? 1.35 : 1;
    g.beginPath();
    if (c.carry === 'sand') {
      g.arc(7.4 * s, 0.8, 1.9, 0, TAU);
      g.fillStyle = '#e2c48a';
    } else {
      g.arc(7.6 * s, 0.6, 1.7, 0, TAU);
      g.fillStyle = c.carryFood || '#f2dca6';
    }
    g.fill();
    g.lineWidth = 0.5;
    g.strokeStyle = INK;
    g.stroke();
  }

  drawBuried(g, c) {
    this.setWorld(g);
    const y = this.world.terrain.surfaceY(c.x);
    g.beginPath();
    g.ellipse(c.x, y, 7, 3.2, 0, Math.PI, 0);
    g.fillStyle = '#e2c48a';
    g.fill();
    g.lineWidth = 0.8;
    g.strokeStyle = INK;
    g.stroke();
    for (const dx of [-2, 2]) {
      g.beginPath();
      g.arc(c.x + dx + c.facing * 2, y - 1.8, 0.8, 0, TAU);
      g.fillStyle = INK;
      g.fill();
    }
  }

  drawSpirit(g, c, x, y) {
    this.setWorld(g);
    const k = c.deadT / 4;
    const hy = y - c.size * 0.6 - c.deadT * 9;
    g.globalAlpha = Math.sin(k * Math.PI) * 0.9;
    g.translate(x, hy);
    drawHalo(g, Math.max(3, c.size * 0.22), 0.9);
    this.setWorld(g);
    for (let i = 0; i < 3; i++) {
      const a = this.time * 2 + i * 2.1;
      g.beginPath();
      g.arc(x + Math.cos(a) * 6, hy + 6 + Math.sin(a) * 3, 0.9, 0, TAU);
      g.fillStyle = '#fff6c9';
      g.fill();
    }
    g.globalAlpha = 1;
  }

  drawWormE(g, c, alpha) {
    if (!c.body) return;
    this.setWorld(g);
    if (c.stage === 'egg') {
      g.beginPath();
      g.ellipse(c.x, c.y, 2.4, 1.6, 0.3, 0, TAU);
      g.fillStyle = '#e8d6a8';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = INK;
      g.stroke();
      return;
    }
    const pal = PALETTES.worm[c.palIdx % PALETTES.worm.length];
    if (c.dead) g.globalAlpha = clamp01(1 - c.deadT / 4);
    const thick = c.stage === 'baby' ? 2 : 3.4;
    const closed = c.dead || c.pose === 'sleep' || (this.time + c.id) % 4.1 < 0.12;
    drawWorm(g, c.body, pal, 0.75, closed, c.acc, c.accColor, thick);
    g.globalAlpha = 1;
  }

  drawColonies(g) {
    const w = this.world;
    this.setWorld(g);
    for (const col of w.colonies) {
      const cx = col.chamber.cx * CELL;
      const cy = col.chamber.cy * CELL;
      if (!this.visible(cx, cy, 120)) continue;
      // larder: little heap of crumbs and seeds
      const n = Math.min(14, Math.ceil(col.food * 2.2));
      for (let i = 0; i < n; i++) {
        const x = cx + 14 + (hash1(i, 3) - 0.5) * 12 + (i % 4) * 2;
        const y = cy + 2.5 - Math.floor(i / 4) * 1.6;
        g.beginPath();
        g.ellipse(x, y, 1.6, 1.1, hash1(i, 4) * 3, 0, TAU);
        g.fillStyle = ['#e8c483', '#d9a35a', '#f2dca6', '#c98f4a'][i % 4];
        g.fill();
        g.lineWidth = 0.4;
        g.strokeStyle = INK;
        g.stroke();
      }
      for (const b of col.brood) {
        if (!this.visible(b.x, b.y, 10)) continue;
        g.setTransform(this.k, 0, 0, this.k, this.k * b.x + this.ox, this.k * b.y + this.oy);
        drawBrood(g, b.stage, 0.7);
      }
      this.setWorld(g);
    }
  }

  drawWaterSurface(g) {
    const t = this.world.terrain;
    const wl = t.waterLevel;
    const row = Math.ceil(wl / CELL);
    const tm = this.time;
    const ripples = this.fx.ripples;
    const wave = (x) => {
      let y = Math.sin(x * 0.05 + tm * 1.8) * 1.1 + Math.sin(x * 0.11 - tm * 1.2) * 0.6;
      for (const r of ripples) {
        const d = Math.abs(x - r.x);
        const front = r.t * 55;
        const k = d - front;
        if (k > -14 && k < 14) y += Math.cos(k * 0.35) * (1 - r.t / 1.6) * 2.2 * r.s;
      }
      return wl + y;
    };
    this.setWorld(g);
    let start = -1;
    for (let cx = 0; cx <= GW; cx++) {
      const open = cx < GW && t.waterTop[cx] === row;
      if (open && start < 0) start = cx;
      if (!open && start >= 0) {
        const x0 = start * CELL;
        const x1 = cx * CELL;
        if (x1 > this.view.x0 && x0 < this.view.x1) {
          g.beginPath();
          g.moveTo(x0, wave(x0));
          for (let x = x0 + 6; x < x1; x += 6) g.lineTo(x, wave(x));
          g.lineTo(x1, wave(x1));
          g.lineTo(x1, wl + 5);
          g.lineTo(x0, wl + 5);
          g.closePath();
          g.fillStyle = 'rgba(255,255,255,0.2)';
          g.fill();
          g.beginPath();
          g.moveTo(x0, wave(x0));
          for (let x = x0 + 6; x < x1; x += 6) g.lineTo(x, wave(x));
          g.lineTo(x1, wave(x1));
          g.lineWidth = 1.6;
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.stroke();
          g.lineWidth = 0.7;
          g.strokeStyle = 'rgba(40,80,120,0.55)';
          g.stroke();
        }
        start = -1;
      }
    }
  }

  drawEquipment(g) {
    const env = this.world.env;
    const t = this.world.terrain;
    this.setWorld(g);
    const shadeCols = { desert: '#e2553f', pond: '#77b255', jungle: '#4c8fd6' };
    for (const z of ['desert', 'pond', 'jungle']) {
      const x = LAMP_X[z];
      if (!this.visible(x, 0, 60)) continue;
      const p = env[z].lamp;
      g.beginPath();
      g.moveTo(x, -26);
      g.lineTo(x, -2);
      g.lineWidth = 1.6;
      g.strokeStyle = INK;
      g.stroke();
      // bulb
      g.beginPath();
      g.ellipse(x, 13, 6.5, 5.5, 0, 0, TAU);
      g.fillStyle = p > 0.02 ? `rgb(${Math.round(lerp(220, 255, p))},${Math.round(lerp(200, 236, p))},${Math.round(lerp(150, 140, p))})` : '#cfc6b4';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = INK;
      g.stroke();
      // shade
      g.beginPath();
      g.moveTo(x - 6, -3);
      g.lineTo(x + 6, -3);
      g.quadraticCurveTo(x + 9, 2, x + 22, 11);
      g.lineTo(x - 22, 11);
      g.quadraticCurveTo(x - 9, 2, x - 6, -3);
      g.closePath();
      g.fillStyle = shadeCols[z];
      g.fill();
      g.lineWidth = 1.3;
      g.stroke();
      g.beginPath();
      g.ellipse(x - 8, 5, 4, 1.4, -0.4, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fill();
    }
    for (const z of ['desert', 'jungle']) {
      const x = MISTER_X[z];
      if (!this.visible(x, 0, 40)) continue;
      const m = env[z].mister;
      g.beginPath();
      g.rect(x - 4, -6, 8, 10);
      g.fillStyle = '#c9a65a';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(x - 5, 4);
      g.lineTo(x + 5, 4);
      g.lineTo(x + 3, 8);
      g.lineTo(x - 3, 8);
      g.closePath();
      g.fillStyle = '#9aa0a6';
      g.fill();
      g.stroke();
      // its water bottle, showing how much is left
      const water = env[z].water;
      const bx = x + 9;
      g.beginPath();
      g.roundRect ? g.roundRect(bx, -16, 9, 18, 2.5) : g.rect(bx, -16, 9, 18);
      g.fillStyle = 'rgba(235,246,252,0.9)';
      g.fill();
      if (water > 0.01) {
        g.fillStyle = '#7cc0e6';
        g.fillRect(bx + 1, 1 - 16 * water, 7, 16 * water);
      }
      g.lineWidth = water < 0.15 && m > 0.02 ? 1.2 + Math.max(0, Math.sin(this.time * 5)) * 0.8 : 1;
      g.strokeStyle = water < 0.15 && m > 0.02 ? '#e2553f' : INK;
      g.stroke();
      g.beginPath();
      g.moveTo(bx + 2, -18);
      g.lineTo(bx + 7, -18);
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 4, -2);
      g.lineTo(bx, -2);
      g.stroke();
      if (env.misting(z) > 0.02) {
        g.save();
        g.globalAlpha = 0.18 * m;
        g.beginPath();
        g.moveTo(x - 3, 8);
        g.lineTo(x + 3, 8);
        g.lineTo(x + 70, 90);
        g.lineTo(x - 70, 90);
        g.closePath();
        g.fillStyle = '#d9f0fb';
        g.fill();
        g.restore();
      }
    }
    // pond heater & filter
    const wl = t.waterLevel;
    if (this.visible(1000, wl, 140)) {
      const p = env.pond;
      g.beginPath();
      g.roundRect ? g.roundRect(986, wl - 30, 9, 110, 4) : g.rect(986, wl - 30, 9, 110);
      g.fillStyle = 'rgba(230,245,250,0.55)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = INK;
      g.stroke();
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(987, wl - 10 + i * 10);
        g.lineTo(994, wl - 5 + i * 10);
        g.lineWidth = 0.8;
        g.strokeStyle = p.heater ? '#e2553f' : '#9a8a7a';
        g.stroke();
      }
      g.beginPath();
      g.arc(990.5, wl - 24, 2.2, 0, TAU);
      g.fillStyle = p.heater ? '#ff5a3c' : '#6a6a6a';
      g.fill();
      // filter box hanging on the right (it browns as the sponge clogs)
      g.beginPath();
      g.rect(1018, wl - 46, 36, 30);
      const gunk = 1 - p.filterClean;
      g.fillStyle = `rgb(${Math.round(lerp(232, 168, gunk))},${Math.round(lerp(226, 148, gunk))},${Math.round(lerp(214, 104, gunk))})`;
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.rect(1032, wl - 16, 6, 90);
      g.fillStyle = 'rgba(220,235,240,0.7)';
      g.fill();
      g.stroke();
      g.font = "bold 7px 'Patrick Hand', sans-serif";
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.fillText('FILTER', 1036, wl - 28);
      // the fill line on the glass, once the pond has evaporated below it
      if (wl - p.full > 6 && this.visible(800, p.full, 300)) {
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(700, p.full);
        g.lineTo(980, p.full);
        g.lineWidth = 0.9;
        g.strokeStyle = 'rgba(40,80,120,0.6)';
        g.stroke();
        g.setLineDash([]);
        g.font = "7px 'Patrick Hand', sans-serif";
        g.textAlign = 'left';
        g.fillStyle = 'rgba(40,80,120,0.8)';
        g.fillText('fill line', 704, p.full - 2.5);
      }
      if (this.world.env.filterFlow > 0.02) {
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const yy = wl - 16 + i * 4;
          g.moveTo(1018, yy);
          g.quadraticCurveTo(1010, yy + 2 + Math.sin(this.time * 8 + i) * 1.5, 1004, wl + 2);
        }
        g.lineWidth = 1.1;
        g.strokeStyle = `rgba(200,235,250,${0.4 + this.world.env.filterFlow * 0.5})`;
        g.stroke();
      }
    }
  }

  // Strip thermometers stuck on the glass: the green patch is what the zone's
  // critters find comfy, the red liquid is the air (or water) right now.
  // Desert and jungle also get a little dampness dial.
  drawGauges(g) {
    const w = this.world;
    this.setWorld(g);
    if (!this.gaugeT || this.time - this.gaugeT > 0.5) {
      this.gaugeT = this.time;
      this.gaugeSt = {};
      for (const z of Object.keys(GAUGE_AT)) this.gaugeSt[z] = zoneStatus(w, z, zoneBand(w, z));
    }
    const Tmin = 0;
    const Tmax = 45;
    for (const [z, [x, y]] of Object.entries(GAUGE_AT)) {
      if (!this.visible(x, y + 30, 40)) continue;
      const st = this.gaugeSt[z];
      const top = y;
      const bot = y + 50;
      const ty = (T) => bot - clamp01((T - Tmin) / (Tmax - Tmin)) * (bot - top);
      // card backing
      g.beginPath();
      g.roundRect ? g.roundRect(x - 7, top - 5, 14, bot - top + 16, 4) : g.rect(x - 7, top - 5, 14, bot - top + 16);
      g.fillStyle = 'rgba(255,253,246,0.88)';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = st.sev >= 2 ? '#e2553f' : INK;
      g.stroke();
      // comfy band
      const [lo, hi] = st.band.t;
      g.fillStyle = 'rgba(119,178,85,0.55)';
      g.fillRect(x - 5.5, ty(hi + 0.5), 11, Math.max(1.5, ty(lo - 0.5) - ty(hi + 0.5)));
      // ticks every 10 degrees
      g.beginPath();
      for (let T = 10; T < Tmax; T += 10) {
        g.moveTo(x + 2.5, ty(T));
        g.lineTo(x + 5, ty(T));
      }
      g.lineWidth = 0.5;
      g.strokeStyle = 'rgba(58,42,31,0.6)';
      g.stroke();
      // tube, liquid and bulb
      const col = st.tState === 'hot' ? '#e2453f' : st.tState === 'cold' ? '#4c8fd6' : '#e8603c';
      g.beginPath();
      g.roundRect ? g.roundRect(x - 1.8, top, 3.6, bot - top + 4, 1.8) : g.rect(x - 1.8, top, 3.6, bot - top + 4);
      g.fillStyle = '#fff';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = INK;
      g.stroke();
      g.fillStyle = col;
      const ly = Math.max(top + 1, ty(st.T));
      g.fillRect(x - 1, ly, 2, bot + 4 - ly);
      g.beginPath();
      g.arc(x, bot + 5, 3.2, 0, TAU);
      g.fill();
      g.stroke();
      // an arrow saying which way to go
      if (st.tState !== 'ok') {
        const up = st.tState === 'cold';
        const ay = up ? top + 2 : bot - 6;
        const bob = Math.sin(this.time * 4) * 1.2;
        g.beginPath();
        g.moveTo(x + 9, ay + (up ? 4 : 0) + bob);
        g.lineTo(x + 12, ay + (up ? 0 : 4) + bob);
        g.lineTo(x + 15, ay + (up ? 4 : 0) + bob);
        g.lineWidth = 1.6;
        g.strokeStyle = up ? '#4c8fd6' : '#e2453f';
        g.stroke();
      }
      // dampness dial
      if (st.band.m) {
        const dx = x;
        const dy = bot + 18;
        g.beginPath();
        g.arc(dx, dy, 6.5, 0, TAU);
        g.fillStyle = 'rgba(255,253,246,0.9)';
        g.fill();
        g.lineWidth = st.mState !== 'ok' ? 1.4 : 0.8;
        g.strokeStyle = st.mState !== 'ok' ? '#e2553f' : INK;
        g.stroke();
        const a0 = Math.PI * 0.75;
        const span = Math.PI * 1.5;
        g.beginPath();
        g.arc(dx, dy, 4.6, a0 + span * st.band.m[0], a0 + span * Math.min(1, st.band.m[1]));
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(119,178,85,0.85)';
        g.stroke();
        const a = a0 + span * clamp01(st.M);
        g.beginPath();
        g.moveTo(dx, dy);
        g.lineTo(dx + Math.cos(a) * 4.8, dy + Math.sin(a) * 4.8);
        g.lineWidth = 1;
        g.strokeStyle = '#2a6fc0';
        g.stroke();
      }
    }
  }

  drawSelection(g, c, alpha) {
    if (c.kind !== 'creature' && c.kind !== 'plant' && c.kind !== 'decor' && c.kind !== 'food') return;
    this.setWorld(g);
    let x = c.x;
    let y = c.y;
    let r = 14;
    if (c.kind === 'creature') {
      x = c.px + (c.x - c.px) * alpha;
      y = c.py + (c.y - c.py) * alpha;
      r = Math.max(8, c.size * 0.7);
    } else if (c.kind === 'plant') {
      y = c.y - 14;
      r = 20;
    } else if (c.kind === 'decor') {
      y = c.y - c.def.h / 2;
      r = Math.max(c.def.w, c.def.h) * 0.6;
    }
    g.beginPath();
    g.arc(x, y, r + Math.sin(this.time * 4) * 1.2, 0, TAU);
    g.setLineDash([4, 3]);
    g.lineWidth = 1.6 / Math.max(0.6, this.cam.zoom);
    g.strokeStyle = '#f6d64a';
    g.stroke();
    g.setLineDash([]);
  }

  drawGlass(g) {
    this.setWorld(g);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.07)';
    const band = (x, w) => {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, 0);
      g.lineTo(x + w - 260, H);
      g.lineTo(x - 260, H);
      g.closePath();
      g.fill();
    };
    band(230, 70);
    band(330, 18);
    band(1240, 50);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    band(1305, 10);
    g.restore();
  }

  drawFrame(g, view) {
    const style = this.world.style.frame || 'wood';
    const col = { wood: '#b77d4b', red: '#d9483b', blue: '#4c8fd6', green: '#6fae4a', yellow: '#f0bf45' }[style] || '#b77d4b';
    const T = 20;
    g.beginPath();
    g.rect(-T, -T - 6, W + T * 2, H + T * 2 + 6);
    g.rect(0, 0, W, H);
    g.fillStyle = col;
    g.fill('evenodd');
    g.lineWidth = 2;
    g.strokeStyle = INK;
    g.stroke();
    // bevel highlights
    g.beginPath();
    g.moveTo(-T + 4, H + T - 4);
    g.lineTo(-T + 4, -T - 2);
    g.lineTo(W + T - 4, -T - 2);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.stroke();
    // screws
    for (const [x, y] of [[-T / 2, -T / 2 - 3], [W + T / 2, -T / 2 - 3], [-T / 2, H + T / 2], [W + T / 2, H + T / 2], [W / 2, -T / 2 - 3], [W / 2, H + T / 2]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, TAU);
      g.fillStyle = '#e8e2d6';
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(x - 2, y);
      g.lineTo(x + 2, y);
      g.stroke();
    }
    // name plate
    g.beginPath();
    g.rect(W / 2 - 60, H + 3, 120, 14);
    g.fillStyle = '#f6efe0';
    g.fill();
    g.lineWidth = 1.2;
    g.stroke();
    g.font = "bold 11px 'Chewy', 'Patrick Hand', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#9a3c2e';
    g.fillText('BUG FARM', W / 2, H + 10.5);
  }

  drawNight(g, view) {
    const env = this.world.env;
    const dark = (1 - env.sun) * 0.6;
    if (dark < 0.01) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = `rgba(16,24,58,${dark})`;
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    this.setWorld(g);
    g.globalCompositeOperation = 'lighter';
    // heat lamp glow
    for (const z of ['desert', 'pond', 'jungle']) {
      const p = env[z].lamp;
      if (p < 0.03) continue;
      const x = LAMP_X[z];
      const spr = this.glowSprite('rgba(255,190,110,0.9)');
      g.globalAlpha = Math.min(1, p * 0.9) * dark * 1.3;
      g.drawImage(spr, x - 260, -120, 520, 640);
      g.globalAlpha = Math.min(1, p) * 0.9;
      const b = this.glowSprite('rgba(255,240,190,1)');
      g.drawImage(b, x - 22, -9, 44, 44);
    }
    for (const d of this.world.decor) {
      if (!d.def.light || !this.visible(d.x, d.y, 100)) continue;
      const spr = this.glowSprite('rgba(255,225,140,0.9)');
      g.globalAlpha = dark * 1.2;
      g.drawImage(spr, d.x - 70, d.y - 135, 140, 140);
    }
    const ff = this.glowSprite('rgba(214,255,120,1)');
    for (const c of this.world.creatures) {
      if (c.sp !== 'firefly' || c.dead || c.glow < 0.02 || !this.visible(c.x, c.y, 30)) continue;
      const lx = c.x - c.facing * 5;
      const ly = c.y + 1;
      g.globalAlpha = c.glow;
      g.drawImage(ff, lx - 16, ly - 16, 32, 32);
      g.globalAlpha = c.glow * 0.4;
      g.drawImage(ff, lx - 40, ly - 40, 80, 80);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  drawLens(g, view, dt) {
    const w = this.world;
    const t = w.terrain;
    this.setWorld(g);
    if (this.lens === 'temp' || this.lens === 'moist') {
      this.lensT -= dt;
      const S = 24;
      if (!this.lensCanvas || this.lensT <= 0 || this.lensKind !== this.lens) {
        this.lensT = 0.5;
        this.lensKind = this.lens;
        const cw = Math.ceil(W / S);
        const ch = Math.ceil(H / S);
        if (!this.lensCanvas) {
          this.lensCanvas = document.createElement('canvas');
          this.lensCanvas.width = cw;
          this.lensCanvas.height = ch;
        }
        const lg = this.lensCanvas.getContext('2d');
        const img = lg.createImageData(cw, ch);
        for (let j = 0; j < ch; j++) {
          for (let i = 0; i < cw; i++) {
            const x = i * S + S / 2;
            const y = j * S + S / 2;
            let r;
            let gg;
            let b;
            if (this.lens === 'temp') {
              const T = w.env.tempAt(x, y, t);
              const k = clamp01((T - 8) / 34);
              r = k < 0.5 ? lerp(60, 120, k * 2) : lerp(120, 240, (k - 0.5) * 2);
              gg = k < 0.5 ? lerp(120, 220, k * 2) : lerp(220, 70, (k - 0.5) * 2);
              b = k < 0.5 ? lerp(240, 90, k * 2) : lerp(90, 40, (k - 0.5) * 2);
            } else {
              const M = w.env.moistAt(x, y, t);
              r = lerp(225, 60, M);
              gg = lerp(170, 140, M);
              b = lerp(90, 235, M);
            }
            const o = (j * cw + i) * 4;
            img.data[o] = r;
            img.data[o + 1] = gg;
            img.data[o + 2] = b;
            img.data[o + 3] = 120;
          }
        }
        lg.putImageData(img, 0, 0);
      }
      g.imageSmoothingEnabled = true;
      g.drawImage(this.lensCanvas, 0, 0, W, H);
    } else if (this.lens === 'minds') {
      // show what everyone is thinking about: their current goal
      g.lineWidth = 1.2 / Math.max(0.5, this.cam.zoom);
      for (const c of w.creatures) {
        if (c.dead || !this.visible(c.x, c.y, 40)) continue;
        let tp = null;
        if (c.mode === 'crawl' && c.path && c.path.length) {
          const idx = c.path[c.path.length - 1];
          tp = [(idx % GW) * CELL + 2, Math.floor(idx / GW) * CELL + 2];
        } else tp = c.targetPos(w);
        const b = c.brain.b ? c.brain.b.id : 'idle';
        const col = /forage|antForage|hunt|graze|sap|pollinate/.test(b) ? '#e8803a' : /rest|hide|antRest/.test(b) ? '#7c8fd6' : /flee|antFlee/.test(b) ? '#e2453f' : /mate|courted/.test(b) ? '#e57a8a' : /comfort|bask|huddle|estivate/.test(b) ? '#d9b02a' : /dig|Deliver/.test(b) ? '#9a6a3f' : '#77b255';
        g.strokeStyle = col;
        g.fillStyle = col;
        if (tp) {
          g.setLineDash([3, 3]);
          g.beginPath();
          g.moveTo(c.x, c.y);
          g.lineTo(tp[0], tp[1]);
          g.stroke();
          g.setLineDash([]);
          g.beginPath();
          g.arc(tp[0], tp[1], 2, 0, TAU);
          g.fill();
        }
        g.beginPath();
        g.arc(c.x, c.y, 2.2, 0, TAU);
        g.fill();
      }
    } else if (this.lens === 'scent') {
      for (const col of w.colonies) {
        g.fillStyle = 'rgba(120,220,90,0.85)';
        for (const idx of col.pherActive) {
          const v = col.pher[idx];
          const x = (idx % GW) * CELL;
          const y = Math.floor(idx / GW) * CELL;
          if (!this.visible(x, y, 4)) continue;
          g.globalAlpha = Math.min(1, v * 1.5);
          g.fillRect(x, y, CELL, CELL);
        }
        g.globalAlpha = 1;
        for (const f of col.fronts) {
          const x = (f.kind === 'chamber' ? f.ox : f.cx) * CELL;
          const y = (f.kind === 'chamber' ? f.oy : f.cy) * CELL;
          g.beginPath();
          g.arc(x, y, 4, 0, TAU);
          g.strokeStyle = '#f0bf45';
          g.lineWidth = 1.4;
          g.stroke();
        }
        for (const s of col.foodSpots) {
          g.beginPath();
          g.arc(s.x, s.y - 6, 5, 0, TAU);
          g.strokeStyle = '#e8803a';
          g.lineWidth = 1.6;
          g.stroke();
        }
      }
    }
  }

  drawGhost(g) {
    const gh = this.ghost;
    this.setWorld(g);
    g.globalAlpha = 0.55;
    if (gh.kind === 'brush') {
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(gh.x, gh.y, gh.r, 0, TAU);
      g.setLineDash([5, 4]);
      g.lineWidth = 1.5 / Math.max(0.5, this.cam.zoom);
      g.strokeStyle = gh.ok === false ? '#e2453f' : '#ffffff';
      g.stroke();
      g.setLineDash([]);
    } else if (gh.kind === 'decor') {
      const box = decorBox(gh.def);
      const s = this.sprites.get('d|' + gh.def.id, Math.min(this.bucket, 3), box, (gg) => DECOR_ART[gh.def.id](gg, 0));
      this.put(g, gh.x, gh.y, 0, 1, 1);
      g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
    }
    g.globalAlpha = 1;
    if (gh.ok === false) {
      this.setWorld(g);
      g.beginPath();
      g.arc(gh.x, gh.y - 10, 9, 0, TAU);
      g.lineWidth = 2;
      g.strokeStyle = '#e2453f';
      g.stroke();
      g.beginPath();
      g.moveTo(gh.x - 6, gh.y - 16);
      g.lineTo(gh.x + 6, gh.y - 4);
      g.stroke();
    }
  }

  drawEmotes(g, alpha) {
    const cam = this.cam;
    const dpr = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const size = 30 * dpr * clamp(0.75 + cam.zoom * 0.25, 0.8, 1.1);
    for (const c of this.world.creatures) {
      if (c.emoteT <= 0 || !c.emoteIcon || c.hidden && c.emoteIcon !== 'zzz') continue;
      if (!this.visible(c.x, c.y, 20)) continue;
      const x = c.px + (c.x - c.px) * alpha;
      const y = c.py + (c.y - c.py) * alpha;
      const [sx, sy] = cam.toScreen(x, y - c.size * 0.55);
      const k = Math.min(1, c.emoteT * 3, (2.4 - Math.max(0, c.emoteT - 0)) * 4);
      const bob = Math.sin(this.time * 4 + c.id) * 2 * dpr;
      const spr = this.emoteSprite(c.emoteIcon);
      g.globalAlpha = clamp01(Math.min(k, c.emoteT * 2));
      g.drawImage(spr, sx * dpr - size / 2, sy * dpr - size + bob, size, size);
    }
    g.globalAlpha = 1;
  }
}

export { QUALITY };
