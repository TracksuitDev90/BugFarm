// Behaviour library. Each behaviour scores how much a critter wants to do it
// right now, then drives the body while it runs.
import { DAY_LEN, W, ZONE_X, ZONE_MID } from '../config.js';
import { JOBS } from '../data/goods.js';
import { clamp, clamp01, smoothstep } from '../util/math.js';
import { rrange, rint, chance, rpick } from '../util/rng.js';
import {
  cachedFood, validFood, findPrey, findMate, wanderTarget, nearestPlantSlot, comfortSpot, lampSpot,
  pickFlower, reachable, preyValue, homeKind, findHome, snugSpot, shelterNear, swimSpot, restSpot, foodReach, glassSpot, waterSpot,
  skySpot, perchSpot, CEIL, airFloor, suits, canReachDoor,
} from './search.js';

// Critters that belong in the air: they take off to get about rather than
// walking (ladybugs and grown-up fireflies stroll as often as they fly).
function aerial(c) {
  return c.canFly && (c.def.habitat === 'air' || c.sp === 'butterfly' || c.sp === 'moth') && c.sp !== 'firefly';
}

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
  // pond snails glide off up the glass more often than not
  if (c.def.glass && (c.mode === 'glass' || chance(0.6))) {
    const g = glassSpot(c, w);
    if (g) return g;
  }
  // shrimp swim up in a hop now and then, to a weed or across the pond
  if (c.def.swimHop && c.mode === 'walk' && chance(0.4)) {
    const g = swimSpot(c, w, 130);
    if (g) {
      c.mode = 'swim';
      c.vy = -28;
      return g;
    }
  }
  if (c.mode === 'swim') return swimSpot(c, w, (c.sp === 'turtle' ? 200 : 150) * (0.7 + c.traits.curious * 0.6));
  const range = c.mode === 'fly' ? 220 : (60 + c.traits.curious * 140) * far;
  return wanderTarget(c, w, range);
}
def('wander', {
  score: (c) => (0.15 + c.traits.curious * 0.14) * c.act,
  start(c, w) {
    const d = c.brain.data;
    if (aerial(c) && c.mode !== 'fly' && c.mode !== 'swim') c.takeOff();
    if (!goTo(c, roam(c, w))) d.fail = true;
    d.zone = zoneWord(w, c.x);
    // swimmers and flyers string a few legs together rather than stopping
    // after each: a long looping flight round the tank
    d.legs = c.mode === 'swim' ? rint(1, 4) : c.mode === 'fly' ? rint(2, 5) : 1;
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
      if (c.mode === 'fly') return false;
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
    (c.mode === 'fly'
      ? rpick(['Up, up and away!', 'What a view from up here!', 'Flying right across the tank!', 'Wheee!'])
      : c.mode === 'swim'
        ? rpick(['Just swimming about.', 'Doing a lap of the pond.', 'Ooh, what is down there?'])
        : c.traits.curious > 0.6
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
        if (d.tgt.kind === 'food') {
          const f = d.tgt.food;
          c.facing = f.x >= c.x ? 1 : -1;
          // tucking in where friends can see: they come and join in
          if (c.def.schools || c.traits.social > 0.45) w.tipOff(c, f);
          if (f.giftFor === c.id) {
            c.emote('heart', 1.4);
            w.events.emit('thanks', { c, food: f });
          }
        }
      } else if ((c.blocked && c.mode !== 'swim' && c.mode !== 'fly' && c.mode !== 'glass') || c.brain.t > 30) return false;
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
    const f = d.tgt && d.tgt.food;
    if (f && f.giftFor === c.id) return d.phase === 'eat' ? `${f.giftBy} brought me some ${n.toLowerCase()}. Thank you!` : `Ooh, ${f.giftBy} has brought me something!`;
    if (f && f.owner === c.id) return d.phase === 'eat' ? 'Munching the snack I put by for later.' : 'Time for the snack I saved!';
    if (d.phase !== 'eat' && d.tgt && d.tgt.tip) return `${d.tgt.tip.name} has found food! Wait for me!`;
    if (d.phase === 'eat') return rpick(['Nom nom nom...', `Mmm, ${n.toLowerCase()}!`, 'Delicious!', 'Munch munch.']);
    return c.hunger > 0.7 ? `So hungry! Heading for the ${n.toLowerCase()}.` : `Ooh, I spy some ${n.toLowerCase()}.`;
  },
});

