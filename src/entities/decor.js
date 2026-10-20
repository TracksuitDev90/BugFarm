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
    this.store = opts.store || 0; // bee hotel pollen / feeder state
    this.removed = false;
  }
  get name() {
    return this.def.name;
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
    return { id: this.id, t: this.type, x: Math.round(this.x), y: Math.round(this.y), f: this.flip ? 1 : 0, s: this.store };
  }
  static load(o) {
    return new Decor(o.t, o.x, o.y, { id: o.id, flip: !!o.f, store: o.s });
  }
}
