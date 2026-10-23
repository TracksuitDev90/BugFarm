// Behaviour library. Each behaviour scores how much a critter wants to do it
// right now, then drives the body while it runs.
import { DAY_LEN, W } from '../config.js';
import { JOBS } from '../data/goods.js';
import { clamp, clamp01, smoothstep } from '../util/math.js';
import { rrange, rint, chance, rpick } from '../util/rng.js';
import {
  cachedFood, validFood, findPrey, findMate, wanderTarget, nearestPlantSlot, comfortSpot, lampSpot,
  pickFlower, reachable, preyValue, homeKind, findHome, snugSpot, shelterNear, swimSpot, restSpot,
} from './search.js';

function hungerScore(c) {
  let h = smoothstep(0.16, 0.8, c.hunger);
  if (c.plump > 1.28 && c.hunger < 0.5) h *= 0.35; // stuffed!
  return h * (0.9 + c.traits.greedy * 0.25);
}
function sleepiness(c) {
  return Math.pow(1 - c.energy, 1.5);
}
function zoneWord(w, x) {
  const z = w.env.zoneAt(x);
  return z === 'desert' ? 'the sandy desert' : z === 'pond' ? 'the pond' : 'the jungle';
}
function goTo(c, tgt) {
  if (!tgt) return false;
  c.seek(tgt);
  return true;
}

// A grown-up with a job keeps it in mind while it potters about.
function jobLine(c) {
  const j = JOBS[c.sp];
  if (!j || !j.lines || !c.isAdult || Math.random() < 0.35) return '';
  return rpick(j.lines);
}

// ---- home life
// Set off for a shelter's front door (a flyer lands on the doorstep first).
function headInside(c, d, speedMul) {
  if (c.mode === 'fly') c.seekPoint(d.doorX, d.doorY, { ground: true });
  else if (c.mode === 'swim') c.seekPoint(d.doorX, d.doorY - Math.max(4, c.size * 0.25), speedMul ? { speedMul } : undefined);
  else c.seekPoint(d.doorX + rrange(-1.5, 1.5), d.doorY, speedMul ? { speedMul } : undefined);
}
function atDoor(c, d) {
  return Math.abs(c.x - d.doorX) < 6 + c.size * 0.3 && Math.abs(c.y - d.doorY) < 12 + c.size * 0.5;
}
// Slip inside, out of sight and out of reach, and move in for good if it
// has no home yet and there's a spare bed.
function tuckIn(c, w, d) {
  c.halt();
  c.vx = c.vy = 0;
  c.inside = d;
  c.hidden = true;
  c.peek = 0;
  w.moveIn(c, d);
}
function comeOut(c) {
  if (!c.inside) return;
  c.inside = null;
  c.hidden = false;
  c.peek = 0;
  c.doorT = 1.5;
}
// Awake indoors, a critter now and then pops out onto the doorstep for a
// look round, then ducks back in.
function peekTick(c, dt, d) {
  if (c.peek > 0) {
    c.peek -= dt;
    if (c.peek <= 0) c.hidden = true;
    else if (chance(dt * 0.7)) c.facing = -c.facing;
    return;
  }
  if (c.fear < 0.3 && chance(dt * 0.06 * (0.5 + c.traits.curious))) {
    c.peek = rrange(1.6, 3.4);
    c.hidden = false;
    c.pose = 'idle';
    const side = d.doorX - d.x;
    c.facing = Math.abs(side) > 4 ? (side > 0 ? 1 : -1) : chance(0.5) ? 1 : -1;
  }
}
// Walking to the door, then in. Returns 'in' once inside, 'go' on the way,
// or 'fail' if it can't get there.
function goInside(c, w, d, maxT = 30) {
  if (!d || d.removed) return 'fail';
  if (c.inside === d) return 'in';
  if (c.arrived || atDoor(c, d)) {
    tuckIn(c, w, d);
    return 'in';
  }
  if ((c.blocked && c.mode !== 'fly' && c.mode !== 'swim') || c.brain.t > maxT) return 'fail';
  return 'go';
}
function homeWord(d) {
  return d.def.name.toLowerCase();
}

export const BEHAVIORS = {};
// Make another critter drop what it's doing for this (brain.force does the
// same, but brain.js imports this file).
function switchTo(c, w, id, data) {
  const cur = c.brain.b;
  if (cur && cur.stop) cur.stop(c, w);
  c.brain.b = BEHAVIORS[id];
  c.brain.t = 0;
  c.brain.data = data || {};
  c.brain.think = 0.6;
  BEHAVIORS[id].start(c, w);
}
function def(id, b) {
  b.id = id;
  BEHAVIORS[id] = b;
}

// --------------------------------------------------------------------- idle
def('idle', {
  score: () => 0.07,
  start(c) {
    c.halt();
    c.brain.data.dur = rrange(1.5, 4) / c.tempo;
    c.brain.data.fidget = rrange(0.3, 1.6);
    c.pose = 'idle';
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.mode === 'fly') {
      // hover lazily
      if (!c.target || c.arrived) c.seekPoint(c.x + rrange(-12, 12), c.y + rrange(-8, 8));
      return c.brain.t < d.dur;
    }
    if (c.mode === 'swim') {
      // hang about, finning gently in place
      if (!c.target || c.arrived) c.seekPoint(c.x + rrange(-10, 10), c.y + rrange(-6, 6));
      return c.brain.t < d.dur;
    }
    // little fidgets: a groom, a look round, a shuffle, a hop on the spot
    if (d.groom > 0) {
      d.groom -= dt;
      if (d.groom <= 0) c.pose = 'idle';
    } else if (c.mode === 'walk' && c.target && c.arrived) c.halt();
    d.fidget -= dt;
    if (d.fidget <= 0 && c.mode === 'walk') {
      d.fidget = rrange(0.6, 2) / c.tempo;
      const r = Math.random();
      if (r < 0.3) {
        d.groom = rrange(0.7, 1.6);
        c.pose = 'eat';
      } else if (r < 0.6) c.facing = -c.facing;
      else if (r < 0.8) {
        const x = clamp(c.x + rrange(4, 12) * (chance(0.5) ? 1 : -1), 10, W - 10);
        if (reachable(c, w, x, w.terrain.surfaceY(x) - 3)) c.seekPoint(x, w.terrain.surfaceY(x), { speedMul: 0.6 });
      } else if (c.def.hop && c.hopCD <= 0 && chance(0.6)) c.tryHop(w, chance(0.5) ? 1 : -1, rrange(12, 30));
    } else if (c.mode !== 'walk' && c.mode !== 'climb' && chance(dt * 0.3)) c.facing = -c.facing;
    return c.brain.t < d.dur;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) => jobLine(c) || rpick(['Just looking around.', 'Hmm-hmm-hmm...', 'What a nice day.', 'Thinking about snacks.']),
});

// --------------------------------------------------------------------- wander
// Where to wander next. Most trips are short, but now and then a critter
// sets off on a proper expedition.
function roam(c, w) {
  const far = chance(0.18) ? rrange(1.6, 2.6) : rrange(0.4, 1.1);
  if (c.mode === 'swim') return swimSpot(c, w, (c.sp === 'turtle' ? 200 : 150) * (0.7 + c.traits.curious * 0.6));
  const range = c.mode === 'fly' ? 220 : (60 + c.traits.curious * 140) * far;
  return wanderTarget(c, w, range);
}
def('wander', {
  score: (c) => (0.15 + c.traits.curious * 0.14) * c.act,
  start(c, w) {
    const d = c.brain.data;
    if (!goTo(c, roam(c, w))) d.fail = true;
    d.zone = zoneWord(w, c.x);
    // swimmers string a few legs together rather than stopping after each
    d.legs = c.mode === 'swim' ? rint(1, 4) : 1;
    d.stopIn = rrange(1.5, 6) / c.tempo;
    if (c.mode === 'walk' && c.target) c.target.speedMul = rrange(0.75, 1.2);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.fail) return false;
    if (d.paused > 0) {
      // stopped for a sniff and a look round
      d.paused -= dt;
      if (d.paused <= 0) {
        c.pose = 'idle';
        if (d.resume) c.seek(d.resume);
      }
      return true;
    }
    if (c.arrived) {
      if (--d.legs > 0) {
        if (!goTo(c, roam(c, w))) return false;
        return true;
      }
      d.pause = (d.pause || rrange(0.5, 2.5) / c.tempo) - dt;
      if (c.mode === 'fly' && c.sp !== 'butterfly' && c.sp !== 'bee') return false;
      return d.pause > 0;
    }
    if (c.blocked && c.mode !== 'fly' && c.mode !== 'swim') return false;
    // on foot, a stroll isn't a straight march: stop to sniff the air, change
    // its mind, put on a little speed or dawdle
    if (c.mode === 'walk' && c.target) {
      d.stopIn -= dt;
      if (d.stopIn <= 0) {
        d.stopIn = rrange(2, 7) / c.tempo;
        const r = Math.random();
        if (r < 0.4) {
          d.resume = c.target;
          c.halt();
          d.paused = rrange(0.5, 2.2);
          c.pose = chance(0.4) ? 'eat' : 'idle';
          if (chance(0.5)) c.facing = -c.facing;
        } else if (r < 0.62) {
          if (!goTo(c, roam(c, w))) return false;
        } else if (r < 0.75 && c.def.hop && c.hopCD <= 0) {
          c.tryHop(w, c.facing, rrange(30, 60));
        } else c.target.speedMul = rrange(0.6, 1.35);
      }
    }
    return c.brain.t < 25;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) =>
    jobLine(c) ||
    (c.traits.curious > 0.6
      ? rpick(['Ooh, what is over there?', 'Exploring ' + c.brain.data.zone + '!', 'Adventure time!'])
      : rpick(['Having a little stroll.', 'Just pottering about.', 'Stretching my legs.'])),
});

