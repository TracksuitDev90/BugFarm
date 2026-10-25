// Ant colony: a queen, her brood, and workers who split their time between
// digging, foraging, nursing and resting depending on what the colony needs.
// Tunnels are really dug out of the sand and the sand is carried up to build
// the mound, just like an ant farm.
import { CELL, GW, GH, MAT, DAY_LEN, W } from '../config.js';
import { findPath, nearestWalkable, smoothPath } from '../world/pathfind.js';
import { BEHAVIORS, SPECIES_BEHAVIORS } from './behaviors.js';
import { clamp, clamp01, smoothstep, angleDiff } from '../util/math.js';
import { rrange, rint, chance, rpick } from '../util/rng.js';

const TAU = Math.PI * 2;

export class Colony {
  constructor(id, entrance, chamber, style) {
    this.id = id;
    this.entrance = { ...entrance };
    // the royal chamber's floor (where the queen holds court and lays her
    // eggs; she moves it now and then), and the larder, which stays put
    this.chamber = { cx: chamber.cx, cy: chamber.cy };
    this.larder = { cx: chamber.cx, cy: chamber.cy };
    const ry = chamber.ry || 3;
    this.chambers = [{ cx: chamber.cx, cy: chamber.cy - (ry - 1), rx: chamber.rx || 6, ry }];
    // every colony has its own way of digging, so no two nests look alike
    this.style = style || Colony.randomStyle();
    this.food = 3;
    this.brood = [];
    this.fronts = [];
    this.foodSpots = [];
    this.dug = 0;
    this.layT = DAY_LEN * 0.05;
    this.queenId = 0;
    this.palIdx = 0;
    // garden | harvester | honeypot: what the colony does besides dig and
    // forage (see ANT_KINDS), and what it has put by toward its next good
    this.kind = 'garden';
    this.store = 0;
    this.pher = new Float32Array(GW * GH);
    this.pherT = 0;
    this.pherActive = new Set();
    this.lastQueenSeen = 0;
    // when an ant last walked through each little patch of ground (so scouts
    // go where nobody's been lately, or ever: a tunnel the keeper dug, say)
    this.seen = new Float32Array((GW >> 1) * (GH >> 1)).fill(-1e6);
    this._guards = 0;
    this.initFronts();
  }

  // How this colony likes to dig: steep shafts or long level galleries,
  // straight or winding, lots of rooms or few, forking often or rarely.
  static randomStyle() {
    const gallery = chance(0.3);
    return {
      dip: gallery ? rrange(0.12, 0.4) : rrange(0.45, 1.3),
      curl: rrange(0.05, 0.16),
      keep: rrange(0.78, 0.93),
      branch: rrange(0.025, 0.075),
      room: rint(12, 28),
      roomW: rrange(4.5, 8.5),
      roomH: rrange(1.8, 3.2),
      lean: rrange(-0.6, 0.6),
      bore: rrange(1, 1.3),
    };
  }

  // A new tunnel setting off at this colony's favourite slope.
  newTunnel(cx, cy, dir, kind = 'tunnel') {
    const st = this.style;
    if (!dir) dir = chance(0.5 + st.lean * 0.35) ? 1 : -1;
    const dip = clamp(st.dip + rrange(-0.25, 0.25), 0.05, 1.45);
    return { cx, cy, ang: dir > 0 ? dip : Math.PI - dip, turn: 0, kind, len: 0, fail: 0 };
  }

  initFronts() {
    const ch = this.chambers[0];
    const n = rint(1, 3);
    const first = chance(0.5 + this.style.lean * 0.35) ? 1 : -1;
    this.fronts = [];
    for (let i = 0; i < n; i++) {
      const dir = i === 1 ? -first : i === 0 ? first : chance(0.5) ? 1 : -1;
      this.fronts.push(this.newTunnel(ch.cx + dir * (ch.rx - 1), ch.cy + ch.ry - 2, dir));
    }
  }

