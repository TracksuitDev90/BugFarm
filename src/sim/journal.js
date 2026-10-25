// Tracks discoveries, unlocks and which species the player has met.
import { DISCOVERIES, DISC_BY_ID, lockedItems } from '../data/discoveries.js';
import { Progress } from './progress.js';
import { Orders } from './orders.js';
import { Dreams } from './dreams.js';
import { Visitors } from './visitors.js';
import { VISITORS, VISITOR_ORDER, VISITOR_ONLY } from '../data/visitors.js';
import { ORDER_GIFTS, NEIGHBOURS } from '../data/neighbours.js';
import { MARKET_LOCK, WARE_BY_ID } from '../data/market.js';

export class Journal {
  constructor() {
    this.unlocked = {}; // id -> {day, hour}
    this.flags = {};
    this.counts = {};
    this.met = {};
    this.sandbox = false;
    this.locked = lockedItems();
    // Busytown's thank-you gifts start locked too, and so does what only
    // visitors bring
    for (const gf of ORDER_GIFTS) this.locked.decor.add(gf.decor);
    for (const id of VISITOR_ONLY.decor) this.locked.decor.add(id);
    this.onUnlock = null;
    this.world = null;
    this.checkT = 0;
    this.offs = [];
    this.progress = new Progress();
    this.orders = this.newOrders();
    this.dreams = new Dreams();
    this.visitors = this.newVisitors();
    this.seenVar = {}; // 'sp:palIdx' -> true for every variety the keeper has met
  }

  newVisitors() {
    const v = new Visitors();
    v.canUse = (k, id) => this.canUse(k, id);
    if (this.visitors) {
      v.onArrive = this.visitors.onArrive;
      v.onOffer = this.visitors.onOffer;
      v.onGift = this.visitors.onGift;
    }
    return v;
  }

  newOrders() {
    const o = new Orders();
    o.canUse = (k, id) => this.canUse(k, id);
    if (this.orders) o.onOrder = this.orders.onOrder;
    return o;
  }

  attach(world) {
    for (const off of this.offs) off();
    this.offs = [];
    this.world = world;
    const byEvent = {};
    for (const d of DISCOVERIES) if (d.on) (byEvent[d.on] = byEvent[d.on] || []).push(d);
    for (const ev of Object.keys(byEvent)) {
      this.offs.push(
        world.events.on(ev, (data) => {
          for (const d of byEvent[ev]) {
            if (this.unlocked[d.id]) continue;
            if (d.test && !d.test(data, world, this)) continue;
            if (d.count) {
              this.counts[d.id] = (this.counts[d.id] || 0) + 1;
              if (this.counts[d.id] < d.count) continue;
            }
            this.unlock(d.id);
          }
        })
      );
    }
    this.offs.push(world.events.on('adopt', (d) => this.meet(d.c.sp)));
    this.offs.push(world.events.on('birth', (d) => d.c && this.meet(d.c.sp)));
    this.progress.attach(world);
    this.orders.attach(world);
    this.dreams.attach(world);
    this.visitors.attach(world);
  }

  meet(sp) {
    if (!this.met[sp]) this.met[sp] = true;
  }

  update(dt) {
    const w = this.world;
    if (!w) return;
    this.progress.update(dt);
    this.orders.update();
    this.visitors.update();
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    for (const d of DISCOVERIES) {
      if (!d.check || this.unlocked[d.id]) continue;
      try {
        if (d.check(w)) this.unlock(d.id);
      } catch (e) {
        /* ignore */
      }
    }
    for (const c of w.creatures) {
      if (!this.met[c.sp]) this.met[c.sp] = true;
      if (c.isAdult && !c.dead) this.seenVar[c.sp + ':' + c.palIdx] = true;
    }
  }

  flag(k) {
    this.flags[k] = true;
  }
  has(k) {
    return !!this.flags[k];
  }

  unlock(id) {
    if (this.unlocked[id]) return;
    const w = this.world;
    this.unlocked[id] = { day: w ? w.env.day : 1, hour: w ? Math.round(w.env.hour * 10) / 10 : 0 };
    const d = DISC_BY_ID[id];
    if (w) w.addLog(`Discovery: ${d.title}`, 'star');
    if (this.onUnlock) this.onUnlock(d);
  }

