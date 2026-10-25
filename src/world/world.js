// The World owns every entity and runs the simulation step.
import { W, H, CELL, GW, GH, MAT, DAY_LEN, MAX_CREATURES, MAX_FOOD, MAX_PLANTS, MAX_DECOR, ZONE_X, ZONE_MID, ZONE_SCALE, TANK, X, parseTank } from '../config.js';
import { Terrain, POND_L, POND_R, NEST_CX } from './terrain.js';
import { Environment, LAMP_X, MISTER_X, MIST_HALF, FILTER_X } from './environment.js';
import { SpatialHash } from './spatial.js';
import { breeze } from './breeze.js';
import { Emitter } from '../util/events.js';
import { RNG, rrange, rint, chance, rpick } from '../util/rng.js';
import { clamp, clamp01, dist } from '../util/math.js';
import { Creature, nextId, setNextId } from '../entities/creature.js';
import { Plant } from '../entities/plant.js';
import { Food } from '../entities/food.js';
import { Decor } from '../entities/decor.js';
import { Good } from '../entities/good.js';
import { Visitor } from '../entities/visitor.js';
import { SPECIES, ANT_KINDS, antKindOf } from '../data/species.js';
import { PLANTS } from '../data/plants.js';
import { DECOR } from '../data/decor.js';
import { FOODS } from '../data/foods.js';
import { GOODS, GOOD_ORDER, PLAIN, SILK_OF, basketKey, splitKey } from '../data/goods.js';
import { tickBrain, force } from '../ai/brain.js';
import { varietyName } from '../art/creatures.js';
import { Colony } from '../ai/ants.js';
import { preyValue, suits } from '../ai/search.js';
import { zoneStatus, residents, favouriteFoods } from '../sim/care.js';
import { SPRINKLER_X } from '../data/market.js';
import { cleanName } from '../sim/keeper.js';
import { Vines } from './vines.js';

const MAX_GOODS = 40;
// Pollen loads it takes to fill a jar of honey, and how much a worm eats
// between castings.
const HONEY_POLLEN = 20;
const CASTING = 0.12;

export class World {
  constructor() {
    this.terrain = new Terrain();
    this.env = new Environment();
    this.events = new Emitter();
    this.creatures = [];
    this.plants = [];
    this.foods = [];
    this.decor = [];
    this.goods = [];
    // what the keeper has collected, ready to send to Busytown
    this.pantry = {};
    for (const id of GOOD_ORDER) this.pantry[id] = 0;
    // ...and what flavour each one is: good -> { 'clover': 2, 'clover+': 1 }
    // ('+' for a prize one). Always adds up to the pantry's totals.
    this.flavours = {};
    for (const id of GOOD_ORDER) this.flavours[id] = {};
    // Busytown coins in the keeper's purse, what's been bought at the Market
    // (ware id -> true) and treats bought to hand out (busy buns)
    this.coins = 0;
    this.perks = {};
    this.stock = { buns: 0 };
    this.colonies = [];
    this.vines = new Vines(); // the living vines hanging from the jungle's lid
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
    // who Busytown writes to: { name, kind: 'me' | 'town' } (see sim/keeper.js)
    this.keeper = null;
    this.stats = { born: 0, died: 0, dug: 0, eaten: 0, fed: 0, days: 0 };
    this.history = [];
    this.histT = 0;
    this.log = [];
    this.lastHour = this.env.hour;
    this.plantTick = 0;
    this.homeT = 99; // who-lives-where is refreshed every second
    this.moveLogT = -99;
    // The water as the swimmers know it: every patch of open water, which
    // body of water it belongs to and how deep in it, redrawn whenever the
    // water moves (so a newly dug channel or a flooded tunnel is somewhere
    // to go).
    this.waterMap = null;
    this.waterMapVer = -1;
    this.waterMapT = -99;
    // Where (and at what time of day) the keeper usually feeds the pond:
    // the fish learn it.
    this.feedMem = { x: ZONE_MID.pond, hours: new Array(24).fill(0) };
    this.keeperFeeding = false; // the Feed tool is out
    this.shareLogT = -99;
    this.seed = 1;
    // how loud the crickets' night chorus is (0..1): it lulls everyone to sleep
    this.chorus = 0;
    // which working buildings are in the tank (clinic, school, butterflies,
    // hamper), refreshed every second
    this.has = {};
    this.climateT = 0;
    this.barrelAcc = {}; // water the rain barrel has poured into each jug
    this.departures = []; // (render side) critters floating off to Busytown
    // visitors from the garden outside who are in the tank right now (see
    // sim/visitors.js), and the lasting good they've done: plants and
    // buildings they've given the keeper, and how many times the mole has
    // aired the jungle soil
    this.visitors = [];
    this.boons = { plants: {}, decor: {}, airy: 0 };
    // the critters' dressing-up box: outfit id -> true (see data/outfits.js)
    this.wardrobe = {};
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
    this.foundColony(rint(NEST_CX[0], NEST_CX[1]) + TANK.desert / CELL);
    // plants
    const plant = (type, x, growth = rrange(0.55, 0.95)) => this.addPlant(type, x, null, { growth });
    for (const [type, x] of [
      ['cactus', 120], ['cactus', 520], ['succulent', 400], ['marigold', 360], ['marigold', 470], ['drygrass', 30], ['drygrass', 210], ['drygrass', 540],
      ['reed', 588], ['reed', 1040], ['eelgrass', 720], ['eelgrass', 860], ['eelgrass', 960], ['lilypad', 790], ['lilypad', 930],
      ['palm', 1086], ['palm', 1556], ['monstera', 1160], ['monstera', 1452], ['bromeliad', 1236], ['bromeliad', 1512], ['bigleaf', 1272],
      ['fern', 1132], ['fern', 1300], ['fern', 1584], ['daisy', 1180], ['tulip', 1305], ['sunflower', 1400], ['clover', 1350], ['grass', 1340],
      ['strawberry', 1430], ['mushroom', 1580], ['mushroom', 1255],
    ]) plant(type, X(x) + rrange(-6, 6));
    // decor (a new farm earns its bee hotel, library and lamp post later)
    this.addDecor('sign', X(505));
    this.addDecor('flowerpot', X(430));
    this.addDecor('castle', X(880));
    this.addDecor('pipe', X(690));
    this.addDecor('log', X(1480));
    this.addDecor('mushroomHouse', X(1110));
    if (!farm) {
      this.addDecor('bubbler', X(960));
      this.addDecor('library', X(1200));
      this.addDecor('beeHouse', X(1370));
      this.addDecor('lampPost', X(1545));
    }
    this.vines.seed(this);
    // critters (alternating boys and girls, so every pair can raise a family)
    const add = (sp, x, y, opts) => this.spawn(sp, x, y, Object.assign({ stage: SPECIES[sp].adultStage, sex: this.balancedSex(sp) }, opts || {}));
    add('cricket', X(280));
    add('cricket', X(330));
    add('cricket', X(470));
    add('goldfish', X(760), 520);
    add('goldfish', X(800), 560);
    add('goldfish', X(840), 540);
    add('pondsnail', X(760), t.surfaceY(X(760)));
    add('pondsnail', X(930), t.surfaceY(X(930)));
    add('snail', X(1210));
    add('snail', X(1500));
    add('butterfly', X(1250), 300);
    add('butterfly', X(1420), 260);
    this.adopt('butterfly', X(1180), 420);
    if (!farm) {
      add('gecko', X(290));
      add('beetle', X(160));
      add('beetle', X(360));
      add('frog', X(700), 480, { stage: 'tadpole' });
      add('frog', X(900), 520, { stage: 'tadpole' });
      add('frog', X(980), 480, { stage: 'tadpole' });
      add('turtle', X(820), 600);
      add('shrimp', X(800), t.surfaceY(X(800)));
      add('shrimp', X(880), t.surfaceY(X(880)));
      add('shrimp', X(1000), t.surfaceY(X(1000)));
      add('ladybug', X(1150));
      add('ladybug', X(1300));
      add('ladybug', X(1450));
      add('bee', X(1350), 320);
      add('bee', X(1420), 300);
      add('worm', X(1200), 560);
      add('worm', X(1450), 640);
      add('firefly', X(1330));
      add('firefly', X(1390));
      add('firefly', X(1520));
      add('firefly', X(1180));
      add('pillbug', X(1470));
      add('pillbug', X(1490));
      add('pillbug', X(1260));
      add('grasshopper', X(1380));
      for (let i = 0; i < 6; i++) this.adopt('aphid', rrange(X(1100), X(1550)), 400);
      this.adopt('butterfly', X(1520), 420);
    }
    // a few snacks to start
    this.addFood(farm ? 'lettuce' : 'apple', X(1330), t.surfaceY(X(1330)), { state: 'rest' });
    this.addFood('seedmix', X(250), t.surfaceY(X(250)), { state: 'rest' });
    this.addFood('flakes', X(800), t.waterLevel + 1, { state: 'float', inWater: true });
    this.addLog(farm ? 'Welcome to your Bug Farm! Each corner has its first two kinds of critter. Check the clipboard to see what they need.' : 'Welcome to your Bug Farm! Everyone has just moved in.', 'star');
    // a welcome gift from the town, to spend at the Market
    this.coins = 20;
    this.addLog('Mayor Mossbottom sent 20 Busytown coins to welcome the farm to town.', 'coin');
  }

