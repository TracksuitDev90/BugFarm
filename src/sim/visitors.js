// Visitors from the garden outside (see data/visitors.js): who comes, when,
// what they offer and what happens when the keeper says yes. Lives in the
// journal beside the orders, and ticks on game time.
//
// A happy, lively tank gets visitors more often, and who comes depends on
// what the keeper has built. A visitor stays a few hours. A while after
// arriving they either leave a present (something for the critters to
// wear, or a few coins on later visits) or make an offer to change the
// tank for the better (build a home, dig the soil, sow some flowers). An
// offer always waits for the keeper's yes; if they go home before the
// keeper answers, they leave it as a note in the Visitors' Book.
// While the keeper is away (really away: the game closed) visitors still
// come by now and then, and leave their presents and notes.
import { VISITORS, VISITOR_ORDER, VISIT_DAYS, VISIT_GAP, visitorName } from '../data/visitors.js';
import { PLANTS } from '../data/plants.js';
import { residents } from './care.js';
import { DAY_LEN, ZONE_MID } from '../config.js';
import { rrange, rint, rpick, chance } from '../util/rng.js';
import { clamp01 } from '../util/math.js';

const ZONES = ['desert', 'pond', 'jungle'];
const MAX_NOTES = 3;

// How happy and lively the tank is, 0..1: the critters' comfort, tummies
// and health, how the plants are doing and how clear the pond is. Visitors
// love a happy tank.
export function tankCheer(w) {
  let n = 0;
  let sum = 0;
  for (const z of ZONES) {
    for (const c of residents(w, z)) {
      if (!c.isAdult && c.stage !== 'nymph') continue;
      n++;
      sum += clamp01(c.comfort) * (1 - Math.max(0, c.hunger - 0.4)) * clamp01(c.health);
    }
  }
  const critters = n ? sum / n : 0;
  let pn = 0;
  let ps = 0;
  for (const p of w.plants) {
    if (p.def.memorial) continue;
    pn++;
    ps += p.dead ? 0 : p.health;
  }
  const plants = pn ? ps / pn : 0;
  // a few kinds of critter make it lively
  const kinds = new Set(w.creatures.filter((c) => !c.dead && c.sp !== 'fruitfly').map((c) => c.sp)).size;
  const lively = Math.min(1, kinds / 8);
  return clamp01(critters * 0.55 + plants * 0.2 + clamp01(w.env.pond.clarity) * 0.1 + lively * 0.15);
}

export class Visitors {
  constructor() {
    this.book = {}; // visitor id -> { n: visits, yes: offers taken up, first, last (days) }
    this.notes = []; // offers left behind: { id, offer, day }
    this.nextT = null;
    this.lastId = '';
    this.letterT = -1e9;
    this.world = null;
    this.offs = [];
    // the UI's hooks: a visitor has come, has an idea, or left a present
    this.onArrive = null;
    this.onOffer = null;
    this.onGift = null;
    this.canUse = () => true;
  }

  attach(world) {
    for (const off of this.offs) off();
    this.offs = [];
    this.world = world;
    // nobody comes until a new farm has had a couple of days to settle
    if (this.nextT == null) this.nextT = world.time + DAY_LEN * 2;
    this.offs.push(world.events.on('visitorLeft', (d) => this.left(d.v)));
    // (a visitor doesn't knock while the keeper is reading a new letter)
    this.offs.push(world.events.on('letter', () => (this.letterT = world.time)));
  }

  // The visitor in the tank right now, if any.
  current() {
    const w = this.world;
    return (w && w.visitors.find((v) => v.state !== 'gone')) || null;
  }

  update() {
    const w = this.world;
    if (!w) return;
    const v = this.current();
    if (v) {
      this.tend(v);
      return;
    }
    if (w.awayMode || w.time < this.nextT || w.time - this.letterT < 50) return;
    // look in again in an hour
    this.nextT = w.time + DAY_LEN / 24;
    const cheer = tankCheer(w);
    if (!chance(0.06 * cheer ** 1.5)) return;
    const id = this.choose(w, cheer, false);
    if (id) this.arrive(id);
  }

