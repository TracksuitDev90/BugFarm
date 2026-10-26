// Utility-AI brain. Every so often a critter senses its surroundings (local
// temperature, damp, light, nearby food, friends, predators), scores every
// behaviour it knows, and commits to the best one. Personality traits and a
// little noise keep individuals from acting like clones.
import { SPECIES } from '../data/species.js';
import { BEHAVIORS, SPECIES_BEHAVIORS } from './behaviors.js';
import { clamp01, smoothstep } from '../util/math.js';
import { rrange, rpick } from '../util/rng.js';

// Things a critter might simply take a fancy to doing for a while.
const WHIMS = ['wander', 'investigate', 'socialize', 'home', 'idle', 'snack', 'search'];

export const PREDATORS_OF = {};
for (const sp of Object.keys(SPECIES)) {
  for (const prey of SPECIES[sp].prey || []) {
    (PREDATORS_OF[prey] = PREDATORS_OF[prey] || []).push(sp);
  }
}

// How awake a species is right now (0..1) given the time of day.
export function activity(c, w) {
  const a = c.stageDef.activity || c.def.activity;
  const sun = w.env.sun;
  if (a === 'day') return 0.15 + 0.85 * sun;
  if (a === 'night') return 0.2 + 0.8 * (1 - sun);
  if (a === 'dusk') return w.env.isDusk ? 1 : 0.35 + 0.4 * (1 - sun);
  return 0.85;
}

export function sense(c, w) {
  const t = w.terrain;
  const env = w.env;
  c.inWater = t.waterAt(c.x, c.y);
  let T = env.tempAt(c.x, c.y, t);
  let M = env.moistAt(c.x, c.y, t);
  c.shelter = c.inside || (c.mode === 'walk' || c.mode === 'crawl' ? w.shelterAt(c.x, c.y) : null);
  if (c.shelter) {
    // shelters are shady when hot and snug when cold
    if (T > 26) T -= 3 + env.lampAt(c.x).power * 4;
    else if (T < 18) T += 2.5;
    M = Math.min(1, M + 0.12);
  }
  if (c.huddling) T += 3;
  c.T = T;
  c.M = M;
  c.light = env.lightAt(c.x, c.y, t);
  const d = c.def;
  c.tempDisc = T < d.temp[1] ? -smoothstep(d.temp[1], d.temp[0], T) : T > d.temp[2] ? smoothstep(d.temp[2], d.temp[3], T) : 0;
  c.moistDisc = d.moist[0] < 0 && d.moist[3] > 1 ? 0 : M < d.moist[1] ? -smoothstep(d.moist[1], d.moist[0], M) : 0;
  c.airDisc = d.oxygen && c.inWater ? smoothstep(d.oxygen * 1.5, d.oxygen * 0.6, env.pond.oxygen) : 0;
  c.discomfort = Math.max(Math.abs(c.tempDisc), Math.abs(c.moistDisc), c.airDisc);
  c.act = activity(c, w);

  // threats
  c.threat = null;
  const preds = PREDATORS_OF[c.sp];
  if (preds && !c.hidden) {
    const r = d.sight * 0.7;
    const near = w.hashC.nearest(c.x, c.y, r, (o) => o !== c && !o.dead && preds.includes(o.sp) && o.isAdult && o.hunger > 0.3 && o.pose !== 'sleep');
    if (near) {
      c.threat = near;
      const dd = Math.hypot(near.x - c.x, near.y - c.y);
      c.fear = Math.min(1, c.fear + (1 - dd / r) * (1.1 - c.traits.bold * 0.6));
    }
  }
  if (c.sp === 'ladybug') {
    // ants guard their aphid herds
    const ant = w.hashC.nearest(c.x, c.y, 26, (o) => o.sp === 'ant' && !o.dead);
    if (ant) {
      c.threat = ant;
      c.fear = Math.min(1, c.fear + 0.5);
      if (!c.memory.guardT || w.time - c.memory.guardT > 30) {
        c.memory.guardT = w.time;
        w.events.emit('antGuard', { c, ant });
      }
    }
  }
  // schooling info for fish
  if (d.schools) {
    // (keeping out of each other's way is worked out as they swim; see moveSwim)
    const s = c.school || (c.school = { n: 0, cx: 0, cy: 0, vx: 0, vy: 0 });
    s.n = 0;
    s.cx = s.cy = s.vx = s.vy = 0;
    const list = w.hashC.query(c.x, c.y, 90, (o) => o !== c && o.sp === c.sp && !o.dead && o.mode === 'swim');
    for (const o of list) {
      s.n++;
      s.cx += o.x;
      s.cy += o.y;
      s.vx += o.vx;
      s.vy += o.vy;
    }
    if (s.n) {
      s.cx /= s.n;
      s.cy /= s.n;
      s.vx /= s.n;
      s.vy /= s.n;
    }
    s.n = s.n * clamp01(c.traits.social + 0.3);
  }
}

