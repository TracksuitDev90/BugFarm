// Orders from Busytown: what the farm is for. Neighbours write in for the
// goods the critters make (honey, seeds, compost, silk, water lilies), and
// the keeper sends them off from the pantry. Every order earns thank-you
// stars and a basket of treats for the critters; enough stars and the town
// sends a gift you can't get any other way.
// Lives beside the zone progress in the journal, and ticks on game time,
// so letters keep arriving while you're away.
import { GOODS, GOOD_ORDER, goodWord } from '../data/goods.js';
import { NEIGHBOURS, ORDER_GIFTS } from '../data/neighbours.js';
import { SPECIES } from '../data/species.js';
import { residents, favouriteFoods, listWords } from './care.js';
import { DAY_LEN } from '../config.js';
import { rrange, rint, rpick, chance } from '../util/rng.js';

export const MAX_OPEN = 3;
const NB = {};
for (const n of NEIGHBOURS) NB[n.id] = n;

function weighted(items, weight) {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = Math.random() * total;
  for (const it of items) if ((r -= weight(it)) <= 0) return it;
  return items[items.length - 1];
}

export function neighbour(id) {
  return NB[id] || NEIGHBOURS[0];
}

// "2 jars of honey and 3 seed heads"
export function needsWords(needs) {
  return listWords(Object.entries(needs).map(([g, n]) => goodWord(g, n)));
}

export class Orders {
  constructor() {
    this.list = []; // open orders: { id, who, needs: { good: n }, why, stars, day }
    this.sent = 0;
    this.stars = 0;
    this.seq = 1;
    this.nextT = null;
    this.letters = []; // thank-you notes, newest first
    this.gifts = {}; // decor id -> true, for the gifts Busytown has sent
    this.lastWho = '';
    this.world = null;
    this.canUse = () => true;
    this.onOrder = null;
  }

  attach(world) {
    this.world = world;
    // the first letter arrives soon after the farm opens
    if (this.nextT == null || this.nextT > world.time + DAY_LEN) this.nextT = world.time + DAY_LEN * 0.06;
  }

  // Goods the farm can make right now, given who lives here (and what's
  // already in the basket).
  makeable(w) {
    const out = [];
    for (const id of GOOD_ORDER) {
      const g = GOODS[id];
      let ok = g.makers.some((sp) => w.count(sp) > 0);
      if (id === 'honey') ok = ok && !!w.hive();
      if (id === 'lily') ok = ok && w.plants.some((p) => !p.dead && p.def.kind === 'lily');
      // flowers self-pollinate a little, so any flowering plant will do
      if (id === 'seeds') ok = w.plants.some((p) => !p.dead && !p.def.aquatic && !p.def.memorial && p.flowers.length && p.def.kind !== 'strawberry');
      if ((w.pantry[id] || 0) > 0 || w.goodsOf(id) > 0) ok = true;
      if (ok) out.push(id);
    }
    return out;
  }

  // What the farm could make if a few more critters moved in.
  hintMakers(w) {
    const can = this.makeable(w);
    return GOOD_ORDER.filter((id) => !can.includes(id)).map((id) => ({ id, makers: GOODS[id].makers.map((sp) => SPECIES[sp].plural.toLowerCase()) }));
  }

  update() {
    const w = this.world;
    if (!w || this.list.length >= MAX_OPEN || w.time < this.nextT) return null;
    this.nextT = w.time + DAY_LEN * rrange(0.28, 0.5);
    const o = this.make(w);
    if (!o) return null;
    this.list.push(o);
    const nb = neighbour(o.who);
    w.addLog(`A letter from ${nb.name}, ${nb.job}, asking for ${needsWords(o.needs)}.`, 'star');
    w.events.emit('letter', { o });
    if (this.onOrder) this.onOrder(o);
    return o;
  }

  // After time away: the letters that arrived meanwhile (quietly; the
  // "while you were away" note mentions them). Returns how many.
  catchUp() {
    const w = this.world;
    let n = 0;
    while (w && this.list.length < MAX_OPEN && w.time >= this.nextT) {
      this.nextT += DAY_LEN * rrange(0.28, 0.5);
      const o = this.make(w);
      if (!o) continue;
      this.list.push(o);
      n++;
    }
    if (w && this.nextT < w.time) this.nextT = w.time + DAY_LEN * rrange(0.1, 0.3);
    return n;
  }

