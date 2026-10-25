// Nothing in nature travels on rails. Every trip a critter sets off on gets
// a character of its own, picked as it sets off and flavoured by what kind
// of critter it is: a goldfish weaves and swings round in long curves, a
// tetra darts in zigzags, a turtle sweeps round in slow arcs, a moth
// meanders and loops, a dragonfly zigzags, a pond snail leaves a wavy trail
// on the glass, and a beetle trundles along, stops for a think and potters
// back a step before carrying on. Some trips really are straight (a short
// hop, a dash for safety or after prey, a starving beeline for supper, a
// gasp for air) and those stay direct.
// The body (entities/creature.js) asks for its course each step: how far to
// turn off the straight line in the water, the air or on the glass, and on
// foot when to stop, how fast to go and when to double back.
import { clamp } from '../util/math.js';
import { rrange, chance } from '../util/rng.js';

const TAU = Math.PI * 2;

// Swimming, flying and gliding on the glass: how often each kind of course
// comes up for a species, how wide it swings (amp) and how long its curves
// are (wave, in tank units).
//   direct: near enough straight there; arc: one long bend to one side;
//   weave: S-curves; meander: a heading that wanders where it likes;
//   zigzag: darting legs this way and that; loop: a loop-the-loop on the way
const PATHS = {
  default: { direct: 1, arc: 2, weave: 2, meander: 2, amp: 1, wave: [70, 150] },
  goldfish: { direct: 1, arc: 2, weave: 3, meander: 2.5, zigzag: 0.3, amp: 1, wave: [60, 150] },
  koi: { direct: 1, arc: 3, weave: 2.5, meander: 1.5, amp: 0.85, wave: [110, 220] },
  guppy: { direct: 0.8, arc: 1, weave: 2, meander: 2, zigzag: 2, loop: 0.5, amp: 1.05, wave: [40, 100] },
  tetra: { direct: 1, arc: 1, weave: 2.5, meander: 1.5, zigzag: 2, loop: 0.3, amp: 0.95, wave: [40, 100] },
  puffer: { direct: 0.6, meander: 3, zigzag: 1.5, weave: 1, amp: 0.9, wave: [30, 80] },
  axolotl: { direct: 2, arc: 2.5, weave: 1, meander: 1, amp: 0.7, wave: [120, 220] },
  turtle: { direct: 1, arc: 3, weave: 1.5, meander: 1, amp: 0.8, wave: [140, 260] },
  frog: { direct: 1.5, arc: 2, weave: 1, meander: 1.5, amp: 0.9, wave: [60, 140] },
  tadpole: { direct: 0.5, meander: 3, weave: 2, zigzag: 0.6, amp: 1.1, wave: [30, 70] },
  shrimp: { direct: 1, arc: 1.5, meander: 2, amp: 0.9, wave: [40, 90] },
  pondsnail: { direct: 1, arc: 2, weave: 2.5, meander: 1, amp: 0.65, wave: [40, 90] },
  butterfly: { direct: 0.3, arc: 1, weave: 2, meander: 3, loop: 1, amp: 1.05, wave: [60, 130] },
  moth: { direct: 0.3, arc: 1, weave: 1, meander: 3, zigzag: 0.6, loop: 1.2, amp: 1.1, wave: [50, 120] },
  dragonfly: { direct: 2, arc: 1, zigzag: 3, amp: 0.8, wave: [80, 160] },
  bee: { direct: 1, arc: 2, weave: 2, meander: 1, loop: 0.4, amp: 0.85, wave: [50, 110] },
  firefly: { direct: 0.5, arc: 1, weave: 2, meander: 2, loop: 1, amp: 1, wave: [40, 100] },
  fruitfly: { direct: 0.3, meander: 2, zigzag: 3, amp: 1.1, wave: [30, 70] },
  ladybug: { direct: 1, arc: 2, weave: 1, meander: 1, amp: 0.8, wave: [60, 130] },
};
const KINDS = ['direct', 'arc', 'weave', 'meander', 'zigzag', 'loop'];

