// World queries the AI uses to reason about its surroundings: where food is,
// what's reachable, where it's comfier, where to sleep.
import { W, H, CELL, GW } from '../config.js';
import { FOODS } from '../data/foods.js';
import { LAMP_X } from '../world/environment.js';
import { clamp, smoothstep } from '../util/math.js';
import { rrange, chance, rpick } from '../util/rng.js';

const XY = [0, 0];
const PREY_VALUE = { aphid: 0.035, fruitfly: 0.06, cricket: 0.4, grasshopper: 0.5 };
export function preyValue(sp) {
  return PREY_VALUE[sp] || 0.2;
}

// Can this critter physically get to point (x,y)?
export function reachable(c, w, x, y) {
  const t = w.terrain;
  const wet = t.waterAt(x, y);
  switch (c.mode) {
    case 'fly':
      return !wet || c.sp === 'goldfish';
    case 'swim':
    case 'glass':
      if (wet) return true;
      return c.mode === 'swim' && c.amphibious && y < t.waterLevel + 20;
    case 'burrow':
      return x > 1040 && !wet;
    case 'climb':
    case 'walk':
    case 'crawl': {
      if (c.canFly) return !wet;
      if (c.aquatic) return wet && w.regionOf(x) === w.regionOf(c.x);
      if (c.amphibious) return true;
      if (wet) return false;
      return w.regionOf(x) === w.regionOf(c.x) && w.regionOf(x) > 0;
    }
    default:
      return false;
  }
}

function likeOf(c, tags) {
  const diet = c.diet;
  let best = 0;
  for (let i = 0; i < tags.length; i++) {
    const v = diet[tags[i]];
    if (v > best) best = v;
  }
  return best;
}

// Where to check a critter could get to a bit of food: just above it on
// land, just under it in the water (a flake floats at the very top).
export function foodReach(c, w, f) {
  return reachable(c, w, f.x, f.inWater ? f.y + 2 : f.y - 2);
}