  foundColony(entranceCx, kind = 'garden') {
    const t = this.terrain;
    const nest = t.carveStarterNest(entranceCx);
    const id = this.colonies.length ? Math.max(...this.colonies.map((c) => c.id)) + 1 : 1;
    const col = new Colony(id, nest.entrance, nest.chamber);
    col.kind = kind;
    const kd = ANT_KINDS[antKindOf(kind)];
    col.palIdx = rpick(kd.pal);
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
  // A critter sets off to live with a neighbour in Busytown: a happy
  // wave, and up it floats under a balloon (the renderer draws it from
  // `departures`), out over the lid and away.
  sendOff(c, nb) {
    if (c.inside) this.leaveShelter(c);
    this.sparkle(c.x, c.y - 6, 10);
    this.addLog(`${c.name} the ${c.def.name.toLowerCase()} set off for Busytown to live with ${nb.name}. Bye bye, ${c.name}!`, 'heart');
    this.events.emit('sentOff', { c, nb });
    this.removeCreature(c);
    if (!this.awayMode) {
      c.emote('heart', 3);
      // (each neighbour sends a balloon of their own colour)
      const cols = ['#e2553f', '#4c8fd6', '#f0bf45', '#77b255', '#e57a8a', '#8d6cc0', '#f0913a'];
      let h = 0;
      for (const ch of nb.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      this.departures.push({ c, t: 0, x: c.x, y: c.y, col: cols[h % cols.length], wet: !!(c.inWater || c.mode === 'swim') });
    }
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
  // The builders have just opened up new ground (x0..x1): they leave a few
  // plants to get it started.
  newGround(b) {
    const plants = { desert: ['drygrass', 'cactus', 'drygrass', 'succulent'], pond: ['eelgrass', 'eelgrass', 'lilypad'], jungle: ['fern', 'grass', 'palm', 'fern', 'clover'] }[b.zone] || [];
    plants.forEach((type, i) => {
      const x = b.x0 + ((i + 0.5) / plants.length) * (b.x1 - b.x0) + rrange(-10, 10);
      this.addPlant(type, x, null, { growth: rrange(0.45, 0.8) });
    });
    this.sparkle((b.x0 + b.x1) / 2, this.terrain.surfaceY((b.x0 + b.x1) / 2) - 30, 18);
    this.addLog(`The builders made the ${b.zone} bigger, and planted a few things to get the new ${b.zone === 'pond' ? 'water' : 'ground'} started.`, 'star');
  }

  // How many of a species the tank has room for: more in a bigger zone.
  maxPop(sp) {
    const d = SPECIES[sp];
    return Math.round(d.maxPop * (ZONE_SCALE[d.zone] || 1));
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
    // anyone inside tumbles out, blinking
    for (const c of this.creatures) if (c.inside === d) this.leaveShelter(c);
  }

  // ------------------------------------------------------------------ goods
  addGood(type, x, y, opts = {}) {
    if (!GOODS[type] || this.goods.length >= MAX_GOODS) return null;
    const g = new Good(type, x, y, opts);
    this.goods.push(g);
    this.events.emit('good', { g, by: opts.by || null });
    return g;
  }
  removeGood(g) {
    if (g.gone) return;
    g.gone = true;
    const i = this.goods.indexOf(g);
    if (i >= 0) this.goods.splice(i, 1);
  }
  goodsOf(type) {
    let n = 0;
    for (const g of this.goods) if (g.type === type) n++;
    return n;
  }
  // The keeper (or the mail dragonfly) picks a good up and pops it in the
  // basket. A moonflower's seed head is worth two.
  collectGood(g, by) {
    if (!g || g.gone) return false;
    this.removeGood(g);
    this.stashGood(g.type, g.flav, g.prize, g.plant === 'moonflower' ? 2 : 1);
    this.stats.collected = (this.stats.collected || 0) + 1;
    if (g.prize) {
      const pz = this.stats.prizes || (this.stats.prizes = {});
      pz[g.type] = (pz[g.type] || 0) + 1;
    }
    this.sparkle(g.x, g.y - 4, 5);
    this.events.emit('collect', { g, type: g.type, by: by || null });
    return true;
  }
  // ---- the basket's flavours
  // The flavours of one good in the basket, squared up with its total
  // (an old save, or anything that set the total by itself): extra goods
  // are plain ones, and goods gone missing come off the plainest first.
  tallyFlavours(type) {
    const L = this.flavours[type] || (this.flavours[type] = {});
    let sum = 0;
    for (const k in L) {
      if (!(L[k] > 0)) delete L[k];
      else sum += L[k];
    }
    const tot = this.pantry[type] || 0;
    if (sum < tot) L[PLAIN[type]] = (L[PLAIN[type]] || 0) + tot - sum;
    else if (sum > tot) this.dropFlavours(L, sum - tot, null, false, null);
    return L;
  }
  stashGood(type, flav, prize, n = 1) {
    const L = this.tallyFlavours(type);
    const k = basketKey(flav || PLAIN[type], prize);
    L[k] = (L[k] || 0) + n;
    this.pantry[type] = (this.pantry[type] || 0) + n;
  }
  // How many of a good are in the basket: of one flavour (or any), and
  // prize ones only if `best`.
  basketHas(type, flav = null, best = false) {
    const L = this.tallyFlavours(type);
    let n = 0;
    for (const k in L) {
      const [f, pz] = splitKey(k);
      if ((!flav || f === flav) && (!best || pz)) n += L[k];
    }
    return n;
  }
  // Take n of a good out of the basket. Plain ones go first (prize ones
  // are saved for whoever asks for the best), the most plentiful flavour
  // first, and flavours someone else is waiting for (keep: flavour -> n)
  // last of all. Returns how many prize ones went, or -1 if there aren't
  // enough.
  takeGoods(type, n, flav = null, best = false, keep = null) {
    if (this.basketHas(type, flav, best) < n) return -1;
    const L = this.flavours[type];
    const pz = this.dropFlavours(L, n, flav, best, keep);
    this.pantry[type] -= n;
    return pz;
  }
  dropFlavours(L, n, flav, best, keep) {
    let prizes = 0;
    while (n > 0) {
      let bk = null;
      let bs = -Infinity;
      for (const k in L) {
        if (!(L[k] > 0)) continue;
        const [f, pz] = splitKey(k);
        if ((flav && f !== flav) || (best && !pz)) continue;
        const kept = keep && keep[f] ? Math.min(L[k], keep[f]) : 0;
        const s = L[k] - kept * 100 - (pz && !best ? 1000 : 0);
        if (s > bs) {
          bs = s;
          bk = k;
        }
      }
      if (!bk) break;
      L[bk]--;
      if (keep) {
        const f = splitKey(bk)[0];
        if (keep[f]) keep[f]--;
      }
      if (bk.endsWith('+')) prizes++;
      if (!L[bk]) delete L[bk];
      n--;
    }
    return prizes;
  }
  // Is the soil here rich (well composted), for prize seed heads?
  richSoil(x) {
    const z = this.env.zoneAt(x);
    if (z === 'pond') return this.env.pond.clarity > 0.85;
    return (this.env.fertility[z] || 0) >= (z === 'desert' ? 0.65 : 0.9);
  }
  collectAll() {
    let n = 0;
    for (const g of this.goods.slice()) if (this.collectGood(g)) n++;
    return n;
  }
  // Nobody collected it in time. Seeds sow themselves; compost melts into
  // the soil and feeds it; lilies and the rest simply fade.
  goodExpired(g) {
    this.removeGood(g);
    if (g.type === 'seeds') {
      const parent = this.plants.find((p) => p.id === g.src && !p.dead) || (PLANTS[g.plant] ? { def: PLANTS[g.plant], x: g.x } : null);
      if (parent) this.spawnSeedling(parent, 70);
    } else if (g.type === 'compost') {
      const z = this.env.zoneAt(g.x);
      if (this.env.fertility[z] != null) this.env.fertility[z] = Math.min(1.2, this.env.fertility[z] + 0.04);
    }
  }

  // A bee unloads its pollen at the bee hotel. Enough loads fill a jar of
  // honey, which waits beside the hotel; with two jars waiting the comb is
  // full until the keeper collects them.
  // The honey tastes of whichever flowers the pollen came from: mostly one
  // kind of flower and it's that flower's honey, a bit of everything and
  // it's wildflower honey. One flower's honey that the master pollinators
  // mostly made is a prize jar.
  depositPollen(c, hive) {
    const n = c.memory.pollen || 0;
    const from = c.memory.pf || {};
    c.memory.pollen = 0;
    c.memory.pf = {};
    if (!n) return;
    hive.store = (hive.store || 0) + n;
    const fl = hive.flav || (hive.flav = {});
    let tot = 0;
    for (const k in from) tot += from[k];
    for (const k in from) fl[k] = (fl[k] || 0) + (n * from[k]) / tot;
    if (!tot) fl.wild = (fl.wild || 0) + n;
    if (c.memory.master) hive.mp = (hive.mp || 0) + n;
    // some is put by to feed the young bees the hotel raises
    hive.brood = Math.min(12, (hive.brood || 0) + n * 0.5);
    while (hive.store >= HONEY_POLLEN) {
      const jars = this.goods.filter((g) => g.type === 'honey' && g.src === hive.id).length;
      if (jars >= 2) {
        this.scaleComb(hive, HONEY_POLLEN / hive.store);
        hive.store = HONEY_POLLEN;
        break;
      }
      const [flav, prize] = this.combFlavour(hive);
      this.scaleComb(hive, (hive.store - HONEY_POLLEN) / hive.store);
      hive.store -= HONEY_POLLEN;
      const side = this.goods.some((g) => g.type === 'honey' && g.src === hive.id && g.x < hive.x) ? 1 : -1;
      const x = hive.x + side * 12;
      const g = this.addGood('honey', x, this.terrain.surfaceY(x), { src: hive.id, by: c, flav, prize });
      if (!g) break;
      this.credit(c);
      this.events.emit('honey', { c, hive, g });
      this.addLog('The bees filled a jar of honey at the bee hotel!', 'star');
      this.sparkle(hive.x, hive.y - 34, 8);
    }
  }
  honeyFill(hive) {
    return Math.min(1, (hive.store || 0) / HONEY_POLLEN);
  }
  // What the honey in the comb tastes of so far: [flavour, prize, shares]
  // (shares: [[flavour, fraction], ...], biggest first).
  combFlavour(hive) {
    const fl = hive.flav || {};
    let tot = 0;
    for (const k in fl) tot += fl[k];
    const shares = Object.entries(fl).map(([k, v]) => [k, tot ? v / tot : 0]).filter((e) => e[1] > 0.04).sort((a, b) => b[1] - a[1]);
    const top = shares[0];
    const flav = top && top[0] !== 'wild' && top[1] >= 0.5 ? top[0] : 'wild';
    // a prize jar: one flower's honey, made mostly by master pollinators
    const prize = flav !== 'wild' && tot > 0 && (hive.mp || 0) / tot >= 0.5;
    return [flav, prize, shares];
  }
  scaleComb(hive, k) {
    k = clamp01(k);
    for (const f in hive.flav || {}) hive.flav[f] *= k;
    if (hive.mp) hive.mp *= k;
  }

  // Recyclers at work: a ball of compost a beetle buried, or a little heap
  // of worm castings. Either way the soil gets richer.
  makeCompost(c, x, y, look) {
    const z = this.env.zoneAt(x);
    if (this.env.fertility[z] != null) this.env.fertility[z] = Math.min(1.2, this.env.fertility[z] + 0.03);
    this.credit(c);
    const crowded = this.goods.some((g) => g.type === 'compost' && Math.abs(g.x - x) < 14) || this.goodsOf('compost') >= 6;
    const flav = look === 'castings' ? 'castings' : 'compost';
    // (a master recycler's work is often prize compost)
    const g = crowded ? null : this.addGood('compost', x, y, { look, by: c, flav, prize: !!(c && c.memory.master) && chance(0.4) });
    this.events.emit('compost', { c, g });
    return g;
  }
  // Worms eat their way through the soil and leave castings at the surface.
  wormWork(c, amt) {
    const m = c.memory;
    m.cast = (m.cast || 0) + amt;
    if (m.cast < CASTING) return;
    m.cast = 0;
    const t = this.terrain;
    const sy = t.surfaceY(c.x);
    if (t.waterSurfaceAt(c.x) > 0 && t.waterAt(c.x, sy - 2)) return; // under the pond
    this.makeCompost(c, c.x, sy, 'castings');
  }

  // A pollinated flower has ripened. Now and then it keeps a seed head the
  // keeper can pick (one waiting per plant); otherwise it sows itself.
  ripenSeeds(p, fi, range) {
    const slot = p.shape.slots.find((s) => s.kind === 'flower' && s.i === fi);
    if (!slot || p.def.memorial || !chance(0.35) || this.goodsOf('seeds') >= 5 || this.goods.some((g) => g.type === 'seeds' && g.src === p.id)) {
      this.spawnSeedling(p, range);
      return;
    }
    const [x, y] = p.slotWorld(slot, this.time);
    // a healthy, comfy plant in rich soil sometimes grows prize seed heads
    const prize = p.health > 0.9 && p.comfort > 0.85 && this.richSoil(p.x) && chance(0.35);
    this.addGood('seeds', x, y, { src: p.id, plant: p.type, fi, flav: p.type, prize });
  }
  // How well the pond critters look after the water lilies (0..1): goldfish
  // feed them, and snails and shrimp keep the water clear enough to bloom.
  lilyCare() {
    const fish = Math.min(1, (this.count('goldfish') + this.count('koi') * 1.5 + this.count('tetra') * 0.4 + this.count('guppy') * 0.3) / 3);
    const clean = Math.min(1, (this.count('pondsnail') + this.count('shrimp')) / 3);
    return (0.2 + fish * 0.8) * (0.45 + clean * 0.55) * clamp01((this.env.pond.clarity - 0.35) / 0.4);
  }
  // The colour a water lily blooms: the water decides. Cool water gives
  // white lilies, mild water pink and warm water golden; very clear water
  // with a school of neon tetras now and then gives a rare blue star. A
  // lotus always gives lotus blooms.
  lilyColour(p) {
    if (p && p.def.lotus) return 'lotus';
    const pond = this.env.pond;
    if (pond.clarity > 0.85 && this.count('tetra') >= 3 && chance(0.3)) return 'blue';
    return pond.temp < 20 ? 'white' : pond.temp < 24.5 ? 'pink' : 'gold';
  }
  bloomLily(p, fi) {
    if (this.goods.some((g) => g.type === 'lily' && g.src === p.id)) return false;
    const slot = p.shape.slots.find((s) => s.kind === 'flower' && s.i === fi);
    const [x] = slot ? p.slotWorld(slot, this.time) : [p.x];
    // the pond critters at their best (crystal water, lilies well tended)
    // grow prize blooms
    const prize = this.env.pond.clarity > 0.9 && this.lilyCare() > 0.75;
    const g = this.addGood('lily', x, this.terrain.waterLevel - 1, { src: p.id, flav: this.lilyColour(p), prize });
    if (g) this.events.emit('bloom', { plant: p, g });
    return !!g;
  }
  // Big leafy plants shed an old leaf now and then: work for the recyclers.
  dropLitter(p) {
    let n = 0;
    for (const f of this.foods) if (f.type === 'leaves' && f.litter) n++;
    if (n >= 6) return;
    const t = this.terrain;
    const x = clamp(p.x + rrange(-1, 1) * (8 + p.def.h * 0.25), 10, W - 10);
    const sy = t.surfaceY(x);
    if (t.waterSurfaceAt(x) > 0 && t.waterAt(x, sy - 2)) return;
    const f = this.addFood('leaves', x, Math.max(20, p.y - p.def.h * p.growth * 0.6), { amount: 0.6, max: 0.6, vy: 10 });
    f.litter = true;
  }
  // Count a job well done for the critter that did it.
  credit(c) {
    if (c) c.memory.made = (c.memory.made || 0) + 1;
  }

  // The mail dragonfly (from the Market): there's always exactly one while
  // the farm has bought it.
  ensureCourier() {
    let c = this.creatures.find((k) => k.role === 'courier' && !k.dead);
    if (c || !this.owns('courier')) return c || null;
    const x = ZONE_MID.pond + rrange(-80, 80);
    c = new Creature('dragonfly', x, 90, { stage: 'adult', role: 'courier', palIdx: 4, acc: 'post', name: 'Dash', sex: 'm', lifespan: DAY_LEN * 9999 });
    c.mode = 'fly';
    c.hunger = 0.1;
    if (!this.addCreature(c)) return null;
    this.sparkle(x, 90, 10);
    this.addLog('Dash the mail dragonfly reported for duty!', 'star');
    return c;
  }

  // Busytown coins into the purse: from an order, the farm stand, a koi's
  // lucky find or a critter's dream come true. why: a few words for the log.
  earn(n, why, x, y) {
    n = Math.round(n);
    if (!(n > 0)) return 0;
    this.coins += n;
    this.stats.earned = (this.stats.earned || 0) + n;
    if (x != null) this.sparkle(x, y, 4);
    this.events.emit('coins', { n, why: why || '', x, y });
    return n;
  }
  spend(n) {
    if (this.coins < n) return false;
    this.coins -= n;
    return true;
  }
  owns(id) {
    return !!this.perks[id];
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
    for (const d of this.decor) if (d.def.shelter && !d.wet && d.covers(x, y)) return d;
    return null;
  }

  // ------------------------------------------------------------------ homes
  // How fast a critter gets through its job: double-time after a busy bun,
  // a quarter quicker once its dream has come true (it's a master now), and
  // a fifth quicker for bookworms living in the little library.
  workRate(c) {
    let r = c.busyT > 0 ? 2 : 1;
    if (c.memory.master) r *= 1.25;
    if (c.memory.home) {
      const h = this.homeOf(c);
      if (h && h.type === 'library') r *= 1.2;
    }
    return r;
  }
  homeOf(c) {
    const id = c.memory.home;
    if (!id) return null;
    for (const d of this.decor) if (d.id === id) return d;
    return null;
  }
  // A critter settles into a shelter. If it has no home yet and there's a
  // spare bed, this is home now.
  moveIn(c, d) {
    // (nobody lives at the clinic: they get well and go home)
    if (c.memory.home || d.def.clinic || !suits(c, d) || d.residents.length >= (d.def.cap || 3)) return false;
    c.memory.home = d.id;
    d.residents.push(c);
    this.events.emit('moveIn', { c, d });
    // (a full tank settling in at once would flood the logbook)
    if (this.time - this.moveLogT > 40 && !this.awayMode) {
      this.moveLogT = this.time;
      this.addLog(`${c.name} the ${c.def.name.toLowerCase()} made a home in the ${d.def.name.toLowerCase()}.`, 'house');
    }
    return true;
  }
  // Out of the door: its house was moved or taken away, or it was dragged
  // off by something more pressing.
  leaveShelter(c) {
    if (!c.inside) return;
    const b = c.brain.b;
    c.brain.b = null;
    if (b && b.stop) b.stop(c, this);
    c.inside = null;
    c.hidden = false;
    c.peek = 0;
    c.doorT = 1;
    c.brain.think = 0;
  }
  // Who lives where, kept fresh from the critters' own memories (so it
  // survives saving and loading, and the sand shifting under a castle).
  updateHomes() {
    const t = this.terrain;
    this.has = {};
    for (const d of this.decor) {
      if (d.def.clinic) this.has.clinic = true;
      if (d.def.school) this.has.school = true;
      if (d.def.butterflies) this.has.butterflies = true;
    }
    for (const d of this.decor) {
      if (!d.def.shelter) continue;
      d.residents.length = 0;
      d.wet = t.waterAt(d.x, d.y - 4);
    }
    for (const c of this.creatures) {
      if (c.dead) continue;
      const d = c.inside;
      if (d && (d.removed || !suits(c, d) || Math.abs(c.x - d.doorX) > 30 || Math.abs(c.y - d.doorY) > 40)) this.leaveShelter(c);
      if (!c.memory.home) continue;
      const h = this.homeOf(c);
      if (!h || !suits(c, h) || h.residents.length >= (h.def.cap || 3)) c.memory.home = 0;
      else h.residents.push(c);
    }
  }
  // A windmill pumps a trickle of water into its corner of the tank.
  rainBoost(z) {
    let n = 0;
    for (const d of this.decor) if (d.type === 'windmill' && this.env.zoneAt(d.x) === z) n++;
    return Math.min(2, n) * 0.04;
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
  // Something new to look at. kind: 'thing' (food, a plant, a decoration,
  // a newcomer), 'dig' / 'fill' (the ground changed shape) or 'water' (new
  // water appeared somewhere). Changes to the tank itself stay interesting
  // for longer.
  addNovelty(x, y, strength = 1, kind = 'thing') {
    const life = kind === 'thing' ? 25 : 90;
    this.novelty.push({ x, y, t: this.time, strength, kind, life, seen: 0 });
    if (this.novelty.length > 16) this.novelty.shift();
  }
  noveltyNear(c, kinds) {
    let best = null;
    for (const n of this.novelty) {
      const age = this.time - n.t;
      if (age > n.life || (n.seen || 0) > 4 || (kinds && !kinds.includes(n.kind))) continue;
      const d = Math.hypot(n.x - c.x, n.y - c.y);
      // (the tank changing shape is worth a longer walk than a new snack)
      if (d > c.def.sight * (n.kind === 'thing' ? 1.5 : 3) || d < 10) continue;
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, strength: n.strength * (1 - age / n.life), ref: n };
    }
    if (best) best.ref.seen = best.ref.seen || 0;
    return best ? Object.assign(best.ref, { strength: best.strength }) : null;
  }
  // The ground changed shape here (the keeper's spade or brush): note it so
  // critters come and see, merging strokes made close together.
  noteChange(x, y, r, kind) {
    for (const n of this.novelty) {
      if (n.kind === kind && Math.abs(n.x - x) < 60 && Math.abs(n.y - y) < 60 && this.time - n.t < 8) {
        n.t = this.time;
        n.x += (x - n.x) * 0.2;
        n.y += (y - n.y) * 0.2;
        if (r >= (n.r || 0)) {
          n.r = r;
          n.bx = x;
          n.by = y;
        }
        n.seen = 0;
        return n;
      }
    }
    this.addNovelty(x, y, 1, kind);
    const n = this.novelty[this.novelty.length - 1];
    n.r = r;
    n.bx = x;
    n.by = y;
    return n;
  }

  // ------------------------------------------------------------------ the water, as swimmers know it
  // Sample every other cell of open water, label each separate body of
  // water, and note how deep in its column each sample is (0 at the top of
  // the water, 1 at the bottom). Any patch that has newly filled with water
  // is noted as something to explore.
  buildWaterMap() {
    const t = this.terrain;
    const N = GW * GH;
    const prev = this.waterMap;
    // (two label grids take turns, so the last one is there to compare with;
    // the rest is reused, to spare the garbage collector while water flows)
    const bufs = this.waterBufs || (this.waterBufs = { a: new Int16Array(N), b: new Int16Array(N), queue: new Int32Array(N), dep: new Float32Array(N) });
    const comp = prev && prev.comp === bufs.a ? bufs.b : bufs.a;
    comp.fill(-1);
    const queue = bufs.queue;
    let nComp = 0;
    for (let i = 0; i < N; i++) {
      if (t.water[i] !== 1 || comp[i] >= 0) continue;
      let qh = 0;
      let qt = 0;
      queue[qt++] = i;
      comp[i] = nComp;
      while (qh < qt) {
        const k = queue[qh++];
        const cx = k % GW;
        const cy = (k / GW) | 0;
        if (cx > 0 && t.water[k - 1] === 1 && comp[k - 1] < 0) (comp[k - 1] = nComp), (queue[qt++] = k - 1);
        if (cx < GW - 1 && t.water[k + 1] === 1 && comp[k + 1] < 0) (comp[k + 1] = nComp), (queue[qt++] = k + 1);
        if (cy > 0 && t.water[k - GW] === 1 && comp[k - GW] < 0) (comp[k - GW] = nComp), (queue[qt++] = k - GW);
        if (cy < GH - 1 && t.water[k + GW] === 1 && comp[k + GW] < 0) (comp[k + GW] = nComp), (queue[qt++] = k + GW);
      }
      nComp++;
    }
    const spots = [];
    for (let c = 0; c < nComp; c++) spots.push([]);
    const dep = bufs.dep;
    for (let cx = 0; cx < GW; cx++) {
      let cy = 0;
      while (cy < GH) {
        if (t.water[cy * GW + cx] !== 1) {
          cy++;
          continue;
        }
        let b = cy;
        while (b + 1 < GH && t.water[(b + 1) * GW + cx] === 1) b++;
        const n = b - cy + 1;
        for (let y = cy; y <= b; y++) {
          const k = y * GW + cx;
          dep[k] = n > 1 ? (y - cy) / (n - 1) : 0.5;
          if (((cx | y) & 1) === 0) spots[comp[k]].push(k);
        }
        cy = b + 1;
      }
    }
    // newly flooded patches are worth a look
    if (prev) {
      const sum = new Float64Array(nComp * 3);
      for (let i = 0; i < N; i += 2) {
        if (comp[i] < 0 || prev.comp[i] >= 0) continue;
        const c = comp[i] * 3;
        sum[c] += i % GW;
        sum[c + 1] += (i / GW) | 0;
        sum[c + 2]++;
      }
      for (let c = 0; c < nComp; c++) {
        if (sum[c * 3 + 2] < 20) continue;
        const x = (sum[c * 3] / sum[c * 3 + 2]) * CELL;
        const y = (sum[c * 3 + 1] / sum[c * 3 + 2]) * CELL;
        if (t.waterAt(x, y)) this.addNovelty(x, y, 1, 'water');
      }
    }
    this.waterMap = { comp, spots, dep, nComp };
    this.waterMapVer = t.waterVersion;
    this.waterMapT = this.time;
  }
  // Which body of water this point is in (-1 if it's dry).
  waterBody(x, y) {
    const m = this.waterMap;
    if (!m) return -1;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return -1;
    return m.comp[cy * GW + cx];
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
      if (f.def.busy && !(c.busyT > 0)) {
        // a busy bun: double-time for half a day
        c.busyT = DAY_LEN * 0.5;
        c.emote('star', 1.6);
        this.events.emit('busy', { c });
      }
    } else if (tgt.kind === 'plant') {
      const p = tgt.plant;
      const tag = p.slotFood(tgt.slot);
      if (!tag) return false;
      like = c.diet[tag] || (tag === 'grass' ? c.diet.leaf || 0 : 0);
      amt = bite;
      p.eatSlot(tgt.slot, amt / Math.max(0.3, p.def.h > 60 ? 1.2 : 0.6));
      this.events.emit('eatPlant', { c, plant: p, tag });
      // a grasshopper mowing the grass drops clippings: work for the recyclers
      if (c.sp === 'grasshopper' && (tag === 'grass' || tag === 'leaf') && chance(0.1)) this.dropLitter(p);
    } else if (tgt.kind === 'algae') {
      like = c.diet.algae || 0;
      amt = bite * Math.min(1, this.env.pond.algae * 3);
      this.env.pond.algae = Math.max(0.01, this.env.pond.algae - amt * 0.02);
    } else if (tgt.kind === 'soil') {
      like = c.diet.soil || 0.3;
      amt = bite * 0.6;
    } else return false;
    if (c.sp === 'worm') this.wormWork(c, amt * this.workRate(c));
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
    const room = this.maxPop(a.sp) - this.count(a.sp);
    let n = Math.min(rint(br.clutch[0], br.clutch[1]), room);
    if (n <= 0) return;
    const t = this.terrain;
    const firstStage = def.stages[0].id;
    const kids = [];
    const mk = (x, y, stage, extra) => {
      // babies take after a parent (but nobody is born in the postman's uniform)
      let palIdx = chance(0.5) ? a.palIdx : (b || a).palIdx;
      if (def.specialPals && def.specialPals.includes(palIdx)) palIdx = null;
      const c = new Creature(a.sp, x, y, Object.assign({ stage, palIdx }, extra || {}));
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
          // (a dragonfly dips down to lay hers in the pond)
          const ax = mother.inWater ? mother.x : LAMP_X.pond + rrange(-120, 120);
          for (let i = 0; i < n; i++) {
            const p = this.randomWaterPoint(ax, 60, true) || this.randomWaterPoint(ZONE_MID.pond, (ZONE_X.pond[1] - ZONE_X.pond[0]) * 0.4, true);
            if (!p) break;
            const c = mk(p[0], p[1], firstStage);
            c.mode = 'still';
          }
        }
        break;
      }
      case 'plant':
      case 'leaf': {
        const near = [];
        // butterflies lay in the butterfly house's garden when there is one
        const house = a.sp === 'butterfly' ? this.decor.find((d) => d.def.butterflies && Math.abs(d.x - mother.x) < 500) : null;
        const cx = house ? house.x : mother.x;
        if (house) n = Math.min(n + 1, room);
        for (const p of this.plants) {
          if (p.dead || p.def.aquatic || Math.abs(p.x - cx) > (house ? 200 : 260)) continue;
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
    if (c.larva && !c.memory.readyToPupate && c.stageAge < c.stageDur * 1.3) return;
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
      for (let k = 0; k < extra && this.count(c.sp) < this.maxPop(c.sp); k++) {
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
    } else if (c.pupa) {
      c.mode = 'still';
      if (wasClimb) c.climb = { plant: wasClimb.plant, slot: wasClimb.slot, t: 1, dir: 0 };
      this.events.emit('pupate', { c });
      this.addLog(`${c.name} the caterpillar made a ${c.stage}.`, 'leaf');
    } else if (from === 'chrysalis' || from === 'cocoon') {
      c.climb = null;
      c.mode = 'fly';
      c.vy = -40;
      // the butterfly house raises rare butterflies
      if (c.sp === 'butterfly' && def.rarePals) {
        const house = this.decor.find((d) => d.def.butterflies && Math.abs(d.x - c.x) < 220);
        if (house && chance(0.45)) c.palIdx = rpick(def.rarePals);
      }
      this.sparkle(c.x, c.y, 10);
      // the empty chrysalis stays behind: fine silk for the keeper, with
      // the sheen of whoever spun it (and a prize one from a caterpillar
      // that grew up well fed and healthy)
      const silk = SILK_OF[c.sp + ':' + c.palIdx] || PLAIN.silk;
      this.addGood('silk', c.x, c.y + 2, { by: c, flav: silk, prize: c.health > 0.85 && c.plump >= 1.04 });
      this.credit(c);
      this.events.emit('metamorph', { c, kind: c.sp });
      const v = varietyName(c.sp, c.palIdx);
      const rare = def.rarePals && def.rarePals.includes(c.palIdx);
      this.addLog(`${c.name} came out of the ${from} as a ${rare ? 'rare ' : ''}${(v || def.name).toLowerCase()}, and left its silk behind!`, 'star');
      if (rare) this.events.emit('rare', { c });
    } else if (c.sp === 'dragonfly' && c.stage === 'adult') {
      // the nymph climbs out of the pond, splits its skin and flies
      const x = c.x;
      const wl = t.waterSurfY(x);
      c.y = Math.min(c.y, wl - 10);
      c.mode = 'fly';
      c.vy = -50;
      this.splash(x, wl, 0.5);
      this.sparkle(x, wl - 12, 8);
      this.events.emit('metamorph', { c, kind: 'dragonfly' });
      this.addLog(`${c.name} the nymph climbed out of the pond and flew off as a dragonfly!`, 'star');
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
    if (this.count('fruitfly') >= this.maxPop('fruitfly') || this.creatures.length >= MAX_CREATURES - 10) return;
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
        const them = def.id === 'reed' ? 'Cattails' : `${def.name}es`;
        if (wetSurface) return { ok: false, msg: `${them} like the muddy edge of the pond.` };
        const sh = this.shores.some((s) => Math.abs(s - x) < 90);
        return sh ? { ok: true } : { ok: false, msg: `${them} grow right beside the pond.` };
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
    // the keeper drops it for whoever nearby is hungriest for it, and it
    // falls (or sinks) right by them
    const aim = this.hungryFor(f, x, y);
    if (aim) {
      f.aim = aim;
      aim.memory.tip = { food: f, t: this.time };
      aim.brain.think = Math.min(aim.brain.think, 0.2);
    }
    if (x > ZONE_X.pond[0] && x < ZONE_X.pond[1]) {
      // the fish remember where and when the food comes
      const fm = this.feedMem;
      fm.x += (x - fm.x) * 0.3;
      fm.hours[Math.floor(this.env.hour) % 24] += 0.35;
    }
    this.events.emit('feed', { food: f });
    return f;
  }
  // The critter near this spot that would most like this food right now
  // (and that the food can reach by falling or sinking).
  hungryFor(f, x, y) {
    const t = this.terrain;
    let best = null;
    let bs = 0;
    for (const c of this.creatures) {
      // (someone tucked up indoors counts: it lands by their door, and the
      // smell brings them out)
      if (c.dead || (c.hidden && !c.inside) || c.stage === 'egg' || c.pupa || c.hunger < 0.3 || c.sp === 'ant') continue;
      const dx = Math.abs(c.x - x);
      if (dx > 160 || c.y < y - 40) continue;
      if (c.mode === 'burrow' || (c.mode !== 'swim' && c.mode !== 'glass' && t.isUnderground(c.x, c.y + 2))) continue;
      let like = 0;
      for (const tg of f.tags) like = Math.max(like, c.diet[tg] || 0);
      if (like < 0.4) continue;
      // land critters can't get at food in the pond and vice versa
      const wetC = t.waterAt(c.x, c.y) || c.aquatic;
      const wetF = t.waterSurfaceAt(c.x) > 0 && t.waterAt(c.x, t.surfaceY(c.x) - 2);
      if (wetC !== wetF && !c.amphibious) continue;
      const s = (c.hunger * like) / (1 + dx / 70);
      if (s > bs) {
        bs = s;
        best = c;
      }
    }
    return best;
  }
  // Food has landed (or plopped into the pond): hungry critters within
  // smelling distance notice and come.
  foodArrived(f) {
    const t = this.terrain;
    const wet = t.waterAt(f.x, f.y + 1);
    const body = wet ? this.waterBody(f.x, f.y + 1) : -1;
    const near = this.hashC.query(f.x, f.y, 320);
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (c.dead || c.hunger < 0.35 || c.sp === 'ant' || c.stage === 'egg') continue;
      if (wet ? this.waterBody(c.x, c.y) !== body : t.waterAt(c.x, c.y) || this.regionOf(c.x) !== this.regionOf(f.x)) continue;
      const d = Math.hypot(c.x - f.x, c.y - f.y);
      if (d > c.def.sight * (wet ? 2.6 : 1.8)) continue;
      let like = 0;
      for (const tg of f.tags) like = Math.max(like, c.diet[tg] || 0);
      if (like < 0.3) continue;
      c.memory.tip = { food: f, t: this.time };
      c.brain.think = Math.min(c.brain.think, 0.1 + d / 400);
    }
  }
  // A critter has started eating: hungry friends of its own kind nearby
  // see and come to join in.
  tipOff(c, f) {
    const near = this.hashC.query(c.x, c.y, 220);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === c || o.dead || o.sp !== c.sp || o.hunger < 0.35 || o.hidden) continue;
      const b = o.brain.b;
      if (b && (b.id === 'forage' || b.id === 'rest' || b.id === 'flee')) continue;
      o.memory.tip = { food: f, t: this.time, by: c };
      o.brain.think = Math.min(o.brain.think, 0.3 + Math.random() * 0.5);
    }
  }
  // Break off a mouthful for a critter to carry (or take the whole thing,
  // if it's only a crumb).
  takePiece(f, c) {
    if (f.gone || f.amount <= 0.01) return null;
    const bite = clamp(c.size * 0.012, 0.06, 0.35);
    let piece = f;
    if (f.amount - bite > 0.04) {
      f.amount -= bite;
      this.nibbled(f, c);
      piece = this.addFood(f.type, f.x, f.y, { amount: bite, max: f.max, fresh: f.fresh, age: f.age, state: 'held', inWater: f.inWater, vx: 0 });
    }
    piece.state = 'held';
    piece.holder = c;
    piece.aim = null;
    piece.owner = 0;
    piece.giftFor = 0;
    return piece;
  }
  foodById(id) {
    if (!id) return null;
    for (const f of this.foods) if (f.id === id) return f;
    return null;
  }

  // The sex a newcomer should be so the tank's grown-ups pair up.
  balancedSex(sp) {
    let f = 0;
    let m = 0;
    for (const c of this.creatures) if (c.sp === sp && !c.dead) c.sex === 'f' ? f++ : m++;
    return f === m ? (Math.random() < 0.5 ? 'f' : 'm') : f < m ? 'f' : 'm';
  }

  // Somewhere in the desert for a new ant nest, well away from the others
  // (null if the desert is full). Prefers the spot the keeper tapped.
  nestSpot(x) {
    const lo = 14;
    const hi = Math.floor(ZONE_X.desert[1] / CELL) - 32;
    const others = this.colonies.map((k) => k.entrance.cx);
    let best = null;
    let bs = -1e9;
    for (let cx = lo; cx <= hi; cx += 2) {
      const gap = others.length ? Math.min(...others.map((o) => Math.abs(o - cx))) : 999;
      if (gap < 30) continue;
      const s = -Math.abs(cx * CELL - x) * 0.5 + Math.min(gap, 60);
      if (s > bs) {
        bs = s;
        best = cx;
      }
    }
    return best;
  }

  adopt(sp, x, y) {
    const t = this.terrain;
    // ant kinds: join a colony of that kind, or found one
    if (ANT_KINDS[sp]) {
      const kd = ANT_KINDS[sp];
      if (x > ZONE_X.desert[1] - 30) return { ok: false, msg: 'Ants like to dig in the sandy desert.' };
      if (this.count('ant') >= this.maxPop('ant') + 10) return { ok: false, msg: 'The desert is busy enough with ants!' };
      const col = this.colonies.find((k) => k.kind === kd.kind && this.byId(k.queenId) && !this.byId(k.queenId).dead);
      if (col) {
        for (let i = 0; i < 4; i++) {
          const a = this.spawnAnt(col, col.entrance.cx * CELL + rrange(-6, 6), (col.entrance.cy - 1) * CELL, 'worker');
          a.age = DAY_LEN * 0.5;
        }
        return { ok: true, msg: `Four new ${kd.label.toLowerCase()} joined the colony!` };
      }
      const cx = this.nestSpot(x);
      if (cx == null) return { ok: false, msg: 'There\'s no room in the desert for another ant nest.' };
      const nc = this.foundColony(cx, kd.kind);
      this.events.emit('adopt', { c: this.byId(nc.queenId) });
      this.addLog(`A new colony of ${kd.label.toLowerCase()} moved in with their queen!`, 'crown');
      return { ok: true, msg: `A new colony of ${kd.label.toLowerCase()}! Watch them dig.` };
    }
    const def = SPECIES[sp];
    if (this.count(sp) >= this.maxPop(sp)) return { ok: false, msg: `The tank has plenty of ${def.plural.toLowerCase()} already!` };
    if (this.creatures.length >= MAX_CREATURES - 4) return { ok: false, msg: 'The tank is full to bursting! Bertie the builder can make it bigger (the Market).' };
    const sy = t.surfaceY(x);
    const wet = t.waterSurfaceAt(x) > 0 && t.waterAt(x, sy - 2);
    let c = null;
    switch (sp) {
      case 'goldfish':
      case 'guppy':
      case 'tetra':
      case 'koi':
      case 'puffer':
      case 'pondsnail':
      case 'shrimp':
      case 'axolotl': {
        if (!wet) return { ok: false, msg: `${def.plural} need to live in the pond.` };
        const st = def.adultStage;
        const swims = def.fish;
        // little schooling fish come in a group
        const n = sp === 'tetra' ? 3 : sp === 'guppy' ? 2 : 1;
        for (let i = 0; i < n && this.count(sp) < this.maxPop(sp); i++) {
          const xx = x + (i ? rrange(-14, 14) : 0);
          const yy = swims ? clamp(y + (i ? rrange(-10, 10) : 0), t.waterLevel + 10, t.surfaceY(xx) - 10) : t.surfaceY(xx);
          c = this.spawn(sp, xx, yy, { stage: st, sex: this.balancedSex(sp) }) || c;
        }
        if (n > 1 && c) {
          c.emote('heart', 2);
          this.addNovelty(c.x, c.y, 1);
          this.events.emit('adopt', { c });
          this.addLog(`A little ${sp === 'tetra' ? 'school' : 'pair'} of ${def.plural.toLowerCase()} moved in!`, 'heart');
          return { ok: true, c, msg: `${n} ${def.plural.toLowerCase()} moved into the pond.` };
        }
        break;
      }
      case 'dragonfly': {
        if (!wet) return { ok: false, msg: 'Dragonfly nymphs live underwater. Tap the pond!' };
        for (let i = 0; i < 2 && this.count(sp) < this.maxPop(sp); i++) {
          const xx = clamp(x + rrange(-16, 16), 10, W - 10);
          c = this.spawn('dragonfly', xx, t.surfaceY(xx), { stage: 'nymph', sex: this.balancedSex('dragonfly') }) || c;
        }
        if (c) {
          this.events.emit('adopt', { c });
          this.addLog('Two dragonfly nymphs moved into the pond. One day they\'ll climb out and fly!', 'heart');
        }
        return { ok: !!c, c, msg: 'Dragonfly nymphs! They hunt along the bottom until they\'re ready to fly.' };
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
      case 'butterfly':
      case 'moth': {
        if (wet) return { ok: false, msg: 'Caterpillars would get soggy in the pond!' };
        c = this.spawn(sp, x, null, { stage: 'caterpillar', sex: this.balancedSex(sp) });
        const s = c && this.plants.find((p) => !p.dead && !p.def.aquatic && Math.abs(p.x - x) < 120 && p.shape.slots.some((k) => k.kind === 'leaf'));
        if (s) {
          const slot = s.shape.slots.find((k) => k.kind === 'leaf');
          c.climb = { plant: s, slot, t: 1, dir: 0 };
          c.mode = 'climb';
          c.seek({ kind: 'plant', plant: s, slot });
        }
        if (c) {
          c.hunger = 0.5;
          this.addLog(`${c.name} the ${sp === 'moth' ? 'moth ' : ''}caterpillar arrived. So hungry!`, 'leaf');
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
    if (!p) return { ok: false, msg: 'No room for more plants! Bertie the builder can make the tank bigger (the Market).' };
    this.addNovelty(p.x, p.y - 10, 0.8);
    this.events.emit('plant', { plant: p });
    return { ok: true, p };
  }

  placeDecor(type, x, y) {
    const v = this.canPlace('decor', type, x, y);
    if (!v.ok) return v;
    const d = this.addDecor(type, x, DECOR[type].place === 'top' ? 0 : null);
    if (!d) return { ok: false, msg: 'The tank is crowded with decorations! Bertie the builder can make it bigger (the Market).' };
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
      this.noteChange(x, mode === 'dig' ? y : Math.min(y, t.surfaceY(x)), r, mode === 'dig' ? 'dig' : 'fill');
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
    this.splash(ZONE_MID.pond - 10, this.terrain.waterLevel, 1.2);
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
    this.splash(FILTER_X, this.terrain.waterLevel, 0.6);
    this.events.emit('chore', { kind: 'rinse', zone: 'pond' });
  }
  topUpPond(byBarrel) {
    const t = this.terrain;
    const p = this.env.pond;
    p.evap = 0;
    // pour back up to the line, or as close as the banks allow
    this.pourToLevel(p.full);
    this.env.lowWater = 0;
    this.pour(ZONE_MID.pond, t.waterLevel);
    if (!byBarrel) this.events.emit('chore', { kind: 'topup', zone: 'pond' });
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
      if (c.dead || c.stage === 'egg' || c.pupa) continue;
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
    breeze.update(dt, this);
    this.vines.update(this, dt);
    this.chorus *= Math.exp(-dt / 40);
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
    if (t.waterVersion !== this.waterMapVer && this.time - this.waterMapT > 1.5) this.buildWaterMap();

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

    this.homeT += dt;
    if (this.homeT >= 1) {
      this.homeT = 0;
      this.updateHomes();
    }

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
      const still = c.stage === 'egg' || c.pupa;
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
      if (c.doorT > 0) c.doorT -= dt;
      if (c.emoteT > 0) c.emoteT -= dt;
      if (c.tongue) {
        c.tongue.t -= dt;
        if (c.tongue.t <= 0) c.tongue = null;
      }
    }

    for (const col of this.colonies) col.update(this, dt);
    for (let i = this.visitors.length - 1; i >= 0; i--) {
      const v = this.visitors[i];
      v.update(dt, this);
      if (v.state === 'gone') {
        this.visitors.splice(i, 1);
        v.removed = true;
        this.events.emit('visitorLeft', { v });
      }
    }
    for (let i = this.goods.length - 1; i >= 0; i--) {
      const g = this.goods[i];
      if (g) g.update(dt, this);
    }
    this.updateFireflies(dt);
    this.updateEquipment(dt);

    // bookkeeping
    const hour = env.hour;
    if (hour < this.lastHour) {
      this.stats.days++;
      for (let i = 0; i < 24; i++) this.feedMem.hours[i] *= 0.75;
      this.events.emit('newDay', { day: env.day });
    }
    if (this.lastHour < 8 && hour >= 8) this.runFeeders();
    if (this.lastHour < 18 && hour >= 18) this.runHampers();
    this.marketGadgets(dt);
    if (Math.floor(hour) !== Math.floor(this.lastHour) && this.owns('courier')) this.ensureCourier();
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
      // air stirred in where the filter's spout pours back into the pond
      this.fx.bubble(FILTER_X - 30 - rrange(0, 26), this.terrain.waterLevel + rrange(3, 14));
    }
    // misters make it rain
    if (this.fx) {
      for (const z of ['desert', 'jungle']) {
        const m = env.misting(z);
        if (m > 0.02) this.fx.rain(MISTER_X[z], m, dt, this.terrain, LAMP_X[z] - MISTER_X[z], MIST_HALF[z]);
      }
      // a humid jungle breathes out wisps of ground mist
      const hum = env.jungle.moist;
      if (hum > 0.55 && chance(dt * (hum - 0.55) * 3)) {
        const x = rrange(ZONE_X.jungle[0] + 20, W - 20);
        this.fx.mist(x, this.terrain.surfaceY(x) - rrange(4, 16));
      }
    }
  }

  // Gadgets from the Busytown Market that look after the tank by themselves.
  marketGadgets(dt) {
    const env = this.env;
    // the sprinklers give the plants a sprinkle every morning
    if (this.owns('sprinkler') && this.fx && env.hour > 6 && env.hour < 6.6) {
      for (const x of SPRINKLER_X) this.fx.rain(x, 0.25, dt, this.terrain);
    }
    // the rain barrel keeps the misters' jugs topped up, and the pond too
    if (this.owns('rainBarrel')) {
      for (const z of ['desert', 'jungle']) {
        const add = Math.min(1 - env[z].water, dt / (DAY_LEN * 0.35));
        env[z].water += add;
        // (a jugful from the barrel counts as the keeper's refill)
        this.barrelAcc[z] = (this.barrelAcc[z] || 0) + add;
        if (this.barrelAcc[z] >= 0.25) {
          this.barrelAcc[z] = 0;
          this.events.emit('chore', { kind: 'refill', zone: z, barrel: true });
        }
      }
      if (env.lowWater > 0.12) this.topUpPond(true);
    }
    // the clockwork climate keeper nudges every lamp, mister and the pond
    // heater toward what the residents like, every few seconds
    if (this.owns('climate')) {
      this.climateT -= dt;
      if (this.climateT <= 0) {
        this.climateT = 8;
        for (const z of ['desert', 'jungle']) {
          const st = zoneStatus(this, z);
          const e = env[z];
          if (st.tState === 'hot') e.lamp = Math.max(0, e.lamp - 0.05);
          else if (st.tState === 'cold') e.lamp = Math.min(1, e.lamp + 0.05);
          if (st.mState === 'dry') e.mister = Math.min(1, e.mister + 0.05);
          else if (st.mState === 'wet') e.mister = Math.max(0, e.mister - 0.05);
        }
        const st = zoneStatus(this, 'pond');
        const p = env.pond;
        const mid = (st.band.t[0] + st.band.t[1]) / 2;
        if (st.tState === 'cold') {
          p.heater = true;
          p.heaterTarget = Math.min(30, Math.max(p.heaterTarget, mid));
        } else if (st.tState === 'hot') {
          if (p.heater && p.heaterTarget > mid - 2) p.heaterTarget -= 1;
          else p.lamp = Math.max(0, p.lamp - 0.05);
        }
        if (st.water === 'air') p.filter = Math.min(1, p.filter + 0.1);
      }
    }
  }

  // Chef Crumble's picnic hamper: at breakfast and supper it drops just
  // enough of what its corner's residents like best.
  runHampers() {
    for (const d of this.decor) {
      if (!d.def.hamper) continue;
      const z = this.env.zoneAt(d.x);
      const who = residents(this, z).filter((c) => !c.def.colony || c.stage === 'queen');
      if (!who.length) continue;
      let want = 0;
      for (const c of who) want += c.appetite * Math.max(0, c.hunger - 0.05);
      // (an ant colony eats from its larder: a little extra for it)
      if (z === 'desert' && this.colonies.length) want += 0.4 * this.colonies.length;
      if (want < 0.05) continue;
      const foods = favouriteFoods([...new Set(who.map((c) => c.sp))], () => true, 3);
      if (!foods.length) continue;
      const each = Math.min(2, want / foods.length);
      foods.forEach((f, i) => {
        const x = clamp(d.x + (i - 1) * 16 + rrange(-4, 4), 12, W - 12);
        const food = this.addFood(f, x, 34, { vy: 20, amount: Math.min(FOODS[f].amount, each), max: Math.min(FOODS[f].amount, each) });
        if (food) this.stats.fed++;
      });
      this.events.emit('hamper', { d });
    }
  }

  runFeeders() {
    this.runHampers();
    for (const d of this.decor) {
      if (d.def.litter && this.foods.filter((f) => f.litter).length < 8) {
        // a leaf drifts off the leaf pile for the recyclers
        const f = this.addFood('leaves', clamp(d.x + rrange(-24, 24), 10, W - 10), d.y - 14, { amount: 0.6, max: 0.6, vy: 10 });
        f.litter = true;
      }
      if (!d.def.feeder) continue;
      const z = this.env.zoneAt(d.x);
      const types = z === 'desert' ? ['seedmix', 'apple'] : z === 'pond' ? ['flakes', 'pellets', 'algae'] : ['apple', 'lettuce', 'honey', 'leaves'];
      for (const ty of types) this.addFood(ty, d.x + rrange(-14, 14), 34, { vy: 20 });
      this.events.emit('feeder', { d });
    }
  }

  // ------------------------------------------------------------------ dressing up
  wardrobeHas(id) {
    return !!this.wardrobe[id];
  }
  wardrobeAdd(id) {
    this.wardrobe[id] = true;
  }
  // Put something on a critter (null: take it off). colour: for things
  // that come in any colour.
  dress(c, item, colour) {
    c.acc = item || null;
    c.accC = item && colour ? colour : null;
    if (item) {
      c.emote('heart', 1.6);
      this.sparkle(c.x, c.y - 6, 5);
    }
    this.events.emit('dress', { c, item });
  }

  // ------------------------------------------------------------------ visitors
  addVisitor(type) {
    const [x, y] = Visitor.entry(type, this);
    const v = new Visitor(type, x, y, { facing: x > W / 2 ? -1 : 1 });
    this.visitors.push(v);
    this.addNovelty(x, y - 10, 1);
    return v;
  }
  // How much faster the jungle plants grow in soil the mole has aired.
  soilBoost(zone) {
    return zone === 'jungle' && this.boons.airy ? 1 + 0.15 * Math.min(2, this.boons.airy) : 1;
  }
  // Somewhere to put a decoration in a zone, as near x as there's room.
  spotNear(type, zone, x) {
    const def = DECOR[type];
    const [x0, x1] = ZONE_X[zone];
    for (let i = 0; i < 40; i++) {
      const xx = Math.round(clamp(x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 18, x0 + 30, x1 - 30));
      if (this.decor.some((d) => Math.abs(d.x - xx) < (d.def.w + def.w) * 0.45)) continue;
      if (this.plants.some((p) => !p.dead && p.def.h > 40 && Math.abs(p.x - xx) < def.w * 0.4)) continue;
      if (this.canPlace('decor', type, xx, null).ok) return xx;
    }
    return null;
  }
  // A visitor builds something (and from then on the keeper can too).
  visitorBuild(type, zone, x) {
    const xx = this.spotNear(type, zone, x);
    if (xx == null) return null;
    const r = this.placeDecor(type, xx, null);
    if (!r.ok) return null;
    this.boons.decor[type] = true;
    this.sparkle(xx, r.d.y - 14, 12);
    this.dust(xx, r.d.y - 4, 6);
    return r.d;
  }
  // A visitor sows some plants near x (on open ground, or the pond for a
  // water plant), and from then on the keeper can plant them too.
  visitorSow(type, n, zone, x) {
    const def = PLANTS[type];
    const out = [];
    const [x0, x1] = ZONE_X[zone];
    for (let i = 0; i < 60 && out.length < n; i++) {
      const xx = clamp(x + rrange(-1, 1) * (40 + i * 6), x0 + 14, x1 - 14);
      if (this.plants.some((p) => !p.dead && Math.abs(p.x - xx) < (def.aquatic ? 34 : 16))) continue;
      if (!this.canPlace('plant', type, xx, null).ok) continue;
      const p = this.addPlant(type, xx, null, { growth: 0.45 });
      if (!p) break;
      this.sparkle(xx, p.y - 8, 6);
      this.events.emit('plant', { plant: p, by: 'visitor' });
      out.push(p);
    }
    if (out.length) this.boons.plants[type] = true;
    return out;
  }
  // The mole airs the jungle soil: a few winding tunnels with a chamber or
  // two, a molehill at each way in. Plants grow faster in airy soil, and
  // the worms and critters come to explore. (Well clear of the pond, so
  // no water drains away.)
  digTunnels(nearX) {
    const t = this.terrain;
    const [z0, z1] = ZONE_X.jungle;
    const lo = Math.max(z0 + 60, (POND_R + 24) * CELL);
    const hi = z1 - 30;
    if (hi - lo < 80) return 0;
    const ok = (x, y, m) => m === MAT.SOIL || m === MAT.SAND || m === MAT.CLAY;
    let dug = 0;
    const runs = 2;
    for (let k = 0; k < runs; k++) {
      let x = clamp(nearX + (k ? 1 : -1) * rrange(30, 110), lo + 20, hi - 20);
      // a way in, away from any plant
      for (let i = 0; i < 8 && this.plants.some((p) => !p.dead && Math.abs(p.x - x) < 14); i++) x = clamp(x + rrange(-40, 40), lo + 20, hi - 20);
      let cx = x / CELL;
      let cy = t.top[Math.floor(cx)];
      const surf = cy;
      const dir = chance(0.5) ? 1 : -1;
      const depth = rrange(12, 22);
      // down, then along, winding
      for (let s = 0; s < 70; s++) {
        const down = cy < surf + depth ? 0.7 : (Math.random() - 0.5) * 0.5;
        cx += dir * (s < 6 ? 0.3 : 0.85);
        cy += down;
        if (cx * CELL < lo || cx * CELL > hi) break;
        dug += t.dig(cx, cy, 1.15, ok);
        // a chamber partway along
        if (s === 34 || s === 62) for (let a = -2; a <= 2; a++) dug += t.dig(cx + a * 0.8, cy, 1.9, ok);
      }
      // the molehill at the way in
      for (let i = 0; i < 22; i++) t.deposit(Math.floor(x / CELL) + (i % 3) - 1, MAT.SOIL, 3);
      this.noteChange(x, surf * CELL + 20, 40, 'dig');
    }
    this.boons.airy = (this.boons.airy || 0) + 1;
    this.env.fertility.jungle = Math.min(1.2, (this.env.fertility.jungle || 0.6) + 0.15);
    this.computeRegions();
    return dug;
  }

  // ------------------------------------------------------------------ save / load
  serialize() {
    return {
      seed: this.seed,
      // how much bigger than the original the tank has been built (sim/tank.js)
      tank: { ...TANK },
      terrain: this.terrain.serialize(),
      env: this.env.serialize(),
      creatures: this.creatures.filter((c) => !c.dead).map((c) => c.serialize()),
      plants: this.plants.map((p) => Object.assign(p.serialize(), { id: p.id })),
      foods: this.foods.map((f) => f.serialize()),
      decor: this.decor.map((d) => d.serialize()),
      goods: this.goods.map((g) => g.serialize()),
      pantry: this.pantry,
      flavours: this.flavours,
      visitors: this.visitors.map((v) => v.serialize()),
      boons: this.boons,
      wardrobe: this.wardrobe,
      coins: this.coins,
      perks: this.perks,
      stock: this.stock,
      colonies: this.colonies.map((c) => c.serialize()),
      vines: this.vines.serialize(),
      style: this.style,
      keeper: this.keeper,
      stats: this.stats,
      history: this.history,
      log: this.log.slice(0, 60),
      feed: { x: Math.round(this.feedMem.x), h: this.feedMem.hours.map((v) => +v.toFixed(2)) },
    };
  }

  load(d) {
    const tank = parseTank(d.tank);
    if (Object.keys(tank).some((z) => tank[z] !== TANK[z])) throw new Error('This save is for a different size of tank.');
    this.seed = d.seed;
    this.terrain.load(d.terrain);
    this.env.load(d.env);
    if (!d.env.pond || d.env.pond.full == null) this.env.pond.full = this.terrain.waterLevel;
    this.style = Object.assign(this.style, d.style || {});
    const kn = cleanName(d.keeper && d.keeper.name);
    this.keeper = kn ? { name: kn, kind: d.keeper.kind === 'town' ? 'town' : 'me' } : null;
    this.stats = Object.assign(this.stats, d.stats || {});
    this.history = d.history || [];
    this.log = d.log || [];
    this.lastHour = this.env.hour;
    if (d.feed && d.feed.h && d.feed.h.length === 24) this.feedMem = { x: d.feed.x, hours: d.feed.h.slice() };
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
    for (const gd of d.goods || []) {
      if (!GOODS[gd.t]) continue;
      const g = Good.load(gd);
      setNextId(g.id + 1);
      this.goods.push(g);
    }
    Object.assign(this.pantry, d.pantry || {});
    this.visitors = (d.visitors || []).map((o) => Visitor.load(o)).filter(Boolean);
    this.boons = Object.assign({ plants: {}, decor: {}, airy: 0 }, d.boons || {});
    this.wardrobe = Object.assign({}, d.wardrobe || {});
    for (const id of GOOD_ORDER) {
      this.flavours[id] = Object.assign({}, (d.flavours && d.flavours[id]) || {});
      this.tallyFlavours(id);
    }
    // (a farm from before the Market opened gets the town's welcome gift)
    this.coins = d.coins != null ? d.coins : 20;
    this.perks = Object.assign({}, d.perks || {});
    Object.assign(this.stock, d.stock || {});
    for (const cd of d.colonies || []) this.colonies.push(Colony.load(cd));
    // (a tank from before the vines grew gets a fresh canopy)
    this.vines.load(d.vines, this);
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
      // an egg or baby a nurse was carrying goes back with the rest
      const col = cd.cb && this.colony(c.colonyId);
      if (col) col.brood.push({ stage: cd.cb.s, t: cd.cb.t || 0, x: c.x, y: Math.floor(c.y / CELL) * CELL + 1.5, a: 0 });
      this.addCreature(c);
    }
    this.computeRegions();
  }
}

export { DAY_LEN };
