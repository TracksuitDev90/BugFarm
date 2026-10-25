// A living critter: body, needs, life stage, locomotion. Decision making
// lives in ai/brain.js; this file is the "body" the brain drives.
import { SPECIES } from '../data/species.js';
import { PALETTES, footOf } from '../art/creatures.js';
import { ACCESSORIES, accessoryColor } from '../art/ink.js';
import { randomName } from '../data/names.js';
import { DAY_LEN, W, H, CELL, GW, ZONE_MID } from '../config.js';
import { clamp, clamp01, band, lerp, angleDiff, smoothstep } from '../util/math.js';
import { rrange, rint, chance } from '../util/rng.js';
import { nearestWalkable, lineOfWater, findWaterPath } from '../world/pathfind.js';
import { breeze } from '../world/breeze.js';

const GRAV = 620;
const XY = [0, 0];
// the eight neighbours a crawler feels for ground, and how much each counts
const PROBE_X = [1, -1, 0, 0, 1, 1, -1, -1];
const PROBE_Y = [0, 0, 1, -1, 1, -1, 1, -1];
const PROBE_W = [1, 1, 1, 1, 0.5, 0.5, 0.5, 0.5];
let greeter = null;
let greetNow = 0;
function canGreet(o) {
  const c = greeter;
  return o !== c && o.sp === 'ant' && o.colonyId === c.colonyId && !o.dead && o.mode === 'crawl' && o.moving && o.carry !== 'sand' && (o.greetCD || 0) <= greetNow;
}
// How each flyer flies.
//   top/band: cruising height as a band of the tank (from the lid down), or
//   low: [a, b] above the ground; clear: how far it keeps above the ground
//   ahead; reach: how far off a target has to be before it climbs to cruise;
//   wob: flutter; glide: how often it glides on open wings; thermal: how much
//   warm air under a lamp lifts it; jink: sudden swerves; dart: stops dead to
//   hover; curve: how far its heading wanders; agile: how quickly it turns.
const FLIGHT = {
  butterfly: { top: 46, band: 150, clear: 52, reach: 55, wob: 0.75, glide: 0.9, thermal: 0.55, jink: 1.1, curve: 0.8, agile: 2.6, wind: 0.6, tilt: 0.35 },
  moth: { top: 56, band: 170, clear: 44, reach: 60, wob: 0.6, glide: 0.6, thermal: 0.45, jink: 1.5, curve: 0.9, agile: 2.8, wind: 0.55, tilt: 0.35 },
  dragonfly: { top: 46, band: 150, clear: 52, reach: 80, wob: 0.05, glide: 0.45, thermal: 0.25, jink: 0, dart: true, curve: 0.5, agile: 5.5, wind: 0.15, tilt: 0.25 },
  bee: { low: [60, 170], clear: 28, reach: 130, wob: 0.22, glide: 0, thermal: 0.1, jink: 0, curve: 0.6, agile: 3.4, wind: 0.2, tilt: 0.4 },
  firefly: { low: [30, 130], clear: 18, reach: 110, wob: 0.4, glide: 0.25, thermal: 0, jink: 0, curve: 0.9, agile: 2.4, wind: 0.35, tilt: 0.4 },
  ladybug: { low: [50, 150], clear: 26, reach: 110, wob: 0.25, glide: 0, thermal: 0.15, jink: 0, curve: 0.6, agile: 3.2, wind: 0.35, tilt: 0.4 },
  fruitfly: { low: [14, 70], clear: 10, reach: 70, wob: 0.35, glide: 0, thermal: 0.2, jink: 2, curve: 1, agile: 3.6, wind: 0.65, tilt: 0.4 },
};
export function flightOf(sp) {
  return FLIGHT[sp] || FLIGHT.ladybug;
}
// Flyers stay below the lamps and gadgets hanging from the lid.
export const CEIL = 44;
// The highest thing under a flyer: the ground, or the pond's surface.
export function airFloor(t, x) {
  const gy = t.surfaceY(x);
  const ws = t.waterSurfaceAt(x);
  return ws > 0 ? Math.min(gy, ws) : gy;
}

let ID = 1;
export function setNextId(n) {
  ID = Math.max(ID, n);
}
export function nextId() {
  return ID++;
}

function gaussTrait() {
  return clamp01(0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.45);
}

// A swimmer's body is an oval (half-length rx, half-height ry) and all of it
// belongs in the water. Wherever the floor would poke into it, ease the
// swimmer up off the gravel; where a bank or wall is beside it, ease it
// away; where the water is too shallow for it at all, ease it toward deeper
// water. Uses the smooth ground line, so a fish settles just over a sloping
// bottom rather than stepping cell by cell. top: the highest its middle may
// go. Returns the adjusted position.
const CLEAR = [0, 0];
const FIT = [0, 0];
function clearOfGround(t, x, y, rx, ry, top, dt) {
  const k = Math.min(1, dt * 8);
  let maxY = Infinity;
  let left = false;
  let right = false;
  for (const u of [-1, -0.55, 0, 0.55, 1]) {
    const hx = x + u * rx;
    const half = ry * Math.sqrt(1 - u * u * 0.85);
    let fy = t.surfaceY(hx);
    if (fy < y - half * 0.4) {
      // ground above this part of the body: a bank right beside it, or an
      // overhang with the floor somewhere underneath
      if (t.solidAt(hx, y)) {
        if (u < 0) left = true;
        else if (u > 0) right = true;
        continue;
      }
      fy = Infinity;
      for (let yy = y; yy <= y + half + CELL; yy += CELL) {
        if (t.solidAt(hx, yy)) {
          fy = Math.floor(yy / CELL) * CELL;
          break;
        }
      }
      if (fy === Infinity) continue;
    }
    maxY = Math.min(maxY, fy - half - 1);
  }
  // too shallow here for a body this size: make for deeper water
  if (maxY < top) x += (t.surfaceY(x + rx * 1.5) > t.surfaceY(x - rx * 1.5) ? 1 : -1) * rx * 0.4 * k;
  if (y > maxY) y += (maxY - y) * k;
  // (squeezed between two banks, as in a channel, it just carries on)
  if (left !== right) x += (left ? 1 : -1) * rx * 0.35 * k;
  CLEAR[0] = x;
  CLEAR[1] = y;
  return CLEAR;
}

// The nearest spot to (x, y) where a body this size fits in open water:
// below the surface limit `top`, above the floor and (if it may move
// sideways: a place to swim to, not a snack) somewhere deep enough.
function fitSpot(t, x, y, rx, ry, top, sideways) {
  const room = (cx) => t.surfaceY(cx) - top - ry - 1;
  let fx = x;
  if (sideways && room(x) < ry && t.surfaceY(x) > y) {
    for (let j = 1; j <= 4; j++) {
      const a = x - j * rx;
      const b = x + j * rx;
      if (room(b) >= ry && t.waterAt(b, top + ry)) {
        fx = b;
        break;
      }
      if (room(a) >= ry && t.waterAt(a, top + ry)) {
        fx = a;
        break;
      }
    }
  }
  const floor = t.surfaceY(fx);
  let fy = y;
  if (floor > fy) fy = Math.min(fy, floor - ry - 1);
  FIT[0] = fx;
  FIT[1] = Math.max(fy, top);
  return FIT;
}