  // Start a fresh tunnel from one of the rooms.
  sproutFront() {
    const c = rpick(this.chambers);
    const dir = chance(0.5 + this.style.lean * 0.35) ? 1 : -1;
    this.fronts.push(this.newTunnel(c.cx + dir * Math.max(1, c.rx - 1), c.cy + Math.max(0, c.ry - 1), dir));
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
        // rooms have a flat floor and a domed roof
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random());
        const x = Math.round(f.ox + Math.cos(a) * f.rx * r);
        const sy = Math.sin(a);
        const y = Math.round(f.oy + (sy < 0 ? sy * f.ry * r : sy * r));
        if (!t.ground(x, y)) continue;
        // must touch existing air so chambers grow from the tunnel
        if (!(t.walkable(x + 1, y) || t.walkable(x - 1, y) || t.walkable(x, y - 1) || t.walkable(x, y + 1))) continue;
        removed += t.dig(x, y, 1.0, (xx, yy, m) => this.canDig(t, xx, yy, m, false));
      }
      f.left -= removed;
      if (f.left <= 0 || f.fail > 6) {
        this.fronts.splice(this.fronts.indexOf(f), 1);
        this.chambers.push({ cx: f.ox, cy: f.oy + 2 - f.ry, rx: f.rx, ry: f.ry });
        if (this.chambers.length > 12) this.chambers.shift();
        w.events.emit('antChamber', { colony: this });
      }
      if (!removed) f.fail++;
    } else {
      // Tunnels bend gently and keep bending the same way for a while (no
      // jitter), drifting back toward the colony's favourite slope.
      const st = this.style;
      if (f.turn == null) f.turn = 0;
      let ang;
      if (f.kind === 'exit') {
        f.turn = f.turn * 0.7 + rrange(-0.12, 0.12);
        ang = f.ang + f.turn;
        ang += angleDiff(ang, -Math.PI / 2) * 0.3;
      } else {
        f.turn = clamp(f.turn * st.keep + rrange(-1, 1) * st.curl, -0.35, 0.35);
        const dir = Math.cos(f.ang) >= 0 ? 1 : -1;
        const pref = dir > 0 ? st.dip : Math.PI - st.dip;
        ang = f.ang + f.turn + angleDiff(f.ang, pref) * 0.07;
        // level out near the bottom and turn back from the sides
        if (f.cy > GH - 16) ang += angleDiff(ang, dir > 0 ? 0.05 : Math.PI - 0.05) * 0.35;
        if (f.cx < 8) ang += angleDiff(ang, 0.3) * 0.4;
        if (f.cx > GW - 9) ang += angleDiff(ang, Math.PI - 0.3) * 0.4;
        // never back up the way it came
        if (Math.sin(ang) < -0.35) ang += angleDiff(ang, dir > 0 ? 0 : Math.PI) * 0.5;
      }
      const nx = f.cx + Math.cos(ang) * 1.5;
      const ny = f.cy + Math.sin(ang) * 1.5;
      const ix = Math.round(nx);
      const iy = Math.round(ny);
      const allowSurface = f.kind === 'exit';
      if (t.ground(ix, iy) || t.walkable(ix, iy)) {
        // dig a connected capsule from the current tip to the new point
        const ok = (xx, yy, m) => this.canDig(t, xx, yy, m, allowSurface);
        const b = st.bore;
        removed = t.dig(f.cx, f.cy, 1.0 * b, ok) + t.dig((f.cx + nx) / 2, (f.cy + ny) / 2, 1.15 * b, ok) + t.dig(nx, ny, 1.2 * b, ok);
      }
      if (removed || (!t.ground(ix, iy) && t.walkable(ix, iy))) {
        f.cx = nx;
        f.cy = ny;
        f.ang = ang;
        f.len++;
        f.fail = 0;
      } else {
        // hit a stone (or the pond liner): feel along it, one way then the other
        f.fail++;
        if (!f.side || f.fail > 3) f.side = f.side ? -f.side : chance(0.5) ? 1 : -1;
        f.ang = ang + f.side * rrange(0.5, 1.0);
        f.turn = 0;
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
      } else if (f.kind === 'tunnel' && f.len > st.room && chance(0.25)) {
        // open a room here
        const rx = Math.round(st.roomW * rrange(0.8, 1.2));
        const ry = Math.max(2, Math.round(st.roomH * rrange(0.8, 1.2)));
        this.fronts.push({ kind: 'chamber', ox: Math.round(f.cx), oy: Math.round(f.cy), rx, ry, left: Math.round(rx * ry * rrange(1.4, 1.9)), fail: 0 });
        f.len = 0;
      }
      if (f.kind === 'tunnel' && chance(st.branch) && this.fronts.length < 6) {
        const side = chance(0.5) ? 1 : -1;
        const nf = this.newTunnel(f.cx, f.cy, Math.cos(ang + side) >= 0 ? 1 : -1);
        nf.ang = ang + side * rrange(0.7, 1.3);
        this.fronts.push(nf);
      }
    }
    if (this.fronts.length === 0) this.sproutFront();
    this.dug += removed;
    // tunnels let air and water into the sand: desert plants grow better
    if (removed && w.env.fertility.desert < 0.75) w.env.fertility.desert += removed * 0.0006;
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

  // Room for ants: one colony may grow to the full number; several share it.
  cap(w) {
    let n = 0;
    for (const col of w.colonies) if (col.queen(w) && !col.queen(w).dead) n++;
    return Math.max(22, Math.round(w.maxPop('ant') / Math.max(1, n)));
  }

  // A forager has brought something home. Harvesters keep the seeds and
  // grain; honeypot ants keep the sweet things (in the tummies of their
  // repletes). Enough put by makes a good the keeper can collect at the door.
  stash(w, c, amt) {
    const tags = c.carryTags || [];
    let want = false;
    if (this.kind === 'harvester') want = tags.includes('seed') || tags.includes('grain');
    else if (this.kind === 'honeypot') want = tags.includes('sweet') || tags.includes('nectar') || tags.includes('honeydew') || tags.includes('fruit');
    if (!want) return;
    this.store += amt * (c.busyT > 0 ? 2 : 1);
    const need = this.kind === 'harvester' ? 0.22 : 0.26;
    if (this.store < need) return;
    const type = this.kind === 'harvester' ? 'seeds' : 'honey';
    const ex = this.entrance.cx * CELL;
    if (w.goods.filter((g) => g.type === type && Math.abs(g.x - ex) < 60).length >= 2) {
      this.store = need; // the doorstep's full: wait for the keeper
      return;
    }
    this.store -= need;
    const side = chance(0.5) ? 1 : -1;
    const x = ex + side * rrange(8, 18);
    const g = w.addGood(type, x, w.terrain.surfaceY(x), { by: c, plant: type === 'seeds' ? 'marigold' : '', look: 'ant' });
    if (!g) return;
    w.credit(c);
    w.sparkle(x, g.y - 4, 5);
    w.events.emit('antHarvest', { c, colony: this, type, g });
    w.addLog(type === 'seeds' ? 'The harvester ants piled their spare seeds by the nest door.' : 'The honeypot ants filled a jar of desert honey!', 'leaf');
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
      if (this.layT <= 0 && this.food > 0.6 && pop < this.cap(w)) {
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
      b.t += dt * dev * (1 + Math.min(1, nurses / 3) * 0.4) * (w.has.school ? 1.5 : 1);
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
    // who's on guard at the door
    this.guardT = (this.guardT || 0) - dt;
    if (this.guardT <= 0) {
      this.guardT = 2;
      let n = 0;
      for (const c of w.creatures) {
        if (c.colonyId !== this.id) continue;
        if (c.brain.b && c.brain.b.id === 'antGuard') n++;
        // a honeypot colony's repletes swell up golden as the store fills
        if (this.kind === 'honeypot' && c.stage === 'worker') c.acc = c.id % 4 === 0 && (this.store > 0.08 || this.food > 2) ? 'replete' : null;
      }
      this._guards = n;
    }
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
        } else this.fronts.push({ cx: this.chamber.cx, cy: this.chamber.cy - 3, ang: -Math.PI / 2, turn: 0, kind: 'exit', len: 0, fail: 0 });
      }
    }
  }

  // An ant went past here.
  visit(cx, cy, time) {
    this.seen[(cy >> 1) * (GW >> 1) + (cx >> 1)] = time;
  }
  lastVisit(cx, cy) {
    return this.seen[(cy >> 1) * (GW >> 1) + (cx >> 1)];
  }

  // Somewhere new underground the ants can reach (a hollow the keeper dug,
  // say) that's roomy enough: the colony moves in and makes it a room.
  adoptRoom(w, cx, cy) {
    const t = w.terrain;
    if (cy <= t.groundTop[clamp(cx, 0, GW - 1)] + 3) return null;
    // find the floor under here
    let fy = cy;
    while (fy < GH - 2 && !t.solid(cx, fy + 1)) fy++;
    if (!t.walkable(cx, fy)) return null;
    // how high the ceiling is, and how wide it is just above the floor (a
    // dug hollow is usually round, so its very bottom is narrow)
    let h = 0;
    while (h < 8 && !t.solid(cx, fy - h - 1) && !t.isWater(cx, fy - h - 1)) h++;
    let a = cx;
    let b = cx;
    for (let r = 0; r <= Math.min(3, h); r++) {
      const y = fy - r;
      let ra = cx;
      let rb = cx;
      while (ra > 1 && !t.solid(ra - 1, y) && cx - ra < 14) ra--;
      while (rb < GW - 2 && !t.solid(rb + 1, y) && rb - cx < 14) rb++;
      if (rb - ra > b - a) {
        a = ra;
        b = rb;
      }
    }
    const rx = Math.floor((b - a) / 2);
    if (rx < 2 || h < 3) return null;
    const mx = Math.round((a + b) / 2);
    for (const ch of this.chambers) if (Math.abs(ch.cx - mx) < ch.rx + rx && Math.abs(ch.cy + ch.ry - 1 - fy) < 4) return null;
    const ry = Math.min(4, h);
    const room = { cx: mx, cy: fy - ry + 1, rx, ry };
    this.chambers.push(room);
    if (this.chambers.length > 12) this.chambers.splice(1, 1); // (the first room is the oldest, and stays)
    w.events.emit('antAdopt', { colony: this, room });
    w.addLog('The ants explored the hollow you dug and made it into a new room for the nest.', 'crown');
    return room;
  }

  serialize() {
    return {
      id: this.id,
      entrance: this.entrance,
      chamber: this.chamber,
      larder: this.larder,
      chambers: this.chambers,
      food: +this.food.toFixed(3),
      brood: this.brood.map((b) => ({ s: b.stage, t: Math.round(b.t), x: Math.round(b.x), y: Math.round(b.y) })),
      fronts: this.fronts,
      foodSpots: this.foodSpots,
      dug: this.dug,
      layT: Math.round(this.layT),
      queenId: this.queenId,
      palIdx: this.palIdx,
      style: this.style,
      kind: this.kind,
      store: +this.store.toFixed(3),
    };
  }

  static load(d) {
    const c = new Colony(d.id, d.entrance, d.chamber, d.style);
    c.chambers = d.chambers || c.chambers;
    if (d.larder) c.larder = { ...d.larder };
    c.food = d.food;
    c.brood = (d.brood || []).map((b) => ({ stage: b.s, t: b.t, x: b.x, y: b.y, a: 0 }));
    c.fronts = d.fronts && d.fronts.length ? d.fronts : c.fronts;
    c.foodSpots = d.foodSpots || [];
    c.dug = d.dug || 0;
    c.layT = d.layT || 0;
    c.queenId = d.queenId;
    c.palIdx = d.palIdx || 0;
    c.kind = d.kind || 'garden';
    c.store = d.store || 0;
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
  c.pts = smoothPath(w.terrain, p, CELL);
  // start from the next point, not the cell we're already in
  c.ptI = p.length > 1 ? 1 : 0;
  c.ptChecked = -1;
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
  score: (c) => (c.carry && c.carry !== 'brood' ? 3 : 0),
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
      col.stash(w, c, c.carryAmt || 0.05);
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
        const f = w.hashF.nearest(c.x, c.y, 80, (o) => !o.gone && o.loose && !o.inWater && o.amount > 0.001 && o.tags.some((tg) => (c.def.diet[tg] || 0) > 0.3) && w.regionOf(o.x) === w.regionOf(c.x));
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
        if (!f || f.gone || f.amount <= 0.001) return false;
        if (c.hunger > 0.4) w.eat(c, { kind: 'food', food: f });
        const amt = Math.min(f.amount, 0.07);
        f.amount = Math.max(0, f.amount - amt);
        w.nibbled(f, c);
        c.carry = 'food';
        c.carryAmt = amt;
        c.carryFood = f.def.colors[0];
        c.carryTags = f.tags;
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
        c.carryTags = ['honeydew', 'sweet'];
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
        if (!col.fronts.length) col.sproutFront();
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

// Nurses tend the brood, wait on the queen (grooming and feeding her, and
// escorting her when she moves rooms), and carry eggs and babies along to
// wherever she's holding court.
def('antNurse', {
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col) return 0;
    const young = 1 - clamp01(c.age / (DAY_LEN * 1.5));
    const q = col.queen(w);
    // a queen on the move gathers an escort
    const court = q && !q.dead ? (q.brain.b && q.brain.b.id === 'antQueen' && q.moving ? 0.6 : 0.16) : 0;
    const need = col.brood.length ? col.needs(w).nurse : 0;
    const s = Math.max(need, court);
    if (s <= 0) return 0;
    return s * (0.35 + young * 0.5) * (0.5 + c.traits.social * 0.6);
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    const q = col.queen(w);
    const t = w.terrain;
    // brood left behind in another room: fetch it to the queen
    if (col.brood.length && chance(0.45)) {
      const far = col.brood.filter((b) => Math.abs(b.x - col.chamber.cx * CELL) > 26 || Math.abs(b.y - col.chamber.cy * CELL) > 14);
      if (far.length) {
        const b = rpick(far);
        const st = nearestWalkable(t, Math.floor(b.x / CELL), Math.floor(b.y / CELL), 4);
        if (st && antTo(c, w, st[0], st[1])) {
          d.fetch = b;
          d.phase = 'fetch';
          return;
        }
      }
    }
    if (q && !q.dead && (chance(0.35) || !col.brood.length || (q.brain.b && q.brain.b.id === 'antQueen'))) {
      d.queen = q;
      d.re = 0;
      return;
    }
    const b = rpick(col.brood);
    const [x, y] = b ? [Math.floor(b.x / CELL) + rint(-1, 1), Math.floor(b.y / CELL)] : chamberCell(col);
    const st = nearestWalkable(t, x, y, 4);
    if (!st || !antTo(c, w, st[0], st[1])) d.fail = true;
  },
  tick(c, w, dt) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    if (!col || d.fail) return false;
    const t = w.terrain;
    if (d.phase === 'fetch') {
      if (c.arrived || !antMoving(c, w)) {
        const i = col.brood.indexOf(d.fetch);
        if (i < 0) return false; // hatched, or someone else got it
        col.brood.splice(i, 1);
        c.carry = 'brood';
        c.carryBrood = d.fetch;
        d.phase = 'bring';
        const [x, y] = [col.chamber.cx + rint(-3, 3), col.chamber.cy];
        const st = nearestWalkable(t, x, y, 4);
        if (!st || !antTo(c, w, st[0], st[1])) d.phase = 'drop';
      }
      return c.brain.t < 60;
    }
    if (d.phase === 'bring') {
      c.pose = 'carry';
      if (c.arrived || !antMoving(c, w)) d.phase = 'drop';
      else return c.brain.t < 90;
    }
    if (d.phase === 'drop') {
      dropBrood(c, col);
      return false;
    }
    if (d.queen) {
      // in the queen's retinue: stay close, follow her if she moves on
      const q = d.queen;
      if (q.dead || q.removed) return false;
      d.re -= dt;
      const qx = Math.floor(q.x / CELL);
      const qy = Math.floor(q.y / CELL);
      const far = Math.abs(q.x - c.x) > 14 || Math.abs(q.y - c.y) > 10;
      if (d.re <= 0 && far && (!c.antGoal || Math.abs(c.antGoal[0] - qx) > 2 || Math.abs(c.antGoal[1] - qy) > 2)) {
        d.re = 1.5;
        const st = nearestWalkable(t, qx + (chance(0.5) ? 2 : -2), qy, 3);
        if (!st || !antTo(c, w, st[0], st[1])) return false;
      }
      if (!far && (c.arrived || !c.path)) {
        c.pose = 'idle';
        c.facing = q.x >= c.x ? 1 : -1;
        if (chance(dt * 0.08)) c.emote('heart', 1);
      }
      return c.brain.t < 25;
    }
    if (c.arrived || !antMoving(c, w)) {
      col._nurses = (col._nurses || 0) + 1;
      c.pose = 'idle';
      if (chance(dt * 0.4)) c.facing = -c.facing;
      if (chance(dt * 0.05)) c.emote('heart', 1);
    }
    return c.brain.t < 20;
  },
  stop(c, w) {
    if (c.carry === 'brood') dropBrood(c, colonyOf(c, w));
  },
  thought: (c) => {
    const d = c.brain.data;
    if (d.phase === 'fetch') return 'Fetching an egg to bring to the queen.';
    if (d.phase === 'bring') return 'Carrying a baby along to the royal chamber. Careful now!';
    if (d.queen) return d.queen.moving ? 'Escorting Her Majesty to her new room!' : rpick(['Grooming the queen.', 'Bringing the queen a snack.', 'Waiting on Her Majesty.']);
    return 'Looking after the eggs and babies.';
  },
});

