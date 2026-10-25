// Draws the tank. Static things (terrain, backdrop, water body, plants) are
// cached; per frame we mostly blit sprites with a single setTransform each.
import { W, H, CELL, GW, INK, ZONE_X, ZONE_MID, X } from '../config.js';
import { TerrainRenderer } from './terrainRender.js';
import { SpriteCache, bucketFor } from './sprites.js';
import { Particles } from './particles.js';
import { Ambient } from './ambient.js';
import { breeze } from '../world/breeze.js';
import { CREATURE_ART, PALETTES, WINGS, wingAngle, butterflyLift, drawWingBlade, wingBox, drawButterflyWings, drawWorm, drawBrood, drawHalo } from '../art/creatures.js';
import { drawMothWings, drawDragonWing } from '../art/morecritters.js';
import { rainBarrel, climateKeeper, sprinklerHead } from '../art/wares.js';
import { SPRINKLER_X, CLIMATE_X } from '../data/market.js';
import { drawFood } from '../art/food.js';
import { drawPlant } from '../art/plants.js';
import { drawVine, vineBox } from '../art/vines.js';
import { DECOR_ART, decorBox } from '../art/decor.js';
import { drawGood, goodBox } from '../art/goods.js';
import { drawIcon } from '../art/icons.js';
import { paintBackdrop, makeWallpaperTile, makeWoodTile } from '../art/backdrops.js';
import { setMisregistration } from '../art/ink.js';
import { finishSprite, grainTile } from '../art/paper.js';
import { LightRays } from './light.js';
import { DeepWater } from './deepwater.js';
import { LAMP_X, MISTER_X, MIST_HALF, HEATER_X, FILTER_X } from '../world/environment.js';
import { heatLamp, mister, pondHeater, pondFilter, tag } from '../art/equipment.js';
import { zoneBand, zoneStatus } from '../sim/care.js';
import { GAUGE_AT, equipmentBox } from '../sim/equipment.js';
import { angleDiff, clamp, clamp01, lerp } from '../util/math.js';
import { hash1, rrange } from '../util/rng.js';
import { plateText } from '../sim/keeper.js';

const TAU = Math.PI * 2;
const QUALITY = {
  low: { dprCap: 1, terrainS: 1, backdrop: 0.4, particles: 110, rays: false, liveRays: false, reflections: false, budget: 6, maxBucket: 2 },
  medium: { dprCap: 2, terrainS: 1.5, backdrop: 0.6, particles: 220, rays: true, liveRays: false, reflections: true, budget: 10, maxBucket: 4 },
  high: { dprCap: 3, terrainS: 2, backdrop: 0.8, particles: 320, rays: true, liveRays: true, reflections: true, budget: 16, maxBucket: 4 },
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
  guppy: ['swim'],
  tetra: ['swim'],
  koi: ['swim'],
  puffer: ['swim', 'puff'],
  axolotl: ['idle', 'walk', 'swim'],
  dragonfly: ['idle', 'walk', 'fly'],
  moth: ['idle', 'walk', 'fly'],
};
const FRAMES = { walk: 4, fly: 2, swim: 4, chirp: 2 };
// How much each walker bobs with its footsteps (snails glide instead).
const STEP_BOB = { axolotl: 0.3, dragonfly: 0.2, moth: 0.3, cricket: 0.45, grasshopper: 0.4, gecko: 0.5, beetle: 0.35, turtle: 0.45, ladybug: 0.3, pillbug: 0.3, aphid: 0.2, shrimp: 0.25, firefly: 0.25, butterfly: 0.3, frog: 0.3, ant: 0.18 };
function artPose(c) {
  let p = c.pose;
  if (c.dead) p = 'idle';
  else if (c.mode === 'fly') p = c.sp === 'bee' && (c.memory.pollen || 0) > 0 ? 'pollen' : 'fly';
  else if (c.mode === 'swim' && p !== 'gasp' && p !== 'bask') p = 'swim';
  else if (c.mode === 'air') p = 'jump';
  else if (p === 'sleep' || p === 'idle' || p === 'eat') {
    if (c.moving && p !== 'sleep') p = c.carry ? 'carry' : 'walk';
    else if (p === 'sleep') p = 'idle';
  }
  if (c.sp === 'ant' && c.moving && c.carry) p = c.pose === 'dig' ? 'dig' : 'carry';
  if ((c.sp === 'butterfly' || c.sp === 'moth') && c.stage !== 'adult') p = c.moving ? 'walk' : 'idle';
  if (c.sp === 'dragonfly' && c.stage === 'nymph') p = c.moving ? 'walk' : 'idle';
  if (c.def.fish) p = c.def.puffs && c.fear > 0.45 ? 'puff' : p === 'gasp' && c.sp === 'goldfish' ? 'gasp' : 'swim';
  if (c.sp === 'bee' && p !== 'pollen') p = 'fly';
  if (c.sp === 'fruitfly') p = 'fly';
  if (c.sp === 'frog' && c.stage !== 'adult') p = c.stage === 'egg' ? 'idle' : 'swim';
  const ok = POSES[c.sp];
  if (ok && !ok.includes(p)) p = ok[0];
  return p;
}