export class Creature {
  constructor(sp, x, y, opts = {}) {
    const def = SPECIES[sp];
    this.kind = 'creature';
    this.id = opts.id || nextId();
    this.sp = sp;
    this.def = def;
    this.stage = opts.stage || def.stages[0].id;
    this.name = opts.name || randomName(sp);
    this.sex = opts.sex || (Math.random() < 0.5 ? 'f' : 'm');
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.pangle = 0;
    this.facing = opts.facing || (Math.random() < 0.5 ? -1 : 1);
    this.age = opts.age || 0;
    this.stageAge = opts.stageAge || 0;
    this.lifespan = opts.lifespan || rrange(def.lifespan[0], def.lifespan[1]) * DAY_LEN;
    const pals = PALETTES[sp] || [{}];
    // (rare looks, and looks kept for a special job, aren't handed out at random)
    if (opts.palIdx != null) this.palIdx = opts.palIdx % pals.length;
    else {
      const skip = (def.rarePals || []).concat(def.specialPals || []);
      const ok = [];
      for (let i = 0; i < pals.length; i++) if (!skip.includes(i)) ok.push(i);
      this.palIdx = ok.length ? ok[rint(0, ok.length - 1)] : 0;
    }
    this.acc = opts.acc !== undefined ? opts.acc : Math.random() < (def.accessoryChance || 0) ? ACCESSORIES[rint(0, ACCESSORIES.length - 1)] : null;
    this.accSeed = opts.accSeed || rint(1, 99999);
    this.traits = opts.traits || {
      bold: gaussTrait(),
      curious: gaussTrait(),
      social: gaussTrait(),
      lazy: gaussTrait(),
      greedy: gaussTrait(),
    };
    this.hunger = opts.hunger != null ? opts.hunger : rrange(0.15, 0.4);
    this.energy = opts.energy != null ? opts.energy : rrange(0.6, 1);
    this.health = opts.health != null ? opts.health : 1;
    this.plump = opts.plump || 1;
    this.comfort = 1;
    this.fear = 0;
    this.mateCD = opts.mateCD != null ? opts.mateCD : DAY_LEN * rrange(0.4, 1.2);
    this.colonyId = opts.colonyId || 0;
    this.role = opts.role || null;
    this.T = 22;
    this.M = 0.5;
    this.light = 1;
    this.inWater = false;
    this.mode = 'walk';
    this.target = null;
    this.arrived = false;
    this.blocked = false;
    this.climb = null;
    this.path = null;
    this.pathI = 0;
    this.carry = null;
    this.carryBrood = null; // a nurse ant carrying an egg or baby
    this.carrying = null; // a bit of food held in the mouth (see the gather behaviour)
    // a swimmer's route round corners: waypoints through the water
    this.nav = null;
    this.navI = 0;
    this.navFor = null;
    this.navT = 0;
    this.pose = 'idle';
    this.anim = Math.random() * 10;
    this.frame = 0;
    this.emoteIcon = null;
    this.emoteT = 0;
    this.thought = '';
    this.brain = { b: null, t: 0, think: Math.random() * 0.6, data: {} };
    this.memory = opts.memory || {};
    this.dead = false;
    this.deadT = 0;
    this.cause = '';
    this.hidden = false;
    this.shelter = null;
    this.blink = 0;
    this.honeydew = 0;
    this.stuckT = 0;
    this.lastX = x;
    this.body = null;
    this.glow = 0;
    this.phase = Math.random();
    this.freq = rrange(0.9, 1.1);
    this.hopCD = 0;
    this.landT = 0;
    this.spd = 0; // current walking speed (eases in and out)
    this.wdir = 0;
    this.nx = 0; // which way is "up" for a crawler (away from the ground it's on)
    this.ny = -1;
    this.pauseT = 0;
    this.vf = this.facing; // facing as drawn (it swivels toward the real one)
    // Everything the brain, senses and movement set later starts here too,
    // so every critter has the same shape and the JavaScript engine can keep
    // property access fast.
    this.moving = false;
    this.paddling = false;
    this.dryT = 0;
    this.pts = null; // crawler's smoothed path, and progress along it
    this.ptI = 0;
    this.ptChecked = -1;
    this.repath = false;
    this.antGoal = null;
    this.lastCell = -1;
    this.feelK = 0;
    this.greetT = 0;
    this.greetCD = 0;
    this.threat = null;
    this.huddling = false;
    this.tongue = null;
    this.dormant = false;
    this.school = null;
    this.shelterBonus = 0;
    this.tempDisc = 0;
    this.moistDisc = 0;
    this.airDisc = 0;
    this.discomfort = 0;
    this.act = 1;
    this.tf = 1;
    this.mf = 1;
    this.oxy = 1;
    this.restT = 0;
    this.hungerT = 0;
    this.selected = false;
    // A bit of free will. Swimmers and flyers have a heading of their own
    // that wanders (so they curve about instead of beelining), swimmers flick
    // their tails in bursts and coast between them, everyone has their own
    // pace, and now and then a passing fancy (a whim) colours what they feel
    // like doing.
    this.wan = Math.random() * 2 - 1;
    this.beat = Math.random() * 4;
    this.burst = 0;
    this.glide = Math.random();
    this.tempo = rrange(0.75, 1.3);
    // in flight: a moment of lift after take-off, gliding on open wings, a
    // dragonfly's hover, and how high this trip is flown
    this.liftT = 0;
    this.soarT = 0;
    this.hoverT = 0;
    this.cruise = null;
    // working double-time after a busy bun
    this.busyT = 0;
    this.restBonus = 1; // a nap beside the park bench
    this.flapPh = Math.random() * 6.28; // wing-beat phase as drawn
    this.whim = null;
    // Home life: the shelter it's tucked up inside right now (if any), a
    // moment peeking out of the front door, and a moment just after coming
    // out (so it's drawn on the doorstep, not behind the house).
    this.inside = null;
    this.peek = 0;
    this.doorT = 0;
    this.vis = 1; // how visible it is as drawn (fades while slipping in or out)
    this.visF = 0; // (the frame that was last worked out on)
    this.applyStage(true);
  }

  get stageDef() {
    const i = this.def.stageIndex[this.stage];
    return i != null ? this.def.stages[i] : this.def.stages[this.def.stages.length - 1];
  }
  // Wrapped up and changing: a butterfly's chrysalis or a moth's cocoon.
  get pupa() {
    return this.stage === 'chrysalis' || this.stage === 'cocoon';
  }
  // Grubs that will one day fly: caterpillars of both kinds.
  get larva() {
    return this.stage === 'caterpillar';
  }
  get isAdult() {
    return this.stage === this.def.adultStage || this.stage === 'queen' || this.stage === 'worker';
  }
  get pal() {
    const pals = PALETTES[this.sp] || [{}];
    return pals[this.palIdx % pals.length];
  }
  get accColor() {
    return accessoryColor(this.accSeed);
  }
  get diet() {
    return this.stageDef.diet || this.def.diet;
  }
  get appetite() {
    return this.stageDef.appetite || this.def.appetite;
  }
  get hungerDays() {
    return this.stageDef.hungerDays || this.def.hungerDays;
  }
  get canClimb() {
    const st = this.stageDef;
    return st.canClimb != null ? st.canClimb : !!this.def.canClimb;
  }
  get canFly() {
    return !!this.def.canFly && this.isAdult;
  }
  get amphibious() {
    return !!this.stageDef.amphibious;
  }
  get aquatic() {
    const st = this.stageDef;
    return st.aquatic != null ? st.aquatic : this.def.habitat === 'water';
  }
  get size() {
    const s = this.def.size;
    if (this.sp === 'ant') return this.stage === 'queen' ? 18 : 13;
    if (this.sp === 'frog') return this.stage === 'adult' ? 30 : this.stage === 'froglet' ? 16 : 13;
    if (this.sp === 'butterfly' || this.sp === 'moth') return this.stage === 'caterpillar' ? 18 : this.stage === 'adult' ? 26 : 10;
    if (this.sp === 'dragonfly' && this.stage === 'nymph') return 14;
    if (this.def.fish && this.stage === 'fry') return s * 0.5;
    if (this.sp === 'turtle' && this.stage === 'hatchling') return 22;
    if (this.stage === 'egg') return 8;
    if (this.stage === 'baby' || this.stage === 'nymph' || this.stage === 'young') return s * 0.6;
    return s;
  }
  // Half the length and height of a swimmer's body: what has to stay inside
  // the water (null for critters without one, which only keep their middle
  // in the water).
  swimBody() {
    const b = this.def.body;
    if (!b) return this.sp === 'frog' && this.stage !== 'adult' ? [this.size * 0.55, this.size * 0.3] : null;
    const k = this.size / this.def.size;
    return [b[0] * k, b[1] * k];
  }

  // Is the water here deep enough for this body to swim in?
  roomToSwim(t, x) {
    const b = this.swimBody();
    if (!b) return true;
    const top = t.waterSurfY(x);
    return t.surfaceY(x) - top >= b[1] * 2 + 2;
  }

  // Visual scale for stages that reuse adult art.
  get drawScale() {
    const st = this.stage;
    if (st === 'nymph' || (st === 'baby' && (this.sp === 'gecko' || this.sp === 'worm'))) return 0.55;
    if (st === 'young' && this.sp === 'beetle') return 0.6;
    if (st === 'egg' && (this.sp === 'cricket' || this.sp === 'grasshopper' || this.sp === 'beetle' || this.sp === 'firefly' || this.sp === 'gecko')) return 1;
    return 1;
  }
  get foot() {
    return footOf(this.sp, this.stage) * this.drawScale;
  }

  applyStage(initial) {
    const st = this.stageDef;
    const loco = st.loco;
    if (!initial || !this.stageDur) {
      this.stageDur = st.days ? rrange(st.days[0], st.days[1]) * DAY_LEN : Infinity;
    }
    if (loco === 'crawl') this.mode = 'crawl';
    else if (loco === 'swim') this.mode = 'swim';
    else if (loco === 'fly') this.mode = 'fly';
    else if (loco === 'burrow') this.mode = 'burrow';
    else if (loco === 'still') this.mode = 'still';
    else this.mode = 'walk';
    if (this.sp === 'worm' && !this.body) {
      this.body = [];
      for (let i = 0; i < 12; i++) this.body.push({ x: this.x - i * 3 * this.facing, y: this.y });
    }
  }

  emote(icon, t = 1.6) {
    this.emoteIcon = icon;
    this.emoteT = t;
  }

