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
      if (wet) return true;
      return c.amphibious && y < t.waterLevel + 20;
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

// Best food the critter knows about: food items, plant parts or algae.
export function findFood(c, w) {
  const sight = c.def.sight * (c.hunger > 0.6 ? 1.6 : 1);
  let best = null;
  let bestS = 0;
  const diet = c.diet;
  // dropped food
  const foods = w.hashF.query(c.x, c.y, sight);
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    if (f.gone || f.amount <= 0.001) continue;
    if (f.state === 'fall') continue;
    const like = likeOf(c, f.tags);
    if (like <= 0.05) continue;
    if (!reachable(c, w, f.x, f.y - 2)) continue;
    // fresh food is nicer, except for tidy-uppers who love it squishy
    const fresh = f.rot === 2 ? 1 : f.rot === 1 ? 0.85 : 1;
    const d = Math.hypot(f.x - c.x, f.y - c.y);
    const s = (like * fresh) / (1 + d / 90);
    if (s > bestS) {
      bestS = s;
      best = { kind: 'food', food: f, value: like, name: f.def.name };
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
      if (!dec.def.shelter || Math.abs(dec.x - c.x) > 320) continue;
      add(dec.x, dec.y - 4, { kind: 'point', x: dec.x, y: dec.y }, 1, 1);
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

export function nearestShelter(c, w, range = 220) {
  let best = null;
  let bd = range;
  for (const d of w.decor) {
    if (!d.def.shelter) continue;
    if (!reachable(c, w, d.x, d.y - 3)) continue;
    const dd = Math.abs(d.x - c.x) + Math.abs(d.y - c.y) * 0.5;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
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
