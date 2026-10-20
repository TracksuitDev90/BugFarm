// Ant colony: a queen, her brood, and workers who split their time between
// digging, foraging, nursing and resting depending on what the colony needs.
// Tunnels are really dug out of the sand and the sand is carried up to build
// the mound, just like an ant farm.
import { CELL, GW, GH, MAT, DAY_LEN, W } from '../config.js';
import { findPath, nearestWalkable } from '../world/pathfind.js';
import { BEHAVIORS, SPECIES_BEHAVIORS } from './behaviors.js';
import { clamp, clamp01, smoothstep } from '../util/math.js';
import { rrange, rint, chance, rpick } from '../util/rng.js';

const TAU = Math.PI * 2;

export class Colony {
  constructor(id, entrance, chamber) {
    this.id = id;
    this.entrance = { ...entrance };
    this.chamber = { ...chamber };
    this.chambers = [{ cx: chamber.cx, cy: chamber.cy - 2, rx: 6, ry: 3 }];
    this.food = 3;
    this.brood = [];
    this.fronts = [];
    this.foodSpots = [];
    this.dug = 0;
    this.layT = DAY_LEN * 0.05;
    this.queenId = 0;
    this.palIdx = 0;
    this.pher = new Float32Array(GW * GH);
    this.pherT = 0;
    this.pherActive = new Set();
    this.lastQueenSeen = 0;
    this.initFronts();
  }

  initFronts() {
    this.fronts = [
      { cx: this.chamber.cx + 5, cy: this.chamber.cy - 1, ang: 0.5, kind: 'tunnel', len: 0, fail: 0 },
      { cx: this.chamber.cx - 5, cy: this.chamber.cy - 1, ang: Math.PI - 0.6, kind: 'tunnel', len: 0, fail: 0 },
    ];
  }