  // ------------------------------------------------------------ targets
  seek(target) {
    this.target = target;
    this.arrived = false;
    this.blocked = false;
    this.path = null;
    this.stuckT = 0;
  }
  seekPoint(x, y, extra) {
    this.seek(Object.assign({ kind: 'point', x, y }, extra));
  }
  halt() {
    this.target = null;
    this.arrived = false;
    this.blocked = false;
    this.path = null;
    this.vx *= 0.3;
    this.vy *= 0.3;
  }
  targetPos(w) {
    const t = this.target;
    if (!t) return null;
    switch (t.kind) {
      case 'plant': {
        if (!t.plant || t.plant.dead || t.plant.removed) return null;
        const p = t.plant.slotWorld(t.slot, w.time);
        return p;
      }
      case 'food':
        if (!t.food || t.food.gone) return null;
        return [t.food.x, t.food.y];
      case 'creature':
        if (!t.c || t.c.dead || t.c.removed) return null;
        return [t.c.x, t.c.y];
      default:
        return [t.x, t.y];
    }
  }

  speedFactor() {
    const d = this.def;
    let f = 1;
    if (d.ecto) {
      const [lo, okLo, okHi, hi] = d.temp;
      const T = this.T;
      if (T < okLo) f *= 0.18 + 0.82 * clamp01((T - lo) / (okLo - lo));
      else if (T > okHi) f *= 0.75 + 0.25 * clamp01((hi - T) / (hi - okHi));
    }
    if (this.plump > 1.15) f *= Math.max(0.55, 1 - (this.plump - 1.15) * 0.9);
    if (this.energy < 0.2) f *= 0.75;
    if (this.health < 0.5) f *= 0.5 + this.health;
    if (this.stage === 'baby' || this.stage === 'nymph' || this.stage === 'young' || this.stage === 'fry' || this.stage === 'hatchling') f *= 0.75;
    if (this.fear > 0.5) f *= 1.35;
    return f;
  }

  // ------------------------------------------------------------ physics/locomotion
  move(w, dt) {
    switch (this.mode) {
      case 'walk':
        return this.moveWalk(w, dt);
      case 'air':
        return this.moveAir(w, dt);
      case 'fly':
        return this.moveFly(w, dt);
      case 'swim':
        return this.moveSwim(w, dt);
      case 'climb':
        return this.moveClimb(w, dt);
      case 'burrow':
        return this.moveBurrow(w, dt);
      case 'crawl':
        return this.moveCrawl(w, dt);
      case 'still':
        return this.moveStill(w, dt);
      case 'glass':
        return this.moveGlass(w, dt);
      default:
        return undefined;
    }
  }

  groundAt(w, x) {
    return w.terrain.surfaceY(x) - this.foot;
  }

  moveWalk(w, dt) {
    const t = w.terrain;
    const tp = this.targetPos(w);
    // a pond snail glides up the glass to get anywhere off the floor
    if (this.def.glass && tp && this.target.kind !== 'plant' && tp[1] < this.groundAt(w, tp[0]) - 8 && t.waterAt(tp[0], tp[1])) {
      this.mode = 'glass';
      return;
    }
    const surf = t.surfaceY(this.x);
    const surfWet = t.waterAt(this.x, surf - 2);
    // aquatic walkers must stay underwater; land walkers on land.
    if (this.aquatic && !surfWet) {
      if (!t.waterAt(this.x, this.y)) {
        // stranded: wriggle back to the nearest water if there's any close by
        const back = this.nearestWetFloor(t, 64);
        if (back != null) {
          this.x += Math.sign(back - this.x) * Math.min(Math.abs(back - this.x), this.walkSpeed() * 0.8 * dt);
          this.y = this.groundAt(w, this.x);
          this.facing = back >= this.x ? 1 : -1;
          this.moving = true;
        }
        this.distress(w, dt, 'dry');
        if (this.dead) return;
        if (back != null) return;
      }
    } else if (!this.aquatic && surfWet && !this.amphibious) {
      // swept into water: paddle to shore
      this.mode = 'swim';
      this.paddling = true;
      return;
    } else if (surfWet && this.amphibious && this.roomToSwim(t, this.x)) {
      this.mode = 'swim';
      return;
    }
    let moving = false;
    if (tp && this.target) {
      const tgt = this.target;
      let tx = tp[0];
      // climb onto plants from their base
      if (tgt.kind === 'plant' && this.canClimb) tx = tgt.plant.x;
      const dx = tx - this.x;
      const tol = tgt.kind === 'plant' && this.canClimb ? 1.5 : Math.max(2, this.size * 0.35) + (tgt.tol || 0);
      if (Math.abs(dx) <= tol) {
        if (tgt.kind === 'plant' && this.canClimb) {
          this.startClimb(tgt.plant, tgt.slot);
          return;
        }
        if (tgt.kind === 'plant' && !this.canClimb && this.canFly) {
          this.takeOff();
          return;
        }
        this.arrived = true;
      } else {
        const dir = Math.sign(dx);
        // Hop if we're a hopper and it's a long way
        const hop = this.def.hop;
        if (hop && this.hopCD <= 0 && Math.abs(dx) > 26 && Math.random() < hop.chance * dt * 2.2) {
          if (this.tryHop(w, dir, Math.abs(dx))) return;
        }
        if (this.canFly && Math.abs(dx) > 160 && Math.random() < dt * 0.8) {
          this.takeOff();
          return;
        }
        const top = this.walkSpeed() * this.speedFactor() * (tgt.speedMul || 1);
        // ease in from a standstill or a turn, and ease off when nearly there
        const want = top * Math.min(1, 0.3 + Math.abs(dx) / 18);
        if (dir !== this.wdir) {
          this.wdir = dir;
          this.spd *= 0.2;
        }
        this.spd = Math.min(want, this.spd + top * 5 * dt);
        let nx = this.x + dir * this.spd * dt;
        nx = clamp(nx, 6, W - 6);
        const ns = t.surfaceY(nx);
        const wet = t.waterAt(nx, ns - 2);
        let ok = true;
        if (this.aquatic) ok = wet;
        else if (wet && !this.amphibious) ok = false;
        if (ns - surf < -24) ok = false; // a cliff too tall
        if (ok) {
          if (wet && !this.aquatic && this.amphibious) {
            this.x = nx;
            this.mode = 'swim';
            return;
          }
          this.x = nx;
          this.facing = dir;
          moving = true;
        } else {
          this.blocked = true;
          if (this.canFly) this.takeOff();
          else if (this.def.hop && this.hopCD <= 0) this.tryHop(w, dir, Math.abs(dx));
        }
      }
    }
    if (!moving) this.spd = 0;
    const gy = this.groundAt(w, this.x);
    this.y = gy;
    const a = Math.atan2(t.surfaceY(this.x + 3) - t.surfaceY(this.x - 3), 6);
    this.angle += angleDiff(this.angle, clamp(a, -0.9, 0.9)) * Math.min(1, dt * 8);
    this.moving = moving;
  }

  walkSpeed() {
    return this.def.speed.walk || 8;
  }

  // The nearest x (within reach) where the floor is under water.
  nearestWetFloor(t, reach) {
    for (let d = 4; d <= reach; d += 4) {
      for (const s of [1, -1]) {
        const x = this.x + s * d;
        if (t.waterAt(x, t.surfaceY(x) - 2)) return x;
      }
    }
    return null;
  }

  tryHop(w, dir, dist) {
    const t = w.terrain;
    const hop = this.def.hop;
    const reach = Math.min(dist, rrange(30, 75) * (this.stage === 'adult' ? 1 : 0.6));
    const lx = clamp(this.x + dir * reach, 8, W - 8);
    const ly = t.surfaceY(lx);
    if (t.waterAt(lx, ly - 2) && !this.amphibious) return false;
    if (this.aquatic || ly - this.foot < this.y - 70) return false; // no leaping up cliffs
    const T = 0.5;
    const ty = ly - this.foot;
    this.vx = (lx - this.x) / T;
    this.vy = (ty - this.y - 0.5 * GRAV * T * T) / T;
    if (this.vy > -60) this.vy = -60;
    this.mode = 'air';
    this.facing = dir;
    this.hopCD = rrange(0.5, 1.4);
    this.pose = 'jump';
    w.events.emit('hop', { c: this });
    return true;
  }

