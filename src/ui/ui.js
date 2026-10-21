// DOM user interface layered over the tank canvas.
import { W, H, CELL, DAY_LEN, ZONE_X } from '../config.js';
import { SPECIES, SPECIES_ORDER, stageName, adoptLabel } from '../data/species.js';
import { FOODS, FOOD_ORDER, lovedBy } from '../data/foods.js';
import { PLANTS, PLANT_ORDER } from '../data/plants.js';
import { DECOR, DECOR_ORDER } from '../data/decor.js';
import { DISCOVERIES } from '../data/discoveries.js';
import { CREATURE_ART, PALETTES, drawWorm } from '../art/creatures.js';
import { drawFood } from '../art/food.js';
import { drawPlant } from '../art/plants.js';
import { DECOR_ART, decorBox } from '../art/decor.js';
import { iconCanvas, drawIcon } from '../art/icons.js';
import { BACKDROPS } from '../art/backdrops.js';
import { SAND_STYLES, SOIL_STYLES, GRAVEL_STYLES } from '../render/terrainRender.js';
import { Plant } from '../entities/plant.js';
import { force } from '../ai/brain.js';
import { fmtTemp, clamp, clamp01 } from '../util/math.js';
import { rrange } from '../util/rng.js';
import { zoneBand, zoneStatus, tankNeeds, ZONE_NAMES, listWords, plural } from '../sim/care.js';
import { maxLevel } from '../data/progression.js';
import { GAUGE_AT } from '../render/renderer.js';
import { MISTER_X } from '../world/environment.js';

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const TOOLS = [
  { id: 'look', icon: 'hand', label: 'Look' },
  { id: 'feed', icon: 'food', label: 'Feed' },
  { id: 'adopt', icon: 'bug', label: 'Critters' },
  { id: 'plant', icon: 'sprout', label: 'Plants' },
  { id: 'decor', icon: 'house', label: 'Decor' },
  { id: 'shape', icon: 'shovel', label: 'Shape' },
  { id: 'climate', icon: 'thermo', label: 'Climate' },
  { id: 'journal', icon: 'book', label: 'Journal' },
];
// which unlock list each tool's tray draws from
const TOOL_KIND = { feed: 'feed', adopt: 'adopt', plant: 'plant', decor: 'decor' };
const LENSES = [
  { id: 'none', label: '' },
  { id: 'temp', label: 'Temperature view' },
  { id: 'moist', label: 'Dampness view' },
  { id: 'scent', label: 'Ant scent trails' },
  { id: 'minds', label: "What they're thinking" },
];
const ZONES = [
  { id: 'desert', label: 'Desert', x: 280 },
  { id: 'pond', label: 'Pond', x: 810 },
  { id: 'jungle', label: 'Jungle', x: 1330 },
  { id: 'all', label: 'All' },
];
const TIPS = [
  'Drag to look around. Pinch or scroll to zoom.',
  "The clipboard (top right) shows what your critters need and your farm's goals.",
  'Tap any critter to see what it is thinking.',
  'Zone temperatures up top turn red when too hot and blue when too chilly.',
  'Each zone levels up as you finish its goals. New critters and snacks unlock!',
  'Misters run on a water bottle. Refill it before the air dries out.',
  'The weather changes every day or so. Check the forecast on the clipboard.',
  'Tap the glass to give everyone a little startle.',
  'Try the lens button (top right) to see heat, damp and scent trails.',
  'Turn the desert lamp way up and see where the ants go.',
  'Too much food spoils. Too little and tummies rumble!',
  'Fireflies glow at night. Watch them start blinking together.',
  'Crickets chirp faster when it is warm.',
  'Warm water holds less air. Watch the fish!',
];