export function think(c, w) {
  sense(c, w);
  const list = SPECIES_BEHAVIORS[c.sp] || SPECIES_BEHAVIORS.default;
  const cur = c.brain.b;
  // A passing fancy: every so often a critter just feels like a stroll, a
  // nose about, a natter or a sit at home. It nudges that one thing up for
  // a while, which knocks it out of its usual rut.
  let wh = c.whim;
  if (!wh || wh.until < w.time) {
    const opts = list.filter((id) => WHIMS.includes(id));
    wh = c.whim = opts.length ? { id: rpick(opts), until: w.time + rrange(25, 80), b: rrange(0.06, 0.2) } : { id: '', until: w.time + 60, b: 0 };
  }
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < list.length; i++) {
    const b = BEHAVIORS[list[i]];
    if (!b) continue;
    if (b.can && !b.can(c, w)) continue;
    const cool = c.memory.cool;
    if (cool && cool[b.id] > w.time) continue;
    let s = b.score(c, w);
    // (an errand under way holds its own against idle thoughts, even once
    // it's put itself on cooldown; anything more pressing still wins)
    if (b === cur && b.hold) s = Math.max(s, b.hold);
    if (s <= 0) continue;
    if (b.id === wh.id) s += wh.b * c.act;
    if (b === cur) s += cur.stick != null ? cur.stick : 0.12; // commitment
    s *= 0.94 + Math.random() * 0.12;
    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  }
  if (!best) best = BEHAVIORS.idle;
  if (best !== cur) {
    if (cur && cur.stop) cur.stop(c, w);
    c.brain.b = best;
    c.brain.t = 0;
    c.brain.data = {};
    c.huddling = false;
    if (c.pose !== 'jump') c.pose = 'idle';
    best.start(c, w);
  }
}

export function tickBrain(c, w, dt) {
  const br = c.brain;
  br.think -= dt;
  br.t += dt;
  if (br.think <= 0 || !br.b) {
    br.think = (0.45 + Math.random() * 0.5) / c.tempo;
    // a running behaviour may ask not to be interrupted
    if (!br.b || !br.b.lock || !br.b.lock(c, w)) think(c, w);
  }
  const b = br.b;
  if (b) {
    const running = b.tick(c, w, dt);
    if (running === false) {
      // something that fails instantly shouldn't be retried every tick
      if (br.t < 0.25) (c.memory.cool || (c.memory.cool = {}))[b.id] = w.time + 2 + Math.random() * 2;
      if (b.stop) b.stop(c, w);
      br.b = null;
      br.think = 0;
    }
    if (b.thought && (br.tt = (br.tt || 0) - dt) <= 0) {
      br.tt = 1;
      c.thought = b.thought(c, w);
    }
  }
}

// Force a behaviour (used by player interactions & courtship).
export function force(c, w, id, data) {
  const b = BEHAVIORS[id];
  if (!b) return;
  const cur = c.brain.b;
  if (cur && cur.stop) cur.stop(c, w);
  c.brain.b = b;
  c.brain.t = 0;
  c.brain.data = data || {};
  c.brain.think = 0.6;
  b.start(c, w);
}