// On foot: how often it stops for a look round (a second), how long for,
// how likely a trip is to have a step back in it (to sniff at something it
// just passed), and how much its pace comes and goes.
const GAITS = {
  default: { stops: 0.14, stop: [0.3, 1.1], back: 0.25, pace: 0.18 },
  gecko: { stops: 0.45, stop: [0.25, 0.9], back: 0.15, pace: 0.35 }, // dash, freeze, dash
  beetle: { stops: 0.12, stop: [0.5, 1.5], back: 0.35, pace: 0.15 },
  cricket: { stops: 0.25, stop: [0.3, 1.2], back: 0.2, pace: 0.25 },
  grasshopper: { stops: 0.25, stop: [0.3, 1.2], back: 0.15, pace: 0.25 },
  snail: { stops: 0.04, stop: [1, 2.5], back: 0.08, pace: 0.08 },
  pondsnail: { stops: 0.05, stop: [1, 2.5], back: 0.1, pace: 0.08 },
  ladybug: { stops: 0.3, stop: [0.3, 1], back: 0.4, pace: 0.22 },
  pillbug: { stops: 0.15, stop: [0.4, 1.2], back: 0.35, pace: 0.15 },
  aphid: { stops: 0.2, stop: [0.5, 1.5], back: 0.1, pace: 0.12 },
  butterfly: { stops: 0.15, stop: [0.5, 1.6], back: 0.1, pace: 0.12 }, // caterpillars
  moth: { stops: 0.15, stop: [0.5, 1.6], back: 0.1, pace: 0.12 },
  frog: { stops: 0.3, stop: [0.4, 1.4], back: 0.1, pace: 0.2 },
  turtle: { stops: 0.1, stop: [0.6, 1.6], back: 0.1, pace: 0.1 },
  shrimp: { stops: 0.4, stop: [0.2, 0.7], back: 0.35, pace: 0.25 },
  dragonfly: { stops: 0.35, stop: [0.4, 1.5], back: 0.2, pace: 0.2 }, // nymphs stalk the bottom
  ant: { stops: 0.18, stop: [0.15, 0.5], back: 0, pace: 0.2 },
};

// Behaviours that are about getting there, now.
const URGENT = { flee: 1, hunt: 1, breathe: 1, beg: 1, chased: 1, hide: 1, clinic: 1 };

function pathsOf(c) {
  if (c.sp === 'frog' && c.stage === 'tadpole') return PATHS.tadpole;
  return PATHS[c.sp] || PATHS.default;
}
export function gaitOf(c) {
  return GAITS[c.sp] || GAITS.default;
}

// Is this trip one to make in a straight line?
function hurried(c, tg) {
  if (!tg) return true;
  if (tg.kind === 'creature') return true; // after (or away from) someone on the move
  if ((tg.speedMul || 1) > 1.15 || c.fear > 0.4 || c.paddling) return true;
  if (c.airDisc > 0.3 || c.pose === 'gasp') return true;
  if (tg.kind === 'food' && c.hunger > 0.8) return true;
  const b = c.brain && c.brain.b;
  return !!(b && URGENT[b.id]);
}

// The course for the trip the critter is on now, set out fresh when it
// starts a new one. dist: how far it has to go.
export function courseFor(c, dist) {
  const tg = c.target;
  const old = c.course;
  if (old && old.for === tg) return old;
  const co = (c.course = { for: tg, tx: tg.x, ty: tg.y, kind: 'direct', age: 0, off: old ? old.off * 0.5 : 0, amp: 0, side: chance(0.5) ? 1 : -1, ph: 0, wave: 100, m: 0, zz: 0, loopAt: 0, loopPh: -1, loopW: 0, travel: 0, dist: dist, stopIn: 0, backAt: 0, back: 0, via: null, look: 0 });
  // (a stop for a look round belonged to the last trip)
  if (c.mode === 'walk') c.pauseT = 0;
  // (a behaviour re-aiming every moment, just along from where it was
  // aiming, is steering for itself: soaring round a lamp, dancing)
  if (old && old.age < 0.6 && tg.kind === 'point' && old.tx != null && Math.hypot(tg.x - old.tx, tg.y - old.ty) < 45) return co;
  if (hurried(c, tg)) return co;
  if (c.mode === 'walk') {
    if (dist < 50) return co;
    const g = gaitOf(c);
    co.kind = 'walk';
    co.stopIn = nextStop(g);
    if (dist > 80 && chance(g.back)) {
      co.backAt = dist * rrange(0.25, 0.75);
      co.back = rrange(10, 34);
    }
    return co;
  }
  if (dist < 40) return co;
  const P = pathsOf(c);
  let r = Math.random() * KINDS.reduce((a, k) => a + (P[k] || 0), 0);
  for (const k of KINDS) {
    if ((r -= P[k] || 0) <= 0) {
      co.kind = k;
      break;
    }
  }
  // (a loop needs room, and a long way to go)
  if (co.kind === 'loop' && dist < 150) co.kind = 'weave';
  const amp = P.amp;
  // (at least a sway or two, even on a short trip)
  co.wave = Math.min(rrange(P.wave[0], P.wave[1]), Math.max(40, dist * 0.7));
  co.ph = Math.random() * TAU;
  if (co.kind === 'arc') co.amp = rrange(0.45, 0.95) * amp;
  else if (co.kind === 'weave') co.amp = rrange(0.5, 0.95) * amp;
  else if (co.kind === 'meander') {
    co.amp = rrange(0.8, 1.2) * amp;
    co.m = rrange(-0.6, 0.6);
  } else if (co.kind === 'zigzag') {
    co.amp = rrange(0.45, 0.85) * amp;
    co.zz = rrange(0.15, 0.6);
  } else if (co.kind === 'loop') {
    co.amp = rrange(0.2, 0.4) * amp;
    co.loopAt = dist * rrange(0.2, 0.55);
    co.loopW = rrange(3, 4.2);
  }
  return co;
}

