// Global constants for Critter Farm. World units are "tank units": the tank
// interior spans 0..W horizontally and 0..H vertically, y grows downward.

export const SAVE_KEY = 'critterfarm.save.v1';
export const SETTINGS_KEY = 'critterfarm.settings.v1';
export const TANK_KEY = 'critterfarm.tank.v1';
// The farm used to be called Bug Farm: a tank saved under the old name is
// still found (and moves across the next time it's saved; see save.js).
export const OLD_KEYS = { save: 'bugfarm.save.v1', settings: 'bugfarm.settings.v1', tank: 'bugfarm.tank.v1' };
export const SAVE_VERSION = 1;

// The tank can be made bigger (the builder in Busytown sells extensions; see
// sim/tank.js): extra width for the desert (new sand on its left), the pond
// (it widens down the middle) and the jungle (new ground on its right).
// Every size below follows from it, so it's read once, before anything else
// is set up: from the browser's storage, or CRITTERFARM_TANK for the
// headless tools. Changing it means reloading.
export const TANK_STEP = { desert: 256, pond: 128, jungle: 256 };
export const TANK_MAX = { desert: 512, pond: 256, jungle: 512 };
export function parseTank(src) {
  const t = { desert: 0, pond: 0, jungle: 0 };
  try {
    const d = typeof src === 'string' ? JSON.parse(src) : src;
    for (const z of Object.keys(t)) {
      const v = Math.round((d && d[z]) || 0);
      if (v > 0 && v % TANK_STEP[z] === 0 && v <= TANK_MAX[z]) t[z] = v;
    }
  } catch (e) {
    /* a plain tank */
  }
  return t;
}
function readTank() {
  let src = null;
  try {
    if (globalThis.CRITTERFARM_TANK) src = globalThis.CRITTERFARM_TANK;
    else if (typeof process !== 'undefined' && process.env && process.env.CRITTERFARM_TANK) src = process.env.CRITTERFARM_TANK;
    else if (typeof localStorage !== 'undefined') src = localStorage.getItem(TANK_KEY) || localStorage.getItem(OLD_KEYS.tank);
  } catch (e) {
    src = null;
  }
  return parseTank(src);
}
export const TANK = readTank();

// The original tank, before any extensions: everything placed by the game
// (equipment, a new farm's plants) is given in these coordinates and put in
// the real tank with X().
export const BASE_W = 1600;
// where the pond widens: the middle of its deepest part, on a cell boundary
export const POND_SPLIT = 808;
export function X(bx) {
  return bx + TANK.desert + (bx >= POND_SPLIT ? TANK.pond : 0);
}

export const W = BASE_W + TANK.desert + TANK.pond + TANK.jungle;
export const H = 900;
export const CELL = 4;
export const GW = W / CELL; // 400 columns in the original tank
export const GH = Math.ceil(H / CELL); // 225 rows

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;

// One in-game day lasts this many real seconds at 1x speed.
export const DAY_LEN = 720;

// Zone x-extents. Boundaries are soft: environment values blend across them.
export const ZONE_X = {
  desert: [0, X(560)],
  pond: [X(560), X(1060)],
  jungle: [X(1060), W],
};
export const ZONE_MID = {
  desert: (ZONE_X.desert[0] + ZONE_X.desert[1]) / 2,
  pond: (ZONE_X.pond[0] + ZONE_X.pond[1]) / 2,
  jungle: (ZONE_X.jungle[0] + ZONE_X.jungle[1]) / 2,
};
// how much bigger each zone is than it started (for how many critters it holds)
export const ZONE_SCALE = {
  desert: (ZONE_X.desert[1] - ZONE_X.desert[0]) / 560,
  pond: (ZONE_X.pond[1] - ZONE_X.pond[0]) / 500,
  jungle: (ZONE_X.jungle[1] - ZONE_X.jungle[0]) / 540,
};
export const ZONE_BLEND = 70;
export const ZONES = ['desert', 'pond', 'jungle'];

export const MAT = {
  AIR: 0,
  SAND: 1,
  SOIL: 2,
  ROCK: 3,
  GRAVEL: 4,
  CLAY: 5,
};
export const OOB = 255; // outside the tank (glass)

// (a bigger tank has room for more of everything)
const ROOM = W / BASE_W;
export const MAX_CREATURES = Math.round(280 * (1 + (ROOM - 1) * 0.6));
export const MAX_FOOD = 140;
export const MAX_PLANTS = Math.round(70 * ROOM);
export const MAX_DECOR = Math.round(60 * ROOM);

// Ink color used for every outline so the whole world feels hand-inked.
export const INK = '#3a2a1f';