// Best food the critter knows about: food items, plant parts or algae.
export function findFood(c, w) {
  // swimmers smell food right across the water, and see flakes floating at
  // the top against the light
  const wet = c.mode === 'swim' || c.mode === 'glass' || c.inWater;
  const sight = c.def.sight * (c.hunger > 0.6 ? 1.6 : 1) * (wet ? 1.8 : 1);
  let best = null;
  let bestS = 0;
  const diet = c.diet;
  // dropped food
  const foods = w.hashF.query(c.x, c.y, sight);
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (f.gone || f.amount <= 0.001 || !f.loose) continue;
    const like = likeOf(c, f.tags);
    if (like <= 0.05) continue;
    if (!foodReach(c, w, f)) continue;
    // fresh food is nicer, except for tidy-uppers who love it squishy
    const fresh = f.rot === 2 ? 1 : f.rot === 1 ? 0.85 : 1;
    // another critter's stash is mostly left be (unless it's starving); its
    // own is a treat
    const own = f.owner ? (f.owner === c.id ? 1.6 : c.hunger > 0.8 ? 0.8 : 0.3) : 1;
    const d = Math.hypot(f.x - c.x, f.y - c.y);
    const s = (like * fresh * own) / (1 + d / 90);
    if (s > bestS) {
      bestS = s;
      best = { kind: 'food', food: f, value: like, name: f.def.name };
    }
  }
  // a tip-off: food it heard land nearby, or saw a friend tucking into
  const tip = c.memory.tip;
  if (tip) {
    const f = tip.food;
    if (w.time - tip.t > 25 || f.gone || f.amount <= 0.001) c.memory.tip = null;
    else if (f.loose && foodReach(c, w, f)) {
      const like = likeOf(c, f.tags);
      const d = Math.hypot(f.x - c.x, f.y - c.y);
      const s = (like * 1.1) / (1 + d / 160);
      if (like > 0.05 && s > bestS) {
        bestS = s;
        best = { kind: 'food', food: f, value: like, name: f.def.name, tip: tip.by || null };
      }
    }
  }
  // plant parts
  if (diet.leaf || diet.grass || diet.nectar || diet.fruit || diet.fungus || diet.sap) {
    for (const p of w.plants) {
      if (p.dead) continue;
      const dx = p.x - c.x;
      if (Math.abs(dx) > sight + 60) continue;
      const S = p.shape;
      for (const slot of S.slots) {
        const tag = p.slotFood(slot);
        if (!tag) continue;
        const like = diet[tag] || (tag === 'grass' ? diet.leaf || 0 : 0);
        if (like <= 0.05) continue;
        p.slotXY(slot, w.time, XY);
        const sx = XY[0];
        const sy = XY[1];
        // walkers can only nibble low bits unless they climb
        if ((c.mode === 'walk' || c.mode === 'crawl') && !c.canClimb && !c.canFly && sy < p.y - 16) continue;
        if (!reachable(c, w, p.x, p.y - 2) && !(c.mode === 'fly' || c.mode === 'swim')) continue;
        if (c.mode === 'swim' && !p.def.aquatic) continue;
        const d = Math.hypot(sx - c.x, sy - c.y);
        if (d > sight * 1.3) continue;
        const s = like / (1 + d / 90);
        if (s > bestS) {
          bestS = s;
          best = { kind: 'plant', plant: p, slot, value: like, tag, name: p.def.name };
        }
      }
    }
  }
  // algae on everything underwater
  if (diet.algae && (c.inWater || c.mode === 'swim') && w.env.pond.algae > 0.05) {
    const s = (diet.algae * Math.min(1, w.env.pond.algae * 3)) / 1.4;
    if (s > bestS) {
      const pt = w.randomWaterPoint(c.x, 80, c.mode === 'walk');
      if (pt) {
        bestS = s;
        best = { kind: 'algae', x: pt[0], y: pt[1], value: diet.algae, name: 'algae' };
      }
    }
  }
  // worms eat their way through the soil itself
  if (diet.soil && c.mode === 'burrow' && w.terrain.isUnderground(c.x, c.y)) {
    const s = diet.soil * 0.5 * (w.env.fertility.jungle + 0.3);
    if (s > bestS) best = { kind: 'soil', x: c.x, y: c.y, value: diet.soil, name: 'tasty soil' };
  }
  return best;
}

export function cachedFood(c, w) {
  const m = c.memory;
  if (m.ffT && w.time - m.ffT < 1.4 && m.ff !== undefined) {
    const f = m.ff;
    if (!f || validFood(f)) return f;
  }
  m.ffT = w.time;
  m.ff = findFood(c, w);
  return m.ff;
}

export function validFood(t) {
  if (!t) return false;
  if (t.kind === 'food') return !t.food.gone && t.food.amount > 0.001;
  if (t.kind === 'plant') return !t.plant.dead && !t.plant.removed && !!t.plant.slotFood(t.slot) && t.plant.shape.slots.includes(t.slot);
  return true;
}

export function findPrey(c, w) {
  const prey = c.def.prey;
  if (!prey) return null;
  const r = c.def.sight * (c.hunger > 0.6 ? 1.3 : 1);
  return w.hashC.nearest(c.x, c.y, r, (o) => {
    if (o.dead || o.removed || o.hidden || !prey.includes(o.sp)) return false;
    if (o.stage === 'egg' || o.stage === 'chrysalis') return false;
    if (c.sp === 'goldfish') return o.inWater || (o.y > w.terrain.waterLevel - 6 && w.terrain.waterSurfaceAt(o.x) > 0);
    if (c.sp === 'gecko') return o.mode !== 'fly' || o.y > w.terrain.surfaceY(o.x) - 30;
    if (c.sp === 'frog') return o.mode !== 'swim';
    if (c.sp === 'ladybug') return o.mode === 'climb' || o.mode === 'walk';
    return true;
  });
}

