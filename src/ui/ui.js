// DOM user interface layered over the tank canvas.
import { W, H, CELL, DAY_LEN, ZONE_X, ZONE_MID } from '../config.js';
import { SPECIES, SPECIES_ORDER, stageName, adoptLabel, ADOPT_ORDER, ANT_KINDS, adoptSpecies } from '../data/species.js';
import { FOODS, FOOD_ORDER, lovedBy } from '../data/foods.js';
import { PLANTS, PLANT_ORDER, blooms, tasteOf } from '../data/plants.js';
import { DECOR, DECOR_ORDER } from '../data/decor.js';
import { DISCOVERIES } from '../data/discoveries.js';
import { CREATURE_ART, PALETTES, drawWorm, varietyName } from '../art/creatures.js';
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
import { zoneBand, zoneStatus, tankNeeds, ZONE_NAMES, listWords, plural, NeedWatch, needKey } from '../sim/care.js';
import { maxLevel } from '../data/progression.js';
import { equipmentAt, equipmentInfo } from '../sim/equipment.js';
import { LAMP_X } from '../world/environment.js';
import { heatLamp, mister, pondHeater, pondFilter } from '../art/equipment.js';
import { GOODS, GOOD_ORDER, JOBS, goodWord, jobOf, flavourOf, splitKey, FLAVOURS } from '../data/goods.js';
import { drawGood, goodBox } from '../art/goods.js';
import { neighbour, needsWords, orderWords, critterWords } from '../sim/orders.js';
import { $, el, esc, artCanvas, creatureArt, wormIcon, outfitIcon } from './dom.js';
import { Postbag, buildMarket, folkCanvas, heartsEl, coinsEl, nextOffer, goodIcon } from './busytown.js';
import { onSale, wareKey } from '../sim/market.js';
import { NAME_MAX, NAME_IDEAS, cleanName, dear, plateText, hasName } from '../sim/keeper.js';
import { Herald, newsPriority } from './herald.js';
import { VISITORS, VISITOR_ORDER, visitorName } from '../data/visitors.js';
import { VISITOR_ART, drawVisitor } from '../art/visitors.js';
import { tankCheer } from '../sim/visitors.js';
import { OUTFITS, OUTFIT_ORDER, canWear } from '../data/outfits.js';
import { ACC_COLORS } from '../art/ink.js';
import { WARE_BY_ID } from '../data/market.js';

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
  { id: 'desert', label: 'Desert', x: ZONE_MID.desert },
  { id: 'pond', label: 'Pond', x: ZONE_MID.pond },
  { id: 'jungle', label: 'Jungle', x: ZONE_MID.jungle },
  { id: 'all', label: 'All' },
];
const TIPS = [
  'Drag to look around. Pinch or scroll to zoom.',
  "The clipboard (top right) shows what your critters need and your farm's goals.",
  'Tap any critter to see what it is thinking.',
  'Zone temperatures up top turn red when too hot and blue when too chilly.',
  'Each zone levels up as you finish its goals. New critters and snacks unlock!',
  'Misters run on a water jug. Refill it before the air dries out.',
  'The weather changes every couple of days. Check the forecast on the clipboard.',
  'Tap the glass to give everyone a little startle.',
  'Tap a heat lamp, mister, heater or filter to see what it does.',
  'Every critter has a job. Tap one to see what it does for the farm.',
  'Busytown writes in for the goods your critters make. Check the Orders tab on the clipboard.',
  'Orders pay Busytown coins. Tap the coin purse (top right) to visit the Market.',
  'Help a neighbour a few times and they will sell you something special at the Market.',
  'Every grown-up critter has a dream. Tap one to see what it is working toward.',
  'Butterflies ride the warm air under a heat lamp. Turn one up on a sunny day.',
  'Try the lens button (top right) to see heat, damp and scent trails.',
  'Turn the desert lamp way up and see where the ants go.',
  'Too much food spoils. Too little and tummies rumble!',
  'Fireflies glow at night. Watch them start blinking together.',
  'Crickets chirp faster when it is warm.',
  'Warm water holds less air. Watch the fish!',
];

function goodCanvas(type, css = 28, look = '', flav = '', prize = false) {
  return artCanvas([css, css], goodBox(type, prize), (g) => drawGood(g, type, look, flav, prize));
}

