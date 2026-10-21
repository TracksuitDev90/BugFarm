// The World owns every entity and runs the simulation step.
import { W, H, CELL, GW, GH, MAT, DAY_LEN, MAX_CREATURES, MAX_FOOD, MAX_PLANTS, MAX_DECOR, ZONE_X } from '../config.js';
import { Terrain, POND_L, POND_R } from './terrain.js';
import { Environment, LAMP_X, MISTER_X } from './environment.js';
import { SpatialHash } from './spatial.js';
import { Emitter } from '../util/events.js';
import { RNG, rrange, rint, chance, rpick } from '../util/rng.js';
import { clamp, clamp01, dist } from '../util/math.js';
import { Creature, nextId, setNextId } from '../entities/creature.js';
import { Plant } from '../entities/plant.js';
import { Food } from '../entities/food.js';
import { Decor } from '../entities/decor.js';
import { SPECIES } from '../data/species.js';
import { PLANTS } from '../data/plants.js';
import { DECOR } from '../data/decor.js';
import { FOODS } from '../data/foods.js';
import { tickBrain, force } from '../ai/brain.js';
import { Colony } from '../ai/ants.js';
import { preyValue } from '../ai/search.js';

export class World {
  constructor() {
    this.terrain = new Terrain();
    this.env = new Environment();
    this.events = new Emitter();
    this.creatures = [];
    this.plants = [];
    this.foods = [];
    this.decor = [];
    this.colonies = [];
    this.hashC = new SpatialHash(64);
    this.hashF = new SpatialHash(64);
    this.byIdMap = new Map();
    this.counts = {};
    this.region = new Int16Array(GW);
    this.regionVer = -1;
    this.shores = [];
    this.novelty = [];
    this.fx = null; // particle system (render side), optional
    this.gentle = true;
    this.awayMode = false;
    this.style = { sand: 'golden', soil: 'loam', gravel: 'natural', backdrop: 'meadow', water: 'clear', frame: 'wood', wallpaper: 'cream' };
    this.stats = { born: 0, died: 0, dug: 0, eaten: 0, fed: 0, days: 0 };
    this.history = [];
    this.histT = 0;
    this.log = [];
    this.lastHour = this.env.hour;
    this.plantTick = 0;
    this.seed = 1;
  }

  get time() {
    return this.env.time;
  }

  // ------------------------------------------------------------------ setup
  // starter: 'farm' (each zone begins with its two first critters),
  // true / 'full' (everyone moved in, for sandbox play) or false (empty).
  newGame(seed = (Math.random() * 1e9) | 0, starter = true) {
    this.seed = seed;
    this.terrain.generate(seed);
    this.env.pond.full = this.terrain.waterLevel;
    this.computeRegions();
    if (!starter) return;
    const farm = starter === 'farm';
    const t = this.terrain;
    // ant colony (its nest starts somewhere new every time)
    this.foundColony(rint(26, 82));
    // plants
    const plant = (type, x, growth = rrange(0.55, 0.95)) => this.addPlant(type, x, null, { growth });
    for (const [type, x] of [
      ['cactus', 120], ['cactus', 520], ['succulent', 330], ['marigold', 300], ['marigold', 470], ['drygrass', 30], ['drygrass', 250], ['drygrass', 540],
      ['reed', 588], ['reed', 1040], ['eelgrass', 720], ['eelgrass', 860], ['eelgrass', 960], ['lilypad', 790], ['lilypad', 930],
      ['palm', 1086], ['palm', 1556], ['monstera', 1160], ['monstera', 1452], ['bromeliad', 1236], ['bromeliad', 1512], ['bigleaf', 1272],
      ['fern', 1132], ['fern', 1300], ['fern', 1584], ['daisy', 1180], ['tulip', 1305], ['sunflower', 1400], ['clover', 1350], ['grass', 1340],
      ['strawberry', 1430], ['mushroom', 1580], ['mushroom', 1255],
    ]) plant(type, x + rrange(-6, 6));
    // decor (a new farm earns its bee hotel, library and lamp post later)
    this.addDecor('sign', 505);
    this.addDecor('flowerpot', 300);
    this.addDecor('castle', 880);
    this.addDecor('log', 1480);
    this.addDecor('mushroomHouse', 1110);
    if (!farm) {
      this.addDecor('bubbler', 960);
      this.addDecor('library', 1200);
      this.addDecor('beeHouse', 1370);
      this.addDecor('lampPost', 1545);
    }
    // critters (alternating boys and girls, so every pair can raise a family)
    const add = (sp, x, y, opts) => this.spawn(sp, x, y, Object.assign({ stage: SPECIES[sp].adultStage, sex: this.balancedSex(sp) }, opts || {}));
    add('cricket', 280);
    add('cricket', 330);
    add('cricket', 470);
    add('goldfish', 760, 520);
    add('goldfish', 800, 560);
    add('goldfish', 840, 540);
    add('pondsnail', 760, t.surfaceY(760));
    add('pondsnail', 930, t.surfaceY(930));
    add('snail', 1210);
    add('snail', 1500);
    add('butterfly', 1250, 300);
    add('butterfly', 1420, 260);
    this.adopt('butterfly', 1180, 420);
    if (!farm) {
      add('gecko', 420);
      add('beetle', 160);
      add('beetle', 360);
      add('frog', 700, 480, { stage: 'tadpole' });
      add('frog', 900, 520, { stage: 'tadpole' });
      add('frog', 980, 480, { stage: 'tadpole' });
      add('turtle', 820, 600);
      add('shrimp', 800, t.surfaceY(800));
      add('shrimp', 880, t.surfaceY(880));
      add('shrimp', 1000, t.surfaceY(1000));
      add('ladybug', 1150);
      add('ladybug', 1300);
      add('ladybug', 1450);
      add('bee', 1350, 320);
      add('bee', 1420, 300);
      add('worm', 1200, 560);
      add('worm', 1450, 640);
      add('firefly', 1330);
      add('firefly', 1390);
      add('firefly', 1520);
      add('firefly', 1180);
      add('pillbug', 1470);
      add('pillbug', 1490);
      add('pillbug', 1260);
      add('grasshopper', 1380);
      for (let i = 0; i < 6; i++) this.adopt('aphid', rrange(1100, 1550), 400);
      this.adopt('butterfly', 1520, 420);
    }
    // a few snacks to start
    this.addFood(farm ? 'lettuce' : 'apple', 1330, t.surfaceY(1330), { state: 'rest' });
    this.addFood('seedmix', 250, t.surfaceY(250), { state: 'rest' });
    this.addFood('flakes', 800, t.waterLevel + 1, { state: 'float', inWater: true });
    this.addLog(farm ? 'Welcome to your Bug Farm! Each corner has its first two kinds of critter. Check the clipboard to see what they need.' : 'Welcome to your Bug Farm! Everyone has just moved in.', 'star');
  }

