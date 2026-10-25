// A visitor from the garden outside (see data/visitors.js) while they're in
// the tank. Their comings and goings are simple and scripted: walkers climb
// in over the side of the glass and potter about their zone, flyers
// flutter down through the lid and hop from perch to perch, a swimmer
// paddles about the pond's surface and sits on the bank, and the mole pops
// up out of the ground here and there. They don't eat anyone, and nobody
// needs to run from them. The visit itself (when to ask, when to go home)
// is run by sim/visitors.js.
import { VISITORS } from '../data/visitors.js';
import { ZONE_X, W, CELL } from '../config.js';
import { nextId, setNextId } from './creature.js';
import { rrange, chance, rpick } from '../util/rng.js';
import { clamp } from '../util/math.js';

export class Visitor {
  constructor(type, x, y, opts = {}) {
    this.kind = 'visitor';
    this.id = opts.id || nextId();
    this.type = type;
    this.def = VISITORS[type];
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.facing = opts.facing || 1;
    // in (arriving) | stay | out (going home) | gone
    this.state = opts.state || 'in';
    this.age = opts.age || 0; // how long they've been here
    this.stay = opts.stay || 300; // how long they mean to stay
    this.asked = !!opts.asked; // they've made their offer (or left their gift)
    this.waiting = !!opts.waiting; // ...and it's waiting for the keeper's answer
    this.offer = opts.offer || null; // { kind, decor | plant | item, ... }
    this.vis = this.state === 'stay' ? 1 : 0; // fading in over the glass, or out
    this.exit = false; // going home, and at the way out (fading away)
    this.hidden = false; // the mole, underground
    this.tx = null; // where they're heading
    this.ty = null;
    this.perch = null; // a flyer's perch: { plant } | { decor } | null (the ground)
    this.sat = false; // a flyer, sat on its perch
    this.pause = this.def.move === 'fly' ? 0 : rrange(1, 3);
    this.pose = this.def.move === 'swim' ? 'swim' : this.def.move === 'fly' ? 'fly' : this.def.move === 'dig' ? 'pop' : 'idle';
    this.frame = 0;
    this.anim = 0;
    this.moving = false;
    this.pop = this.def.move === 'dig' ? 0 : 2; // the mole: how far out of the ground
    this.thought = rpick(this.def.lines);
    this.thinkT = rrange(8, 16);
    this.emoteIcon = null;
    this.emoteT = 0;
    this.removed = false;
  }

  get name() {
    return `${this.def.name} the ${this.def.animal}`;
  }

  // Where to come in: over the outer wall of their zone for the walkers,
  // down through the lid for the flyers, at the bank for the swimmer, and
  // anywhere in the soil for the mole.
  static entry(type, w) {
    const def = VISITORS[type];
    const t = w.terrain;
    const [x0, x1] = ZONE_X[def.zone];
    if (def.move === 'fly') return [clamp(rrange(x0 + 60, x1 - 60), 30, W - 30), -30];
    if (def.move === 'swim') {
      const [a, b] = pondSpan(w);
      const x = chance(0.5) ? a - 10 : b + 10;
      return [x, t.surfaceY(x)];
    }
    if (def.move === 'dig' || def.beach) {
      const x = randomDry(w, def, x0, x1);
      return [x, t.surfaceY(x)];
    }
    const x = def.zone === 'desert' ? 16 : W - 16;
    return [x, t.surfaceY(x)];
  }

  // Their patch: dry land in their zone (a crab keeps to the beach by the
  // pond).
  range() {
    const [x0, x1] = ZONE_X[this.def.zone];
    if (this.def.beach) return [Math.max(x0 + 24, x1 - 200), x1 + 30];
    return [Math.max(20, x0 + 24), Math.min(W - 20, x1 - 24)];
  }