// --------------------------------------------------------------------- forage
def('forage', {
  score(c, w) {
    const h = hungerScore(c);
    if (h < 0.04) return 0;
    const f = cachedFood(c, w);
    if (!f) return 0;
    return h * 1.15 * (0.65 + 0.35 * f.value) * (0.55 + 0.45 * Math.max(c.act, c.hunger));
  },
  start(c, w) {
    const d = c.brain.data;
    d.tgt = cachedFood(c, w);
    d.phase = 'go';
    d.bites = 0;
    d.t = 0;
    const t = d.tgt;
    if (!t) return;
    if (t.kind === 'food') c.seek({ kind: 'food', food: t.food });
    else if (t.kind === 'plant') {
      if (c.canClimb || c.mode === 'fly' || c.mode === 'swim') c.seek({ kind: 'plant', plant: t.plant, slot: t.slot });
      else {
        const [sx, sy] = t.plant.slotWorld(t.slot, w.time);
        c.seekPoint(sx, sy);
      }
    } else if (t.kind === 'algae') c.seekPoint(t.x, t.y);
    else {
      d.phase = 'eat';
      c.halt();
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.tgt || !validFood(d.tgt)) return false;
    if (d.phase === 'go') {
      if (c.arrived) {
        d.phase = 'eat';
        d.t = 0;
        if (c.mode !== 'climb') c.halt();
        if (d.tgt.kind === 'food') c.facing = d.tgt.food.x >= c.x ? 1 : -1;
      } else if ((c.blocked && c.mode !== 'swim' && c.mode !== 'fly') || c.brain.t > 30) return false;
      return true;
    }
    c.pose = 'eat';
    d.t += dt;
    if (d.t >= 0.55) {
      d.t = 0;
      const ok = w.eat(c, d.tgt);
      d.bites++;
      const full = c.hunger < 0.03 + (1 - c.traits.greedy) * 0.06;
      // nobody leaves just the last crumb
      const crumb = d.tgt.kind === 'food' && d.tgt.food.amount > 0.001 && d.tgt.food.amount <= c.appetite * 0.2;
      if (!ok || (full && !crumb) || d.bites > 32) {
        if (full && c.plump > 1.25) c.emote('food', 1.5);
        return false;
      }
    }
    return true;
  },
  // once munching a snack, keep at it until full or it's all gone (a fright
  // still breaks it off: tapping the glass or a predator raises fear)
  lock(c) {
    const d = c.brain.data;
    return d.phase === 'eat' && d.tgt && d.tgt.kind === 'food' && c.fear < 0.3 && c.brain.t < 30;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought(c) {
    const d = c.brain.data;
    const n = d.tgt ? d.tgt.name : 'food';
    if (d.phase === 'eat') return rpick(['Nom nom nom...', `Mmm, ${n.toLowerCase()}!`, 'Delicious!', 'Munch munch.']);
    return c.hunger > 0.7 ? `So hungry! Heading for the ${n.toLowerCase()}.` : `Ooh, I spy some ${n.toLowerCase()}.`;
  },
});

// --------------------------------------------------------------------- snack (a tasty treat right there... just one more bite)
def('snack', {
  score(c, w) {
    if (c.hunger > 0.2 || c.hunger < 0.01 || c.mode === 'burrow') return 0;
    const f = w.hashF.nearest(c.x, c.y, 70, (o) => !o.gone && o.state !== 'fall' && o.rot === 0 && o.tags.some((t) => (c.diet[t] || 0) >= 0.8));
    if (!f || !reachable(c, w, f.x, f.y - 2)) return 0;
    c.memory.snack = f;
    const p = c.plump > 1.4 ? 0.2 : 1;
    return (0.12 + c.traits.greedy * 0.35) * p * (0.5 + 0.5 * c.act);
  },
  start(c, w) {
    const f = c.memory.snack;
    c.brain.data.f = f;
    if (f) c.seek({ kind: 'food', food: f });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const f = d.f;
    if (!f || f.gone || f.amount <= 0.001) return false;
    if (!c.arrived) return c.brain.t < 15 && !(c.blocked && c.mode !== 'swim' && c.mode !== 'fly');
    if (c.mode !== 'climb') c.halt();
    c.pose = 'eat';
    d.t = (d.t || 0) + dt;
    if (d.t > 0.6) {
      d.t = 0;
      d.n = (d.n || 0) + 1;
      w.eat(c, { kind: 'food', food: f });
      if (d.n >= 4 + Math.round(c.traits.greedy * 6)) return false;
    }
    return true;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) => (c.plump > 1.25 ? "I'm so full... but it's SO tasty." : 'Not hungry, but... ooh, just one little nibble!'),
});

// --------------------------------------------------------------------- search (hungry, nothing known)
def('search', {
  score(c, w) {
    const h = hungerScore(c);
    if (h < 0.15) return 0;
    return h * 0.5 * (0.5 + 0.5 * c.act);
  },
  start(c, w) {
    const range = c.mode === 'fly' ? 320 : c.mode === 'swim' ? 220 : 120 + c.traits.curious * 160;
    if (!goTo(c, wanderTarget(c, w, range))) c.brain.data.fail = true;
    if (c.hunger > 0.6) c.emote('food', 1.4);
  },
  tick(c, w) {
    if (c.brain.data.fail) return false;
    if (c.arrived || (c.blocked && c.mode !== 'fly' && c.mode !== 'swim')) return false;
    return c.brain.t < 18;
  },
  thought: (c) => (c.hunger > 0.75 ? 'My tummy is rumbling... where is the food?' : 'Sniffing around for something to eat.'),
});

// --------------------------------------------------------------------- hunt
def('hunt', {
  can: (c) => !!c.def.prey && c.isAdult,
  score(c, w) {
    const h = hungerScore(c);
    if (c.hunger < 0.45) return 0;
    const m = c.memory;
    if (!m.preyT || w.time - m.preyT > 1.2) {
      m.preyT = w.time;
      m.prey = findPrey(c, w);
    }
    if (!m.prey || m.prey.dead) return 0;
    return h * 1.25 * (0.6 + 0.4 * c.traits.bold) * (0.5 + 0.5 * c.act);
  },
  start(c, w) {
    const d = c.brain.data;
    d.prey = c.memory.prey;
    d.t = 0;
    d.range = c.sp === 'frog' ? 46 : c.sp === 'gecko' ? 16 : c.sp === 'goldfish' ? 12 : 8;
    if (d.prey && d.prey.mode === 'climb' && d.prey.climb && (c.canClimb || c.canFly)) {
      c.seek({ kind: 'plant', plant: d.prey.climb.plant, slot: d.prey.climb.slot });
    } else if (d.prey) c.seek({ kind: 'creature', c: d.prey });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const p = d.prey;
    if (!p || p.dead || p.removed || p.hidden) return false;
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    if (c.sp === 'frog' && dist > d.range && c.mode === 'walk' && dist < 160) {
      // frogs ambush: wait, then hop closer
      c.halt();
      d.wait = (d.wait || 0) + dt;
      if (d.wait > 2.5) {
        d.wait = 0;
        c.tryHop(w, Math.sign(p.x - c.x), Math.min(dist - 20, 60));
      }
    } else if (!c.target || c.arrived) {
      if (p.mode === 'climb' && p.climb && (c.canClimb || c.canFly)) c.seek({ kind: 'plant', plant: p.climb.plant, slot: p.climb.slot });
      else c.seek({ kind: 'creature', c: p });
    }
    d.t += dt;
    if (dist <= d.range + p.size * 0.3 && d.t > 0.7) {
      d.t = 0;
      c.facing = p.x >= c.x ? 1 : -1;
      const odds = (c.sp === 'ladybug' ? 0.6 : 0.32) + c.traits.bold * 0.2 - p.fear * 0.25;
      if (c.sp === 'frog' || c.sp === 'gecko') c.tongue = { x: p.x, y: p.y, t: 0.25 };
      if (Math.random() < odds) {
        w.predation(c, p);
        return false;
      }
      p.fear = 1;
      p.memory.scare = { x: c.x, y: c.y, t: w.time };
      if (c.sp !== 'frog') c.emote('?', 0.8);
    }
    if (c.brain.t > 25) return false;
    return true;
  },
  thought: (c) => {
    const p = c.brain.data.prey;
    return p ? rpick([`Shh... there's a ${p.def.name.toLowerCase()}.`, `Ooh, a ${p.def.name.toLowerCase()} snack!`, 'Ready... steady...']) : 'On the prowl.';
  },
});

// --------------------------------------------------------------------- flee
def('flee', {
  score(c, w) {
    if (c.fear < 0.3) return 0;
    return c.fear * 1.5;
  },
  // once safely indoors, stay put a while (peeking out to check) before
  // venturing out again
  lock(c) {
    return !!c.inside && c.brain.t < c.brain.data.dur;
  },
  start(c, w) {
    const d = c.brain.data;
    const src = c.threat || c.memory.scare;
    d.dur = rrange(2, 4);
    // (a snail just pulls into its shell; it's its own house)
    if (homeKind(c) && c.mode !== 'climb' && !c.def.rolls && c.sp !== 'snail' && c.sp !== 'pondsnail') {
      // home (or any door it fits) is close: bolt for it
      const sh = shelterNear(c, w, c.mode === 'swim' ? 170 : 140);
      if (sh) {
        d.sh = sh;
        d.dur = rrange(6, 12);
        headInside(c, sh, 1.5);
        if (chance(0.7)) c.emote('!', 1.2);
        return;
      }
    }
    if (c.def.rolls) {
      c.halt();
      c.pose = 'ball';
      d.ball = true;
      w.events.emit('roll', { c });
      return;
    }
    if (c.sp === 'snail' || c.sp === 'pondsnail') {
      c.halt();
      c.pose = 'shell';
      d.ball = true;
      return;
    }
    if (c.sp === 'turtle' && c.mode !== 'swim') {
      c.halt();
      c.pose = 'hide';
      d.ball = true;
      return;
    }
    const sx = src ? src.x : c.x - c.facing;
    const sy = src ? src.y : c.y;
    const dir = c.x >= sx ? 1 : -1;
    if (c.canFly && c.mode !== 'fly') c.takeOff();
    if (c.mode === 'fly') c.seekPoint(clamp(c.x + dir * 120, 20, W - 20), c.y - 60);
    else if (c.mode === 'swim') {
      const p = w.randomWaterPoint(c.x + dir * 100, 60, false);
      if (p) c.seekPoint(p[0], p[1]);
    } else if (c.mode === 'climb') {
      c.seekPoint(c.x + dir * 60, c.y);
    } else {
      const x = clamp(c.x + dir * rrange(50, 110), 10, W - 10);
      if (reachable(c, w, x, w.terrain.surfaceY(x) - 2)) c.seekPoint(x, w.terrain.surfaceY(x), { speedMul: 1.3 });
      else c.seekPoint(clamp(c.x - dir * 60, 10, W - 10), c.y, { speedMul: 1.3 });
      if (c.def.hop) c.tryHop(w, dir, 70);
    }
    if (chance(0.7)) c.emote('!', 1.2);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.sh) {
      if (!c.inside) {
        const r = goInside(c, w, d.sh, 8);
        if (r === 'in') {
          d.t0 = c.brain.t;
          w.events.emit('dashHome', { c, d: d.sh });
        }
        return r !== 'fail';
      }
      if (c.brain.t - d.t0 > 2.5) peekTick(c, dt, d.sh);
      return c.brain.t < d.dur || c.fear > 0.25;
    }
    if (d.ball) {
      if (c.sp === 'turtle') c.pose = 'hide';
      return c.brain.t < d.dur + 1.5 || c.fear > 0.4;
    }
    if (c.arrived && c.fear < 0.35) return false;
    return c.brain.t < d.dur;
  },
  stop(c) {
    if (c.pose === 'ball' || c.pose === 'shell' || c.pose === 'hide') c.pose = 'idle';
    comeOut(c);
  },
  thought: (c) =>
    c.inside
      ? c.peek > 0
        ? 'Is it safe to come out yet?'
        : `Safe inside the ${homeWord(c.inside)}!`
      : c.brain.data.sh
        ? `Run! Back to the ${homeWord(c.brain.data.sh)}!`
        : c.pose === 'ball' ? 'Rolled up tight! Safe in here.' : c.pose === 'shell' || c.pose === 'hide' ? 'Hiding in my shell...' : c.threat ? `Eek! A ${c.threat.def.name.toLowerCase()}!` : 'Whoa! What was that?',
});

