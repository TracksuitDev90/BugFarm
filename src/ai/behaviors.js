// Behaviour library. Each behaviour scores how much a critter wants to do it
// right now, then drives the body while it runs.
import { DAY_LEN, W } from '../config.js';
import { clamp, clamp01, smoothstep } from '../util/math.js';
import { rrange, chance, rpick } from '../util/rng.js';
import {
  cachedFood, validFood, findPrey, findMate, wanderTarget, nearestPlantSlot, comfortSpot, nearestShelter, lampSpot,
  pickFlower, reachable, preyValue,
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

export const BEHAVIORS = {};
function def(id, b) {
  b.id = id;
  BEHAVIORS[id] = b;
}

// --------------------------------------------------------------------- idle
def('idle', {
  score: () => 0.07,
  start(c) {
    c.halt();
    c.brain.data.dur = rrange(1.5, 4);
    c.pose = 'idle';
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (chance(dt * 0.3) && c.mode !== 'climb') c.facing = -c.facing;
    if (c.mode === 'fly') {
      // hover lazily
      if (!c.target || c.arrived) c.seekPoint(c.x + rrange(-12, 12), c.y + rrange(-8, 8));
    }
    return c.brain.t < d.dur;
  },
  thought: (c) => rpick(['Just looking around.', 'Hmm-hmm-hmm...', 'What a nice day.', 'Thinking about snacks.']),
});

// --------------------------------------------------------------------- wander
def('wander', {
  score: (c) => (0.15 + c.traits.curious * 0.14) * c.act,
  start(c, w) {
    const range = c.mode === 'fly' ? 220 : c.mode === 'swim' ? 160 : 60 + c.traits.curious * 140;
    if (!goTo(c, wanderTarget(c, w, range))) c.brain.data.fail = true;
    c.brain.data.zone = zoneWord(w, c.x);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.fail) return false;
    if (c.arrived) {
      d.pause = (d.pause || rrange(0.8, 2.5)) - dt;
      if (c.mode === 'fly' && c.sp !== 'butterfly' && c.sp !== 'bee') return false;
      return d.pause > 0;
    }
    if (c.blocked && c.mode !== 'fly' && c.mode !== 'swim') return false;
    return c.brain.t < 25;
  },
  thought: (c) =>
    c.traits.curious > 0.6
      ? rpick(['Ooh, what is over there?', 'Exploring ' + c.brain.data.zone + '!', 'Adventure time!'])
      : rpick(['Having a little stroll.', 'Just pottering about.', 'Stretching my legs.']),
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
  start(c, w) {
    const d = c.brain.data;
    const src = c.threat || c.memory.scare;
    d.dur = rrange(2, 4);
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
    if (d.ball) {
      if (c.sp === 'turtle') c.pose = 'hide';
      return c.brain.t < d.dur + 1.5 || c.fear > 0.4;
    }
    if (c.arrived && c.fear < 0.35) return false;
    return c.brain.t < d.dur;
  },
  stop(c) {
    if (c.pose === 'ball' || c.pose === 'shell' || c.pose === 'hide') c.pose = 'idle';
  },
  thought: (c) =>
    c.pose === 'ball' ? 'Rolled up tight! Safe in here.' : c.pose === 'shell' || c.pose === 'hide' ? 'Hiding in my shell...' : c.threat ? `Eek! A ${c.threat.def.name.toLowerCase()}!` : 'Whoa! What was that?',
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
    if (c.arrived || d.stay) {
      d.sit = (d.sit || 0) + dt;
      if (d.kind !== 'air') c.pose = c.energy < 0.5 ? 'sleep' : 'idle';
      if (c.discomfort < 0.1 || d.sit > 14) return false;
    } else if (c.blocked && c.mode !== 'swim' && c.mode !== 'fly') {
      d.stay = true;
    }
    return c.brain.t < 40;
  },
  stop(c) {
    if (c.pose === 'gasp' || c.pose === 'sleep') c.pose = 'idle';
  },
  thought: (c) => {
    const k = c.brain.data.kind;
    if (k === 'hot') return c.brain.data.sit ? 'Ahh, much cooler here.' : 'Phew, too hot! Looking for shade.';
    if (k === 'cold') return c.brain.data.sit ? 'Warming up slowly...' : 'Brrr! Finding somewhere warm.';
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
  stop(c) {
    c.pose = 'idle';
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
    if (c.mode === 'fly') {
      tgt = nearestPlantSlot(c, w, 300, ['leaf', 'flower', 'stem', 'pad']);
      if (!tgt) {
        const x = c.x;
        tgt = { kind: 'point', x, y: w.terrain.surfaceY(x), ground: true };
      }
    } else if ((c.mode === 'walk' || c.mode === 'climb') && !c.aquatic) {
      const sh = nearestShelter(c, w, c.def.likesShelter ? 300 : 160);
      if (sh && (c.def.likesShelter || chance(0.6))) {
        tgt = { kind: 'point', x: sh.x + rrange(-6, 6), y: sh.y };
        d.shelter = sh;
      }
    } else if (c.mode === 'swim') {
      const fy = w.terrain.surfaceY(c.x) - 12;
      tgt = { kind: 'point', x: c.x, y: Math.max(w.terrain.waterLevel + 10, fy) };
    }
    if (tgt) goTo(c, tgt);
    else {
      c.halt();
      d.here = true;
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.arrived || d.here || (c.blocked && c.mode !== 'fly')) {
      if (c.mode !== 'climb' && c.mode !== 'swim') c.halt();
      if (c.mode === 'swim') c.vx *= 0.9;
      c.pose = 'sleep';
      if (d.shelter) c.hidden = true;
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
    c.hidden = false;
  },
  thought: (c) => (c.pose === 'sleep' ? rpick(['Zzz... dreaming of snacks.', 'Zzz...', 'Snoozing.', 'Zzz... five more minutes.']) : 'Getting sleepy. Time for bed.'),
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
      m.sh = nearestShelter(c, w, 260);
    }
    if (!m.sh && !(c.sp === 'beetle' && c.tempDisc > 0.3)) return 0;
    return s;
  },
  lock(c) {
    return c.hidden && c.fear < 0.6 && c.hunger < 0.8 && c.act < 0.55;
  },
  start(c, w) {
    const d = c.brain.data;
    d.sh = c.memory.sh;
    if (d.sh) c.seekPoint(d.sh.x + rrange(-5, 5), d.sh.y);
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
    if (!d.sh || d.sh.removed) return false;
    if (c.arrived) {
      c.hidden = true;
      c.pose = 'sleep';
      if (c.act > 0.6 && c.brain.t > 8) return false;
    } else if (c.blocked) return false;
    return c.brain.t < 200;
  },
  stop(c) {
    c.hidden = false;
    c.pose = 'idle';
  },
  thought: (c) => (c.brain.data.dig ? 'Dug in under the cool sand.' : c.hidden ? 'Cosy in my hidey-hole.' : 'Off to my hidey-hole.'),
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
      if (!w.hive() || (c.memory.pollen || 0) < 6) return 0;
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
          w.reproduce(c, null);
          c.memory.pollen = 0;
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
    if (d.hive) return 'Bringing pollen home to the bee hotel.';
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
        c.memory.pollen = (c.memory.pollen || 0) + 1;
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
  thought: (c) => (c.sp === 'bee' ? rpick(['Bzz! Flower to flower!', 'Collecting pollen. Busy busy!', 'This one smells lovely.']) : 'Sipping sweet nectar.'),
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
      const sh = nearestShelter(c, w, 400);
      if (sh) c.seekPoint(sh.x, sh.y);
      else d.here = true;
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.arrived || d.here || (d.friend && Math.hypot(d.friend.x - c.x, d.friend.y - c.y) < 10)) {
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
  },
  thought: () => 'Chilly! Snuggling up with friends to keep warm.',
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

