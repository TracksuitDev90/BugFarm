// The farm's progression: each zone's level, progress on its keeper goals,
// and what's been unlocked. Listens to world events like the journal does,
// so goals keep ticking while the tank catches up on time away.
import { ZONE_PLAN, UNLOCK_AT, KIND_KEY, maxLevel } from '../data/progression.js';
import { zoneStatus } from './care.js';
import { DAY_LEN } from '../config.js';

const ZONES = ['desert', 'pond', 'jungle'];

function zoneOfEvent(w, d) {
  if (d.zone) return d.zone;
  const e = d.food || d.plant || d.c || d.pred;
  return e && e.x != null ? w.env.zoneAt(e.x) : null;
}

export class Progress {
  constructor() {
    this.levels = { desert: 1, pond: 1, jungle: 1 };
    this.counts = {}; // goal id -> progress number
    this.done = {}; // goal id -> true
    this.comfy = { desert: 0, pond: 0, jungle: 0 }; // game seconds comfy at this level
    this.fresh = {}; // 'kind:id' -> true for unlocks the keeper hasn't looked at
    this.legacy = false; // tanks from before progression: everything open
    this.journal = null; // set by the journal; a sandbox tank doesn't level up
    this.onLevel = null;
    this.world = null;
    this.offs = [];
    this.lastTime = null;
    this.checkT = 0;
  }

  attach(world) {
    for (const off of this.offs) off();
    this.offs = [];
    this.world = world;
    this.lastTime = world.time;
    const evs = new Set();
    for (const z of ZONES) for (const lv of ZONE_PLAN[z]) for (const g of lv.goals || []) if (g.kind === 'event') evs.add(g.on);
    for (const ev of evs) this.offs.push(world.events.on(ev, (d) => this.onEvent(ev, d)));
  }

  goals(z) {
    const lv = ZONE_PLAN[z][this.levels[z] - 1];
    return (lv && lv.goals) || [];
  }
  maxed(z) {
    return this.legacy || this.levels[z] >= maxLevel(z);
  }

  // Event goals count for the current level and any level still to come, so
  // a chrysalis that forms before the jungle is ready still counts.
  onEvent(ev, d) {
    const w = this.world;
    for (const z of ZONES) {
      if (this.maxed(z)) continue;
      const plan = ZONE_PLAN[z];
      for (let lv = this.levels[z] - 1; lv < plan.length; lv++) {
        for (const g of plan[lv].goals || []) {
          if (g.kind !== 'event' || g.on !== ev || this.done[g.id]) continue;
          if (g.now && lv !== this.levels[z] - 1) continue;
          if (g.inZone && zoneOfEvent(w, d) !== z) continue;
          if (g.sp && !(d.c && g.sp.includes(d.c.sp))) continue;
          if (g.test && !g.test(d, w)) continue;
          this.counts[g.id] = (this.counts[g.id] || 0) + 1;
          if (this.counts[g.id] >= g.n) this.done[g.id] = true;
        }
      }
    }
    this.levelUps();
  }

  // Fraction 0..1 done for a goal, plus a short "3/5" style label.
  goalProgress(z, g) {
    if (this.done[g.id]) return { f: 1, label: 'Done!' };
    if (g.kind === 'comfy') {
      const h = this.comfy[z] / (DAY_LEN / 24);
      return { f: Math.min(1, h / g.hours), label: `${Math.floor(h)} of ${g.hours} hours` };
    }
    const v = g.kind === 'check' && this.world ? g.value(this.world) : this.counts[g.id] || 0;
    return { f: Math.min(1, v / g.n), label: `${Math.min(v, g.n)} of ${g.n}` };
  }

  // Called from the UI loop. Comfy time accrues in game time; a long jump
  // (catching up on time away) only counts a little, since nobody watched.
  update(dt) {
    const w = this.world;
    if (!w) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const gdt = Math.max(0, Math.min(90, w.time - (this.lastTime == null ? w.time : this.lastTime)));
    this.lastTime = w.time;
    for (const z of ZONES) {
      if (this.maxed(z)) continue;
      const goals = this.goals(z);
      if (goals.some((g) => g.kind === 'comfy' && !this.done[g.id]) && zoneStatus(w, z).ok) this.comfy[z] += gdt;
      for (const g of goals) {
        if (this.done[g.id]) continue;
        if (g.kind === 'comfy' && this.comfy[z] >= (g.hours * DAY_LEN) / 24) this.done[g.id] = true;
        if (g.kind === 'check' && g.value(w) >= g.n) this.done[g.id] = true;
      }
    }
    this.levelUps();
  }

  levelUps() {
    if (this.journal && this.journal.sandbox) return;
    for (const z of ZONES) {
      if (this.maxed(z)) continue;
      const goals = this.goals(z);
      if (!goals.length || !goals.every((g) => this.done[g.id])) continue;
      this.levels[z]++;
      this.comfy[z] = 0;
      const lv = ZONE_PLAN[z][this.levels[z] - 1];
      const unlocks = {};
      for (const kind of Object.keys(KIND_KEY)) {
        unlocks[kind] = lv[KIND_KEY[kind]] || [];
        for (const id of unlocks[kind]) this.fresh[kind + ':' + id] = true;
      }
      if (this.world) this.world.addLog(`The ${z} reached level ${this.levels[z]}!`, 'star');
      if (this.onLevel) this.onLevel(z, this.levels[z], unlocks);
    }
  }

  canUse(kind, id) {
    if (this.legacy) return true;
    const u = UNLOCK_AT[kind] && UNLOCK_AT[kind][id];
    return !u || this.levels[u.zone] >= u.level;
  }
  unlockOf(kind, id) {
    return (UNLOCK_AT[kind] && UNLOCK_AT[kind][id]) || null;
  }
  isFresh(kind, id) {
    return !!this.fresh[kind + ':' + id];
  }
  anyFresh(kind) {
    const p = kind + ':';
    return Object.keys(this.fresh).some((k) => k.startsWith(p));
  }
  seen(kind) {
    const p = kind + ':';
    for (const k of Object.keys(this.fresh)) if (k.startsWith(p)) delete this.fresh[k];
  }
  // What the next level of a zone brings.
  nextUnlocks(z) {
    return ZONE_PLAN[z][this.levels[z]] || null;
  }

  unlockAll() {
    this.legacy = true;
  }

  serialize() {
    return { levels: this.levels, counts: this.counts, done: this.done, comfy: this.comfy, fresh: this.fresh, legacy: this.legacy };
  }
  load(d) {
    if (!d) {
      // a tank saved before there were levels keeps everything it had
      this.legacy = true;
      return;
    }
    Object.assign(this.levels, d.levels || {});
    this.counts = d.counts || {};
    this.done = d.done || {};
    Object.assign(this.comfy, d.comfy || {});
    this.fresh = d.fresh || {};
    this.legacy = !!d.legacy;
  }
}

export { ZONES };
