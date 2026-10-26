import { DECOR } from '../data/decor.js';
import { nextId } from './creature.js';

export class Decor {
  constructor(type, x, y, opts = {}) {
    this.kind = 'decor';
    this.id = opts.id || nextId();
    this.type = type;
    this.def = DECOR[type];
    this.x = x;
    this.y = y;
    this.flip = !!opts.flip;
    this.store = opts.store || 0; // bee hotel: pollen on its way to honey
    this.brood = opts.brood || 0; // bee hotel: pollen put by for raising young
    this.flav = opts.flav || null; // bee hotel: whose nectar is in the comb (flavour -> pollen)
    this.mp = opts.mp || 0; // bee hotel: of that, how much the master pollinators brought
    this.removed = false;
    // shelters: who calls it home, and whether it's sunk in the pond (both
    // kept up to date by the world every second)
    this.residents = [];
    this.wet = false;
    this.inN = 0; // (render side) how many are indoors right now
  }
  get name() {
    return this.def.name;
  }
  // Where critters go in and out (the door, the open end of the log...).
  get doorX() {
    const d = this.def.door;
    return this.x + (d ? d[0] : 0) * (this.flip ? -1 : 1);
  }
  get doorY() {
    const d = this.def.door;
    return this.y + (d ? d[1] : 0);
  }
  // A point on the shelter's own art (from its bottom middle), flipped with it.
  at(p) {
    return [this.x + p[0] * (this.flip ? -1 : 1), this.y + p[1]];
  }
  // Is it standing in the pond? (Judged just above the ground at its middle:
  // its base is sunk a little way into the gravel.)
  underwater(t) {
    return t.waterAt(this.x, Math.min(this.y, t.surfaceY(this.x)) - 4);
  }
  // Is a point inside this shelter?
  covers(x, y) {
    const d = this.def;
    return Math.abs(x - this.x) < d.w * 0.42 && y <= this.y + 4 && y >= this.y - d.h * 0.8;
  }
  hit(x, y) {
    const d = this.def;
    if (d.place === 'top') return Math.abs(x - this.x) < d.w / 2 + 4 && y >= this.y - 4 && y <= this.y + d.h;
    return Math.abs(x - this.x) < d.w / 2 + 4 && y <= this.y + 6 && y >= this.y - d.h - 6;
  }
  serialize() {
    const o = { id: this.id, t: this.type, x: Math.round(this.x), y: Math.round(this.y), f: this.flip ? 1 : 0, s: this.store };
    if (this.brood) o.b = this.brood;
    if (this.flav) {
      o.fl = {};
      for (const k in this.flav) if (this.flav[k] > 0.05) o.fl[k] = +this.flav[k].toFixed(2);
    }
    if (this.mp) o.mp = +this.mp.toFixed(2);
    return o;
  }
  static load(o) {
    return new Decor(o.t, o.x, o.y, { id: o.id, flip: !!o.f, store: o.s, brood: o.b, flav: o.fl, mp: o.mp });
  }
}