// Fit art of a given local box into a canvas.
function artCanvas(css, box, draw, dpr = Math.min(2, window.devicePixelRatio || 1)) {
  const [cw, ch] = css;
  const c = el('canvas');
  c.width = Math.round(cw * dpr);
  c.height = Math.round(ch * dpr);
  c.style.width = cw + 'px';
  c.style.height = ch + 'px';
  const g = c.getContext('2d');
  const [x0, y0, x1, y1] = box;
  const s = Math.min((cw * dpr * 0.9) / (x1 - x0), (ch * dpr * 0.9) / (y1 - y0));
  g.setTransform(s, 0, 0, s, c.width / 2 - ((x0 + x1) / 2) * s, c.height / 2 - ((y0 + y1) / 2) * s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  try {
    draw(g);
  } catch (e) {
    /* ignore */
  }
  return c;
}

function creatureArt(sp, stage, pose = 'idle', palIdx = 0, acc = null, accColor = '#e2553f', css = [64, 52]) {
  const art = CREATURE_ART[sp];
  if (!art) return artCanvas(css, [-10, -10, 10, 10], () => {});
  const [bw, bh] = art.box(stage);
  const pal = PALETTES[sp][palIdx % PALETTES[sp].length];
  if (sp === 'worm') return wormIcon(css, palIdx);
  return artCanvas(css, [-bw, -bh, bw, bh], (g) => art.draw(g, { stage, pose, frame: 1, pal, acc, accColor, lw: art.lw, closed: false }));
}

export class UI {
  constructor(game, journal, sound, settings, hooks) {
    this.game = game;
    this.world = game.world;
    this.cam = game.cam;
    this.r = game.renderer;
    this.journal = journal;
    this.sound = sound;
    this.settings = settings;
    this.hooks = hooks;
    this.tool = 'look';
    this.choice = { feed: 'apple', adopt: null, plant: null, decor: null, shape: 'sand' };
    this.brush = 22;
    this.selected = null;
    this.moving = null;
    this.tab = { adopt: 'all', plant: 'all', decor: 'items', journal: 'disc', clip: 'needs' };
    this.lensIdx = 0;
    this.hudT = 0;
    this.toastT = 0;
    this.tipI = 0;
    this.lastBirthToast = 0;
    this.portraitKey = '';
  }

  // ------------------------------------------------------------------ setup
  init() {
    const app = $('#app');
    // HUD
    this.clockIcon = el('canvas');
    this.clockWhen = el('div', { class: 'when' }, 'Day 1');
    this.clockTemps = el('div', { class: 'temps' }, '');
    const clock = el('button', { class: 'panel clock', 'aria-label': 'Time and climate', onclick: () => this.setTool('climate') }, this.clockIcon, el('div', {}, this.clockWhen, this.clockTemps));
    // compact speed control: play/pause + a cycling fast-forward button
    this.playBtn = el('button', { 'aria-label': 'Pause or play', title: 'Pause / play (space)', onclick: () => this.setSpeed(this.game.paused ? this.lastSpeed || 1 : 0) });
    this.fastBtn = el('button', { 'aria-label': 'Speed', title: 'Speed', onclick: () => {
      const order = [1, 3, 8];
      const cur = this.game.paused ? 1 : this.game.speed;
      this.setSpeed(order[(order.indexOf(cur) + 1) % order.length]);
    } });
    const speedBox = el('div', { class: 'panel speed' }, this.playBtn, this.fastBtn);
    this.lensBtn = el('button', { class: 'btn iconbtn', 'aria-label': 'Science lens', title: 'Science lens', onclick: () => this.cycleLens() }, iconCanvas('lens', 28));
    const gear = el('button', { class: 'btn iconbtn', 'aria-label': 'Settings', title: 'Settings', onclick: () => this.openSettings() }, iconCanvas('gear', 28));
    this.clipBadge = el('span', { class: 'badge hidden' });
    this.clipBtn = el('button', { class: 'btn iconbtn clipbtn', 'aria-label': "Keeper's clipboard", title: "Keeper's clipboard: what needs doing, and your farm's goals", onclick: () => this.setTool('clip') }, iconCanvas('clip', 30), this.clipBadge);
    const hud = el('header', { id: 'hud' }, el('div', { class: 'hud-left' }, clock, speedBox), el('div', { class: 'hud-right' }, this.clipBtn, this.lensBtn, gear));
    this.lensLabel = el('div', { id: 'lensLabel', class: 'panel hidden' });
    // zone chips
    this.zoneBox = el('nav', { id: 'zones', class: 'panel', 'aria-label': 'Jump to zone' });
    for (const z of ZONES) {
      const b = el('button', { onclick: () => this.goZone(z) }, z.label);
      b.dataset.z = z.id;
      this.zoneBox.append(b);
    }
    // toolbar
    this.toolbar = el('nav', { id: 'toolbar', class: 'panel', 'aria-label': 'Tools' });
    this.toolBtns = {};
    this.newDots = {};
    for (const t of TOOLS) {
      const b = el('button', { class: 'tool', 'aria-label': t.label, title: t.label, onclick: () => this.setTool(t.id) }, iconCanvas(t.icon, 28), el('span', {}, t.label));
      if (TOOL_KIND[t.id]) b.append((this.newDots[t.id] = el('i', { class: 'newdot hidden', title: 'Something new to try!' })));
      this.toolBtns[t.id] = b;
      this.toolbar.append(b);
    }
    this.sheet = el('section', { id: 'sheet', class: 'panel hidden', 'aria-live': 'polite' });
    this.card = el('section', { id: 'card', class: 'panel hidden' });
    this.toasts = el('div', { id: 'toasts' });
    this.modal = el('div', { id: 'modal', class: 'hidden', onclick: (e) => e.target === this.modal && this.closeModal() });
    app.append(hud, this.lensLabel, this.zoneBox, this.toasts, this.sheet, this.card, this.toolbar, this.modal);
    this.setTool('look');
    this.setSpeed(this.game.speed, true);
    this.updateHUD(true);
    // keyboard shortcuts for desktop
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') {
        this.setSpeed(this.game.paused ? 1 : 0);
        e.preventDefault();
      } else if (e.key === 'Escape') {
        if (!this.modal.classList.contains('hidden')) this.closeModal();
        else if (this.selected) this.select(null);
        else this.setTool('look');
      } else if (/^[1-8]$/.test(e.key)) this.setTool(TOOLS[+e.key - 1].id);
    });
  }

  layoutPads() {
    const top = 56 + this.safe('top');
    const bottom = (window.innerHeight <= 500 ? 60 : 72) + this.safe('bottom');
    return [top, bottom];
  }
  safe(side) {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--' + (side === 'top' ? 'top' : 'bot'));
    return parseFloat(v) || 0;
  }

  // ------------------------------------------------------------------ tools
  setTool(id) {
    if (id === 'journal') {
      this.openJournal();
      return;
    }
    if (this.tool === id && id !== 'look' && !this.sheet.classList.contains('hidden')) id = 'look';
    this.tool = id;
    for (const [k, b] of Object.entries(this.toolBtns)) b.classList.toggle('on', k === id);
    this.moving = null;
    this.r.ghost = null;
    this.hooks.setDragMode(id === 'shape' ? 'tool' : 'pan');
    if (id === 'look') {
      this.sheet.classList.add('hidden');
    } else {
      this.renderSheet();
      this.sheet.classList.remove('hidden');
    }
    this.clipBtn.classList.toggle('on', id === 'clip');
    this.card.classList.toggle('withsheet', id !== 'look');
    // the tray has shown its NEW badges; next time they're old news
    if (TOOL_KIND[id]) this.journal.progress.seen(TOOL_KIND[id]);
    this.sound.play('pop', 0.5);
  }

  renderSheet() {
    const s = this.sheet;
    s.innerHTML = '';
    const head = el('div', { class: 'sheet-head' });
    const body = el('div', { class: 'sheet-body' });
    const close = el('button', { class: 'card-close', 'aria-label': 'Close', onclick: () => this.setTool('look') }, '×');
    const titles = { feed: 'Feed', adopt: 'Critters', plant: 'Plants', decor: 'Decorate', shape: 'Shape the tank', climate: 'Climate', clip: window.innerWidth < 560 ? 'Clipboard' : "Keeper's clipboard" };
    head.append(el('div', { class: 'title' }, titles[this.tool] || ''));
    if (this.tool === 'adopt' || this.tool === 'plant') {
      const tabs = el('div', { class: 'tabs' });
      for (const z of ['all', 'desert', 'pond', 'jungle']) {
        const b = el('button', { class: this.tab[this.tool] === z ? 'on' : '', onclick: () => {
          this.tab[this.tool] = z;
          this.renderSheet();
        } }, z[0].toUpperCase() + z.slice(1));
        tabs.append(b);
      }
      head.append(tabs);
    }
    if (this.tool === 'clip') {
      const tabs = el('div', { class: 'tabs' });
      const prog = this.journal.progress;
      for (const z of ['needs', 'desert', 'pond', 'jungle']) {
        const lv = z === 'needs' ? '' : this.journal.sandbox || prog.legacy ? '' : ` ★${prog.levels[z]}`;
        tabs.append(el('button', { class: this.tab.clip === z ? 'on' : '', onclick: () => {
          this.tab.clip = z;
          this.renderSheet();
        } }, (z === 'needs' ? 'To do' : ZONE_NAMES[z]) + lv));
      }
      head.append(tabs);
    }
    if (this.tool === 'decor') {
      const tabs = el('div', { class: 'tabs' });
      for (const [k, l] of [['items', 'Items'], ['style', 'Style']]) {
        tabs.append(el('button', { class: this.tab.decor === k ? 'on' : '', onclick: () => {
          this.tab.decor = k;
          this.renderSheet();
        } }, l));
      }
      head.append(tabs);
    }
    head.append(close);
    s.append(head, body);
    this.hint = el('div', { class: 'hint' });
    switch (this.tool) {
      case 'feed':
        this.buildFeed(body);
        break;
      case 'adopt':
        this.buildAdopt(body);
        break;
      case 'plant':
        this.buildPlants(body);
        break;
      case 'decor':
        if (this.tab.decor === 'style') this.buildStyle(body);
        else this.buildDecor(body);
        break;
      case 'shape':
        this.buildShape(body);
        break;
      case 'climate':
        this.buildClimate(body);
        break;
      case 'clip':
        this.buildClipboard(body);
        break;
      default:
        break;
    }
  }

  tray(body, items, current, onPick) {
    const tray = el('div', { class: 'tray', role: 'listbox' });
    for (const it of items) {
      const b = el('button', { class: 'item' + (it.id === current ? ' on' : '') + (it.locked ? ' locked' : ''), role: 'option', 'aria-label': it.name, onclick: () => {
        if (it.locked) {
          this.toast(`Locked: ${it.lockHint}`, 'star');
          return;
        }
        for (const x of tray.children) x.classList.remove('on');
        b.classList.add('on');
        onPick(it);
        this.sound.play('pop', 0.4);
      } });
      b.append(it.canvas(), el('div', {}, it.name));
      if (it.count) b.append(el('span', { class: 'count' }, it.count));
      if (it.fresh) b.append(el('span', { class: 'new' }, 'NEW'));
      if (it.locked) b.append(el('span', { class: 'lock' }, iconCanvas('lock', 22)));
      tray.append(b);
    }
    body.append(tray, this.hint);
    const on = tray.querySelector('.on');
    if (on) requestAnimationFrame(() => on.scrollIntoView({ inline: 'center', block: 'nearest' }));
    return tray;
  }

  // Tray entries for a kind of unlockable: locked ones say how to get them.
  lockInfo(kind, id) {
    const j = this.journal;
    const ok = j.canUse(kind, id);
    return { locked: !ok, lockHint: ok ? '' : j.lockHint(kind, id), fresh: ok && j.progress.isFresh(kind, id) };
  }

  buildFeed(body) {
    const items = FOOD_ORDER.map((id) => Object.assign({ id, name: FOODS[id].name, canvas: () => artCanvas([64, 52], [-11, -12, 11, 3], (g) => drawFood(g, FOODS[id], 0)) }, this.lockInfo('feed', id)));
    if (!this.journal.canUse('feed', this.choice.feed)) this.choice.feed = items.find((it) => !it.locked).id;
    const say = (id) => {
      const fans = lovedBy(id, SPECIES).map((sp) => SPECIES[sp].plural).slice(0, 5);
      this.hint.innerHTML = `<b>${esc(FOODS[id].name)}</b> — loved by ${fans.length ? esc(fans.join(', ')) : 'hmm, nobody much'}. Tap the tank to drop it; hold to sprinkle.`;
    };
    this.tray(body, items, this.choice.feed, (it) => {
      this.choice.feed = it.id;
      say(it.id);
    });
    say(this.choice.feed);
  }

  buildAdopt(body) {
    const z = this.tab.adopt;
    const list = SPECIES_ORDER.filter((sp) => sp !== 'fruitfly' && (z === 'all' || SPECIES[sp].zone === z));
    const items = list.map((sp) => {
      const st = sp === 'frog' ? 'tadpole' : sp === 'butterfly' ? 'caterpillar' : sp === 'ant' ? 'queen' : SPECIES[sp].adultStage;
      const pose = sp === 'goldfish' || st === 'tadpole' ? 'swim' : sp === 'bee' ? 'fly' : 'idle';
      return Object.assign({
        id: sp,
        name: adoptLabel(sp),
        count: `${this.world.count(sp)}/${SPECIES[sp].maxPop}`,
        canvas: () => (sp === 'worm' ? wormIcon() : creatureArt(sp, st, pose)),
      }, this.lockInfo('adopt', sp));
    });
    if (this.choice.adopt && !this.journal.canUse('adopt', this.choice.adopt)) this.choice.adopt = null;
    const say = (sp) => {
      if (!sp) {
        this.hint.textContent = 'Pick a critter, then tap where it should live.';
        return;
      }
      const d = SPECIES[sp];
      const u = this.settings.units;
      this.hint.innerHTML = `<b>${esc(adoptLabel(sp))}</b> — ${esc(d.blurb)} <i>Comfy at ${fmtTemp(d.temp[1], u)}–${fmtTemp(d.temp[2], u)}${d.moist[0] >= 0 && d.moist[1] >= 0.3 ? ' in damp air' : ''}.</i>`;
    };
    this.tray(body, items, this.choice.adopt, (it) => {
      this.choice.adopt = it.id;
      say(it.id);
    });
    say(this.choice.adopt);
  }

  buildPlants(body) {
    const z = this.tab.plant;
    const list = PLANT_ORDER.filter((id) => z === 'all' || PLANTS[id].zone === z);
    const items = list.map((id) => Object.assign({
      id,
      name: PLANTS[id].name,
      canvas: () => {
        const p = new Plant(id, 0, 0, { growth: 1, waterY: -50, seed: 7 });
        return artCanvas([64, 52], p.shape.box, (g) => drawPlant(g, p, 0));
      },
    }, this.lockInfo('plant', id)));
    if (this.choice.plant && !this.journal.canUse('plant', this.choice.plant)) this.choice.plant = null;
    const say = (id) => {
      if (!id) {
        this.hint.textContent = 'Pick a plant, then tap where to plant it.';
        return;
      }
      const d = PLANTS[id];
      const where = d.place === 'ground' ? 'on dry ground' : d.place === 'shore' ? 'beside the pond' : 'in the pond';
      this.hint.innerHTML = `<b>${esc(d.name)}</b> — grows ${where}. Likes ${fmtTemp(d.temp[1], this.settings.units)}–${fmtTemp(d.temp[2], this.settings.units)}${d.moist[1] > 0.3 ? ' and damp soil' : d.moist[2] < 0.6 ? ' and dry air' : ''}.`;
    };
    this.tray(body, items, this.choice.plant, (it) => {
      this.choice.plant = it.id;
      say(it.id);
    });
    say(this.choice.plant);
  }

  buildDecor(body) {
    const list = DECOR_ORDER;
    const items = list.map((id) => {
      const d = DECOR[id];
      return Object.assign({
        id,
        name: d.name,
        canvas: () => artCanvas([64, 52], decorBox(d), (g) => DECOR_ART[id](g, 0)),
      }, this.lockInfo('decor', id));
    });
    if (this.choice.decor && !this.journal.canUse('decor', this.choice.decor)) this.choice.decor = null;
    const say = (id) => {
      if (!id) {
        this.hint.textContent = 'Pick a decoration and tap to place it. Tap an existing one to move or remove it.';
        return;
      }
      const d = DECOR[id];
      const fx = d.shelter ? 'Critters can hide and nap inside.' : d.oxygen ? 'Adds bubbles and air to the pond.' : d.light ? 'Glows at night.' : d.hive ? 'Bumblebees can raise new bees here.' : d.feeder ? 'Drops a little food each morning — handy for holidays!' : d.stamp ? 'Becomes part of the ground. Great for basking.' : 'Just for fun!';
      this.hint.innerHTML = `<b>${esc(d.name)}</b> — ${esc(fx)}`;
    };
    this.tray(body, items, this.choice.decor, (it) => {
      this.choice.decor = it.id;
      say(it.id);
    });
    say(this.choice.decor);
  }

  buildStyle(body) {
    const w = this.world;
    const groups = [
      ['backdrop', 'Back wall', Object.entries(BACKDROPS).map(([k, v]) => [k, v.name, null])],
      ['sand', 'Sand', Object.entries(SAND_STYLES).map(([k, v]) => [k, v.name, v.base])],
      ['soil', 'Soil', Object.entries(SOIL_STYLES).map(([k, v]) => [k, v.name, v.base])],
      ['gravel', 'Pond gravel', Object.entries(GRAVEL_STYLES).map(([k, v]) => [k, v.name, v.pebbles[0]])],
      ['water', 'Water tint', [['clear', 'Clear blue', '#8fd0ec'], ['teal', 'Teal', '#82d6cd'], ['green', 'Pond green', '#a0d2a0'], ['blue', 'Deep blue', '#78b4f0']]],
      ['frame', 'Tank frame', [['wood', 'Wood', '#b77d4b'], ['red', 'Red', '#d9483b'], ['blue', 'Blue', '#4c8fd6'], ['green', 'Green', '#6fae4a'], ['yellow', 'Yellow', '#f0bf45']]],
      ['wallpaper', 'Wallpaper', [['cream', 'Cream', '#f6ead0'], ['mint', 'Mint', '#dff0e3'], ['sky', 'Sky', '#dcecf6'], ['rose', 'Rose', '#f8e1dc']]],
    ];
    for (const [key, label, opts] of groups) {
      body.append(el('h4', {}, label));
      const row = el('div', { class: 'swatches' });
      for (const [val, name, col] of opts) {
        const ok = this.journal.isStyleUnlocked(key, val);
        const b = el('button', { class: 'swatch' + (w.style[key] === val ? ' on' : '') + (ok ? '' : ' locked'), onclick: () => {
          if (!ok) {
            const by = this.journal.unlockerOf('style', key, val);
            this.toast(by ? `Locked: discover “${by.title}”. Hint: ${by.hint}` : 'Locked', 'star');
            return;
          }
          w.style[key] = val;
          this.r.applyStyle();
          this.renderSheet();
          this.hooks.save();
        } });
        if (col) b.append(el('i', { style: `background:${col}` }));
        b.append(name);
        if (!ok) b.append(iconCanvas('lock', 16));
        row.append(b);
      }
      body.append(row);
    }
  }

  buildShape(body) {
    const tools = [
      ['sand', 'Add sand', '#e8c483'],
      ['soil', 'Add soil', '#7d5538'],
      ['rock', 'Add rock', '#a7a39a'],
      ['gravel', 'Add gravel', '#cfc3ad'],
      ['dig', 'Dig away', '#5e3f29'],
    ];
    const row = el('div', { class: 'swatches' });
    for (const [id, name, col] of tools) {
      row.append(el('button', { class: 'swatch' + (this.choice.shape === id ? ' on' : ''), onclick: () => {
        this.choice.shape = id;
        this.renderSheet();
      } }, el('i', { style: `background:${col}` }), name));
    }
    body.append(row);
    const out = el('output', {}, String(this.brush));
    const range = el('input', { type: 'range', min: 8, max: 60, value: this.brush, 'aria-label': 'Brush size', oninput: (e) => {
      this.brush = +e.target.value;
      out.textContent = this.brush;
    } });
    body.append(el('div', { class: 'slider' }, el('span', {}, 'Brush size'), range, out));
    body.append(el('h4', {}, 'Pond water level'));
    body.append(
      el('div', { class: 'row' },
        el('button', { class: 'btn small blue', onclick: () => this.water(-12) }, 'Fill up'),
        el('button', { class: 'btn small', onclick: () => this.water(12) }, 'Drain a little'))
    );
    body.append(this.hint);
    this.hint.textContent = 'Drag on the tank to paint. Use two fingers to move around while shaping.';
  }

  water(dy) {
    const w = this.world;
    const t = w.terrain;
    const target = t.waterLevel + dy;
    if (dy < 0 && !t.pondVolumeAt(target).ok) {
      this.toast('Splash! Any more and the pond would overflow.', '!');
      return;
    }
    if (dy > 0 && target > H - 60) {
      this.toast('That is as low as it goes.', '!');
      return;
    }
    w.pourToLevel(target);
    w.env.pond.full = target;
    w.env.pond.evap = 0;
    this.sound.play('splash', 0.5);
    if (dy < 0) w.pour(810, t.waterLevel);
    else w.splash(810, t.waterLevel, 1);
  }

  buildClimate(body) {
    const env = this.world.env;
    const u = this.settings.units;
    const presets = el('div', { class: 'presets' });
    const pre = [
      ['Just right', () => this.setClimate({ room: 21, desert: { lamp: 0.5, mister: 0 }, pond: { lamp: 0.15, filter: 0.5, heater: false }, jungle: { lamp: 0.25, mister: 0.35 } })],
      ['Heat wave', () => this.setClimate({ room: 28, desert: { lamp: 1, mister: 0 }, pond: { lamp: 0.8, heater: true, heaterTarget: 31 }, jungle: { lamp: 0.9, mister: 0 } })],
      ['Cold snap', () => this.setClimate({ room: 9, desert: { lamp: 0, mister: 0 }, pond: { lamp: 0, heater: true, heaterTarget: 10 }, jungle: { lamp: 0, mister: 0.2 } })],
      ['Rainy day', () => this.setClimate({ desert: { mister: 0.7 }, jungle: { mister: 1 } })],
      ['Dry spell', () => this.setClimate({ desert: { mister: 0 }, jungle: { mister: 0, lamp: 0.7 } })],
    ];
    for (const [n, f] of pre) presets.append(el('button', { class: 'btn small', onclick: () => {
      f();
      this.renderSheet();
      this.toast(`${n}! Watch how everyone reacts.`, 'thermo');
    } }, n));
    body.append(presets);
    // the weather outside, and what's coming
    this.weatherLine = el('span', { class: 'wx' });
    const wxToggle = el('input', { type: 'checkbox', checked: env.weatherOn, 'aria-label': 'Changing weather', onchange: (e) => {
      env.weatherOn = e.target.checked;
      this.updateClimate();
    } });
    body.append(el('div', { class: 'row', style: 'margin-bottom:6px' }, iconCanvas('sun', 22), this.weatherLine, el('label', { class: 'mini-toggle', title: 'When off, the weather stays mild' }, wxToggle, 'Changing weather')));
    // lights
    const lights = el('div', { class: 'row', style: 'margin-bottom:8px' }, el('span', {}, 'Room lights:'));
    for (const [k, l] of [['auto', 'Day & night'], ['day', 'Always day'], ['night', 'Always night']]) {
      lights.append(el('button', { class: 'btn small' + (env.lightsMode === k ? ' on' : ''), onclick: () => {
        env.lightsMode = k;
        this.renderSheet();
      } }, l));
    }
    body.append(lights);
    const roomOut = el('output', {}, fmtTemp(env.roomSet, u));
    body.append(
      el('div', { class: 'slider', style: 'grid-template-columns:120px 1fr 52px;margin-bottom:6px' }, el('span', { title: 'Warms or cools the whole tank, all three zones at once' }, 'Room thermostat'),
        el('input', { type: 'range', min: 6, max: 30, step: 1, value: env.roomSet, 'aria-label': 'Room thermostat', oninput: (e) => {
          env.roomSet = +e.target.value;
          roomOut.textContent = fmtTemp(env.roomSet, u);
        } }), roomOut)
    );
    const grid = el('div', { class: 'zones3' });
    const slider = (label, help, get, set, fmt = (v) => Math.round(v * 100) + '%', min = 0, max = 1, step = 0.05) => {
      const out = el('output', {}, fmt(get()));
      const r = el('input', { type: 'range', min, max, step, value: get(), 'aria-label': label, oninput: (e) => {
        set(+e.target.value);
        out.textContent = fmt(+e.target.value);
        this.updateClimate();
      } });
      return el('div', { class: 'slider', title: help }, el('span', {}, label), r, out);
    };
    this.climateEls = {};
    const zc = (name, title, icon, inner) => {
      const big = el('span', { class: 'big' });
      const read = el('div', { class: 'readouts' });
      const gauges = el('div', { class: 'gauges' });
      const advice = el('div', { class: 'advice' });
      this.climateEls[name] = { big, read, gauges, advice };
      const c = el('div', { class: 'zonecard', 'data-z': name }, el('h3', {}, iconCanvas(icon, 24), title, big), gauges, advice, read, ...inner);
      grid.append(c);
      return c;
    };
    const bottle = (z) => {
      const m = el('div', { class: 'meter bottle' }, el('i'));
      const b = el('button', { class: 'btn small blue', onclick: () => {
        this.world.refillMister(z);
        this.sound.play('splash', 0.4);
        this.toast(`Glug glug! The ${z} mister bottle is full again.`, 'drop');
        this.updateClimate();
      } }, 'Refill');
      this.climateEls[z].bottle = m;
      return el('div', { class: 'equip', title: 'The mister sprays from this bottle. When it runs dry the air dries out.' }, el('span', {}, 'Mister water'), m, b);
    };
    zc('desert', 'Desert', 'sun', [
      slider('Heat lamp', 'Warms the desert air, and makes a hot basking spot right under the lamp', () => env.desert.lamp, (v) => (env.desert.lamp = v)),
      slider('Mister', 'Sprays fine rain: damper air, a little cooler. Uses water from its bottle', () => env.desert.mister, (v) => (env.desert.mister = v)),
    ]);
    grid.lastChild.append(bottle('desert'));
    const heaterOut = el('output', {}, fmtTemp(env.pond.heaterTarget, u));
    const heaterRange = el('input', { type: 'range', min: 6, max: 34, step: 1, value: env.pond.heaterTarget, 'aria-label': 'Heater temperature', oninput: (e) => {
      env.pond.heaterTarget = +e.target.value;
      heaterOut.textContent = fmtTemp(env.pond.heaterTarget, u);
    } });
    const heaterToggle = el('input', { type: 'checkbox', checked: env.pond.heater, 'aria-label': 'Heater on', onchange: (e) => (env.pond.heater = e.target.checked) });
    this.pondMeters = el('div', { class: 'meters' });
    zc('pond', 'Pond', 'drop', [
      this.pondMeters,
      slider('Lamp', 'Light and a little warmth. Plants like light, but so does algae', () => env.pond.lamp, (v) => (env.pond.lamp = v)),
      slider('Filter', 'Pumps and cleans the water: more air, less cloud and algae', () => env.pond.filter, (v) => (env.pond.filter = v)),
      el('div', { class: 'slider', title: 'Holds the water at this temperature, whatever the room does' }, el('label', { style: 'display:flex;gap:4px;align-items:center' }, heaterToggle, 'Heater'), heaterRange, heaterOut),
    ]);
    const chore = (label, cls, fn) => el('button', { class: 'btn small' + (cls ? ' ' + cls : ''), onclick: () => {
      fn();
      this.updateClimate();
    } }, label);
    grid.lastChild.append(
      el('div', { class: 'row', style: 'margin-top:4px' },
        chore('Clean pond', 'blue', () => {
          const n = this.world.cleanPond();
          this.sound.play('splash', 0.6);
          this.toast(n ? `Swish! Siphoned out ${n} bits of old food.` : 'Swish! The pond got a little rinse.', 'drop');
        }),
        chore('Rinse filter', '', () => {
          this.world.rinseFilter();
          this.sound.play('splash', 0.4);
          this.toast('Squeeze, rinse, squeeze! The filter sponge is clean.', 'drop');
        }),
        chore('Top up', '', () => {
          this.world.topUpPond();
          this.sound.play('splash', 0.5);
          this.toast('Topped the pond back up to its line.', 'drop');
        }),
        chore('Tidy leftovers', '', () => {
          const n = this.world.tidyLand();
          this.toast(n ? `Tidied up ${n} squishy leftovers.` : 'Nothing squishy to tidy up.', 'leaf');
        }))
    );
    zc('jungle', 'Jungle', 'leaf', [
      slider('Heat lamp', 'Warms the jungle air', () => env.jungle.lamp, (v) => (env.jungle.lamp = v)),
      slider('Mister', 'Rainforest drizzle: damp air for snails, worms and frogs. Uses water from its bottle', () => env.jungle.mister, (v) => (env.jungle.mister = v)),
    ]);
    grid.lastChild.append(bottle('jungle'));
    body.append(grid);
    this.updateClimate(true);
    if (this.flashZone) {
      const card = grid.querySelector(`[data-z="${this.flashZone}"]`);
      this.flashZone = null;
      if (card) {
        card.classList.add('flash');
        requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      }
    }
  }

  setClimate(c) {
    const env = this.world.env;
    for (const z of Object.keys(c)) {
      if (z === 'room') env.roomSet = c.room;
      else Object.assign(env[z], c[z]);
    }
  }

  // A thermometer-style bar: the comfy range shaded green, a pin for now.
  gaugeHTML(v, lo, hi, min, max, cls, label) {
    const pct = (x) => clamp01((x - min) / (max - min)) * 100;
    return `<div class="gauge ${cls}" title="${esc(label)}"><div class="track"><b style="left:${pct(lo)}%;width:${Math.max(1.5, pct(hi) - pct(lo))}%"></b><i style="left:${pct(v)}%"></i></div></div>`;
  }

  // How a zone's critters feel about the climate, in a sentence.
  zoneAdvice(st) {
    const b = st.band;
    const names = (sps) => listWords(sps.slice(0, 3).map((sp) => plural(sp, 2)));
    if (st.ok) return b.sps.length ? `<span class="good">Just right for the ${esc(names(b.sps))}.</span>` : '<span class="good">All set for whoever moves in.</span>';
    const out = [];
    if (st.tState !== 'ok') out.push(`Too ${st.tState === 'hot' ? 'hot' : 'chilly'} for the ${esc(names(st.tState === 'hot' ? b.tHi : b.tLo))}`);
    if (st.mState !== 'ok') out.push(`too ${st.mState === 'dry' ? 'dry' : 'soggy'} for the ${esc(names(st.mState === 'dry' ? b.mLo : b.mHi))}`);
    if (st.water === 'air') out.push('the water is short of air');
    else if (st.water === 'cloudy') out.push('the water is cloudy');
    const t = out.join(', and ');
    return `<span class="bad sev${st.sev}">${t[0].toUpperCase() + t.slice(1)}.</span>`;
  }

  updateClimate(force) {
    if (!this.climateEls || this.tool !== 'climate') return;
    const env = this.world.env;
    const u = this.settings.units;
    const d = this.climateEls;
    const wet = (m) => (m < 0.15 ? 'bone dry' : m < 0.35 ? 'dry' : m < 0.6 ? 'a bit damp' : m < 0.8 ? 'damp' : 'soggy');
    const wx = env.weather;
    const fc = env.forecast;
    const hrs = Math.max(1, Math.round(((env.wx.change - env.time) / DAY_LEN) * 24));
    this.weatherLine.innerHTML = `Weather: <b>${esc(wx.name)}</b>${wx.temp ? ` (${wx.temp > 0 ? '+' : ''}${Math.round(wx.temp)}°)` : ''}${fc && fc !== wx ? ` · next: ${esc(fc.name)} in ~${hrs}h` : ''}`;
    for (const z of ['desert', 'pond', 'jungle']) {
      const band = zoneBand(this.world, z);
      const st = zoneStatus(this.world, z, band);
      const e = d[z];
      e.big.textContent = fmtTemp(st.T, u);
      e.big.className = 'big ' + (st.tState === 'ok' ? 'ok' : st.tState);
      let g = this.gaugeHTML(st.T, band.t[0], band.t[1], 0, 45, st.tState, 'Temperature') + `<span class="glabel">comfy ${fmtTemp(band.t[0], u)}–${fmtTemp(band.t[1], u)}</span>`;
      if (band.m) g += this.gaugeHTML(st.M, band.m[0], band.m[1], 0, 1, 'damp ' + st.mState, 'Dampness') + `<span class="glabel">damp ${Math.round(st.M * 100)}%, comfy ${Math.round(band.m[0] * 100)}–${Math.round(band.m[1] * 100)}%</span>`;
      e.gauges.innerHTML = g;
      e.advice.innerHTML = this.zoneAdvice(st);
      if (e.bottle) {
        const w = env[z].water;
        e.bottle.firstChild.style.width = Math.round(w * 100) + '%';
        e.bottle.firstChild.style.background = w < 0.2 ? '#e2553f' : '#7cc0e6';
      }
    }
    d.desert.read.textContent = `Air is ${wet(env.desert.moist)} · sand under the lamp ${fmtTemp(env.tempAt(416, this.world.terrain.surfaceY(416) - 3, this.world.terrain), u)}`;
    d.jungle.read.textContent = `Air is ${wet(env.jungle.moist)} · leafy plants keep it humid`;
    const p = env.pond;
    const meter = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
    const fill = 1 - env.lowWater;
    this.pondMeters.innerHTML = `<span>Air</span>${meter(p.oxygen, p.oxygen < 0.45 ? '#e2553f' : '#7cc0e6')}<span>Clear</span>${meter(p.clarity, p.clarity < 0.6 ? '#c98a4a' : '#77b255')}<span>Algae</span>${meter(p.algae, '#5f9e45')}<span>Filter</span>${meter(p.filterClean, p.filterClean < 0.35 ? '#c98a4a' : '#9aa0a6')}<span>Water</span>${meter(fill, fill < 0.6 ? '#e2553f' : '#4c8fd6')}`;
    d.pond.read.textContent = p.oxygen < 0.45 ? 'The water is stuffy — fish need more air!' : p.clarity < 0.6 ? 'The water is getting cloudy.' : p.filterClean < 0.35 ? 'The filter sponge is clogged.' : env.lowWater > 0 ? 'Water is evaporating below the line.' : 'Water looks healthy.';
  }

  // ------------------------------------------------------------------ clipboard
  // The keeper's clipboard: one place to see what needs doing right now, how
  // each zone is doing, and the goals that grow the farm.
  buildClipboard(body) {
    const z = this.tab.clip;
    this.clipEls = { z, needs: el('div', { class: 'needs' }), status: el('div', { class: 'zstatus' }), goals: el('div', { class: 'goals' }) };
    if (z === 'needs') {
      body.append(this.clipEls.status, el('h4', {}, 'Things to do'), this.clipEls.needs);
    } else {
      body.append(this.clipEls.status, el('h4', {}, 'Needs here'), this.clipEls.needs, this.clipEls.goals);
      this.buildGoals(z, this.clipEls.goals);
    }
    this.needsKey = '';
    this.updateClipboard(true);
  }

  buildGoals(z, box) {
    const j = this.journal;
    const prog = j.progress;
    box.innerHTML = '';
    if (j.sandbox || prog.legacy) {
      box.append(el('p', { class: 'small' }, 'Everything is unlocked in this tank. Start a new farm from Settings to grow one zone at a time.'));
      return;
    }
    const lv = prog.levels[z];
    const max = maxLevel(z);
    const stars = '★'.repeat(lv) + '☆'.repeat(max - lv);
    box.append(el('h4', {}, `${ZONE_NAMES[z]} level ${lv} `, el('span', { class: 'stars' }, stars)));
    const next = prog.nextUnlocks(z);
    if (!next) {
      box.append(el('p', {}, `The ${z} is fully grown! Every ${z} critter, snack and plant is yours.`));
      return;
    }
    box.append(el('p', { class: 'small' }, `Finish these to reach level ${lv + 1}:`));
    this.goalEls = [];
    for (const g of prog.goals(z)) {
      const bar = el('i');
      const lab = el('span', { class: 'glab' });
      const row = el('div', { class: 'goal' }, el('span', { class: 'tick' }), el('span', { class: 'gtext' }, g.text, g.tip ? el('small', {}, g.tip) : null), el('div', { class: 'meter' }, bar), lab);
      this.goalEls.push({ g, row, bar, lab });
      box.append(row);
    }
    const names = [];
    for (const sp of next.critters || []) names.push(SPECIES[sp].plural);
    for (const f of next.foods || []) names.push(FOODS[f].name);
    for (const pl of next.plants || []) names.push(PLANTS[pl].name);
    for (const d of next.decor || []) names.push(DECOR[d].name);
    box.append(el('div', { class: 'unlocks' }, el('b', {}, 'Unlocks: '), names.join(' · ')));
  }

  updateClipboard(force) {
    if (!this.clipEls || this.tool !== 'clip') return;
    const w = this.world;
    const u = this.settings.units;
    const z = this.clipEls.z;
    const zones = z === 'needs' ? ['desert', 'pond', 'jungle'] : [z];
    // zone status rows
    let html = '';
    for (const zz of zones) {
      const band = zoneBand(w, zz);
      const st = zoneStatus(w, zz, band);
      const damp = band.m ? `<span class="ztemp ${st.mState}" title="How damp the air is">${Math.round(st.M * 100)}%</span>${this.gaugeHTML(st.M, band.m[0], band.m[1], 0, 1, 'damp ' + st.mState, 'Dampness')}` : '<span></span><span></span>';
      html += `<div class="zrow"><span class="zname">${ZONE_NAMES[zz]}</span><span class="ztemp ${st.tState}" title="Air temperature">${fmtTemp(st.T, u)}</span>${this.gaugeHTML(st.T, band.t[0], band.t[1], 0, 45, st.tState, 'Temperature')}${damp}<div class="zadvice">${this.zoneAdvice(st)}</div></div>`;
    }
    this.clipEls.status.innerHTML = html;
    // needs (rebuilt only when they change, so buttons don't jump under a finger)
    const needs = this.needs.filter((n) => z === 'needs' || n.zone === z || n.zone == null);
    const key = needs.map((n) => n.text).join('|');
    if (force || key !== this.needsKey) {
      this.needsKey = key;
      const box = this.clipEls.needs;
      box.innerHTML = '';
      const real = needs.filter((n) => n.sev > 0);
      if (!real.length) box.append(el('div', { class: 'need ok' }, iconCanvas('heart', 22), el('span', {}, z === 'needs' ? 'Everyone is happy and comfy. Lovely keeping!' : `Nothing needs doing in the ${z} right now.`)));
      for (const n of needs) {
        const act = n.act ? el('button', { class: 'btn small' + (n.sev >= 2 ? ' yellow' : ''), onclick: () => this.doNeed(n) }, this.needLabel(n.act)) : null;
        const named = n.zone && n.text.toLowerCase().includes(n.zone);
        box.append(el('div', { class: 'need sev' + Math.floor(n.sev) }, iconCanvas(n.icon || 'leaf', 22), el('span', {}, (z === 'needs' && n.zone && !named ? `${ZONE_NAMES[n.zone]}: ` : '') + n.text), act));
      }
    }
    if (this.goalEls) {
      const prog = this.journal.progress;
      for (const ge of this.goalEls) {
        const gp = prog.goalProgress(z, ge.g);
        ge.bar.style.width = Math.round(gp.f * 100) + '%';
        ge.lab.textContent = gp.label;
        ge.row.classList.toggle('done', gp.f >= 1);
      }
    }
  }

  needLabel(act) {
    return { climate: 'Climate', feed: 'Feed', refill: 'Refill', clean: 'Clean', rinse: 'Rinse', topup: 'Top up', tidy: 'Tidy' }[act.kind] || 'Show me';
  }

  // Do (or open the controls for) whatever a need asks.
  doNeed(n) {
    const w = this.world;
    const a = n.act;
    switch (a.kind) {
      case 'refill':
        w.refillMister(a.zone);
        this.sound.play('splash', 0.4);
        this.toast(`Glug glug! The ${a.zone} mister bottle is full again.`, 'drop');
        break;
      case 'clean':
        w.cleanPond();
        this.sound.play('splash', 0.6);
        this.toast('Swish! The pond is clean again.', 'drop');
        break;
      case 'rinse':
        w.rinseFilter();
        this.sound.play('splash', 0.4);
        this.toast('The filter sponge is clean.', 'drop');
        break;
      case 'topup':
        w.topUpPond();
        this.sound.play('splash', 0.5);
        this.toast('Topped the pond back up to its line.', 'drop');
        break;
      case 'tidy': {
        const k = w.tidyLand();
        this.toast(k ? `Tidied up ${k} squishy leftovers.` : 'All tidy.', 'leaf');
        break;
      }
      case 'feed':
        if (a.food) this.choice.feed = a.food;
        this.setTool('feed');
        if (a.zone) this.goZone(ZONES.find((zz) => zz.id === a.zone));
        return;
      default:
        this.flashZone = a.zone;
        this.setTool('climate');
        if (a.zone) this.goZone(ZONES.find((zz) => zz.id === a.zone));
        return;
    }
    this.refreshNeeds();
    this.updateClipboard(true);
  }

  refreshNeeds() {
    this.needs = tankNeeds(this.world, (k, id) => this.journal.canUse(k, id), (t) => fmtTemp(t, this.settings.units));
    const urgent = this.needs.filter((n) => n.sev >= 1);
    const top = urgent.length ? urgent[0].sev : 0;
    this.clipBadge.textContent = urgent.length;
    this.clipBadge.classList.toggle('hidden', !urgent.length);
    this.clipBadge.className = 'badge' + (urgent.length ? '' : ' hidden') + (top >= 2 ? ' hot' : '');
  }

  // A zone grew: show off what's new.
  levelUp(z, lv, unlocks) {
    const names = [];
    for (const sp of unlocks.adopt) names.push(SPECIES[sp].plural);
    for (const f of unlocks.feed) names.push(FOODS[f].name);
    for (const pl of unlocks.plant) names.push(PLANTS[pl].name);
    for (const d of unlocks.decor) names.push(DECOR[d].name);
    this.sound.play('sparkle', 0.9);
    this.haptic(30);
    this.toast(`<b>${ZONE_NAMES[z]} reached level ${lv}!</b><br>New: ${esc(names.join(', '))}`, 'star', true, 7000);
    const zz = ZONES.find((k) => k.id === z);
    if (zz) this.world.sparkle(zz.x, 300, 14);
    this.clipBtn.classList.add('pulse');
    setTimeout(() => this.clipBtn.classList.remove('pulse'), 4000);
    if (this.tool === 'clip' || TOOL_KIND[this.tool]) this.renderSheet();
  }

  setSpeed(v, quiet) {
    if (v === 0) this.game.paused = true;
    else {
      this.game.paused = false;
      this.game.speed = v;
      this.lastSpeed = v;
    }
    const icon = iconCanvas(this.game.paused ? 'play' : 'pause', 22);
    this.playBtn.innerHTML = '';
    this.playBtn.append(icon);
    this.playBtn.classList.toggle('on', this.game.paused);
    const sp = this.game.paused ? this.lastSpeed || 1 : this.game.speed;
    this.fastBtn.innerHTML = '';
    this.fastBtn.append(iconCanvas('fast', 18), el('span', {}, sp + '×'));
    this.fastBtn.classList.toggle('on', !this.game.paused && sp > 1);
    if (!quiet) this.sound.play('pop', 0.4);
  }

  cycleLens() {
    this.lensIdx = (this.lensIdx + 1) % LENSES.length;
    const L = LENSES[this.lensIdx];
    this.r.lens = L.id;
    this.lensBtn.classList.toggle('on', L.id !== 'none');
    this.lensLabel.textContent = L.label;
    this.lensLabel.classList.toggle('hidden', L.id === 'none');
    this.sound.play('pop', 0.4);
  }

  goZone(z) {
    const cam = this.cam;
    if (z.id === 'all') cam.flyTo(W / 2, H / 2, cam.fitAll);
    else cam.flyTo(z.x, cam.portrait ? 430 : H / 2 + 30, Math.max(cam.zoom, cam.defaultZoom()));
    cam.follow = null;
  }

  // ------------------------------------------------------------------ input from the tank
  pick(wx, wy) {
    const w = this.world;
    const zr = 18 / this.cam.zoom;
    let best = null;
    let bd = 1e9;
    for (const c of w.creatures) {
      if (c.dead || (c.hidden && c.pose !== 'burrow')) continue;
      const r = Math.max(zr, c.size * 0.6);
      let d;
      if (c.sp === 'worm' && c.body) {
        d = Math.min(...c.body.map((p) => Math.hypot(p.x - wx, p.y - wy)));
      } else d = Math.hypot(c.x - wx, c.y - wy);
      if (d < r && d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) return best;
    for (const f of w.foods) {
      const d = Math.hypot(f.x - wx, f.y - 3 - wy);
      if (d < Math.max(zr, 8) && d < bd) {
        bd = d;
        best = f;
      }
    }
    if (best) return best;
    for (const d of w.decor) if (d.hit(wx, wy)) return d;
    for (const p of w.plants) {
      const [x0, y0, x1] = p.shape.box;
      if (wx > p.x + x0 + 2 && wx < p.x + x1 - 2 && wy > p.y + y0 + 2 && wy < p.y + 4) return p;
    }
    return null;
  }

  tap(wx, wy, sx, sy, dbl) {
    this.sound.unlock();
    const w = this.world;
    switch (this.tool) {
      case 'feed': {
        if (!this.choice.feed) return;
        if (wy < 0 || wy > H || wx < 0 || wx > W) return;
        w.dropFood(this.choice.feed, wx, Math.max(14, wy));
        this.sound.play('pop', 0.5);
        this.haptic(8);
        return;
      }
      case 'adopt': {
        if (!this.choice.adopt) {
          this.toast('Pick a critter from the tray first!', '?');
          return;
        }
        const r = w.adopt(this.choice.adopt, wx, wy);
        if (!r.ok) this.toast(r.msg, '!');
        else {
          if (r.msg) this.toast(r.msg, 'heart');
          this.sound.play('sparkle', 0.5);
          this.haptic(15);
          this.renderSheet();
        }
        return;
      }
      case 'plant': {
        if (!this.choice.plant) {
          this.toast('Pick a plant from the tray first!', '?');
          return;
        }
        const r = w.placePlant(this.choice.plant, wx);
        if (!r.ok) this.toast(r.msg, '!');
        else {
          this.sound.play('place', 0.6);
          w.dust(wx, w.terrain.surfaceY(wx), 4);
          this.haptic(10);
        }
        return;
      }
      case 'decor': {
        if (this.moving) {
          const d = this.moving;
          const v = w.canPlace('decor', d.type, wx, wy);
          if (!v.ok) {
            this.toast(v.msg, '!');
            return;
          }
          d.x = wx;
          d.y = d.def.place === 'top' ? 0 : w.terrain.surfaceY(wx);
          this.moving = null;
          this.r.ghost = null;
          this.sound.play('place', 0.6);
          w.addNovelty(d.x, d.y - 10, 1);
          return;
        }
        const hit = this.pick(wx, wy);
        if (hit && hit.kind === 'decor' && !this.choice.decor) {
          this.select(hit);
          return;
        }
        if (!this.choice.decor) {
          if (hit) this.select(hit);
          else this.toast('Pick a decoration from the tray first!', '?');
          return;
        }
        const r = w.placeDecor(this.choice.decor, wx, wy);
        if (!r.ok) this.toast(r.msg, '!');
        else {
          this.sound.play('place', 0.7);
          w.dust(wx, w.terrain.surfaceY(wx), 5);
          this.haptic(12);
          this.hooks.terrainChanged();
        }
        return;
      }
      case 'shape':
        this.paint(wx, wy);
        this.hooks.terrainChanged();
        return;
      default: {
        if (this.tapEquipment(wx, wy)) return;
        const hit = this.pick(wx, wy);
        if (hit) {
          this.select(hit);
          this.sound.play('pop', 0.4);
          return;
        }
        if (dbl) {
          const cam = this.cam;
          const z = cam.zoom < cam.fitHeight * 1.6 ? cam.zoom * 2 : cam.defaultZoom();
          cam.flyTo(wx, wy, z);
          return;
        }
        if (this.selected) {
          this.select(null);
          return;
        }
        if (wx > 0 && wx < W && wy > 0 && wy < H) {
          const n = w.tapGlass(wx, wy);
          this.sound.play('knock', 0.6);
          this.haptic(6);
          if (n) w.splash(wx, wy, 0);
        }
      }
    }
  }

  // The glass thermometers open the clipboard; a mister's bottle refills.
  tapEquipment(wx, wy) {
    const slop = 6 / Math.max(0.5, this.cam.zoom);
    for (const [z, [x, y]] of Object.entries(GAUGE_AT)) {
      if (Math.abs(wx - x) < 9 + slop && wy > y - 6 - slop && wy < y + (z === 'pond' ? 64 : 84) + slop) {
        this.tab.clip = z;
        this.setTool('clip');
        return true;
      }
    }
    for (const z of ['desert', 'jungle']) {
      const x = MISTER_X[z];
      if (Math.abs(wx - (x + 8)) < 14 + slop && wy < 10 + slop && wy > -24 - slop) {
        if (this.world.env[z].water < 0.97) {
          this.world.refillMister(z);
          this.sound.play('splash', 0.4);
          this.toast(`Glug glug! The ${z} mister bottle is full again.`, 'drop');
        } else {
          this.flashZone = z;
          this.setTool('climate');
        }
        return true;
      }
    }
    return false;
  }

  hold(wx, wy, held) {
    if (this.tool !== 'feed' || !this.choice.feed) return;
    const now = performance.now();
    if (this._sprinkle && now - this._sprinkle < 220) return;
    this._sprinkle = now;
    if (wx < 0 || wx > W || wy > H) return;
    this.world.dropFood(this.choice.feed, wx + rrange(-14, 14), Math.max(14, wy + rrange(-6, 6)));
    this.sound.play('pop', 0.3, 1 + Math.random() * 0.3);
  }

  dragStart(wx, wy) {
    this.lastPaint = null;
    this.paint(wx, wy);
  }
  dragMove(wx, wy) {
    if (this.lastPaint && Math.hypot(wx - this.lastPaint[0], wy - this.lastPaint[1]) < this.brush * 0.35) return;
    this.paint(wx, wy);
  }
  dragEnd() {
    this.lastPaint = null;
    this.hooks.terrainChanged();
  }
  paint(wx, wy) {
    if (this.tool !== 'shape') return;
    this.lastPaint = [wx, wy];
    const n = this.world.sculpt(wx, wy, this.brush, this.choice.shape);
    if (n) {
      this.world.dust(wx, wy, 2);
      if (Math.random() < 0.3) this.sound.play('tap', 0.4);
    }
    this.r.ghost = { kind: 'brush', x: wx, y: wy, r: this.brush };
  }

  hover(wx, wy) {
    if (wx == null) {
      this.r.ghost = null;
      return;
    }
    if (this.tool === 'shape') this.r.ghost = { kind: 'brush', x: wx, y: wy, r: this.brush };
    else if (this.tool === 'decor' && (this.choice.decor || this.moving)) {
      const def = DECOR[this.moving ? this.moving.type : this.choice.decor];
      const y = def.place === 'top' ? 0 : this.world.terrain.surfaceY(wx);
      const ok = this.world.canPlace('decor', def.id, wx, y).ok;
      this.r.ghost = { kind: 'decor', def, x: wx, y, ok };
    } else this.r.ghost = null;
  }

  haptic(ms) {
    // (browsers refuse, noisily, before the first real tap)
    const ua = navigator.userActivation;
    if (ua && !ua.hasBeenActive) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {
        /* ignore */
      }
    }
  }

  // ------------------------------------------------------------------ info card
  select(ent) {
    this.selected = ent;
    this.r.selected = ent;
    this.portraitKey = '';
    if (!ent) {
      this.card.classList.add('hidden');
      if (this.cam.follow) this.cam.follow = null;
      return;
    }
    this.buildCard();
    this.card.classList.remove('hidden');
    if (ent.kind === 'creature') this.world.events.emit('inspect', { c: ent });
  }

  buildCard() {
    const e = this.selected;
    const c = this.card;
    c.innerHTML = '';
    this.portrait = el('canvas', { class: 'portrait' });
    this.cardName = el('div', { class: 'card-name' });
    this.cardSub = el('div', { class: 'card-sub' });
    this.cardThought = el('div', { class: 'thought' });
    this.cardMeters = el('div', { class: 'meters' });
    this.cardChips = el('div', { class: 'chips' });
    const close = el('button', { class: 'card-close', 'aria-label': 'Close', onclick: () => this.select(null) }, '×');
    c.append(el('div', { class: 'card-top' }, this.portrait, el('div', { style: 'flex:1;min-width:0' }, this.cardName, this.cardSub), close));
    const actions = el('div', { class: 'card-actions' });
    if (e.kind === 'creature') {
      c.append(this.cardThought, this.cardMeters, this.cardChips);
      actions.append(
        el('button', { class: 'btn small yellow', onclick: () => {
          this.cam.follow = this.cam.follow === e ? null : e;
          if (this.cam.follow) this.cam.flyTo(e.x, e.y, Math.max(this.cam.zoom, this.cam.fitHeight * 2.2));
          this.cam.target = null;
          this.buildCard();
        } }, this.cam.follow === e ? 'Stop following' : 'Follow'),
        el('button', { class: 'btn small', onclick: () => {
          this.world.pet(e);
          this.sound.play('sparkle', 0.4);
        } }, 'Pet'),
        el('button', { class: 'btn small', onclick: () => this.treat(e) }, 'Give treat'),
        el('button', { class: 'btn small', onclick: () => this.rename(e) }, 'Rename'),
        el('button', { class: 'btn small', onclick: () => this.rehome(e) }, 'Say bye')
      );
    } else if (e.kind === 'plant') {
      c.append(this.cardMeters);
      actions.append(el('button', { class: 'btn small', onclick: () => {
        this.world.removePlant(e);
        this.world.dust(e.x, e.y, 5);
        this.select(null);
      } }, 'Dig it up'));
    } else if (e.kind === 'decor') {
      c.append(this.cardMeters);
      actions.append(
        el('button', { class: 'btn small yellow', onclick: () => {
          this.moving = e;
          if (this.tool !== 'decor') this.setTool('decor');
          this.moving = e;
          this.toast('Tap where it should go.', 'house');
          this.select(null);
        } }, 'Move'),
        el('button', { class: 'btn small', onclick: () => {
          e.flip = !e.flip;
        } }, 'Flip'),
        el('button', { class: 'btn small', onclick: () => {
          this.world.removeDecor(e);
          this.select(null);
          this.world.computeRegions();
        } }, 'Remove')
      );
    } else if (e.kind === 'food') {
      c.append(this.cardMeters);
      actions.append(el('button', { class: 'btn small', onclick: () => {
        this.world.removeFood(e);
        this.select(null);
      } }, 'Tidy it up'));
    }
    c.append(actions);
    this.updateCard(true);
  }

  updateCard(force) {
    const e = this.selected;
    if (!e) return;
    if (e.removed || e.gone || (e.kind === 'creature' && e.dead && e.deadT > 3.5)) {
      this.select(null);
      return;
    }
    const u = this.settings.units;
    if (e.kind === 'creature') {
      const key = e.sp + e.stage + e.palIdx + e.acc;
      if (key !== this.portraitKey) {
        this.portraitKey = key;
        const pose = e.mode === 'swim' ? 'swim' : e.mode === 'fly' ? 'fly' : 'idle';
        const p = e.sp === 'worm' ? wormIcon([72, 64], e.palIdx) : creatureArt(e.sp, e.stage, pose, e.palIdx, e.acc, e.accColor, [72, 64]);
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      const ageD = e.age / DAY_LEN;
      const hrs = Math.max(1, Math.round(ageD * 24));
      const age = ageD < 1 ? `${hrs} hour${hrs === 1 ? '' : 's'} old` : `${ageD.toFixed(ageD < 10 ? 1 : 0)} days old`;
      this.cardName.innerHTML = `${esc(e.name)}`;
      let sub = `${stageName(e.sp, e.stage)} ${e.def.name.toLowerCase()} · ${age}`;
      if (e.dead) sub = `${e.def.name} · passed away`;
      this.cardSub.textContent = sub;
      this.cardThought.textContent = e.dead ? 'Resting peacefully now.' : e.stage === 'egg' ? (e.sp === 'frog' ? 'Little tadpoles are wriggling inside...' : 'Something is growing in here...') : e.stage === 'chrysalis' ? 'Changing... shh!' : e.thought || '...';
      const bar = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
      const mood = this.mood(e);
      this.cardMeters.innerHTML =
        `<span>Tummy</span>${bar(1 - e.hunger, e.hunger > 0.7 ? '#e2553f' : '#f0bf45')}` +
        `<span>Energy</span>${bar(e.energy, '#7cc0e6')}` +
        `<span>Comfort</span>${bar(e.comfort, e.comfort < 0.4 ? '#e2553f' : '#77b255')}` +
        `<span>Health</span>${bar(e.health, e.health < 0.4 ? '#e2553f' : '#e57a8a')}`;
      if (force || !this._chipT || performance.now() - this._chipT > 1000) {
        this._chipT = performance.now();
        const t = e.traits;
        const chips = [mood];
        const d = e.def;
        chips.push(`Feels ${fmtTemp(e.T, u)} · likes ${fmtTemp(d.temp[1], u)}–${fmtTemp(d.temp[2], u)}`);
        if (e.hunger > 0.55 && d.diet) {
          const fav = Object.entries(e.diet).sort((a, b) => b[1] - a[1])[0];
          if (fav) chips.push(`Hungry for ${fav[0]}${d.prey ? ' or ' + d.prey.map((p) => SPECIES[p].plural.toLowerCase()).slice(0, 2).join('/') : ''}`);
        }
        if (t.bold > 0.66) chips.push('Brave');
        else if (t.bold < 0.34) chips.push('Shy');
        if (t.curious > 0.66) chips.push('Curious');
        if (t.social > 0.66) chips.push('Friendly');
        else if (t.social < 0.3) chips.push('Loner');
        if (t.lazy > 0.66) chips.push('Lazy');
        else if (t.lazy < 0.3) chips.push('Busy');
        if (t.greedy > 0.7) chips.push('Greedy');
        if (e.plump > 1.2) chips.push('Plump');
        else if (e.plump < 0.85) chips.push('Skinny');
        if (e.sp === 'ant') {
          const col = this.world.colony(e.colonyId);
          if (col) chips.push(`Colony: ${col.workers(this.world)} ants · ${col.brood.length} babies · larder ${col.food.toFixed(1)}`);
        }
        this.cardChips.innerHTML = chips.map((s) => `<span class="chip">${esc(s)}</span>`).join('');
      }
    } else if (e.kind === 'plant') {
      if (!this.portraitKey) {
        this.portraitKey = 'p';
        const p = artCanvas([72, 64], e.shape.box, (g) => drawPlant(g, e, 0));
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      this.cardName.textContent = e.def.name;
      const state = e.dead ? 'Withered away' : e.thirsty ? 'Thirsty!' : e.comfort < 0.4 ? 'Not happy with the weather' : e.health < 0.6 ? 'A bit poorly' : 'Happy and growing';
      this.cardSub.textContent = `${Math.round(e.growth * 100)}% grown · ${state}`;
      const bar = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
      const fl = e.flowers.length ? `<span>Flowers</span><span>${e.flowers.filter((f) => f.pollinated).length}/${e.flowers.length} pollinated</span>` : '';
      this.cardMeters.innerHTML = `<span>Growth</span>${bar(e.growth, '#77b255')}<span>Health</span>${bar(e.health, e.health < 0.4 ? '#e2553f' : '#e57a8a')}${fl}`;
    } else if (e.kind === 'decor') {
      if (!this.portraitKey) {
        this.portraitKey = 'd';
        const p = artCanvas([72, 64], decorBox(e.def), (g) => DECOR_ART[e.type](g, 0));
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      this.cardName.textContent = e.def.name;
      const inside = this.world.creatures.filter((c) => c.hidden && e.covers(c.x, c.y));
      this.cardSub.textContent = e.def.shelter ? (inside.length ? `Inside: ${inside.map((c) => c.name).slice(0, 4).join(', ')}` : 'Nobody home right now.') : e.def.hive ? `Pollen stored: ${e.store || 0}` : e.def.feeder ? 'Drops food every morning at 8:00.' : 'Looking lovely.';
      this.cardMeters.innerHTML = '';
    } else if (e.kind === 'food') {
      if (this.portraitKey !== 'f' + e.bites + e.rot) {
        this.portraitKey = 'f' + e.bites + e.rot;
        const p = artCanvas([72, 64], [-11, -12, 11, 3], (g) => drawFood(g, e.def, e.rot, 0.7, e.bites));
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      this.cardName.textContent = e.def.name;
      this.cardSub.textContent = e.fresh > 0.35 ? 'Fresh and tasty' : e.fresh > 0 ? 'Getting squishy...' : 'Mouldy! Tidy-uppers love it.';
      const bar = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
      this.cardMeters.innerHTML = `<span>Left</span>${bar(e.amount / e.max, '#f0bf45')}<span>Fresh</span>${bar(e.fresh, '#77b255')}`;
    }
  }

  mood(c) {
    if (c.dead) return 'At peace';
    if (c.stage === 'egg') return 'Snug in an egg';
    if (c.fear > 0.5) return 'Scared!';
    if (c.health < 0.35) return 'Feeling poorly';
    if (c.hunger > 0.75) return 'Very hungry';
    if (c.tempDisc > 0.3) return 'Too hot';
    if (c.tempDisc < -0.3) return 'Too cold';
    if (c.moistDisc < -0.3) return 'Too dry';
    if (c.airDisc > 0.3) return 'Short of air';
    if (c.pose === 'sleep') return 'Sleepy';
    if (c.plump > 1.3) return 'Stuffed full';
    if (c.hunger > 0.5) return 'Peckish';
    if (c.comfort > 0.8 && c.hunger < 0.4) return 'Happy';
    return 'Content';
  }

  // Drop a favourite snack beside a critter. It's a portion sized to how
  // hungry they are, so a hungry critter munches it all the way down.
  treat(c) {
    let best = null;
    let bv = 0;
    for (const id of FOOD_ORDER) {
      if (!this.journal.canUse('feed', id)) continue;
      let v = 0;
      for (const t of FOODS[id].tags) v = Math.max(v, c.diet[t] || 0);
      if (v > bv) {
        bv = v;
        best = id;
      }
    }
    if (!best) {
      this.toast(c.sp === 'aphid' ? 'Aphids only sip plant juice.' : `${c.name} only eats live food or plants.`, '?');
      return;
    }
    const t = this.world.terrain;
    let x = c.x + c.facing * (c.size + 10);
    let y = c.y - 30;
    if (c.inWater || c.mode === 'swim') y = t.waterLevel - 10;
    if (c.mode === 'burrow') y = t.surfaceY(c.x) - 20;
    const need = (Math.max(0.25, c.hunger) * c.appetite) / (0.45 + 0.55 * bv);
    const portion = clamp(need, c.appetite * 0.3, FOODS[best].amount);
    const f = this.world.dropFood(best, clamp(x, 10, W - 10), Math.max(14, y), { amount: portion, max: portion });
    // they spot it straight away
    c.memory.ff = { kind: 'food', food: f, value: bv, name: f.def.name };
    c.memory.ffT = this.world.time;
    c.brain.think = 0;
    this.toast(`A ${FOODS[best].name.toLowerCase()} for ${c.name}!`, 'food');
  }

  rename(c) {
    const n = window.prompt(`New name for ${c.name}?`, c.name);
    if (n && n.trim()) {
      c.name = n.trim().slice(0, 24);
      this.updateCard(true);
    }
  }

  rehome(c) {
    if (!window.confirm(`Send ${c.name} off to live in the big garden outside?`)) return;
    this.world.sparkle(c.x, c.y, 8);
    this.world.addLog(`${c.name} the ${c.def.name.toLowerCase()} moved out to the big garden.`, 'leaf');
    this.world.removeCreature(c);
    this.select(null);
  }

  // ------------------------------------------------------------------ HUD
  update(dt) {
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      this.needT = (this.needT || 0) - 0.25;
      if (this.needT <= 0 || !this.needs) {
        this.needT = 1;
        this.refreshNeeds();
      }
      this.updateHUD();
      this.updateCard();
      this.updateClimate();
      this.updateClipboard();
    }
    if (this.moving && !this.r.ghost) {
      /* ghost set on hover */
    }
  }

  updateHUD() {
    const env = this.world.env;
    const h = env.hour;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60 / 15) * 15;
    const ampm = hh < 12 ? 'am' : 'pm';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    this.clockWhen.textContent = `Day ${env.day} · ${h12}:${String(mm).padStart(2, '0')}${ampm}`;
    const u = this.settings.units;
    // each zone's temperature, coloured against what its critters like
    const parts = [];
    for (const z of ['desert', 'pond', 'jungle']) {
      const st = zoneStatus(this.world, z);
      const arrow = st.tState === 'hot' ? '▲' : st.tState === 'cold' ? '▼' : st.mState === 'dry' ? ' dry' : '';
      const cls = st.tState !== 'ok' ? st.tState : st.mState === 'dry' ? 'dry' : st.sev ? 'warn' : 'ok';
      parts.push(`<span class="zt ${cls}">${ZONE_NAMES[z]} ${fmtTemp(st.T, u)}${arrow}</span>`);
    }
    const html = parts.join(' · ');
    if (html !== this._tempsHTML) {
      this._tempsHTML = html;
      this.clockTemps.innerHTML = html;
    }
    for (const [id, kind] of Object.entries(TOOL_KIND)) this.newDots[id].classList.toggle('hidden', !this.journal.progress.anyFresh(kind) || this.journal.sandbox);
    const night = env.sun < 0.5;
    if (this._night !== night) {
      this._night = night;
      const c = iconCanvas(night ? 'moon' : 'sun', 30);
      this.clockIcon.replaceWith(c);
      this.clockIcon = c;
    }
    // zone chip highlight
    const x = this.cam.x;
    const zid = this.cam.zoom <= this.cam.fitAll * 1.05 ? 'all' : x < ZONE_X.desert[1] ? 'desert' : x < ZONE_X.pond[1] ? 'pond' : 'jungle';
    for (const b of this.zoneBox.children) b.classList.toggle('on', b.dataset.z === zid);
  }

  // ------------------------------------------------------------------ toasts
  toast(msg, icon = 'leaf', big = false, ms = 3200) {
    const t = el('div', { class: 'panel toast' + (big ? ' big' : '') }, iconCanvas(icon, big ? 30 : 24), el('div', { html: msg }));
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastChild.remove();
    setTimeout(() => {
      t.classList.add('fade');
      setTimeout(() => t.remove(), 450);
    }, ms);
  }

  discovery(d) {
    this.sound.play('sparkle', 0.8);
    const reward = d.reward ? (d.reward.decor ? ` <i>Unlocked: ${esc(DECOR[d.reward.decor].name)}!</i>` : ` <i>Unlocked a new style!</i>`) : '';
    this.toast(`<b>Discovery: ${esc(d.title)}</b><br>${esc(d.text)}${reward}`, 'star', true, 6500);
    this.haptic(20);
  }

  // ------------------------------------------------------------------ modals
  openModal(title, body, wide) {
    this.modal.innerHTML = '';
    const box = el('div', { class: 'panel modal-box', role: 'dialog', 'aria-label': title });
    const head = el('div', { class: 'modal-head' }, el('div', { class: 'title' }, title), el('button', { class: 'card-close', 'aria-label': 'Close', onclick: () => this.closeModal() }, '×'));
    const b = el('div', { class: 'modal-body' });
    if (typeof body === 'function') body(b, head);
    else b.append(body);
    box.append(head, b);
    this.modal.append(box);
    this.modal.classList.remove('hidden');
    return b;
  }
  closeModal() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    if (this.onModalClose) {
      const f = this.onModalClose;
      this.onModalClose = null;
      f();
    }
  }

  openJournal(tab) {
    if (tab) this.tab.journal = tab;
    const j = this.journal;
    this.openModal('Field Journal', (b, head) => {
      const tabs = el('div', { class: 'tabs', style: 'margin-right:4px' });
      for (const [k, l] of [['disc', 'Discoveries'], ['guide', 'Field guide'], ['diary', 'Diary'], ['census', 'Census']]) {
        tabs.append(el('button', { class: this.tab.journal === k ? 'on' : '', onclick: () => this.openJournal(k) }, l));
      }
      head.insertBefore(tabs, head.lastChild);
      const t = this.tab.journal;
      if (t === 'disc') {
        b.append(el('p', {}, `You have made ${j.found} of ${j.total} discoveries. Experiment with food, heat, water and light to find them all!`));
        const grid = el('div', { class: 'disc-grid' });
        for (const d of DISCOVERIES) {
          const u = j.unlocked[d.id];
          const reward = d.reward ? (d.reward.decor ? `Reward: ${DECOR[d.reward.decor].name}` : `Reward: ${d.reward.style[1]} ${d.reward.style[0]}`) : '';
          grid.append(
            el('div', { class: 'disc' + (u ? '' : ' locked') }, el('b', {}, u ? '★ ' + d.title : '? ' + d.title), u ? d.text : `Hint: ${d.hint}`, reward ? el('div', { class: 'reward' }, reward) : null)
          );
        }
        b.append(grid);
      } else if (t === 'guide') {
        for (const sp of SPECIES_ORDER) {
          const d = SPECIES[sp];
          const met = j.met[sp];
          const st = sp === 'ant' ? 'worker' : d.adultStage;
          const cv = sp === 'worm' ? wormIcon([74, 60]) : creatureArt(sp, st, sp === 'goldfish' ? 'swim' : sp === 'bee' || sp === 'fruitfly' ? 'fly' : 'idle', 0, null, '#e2553f', [74, 60]);
          if (!met) cv.style.filter = 'brightness(0) opacity(0.25)';
          const u = this.settings.units;
          const eats = Object.entries(d.diet).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join(', ') + (d.prey ? ', ' + d.prey.map((p) => SPECIES[p].plural.toLowerCase()).join(', ') : '');
          b.append(
            el('div', { class: 'guide' }, cv,
              el('div', {},
                el('h3', {}, met ? d.name : '???', el('span', { class: 'small' }, met ? `  · ${this.world.count(sp)} in the tank` : '  · not met yet')),
                met ? el('div', { class: 'small' }, d.blurb) : el('div', { class: 'small' }, `Lives in the ${d.zone}.`),
                met ? el('div', { class: 'small' }, `Comfy at ${fmtTemp(d.temp[1], u)}–${fmtTemp(d.temp[2], u)} · Eats: ${eats} · Active: ${d.activity === 'any' ? 'any time' : d.activity === 'dusk' ? 'dawn & dusk' : 'by ' + d.activity}`) : null,
                met ? el('ul', {}, ...d.facts.map((f) => el('li', {}, f))) : null))
          );
        }
      } else if (t === 'diary') {
        const ul = el('ul', { class: 'diary' });
        for (const l of this.world.log) {
          const hh = Math.floor(l.hour);
          ul.append(el('li', {}, iconCanvas(l.icon === 'paw' ? 'paw' : l.icon, 20), el('span', { class: 'when' }, `Day ${l.day} ${hh}:00`), el('span', {}, l.text)));
        }
        if (!this.world.log.length) ul.append(el('li', {}, 'Nothing written yet.'));
        b.append(ul);
      } else {
        const w = this.world;
        const max = Math.max(1, ...SPECIES_ORDER.map((sp) => w.count(sp)));
        b.append(el('p', {}, `${w.creatures.length} critters · ${w.plants.length} plants · ${w.stats.born} born · ${w.stats.died} passed away · ${w.stats.fed} snacks given`));
        for (const sp of SPECIES_ORDER) {
          const n = w.count(sp);
          if (!n && !j.met[sp]) continue;
          const hist = w.history.slice(-60).map((h) => h.c[sp] || 0);
          const spark = el('canvas', { width: 160, height: 24, style: 'width:100%;height:24px' });
          const g = spark.getContext('2d');
          if (hist.length > 1) {
            const hm = Math.max(1, ...hist);
            g.beginPath();
            hist.forEach((v, i) => {
              const x = (i / (hist.length - 1)) * 158 + 1;
              const y = 22 - (v / hm) * 20;
              if (i) g.lineTo(x, y);
              else g.moveTo(x, y);
            });
            g.strokeStyle = '#4c8fd6';
            g.lineWidth = 2;
            g.stroke();
          } else {
            g.fillStyle = '#77b255';
            g.fillRect(0, 8, (n / max) * 160, 8);
          }
          b.append(el('div', { class: 'census-row' }, el('span', {}, SPECIES[sp].plural), spark, el('b', {}, String(n))));
        }
      }
    });
  }

  openSettings() {
    const s = this.settings;
    this.openModal('Settings', (b) => {
      b.classList.add('settings');
      const toggle = (key, label, onchange) => {
        const i = el('input', { type: 'checkbox', checked: !!s[key], onchange: (e) => {
          s[key] = e.target.checked;
          if (onchange) onchange(s[key]);
          this.hooks.saveSettings();
        } });
        return el('label', { class: 'toggle' }, i, label);
      };
      const choice = (key, label, opts, onchange) => {
        const row = el('div', { class: 'row', style: 'margin:6px 0' }, el('span', { style: 'min-width:120px' }, label));
        for (const [v, l] of opts) {
          row.append(el('button', { class: 'btn small' + (s[key] === v ? ' on' : ''), onclick: () => {
            s[key] = v;
            if (onchange) onchange(v);
            this.hooks.saveSettings();
            this.openSettings();
          } }, l));
        }
        return row;
      };
      b.append(el('h4', {}, 'Sound'));
      b.append(toggle('sound', 'Sound effects', (v) => this.sound.setEnabled(v)));
      const vo = el('output', {}, Math.round(s.volume * 100) + '%');
      b.append(el('div', { class: 'slider' }, el('span', {}, 'Volume'), el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, oninput: (e) => {
        s.volume = +e.target.value;
        vo.textContent = Math.round(s.volume * 100) + '%';
        this.sound.setVolume(s.volume);
        this.hooks.saveSettings();
      } }), vo));
      b.append(el('h4', {}, 'Looks & speed'));
      b.append(choice('quality', 'Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], (v) => this.hooks.applyQuality()));
      b.append(toggle('battery', 'Battery saver (30 fps)', () => this.hooks.applyQuality()));
      b.append(choice('units', 'Temperature', [['C', '°C'], ['F', '°F']]));
      b.append(el('h4', {}, 'Care'));
      b.append(toggle('gentle', 'Gentle mode — nobody passes away from neglect while you are away', (v) => (this.world.gentle = v)));
      b.append(choice('away', 'While I am away', [['living', 'The tank keeps living'], ['paused', 'Pause the tank']]));
      b.append(toggle('sandbox', 'Sandbox — unlock every critter, snack, plant, decoration and style', (v) => {
        this.journal.sandbox = v;
      }));
      b.append(toggle('tips', 'Show tips'));
      b.append(el('h4', {}, 'Your tank'));
      const fileIn = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: (e) => e.target.files[0] && this.hooks.importFile(e.target.files[0]) });
      b.append(
        el('div', { class: 'row' },
          el('button', { class: 'btn small green', onclick: () => {
            this.hooks.save(true);
          } }, 'Save now'),
          el('button', { class: 'btn small', onclick: () => this.hooks.exportFile() }, 'Export to file'),
          el('button', { class: 'btn small', onclick: () => fileIn.click() }, 'Import from file'),
          el('button', { class: 'btn small red', onclick: () => {
            if (window.confirm('Start a brand-new tank? Your current tank will be replaced.')) {
              this.closeModal();
              this.hooks.newTank();
            }
          } }, 'New tank'),
          fileIn)
      );
      b.append(el('p', { style: 'font-size:14px;opacity:.8' }, 'Your tank saves itself on this device automatically. Export a file to keep a backup or move your tank to another device.'));
      b.append(el('h4', {}, 'About'));
      b.append(el('p', { style: 'font-size:14px;opacity:.85' }, 'Bug Farm — a little living terrarium. Every critter and plant is drawn by code in a picture-book style, so the whole game is tiny and works offline. Fonts: Patrick Hand & Chewy (open font licences).'));
    });
  }

  // onChoose('farm' | 'full' | 'empty')
  showWelcome(onChoose) {
    this.openModal('Welcome!', (b, head) => {
      head.querySelector('.card-close').remove();
      b.append(el('div', { class: 'welcome-logo' }, 'BUG FARM'));
      b.append(el('p', {}, 'A tank of cute critters living their busy little lives — ants digging tunnels, tadpoles turning into frogs, fireflies blinking in the dark.'));
      b.append(el('p', {}, 'Each corner of your farm starts with two kinds of critter. Keep them comfy and fed, and the desert, pond and jungle grow: new critters, snacks and plants unlock as you go. The weather changes too, so keep an eye on your clipboard!'));
      const pick = (mode) => () => {
        this.closeModal();
        onChoose(mode);
      };
      b.append(
        el('div', { class: 'welcome-choices' },
          el('button', { class: 'btn green wide', onclick: pick('farm') }, el('span', { class: 'title', style: 'font-size:22px' }, 'Start my farm'), el('small', {}, 'Two critters per zone · unlock the rest')),
          el('button', { class: 'btn yellow', onclick: pick('full') }, el('span', { class: 'title', style: 'font-size:18px' }, 'Sandbox: full tank'), el('small', {}, 'Everyone moved in, everything unlocked')),
          el('button', { class: 'btn', onclick: pick('empty') }, el('span', { class: 'title', style: 'font-size:18px' }, 'Sandbox: empty tank'), el('small', {}, 'Build it all yourself')))
      );
    });
  }

  showAway(summary, realSeconds) {
    const hrs = realSeconds / 3600;
    const away = hrs >= 24 ? `${Math.floor(hrs / 24)} day${hrs >= 48 ? 's' : ''}` : hrs >= 1 ? `${Math.round(hrs)} hour${Math.round(hrs) === 1 ? '' : 's'}` : `${Math.max(1, Math.round(realSeconds / 60))} minutes`;
    const days = summary.seconds / DAY_LEN;
    this.openModal('While you were away', (b) => {
      b.append(el('p', {}, `You were gone for ${away}. About ${days < 1 ? Math.round(days * 24) + ' hours' : days.toFixed(1) + ' days'} passed in the tank:`));
      const ul = el('ul', { class: 'diary' });
      const li = (icon, text) => ul.append(el('li', {}, iconCanvas(icon, 20), el('span', {}, text)));
      if (summary.born) li('heart', `${summary.born} new babies and eggs arrived.`);
      if (summary.metamorph.length) li('star', `${summary.metamorph.join(', ')} went through a big change!`);
      if (summary.dug > 0) li('shovel', `The ants dug ${summary.dug} bits of new tunnel.`);
      if (summary.sprouts) li('sprout', `${summary.sprouts} new plants sprouted.`);
      if (summary.eaten) li('paw', `${summary.eaten} critters became somebody's snack.`);
      for (const n of summary.died.slice(0, 6)) li('flower', `${n} passed away.`);
      if (!ul.children.length) li('leaf', 'It was a quiet, peaceful time.');
      b.append(ul);
      const hungry = this.world.creatures.filter((c) => c.hunger > 0.6 && c.stage !== 'egg').length;
      if (hungry > 2) b.append(el('p', {}, `${hungry} critters are feeling hungry — time for a snack!`));
      b.append(el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn green', onclick: () => this.closeModal() }, 'Say hello!')));
    });
  }

  tip() {
    if (!this.settings.tips) return;
    this.toast(TIPS[this.tipI++ % TIPS.length], 'leaf', false, 4500);
  }
}

function wormIcon(css = [64, 52], palIdx = 0) {
  return artCanvas(css, [-22, -9, 22, 9], (g) => {
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push({ x: 17 - i * 3.2, y: Math.sin(i * 0.7) * 3 });
    drawWorm(g, pts, PALETTES.worm[palIdx % PALETTES.worm.length], 0.8, false, 'cap', '#4c8fd6');
  });
}
export { drawIcon };