  // Off home: back to where they came in.
  leave(w) {
    if (this.state === 'out' || this.state === 'gone') return;
    this.state = 'out';
    this.waiting = false;
    this.pause = 0;
    const def = this.def;
    if (def.move === 'fly') {
      this.perch = null;
      this.setTarget(this.x + rrange(-60, 60), -40);
    } else if (def.move === 'swim') {
      const [a, b] = pondSpan(w);
      const x = Math.abs(this.x - a) < Math.abs(this.x - b) ? a - 12 : b + 12;
      this.setTarget(x, null);
    } else if (def.move === 'walk' && !def.beach) {
      this.setTarget(def.zone === 'desert' ? 14 : W - 14, null);
    } else if (def.move === 'dig') {
      this.pause = 0;
    } else {
      // (a crab just slips quietly away off the beach)
      this.tx = null;
      this.exit = true;
    }
  }

  setTarget(x, y) {
    this.tx = x;
    this.ty = y;
    this.pause = 0;
  }

  emote(icon, t = 1.8) {
    this.emoteIcon = icon;
    this.emoteT = t;
  }

  update(dt, w) {
    this.px = this.x;
    this.py = this.y;
    this.age += dt;
    this.anim += dt;
    if (this.emoteT > 0) this.emoteT -= dt;
    if ((this.thinkT -= dt) <= 0) {
      this.thinkT = rrange(10, 20);
      this.thought = rpick(this.def.lines);
    }
    const t = w.terrain;
    const def = this.def;
    // fading in over the glass, or away again at the way out
    this.vis = clamp(this.vis + dt * (this.exit ? -1.2 : 1.2), 0, 1);
    if (this.state === 'in' && this.vis >= 1 && def.move === 'walk') this.state = 'stay';
    if (this.state === 'out' && ((this.exit && this.vis <= 0) || this.y < -35)) {
      this.state = 'gone';
      return;
    }
    switch (def.move) {
      case 'fly':
        this.flyUpdate(dt, w);
        break;
      case 'swim':
        this.swimUpdate(dt, w);
        break;
      case 'dig':
        this.digUpdate(dt, w);
        break;
      default:
        this.walkUpdate(dt, w);
    }
    if (def.move !== 'fly' && def.move !== 'swim' && !this.hidden) this.y += (t.surfaceY(this.x) - this.y) * Math.min(1, dt * 10);
  }

  // ---- walking about (hedgehog, tortoise, hermit crab)
  walkUpdate(dt, w) {
    this.moving = false;
    if (this.tx == null) {
      if (this.state === 'out') {
        this.exit = true;
        this.pose = 'idle';
        return;
      }
      if ((this.pause -= dt) > 0) {
        this.pose = 'idle';
        return;
      }
      const [x0, x1] = this.range();
      this.setTarget(randomDry(w, this.def, x0, x1, this.x), null);
    }
    const dx = this.tx - this.x;
    if (Math.abs(dx) < 2) {
      this.tx = null;
      this.pause = rrange(2, 9);
      this.pose = 'idle';
      return;
    }
    this.facing = dx > 0 ? 1 : -1;
    const step = Math.min(Math.abs(dx), this.def.speed * dt);
    const nx = this.x + this.facing * step;
    // never into the pond
    if (!dryAt(w, nx) && !this.def.beach) {
      this.tx = null;
      this.pause = 1;
      return;
    }
    this.x = nx;
    this.moving = true;
    this.pose = 'walk';
    this.frame = Math.floor(this.anim * (this.def.speed > 10 ? 6 : 3)) % 2;
  }