// --------------------------------------------------------------------- snack (a tasty treat right there... just one more bite)
def('snack', {
  score(c, w) {
    if (c.hunger > 0.2 || c.hunger < 0.01 || c.mode === 'burrow') return 0;
    const f = w.hashF.nearest(c.x, c.y, 70, (o) => !o.gone && o.loose && !(o.owner && o.owner !== c.id) && o.rot === 0 && o.tags.some((t) => (c.diet[t] || 0) >= 0.8));
    if (!f || !foodReach(c, w, f)) return 0;
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
    if (aerial(c) && c.mode !== 'fly' && c.mode !== 'swim') c.takeOff();
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
    d.range = c.sp === 'frog' ? 46 : c.sp === 'gecko' ? 16 : c.sp === 'goldfish' ? 12 : c.sp === 'dragonfly' ? 12 : 8;
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
      const odds = (c.sp === 'ladybug' || c.sp === 'dragonfly' ? 0.6 : 0.32) + c.traits.bold * 0.2 - p.fear * 0.25;
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
    if (c.def.swimHop && c.mode === 'walk') {
      // a shrimp flicks its tail and shoots off backwards
      const sx = src ? src.x : c.x - c.facing;
      const dir = c.x >= sx ? 1 : -1;
      const p = w.randomWaterPoint(c.x + dir * 70, 30, false);
      if (p) {
        c.mode = 'swim';
        c.vx = dir * 90;
        c.vy = -50;
        c.seekPoint(p[0], Math.min(p[1], c.y - 20), { speedMul: 1.6 });
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
      tgt = perchSpot(c, w);
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
      if (c.mode !== 'climb' && c.mode !== 'swim' && c.mode !== 'glass') c.halt();
      if (!d.den) {
        // where it beds down is where it'll keep its snacks
        d.den = true;
        c.memory.den = { x: c.x, y: c.y };
      }
      c.pose = 'sleep';
      d.zz = (d.zz || 0) - dt;
      if (d.zz <= 0) {
        d.zz = 3.5;
        c.emote('zzz', 2);
        // a nap by the park bench is extra restful
        c.restBonus = w.decor.some((b) => b.type === 'bench' && Math.abs(b.x - c.x) < 40 && Math.abs(b.y - c.y) < 40) ? 1.6 : 1;
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
    c.restBonus = 1;
    comeOut(c);
    c.hidden = false;
  },
  thought: (c, w) =>
    c.pose === 'sleep' && w.chorus > 0.4 && w.env.sun < 0.4
      ? rpick(['Zzz... the crickets are singing me to sleep.', 'Zzz... lovely lullaby...'])
      : c.pose === 'sleep'
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
    return w.count(c.sp) < w.maxPop(c.sp);
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
  start(c, w) {
    c.halt();
    c.brain.data.dur = rrange(18, 40);
    c.brain.data.n = 0;
    // singing from the fence carries further
    c.brain.data.fence = w.decor.some((d) => d.type === 'fence' && Math.abs(d.x - c.x) < 60);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    // the night chorus lulls the whole tank to sleep (see world.chorus)
    if (c.sp === 'cricket') w.chorus = Math.min(1, w.chorus + dt * (d.fence ? 0.05 : 0.025));
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
  can: (c) => c.sp === 'bee' || c.sp === 'butterfly' || c.sp === 'moth' || c.sp === 'firefly',
  score(c, w) {
    if (!c.isAdult) return 0;
    // fireflies and moths visit flowers by night
    if ((c.sp === 'firefly' || c.sp === 'moth') && w.env.sun > 0.5) return 0;
    const m = c.memory;
    if (!m.flT || w.time - m.flT > 2) {
      m.flT = w.time;
      m.fl = pickFlower(c, w);
    }
    if (!m.fl) return 0;
    return c.act * (0.35 + hungerScore(c) * 0.7) * (c.sp === 'bee' ? 1.1 : c.sp === 'firefly' ? 0.55 : 0.8);
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
      const rate = w.workRate(c);
      if (d.t > 2.2 / rate) {
        d.t = 0;
        w.eat(c, { kind: 'plant', plant: d.fl.plant, slot: d.fl.slot }, 2);
        if (d.fl.plant.pollinate(d.fl.slot)) w.events.emit('pollinate', { c, plant: d.fl.plant });
        c.memory.pollen = Math.min(6, (c.memory.pollen || 0) + rate);
        // (and which flowers it came from: the honey will taste of them)
        const pf = c.memory.pf || (c.memory.pf = {});
        pf[d.fl.plant.type] = (pf[d.fl.plant.type] || 0) + rate;
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
    if (c.sp === 'firefly') return rpick(['Sipping nectar by my own light.', 'Night-time flower visit!']);
    if (c.sp === 'moth') return rpick(['Flowers taste sweeter by moonlight.', 'The night shift: pollinating!']);
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
      d.t += dt * w.workRate(c);
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
    d.t += dt * w.workRate(c);
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
    // a pond snail scrapes the green off the glass as often as the gravel
    const g = c.def.glass && chance(0.6) ? glassSpot(c, w) : null;
    if (g) {
      c.seek(g);
      return;
    }
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
  can: (c) => c.larva,
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
// Where a new thing (or a change to the tank) is, for this critter: on the
// ground above a hole for a walker, in the water for a swimmer.
function lookSpot(c, w, n) {
  const t = w.terrain;
  if (c.mode === 'swim' || c.mode === 'glass') return t.waterAt(n.x, n.y) ? [n.x + rrange(-10, 10), n.y + rrange(-8, 8)] : null;
  const x = clamp(n.x + rrange(-14, 14), 10, W - 10);
  return [x, t.surfaceY(x)];
}
def('investigate', {
  score(c, w) {
    const n = w.noveltyNear(c);
    if (!n) return 0;
    c.memory.nov = n;
    // the tank itself changing shape gets everyone's attention, not just
    // the curious ones
    const change = n.kind !== 'thing';
    return (change ? 0.2 + c.traits.curious * 0.6 : c.traits.curious * 0.55) * n.strength * c.act;
  },
  start(c, w) {
    const d = c.brain.data;
    const n = c.memory.nov;
    d.n = n;
    if (!n) return;
    const p = lookSpot(c, w, n);
    if (p && reachable(c, w, p[0], p[1] - (c.mode === 'swim' ? 0 : 3))) c.seekPoint(p[0], p[1]);
    else d.look = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.n) return false;
    if (c.arrived || d.look || (c.blocked && c.mode !== 'swim')) {
      d.t = (d.t || 0) + dt;
      if (!d.em) {
        d.em = true;
        c.emote('?', 1.4);
        d.n.seen = (d.n.seen || 0) + 1;
        if (d.n.kind !== 'thing') w.events.emit('explore', { c, kind: d.n.kind });
      }
      // a new hill, a hole or new water is worth poking about in properly
      if (d.n.kind !== 'thing' && !d.look && d.t > 1.6 && !d.more) {
        d.more = true;
        d.t = 0;
        const p = lookSpot(c, w, { x: d.n.x + rrange(-50, 50), y: d.n.y + rrange(-20, 20) });
        if (p && reachable(c, w, p[0], p[1] - (c.mode === 'swim' ? 0 : 3))) {
          c.seekPoint(p[0], p[1]);
          return true;
        }
      }
      if (c.mode === 'walk' && chance(dt * 0.8)) c.pose = c.pose === 'eat' ? 'idle' : 'eat'; // a good sniff
      c.facing = d.n.x >= c.x ? 1 : -1;
      return d.t < (d.n.kind === 'thing' ? 2 : 3);
    }
    return c.brain.t < 14;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: (c) => {
    const k = c.brain.data.n ? c.brain.data.n.kind : 'thing';
    if (k === 'dig') return rpick(['Somebody has been digging here!', 'A brand-new hole! What is down there?', 'The ground has changed. Let me have a look.']);
    if (k === 'fill') return rpick(['Ooh, a new hill!', 'This bit of ground was not here before.', 'Fresh sand! Let me have a sniff.']);
    if (k === 'water') return rpick(['New water! Where does it go?', 'Exploring the new bit of the pond.', 'Ooh, somewhere new to swim!']);
    return rpick(['Ooh! What is that?', 'Something new! Let me look.', 'Curiouser and curiouser...']);
  },
});

// --------------------------------------------------------------------- home (pop home for a bit, or go house-hunting)
def('home', {
  can: (c) => !!homeKind(c) && c.mode !== 'climb' && c.mode !== 'burrow',
  hold: 0.42,
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
  hold: 0.42,
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
        w.events.emit('hello', { c, o: p });
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
        w.events.emit('hello', { c, o: p });
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
  hold: 0.45,
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

// --------------------------------------------------------------------- gather (spare food: keep it, give it, or leave it)
// A critter that isn't hungry right now may pick up a bit of spare food and
// take it home to keep for later, carry it over to someone who's hungry, or
// just leave it where it is. Which it does comes down to character:
// sociable ones share, greedy ones squirrel it away, lazy ones leave it.
const NO_CARRY = { ant: 1, bee: 1, butterfly: 1, aphid: 1, worm: 1, fruitfly: 1, firefly: 1, frog: 1 };
function canCarry(c) {
  return !NO_CARRY[c.sp] && c.stage !== 'egg' && !c.pupa && !c.larva && (c.mode === 'walk' || c.mode === 'swim' || c.mode === 'glass');
}
function likes(c, f) {
  let like = 0;
  for (const tg of f.tags) like = Math.max(like, c.diet[tg] || 0);
  return like;
}
// The hungry critter (not necessarily its own kind) who'd most welcome
// this food, and that this one can carry it to.
function hungryFriend(c, w, f, range) {
  let best = null;
  let bs = 0;
  const near = w.hashC.query(c.x, c.y, range);
  for (let i = 0; i < near.length; i++) {
    const o = near[i];
    if (o === c || o.dead || o.hidden || o.hunger < 0.5 || o.stage === 'egg' || o.pupa || o.sp === 'ant') continue;
    const like = likes(o, f);
    if (like < 0.4 || !reachable(c, w, o.x, o.y - 2) || !reachable(o, w, o.x, o.y - 2)) continue;
    const kin = o.sp === c.sp ? 1.3 : 1;
    const young = o.isAdult ? 1 : 1.3;
    const s = (o.hunger * like * kin * young) / (1 + Math.hypot(o.x - c.x, o.y - c.y) / 150);
    if (s > bs) {
      bs = s;
      best = o;
    }
  }
  return best;
}
// Where it keeps its snacks: by its front door, or wherever it beds down.
function larderSpot(c, w) {
  const h = w.homeOf(c);
  if (h && reachable(c, w, h.doorX, h.doorY - 3)) return { x: h.doorX + (h.doorX >= h.x ? 6 : -6), y: h.doorY, home: h };
  const den = c.memory.den;
  if (den && reachable(c, w, den.x, den.y - 3) && Math.abs(den.x - c.x) < 400) return { x: den.x, y: den.y };
  return null;
}
def('gather', {
  can: canCarry,
  hold: 0.5,
  score(c, w) {
    if (c.hunger > 0.45 || c.fear > 0.3 || c.act < 0.35) return 0;
    const m = c.memory;
    if (m.gT && w.time - m.gT < 4) return m.gPlan && !m.gPlan.f.gone && m.gPlan.f.loose ? m.gPlan.s : 0;
    m.gT = w.time;
    m.gPlan = null;
    if (m.gCD && w.time < m.gCD) return 0;
    const f = w.hashF.nearest(c.x, c.y, c.def.sight, (o) => !o.gone && o.loose && o.amount > 0.04 && o.fresh > 0 && !(o.owner && o.owner !== c.id) && likes(c, o) >= 0.4 && foodReach(c, w, o));
    if (!f) return 0;
    const friend = hungryFriend(c, w, f, 260);
    const give = friend ? (0.3 + c.traits.social * 0.8) * friend.hunger * (1.1 - c.hunger) : 0;
    // (fish don't hoard: food left lying in the pond would only go off)
    const spot = f.owner === c.id || c.mode === 'swim' ? null : larderSpot(c, w);
    const stash = w.foodById(m.stash);
    const keep = spot && Math.hypot(spot.x - f.x, spot.y - f.y) > 30 ? (0.15 + c.traits.greedy * 0.5 + (1 - c.traits.social) * 0.12) * (stash && !stash.gone ? 0.3 : 1) * (f.inWater ? 0.7 : 1) : 0;
    const leave = 0.12 + c.traits.lazy * 0.25 + Math.random() * 0.15;
    if (Math.max(give, keep) <= leave) {
      // it'll leave that be, and not think about it again for a while
      m.gCD = w.time + rrange(20, 50);
      return 0;
    }
    m.gPlan = give >= keep ? { f, kind: 'give', to: friend, s: 0.32 + give * 0.5 } : { f, kind: 'keep', to: spot, s: 0.24 + keep * 0.5 };
    return m.gPlan.s * (0.5 + 0.5 * c.act);
  },
  start(c, w) {
    const d = c.brain.data;
    const p = c.memory.gPlan;
    c.memory.gPlan = null;
    c.memory.gCD = w.time + (p && p.kind === 'keep' ? rrange(40, 90) : rrange(15, 35));
    if (!p) return;
    d.f = p.f;
    d.kind = p.kind;
    d.to = p.to;
    d.phase = 'go';
    c.seek({ kind: 'food', food: d.f });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.f) return false;
    if (d.phase === 'go') {
      if (d.f.gone || !d.f.loose) return false;
      if (c.arrived) {
        d.phase = 'pick';
        d.t = 0;
        if (c.mode === 'walk') c.halt();
      } else if ((c.blocked && c.mode === 'walk') || c.brain.t > 20) return false;
      return true;
    }
    if (d.phase === 'pick') {
      c.pose = 'eat';
      d.t += dt;
      if (d.t < 0.7) return true;
      c.pose = 'idle';
      if (d.f.gone || !d.f.loose) return false;
      const piece = w.takePiece(d.f, c);
      if (!piece) return false;
      c.carrying = piece;
      d.phase = 'carry';
      d.t0 = c.brain.t;
      if (d.kind === 'give') c.seek({ kind: 'creature', c: d.to });
      else c.seekPoint(d.to.x, d.to.y);
      return true;
    }
    // carrying it
    const piece = c.carrying;
    if (!piece || piece.gone || piece.holder !== c) return false;
    if (c.brain.t - d.t0 > 35) return false; // (stop() drops it)
    if (d.kind === 'give') {
      const o = d.to;
      if (o.dead || o.removed || o.hidden || o.hunger < 0.25) {
        // they've eaten (or gone in): someone else, or keep it, or leave it
        const other = hungryFriend(c, w, piece, 220);
        if (other) {
          d.to = other;
          c.seek({ kind: 'creature', c: other });
        } else return false;
        return true;
      }
      if (Math.hypot(o.x - c.x, o.y - c.y) < (c.size + o.size) * 0.5 + 8) {
        // set it down right in front of them
        c.facing = o.x >= c.x ? 1 : -1;
        c.carrying = null;
        piece.x = o.x - c.facing * o.size * 0.3;
        piece.drop(w);
        piece.giftFor = o.id;
        piece.giftBy = c.name;
        o.memory.tip = { food: piece, t: w.time };
        o.brain.think = Math.min(o.brain.think, 0.2);
        c.emote('heart', 1.4);
        w.events.emit('gift', { c, to: o, food: piece });
        if (w.time - w.shareLogT > 60 && !w.awayMode) {
          w.shareLogT = w.time;
          w.addLog(`${c.name} the ${c.def.name.toLowerCase()} brought some ${piece.def.name.toLowerCase()} to hungry ${o.name} the ${o.def.name.toLowerCase()}.`, 'heart');
        }
        return false;
      }
      if (!c.target || c.arrived) c.seek({ kind: 'creature', c: o });
      return true;
    }
    // keeping it: put it down by the door (or the bed)
    if (c.arrived || Math.hypot(d.to.x - c.x, d.to.y - c.y) < 8) {
      c.carrying = null;
      piece.drop(w);
      piece.owner = c.id;
      c.memory.stash = piece.id;
      w.events.emit('stash', { c, food: piece });
      return false;
    }
    if (c.blocked && c.mode === 'walk') return false;
    return true;
  },
  // with a mouthful, it sees the errand through (unless something scares it)
  lock(c) {
    const d = c.brain.data;
    return (d.phase === 'pick' || d.phase === 'carry') && c.fear < 0.4 && c.hunger < 0.75;
  },
  stop(c, w) {
    if (c.pose === 'eat') c.pose = 'idle';
    // whatever happened, it lets go of what it was carrying
    if (c.carrying) {
      c.carrying.drop(w);
      c.carrying = null;
    }
  },
  thought(c) {
    const d = c.brain.data;
    const n = d.f ? d.f.def.name.toLowerCase() : 'food';
    if (d.kind === 'give') return d.phase === 'carry' ? `Taking some ${n} to ${d.to.name}. They look hungry!` : `${d.to ? d.to.name : 'My friend'} looks hungry. I'll bring them some ${n}.`;
    return d.phase === 'carry' ? `Taking this ${n} home for later.` : `I'm full, but I'll keep some ${n} for later.`;
  },
});

// --------------------------------------------------------------------- beg (fish know the keeper means food)
// Goldfish learn when and where the food comes. With the keeper's Feed
// tool out they crowd up to the top, mouths open; and around the time of
// day they're usually fed, the hungry ones wait at the usual spot.
function mealWord(h) {
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 20 ? 'dinner' : 'supper';
}
def('beg', {
  can: (c) => c.def.fish && c.sp !== 'puffer' && c.mode === 'swim' && c.stage !== 'egg',
  score(c, w) {
    if (c.hunger < 0.12 || c.fear > 0.3) return 0;
    if (w.keeperFeeding) return 0.5 + c.hunger * 0.6;
    if (c.hunger < 0.3) return 0;
    const fm = w.feedMem;
    const h = Math.floor(w.env.hour);
    const habit = fm.hours[h % 24] + fm.hours[(h + 1) % 24] * 0.7;
    const f = cachedFood(c, w);
    if (habit < 0.9 || (f && f.kind === 'food')) return 0;
    return 0.25 + Math.min(0.35, habit * 0.12);
  },
  start(c, w) {
    const d = c.brain.data;
    const t = w.terrain;
    d.keeper = w.keeperFeeding;
    const x = clamp(w.feedMem.x + rrange(-45, 45), 10, W - 10);
    d.x = t.waterAt(x, t.waterSurfY(x) + 6) ? x : c.x;
    c.seekPoint(d.x, t.waterSurfY(d.x) + 5, { speedMul: 1.2 });
    if (d.keeper) c.emote('food', 1.4);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.arrived) {
      // mouth at the surface, gulping hopefully
      c.pose = 'gasp';
      d.t = (d.t || 0) + dt;
      if (chance(dt * 0.8)) w.bubble(c.x + c.facing * c.size * 0.4, c.y - 2);
      if (chance(dt * 0.4)) c.seekPoint(d.x + rrange(-12, 12), w.terrain.waterSurfY(d.x) + rrange(4, 7));
      if (!d.told && d.t > 1.5) {
        d.told = true;
        w.events.emit('beg', { c, keeper: d.keeper });
      }
    }
    const f = cachedFood(c, w);
    if (f && f.kind === 'food' && c.hunger > 0.2) return false; // food! off to get it
    return c.brain.t < (d.keeper ? 25 : 14) && (d.keeper ? w.keeperFeeding : true);
  },
  stop(c) {
    if (c.pose === 'gasp') c.pose = 'idle';
  },
  thought: (c, w) => (c.brain.data.keeper ? rpick(['Food? Is that food? Food!', 'Ooh, ooh, me first!', 'I know that hand. That hand means food!']) : `It's nearly ${mealWord(w.env.hour)} time. The keeper always feeds us about now...`),
});

// --------------------------------------------------------------------- chase (playing tag in the water)
def('chase', {
  can: (c) => ((c.def.fish && c.sp !== 'puffer') || (c.sp === 'frog' && c.stage === 'tadpole')) && c.mode === 'swim',
  hold: 0.5,
  score(c, w) {
    if (c.hunger > 0.5 || c.fear > 0.2 || c.act < 0.5) return 0;
    const m = c.memory;
    if (m.chaseT && w.time - m.chaseT < 70) return 0;
    if (!m.playQ || w.time - m.playQ > 5) {
      m.playQ = w.time;
      m.playmate = w.hashC.nearest(c.x, c.y, 180, (o) => o !== c && o.sp === c.sp && o.stage === c.stage && !o.dead && !o.hidden && o.mode === 'swim' && (!o.brain.b || o.brain.b.id === 'wander' || o.brain.b.id === 'idle' || o.brain.b.id === 'socialize'));
    }
    return m.playmate ? (0.06 + (c.traits.curious + c.traits.social) * 0.14) * c.act : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.p = c.memory.playmate;
    c.memory.chaseT = w.time;
    d.dur = rrange(4, 7);
    if (!d.p) return;
    switchTo(d.p, w, 'chased', { by: c });
    d.p.memory.chaseT = w.time;
    c.seek({ kind: 'creature', c: d.p, speedMul: 1.35 });
    c.burst = 0.5;
  },
  tick(c, w) {
    const d = c.brain.data;
    const p = d.p;
    if (!p || p.dead || p.hidden) return false;
    if (!c.target || c.arrived) c.seek({ kind: 'creature', c: p, speedMul: 1.35 });
    if (Math.hypot(p.x - c.x, p.y - c.y) < (c.size + p.size) * 0.4 && !d.tag) {
      // tag!
      d.tag = true;
      c.emote('note', 1);
      w.events.emit('tag', { c, o: p });
      if (chance(0.4) && p.brain.b && p.brain.b.id === 'chased') {
        // ...and now it's their turn to be "it"
        p.memory.playmate = c;
        switchTo(p, w, 'chase', {});
        return true;
      }
    }
    return c.brain.t < d.dur;
  },
  thought: (c) => `Tag! Catching ${c.brain.data.p ? c.brain.data.p.name : 'you'}!`,
});
def('chased', {
  score: () => 0,
  hold: 0.55,
  start(c) {
    c.brain.data.re = 0;
    c.burst = 0.5;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const by = d.by;
    if (!by || by.dead || !by.brain.b || by.brain.b.id !== 'chase') return c.brain.t < 1;
    d.re -= dt;
    if (d.re <= 0) {
      // zip off the other way, with a jink now and then
      d.re = rrange(0.6, 1.2);
      const dir = c.x >= by.x ? 1 : -1;
      const body = w.waterBody(c.x, c.y);
      const p = waterSpot(c, w, body, rrange(0.1, 0.8), 120) || [c.x + dir * 60, c.y];
      const tx = Math.abs(p[0] - by.x) > Math.abs(c.x - by.x) ? p[0] : c.x + dir * 60;
      c.seekPoint(tx, p[1], { speedMul: 1.3 });
      if (chance(0.5)) c.burst = 0.4;
    }
    return c.brain.t < 9;
  },
  thought: (c) => `Can't catch me, ${c.brain.data.by ? c.brain.data.by.name : 'slowcoach'}!`,
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
      const x = clamp(c.x + rrange(-40, 40), ZONE_X.pond[0] - 40, ZONE_X.pond[1] + 40);
      if (t.waterAt(x, t.waterLevel + 4)) c.seekPoint(x, t.waterLevel + 3);
      else c.seekPoint(c.x, t.waterLevel + 3);
      return;
    }
    // a pond snail glides up the glass to the water's skin
    if (c.def.glass) {
      const x = clamp(c.x + rrange(-50, 50), 10, W - 10);
      c.seekPoint(t.waterAt(x, t.waterSurfY(x) + 4) ? x : c.x, t.waterSurfY(c.x) + 3);
      return;
    }
    // (otherwise it climbs a stem to the top; a lily pad is perfect)
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
      if (c.mode === 'glass' && d.t > 4) {
        c.memory.airT = w.time;
        return false;
      }
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

// --------------------------------------------------------------------- clinic (poorly critters check in at Doctor Dot's)
function clinicFor(c, w) {
  let best = null;
  let bd = 700;
  for (const d of w.decor) {
    if (!d.def.clinic || !suits(c, d)) continue;
    const dd = Math.abs(d.x - c.x);
    if (dd < bd && canReachDoor(c, w, d)) {
      bd = dd;
      best = d;
    }
  }
  return best;
}
def('clinic', {
  can: (c) => c.isAdult && !c.def.colony && (c.mode === 'walk' || c.mode === 'fly' || c.mode === 'climb'),
  hold: 0.9,
  score(c, w) {
    if (!w.has.clinic) return 0;
    const poorly = c.health < 0.6 ? (0.6 - c.health) * 2.4 : 0;
    const old = c.age > c.lifespan * 0.85 && c.health < 0.97 ? 0.25 : 0;
    if (poorly + old <= 0) return 0;
    const m = c.memory;
    if (!m.clinicQ || w.time - m.clinicQ > 5) {
      m.clinicQ = w.time;
      m.clinic = clinicFor(c, w);
    }
    return m.clinic ? 0.45 + poorly + old : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.d = c.memory.clinic;
    if (d.d) headInside(c, d.d);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.d || d.d.removed) return false;
    if (c.inside !== d.d) {
      const r = goInside(c, w, d.d, 50);
      if (r === 'fail') return false;
      if (r === 'go') return true;
      d.inT = 0;
      w.events.emit('clinic', { c, d: d.d });
      if (!w.awayMode) w.addLog(`${c.name} the ${c.def.name.toLowerCase()} checked into the critter clinic.`, 'heart');
    }
    // bed rest and a bowl of soup
    d.inT += dt;
    c.pose = 'sleep';
    c.health = Math.min(1, c.health + dt / 40);
    c.hunger = Math.max(0, c.hunger - dt / 400);
    if (c.health >= 0.98 && d.inT > 20) {
      c.emote('heart', 2);
      return false;
    }
    return c.brain.t < 240;
  },
  stop(c) {
    c.pose = 'idle';
    comeOut(c);
    c.hidden = false;
  },
  thought: (c) => (c.inside ? rpick(['Doctor Dot says: rest, and plenty of soup.', 'Feeling better already.']) : 'I feel a bit poorly. Off to the clinic!'),
});

// --------------------------------------------------------------------- soar (riding the warm air up under a lamp)
// The air under a heat lamp is warm and rising. Butterflies, moths and
// dragonflies spiral up in it on open wings, then glide off across the tank.
function warmLamp(c, w) {
  let best = null;
  let bd = 700;
  for (const z of ['desert', 'pond', 'jungle']) {
    const lamp = w.env.lampAt(ZONE_MID[z]);
    if (lamp.power < 0.2) continue;
    const d = Math.abs(lamp.x - c.x);
    if (d < bd) {
      bd = d;
      best = lamp;
    }
  }
  return best;
}
def('soar', {
  can: (c) => (c.sp === 'butterfly' || c.sp === 'moth' || c.sp === 'dragonfly') && c.isAdult,
  hold: 0.45,
  score(c, w) {
    if (c.hunger > 0.55 || c.fear > 0.3 || c.act < 0.45) return 0;
    const m = c.memory;
    if (m.soarT && w.time - m.soarT < 120) return 0;
    if (!m.lampQ || w.time - m.lampQ > 6) {
      m.lampQ = w.time;
      m.lamp = warmLamp(c, w);
    }
    return m.lamp ? (0.1 + c.traits.curious * 0.18) * c.act : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.lamp = c.memory.lamp;
    c.memory.soarT = w.time;
    if (c.mode !== 'fly') c.takeOff();
    d.r = rrange(26, 52);
    d.a = Math.atan2(c.y - 200, c.x - (d.lamp ? d.lamp.x : c.x));
    d.y = Math.min(c.y, airFloor(w.terrain, d.lamp ? d.lamp.x : c.x) - 40);
    d.dir = chance(0.5) ? 1 : -1;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.lamp) return false;
    // spiral in toward the column of warm air, then up it
    const near = Math.abs(c.x - d.lamp.x) < d.r + 30;
    if (near) {
      d.a += dt * 1.7 * d.dir;
      d.y = Math.max(CEIL + 40, d.y - dt * 26 * (0.5 + d.lamp.power));
      c.soarT = Math.max(c.soarT, 0.3);
    }
    c.seekPoint(d.lamp.x + Math.cos(d.a) * d.r, d.y + Math.sin(d.a) * d.r * 0.22, { speedMul: near ? 0.6 : 1 });
    if (d.y <= CEIL + 41 && !d.top) {
      d.top = true;
      d.topT = c.brain.t;
      w.events.emit('soar', { c });
    }
    return c.brain.t < 16 && !(d.top && c.brain.t - d.topT > 2.5);
  },
  stop(c) {
    c.soarT = 1.2; // and glide away
  },
  thought: () => rpick(['Riding the warm air up, up, up!', 'Wheee, the lamp makes the air float!', 'Look at me soar!']),
});

// --------------------------------------------------------------------- dance (two butterflies spiral up into the sky together)
def('dance', {
  can: (c) => (c.sp === 'butterfly' || c.sp === 'moth') && c.isAdult,
  hold: 0.5,
  score(c, w) {
    if (c.mode !== 'fly' || c.hunger > 0.5 || c.fear > 0.2 || c.act < 0.5) return 0;
    const m = c.memory;
    if (m.danceT && w.time - m.danceT < 90) return 0;
    if (!m.danceQ || w.time - m.danceQ > 4) {
      m.danceQ = w.time;
      m.partner = w.hashC.nearest(c.x, c.y, 200, (o) => o !== c && o.sp === c.sp && o.isAdult && !o.dead && o.mode === 'fly' && (!o.brain.b || ['wander', 'idle', 'search', 'pollinate'].includes(o.brain.b.id)) && (!o.memory.danceT || w.time - o.memory.danceT > 60));
    }
    return m.partner ? (0.08 + c.traits.social * 0.2) * c.act : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    const p = c.memory.partner;
    d.p = p;
    c.memory.danceT = w.time;
    if (!p) return;
    p.memory.danceT = w.time;
    d.cx = (c.x + p.x) / 2;
    d.cy = Math.min(c.y, p.y);
    d.a = 0;
    d.r = rrange(14, 24);
    d.dur = rrange(5, 8);
    switchTo(p, w, 'danced', { by: c });
    w.events.emit('dance', { c, p });
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const p = d.p;
    if (!p || p.dead || !p.brain.b || p.brain.b.id !== 'danced') return false;
    // round and round each other, rising as they go, carried on the breeze
    d.a += dt * 3.2;
    d.cy = Math.max(CEIL + 16, d.cy - dt * 16);
    d.cx = clamp(d.cx + Math.sin(c.brain.t * 0.7) * dt * 12, 60, W - 60);
    c.seekPoint(d.cx + Math.cos(d.a) * d.r, d.cy + Math.sin(d.a) * d.r * 0.7, { speedMul: 1.15 });
    p.seekPoint(d.cx - Math.cos(d.a) * d.r, d.cy - Math.sin(d.a) * d.r * 0.7, { speedMul: 1.15 });
    if (chance(dt * 0.5)) c.emote('heart', 1);
    return c.brain.t < d.dur;
  },
  thought: (c) => `Dancing up into the sky with ${c.brain.data.p ? c.brain.data.p.name : 'a friend'}!`,
});
def('danced', {
  score: () => 0,
  hold: 0.55,
  start(c) {
    c.soarT = 0;
  },
  tick(c) {
    const by = c.brain.data.by;
    if (!by || by.dead || !by.brain.b || by.brain.b.id !== 'dance') return c.brain.t < 0.5;
    return c.brain.t < 10;
  },
  thought: (c) => `Twirling round and round with ${c.brain.data.by ? c.brain.data.by.name : 'a friend'}!`,
});

// --------------------------------------------------------------------- lamp (moths can't resist a light at night)
function nightLight(c, w) {
  let best = null;
  let bd = 600;
  for (const d of w.decor) {
    if (!d.def.light) continue;
    const dd = Math.abs(d.x - c.x);
    if (dd < bd) {
      bd = dd;
      best = { x: d.x, y: d.y - d.def.h + 8 };
    }
  }
  for (const z of ['desert', 'pond', 'jungle']) {
    const lamp = w.env.lampAt(ZONE_MID[z]);
    const dd = Math.abs(lamp.x - c.x);
    if (lamp.power > 0.2 && dd < bd) {
      bd = dd;
      best = { x: lamp.x, y: CEIL + 26 };
    }
  }
  for (const p of w.plants) {
    if (p.dead || !p.def.night || !p.flowers.some((f) => f.nectar > 0.3) || Math.abs(p.x - c.x) > bd) continue;
    bd = Math.abs(p.x - c.x);
    best = { x: p.x, y: p.y - p.def.h * p.growth - 10 };
  }
  return best;
}
def('lamp', {
  can: (c) => c.sp === 'moth' && c.isAdult,
  hold: 0.5,
  score(c, w) {
    if (w.env.sun > 0.4 || c.hunger > 0.6) return 0;
    const m = c.memory;
    if (m.lampT && w.time - m.lampT < 40) return 0;
    m.light = nightLight(c, w);
    return m.light ? 0.3 + c.traits.curious * 0.2 : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.l = c.memory.light;
    c.memory.lampT = w.time;
    if (c.mode !== 'fly') c.takeOff();
    d.a = rrange(0, 6.28);
    d.dur = rrange(6, 12);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (!d.l) return false;
    // muddled loops round and round the light
    d.a += dt * (2.4 + Math.sin(c.brain.t * 1.3) * 1.2);
    const r = 12 + Math.sin(c.brain.t * 2.1) * 6;
    c.seekPoint(d.l.x + Math.cos(d.a) * r * 1.4, Math.max(CEIL, d.l.y + Math.sin(d.a) * r), { speedMul: 1.1 });
    if (!d.told && c.brain.t > 3) {
      d.told = true;
      w.events.emit('mothLamp', { c });
    }
    return c.brain.t < d.dur;
  },
  thought: () => rpick(['Ooh, a light! Must... go... round...', 'So bright! So lovely!', 'Is that the moon? It must be the moon.']),
});

// --------------------------------------------------------------------- rummage (koi feel about in the gravel, and sometimes find a coin)
def('rummage', {
  can: (c) => c.sp === 'koi' && c.isAdult && c.mode === 'swim',
  hold: 0.45,
  score(c, w) {
    if (c.hunger > 0.6 || c.fear > 0.3) return 0;
    const m = c.memory;
    if (m.rumT && w.time - m.rumT < 50) return 0;
    return (0.16 + c.traits.curious * 0.2) * c.act;
  },
  start(c, w) {
    const d = c.brain.data;
    c.memory.rumT = w.time;
    const p = w.randomWaterPoint(c.x, 160, true);
    if (p) c.seekPoint(p[0], p[1] - 6);
    else d.fail = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.fail) return false;
    if (!c.arrived) return c.brain.t < 20;
    c.pose = 'eat';
    d.t = (d.t || 0) + dt;
    if (chance(dt * 3)) w.dust(c.x + c.facing * c.size * 0.4, c.y + 6, 1);
    if (d.t > 4) {
      // a lucky find, once in a while (more often for a busy koi)
      const m = c.memory;
      const due = !m.coinT || w.time - m.coinT > DAY_LEN * (c.busyT > 0 ? 0.2 : 0.4);
      if (due && chance(0.45)) {
        m.coinT = w.time;
        const n = rint(1, 3);
        w.earn(n, `${c.name} the koi`, c.x, c.y);
        w.credit(c);
        c.emote('star', 2);
        w.events.emit('koiCoin', { c, n });
        w.addLog(`${c.name} the koi found ${n === 1 ? 'a lost coin' : n + ' lost coins'} in the gravel!`, 'coin');
      }
      return false;
    }
    return true;
  },
  stop(c) {
    if (c.pose === 'eat') c.pose = 'idle';
  },
  thought: () => rpick(['Rummage, rummage...', 'Something shiny down here?', 'My whiskers are tingling!']),
});

// --------------------------------------------------------------------- deliver (the mail dragonfly does its round)
function nextGood(c, w) {
  let best = null;
  let bd = 1e9;
  for (const g of w.goods) {
    if (g.gone || (g.claim && g.claim !== c.id)) continue;
    const d = Math.abs(g.x - c.x) + Math.abs(g.y - c.y) * 0.5;
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best;
}
def('deliver', {
  can: (c) => c.role === 'courier' && c.isAdult,
  hold: 0.9,
  score(c, w) {
    if (c.hunger > 0.75 || c.energy < 0.12) return 0;
    if (!w.goods.length) return 0;
    return 0.95;
  },
  start(c, w) {
    const d = c.brain.data;
    if (c.mode !== 'fly') c.takeOff();
    d.g = nextGood(c, w);
    if (d.g) {
      d.g.claim = c.id;
      c.seekPoint(d.g.x, d.g.y - 6, { speedMul: 1.2, near: true });
    }
  },
  tick(c, w) {
    const d = c.brain.data;
    if (c.mode !== 'fly') c.takeOff();
    if (!d.g || d.g.gone) {
      d.g = nextGood(c, w);
      if (!d.g) return false;
      d.g.claim = c.id;
    }
    if (!c.target || Math.hypot(c.target.x - d.g.x, c.target.y - (d.g.y - 6)) > 4) c.seekPoint(d.g.x, d.g.y - 6, { speedMul: 1.2, near: true });
    if (Math.hypot(c.x - d.g.x, c.y - (d.g.y - 6)) < 12) {
      const g = d.g;
      d.g = null;
      if (w.collectGood(g, c)) {
        w.credit(c);
        c.emote('star', 1);
      }
    }
    return c.brain.t < 45;
  },
  stop(c, w) {
    const d = c.brain.data;
    if (d.g && d.g.claim === c.id) d.g.claim = 0;
  },
  thought: (c) => rpick(['Collecting the post!', 'Special delivery for the keeper!', 'Zoom! Next stop!']),
});

// Which behaviours each species knows.
const BASE = ['idle', 'wander', 'rest', 'forage', 'snack', 'search', 'comfort', 'flee', 'mate', 'investigate', 'home', 'socialize', 'gather', 'clinic'];
export const SPECIES_BEHAVIORS = {
  default: BASE,
  cricket: [...BASE, 'chirp', 'hide'],
  grasshopper: [...BASE, 'chirp'],
  gecko: [...BASE, 'hunt', 'bask', 'hide'],
  beetle: [...BASE, 'headstand', 'hide', 'recycle'],
  goldfish: [...BASE, 'hunt', 'graze', 'beg', 'chase'],
  guppy: [...BASE, 'hunt', 'graze', 'beg', 'chase'],
  tetra: [...BASE, 'graze', 'beg', 'chase'],
  koi: [...BASE, 'graze', 'beg', 'chase', 'rummage'],
  puffer: [...BASE, 'hunt'],
  axolotl: ['idle', 'wander', 'rest', 'forage', 'snack', 'search', 'comfort', 'flee', 'investigate', 'home', 'socialize', 'gather'],
  dragonfly: [...BASE, 'hunt', 'soar', 'deliver'],
  moth: [...BASE, 'pollinate', 'pupate', 'soar', 'dance', 'lamp'],
  frog: [...BASE, 'hunt', 'croak', 'graze', 'breathe', 'chase'],
  turtle: [...BASE, 'bask', 'breathe'],
  pondsnail: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate', 'home', 'breathe', 'investigate', 'gather'],
  shrimp: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate', 'investigate', 'home', 'socialize', 'gather'],
  ladybug: [...BASE, 'hunt', 'huddle'],
  aphid: ['idle', 'sap', 'mate', 'comfort'],
  butterfly: [...BASE, 'pollinate', 'pupate', 'soar', 'dance'],
  snail: [...BASE, 'estivate'],
  bee: [...BASE, 'pollinate', 'bring'],
  worm: ['idle', 'wander', 'rest', 'forage', 'comfort', 'mate', 'surface'],
  firefly: [...BASE, 'glow', 'pollinate'],
  pillbug: [...BASE, 'hide'],
  fruitfly: ['idle', 'wander', 'forage', 'search', 'rest', 'flee'],
};

export { clamp01 };