export function findMate(c, w) {
  const herm = c.sp === 'snail' || c.sp === 'worm' || c.sp === 'pondsnail';
  const r = Math.max(260, c.def.sight * 2.5);
  return w.hashC.nearest(c.x, c.y, r, (o) => {
    if (o === c || o.dead || o.sp !== c.sp || !o.isAdult) return false;
    if (!herm && o.sex === c.sex) return false;
    if (o.mateCD > 0 || o.hunger > 0.6 || o.health < 0.5) return false;
    const b = o.brain.b;
    if (b && (b.id === 'mate' || b.id === 'courted' || b.id === 'flee')) return false;
    return reachable(c, w, o.x, o.y) || c.mode === o.mode;
  });
}

export function wanderTarget(c, w, range = 140) {
  const t = w.terrain;
  for (let tries = 0; tries < 8; tries++) {
    switch (c.mode) {
      case 'swim': {
        const p = w.randomWaterPoint(c.x, range, false);
        if (p) return { kind: 'point', x: p[0], y: p[1] };
        break;
      }
      case 'fly': {
        let x = c.x + rrange(-range, range);
        const home = c.def.zone === 'jungle' ? 1330 : c.def.zone === 'desert' ? 280 : 800;
        if (chance(0.35)) x = (x + home) / 2;
        x = clamp(x, 24, W - 24);
        let gy = t.surfaceY(x);
        if (t.waterSurfaceAt(x) > 0) gy = Math.min(gy, t.waterLevel);
        const lo = c.sp === 'firefly' ? 20 : 30;
        const hi = c.sp === 'firefly' ? 110 : c.sp === 'fruitfly' ? 90 : 220;
        const y = clamp(gy - rrange(lo, hi), 30, H - 20);
        return { kind: 'point', x, y };
      }
      case 'burrow': {
        const x = clamp(c.x + rrange(-range, range) * 0.6, 1075, W - 10);
        const gy = t.surfaceY(x);
        const y = gy + rrange(14, Math.min(220, H - gy - 14));
        const m = t.matAt(x, y);
        if (m === 1 || m === 2) return { kind: 'point', x, y };
        break;
      }
      default: {
        if (c.canClimb && chance(0.35)) {
          const s = nearestPlantSlot(c, w, range * 1.4, null);
          if (s) return s;
        }
        const x = clamp(c.x + rrange(-range, range), 10, W - 10);
        if (reachable(c, w, x, t.surfaceY(x) - 3)) return { kind: 'point', x, y: t.surfaceY(x) };
      }
    }
  }
  return null;
}

export function nearestPlantSlot(c, w, range, kinds, filter) {
  let best = null;
  let bd = range;
  for (const p of w.plants) {
    if (p.dead) continue;
    if (Math.abs(p.x - c.x) > range) continue;
    if (p.def.aquatic !== (c.aquatic || c.mode === 'swim') && !c.canFly) continue;
    if (!c.canFly && !reachable(c, w, p.x, p.y - 2) && c.mode !== 'swim') continue;
    for (const slot of p.shape.slots) {
      if (kinds && !kinds.includes(slot.kind)) continue;
      if (filter && !filter(p, slot)) continue;
      const [sx, sy] = p.slotWorld(slot, w.time);
      const d = Math.hypot(sx - c.x, sy - c.y) * (0.8 + Math.random() * 0.4);
      if (d < bd) {
        bd = d;
        best = { kind: 'plant', plant: p, slot };
      }
    }
  }
  return best;
}

