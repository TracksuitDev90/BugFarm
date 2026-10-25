import { DAY_LEN, ZONE_X, ZONE_MID, ZONE_BLEND, CELL, W, X } from '../config.js';
import { clamp, clamp01, lerp, smoothstep } from '../util/math.js';
import { rrange } from '../util/rng.js';

// The weather outside the tank drifts every day or so, nudging the room
// temperature (and how damp the air is) so the keeper has to rebalance.
//   temp: degrees added to the room, moist: added to zone dampness, w: how often
export const WEATHER = {
  mild: { name: 'Mild', temp: 0, moist: 0, w: 3, icon: 'sun' },
  warm: { name: 'Warm spell', temp: 4, moist: -0.03, w: 2, icon: 'hot' },
  cool: { name: 'Cool spell', temp: -4, moist: 0.02, w: 2, icon: 'cold' },
  heat: { name: 'Heat wave', temp: 7.5, moist: -0.08, w: 1, icon: 'hot' },
  cold: { name: 'Cold snap', temp: -7, moist: 0, w: 1, icon: 'cold' },
  dry: { name: 'Dry spell', temp: 1.5, moist: -0.15, w: 1.2, icon: 'sun' },
  muggy: { name: 'Muggy', temp: 2, moist: 0.1, w: 1, icon: 'drop' },
};
// The big swings (heat waves, cold snaps) hold off until the farm is a few
// days old, so a new keeper learns the controls on gentler weather.
const ROUGH = { heat: 1, cold: 1 };
function pickWeather(not, day = 99) {
  const ids = Object.keys(WEATHER).filter((k) => k !== not && !(day < 5 && ROUGH[k]));
  let r = Math.random() * ids.reduce((a, k) => a + WEATHER[k].w, 0);
  for (const k of ids) if ((r -= WEATHER[k].w) <= 0) return k;
  return 'mild';
}

// The tank's climate. Each zone has player-controlled equipment (heat lamps,
// misters, water heater, filter) and simulated state that drifts toward
// targets so changes feel physical rather than instant.
export class Environment {
  constructor() {
    this.time = DAY_LEN * (8 / 24); // start at 8am on day 1
    this.lightsMode = 'auto'; // auto | day | night
    this.roomTemp = 21;
    this.roomSet = 21; // thermostat for the room the tank sits in
    // water: how full each mister's bottle is (it empties as it sprays)
    this.desert = { lamp: 0.5, mister: 0, temp: 28, moist: 0.14, water: 1 };
    this.pond = {
      lamp: 0.15,
      heater: false,
      heaterTarget: 24,
      filter: 0.5,
      temp: 22,
      oxygen: 0.92,
      clarity: 1,
      algae: 0.12,
      nutrients: 0.1,
      filterClean: 1, // gunk builds up in the filter sponge over a few days
      full: 425, // the water line when topped up; evaporation lowers it
      evap: 0,
    };
    this.jungle = { lamp: 0.25, mister: 0.35, temp: 24, moist: 0.62, water: 1 };
    this.fertility = { desert: 0.3, jungle: 0.6 };
    this.weatherOn = true;
    this.wx = { now: 'mild', next: 'warm', change: DAY_LEN * 2.6 };
    this.wxT = 0; // weather offsets as felt right now (they ease in)
    this.wxM = 0;
    this.greenery = { desert: 0, jungle: 0 }; // leafy plants breathe out damp air
    this.lowWater = 0; // 0..1, how far the pond has evaporated below its line
    // Accumulators fed by the world each tick.
    this.rotLoad = 0; // rotting food in water
    this.bioLoad = 0; // breathing creatures in water
    this.grazers = 0;
    this.waterPlants = 0;
    this.feederCountdown = 0;
  }

  get day() {
    return Math.floor(this.time / DAY_LEN) + 1;
  }
  get hour() {
    return ((this.time % DAY_LEN) / DAY_LEN) * 24;
  }
  // Natural daylight 0..1 from the room window.
  get sun() {
    if (this.lightsMode === 'day') return 1;
    if (this.lightsMode === 'night') return 0;
    const h = this.hour;
    return smoothstep(5.5, 7.5, h) * (1 - smoothstep(19, 21, h));
  }
  get isNight() {
    return this.sun < 0.25;
  }
  get isDusk() {
    const h = this.hour;
    return this.lightsMode === 'auto' && ((h > 18.5 && h < 21.5) || (h > 4.5 && h < 7));
  }

  zoneWeights(x) {
    // Returns [desert, pond, jungle] weights summing to 1, soft at borders.
    const b = ZONE_BLEND;
    const d = 1 - smoothstep(ZONE_X.desert[1] - b, ZONE_X.desert[1] + b, x);
    const j = smoothstep(ZONE_X.jungle[0] - b, ZONE_X.jungle[0] + b, x);
    const p = Math.max(0, 1 - d - j);
    return [d, p, j];
  }
  zoneAt(x) {
    if (x < ZONE_X.desert[1]) return 'desert';
    if (x < ZONE_X.pond[1]) return 'pond';
    return 'jungle';
  }
  zone(name) {
    return this[name];
  }
  // How hard a mister is actually spraying (nothing once its bottle is dry).
  misting(z) {
    const e = this[z];
    return e.water > 0.001 ? e.mister : 0;
  }
  // The pond filter works less well as it clogs.
  get filterFlow() {
    return this.pond.filter * (0.25 + 0.75 * this.pond.filterClean);
  }
  get weather() {
    return WEATHER[this.weatherOn ? this.wx.now : 'mild'];
  }
  get forecast() {
    return this.weatherOn ? WEATHER[this.wx.next] : null;
  }

