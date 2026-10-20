// Bug Farm entry point.
import { W, H, DAY_LEN } from './config.js';
import { Game } from './game.js';
import { Input } from './ui/input.js';
import { UI } from './ui/ui.js';
import { Journal } from './sim/journal.js';
import { Sound } from './audio/audio.js';
import { loadGame, saveGame, loadSettings, saveSettings, exportSave, importSave, clearSave } from './save/save.js';
import { catchUp, awaySeconds } from './sim/away.js';
import { clamp } from './util/math.js';

const settings = loadSettings();
const canvas = document.getElementById('tank');
const game = new Game(canvas);
const journal = new Journal();
const sound = new Sound();
sound.enabled = settings.sound;
sound.volume = settings.volume;
journal.sandbox = settings.sandbox;
let ui = null;
let input = null;
let ready = false;
let autoQuality = guessQuality();
let slowT = 0;

function guessQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 2) return 'low';
  if (mem >= 8 && cores >= 8 && Math.min(screen.width, screen.height) > 700) return 'high';
  return 'medium';
}

function applyQuality() {
  const q = settings.quality === 'auto' ? autoQuality : settings.quality;
  game.renderer.setQuality(q);
  game.fpsCap = settings.battery ? 30 : 0;
  resize();
}

function resize() {
  const [top, bottom] = ui ? ui.layoutPads() : [56, 72];
  game.resize(window.innerWidth, window.innerHeight, top, bottom);
}

function save(manual) {
  if (!ready) return;
  const r = saveGame(game, journal);
  if (manual && ui) ui.toast(r.ok ? 'Saved! Your tank is safe on this device.' : 'Could not save — storage is full. Try exporting to a file.', r.ok ? 'heart' : '!');
}

function wireWorld() {
  const w = game.world;
  w.gentle = settings.gentle;
  journal.attach(w);
  journal.onUnlock = (d) => ui && ready && ui.discovery(d);
  journal.progress.onLevel = (z, lv, unlocks) => ui && ready && !journal.sandbox && ui.levelUp(z, lv, unlocks);
  w.events.on('sound', ({ name, x, y, p }) => {
    const cam = game.cam;
    const v = cam.view(20);
    if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) return;
    const vol = clamp(cam.zoom / 1.6, 0.12, 0.9);
    if (name === 'chirp') sound.play('chirp', vol * 0.55, clamp(0.85 + ((p || 22) - 18) * 0.02, 0.7, 1.3), 0.12);
    else if (name === 'croak') sound.play('croak', vol * 0.7, 0.9 + Math.random() * 0.2, 0.3);
    else if (name === 'plop') sound.play('plop', vol * 0.8, 0.9 + Math.random() * 0.25, 0.05);
    else if (name === 'tap') sound.play('tap', vol * 0.6, 1, 0.05);
  });
  let lastToast = 0;
  w.events.on('log', (l) => {
    if (!ui || !ready || w.awayMode) return;
    const now = performance.now();
    // discoveries and level-ups have their own bigger toasts
    if (l.icon === 'crown' || (l.icon === 'star' && !/^Discovery|reached level/.test(l.text)) || ((l.icon === 'heart' || l.icon === 'flower') && now - lastToast > 9000)) {
      lastToast = now;
      ui.toast(l.text, l.icon === 'flower' ? 'flower' : l.icon);
    }
  });
  w.events.on('hop', () => {});
}

function onFrame(dt) {
  if (input) input.update();
  if (ui) ui.update(dt);
  journal.update(dt);
  // automatic quality: if real frame intervals stay slow (this catches slow
  // pixel filling on phones without GPU canvas, not just slow JavaScript),
  // step down to fewer pixels.
  if (settings.quality === 'auto' && ready && !document.hidden) {
    const target = game.fpsCap ? 1 / game.fpsCap : 1 / 60;
    if (game.avgDt > target * 1.55 || game.avgFrame > 22) {
      slowT += dt;
      if (slowT > 4 && autoQuality !== 'low') {
        autoQuality = autoQuality === 'high' ? 'medium' : 'low';
        slowT = 0;
        game.avgDt = target;
        applyQuality();
      }
    } else slowT = Math.max(0, slowT - dt * 0.5);
  }
}

