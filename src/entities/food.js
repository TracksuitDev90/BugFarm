// Food items: fall, float, sink, get nibbled, and slowly spoil. Spoiling fruit
// attracts fruit flies; spoiling food in the pond clouds the water.
import { FOODS } from '../data/foods.js';
import { DAY_LEN, W, H } from '../config.js';
import { clamp } from '../util/math.js';
import { rrange } from '../util/rng.js';
import { nextId } from './creature.js';
import { breeze } from '../world/breeze.js';

const CUR = [0, 0];

// Room to drift into: deep, open water a little way on in that direction
// (so nothing gets washed up into the shallows or against the rocks, out
// of the fishes' reach).
function openWater(t, x, y, dir) {
  const ahead = x + dir * 10;
  return t.surfaceY(ahead) - t.waterLevel > 16 && t.waterAt(x, y) && t.waterAt(ahead, y) && t.waterAt(ahead, y + 8);
}

export class Food {
  constructor(type, x, y, opts = {}) {
    this.kind = 'food';
    this.id = opts.id || nextId();
    this.type = type;
    this.def = FOODS[type];
    this.x = x;
    this.y = y;
    this.vx = opts.vx != null ? opts.vx : rrange(-12, 12);
    this.vy = opts.vy || 0;
    this.amount = opts.amount != null ? opts.amount : this.def.amount;
    // a treat can be a smaller portion than a full serving; bites are
    // measured against what was put down
    this.max = opts.max != null ? opts.max : this.def.amount;
    this.shown = this.amount; // eases toward amount so each bite shrinks smoothly
    this.biteT = 0; // chomp wobble
    this.biteSide = opts.biteSide || 0; // which side the bites come from
    this.fresh = opts.fresh != null ? opts.fresh : 1;
    this.age = opts.age || 0;
    this.state = opts.state || 'fall';
    this.inWater = !!opts.inWater;
    this.floatT = opts.floatT != null ? opts.floatT : this.def.float || 0;
    this.gone = false;
    this.flyT = rrange(0.08, 0.25);
    this.rotSince = 0;
    this.angle = rrange(-0.3, 0.3);
    this.px = x;
    this.py = y;
    // who it was dropped for (it falls their way), who's carrying it (state
    // 'held'), whose stash it is, and who it's a present for
    this.aim = null;
    this.holder = null;
    this.owner = opts.owner || 0;
    this.giftFor = 0;
    this.giftBy = '';
  }
  get name() {
    return this.def.name;
  }
  // Lying (or floating) somewhere a critter could take a bite.
  get loose() {
    return this.state !== 'fall' && this.state !== 'held';
  }
  // Let go of it: it drops from wherever it is.
  drop(w) {
    this.holder = null;
    this.state = w.terrain.waterAt(this.x, this.y) ? 'sink' : 'fall';
    this.inWater = this.state === 'sink';
    this.vx = 0;
    this.vy = 0;
  }
  get rot() {
    return this.fresh > 0.35 ? 0 : this.fresh > 0 ? 1 : 2;
  }
  get tags() {
    if (this.fresh <= 0) return ['decay'];
    if (this.fresh < 0.35) return this.def.tags.concat(['decay']);
    return this.def.tags;
  }
  get scale() {
    return 0.5 + 0.5 * Math.sqrt(Math.max(0, this.shown / this.max));
  }
  // 0 = untouched .. 4 = down to the last crumb (picks the bitten sprite)
  get bites() {
    const e = 1 - this.shown / this.max;
    return e < 0.04 ? 0 : Math.min(4, 1 + Math.floor(e * 4.4));
  }