  // Who'd like to come right now (weighted by how welcome they'd feel,
  // and whether the keeper has met them yet).
  choose(w, cheer, anyTime) {
    const opts = [];
    for (const id of VISITOR_ORDER) {
      const def = VISITORS[id];
      if (cheer < def.cheer) continue;
      if (!anyTime && def.when === 'day' && w.env.isNight) continue;
      if (!anyTime && def.when === 'night' && !w.env.isNight) continue;
      let want = 0;
      try {
        want = def.want(w);
      } catch (e) {
        want = 0;
      }
      if (!(want > 0)) continue;
      opts.push([id, want * (this.book[id] ? 1 : 2) * (id === this.lastId ? 0.25 : 1)]);
    }
    if (!opts.length) return null;
    let total = 0;
    for (const o of opts) total += o[1];
    let r = Math.random() * total;
    for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
    return opts[opts.length - 1][0];
  }

  arrive(id) {
    const w = this.world;
    const v = w.addVisitor(id);
    v.stay = DAY_LEN * rrange(VISIT_DAYS[0], VISIT_DAYS[1]);
    const b = this.entry(id);
    const first = !b.n;
    b.n++;
    b.last = w.env.day;
    if (!b.first) b.first = w.env.day;
    this.lastId = id;
    // (logged quietly: the visitor's own card says hello)
    w.addLog(`${visitorName(id)} has come to visit the ${VISITORS[id].zone}!`, 'paw');
    w.events.emit('visitor', { v, first });
    if (this.onArrive) this.onArrive(v, first);
    return v;
  }

  entry(id) {
    return this.book[id] || (this.book[id] = { n: 0, yes: 0, first: 0, last: 0 });
  }

  // A visit going on: time for their present or their idea, or time to go.
  tend(v) {
    const w = this.world;
    if (v.state === 'stay' && !v.asked && v.age > 110 && w.time - this.letterT > 50) {
      v.asked = true;
      const gift = this.giftFor(v.type);
      if (gift.ask) {
        v.offer = gift;
        v.waiting = true;
        v.emote('!', 3);
        if (this.onOffer) this.onOffer(v);
      } else this.give(v.type, gift, v);
    }
    // home time (an unanswered idea keeps them a little longer)
    if (v.state === 'stay' && v.age > v.stay && (!v.waiting || v.age > v.stay + DAY_LEN * 0.3)) {
      if (v.waiting) this.leaveNote(v.type, v.offer);
      v.leave(w);
      w.addLog(`${visitorName(v.type)} waved goodbye and went home.`, 'leaf');
    }
  }

  left() {
    const w = this.world;
    if (w) this.nextT = w.time + VISIT_GAP * rrange(1, 1.6);
  }

  // What a visitor brings this time: their first visit's gift (and again
  // while there's room for it), otherwise a little present of coins.
  giftFor(id) {
    const w = this.world;
    const def = VISITORS[id];
    const g = def.gift;
    const yes = this.entry(id).yes;
    if (g.kind === 'outfit') {
      if (!w.wardrobeHas(g.item)) return { kind: 'outfit', item: g.item, done: g.done };
      return this.coins(id);
    }
    if (g.max && yes >= g.max) return this.coins(id);
    if (g.kind === 'decor' || g.kind === 'tunnels') return { kind: g.kind, decor: g.decor, ask: g.ask, done: g.done };
    if (g.kind === 'sow') {
      let plant = g.plant;
      if (!plant) {
        // something the keeper can't plant yet if possible, otherwise
        // whatever there's least of
        const locked = g.choose.filter((p) => !this.canUse('plant', p));
        const pool = (locked.length ? locked : g.choose).slice();
        const have = (id) => w.plants.filter((p) => p.type === id && !p.dead).length;
        pool.sort((a, b) => have(a) - have(b));
        plant = locked.length ? pool[0] : rpick(pool.slice(0, 3));
      }
      const name = PLANTS[plant].name.toLowerCase();
      return { kind: 'sow', plant, n: rint(g.n[0], g.n[1]), ask: g.ask.replace('{plant}', name), done: g.done.replace('{plants}', name + 's') };
    }
    return this.coins(id);
  }
  coins(id) {
    const n = rint(4, 8);
    return { kind: 'coins', n, done: `${VISITORS[id].name} found ${n} lost coins on the way and left them for you.` };
  }