  canDig(t, x, y, m, allowSurface) {
    if (m !== MAT.SAND && m !== MAT.SOIL) return false;
    if (x < 3 || x > GW - 4 || y > GH - 4) return false;
    if (!allowSurface && y <= t.groundTop[x] + 2) return false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (t.isWater(nx, ny)) return false;
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) {
          const mm = t.get(nx, ny);
          if (mm === MAT.GRAVEL || mm === MAT.CLAY) return false;
        }
      }
    }
    return true;
  }

  pickFront() {
    if (!this.fronts.length) return null;
    // prefer chambers in progress, then random tunnels
    const ch = this.fronts.find((f) => f.kind === 'chamber');
    if (ch && chance(0.5)) return ch;
    return rpick(this.fronts);
  }

  // Dig one bite at a front. Returns cells removed.
  digFront(w, f) {
    const t = w.terrain;
    let removed = 0;
    if (f.kind === 'chamber') {
      for (let k = 0; k < 6 && !removed; k++) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random());
        const x = Math.round(f.ox + Math.cos(a) * f.rx * r);
        const y = Math.round(f.oy + Math.sin(a) * f.ry * r);
        if (!t.ground(x, y)) continue;
        // must touch existing air so chambers grow from the tunnel
        if (!(t.walkable(x + 1, y) || t.walkable(x - 1, y) || t.walkable(x, y - 1) || t.walkable(x, y + 1))) continue;
        removed += t.dig(x, y, 1.0, (xx, yy, m) => this.canDig(t, xx, yy, m, false));
      }
      f.left -= removed;
      if (f.left <= 0 || f.fail > 6) {
        this.fronts.splice(this.fronts.indexOf(f), 1);
        this.chambers.push({ cx: f.ox, cy: f.oy, rx: f.rx, ry: f.ry });
        if (this.chambers.length > 12) this.chambers.shift();
        w.events.emit('antChamber', { colony: this });
      }
      if (!removed) f.fail++;
    } else {
      // tunnels wander but prefer to go down and sideways, like real ants
      let ang = f.ang + rrange(-0.45, 0.45);
      const down = Math.PI / 2;
      ang += (down - ang) * 0.08 * (f.kind === 'exit' ? -1 : 1);
      if (f.kind === 'exit') ang = -Math.PI / 2 + rrange(-0.4, 0.4);
      const nx = f.cx + Math.cos(ang) * 1.5;
      const ny = f.cy + Math.sin(ang) * 1.5;
      const ix = Math.round(nx);
      const iy = Math.round(ny);
      const allowSurface = f.kind === 'exit';
      if (t.ground(ix, iy) || t.walkable(ix, iy)) {
        // dig a connected capsule from the current tip to the new point
        const ok = (xx, yy, m) => this.canDig(t, xx, yy, m, allowSurface);
        removed = t.dig(f.cx, f.cy, 1.0, ok) + t.dig((f.cx + nx) / 2, (f.cy + ny) / 2, 1.2, ok) + t.dig(nx, ny, 1.25, ok);
      }
      if (removed || (!t.ground(ix, iy) && t.walkable(ix, iy))) {
        f.cx = nx;
        f.cy = ny;
        f.ang = ang;
        f.len++;
        f.fail = 0;
      } else {
        f.fail++;
        f.ang += (chance(0.5) ? 1 : -1) * rrange(0.8, 1.6);
      }
      if (f.kind === 'exit' && ny <= t.groundTop[ix] + 1 && removed) {
        // broke through to the surface: new entrance!
        this.entrance = { cx: ix, cy: t.top[ix] - 1 };
        this.fronts.splice(this.fronts.indexOf(f), 1);
        w.events.emit('antExit', { colony: this });
        return removed;
      }
      if (f.fail > 7) {
        this.fronts.splice(this.fronts.indexOf(f), 1);
      } else if (f.len > 16 && chance(0.12) && f.kind === 'tunnel') {
        // open a chamber here
        this.fronts.push({ kind: 'chamber', ox: Math.round(f.cx), oy: Math.round(f.cy), rx: rint(5, 7), ry: rint(2, 3), left: rint(28, 44), fail: 0 });
        f.len = 0;
      }
      if (chance(0.05) && this.fronts.length < 6) {
        this.fronts.push({ cx: f.cx, cy: f.cy, ang: ang + (chance(0.5) ? 1 : -1) * rrange(0.9, 1.5), kind: 'tunnel', len: 0, fail: 0 });
      }
    }
    if (this.fronts.length === 0) {
      // start a new branch from a random known chamber
      const c = rpick(this.chambers);
      this.fronts.push({ cx: c.cx + (chance(0.5) ? c.rx - 1 : 1 - c.rx), cy: c.cy, ang: chance(0.5) ? 0.4 : Math.PI - 0.4, kind: 'tunnel', len: 0, fail: 0 });
    }
    this.dug += removed;
    return removed;
  }

  mark(idx) {
    this.pher[idx] = Math.min(1, this.pher[idx] + 0.35);
    this.pherActive.add(idx);
  }

  addFoodSpot(x, y) {
    const near = this.foodSpots.find((s) => Math.abs(s.x - x) < 30 && Math.abs(s.y - y) < 30);
    if (near) {
      near.n++;
      near.t = 0;
      return;
    }
    this.foodSpots.push({ x, y, n: 1, t: 0 });
    if (this.foodSpots.length > 6) this.foodSpots.shift();
  }

  workers(w) {
    let n = 0;
    for (const c of w.creatures) if (c.colonyId === this.id && !c.dead && c.stage === 'worker') n++;
    return n;
  }

  queen(w) {
    return w.byId(this.queenId);
  }

  needs(w) {
    const pop = this.workers(w) + this.brood.length;
    const space = 70 + pop * 14;
    return {
      dig: clamp01((space - this.dug) / 60) * 0.8 + 0.15,
      forage: clamp01((2.5 + pop * 0.12 - this.food) / 3),
      nurse: this.brood.length ? clamp01(this.brood.length / 6) : 0,
      pop,
    };
  }

  update(w, dt) {
    const t = w.terrain;
    const env = w.env;
    const T = env.tempAt(this.chamber.cx * CELL, this.chamber.cy * CELL, t);
    const dev = clamp((T - 8) / 16, 0.2, 1.4);
    const queen = this.queen(w);
    const pop = this.workers(w) + this.brood.length;
    // queen lays eggs when the larder is stocked
    if (queen && !queen.dead) {
      this.layT -= dt * dev;
      if (this.layT <= 0 && this.food > 0.6 && pop < w.spDef('ant').maxPop) {
        const a = Math.random() * TAU;
        const r = Math.random();
        this.brood.push({ stage: 'egg', t: 0, x: (this.chamber.cx + Math.cos(a) * 4 * r) * CELL, y: this.chamber.cy * CELL + 1.5, a: rrange(-0.5, 0.5) });
        this.food -= 0.12;
        this.layT = DAY_LEN * rrange(0.12, 0.2) * (this.food > 3 ? 0.7 : 1);
        w.events.emit('antEgg', { colony: this });
      }
    }
    // brood development
    const nurses = this._nurses || 0;
    for (let i = this.brood.length - 1; i >= 0; i--) {
      const b = this.brood[i];
      b.t += dt * dev * (1 + Math.min(1, nurses / 3) * 0.4);
      if (b.stage === 'egg' && b.t > DAY_LEN * 0.45) {
        b.stage = 'larva';
        b.t = 0;
      } else if (b.stage === 'larva') {
        if (this.food > 0) this.food = Math.max(0, this.food - dt * 0.00012);
        else b.starve = (b.starve || 0) + dt;
        if (b.starve > DAY_LEN * 0.6 && !(w.awayMode && w.gentle)) {
          this.brood.splice(i, 1);
          continue;
        }
        if (b.t > DAY_LEN * 0.7) {
          b.stage = 'pupa';
          b.t = 0;
        }
      } else if (b.stage === 'pupa' && b.t > DAY_LEN * 0.5) {
        this.brood.splice(i, 1);
        w.spawnAnt(this, b.x, b.y - 2, 'worker');
      }
    }
    this._nurses = 0;
    // food spots fade
    for (let i = this.foodSpots.length - 1; i >= 0; i--) {
      const s = this.foodSpots[i];
      s.t += dt;
      if (s.t > 150) this.foodSpots.splice(i, 1);
    }
    // scent evaporates
    this.pherT += dt;
    if (this.pherT > 1) {
      this.pherT = 0;
      for (const idx of this.pherActive) {
        this.pher[idx] *= 0.96;
        if (this.pher[idx] < 0.02) {
          this.pher[idx] = 0;
          this.pherActive.delete(idx);
        }
      }
    }
    // make sure there is always a way out
    if (!this.exitCheckT || w.time - this.exitCheckT > 20) {
      this.exitCheckT = w.time;
      const p = findPath(t, this.chamber.cx, this.chamber.cy, this.entrance.cx, this.entrance.cy, 9000);
      if (!p && !this.fronts.some((f) => f.kind === 'exit')) {
        const top = t.top[this.entrance.cx] - 1;
        if (t.walkable(this.entrance.cx, top) && findPath(t, this.chamber.cx, this.chamber.cy, this.entrance.cx, top, 9000)) {
          this.entrance.cy = top;
        } else this.fronts.push({ cx: this.chamber.cx, cy: this.chamber.cy - 3, ang: -Math.PI / 2, kind: 'exit', len: 0, fail: 0 });
      }
    }
  }

  serialize() {
    return {
      id: this.id,
      entrance: this.entrance,
      chamber: this.chamber,
      chambers: this.chambers,
      food: +this.food.toFixed(3),
      brood: this.brood.map((b) => ({ s: b.stage, t: Math.round(b.t), x: Math.round(b.x), y: Math.round(b.y) })),
      fronts: this.fronts,
      foodSpots: this.foodSpots,
      dug: this.dug,
      layT: Math.round(this.layT),
      queenId: this.queenId,
      palIdx: this.palIdx,
    };
  }

  static load(d) {
    const c = new Colony(d.id, d.entrance, d.chamber);
    c.chambers = d.chambers || c.chambers;
    c.food = d.food;
    c.brood = (d.brood || []).map((b) => ({ stage: b.s, t: b.t, x: b.x, y: b.y, a: 0 }));
    c.fronts = d.fronts && d.fronts.length ? d.fronts : c.fronts;
    c.foodSpots = d.foodSpots || [];
    c.dug = d.dug || 0;
    c.layT = d.layT || 0;
    c.queenId = d.queenId;
    c.palIdx = d.palIdx || 0;
    return c;
  }
}