// --------------------------------------------------------------------- comfort
def('comfort', {
  score(c) {
    if (c.discomfort < 0.12) return 0;
    return c.discomfort * 1.3;
  },
  start(c, w) {
    const d = c.brain.data;
    d.kind = c.airDisc > 0.3 ? 'air' : c.tempDisc > 0.15 ? 'hot' : c.tempDisc < -0.15 ? 'cold' : 'dry';
    const tgt = comfortSpot(c, w);
    if (tgt) goTo(c, tgt);
    else d.stay = true;
    if (tgt && tgt.shelter) d.sh = tgt.shelter;
    if (d.kind === 'hot') c.emote('hot', 1.5);
    else if (d.kind === 'cold') c.emote('cold', 1.5);
    else if (d.kind === 'dry') c.emote('drop', 1.5);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.kind === 'air' && c.inWater && c.y < w.terrain.waterLevel + 10) {
      c.pose = 'gasp';
      if (chance(dt * 2)) w.bubble(c.x + c.facing * c.size * 0.4, c.y - 2);
      if (!d.told) {
        d.told = true;
        w.events.emit('gasp', { c });
      }
    }
    if (d.sh && !c.inside && c.arrived) tuckIn(c, w, d.sh);
    if (c.arrived || d.stay || c.inside) {
      d.sit = (d.sit || 0) + dt;
      if (d.kind !== 'air') c.pose = c.energy < 0.5 ? 'sleep' : 'idle';
      if (c.inside && c.pose !== 'sleep') peekTick(c, dt, c.inside);
      // (tucked up indoors it settles in for a while rather than popping
      // straight back out the moment it feels better)
      if ((c.discomfort < 0.1 && (!c.inside || d.sit > 12)) || d.sit > (c.inside ? 45 : 14)) return false;
    } else if (c.blocked && c.mode !== 'swim' && c.mode !== 'fly') {
      d.stay = true;
    }
    return c.brain.t < 40;
  },
  stop(c) {
    if (c.pose === 'gasp' || c.pose === 'sleep') c.pose = 'idle';
    comeOut(c);
  },
  thought: (c) => {
    const k = c.brain.data.kind;
    if (k === 'hot') return c.inside ? `Ahh, nice and shady in the ${homeWord(c.inside)}.` : c.brain.data.sit ? 'Ahh, much cooler here.' : 'Phew, too hot! Looking for shade.';
    if (k === 'cold') return c.inside ? `Snug and warm in the ${homeWord(c.inside)}.` : c.brain.data.sit ? 'Warming up slowly...' : 'Brrr! Finding somewhere warm.';
    if (k === 'air') return 'Gulp! The water feels stuffy... need air.';
    return 'So dry! Looking for somewhere damp.';
  },
});