  foundColony(entranceCx) {
    const t = this.terrain;
    const nest = t.carveStarterNest(entranceCx);
    const id = this.colonies.length ? Math.max(...this.colonies.map((c) => c.id)) + 1 : 1;
    const col = new Colony(id, nest.entrance, nest.chamber);
    col.palIdx = rint(0, 2);
    this.colonies.push(col);
    const q = this.spawnAnt(col, nest.chamber.cx * CELL, nest.chamber.cy * CELL, 'queen');
    q.name = 'Queen ' + q.name;
    col.queenId = q.id;
    for (let i = 0; i < 8; i++) {
      const a = this.spawnAnt(col, (nest.chamber.cx + rint(-4, 4)) * CELL, nest.chamber.cy * CELL, 'worker');
      a.age = rrange(0, DAY_LEN * 2);
    }
    return col;
  }

  spawnAnt(col, x, y, stage) {
    const c = new Creature('ant', x, y, { stage, colonyId: col.id, palIdx: col.palIdx });
    c.mode = 'crawl';
    if (stage === 'queen') c.lifespan = DAY_LEN * 80;
    if (stage === 'worker') {
      this.stats.born++;
      if (this.creatures.length) this.events.emit('birth', { c, quiet: true });
    }
    this.addCreature(c);
    return c;
  }

  // ------------------------------------------------------------------ entity management
  addCreature(c) {
    if (this.creatures.length >= MAX_CREATURES) return null;
    this.creatures.push(c);
    this.byIdMap.set(c.id, c);
    this.counts[c.sp] = (this.counts[c.sp] || 0) + 1;
    return c;
  }
  removeCreature(c) {
    if (c.removed) return;
    c.removed = true;
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    this.byIdMap.delete(c.id);
    this.counts[c.sp] = Math.max(0, (this.counts[c.sp] || 0) - 1);
  }
  byId(id) {
    return this.byIdMap.get(id) || null;
  }
  count(sp) {
    return this.counts[sp] || 0;
  }
  spDef(sp) {
    return SPECIES[sp];
  }
  colony(id) {
    for (const c of this.colonies) if (c.id === id) return c;
    return null;
  }
  hive() {
    return this.decor.find((d) => d.def.hive) || null;
  }

  // Create a creature at a sensible spot for its stage/habitat.
  spawn(sp, x, y, opts = {}) {
    const t = this.terrain;
    const c = new Creature(sp, x, y == null ? 0 : y, opts);
    const loco = c.stageDef.loco;
    if (loco === 'swim') {
      if (!t.waterAt(x, c.y)) {
        const p = this.randomWaterPoint(x, 60, false);
        if (p) {
          c.x = p[0];
          c.y = p[1];
        }
      }
    } else if (loco === 'burrow') {
      if (y == null || !t.isUnderground(x, y)) c.y = t.surfaceY(x) + rrange(30, 120);
      c.body = null;
      c.applyStage(true);
    } else if (loco === 'fly') {
      if (y == null) c.y = t.surfaceY(x) - rrange(40, 120);
    } else if (loco === 'walk') {
      c.y = c.groundAt(this, x);
    }
    return this.addCreature(c);
  }

  addPlant(type, x, y, opts = {}) {
    if (this.plants.length >= MAX_PLANTS) return null;
    const t = this.terrain;
    const def = PLANTS[type];
    if (y == null) y = t.surfaceY(x);
    const p = new Plant(type, x, y, Object.assign({ waterY: t.waterLevel }, opts));
    p.id = opts.id || nextId();
    this.plants.push(p);
    return p;
  }
  removePlant(p) {
    p.removed = true;
    const i = this.plants.indexOf(p);
    if (i >= 0) this.plants.splice(i, 1);
  }

  addFood(type, x, y, opts = {}) {
    if (this.foods.length >= MAX_FOOD) {
      // remove the most decayed bit to make room
      let worst = this.foods[0];
      for (const f of this.foods) if (f.fresh < worst.fresh) worst = f;
      this.removeFood(worst);
    }
    const f = new Food(type, x, y, opts);
    this.foods.push(f);
    return f;
  }
  removeFood(f) {
    if (f.gone) return;
    f.gone = true;
    const i = this.foods.indexOf(f);
    if (i >= 0) this.foods.splice(i, 1);
  }