// ------------------------------------------------------------------ ant behaviours

function cellOf(c) {
  return [Math.floor(c.x / CELL), Math.floor(c.y / CELL)];
}
function antTo(c, w, cx, cy) {
  const [sx, sy] = cellOf(c);
  const p = findPath(w.terrain, sx, sy, cx, cy, 9000);
  c.antGoal = [cx, cy];
  if (!p) {
    c.path = null;
    return false;
  }
  c.path = p;
  c.pathI = 0;
  c.arrived = false;
  c.target = { kind: 'cell' };
  return true;
}
function antMoving(c, w) {
  if (c.repath && c.antGoal) {
    c.repath = false;
    return antTo(c, w, c.antGoal[0], c.antGoal[1]);
  }
  return !!c.path;
}
function surfaceCell(w, x) {
  const t = w.terrain;
  const cx = clamp(Math.floor(x / CELL), 1, GW - 2);
  const cy = t.top[cx] - 1;
  if (cy < 1 || t.isWater(cx, cy)) return null;
  return [cx, cy];
}
function onSurface(c, w) {
  return !w.terrain.isUnderground(c.x, c.y + 2);
}
function colonyOf(c, w) {
  return w.colony(c.colonyId);
}
function chamberCell(col, deep) {
  let ch = col.chambers[0];
  if (deep) {
    for (const k of col.chambers) if (k.cy > ch.cy) ch = k;
  } else if (col.chambers.length > 1 && chance(0.5)) ch = rpick(col.chambers);
  return [ch.cx + rint(-Math.max(1, ch.rx - 2), Math.max(1, ch.rx - 2)), ch.cy + Math.max(0, ch.ry - 1)];
}

