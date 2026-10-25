// A good waiting in the tank to be collected: a jar of honey on the bee
// hotel, a ball of compost a beetle buried, worm castings, an empty silk
// chrysalis, a ripe seed head, a water lily in bloom. Left alone, it still
// does some good when its time is up: seeds sow themselves and compost
// melts into the soil.
import { GOODS, PLAIN, flavourOf } from '../data/goods.js';
import { DAY_LEN } from '../config.js';
import { nextId } from './creature.js';

export class Good {
  constructor(type, x, y, opts = {}) {
    this.kind = 'good';
    this.id = opts.id || nextId();
    this.type = type;
    this.def = GOODS[type];
    this.x = x;
    this.y = y;
    this.age = opts.age || 0;
    this.life = opts.life != null ? opts.life : this.def.life * DAY_LEN;
    // where it came from: the plant that grew it (seeds, lilies) or the
    // decoration it sits on (honey on the bee hotel)
    this.src = opts.src || 0;
    this.look = opts.look || ''; // 'castings' for worm-made compost
    this.plant = opts.plant || ''; // plant type a seed head would sow
    this.fi = opts.fi || 0; // which flower of its plant it grew from
    // what it tastes of, or what colour it is (see FLAVOURS), and whether
    // it's a prize one (made by a master, or grown somewhere just right)
    this.flav = opts.flav && flavourOf(type, opts.flav) ? opts.flav : PLAIN[type] || '';
    this.prize = !!opts.prize;
    this.gone = false;
    this.claim = 0; // the mail dragonfly on its way to fetch it
  }

  get name() {
    const f = flavourOf(this.type, this.flav);
    return (this.prize ? 'prize ' : '') + (f ? f.one || this.def.oneF.replace('{f}', f.adj) : this.def.one);
  }

  update(dt, w) {
    this.age += dt;
    if (this.type === 'lily') this.y = w.terrain.waterLevel - 1; // it floats
    else if (this.type === 'seeds' && this.src) {
      // a seed head stays on its flower as the plant sways and grows
      const p = w.plants.find((q) => q.id === this.src);
      const slot = p && p.shape.slots.find((s) => s.kind === 'flower' && s.i === this.fi);
      if (slot) [this.x, this.y] = p.slotWorld(slot, w.time);
    }
    if (this.age >= this.life) w.goodExpired(this);
  }

  serialize() {
    const o = { id: this.id, t: this.type, x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10, a: Math.round(this.age), l: Math.round(this.life) };
    if (this.src) o.s = this.src;
    if (this.look) o.k = this.look;
    if (this.plant) o.p = this.plant;
    if (this.fi) o.f = this.fi;
    if (this.flav) o.v = this.flav;
    if (this.prize) o.z = 1;
    return o;
  }

  static load(o) {
    return new Good(o.t, o.x, o.y, { id: o.id, age: o.a, life: o.l, src: o.s, look: o.k, plant: o.p, fi: o.f, flav: o.v, prize: !!o.z });
  }
}