// --------------------------------------------------------------------- bask
def('bask', {
  can: (c) => !!c.def.basks && c.stage !== 'egg',
  score(c, w) {
    const env = w.env;
    const lamp = env.lampAt(c.x);
    if (lamp.power < 0.1 && env.sun < 0.3) return 0;
    const d = c.def;
    if (c.T > d.temp[2] - 1) return 0;
    const cool = smoothstep(d.temp[2] - 2, d.temp[1] - 2, c.T);
    return (0.25 + cool * 0.55) * (0.4 + 0.6 * env.sun) * (c.hunger > 0.7 ? 0.5 : 1);
  },
  start(c, w) {
    const tgt = lampSpot(c, w);
    if (!tgt) c.brain.data.fail = true;
    else goTo(c, tgt);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.fail) return false;
    if (c.arrived) {
      c.pose = c.sp === 'turtle' ? 'bask' : 'sleep';
      d.sit = (d.sit || 0) + dt;
      if (d.sit > 2 && !d.told) {
        d.told = true;
        w.events.emit('bask', { c });
      }
      if (chance(dt * 0.15)) c.emote('sun', 1.6);
      if (c.T > c.def.temp[2] - 0.5 || d.sit > 50) return false;
    } else if (c.blocked && c.mode !== 'swim') return false;
    return c.brain.t < 80;
  },
  stop(c, w) {
    c.pose = 'idle';
    // warmed through: off for a paddle or a potter before the next sunbathe
    if (c.brain.data.sit > 8) (c.memory.cool || (c.memory.cool = {})).bask = w.time + rrange(40, 150);
  },
  thought: (c) => (c.brain.data.sit ? 'Mmm, toasty warm. Soaking up the heat.' : 'Off to my sunny spot under the lamp.'),
});

// --------------------------------------------------------------------- rest / sleep
def('rest', {
  score(c, w) {
    let s = sleepiness(c) * 0.95 + (1 - c.act) * 0.7;
    if (c.hunger > 0.75) s *= 0.5;
    if (c.fear > 0.4) s *= 0.3;
    return s;
  },
  lock(c) {
    return c.pose === 'sleep' && c.fear < 0.5 && c.discomfort < 0.45 && c.energy < 0.92 && c.hunger < 0.85;
  },
  start(c, w) {
    const d = c.brain.data;
    let tgt = null;
    // a critter with a home nearly always goes home to sleep; others often
    // take a spare bed if there's one going (and it may become theirs)
    const sh = homeKind(c) && c.mode !== 'climb' ? snugSpot(c, w, c.def.likesShelter ? 320 : 220) : null;
    // (fish often doze out among the weeds instead, where you can see them)
    const own = w.homeOf(c) === sh;
    if (sh && chance(c.mode === 'swim' ? (own ? 0.5 : 0.3) : own ? 0.92 : c.def.likesShelter ? 0.9 : 0.6)) {
      d.shelter = sh;
      headInside(c, sh);
      return;
    }
    if (c.mode === 'fly') {
      tgt = nearestPlantSlot(c, w, 300, ['leaf', 'flower', 'stem', 'pad']);
      if (!tgt) {
        const x = c.x;
        tgt = { kind: 'point', x, y: w.terrain.surfaceY(x), ground: true };
      }
    } else if (c.mode === 'swim') {
      // doze hovering among the weeds or out in calm water, not on the floor
      tgt = restSpot(c, w);
    }
    if (tgt) goTo(c, tgt);
    else {
      c.halt();
      d.here = true;
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.shelter && !c.inside) {
      const r = goInside(c, w, d.shelter, 35);
      if (r === 'fail') {
        // couldn't get there: nap right here instead
        d.shelter = null;
        d.here = true;
        c.halt();
      } else if (r === 'go') return true;
    }
    if (c.inside || c.arrived || d.here || (c.blocked && c.mode !== 'fly')) {
      if (c.mode !== 'climb' && c.mode !== 'swim') c.halt();
      c.pose = 'sleep';
      d.zz = (d.zz || 0) - dt;
      if (d.zz <= 0) {
        d.zz = 3.5;
        c.emote('zzz', 2);
      }
      if (c.energy > 0.97 && c.act > 0.45) return false;
      if (c.brain.t > 240) return false;
    } else if (c.brain.t > 25) {
      d.here = true;
    }
    return true;
  },
  stop(c) {
    c.pose = 'idle';
    comeOut(c);
    c.hidden = false;
  },
  thought: (c) =>
    c.pose === 'sleep'
      ? c.inside
        ? rpick([`Zzz... tucked up in the ${homeWord(c.inside)}.`, 'Zzz...', 'Zzz... home sweet home.'])
        : rpick(['Zzz... dreaming of snacks.', 'Zzz...', 'Snoozing.', 'Zzz... five more minutes.'])
      : c.brain.data.shelter
        ? `Off home to bed in the ${homeWord(c.brain.data.shelter)}.`
        : 'Getting sleepy. Time for bed.',
});

// --------------------------------------------------------------------- hide (shelter by day / when nervous)
def('hide', {
  score(c, w) {
    const d = c.def;
    let s = 0;
    const nocturnal = d.activity === 'night' || d.activity === 'dusk';
    if (nocturnal && w.env.sun > 0.6) s += 0.5;
    if (d.likesShelter) s += 0.3 * (1 - c.act);
    if (c.tempDisc > 0.3) s += 0.35;
    if (s <= 0) return 0;
    const m = c.memory;
    if (!m.shT || w.time - m.shT > 3) {
      m.shT = w.time;
      m.sh = homeKind(c) ? snugSpot(c, w, 260) : null;
    }
    if (!m.sh && !(c.sp === 'beetle' && c.tempDisc > 0.3)) return 0;
    return s;
  },
  lock(c) {
    return (c.hidden || !!c.inside) && c.fear < 0.6 && c.hunger < 0.8 && c.act < 0.55;
  },
  start(c, w) {
    const d = c.brain.data;
    d.sh = c.memory.sh;
    if (d.sh) headInside(c, d.sh);
    else {
      d.dig = true;
      c.halt();
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.dig) {
      c.pose = 'burrow';
      c.hidden = true;
      if (c.tempDisc < 0.05 && c.brain.t > 10) return false;
      return c.brain.t < 120;
    }
    if (!c.inside) return goInside(c, w, d.sh) !== 'fail';
    // dozing the day away, or awake and peeking out now and then
    if (c.energy < 0.75) c.pose = 'sleep';
    else {
      if (c.pose === 'sleep') c.pose = 'idle';
      peekTick(c, dt, c.inside);
    }
    if (c.act > 0.6 && c.brain.t > 8) return false;
    return c.brain.t < 200;
  },
  stop(c) {
    comeOut(c);
    c.hidden = false;
    c.pose = 'idle';
  },
  thought: (c) =>
    c.brain.data.dig
      ? 'Dug in under the cool sand.'
      : c.inside
        ? c.peek > 0
          ? 'Just peeking out to see what is going on.'
          : `Cosy in the ${homeWord(c.inside)}.`
        : 'Off to my hidey-hole.',
});