// Swimming, flying or on the glass: how far (radians) to turn off the
// straight line to where it's heading, d away, having just moved `moved`.
export function courseTurn(c, d, moved, dt) {
  const co = courseFor(c, d);
  co.age += dt;
  co.travel += moved;
  // everyone has a little wobble of their own on top
  c.wan = clamp(c.wan + (Math.random() - 0.5) * dt * 4 - c.wan * dt * 0.3, -1, 1);
  let want = c.wan * 0.22;
  let k = 3;
  switch (co.kind) {
    case 'arc':
      want += co.side * co.amp;
      break;
    case 'weave':
      co.ph += (moved / co.wave) * TAU;
      want += co.amp * Math.sin(co.ph);
      break;
    case 'meander':
      co.m = clamp(co.m + (Math.random() - 0.5) * dt * 7 - co.m * dt * 0.4, -1, 1);
      want += co.m * co.amp;
      break;
    case 'zigzag':
      if ((co.zz -= dt) <= 0) {
        co.side = -co.side;
        co.zz = rrange(0.3, 0.85);
      }
      want += co.side * co.amp;
      k = 7; // (snaps across)
      break;
    case 'loop':
      co.ph += (moved / co.wave) * TAU;
      want += co.amp * Math.sin(co.ph);
      if (co.loopPh < 0 && co.travel > co.loopAt) co.loopPh = 0;
      if (co.loopPh >= 0 && co.loopPh < TAU) {
        // round it goes (a little faster at the top of the loop)
        co.loopPh = Math.min(TAU, co.loopPh + dt * co.loopW);
        want += co.side * co.loopPh;
        if (co.loopPh >= TAU) co.off -= co.side * TAU; // back to the same heading, one turn on
      }
      break;
    default:
      break;
  }
  // straighten out on the final approach (the last stretch of the trip), so
  // it always gets there (a loop already under way is finished first)
  if (!(co.kind === 'loop' && co.loopPh > 0 && co.loopPh < TAU)) want *= clamp((d - 12) / clamp(co.dist * 0.4, 30, 90), 0, 1);
  co.off += (want - co.off) * Math.min(1, dt * k);
  return co.off;
}

// Bumped into something (a wall, the bank): no more fancy swerves this trip.
export function courseBlocked(c) {
  const co = c.course;
  if (co && co.kind !== 'walk') {
    co.kind = 'direct';
    co.loopPh = -1;
  }
}

// A swimmer that darts off sometimes changes its mind about the rest of the
// way, too.
export function courseRethink(c) {
  if (c.course && chance(0.4)) c.course.for = null;
}

function nextStop(g) {
  return g.stops > 0 ? -Math.log(1 - Math.random() * 0.98) / g.stops : 0;
}

// On foot, one step of the trip: returns where to head for right now (a
// step back to sniff at something, or the goal itself), and handles the
// stops for a look round (c.pauseT). goal: the x it's going to.
export function walkCourse(c, goal, dt) {
  const co = courseFor(c, Math.abs(goal - c.x));
  co.age += dt;
  if (co.kind !== 'walk' || c.pauseT > 0) return co.via != null ? co.via : goal;
  const g = gaitOf(c);
  if (co.via != null) {
    if (Math.abs(co.via - c.x) < 2.5) {
      // got back there: a good sniff, then on again
      co.via = null;
      c.pauseT = rrange(g.stop[0], g.stop[1]);
      return goal;
    }
    return co.via;
  }
  const left = Math.abs(goal - c.x);
  if (co.backAt && left < co.backAt) {
    // (never further back than it's come this trip: it knows that ground)
    co.backAt = 0;
    const room = Math.min(co.back, (co.dist - left) * 0.8);
    if (room > 6) {
      co.via = c.x - Math.sign(goal - c.x) * room;
      return co.via;
    }
  }
  if (co.stopIn > 0 && left > 24 && (co.stopIn -= dt) <= 0) {
    co.stopIn = nextStop(g);
    c.pauseT = rrange(g.stop[0], g.stop[1]);
    co.look = chance(0.35) ? c.pauseT * rrange(0.3, 0.7) : 0;
  }
  return goal;
}

// How its pace comes and goes as it goes along (1 = its usual speed).
export function walkPace(c, dt) {
  const g = gaitOf(c);
  c.paceN = clamp((c.paceN || 0) + (Math.random() - 0.5) * dt * 5 - (c.paceN || 0) * dt * 1.2, -1, 1);
  return 1 + c.paceN * g.pace * 1.6;
}