  updateWeather(dt) {
    if (this.time >= this.wx.change) {
      this.wx.now = this.wx.next;
      this.wx.next = pickWeather(this.wx.now, this.day);
      this.wx.change = this.time + rrange(1.2, 2.2) * DAY_LEN;
    }
    const w = this.weather;
    const k = 1 - Math.exp(-dt / (DAY_LEN * 0.1)); // spells roll in over a couple of hours
    this.wxT += (w.temp - this.wxT) * k;
    this.wxM += (w.moist - this.wxM) * k;
  }

  update(dt, world) {
    this.time += dt;
    this.updateWeather(dt);
    const sun = this.sun;
    const h = this.hour;
    // Room cools a little at night and warms in the afternoon, and follows
    // the weather outside.
    const daily = Math.sin(((h - 9) / 24) * Math.PI * 2);
    this.roomTemp = this.roomSet - 0.5 + daily * 1.8 + sun * 0.6 + this.wxT;

    const k = 1 - Math.exp(-dt / 45); // air relaxes over ~45 game seconds
    const km = 1 - Math.exp(-dt / 90);
    for (const name of ['desert', 'jungle']) {
      const z = this[name];
      const isDesert = name === 'desert';
      const mist = this.misting(name);
      // misters drink from their bottle: a full one lasts ~4 days at 35%
      if (z.mister > 0) z.water = Math.max(0, z.water - (dt * z.mister) / (DAY_LEN * 1.4));
      const tgt = this.roomTemp + z.lamp * (isDesert ? 20 : 16) + sun * 0.8 - mist * 3;
      z.temp += (tgt - z.temp) * k;
      const base = isDesert ? 0.06 : 0.26;
      const green = Math.min(isDesert ? 0.03 : 0.1, this.greenery[name] * 0.006);
      const mTgt = clamp01(base + mist * (isDesert ? 0.85 : 0.72) - Math.max(0, z.temp - 24) * 0.012 + green + this.wxM + (world ? world.rainBoost(name) : 0));
      z.moist += (mTgt - z.moist) * km;
    }

    // Pond: big thermal mass, oxygen/algae/clarity chemistry.
    const p = this.pond;
    const flow = this.filterFlow;
    // the sponge clogs faster in a dirty, overfed pond
    p.filterClean = Math.max(0, p.filterClean - (dt * (0.1 + p.nutrients * 0.9 + this.rotLoad * 0.01) * p.filter) / DAY_LEN);
    const kw = 1 - Math.exp(-dt / 160);
    const wTgt = (p.heater ? p.heaterTarget : this.roomTemp - 1) + p.lamp * 7 + sun * 0.4;
    p.temp += (wTgt - p.temp) * kw;
    // a shallow, evaporated pond holds less air and gets murkier
    const sat = clamp(1.16 - 0.022 * (p.temp - 10) - this.lowWater * 0.12, 0.45, 1.05);
    const light = Math.max(sun, p.lamp * 0.8);
    const photo = (p.algae * 0.005 + this.waterPlants * 0.0008) * light;
    const resp = this.bioLoad * 0.00035 + p.algae * 0.0025 * (1 - light) + this.rotLoad * 0.0003;
    p.oxygen += ((sat - p.oxygen) * (0.004 + flow * 0.02) + photo - resp) * dt;
    // warm water simply can't hold as much air, however many plants there are
    p.oxygen = clamp(p.oxygen, 0.05, Math.min(1.15, sat + 0.12));
    p.nutrients += (this.bioLoad * 0.00006 + this.rotLoad * 0.0009 - p.nutrients * (0.0005 + flow * 0.0016) - p.algae * p.nutrients * 0.0015 - this.waterPlants * 0.00015 * p.nutrients) * dt;
    p.nutrients = clamp(p.nutrients, 0, 1.5);
    const algaeGrow = p.algae * (1 - p.algae) * 0.0016 * light * (0.25 + p.nutrients * 2.5) * smoothstep(8, 22, p.temp);
    const algaeEat = this.grazers * 0.00004 * p.algae + flow * 0.00012 * p.algae;
    p.algae = clamp(p.algae + (algaeGrow - algaeEat - p.algae * 0.00008) * dt, 0.01, 1);
    const cTgt = clamp01(1 - p.nutrients * 0.45 - p.algae * 0.35 - this.rotLoad * 0.022 - this.lowWater * 0.15);
    p.clarity += (cTgt - p.clarity) * (1 - Math.exp(-dt * (0.003 + flow * 0.012)));

    // Soil fertility slowly returns to baseline.
    this.fertility.desert = lerp(this.fertility.desert, 0.3, dt * 0.0002);
    this.fertility.jungle = lerp(this.fertility.jungle, 0.55, dt * 0.0002);
  }