  moveAir(w, dt) {
    const t = w.terrain;
    this.vy += GRAV * dt;
    let nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    if (nx < 6 || nx > W - 6 || t.solidAt(nx, this.y)) {
      this.vx = 0;
      nx = this.x;
    }
    this.x = nx;
    this.y = Math.min(ny, H - 4);
    if (this.y < 12) {
      // bonk on the lid
      this.y = 12;
      if (this.vy < 0) this.vy = 0;
    }
    this.angle = clamp(this.vy / 900, -0.6, 0.6) * this.facing;
    if (t.waterAt(this.x, this.y)) {
      this.mode = 'swim';
      this.paddling = !this.amphibious && !this.aquatic;
      this.vy *= 0.2;
      w.splash(this.x, t.waterSurfY(this.x), 0.6);
      return;
    }
    const gy = this.groundAt(w, this.x);
    if (this.y >= gy && this.vy > 0) {
      this.y = gy;
      this.landT = 0.22;
      this.vx = 0;
      this.vy = 0;
      this.mode = this.def.stages[this.def.stageIndex[this.stage]]?.loco === 'crawl' ? 'crawl' : 'walk';
      this.pose = 'idle';
      this.path = null;
    }
  }

  takeOff() {
    if (!this.canFly) return;
    this.mode = 'fly';
    this.climb = null;
    // straight up and away, like lifting off a leaf
    this.vy = -this.def.speed.fly * 0.9;
    this.vx = this.facing * this.def.speed.fly * 0.2;
    this.liftT = 0.5;
    this.cruise = null;
  }

  land(w) {
    // drop to the ground below as a walker
    this.mode = 'walk';
    this.vx = this.vy = 0;
    this.soarT = 0;
    this.y = this.groundAt(w, this.x);
  }

  // How high this flyer likes to travel, picked fresh for each trip: up near
  // the lid for butterflies and dragonflies, flower height for bees, down
  // low for fireflies and fruit flies.
  cruiseHeight(w) {
    const F = flightOf(this.sp);
    if (F.top != null) return rrange(F.top, F.top + F.band);
    return airFloor(w.terrain, this.x) - rrange(F.low[0], F.low[1]);
  }