// A vine yellowing and browning with age (or a drought): a wash of autumn
// colour over its leaves, deeper as it goes.
function withered(g, box, k) {
  const [x0, y0, x1, y1] = box;
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = k < 0.5 ? `rgba(206,178,74,${(k * 0.9).toFixed(3)})` : `rgba(160,108,52,${(0.3 + k * 0.4).toFixed(3)})`;
  // (the pot or moss ball it hangs from doesn't wither)
  g.fillRect(x0, Math.max(y0, 22), x1 - x0, y1 - Math.max(y0, 22));
  g.restore();
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
    this.ambient = new Ambient();
    this.light = new LightRays();
    this.deep = new DeepWater();
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
    this.prevWT = 0; // tank time at the last frame, for things that turn with it
    this.wdt = 0;
    this.frameN = 0;
    this.mail = 0; // letters from Busytown waiting (raises the mailbox flag)
    this.floats = []; // coins floating up where they were earned
    this.setQuality('medium', true);
  }

  setQuality(name, force) {
    if (!QUALITY[name]) name = 'medium';
    if (name === this.qualityName && !force) return;
    this.qualityName = name;
    this.q = QUALITY[name];
    this.fx.setMax(this.q.particles);
    this.ambient.setQuality(this.q);
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

  // Water colour follows the pond's health and the chosen tint; the water
  // itself is painted in chunks by the terrain renderer as it flows.
  ensureWater() {
    const t = this.world.terrain;
    const p = this.world.env.pond;
    const tint = this.world.style.water || 'clear';
    const murk = 1 - p.clarity;
    const algae = Math.min(1, p.algae * 1.5);
    const key = Math.round(p.clarity * 10) + '|' + Math.round(p.algae * 10) + '|' + tint + '|' + Math.round(t.waterLevel / 24);
    if (key !== this.waterKey) {
      this.waterKey = key;
      const base = {
        clear: [[168, 222, 240], [110, 182, 220], [60, 122, 176]],
        teal: [[152, 224, 210], [92, 180, 184], [38, 120, 134]],
        green: [[180, 220, 168], [124, 176, 128], [58, 114, 86]],
        blue: [[140, 196, 244], [90, 146, 222], [40, 80, 164]],
      }[tint] || [[168, 222, 240], [110, 182, 220], [60, 122, 176]];
      const mixRGB = (col) => [lerp(lerp(col[0], 150, algae * 0.6), 150, murk * 0.7), lerp(lerp(col[1], 190, algae * 0.6), 135, murk * 0.7), lerp(lerp(col[2], 110, algae * 0.6), 90, murk * 0.7)];
      const mixc = (col, a = 1) => {
        const [r, gg, b] = mixRGB(col);
        return `rgba(${Math.round(r)},${Math.round(gg)},${Math.round(b)},${a})`;
      };
      const deep = base[2];
      // how deep the pond goes, so the wash and the far wall darken all the
      // way to its bottom
      let bottom = t.waterLevel + 60;
      for (let x = 0; x < W; x += 8) {
        const fy = t.surfaceY(x);
        if (fy > bottom && t.waterAt(x, fy - CELL)) bottom = fy;
      }
      const shade = (c, k) => c.map((v) => v * k);
      const gv = { natural: [150, 132, 108], rainbow: [150, 130, 160], ocean: [96, 140, 170] }[this.world.style.gravel] || [150, 132, 108];
      this.deep.setLook({ key, top: mixRGB(base[0].map((v) => v * 0.97)), mid: mixRGB(shade(base[1], 0.86)), deep: mixRGB(shade(deep, 0.62)), gravel: gv }, t.waterLevel, bottom, this.q.backdrop);
      this.tr.setWaterLook({
        key,
        top: t.waterLevel,
        depth: Math.max(80, bottom - t.waterLevel),
        c0: mixc(base[0]),
        c1: mixc(base[1]),
        c2: mixc(base[2]),
        pool: mixc([deep[0] * 0.7, deep[1] * 0.75, deep[2] * 0.85], 0.22),
        bloomLight: 'rgba(255,255,255,0.16)',
        bloomDark: mixc(deep, 0.16),
      });
      this.waterAlpha = 0.5 + murk * 0.36;
    }
    this.tr.updateWater(this.view, this.q.budget > 8 ? 3 : 2);
  }

  drawWater(g) {
    this.tr.drawWater(g, this.view, this.waterAlpha || 0.5, this.k, this.ox, this.oy);
    this.setWorld(g);
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
    // (still pond rays are baked in, so the pond's level and clarity count)
    const rayKey = this.q.rays ? (this.q.liveRays ? 'L' : Math.round(this.world.terrain.waterLevel / 8) + ':' + Math.round(env.pond.clarity * 5)) : 0;
    const key = [this.k.toFixed(5), this.backdropKey, rayKey, st.frame, st.wallpaper, plateText(this.world.keeper), Math.round(env.desert.lamp * 10), Math.round(env.pond.lamp * 10), Math.round(env.jungle.lamp * 10), Math.round(env.sun * 6), this.tr.version || 0].join('|');
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
    if (this.q.rays) {
      this.light.bake(g, [k, ox, oy], this.world, !this.q.liveRays);
      g.setTransform(k, 0, 0, k, ox, oy);
    }
    this.tr.draw(g, view);
    // the whole scene inside the glass is painted on watercolour paper
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.patterns.grain || this.patterns.grainCtx !== g) {
      this.patterns.grain = g.createPattern(grainTile(), 'repeat');
      this.patterns.grainCtx = g;
    }
    g.fillStyle = this.patterns.grain;
    g.fillRect(0, 0, this.bg.width, this.bg.height);
    g.restore();
    if (this.q.reflections) this.light.glare(g, [k, ox, oy]);
    g.setTransform(k, 0, 0, k, ox, oy);
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
    this.dt = dt;
    this.frameN++;
    if (!this.paused) this.flapT += dt;
    this.fx.update(dt, t, this.time);
    this.ensureBackdrop();
    const view = cam.view(40);
    this.view = view;
    this.wdt = clamp(w.time - (this.prevWT || w.time), 0, 1);
    this.prevWT = w.time;
    if (!this.paused) this.ambient.update(dt, w, view);
    this.ensureWater();
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

    // --- the far side of the pond, then the underwater layer (drawn before
    // the water so it looks submerged)
    this.deep.draw(g, this, t, this.tr.waterShape(), this.tr.waterPathVer);
    const sel = this.selected;
    for (const p of w.plants) if (p.def.aquatic && this.visible(p.x, p.y, 120)) this.drawPlantE(g, p);
    for (const d of w.decor) if (d.def.place === 'floor' && t.waterAt(d.x, d.y - 4) && this.visible(d.x, d.y, 80)) this.drawDecorE(g, d);
    for (const f of w.foods) if (f.inWater && f.state !== 'float' && this.visible(f.x, f.y, 20)) this.drawFoodE(g, f, alpha);
    // swimmers further back are drawn first, so the near ones pass in front
    const wet = (this.wetList = this.wetList || []);
    wet.length = 0;
    for (const c of w.creatures) {
      if (!this.visible(c.x, c.y, 40)) continue;
      if (t.waterAt(c.x, c.y) && c.sp !== 'worm') {
        this.depthOf(c);
        wet.push(c);
      }
    }
    wet.sort((a, b) => b.dz - a.dz);
    for (const c of wet) this.drawCreatureE(g, c, alpha);
    this.setWorld(g);
    this.ambient.drawMotes(g, view, w);
    this.drawPondGear(g);
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
    this.drawGoods(g, false);
    let doorstep = 0;
    for (const c of w.creatures) {
      if (c.sp === 'worm' || !this.visible(c.x, c.y, 40) || t.waterAt(c.x, c.y)) continue;
      // anyone at a front door is drawn after the houses, on the doorstep
      if (c.inside || c.doorT > 0) doorstep++;
      else this.drawCreatureE(g, c, alpha);
    }
    this.setWorld(g);
    for (const d of w.decor) if (d.def.shelter && !(d.def.place === 'floor' && t.waterAt(d.x, d.y - 4)) && this.visible(d.x, d.y, 90)) this.drawDecorE(g, d);
    if (doorstep) {
      for (const c of w.creatures) {
        if ((c.inside || c.doorT > 0) && c.sp !== 'worm' && this.visible(c.x, c.y, 40) && !t.waterAt(c.x, c.y)) this.drawCreatureE(g, c, alpha);
      }
      this.setWorld(g);
    }
    this.homeLife(w);
    this.drawWaterSurface(g);
    this.ambient.drawBits(g, view, this);
    this.drawGoods(g, true);
    this.light.draw(this, g, w, this.time, { rays: this.q.rays, liveWater: this.q.liveRays });
    this.fx.draw(g, view, cam.zoom);
    this.drawEquipment(g);
    this.drawGauges(g);
    if (sel && !sel.removed) this.drawSelection(g, sel, alpha);
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

  // (painted into the cached background, so beams use its offset)
  drawLampCones(g) {
    const env = this.world.env;
    const m = [this.k, this.bgOx + this.bgM[0], this.bgOy + this.bgM[1]];
    for (const z of ['desert', 'pond', 'jungle']) {
      const p = env[z].lamp;
      if (p < 0.05) continue;
      this.light.lampCone(m, g, LAMP_X[z], p, env.sun);
    }
    g.globalAlpha = 1;
    g.setTransform(m[0], 0, 0, m[0], m[1], m[2]);
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
        finishSprite(gg, S.box);
        e = { canvas: c, ver: p.shapeVersion, b, x0, y0, w: x1 - x0, h: y1 - y0 };
        this.plantCache.set(p, e);
      }
    }
    if (!e) return;
    // bent by the breeze (or the pond's current): a shear keeps the base
    // planted while the tip leans over
    const L = p.lean(this.world.time);
    this.put(g, p.x, p.y, L.la, 1, 1);
    if (L.lk) g.transform(1, 0, -L.lk, 1, 0, 0);
    if (L.lw && this.q.budget > 8) {
      // eelgrass ribbons ripple: draw it in bands, each nudged along the wave
      const n = 10;
      const sh = e.h / n;
      const ph = e.canvas.height / n;
      for (let j = 0; j < n; j++) {
        const ly = e.y0 + (j + 0.5) * sh;
        const dx = p.bendX(ly) + L.lk * ly; // (the shear is already in the transform)
        g.drawImage(e.canvas, 0, j * ph, e.canvas.width, Math.min(ph + 1, e.canvas.height - j * ph), e.x0 + dx, e.y0 + j * sh, e.w, sh + 0.6);
      }
    } else g.drawImage(e.canvas, e.x0, e.y0, e.w, e.h);
    if (this.plantCache.size > 200) {
      for (const k of this.plantCache.keys()) if (k.removed) this.plantCache.delete(k);
    }
  }

  // Goods waiting to be collected pop in, bob gently and twinkle now and
  // then so they're easy to spot. floating: just the water lilies.
  drawGoods(g, floating) {
    const w = this.world;
    if (!w.goods.length) return;
    const b = Math.min(this.bucket, 3);
    for (const gd of w.goods) {
      if ((gd.type === 'lily') !== floating || !this.visible(gd.x, gd.y, 30)) continue;
      const s = this.sprites.get('gd|' + gd.type + gd.look, b, goodBox(gd.type), (gg) => drawGood(gg, gd.type, gd.look));
      const k = Math.sin(this.time * 2.2 + gd.id);
      const sc = 0.5 + 0.5 * clamp01(gd.age / 0.5);
      const bob = gd.type === 'lily' ? k * 0.6 : gd.type === 'honey' || gd.type === 'compost' ? 0 : k * 0.4;
      this.put(g, gd.x, gd.y + bob, gd.type === 'silk' ? k * 0.08 : 0, sc, sc);
      g.globalAlpha = clamp01((gd.life - gd.age) / 30);
      g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
      g.globalAlpha = 1;
      if (!this.paused && (this.time + gd.id * 0.77) % 3.4 < (this.dt || 0)) this.fx.sparkle(gd.x, gd.y - 6, 1);
    }
    this.setWorld(g);
  }

  // The bee hotel's nesting holes fill with honey, bottom row first, as the
  // bees bring pollen home.
  drawHoneycomb(g, d) {
    const n = Math.round(this.world.honeyFill(d) * 12);
    for (let i = 0; i < n; i++) {
      const x = -8.4 + (i % 4) * 5.6;
      const y = -26 - Math.floor(i / 4) * 7;
      g.beginPath();
      g.arc(x, y, 1.9, 0, TAU);
      g.fillStyle = '#f0a830';
      g.fill();
      g.beginPath();
      g.arc(x - 0.6, y - 0.6, 0.6, 0, TAU);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fill();
    }
  }

  // The jungle's vines (see world/vines.js), each swinging from its hook like
  // a rope: a little pendulum pushed by the breeze, in real time so it's
  // smooth at any speed, and bent along its length (stiff at the hook, free
  // at the tip) by drawing it in thin slices that each lean a little more.
  // A withering vine yellows, browns and sheds the odd leaf.
  drawVines(g) {
    const vines = this.world.vines.list;
    if (!vines.length) return;
    const b = Math.min(this.bucket, 3);
    const dt = this.paused ? 0 : Math.min(0.05, this.dt || 0.016);
    const tm = this.time;
    for (const v of vines) {
      const box = vineBox(v);
      if (!this.visible(v.x + (box[0] + box[2]) / 2, box[3] / 2, (box[2] - box[0]) / 2 + box[3] / 2)) continue;
      // (redrawn as it grows and as it fades, a step at a time)
      const len = Math.round(v.len / 6) * 6;
      const wi = Math.round(v.wither * 8);
      const art = len === v.len ? v : { ...v, len };
      const s = this.sprites.get('vine|' + v.kind + '|' + v.seed + '|' + len + '|' + wi, b, vineBox(art), (gg) => {
        drawVine(gg, art);
        if (wi) withered(gg, vineBox(art), wi / 8);
      });
      // the swing: the breeze (smoothed, so a gust builds and fades) pushes
      // the tip downwind; the vine swings back and settles
      const sw = v._sw || (v._sw = { a: 0, va: 0, wind: 0, ph: hash1(v.id, 5) * TAU });
      sw.wind += (breeze.wind(v.x + (v.span || 0) / 2) - sw.wind) * (1 - Math.exp(-dt / 0.45));
      const L = Math.max(40, v.len);
      const k = 26 / L; // longer vines swing more slowly
      const target = -sw.wind * (v.span ? 0.1 : 0.27) + Math.sin(tm * 0.55 + sw.ph) * (v.span ? 0.008 : 0.025);
      sw.va += ((target - sw.a) * k * 9 - sw.va * 1.6) * dt;
      sw.a += sw.va * dt;
      const tip = -Math.sin(sw.a) * L; // how far the tip has swung sideways
      // a quick ripple running down the strand while the air's moving
      const flutter = Math.min(1, Math.abs(sw.wind)) * 2.2;
      const off = (y) => {
        const u = Math.max(0, y) / L;
        return tip * Math.pow(Math.min(1, u), 1.6) + flutter * u * Math.sin(y * 0.05 - tm * 4.2 + sw.ph);
      };
      this.drawBent(g, s, v.x, off, this.q.budget > 8 ? 14 : 6);
      // an old vine drops a yellowed leaf now and then
      if (dt && v.wither > 0.3 && Math.random() < dt * v.wither * 0.35) {
        this.ambient.add('leaf', v.x + off(L * 0.7) + rrange(-10, 10), rrange(L * 0.35, L * 0.95), v.wither > 0.7 ? '#a8763c' : '#c9b04a');
      }
    }
    this.setWorld(g);
  }

  // Draw a hanging sprite (hooked at x, y=0) bent sideways by off(y): it's
  // cut into horizontal slices and each is sheared so its top and bottom
  // edges follow the curve, so neighbouring slices meet exactly.
  drawBent(g, s, x, off, n) {
    const y0 = Math.max(0, s.y0);
    const h = s.y0 + s.h - y0;
    const ph = s.canvas.height / s.h; // sprite pixels per unit
    const k = this.k;
    for (let j = 0; j < n; j++) {
      const ya = y0 + (h * j) / n;
      const yb = y0 + (h * (j + 1)) / n;
      const oa = off(ya);
      const sh = (off(yb) - oa) / (yb - ya);
      // world point (lx, ly) -> (x + lx + oa + sh * (ly - ya), ly)
      g.setTransform(k, 0, k * sh, k, k * (x + oa - sh * ya) + this.ox, this.oy);
      const sy = (ya - s.y0) * ph;
      const sh2 = Math.min(s.canvas.height - sy, (yb - ya) * ph + 1);
      g.drawImage(s.canvas, 0, sy, s.canvas.width, sh2, s.x0, ya, s.w, sh2 / ph);
    }
    // (the hanger above the lid line, if any, goes on unbent)
    if (s.y0 < 0) {
      g.setTransform(k, 0, 0, k, k * x + this.ox, this.oy);
      const hp = Math.min(s.canvas.height, -s.y0 * ph);
      g.drawImage(s.canvas, 0, 0, s.canvas.width, hp, s.x0, s.y0, s.w, hp / ph);
    }
  }

  drawDecorE(g, d) {
    const def = d.def;
    const box = decorBox(def);
    const bare = d.type === 'mailbox';
    const s = this.sprites.get('d|' + d.type + (bare ? '|bare' : ''), Math.min(this.bucket, 3), box, (gg) => DECOR_ART[d.type](gg, 0, bare));
    this.put(g, d.x, d.y, 0, d.flip ? -1 : 1, 1);
    g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
    // the mailbox's flag is up while Busytown's letters are waiting
    if (bare) DECOR_ART.mailboxFlag(g, this.mail > 0);
    if (d.type === 'windmill') {
      // the sails turn faster as a gust comes through
      d.spin = (d.spin || 0) + this.wdt * (0.6 + Math.abs(breeze.wind(d.x)) * 3.5);
      DECOR_ART.windmillBlades(g, d.spin);
    }
    if (d.def.hive) this.drawHoneycomb(g, d);
  }

  // Signs of life at home: smoke from the chimney (steam from the teapot's
  // spout) on a chilly evening, and bubbles rising from an underwater home.
  // Also counts who's in, for the lit windows at night.
  homeLife(w) {
    for (const d of w.decor) d.inN = 0;
    for (const c of w.creatures) if (c.inside && !c.dead) c.inside.inN++;
    if (this.paused) return;
    const dt = this.dt || 0.016;
    const env = w.env;
    for (const d of w.decor) {
      if (!d.inN || !this.visible(d.x, d.y, 120)) continue;
      const def = d.def;
      if (d.wet) {
        if (Math.random() < dt * 0.6 * d.inN) {
          const [bx, by] = d.at(def.win || def.door || [0, -def.h * 0.5]);
          this.fx.bubble(bx + (Math.random() - 0.5) * 4, by);
        }
        continue;
      }
      const vent = def.chimney || def.spout;
      if (!vent) continue;
      const cosy = Math.max(1 - env.sun, clamp01((22 - env.tempAt(d.x, d.y - 10, w.terrain)) / 6));
      if (cosy > 0.3 && Math.random() < dt * (def.spout ? 0.9 : 1.4) * cosy) {
        const [sx, sy] = d.at(vent);
        this.fx.smoke(sx, sy, !!def.spout);
      }
    }
  }

  drawFoodE(g, f, alpha) {
    const rot = f.rot;
    const bites = f.bites;
    const s = this.sprites.get('f|' + f.type + '|' + rot + '|' + bites, Math.min(this.bucket, 3), [-10, -12, 10, 3], (gg) => drawFood(gg, f.def, rot, 0.7, bites));
    const x = f.px + (f.x - f.px) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    // (a bit being carried is sized to the critter carrying it)
    const sc = f.state === 'held' && f.holder ? f.scale * clamp(f.holder.size / 30, 0.35, 0.9) : f.scale;
    // a little squash-and-wobble on every chomp
    const chomp = f.biteT > 0 ? Math.sin(f.biteT * 40) * f.biteT * 0.3 : 0;
    this.put(g, x, y + 0.5, f.state === 'fall' ? f.angle : chomp * 0.6, sc * (f.biteSide < 0 ? -1 : 1) * (1 + chomp), sc * (1 - chomp));
    g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
  }

  // How far back in the water a swimmer is (0 by the front glass .. 1 far
  // off): fish drift nearer and further as they go about, coming up front to
  // eat, beg, gulp air or be looked at. Only for drawing: the tank itself is
  // a slice, and the sim never needs to know.
  depthOf(c) {
    const ok = c.mode === 'swim' && !c.inside && !c.dead && c !== this.selected && (c.def.fish || c.sp === 'turtle' || c.sp === 'axolotl' || (c.sp === 'frog' && c.stage === 'tadpole'));
    if (c.dz == null) {
      c.dz = ok ? Math.random() * 0.55 : 0;
      c.dzT = c.dz;
      c.dzN = this.time + Math.random() * 8;
    }
    if (this.paused) return c.dz;
    let tgt = 0;
    if (ok) {
      if (this.time > c.dzN) {
        c.dzN = this.time + 6 + Math.random() * 12;
        c.dzT = Math.pow(Math.random(), 1.6) * 0.85;
      }
      const b = c.brain.b;
      tgt = c.pose === 'eat' || c.pose === 'gasp' || (b && (b.id === 'beg' || b.id === 'snack')) ? 0 : c.dzT;
    }
    c.dz += (tgt - c.dz) * Math.min(1, (this.dt || 0.016) / 2.4);
    return c.dz;
  }

  drawCreatureE(g, c, alpha) {
    // slipping in or out of a door fades rather than pops (but anyone who
    // wasn't on screen last frame just is where they are)
    if (c.visF !== this.frameN - 1) c.vis = c.hidden ? 0 : 1;
    else if (!this.paused) c.vis = c.hidden ? Math.max(0, c.vis - (this.dt || 0.016) * 5) : Math.min(1, c.vis + (this.dt || 0.016) * 4);
    c.visF = this.frameN;
    if (c.hidden) {
      if (c.pose === 'burrow') {
        this.drawBuried(g, c);
        return;
      }
      if (!c.inside || c.vis <= 0.02) return;
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
      else if (pose === 'swim') frame = Math.floor(c.beat * (c.sp === 'turtle' ? 0.3 : c.sp === 'frog' && c.stage === 'adult' ? 0.35 : 1)) % nf; // quick flicks, then a coast
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
    const ds = c.drawScale;
    if (c.mode === 'crawl') {
      // stand on the surface: lift the body off the floor, wall or ceiling
      const off = c.foot - 2.2;
      x += c.nx * off;
      y += c.ny * off;
      if (c.pose === 'dig' && !this.paused) {
        // shovelling: a quick rock back and forth
        const j = Math.sin(this.time * 22 + c.id) * 0.7;
        x += Math.cos(ang) * c.facing * j;
        y += Math.sin(ang) * c.facing * j;
      }
    }
    // turning round is a quick swivel, not an instant flip
    if (c.vf == null || c.dead) c.vf = c.facing;
    else if (!this.paused) c.vf += (c.facing - c.vf) * Math.min(1, (this.dt || 0.016) * 13);
    const vf = Math.abs(c.vf) < 0.18 ? (c.vf < 0 ? -0.18 : 0.18) : c.vf;
    const shrink = c.vis < 1 ? 0.75 + 0.25 * c.vis : 1;
    let sx = ds * shrink * (c.plump >= 1 ? 1 + (c.plump - 1) * 0.55 : 1 - (1 - c.plump) * 0.3);
    let sy = ds * shrink * (c.plump >= 1 ? 1 + (c.plump - 1) * 0.3 : 1 - (1 - c.plump) * 0.15);
    if (c.pose === 'eat') sy *= 1 + Math.sin(this.time * 18 + c.id) * 0.035;
    if (c.pose === 'sleep' && !c.dead) sy *= 1 + Math.sin(this.time * 2 + c.id) * 0.025;
    else if (!c.moving && !c.dead && c.mode !== 'fly' && c.mode !== 'swim') sy *= 1 + Math.sin(this.time * 2.6 + c.id) * 0.012; // breathing
    if (c.moving && (c.mode === 'walk' || c.mode === 'crawl') && STEP_BOB[c.sp]) {
      // a little lift on every step
      const b = Math.abs(Math.sin(c.anim * (c.sp === 'ant' ? 22 : 14))) * STEP_BOB[c.sp] * ds;
      x += c.mode === 'crawl' ? c.nx * b : 0;
      y += c.mode === 'crawl' ? c.ny * b : -b;
    } else if (c.moving && (c.sp === 'snail' || c.sp === 'pondsnail')) sx *= 1 + Math.sin(c.anim * 5 + c.id) * 0.04; // a snail's slow stretch
    if (c.mode === 'air') {
      // stretch while leaping
      const k = Math.min(0.16, Math.abs(c.vy) / 900);
      sy *= 1 + k;
      sx *= 1 - k * 0.6;
    } else if (c.landT > 0) {
      // ...and squash on landing
      const k = (c.landT / 0.22) * 0.18;
      sy *= 1 - k;
      sx *= 1 + k * 0.8;
      y += k * c.foot * 0.6;
    }
    if (c.pose === 'headstand') ang += -0.55 * c.facing;
    // a fish nibbling at something below it tips its nose down to it
    if (c.def.fish && c.pose === 'eat' && c.target && c.target.kind === 'food' && c.target.food && c.target.food.y > c.y + 4) ang += Math.min(0.5, (c.target.food.y - c.y) * 0.04) * c.facing;
    if (c.pupa) ang = Math.sin(this.time * 0.8 + c.id) * 0.04;
    if (c.vis < 1) g.globalAlpha = c.vis;
    if (c.dead) {
      g.globalAlpha = clamp01(1 - c.deadT / 4);
      ang = lerp(ang, 0.2 * c.facing, clamp01(c.deadT));
    } else if (c.mode === 'swim' && !c.aquatic && c.paddling) ang += Math.sin(this.time * 10) * 0.2;
    let ph = 0;
    if (wspec) {
      const dtR = this.paused ? 0 : this.dt || 0.016;
      if (c.soarT > 0) {
        // gliding: the wings ease open and hold still
        const open = Math.round(c.flapPh / TAU) * TAU;
        c.flapPh += (open - c.flapPh) * Math.min(1, dtR * 7);
      } else c.flapPh += dtR * wspec.hz * TAU;
      ph = c.flapPh;
      y -= Math.sin(ph) * wspec.bob * ds; // each downstroke lifts the body a touch
    }
    if (c.dz > 0.01) {
      // further back: smaller, and fading into the water
      const k = 1 - c.dz * 0.32;
      sx *= k;
      sy *= k;
      g.globalAlpha *= 1 - c.dz * 0.5;
    }
    this.put(g, x, y, ang, vf * sx, sy);
    if (wspec) this.drawWings(g, c, wspec, ph, true, bucket);
    g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
    if (wspec && !wspec.butterfly) this.drawWings(g, c, wspec, ph, false, bucket);
    if (c.carry) this.drawCarry(g, c);
    if (c.memory.ball && !c.dead) this.drawBall(g, c);
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
      const lw = CREATURE_ART[c.sp].lw;
      const P = c.pal;
      const wingArt = s.moth ? (gg, col) => drawMothWings(gg, P, lw, col, col === P.under) : (gg, col) => drawButterflyWings(gg, P, lw, col);
      const near = this.sprites.get('bw|' + c.sp + c.palIdx, bucket, [-15, -20, 12, 6], (gg) => wingArt(gg, P.wing));
      const back = this.sprites.get('bwu|' + c.sp + c.palIdx, bucket, [-15, -20, 12, 6], (gg) => wingArt(gg, P.under));
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
      const spr = this.sprites.get('wg|' + c.sp + (far ? 'f' : ''), bucket, wingBox(s), (gg) => (s.quad ? drawDragonWing(gg, s.len, s.wid, CREATURE_ART[c.sp].lw, far, c.pal) : drawWingBlade(gg, s.len, s.wid, CREATURE_ART[c.sp].lw, far)));
      if (s.quad) {
        // the hind pair sits just behind the fore pair and beats out of step
        g.save();
        g.translate(-1.5, 0.2);
        g.rotate(wingAngle(s, ph + Math.PI * 0.6) + 0.25);
        g.drawImage(spr.canvas, spr.x0, spr.y0, spr.w, spr.h);
        g.restore();
      }
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
    if (c.carry === 'brood' && c.carryBrood) {
      // an egg or baby held gently in the jaws
      g.save();
      g.translate(7.8 * s, 0.4);
      drawBrood(g, c.carryBrood.stage, 0.7);
      g.restore();
      return;
    }
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

  // A beetle's compost ball, rolled along in front of it (in the beetle's
  // own transform, so +x is the way it's facing).
  drawBall(g, c) {
    const r = c.memory.ball.r;
    const by = c.foot / (c.drawScale || 1) - r;
    g.save();
    g.translate(8.5 + r, by);
    g.rotate((c.x / r) * Math.sign(c.facing || 1));
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fillStyle = '#7a5a3a';
    g.fill();
    g.lineWidth = 0.7;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0.3, 2.2);
    g.moveTo(-r * 0.3, -r * 0.5);
    g.arc(0, 0, r * 0.3, 3.4, 5.2);
    g.lineWidth = 0.5;
    g.strokeStyle = '#4e3622';
    g.stroke();
    g.fillStyle = '#8cb85a';
    g.fillRect(r * 0.2, -r * 0.55, r * 0.35, r * 0.22);
    g.fillRect(-r * 0.6, r * 0.15, r * 0.3, r * 0.2);
    g.restore();
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
      const L = col.larder || col.chamber;
      const cx = L.cx * CELL;
      const cy = L.cy * CELL;
      if (!this.visible(cx, cy, 120) && !this.visible(col.chamber.cx * CELL, col.chamber.cy * CELL, 120)) continue;
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

  // Every open water surface gets a wavy, inked line with a bright band
  // under it. Ripples from splashes run along the pond's surface.
  drawWaterSurface(g) {
    const t = this.world.terrain;
    const tm = this.time;
    const ripples = this.fx.ripples;
    const wave = (x, y0) => {
      let y = Math.sin(x * 0.05 + tm * 1.8) * 1.1 + Math.sin(x * 0.11 - tm * 1.2) * 0.6;
      // a gust ruffles the water into a quick chop
      const wind = Math.abs(breeze.wind(x));
      if (wind > 0.05) y += (Math.sin(x * 0.27 - tm * 5.2) * 0.9 + Math.sin(x * 0.43 + tm * 7.3) * 0.45) * wind;
      for (const r of ripples) {
        const d = Math.abs(x - r.x);
        const front = r.t * 55;
        const k = d - front;
        if (k > -14 && k < 14) y += Math.cos(k * 0.35) * (1 - r.t / 1.6) * 2.2 * r.s;
      }
      return y0 + y;
    };
    this.setWorld(g);
    const v = this.view;
    for (const seg of t.surfSegs) {
      const n = seg.ys.length;
      const x0 = seg.cx * CELL;
      const x1 = (seg.cx + n) * CELL;
      if (x1 < v.x0 || x0 > v.x1) continue;
      // surface height along the segment, smoothed between columns
      const yAt = (x) => {
        const f = clamp((x - x0) / CELL - 0.5, 0, n - 1);
        const i = Math.floor(f);
        const j = Math.min(n - 1, i + 1);
        return seg.ys[i] + (seg.ys[j] - seg.ys[i]) * (f - i);
      };
      const calm = n < 4 ? 0.35 : 1;
      const pts = [];
      for (let x = x0; x < x1; x += 6) pts.push(x, wave(x, yAt(x)) * calm + yAt(x) * (1 - calm));
      pts.push(x1, wave(x1, yAt(x1)) * calm + yAt(x1) * (1 - calm));
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
      g.lineTo(x1, yAt(x1) + 5);
      g.lineTo(x0, yAt(x0) + 5);
      g.closePath();
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fill();
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
      g.lineWidth = 1.7;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
      g.lineWidth = 0.8;
      g.strokeStyle = 'rgba(36,70,110,0.6)';
      g.stroke();
      if (n < 4) continue;
      // seen from the side through the glass, the underside of the surface
      // is a silvery mirror: a bright band just under the waterline, with a
      // faint copy of the ripples in it
      const ym = yAt((x0 + x1) / 2);
      if (!this.mirrorGrad || this.mirrorFor !== g || Math.abs(this.mirrorY - ym) > 0.5) {
        const mg = g.createLinearGradient(0, ym, 0, ym + 14);
        mg.addColorStop(0, 'rgba(236,250,255,0.42)');
        mg.addColorStop(0.35, 'rgba(220,244,252,0.16)');
        mg.addColorStop(1, 'rgba(220,244,252,0)');
        this.mirrorGrad = mg;
        this.mirrorFor = g;
        this.mirrorY = ym;
      }
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
      g.lineTo(x1, yAt(x1) + 14);
      g.lineTo(x0, yAt(x0) + 14);
      g.closePath();
      g.fillStyle = this.mirrorGrad;
      g.fill();
      g.beginPath();
      for (let k = 0; k < pts.length; k += 2) {
        const yy = yAt(pts[k]) * 2 - pts[k + 1] + 5.5;
        if (k) g.lineTo(pts[k], yy);
        else g.moveTo(pts[k], yy);
      }
      g.lineWidth = 0.7;
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.stroke();
      // cat's paws: little dark ruffles skating across the water in a gust
      const dir = breeze.wind((x0 + x1) / 2) < 0 ? -1 : 1;
      const off = tm * 24 * dir;
      g.lineWidth = 0.6;
      g.strokeStyle = 'rgb(36,70,110)';
      for (let ci = Math.floor((x0 - off) / 12); ci * 12 + off < x1 - 4; ci++) {
        const mx = ci * 12 + off;
        if (mx < x0 + 4 || hash1(ci, 7) < 0.5) continue;
        const a = Math.abs(breeze.wind(mx));
        if (a < 0.3) continue;
        const my = yAt(mx) + 2.5 + hash1(ci, 9) * 4;
        g.globalAlpha = Math.min(0.4, (a - 0.3) * 0.8);
        g.beginPath();
        g.moveTo(mx - 2.5, my);
        g.quadraticCurveTo(mx, my - 1.4, mx + 2.5, my);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  // The pond heater and filter stand in the water by the jungle bank. They're
  // drawn before the water so the parts below the surface look submerged.
  drawPondGear(g) {
    const env = this.world.env;
    const wl = this.world.terrain.waterLevel;
    if (!this.visible((HEATER_X + FILTER_X) / 2, wl, 160)) return;
    const p = env.pond;
    const b = Math.min(this.bucket, 3);
    // the heater's coil glows while it's actually warming the water
    const heating = p.heater ? Math.round(clamp01((p.heaterTarget - p.temp) / 1.2 + 0.15) * 4) / 4 : 0;
    const hs = { on: p.heater, heating, target: Math.round(p.heaterTarget - 6) / 28 };
    this.blit(g, `eq|heater|${p.heater}|${heating}|${Math.round(p.heaterTarget)}`, b, [-14, -38, 20, 76], HEATER_X, wl, (gg) => pondHeater(gg, 0, 0, hs));
    const fs = { flow: env.filterFlow, setting: Math.round(p.filter * 20) / 20, clean: Math.round(p.filterClean * 12) / 12, time: this.time };
    this.blit(g, `eq|filter|${fs.setting}|${fs.clean}`, b, [-28, -19, 16, 52], FILTER_X, wl, (gg) => pondFilter(gg, 0, 0, { ...fs, part: 'body' }));
    pondFilter(g, FILTER_X, wl, { ...fs, part: 'live' });
  }

  // Draw a cached sprite at (x, y) in the world.
  blit(g, key, bucket, box, x, y, draw) {
    const s = this.sprites.get(key, bucket, box, draw);
    this.put(g, x, y, 0, 1, 1);
    g.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
    this.setWorld(g);
  }

  drawEquipment(g) {
    const env = this.world.env;
    const t = this.world.terrain;
    this.setWorld(g);
    // name tags fade in once you're close enough to read them
    const tagA = clamp01((this.cam.zoom - 1.05) / 0.45);
    const time = this.time;
    const b = Math.min(this.bucket, 3);
    for (const z of ['desert', 'pond', 'jungle']) {
      const x = LAMP_X[z];
      if (!this.visible(x, 0, 70)) continue;
      const p = Math.round(env[z].lamp * 20) / 20;
      this.blit(g, `eq|lamp|${z}|${p}`, b, [-24, -32, 32, 37], x, 0, (gg) => heatLamp(gg, 0, { power: p, zone: z, part: 'body' }));
      heatLamp(g, x, { power: p, zone: z, time, part: 'live' });
      tag(g, 'heat lamp', x + 17, 18, 16, 18, tagA);
    }
    for (const z of ['desert', 'jungle']) {
      const x = MISTER_X[z];
      const e = env[z];
      const ms = { setting: Math.round(e.mister * 20) / 20, spraying: env.misting(z), water: Math.round(e.water * 32) / 32, time };
      // its spray fans out over the whole zone, down to the ground
      const aim = LAMP_X[z] - x;
      const reach = MIST_HALF[z];
      const depth = t.surfaceY(x + aim) - 6;
      const seeBody = this.visible(x + 20, 0, 90);
      if (!seeBody && !(ms.spraying > 0.02 && this.visible(x + aim, depth / 2, reach + depth / 2))) continue;
      const empty = ms.water < 0.15 && ms.setting > 0.02;
      if (seeBody) this.blit(g, `eq|mister|${ms.setting}|${ms.water}|${empty}|${ms.spraying > 0.02}`, b, [-8, -34, 53, 30], x, 0, (gg) => mister(gg, 0, { ...ms, part: 'body' }));
      mister(g, x, { ...ms, part: 'live', aim, reach, depth, puff: this.glowSprite('rgba(196,226,244,1)') });
      if (!seeBody) continue;
      tag(g, 'mister', x, 8, -18, 14, tagA);
      tag(g, 'water jug', x + 42, 20, 10, 10, tagA);
    }
    // gadgets from the Busytown Market
    const w = this.world;
    if (w.owns('rainBarrel')) {
      for (const z of ['desert', 'jungle']) {
        const x = MISTER_X[z] - 26;
        if (!this.visible(x, 0, 60)) continue;
        this.blit(g, 'eq|barrel', b, [-16, -34, 18, 3], x, 0, rainBarrel);
        // a pipe across to the mister's jug
        g.beginPath();
        g.moveTo(x + 13, -9);
        g.quadraticCurveTo(x + 40, -4, x + 60, -14);
        g.lineWidth = 2.2;
        g.strokeStyle = INK;
        g.stroke();
        g.lineWidth = 1.2;
        g.strokeStyle = '#9aa0a6';
        g.stroke();
        tag(g, 'rain barrel', x, 8, -16, 14, tagA);
      }
    }
    if (w.owns('climate') && this.visible(CLIMATE_X, 0, 60)) {
      this.put(g, CLIMATE_X, 0, 0, 1, 1);
      climateKeeper(g, w.time * 0.6);
      this.setWorld(g);
      tag(g, 'climate keeper', CLIMATE_X, 8, 0, 18, tagA);
    }
    if (w.owns('sprinkler')) {
      for (const x of SPRINKLER_X) if (this.visible(x, 0, 40)) this.blit(g, 'eq|sprinkler', b, [-8, -2, 8, 14], x, 0, sprinklerHead);
    }
    // pond heater & filter labels (the gear itself is drawn under the water)
    const wl = t.waterLevel;
    if (this.visible((HEATER_X + FILTER_X) / 2, wl, 160)) {
      const p = env.pond;
      tag(g, 'heater', HEATER_X - 2, wl - 22, -20, -10, tagA);
      tag(g, 'filter', FILTER_X + 10, wl - 14, 14, -12, tagA);
      // the fill line on the glass, once the pond has evaporated below it
      if (wl - p.full > 6 && this.visible(ZONE_MID.pond - 10, p.full, 300)) {
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(X(700), p.full);
        g.lineTo(X(950), p.full);
        g.lineWidth = 0.9;
        g.strokeStyle = 'rgba(40,80,120,0.6)';
        g.stroke();
        g.setLineDash([]);
        g.font = "7px 'Patrick Hand', sans-serif";
        g.textAlign = 'left';
        g.fillStyle = 'rgba(40,80,120,0.8)';
        g.fillText('fill line', X(704), p.full - 2.5);
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
    if (c.kind === 'equip') {
      const b = equipmentBox(this.world, c);
      if (!b) return;
      this.setWorld(g);
      const m = 3 + Math.sin(this.time * 4) * 1.2;
      g.beginPath();
      if (g.roundRect) g.roundRect(b[0] - m, b[1] - m, b[2] - b[0] + m * 2, b[3] - b[1] + m * 2, 6);
      else g.rect(b[0] - m, b[1] - m, b[2] - b[0] + m * 2, b[3] - b[1] + m * 2);
      g.setLineDash([4, 3]);
      g.lineWidth = 1.6 / Math.max(0.6, this.cam.zoom);
      g.strokeStyle = '#f6d64a';
      g.stroke();
      g.setLineDash([]);
      return;
    }
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
    // name plate, engraved with whoever the farm belongs to
    const plate = plateText(this.world.keeper);
    g.font = "bold 11px 'Chewy', 'Patrick Hand', sans-serif";
    const pw = Math.max(120, g.measureText(plate).width + 26);
    g.beginPath();
    g.rect(W / 2 - pw / 2, H + 3, pw, 14);
    g.fillStyle = '#f6efe0';
    g.fill();
    g.lineWidth = 1.2;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#9a3c2e';
    g.fillText(plate, W / 2, H + 10.5);
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
      g.drawImage(b, x - 24, 2, 48, 48);
    }
    for (const d of this.world.decor) {
      if (d.def.win && d.inN && !d.wet && this.visible(d.x, d.y, 100)) {
        // someone's home: a warm lamp in the window
        const [wx, wy] = d.at(d.def.win);
        const spr = this.glowSprite('rgba(255,200,110,0.95)');
        g.globalAlpha = Math.min(1, dark * 1.6);
        g.drawImage(spr, wx - 7, wy - 7, 14, 14);
        g.globalAlpha = dark * 0.7;
        g.drawImage(spr, wx - 22, wy - 22, 44, 44);
        continue;
      }
      if (!d.def.light || !this.visible(d.x, d.y, 100)) continue;
      const spr = this.glowSprite('rgba(255,225,140,0.9)');
      g.globalAlpha = dark * 1.2;
      g.drawImage(spr, d.x - 70, d.y - 135, 140, 140);
    }
    // moonflowers glow softly in the dark...
    const moon = this.glowSprite('rgba(226,240,255,0.95)');
    for (const p of this.world.plants) {
      if (!p.def.night || p.dead || !p.shape || !this.visible(p.x, p.y - 40, 60)) continue;
      for (const f of p.shape.flowers) {
        g.globalAlpha = dark * 1.2 * clamp01(f.r / 4);
        g.drawImage(moon, p.x + f.x - 20, p.y + f.y - 20, 40, 40);
      }
    }
    // ...and neon tetras shine in the dark water
    const neon = this.glowSprite('rgba(90,220,255,1)');
    for (const c of this.world.creatures) {
      if (c.sp !== 'tetra' || c.dead || c.stage === 'egg' || !this.visible(c.x, c.y, 30)) continue;
      g.globalAlpha = dark * 0.9;
      g.drawImage(neon, c.x - 10, c.y - 6, 20, 12);
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
      // The brush ring: tinted with what you're painting, a white halo so
      // it reads on any ground, marching dashes while you aim and a solid,
      // gently pulsing ring while you paint.
      const z = Math.max(0.35, this.cam.zoom);
      const a = gh.alpha == null ? 1 : gh.alpha;
      const r = gh.r * (gh.painting ? 1 + Math.sin(this.time * 12) * 0.03 : 1);
      g.globalAlpha = a;
      g.beginPath();
      g.arc(gh.x, gh.y, r, 0, TAU);
      g.fillStyle = gh.fill || 'rgba(255,255,255,0.18)';
      g.fill();
      g.lineWidth = 4 / z;
      g.strokeStyle = 'rgba(255,253,246,0.92)';
      g.stroke();
      if (!gh.painting) {
        g.setLineDash([7 / z, 5 / z]);
        g.lineDashOffset = (-this.time * 16) / z;
      }
      g.lineWidth = 1.7 / z;
      g.strokeStyle = gh.ok === false ? '#e2453f' : INK;
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.arc(gh.x, gh.y, 2 / z, 0, TAU);
      g.fillStyle = INK;
      g.fill();
      if (gh.touch && !gh.demo) {
        // a fingertip hides the middle of the ring, so a little flag on a
        // stalk stands up above it to show where the brush is
        const lift = r + 30 / z;
        g.beginPath();
        g.moveTo(gh.x, gh.y - r);
        g.lineTo(gh.x, gh.y - lift + 7 / z);
        g.lineWidth = 3.4 / z;
        g.strokeStyle = 'rgba(255,253,246,0.92)';
        g.stroke();
        g.lineWidth = 1.5 / z;
        g.strokeStyle = INK;
        g.stroke();
        g.beginPath();
        g.arc(gh.x, gh.y - lift, 7 / z, 0, TAU);
        g.fillStyle = (gh.fill || 'rgba(255,255,255,0.4)').replace(/[\d.]+\)$/, '1)');
        g.fill();
        g.lineWidth = 1.6 / z;
        g.stroke();
      }
      g.globalAlpha = 1;
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
    this.drawCoinFloats(g);
  }

  // "+3" and a coin, floating up from wherever Busytown coins turned up.
  coinFloat(x, y, n) {
    if (x == null || this.floats.length > 12) return;
    this.floats.push({ x, y, n, t: 0 });
  }
  drawCoinFloats(g) {
    if (!this.floats.length) return;
    const dpr = this.dpr;
    const dt = this.paused ? 0 : this.dt || 0.016;
    const s = 18 * dpr;
    g.font = `bold ${Math.round(15 * dpr)}px 'Patrick Hand', sans-serif`;
    g.textBaseline = 'middle';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > 2) {
        this.floats.splice(i, 1);
        continue;
      }
      const [sx, sy] = this.cam.toScreen(f.x, f.y);
      const x = sx * dpr;
      const y = sy * dpr - f.t * 26 * dpr;
      g.globalAlpha = clamp01(Math.min(f.t * 6, (2 - f.t) * 2));
      g.save();
      g.translate(x - s * 0.6, y);
      drawIcon(g, 'coin', s);
      g.restore();
      g.lineWidth = 3 * dpr;
      g.strokeStyle = '#fffdf6';
      g.strokeText('+' + f.n, x + s * 0.05, y);
      g.fillStyle = '#9a6a12';
      g.fillText('+' + f.n, x + s * 0.05, y);
    }
    g.globalAlpha = 1;
  }
}

export { QUALITY };