// --------------------------------------------------------------------- mate
def('mate', {
  can(c, w) {
    const b = c.def.breed;
    if (!b || !c.isAdult || c.mateCD > 0 || c.hidden) return false;
    if (b.mode !== 'pair' && b.mode !== 'solo' && b.mode !== 'hive') return false;
    return w.count(c.sp) < c.def.maxPop;
  },
  score(c, w) {
    if (c.hunger > 0.5 || c.health < 0.6 || c.comfort < 0.55 || c.act < 0.4) return 0;
    const b = c.def.breed;
    if (b.needs === 'aphid' && w.count('aphid') < 2) return 0;
    if (b.mode === 'solo') return 0.5;
    if (b.mode === 'hive') {
      // the bee hotel raises a new bee once enough pollen is put by
      const h = w.hive();
      if (!h || (h.brood || 0) < 6) return 0;
      return 0.6;
    }
    const m = c.memory;
    if (!m.mateT || w.time - m.mateT > 2.5) {
      m.mateT = w.time;
      m.mate = findMate(c, w);
    }
    if (!m.mate) return 0;
    return 0.45 + c.traits.social * 0.25;
  },
  start(c, w) {
    const d = c.brain.data;
    const b = c.def.breed;
    if (b.mode === 'solo') {
      d.solo = true;
      c.halt();
      return;
    }
    if (b.mode === 'hive') {
      d.hive = w.hive();
      if (d.hive) c.seekPoint(d.hive.x, d.hive.y - 30);
      return;
    }
    d.partner = c.memory.mate;
    if (!d.partner) return;
    c.seek({ kind: 'creature', c: d.partner });
    w.court(d.partner, c);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.solo) {
      c.pose = 'idle';
      if (c.brain.t > 1.5) {
        w.reproduce(c, null);
        return false;
      }
      return true;
    }
    if (d.hive) {
      if (d.hive.removed) return false;
      if (c.arrived || Math.hypot(c.x - d.hive.x, c.y - (d.hive.y - 30)) < 14) {
        d.t = (d.t || 0) + dt;
        if (d.t > 2) {
          if ((d.hive.brood || 0) >= 6) {
            d.hive.brood -= 6;
            w.reproduce(c, null);
          }
          return false;
        }
      }
      return c.brain.t < 30;
    }
    const p = d.partner;
    if (!p || p.dead || p.removed) return false;
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    if (dist < (c.size + p.size) * 0.45 + 4) {
      if (c.mode !== 'fly' && c.mode !== 'swim') c.halt();
      d.t = (d.t || 0) + dt;
      if (!d.hearts) {
        d.hearts = true;
        c.emote('heart', 2.4);
        p.emote('heart', 2.4);
        c.facing = p.x >= c.x ? 1 : -1;
      }
      if (d.t > 2.2) {
        w.reproduce(c, p);
        return false;
      }
    } else if (!c.target || c.arrived || c.blocked) {
      c.seek({ kind: 'creature', c: p });
    }
    return c.brain.t < 40;
  },
  thought: (c) => {
    const d = c.brain.data;
    if (d.solo) return 'Feeling motherly...';
    if (d.hive) return 'Tucking a new egg into the bee hotel.';
    return d.hearts ? 'Twitterpated!' : `Looking for ${d.partner ? d.partner.name : 'a special friend'}.`;
  },
});

def('courted', {
  score: () => 0,
  start(c) {
    if (c.mode !== 'fly' && c.mode !== 'swim') c.halt();
  },
  tick(c, w) {
    const s = c.brain.data.suitor;
    if (!s || s.dead || !s.brain.b || s.brain.b.id !== 'mate') return false;
    c.facing = s.x >= c.x ? 1 : -1;
    if (c.mode === 'fly') c.seekPoint(s.x + c.facing * -8, s.y);
    return c.brain.t < 45;
  },
  thought: (c) => `Oh! Hello, ${c.brain.data.suitor ? c.brain.data.suitor.name : 'you'}!`,
});

// --------------------------------------------------------------------- chirp (crickets & grasshoppers)
def('chirp', {
  can: (c) => c.isAdult && c.mode === 'walk',
  score(c, w) {
    const night = c.sp === 'cricket' ? 1 - w.env.sun : w.env.sun;
    if (night < 0.5 || c.hunger > 0.6 || c.comfort < 0.4) return 0;
    return 0.45 * night * (0.6 + c.traits.social * 0.6);
  },
  start(c) {
    c.halt();
    c.brain.data.dur = rrange(18, 40);
    c.brain.data.n = 0;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    // Dolbear's law: chirps per minute rise with temperature
    const perMin = Math.max(8, 7 * c.T - 30);
    d.acc = (d.acc || 0) + dt * (perMin / 60);
    c.pose = 'chirp';
    if (d.acc >= 1) {
      d.acc -= 1;
      c.frame = (c.frame + 1) % 2;
      d.n++;
      w.sound('chirp', c.x, c.y, c.T);
      w.events.emit('chirp', { c, T: c.T, perMin });
      if (d.n % 6 === 1) c.emote('note', 0.9);
    }
    return c.brain.t < d.dur && c.fear < 0.3;
  },
  stop(c) {
    c.pose = 'idle';
  },
  thought: (c) => `Chirp chirp! (${Math.round(Math.max(8, 7 * c.T - 30))} chirps a minute at ${Math.round(c.T)}°)`,
});

// --------------------------------------------------------------------- croak (frogs)
def('croak', {
  can: (c) => c.sp === 'frog' && c.stage === 'adult' && c.mode === 'walk',
  score(c, w) {
    if (!(w.env.isDusk || w.env.sun < 0.4) || c.hunger > 0.6) return 0;
    return 0.4 + c.traits.social * 0.2;
  },
  start(c) {
    c.halt();
    c.brain.data.dur = rrange(10, 25);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    d.k = (d.k || rrange(0.5, 1.5)) - dt;
    if (d.k <= 0) {
      d.k = rrange(1.2, 3);
      d.on = 0.7;
      w.sound('croak', c.x, c.y);
      w.events.emit('croak', { c });
    }
    d.on = (d.on || 0) - dt;
    c.pose = d.on > 0 ? 'croak' : 'idle';
    return c.brain.t < d.dur;
  },
  stop(c) {
    c.pose = 'idle';
  },
  thought: () => 'Ribbit! Ribbit!',
});

// --------------------------------------------------------------------- glow (fireflies at night)
def('glow', {
  can: (c) => c.sp === 'firefly' && c.isAdult,
  score(c, w) {
    const night = 1 - w.env.sun;
    if (night < 0.55) return 0;
    return 0.75 * night;
  },
  start(c, w) {
    if (c.mode !== 'fly') c.takeOff();
    goTo(c, wanderTarget(c, w, 160));
  },
  tick(c, w) {
    if (c.mode !== 'fly') c.takeOff();
    if (!c.target || c.arrived) goTo(c, wanderTarget(c, w, 160));
    return c.brain.t < 30;
  },
  thought: () => rpick(['Blink... blink... blink!', 'Twinkle twinkle!', 'Flashing in time with my friends.']),
});

// --------------------------------------------------------------------- pollinate (bees)
def('pollinate', {
  can: (c) => c.sp === 'bee' || c.sp === 'butterfly',
  score(c, w) {
    if (c.sp === 'butterfly' && c.stage !== 'adult') return 0;
    const m = c.memory;
    if (!m.flT || w.time - m.flT > 2) {
      m.flT = w.time;
      m.fl = pickFlower(c, w);
    }
    if (!m.fl) return 0;
    return c.act * (0.35 + hungerScore(c) * 0.7) * (c.sp === 'bee' ? 1.1 : 0.8);
  },
  start(c, w) {
    const d = c.brain.data;
    d.fl = c.memory.fl;
    d.n = 0;
    if (c.mode !== 'fly') c.takeOff();
    if (d.fl) c.seek({ kind: 'plant', plant: d.fl.plant, slot: d.fl.slot });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.fl || d.fl.plant.dead || d.fl.plant.removed) return false;
    if (c.arrived && c.mode === 'climb') {
      d.t = (d.t || 0) + dt;
      c.pose = c.sp === 'bee' && (c.memory.pollen || 0) > 0 ? 'pollen' : 'idle';
      if (d.t > 2.2) {
        d.t = 0;
        w.eat(c, { kind: 'plant', plant: d.fl.plant, slot: d.fl.slot }, 2);
        if (d.fl.plant.pollinate(d.fl.slot)) w.events.emit('pollinate', { c, plant: d.fl.plant });
        c.memory.pollen = Math.min(6, (c.memory.pollen || 0) + 1);
        const v = c.memory.visited || (c.memory.visited = []);
        v.push(d.fl.key);
        if (v.length > 6) v.shift();
        d.n++;
        if (d.n >= 4 || c.hunger < 0.05) return false;
        const next = pickFlower(c, w);
        if (!next) return false;
        d.fl = next;
        c.takeOff();
        c.seek({ kind: 'plant', plant: next.plant, slot: next.slot });
      }
    } else if (c.mode !== 'fly' && c.mode !== 'climb') c.takeOff();
    return c.brain.t < 60;
  },
  thought: (c, w) => {
    if (c.sp !== 'bee') return rpick(['Sipping sweet nectar.', 'Every flower I visit can make seeds!']);
    if ((c.memory.pollen || 0) >= 3 && !w.hive()) return 'My pollen baskets are full, but there is no bee hotel to make honey in!';
    return rpick(['Bzz! Flower to flower!', 'Filling my pollen baskets. Busy busy!', 'This one smells lovely.']);
  },
});