function surfaceHot(c, w) {
  const col = colonyOf(c, w);
  const x = col ? col.entrance.cx * CELL : c.x;
  return w.env.tempAt(x, w.terrain.surfaceY(x) - 4, w.terrain);
}

function def(id, b) {
  b.id = id;
  BEHAVIORS[id] = b;
}

def('antDeliver', {
  score: (c) => (c.carry ? 3 : 0),
  start(c, w) {
    const col = colonyOf(c, w);
    if (!col) return;
    if (c.carry === 'sand') {
      const d = c.brain.data;
      d.phase = 'out';
      if (!antTo(c, w, col.entrance.cx, col.entrance.cy)) d.phase = 'dump';
    } else {
      const [x, y] = chamberCell(col);
      antTo(c, w, x, y);
    }
  },
  tick(c, w, dt) {
    const col = colonyOf(c, w);
    if (!col) {
      c.carry = null;
      return false;
    }
    const d = c.brain.data;
    if (c.carry === 'sand') {
      c.pose = 'carry';
      if (d.phase === 'out' && (c.arrived || !antMoving(c, w))) {
        d.phase = 'walk';
        const dir = chance(0.5) ? 1 : -1;
        const sc = surfaceCell(w, (col.entrance.cx + dir * rint(3, 9)) * CELL);
        if (!sc || !antTo(c, w, sc[0], sc[1])) d.phase = 'dump';
      } else if (d.phase === 'walk' && (c.arrived || !antMoving(c, w))) d.phase = 'dump';
      if (d.phase === 'dump') {
        const n = Math.max(1, Math.round((c.carryN || 2) * 0.5));
        const t = w.terrain;
        const cx = Math.floor(c.x / CELL);
        for (let i = 0; i < n; i++) {
          let x = cx + rint(-1, 1);
          if (Math.abs(x - col.entrance.cx) <= 1) x = col.entrance.cx + (x >= col.entrance.cx ? 2 : -2);
          t.deposit(x, MAT.SAND, 12, col.entrance.cx - 1, col.entrance.cx + 1);
        }
        w.dust(c.x, c.y + 2, 3);
        c.carry = null;
        c.carryN = 0;
        return false;
      }
      return c.brain.t < 60;
    }
    // carrying food home
    c.pose = 'carry';
    if (c.arrived || !antMoving(c, w)) {
      if (!c.arrived && c.brain.t < 3) return true;
      col.food += c.carryAmt || 0.05;
      if (c.carrySrc) col.addFoodSpot(c.carrySrc[0], c.carrySrc[1]);
      w.events.emit('antStore', { c, colony: col });
      c.carry = null;
      c.carryAmt = 0;
      return false;
    }
    return c.brain.t < 90;
  },
  thought: (c) => (c.carry === 'sand' ? 'Carrying sand up to the mound. Heave-ho!' : 'Taking food home to the nest!'),
});

