// Orders from Busytown: what the farm is for. Neighbours write in for the
// goods the critters make (honey, seeds, compost, silk, water lilies), and
// the keeper sends them off from the pantry. Every order earns coins to
// spend at the Market, thank-you stars, a heart of friendship with whoever
// asked and a basket of treats for the critters. A good friend offers the
// farm their special ware; enough stars and the town sends a gift you can't
// get any other way.
// Lives beside the zone progress in the journal, and ticks on game time,
// so letters keep arriving while you're away.
import { GOODS, GOOD_ORDER, goodWord } from '../data/goods.js';
import { NEIGHBOURS, ORDER_GIFTS, MAX_HEARTS } from '../data/neighbours.js';
import { WARES, COINS_PER_STAR } from '../data/market.js';
import { SPECIES } from '../data/species.js';
import { residents, favouriteFoods, listWords } from './care.js';
import { DAY_LEN, ZONE_MID } from '../config.js';
import { rrange, rint, rpick, chance } from '../util/rng.js';

export const MAX_OPEN = 3;
// How many letters can wait at once, and how soon the next one comes.
// A new farm hears from Busytown gently: a good while between letters,
// and no more than two waiting (so one that can't be done yet doesn't hold
// up the rest) until the keeper has the hang of sending them. (The notice
// board and the mailbox make room for more; the farm sign brings them a
// little sooner.)
function maxOpen(w, sent = 99) {
  const base = sent < 4 ? 2 : MAX_OPEN;
  if (!w) return base;
  // (a farm on the notice board has asked for more letters)
  return (w.owns('noticeBoard') ? 5 : base) + (w.decor.some((d) => d.type === 'mailbox') ? 1 : 0);
}
function gap(w, sent = 99) {
  const days = sent < 3 ? rrange(0.6, 0.9) : sent < 8 ? rrange(0.45, 0.7) : rrange(0.35, 0.55);
  if (!w) return DAY_LEN * days;
  return DAY_LEN * days * (w.owns('noticeBoard') ? 0.5 : 1) * (w.decor.some((d) => d.type === 'sign') ? 0.85 : 1);
}
// The first ware a neighbour offers, and the hearts it takes.
function firstWare(who) {
  let best = null;
  for (const wr of WARES) if (wr.who === who && (!best || wr.hearts < best.hearts)) best = wr;
  return best;
}
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
    this.hearts = {}; // neighbour id -> friendship hearts (orders sent to them)
    this.sold = 0; // goods the farm stand has sold
    this.standDay = 0; // the day the farm stand last opened
    this.vanDay = 0; // the day the van last went out
    this.world = null;
    this.canUse = () => true;
    this.onOrder = null;
  }

  attach(world) {
    this.world = world;
    // the first letter arrives once the farm has had a little while to settle
    if (this.nextT == null || this.nextT > world.time + DAY_LEN) this.nextT = world.time + DAY_LEN * 0.3;
  }

  // Goods the farm can make right now, given who lives here (and what's
  // already in the basket).
  makeable(w) {
    const out = [];
    for (const id of GOOD_ORDER) {
      const g = GOODS[id];
      let ok = g.makers.some((sp) => sp !== 'ant' && w.count(sp) > 0);
      if (id === 'honey') ok = (w.count('bee') > 0 && !!w.hive()) || w.colonies.some((col) => col.kind === 'honeypot');
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
    return GOOD_ORDER.filter((id) => !can.includes(id)).map((id) => ({ id, makers: GOODS[id].makers.map((sp) => (sp === 'ant' ? 'honeypot ants' : SPECIES[sp].plural.toLowerCase())) }));
  }

  update() {
    const w = this.world;
    if (!w) return null;
    this.errands(w);
    this.tidyLetters(w);
    if (this.list.length >= maxOpen(w, this.sent) || w.time < this.nextT) return null;
    this.nextT = w.time + gap(w, this.sent);
    const o = this.make(w);
    if (!o) return null;
    this.list.push(o);
    const nb = neighbour(o.who);
    w.addLog(`A letter from ${nb.name}, ${nb.job}, asking for ${needsWords(o.needs)}.`, 'clip');
    w.events.emit('letter', { o });
    if (this.onOrder) this.onOrder(o);
    return o;
  }

  // After time away: the letters that arrived meanwhile (quietly; the
  // "while you were away" note mentions them). Returns how many.
  catchUp() {
    const w = this.world;
    let n = 0;
    if (w) {
      this.errands(w);
      this.tidyLetters(w);
    }
    while (w && this.list.length < maxOpen(w, this.sent) && w.time >= this.nextT) {
      this.nextT += gap(w, this.sent);
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
    // neighbours who haven't yet offered the farm their special ware write a
    // little more often, so every friendship gets its chance to grow
    // A new farm's first few letters ask for something it can manage soon:
    // goods already in the basket (or waiting in the tank) first, the quick
    // ones (seeds, compost) next, and not yet the slow ones (silk, honey and
    // lilies take a few days to come).
    const easy = (g) => (this.sent >= 3 ? 1 : (w.pantry[g] || 0) > 0 || w.goodsOf(g) > 0 ? 4 : GOODS[g].value <= 1 ? 1 : 0.15);
    const nb = weighted(pool, (n) => Object.keys(n.wants).reduce((a, g) => a + (can.includes(g) ? n.wants[g] * easy(g) : 0), 0) * (this.waiting(n.id) ? 1.6 : 1));
    const goods = Object.keys(nb.wants).filter((g) => can.includes(g));
    const first = weighted(goods, (g) => nb.wants[g] * easy(g));
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
    return { id: this.seq++, who: nb.id, needs, why, stars, coins: stars * COINS_PER_STAR, day: w.env.day, t: Math.round(w.time) };
  }

  // Nobody waits for ever: a letter that's sat two days without the farm
  // being able to fill it is withdrawn, kindly (they found some elsewhere,
  // and they'll write again), so one hard order never holds up the rest.
  tidyLetters(w) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      const t = o.t != null ? o.t : (o.day - 1) * DAY_LEN;
      if (w.time - t < DAY_LEN * 2 || this.canSend(o)) continue;
      this.list.splice(i, 1);
      const nb = neighbour(o.who);
      w.addLog(`${nb.name} found ${needsWords(o.needs)} elsewhere in the end. No harm done: they'll write again!`, 'clip');
      this.nextT = Math.min(this.nextT, w.time + DAY_LEN * 0.15);
    }
  }

  // Friendship with a neighbour, 0..MAX_HEARTS.
  heartsOf(who) {
    return this.hearts[who] || 0;
  }
  // Is this neighbour's first special ware still waiting on friendship?
  waiting(who) {
    const wr = firstWare(who);
    return !!wr && this.heartsOf(who) < wr.hearts;
  }
  // What an order pays when it's sent: its coins, plus a tip from good
  // friends, the notice board's bonus and the axolotl's fan club.
  pay(o) {
    const w = this.world;
    const base = o.coins != null ? o.coins : o.stars * COINS_PER_STAR;
    const tip = Math.min(4, this.heartsOf(o.who));
    const board = w && w.owns('noticeBoard') ? 2 : 0;
    const fans = w && w.count('axolotl') > 0 ? 3 : 0;
    return { base, tip, board, fans, total: base + tip + board + fans };
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
    // paid (with a tip from old friends), then a heart of friendship, and
    // maybe a ware they'll now sell the farm
    const pay = this.pay(o);
    const h0 = this.heartsOf(o.who);
    const h1 = Math.min(MAX_HEARTS, h0 + 1);
    this.hearts[o.who] = h1;
    const offers = WARES.filter((wr) => wr.who === o.who && h0 < wr.hearts && h1 >= wr.hearts);
    w.earn(pay.total, `an order for ${nb.name}`);
    const thanks = rpick(nb.thanks || ['You made my day.']);
    this.letters.unshift({ who: o.who, day: w.env.day, text: `Thank you for the ${needsWords(o.needs)}! ${thanks}` });
    if (this.letters.length > 30) this.letters.length = 30;
    w.addLog(`Sent ${needsWords(o.needs)} to ${nb.name}. Busytown paid ${pay.total} coins!`, 'coin');
    w.events.emit('delivered', { o, stars: o.stars, gifts, coins: pay.total, hearts: h1 });
    // a reply usually brings another letter along (after a breather)
    this.nextT = Math.min(this.nextT, w.time + DAY_LEN * rrange(0.3, 0.45));
    return { o, nb, treats, gifts, pay, hearts: h1, offers, thanks };
  }

  // The town's gifts at work. Each evening the farm stand sells a few
  // goods nobody has asked for; each morning the delivery van posts any
  // order that's ready (the keeper sees the thank-yous in the log).
  errands(w) {
    const h = w.env.hour;
    const day = w.env.day;
    const has = (type) => w.decor.some((d) => d.type === type);
    if (h >= 17 && h < 20 && this.standDay !== day && has('farmStand')) {
      this.standDay = day;
      this.sellSpares(w);
    }
    if (h >= 9 && h < 12 && this.vanDay !== day && has('deliveryVan')) {
      this.vanDay = day;
      const sent = [];
      for (const o of this.ready()) {
        const r = this.send(o);
        if (r) sent.push(r);
      }
      if (sent.length) {
        w.addLog(`The delivery van took ${sent.length === 1 ? `${neighbour(sent[0].o.who).name}'s order` : `${sent.length} orders`} into Busytown.`, 'coin');
        w.events.emit('van', { sent });
      }
    }
  }
  // Goods in the basket beyond what the open letters need: the stand sells
  // up to three of them (the oldest kind of surplus first), for two coins a
  // star.
  sellSpares(w) {
    const want = {};
    for (const o of this.list) for (const [g, n] of Object.entries(o.needs)) want[g] = (want[g] || 0) + n;
    let left = 3;
    let coins = 0;
    const sold = {};
    for (const g of GOOD_ORDER) {
      const spare = (w.pantry[g] || 0) - (want[g] || 0) - 1; // (always keeps one of each)
      const n = Math.max(0, Math.min(left, spare));
      if (!n) continue;
      w.pantry[g] -= n;
      left -= n;
      sold[g] = n;
      coins += n * GOODS[g].value * 2;
      if (!left) break;
    }
    if (!coins) return 0;
    this.sold += 3 - left;
    const stand = w.decor.find((d) => d.type === 'farmStand');
    w.earn(coins, 'the farm stand', stand ? stand.x : null, stand ? stand.y - 30 : null);
    w.addLog(`The farm stand sold ${needsWords(sold)} for ${coins} coins.`, 'coin');
    return coins;
  }

  decline(o) {
    const i = this.list.indexOf(o);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.lastWho = o.who;
    if (this.world) this.nextT = Math.min(this.nextT, this.world.time + DAY_LEN * 0.3);
  }

  // A thank-you basket of snacks for the critters who did the work.
  treats(w, o) {
    const g = Object.keys(o.needs)[0];
    const zone = SPECIES[GOODS[g].makers[0]].zone;
    const sps = [...new Set(residents(w, zone).map((c) => c.sp))];
    const foods = favouriteFoods(sps, this.canUse, 2);
    if (!foods.length) return [];
    const mid = ZONE_MID[zone];
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
    return { list: this.list, sent: this.sent, stars: this.stars, seq: this.seq, nextT: this.nextT == null ? null : Math.round(this.nextT), letters: this.letters, gifts: this.gifts, lastWho: this.lastWho, hearts: this.hearts, sold: this.sold, standDay: this.standDay, vanDay: this.vanDay };
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
    this.hearts = d.hearts || {};
    this.sold = d.sold || 0;
    this.standDay = d.standDay || 0;
    this.vanDay = d.vanDay || 0;
    // (letters written before coins existed pay by their stars)
    for (const o of this.list) if (o.coins == null) o.coins = o.stars * COINS_PER_STAR;
  }
}