// --------------------------------------------------------------------- bring (bees fly their pollen home to make honey)
def('bring', {
  can: (c) => c.sp === 'bee',
  score(c, w) {
    const p = c.memory.pollen || 0;
    if (p < 3 || !w.hive()) return 0;
    return (0.5 + Math.min(6, p) * 0.08) * (0.6 + 0.4 * c.act);
  },
  start(c, w) {
    const d = c.brain.data;
    d.hive = w.hive();
    if (c.mode !== 'fly') c.takeOff();
    if (d.hive) c.seekPoint(d.hive.x + rrange(-4, 4), d.hive.y - 34);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.hive || d.hive.removed) return false;
    if (c.mode !== 'fly') c.takeOff();
    if (c.arrived || Math.hypot(c.x - d.hive.x, c.y - (d.hive.y - 34)) < 12) {
      d.t = (d.t || 0) + dt;
      c.facing = d.hive.x >= c.x ? 1 : -1;
      if (d.t > 1.5) {
        w.depositPollen(c, d.hive);
        return false;
      }
    } else if (!c.target || Math.abs(c.target.x - d.hive.x) > 10) c.seekPoint(d.hive.x, d.hive.y - 34); // (the keeper may have moved the hotel)
    return c.brain.t < 45;
  },
  thought: (c) => (c.brain.data.t ? 'Packing pollen into the honeycomb.' : 'Baskets full! Flying home to make honey.'),
});

// --------------------------------------------------------------------- recycle (beetles roll leftovers into compost)
// Leftovers going off, or fallen leaves, on dry land the beetle can reach.
function findLitter(c, w) {
  let best = null;
  let bd = 340;
  for (const f of w.foods) {
    if (f.gone || f.inWater || f.state !== 'rest' || f.amount < 0.05) continue;
    if (f.type !== 'leaves' && f.fresh > 0.45) continue;
    const d = Math.abs(f.x - c.x) + Math.abs(f.y - c.y) * 0.5;
    if (d >= bd || !reachable(c, w, f.x, f.y - 2)) continue;
    bd = d;
    best = f;
  }
  return best;
}
// Somewhere to bury a compost ball: beside a plant that could use it, or
// a patch of open ground a little way off.
function burySpot(c, w) {
  const t = w.terrain;
  let best = null;
  let bd = 1e9;
  for (const p of w.plants) {
    if (p.dead || p.def.aquatic || Math.abs(p.x - c.x) > 180) continue;
    const x = p.x + (p.x > c.x ? -10 : 10);
    if (!reachable(c, w, x, t.surfaceY(x) - 3)) continue;
    const d = Math.abs(x - c.x) * (0.6 + p.health * 0.6) + (w.goods.some((g) => g.type === 'compost' && Math.abs(g.x - x) < 16) ? 200 : 0);
    if (d < bd) {
      bd = d;
      best = x;
    }
  }
  if (best == null) {
    for (let i = 0; i < 6 && best == null; i++) {
      const x = Math.min(W - 12, Math.max(12, c.x + rrange(40, 110) * (chance(0.5) ? 1 : -1)));
      if (reachable(c, w, x, t.surfaceY(x) - 3)) best = x;
    }
  }
  return best == null ? null : { x: best, y: t.surfaceY(best) };
}
def('recycle', {
  can: (c) => c.sp === 'beetle' && c.isAdult && c.mode === 'walk',
  score(c, w) {
    if (c.hunger > 0.55 || c.act < 0.3) return 0;
    const m = c.memory;
    if (m.ball) return 0.85; // already rolling one: see it through
    if (!m.litT || w.time - m.litT > 3) {
      m.litT = w.time;
      m.lit = findLitter(c, w);
    }
    if (!m.lit) return 0;
    return (0.4 + (1 - c.traits.lazy) * 0.25) * (0.6 + 0.4 * c.act);
  },
  start(c, w) {
    const d = c.brain.data;
    const m = c.memory;
    if (m.ball) {
      d.phase = 'roll';
      d.spot = burySpot(c, w);
      if (d.spot) c.seekPoint(d.spot.x, d.spot.y);
      return;
    }
    d.phase = 'go';
    d.f = m.lit;
    if (d.f) c.seek({ kind: 'food', food: d.f });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const m = c.memory;
    if (d.phase === 'go') {
      if (!d.f || d.f.gone || d.f.amount < 0.02) return false;
      if (c.arrived) {
        d.phase = 'gather';
        d.t = 0;
        c.halt();
        c.facing = d.f.x >= c.x ? 1 : -1;
      } else if (c.blocked || c.brain.t > 30) return false;
      return true;
    }
    if (d.phase === 'gather') {
      c.pose = 'eat';
      d.t += dt;
      if (d.t > 2.4) {
        const take = Math.min(d.f.amount, 0.6);
        d.f.amount -= take;
        w.nibbled(d.f, c);
        if (d.f.amount <= 0.01) w.removeFood(d.f);
        m.ball = { r: 2.4 + take * 2.2 };
        c.pose = 'idle';
        d.phase = 'roll';
        d.spot = burySpot(c, w);
        if (!d.spot) return false;
        c.seekPoint(d.spot.x, d.spot.y);
      }
      return true;
    }
    if (d.phase === 'roll') {
      if (!d.spot) return false;
      if (c.arrived || Math.abs(c.x - d.spot.x) < 6) {
        d.phase = 'bury';
        d.t = 0;
        c.halt();
      } else if (c.blocked || c.brain.t > 45) {
        // can't get there: bury it right here
        d.spot = { x: c.x, y: c.y };
        d.phase = 'bury';
        d.t = 0;
        c.halt();
      }
      return true;
    }
    // bury
    c.pose = 'dig';
    d.t += dt;
    if (d.t > 2.4) {
      const bx = c.x + c.facing * 6;
      w.makeCompost(c, bx, w.terrain.surfaceY(bx), 'ball');
      w.dust(bx, w.terrain.surfaceY(bx), 3);
      m.ball = null;
      c.pose = 'idle';
      c.emote('heart', 1.2);
      return false;
    }
    return true;
  },
  stop(c) {
    if (c.pose === 'dig' || c.pose === 'eat') c.pose = 'idle';
  },
  thought(c) {
    const p = c.brain.data.phase;
    if (p === 'gather') return 'Patting the leftovers into a nice round ball.';
    if (p === 'roll') return 'Rolling my compost ball somewhere useful.';
    if (p === 'bury') return 'Burying it by the plants. They\'ll love this!';
    return 'Ooh, leftovers! Time to recycle.';
  },
});

// --------------------------------------------------------------------- graze (algae)
def('graze', {
  can: (c) => !!c.diet.algae,
  score(c, w) {
    if (!(c.inWater || c.mode === 'swim')) return 0;
    const a = w.env.pond.algae;
    if (a < 0.04) return 0;
    return (0.12 + hungerScore(c) * 0.7) * Math.min(1, a * 4) * (c.def.grazer ? 1.2 : 0.7);
  },
  start(c, w) {
    const p = w.randomWaterPoint(c.x, 90, c.mode === 'walk');
    if (p) c.seekPoint(p[0], p[1]);
    else c.brain.data.here = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.arrived || d.here || c.blocked) {
      c.pose = 'eat';
      d.t = (d.t || 0) + dt;
      const a = w.env.pond.algae;
      c.hunger = Math.max(0, c.hunger - dt * 0.03 * Math.min(1, a * 3) * (0.02 / Math.max(0.02, c.appetite)) * 4);
      w.env.pond.algae = Math.max(0.01, a - dt * 0.00012);
      if (d.t > 5 || c.hunger < 0.05) return false;
    }
    return c.brain.t < 20;
  },
  stop(c) {
    c.pose = 'idle';
  },
  thought: () => rpick(['Scrubbing the algae. Yum!', 'Nibble nibble on the green fuzz.', 'Keeping the pond tidy.']),
});

// --------------------------------------------------------------------- sap (aphids)
def('sap', {
  can: (c) => c.sp === 'aphid',
  score: (c) => (c.mode === 'climb' ? 0.55 : 0.9),
  start(c, w) {
    if (c.mode === 'climb') return;
    const s = nearestPlantSlot(c, w, 400, ['leaf', 'stem'], (p) => !p.def.aquatic && p.def.kind !== 'cactus');
    if (s) c.seek(s);
    else c.brain.data.none = true;
  },
  tick(c, w, dt) {
    if (c.brain.data.none) return c.brain.t < 4;
    if (c.mode === 'climb' && c.climb && c.arrived) {
      c.pose = 'idle';
      c.climb.plant.sapDrain += 1;
      c.climb.plant.aphids++;
      c.hunger = Math.max(0, c.hunger - dt / (DAY_LEN * 0.2));
      c.honeydew = Math.min(1, c.honeydew + dt / 90);
    }
    return c.brain.t < 25;
  },
  thought: (c) => (c.honeydew > 0.5 ? 'Sip sip. Making sweet honeydew for the ants.' : 'Sipping plant juice.'),
});