// Put a carried egg or baby down where the nurse is standing.
function dropBrood(c, col) {
  const b = c.carryBrood;
  c.carry = null;
  c.carryBrood = null;
  if (!b || !col) return;
  b.x = c.x + rrange(-2, 2);
  b.y = Math.floor(c.y / CELL) * CELL + 1.5;
  col.brood.push(b);
}

// The queen holds court in the royal chamber, but she isn't stuck there.
// Like real queens, she moves to whichever room is the best warmth for her
// eggs (deeper down when the sand above bakes, nearer the top when it's
// cool), and now and then she takes a slow turn round her rooms. Her
// workers escort her and carry the brood along after her.
const BROOD_T = 27;
function roomFloor(ch) {
  return [ch.cx, ch.cy + Math.max(0, ch.ry - 1)];
}
function roomTemp(w, ch) {
  const [x, y] = roomFloor(ch);
  return w.env.tempAt(x * CELL, y * CELL, w.terrain);
}
// The room she's holding court in (the one her spot is inside, or nearest).
function royalRoom(col) {
  let best = col.chambers[0];
  let bd = 1e9;
  for (const ch of col.chambers) {
    const [x, y] = roomFloor(ch);
    const dx = Math.max(0, Math.abs(x - col.chamber.cx) - ch.rx);
    const d = dx + Math.abs(y - col.chamber.cy) * 2 + Math.abs(x - col.chamber.cx) * 0.01;
    if (d < bd) {
      bd = d;
      best = ch;
    }
  }
  return best;
}
def('antQueen', {
  can: (c) => c.stage === 'queen',
  score(c, w) {
    const col = colonyOf(c, w);
    if (!col || c.hunger > 0.75) return 0;
    const m = c.memory;
    if (!m.qT || w.time - m.qT > 15) {
      // weigh up the rooms every so often
      m.qT = w.time;
      const here = royalRoom(col);
      const hereT = Math.abs(roomTemp(w, here) - BROOD_T);
      let best = null;
      let bd = hereT - 1.5; // only worth the trek if it's clearly better
      for (const ch of col.chambers) {
        if (ch === here) continue;
        const dT = Math.abs(roomTemp(w, ch) - BROOD_T);
        if (dT < bd) {
          bd = dT;
          best = ch;
        }
      }
      m.qRoom = best;
      m.qWhy = best ? 'comfort' : null;
      if (!best && w.env.sun > 0.2 && (!m.qRoundT || w.time - m.qRoundT > (m.qGap || 60))) {
        m.qGap = rrange(40, 130);
        // a turn round the other rooms now and then (anywhere not much
        // worse than here), otherwise a slow turn about her own
        const ok = col.chambers.filter((ch) => ch !== here && Math.abs(roomTemp(w, ch) - BROOD_T) < hereT + 3.5);
        if (ok.length && chance(0.4)) {
          m.qRoom = rpick(ok);
          m.qWhy = 'rounds';
        } else {
          m.qRoom = here;
          m.qWhy = 'pace';
        }
      }
    }
    if (!m.qRoom || !col.chambers.includes(m.qRoom)) return 0;
    return m.qWhy === 'comfort' ? 1.3 : (m.qWhy === 'rounds' ? 1.2 : 1.08) * (0.5 + 0.5 * c.energy);
  },
  lock: (c) => c.moving,
  start(c, w) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    const m = c.memory;
    d.room = m.qRoom;
    d.why = m.qWhy;
    d.from = royalRoom(col);
    m.qRoom = null;
    m.qRoundT = w.time;
    let [x, y] = roomFloor(d.room);
    if (d.why === 'pace') {
      // somewhere else along her own floor, among the eggs
      const span = Math.max(1, d.room.rx - 1);
      const cx = Math.floor(c.x / CELL);
      for (let i = 0; i < 4; i++) {
        x = d.room.cx + rint(-span, span);
        if (Math.abs(x - cx) >= 2) break;
      }
    } else x += rint(-1, 1);
    const st = nearestWalkable(w.terrain, x, y, 3);
    if (!st || !antTo(c, w, st[0], st[1])) d.fail = true;
    else c.emote('crown', 1.6);
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const col = colonyOf(c, w);
    if (!col || d.fail) return false;
    if (c.arrived || !antMoving(c, w)) {
      if (!d.settled) {
        d.settled = true;
        const [x, y] = roomFloor(d.room);
        // (the way may have been blocked: only a room she reached counts)
        if (Math.abs(Math.floor(c.x / CELL) - x) > d.room.rx + 2 || Math.abs(Math.floor(c.y / CELL) - y) > 4) return false;
        // she holds court (and lays her eggs) wherever she settles
        const st = nearestWalkable(w.terrain, Math.floor(c.x / CELL), d.why === 'pace' ? Math.floor(c.y / CELL) : y, 3);
        if (st) {
          col.chamber = { cx: st[0], cy: st[1] };
          if (d.room !== d.from) w.events.emit('queenMove', { c, colony: col, why: d.why });
        }
      }
      c.pose = 'idle';
      return c.brain.t < 6;
    }
    return c.brain.t < 120;
  },
  thought: (c) => {
    const d = c.brain.data;
    if (d.settled) return d.why === 'pace' ? 'A fine spot for a few more eggs.' : 'Ahh, this room will do nicely.';
    if (d.why === 'pace') return 'A slow royal walk among my eggs.';
    return d.why === 'comfort' ? 'This room is not right for my eggs. Moving to a comfier one!' : 'Taking a royal stroll round my rooms.';
  },
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

// ------------------------------------------------------------------ scouting
// Scouts keep the colony's map of its world up to date: they patrol the
// tunnels and the ground round the nest, go first to wherever nobody has
// been for longest, and rush to anything new (a hole the keeper dug, a hill
// of fresh sand, water where there wasn't any). A hollow underground that's
// big enough becomes a new room.
function scoutGoal(c, w, col) {
  const t = w.terrain;
  // something new nearby beats everything
  for (const n of w.novelty) {
    if (n.kind === 'thing' || w.time - n.t > n.life || (n.antSeen || 0) > 3) continue;
    if (Math.abs(n.x - col.entrance.cx * CELL) > 420) continue;
    // (the biggest stroke of a dig is where the hollow is)
    const st = nearestWalkable(t, Math.floor((n.bx || n.x) / CELL), Math.floor((n.by || n.y) / CELL), 6);
    if (st) return { cx: st[0], cy: st[1], n };
  }
  // otherwise, the corner of the nest (or of the ground round it) visited
  // least lately (only down in the cool, when the sand up top is baking)
  let best = null;
  let bt = Infinity;
  const ex = col.entrance.cx;
  const baking = surfaceHot(c, w) > 34;
  for (let i = 0; i < 14; i++) {
    let cx;
    let cy;
    if ((baking || chance(0.65)) && col.chambers.length) {
      const ch = rpick(col.chambers);
      cx = ch.cx + rint(-24, 24);
      cy = ch.cy + rint(-12, 16);
    } else {
      cx = clamp(ex + rint(-70, 70), 2, GW - 3);
      cy = t.top[cx] - 1;
    }
    const st = nearestWalkable(t, clamp(cx, 2, GW - 3), clamp(cy, 2, GH - 3), 3);
    if (!st) continue;
    const seen = col.lastVisit(st[0], st[1]);
    if (seen < bt) {
      bt = seen;
      best = { cx: st[0], cy: st[1], n: null };
    }
  }
  return best && w.time - bt > 40 ? best : null;
}
def('antExplore', {
  hold: 0.5,
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col) return 0;
    const m = c.memory;
    if (!m.exT || w.time - m.exT > 6) {
      m.exT = w.time;
      m.ex = scoutGoal(c, w, col);
    }
    if (!m.ex) return 0;
    const news = m.ex.n ? 2 : 1;
    return (0.32 + c.traits.curious * 0.5) * news * (0.5 + 0.5 * w.env.sun) * (1 - c.traits.lazy * 0.3);
  },
  start(c, w) {
    const d = c.brain.data;
    d.g = c.memory.ex;
    c.memory.ex = null;
    c.memory.exT = w.time;
    if (!d.g || !antTo(c, w, d.g.cx, d.g.cy)) {
      if (d.g && d.g.n) d.g.n.antSeen = (d.g.n.antSeen || 0) + 2; // can't get there from here
      d.fail = true;
    }
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    if (d.fail) return false;
    if (c.arrived || !antMoving(c, w)) {
      if (!d.look) {
        d.look = true;
        d.t = 0;
        if (d.g.n) {
          d.g.n.antSeen = (d.g.n.antSeen || 0) + 1;
          c.emote('?', 1.2);
          w.events.emit('antScout', { c, kind: d.g.n.kind });
          // a roomy hollow underground: the colony takes it over
          const col = colonyOf(c, w);
          if (col && d.g.n.kind === 'dig') col.adoptRoom(w, Math.floor((d.g.n.bx || c.x) / CELL), Math.floor((d.g.n.by || c.y) / CELL));
        }
      }
      // antennae up, having a good feel about
      c.pose = 'idle';
      d.t += dt;
      if (chance(dt * 1.5)) c.facing = -c.facing;
      return d.t < 2.2;
    }
    return c.brain.t < 45;
  },
  thought: (c) => {
    const g = c.brain.data.g;
    if (g && g.n) return g.n.kind === 'dig' ? 'Somebody dug a new hole! Scouting it out for the colony.' : g.n.kind === 'water' ? 'Water where there was none! I must tell the others.' : 'The ground has changed round here. Checking it out.';
    return rpick(['On patrol. Checking every tunnel.', 'Scouting. Nobody has been down here for ages.', 'Keeping our map of the nest up to date.']);
  },
});

