// Food items: fall, float, sink, get nibbled, and slowly spoil. Spoiling fruit
// attracts fruit flies; spoiling food in the pond clouds the water.
import { FOODS } from '../data/foods.js';
import { DAY_LEN, W, H } from '../config.js';
import { clamp } from '../util/math.js';
import { rrange } from '../util/rng.js';
import { nextId } from './creature.js';

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
    this.max = this.def.amount;
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
  }
  get name() {
    return this.def.name;
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
    return 0.45 + 0.55 * Math.sqrt(Math.max(0, this.amount / this.max));
  }

  update(dt, w) {
    const t = w.terrain;
    this.px = this.x;
    this.py = this.y;
    switch (this.state) {
      case 'fall': {
        this.vy = Math.min(420, this.vy + 520 * dt);
        let nx = this.x + this.vx * dt;
        if (nx < 6 || nx > W - 6) {
          this.vx = -this.vx * 0.3;
          nx = clamp(nx, 6, W - 6);
        }
        this.x = nx;
        this.y += this.vy * dt;
        if (t.waterAt(this.x, this.y)) {
          this.inWater = true;
          this.state = this.floatT > 0 ? 'float' : 'sink';
          w.splash(this.x, t.waterLevel, 0.5);
          w.sound('plop', this.x, this.y);
          w.addNovelty(this.x, this.y + 20, 0.8);
          this.vy = 0;
          break;
        }
        const gy = t.surfaceY(this.x);
        if (this.y >= gy - 1 || t.solidAt(this.x, this.y + 1)) {
          this.y = Math.min(this.y, gy);
          if (t.solidAt(this.x, this.y)) this.y = gy;
          this.state = 'rest';
          this.vx = 0;
          w.dust(this.x, this.y, 2);
          w.sound('tap', this.x, this.y);
          w.addNovelty(this.x, this.y, 0.7);
        }
        break;
      }
      case 'float': {
        this.y = t.waterLevel + 1 + Math.sin(w.time * 1.5 + this.id) * 0.8;
        this.x += Math.sin(w.time * 0.3 + this.id) * 3 * dt;
        this.floatT -= dt;
        if (!t.waterAt(this.x, this.y + 2) || this.floatT <= 0) this.state = t.waterAt(this.x, this.y + 2) ? 'sink' : 'fall';
        break;
      }
      case 'sink': {
        this.y += 16 * dt;
        this.x += Math.sin(w.time * 1.1 + this.id) * 4 * dt;
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
    if (this.fresh < -0.9 || this.amount <= 0.001) {
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
      s: this.state === 'fall' ? 'rest' : this.state,
      w: this.inWater ? 1 : 0,
      ft: Math.round(this.floatT),
    };
  }
  static load(o) {
    return new Food(o.t, o.x, o.y, { id: o.id, amount: o.a, fresh: o.f, age: o.ag, state: o.s, inWater: !!o.w, floatT: o.ft, vx: 0 });
  }
}

export { H };