// mode: 'farm' (grow it zone by zone), 'full' or 'empty' (sandbox)
function newTank(mode) {
  const g = game;
  settings.sandbox = mode !== 'farm';
  journal.sandbox = settings.sandbox;
  saveSettings(settings);
  const fresh = new g.world.constructor();
  fresh.fx = g.renderer.fx;
  g.world = fresh;
  g.renderer.world = fresh;
  g.renderer.tr.terrain = fresh.terrain;
  g.renderer.tr.chunks.fill(null);
  g.renderer.plantCache.clear();
  g.renderer.waterKey = '';
  g.renderer.backdropKey = '';
  journal.reset();
  fresh.newGame((Math.random() * 1e9) | 0, mode === 'farm' ? 'farm' : mode === 'full');
  g.renderer.applyStyle();
  g.renderer.tr.renderAll();
  ui.world = fresh;
  ui.select(null);
  ui.choice.adopt = ui.choice.plant = ui.choice.decor = null;
  ui.setTool('look');
  wireWorld();
  g.cam.reset();
  ready = true;
  save();
}

async function loadFromData(data, elapsedReal) {
  const w = game.world;
  w.load(data.world);
  journal.load(data.journal);
  if (settings.sandbox !== journal.sandbox) {
    settings.sandbox = journal.sandbox;
    saveSettings(settings);
  }
  game.speed = data.speed || 1;
  game.renderer.applyStyle();
  wireWorld();
  game.renderer.tr.renderAll();
  resize();
  game.cam.load(data.cam);
  let summary = null;
  if (settings.away === 'living' && elapsedReal > 90) {
    const secs = awaySeconds(elapsedReal);
    const bar = document.getElementById('loadbar');
    const msg = document.getElementById('loadmsg');
    if (msg) msg.textContent = 'Catching up on what happened while you were away...';
    summary = await catchUp(w, secs, (p) => {
      if (bar) bar.style.width = Math.round(p * 100) + '%';
    });
  }
  return summary;
}

async function boot() {
  ui = new UI(game, journal, sound, settings, {
    setDragMode: (m) => input && (input.dragMode = m),
    save: (manual) => save(manual),
    saveSettings: () => saveSettings(settings),
    applyQuality,
    exportFile: () => exportSave(game, journal),
    importFile: async (file) => {
      try {
        const d = await importSave(file);
        saveGame({ world: { serialize: () => d.world }, cam: { serialize: () => d.cam }, speed: d.speed }, { serialize: () => d.journal });
        ready = false; // don't let the page-hide save overwrite the import
        location.reload();
      } catch (e) {
        ui.toast('That file is not a Bug Farm save.', '!');
      }
    },
    newTank: () => {
      clearSave();
      ready = false;
      ui.showWelcome((starter) => newTank(starter));
    },
    terrainChanged: () => game.world.computeRegions(),
  });
  ui.init();
  resize();
  applyQuality();
  input = new Input(canvas, game.cam, {
    tap: (x, y, sx, sy, dbl) => ui.tap(x, y, sx, sy, dbl),
    hold: (x, y, held) => ui.hold(x, y, held),
    press: () => sound.unlock(),
    dragStart: (x, y) => ui.dragStart(x, y),
    dragMove: (x, y) => ui.dragMove(x, y),
    dragEnd: () => ui.dragEnd(),
    hover: (x, y) => ui.hover(x, y),
  });
  window.addEventListener('resize', resize);
  // iOS Safari: stop page pinch-zoom when pinching on the UI panels
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  game.onFrame = onFrame;

  const data = loadGame();
  let summary = null;
  let elapsed = 0;
  if (data) {
    elapsed = Math.max(0, (Date.now() - data.savedAt) / 1000);
    try {
      summary = await loadFromData(data, elapsed);
      ready = true;
    } catch (e) {
      console.error('Could not load save', e);
    }
  }
  const loading = document.getElementById('loading');
  if (!ready) {
    // first visit: an empty tank behind the welcome card
    game.world.newGame((Math.random() * 1e9) | 0, false);
    wireWorld();
    game.renderer.tr.renderAll();
    game.cam.reset();
    ui.showWelcome((starter) => {
      newTank(starter);
      settings.welcomed = true;
      saveSettings(settings);
      setTimeout(() => ui.tip(), 1500);
      setTimeout(() => ui.tip(), 7000);
    });
  } else if (summary) {
    ui.showAway(summary, elapsed);
  } else if (settings.tips) setTimeout(() => ui.tip(), 2500);
  game.start();
  if (loading) {
    loading.style.opacity = '0';
    setTimeout(() => loading.remove(), 450);
  }

  setInterval(() => save(), 20000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      save();
      hiddenAt = Date.now();
      game.stop();
    } else {
      const gone = hiddenAt ? (Date.now() - hiddenAt) / 1000 : 0;
      if (ready && settings.away === 'living' && gone > 90) {
        ui.toast('Catching up on the tank...', 'leaf');
        const s = await catchUp(game.world, awaySeconds(gone));
        if (s) ui.showAway(s, gone);
      }
      game.last = performance.now();
      game.start();
    }
  });
  window.addEventListener('pagehide', () => save());

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.bugfarm = { game, journal, ui, settings };
}

boot();

export { W, H, DAY_LEN };