  moveFly(w, dt) {
    const t = w.terrain;
    const F = flightOf(this.sp);
    let sp = (this.def.speed.fly || 30) * this.speedFactor();
    const tg = this.target;
    if (tg && tg.speedMul) sp *= tg.speedMul;
    const tp = this.targetPos(w);
    let tx;
    let ty;
    // somewhere it means to touch down (a flower, a snack, a perch)
    const settle = tg && (tg.kind === 'plant' || tg.kind === 'food' || tg.ground || tg.near || tg.kind === 'creature');
    if (tp) {
      tx = tp[0];
      ty = tp[1];
      if (tg.kind === 'food' || (tg.kind === 'point' && tg.ground)) ty -= this.foot + 2;
    } else {
      tx = this.x + this.facing * 30;
      ty = this.cruise ? this.cruise.y : this.y;
    }
    if (!this.cruise || this.cruise.for !== tg) this.cruise = { for: tg, y: this.cruiseHeight(w) };
    const dxT = tx - this.x;
    // On a long trip, climb up to cruising height first and only come down
    // near the end, so flights arc over the tank instead of skimming it.
    if (Math.abs(dxT) > F.reach) ty = Math.min(ty, this.cruise.y + Math.abs(dxT) * 0.04);
    // Look ahead: keep clear of the ground (and the water) under the way
    // it's going, so hills and banks are flown over, not into.
    const ahead = clamp(this.vx * 0.9, -90, 90);
    const floor = Math.min(airFloor(t, this.x), airFloor(t, this.x + ahead), airFloor(t, this.x + ahead * 2)) - F.clear;
    const dGoal = tp ? Math.hypot(tx - this.x, ty - this.y) : 999;
    if (!(settle && dGoal < F.clear + 40) && ty > floor) ty = floor;
    ty = Math.max(ty, CEIL);
    let dx = tx - this.x;
    let dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const arrive = Math.min(1, d / 40);
    // a heading of its own that wanders, so flights loop and curve
    this.wan = clamp(this.wan + (Math.random() - 0.5) * dt * 5 - this.wan * dt * 0.2, -1, 1);
    const off = this.wan * F.curve * clamp((d - 20) / 90, 0, 1);
    const ux = (dx / d) * Math.cos(off) - (dy / d) * Math.sin(off);
    const uy = (dx / d) * Math.sin(off) + (dy / d) * Math.cos(off);
    // Butterflies and moths flap, then glide on open wings for a moment,
    // sinking gently; a dragonfly stops dead now and then to hover.
    if (this.soarT > 0) this.soarT -= dt;
    else if (F.glide && d > 60 && this.liftT <= 0 && Math.random() < dt * F.glide) this.soarT = rrange(0.4, 1.3);
    const gliding = this.soarT > 0;
    let thrust = gliding ? 0.8 : 1;
    if (F.dart) {
      this.hoverT = (this.hoverT || 0) - dt;
      if (this.hoverT < -rrange(1.5, 4) && d > 50 && Math.random() < dt * 2) this.hoverT = rrange(0.35, 1.1);
      if (this.hoverT > 0) thrust = 0.06;
    }
    let dvx = ux * sp * Math.max(0.25, arrive) * thrust;
    let dvy = uy * sp * Math.max(0.25, arrive) * thrust;
    if (gliding && dvy > -sp * 0.2) dvy += sp * 0.12;
    // the flutter of beating wings
    const wob = F.wob * (gliding ? 0.25 : 1);
    dvy += Math.sin(w.time * 6 + this.id * 1.7) * sp * wob;
    dvx += Math.cos(w.time * 3.1 + this.id) * sp * wob * 0.4;
    // butterflies jink about
    if (F.jink && !gliding && Math.random() < dt * F.jink) {
      this.vx += rrange(-0.6, 0.6) * sp;
      this.vy += rrange(-0.7, 0.4) * sp;
    }
    // warm air rises under a heat lamp: light flyers drift up in it
    if (F.thermal) {
      const lamp = w.env.lampAt(this.x);
      const k = lamp.power * (1 - smoothstep(20, 110, Math.abs(this.x - lamp.x)));
      if (k > 0.05 && this.y > CEIL + 30) dvy -= k * sp * F.thermal;
    }
    // and anything light gets pushed by a gust
    dvx += breeze.wind(this.x) * sp * F.wind;
    // just off the ground: lift!
    if (this.liftT > 0) {
      this.liftT -= dt;
      dvy = Math.min(dvy, -sp * 0.7);
    }
    // obstacle avoidance: never into the ground or the water
    const px = this.x + this.vx * 0.3;
    const py = this.y + this.vy * 0.3 + 4;
    if (t.solidAt(px, py) || t.waterAt(px, py)) {
      dvy = -sp;
      dvx *= 0.3;
    }
    const ground = airFloor(t, this.x);
    if (this.y > ground - 6 && !(settle && dGoal < 14)) dvy = Math.min(dvy, -sp * 0.6);
    // soft walls: the glass and the lid
    if (this.x < 24) dvx += sp * (24 - this.x) / 12;
    if (this.x > W - 24) dvx -= sp * (this.x - W + 24) / 12;
    if (this.y < CEIL) dvy += sp * (CEIL - this.y) / 12;
    const k = Math.min(1, dt * F.agile);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 6, W - 6);
    this.y = clamp(this.y + this.vy * dt, 8, H - 8);
    if (Math.abs(this.vx) > 2) this.facing = this.vx > 0 ? 1 : -1;
    // bank into turns and tip up as it climbs
    this.angle = clamp(this.vy / sp, -0.6, 0.6) * F.tilt * this.facing;
    this.moving = true;
    if (tp && d < 4 + this.size * 0.15) {
      if (tg.kind === 'plant') {
        this.climb = { plant: tg.plant, slot: tg.slot, t: 1, dir: 0 };
        this.mode = 'climb';
        this.soarT = 0;
        this.arrived = true;
      } else if (tg.kind === 'food' || tg.ground) {
        this.land(w);
        this.arrived = true;
      } else this.arrived = true;
    }
    if (t.waterAt(this.x, this.y)) {
      this.mode = 'swim';
      this.paddling = true;
    }
  }

  moveSwim(w, dt) {
    const t = w.terrain;
    const wl = t.waterSurfY(this.x);
    if (!t.waterAt(this.x, this.y)) {
      // left the water (drained or jumped)
      if (this.y < wl + 2 && t.waterAt(this.x, wl + 6)) {
        this.y = wl + 6;
      } else if (this.aquatic) {
        this.mode = 'air';
        this.vx = 0;
        this.vy = 0;
        return;
      } else {
        this.mode = 'walk';
        this.paddling = false;
        this.y = this.groundAt(w, this.x);
        return;
      }
    }
    if (this.inside) {
      // tucked up in a hidey-hole: stay put
      this.vx = this.vy = 0;
      this.moving = false;
      return;
    }
    let sp = (this.def.speed.swim || this.def.speed.walk * 2 || 20) * this.speedFactor() * (this.paddling ? 0.8 : 1);
    if (this.target && this.target.speedMul) sp *= this.target.speedMul;
    let tp = this.targetPos(w);
    // a shrimp's swim is a hop: once it gets there (or has nowhere to go) it
    // drifts back down to settle on the floor
    if (this.aquatic && this.stageDef.loco === 'walk' && (!tp || this.arrived)) {
      this.vx *= 1 - Math.min(1, dt * 2.5);
      this.vy = Math.min(this.vy + 70 * dt, 24);
      const gy = this.groundAt(w, this.x);
      const ny = this.y + this.vy * dt;
      if (ny >= gy || !t.waterAt(this.x, ny)) {
        // (never settle anywhere dry, like a pocket against the rocks: drift
        // on out toward the open water instead)
        if (!t.waterAt(this.x, t.surfaceY(this.x) - 2)) {
          const dir = this.x < ZONE_MID.pond ? 1 : -1;
          if (t.waterAt(this.x + dir * 3, this.y)) this.x += dir * 20 * dt;
          else if (t.waterAt(this.x, this.y - 3)) this.y -= 10 * dt;
          this.vy = 0;
          return;
        }
        this.y = Math.min(gy, this.y + this.vy * dt);
        if (this.y >= gy - 0.5 || !t.waterAt(this.x, ny)) {
          this.y = gy;
          this.mode = 'walk';
          this.vx = this.vy = 0;
          this.landT = 0.18;
        }
        return;
      }
      this.y = ny;
      if (t.waterAt(this.x + this.vx * dt, this.y)) this.x += this.vx * dt;
      this.angle += angleDiff(this.angle, 0.25 * this.facing) * Math.min(1, dt * 4);
      this.moving = false;
      return;
    }
    // an amphibian in water too small to swim in (a puddle, the reeds'
    // pocket) wades along the bottom instead
    if (this.amphibious && !this.roomToSwim(t, this.x)) {
      this.mode = 'walk';
      this.y = this.groundAt(w, this.x);
      this.vx = this.vy = 0;
      return;
    }
    // non-swimmers and amphibians heading to land: make for the shore
    let wantLand = false;
    if (this.paddling) wantLand = true;
    // an amphibian that's got itself stuck (in a pool with no way through to
    // where it's going, say) climbs out and walks round instead
    else if (!this.aquatic && this.memory.ashore > w.time) wantLand = true;
    else if (tp && (this.amphibious || !this.aquatic) && !t.waterAt(tp[0], tp[1]) && tp[1] < wl + 30) wantLand = true;
    if (wantLand) {
      const shore = w.nearestShore(this.x, tp ? tp[0] : this.x);
      if (shore) tp = [shore, wl + 3];
      else if (!tp) tp = [this.x, wl + 3];
    }
    // The whole body belongs under the water, not just its middle: a spot
    // too near the floor or the surface is taken as the nearest spot the
    // body fits (a fish gulping air, begging or coming up to breathe pokes
    // its nose up to the top, of course).
    const body = wantLand || this.paddling ? null : this.swimBody();
    const b = this.brain.b;
    const atTop = this.pose === 'gasp' || (b && (b.id === 'beg' || b.id === 'breathe'));
    const topY = wl + (atTop || !body ? 3 : body[1] + 1);
    if (tp && body) tp = fitSpot(t, tp[0], tp[1], body[0], body[1], topY, !this.target || this.target.kind === 'point');
    let tx;
    let ty;
    if (tp) {
      // round a corner (along a channel, into a flooded tunnel) by way of a
      // route through the water; anywhere in plain sight, straight there
      const way = wantLand ? tp : this.swimRoute(w, tp);
      tx = way[0];
      ty = way[1];
    } else {
      tx = this.x + this.facing * 15;
      ty = this.y;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const dGoal = tp ? Math.hypot(tp[0] - this.x, tp[1] - this.y) : d;
    if (!this.aquatic && !wantLand && tp && dGoal > 30) {
      // getting nowhere for a few seconds? (checked every 1.5s)
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 1.5) {
        this.stuckT = 0;
        const moved = this.stuckX == null ? Infinity : Math.hypot(this.x - this.stuckX, this.y - this.stuckY);
        this.stuckN = moved < 5 ? (this.stuckN || 0) + 1 : 0;
        this.stuckX = this.x;
        this.stuckY = this.y;
        if (this.stuckN >= 2) {
          this.stuckN = 0;
          this.memory.ashore = w.time + 25;
        }
      }
    }
    // Tail beats: fish and tadpoles swim in little bursts and coast in
    // between (now and then darting off), a turtle in slow strong strokes.
    let thrust = 1;
    if (!this.paddling && (this.aquatic || this.sp === 'turtle')) {
      if (this.burst > 0) {
        this.burst -= dt;
        thrust = this.sp === 'turtle' ? 1.3 : 1.75;
      } else {
        this.glide -= dt;
        thrust = this.sp === 'turtle' ? 0.6 : 0.5;
        if (this.glide <= 0) {
          const dart = this.sp !== 'turtle' && Math.random() < 0.06 + this.traits.curious * 0.06;
          this.burst = dart ? rrange(0.45, 0.7) : this.sp === 'turtle' ? rrange(0.5, 0.9) : rrange(0.2, 0.45);
          this.glide = (this.sp === 'turtle' ? rrange(0.8, 1.8) : rrange(0.3, 1.5)) * (0.7 + this.traits.lazy * 0.6) / this.tempo;
          if (dart) this.wan = clamp(this.wan + rrange(-1.2, 1.2), -1, 1);
        }
      }
    }
    // its own heading wanders, so it swims in curves instead of beelines
    // (straightening out as it gets close)
    this.wan = clamp(this.wan + (Math.random() - 0.5) * dt * 4 - this.wan * dt * 0.15, -1, 1);
    const off = this.wan * 0.85 * clamp((d - 14) / 70, 0, 1);
    const co = Math.cos(off);
    const so = Math.sin(off);
    const ux = (dx / d) * co - (dy / d) * so;
    const uy = (dx / d) * so + (dy / d) * co;
    const want = sp * Math.min(1, d / 30 + 0.2) * thrust;
    let dvx = ux * want;
    let dvy = uy * want;
    if (this.def.schools && this.school && this.school.n > 0) {
      // a loose shoal: how keen each fish is on company comes and goes
      const s = this.school;
      const keen = 0.45 + 0.55 * Math.sin(w.time * 0.05 + this.id * 1.9) ** 2;
      dvx += ((s.cx - this.x) * 0.1 + s.vx * 0.3) * keen - s.sepx * 1.2;
      dvy += ((s.cy - this.y) * 0.1 + s.vy * 0.3) * keen - s.sepy * 1.2;
    }
    if (this.sp === 'frog' && this.stage === 'tadpole') dvy += Math.sin(w.time * 9 + this.id) * sp * 0.25;
    const k = Math.min(1, dt * 2.5);
    this.vx += (dvx - this.vx) * k;
    this.vy += (dvy - this.vy) * k;
    // the pond's slow current carries everyone along a little
    breeze.current(this.x, this.y, XY);
    // (holding station takes some finning, so a dozing fish barely drifts)
    const drift = this.paddling ? 0.9 : this.arrived ? 0.12 : 0.55;
    let nx = this.x + (this.vx + XY[0] * drift) * dt;
    let ny = this.y + (this.vy + XY[1] * drift) * dt;
    this.beat += dt * (1.2 + 9 * clamp(Math.hypot(this.vx, this.vy) / Math.max(1, sp), 0, 1.4) * (thrust > 1 ? 1.4 : 0.8));
    if (ny < topY) ny = topY;
    if (body) {
      const c = clearOfGround(t, nx, ny, body[0], body[1], topY, dt);
      nx = c[0];
      ny = c[1];
    }
    if (!t.waterAt(nx, ny)) {
      // shore exit for land-goers
      if (wantLand && Math.abs(this.y - (wl + 3)) < 8) {
        const sy = t.surfaceY(nx);
        if (sy < wl + 6 && !t.waterAt(nx, sy - 2)) {
          this.x = nx;
          this.mode = 'walk';
          this.paddling = false;
          this.y = this.groundAt(w, nx);
          this.vx = this.vy = 0;
          return;
        }
      }
      if (t.waterAt(nx, this.y)) ny = this.y;
      else if (t.waterAt(this.x, ny)) nx = this.x;
      else {
        nx = this.x;
        ny = this.y;
        this.vx *= -0.4;
        this.vy *= -0.4;
        this.blocked = true;
      }
    }
    this.x = nx;
    this.y = ny;
    if (Math.abs(this.vx) > 1.5) this.facing = this.vx > 0 ? 1 : -1;
    const a = Math.atan2(this.vy, Math.abs(this.vx) + 6) * 0.6 * this.facing;
    this.angle += angleDiff(this.angle, a) * Math.min(1, dt * 5);
    if (tp && dGoal < 3 + this.size * 0.3) {
      if (this.target && this.target.kind === 'plant' && this.canClimb) {
        this.climb = { plant: this.target.plant, slot: this.target.slot, t: 1, dir: 0 };
        this.mode = 'climb';
      }
      this.arrived = true;
    }
  }

  // The next point to steer for on the way to tp: tp itself if there's open
  // water all the way, otherwise the next turn of a route through the water.
  swimRoute(w, tp) {
    const t = w.terrain;
    const tg = this.target;
    if (tg !== this.navFor || (tg && tg.kind === 'creature' && w.time > this.navT) || (this.blocked && w.time > this.navT)) {
      this.navFor = tg;
      this.navT = w.time + 2;
      this.nav = null;
      this.navI = 0;
      this.blocked = false;
      if (t.waterAt(tp[0], tp[1]) && !lineOfWater(t, this.x, this.y, tp[0], tp[1], CELL)) {
        const p = findWaterPath(t, Math.floor(this.x / CELL), Math.floor(this.y / CELL), Math.floor(tp[0] / CELL), Math.floor(tp[1] / CELL), 5000);
        if (p && p.length > 3) {
          const pts = [];
          for (let i = 2; i < p.length - 1; i += 2) pts.push((p[i] % GW) * CELL + CELL / 2, ((p[i] / GW) | 0) * CELL + CELL / 2);
          this.nav = pts;
        }
      }
    }
    const nav = this.nav;
    if (!nav) return tp;
    const n = nav.length >> 1;
    // reached this turn: on to the next (and skip any already in plain sight)
    while (this.navI < n && Math.hypot(nav[this.navI * 2] - this.x, nav[this.navI * 2 + 1] - this.y) < 9) this.navI++;
    if (this.navI < n - 3 && lineOfWater(t, this.x, this.y, nav[(this.navI + 3) * 2], nav[(this.navI + 3) * 2 + 1], CELL)) this.navI += 3;
    if (this.navI >= n) {
      this.nav = null;
      return tp;
    }
    XY[0] = nav[this.navI * 2];
    XY[1] = nav[this.navI * 2 + 1];
    return XY;
  }

  // Pond snails glide about on the glass of the tank, anywhere in the
  // water, and hang upside down under its skin, just like aquarium snails.
  moveGlass(w, dt) {
    const t = w.terrain;
    if (!t.waterAt(this.x, this.y)) {
      // the water's gone from round it (or it reached the very top)
      if (t.waterAt(this.x, this.y + 4)) this.y += 4;
      else {
        this.mode = 'walk';
        this.y = this.groundAt(w, this.x);
        return;
      }
    }
    if (this.inside) return;
    const tp = this.targetPos(w);
    let moving = false;
    let want = this.angle;
    if (tp && !this.arrived) {
      const tx = tp[0];
      const ty = Math.max(tp[1], t.waterSurfY(tp[0]) + 3);
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const floorY = this.groundAt(w, this.x);
      if (d < 2 + this.size * 0.2) {
        this.arrived = true;
        if (ty >= this.groundAt(w, tx) - 3) {
          this.mode = 'walk';
          this.y = this.groundAt(w, this.x);
          return;
        }
      } else {
        const step = Math.min(d, this.walkSpeed() * this.speedFactor() * 1.25 * dt);
        let nx = this.x + (dx / d) * step;
        let ny = Math.min(this.y + (dy / d) * step, floorY);
        if (!t.waterAt(nx, ny)) {
          if (t.waterAt(nx, this.y)) ny = this.y;
          else if (t.waterAt(this.x, ny)) nx = this.x;
          else {
            nx = this.x;
            ny = this.y;
            this.blocked = true;
          }
        }
        if (nx !== this.x || ny !== this.y) moving = true;
        this.x = nx;
        this.y = ny;
        if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
        // the body turns the way it's gliding
        want = Math.atan2(dy * this.facing, dx * this.facing);
        // back on the floor and heading along it: walking again
        if (ny >= floorY - 0.5 && ty >= this.groundAt(w, tx) - 3) {
          this.mode = 'walk';
          this.y = floorY;
          return;
        }
      }
    }
    // hanging under the water's skin, a snail turns right over
    if (!moving && this.y < t.waterSurfY(this.x) + 6) want = Math.PI * 0.92;
    this.angle += angleDiff(this.angle, want) * Math.min(1, dt * 3);
    this.moving = moving;
  }

  startClimb(plant, slot) {
    this.mode = 'climb';
    this.climb = { plant, slot, t: 0, dir: 1 };
  }

  climbPoint(t) {
    const c = this.climb;
    const s = c.slot;
    const pts = [[0, 0], [s.ax, s.ay], [s.x, s.y]];
    const l1 = Math.hypot(s.ax, s.ay);
    const l2 = Math.hypot(s.x - s.ax, s.y - s.ay);
    const L = l1 + l2 || 1;
    const d = t * L;
    let lx;
    let ly;
    let ang;
    if (d <= l1 && l1 > 0.01) {
      const u = d / l1;
      lx = pts[1][0] * u;
      ly = pts[1][1] * u;
      ang = Math.atan2(s.ay, s.ax || 0.0001);
    } else {
      const u = l2 > 0 ? (d - l1) / l2 : 1;
      lx = s.ax + (s.x - s.ax) * u;
      ly = s.ay + (s.y - s.ay) * u;
      ang = Math.atan2(s.y - s.ay, s.x - s.ax || 0.0001);
    }
    return { lx, ly, ang, L };
  }

  moveClimb(w, dt) {
    const c = this.climb;
    if (!c || !c.plant || c.plant.removed || (c.plant.dead && c.plant.witherT > 5)) {
      this.climb = null;
      this.mode = this.aquatic ? 'swim' : 'air';
      this.vx = this.vy = 0;
      return;
    }
    const tg = this.target;
    const sameSlot = tg && tg.kind === 'plant' && tg.plant === c.plant && tg.slot === c.slot;
    if (tg && !sameSlot) {
      if (this.canFly && this.isAdult) {
        this.takeOff();
        return;
      }
      if (tg.kind === 'plant' && tg.plant === c.plant && c.t <= 0.05) {
        c.slot = tg.slot;
      }
      c.dir = -1;
    } else if (sameSlot) {
      c.dir = 1;
    } else c.dir = 0;
    const { L } = this.climbPoint(c.t);
    const sp = (this.def.speed.walk || 6) * this.speedFactor();
    c.t = clamp(c.t + (c.dir * sp * dt) / Math.max(4, L), 0, 1);
    const { lx, ly, ang } = this.climbPoint(c.t);
    let bob = 0;
    if (c.plant.def.place === 'surface' && c.t > 0.9) bob = Math.sin(w.time * 1.2 + c.slot.i) * 0.8;
    c.plant.toWorld(lx, ly, w.time, XY);
    this.x = XY[0];
    this.y = XY[1] + bob - (c.t > 0.95 ? this.foot * 0.8 : 0);
    const moving = c.dir !== 0 && c.t > 0 && c.t < 1;
    this.moving = moving;
    let want = 0;
    if (moving) {
      want = ang + (c.dir < 0 ? Math.PI : 0);
      this.facing = Math.cos(want) >= 0 ? 1 : -1;
      want = this.facing > 0 ? want : want - Math.PI;
      want = clamp(angleDiff(0, want), -1.4, 1.4);
    }
    this.angle += angleDiff(this.angle, want) * Math.min(1, dt * 6);
    if (sameSlot && c.t >= 1) this.arrived = true;
    if (c.dir < 0 && c.t <= 0) {
      this.climb = null;
      if (this.aquatic || c.plant.def.aquatic) {
        this.mode = this.aquatic ? (this.stageDef.loco === 'walk' ? 'walk' : 'swim') : 'swim';
      } else if (this.stageDef.loco === 'crawl') {
        this.mode = 'crawl';
        this.path = null;
      } else {
        this.mode = 'walk';
        this.y = this.groundAt(w, this.x);
      }
    }
  }

  moveBurrow(w, dt) {
    const t = w.terrain;
    const tp = this.targetPos(w);
    const sp = (this.def.speed.walk || 5) * this.speedFactor();
    let ang = Math.atan2(this.vy, this.vx || 0.001);
    if (tp) {
      const want = Math.atan2(tp[1] - this.y, tp[0] - this.x);
      ang += clamp(angleDiff(ang, want), -2 * dt, 2 * dt);
      if (Math.hypot(tp[0] - this.x, tp[1] - this.y) < 6) this.arrived = true;
    } else ang += Math.sin(w.time * 0.7 + this.id) * dt;
    ang += Math.sin(w.time * 2 + this.id) * dt * 0.8;
    let nx = this.x + Math.cos(ang) * sp * dt;
    let ny = this.y + Math.sin(ang) * sp * dt;
    const m = t.matAt(nx, ny);
    const gy = t.surfaceY(nx);
    const surfacing = tp && tp[1] < gy + 2;
    const okSoil = m === 1 || m === 2; // sand or soil
    const okSurface = surfacing && ny >= gy - 3 && ny < gy + 4;
    if (!(okSoil || okSurface) || nx < 6 || nx > W - 6 || ny > H - 6) {
      ang += Math.PI * (0.5 + Math.random() * 0.5);
      nx = this.x;
      ny = this.y;
      this.blocked = true;
    }
    this.vx = Math.cos(ang) * sp;
    this.vy = Math.sin(ang) * sp;
    this.x = nx;
    this.y = ny;
    this.facing = this.vx >= 0 ? 1 : -1;
    // trailing body
    const b = this.body;
    const seg = 3.2 * (this.stage === 'baby' ? 0.6 : 1);
    if (b) {
      b[0].x = this.x;
      b[0].y = this.y;
      for (let i = 1; i < b.length; i++) {
        const p = b[i - 1];
        const q = b[i];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dd = Math.hypot(dx, dy) || 1;
        if (dd > seg) {
          q.x = p.x + (dx / dd) * seg;
          q.y = p.y + (dy / dd) * seg;
        }
      }
    }
    this.moving = true;
  }

  moveCrawl(w, dt) {
    // ants: glide along a smoothed path, feet on whatever they're walking on
    const t = w.terrain;
    if (this.paddle(w, dt)) return;
    // (every other step is plenty while walking; resting ants, every fourth)
    this.feelK = (this.feelK || 0) + 1;
    if (this.feelK % (this.moving ? 2 : 4) === 0) this.feelSurface(t, this.moving ? dt * 2 : dt * 4);
    const pts = this.pts;
    if (this.pauseT > 0) {
      // stopped to touch antennae with a nestmate
      this.pauseT -= dt;
      this.moving = false;
      this.spd = 0;
      return;
    }
    if (!this.path || !pts || this.ptI * 2 >= pts.length) {
      // settle on a walkable cell
      const cx = Math.floor(this.x / CELL);
      const cy = Math.floor(this.y / CELL);
      if (!t.walkable(cx, cy)) {
        if (t.solid(cx, cy)) this.y -= CELL; // buried: wriggle up
        else if (!t.solid(cx, cy + 1)) this.y += 90 * dt; // nothing to hold: fall
      }
      this.moving = false;
      this.spd = 0;
      if (this.target && !this.path) this.arrived = false;
      return;
    }
    // ease into a scurry; ants walk in little pulses
    // (a queen processes along at a stately pace)
    const top = this.walkSpeed() * this.speedFactor() * (this.stage === 'queen' ? 0.45 : 1);
    const want = top * (0.84 + 0.16 * Math.sin(this.anim * 7 + this.id));
    this.spd = Math.min(want, this.spd + top * 6 * dt);
    let step = this.spd * dt;
    let mvx = 0;
    let mvy = 0;
    const n = pts.length >> 1;
    while (step > 0 && this.ptI < n) {
      const tx = pts[this.ptI * 2];
      const ty = pts[this.ptI * 2 + 1];
      if (this.ptChecked !== this.ptI) {
        // the ground may have been dug or filled since the path was planned
        this.ptChecked = this.ptI;
        if (!t.walkable(Math.floor(tx / CELL), Math.floor(ty / CELL))) {
          this.path = null;
          this.pts = null;
          this.repath = true;
          return;
        }
      }
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= step) {
        this.x = tx;
        this.y = ty;
        mvx += dx;
        mvy += dy;
        step -= d;
        this.ptI++;
        if (this.ptI >= n) {
          this.path = null;
          this.pts = null;
          this.arrived = true;
        }
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        mvx += (dx / d) * step;
        mvy += (dy / d) * step;
        step = 0;
      }
    }
    // ants keep track of where they've been, and food carriers leave a
    // scent trail home
    const idx = Math.floor(this.y / CELL) * GW + Math.floor(this.x / CELL);
    if (idx !== this.lastCell) {
      this.lastCell = idx;
      const col = w.colony(this.colonyId);
      if (col) {
        col.visit(idx % GW, (idx / GW) | 0, w.time);
        if (this.carry === 'food') col.mark(idx);
      }
    }
    if (mvx || mvy) {
      // face the way we're going, along the surface we're standing on
      const a = Math.atan2(this.nx, -this.ny);
      const dot = (mvx * Math.cos(a) + mvy * Math.sin(a)) / (Math.hypot(mvx, mvy) || 1);
      if (dot > 0.3) this.facing = 1;
      else if (dot < -0.3) this.facing = -1;
    }
    this.moving = true;
    this.greet(w, dt);
  }

  // Which way is "up" for a crawler: away from the ground around it, with a
  // nudge toward real up. Ants stand on floors, cling to walls and walk
  // upside down along ceilings, and the body turns smoothly between them.
  feelSurface(t, dt) {
    const cx = Math.floor(this.x / CELL);
    const cy = Math.floor(this.y / CELL);
    let gx = 0;
    let gy = 0;
    let any = false;
    for (let k = 0; k < 8; k++) {
      if (!t.ground(cx + PROBE_X[k], cy + PROBE_Y[k])) continue;
      gx -= PROBE_X[k] * PROBE_W[k];
      gy -= PROBE_Y[k] * PROBE_W[k];
      any = true;
    }
    if (any) {
      gy -= 0.35;
      const L = Math.hypot(gx, gy) || 1;
      const k = Math.min(1, dt * 9);
      this.nx += (gx / L - this.nx) * k;
      this.ny += (gy / L - this.ny) * k;
      const L2 = Math.hypot(this.nx, this.ny) || 1;
      this.nx /= L2;
      this.ny /= L2;
    }
    this.angle += angleDiff(this.angle, Math.atan2(this.nx, -this.ny)) * Math.min(1, dt * 10);
  }

  // Two nestmates passing each other often stop for a moment, face to
  // face, to touch antennae and swap news (and smells).
  greet(w, dt) {
    if (this.sp !== 'ant' || this.carry === 'sand') return;
    if ((this.greetT = (this.greetT || 0) - dt) > 0) return;
    this.greetT = 0.9;
    if ((this.greetCD || 0) > w.time || !chance(0.7)) return;
    greeter = this;
    greetNow = w.time;
    const o = w.hashC.nearest(this.x, this.y, 8, canGreet);
    greeter = null;
    if (!o) return;
    const p = rrange(0.35, 0.9);
    this.pauseT = p;
    o.pauseT = p;
    this.greetCD = o.greetCD = w.time + rrange(6, 12);
    const a = Math.atan2(this.nx, -this.ny);
    const along = (o.x - this.x) * Math.cos(a) + (o.y - this.y) * Math.sin(a);
    this.facing = along >= 0 ? 1 : -1;
    o.facing = -this.facing;
  }

  // Caught by water (a flood, or a tunnel dug into the pond): float up to
  // the surface and paddle to the nearest dry footing. Returns true while
  // that's all this crawler can do.
  paddle(w, dt) {
    const t = w.terrain;
    const cx = Math.floor(this.x / CELL);
    const cy = Math.floor(this.y / CELL);
    const wet = t.isWater(cx, cy);
    const onWater = !wet && t.isWater(cx, cy + 1) && !t.walkable(cx, cy);
    if (!wet && !onWater) {
      if (this.memory.shore) this.memory.shore = null;
      return false;
    }
    this.path = null;
    this.repath = true;
    this.moving = true;
    if (wet && t.isWater(cx, cy - 1)) {
      // still under: bob upward
      this.y -= 26 * dt;
      this.x += Math.sin(w.time * 3 + this.id) * 5 * dt;
      this.angle += angleDiff(this.angle, -0.5 * this.facing) * Math.min(1, dt * 4);
      return true;
    }
    if (!this.memory.shore || (this.memory.shoreT -= dt) <= 0) {
      this.memory.shore = nearestWalkable(t, cx, cy, 24);
      this.memory.shoreT = 0.7;
      if (chance(0.3)) this.emote('!', 0.8);
    }
    const s = this.memory.shore;
    const sy = t.waterSurfY(this.x) - 1;
    this.y += (sy - this.y) * Math.min(1, dt * 6);
    if (s) {
      const tx = s[0] * CELL + CELL / 2;
      const ty = s[1] * CELL + CELL / 2;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const sp = this.walkSpeed() * 0.6 * dt;
      if (d <= sp + 0.5) {
        this.x = tx;
        this.y = ty;
        this.memory.shore = null;
      } else {
        this.x += (dx / d) * sp;
        if (dy < 0) this.y += (dy / d) * sp;
        this.facing = dx >= 0 ? 1 : -1;
      }
    }
    this.angle += angleDiff(this.angle, Math.sin(w.time * 6 + this.id) * 0.15) * Math.min(1, dt * 6);
    return true;
  }

  moveStill(w, dt) {
    const t = w.terrain;
    if (this.climb && this.climb.plant && !this.climb.plant.removed) {
      const { lx, ly } = this.climbPoint(1);
      this.climb.plant.toWorld(lx, ly, w.time, XY);
      this.x = XY[0];
      this.y = XY[1] + (this.pupa ? 9 : 0);
      return;
    }
    if (this.memory.floats) {
      // frogspawn drifts slowly round the pond on the current
      breeze.current(this.x, this.y, XY);
      const nx = this.x + XY[0] * 0.25 * dt;
      if (t.surfaceY(nx) - t.waterLevel > 16 && t.waterAt(nx, this.y + 4)) this.x = nx;
      this.y = t.waterSurfY(this.x) + 3 + Math.sin(w.time + this.id) * 0.6;
      if (!t.waterAt(this.x, this.y)) this.memory.floats = false;
      return;
    }
    if (this.memory.underground) return;
    if (this.inWater && this.aquatic) {
      const fy = t.surfaceY(this.x) - 3;
      if (this.y < fy) this.y = Math.min(fy, this.y + 10 * dt);
      return;
    }
    this.y = this.groundAt(w, this.x);
  }

  distress(w, dt, kind) {
    this.dryT = (this.dryT || 0) + dt;
    if (this.dryT > 1) {
      this.emote('!', 1);
      this.dryT = 0;
    }
    this.health -= dt / 90;
    if (this.health <= 0) this.die(w, 'dry');
  }

  // ------------------------------------------------------------ life
  updateNeeds(w, dt) {
    const d = this.def;
    const st = this.stage;
    if (st === 'egg' || this.pupa) return;
    // metabolism scales with warmth for cold-blooded critters
    let meta = 1;
    if (d.ecto) meta = clamp(0.35 + (this.T - 8) / 22, 0.3, 1.5);
    if (this.dormant) meta *= 0.15;
    const hungerRate = 1 / (this.hungerDays * DAY_LEN);
    this.hunger = Math.min(1, this.hunger + hungerRate * meta * dt * (this.moving ? 1.15 : 0.9));
    // plumpness drifts with how well fed we are
    if (this.hunger < 0.12) this.plump = Math.min(1.45, this.plump + dt * 0.00035);
    else if (this.hunger > 0.6) this.plump = Math.max(0.78, this.plump - dt * 0.0005);
    else this.plump += (1 - this.plump) * dt * 0.00012;
    // energy
    const sleeping = this.pose === 'sleep';
    // (the crickets' night chorus and a nap by the bench both help)
    if (sleeping) this.energy = Math.min(1, this.energy + (dt / (DAY_LEN * 0.12)) * this.restBonus * (1 + w.chorus * 0.5));
    else if (!this.moving && this.mode !== 'fly' && (this.pose === 'idle' || this.pose === 'bask')) this.energy = Math.min(1, this.energy + dt / (DAY_LEN * 0.4));
    else this.energy = Math.max(0, this.energy - (dt / (DAY_LEN * 0.55)) * (this.moving ? 1.2 : 0.7) * (0.7 + this.traits.lazy * 0.6));
    this.fear = Math.max(0, this.fear - dt * 0.35);
    // comfort & health
    const tf = band(this.T, d.temp[0], d.temp[1], d.temp[2], d.temp[3]);
    const mf = d.moist[0] < 0 && d.moist[3] > 1 ? 1 : band(this.M, d.moist[0], d.moist[1], d.moist[2], d.moist[3]);
    let oxy = 1;
    if (d.oxygen && this.inWater) oxy = clamp01((w.env.pond.oxygen - d.oxygen * 0.4) / (d.oxygen * 1.2));
    this.comfort = Math.min(tf, mf, oxy) * (this.shelterBonus || 1) * (this.plump > 1.3 ? 1 - (this.plump - 1.3) * 1.5 : 1);
    this.tf = tf;
    this.mf = mf;
    this.oxy = oxy;
    let dh = 0;
    const lethal = 1 / (DAY_LEN * 0.35);
    if (tf <= 0) dh -= lethal;
    else if (tf < 0.3) dh -= lethal * 0.3 * (0.3 - tf) * 3;
    if (mf <= 0) dh -= lethal * 0.8;
    if (oxy < 0.3) dh -= lethal * (0.3 - oxy) * 3;
    if (this.hunger >= 1) {
      this.hungerT += dt;
      dh -= 1 / (DAY_LEN * 0.9);
    } else this.hungerT = 0;
    if (dh === 0 && this.hunger < 0.7 && this.comfort > 0.5) dh = (0.8 / DAY_LEN) * this.comfort;
    if (w.gentle && dh < 0 && w.awayMode) dh *= 0.1;
    this.health = clamp(this.health + dh * dt, 0, 1);
    if (this.mateCD > 0) this.mateCD -= dt;
    if (this.busyT > 0) this.busyT -= dt;
    if (this.hopCD > 0) this.hopCD -= dt;
    if (this.health <= 0) {
      const cause = tf <= 0.05 ? (this.T < d.temp[1] ? 'cold' : 'hot') : mf <= 0.05 ? 'dry' : oxy < 0.3 ? 'air' : this.hunger >= 1 ? 'hungry' : 'poorly';
      this.die(w, cause);
    }
  }

  updateLife(w, dt) {
    // development speeds up with warmth (cold-blooded), like real tadpoles
    let dev = 1;
    if (this.def.ecto) dev = clamp((this.T - 6) / 18, 0.25, 1.5);
    // (the schoolhouse helps the young grow up twice as fast)
    if (w.has.school && !this.isAdult) dev *= 2;
    this.age += dt;
    this.stageAge += dt * dev;
    if (this.stageAge >= this.stageDur) w.advanceStage(this);
    // the critter clinic adds a third to every life
    const span = this.lifespan * (w.has.clinic ? 1.33 : 1);
    if (this.isAdult && this.age > span && !this.dead) {
      if (!w.awayMode || !w.gentle || this.age > span * 1.15) this.die(w, 'old');
    }
  }

  die(w, cause) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.cause = cause;
    this.pose = 'sleep';
    this.target = null;
    this.carry = null;
    w.onDeath(this, cause);
  }

  serialize() {
    const o = {
      id: this.id,
      sp: this.sp,
      st: this.stage,
      n: this.name,
      sx: this.sex,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      f: this.facing,
      a: Math.round(this.age),
      sa: Math.round(this.stageAge),
      sd: this.stageDur === Infinity ? -1 : Math.round(this.stageDur),
      ls: Math.round(this.lifespan),
      p: this.palIdx,
      ac: this.acc,
      as: this.accSeed,
      tr: this.traits,
      hu: +this.hunger.toFixed(3),
      en: +this.energy.toFixed(3),
      he: +this.health.toFixed(3),
      pl: +this.plump.toFixed(3),
      mc: Math.round(this.mateCD),
      m: this.mode,
    };
    if (this.colonyId) o.col = this.colonyId;
    if (this.role) o.role = this.role;
    if (this.memory.floats) o.fl = 1;
    if (this.memory.underground) o.ug = 1;
    if (this.memory.young) o.yg = this.memory.young;
    if (this.memory.made) o.mk = this.memory.made;
    if (this.memory.dream) o.dr = [this.memory.dream.i, +this.memory.dream.n.toFixed(2)];
    if (this.memory.master) o.ms = this.memory.master;
    if (this.memory.home) o.ho = this.memory.home;
    if (this.carryBrood) o.cb = { s: this.carryBrood.stage, t: Math.round(this.carryBrood.t) };
    if (this.climb && this.climb.plant) o.cl = { p: this.climb.plant.id, k: this.climb.slot.kind, i: this.climb.slot.i };
    return o;
  }

  static load(o) {
    const c = new Creature(o.sp, o.x, o.y, {
      id: o.id,
      stage: o.st,
      name: o.n,
      sex: o.sx,
      facing: o.f,
      age: o.a,
      stageAge: o.sa,
      lifespan: o.ls,
      palIdx: o.p,
      acc: o.ac === undefined ? null : o.ac,
      accSeed: o.as,
      traits: o.tr,
      hunger: o.hu,
      energy: o.en,
      health: o.he,
      plump: o.pl,
      mateCD: o.mc,
      colonyId: o.col,
      role: o.role,
    });
    c.stageDur = o.sd === -1 || o.sd == null ? c.stageDur : o.sd;
    if (o.fl) c.memory.floats = true;
    if (o.ug) c.memory.underground = true;
    if (o.yg) c.memory.young = o.yg;
    if (o.mk) c.memory.made = o.mk;
    if (o.dr) c.memory.dream = { i: o.dr[0], n: o.dr[1] };
    if (o.ms) c.memory.master = o.ms;
    if (o.ho) c.memory.home = o.ho;
    if (o.m && ['walk', 'swim', 'fly', 'crawl', 'burrow', 'still', 'glass'].includes(o.m)) c.mode = o.m;
    c._climbRef = o.cl || null;
    setNextId(o.id + 1);
    return c;
  }
}

export { smoothstep, lerp, chance };
