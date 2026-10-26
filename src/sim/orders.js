// Orders from Busytown: what the farm is for. Neighbours write in for the
// goods the critters make (honey, seeds, compost, silk, water lilies), and
// the keeper sends them off from the pantry. Every order earns coins to
// spend at the Market, thank-you stars, a heart of friendship with whoever
// asked and a basket of treats for the critters. A good friend offers the
// farm their special ware; enough stars and the town sends a gift you can't
// get any other way.
// Lives beside the zone progress in the journal, and ticks on game time,
// so letters keep arriving while you're away.
import { GOODS, GOOD_ORDER, goodWord, flavourOf, FLAVOURS, SILK_OF, splitKey } from '../data/goods.js';
import { NEIGHBOURS, ORDER_GIFTS, STAR_FAIR, MAX_HEARTS, CRITTER_PAY, VARIETY_PAY } from '../data/neighbours.js';
import { blooms } from '../data/plants.js';
import { varietyName } from '../art/creatures.js';
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

// "2 jars of honey and 3 seed heads" (flav: good -> the flavour asked for;
// best: prize ones only)
export function needsWords(needs, flav, best) {
  return listWords(Object.entries(needs).map(([g, n]) => goodWord(g, n, flav && flav[g], best)));
}
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
// "a grown-up cricket", "a comet", "a caterpillar"
export function critterWords(cr) {
  const def = SPECIES[cr.sp];
  if (cr.stage) return an(cr.stage);
  if (cr.pal != null) return an(varietyName(cr.sp, cr.pal).toLowerCase());
  return an('grown-up ' + def.name.toLowerCase());
}
// What a letter asks for, in words.
export function orderWords(o) {
  return o.critter ? critterWords(o.critter) : needsWords(o.needs, o.flav, o.best);
}
const capital = (t) => t[0].toUpperCase() + t.slice(1);
// What a prize-hunting neighbour says.
const BEST_WHY = [
  'It\'s for the Busytown show, so only your very best will do!',
  'I\'m after a rosette this year. Prize ones only, please!',
  'It\'s a very special occasion, so it has to be the best you have.',
];
// How a critter's new home is getting on, in the thank-you.
const SETTLED = ['Everyone adores them already.', 'They\'ve made lots of new friends.', 'They have the sunniest spot by the window.', 'I\'ll send news of how they\'re getting on.'];
// Who the keeper's critters have gone to live with in Busytown is kept in
// a little list (for the Orders tab), newest first.
const MOVED_MAX = 24;

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
    this.moved = []; // critters who went to live in Busytown: { name, sp, pal, who, day }
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

  // The flavours of a good the farm could make right now (or has in the
  // basket), so a neighbour only asks for one the keeper can manage.
  flavoursMakeable(w, id) {
    const out = new Set();
    const L = w.flavours[id] || {};
    for (const k in L) if (L[k] > 0) out.add(splitKey(k)[0]);
    const alive = (p) => !p.dead && p.growth > 0.4;
    if (id === 'honey') {
      if (w.count('bee') > 0 && w.hive()) {
        out.add('wild');
        for (const p of w.plants) if (alive(p) && blooms(p.def) && FLAVOURS.honey[p.type]) out.add(p.type);
      }
      if (w.colonies.some((col) => col.kind === 'honeypot')) out.add('desert');
    } else if (id === 'seeds') {
      for (const p of w.plants) if (alive(p) && blooms(p.def) && !p.def.aquatic && p.def.kind !== 'strawberry' && FLAVOURS.seeds[p.type]) out.add(p.type);
    } else if (id === 'lily') {
      const lilies = w.plants.filter((p) => !p.dead && p.def.kind === 'lily');
      if (lilies.some((p) => !p.def.lotus)) ['white', 'pink', 'gold'].forEach((f) => out.add(f));
      if (lilies.some((p) => !p.def.lotus) && w.count('tetra') >= 3) out.add('blue');
      if (lilies.some((p) => p.def.lotus)) out.add('lotus');
    } else if (id === 'silk') {
      for (const c of w.creatures) {
        if (c.dead || (c.sp !== 'butterfly' && c.sp !== 'moth') || c.stage === 'egg') continue;
        const k = SILK_OF[c.sp + ':' + c.palIdx];
        if (k) out.add(k);
      }
    } else if (id === 'compost') {
      if (w.count('beetle') > 0) out.add('compost');
      if (w.count('worm') > 0) out.add('castings');
    }
    return [...out].filter((f) => flavourOf(id, f));
  }

  // How likely each flavour is to turn up soon: in the basket already,
  // waiting in the tank, or filling the comb.
  flavoursSoon(w, id) {
    const out = {};
    const L = w.flavours[id] || {};
    for (const k in L) if (L[k] > 0) out[splitKey(k)[0]] = 4;
    for (const g of w.goods) if (g.type === id) out[g.flav] = Math.max(out[g.flav] || 1, 3);
    if (id === 'silk') {
      // caterpillars and chrysalises: silk to come
      for (const c of w.creatures) {
        if (c.dead || (c.sp !== 'butterfly' && c.sp !== 'moth') || c.isAdult || c.stage === 'egg') continue;
        const k = SILK_OF[c.sp + ':' + c.palIdx];
        if (k) out[k] = Math.max(out[k] || 1, c.pupa ? 3 : 2);
      }
    }
    if (id === 'honey') {
      const hive = w.hive();
      if (hive) for (const [k, v] of w.combFlavour(hive)[2]) if (v > 0.35) out[k] = Math.max(out[k] || 1, 1 + v * 3);
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
    w.addLog(`A letter from ${nb.name}, ${nb.job}, asking for ${orderWords(o)}.`, 'clip');
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
    // now and then a neighbour would love to give one of the critters a home
    // (one such letter at a time)
    if (this.sent >= 3 && chance(0.22) && !this.list.some((o) => o.critter)) {
      const o = this.makeCritter(w);
      if (o) return o;
    }
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
    // Once the farm is up and running, a neighbour may ask for one flavour
    // in particular (and pays half as much again for it), or for prize
    // goods (twice as much) once the farm has made some of those.
    // (one picky letter at a time, so the rest keep coming)
    let flav = null;
    let best = false;
    const single = Object.keys(needs).length === 1;
    const picky = !this.list.some((o) => o.flav || o.best);
    const prizes = (w.stats.prizes && w.stats.prizes[first]) || 0;
    if (picky && single && this.sent >= 6 && prizes > 0 && chance(0.18)) {
      best = true;
      needs[first] = lo;
    } else if (picky && single && this.sent >= 3 && chance(0.5)) {
      const soon = this.flavoursSoon(w, first);
      // (silk only of a butterfly that's on its way: there's no telling
      // what colour a caterpillar not yet born will be)
      const fl = this.flavoursMakeable(w, first).filter((k) => first !== 'silk' || soon[k]);
      const likes = (nb.likes && nb.likes[first]) || [];
      // (only worth asking when there's a choice to make, or it's a
      // favourite; flavours on their way, or already made, come up most)
      if (fl.length >= 2 || fl.some((f) => likes.includes(f))) {
        const f = weighted(fl, (k) => (likes.includes(k) ? 2.5 : 1) * (soon[k] || 0.5) * (k === 'wild' ? 0.3 : 1));
        flav = { [first]: f };
        needs[first] = Math.min(needs[first], lo + 1);
      }
    }
    const words = goodWord(first, needs[first], flav && flav[first], best);
    let why = rpick(nb.why[first] || ['It would be such a help.']).replace('{n}', words);
    if (flav && nb.picky) {
      const f = flavourOf(first, flav[first]).name.toLowerCase();
      why = rpick(nb.picky).split('{f}').join(f).split('{F}').join(capital(f));
    } else if (best) why = rpick(BEST_WHY);
    let stars = 0;
    for (const [g, n] of Object.entries(needs)) stars += n * GOODS[g].value;
    if (best) stars *= 2;
    else if (flav) stars = Math.ceil(stars * 1.5);
    const o = { id: this.seq++, who: nb.id, needs, why, stars, coins: stars * COINS_PER_STAR, day: w.env.day, t: Math.round(w.time) };
    if (flav) o.flav = flav;
    if (best) o.best = true;
    return o;
  }

  // Critters the keeper could send for a critter letter: grown-ups (or the
  // young stage asked for) of the right kind and variety, never a queen or
  // the mail dragonfly.
  eligible(o) {
    const w = this.world;
    const cr = o.critter;
    if (!w || !cr) return [];
    return w.creatures.filter((c) => !c.dead && c.sp === cr.sp && !c.role && c.stage !== 'queen' && !c.pupa && (cr.stage ? c.stage === cr.stage : c.isAdult) && (cr.pal == null || c.palIdx === cr.pal));
  }
  // A letter asking for a critter. Only for critters the farm has a few of
  // (it never asks for the last one), and more often for crowded ones.
  makeCritter(w) {
    const busy = this.list.map((o) => o.who).concat(this.lastWho);
    const opts = [];
    for (const nb of NEIGHBOURS) {
      if (!nb.pets || busy.includes(nb.id)) continue;
      for (const [key, wt] of Object.entries(nb.pets)) {
        const [sp, stage] = key.split(':');
        if (!SPECIES[sp]) continue;
        const list = w.creatures.filter((c) => !c.dead && c.sp === sp && !c.role && (stage ? c.stage === stage : c.isAdult));
        const adults = w.creatures.filter((c) => !c.dead && c.sp === sp && c.isAdult && !c.role).length;
        // a young one only if there are a few; a grown-up only if it leaves at least two
        if (stage ? list.length < 2 : list.length < 3 || adults < 3) continue;
        const crowd = w.count(sp) >= SPECIES[sp].maxPop * 0.7 ? 3 : 1;
        opts.push({ nb, key, sp, stage, list, wt: wt * crowd });
      }
    }
    if (!opts.length) return null;
    const pick = weighted(opts, (op) => op.wt);
    const cr = { sp: pick.sp };
    if (pick.stage) cr.stage = pick.stage;
    let coins = CRITTER_PAY[pick.key] || 10;
    // a particular variety, if the farm has a spare one
    if (!pick.stage && chance(0.4)) {
      const by = {};
      for (const c of pick.list) if (varietyName(c.sp, c.palIdx)) by[c.palIdx] = (by[c.palIdx] || 0) + 1;
      const pals = Object.keys(by).filter((k) => by[k] >= 1).map(Number);
      if (pals.length) {
        cr.pal = rpick(pals);
        coins += VARIETY_PAY;
      }
    }
    const nb = pick.nb;
    const words = critterWords(cr);
    const lines = (nb.petWhy && nb.petWhy[pick.key]) || ['They would have a lovely home with me.'];
    const why = rpick(lines).split('{c}').join(words).split('{C}').join(capital(words));
    const stars = Math.max(2, Math.round(coins / COINS_PER_STAR));
    return { id: this.seq++, who: nb.id, needs: {}, critter: cr, why, stars, coins, day: w.env.day, t: Math.round(w.time) };
  }

  // Nobody waits for ever: a letter that's sat two days without the farm
  // being able to fill it is withdrawn, kindly (they found some elsewhere,
  // and they'll write again), so one hard order never holds up the rest.
  tidyLetters(w) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (this.waitLeft(o) > 0 || this.canSend(o)) continue;
      this.list.splice(i, 1);
      const nb = neighbour(o.who);
      w.addLog(`${nb.name} found ${orderWords(o)} elsewhere in the end. No harm done: they'll write again!`, 'clip');
      this.nextT = Math.min(this.nextT, w.time + DAY_LEN * 0.15);
    }
  }

  // How much longer (game seconds) a neighbour will wait for this letter.
  // (a particular flavour, or prize ones, can take a little longer)
  waitLeft(o) {
    const w = this.world;
    if (!w) return Infinity;
    const t = o.t != null ? o.t : (o.day - 1) * DAY_LEN;
    return t + DAY_LEN * (o.flav || o.best ? 3 : 2) - w.time;
  }
  // What a letter still needs from the basket: [[good, how many more]].
  missing(o) {
    const w = this.world;
    if (!w || o.critter) return [];
    const out = [];
    for (const [g, n] of Object.entries(o.needs)) {
      const have = w.basketHas(g, o.flav && o.flav[g], !!o.best);
      if (have < n) out.push([g, n - have]);
    }
    return out;
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
    const w = this.world;
    if (!w) return false;
    if (o.critter) return this.eligible(o).length > 0;
    return Object.entries(o.needs).every(([g, n]) => w.basketHas(g, o.flav && o.flav[g], !!o.best) >= n);
  }
  ready() {
    return this.list.filter((o) => this.canSend(o));
  }
  // The flavours other open letters are waiting for (so an order for any
  // honey doesn't use up the clover honey someone else asked for).
  reserved(g, except) {
    const keep = {};
    for (const o of this.list) {
      if (o === except || !o.flav || !o.flav[g]) continue;
      keep[o.flav[g]] = (keep[o.flav[g]] || 0) + o.needs[g];
    }
    return keep;
  }

  // Pack the order off to Busytown. Returns what came back: the treats
  // dropped into the tank and any gifts newly earned. A critter letter
  // needs the critter the keeper chose to send (c).
  send(o, c) {
    const w = this.world;
    const i = this.list.indexOf(o);
    if (!w || i < 0 || !this.canSend(o)) return null;
    if (o.critter && (!c || !this.eligible(o).includes(c))) return null;
    let prizes = 0;
    for (const [g, n] of Object.entries(o.needs)) prizes += Math.max(0, w.takeGoods(g, n, o.flav && o.flav[g], !!o.best, this.reserved(g, o)));
    if (o.critter) {
      this.moved.unshift({ name: c.name, sp: c.sp, pal: c.palIdx, who: o.who, day: w.env.day, master: c.memory.master || '' });
      if (this.moved.length > MOVED_MAX) this.moved.length = MOVED_MAX;
      w.sendOff(c, neighbour(o.who));
    }
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
    // (and once every gift is here, a fair now and then)
    const fairs = this.fairsAt(this.stars) - this.fairsAt(before);
    if (fairs > 0) {
      const coins = fairs * STAR_FAIR.coins;
      w.earn(coins, 'the Busytown fair');
      w.addLog(`Busytown held a fair in the farm's honour and sent ${coins} coins from the takings!`, 'coin');
      gifts.push({ fair: true, coins, text: `Busytown held a fair in your farm's honour! ${coins} coins from the takings are in your purse.` });
    }
    // paid (with a tip from old friends), then a heart of friendship, and
    // maybe a ware they'll now sell the farm
    const pay = this.pay(o);
    // prize goods on an everyday order (or a master critter) get noticed
    pay.prize = o.best ? 0 : prizes * 2 + (o.critter && c.memory.master ? 5 : 0);
    pay.total += pay.prize;
    const h0 = this.heartsOf(o.who);
    const h1 = Math.min(MAX_HEARTS, h0 + 1);
    this.hearts[o.who] = h1;
    const offers = WARES.filter((wr) => wr.who === o.who && h0 < wr.hearts && h1 >= wr.hearts);
    w.earn(pay.total, `an order for ${nb.name}`);
    const thanks = o.critter ? `${c.name} has settled in beautifully. ${rpick(SETTLED)}` : rpick(nb.thanks || ['You made my day.']);
    const what = o.critter ? `${c.name} the ${c.def.name.toLowerCase()}` : orderWords(o);
    const text = o.critter ? `Thank you for trusting me with ${c.name}! ${thanks}` : `Thank you for the ${what}! ${thanks}`;
    this.letters.unshift({ who: o.who, day: w.env.day, text });
    if (this.letters.length > 30) this.letters.length = 30;
    w.addLog(o.critter ? `${what} went to live with ${nb.name}. Busytown paid ${pay.total} coins!` : `Sent ${what} to ${nb.name}. Busytown paid ${pay.total} coins!`, 'coin');
    w.events.emit('delivered', { o, stars: o.stars, gifts, coins: pay.total, hearts: h1, prizes, c: c || null });
    // a reply usually brings another letter along (after a breather)
    this.nextT = Math.min(this.nextT, w.time + DAY_LEN * rrange(0.3, 0.45));
    return { o, nb, treats, gifts, pay, hearts: h1, offers, thanks, prizes, c: c || null };
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
      // (the van carries parcels; who moves to Busytown is the keeper's choice)
      for (const o of this.ready().filter((r) => !r.critter)) {
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
      // (always keeps one of each, and never sells a prize one)
      const plain = w.basketHas(g) - w.basketHas(g, null, true);
      const spare = Math.min(plain, (w.pantry[g] || 0) - (want[g] || 0) - 1);
      const n = Math.max(0, Math.min(left, spare));
      if (!n) continue;
      w.takeGoods(g, n, null, false, this.reserved(g, null));
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
    const plan = this.treatPlan(w, o);
    if (!plan) return [];
    const { zone, foods } = plan;
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
    const gf = ORDER_GIFTS.find((g) => this.stars < g.stars);
    if (gf) return gf;
    // every gift is here: the next fair
    return { stars: this.lastGiftStars() + (this.fairsAt(this.stars) + 1) * STAR_FAIR.every, fair: true, coins: STAR_FAIR.coins };
  }
  lastGiftStars() {
    return ORDER_GIFTS[ORDER_GIFTS.length - 1].stars;
  }
  // Fairs held by the time the farm has this many stars.
  fairsAt(stars) {
    return Math.max(0, Math.floor((stars - this.lastGiftStars()) / STAR_FAIR.every));
  }

  // Which zone's critters a thank-you basket goes to, and what's in it
  // (their favourite snacks), or null if nobody there would eat them.
  treatPlan(w, o) {
    const g = Object.keys(o.needs)[0];
    const sp = o.critter ? o.critter.sp : g ? GOODS[g].makers[0] : null;
    if (!sp || !SPECIES[sp]) return null;
    const zone = SPECIES[sp].zone;
    const sps = [...new Set(residents(w, zone).map((c) => c.sp))];
    const foods = favouriteFoods(sps, this.canUse, 2);
    return foods.length ? { zone, foods } : null;
  }

  serialize() {
    return { list: this.list, sent: this.sent, stars: this.stars, seq: this.seq, nextT: this.nextT == null ? null : Math.round(this.nextT), letters: this.letters, gifts: this.gifts, lastWho: this.lastWho, hearts: this.hearts, sold: this.sold, standDay: this.standDay, vanDay: this.vanDay, moved: this.moved };
  }
  load(d) {
    if (!d) return;
    this.list = (d.list || []).filter((o) => o && o.needs && Object.keys(o.needs).every((g) => GOODS[g]) && (!o.critter || SPECIES[o.critter.sp]) && (Object.keys(o.needs).length || o.critter));
    this.moved = d.moved || [];
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