  // ---- flying from perch to perch (robin, kingfisher)
  flyUpdate(dt, w) {
    const t = w.terrain;
    if (this.tx == null && this.state !== 'out') {
      if (this.sat && (this.pause -= dt) > 0) {
        // sat on a perch, which sways and grows with its plant
        const p = perchPoint(w, this.perch, this.x);
        if (p) [this.x, this.y] = p;
        this.pose = 'idle';
        this.moving = false;
        return;
      }
      this.sat = false;
      this.perch = pickPerch(w, this);
      const p = perchPoint(w, this.perch, this.x) || [this.x, t.surfaceY(this.x)];
      this.setTarget(p[0], p[1]);
    }
    if (this.tx == null) return;
    const dx = this.tx - this.x;
    const dy = (this.ty == null ? this.y : this.ty) - this.y;
    const d = Math.hypot(dx, dy);
    this.pose = 'fly';
    this.moving = true;
    this.frame = Math.floor(this.anim * 9) % 2;
    if (Math.abs(dx) > 1) this.facing = dx > 0 ? 1 : -1;
    if (d < 3) {
      this.tx = null;
      this.sat = true;
      this.pause = this.state === 'in' ? rrange(12, 24) : rrange(14, 36);
      if (this.state === 'in') this.state = 'stay';
      return;
    }
    // a little bob on every wingbeat, and a hop up before coming down
    const sp = this.def.speed * (d < 40 ? 0.6 : 1);
    this.x += (dx / d) * Math.min(d, sp * dt);
    this.y += (dy / d) * Math.min(d, sp * dt) + Math.sin(this.anim * 14) * 0.25;
  }

  // ---- paddling about the pond (water vole)
  swimUpdate(dt, w) {
    const t = w.terrain;
    const [a, b] = pondSpan(w);
    const surf = t.waterLevel - 1;
    if (this.tx == null && this.state !== 'out') {
      if ((this.pause -= dt) > 0) {
        this.moving = false;
        this.pose = this.x > a && this.x < b ? 'swim' : 'idle';
        if (this.pose === 'swim') this.y = surf + Math.sin(this.anim * 2) * 0.6;
        return;
      }
      // a paddle across, or a sit on the bank now and then
      if (chance(0.25)) this.setTarget(chance(0.5) ? a - rrange(8, 20) : b + rrange(8, 20), null);
      else this.setTarget(rrange(a + 12, b - 12), null);
    }
    if (this.tx == null) return;
    const dx = this.tx - this.x;
    if (Math.abs(dx) < 2) {
      this.tx = null;
      this.pause = rrange(3, 10);
      if (this.state === 'out') this.exit = true;
      return;
    }
    this.facing = dx > 0 ? 1 : -1;
    this.x += this.facing * Math.min(Math.abs(dx), this.def.speed * dt);
    this.moving = true;
    const wet = this.x > a && this.x < b;
    this.pose = wet ? 'swim' : 'walk';
    this.frame = Math.floor(this.anim * 5) % 2;
    const gy = wet ? surf + Math.sin(this.anim * 3) * 0.5 : t.surfaceY(this.x);
    this.y += (gy - this.y) * Math.min(1, dt * 8);
    if (this.state === 'in' && wet) this.state = 'stay';
  }

  // ---- popping up here and there (mole)
  digUpdate(dt, w) {
    const t = w.terrain;
    this.moving = false;
    this.pose = 'pop';
    if (this.hidden) {
      // tunnelling along underground to the next spot (or home)
      if (this.state === 'out') {
        this.state = 'gone';
        return;
      }
      const dx = this.tx - this.x;
      if (Math.abs(dx) < 2) {
        this.hidden = false;
        this.pop = 0;
        this.pause = rrange(14, 30);
        this.y = t.surfaceY(this.x);
        return;
      }
      this.facing = dx > 0 ? 1 : -1;
      this.x += this.facing * Math.min(Math.abs(dx), this.def.speed * dt);
      return;
    }
    if (this.state === 'in') {
      // coming up for the first time
      this.pop = Math.min(2, this.pop + dt * 2.5);
      if (this.pop >= 2) {
        this.state = 'stay';
        this.pause = rrange(14, 30);
      }
    } else if (this.state === 'out' || (!this.waiting && (this.pause -= dt) <= 0)) {
      // ducking back down (but not with an idea waiting: then he stays up,
      // where the keeper can tap him)
      this.pop = Math.max(0, this.pop - dt * 3);
      if (this.pop <= 0) {
        this.hidden = true;
        const [x0, x1] = this.range();
        this.tx = randomDry(w, this.def, x0, x1, this.x);
      }
    } else this.pop = Math.min(2, this.pop + dt * 2.5);
    this.frame = Math.round(this.pop);
  }