  addDecor(type, x, y, opts = {}) {
    if (this.decor.length >= MAX_DECOR) return null;
    const t = this.terrain;
    const def = DECOR[type];
    if (def.stamp) {
      const cx = Math.floor(x / CELL);
      const gy = t.top[clamp(cx, 0, GW - 1)];
      const { rx, ry } = def.stamp;
      for (let yy = Math.floor(gy - ry); yy <= gy + ry; yy++) {
        for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
          const dx = (xx - cx) / rx;
          const dy = (yy - gy) / ry;
          if (dx * dx + dy * dy <= 1 && t.get(xx, yy) === MAT.AIR && !t.isWater(xx, yy)) t.set(xx, yy, MAT.ROCK);
        }
      }
      for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
        if (xx >= 0 && xx < GW && t.top[xx] < t.groundTop[xx]) t.setGroundTop(xx, t.top[xx]);
      }
      return { stamped: true };
    }
    if (y == null) y = def.place === 'top' ? 0 : t.surfaceY(x);
    const d = new Decor(type, x, y, opts);
    this.decor.push(d);
    return d;
  }
  removeDecor(d) {
    d.removed = true;
    const i = this.decor.indexOf(d);
    if (i >= 0) this.decor.splice(i, 1);
  }

  addLog(text, icon = 'leaf') {
    this.log.unshift({ text, icon, day: this.env.day, hour: this.env.hour });
    if (this.log.length > 120) this.log.length = 120;
    this.events.emit('log', this.log[0]);
  }

  // ------------------------------------------------------------------ geography
  computeRegions() {
    const t = this.terrain;
    let id = 0;
    let wid = 0;
    let prev = null;
    this.shores = [];
    for (let cx = 0; cx < GW; cx++) {
      const top = t.top[cx];
      const dry = !(top > 0 && t.isWater(cx, top - 1));
      if (dry) {
        if (prev !== true) id++;
        this.region[cx] = id;
      } else {
        if (prev !== false) wid--;
        this.region[cx] = wid;
      }
      if (prev !== null && prev !== dry) this.shores.push(dry ? cx * CELL + 3 : (cx - 1) * CELL + 1);
      prev = dry;
    }
    this.regionVer = t.version + ':' + t.waterVersion;
  }
  regionOf(x) {
    return this.region[clamp(Math.floor(x / CELL), 0, GW - 1)];
  }
  nearestShore(x, prefer) {
    let best = null;
    let bd = 1e9;
    const p = prefer == null ? x : prefer;
    for (const s of this.shores) {
      const d = Math.abs(s - p) + Math.abs(s - x) * 0.5;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
  randomWaterPoint(x, range, floor) {
    const t = this.terrain;
    for (let i = 0; i < 10; i++) {
      const px = clamp(x + rrange(-range, range), ZONE_X.pond[0] - 40, ZONE_X.pond[1] + 40);
      const cx = Math.floor(px / CELL);
      if (t.waterTop[cx] < 0) continue;
      const fy = t.surfaceY(px);
      if (floor) {
        if (t.waterAt(px, fy - 3)) return [px, fy - 3];
        continue;
      }
      const y = rrange(t.waterLevel + 8, fy - 8);
      if (t.waterAt(px, y)) return [px, y];
    }
    return null;
  }
  shelterAt(x, y) {
    for (const d of this.decor) if (d.def.shelter && d.covers(x, y)) return d;
    return null;
  }
  rainBoost() {
    return 0;
  }

  // ------------------------------------------------------------------ fx/sound hooks (no-ops in away-sim)
  splash(x, y, s) {
    if (this.fx) this.fx.splash(x, y, s);
  }
  // a stream of water pouring in from the top of the tank
  pour(x, y) {
    if (this.fx && this.fx.pour) this.fx.pour(x, y);
    else this.splash(x, y, 1);
  }
  bubble(x, y) {
    if (this.fx) this.fx.bubble(x, y);
  }
  dust(x, y, n) {
    if (this.fx) this.fx.dust(x, y, n);
  }
  poof(x, y) {
    if (this.fx) this.fx.poof(x, y);
  }
  sparkle(x, y, n) {
    if (this.fx) this.fx.sparkle(x, y, n);
  }
  sound(name, x, y, p) {
    if (!this.awayMode) this.events.emit('sound', { name, x, y, p });
  }
  addNovelty(x, y, strength = 1) {
    this.novelty.push({ x, y, t: this.time, strength });
    if (this.novelty.length > 12) this.novelty.shift();
  }
  noveltyNear(c) {
    let best = null;
    for (const n of this.novelty) {
      const age = this.time - n.t;
      if (age > 25 || (n.seen || 0) > 4) continue;
      const d = Math.hypot(n.x - c.x, n.y - c.y);
      if (d > c.def.sight * 1.5 || d < 10) continue;
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, strength: n.strength * (1 - age / 25), ref: n };
    }
    if (best) best.ref.seen = best.ref.seen || 0;
    return best ? Object.assign(best.ref, { strength: best.strength }) : null;
  }

  // ------------------------------------------------------------------ interactions used by AI
  // One bite. Critters chew little and often (a bite every ~0.6s), so food
  // visibly goes down mouthful by mouthful.
  eat(c, tgt, mouthfuls = 1) {
    let like = 0;
    let amt = 0;
    const bite = c.appetite * 0.15 * mouthfuls;
    if (tgt.kind === 'food') {
      const f = tgt.food;
      if (!f || f.gone || f.amount <= 0.001) return false;
      for (const tg of f.tags) like = Math.max(like, c.diet[tg] || 0);
      amt = Math.min(f.amount, bite);
      f.amount = Math.max(0, f.amount - amt);
      this.nibbled(f, c);
      this.events.emit('eat', { c, food: f });
    } else if (tgt.kind === 'plant') {
      const p = tgt.plant;
      const tag = p.slotFood(tgt.slot);
      if (!tag) return false;
      like = c.diet[tag] || (tag === 'grass' ? c.diet.leaf || 0 : 0);
      amt = bite;
      p.eatSlot(tgt.slot, amt / Math.max(0.3, p.def.h > 60 ? 1.2 : 0.6));
      this.events.emit('eatPlant', { c, plant: p, tag });
    } else if (tgt.kind === 'algae') {
      like = c.diet.algae || 0;
      amt = bite * Math.min(1, this.env.pond.algae * 3);
      this.env.pond.algae = Math.max(0.01, this.env.pond.algae - amt * 0.02);
    } else if (tgt.kind === 'soil') {
      like = c.diet.soil || 0.3;
      amt = bite * 0.6;
    } else return false;
    const relief = (amt / c.appetite) * (0.45 + 0.55 * like);
    // eating when already full goes straight to the waistline
    if (c.hunger < 0.2) c.plump = Math.min(1.5, c.plump + relief * 0.12 * (1 - c.hunger * 4));
    c.hunger = Math.max(0, c.hunger - relief);
    if (c.plump > 1.25 && !c.memory.stuffedT) {
      c.memory.stuffedT = 1;
      c.emote('food', 1.6);
      this.events.emit('stuffed', { c });
    }
    return true;
  }

  // Visual side of a bite: crumbs, a little wobble, bites from the eater's side.
  nibbled(f, c) {
    f.biteT = 0.3;
    if (!f.biteSide) f.biteSide = c && c.x < f.x ? -1 : 1;
    if (this.fx) this.fx.crumbs(f.x + f.biteSide * 3, f.y - 3, f.def.colors, f.inWater ? -1 : f.y);
  }

  predation(pred, prey) {
    const v = preyValue(prey.sp);
    pred.hunger = Math.max(0, pred.hunger - v / pred.appetite);
    pred.emote('heart', 1.2);
    prey.eatenBy = pred;
    prey.die(this, 'eaten');
    prey.deadT = 99;
    this.poof(prey.x, prey.y);
    this.stats.eaten++;
    this.events.emit('predation', { pred, prey });
  }

  court(target, suitor) {
    force(target, this, 'courted', { suitor });
  }

  reproduce(a, b) {
    const def = a.def;
    const br = def.breed;
    if (!br) return;
    const cd = br.cooldown * DAY_LEN * rrange(0.85, 1.2);
    a.mateCD = cd;
    if (b) b.mateCD = cd;
    const mother = b && b.sex === 'f' ? b : a;
    const room = def.maxPop - this.count(a.sp);
    let n = Math.min(rint(br.clutch[0], br.clutch[1]), room);
    if (n <= 0) return;
    const t = this.terrain;
    const firstStage = def.stages[0].id;
    const kids = [];
    const mk = (x, y, stage, extra) => {
      const c = new Creature(a.sp, x, y, Object.assign({ stage, palIdx: chance(0.5) ? a.palIdx : (b || a).palIdx }, extra || {}));
      if (this.addCreature(c)) kids.push(c);
      return c;
    };
    switch (br.place) {
      case 'ground':
      case 'beach': {
        let bx = mother.x;
        if (br.place === 'beach') {
          // turtles lay on the sandy beach beside the pond
          bx = (POND_L - 8) * CELL + rrange(-30, 10);
        }
        for (let i = 0; i < n; i++) {
          const x = clamp(bx + rrange(-10, 10), 10, W - 10);
          const c = mk(x, 0, firstStage);
          c.mode = c.stageDef.loco === 'still' ? 'still' : 'walk';
          c.y = c.groundAt(this, x);
        }
        break;
      }
      case 'water': {
        if (a.sp === 'frog') {
          const c = mk(mother.x, t.waterLevel + 3, 'egg');
          c.memory.floats = true;
          c.memory.young = br.young || 4;
          c.mode = 'still';
          if (!t.waterAt(c.x, c.y + 2)) {
            const p = this.randomWaterPoint(LAMP_X.pond, 120, false);
            if (p) c.x = p[0];
          }
        } else if (a.sp === 'pondsnail') {
          const c = mk(mother.x, mother.y, 'egg');
          c.memory.young = br.young || 3;
          c.mode = 'still';
        } else {
          for (let i = 0; i < n; i++) {
            const p = this.randomWaterPoint(mother.x, 60, true) || [mother.x, mother.y];
            const c = mk(p[0], p[1], firstStage);
            c.mode = 'still';
          }
        }
        break;
      }
      case 'plant':
      case 'leaf': {
        const near = [];
        for (const p of this.plants) {
          if (p.dead || p.def.aquatic || Math.abs(p.x - mother.x) > 260) continue;
          for (const s of p.shape.slots) if (s.kind === 'leaf' || s.kind === 'stem') near.push([p, s]);
        }
        for (let i = 0; i < n && near.length; i++) {
          const [p, s] = rpick(near);
          const c = mk(p.x, p.y, 'egg');
          c.climb = { plant: p, slot: s, t: 1, dir: 0 };
          c.mode = 'still';
        }
        break;
      }
      case 'soil': {
        const c = mk(mother.x, mother.y + 4, 'egg');
        c.memory.underground = true;
        c.memory.young = br.young || 2;
        c.mode = 'still';
        break;
      }
      case 'live': {
        const stage = def.stages[0].id;
        for (let i = 0; i < n; i++) {
          const c = mk(mother.x + rrange(-5, 5), mother.y, stage);
          if (mother.climb) {
            c.climb = { plant: mother.climb.plant, slot: mother.climb.slot, t: 1, dir: 0 };
            c.mode = 'climb';
            c.seek({ kind: 'plant', plant: mother.climb.plant, slot: mother.climb.slot });
          } else if (c.aquatic && c.stageDef.loco === 'walk') c.y = c.groundAt(this, c.x);
        }
        break;
      }
      case 'hive': {
        const h = this.hive();
        if (h) {
          const c = mk(h.x, h.y - 40, def.stages[0].id);
          c.mode = 'fly';
        }
        break;
      }
      default:
        break;
    }
    if (kids.length) {
      this.stats.born += kids.length;
      this.events.emit('birth', { c: kids[0], n: kids.length, parents: [a, b] });
      const who = b ? `${a.name} & ${b.name}` : a.name;
      const what = kids[0].stage === 'egg' ? (kids.length > 1 ? `${kids.length} eggs` : a.sp === 'frog' ? 'frogspawn' : 'an egg') : kids.length > 1 ? `${kids.length} babies` : 'a baby';
      this.addLog(`${who} the ${def.plural.toLowerCase()} had ${what}!`, 'heart');
      this.sparkle(mother.x, mother.y - 6, 6);
    }
  }

  advanceStage(c) {
    const def = c.def;
    const i = def.stageIndex[c.stage];
    if (i == null || i >= def.stages.length - 1) {
      c.stageDur = Infinity;
      return;
    }
    if (c.sp === 'butterfly' && c.stage === 'caterpillar' && !c.memory.readyToPupate && c.stageAge < c.stageDur * 1.3) return;
    const from = c.stage;
    const next = def.stages[i + 1];
    const t = this.terrain;
    const wasClimb = c.climb;
    c.stage = next.id;
    c.stageAge = 0;
    c.applyStage(false);
    c.brain.b = null;
    c.pose = 'idle';
    if (from === 'egg') {
      if (c.memory.floats) {
        c.memory.floats = false;
        c.y = t.waterLevel + 12;
      }
      if (c.memory.underground) {
        c.memory.underground = false;
        c.body = null;
        c.applyStage(true);
      }
      if (wasClimb && (c.stageDef.loco === 'walk' || c.stageDef.loco === 'crawl')) {
        c.mode = 'climb';
        c.climb = wasClimb;
        c.seek({ kind: 'plant', plant: wasClimb.plant, slot: wasClimb.slot });
      } else if (wasClimb) c.climb = null;
      if (c.stageDef.loco === 'walk' && c.mode === 'walk') c.y = c.groundAt(this, c.x);
      const extra = (c.memory.young || 1) - 1;
      for (let k = 0; k < extra && this.count(c.sp) < def.maxPop; k++) {
        const s = new Creature(c.sp, c.x + rrange(-6, 6), c.y + rrange(-4, 4), { stage: c.stage, palIdx: c.palIdx });
        s.mode = c.mode;
        if (c.mode === 'climb' && c.climb) {
          s.climb = { ...c.climb };
          s.seek({ kind: 'plant', plant: c.climb.plant, slot: c.climb.slot });
        }
        if (s.mode === 'burrow') s.applyStage(true);
        this.addCreature(s);
      }
      c.memory.young = 0;
      this.events.emit('hatch', { c });
    } else if (c.stage === 'chrysalis') {
      c.mode = 'still';
      if (wasClimb) c.climb = { plant: wasClimb.plant, slot: wasClimb.slot, t: 1, dir: 0 };
      this.events.emit('pupate', { c });
      this.addLog(`${c.name} the caterpillar made a chrysalis.`, 'leaf');
    } else if (from === 'chrysalis') {
      c.climb = null;
      c.mode = 'fly';
      c.vy = -20;
      this.sparkle(c.x, c.y, 10);
      this.events.emit('metamorph', { c, kind: 'butterfly' });
      this.addLog(`${c.name} came out of the chrysalis as a butterfly!`, 'star');
    } else if (c.sp === 'frog' && c.stage === 'adult') {
      c.mode = 'swim';
      this.events.emit('metamorph', { c, kind: 'frog' });
      this.addLog(`${c.name} the tadpole grew into a frog!`, 'star');
    } else if (c.stage === 'adult' && def.stages.length > 1) {
      if (wasClimb) {
        c.mode = 'climb';
        c.climb = wasClimb;
      }
      this.events.emit('grownUp', { c });
    }
    if (c.mode === 'walk' && !wasClimb) c.y = c.groundAt(this, c.x);
    this.events.emit('stage', { c, from, to: c.stage });
  }

  onDeath(c, cause) {
    this.stats.died++;
    const words = {
      old: 'passed away peacefully of old age',
      hungry: 'got too hungry and passed away',
      cold: 'got too chilly and passed away',
      hot: 'got too hot and passed away',
      dry: 'got too dried out and passed away',
      air: 'ran out of air in the cloudy water',
      poorly: 'felt poorly and passed away',
      eaten: c.eatenBy ? `became a snack for ${c.eatenBy.name} the ${c.eatenBy.def.name.toLowerCase()}` : 'was eaten',
    };
    const stage = c.stage === 'egg' ? (c.sp === 'frog' ? 'frogspawn' : 'egg') : c.def.name.toLowerCase();
    if (!(c.stage === 'egg' && cause === 'eaten')) {
      const important = c.isAdult || cause !== 'eaten';
      if (important && (c.sp !== 'ant' || c.stage === 'queen' || chance(0.25)) && c.sp !== 'aphid' && c.sp !== 'fruitfly') {
        this.addLog(`${c.name} the ${stage} ${words[cause] || words.poorly}.`, cause === 'eaten' ? 'paw' : 'flower');
      }
    }
    if (c.sp === 'ant' && c.stage === 'queen') this.addLog('The ant queen has passed away. Without a queen, no new ants will be born.', 'crown');
    this.events.emit('death', { c, cause });
  }

  spawnFruitFly(food) {
    if (this.count('fruitfly') >= SPECIES.fruitfly.maxPop || this.creatures.length >= MAX_CREATURES - 10) return;
    const c = new Creature('fruitfly', food.x, food.y - 6, { stage: 'adult' });
    c.mode = 'fly';
    this.addCreature(c);
    this.events.emit('fruitfly', { c, food });
  }

  spawnSeedling(parent, range) {
    if (this.plants.length >= MAX_PLANTS - 4) return null;
    const def = parent.def;
    const t = this.terrain;
    for (let i = 0; i < 5; i++) {
      const x = clamp(parent.x + rrange(-range, range), 12, W - 12);
      if (!this.canPlace('plant', def.id, x, null).ok) continue;
      if (this.plants.some((p) => Math.abs(p.x - x) < 16 && p.def.place === def.place)) continue;
      const p = this.addPlant(def.id, x, def.place === 'surface' || def.place === 'underwater' ? t.surfaceY(x) : null, { growth: 0.06 });
      if (p) this.events.emit('sprout', { plant: p, parent });
      return p;
    }
    return null;
  }

  // ------------------------------------------------------------------ player actions
  canPlace(kind, type, x, y) {
    const t = this.terrain;
    if (x < 8 || x > W - 8) return { ok: false, msg: 'Too close to the glass!' };
    const sy = t.surfaceY(x);
    const wetSurface = t.waterSurfaceAt(x) > 0 && t.waterAt(x, sy - 2);
    if (kind === 'plant') {
      const def = PLANTS[type];
      if (def.place === 'ground') {
        if (wetSurface) return { ok: false, msg: `${def.name}s don't grow underwater.` };
        return { ok: true };
      }
      if (def.place === 'shore') {
        if (wetSurface) return { ok: false, msg: 'Cattails like the muddy edge of the pond.' };
        const sh = this.shores.some((s) => Math.abs(s - x) < 90);
        return sh ? { ok: true } : { ok: false, msg: 'Cattails grow right beside the pond.' };
      }
      if (def.place === 'underwater' || def.place === 'surface') {
        if (!wetSurface) return { ok: false, msg: `${def.name} needs to be planted in the pond.` };
        if (def.place === 'surface' && sy - t.waterLevel > 420) return { ok: false, msg: 'Too deep for a lily here.' };
        return { ok: true };
      }
      return { ok: true };
    }
    if (kind === 'decor') {
      const def = DECOR[type];
      if (def.place === 'top') return { ok: true };
      if (def.place === 'ground' && wetSurface) return { ok: false, msg: `The ${def.name.toLowerCase()} would get soggy! Put it on dry land.` };
      if (def.place === 'floor' && !wetSurface && (type === 'bubbler' || type === 'chest' || type === 'diver')) return { ok: false, msg: `The ${def.name.toLowerCase()} goes in the pond.` };
      return { ok: true };
    }
    return { ok: true };
  }

  dropFood(type, x, y, opts) {
    const t = this.terrain;
    if (t.solidAt(x, y)) y = t.surfaceY(x) - 2;
    y = Math.min(y, H - 6);
    const f = this.addFood(type, x, y, Object.assign({ vy: 30 }, opts));
    this.stats.fed++;
    this.events.emit('feed', { food: f });
    return f;
  }

  // The sex a newcomer should be so the tank's grown-ups pair up.
  balancedSex(sp) {
    let f = 0;
    let m = 0;
    for (const c of this.creatures) if (c.sp === sp && !c.dead) c.sex === 'f' ? f++ : m++;
    return f === m ? (Math.random() < 0.5 ? 'f' : 'm') : f < m ? 'f' : 'm';
  }

  adopt(sp, x, y) {
    const t = this.terrain;
    const def = SPECIES[sp];
    if (this.count(sp) >= def.maxPop && sp !== 'ant') return { ok: false, msg: `The tank has plenty of ${def.plural.toLowerCase()} already!` };
    if (this.creatures.length >= MAX_CREATURES - 4) return { ok: false, msg: 'The tank is full to bursting!' };
    const sy = t.surfaceY(x);
    const wet = t.waterSurfaceAt(x) > 0 && t.waterAt(x, sy - 2);
    let c = null;
    switch (sp) {
      case 'ant': {
        if (x > ZONE_X.desert[1] - 30) return { ok: false, msg: 'Ants like to dig in the sandy desert.' };
        const col = this.colonies.find((k) => this.byId(k.queenId) && !this.byId(k.queenId).dead);
        if (col) {
          for (let i = 0; i < 4; i++) {
            const a = this.spawnAnt(col, col.entrance.cx * CELL + rrange(-6, 6), (col.entrance.cy - 1) * CELL, 'worker');
            a.age = DAY_LEN * 0.5;
          }
          return { ok: true, msg: 'Four new worker ants joined the colony!' };
        }
        const cx = clamp(Math.floor(x / CELL), 12, Math.floor(ZONE_X.desert[1] / CELL) - 30);
        this.foundColony(cx);
        this.addLog('A new ant colony moved in with their queen!', 'crown');
        return { ok: true, msg: 'A new ant colony! Watch them dig.' };
      }
      case 'goldfish':
      case 'pondsnail':
      case 'shrimp': {
        if (!wet) return { ok: false, msg: `${def.plural} need to live in the pond.` };
        const st = def.adultStage;
        const yy = sp === 'goldfish' ? clamp(y, t.waterLevel + 10, sy - 10) : sy;
        c = this.spawn(sp, x, yy, { stage: st, sex: this.balancedSex(sp) });
        break;
      }
      case 'frog': {
        if (!wet) return { ok: false, msg: 'Tadpoles need water! Tap the pond.' };
        for (let i = 0; i < 3; i++) c = this.spawn('frog', x + rrange(-10, 10), clamp(y, t.waterLevel + 10, sy - 10), { stage: 'tadpole', sex: this.balancedSex('frog') });
        return { ok: !!c, c, msg: 'Three wriggly tadpoles! One day they will be frogs.' };
      }
      case 'turtle': {
        const st = 'adult';
        if (wet) c = this.spawn('turtle', x, clamp(y, t.waterLevel + 10, sy - 14), { stage: st, sex: this.balancedSex('turtle') });
        else if (Math.abs(x - (ZONE_X.pond[0] + ZONE_X.pond[1]) / 2) < 380) c = this.spawn('turtle', x, null, { stage: st, sex: this.balancedSex('turtle') });
        else return { ok: false, msg: 'Turtles like to be near the pond.' };
        if (c && !wet) c.mode = 'walk';
        break;
      }
      case 'aphid': {
        let best = null;
        let bd = 160;
        for (const p of this.plants) {
          if (p.dead || p.def.aquatic || p.def.kind === 'cactus' || p.def.kind === 'mushroom') continue;
          const d = Math.abs(p.x - x);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        if (!best) return { ok: false, msg: 'Aphids need a leafy plant to live on.' };
        const slots = best.shape.slots.filter((s) => s.kind === 'leaf' || s.kind === 'stem');
        const s = slots.length ? rpick(slots) : best.shape.slots[0];
        if (!s) return { ok: false, msg: 'That plant is too small for aphids yet.' };
        c = new Creature('aphid', best.x, best.y, { stage: 'adult' });
        c.climb = { plant: best, slot: s, t: 1, dir: 0 };
        c.mode = 'climb';
        c.seek({ kind: 'plant', plant: best, slot: s });
        this.addCreature(c);
        break;
      }
      case 'butterfly': {
        if (wet) return { ok: false, msg: 'Caterpillars would get soggy in the pond!' };
        c = this.spawn('butterfly', x, null, { stage: 'caterpillar', sex: this.balancedSex('butterfly') });
        const s = c && this.plants.find((p) => !p.dead && !p.def.aquatic && Math.abs(p.x - x) < 120 && p.shape.slots.some((k) => k.kind === 'leaf'));
        if (s) {
          const slot = s.shape.slots.find((k) => k.kind === 'leaf');
          c.climb = { plant: s, slot, t: 1, dir: 0 };
          c.mode = 'climb';
          c.seek({ kind: 'plant', plant: s, slot });
        }
        if (c) {
          c.hunger = 0.5;
          this.addLog(`${c.name} the caterpillar arrived. So hungry!`, 'leaf');
        }
        return { ok: !!c, c, msg: 'A hungry caterpillar! Make sure it has leaves to eat.' };
      }
      case 'worm': {
        if (x < ZONE_X.jungle[0] - 20) return { ok: false, msg: 'Earthworms like the dark jungle soil.' };
        c = this.spawn('worm', x, sy + 40, { stage: 'adult', sex: this.balancedSex('worm') });
        break;
      }
      case 'bee':
      case 'fruitfly': {
        c = this.spawn(sp, x, Math.min(y, sy - 30), { stage: 'adult', sex: this.balancedSex(sp) });
        if (c) c.mode = 'fly';
        break;
      }
      default: {
        if (wet) return { ok: false, msg: `${def.plural} would get soggy in the pond!` };
        c = this.spawn(sp, x, null, { stage: def.adultStage, sex: this.balancedSex(sp) });
      }
    }
    if (!c) return { ok: false, msg: 'Hmm, could not fit one in there.' };
    c.emote('heart', 2);
    this.addNovelty(c.x, c.y, 1);
    this.events.emit('adopt', { c });
    if (sp !== 'aphid') this.addLog(`${c.name} the ${def.name.toLowerCase()} moved in!`, 'heart');
    return { ok: true, c };
  }

  placePlant(type, x) {
    const v = this.canPlace('plant', type, x, null);
    if (!v.ok) return v;
    const def = PLANTS[type];
    const p = this.addPlant(type, x, null, { growth: 0.3 });
    if (!p) return { ok: false, msg: 'No room for more plants!' };
    this.addNovelty(p.x, p.y - 10, 0.8);
    this.events.emit('plant', { plant: p });
    return { ok: true, p };
  }

  placeDecor(type, x, y) {
    const v = this.canPlace('decor', type, x, y);
    if (!v.ok) return v;
    const d = this.addDecor(type, x, DECOR[type].place === 'top' ? 0 : null);
    if (!d) return { ok: false, msg: 'The tank is crowded with decorations!' };
    this.addNovelty(x, this.terrain.surfaceY(x) - 10, 1);
    this.events.emit('decor', { d, type });
    this.computeRegions();
    return { ok: true, d };
  }

  // Terrain brush. mode: 'sand' | 'soil' | 'rock' | 'gravel' | 'dig'
  sculpt(x, y, r, mode) {
    const t = this.terrain;
    const cx = x / CELL;
    const cy = y / CELL;
    const rc = r / CELL;
    let n = 0;
    if (mode === 'dig') {
      n = t.dig(cx, cy, rc, (xx, yy, m) => m !== 255);
      for (let xx = Math.floor(cx - rc); xx <= Math.ceil(cx + rc); xx++) {
        if (xx < 0 || xx >= GW) continue;
        if (t.top[xx] > t.groundTop[xx] && cy - rc <= t.groundTop[xx] + 1) t.setGroundTop(xx, t.top[xx]);
      }
    } else {
      const m = mode === 'soil' ? MAT.SOIL : mode === 'rock' ? MAT.ROCK : mode === 'gravel' ? MAT.GRAVEL : MAT.SAND;
      n = t.fill(cx, cy, rc, m, (xx, yy) => yy > 20);
      for (let xx = Math.floor(cx - rc); xx <= Math.ceil(cx + rc); xx++) {
        if (xx < 0 || xx >= GW) continue;
        if (t.top[xx] < t.groundTop[xx]) t.setGroundTop(xx, t.top[xx]);
      }
    }
    if (n) {
      this.sculpted = true;
      // keep decor sitting on the ground
      for (const d of this.decor) if (d.def.place !== 'top') d.y = t.surfaceY(d.x);
      for (const p of this.plants) {
        const sy = t.surfaceY(p.x);
        if (p.def.place === 'ground' || p.def.place === 'shore' || p.def.place === 'underwater' || p.def.place === 'surface') {
          if (Math.abs(sy - p.y) > 2) p.y = sy;
        }
      }
    }
    return n;
  }

  // Pour water in (or bail it out) until the pond would sit at level y.
  // The water then flows and settles on its own. Returns false if the
  // pond would overflow its banks at that level.
  pourToLevel(y) {
    const t = this.terrain;
    let target = t.pondVolumeAt(y);
    let tries = 0;
    while (!target.ok && y < t.waterLevel && tries++ < 60) {
      y += CELL;
      target = t.pondVolumeAt(y);
    }
    if (!target.ok) return false;
    const now = t.pondVolumeAt(t.waterLevel).n;
    const dv = target.n - now;
    if (dv > 0) t.addWater(dv);
    else if (dv < 0) t.removeWater(-dv);
    return true;
  }
  // The water moved: keep things that sit on it in step.
  waterMoved() {
    const wl = this.terrain.waterLevel;
    for (const p of this.plants) if (p.def.place === 'surface') p.waterY = wl;
  }

  setWaterLevel(y) {
    const ok = this.terrain.setWaterLevel(y);
    if (ok) {
      for (const p of this.plants) if (p.def.place === 'surface') p.waterY = this.terrain.waterLevel;
      this.computeRegions();
    }
    return ok;
  }

  // Aquarium chores: siphon the pond / pick up spoiled food on land.
  cleanPond() {
    let n = 0;
    for (const f of this.foods.slice()) {
      if (f.inWater && (f.fresh < 0.5 || f.state === 'rest')) {
        this.removeFood(f);
        n++;
      }
    }
    const p = this.env.pond;
    p.nutrients *= 0.4;
    p.algae = Math.max(0.03, p.algae * 0.6);
    p.clarity = Math.min(1, p.clarity + 0.25);
    this.splash(800, this.terrain.waterLevel, 1.2);
    this.events.emit('chore', { kind: 'pond', n });
    return n;
  }
  tidyLand() {
    let n = 0;
    for (const f of this.foods.slice()) {
      if (!f.inWater && f.fresh < 0.35) {
        this.removeFood(f);
        n++;
      }
    }
    this.events.emit('chore', { kind: 'land', n });
    return n;
  }

  // Keeper chores for the equipment that wears down over time.
  refillMister(z) {
    if (!this.env[z] || this.env[z].water == null) return false;
    this.env[z].water = 1;
    this.events.emit('chore', { kind: 'refill', zone: z });
    return true;
  }
  rinseFilter() {
    this.env.pond.filterClean = 1;
    this.splash(1036, this.terrain.waterLevel, 0.6);
    this.events.emit('chore', { kind: 'rinse', zone: 'pond' });
  }
  topUpPond() {
    const t = this.terrain;
    const p = this.env.pond;
    p.evap = 0;
    // pour back up to the line, or as close as the banks allow
    this.pourToLevel(p.full);
    this.env.lowWater = 0;
    this.pour(810, t.waterLevel);
    this.events.emit('chore', { kind: 'topup', zone: 'pond' });
  }
  // Warm water and lamps slowly evaporate the pond below its line.
  evaporate(dt) {
    const t = this.terrain;
    const p = this.env.pond;
    if (p.full == null) p.full = t.waterLevel;
    const drop = t.waterLevel - p.full;
    this.env.lowWater = clamp01((drop - 12) / 36);
    if (drop >= 48 || drop < -8) return;
    p.evap += (dt * (0.6 + Math.max(0, p.temp - 18) * 0.08 + p.lamp * 0.5) * CELL) / (DAY_LEN * 0.6);
    if (p.evap >= CELL * 0.25) {
      // a quarter of a row off the top of the pond at a time
      let cols = 0;
      for (let cx = POND_L; cx <= POND_R; cx++) if (t.waterTop[cx] >= 0) cols++;
      t.removeWater((cols * p.evap) / CELL);
      p.evap = 0;
    }
  }

  tapGlass(x, y) {
    const list = this.hashC.query(x, y, 150);
    let n = 0;
    for (const c of list) {
      if (c.dead || c.stage === 'egg' || c.stage === 'chrysalis') continue;
      const d = Math.hypot(c.x - x, c.y - y);
      c.fear = Math.min(1, c.fear + 0.9 * (1 - d / 150) * (1.1 - c.traits.bold * 0.5));
      c.memory.scare = { x, y, t: this.time };
      c.brain.think = 0;
      if (c.fear > 0.3) n++;
    }
    this.events.emit('tapGlass', { x, y, n });
    return n;
  }

  pet(c) {
    if (c.dead) return;
    c.memory.petT = this.time;
    if (c.def.rolls) {
      c.fear = 0.8;
      force(c, this, 'flee');
    } else if (c.sp === 'snail' || c.sp === 'pondsnail' || (c.sp === 'turtle' && c.mode !== 'swim')) {
      c.fear = 0.6;
      force(c, this, 'flee');
    } else {
      c.emote('heart', 2);
      c.fear = 0;
      if (c.sp === 'frog' && c.stage === 'adult') this.sound('croak', c.x, c.y);
      if (c.sp === 'cricket') this.sound('chirp', c.x, c.y, c.T);
    }
    this.sparkle(c.x, c.y - c.size * 0.4, 3);
    this.events.emit('pet', { c });
  }

  // ------------------------------------------------------------------ simulation
  step(dt) {
    const env = this.env;
    const t = this.terrain;
    // environment reacts to the loads gathered during the previous step
    env.update(dt, this);
    env.rotLoad = 0;
    env.bioLoad = 0;
    env.grazers = 0;

    // flowing water (asleep, and free, whenever it's still)
    if (t.stepWater(dt)) this.waterMoved(dt);
    const rv = t.version + ':' + t.waterVersion;
    if (rv !== this.regionVer && (!this.regionT || this.time - this.regionT > 0.5)) {
      this.regionT = this.time;
      this.computeRegions();
    }

    // spatial hashes
    this.hashC.clear();
    for (const c of this.creatures) if (!c.dead) this.hashC.insert(c);
    this.hashF.clear();
    for (const f of this.foods) this.hashF.insert(f);

    // foods
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f) f.update(dt, this);
    }

    // plants (staggered)
    this.plantTick += dt;
    if (this.plantTick >= 0.25) {
      const pdt = this.plantTick;
      this.plantTick = 0;
      for (const p of this.plants) p.aphids = 0;
      let wp = 0;
      const green = { desert: 0, jungle: 0 };
      for (let i = this.plants.length - 1; i >= 0; i--) {
        const p = this.plants[i];
        p.update(pdt, this);
        if (p.def.aquatic && !p.dead) wp += p.growth * (p.def.oxygen ? 1 : 0.4);
        else if (!p.dead && p.health > 0.5) {
          const z = env.zoneAt(p.x);
          if (green[z] != null) green[z] += p.growth * (p.def.h > 50 ? 1.5 : 1);
        }
        if (p.dead && p.witherT > DAY_LEN * 0.6) {
          const z = env.zoneAt(p.x);
          if (env.fertility[z] != null) env.fertility[z] = Math.min(1.2, env.fertility[z] + 0.05);
          this.removePlant(p);
        }
      }
      env.waterPlants = wp;
      env.greenery = green;
    }
    this.evaporate(dt);

    // creatures
    const cs = this.creatures;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      if (!c) continue;
      c.px = c.x;
      c.py = c.y;
      c.pangle = c.angle;
      if (c.dead) {
        c.deadT += dt;
        if (c.deadT > 4.2) this.finishDeath(c);
        continue;
      }
      if (c.inWater && (c.def.habitat === 'water' || c.mode === 'swim')) {
        env.bioLoad += c.appetite * 2;
        if (c.def.grazer || c.stage === 'tadpole') env.grazers += 1;
      }
      const still = c.stage === 'egg' || c.stage === 'chrysalis';
      if (!still) tickBrain(c, this, dt);
      else if ((c.brain.think -= dt) <= 0) {
        c.brain.think = 2;
        c.T = env.tempAt(c.x, c.y, t);
        c.M = env.moistAt(c.x, c.y, t);
        c.inWater = t.waterAt(c.x, c.y);
      }
      c.move(this, dt);
      c.updateNeeds(this, dt);
      if (!c.dead) c.updateLife(this, dt);
      // animation
      c.anim += dt * (c.moving ? 1 : 0.4);
      if (c.landT > 0) c.landT -= dt;
      if (c.emoteT > 0) c.emoteT -= dt;
      if (c.tongue) {
        c.tongue.t -= dt;
        if (c.tongue.t <= 0) c.tongue = null;
      }
    }

    for (const col of this.colonies) col.update(this, dt);
    this.updateFireflies(dt);
    this.updateEquipment(dt);

    // bookkeeping
    const hour = env.hour;
    if (hour < this.lastHour) {
      this.stats.days++;
      this.events.emit('newDay', { day: env.day });
    }
    if (this.lastHour < 8 && hour >= 8) this.runFeeders();
    this.lastHour = hour;
    this.histT += dt;
    if (this.histT > 60) {
      this.histT = 0;
      const snap = { t: Math.round(this.time), c: {} };
      for (const k of Object.keys(this.counts)) if (this.counts[k]) snap.c[k] = this.counts[k];
      this.history.push(snap);
      if (this.history.length > 240) this.history.shift();
    }
  }

  finishDeath(c) {
    const t = this.terrain;
    if (c.cause !== 'eaten' && c.stage !== 'egg') {
      const onLand = !t.waterAt(c.x, c.y) && !t.isUnderground(c.x, c.y + 4) && c.mode !== 'fly';
      if (onLand && chance(c.size > 15 ? 0.6 : 0.2) && !this.plants.some((p) => Math.abs(p.x - c.x) < 12)) {
        const p = this.addPlant('forgetmenot', c.x, null, { growth: 0.2 });
        if (p) this.events.emit('memorial', { plant: p, c });
      }
      const z = this.env.zoneAt(c.x);
      if (this.env.fertility[z] != null) this.env.fertility[z] = Math.min(1.2, this.env.fertility[z] + c.size * 0.002);
    }
    this.removeCreature(c);
  }

  // Fireflies nudge their flash timing toward neighbours (Kuramoto coupling).
  updateFireflies(dt) {
    const night = this.env.sun < 0.45;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const c of this.creatures) {
      if (c.sp !== 'firefly' || c.dead || !c.isAdult) continue;
      c.glow = Math.max(0, c.glow - dt * 3.2);
      if (!night || c.pose === 'sleep') continue;
      let coupling = 0;
      const near = this.hashC.query(c.x, c.y, 260, (o) => o !== c && o.sp === 'firefly' && !o.dead);
      for (const o of near) coupling += Math.sin((o.phase - c.phase) * Math.PI * 2);
      if (near.length) coupling /= near.length;
      c.phase += dt * (c.freq / 2.2 + coupling * 0.32);
      if (c.phase >= 1) {
        c.phase -= 1;
        c.glow = 1;
      }
      n++;
      sx += Math.cos(c.phase * Math.PI * 2);
      sy += Math.sin(c.phase * Math.PI * 2);
    }
    this.fireflySync = n >= 3 ? Math.hypot(sx, sy) / n : 0;
    if (this.fireflySync > 0.93 && this.syncDay !== this.env.day) {
      this.syncDay = this.env.day;
      this.events.emit('fireflySync', { n });
    }
  }

  updateEquipment(dt) {
    const env = this.env;
    // filter & bubblers aerate
    let bub = env.filterFlow;
    for (const d of this.decor) {
      if (d.def.oxygen) {
        env.pond.oxygen = Math.min(1.15, env.pond.oxygen + d.def.oxygen * 0.004 * dt);
        bub += d.def.oxygen;
      }
      if (this.fx && d.def.bubbles && chance(dt * d.def.bubbles * 3)) this.fx.bubble(d.x + rrange(-4, 4), d.y - (d.type === 'chest' ? 18 : d.type === 'diver' ? 30 : 6));
    }
    if (this.fx && env.filterFlow > 0 && chance(dt * env.filterFlow * 8)) {
      this.fx.bubble(1036 + rrange(-4, 4), this.terrain.waterLevel + 30 + rrange(0, 40));
    }
    // misters make it rain
    if (this.fx) {
      for (const z of ['desert', 'jungle']) {
        const m = env.misting(z);
        if (m > 0.02) this.fx.rain(MISTER_X[z], m, dt, this.terrain);
      }
      // a humid jungle breathes out wisps of ground mist
      const hum = env.jungle.moist;
      if (hum > 0.55 && chance(dt * (hum - 0.55) * 3)) {
        const x = rrange(ZONE_X.jungle[0] + 20, W - 20);
        this.fx.mist(x, this.terrain.surfaceY(x) - rrange(4, 16));
      }
    }
  }

  runFeeders() {
    for (const d of this.decor) {
      if (!d.def.feeder) continue;
      const z = this.env.zoneAt(d.x);
      const types = z === 'desert' ? ['seedmix', 'apple'] : z === 'pond' ? ['flakes', 'pellets', 'algae'] : ['apple', 'lettuce', 'honey', 'leaves'];
      for (const ty of types) this.addFood(ty, d.x + rrange(-14, 14), 34, { vy: 20 });
      this.events.emit('feeder', { d });
    }
  }

  // ------------------------------------------------------------------ save / load
  serialize() {
    return {
      seed: this.seed,
      terrain: this.terrain.serialize(),
      env: this.env.serialize(),
      creatures: this.creatures.filter((c) => !c.dead).map((c) => c.serialize()),
      plants: this.plants.map((p) => Object.assign(p.serialize(), { id: p.id })),
      foods: this.foods.map((f) => f.serialize()),
      decor: this.decor.map((d) => d.serialize()),
      colonies: this.colonies.map((c) => c.serialize()),
      style: this.style,
      stats: this.stats,
      history: this.history,
      log: this.log.slice(0, 60),
    };
  }

  load(d) {
    this.seed = d.seed;
    this.terrain.load(d.terrain);
    this.env.load(d.env);
    if (!d.env.pond || d.env.pond.full == null) this.env.pond.full = this.terrain.waterLevel;
    this.style = Object.assign(this.style, d.style || {});
    this.stats = Object.assign(this.stats, d.stats || {});
    this.history = d.history || [];
    this.log = d.log || [];
    this.lastHour = this.env.hour;
    for (const pd of d.plants || []) {
      const p = Plant.load(pd);
      p.id = pd.id || nextId();
      setNextId(p.id + 1);
      p.waterY = this.terrain.waterLevel;
      p.rebuild();
      this.plants.push(p);
    }
    for (const dd of d.decor || []) {
      const x = Decor.load(dd);
      setNextId(x.id + 1);
      this.decor.push(x);
    }
    for (const fd of d.foods || []) {
      const f = Food.load(fd);
      setNextId(f.id + 1);
      this.foods.push(f);
    }
    for (const cd of d.colonies || []) this.colonies.push(Colony.load(cd));
    for (const cd of d.creatures || []) {
      if (!SPECIES[cd.sp]) continue;
      const c = Creature.load(cd);
      if (c._climbRef) {
        const p = this.plants.find((pp) => pp.id === c._climbRef.p);
        const slot = p && p.shape.slots.find((s) => s.kind === c._climbRef.k && s.i === c._climbRef.i);
        if (p && slot) {
          c.climb = { plant: p, slot, t: 1, dir: 0 };
          if (c.mode !== 'still') {
            c.mode = 'climb';
            c.seek({ kind: 'plant', plant: p, slot });
          }
        } else if (c.mode === 'still' && c.stage !== 'egg') c.mode = 'walk';
      }
      if (c.sp === 'worm' && c.mode === 'burrow') {
        c.body = null;
        c.applyStage(true);
      }
      this.addCreature(c);
    }
    this.computeRegions();
  }
}

export { DAY_LEN };