  // Local temperature at a world point. Underground is buffered toward a
  // stable 19°C, the area under a heat lamp has a warm basking spot.
  tempAt(x, y, terrain) {
    const [wd, wp, wj] = this.zoneWeights(x);
    const pondAir = (this.roomTemp + this.pond.lamp * 8) * 0.6 + (this.desert.temp + this.jungle.temp) * 0.2;
    let air = wd * this.desert.temp + wj * this.jungle.temp + wp * pondAir;
    if (terrain) {
      if (terrain.waterAt(x, y)) {
        // the skin of the water right under a lamp is warm (a turtle floats
        // up there to bask, shell in the air)
        const lamp = this.lampAt(x);
        if (lamp.power <= 0) return this.pond.temp;
        const near = 1 - smoothstep(30, 140, Math.abs(x - lamp.x));
        const top = 1 - smoothstep(2, 26, y - terrain.waterSurfY(x));
        return this.pond.temp + lamp.power * 6 * near * top;
      }
      const gy = terrain.groundY(x);
      if (y > gy + CELL) {
        const depth = y - gy;
        return lerp(air, 19, 1 - Math.exp(-depth / 90));
      }
      // Hot spot under each lamp near the surface.
      const lamp = this.lampAt(x);
      if (lamp.power > 0) {
        const near = 1 - smoothstep(30, 140, Math.abs(x - lamp.x));
        const surf = 1 - smoothstep(0, 90, Math.abs(y - terrain.surfaceY(x)));
        air += lamp.power * 9 * near * surf;
      }
      // Near the pond the air is a touch cooler.
      if (wp > 0.5 && y < terrain.waterLevel) air = lerp(air, this.pond.temp, 0.3);
    }
    return air;
  }

  moistAt(x, y, terrain) {
    const [wd, wp, wj] = this.zoneWeights(x);
    let m = wd * this.desert.moist + wj * this.jungle.moist + wp * 0.85;
    if (terrain) {
      if (terrain.waterAt(x, y)) return 1;
      const gy = terrain.groundY(x);
      if (y > gy + CELL) m = lerp(m, Math.min(1, m + 0.25), clamp01((y - gy) / 160));
    }
    return clamp01(m);
  }

  lightAt(x, y, terrain) {
    let l = this.sun;
    const lamp = this.lampAt(x);
    l = Math.max(l, lamp.power * 0.75 * (1 - smoothstep(60, 220, Math.abs(x - lamp.x))));
    if (terrain && terrain.isUnderground(x, y)) l *= 0.15;
    return l;
  }

  lampAt(x) {
    if (x < ZONE_X.desert[1]) return { x: LAMP_X.desert, power: this.desert.lamp };
    if (x < ZONE_X.pond[1]) return { x: LAMP_X.pond, power: this.pond.lamp };
    return { x: LAMP_X.jungle, power: this.jungle.lamp };
  }

  serialize() {
    return {
      time: this.time,
      lightsMode: this.lightsMode,
      roomSet: this.roomSet,
      desert: { ...this.desert },
      pond: { ...this.pond },
      jungle: { ...this.jungle },
      fertility: { ...this.fertility },
      weatherOn: this.weatherOn,
      wx: { ...this.wx },
      wxT: +this.wxT.toFixed(2),
      wxM: +this.wxM.toFixed(3),
    };
  }
  load(d) {
    this.time = d.time;
    this.lightsMode = d.lightsMode || 'auto';
    this.roomSet = d.roomSet != null ? d.roomSet : 21;
    Object.assign(this.desert, d.desert);
    Object.assign(this.pond, d.pond);
    Object.assign(this.jungle, d.jungle);
    Object.assign(this.fertility, d.fertility || {});
    this.weatherOn = d.weatherOn !== false;
    if (d.wx) Object.assign(this.wx, d.wx);
    else this.wx.change = this.time + DAY_LEN; // older saves: weather starts tomorrow
    this.wxT = d.wxT || 0;
    this.wxM = d.wxM || 0;
  }
}

// Each heat lamp hangs over the middle of the zone it's for, and stays there
// as the builder widens the tank. Its mister clips on just beside it and fans
// its spray out across the whole zone (MIST_HALF either side of the middle).
export const LAMP_X = { desert: ZONE_MID.desert, pond: ZONE_MID.pond, jungle: ZONE_MID.jungle };
export const MISTER_X = { desert: LAMP_X.desert - 100, jungle: LAMP_X.jungle - 100 };
export const MIST_HALF = {
  desert: (ZONE_X.desert[1] - ZONE_X.desert[0]) * 0.42,
  jungle: (ZONE_X.jungle[1] - ZONE_X.jungle[0]) * 0.42,
};
// The pond heater and filter stand in the water by the jungle bank.
export const HEATER_X = X(970);
export const FILTER_X = X(1016);
export { W };