// Evaluate candidate spots and pick the one whose microclimate suits us best.
export function comfortSpot(c, w) {
  const t = w.terrain;
  const env = w.env;
  const d = c.def;
  const cands = [];
  const add = (x, y, tgt, bonusT = 0, bonusM = 0) => cands.push({ x, y, tgt, bonusT, bonusM });
  if (c.mode === 'swim' || c.inWater) {
    if (c.airDisc > 0.2) {
      add(c.x, t.waterLevel + 4, { kind: 'point', x: c.x, y: t.waterLevel + 4 });
    }
    if (c.amphibious) {
      const sx = w.nearestShore(c.x, LAMP_X.pond);
      if (sx) add(sx, t.surfaceY(sx) - 2, { kind: 'point', x: sx, y: t.surfaceY(sx) });
      add(LAMP_X.pond, t.surfaceY(LAMP_X.pond) - 2, { kind: 'point', x: LAMP_X.pond, y: t.surfaceY(LAMP_X.pond) });
    }
    for (let i = 0; i < 3; i++) {
      const p = w.randomWaterPoint(c.x, 200, c.mode === 'walk');
      if (p) add(p[0], p[1], { kind: 'point', x: p[0], y: p[1] });
    }
  } else if (c.mode === 'burrow') {
    for (let i = 0; i < 5; i++) {
      const x = clamp(c.x + rrange(-120, 120), 1075, W - 10);
      const gy = t.surfaceY(x);
      const y = gy + rrange(10, 240);
      if (t.matAt(x, y) === 2 || t.matAt(x, y) === 1) add(x, y, { kind: 'point', x, y });
    }
  } else {
    const lamp = env.lampAt(c.x);
    if (lamp.power > 0) {
      const lx = lamp.x + rrange(-20, 20);
      add(lx, t.surfaceY(lx) - 3, { kind: 'point', x: lx, y: t.surfaceY(lx) });
    }
    for (const dec of w.decor) {
      if (!suits(c, dec) || Math.abs(dec.x - c.x) > 320) continue;
      add(dec.doorX, dec.doorY - 4, { kind: 'point', x: dec.doorX, y: dec.doorY, shelter: dec }, 1, 1);
    }
    for (const p of w.plants) {
      if (!p.def.shade || p.dead || Math.abs(p.x - c.x) > 300) continue;
      add(p.x, p.y - 4, { kind: 'point', x: p.x, y: p.y }, 2, 0);
    }
    for (let i = 0; i < 4; i++) {
      const x = clamp(c.x + rrange(-260, 260), 10, W - 10);
      add(x, t.surfaceY(x) - 3, { kind: 'point', x, y: t.surfaceY(x) });
    }
    if (c.amphibious) {
      const p = w.randomWaterPoint(LAMP_X.pond, 150, false);
      if (p) add(p[0], p[1], { kind: 'point', x: p[0], y: p[1] });
    }
  }
  let best = null;
  let bestS = -1e9;
  for (const k of cands) {
    if (!reachable(c, w, k.x, k.y) && !(c.amphibious && Math.abs(k.y - t.waterLevel) < 60)) continue;
    let T = env.tempAt(k.x, k.y, t);
    let M = env.moistAt(k.x, k.y, t);
    if (k.bonusT) {
      if (T > 26) T -= 3 + env.lampAt(k.x).power * 4;
      else if (T < 18) T += 2.5;
    }
    if (k.bonusM) M = Math.min(1, M + 0.12);
    let disc = 0;
    if (T < d.temp[1]) disc += (d.temp[1] - T) / Math.max(1, d.temp[1] - d.temp[0]);
    if (T > d.temp[2]) disc += (T - d.temp[2]) / Math.max(1, d.temp[3] - d.temp[2]);
    if (!(d.moist[0] < 0 && d.moist[3] > 1) && M < d.moist[1]) disc += (d.moist[1] - M) / Math.max(0.05, d.moist[1] - d.moist[0]);
    if (d.oxygen && c.airDisc > 0.2) disc += Math.abs(k.y - t.waterLevel) / 60;
    const dist = Math.hypot(k.x - c.x, k.y - c.y);
    const s = -disc * 3 - dist / 400;
    if (s > bestS) {
      bestS = s;
      best = k;
    }
  }
  return best ? best.tgt : null;
}