// ------------------------------------------------------------------ guarding the door
// A couple of older ants stand guard just inside the entrance and see off
// any big visitor who wanders too close.
def('antGuard', {
  hold: 0.5,
  score(c, w) {
    if (c.stage !== 'worker') return 0;
    const col = colonyOf(c, w);
    if (!col || col._guards >= 2 || col.workers(w) < 5) return 0;
    const older = clamp01(c.age / DAY_LEN);
    // (nobody stands about at the door when the sand is baking)
    if (surfaceHot(c, w) > 35) return 0;
    // there's nearly always somebody on the door by day
    return (col._guards ? 0.3 : 0.8) * (0.6 + c.traits.bold * 0.8) * (0.2 + 0.8 * w.env.sun) * (0.5 + older * 0.5);
  },
  start(c, w) {
    const col = colonyOf(c, w);
    const d = c.brain.data;
    d.dur = rrange(25, 55);
    col._guards++;
    // (a guard waits just inside the door, a little further down if it's hot)
    const st = nearestWalkable(w.terrain, col.entrance.cx + rint(-1, 1), col.entrance.cy + (surfaceHot(c, w) > 32 ? 4 : 1), 3);
    if (!st || !antTo(c, w, st[0], st[1])) d.fail = true;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const col = colonyOf(c, w);
    if (d.fail || !col) return false;
    if (surfaceHot(c, w) > 36) return false; // too hot up there: back down
    if (c.arrived || !antMoving(c, w)) {
      c.pose = 'idle';
      if (chance(dt * 0.5)) c.facing = -c.facing;
      d.look = (d.look || 0) - dt;
      if (d.look <= 0) {
        d.look = 0.8;
        const ex = col.entrance.cx * CELL;
        const ey = col.entrance.cy * CELL;
        const o = w.hashC.nearest(ex, ey, 46, (q) => q.sp !== 'ant' && !q.dead && !q.hidden && (q.mode === 'walk' || q.mode === 'crawl') && q.size >= 12);
        if (o) {
          // shoo!
          c.facing = o.x >= c.x ? 1 : -1;
          c.emote('!', 1);
          o.fear = Math.min(1, o.fear + 0.55);
          o.memory.scare = { x: c.x, y: c.y, t: w.time };
          o.brain.think = 0;
          d.shoo = (d.shoo || 0) + 1;
          w.events.emit('antShoo', { c, o });
        }
      }
    }
    return c.brain.t < d.dur;
  },
  thought: (c) => (c.brain.data.shoo ? 'Shoo! This is our nest, thank you very much.' : 'On guard at the front door.'),
});

