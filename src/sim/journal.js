// Tracks discoveries, unlocks and which species the player has met.
import { DISCOVERIES, DISC_BY_ID, lockedItems } from '../data/discoveries.js';
import { Progress } from './progress.js';

export class Journal {
  constructor() {
    this.unlocked = {}; // id -> {day, hour}
    this.flags = {};
    this.counts = {};
    this.met = {};
    this.sandbox = false;
    this.locked = lockedItems();
    this.onUnlock = null;
    this.world = null;
    this.checkT = 0;
    this.offs = [];
    this.progress = new Progress();
    this.progress.journal = this;
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
  }

  meet(sp) {
    if (!this.met[sp]) this.met[sp] = true;
  }

  update(dt) {
    const w = this.world;
    if (!w) return;
    this.progress.update(dt);
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
    for (const c of w.creatures) if (!this.met[c.sp]) this.met[c.sp] = true;
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
    if (kind === 'decor' && !this.isDecorUnlocked(id)) return false;
    return this.progress.canUse(kind, id);
  }
  // Why something is locked, as a hint the keeper can act on.
  lockHint(kind, id) {
    if (kind === 'decor' && !this.isDecorUnlocked(id)) {
      const by = this.unlockerOf('decor', id);
      if (by) return `discover “${by.title}”. Hint: ${by.hint}`;
    }
    const u = this.progress.unlockOf(kind, id);
    if (u) return `reach ${u.zone[0].toUpperCase() + u.zone.slice(1)} level ${u.level}. Check the keeper's clipboard for how.`;
    return '';
  }

  isDecorUnlocked(id) {
    if (this.sandbox || !this.locked.decor.has(id)) return true;
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
    return { unlocked: this.unlocked, flags: this.flags, counts: this.counts, met: this.met, progress: this.progress.serialize(), sandbox: this.sandbox };
  }
  load(d) {
    if (!d) return;
    this.unlocked = d.unlocked || {};
    this.flags = d.flags || {};
    this.counts = d.counts || {};
    this.met = d.met || {};
    // sandbox or farm is a property of the tank (older saves keep the device setting)
    if (d.sandbox != null) this.sandbox = !!d.sandbox;
    const onLevel = this.progress.onLevel;
    this.progress = new Progress();
    this.progress.journal = this;
    this.progress.onLevel = onLevel;
    this.progress.load(d.progress);
    if (this.world) this.progress.attach(this.world);
  }
  // A brand-new farm: every zone back to level 1.
  reset() {
    this.load({ progress: {} });
  }
}
