// Global constants for Bug Farm. World units are "tank units": the tank interior
// spans 0..W horizontally and 0..H vertically, y grows downward.

export const W = 1600;
export const H = 900;
export const CELL = 4;
export const GW = W / CELL; // 400 columns
export const GH = Math.ceil(H / CELL); // 225 rows

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;

// One in-game day lasts this many real seconds at 1x speed.
export const DAY_LEN = 720;

// Zone x-extents. Boundaries are soft: environment values blend across them.
export const ZONE_X = {
  desert: [0, 560],
  pond: [560, 1060],
  jungle: [1060, W],
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

export const MAX_CREATURES = 280;
export const MAX_FOOD = 140;
export const MAX_PLANTS = 70;
export const MAX_DECOR = 60;

export const SAVE_KEY = 'bugfarm.save.v1';
export const SETTINGS_KEY = 'bugfarm.settings.v1';
export const SAVE_VERSION = 1;

// Ink color used for every outline so the whole world feels hand-inked.
export const INK = '#3a2a1f';