// ------------------------------------------------------------------ sharing food
// An ant with a full tummy shares it mouth to mouth with a hungry sister
// (or the queen): ants really do keep each other fed this way.
def('antShare', {
  hold: 0.6,
  score(c, w) {
    if (c.stage !== 'worker' || c.hunger > 0.3) return 0;
    const col = colonyOf(c, w);
    if (!col) return 0;
    const m = c.memory;
    if (!m.shQ || w.time - m.shQ > 3) {
      m.shQ = w.time;
      const q = col.queen(w);
      m.sh = q && !q.dead && q.hunger > 0.35 && Math.hypot(q.x - c.x, q.y - c.y) < 200 ? q : w.hashC.nearest(c.x, c.y, 170, (o) => o !== c && o.sp === 'ant' && o.colonyId === c.colonyId && !o.dead && o.hunger > 0.45 && o.mode === 'crawl');
    }
    return m.sh ? (0.45 + c.traits.social * 0.6) * m.sh.hunger : 0;
  },
  start(c, w) {
    const d = c.brain.data;
    d.o = c.memory.sh;
    c.memory.sh = null;
    d.re = 0;
  },
  tick(c, w, dt) {
    const d = c.brain.data;
    const o = d.o;
    if (!o || o.dead || o.removed) return false;
    const dist = Math.hypot(o.x - c.x, o.y - c.y);
    if (dist < 8) {
      if (!d.t) {
        d.t = 0.001;
        c.pauseT = o.pauseT = 2.2;
        c.facing = o.x >= c.x ? 1 : -1;
        o.facing = -c.facing;
      }
      d.t += dt;
      if (d.t > 2) {
        const amt = Math.min(0.35, o.hunger);
        o.hunger -= amt;
        c.hunger = Math.min(1, c.hunger + amt * 0.4);
        c.emote('heart', 1.2);
        o.emote('heart', 1.2);
        w.events.emit('antShare', { c, o });
        return false;
      }
      return true;
    }
    d.re -= dt;
    if (d.re <= 0) {
      d.re = 1.5;
      if (!antTo(c, w, Math.floor(o.x / CELL), Math.floor(o.y / CELL))) return false;
    }
    return c.brain.t < 30;
  },
  thought: (c) => (c.brain.data.o && c.brain.data.o.stage === 'queen' ? 'Bringing Her Majesty a tummyful of food.' : 'Sharing a tummyful of food with a hungry sister.'),
});

SPECIES_BEHAVIORS.ant = ['antDeliver', 'antForage', 'antDig', 'antNurse', 'antRest', 'antEat', 'antFlee', 'antLost', 'antQueen', 'antExplore', 'antGuard', 'antShare'];