// ------------------------------------------------------------------ homes
// What sort of home a critter would live in: 'land', 'water', or null for
// those who never move into one (ants have their nest and bees their hotel,
// butterflies and aphids live on the plants, worms in the soil, and a turtle
// carries its house on its back).
const NO_HOME = { ant: 1, bee: 1, butterfly: 1, aphid: 1, worm: 1, fruitfly: 1 };
export function homeKind(c) {
  if (c.dead || c.stage === 'egg' || c.stage === 'chrysalis' || NO_HOME[c.sp]) return null;
  if (c.sp === 'turtle') return c.stage === 'hatchling' ? 'water' : null;
  if (c.sp === 'frog') return c.stage === 'adult' ? 'land' : 'water';
  return c.def.habitat === 'water' ? 'water' : 'land';
}

// Could this critter live in (or duck into) this shelter? Dry ones house
// land critters, sunk ones the pond critters, and everyone has to fit.
export function suits(c, d) {
  if (!d.def.shelter || d.removed) return false;
  const k = homeKind(c);
  if (!k || (k === 'water') !== d.wet) return false;
  return c.size <= (d.def.fits || 40);
}

export function canReachDoor(c, w, d) {
  if (c.canFly && !d.wet) return true;
  return reachable(c, w, d.doorX, d.doorY - 3);
}

// A shelter with room to move into: nearer is better, sociable critters like
// living with their own kind and loners like it quiet.
export function findHome(c, w, range) {
  let best = null;
  let bs = -1e9;
  for (const d of w.decor) {
    if (!suits(c, d) || d.residents.length >= (d.def.cap || 3)) continue;
    const dist = Math.abs(d.doorX - c.x) + Math.abs(d.doorY - c.y) * 0.5;
    if (dist > range || !canReachDoor(c, w, d)) continue;
    let kin = 0;
    for (const o of d.residents) kin += o.sp === c.sp ? 1 : 0.3;
    const s = -dist / range + (c.traits.social - 0.45) * kin * 0.5 + Math.random() * 0.15;
    if (s > bs) {
      bs = s;
      best = d;
    }
  }
  return best;
}

// Somewhere snug to tuck up in: its own home if it has one, otherwise a
// shelter with a spare bed nearby (which may well become home).
export function snugSpot(c, w, range) {
  const own = w.homeOf(c);
  if (own && Math.abs(own.doorX - c.x) < range * 2.5 && canReachDoor(c, w, own)) return own;
  return findHome(c, w, range);
}