  // A present (no asking needed): something to wear, or coins.
  give(id, gift, v) {
    const w = this.world;
    if (gift.kind === 'outfit') w.wardrobeAdd(gift.item);
    if (gift.kind === 'coins') w.earn(gift.n, visitorName(id), v ? v.x : null, v ? v.y - 20 : null);
    if (v) {
      v.emote('heart', 2.5);
      w.sparkle(v.x, v.y - 12, 8);
    }
    w.addLog(gift.done, 'heart');
    w.events.emit('visitorGift', { id, gift });
    if (this.onGift) this.onGift(id, gift, v);
  }

  // The keeper said yes. Does the visitor's good deed, and says what
  // happened (or why it couldn't be done after all).
  accept(id, offer, v) {
    const w = this.world;
    const def = VISITORS[id];
    const x = v ? v.x : ZONE_MID[def.zone];
    let ok = false;
    let at = null;
    if (offer.kind === 'decor') {
      const d = w.visitorBuild(offer.decor, def.zone, x);
      ok = !!d;
      if (d) at = [d.x, d.y - 20];
    } else if (offer.kind === 'tunnels') {
      ok = w.digTunnels(x) > 0;
      at = [x, w.terrain.surfaceY(x) + 30];
    } else if (offer.kind === 'sow') {
      const ps = w.visitorSow(offer.plant, offer.n, PLANTS[offer.plant].zone === 'any' ? def.zone : PLANTS[offer.plant].zone, x);
      ok = ps.length > 0;
      if (ok) at = [ps[0].x, ps[0].y - 20];
    }
    if (v) {
      v.waiting = false;
      v.offer = null;
      if (ok) v.emote('heart', 2.5);
    }
    this.notes = this.notes.filter((n) => n.offer !== offer);
    if (!ok) {
      w.addLog(`${def.name} couldn't find room just now. Maybe next time!`, 'leaf');
      return { ok: false, text: `${def.name} couldn't find room for it just now. Maybe next time!` };
    }
    this.entry(id).yes++;
    w.addLog(offer.done, 'leaf');
    w.events.emit('visitorGift', { id, gift: offer, accepted: true });
    return { ok: true, text: offer.done, at };
  }

  decline(id, offer, v) {
    const w = this.world;
    if (v) {
      v.waiting = false;
      v.offer = null;
    }
    this.notes = this.notes.filter((n) => n.offer !== offer);
    if (w) w.addLog(`${VISITORS[id].name} nodded happily: maybe another time.`, 'leaf');
  }

  leaveNote(id, offer) {
    if (!offer) return;
    this.notes = this.notes.filter((n) => n.id !== id);
    this.notes.unshift({ id, offer, day: this.world ? this.world.env.day : 1 });
    if (this.notes.length > MAX_NOTES) this.notes.length = MAX_NOTES;
  }

  // Back after time away (real time, hours): perhaps someone came by and
  // left a present or a note. Returns what they left, for the "while you
  // were away" note, or null.
  awayVisit(realSeconds) {
    const w = this.world;
    if (!w || w.time < DAY_LEN * 2 || this.current()) return null;
    const hours = realSeconds / 3600;
    if (hours < 1) return null;
    const cheer = tankCheer(w);
    if (!chance(Math.min(0.85, (hours / 6) * cheer * 1.3))) return null;
    const id = this.choose(w, cheer, true);
    if (!id) return null;
    const b = this.entry(id);
    b.n++;
    b.last = w.env.day;
    if (!b.first) b.first = w.env.day;
    this.lastId = id;
    const gift = this.giftFor(id);
    if (gift.ask) {
      this.leaveNote(id, gift);
      w.addLog(`${visitorName(id)} came by while you were away and left a note.`, 'paw');
      return { id, note: true, gift };
    }
    this.give(id, gift, null);
    return { id, note: false, gift };
  }

  serialize() {
    return { book: this.book, notes: this.notes, nextT: this.nextT == null ? null : Math.round(this.nextT), lastId: this.lastId };
  }
  load(d) {
    if (!d) return;
    this.book = d.book || {};
    this.notes = (d.notes || []).filter((n) => n && VISITORS[n.id] && n.offer);
    this.nextT = d.nextT == null ? null : d.nextT;
    this.lastId = d.lastId || '';
  }
}
