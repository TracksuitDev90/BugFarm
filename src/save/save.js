// Saving without a server: the whole tank is serialised into localStorage
// (with a backup of the previous save), and can be exported/imported as a
// small file so a tank can move between devices.
import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION } from '../config.js';

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

export function snapshot(game, journal) {
  return {
    v: SAVE_VERSION,
    app: 'bugfarm',
    savedAt: Date.now(),
    world: game.world.serialize(),
    cam: game.cam.serialize(),
    speed: game.speed,
    journal: journal.serialize(),
  };
}

export function saveGame(game, journal) {
  const data = snapshot(game, journal);
  const str = JSON.stringify(data);
  const prev = safeGet(SAVE_KEY);
  if (prev) safeSet(SAVE_KEY + '.bak', prev);
  if (!safeSet(SAVE_KEY, str)) {
    // storage full: drop the backup and try again
    try {
      localStorage.removeItem(SAVE_KEY + '.bak');
    } catch (e) {
      /* ignore */
    }
    if (!safeSet(SAVE_KEY, str)) return { ok: false, size: str.length };
  }
  return { ok: true, size: str.length };
}

export function validate(d) {
  return d && d.app === 'bugfarm' && d.world && d.world.terrain && Array.isArray(d.world.creatures);
}

export function loadGame() {
  for (const key of [SAVE_KEY, SAVE_KEY + '.bak']) {
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

export function hasSave() {
  return !!safeGet(SAVE_KEY);
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_KEY + '.bak');
  } catch (e) {
    /* ignore */
  }
}

export function exportSave(game, journal) {
  const data = JSON.stringify(snapshot(game, journal));
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.download = `bug-farm-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
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
        if (!validate(d)) throw new Error('Not a Bug Farm save');
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
  const s = safeGet(SETTINGS_KEY);
  let d = {};
  try {
    d = s ? JSON.parse(s) : {};
  } catch (e) {
    d = {};
  }
  return Object.assign({}, DEFAULT_SETTINGS, d);
}
export function saveSettings(s) {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}