// A visitor's picture (for their card, letters and the Visitors' Book).
function visitorCanvas(type, css = [72, 64], pose = 'idle', frame = 0) {
  return artCanvas(css, VISITOR_ART[type].box, (g) => drawVisitor(g, type, pose === 'idle' && type === 'mole' ? 'pop' : pose, type === 'mole' ? 2 : frame));
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
    // paces discoveries, news and tips so they come one at a time
    this.herald = new Herald();
    this.unseenDisc = 0; // discoveries since the journal was last opened
    this.needWatch = new NeedWatch(); // steadies the clipboard's to-do list
    this.needAt = 0;
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
    // the coin purse: Busytown coins, and the way into the Market
    this.purseN = el('b', {}, '0');
    this.purseDot = el('i', { class: 'newdot hidden', title: 'Something new at the Market!' });
    this.purseBtn = el('button', { class: 'btn purse', 'aria-label': 'Busytown Market', title: 'Busytown Market: spend your coins', onclick: () => this.openMarket() }, iconCanvas('coin', 24), this.purseN, this.purseDot);
    this.clipBadge = el('span', { class: 'badge hidden' });
    this.clipBtn = el('button', { class: 'btn iconbtn clipbtn', 'aria-label': "Keeper's clipboard", title: "Keeper's clipboard: what needs doing, and your farm's goals", onclick: () => this.setTool('clip') }, iconCanvas('clip', 30), this.clipBadge);
    const hud = el('header', { id: 'hud' }, el('div', { class: 'hud-left' }, clock, speedBox), el('div', { class: 'hud-right' }, this.purseBtn, this.clipBtn, this.lensBtn, gear));
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
      if (t.id === 'journal') b.append((this.journalDot = el('i', { class: 'newdot hidden', title: 'New discoveries to read!' })));
      this.toolBtns[t.id] = b;
      this.toolbar.append(b);
    }
    this.sheet = el('section', { id: 'sheet', class: 'panel hidden', 'aria-live': 'polite' });
    this.card = el('section', { id: 'card', class: 'panel hidden' });
    this.toasts = el('div', { id: 'toasts' });
    this.modal = el('div', { id: 'modal', class: 'hidden', onclick: (e) => e.target === this.modal && !this.modalLocked && this.closeModal() });
    this.post = new Postbag(this);
    app.append(hud, this.lensLabel, this.zoneBox, this.toasts, this.post.box, this.sheet, this.card, this.toolbar, this.modal);
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
        if (!this.modal.classList.contains('hidden')) {
          if (!this.modalLocked) this.closeModal();
        }
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
      this.unseenDisc = 0;
      this.journalDot.classList.add('hidden');
      this.openJournal();
      return;
    }
    if (this.tool === id && id !== 'look' && !this.sheet.classList.contains('hidden')) id = 'look';
    this.tool = id;
    // the fish can see the keeper getting the food out
    this.world.keeperFeeding = id === 'feed';
    for (const [k, b] of Object.entries(this.toolBtns)) b.classList.toggle('on', k === id);
    this.moving = null;
    this.r.ghost = null;
    this.hooks.setDragMode(id === 'shape' ? 'tool' : 'pan');
    // shaping uses a slim dock instead of the big sheet, so the tank stays
    // in view under your thumb
    this.sheet.classList.toggle('compact', id === 'shape');
    this.sheet.classList.remove('painting');
    if (id === 'look') {
      this.sheet.classList.add('hidden');
    } else {
      this.renderSheet();
      this.sheet.classList.remove('hidden');
    }
    if (id === 'shape' && (this.settings.shapeDemo || 0) < 2) {
      // show once or twice how it works: a brush ring sweeping a stroke
      this.settings.shapeDemo = (this.settings.shapeDemo || 0) + 1;
      this.hooks.saveSettings();
      this.demo = { t: 0 };
    } else this.demo = null;
    this.clipBtn.classList.toggle('on', id === 'clip');
    this.card.classList.toggle('withsheet', id !== 'look');
    // the tray has shown its NEW badges; next time they're old news
    if (TOOL_KIND[id]) this.journal.progress.seen(TOOL_KIND[id]);
    this.sound.play('pop', 0.5);
  }

  renderSheet() {
    const s = this.sheet;
    s.innerHTML = '';
    if (this.tool === 'shape') {
      this.hint = el('div', { class: 'hint' });
      this.buildShapeDock(s);
      return;
    }
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
      const ready = this.journal.orders.ready().length;
      for (const z of ['needs', 'orders', 'desert', 'pond', 'jungle']) {
        const lv = z === 'needs' || z === 'orders' ? '' : this.journal.sandbox || prog.legacy ? '' : ` ★${prog.levels[z]}`;
        const label = z === 'needs' ? 'To do' : z === 'orders' ? 'Orders' : ZONE_NAMES[z];
        tabs.append(el('button', { class: this.tab.clip === z ? 'on' : '', onclick: () => {
          this.tab.clip = z;
          this.renderSheet();
        } }, label + lv, z === 'orders' && ready ? el('i', { class: 'tabdot' }, String(ready)) : null));
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
    const items = FOOD_ORDER.map((id) => Object.assign({ id, name: FOODS[id].name, count: id === 'bun' && this.world.stock.buns ? `×${this.world.stock.buns}` : '', canvas: () => artCanvas([64, 52], [-11, -12, 11, 3], (g) => drawFood(g, FOODS[id], 0)) }, this.lockInfo('feed', id)));
    if (!this.journal.canUse('feed', this.choice.feed)) this.choice.feed = items.find((it) => !it.locked).id;
    const say = (id) => {
      const fans = lovedBy(id, SPECIES).map((sp) => SPECIES[sp].plural).slice(0, 5);
      if (FOODS[id].busy) {
        this.hint.innerHTML = `<b>${esc(FOODS[id].name)}</b> (${this.world.stock.buns} left) — everybody loves them, and whoever nibbles one works double-time for half a day. Tap to drop one near some busy critters.`;
        return;
      }
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
    const w = this.world;
    const list = ADOPT_ORDER.filter((id) => z === 'all' || SPECIES[adoptSpecies(id)].zone === z);
    const items = list.map((id) => {
      const sp = adoptSpecies(id);
      const kind = ANT_KINDS[id];
      const st = sp === 'frog' ? 'tadpole' : sp === 'butterfly' || sp === 'moth' ? 'caterpillar' : sp === 'dragonfly' ? 'nymph' : kind ? 'worker' : SPECIES[sp].adultStage;
      const pose = SPECIES[sp].fish || st === 'tadpole' ? 'swim' : sp === 'bee' ? 'fly' : 'idle';
      // ant kinds count the workers in colonies of that kind
      const n = kind ? w.creatures.filter((c) => c.sp === 'ant' && !c.dead && (w.colony(c.colonyId) || {}).kind === kind.kind).length : w.count(sp);
      return Object.assign({
        id,
        name: adoptLabel(id),
        count: kind ? `${n}` : `${n}/${this.world.maxPop(sp)}`,
        canvas: () => (sp === 'worm' ? wormIcon() : creatureArt(sp, st, pose, kind ? kind.pal[0] : 0)),
      }, this.lockInfo('adopt', id));
    });
    if (this.choice.adopt && !this.journal.canUse('adopt', this.choice.adopt)) this.choice.adopt = null;
    const say = (sp) => {
      if (!sp) {
        this.hint.textContent = 'Pick a critter, then tap where it should live.';
        return;
      }
      const d = SPECIES[adoptSpecies(sp)];
      const u = this.settings.units;
      const blurb = ANT_KINDS[sp] ? `${d.blurb} ${ANT_KINDS[sp].blurb}` : d.blurb;
      this.hint.innerHTML = `<b>${esc(adoptLabel(sp))}</b> — ${esc(blurb)} <i>Comfy at ${fmtTemp(d.temp[1], u)}–${fmtTemp(d.temp[2], u)}${d.moist[0] >= 0 && d.moist[1] >= 0.3 ? ' in damp air' : ''}.</i>`;
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
      this.hint.innerHTML = `<b>${esc(d.name)}</b> — ${esc(d.job || 'Just for fun!')}`;
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

  // The shaping dock: what to paint with, how big a brush, and the pond's
  // water level tucked behind a button. It fades aside while you paint.
  buildShapeDock(s) {
    const tools = [
      ['sand', 'Sand', '#e8c483'],
      ['soil', 'Soil', '#7d5538'],
      ['rock', 'Rock', '#a7a39a'],
      ['gravel', 'Gravel', '#cfc3ad'],
      ['dig', 'Dig', null],
    ];
    const sizes = [['Small brush', 12, 8], ['Medium brush', 24, 13], ['Big brush', 42, 19]];
    const status = el('div', { class: 'dock-status', 'aria-live': 'polite' });
    const say = () => {
      const t = tools.find((x) => x[0] === this.choice.shape) || tools[0];
      status.textContent = (this.choice.shape === 'dig' ? 'Drag to dig' : `Drag to paint ${t[1].toLowerCase()}`) + ' · two fingers to move';
    };
    const chips = el('div', { class: 'dock-chips', role: 'radiogroup', 'aria-label': 'Paint with' });
    for (const [id, name, col] of tools) {
      const b = el('button', { class: 'chip' + (this.choice.shape === id ? ' on' : ''), role: 'radio', 'aria-checked': String(this.choice.shape === id), 'aria-label': name, title: name, onclick: () => {
        this.choice.shape = id;
        for (const c of chips.children) {
          c.classList.toggle('on', c === b);
          c.setAttribute('aria-checked', String(c === b));
        }
        say();
        this.sound.play('pop', 0.4);
      } }, col ? el('i', { style: `background:${col}` }) : iconCanvas('shovel', 24), el('span', {}, name));
      chips.append(b);
    }
    // brushes snap to three sizes; anything in between still works
    let near = sizes[0];
    for (const z of sizes) if (Math.abs(z[1] - this.brush) < Math.abs(near[1] - this.brush)) near = z;
    this.brush = near[1];
    const sizeBox = el('div', { class: 'dock-sizes', role: 'radiogroup', 'aria-label': 'Brush size' });
    for (const z of sizes) {
      const [name, v, dot] = z;
      const b = el('button', { class: 'size' + (z === near ? ' on' : ''), role: 'radio', 'aria-checked': String(z === near), 'aria-label': name, title: name, onclick: () => {
        this.brush = v;
        for (const c of sizeBox.children) {
          c.classList.toggle('on', c === b);
          c.setAttribute('aria-checked', String(c === b));
        }
        this.sound.play('pop', 0.35);
      } }, el('i', { style: `width:${dot}px;height:${dot}px` }));
      sizeBox.append(b);
    }
    const extra = el('div', { class: 'dock-extra' + (this.pondOpen ? '' : ' hidden') },
      el('span', {}, 'Pond water'),
      el('button', { class: 'btn small blue', onclick: () => this.water(-12) }, 'Fill up'),
      el('button', { class: 'btn small', onclick: () => this.water(12) }, 'Drain a little'));
    const pond = el('button', { class: 'btn small pondbtn' + (this.pondOpen ? ' on' : ''), 'aria-expanded': String(!!this.pondOpen), onclick: () => {
      this.pondOpen = !this.pondOpen;
      extra.classList.toggle('hidden', !this.pondOpen);
      pond.classList.toggle('on', this.pondOpen);
      pond.setAttribute('aria-expanded', String(this.pondOpen));
    } }, iconCanvas('drop', 18), 'Pond');
    const close = el('button', { class: 'card-close', 'aria-label': 'Close', onclick: () => this.setTool('look') }, '×');
    s.append(el('div', { class: 'dock-top' }, status, pond, close), el('div', { class: 'dock-row' }, chips, sizeBox), extra);
    say();
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
    if (dy < 0) w.pour(ZONE_MID.pond, t.waterLevel);
    else w.splash(ZONE_MID.pond, t.waterLevel, 1);
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
        this.toast(`Glug glug! The ${z} mister's jug is full again.`, 'drop');
        this.updateClimate();
      } }, 'Refill');
      this.climateEls[z].bottle = m;
      return el('div', { class: 'equip', title: 'The mister sprays from this jug. When it runs dry the air dries out.' }, el('span', {}, 'Mister jug'), m, b);
    };
    zc('desert', 'Desert', 'sun', [
      slider('Heat lamp', 'Warms the desert air, and makes a hot basking spot right under the lamp', () => env.desert.lamp, (v) => (env.desert.lamp = v)),
      slider('Mister', 'Sprays fine rain: damper air, a little cooler. Uses water from its jug', () => env.desert.mister, (v) => (env.desert.mister = v)),
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
      slider('Mister', 'Rainforest drizzle: damp air for snails, worms and frogs. Uses water from its jug', () => env.jungle.mister, (v) => (env.jungle.mister = v)),
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
    d.desert.read.textContent = `Air is ${wet(env.desert.moist)} · sand under the lamp ${fmtTemp(env.tempAt(LAMP_X.desert, this.world.terrain.surfaceY(LAMP_X.desert) - 3, this.world.terrain), u)}`;
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
    if (z === 'orders') {
      this.clipEls = { z };
      this.buildOrders(body);
      return;
    }
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
    for (const sp of next.critters || []) names.push(ANT_KINDS[sp] ? ANT_KINDS[sp].label : SPECIES[sp].plural);
    for (const f of next.foods || []) names.push(FOODS[f].name);
    for (const pl of next.plants || []) names.push(PLANTS[pl].name);
    for (const d of next.decor || []) names.push(DECOR[d].name);
    box.append(el('div', { class: 'unlocks' }, el('b', {}, 'Unlocks: '), names.join(' · ')));
  }

  // The farm's purpose: Busytown's letters asking for the goods the
  // critters make, the basket of goods collected so far, and the thank-you
  // stars earned.
  buildOrders(body) {
    this.ordEls = { pantry: el('div', { class: 'pantry' }), waiting: el('div'), list: el('div', { class: 'orders' }), foot: el('div') };
    body.append(
      el('h4', {}, 'In your basket'),
      this.ordEls.pantry,
      this.ordEls.waiting,
      el('h4', {}, 'Letters from Busytown'),
      this.ordEls.list,
      this.ordEls.foot
    );
    this.ordKey = '';
    this.updateOrders(true);
  }

  updateOrders(force) {
    const w = this.world;
    const ord = this.journal.orders;
    const E = this.ordEls;
    const key = GOOD_ORDER.map((g) => JSON.stringify(w.tallyFlavours(g))).join(',') + '|' + w.goods.length + '|' + ord.list.map((o) => o.id + (o.critter ? ':' + ord.eligible(o).length : '')).join(',') + '|' + ord.stars + '|' + w.coins;
    if (!force && key === this.ordKey) return;
    this.ordKey = key;
    // the letters
    E.list.innerHTML = '';
    if (!ord.list.length) {
      const hint = ord.hintMakers(w);
      const can = ord.makeable(w).length;
      E.list.append(el('p', { class: 'small' }, can ? 'No letters right now. Busytown writes every few hours.' : `Busytown will write as soon as your farm makes something.${hint.length ? ` For example, ${hint[0].makers.join(' or ')} make ${GOODS[hint[0].id].name.toLowerCase()}.` : ''}`));
    }
    for (const o of ord.list) {
      const nb = neighbour(o.who);
      const ok = ord.canSend(o);
      const needs = el('div', { class: 'oneeds' });
      let btn = ok ? 'Send it!' : 'Not enough yet';
      if (o.critter) {
        const n = ord.eligible(o).length;
        const cr = o.critter;
        const pic = creatureArt(cr.sp, cr.stage || SPECIES[cr.sp].adultStage, SPECIES[cr.sp].fish ? 'swim' : 'idle', cr.pal || 0, null, '#e2553f', [30, 24]);
        needs.append(el('span', { class: 'oneed' + (n ? ' ok' : '') }, pic, n ? `${n} in your tank to choose from` : `None in your tank right now`));
        btn = n ? 'Choose who goes' : 'Nobody yet';
      }
      for (const [g, n] of Object.entries(o.needs)) {
        const f = o.flav && o.flav[g];
        const have = Math.min(n, w.basketHas(g, f, !!o.best));
        const fd = f ? flavourOf(g, f) : null;
        const tip = fd ? `${GOODS[g].how} ${this.flavourHow(g, f)}` : GOODS[g].how;
        needs.append(el('span', { class: 'oneed' + (have >= n ? ' ok' : ''), title: tip, onclick: () => fd || o.best ? this.toast(o.best ? 'Prize goods come from master critters (their dream came true) and from plants and ponds kept just right.' : `<b>${esc(fd.name)}:</b> ${esc(this.flavourHow(g, f))}`, goodCanvas(g, 26, '', f, !!o.best), false, 6000) : null }, goodIcon(g, 22, f, !!o.best), `${have} of ${goodWord(g, n, f, !!o.best)}`));
      }
      const offer = nextOffer(this.journal, w, nb.id);
      const pay = ord.pay(o);
      E.list.append(
        el('div', { class: 'order' + (ok ? ' ready' : '') + (o.flav || o.best ? ' picky' : '') + (o.critter ? ' pet' : '') },
          el('div', { class: 'ohead' }, folkCanvas(nb, ok ? 'happy' : 'ask', 46), el('span', {}, el('b', {}, nb.name), ', ' + nb.job, el('br'), heartsEl(ord.heartsOf(nb.id)))),
          el('p', { class: 'letter' }, `“${dear(w.keeper)}, could you send ${orderWords(o)}? ${o.why}”`),
          needs,
          offer ? el('div', { class: 'small ooffer' }, `Help ${nb.name} ${offer.need === 1 ? 'once more' : offer.need + ' more times'} to unlock the ${offer.ware.name.toLowerCase()}.`) : null,
          el('div', { class: 'ofoot' },
            el('span', { class: 'ostars' }, coinsEl(pay.total), ` + ★${o.stars} + treats`),
            el('button', { class: 'btn small', onclick: () => {
              ord.decline(o);
              this.refreshNeeds();
              this.updateOrders(true);
            } }, 'Not now'),
            el('button', { class: 'btn small' + (ok ? ' yellow' : ''), disabled: !ok, onclick: () => this.sendOrder(o) }, btn)))
      );
    }
    // the basket: tap a good to hear who makes it; underneath, what
    // flavours are in it
    E.pantry.innerHTML = '';
    for (const g of GOOD_ORDER) {
      const n = w.pantry[g] || 0;
      E.pantry.append(el('button', { class: 'pgood' + (n ? '' : ' none'), title: GOODS[g].how, onclick: () => this.toast(`<b>${esc(GOODS[g].name)}:</b> ${esc(GOODS[g].how)}`, goodCanvas(g, 26), false, 5000) }, goodCanvas(g, 30), el('b', {}, String(n)), el('span', {}, GOODS[g].name)));
    }
    const chips = el('div', { class: 'flavours' });
    for (const g of GOOD_ORDER) {
      const L = w.tallyFlavours(g);
      const keys = Object.keys(L).filter((k) => L[k] > 0).sort((a, b) => L[b] - L[a]);
      for (const k of keys) {
        const [f, pz] = splitKey(k);
        const fd = flavourOf(g, f);
        if (!fd) continue;
        chips.append(el('button', { class: 'fchip' + (pz ? ' prize' : ''), title: this.flavourHow(g, f), onclick: () => this.toast(`<b>${pz ? 'Prize ' + esc(fd.name.toLowerCase()) : esc(fd.name)}:</b> ${esc(this.flavourHow(g, f))}`, goodCanvas(g, 26, '', f, pz), false, 6000) }, goodCanvas(g, 20, '', f, pz), el('span', {}, `${pz ? 'Prize ' + fd.name.toLowerCase() : fd.name}`), el('b', {}, '×' + L[k])));
      }
    }
    if (chips.children.length) E.pantry.append(chips);
    // goods still waiting in the tank
    E.waiting.innerHTML = '';
    if (w.goods.length) {
      const counts = {};
      for (const gd of w.goods) counts[gd.type] = (counts[gd.type] || 0) + 1;
      const words = listWords(Object.entries(counts).map(([g, n]) => goodWord(g, n)));
      E.waiting.append(el('div', { class: 'need sev1' }, iconCanvas('star', 22), el('span', {}, `Waiting in the tank: ${words}. Tap them there, or`), el('button', { class: 'btn small yellow', onclick: () => {
        const n = w.collectAll();
        this.sound.play('sparkle', 0.6);
        this.toast(`Collected ${n} good${n === 1 ? '' : 's'} into your basket.`, 'star');
        this.refreshNeeds();
        this.updateOrders(true);
      } }, 'Collect all')));
    }
    const next = ord.nextGift();
    E.foot.innerHTML = '';
    // critters who've gone to live in Busytown, and with whom
    if (ord.moved.length) {
      const who = ord.moved.slice(0, 6).map((m) => `${m.name} the ${SPECIES[m.sp].name.toLowerCase()} (with ${neighbour(m.who).name})`);
      E.foot.append(el('p', { class: 'small' }, el('b', {}, 'Living in Busytown: '), listWords(who) + (ord.moved.length > 6 ? ` and ${ord.moved.length - 6} more` : '') + '.'));
    }
    E.foot.append(
      el('div', { class: 'row ototal' }, coinsEl(w.coins), el('span', { class: 'small', style: 'flex:1' }, `Orders sent: ${ord.sent} · ★${ord.stars}${next ? ` · next gift at ★${next.stars}: a ${DECOR[next.decor].name.toLowerCase()}` : ''}`), el('button', { class: 'btn small yellow', onclick: () => this.openMarket() }, iconCanvas('shop', 20), 'Market'))
    );
  }

  // Where a flavour comes from, as a hint the keeper can act on.
  flavourHow(g, f) {
    const fd = flavourOf(g, f);
    if (!fd) return '';
    if (g === 'honey') {
      if (f === 'wild') return 'Bees make it from lots of different flowers at once.';
      if (f === 'desert') return 'The honeypot ants store it up in the desert.';
      return `Bees make it when most of their pollen comes from ${PLANTS[f].name.toLowerCase()} flowers. Plant a patch near the bee hotel!`;
    }
    if (g === 'seeds') return f === 'wild' ? 'Harvester ants pile them by their nest door.' : `They ripen on ${PLANTS[f].name.toLowerCase()} flowers once they've been pollinated.`;
    if (g === 'lily') {
      if (f === 'lotus') return 'Lotus plants bloom like water lilies.';
      if (f === 'blue') return 'A rare bloom in crystal-clear water with a school of neon tetras.';
      const u = this.settings.units;
      return `Water lilies bloom ${fd.adj} in ${f === 'white' ? `cool water (under ${fmtTemp(20, u)})` : f === 'pink' ? `mild water (${fmtTemp(20, u)} to ${fmtTemp(24, u)})` : `warm water (${fmtTemp(25, u)} and up)`}. The pond heater sets it.`;
    }
    if (g === 'silk') return `Left behind when a ${fd.adj} ${fd.sp === 'moth' ? 'moth' : 'butterfly'} hatches.`;
    if (g === 'compost') return f === 'castings' ? 'Earthworms leave them at the surface.' : 'Beetles roll them from leftovers and fallen leaves.';
    return '';
  }

  updateClipboard(force) {
    if (!this.clipEls || this.tool !== 'clip') return;
    if (this.clipEls.z === 'orders') {
      if (this.ordEls) this.updateOrders(force);
      return;
    }
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
    return { climate: 'Climate', feed: 'Feed', refill: 'Refill', clean: 'Clean', rinse: 'Rinse', topup: 'Top up', tidy: 'Tidy', orders: 'Orders', collect: 'Collect', market: 'Market' }[act.kind] || 'Show me';
  }

  // Do (or open the controls for) whatever a need asks.
  doNeed(n) {
    const w = this.world;
    const a = n.act;
    switch (a.kind) {
      case 'refill':
        w.refillMister(a.zone);
        this.sound.play('splash', 0.4);
        this.toast(`Glug glug! The ${a.zone} mister's jug is full again.`, 'drop');
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
      case 'orders':
        this.tab.clip = 'orders';
        this.renderSheet();
        return;
      case 'market':
        this.openMarket();
        return;
      case 'collect': {
        const k = w.collectAll();
        this.sound.play('sparkle', 0.6);
        this.toast(`Collected ${k} good${k === 1 ? '' : 's'} into your basket.`, 'star');
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
    this.needWatch.clear(needKey(n));
    this.refreshNeeds();
    this.updateClipboard(true);
  }

  refreshNeeds() {
    const now = performance.now() / 1000;
    const dt = Math.min(5, Math.max(0, now - (this.needAt || now)));
    this.needAt = now;
    this.needs = this.needWatch.filter(tankNeeds(this.world, (k, id) => this.journal.canUse(k, id), (t) => fmtTemp(t, this.settings.units)), dt);
    const ready = this.journal.orders.ready();
    if (ready.length) this.needs.push({ zone: null, sev: 1.05, icon: 'star', text: ready.length === 1 ? `${neighbour(ready[0].who).name}'s order is ready to send to Busytown!` : `${ready.length} orders are ready to send to Busytown!`, act: { kind: 'orders' } });
    const waiting = this.world.goods.length;
    if (waiting) this.needs.push({ zone: null, sev: 0.5, icon: 'star', text: `${waiting === 1 ? 'A good is' : waiting + ' goods are'} waiting in the tank to be collected.`, act: { kind: 'collect' } });
    this.needs.sort((a, b) => b.sev - a.sev);
    const urgent = this.needs.filter((n) => n.sev >= 1);
    const top = urgent.length ? urgent[0].sev : 0;
    this.clipBadge.textContent = urgent.length;
    this.clipBadge.classList.toggle('hidden', !urgent.length);
    this.clipBadge.className = 'badge' + (urgent.length ? '' : ' hidden') + (top >= 2 ? ' hot' : '');
  }

  // A zone grew: show off what's new.
  levelUp(z, lv, unlocks) {
    this.herald.push({ prio: 3, kind: 'level', show: () => this.showLevelUp(z, lv, unlocks) });
  }
  showLevelUp(z, lv, unlocks) {
    const names = [];
    for (const sp of unlocks.adopt) names.push(ANT_KINDS[sp] ? ANT_KINDS[sp].label : SPECIES[sp].plural);
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
    for (const v of w.visitors) if (v.hit(wx, wy)) return v;
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
    for (const gd of w.goods) {
      const [x0, y0, x1, y1] = goodBox(gd.type);
      const d = Math.hypot(gd.x + (x0 + x1) / 2 - wx, gd.y + (y0 + y1) / 2 - wy);
      if (d < Math.max(zr, 11) && d < bd) {
        bd = d;
        best = gd;
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
        if (FOODS[this.choice.feed].busy) {
          // a busy bun comes out of the bag, one at a time
          if (!(w.stock.buns > 0) && !this.journal.sandbox) {
            this.toast('No busy buns left. Baker Bramble sells them at the Market.', 'coin');
            return;
          }
          if (!this.journal.sandbox) w.stock.buns--;
          w.dropFood('bun', wx, Math.max(14, wy));
          this.sound.play('pop', 0.5);
          this.renderSheet();
          return;
        }
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
        const hit = this.pick(wx, wy);
        if (hit && hit.kind === 'good') {
          this.collect(hit);
          return;
        }
        if (!(hit && hit.kind === 'creature') && this.tapEquipment(wx, wy)) return;
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

  // Pick a good up from the tank and pop it in the basket.
  collect(gd) {
    const w = this.world;
    if (!w.collectGood(gd)) return;
    this.sound.play('sparkle', 0.6);
    this.haptic(10);
    const first = !this.settings.seenGoods;
    const more = first ? '<br>Neighbours in Busytown send orders for goods like this. Open the clipboard\'s Orders tab.' : '';
    // the first prize one gets a word of explanation
    const firstPrize = gd.prize && !this.settings.seenPrize;
    const why = firstPrize ? '<br>Prize goods come from master critters and from plants and ponds kept just right. Neighbours who ask for the very best pay double for them.' : '';
    this.toast(`Collected a ${esc(gd.name)}! <small>(${goodWord(gd.type, w.pantry[gd.type])} in your basket)</small>${more}${why}`, goodCanvas(gd.type, 26, gd.look, gd.flav, gd.prize), false, first || firstPrize ? 6500 : 2400);
    if (first || firstPrize) {
      this.settings.seenGoods = true;
      if (gd.prize) this.settings.seenPrize = true;
      this.hooks.saveSettings();
    }
    this.updateClipboard(true);
  }

  // A letter has arrived from Busytown.
  newLetter(o) {
    this.sound.play('pop', 0.6);
    this.haptic(10);
    this.post.letter(o);
    this.refreshNeeds();
    if (this.tool === 'clip') this.renderSheet();
  }

  sendOrder(o, c) {
    if (o.critter && !c) {
      this.pickCritter(o);
      return;
    }
    const r = this.journal.orders.send(o, c);
    if (!r) return;
    if (c && this.selected === c) this.select(null);
    this.thanked(r);
    this.renderSheet();
  }

  // A neighbour would love to give a critter a home: the keeper chooses
  // who goes (and can see who they'd be saying goodbye to).
  pickCritter(o) {
    const ord = this.journal.orders;
    const nb = neighbour(o.who);
    this.openModal(`Who'll go to ${nb.name}?`, (b) => {
      b.append(el('p', { class: 'small' }, `${nb.name} would love ${critterWords(o.critter)}. Whoever goes will have a lovely new home in Busytown, and ${nb.name} will write to say how they're getting on.`));
      // (masters of their trade last, so nobody sends one by accident)
      const list = ord.eligible(o).sort((a, c) => (a.memory.master ? 1 : 0) - (c.memory.master ? 1 : 0) || c.age - a.age);
      const grid = el('div', { class: 'pick-critters' });
      for (const c of list) {
        const pose = c.mode === 'swim' ? 'swim' : c.mode === 'fly' ? 'fly' : 'idle';
        const pic = c.sp === 'worm' ? wormIcon([56, 48], c.palIdx, c.acc, c.accColor) : creatureArt(c.sp, c.stage, pose, c.palIdx, c.acc, c.accColor, [56, 48]);
        const v = c.isAdult ? varietyName(c.sp, c.palIdx) : '';
        const chips = [this.mood(c)];
        if (c.memory.master) chips.push('★ ' + c.memory.master);
        if (c.traits.social > 0.66) chips.push('Friendly');
        if (c.traits.lazy < 0.3) chips.push('Busy');
        const age = c.age / DAY_LEN;
        grid.append(el('div', { class: 'pick' }, pic,
          el('div', { class: 'pick-text' }, el('b', {}, c.name), el('div', { class: 'small' }, `${v || c.def.name} · ${age < 1 ? Math.max(1, Math.round(age * 24)) + ' hours' : age.toFixed(1) + ' days'} old`), el('div', { class: 'small' }, chips.join(' · '))),
          el('div', { class: 'pick-btns' },
            el('button', { class: 'btn small', onclick: () => {
              this.closeModal();
              this.select(c);
              this.cam.flyTo(c.x, c.y, Math.max(this.cam.zoom, this.cam.fitHeight * 2.2));
            } }, 'Find'),
            el('button', { class: 'btn small yellow', onclick: () => {
              this.closeModal();
              this.sendOrder(o, c);
            } }, `Send ${c.name}`))));
      }
      if (!list.length) grid.append(el('p', {}, 'Nobody suitable right now.'));
      b.append(grid);
    });
  }
  // A thank-you from Busytown, whether the keeper posted the order or the
  // delivery van did.
  thanked(r) {
    this.sound.play('sparkle', 0.9);
    this.haptic(20);
    this.post.thanks(r);
    this.updateHUD(true);
    this.refreshNeeds();
  }

  openOrders() {
    this.tab.clip = 'orders';
    if (this.tool !== 'clip') this.setTool('clip');
    else this.renderSheet();
  }

  // The Busytown Market: every neighbour's stall.
  openMarket() {
    this.openModal('Busytown Market', (b, head) => buildMarket(this, b, head), true);
    const seen = (this.settings.seenWares = this.settings.seenWares || []);
    for (const wr of onSale(this.journal, this.world)) if (!seen.includes(wareKey(wr))) seen.push(wareKey(wr));
    this.hooks.saveSettings();
  }

  // Tapping a piece of equipment (heat lamp, mister, pond heater, filter or
  // thermometer) opens a card saying what it is, what it does and how it's
  // doing, with its controls right there.
  tapEquipment(wx, wy) {
    const e = equipmentAt(this.world, wx, wy, 6 / Math.max(0.5, this.cam.zoom));
    if (!e) return false;
    this.select(e);
    this.sound.play('pop', 0.4);
    return true;
  }

  equipAction(e, id) {
    const w = this.world;
    const env = w.env;
    const z = e.zone;
    const step = (v, d, lo = 0, hi = 1) => Math.round(clamp(v + d, lo, hi) * 20) / 20;
    switch (id) {
      case 'lampUp':
      case 'lampDown':
        env[z].lamp = step(env[z].lamp, id === 'lampUp' ? 0.1 : -0.1);
        break;
      case 'mistUp':
      case 'mistDown':
        env[z].mister = step(env[z].mister, id === 'mistUp' ? 0.1 : -0.1);
        break;
      case 'refill':
        w.refillMister(z);
        this.sound.play('splash', 0.4);
        this.toast(`Glug glug! The ${z} mister's jug is full again.`, 'drop');
        break;
      case 'heaterToggle':
        env.pond.heater = !env.pond.heater;
        break;
      case 'heaterUp':
      case 'heaterDown':
        env.pond.heaterTarget = clamp(Math.round(env.pond.heaterTarget) + (id === 'heaterUp' ? 1 : -1), 6, 34);
        env.pond.heater = true;
        break;
      case 'filterUp':
      case 'filterDown':
        env.pond.filter = step(env.pond.filter, id === 'filterUp' ? 0.1 : -0.1);
        break;
      case 'rinse':
        w.rinseFilter();
        this.sound.play('splash', 0.4);
        this.toast('Squeeze, rinse, squeeze! The filter sponge is clean.', 'drop');
        break;
      case 'climate':
        this.select(null);
        this.flashZone = z;
        this.setTool('climate');
        return;
      case 'clip':
        this.select(null);
        this.tab.clip = z;
        this.setTool('clip');
        return;
      default:
        return;
    }
    if (id !== 'refill' && id !== 'rinse') this.sound.play('pop', 0.3);
    this.updateCard(true);
  }

  // A small painting of a piece of equipment for its card.
  equipPortrait(e) {
    const env = this.world.env;
    const rail = (g, x0, x1) => {
      g.fillStyle = '#b77d4b';
      g.fillRect(x0, -26, x1 - x0, 26);
      g.lineWidth = 1.2;
      g.strokeStyle = '#3a2a1f';
      g.beginPath();
      g.moveTo(x0, 0);
      g.lineTo(x1, 0);
      g.stroke();
    };
    const p = env.pond;
    let c;
    if (e.id === 'lamp') c = artCanvas([72, 64], [-24, -32, 32, 44], (g) => (rail(g, -30, 40), heatLamp(g, 0, { power: env[e.zone].lamp, zone: e.zone, sun: 1, time: 0 })));
    else if (e.id === 'mister') c = artCanvas([72, 64], [-10, -34, 54, 32], (g) => (rail(g, -12, 58), mister(g, 0, { setting: env[e.zone].mister, spraying: 0, water: env[e.zone].water, time: 0 })));
    else if (e.id === 'heater') c = artCanvas([72, 64], [-18, -36, 20, 40], (g) => pondHeater(g, 0, 12, { on: p.heater, heating: p.heater && p.temp < p.heaterTarget - 0.3 ? 1 : 0, target: (p.heaterTarget - 6) / 28, time: 0 }));
    else if (e.id === 'filter') c = artCanvas([72, 64], [-30, -20, 18, 54], (g) => pondFilter(g, 0, 0, { flow: 0, setting: p.filter, clean: p.filterClean, time: 0 }));
    else c = iconCanvas('thermo', 48);
    c.className = 'portrait';
    return c;
  }

  hold(wx, wy, held) {
    if (this.tool !== 'feed' || !this.choice.feed || FOODS[this.choice.feed].busy) return;
    const now = performance.now();
    if (this._sprinkle && now - this._sprinkle < 220) return;
    this._sprinkle = now;
    if (wx < 0 || wx > W || wy > H) return;
    this.world.dropFood(this.choice.feed, wx + rrange(-14, 14), Math.max(14, wy + rrange(-6, 6)));
    this.sound.play('pop', 0.3, 1 + Math.random() * 0.3);
  }

  // A finger (or the mouse) went down on the tank.
  press(wx, wy, type) {
    this.pointerType = type;
    this.demo = null;
    if (this.tool === 'shape') this.ring(wx, wy, false);
  }
  // Every finger is off the glass: let the brush ring fade away on touch.
  lift(type) {
    if (this.tool === 'shape' && type !== 'mouse' && this.r.ghost && this.r.ghost.kind === 'brush') this.r.ghost.fade = 1;
  }
  ring(wx, wy, painting) {
    const fills = { sand: 'rgba(232,196,131,0.38)', soil: 'rgba(125,85,56,0.38)', rock: 'rgba(167,163,154,0.42)', gravel: 'rgba(207,195,173,0.42)', dig: 'rgba(60,36,20,0.16)' };
    this.r.ghost = { kind: 'brush', x: wx, y: wy, r: this.brush, painting, fill: fills[this.choice.shape], touch: this.pointerType !== 'mouse' };
  }

  dragStart(wx, wy) {
    this.lastPaint = null;
    this.demo = null;
    if (this.tool !== 'shape') return;
    clearTimeout(this.dockT);
    this.sheet.classList.add('painting');
    this.paint(wx, wy);
  }
  // Fill in the gap since the last dab, so quick swipes paint a solid stroke.
  dragMove(wx, wy) {
    if (this.tool !== 'shape') return;
    const lp = this.lastPaint;
    if (!lp) {
      this.paint(wx, wy);
      return;
    }
    const d = Math.hypot(wx - lp[0], wy - lp[1]);
    const step = Math.max(2, this.brush * 0.3);
    if (d < step) {
      this.ring(wx, wy, true);
      return;
    }
    const n = Math.min(48, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) this.paint(lp[0] + ((wx - lp[0]) * i) / n, lp[1] + ((wy - lp[1]) * i) / n);
  }
  dragEnd() {
    this.lastPaint = null;
    this.hooks.terrainChanged();
    if (this.tool !== 'shape') return;
    if (this.r.ghost && this.r.ghost.kind === 'brush') this.r.ghost.painting = false;
    clearTimeout(this.dockT);
    this.dockT = setTimeout(() => this.sheet.classList.remove('painting'), 380);
  }
  paint(wx, wy) {
    if (this.tool !== 'shape') return;
    this.lastPaint = [wx, wy];
    const n = this.world.sculpt(wx, wy, this.brush, this.choice.shape);
    if (n) {
      if (Math.random() < 0.35) this.world.dust(wx, wy, 2);
      const now = performance.now();
      if (!this._tapT || now - this._tapT > 110) {
        this._tapT = now;
        this.sound.play('tap', 0.35);
      }
    }
    this.ring(wx, wy, true);
  }

  hover(wx, wy) {
    if (wx == null) {
      this.r.ghost = null;
      return;
    }
    if (this.tool === 'shape') {
      this.pointerType = 'mouse';
      this.ring(wx, wy, false);
    } else if (this.tool === 'decor' && (this.choice.decor || this.moving)) {
      const def = DECOR[this.moving ? this.moving.type : this.choice.decor];
      const y = def.place === 'top' ? 0 : this.world.terrain.surfaceY(wx);
      const ok = this.world.canPlace('decor', def.id, wx, y).ok;
      this.r.ghost = { kind: 'decor', def, x: wx, y, ok };
    } else this.r.ghost = null;
    // a pointing hand over gadgets you can tap to learn about
    const cur = this.tool === 'look' && equipmentAt(this.world, wx, wy) ? 'pointer' : '';
    if (this.game.canvas.style.cursor !== cur) this.game.canvas.style.cursor = cur;
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
      this.cardJob = el('div', { class: 'job' });
      this.cardDream = el('div', { class: 'dream' });
      c.append(this.cardThought, this.cardJob, this.cardDream, this.cardMeters, this.cardChips);
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
      if (canWear(e)) actions.append(el('button', { class: 'btn small', onclick: () => this.dressUp(e) }, 'Dress up'));
      // a neighbour has written asking for a critter just like this one
      const ord = this.journal.orders;
      const want = ord.list.find((o) => o.critter && ord.eligible(o).includes(e));
      if (want) {
        const nb = neighbour(want.who);
        actions.prepend(el('button', { class: 'btn small yellow', onclick: () => {
          if (window.confirm(`Send ${e.name} to live with ${nb.name} in Busytown?`)) this.sendOrder(want, e);
        } }, `Send to ${nb.name.split(' ')[0]}`));
      }
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
    } else if (e.kind === 'equip') {
      this.cardWhat = el('p', { class: 'what' });
      c.append(this.cardWhat, this.cardMeters);
    } else if (e.kind === 'visitor') {
      this.cardWhat = el('p', { class: 'what' });
      c.append(this.cardThought, this.cardWhat);
      actions.append(
        el('button', { class: 'btn small yellow', onclick: () => {
          this.cam.follow = this.cam.follow === e ? null : e;
          if (this.cam.follow) this.cam.flyTo(e.x, e.y, Math.max(this.cam.zoom, this.cam.fitHeight * 2.2));
          this.cam.target = null;
          this.buildCard();
        } }, this.cam.follow === e ? 'Stop following' : 'Follow'),
        el('button', { class: 'btn small', onclick: () => {
          e.emote('heart', 2);
          this.world.sparkle(e.x, e.y - 14, 5);
          this.sound.play('sparkle', 0.4);
        } }, 'Wave')
      );
    }
    c.append(actions);
    this.cardActions = actions;
    this.actionsKey = '';
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
    if (e.kind === 'visitor') {
      if (this.portraitKey !== 'v' + e.type) {
        this.portraitKey = 'v' + e.type;
        const p = visitorCanvas(e.type);
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      const def = e.def;
      this.cardName.textContent = e.name;
      this.cardSub.textContent = e.state === 'out' ? 'Off home now. Bye!' : `Visiting the ${def.zone} from the garden outside`;
      this.cardThought.textContent = e.hidden ? '(tunnelling about underground)' : e.thought;
      const what = `Likes: ${def.likes}`;
      if (this.cardWhat.textContent !== what) this.cardWhat.textContent = what;
      // their idea, while it's waiting for an answer
      const key = e.waiting ? 'w' : '';
      if (key !== this.actionsKey) {
        this.actionsKey = key;
        const old = this.cardActions.querySelector('.idea');
        if (old) old.remove();
        if (e.waiting) this.cardActions.prepend(el('button', { class: 'btn small yellow idea', onclick: () => this.post.offer(e.type, e.offer, e) }, `Hear ${def.name}'s idea`));
      }
      return;
    }
    if (e.kind === 'creature') {
      const key = e.sp + e.stage + e.palIdx + e.acc + e.accColor;
      if (key !== this.portraitKey) {
        this.portraitKey = key;
        const pose = e.mode === 'swim' ? 'swim' : e.mode === 'fly' ? 'fly' : 'idle';
        const p = e.sp === 'worm' ? wormIcon([72, 64], e.palIdx, e.acc, e.accColor) : creatureArt(e.sp, e.stage, pose, e.palIdx, e.acc, e.accColor, [72, 64]);
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      const ageD = e.age / DAY_LEN;
      const hrs = Math.max(1, Math.round(ageD * 24));
      const age = ageD < 1 ? `${hrs} hour${hrs === 1 ? '' : 's'} old` : `${ageD.toFixed(ageD < 10 ? 1 : 0)} days old`;
      this.cardName.innerHTML = `${esc(e.name)}${e.memory.master ? ' <span class="master" title="Their dream came true">★</span>' : ''}`;
      // its variety, if it comes in named ones ("Blue morpho", "Kohaku koi")
      const col = e.sp === 'ant' ? this.world.colony(e.colonyId) : null;
      const vName = e.role === 'courier' ? 'Mail dragonfly' : e.sp === 'ant' && col ? ANT_KINDS[Object.keys(ANT_KINDS).find((k) => ANT_KINDS[k].kind === col.kind)].name : e.isAdult ? varietyName(e.sp, e.palIdx) : '';
      const what = e.isAdult && vName ? vName.toLowerCase() : e.def.name.toLowerCase();
      let sub = `${e.isAdult ? (e.stage === 'queen' ? 'queen ' : '') : stageName(e.sp, e.stage) + ' '}${what} · ${age}`;
      sub = sub[0].toUpperCase() + sub.slice(1);
      if (e.dead) sub = `${e.def.name} · passed away`;
      this.cardSub.textContent = sub;
      this.cardThought.textContent = e.dead ? 'Resting peacefully now.' : e.stage === 'egg' ? (e.sp === 'frog' ? 'Little tadpoles are wriggling inside...' : 'Something is growing in here...') : e.pupa ? 'Changing... shh!' : e.thought || '...';
      this.cardJob.innerHTML = this.jobHTML(e);
      this.cardDream.innerHTML = this.dreamHTML(e);
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
      // what its flowers give the farm
      let gives = '';
      if (blooms(e.def)) {
        const t = tasteOf(e.def);
        const what = [`${t} honey (when the bees visit it most)`];
        if (e.def.kind === 'lily') what.push(e.def.lotus ? 'lotus blooms' : 'water lilies, coloured by the water');
        else if (FLAVOURS.seeds[e.type] && e.def.kind !== 'strawberry') what.push(`${t} seed heads`);
        gives = `<span>Gives</span><span>${esc(listWords(what))}</span>`;
      }
      this.cardMeters.innerHTML = `<span>Growth</span>${bar(e.growth, '#77b255')}<span>Health</span>${bar(e.health, e.health < 0.4 ? '#e2553f' : '#e57a8a')}${fl}${gives}`;
    } else if (e.kind === 'decor') {
      if (!this.portraitKey) {
        this.portraitKey = 'd';
        const p = artCanvas([72, 64], decorBox(e.def), (g) => DECOR_ART[e.type](g, 0));
        p.className = 'portrait';
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      this.cardName.textContent = e.def.name;
      const gift = e.type === 'farmStand' || e.type === 'deliveryVan';
      let sub = (gift ? 'A thank-you gift from Busytown. ' : '') + (e.def.job || 'Looking lovely.');
      if (e.def.shelter) {
        // who lives here, and who's in right now
        const home = e.residents;
        const inside = this.world.creatures.filter((c) => c.inside === e && !c.dead);
        const who = (list) => list.slice(0, 4).map((c) => `${c.name} the ${c.def.name.toLowerCase()}`).join(', ') + (list.length > 4 ? ` and ${list.length - 4} more` : '');
        const visitors = inside.filter((c) => !home.includes(c));
        if (e.def.clinic) sub = visitors.length ? `Getting better inside: ${who(visitors)}.` : 'Nobody is poorly right now.';
        else if (home.length) sub = `Home to ${who(home)}. ` + (inside.length ? `${inside.length} in right now.` : 'Everyone is out and about.');
        else sub = visitors.length ? `Sheltering inside: ${who(visitors)}.` : e.wet ? 'A hidey-hole for pond critters. Nobody has moved in yet.' : 'A snug little home. Nobody has moved in yet.';
      }
      this.cardSub.textContent = sub;
      const does = e.def.job && e.def.shelter ? `<span>What it's for</span><span>${esc(e.def.job)}</span>` : '';
      if (e.def.clinic) this.cardMeters.innerHTML = does;
      else if (e.def.shelter) {
        this.cardMeters.innerHTML = `<span>Rooms taken</span><span>${e.residents.length} of ${e.def.cap || 3}</span><span>Good for</span><span>${e.wet ? 'fish, tadpoles, shrimp and snails' : 'critters on dry land'}</span>${does}`;
      } else if (e.def.hive) {
        const jars = this.world.goods.filter((g) => g.type === 'honey' && g.src === e.id).length;
        const bar = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
        // what the honey in the comb will taste of, from where the pollen came from
        const [flav, prize, shares] = this.world.combFlavour(e);
        const fd = flavourOf('honey', flav);
        const parts = shares.slice(0, 3).map(([k, v]) => `${Math.round(v * 100)}% ${k === 'wild' ? 'all sorts' : flavourOf('honey', k).adj}`);
        const taste = shares.length ? `${fd.name}${prize ? ' (prize!)' : ''} <small>${esc(parts.join(', '))}</small>` : 'nothing yet';
        this.cardMeters.innerHTML = `<span>Honeycomb</span>${bar(this.world.honeyFill(e), (fd && shares.length && fd.col) || '#f0a830')}<span>Next jar</span><span>${taste}</span><span>Jars ready</span><span>${jars ? `${jars} beside the hotel — tap to collect` : 'none yet'}</span>`;
      } else this.cardMeters.innerHTML = '';
    } else if (e.kind === 'equip') {
      const info = equipmentInfo(this.world, e, (t) => fmtTemp(t, u));
      const env = this.world.env;
      const look = e.id === 'lamp' ? Math.round(env[e.zone].lamp * 10) : e.id === 'mister' ? Math.round(env[e.zone].water * 8) + ':' + Math.round(env[e.zone].mister * 10) : e.id === 'heater' ? `${env.pond.heater}${Math.round(env.pond.heaterTarget)}` : e.id === 'filter' ? Math.round(env.pond.filterClean * 6) + ':' + Math.round(env.pond.filter * 10) : '';
      const pk = 'e' + e.id + e.zone + look;
      if (pk !== this.portraitKey) {
        this.portraitKey = pk;
        const p = this.equipPortrait(e);
        this.portrait.replaceWith(p);
        this.portrait = p;
      }
      this.cardName.textContent = info.name;
      this.cardSub.textContent = info.sub;
      if (this.cardWhat.textContent !== info.what) this.cardWhat.textContent = info.what;
      const bar = (v, col) => `<div class="meter"><i style="width:${Math.round(clamp01(v) * 100)}%;background:${col}"></i></div>`;
      this.cardMeters.innerHTML = info.meters.map(([l, v, col]) => `<span>${esc(l)}</span>${bar(v, col)}`).join('');
      // buttons are rebuilt only when they change, so they don't jump under a finger
      const key = info.actions.map((a) => a.join(':')).join('|');
      if (key !== this.actionsKey) {
        this.actionsKey = key;
        this.cardActions.innerHTML = '';
        for (const [id, label, style] of info.actions) this.cardActions.append(el('button', { class: 'btn small' + (style ? ' ' + style : ''), onclick: () => this.equipAction(e, id) }, label));
      }
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

  // What a critter does for the farm, and how much of it it has done.
  jobHTML(e) {
    const j = jobOf(e, e.sp === 'ant' ? this.world.colony(e.colonyId) : null);
    if (!j || e.dead) return '';
    if (e.stage === 'queen') return '<b>Job:</b> Queen <span>— lays every egg in the colony while the workers look after her.</span>';
    const made = e.memory.made || 0;
    const did = made && j.makes ? ` <i>Made ${goodWord(j.makes, made)} so far.</i>` : '';
    if (!e.isAdult) return `<b>Job when grown up:</b> ${esc(j.title)} <span>— ${esc(j.does)}.</span>`;
    const busy = e.busyT > 0 ? ' <i class="busy">Working double-time after a busy bun!</i>' : '';
    return `<b>Job:</b> ${esc(j.title)} <span>— ${esc(j.does)}.</span>${did}${busy}`;
  }

  // A grown-up's dream, and how close it is to coming true.
  dreamHTML(e) {
    if (e.dead) return '';
    const p = this.journal.dreams.progress(e);
    if (!p) return '';
    if (p.done) return `<b>Dream come true:</b> ${esc(p.text)}. <span class="master">★ ${esc(e.memory.master)}</span> <span>(works a quarter faster)</span>`;
    return `<b>Dream:</b> ${esc(p.text)} <span class="dmeter"><i style="width:${Math.round(p.f * 100)}%"></i></span> <span>${p.n} of ${p.dream.n}</span>`;
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

  // ------------------------------------------------------------------ visitors
  // Someone's come to visit: a card, and the camera can take the keeper
  // to them.
  visitorArrived(v, first) {
    this.sound.play('sparkle', 0.6);
    this.post.visitor(v, first);
  }
  // They have an idea for the tank (it always asks first).
  visitorOffer(v) {
    this.sound.play('pop', 0.6);
    this.post.offer(v.type, v.offer, v);
  }
  visitorGift(id, gift, v) {
    this.sound.play('sparkle', 0.8);
    this.post.gift(id, gift, v);
    this.updateHUD(true);
  }
  // The keeper's answer to a visitor's idea (from the card, or a note in
  // the Visitors' Book).
  answerOffer(id, offer, v, yes) {
    const vs = this.journal.visitors;
    if (!yes) {
      vs.decline(id, offer, v);
      this.toast(`${VISITORS[id].name} doesn't mind a bit. Maybe another time!`, 'heart');
      return;
    }
    const r = vs.accept(id, offer, v);
    this.sound.play(r.ok ? 'sparkle' : 'pop', r.ok ? 0.9 : 0.4);
    this.toast(r.ok ? `<b>Thank you, ${esc(VISITORS[id].name)}!</b><br>${esc(r.text)}` : esc(r.text), r.ok ? 'star' : 'leaf', r.ok, r.ok ? 7000 : 4000);
    if (r.ok && r.at) this.cam.flyTo(r.at[0], r.at[1], Math.max(this.cam.zoom, this.cam.fitHeight * 1.8));
    if (r.ok) {
      this.haptic(25);
      this.hooks.save();
    }
    if (this.selected === v) this.buildCard();
  }
  goToVisitor(v) {
    if (!v || v.removed) return;
    this.select(v);
    this.cam.flyTo(v.x, v.y - 10, Math.max(this.cam.zoom, this.cam.fitHeight * 2.2));
  }

  // ------------------------------------------------------------------ dressing up
  // Choose something for a critter to wear (from the wardrobe), and its
  // colour. The picture updates as the keeper tries things on.
  dressUp(c) {
    const w = this.world;
    const free = this.journal.sandbox;
    let item = c.acc && OUTFITS[c.acc] ? c.acc : null;
    let colour = c.accC || c.accColor;
    this.openModal(`Dress up ${c.name}`, (b) => {
      const pic = el('div', { class: 'dress-pic' });
      const draw = () => {
        pic.innerHTML = '';
        const pose = c.mode === 'swim' || c.def.fish ? 'swim' : 'idle';
        pic.append(c.sp === 'worm' ? wormIcon([120, 100], c.palIdx, item, colour) : creatureArt(c.sp, c.stage, pose, c.palIdx, item, colour, [120, 100]));
      };
      const grid = el('div', { class: 'wardrobe' });
      const swatches = el('div', { class: 'swatches' });
      const done = el('button', { class: 'btn green', onclick: () => {
        w.dress(c, item, item && OUTFITS[item].colour ? colour : null);
        this.closeModal();
        this.sound.play(item ? 'sparkle' : 'pop', 0.6);
        if (this.selected === c) this.updateCard(true);
      } }, 'Done');
      const refresh = () => {
        draw();
        done.textContent = item ? 'Looking good!' : 'Done';
        for (const btn of grid.children) {
          btn.classList.toggle('on', btn.dataset.item === (item || ''));
          const id = btn.dataset.item;
          if (id && OUTFITS[id].colour && btn.dataset.col !== colour && !btn.classList.contains('locked')) {
            btn.dataset.col = colour;
            btn.firstChild.replaceWith(outfitIcon(id, colour));
          }
        }
        swatches.classList.toggle('hidden', !item || !OUTFITS[item].colour);
        for (const sw of swatches.children) sw.classList.toggle('on', sw.dataset.col === colour);
      };
      grid.append(el('button', { class: 'wear', 'data-item': '', onclick: () => {
        item = null;
        refresh();
      } }, el('span', { class: 'none' }, '×'), el('small', {}, 'Nothing')));
      let have = 0;
      for (const id of OUTFIT_ORDER) {
        const o = OUTFITS[id];
        if (!canWear(c, id)) continue;
        const owned = free || w.wardrobeHas(id);
        if (owned) have++;
        const art = outfitIcon(id, o.colour ? colour : '#d9483b');
        const hint = o.visitor ? `A present from ${visitorName(o.visitor)}.` : (() => {
          const wr = WARE_BY_ID[o.from];
          const nb = wr && neighbour(wr.who);
          return nb ? `From ${nb.name} at the Busytown Market.` : '';
        })();
        if (!owned) art.style.filter = 'brightness(0) opacity(0.22)';
        grid.append(el('button', { class: 'wear' + (owned ? '' : ' locked'), 'data-item': id, title: owned ? o.name : hint, onclick: () => {
          if (!owned) {
            this.toast(`<b>${esc(o.name)}:</b> ${esc(hint)}`, 'shop', false, 4000);
            return;
          }
          item = id;
          refresh();
        } }, art, el('small', {}, owned ? o.name : '?')));
      }
      for (const col of ACC_COLORS) {
        swatches.append(el('button', { class: 'swatch', 'data-col': col, style: `background:${col}`, 'aria-label': 'Colour', onclick: () => {
          colour = col;
          refresh();
        } }));
      }
      b.append(pic);
      if (!have) b.append(el('p', { class: 'small' }, 'The wardrobe is empty! Tilly Thimble sells a whole sewing basket of hats and scarves at the Busytown Market, and every neighbour has a hat of their trade.'));
      b.append(grid, swatches, el('div', { class: 'row', style: 'margin-top:8px;justify-content:flex-end' }, done));
      refresh();
    });
  }

  // ------------------------------------------------------------------ HUD
  update(dt) {
    const w = this.world;
    const busy = !this.modal.classList.contains('hidden') || !!this.post.cur || !!this.moving;
    const it = this.herald.tick(Math.min(dt, 0.25), (w.time - DAY_LEN / 3) / DAY_LEN, busy);
    if (it) this.present(it);
    const gh = this.r.ghost;
    if (gh && gh.fade) {
      gh.fade -= dt * 2.5;
      gh.alpha = Math.max(0, gh.fade);
      if (gh.fade <= 0) this.r.ghost = null;
    }
    if (this.demo && this.tool === 'shape') {
      // a ghost brush sweeps a little S across the middle of the view
      const d = this.demo;
      d.t += dt;
      const k = Math.min(1, d.t / 2.2);
      const v = this.cam.view(0);
      const cx = (v.x0 + v.x1) / 2;
      const cy = v.y0 + (v.y1 - v.y0) * 0.42;
      const span = (v.x1 - v.x0) * 0.22;
      this.ring(cx - span + span * 2 * k, cy + Math.sin(k * Math.PI * 2) * span * 0.25, k > 0.12 && k < 0.88);
      this.r.ghost.demo = true;
      this.r.ghost.alpha = Math.min(1, d.t * 3, (2.2 - d.t) * 3);
      if (d.t >= 2.2) {
        this.demo = null;
        this.r.ghost = null;
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      this.needT = (this.needT || 0) - 0.25;
      if (this.needT <= 0 || !this.needs) {
        this.needT = 1;
        this.refreshNeeds();
      }
      this.updateHUD();
      this.r.mail = this.journal.orders.list.length;
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
    // the purse: coins, and a dot when there's something new to buy
    const coins = String(this.world.coins);
    if (this.purseN.textContent !== coins) {
      if (this._coins != null && +coins > this._coins) {
        this.purseBtn.classList.remove('chink');
        void this.purseBtn.offsetWidth;
        this.purseBtn.classList.add('chink');
      }
      this.purseN.textContent = coins;
    }
    this._coins = +coins;
    const seen = this.settings.seenWares || [];
    this.purseDot.classList.toggle('hidden', !onSale(this.journal, this.world).some((wr) => !seen.includes(wareKey(wr))));
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
    const ic = typeof icon === 'string' ? iconCanvas(icon, big ? 30 : 24) : icon;
    const t = el('div', { class: 'panel toast' + (big ? ' big' : '') }, ic, el('div', { html: msg }));
    this.toasts.prepend(t);
    while (this.toasts.children.length > 3) this.toasts.lastChild.remove();
    setTimeout(() => {
      t.classList.add('fade');
      setTimeout(() => t.remove(), 450);
    }, ms);
  }

  // A discovery: it's in the journal straight away (with a dot on the
  // Journal button), and the herald brings the card round when there's room.
  discovery(d) {
    this.unseenDisc++;
    this.journalDot.classList.remove('hidden');
    this.herald.push({ prio: d.reward ? 2 : 1, kind: 'discovery', show: () => this.showDiscovery(d) });
  }
  showDiscovery(d) {
    this.sound.play('sparkle', 0.8);
    const reward = d.reward ? (d.reward.decor ? ` <i>Unlocked: ${esc(DECOR[d.reward.decor].name)}!</i>` : ` <i>Unlocked a new style!</i>`) : '';
    this.toast(`<b>Discovery: ${esc(d.title)}</b><br>${esc(d.text)}${reward}`, 'star', true, 6500);
    this.haptic(20);
  }

  // ------------------------------------------------------------------ modals
  openModal(title, body, wide) {
    this.modalLocked = false;
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
    this.modalLocked = false;
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
      for (const [k, l] of [['disc', 'Discoveries'], ['guide', 'Field guide'], ['visitors', 'Visitors'], ['diary', 'Diary'], ['census', 'Census']]) {
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
          const cv = sp === 'worm' ? wormIcon([74, 60]) : creatureArt(sp, st, d.fish ? 'swim' : sp === 'bee' || sp === 'fruitfly' ? 'fly' : 'idle', 0, null, '#e2553f', [74, 60]);
          if (!met) cv.style.filter = 'brightness(0) opacity(0.25)';
          const u = this.settings.units;
          const eats = Object.entries(d.diet).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join(', ') + (d.prey ? ', ' + d.prey.map((p) => SPECIES[p].plural.toLowerCase()).join(', ') : '');
          b.append(
            el('div', { class: 'guide' }, cv,
              el('div', {},
                el('h3', {}, met ? d.name : '???', el('span', { class: 'small' }, met ? `  · ${this.world.count(sp)} in the tank` : '  · not met yet')),
                met ? el('div', { class: 'small' }, d.blurb) : el('div', { class: 'small' }, `Lives in the ${d.zone}.`),
                met && JOBS[sp] ? el('div', { class: 'small job' }, el('b', {}, 'Job: '), `${JOBS[sp].title} — ${JOBS[sp].does}.`) : null,
                met ? el('div', { class: 'small' }, `Comfy at ${fmtTemp(d.temp[1], u)}–${fmtTemp(d.temp[2], u)} · Eats: ${eats} · Active: ${d.activity === 'any' ? 'any time' : d.activity === 'dusk' ? 'dawn & dusk' : 'by ' + d.activity}`) : null,
                met ? el('ul', {}, ...d.facts.map((f) => el('li', {}, f))) : null,
                met ? this.varietiesEl(sp) : null))
          );
        }
      } else if (t === 'visitors') {
        this.visitorsBook(b);
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

  // The Visitors' Book: how cheerful the tank is (visitors love a happy
  // one), notes visitors left, and everyone who's been, or a hint for how
  // to tempt the ones who haven't.
  visitorsBook(b) {
    const w = this.world;
    const vs = this.journal.visitors;
    const cheer = tankCheer(w);
    const stars = Math.round(cheer * 5);
    b.append(el('p', {}, el('b', {}, 'Tank cheer: '), el('span', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(5 - stars)), ` · Visitors from the garden come by now and then, more often when the critters are happy, fed and comfy. Who comes depends on how you build their world.`));
    for (const n of vs.notes) {
      const def = VISITORS[n.id];
      b.append(el('div', { class: 'vnote' }, visitorCanvas(n.id, [56, 50]),
        el('div', { style: 'flex:1' }, el('b', {}, `A note from ${visitorName(n.id)}`), el('div', { class: 'small' }, `“${n.offer.ask}”`),
          el('div', { class: 'row', style: 'gap:6px;margin-top:4px' },
            el('button', { class: 'btn small', onclick: () => {
              this.answerOffer(n.id, n.offer, null, false);
              this.openJournal('visitors');
            } }, 'No, thank you'),
            el('button', { class: 'btn small yellow', onclick: () => {
              this.answerOffer(n.id, n.offer, null, true);
              this.closeModal();
            } }, `Yes please, ${def.name}!`)))));
    }
    const grid = el('div', { class: 'vbook' });
    for (const id of VISITOR_ORDER) {
      const def = VISITORS[id];
      const bk = vs.book[id];
      const met = bk && bk.n > 0;
      const pic = visitorCanvas(id, [74, 62]);
      if (!met) pic.style.filter = 'brightness(0) opacity(0.22)';
      const here = w.visitors.find((v) => v.type === id && v.state !== 'gone');
      grid.append(el('div', { class: 'guide' }, pic,
        el('div', {},
          el('h3', {}, met ? visitorName(id) : '???', el('span', { class: 'small' }, met ? `  · visited ${bk.n} time${bk.n === 1 ? '' : 's'}` : `  · from the ${def.zone === 'pond' ? 'pond side' : def.zone}`)),
          el('div', { class: 'small' }, met ? `Likes: ${def.likes}` : `Hint: ${def.hint}`),
          met && bk.yes ? el('div', { class: 'small job' }, `Has helped out ${bk.yes} time${bk.yes === 1 ? '' : 's'}.`) : null,
          here ? el('button', { class: 'btn small yellow', style: 'margin-top:4px', onclick: () => {
            this.closeModal();
            this.goToVisitor(here);
          } }, 'Here now! Go and see') : null)));
    }
    b.append(grid);
  }

  // Every named variety of a species, greyed out until the keeper has met
  // one: a little collection to complete.
  varietiesEl(sp) {
    const pals = PALETTES[sp] || [];
    if (pals.length < 2 || !pals[0].name) return null;
    const def = SPECIES[sp];
    const st = sp === 'ant' ? 'worker' : def.adultStage;
    const pose = def.fish ? 'swim' : 'idle';
    let n = 0;
    const row = el('div', { class: 'varieties' });
    pals.forEach((P, i) => {
      const seen = this.journal.seenVar[sp + ':' + i];
      if (seen) n++;
      const cv = creatureArt(sp, st, pose, i, sp === 'dragonfly' && i === 4 ? 'post' : null, '#e2553f', [40, 34]);
      if (!seen) cv.style.filter = 'brightness(0) opacity(0.22)';
      const rare = def.rarePals && def.rarePals.includes(i);
      row.append(el('span', { class: 'variety' + (rare ? ' rare' : ''), title: seen ? P.name : rare ? 'A rare variety: not found yet' : 'Not met yet' }, cv, el('small', {}, seen ? P.name : '?')));
    });
    return el('div', {}, el('div', { class: 'small' }, el('b', {}, 'Varieties: '), `${n} of ${pals.length} found`), row);
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
      const k = this.world.keeper;
      b.append(el('div', { class: 'row', style: 'margin:6px 0' }, el('span', { style: 'flex:1' }, hasName(k) ? `Busytown writes to: ${k.kind === 'town' ? 'the town of ' : ''}${k.name}` : 'Busytown doesn\'t know your name yet.'), el('button', { class: 'btn small', onclick: () => this.askName(() => this.openSettings()) }, hasName(k) ? 'Change name' : 'Tell them')));
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

  // Who Busytown should write to: the keeper's own name or their town's.
  // first: a brand-new farm (or an old one that was never asked), which
  // needs an answer before it carries on.
  askName(onDone, first) {
    const w = this.world;
    const k = w.keeper || { name: '', kind: 'me' };
    let kind = k.kind === 'town' ? 'town' : 'me';
    let idea = 0;
    this.openModal(first ? 'Who lives here?' : 'Your name', (b, head) => {
      if (first) {
        head.querySelector('.card-close').remove();
        this.modalLocked = true;
      }
      b.classList.add('naming');
      b.append(el('p', {}, 'Your neighbours in Busytown will be writing to you soon. What should they call you? It can be your own name or the name of your town.'));
      const input = el('input', { type: 'text', class: 'name-in', maxlength: String(NAME_MAX), autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Name', value: k.name || '' });
      const kinds = el('div', { class: 'name-kinds', role: 'radiogroup', 'aria-label': 'Whose name is it?' });
      const preview = el('div', { class: 'name-preview' });
      const ok = el('button', { class: 'btn green', onclick: () => done() }, 'That\'s us!');
      const refresh = () => {
        input.placeholder = kind === 'town' ? 'e.g. Maple Hollow' : 'e.g. Juniper';
        for (const c of kinds.children) c.classList.toggle('on', c.dataset.k === kind);
        const n = cleanName(input.value);
        const kk = { name: n || (kind === 'town' ? 'Maple Hollow' : 'Juniper'), kind };
        preview.innerHTML = '';
        preview.append(el('div', { class: 'letter' }, `“${dear(kk)}, could you send a jar of honey?”`), el('div', { class: 'plate' }, plateText(kk)));
        preview.classList.toggle('ghost', !n);
        ok.disabled = !n;
      };
      for (const [id, label] of [['me', 'It\'s my name'], ['town', 'It\'s my town']]) {
        const c = el('button', { class: 'btn small', role: 'radio', onclick: () => {
          kind = id;
          refresh();
        } }, label);
        c.dataset.k = id;
        kinds.append(c);
      }
      const surprise = el('button', { class: 'btn small', onclick: () => {
        const list = NAME_IDEAS[kind];
        input.value = list[(Math.floor(Math.random() * list.length) + idea++) % list.length];
        refresh();
      } }, 'Surprise me');
      const done = () => {
        const n = cleanName(input.value);
        if (!n) return input.focus();
        w.keeper = { name: n, kind };
        this.closeModal();
        if (onDone) onDone(w.keeper);
      };
      input.addEventListener('input', refresh);
      input.addEventListener('keydown', (e) => e.key === 'Enter' && done());
      b.append(kinds, el('div', { class: 'row name-row' }, input, surprise), preview, el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:10px' }, first ? null : el('button', { class: 'btn small', onclick: () => this.closeModal() }, 'Cancel'), ok));
      refresh();
      setTimeout(() => input.focus(), 60);
    });
  }

  // onChoose('farm' | 'full' | 'empty')
  showWelcome(onChoose) {
    this.openModal('Welcome!', (b, head) => {
      head.querySelector('.card-close').remove();
      this.modalLocked = true;
      b.append(el('div', { class: 'welcome-logo' }, 'BUG FARM'));
      b.append(el('p', {}, 'A tank of cute critters living their busy little lives — ants digging tunnels, tadpoles turning into frogs, fireflies blinking in the dark.'));
      b.append(el('p', {}, 'Each corner of your farm starts with two kinds of critter. Keep them comfy and fed, and the desert, pond and jungle grow: new critters, snacks and plants unlock as you go. The weather changes too, so keep an eye on your clipboard!'));
      b.append(el('p', {}, 'Every critter has a job. The honey, silk, seeds, compost and water lilies they make are wanted in Busytown, and the townsfolk pay in coins. Make friends with them and spend your coins at the Busytown Market.'));
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
      const made = Object.entries(summary.goods || {});
      if (made.length) li('star', `The critters made ${listWords(made.map(([g, n]) => goodWord(g, n)))}. Collect them from the tank!`);
      if (summary.letters) li('star', `${summary.letters} letter${summary.letters > 1 ? 's' : ''} arrived from Busytown. See the clipboard's Orders.`);
      if (summary.visit) {
        const vv = summary.visit;
        li('heart', vv.note ? `${visitorName(vv.id)} came by and left a note with an idea for the tank. Read it in the Journal's Visitors' Book.` : `${visitorName(vv.id)} came by. ${vv.gift.done}`);
      }
      if (summary.eaten) li('paw', `${summary.eaten} critters became somebody's snack.`);
      for (const n of summary.died.slice(0, 6)) li('flower', `${n} passed away.`);
      if (!ul.children.length) li('leaf', 'It was a quiet, peaceful time.');
      b.append(ul);
      const hungry = this.world.creatures.filter((c) => c.hunger > 0.6 && c.stage !== 'egg').length;
      if (hungry > 2) b.append(el('p', {}, `${hungry} critters are feeling hungry — time for a snack!`));
      b.append(el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn green', onclick: () => this.closeModal() }, 'Say hello!')));
    });
  }

  // now: straight away (the welcome tips); otherwise when it's quiet
  tip(now) {
    if (!this.settings.tips) return;
    if (now) this.toast(TIPS[this.tipI++ % TIPS.length], 'leaf', false, 4500);
    else this.herald.push({ prio: 0, kind: 'tip', key: 'tip', show: () => this.toast(TIPS[this.tipI++ % TIPS.length], 'leaf', false, 4500) });
  }

  // News from the tank's log: the herald brings round what's worth knowing.
  news(l) {
    const nw = newsPriority(l);
    if (!nw) return;
    const icon = l.icon === 'flower' ? 'flower' : l.icon;
    this.herald.push({ prio: nw.prio, kind: 'news', key: nw.key, show: () => this.toast(esc(l.text), icon) });
  }

  // Back from the builders: fly over to the new ground and say what's new.
  builtTank(b) {
    const x = (b.x0 + b.x1) / 2;
    const y = b.zone === 'pond' ? this.world.terrain.waterLevel + 80 : this.world.terrain.surfaceY(x) - 60;
    this.cam.flyTo(x, y, Math.max(this.cam.fitHeight * 1.4, this.cam.minZoom));
    this.sound.play('sparkle', 0.9);
    this.herald.hold(20);
    const what = { desert: 'fresh sand for more nests, plants and houses', pond: 'more water for more fish, and room for lilies and weeds', jungle: 'more jungle floor for plants and homes, and more lid for vines' }[b.zone];
    this.toast(`<b>The ${ZONE_NAMES[b.zone].toLowerCase()} is bigger!</b><br>Bertie's builders made ${esc(what)}.`, 'house', true, 8000);
  }

  // Show what the herald brings round.
  present(it) {
    if (it.kind === 'summary') {
      this.toast(`${it.n} more discoveries are waiting in your journal.`, 'book', false, 4500);
      return;
    }
    if (it.show) it.show();
  }
}

export { drawIcon };