def('antForage', {
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col) return 0;
    const n = col.needs(w);
    const T = surfaceHot(c, w);
    const heat = T > 36 ? 0.08 : T > 33 ? 0.5 : T < 12 ? 0.15 : 1;
    const older = clamp01(c.age / (DAY_LEN * 1.5));
    const day = 0.2 + 0.8 * w.env.sun;
    return (0.25 + n.forage * 0.8) * (0.5 + c.traits.curious * 0.6) * heat * day * (0.6 + older * 0.5) * (1 - c.traits.lazy * 0.35);
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    d.phase = 'out';
    d.hops = 0;
    if (!col) return;
    let x;
    if (col.foodSpots.length && chance(0.75)) {
      const s = rpick(col.foodSpots);
      x = s.x + rrange(-12, 12);
      d.recruited = true;
    } else {
      x = clamp(col.entrance.cx * CELL + rrange(-260, 260), 10, W - 10);
      if (w.regionOf(x) !== w.regionOf(col.entrance.cx * CELL)) x = col.entrance.cx * CELL + rrange(-60, 60);
    }
    const sc = surfaceCell(w, x);
    if (!sc || !antTo(c, w, sc[0], sc[1])) d.phase = 'fail';
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const col = colonyOf(c, w);
    if (!col || d.phase === 'fail') return false;
    if (d.phase === 'out') {
      if (c.arrived || !antMoving(c, w)) {
        // look around for food
        const f = w.hashF.nearest(c.x, c.y, 80, (o) => !o.gone && o.state !== 'fall' && !o.inWater && o.amount > 0.001 && o.tags.some((tg) => (c.def.diet[tg] || 0) > 0.3) && w.regionOf(o.x) === w.regionOf(c.x));
        if (f) {
          d.food = f;
          d.phase = 'toFood';
          const sc = surfaceCell(w, f.x);
          if (!sc || !antTo(c, w, sc[0], sc[1])) d.phase = 'fail';
          return true;
        }
        const aphid = w.hashC.nearest(c.x, c.y, 110, (o) => o.sp === 'aphid' && !o.dead && o.mode === 'climb' && o.climb && o.honeydew > 0.25);
        if (aphid) {
          d.aphid = aphid;
          d.phase = 'toPlant';
          const sc = surfaceCell(w, aphid.climb.plant.x);
          if (!sc || !antTo(c, w, sc[0], sc[1])) d.phase = 'fail';
          return true;
        }
        if (++d.hops > 2) return false;
        const sc = surfaceCell(w, clamp(c.x + rrange(-120, 120), 10, W - 10));
        if (!sc || w.regionOf(sc[0] * CELL) !== w.regionOf(c.x) || !antTo(c, w, sc[0], sc[1])) return false;
      }
      return c.brain.t < 60;
    }
    if (d.phase === 'toFood') {
      const f = d.food;
      if (!f || f.gone || f.amount <= 0.001) {
        d.phase = 'out';
        c.arrived = true;
        return true;
      }
      if (c.arrived || !antMoving(c, w)) {
        if (Math.abs(f.x - c.x) > 10) {
          d.phase = 'out';
          return true;
        }
        d.phase = 'bite';
        d.t = 0;
      }
      return c.brain.t < 60;
    }
    if (d.phase === 'bite') {
      c.pose = 'eat';
      d.t += dt;
      if (d.t > 1.2) {
        const f = d.food;
        if (!f || f.gone) return false;
        if (c.hunger > 0.4) w.eat(c, { kind: 'food', food: f });
        const amt = Math.min(f.amount, 0.07);
        f.amount -= amt;
        if (f.amount <= 0.001) w.removeFood(f);
        c.carry = 'food';
        c.carryAmt = amt;
        c.carryFood = f.def.colors[0];
        c.carrySrc = [f.x, f.y];
        w.events.emit('antFind', { c, food: f, recruited: d.recruited });
        return false;
      }
      return true;
    }
    if (d.phase === 'toPlant') {
      const a = d.aphid;
      if (!a || a.dead || !a.climb) return false;
      if (c.mode === 'crawl' && (c.arrived || !antMoving(c, w))) {
        c.startClimb(a.climb.plant, a.climb.slot);
        c.target = { kind: 'plant', plant: a.climb.plant, slot: a.climb.slot };
        c.arrived = false;
      }
      if (c.mode === 'climb' && c.arrived) {
        d.phase = 'milk';
        d.t = 0;
      }
      return c.brain.t < 60;
    }
    if (d.phase === 'milk') {
      d.t += dt;
      c.pose = 'eat';
      if (d.t > 2) {
        const a = d.aphid;
        const amt = a && !a.dead ? a.honeydew * 0.06 : 0;
        if (a) a.honeydew = 0;
        if (c.hunger > 0.3) c.hunger = Math.max(0, c.hunger - 0.4);
        c.carry = 'food';
        c.carryAmt = amt + 0.01;
        c.carryFood = '#f3e08a';
        c.carrySrc = null;
        w.events.emit('aphidFarm', { c, aphid: a });
        c.target = { kind: 'point', x: c.x, y: c.y }; // climb down
        d.phase = 'down';
      }
      return true;
    }
    if (d.phase === 'down') {
      if (c.mode !== 'climb') return false;
      return c.brain.t < 40;
    }
    return false;
  },
  thought: (c) => {
    const p = c.brain.data.phase;
    if (p === 'bite') return 'Found food! Grabbing a piece for the colony.';
    if (p === 'toFood') return 'I smell food! Off I go.';
    if (p === 'toPlant' || p === 'milk') return 'Visiting my aphid friends for sweet honeydew.';
    return c.brain.data.recruited ? 'Following the scent trail to food!' : 'Scouting for food.';
  },
});