  // Is a point on them (for the keeper's tap)?
  hit(x, y) {
    if (this.hidden || this.vis < 0.3) return false;
    return Math.abs(x - this.x) < 18 && y < this.y + 6 && y > this.y - 30;
  }

  serialize() {
    const o = { id: this.id, t: this.type, x: Math.round(this.x), y: Math.round(this.y), f: this.facing, s: this.state === 'in' ? 'stay' : this.state, a: Math.round(this.age), st: Math.round(this.stay) };
    if (this.asked) o.ak = 1;
    if (this.waiting) o.wt = 1;
    if (this.offer) o.of = this.offer;
    return o;
  }
  static load(o) {
    if (!VISITORS[o.t] || o.s === 'gone') return null;
    setNextId(o.id + 1);
    return new Visitor(o.t, o.x, o.y, { id: o.id, facing: o.f, state: o.s, age: o.a, stay: o.st, asked: !!o.ak, waiting: !!o.wt, offer: o.of || null });
  }
}

// ---- helpers
function dryAt(w, x) {
  const t = w.terrain;
  const sy = t.surfaceY(x);
  return !(t.waterSurfaceAt(x) > 0 && t.waterAt(x, sy - 2));
}
// A spot on dry land between x0 and x1 (a little way from `from`).
function randomDry(w, def, x0, x1, from) {
  for (let i = 0; i < 12; i++) {
    const x = rrange(x0, x1);
    if (from != null && Math.abs(x - from) < 30) continue;
    if (dryAt(w, x) || def.beach) return clamp(x, 14, W - 14);
  }
  return clamp(from != null ? from : (x0 + x1) / 2, 14, W - 14);
}
// The open water of the pond, left to right.
export function pondSpan(w) {
  const t = w.terrain;
  const [x0, x1] = ZONE_X.pond;
  let a = null;
  let b = null;
  for (let x = x0; x <= x1; x += CELL * 2) {
    if (t.waterSurfaceAt(x) > 0 && t.waterAt(x, t.waterLevel + 4)) {
      if (a == null) a = x;
      b = x;
    }
  }
  if (a == null) return [(x0 + x1) / 2 - 40, (x0 + x1) / 2 + 40];
  return [a, b];
}
// Somewhere for a flyer to sit: the top of a tall plant (a cattail or an
// iris by the pond for a kingfisher), the roof of a house, or the ground.
function pickPerch(w, v) {
  const zone = v.def.zone;
  const opts = [];
  for (const p of w.plants) {
    if (p.dead || p.growth < 0.5 || w.env.zoneAt(p.x) !== zone) continue;
    if (zone === 'pond' ? p.def.place !== 'shore' : p.def.aquatic || p.def.h < 26) continue;
    opts.push({ plant: p });
  }
  if (zone !== 'pond') for (const d of w.decor) if (d.def.place === 'ground' && w.env.zoneAt(d.x) === zone && !d.def.stamp) opts.push({ decor: d });
  const near = opts.filter((o) => Math.abs((o.plant || o.decor).x - v.x) > 20);
  if (!near.length || (zone !== 'pond' && chance(0.2))) return null;
  return rpick(near);
}
function perchPoint(w, perch, x) {
  if (!perch) return [x, w.terrain.surfaceY(x)];
  if (perch.plant) {
    const p = perch.plant;
    if (p.dead || p.removed) return null;
    return [p.x, p.y + p.shape.box[1] + 5];
  }
  const d = perch.decor;
  if (d.removed) return null;
  return [d.x, d.y - d.def.h + 2];
}
