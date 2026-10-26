// Saving without a server: the whole tank is serialised into localStorage
// (with a backup of the previous save), and can be exported/imported as a
// small file so a tank can move between devices. A tank saved back when the
// farm was called Bug Farm is read from its old keys until it's next saved.
import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION, TANK_KEY, OLD_KEYS } from '../config.js';

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch (e) {
    return false;
  }
}
function safeRemove(...keys) {
  try {
    for (const k of keys) localStorage.removeItem(k);
  } catch (e) {
    /* ignore */
  }
}

export function snapshot(game, journal) {
  return {
    v: SAVE_VERSION,
    app: 'critterfarm',
    savedAt: Date.now(),
    world: game.world.serialize(),
    cam: game.cam.serialize(),
    speed: game.speed,
    journal: journal.serialize(),
  };
}

export function saveGame(game, journal) {
  return writeSave(snapshot(game, journal));
}

// Store a whole save (a snapshot, or one the builders have just widened).
export function writeSave(data) {
  const str = JSON.stringify(data);
  const prev = safeGet(SAVE_KEY) || safeGet(OLD_KEYS.save);
  if (prev) safeSet(SAVE_KEY + '.bak', prev);
  if (!safeSet(SAVE_KEY, str)) {
    // storage full: drop the backups (and any save under the old name) and try again
    safeRemove(SAVE_KEY + '.bak', OLD_KEYS.save + '.bak');
    if (!safeSet(SAVE_KEY, str)) return { ok: false, size: str.length };
  }
  // saved under the new name: the old one has moved across
  safeRemove(OLD_KEYS.save, OLD_KEYS.save + '.bak');
  return { ok: true, size: str.length };
}

// (files exported back when it was Bug Farm still open)
export function validate(d) {
  return d && (d.app === 'critterfarm' || d.app === 'bugfarm') && d.world && d.world.terrain && Array.isArray(d.world.creatures);
}

export function loadGame() {
  for (const key of [SAVE_KEY, SAVE_KEY + '.bak', OLD_KEYS.save, OLD_KEYS.save + '.bak']) {
    const s = safeGet(key);
    if (!s) continue;
    try {
      const d = JSON.parse(s);
      if (validate(d)) return d;
    } catch (e) {
      /* try backup */
    }
  }
  return null;
}

// The size the tank is built to (see config.js and sim/tank.js), kept apart
// from the save because it's needed before anything else starts.
export function writeTankSize(tank) {
  try {
    if (!tank || !(tank.desert || tank.pond || tank.jungle)) localStorage.removeItem(TANK_KEY);
    else localStorage.setItem(TANK_KEY, JSON.stringify(tank));
    localStorage.removeItem(OLD_KEYS.tank);
    return true;
  } catch (e) {
    return false;
  }
}

export function hasSave() {
  return !!(safeGet(SAVE_KEY) || safeGet(OLD_KEYS.save));
}

export function clearSave() {
  safeRemove(SAVE_KEY, SAVE_KEY + '.bak', OLD_KEYS.save, OLD_KEYS.save + '.bak');
}

export function exportSave(game, journal) {
  const data = JSON.stringify(snapshot(game, journal));
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.download = `critter-farm-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function importSave(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!validate(d)) throw new Error('Not a Critter Farm save');
        resolve(d);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export const DEFAULT_SETTINGS = {
  sound: true,
  volume: 0.6,
  quality: 'auto',
  battery: false,
  units: 'C',
  gentle: true,
  away: 'living',
  sandbox: false,
  tips: true,
  welcomed: false,
};

export function loadSettings() {
  let s = safeGet(SETTINGS_KEY);
  if (!s && (s = safeGet(OLD_KEYS.settings)) && safeSet(SETTINGS_KEY, s)) safeRemove(OLD_KEYS.settings);
  let d = {};
  try {
    d = s ? JSON.parse(s) : {};
  } catch (e) {
    d = {};
  }
  return Object.assign({}, DEFAULT_SETTINGS, d);
}
export function saveSettings(s) {
  if (safeSet(SETTINGS_KEY, JSON.stringify(s))) safeRemove(OLD_KEYS.settings);
}