// The closest door to dive through when something gives it a fright: home,
// or any shelter it fits (nobody minds a visitor in an emergency).
export function shelterNear(c, w, range) {
  let best = null;
  let bd = range;
  const own = w.homeOf(c);
  for (const d of w.decor) {
    if (!suits(c, d)) continue;
    const dd = Math.hypot(d.doorX - c.x, d.doorY - c.y) * (d === own ? 0.6 : 1);
    if (dd < bd && canReachDoor(c, w, d)) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

// ------------------------------------------------------------------ swimming
function gauss() {
  return Math.random() + Math.random() + Math.random() - 1.5;
}

// The favourite depth of a swimmer (0 = surface, 1 = floor). Everyone has
// their own, and it drifts as the day goes on.
function favDepth(c) {
  const m = c.memory;
  if (m.depth == null) m.depth = c.sp === 'turtle' ? rrange(0.15, 0.5) : c.stage === 'tadpole' ? rrange(0.1, 0.55) : rrange(0.15, 0.75);
  else if (chance(0.1)) m.depth = clamp(m.depth + rrange(-0.2, 0.2), 0.05, 0.85);
  return m.depth;
}

// A point in the open water at about this depth (0..1), near x.
function waterAtDepth(w, x, depth) {
  const t = w.terrain;
  const fy = t.surfaceY(x);
  const room = fy - t.waterLevel;
  if (room < 18) return null;
  const y = t.waterLevel + 6 + clamp(depth, 0, 1) * (room - 16);
  return t.waterAt(x, y) ? [x, y] : null;
}

// Somewhere to swim to. Mostly a short trip at roughly its favourite depth,
// but now and then right across the pond, up to kiss the surface, in among
// the weeds or over to look at the castle.
export function swimSpot(c, w, range) {
  const t = w.terrain;
  const r = Math.random();
  if (r < 0.14) {
    // nose about in the weeds
    const p = nearbyPlant(w, c.x, range * 1.5, (q) => q.def.aquatic);
    if (p) {
      const h = Math.max(20, p.def.place === 'surface' ? p.y - t.waterLevel : p.def.h * p.growth);
      const x = p.x + rrange(-16, 16);
      const y = clamp(p.y - rrange(0.15, 0.9) * h, t.waterLevel + 6, t.surfaceY(x) - 8);
      if (t.waterAt(x, y)) return { kind: 'point', x, y };
    }
  } else if (r < 0.2) {
    // swim past a castle, a shell or a pipe
    const near = w.decor.filter((d) => d.wet && d.def.shelter && Math.abs(d.x - c.x) < range * 2);
    if (near.length) {
      const d = rpick(near);
      const x = d.x + rrange(-d.def.w * 0.7, d.def.w * 0.7);
      const y = Math.max(t.waterLevel + 6, d.y - rrange(0.3, 1.2) * d.def.h);
      if (t.waterAt(x, y)) return { kind: 'point', x, y };
    }
  } else if (r < 0.26 && c.sp !== 'turtle') {
    // up to the top for a look at the sky
    const x = clamp(c.x + rrange(-range, range) * 0.6, 520, 1100);
    if (t.waterAt(x, t.waterLevel + 5)) return { kind: 'point', x, y: t.waterLevel + rrange(4, 9) };
  }
  // new water (a channel the keeper dug, a tunnel that flooded, a pond that
  // grew) is the most interesting place there is
  const body = w.waterBody(c.x, c.y);
  if (body >= 0 && chance(0.25 + c.traits.curious * 0.5)) {
    const n = w.noveltyNear(c, ['water', 'dig']);
    if (n && w.waterBody(n.x, n.y) === body) {
      n.seen++;
      return { kind: 'point', x: n.x, y: n.y, explore: true };
    }
  }
  // mostly short trips, sometimes a long cruise right across the water;
  // picked from wherever there really is water, whatever shape it's in
  const reach = chance(0.22) ? range * rrange(1.6, 3) : range * rrange(0.3, 1);
  const pt = waterSpot(c, w, body, favDepth(c) + gauss() * 0.3, reach);
  if (pt) return { kind: 'point', x: pt[0], y: pt[1] };
  const p = w.randomWaterPoint(c.x, range, false);
  return p ? { kind: 'point', x: p[0], y: p[1] } : null;
}

// A spot in this body of water at about this depth (0 top .. 1 bottom),
// preferably within reach of here.
export function waterSpot(c, w, body, depth, reach) {
  const m = w.waterMap;
  if (!m || body < 0 || !m.spots[body] || !m.spots[body].length) return null;
  const list = m.spots[body];
  let best = -1;
  let bs = -1e9;
  for (let i = 0; i < 12; i++) {
    const k = list[(Math.random() * list.length) | 0];
    const x = (k % GW) * CELL + CELL / 2;
    const s = -Math.abs(m.dep[k] - depth) * 2.5 - Math.max(0, Math.abs(x - c.x) - reach) / 60 + Math.random() * 0.4;
    if (s > bs) {
      bs = s;
      best = k;
    }
  }
  if (best < 0) return null;
  const x = (best % GW) * CELL + CELL / 2;
  let y = ((best / GW) | 0) * CELL + CELL / 2;
  // (not hard down against the floor)
  if (m.dep[best] > 0.9 && w.terrain.waterAt(x, y - 6)) y -= 6;
  return [x, y];
}

// Where a pond snail glides to on the glass: up under the water's skin,
// anywhere in the open water, or back down to the floor.
export function glassSpot(c, w) {
  const body = w.waterBody(c.x, c.y - 2);
  const r = Math.random();
  const depth = r < 0.35 ? rrange(0, 0.08) : r < 0.75 ? rrange(0.15, 0.85) : 1;
  const pt = waterSpot(c, w, body, depth, 150);
  return pt ? { kind: 'point', x: pt[0], y: pt[1] } : null;
}

// A quiet place for a swimmer to hover and doze: in among the weeds, or out
// in calm water, a little lower down at night. Never flat on the floor.
export function restSpot(c, w) {
  const t = w.terrain;
  const night = w.env.sun < 0.4;
  if (chance(0.5)) {
    const p = nearbyPlant(w, c.x, 260, (q) => q.def.aquatic);
    if (p) {
      const x = p.x + rrange(-14, 14);
      const fy = t.surfaceY(x);
      const top = p.def.place === 'surface' ? t.waterLevel + 10 : Math.max(t.waterLevel + 8, p.y - p.def.h * p.growth * 0.85);
      // (up among the leaves, not down at the roots)
      const y = clamp(rrange(top, top + (fy - top) * 0.6), t.waterLevel + 8, fy - 24);
      if (t.waterAt(x, y)) return { kind: 'point', x, y };
    }
  }
  const dep = night ? rrange(0.25, 0.62) : clamp(favDepth(c) + gauss() * 0.2, 0.1, 0.75);
  for (let i = 0; i < 8; i++) {
    const x = clamp(c.x + rrange(-150, 150), 520, 1100);
    const p = waterAtDepth(w, x, dep);
    if (p && t.surfaceY(x) - p[1] > 16) return { kind: 'point', x: p[0], y: p[1] };
  }
  return null;
}

function nearbyPlant(w, x, range, ok) {
  let n = 0;
  let pick = null;
  for (const p of w.plants) {
    if (p.dead || Math.abs(p.x - x) > range || !ok(p)) continue;
    if (Math.random() * ++n < 1) pick = p;
  }
  return pick;
}

export function lampSpot(c, w) {
  const env = w.env;
  const t = w.terrain;
  const lamp = env.lampAt(c.x);
  if (lamp.power < 0.05) return null;
  for (let i = 0; i < 6; i++) {
    const x = lamp.x + rrange(-30, 30);
    const y = t.surfaceY(x);
    if (t.waterAt(x, y - 2)) continue;
    if (reachable(c, w, x, y - 3) || c.amphibious) return { kind: 'point', x, y };
  }
  return null;
}

export function pickFlower(c, w) {
  let best = null;
  let bestS = 0;
  const visited = c.memory.visited || (c.memory.visited = []);
  for (const p of w.plants) {
    if (p.dead || p.def.aquatic && p.def.place !== 'surface') continue;
    for (const slot of p.shape.slots) {
      if (slot.kind !== 'flower') continue;
      const f = p.flowers[slot.i];
      if (!f || f.nectar < 0.25) continue;
      const key = p.id * 10 + slot.i;
      const seen = visited.includes(key) ? 0.25 : 1;
      const [sx, sy] = p.slotWorld(slot, w.time);
      const d = Math.hypot(sx - c.x, sy - c.y);
      const s = (f.nectar * seen) / (1 + d / 200) * (0.8 + Math.random() * 0.4);
      if (s > bestS) {
        bestS = s;
        best = { kind: 'plant', plant: p, slot, key };
      }
    }
  }
  return best;
}

export { FOODS, smoothstep, rpick, GW, CELL };