  update(dt, w) {
    const t = w.terrain;
    this.px = this.x;
    this.py = this.y;
    this.shown += (this.amount - this.shown) * Math.min(1, dt * 4);
    if (this.biteT > 0) this.biteT -= dt;
    const aim = this.aim && !this.aim.dead && !this.aim.removed ? this.aim : (this.aim = null);
    switch (this.state) {
      case 'held': {
        // in a critter's mouth (or jaws, or arms)
        const h = this.holder;
        if (!h || h.dead || h.removed || h.carrying !== this) {
          this.drop(w);
          break;
        }
        this.x = clamp(h.x + h.facing * h.size * 0.42, 4, W - 4);
        this.y = h.y - h.size * 0.08;
        this.inWater = t.waterAt(this.x, this.y);
        break;
      }
      case 'fall': {
        this.vy = Math.min(420, this.vy + 520 * dt);
        // (the keeper's aim: it drifts over toward whoever it was meant for)
        if (aim) this.vx += (clamp((aim.x - this.x) * 3, -90, 90) - this.vx) * Math.min(1, dt * 6);
        let nx = this.x + this.vx * dt;
        if (nx < 6 || nx > W - 6) {
          this.vx = -this.vx * 0.3;
          nx = clamp(nx, 6, W - 6);
        }
        this.x = nx;
        this.y += this.vy * dt;
        if (t.waterAt(this.x, this.y)) {
          this.inWater = true;
          // flakes float (a hungry fish comes up for them), unless they
          // were meant for a snail or a shrimp down on the bottom
          if (aim && aim.mode !== 'swim' && aim.y > this.y + 40) this.floatT = Math.min(this.floatT, 0.8);
          this.state = this.floatT > 0 ? 'float' : 'sink';
          w.splash(this.x, t.waterSurfY(this.x), 0.5);
          w.sound('plop', this.x, this.y);
          w.addNovelty(this.x, this.y + 20, 0.8);
          w.foodArrived(this);
          this.vy = 0;
          break;
        }
        const gy = t.surfaceY(this.x);
        if (this.y >= gy - 1 || t.solidAt(this.x, this.y + 1)) {
          this.y = Math.min(this.y, gy);
          if (t.solidAt(this.x, this.y)) this.y = gy;
          this.state = 'rest';
          this.vx = 0;
          this.aim = null;
          w.dust(this.x, this.y, 2);
          w.sound('tap', this.x, this.y);
          w.addNovelty(this.x, this.y, 0.7);
          w.foodArrived(this);
        }
        break;
      }
      case 'float': {
        this.y = t.waterSurfY(this.x) + 1 + Math.sin(w.time * 1.5 + this.id) * 0.8;
        // flakes drift a little on the pond's slow loop and the breeze (but
        // never up into the shallows, where the fish couldn't reach them)
        breeze.current(this.x, this.y, CUR);
        const nx = this.x + (CUR[0] * 0.25 + Math.sin(w.time * 0.3 + this.id) * 3) * dt;
        if (openWater(t, nx, this.y + 2, nx < this.x ? -1 : 1)) this.x = nx;
        this.floatT -= dt;
        if (!t.waterAt(this.x, this.y + 2) || this.floatT <= 0) this.state = t.waterAt(this.x, this.y + 2) ? 'sink' : 'fall';
        break;
      }
      case 'sink': {
        breeze.current(this.x, this.y, CUR);
        this.y += (16 + CUR[1] * 0.3) * dt;
        let sway = CUR[0] * 0.3 + Math.sin(w.time * 1.1 + this.id) * 4;
        // sinking toward whoever it was dropped for
        if (aim) sway += clamp((aim.x - this.x) * 1.5, -24, 24);
        const nx = this.x + sway * dt;
        if (openWater(t, nx, this.y, nx < this.x ? -1 : 1)) this.x = nx;
        const gy = t.surfaceY(this.x);
        if (this.y >= gy - 1) {
          this.y = gy;
          this.state = 'rest';
        }
        if (!t.waterAt(this.x, this.y)) this.state = 'fall';
        break;
      }
      case 'rest': {
        const gy = t.surfaceY(this.x);
        if (gy > this.y + 2) {
          this.state = 'fall';
          this.vy = 0;
        } else this.y = gy;
        this.inWater = t.waterAt(this.x, this.y - 2);
        break;
      }
      default:
        break;
    }
    // spoiling: faster when warm, damp, or soaking in the pond
    this.age += dt;
    const T = this.inWater ? w.env.pond.temp : w.env.tempAt(this.x, this.y - 2, null);
    const M = this.inWater ? 1 : w.env.moistAt(this.x, this.y, null);
    const rate = (1 + Math.max(0, T - 18) * 0.06) * (0.7 + M * 0.6) * (this.inWater ? 1.6 : 1);
    const before = this.fresh;
    this.fresh -= (dt / (this.def.decay * DAY_LEN)) * rate * 0.65;
    if (before > 0.35 && this.fresh <= 0.35) w.events.emit('foodOverripe', { food: this });
    if (before > 0 && this.fresh <= 0) w.events.emit('foodRotten', { food: this });
    if (this.inWater) {
      const spoil = this.fresh < 0.35 ? 0.35 - this.fresh : 0;
      w.env.rotLoad += this.amount * (0.15 + spoil * 2.5) * (this.def.cloudy || 1);
    } else if (this.def.rot === 'flies' && this.fresh < 0.4 && this.fresh > -0.5) {
      this.flyT -= dt / DAY_LEN;
      if (this.flyT <= 0) {
        this.flyT = rrange(0.15, 0.35);
        w.spawnFruitFly(this);
      }
    }
    if (this.fresh < 0) this.rotSince += dt;
    if (this.amount <= 0.001) {
      // the last bite: let it shrink away, then sweep up the crumbs
      if (this.shown <= this.max * 0.08) {
        w.dust(this.x, this.y, 3);
        w.removeFood(this);
      }
      return;
    }
    if (this.fresh < -0.9) {
      // fully broken down into the soil
      const z = w.env.zoneAt(this.x);
      if (w.env.fertility[z] != null) w.env.fertility[z] = Math.min(1.2, w.env.fertility[z] + this.amount * 0.05);
      if (this.inWater) w.env.pond.nutrients = Math.min(1.5, w.env.pond.nutrients + this.amount * 0.03);
      w.removeFood(this);
    }
  }

  serialize() {
    return {
      id: this.id,
      t: this.type,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      a: +this.amount.toFixed(3),
      f: +this.fresh.toFixed(3),
      ag: Math.round(this.age),
      s: this.state === 'fall' || this.state === 'held' ? 'rest' : this.state,
      w: this.inWater ? 1 : 0,
      ft: Math.round(this.floatT),
      m: this.max !== this.def.amount ? +this.max.toFixed(3) : undefined,
      bs: this.biteSide || undefined,
      ow: this.owner || undefined,
    };
  }
  static load(o) {
    return new Food(o.t, o.x, o.y, { id: o.id, amount: o.a, max: o.m, biteSide: o.bs, fresh: o.f, age: o.ag, state: o.s, inWater: !!o.w, floatT: o.ft, vx: 0, owner: o.ow });
  }
}

export { H };