// Which behaviours each species knows.
const BASE = ['idle', 'wander', 'rest', 'forage', 'snack', 'search', 'comfort', 'flee', 'mate', 'investigate'];
export const SPECIES_BEHAVIORS = {
  default: BASE,
  cricket: [...BASE, 'chirp', 'hide'],
  grasshopper: [...BASE, 'chirp'],
  gecko: [...BASE, 'hunt', 'bask', 'hide'],
  beetle: [...BASE, 'headstand', 'hide'],
  goldfish: [...BASE, 'hunt', 'graze'],
  frog: [...BASE, 'hunt', 'croak', 'graze'],
  turtle: [...BASE, 'bask'],
  pondsnail: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate'],
  shrimp: ['idle', 'wander', 'rest', 'forage', 'snack', 'graze', 'comfort', 'flee', 'mate', 'investigate'],
  ladybug: [...BASE, 'hunt', 'huddle'],
  aphid: ['idle', 'sap', 'mate', 'comfort'],
  butterfly: [...BASE, 'pollinate', 'pupate'],
  snail: [...BASE, 'estivate'],
  bee: [...BASE, 'pollinate'],
  worm: ['idle', 'wander', 'rest', 'forage', 'comfort', 'mate', 'surface'],
  firefly: [...BASE, 'glow'],
  pillbug: [...BASE, 'hide'],
  fruitfly: ['idle', 'wander', 'forage', 'search', 'rest', 'flee'],
};

export { clamp01 };