// --------------------------------------------------------------------- pupate (caterpillars)
def('pupate', {
  can: (c) => c.sp === 'butterfly' && c.stage === 'caterpillar',
  score: (c) => (c.stageAge > c.stageDur * 0.82 && c.hunger < 0.6 ? 1.4 : 0),
  lock: () => true,
  start(c, w) {
    if (c.mode === 'climb' && c.climb) {
      c.brain.data.found = true;
      return;
    }
    const s = nearestPlantSlot(c, w, 300, ['stem', 'leaf', 'flower']);
    if (s) c.seek(s);
    else c.brain.data.found = true;
  },
  tick(c, w) {
    if (c.arrived || c.brain.data.found || c.brain.t > 40) {
      c.memory.readyToPupate = true;
      c.pose = 'idle';
    }
    return true;
  },
  thought: () => 'I feel a big change coming... time to find a quiet spot.',
});

// --------------------------------------------------------------------- estivate (snails seal up when dry)
def('estivate', {
  can: (c) => !!c.def.estivates,
  score(c) {
    if (c.moistDisc < -0.35 || c.tempDisc > 0.55) return 1.1;
    return 0;
  },
  lock(c) {
    return c.brain.t < 6 || c.moistDisc < -0.2 || c.tempDisc > 0.35;
  },
  start(c, w) {
    c.halt();
    c.dormant = true;
    c.pose = 'shell';
    w.events.emit('estivate', { c });
  },
  tick(c) {
    c.pose = 'shell';
    return true;
  },
  stop(c) {
    c.dormant = false;
    c.pose = 'idle';
  },
  thought: () => 'Too dry! Sealed up snug in my shell until it rains.',
});

// --------------------------------------------------------------------- huddle (ladybugs when cold)
def('huddle', {
  can: (c) => !!c.def.huddles,
  score(c) {
    return c.tempDisc < -0.25 ? 0.6 + -c.tempDisc * 0.6 : 0;
  },
  start(c, w) {
    const friends = w.hashC.query(c.x, c.y, 400, (o) => o !== c && o.sp === c.sp && !o.dead);
    const d = c.brain.data;
    if (friends.length) {
      const f = friends[0];
      d.friend = f;
      if (f.climb) c.seek({ kind: 'plant', plant: f.climb.plant, slot: f.climb.slot });
      else c.seekPoint(f.x + rrange(-4, 4), f.y);
    } else {
      const sh = snugSpot(c, w, 400);
      if (sh) {
        d.sh = sh;
        headInside(c, sh);
      } else d.here = true;
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.sh && !c.inside && goInside(c, w, d.sh, 40) === 'fail') {
      d.sh = null;
      d.here = true;
    }
    if (c.inside || c.arrived || d.here || (d.friend && Math.hypot(d.friend.x - c.x, d.friend.y - c.y) < 10)) {
      if (c.mode === 'fly') c.land(w);
      if (c.mode === 'walk') c.halt();
      c.huddling = true;
      c.pose = 'sleep';
      const n = w.hashC.query(c.x, c.y, 18, (o) => o.sp === c.sp && o !== c && !o.dead).length;
      if (n >= 1 && !d.told) {
        d.told = true;
        w.events.emit('huddle', { c, n });
      }
      if (c.tempDisc > -0.05 && c.brain.t > 10) return false;
    }
    return c.brain.t < 120;
  },
  stop(c) {
    c.huddling = false;
    c.pose = 'idle';
    comeOut(c);
  },
  thought: (c) => (c.inside ? `Chilly! Snuggled up in the ${homeWord(c.inside)}.` : 'Chilly! Snuggling up with friends to keep warm.'),
});

// --------------------------------------------------------------------- headstand (desert beetles drink fog)
def('headstand', {
  can: (c) => c.sp === 'beetle' && c.isAdult && c.mode === 'walk',
  score(c, w) {
    const h = w.env.hour;
    if (h < 4.5 || h > 9 || c.M < 0.22) return 0;
    if (c.memory.headDay === w.env.day) return 0;
    return 0.7;
  },
  start(c, w) {
    c.halt();
    c.memory.headDay = w.env.day;
  },
  tick(c, w, dt) {
    c.pose = 'headstand';
    if (c.brain.t > 2) w.events.emit('headstand', { c });
    c.hunger = Math.max(0, c.hunger - dt * 0.004);
    return c.brain.t < 8;
  },
  stop(c) {
    c.pose = 'idle';
  },
  thought: () => 'Headstand time! Catching dew drops on my back to drink.',
});

// --------------------------------------------------------------------- surface (worms come up in the rain)
def('surface', {
  can: (c) => c.sp === 'worm' && c.mode === 'burrow',
  score(c, w) {
    const m = w.env.jungle.moist;
    return m > 0.78 ? 0.7 + (m - 0.78) * 2 : 0;
  },
  start(c, w) {
    const x = clamp(c.x + rrange(-40, 40), 1075, W - 10);
    c.seekPoint(x, w.terrain.surfaceY(x) - 1);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const gy = w.terrain.surfaceY(c.x);
    if (c.y < gy + 6) {
      d.up = (d.up || 0) + dt;
      if (d.up > 1 && !d.told) {
        d.told = true;
        w.events.emit('wormRain', { c });
      }
    }
    d.re = (d.re || 0) - dt;
    if (!c.target || c.arrived || d.re <= 0) {
      d.re = 4;
      const x = clamp(c.x + rrange(-40, 40), 1075, W - 10);
      c.seekPoint(x, w.terrain.surfaceY(x) - 1);
    }
    return c.brain.t < 25 && w.env.jungle.moist > 0.7;
  },
  thought: () => 'Rain! Popping up for a wiggle in the wet.',
});

// --------------------------------------------------------------------- investigate (curious critters check out new things)
def('investigate', {
  score(c, w) {
    const n = w.noveltyNear(c);
    if (!n) return 0;
    c.memory.nov = n;
    return c.traits.curious * 0.55 * n.strength * c.act;
  },
  start(c, w) {
    const n = c.memory.nov;
    c.brain.data.n = n;
    if (!n) return;
    if (reachable(c, w, n.x, n.y)) c.seekPoint(n.x + rrange(-14, 14), n.y);
    else c.brain.data.look = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.n) return false;
    if (c.arrived || d.look || c.blocked) {
      d.t = (d.t || 0) + dt;
      if (!d.em) {
        d.em = true;
        c.emote('?', 1.4);
        d.n.seen = (d.n.seen || 0) + 1;
      }
      c.facing = d.n.x >= c.x ? 1 : -1;
      return d.t < 2;
    }
    return c.brain.t < 12;
  },
  thought: () => rpick(['Ooh! What is that?', 'Something new! Let me look.', 'Curiouser and curiouser...']),
});

// --------------------------------------------------------------------- home (pop home for a bit, or go house-hunting)
def('home', {
  can: (c) => !!homeKind(c) && c.mode !== 'climb' && c.mode !== 'burrow',
  score(c, w) {
    if (c.hunger > 0.55 || c.fear > 0.3 || c.discomfort > 0.3) return 0;
    const m = c.memory;
    if (m.homeT && w.time - m.homeT < 50) return 0;
    if (w.homeOf(c)) return (0.08 + c.traits.lazy * 0.16 + (1 - c.act) * 0.12) * (1.15 - c.traits.curious * 0.3);
    // no home yet: the curious go and look round anywhere with a vacancy
    if (!m.huntT || w.time - m.huntT > 8) {
      m.huntT = w.time;
      m.vacancy = findHome(c, w, 280);
    }
    return m.vacancy && !m.vacancy.removed ? 0.1 + c.traits.curious * 0.25 : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    const m = c.memory;
    m.homeT = w.time;
    d.sh = w.homeOf(c) || m.vacancy;
    d.newbie = !w.homeOf(c);
    d.stay = rrange(8, 26);
    if (d.sh) headInside(c, d.sh);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!c.inside) {
      const r = goInside(c, w, d.sh);
      if (r === 'in') {
        d.t0 = c.brain.t;
        c.pose = 'idle';
        if (d.newbie && w.homeOf(c) === d.sh) c.emote('heart', 1.8);
      }
      return r !== 'fail';
    }
    // pottering about indoors, peeking out now and then
    peekTick(c, dt, c.inside);
    return c.brain.t - d.t0 < d.stay;
  },
  stop(c) {
    comeOut(c);
  },
  thought(c, w) {
    const d = c.brain.data;
    const h = d.sh ? homeWord(d.sh) : 'house';
    if (c.inside) return c.peek > 0 ? 'Just popping my head out to see what is going on.' : d.newbie ? `I live in the ${h} now!` : rpick([`Pottering about at home in the ${h}.`, 'Tidying up my little room.', 'Home sweet home.']);
    return d.newbie ? `Ooh, the ${h} has a spare room!` : `Popping home to the ${h} for a bit.`;
  },
});