def('antDig', {
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col || !col.fronts.length) return 0;
    const n = col.needs(w);
    return n.dig * (0.4 + c.traits.bold * 0.6) * (1 - c.traits.lazy * 0.4) * (0.55 + 0.45 * w.env.sun);
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    d.front = col.pickFront();
    d.phase = 'go';
    if (!d.front) return;
    const f = d.front;
    const fx = f.kind === 'chamber' ? f.ox : Math.round(f.cx);
    const fy = f.kind === 'chamber' ? f.oy : Math.round(f.cy);
    const st = nearestWalkable(w.terrain, fx, fy, 5);
    if (!st || !antTo(c, w, st[0], st[1])) {
      f.fail = (f.fail || 0) + 2;
      d.phase = 'fail';
      if (f.fail > 12) {
        const i = col.fronts.indexOf(f);
        if (i >= 0) col.fronts.splice(i, 1);
        if (!col.fronts.length) {
          const ch = rpick(col.chambers);
          col.fronts.push({ cx: ch.cx + (chance(0.5) ? ch.rx - 1 : 1 - ch.rx), cy: ch.cy, ang: chance(0.5) ? 0.4 : Math.PI - 0.4, kind: 'tunnel', len: 0, fail: 0 });
        }
      }
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const col = colonyOf(c, w);
    if (!col || !d.front || d.phase === 'fail') return false;
    if (d.phase === 'go') {
      if (c.arrived || !antMoving(c, w)) {
        if (!col.fronts.includes(d.front)) return false;
        d.phase = 'dig';
        d.t = 0;
      }
      return c.brain.t < 60;
    }
    c.pose = 'dig';
    d.t += dt;
    if (chance(dt * 4)) w.dust(c.x + c.facing * 5, c.y, 1);
    if (d.t > 1.8) {
      const n = col.fronts.includes(d.front) ? col.digFront(w, d.front) : 0;
      if (n > 0) {
        c.carry = 'sand';
        c.carryN = n;
        w.events.emit('antDig', { c, n, colony: col });
      }
      return false;
    }
    return true;
  },
  stop(c) {
    if (c.pose === 'dig') c.pose = 'idle';
  },
  thought: (c) => (c.brain.data.phase === 'dig' ? 'Dig dig dig! Making the tunnel longer.' : 'Off to the dig site with my hard hat.'),
});

def('antNurse', {
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col || !col.brood.length) return 0;
    const young = 1 - clamp01(c.age / (DAY_LEN * 1.5));
    return col.needs(w).nurse * (0.35 + young * 0.5) * (0.5 + c.traits.social * 0.6);
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const b = rpick(col.brood);
    const [x, y] = b ? [Math.floor(b.x / CELL) + rint(-1, 1), Math.floor(b.y / CELL)] : chamberCell(col);
    const st = nearestWalkable(w.terrain, x, y, 4);
    if (!st || !antTo(c, w, st[0], st[1])) c.brain.data.fail = true;
  },
  tick(c, w, dt) {
    const col = colonyOf(c, w);
    if (!col || c.brain.data.fail) return false;
    if (c.arrived || !antMoving(c, w)) {
      col._nurses = (col._nurses || 0) + 1;
      c.pose = 'idle';
      if (chance(dt * 0.4)) c.facing = -c.facing;
      if (chance(dt * 0.05)) c.emote('heart', 1);
    }
    return c.brain.t < 20;
  },
  thought: () => 'Looking after the eggs and babies.',
});