  make(w) {
    const can = this.makeable(w);
    if (!can.length) return null;
    const busy = this.list.map((o) => o.who).concat(this.lastWho);
    let pool = NEIGHBOURS.filter((n) => !busy.includes(n.id) && Object.keys(n.wants).some((g) => can.includes(g)));
    if (!pool.length) pool = NEIGHBOURS.filter((n) => Object.keys(n.wants).some((g) => can.includes(g)));
    if (!pool.length) return null;
    const nb = weighted(pool, (n) => Object.keys(n.wants).reduce((a, g) => a + (can.includes(g) ? n.wants[g] : 0), 0));
    const goods = Object.keys(nb.wants).filter((g) => can.includes(g));
    const first = weighted(goods, (g) => nb.wants[g]);
    const [lo, hi] = GOODS[first].batch;
    const needs = { [first]: rint(lo, hi) + (this.sent >= 6 && chance(0.35) ? 1 : 0) };
    // regulars sometimes want a little of two things
    if (this.sent >= 2 && goods.length > 1 && chance(0.35)) {
      const second = rpick(goods.filter((g) => g !== first));
      needs[second] = GOODS[second].batch[0];
    }
    const why = rpick(nb.why[first] || ['It would be such a help.']).replace('{n}', goodWord(first, needs[first]));
    let stars = 0;
    for (const [g, n] of Object.entries(needs)) stars += n * GOODS[g].value;
    return { id: this.seq++, who: nb.id, needs, why, stars, day: w.env.day };
  }

  canSend(o) {
    const p = this.world ? this.world.pantry : {};
    return Object.entries(o.needs).every(([g, n]) => (p[g] || 0) >= n);
  }
  ready() {
    return this.list.filter((o) => this.canSend(o));
  }

  // Pack the order off to Busytown. Returns what came back: the treats
  // dropped into the tank and any gifts newly earned.
  send(o) {
    const w = this.world;
    const i = this.list.indexOf(o);
    if (!w || i < 0 || !this.canSend(o)) return null;
    for (const [g, n] of Object.entries(o.needs)) w.pantry[g] -= n;
    this.list.splice(i, 1);
    this.sent++;
    const before = this.stars;
    this.stars += o.stars;
    w.stats.delivered = this.sent;
    w.stats.stars = this.stars;
    this.lastWho = o.who;
    const nb = neighbour(o.who);
    const treats = this.treats(w, o);
    const gifts = ORDER_GIFTS.filter((gf) => before < gf.stars && this.stars >= gf.stars);
    for (const gf of gifts) this.gifts[gf.decor] = true;
    this.letters.unshift({ who: o.who, day: w.env.day, text: `Thank you for the ${needsWords(o.needs)}! ${rpick(['You made my day.', 'Busytown is lucky to have your farm.', 'Your critters are the hardest workers in town.', 'I have sent some treats for your critters.'])}` });
    if (this.letters.length > 30) this.letters.length = 30;
    w.addLog(`Sent ${needsWords(o.needs)} to ${nb.name}. Busytown says thank you!`, 'star');
    w.events.emit('delivered', { o, stars: o.stars, gifts });
    // a reply usually brings another letter along before long
    this.nextT = Math.min(this.nextT, w.time + DAY_LEN * 0.12);
    return { o, nb, treats, gifts };
  }

  decline(o) {
    const i = this.list.indexOf(o);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.lastWho = o.who;
    if (this.world) this.nextT = Math.min(this.nextT, this.world.time + DAY_LEN * 0.15);
  }

  // A thank-you basket of snacks for the critters who did the work.
  treats(w, o) {
    const g = Object.keys(o.needs)[0];
    const zone = SPECIES[GOODS[g].makers[0]].zone;
    const sps = [...new Set(residents(w, zone).map((c) => c.sp))];
    const foods = favouriteFoods(sps, this.canUse, 2);
    if (!foods.length) return [];
    const mid = { desert: 280, pond: 810, jungle: 1330 }[zone];
    const out = [];
    for (let k = 0; k < 3; k++) {
      const f = foods[k % foods.length];
      const x = mid + rrange(-90, 90);
      w.addFood(f, x, zone === 'pond' ? w.terrain.waterLevel - 30 : 40, { vy: 20 });
      out.push(f);
    }
    return out;
  }

  nextGift() {
    return ORDER_GIFTS.find((gf) => this.stars < gf.stars) || null;
  }

  serialize() {
    return { list: this.list, sent: this.sent, stars: this.stars, seq: this.seq, nextT: this.nextT == null ? null : Math.round(this.nextT), letters: this.letters, gifts: this.gifts, lastWho: this.lastWho };
  }
  load(d) {
    if (!d) return;
    this.list = (d.list || []).filter((o) => o && o.needs && Object.keys(o.needs).every((g) => GOODS[g]));
    this.sent = d.sent || 0;
    this.stars = d.stars || 0;
    this.seq = d.seq || this.list.length + 1;
    this.nextT = d.nextT == null ? null : d.nextT;
    this.letters = d.letters || [];
    this.gifts = d.gifts || {};
    this.lastWho = d.lastWho || '';
  }
}