  // Can the keeper use this critter / food / plant / decoration yet?
  // kind: 'adopt' | 'feed' | 'plant' | 'decor'
  canUse(kind, id) {
    if (this.sandbox) return true;
    if (kind === 'feed' && id === 'bun') return !!(this.world && this.world.stock.buns > 0);
    // what a visitor has given the farm (and what only a visitor can)
    const boons = this.world && this.world.boons;
    if (kind === 'plant' && boons && boons.plants[id]) return true;
    if (kind === 'plant' && VISITOR_ONLY.plant.includes(id)) return false;
    const ware = MARKET_LOCK[kind] && MARKET_LOCK[kind][id];
    if (ware && !(this.world && this.world.owns(ware))) return false;
    if (kind === 'decor' && !this.isDecorUnlocked(id)) return false;
    return this.progress.canUse(kind, id);
  }
  // Why something is locked, as a hint the keeper can act on.
  lockHint(kind, id) {
    if (kind === 'feed' && id === 'bun') return 'buy a bag from Baker Bramble at the Busytown Market.';
    const by = VISITOR_ORDER.find((v) => VISITORS[v].gift.decor === id || VISITORS[v].gift.plant === id);
    if (by) return `${VISITORS[by].name} the ${VISITORS[by].animal} brings the first one, when visiting. See the Visitors' Book in the Journal.`;
    const ware = MARKET_LOCK[kind] && MARKET_LOCK[kind][id];
    if (ware && !(this.world && this.world.owns(ware))) {
      const wr = WARE_BY_ID[ware];
      const nb = NEIGHBOURS.find((n) => n.id === wr.who);
      return `buy it from ${nb.name} at the Busytown Market (the coin purse, top right).`;
    }
    if (kind === 'decor' && !this.isDecorUnlocked(id)) {
      const gift = ORDER_GIFTS.find((gf) => gf.decor === id);
      if (gift) return `send orders to Busytown: it's their thank-you gift at ★${gift.stars}.`;
      const by = this.unlockerOf('decor', id);
      if (by) return `discover “${by.title}”. Hint: ${by.hint}`;
    }
    const u = this.progress.unlockOf(kind, id);
    if (u) return `reach ${u.zone[0].toUpperCase() + u.zone.slice(1)} level ${u.level}. Check the keeper's clipboard for how.`;
    return '';
  }

  isDecorUnlocked(id) {
    if (this.sandbox || !this.locked.decor.has(id)) return true;
    if (this.world && this.world.boons.decor[id]) return true;
    if (this.orders.gifts[id]) return true;
    return DISCOVERIES.some((d) => d.reward && d.reward.decor === id && this.unlocked[d.id]);
  }
  isStyleUnlocked(key, value) {
    const k = key + ':' + value;
    if (this.sandbox || !this.locked.style.has(k)) return true;
    return DISCOVERIES.some((d) => d.reward && d.reward.style && d.reward.style.join(':') === k && this.unlocked[d.id]);
  }
  unlockerOf(kind, key, value) {
    return DISCOVERIES.find((d) => d.reward && (kind === 'decor' ? d.reward.decor === key : d.reward.style && d.reward.style[0] === key && d.reward.style[1] === value));
  }

  get total() {
    return DISCOVERIES.length;
  }
  get found() {
    return Object.keys(this.unlocked).length;
  }

  serialize() {
    return { unlocked: this.unlocked, flags: this.flags, counts: this.counts, met: this.met, progress: this.progress.serialize(), orders: this.orders.serialize(), dreams: this.dreams.serialize(), visitors: this.visitors.serialize(), seenVar: this.seenVar };
  }
  load(d) {
    if (!d) return;
    this.unlocked = d.unlocked || {};
    this.flags = d.flags || {};
    this.counts = d.counts || {};
    this.met = d.met || {};
    const onLevel = this.progress.onLevel;
    this.progress = new Progress();
    this.progress.onLevel = onLevel;
    this.progress.load(d.progress);
    this.orders = this.newOrders();
    this.orders.load(d.orders);
    this.dreams.load(d.dreams);
    this.visitors = this.newVisitors();
    this.visitors.load(d.visitors);
    this.seenVar = d.seenVar || {};
    if (this.world) {
      this.progress.attach(this.world);
      this.orders.attach(this.world);
      this.dreams.attach(this.world);
      this.visitors.attach(this.world);
    }
  }
  // A brand-new farm: every zone back to level 1.
  reset() {
    this.load({ progress: {} });
  }
}