// --------------------------------------------------------------------- socialize (say hello to a friend, or swim along together)
def('socialize', {
  can: (c) => (c.mode === 'walk' || c.mode === 'swim') && !c.def.colony,
  score(c, w) {
    if (c.hunger > 0.5 || c.fear > 0.3 || c.act < 0.4) return 0;
    const m = c.memory;
    if (m.palT && w.time - m.palT < 45) return 0;
    if (!m.palQ || w.time - m.palQ > 4) {
      m.palQ = w.time;
      m.pal = w.hashC.nearest(c.x, c.y, Math.max(90, c.def.sight * 1.4), (o) => {
        if (o === c || o.dead || o.hidden || o.sp !== c.sp || o.mode !== c.mode || o.stage === 'egg') return false;
        const b = o.brain.b;
        if (b && (b.id === 'rest' || b.id === 'mate' || b.id === 'flee' || b.id === 'hide')) return false;
        return reachable(c, w, o.x, o.y);
      });
    }
    return m.pal ? (0.06 + c.traits.social * 0.3) * c.act : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.pal = c.memory.pal;
    c.memory.palT = w.time;
    d.dur = c.mode === 'swim' ? rrange(6, 12) : rrange(10, 16);
    if (d.pal) c.seek({ kind: 'creature', c: d.pal });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const p = d.pal;
    if (!p || p.dead || p.removed || p.hidden) return false;
    if (c.mode === 'swim') {
      // swim alongside for a while, nose to tail
      d.re = (d.re || 0) - dt;
      if (d.re <= 0) {
        d.re = 0.8;
        c.seekPoint(p.x - p.facing * (p.size * 0.6 + 4) + rrange(-4, 4), p.y + rrange(-8, 8));
      }
      if (!d.hi && Math.hypot(p.x - c.x, p.y - c.y) < 40) {
        d.hi = true;
        if (chance(0.5)) c.emote(rpick(['heart', 'note']), 1.2);
      }
      return c.brain.t < d.dur;
    }
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    if (!d.hi) {
      if (dist < (c.size + p.size) * 0.5 + 6) {
        d.hi = true;
        d.t = 0;
        d.len = rrange(2.2, 3.4);
        c.halt();
        c.facing = p.x >= c.x ? 1 : -1;
        c.emote(rpick(['heart', 'note', '?']), 1.6);
        const b = p.brain.b;
        if (!b || b.id === 'idle' || b.id === 'wander') switchTo(p, w, 'greeted', { pal: c });
      } else if (c.arrived || c.blocked || c.brain.t > 12) return false;
      else if (!c.target) c.seek({ kind: 'creature', c: p });
      return true;
    }
    d.t += dt;
    c.pose = d.t % 1.4 < 0.5 ? 'eat' : 'idle'; // a nod and a natter
    return d.t < d.len;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) => {
    const p = c.brain.data.pal;
    const n = p ? p.name : 'a friend';
    return c.mode === 'swim' ? `Swimming along with ${n}.` : c.brain.data.hi ? rpick([`Having a natter with ${n}.`, `Swapping news with ${n}.`]) : `Ooh, there's ${n}! Hello!`;
  },
});

def('greeted', {
  score: () => 0,
  start(c) {
    if (c.mode === 'walk') c.halt();
  },
  tick(c) {
    const p = c.brain.data.pal;
    if (!p || p.dead || p.removed) return false;
    c.facing = p.x >= c.x ? 1 : -1;
    c.pose = c.brain.t % 1.3 < 0.45 ? 'eat' : 'idle';
    return c.brain.t < 3;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) => `Oh hello, ${c.brain.data.pal ? c.brain.data.pal.name : 'you'}!`,
});

// --------------------------------------------------------------------- breathe (air-breathers pop up to the surface)
def('breathe', {
  can: (c) => c.sp === 'turtle' || c.sp === 'pondsnail' || (c.sp === 'frog' && (c.stage === 'froglet' || c.stage === 'adult')),
  score(c, w) {
    const m = c.memory;
    const t = w.terrain;
    if (m.airT == null) m.airT = w.time - rrange(0, 80);
    // out of the water, or already at the top, it's breathing just fine
    if (!c.inWater || c.y < t.waterSurfY(c.x) + 8) {
      m.airT = w.time;
      return 0;
    }
    const need = c.sp === 'pondsnail' ? 200 : c.sp === 'turtle' ? 110 : 80;
    return smoothstep(need * 0.6, need * 1.3, w.time - m.airT) * 0.95;
  },
  start(c, w) {
    const d = c.brain.data;
    const t = w.terrain;
    if (c.mode === 'swim') {
      const x = clamp(c.x + rrange(-40, 40), 520, 1100);
      if (t.waterAt(x, t.waterLevel + 4)) c.seekPoint(x, t.waterLevel + 3);
      else c.seekPoint(c.x, t.waterLevel + 3);
      return;
    }
    // a pond snail climbs a stem to the top (a lily pad is perfect)
    const s = nearestPlantSlot(c, w, 300, ['pad', 'leaf', 'flower', 'stem'], (p) => p.def.aquatic);
    if (s) {
      let top = s;
      for (const sl of s.plant.shape.slots) if (sl.y < top.slot.y) top = { kind: 'plant', plant: s.plant, slot: sl };
      c.seek(top);
    } else d.none = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const t = w.terrain;
    if (d.none) {
      c.memory.airT = w.time - 60; // try again in a while
      return false;
    }
    if (c.y < t.waterSurfY(c.x) + 8 || (c.mode === 'climb' && c.arrived)) {
      d.t = (d.t || 0) + dt;
      if (!d.gulp) {
        d.gulp = true;
        if (w.fx) w.fx.ripples.push({ x: c.x, t: 0, s: 0.3 });
      }
      if (d.t > (c.mode === 'climb' ? 6 : 1.4)) {
        c.memory.airT = w.time;
        if (c.mode !== 'climb') w.bubble(c.x, c.y + 4);
        return false;
      }
    }
    return c.brain.t < 40;
  },
  thought: (c) => (c.sp === 'pondsnail' ? 'Climbing up for a breath of fresh air.' : 'Popping up for a breath of air!'),
});

// Which behaviours each species knows.
const BASE = ['idle', 'wander', 'rest', 'forage', 'snack', 'search', 'comfort', 'flee', 'mate', 'investigate', 'home', 'socialize'];
export const SPECIES_BEHAVIORS = {
  default: BASE,
  cricket: [...BASE, 'chirp', 'hide'],
  grasshopper: [...BASE, 'chirp'],
  gecko: [...BASE, 'hunt', 'bask', 'hide'],
  beetle: [...BASE, 'headstand', 'hide', 'recycle'],
  goldfish: [...BASE, 'hunt', 'graze'],
  frog: [...BASE, 'hunt', 'croak', 'graze', 'breathe'],
  turtle: [...BASE, 'bask', 'breathe'],
  pondsnail: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate', 'home', 'breathe'],
  shrimp: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate', 'investigate', 'home', 'socialize'],
  ladybug: [...BASE, 'hunt', 'huddle'],
  aphid: ['idle', 'sap', 'mate', 'comfort'],
  butterfly: [...BASE, 'pollinate', 'pupate'],
  snail: [...BASE, 'estivate'],
  bee: [...BASE, 'pollinate', 'bring'],
  worm: ['idle', 'wander', 'rest', 'forage', 'comfort', 'mate', 'surface'],
  firefly: [...BASE, 'glow'],
  pillbug: [...BASE, 'hide'],
  fruitfly: ['idle', 'wander', 'forage', 'search', 'rest', 'flee'],
};

export { clamp01 };
