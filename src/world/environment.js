import { DAY_LEN, ZONE_X, ZONE_BLEND, CELL, W } from '../config.js';
import { clamp, clamp01, lerp, smoothstep } from '../util/math.js';

// The tank's climate. Each zone has player-controlled equipment (heat lamps,
// misters, water heater, filter) and simulated state that drifts toward
// targets so changes feel physical rather than instant.
export class Environment {
  constructor() {
    this.time = DAY_LEN * (8 / 24); // start at 8am on day 1
    this.lightsMode = 'auto'; // auto | day | night
    this.roomTemp = 21;
    this.desert = { lamp: 0.55, mister: 0, temp: 28, moist: 0.14 };
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
    };
    this.jungle = { lamp: 0.25, mister: 0.35, temp: 24, moist: 0.62 };
    this.fertility = { desert: 0.3, jungle: 0.6 };
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

  update(dt, world) {
    this.time += dt;
    const sun = this.sun;
    const h = this.hour;
    // Room cools a little at night and warms in the afternoon.
    const daily = Math.sin(((h - 9) / 24) * Math.PI * 2);
    this.roomTemp = 20.5 + daily * 1.8 + sun * 0.6;

    const k = 1 - Math.exp(-dt / 45); // air relaxes over ~45 game seconds
    const km = 1 - Math.exp(-dt / 90);
    for (const z of [this.desert, this.jungle]) {
      const isDesert = z === this.desert;
      const tgt = this.roomTemp + z.lamp * (isDesert ? 20 : 16) + sun * 0.8 - z.mister * 3;
      z.temp += (tgt - z.temp) * k;
      const base = isDesert ? 0.06 : 0.26;
      const mTgt = clamp01(base + z.mister * (isDesert ? 0.85 : 0.72) - Math.max(0, z.temp - 24) * 0.012 + (world ? world.rainBoost(isDesert ? 'desert' : 'jungle') : 0));
      z.moist += (mTgt - z.moist) * km;
    }

    // Pond: big thermal mass, oxygen/algae/clarity chemistry.
    const p = this.pond;
    const kw = 1 - Math.exp(-dt / 160);
    const wTgt = (p.heater ? p.heaterTarget : this.roomTemp - 1) + p.lamp * 7 + sun * 0.4;
    p.temp += (wTgt - p.temp) * kw;
    const sat = clamp(1.16 - 0.018 * (p.temp - 10), 0.55, 1.05);
    const light = Math.max(sun, p.lamp * 0.8);
    const photo = (p.algae * 0.006 + this.waterPlants * 0.0012) * light;
    const resp = this.bioLoad * 0.00035 + p.algae * 0.0025 * (1 - light) + this.rotLoad * 0.0016;
    p.oxygen += ((sat - p.oxygen) * (0.004 + p.filter * 0.02) + photo - resp) * dt;
    p.oxygen = clamp(p.oxygen, 0.05, 1.15);
    p.nutrients += (this.bioLoad * 0.00006 + this.rotLoad * 0.0009 - p.nutrients * (0.0005 + p.filter * 0.0016) - p.algae * p.nutrients * 0.0015 - this.waterPlants * 0.00015 * p.nutrients) * dt;
    p.nutrients = clamp(p.nutrients, 0, 1.5);
    const algaeGrow = p.algae * (1 - p.algae) * 0.0016 * light * (0.25 + p.nutrients * 2.5) * smoothstep(8, 22, p.temp);
    const algaeEat = this.grazers * 0.00004 * p.algae + p.filter * 0.00012 * p.algae;
    p.algae = clamp(p.algae + (algaeGrow - algaeEat - p.algae * 0.00008) * dt, 0.01, 1);
    const cTgt = clamp01(1 - p.nutrients * 0.45 - p.algae * 0.35 - this.rotLoad * 0.05);
    p.clarity += (cTgt - p.clarity) * (1 - Math.exp(-dt * (0.003 + p.filter * 0.012)));

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
      if (terrain.waterAt(x, y)) return this.pond.temp;
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
      desert: { ...this.desert },
      pond: { ...this.pond },
      jungle: { ...this.jungle },
      fertility: { ...this.fertility },
    };
  }
  load(d) {
    this.time = d.time;
    this.lightsMode = d.lightsMode || 'auto';
    Object.assign(this.desert, d.desert);
    Object.assign(this.pond, d.pond);
    Object.assign(this.jungle, d.jungle);
    Object.assign(this.fertility, d.fertility || {});
  }
}

export const LAMP_X = { desert: 416, pond: 624, jungle: 1330 };
export const MISTER_X = { desert: 240, jungle: 1250 };
export { W };