def('antRest', {
  score(c, w) {
    const col = colonyOf(c, w);
    if (!col) return 0;
    const night = 1 - w.env.sun;
    const hot = smoothstep(33, 40, surfaceHot(c, w));
    const lazy = c.traits.lazy * 0.35;
    return (1 - c.energy) * 0.6 + night * 0.6 + lazy + hot * (onSurface(c, w) ? 1.2 : 0.4) + (c.stage === 'queen' ? 0.5 : 0);
  },
  lock(c) {
    return c.pose === 'sleep' && c.fear < 0.5 && c.brain.t < 25;
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const hot = surfaceHot(c, w) > 33;
    const [x, y] = c.stage === 'queen' ? [col.chamber.cx + rint(-2, 2), col.chamber.cy] : chamberCell(col, hot);
    const st = nearestWalkable(w.terrain, x, y, 4);
    if (!st || !antTo(c, w, st[0], st[1])) c.brain.data.here = true;
    c.brain.data.hot = hot;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (c.arrived || d.here || !antMoving(c, w)) {
      c.pose = w.env.sun < 0.4 || c.energy < 0.6 || c.stage === 'queen' ? 'sleep' : 'idle';
      if (d.hot && !d.told) {
        d.told = true;
        w.events.emit('antHide', { c });
      }
      if (c.stage === 'queen' && c.hunger > 0.3) {
        const col = colonyOf(c, w);
        if (col && col.food > 0.05) {
          const amt = Math.min(col.food, c.appetite * c.hunger);
          col.food -= amt;
          c.hunger -= amt / c.appetite;
        }
      }
      if (c.pose === 'sleep' && chance(dt * 0.25)) c.emote('zzz', 1.6);
      if (c.energy > 0.9 && w.env.sun > 0.5 && !d.hot && c.stage !== 'queen' && c.brain.t > 6) return false;
    }
    return c.brain.t < (c.stage === 'queen' ? 60 : 30);
  },
  stop(c) {
    c.pose = 'idle';
  },
  thought: (c) =>
    c.stage === 'queen'
      ? rpick(['Resting in my royal chamber.', 'My colony works so hard!', 'Laying eggs is tiring work.'])
      : c.brain.data.hot
        ? 'Too hot up top! Cooling off deep underground.'
        : c.pose === 'sleep'
          ? 'Zzz... ants need naps too.'
          : 'Taking a little break.',
});

def('antEat', {
  score(c, w) {
    const col = colonyOf(c, w);
    if (!col || col.food < 0.02) return 0;
    return smoothstep(0.35, 0.85, c.hunger) * 1.4;
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const [x, y] = chamberCell(col);
    const st = nearestWalkable(w.terrain, x, y, 4);
    if (!st || !antTo(c, w, st[0], st[1])) c.brain.data.here = true;
  },
  tick(c, w) {
    const col = colonyOf(c, w);
    if (!col) return false;
    if (c.arrived || c.brain.data.here || !antMoving(c, w)) {
      c.pose = 'eat';
      if (c.brain.t > 1.5 && col.food > 0) {
        const amt = Math.min(col.food, c.appetite * c.hunger);
        col.food -= amt;
        c.hunger = Math.max(0, c.hunger - amt / c.appetite);
        return false;
      }
    }
    return c.brain.t < 40;
  },
  thought: () => 'Grabbing a snack from the larder.',
});

def('antFlee', {
  score: (c) => (c.fear > 0.4 && c.stage === 'worker' ? c.fear * 1.6 : 0),
  start(c, w) {
    const col = colonyOf(c, w);
    c.emote('!', 1);
    if (col) antTo(c, w, col.entrance.cx, col.entrance.cy + 3);
  },
  tick(c, w) {
    if (c.arrived || !antMoving(c, w)) return false;
    return c.brain.t < 15;
  },
  thought: () => 'Eek! Run back to the nest!',
});

def('antLost', {
  score: (c, w) => (colonyOf(c, w) ? 0 : 1),
  start(c, w) {
    const sc = surfaceCell(w, clamp(c.x + rrange(-80, 80), 10, W - 10));
    if (sc) antTo(c, w, sc[0], sc[1]);
  },
  tick(c, w) {
    if (c.arrived || !antMoving(c, w)) return false;
    return c.brain.t < 20;
  },
  thought: () => 'Where is my colony? I feel a bit lost...',
});

SPECIES_BEHAVIORS.ant = ['antDeliver', 'antForage', 'antDig', 'antNurse', 'antRest', 'antEat', 'antFlee', 'antLost'];
