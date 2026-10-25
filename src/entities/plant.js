// Plants grow, wilt, flower, get nibbled, get pollinated and spread seeds.
// Their geometry is procedural; leaves/flowers are "slots" creatures can
// climb to, perch on and eat.
import { PLANTS } from '../data/plants.js';
import { DAY_LEN } from '../config.js';
import { breeze } from '../world/breeze.js';
import { hash1 } from '../util/rng.js';
import { clamp, clamp01, band, lerp } from '../util/math.js';

const TAU = Math.PI * 2;
// How far each kind of plant bends when the breeze leans on it: grass and
// flowers bow right over, palms and monsteras rock, a cactus barely notices.
const FLEX = { grass: 0.38, reed: 0.24, flower: 0.22, clover: 0.1, fern: 0.16, strawberry: 0.09, bigleaf: 0.1, monstera: 0.08, palm: 0.07, bromeliad: 0.06, mushroom: 0.012, cactus: 0.006, succulent: 0.025 };
const CUR = [0, 0];

// How big each shape of flower is when fully open.
const PETAL_R = { sun: 11, tulip: 4.6, moon: 5.2, spike: 5.2, cup: 5, ray: 4.4, bell: 6.2, orchid: 6.2, trumpet: 7, iris: 6.5 };

function flowerCount(def) {
  if (def.kind === 'flower') return def.branches || 1;
  if (def.kind === 'clover') return 2;
  if (def.kind === 'strawberry') return 3;
  if (def.kind === 'cactus' || def.kind === 'lily' || def.kind === 'bromeliad') return 1;
  return 0;
}

export class Plant {
  constructor(type, x, y, opts = {}) {
    this.kind = 'plant';
    this.id = 0;
    this.type = type;
    this.def = PLANTS[type];
    this.x = x;
    this.y = y;
    this.seed = opts.seed != null ? opts.seed : (Math.random() * 1e6) | 0;
    this.growth = opts.growth != null ? opts.growth : 0.2;
    this.health = opts.health != null ? opts.health : 1;
    this.age = opts.age || 0;
    const nl = Math.max(1, this.def.leaves || 1);
    this.leafEaten = new Array(nl).fill(0);
    this.flowers = [];
    for (let i = 0; i < flowerCount(this.def); i++) this.flowers.push({ nectar: 0.6, pollinated: false, seedT: 0, fruit: 0, fruitEaten: 0 });
    this.capEaten = 0;
    this.dead = false;
    this.witherT = 0;
    this.sapDrain = 0;
    this.waterY = opts.waterY || y - 120;
    this.shape = null;
    this.shapeKey = '';
    this.shapeVersion = 0;
    this.keyTimer = Math.random();
    this.aphids = 0;
    this.thirsty = false;
    // how it leans right now (see lean())
    this.leanT = -1;
    this.la = 0;
    this.lk = 0;
    this.lw = 0;
    this.lph = 0;
    this.lh = 1;
    if (opts.leafEaten) opts.leafEaten.forEach((v, i) => i < this.leafEaten.length && (this.leafEaten[i] = v));
    if (opts.flowers) opts.flowers.forEach((f, i) => i < this.flowers.length && Object.assign(this.flowers[i], f));
    this.rebuild();
  }

  get name() {
    return this.def.name;
  }

  h(k) {
    return hash1(this.seed, k);
  }

  key() {
    let k = Math.round(this.growth * 24) + '|' + Math.round(this.health * 6) + '|' + Math.round(this.capEaten * 4) + '|';
    for (const e of this.leafEaten) k += Math.round(e * 4);
    k += '|';
    for (const f of this.flowers) k += (f.pollinated ? 'p' : 'o') + Math.round(f.fruit * 4) + Math.round(f.fruitEaten * 3);
    if (this.def.place === 'surface') k += '|' + Math.round(this.waterY);
    return k + (this.dead ? 'D' : '');
  }

  // Recompute geometry if anything visible changed.
  refresh() {
    const k = this.key();
    if (k !== this.shapeKey) {
      this.shapeKey = k;
      this.rebuild();
    }
  }

  rebuild() {
    const def = this.def;
    const g = this.growth;
    const droop = clamp01((0.75 - this.health) * 1.6) * (this.dead ? 1.4 : 1);
    const S = { stems: [], leaves: [], flowers: [], fruits: [], pads: [], blades: [], slots: [], extra: null, droop };
    const hscale = (0.25 + 0.75 * g) * (0.88 + 0.24 * this.h(1));
    const H = def.h * hscale;
    const lean = (this.h(2) - 0.5) * 0.3;
    const stemPt = (t, h = H, ln = lean) => {
      const bend = ln + droop * 0.9 * (this.h(3) < 0.5 ? -1 : 1);
      return [Math.sin(t * 1.3) * bend * h * 0.45 * t, -t * h * (1 - droop * 0.25 * t)];
    };
    const addSlot = (x, y, kind, i, ax = 0, ay = 0) => S.slots.push({ x, y, kind, i, ax, ay });

    switch (def.kind) {
      case 'flower': {
        const pts = [];
        for (let i = 0; i <= 8; i++) pts.push(stemPt(i / 8));
        S.stems.push({ pts, w: def.h > 60 ? 2.6 : 1.5 });
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.6) continue;
          const side = k % 2 ? 1 : -1;
          const t = def.basal ? 0.02 : 0.12 + (k * 0.55) / n;
          const [ax, ay] = stemPt(t);
          const eaten = this.leafEaten[k] || 0;
          const len = (def.basal ? H * 0.55 : def.bigLeaf ? 17 : 9) * (0.5 + 0.5 * g) * (1 - eaten * 0.7);
          const a = def.basal ? -Math.PI / 2 + side * 0.32 : -Math.PI / 2 + side * (0.95 + droop * 0.9);
          S.leaves.push({ x: ax, y: ay, a, len, wid: len * (def.basal ? 0.22 : 0.4), i: k, eaten, shape: def.basal ? 'blade' : 'ovate' });
          addSlot(ax + Math.cos(a) * len * 0.55, ay + Math.sin(a) * len * 0.55, 'leaf', k, ax, ay);
        }
        const top = pts[pts.length - 1];
        this.flowers.forEach((f, i) => {
          if (g < 0.55) return;
          const open = clamp01((g - 0.55) / 0.3);
          let fx = top[0];
          let fy = top[1];
          if (i > 0) {
            // side branch
            const t = 0.62 + i * 0.08;
            const [bx, by] = stemPt(t);
            const dir = i % 2 ? 1 : -1;
            fx = bx + dir * H * 0.22;
            fy = by - H * 0.18;
            S.stems.push({ pts: [[bx, by], [bx + dir * H * 0.1, by - H * 0.12], [fx, fy]], w: 1.1 });
          }
          const r = (def.memorial ? 2.4 : PETAL_R[def.petalShape] || 4.2) * (0.4 + 0.6 * open) * (i > 0 ? 0.8 : 1);
          S.flowers.push({ x: fx, y: fy, r, i, open, pollinated: f.pollinated, shape: def.petalShape, droop });
          addSlot(fx, fy - r * 0.3, 'flower', i, top[0], top[1]);
        });
        if (!S.flowers.length) addSlot(top[0], top[1], 'stem', 0, top[0], top[1]);
        break;
      }
      case 'fern': {
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.5) continue;
          const eaten = this.leafEaten[k] || 0;
          const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 1.9 + (this.h(10 + k) - 0.5) * 0.2;
          const len = H * (0.7 + 0.3 * this.h(20 + k)) * (1 - eaten * 0.6);
          const curl = (k / (n - 1) - 0.5) * 0.9 + droop * Math.sign(Math.cos(a) || 1) * 0.8;
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const ang = a + curl * t * t;
            const prev = pts[i - 1] || [0, 0];
            pts.push(i === 0 ? [0, 0] : [prev[0] + Math.cos(ang) * len / 8, prev[1] + Math.sin(ang) * len / 8]);
          }
          S.leaves.push({ pts, i: k, eaten, shape: 'frond', len });
          const m = pts[5];
          addSlot(m[0], m[1], 'leaf', k, 0, 0);
        }
        break;
      }
      case 'grass':
      case 'reed':
      case 'eelgrass': {
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.4) continue;
          const eaten = this.leafEaten[k] || 0;
          const spread = def.kind === 'eelgrass' ? 0.5 : 0.9;
          const a = -Math.PI / 2 + (k / Math.max(1, n - 1) - 0.5) * spread + (this.h(30 + k) - 0.5) * 0.25;
          const len = H * (0.6 + 0.4 * this.h(40 + k)) * (1 - eaten * 0.65);
          const bend = (this.h(50 + k) - 0.5) * 0.8 + droop * (Math.cos(a) > 0 ? 1.2 : -1.2);
          const x0 = (k - n / 2) * (def.kind === 'eelgrass' ? 1.6 : 1.2);
          const pts = [];
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const ang = a + bend * t * t;
            const prev = pts[i - 1] || [x0, 0];
            pts.push(i === 0 ? [x0, 0] : [prev[0] + Math.cos(ang) * len / 6, prev[1] + Math.sin(ang) * len / 6]);
          }
          S.blades.push({ pts, i: k, w: def.kind === 'reed' ? 3.2 : def.kind === 'eelgrass' ? 3.4 : 2.4 });
          const m = pts[4];
          addSlot(m[0], m[1], 'leaf', k, x0, 0);
        }
        if (def.kind === 'reed' && g > 0.5) {
          for (let k = 0; k < 2; k++) {
            const x0 = (k ? 2 : -2) + (this.h(60 + k) - 0.5) * 3;
            const top = -H * (1.05 + k * 0.12);
            S.stems.push({ pts: [[x0, 0], [x0 + (k ? 2 : -1) + droop * 4, top * 0.5], [x0 + (k ? 3 : -2) + droop * 8, top]], w: 1.4 });
            S.extra = S.extra || [];
            S.extra.push({ type: 'cattail', x: x0 + (k ? 3 : -2) + droop * 8, y: top + 9, h: 13 * clamp01((g - 0.5) * 2.5) });
            addSlot(x0 + (k ? 3 : -2) + droop * 8, top + 2, 'stem', k, x0, 0);
          }
        }
        break;
      }
      case 'clover': {
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.5) continue;
          const eaten = this.leafEaten[k] || 0;
          const x = (k - (n - 1) / 2) * 4.2 + (this.h(70 + k) - 0.5) * 2;
          const top = -H * (0.6 + 0.5 * this.h(80 + k)) * (1 - droop * 0.4);
          S.stems.push({ pts: [[x * 0.4, 0], [x * 0.8, top * 0.5], [x, top]], w: 0.9 });
          S.leaves.push({ x, y: top, r: 3.2 * (0.6 + 0.4 * g) * (1 - eaten * 0.6), i: k, eaten, shape: 'trefoil' });
          addSlot(x, top - 1, 'leaf', k, x * 0.4, 0);
        }
        this.flowers.forEach((f, i) => {
          if (g < 0.6) return;
          const x = (i ? 5 : -4) + (this.h(90 + i) - 0.5) * 2;
          const top = -H * 1.35;
          S.stems.push({ pts: [[x * 0.3, 0], [x * 0.7, top * 0.6], [x, top]], w: 0.9 });
          S.flowers.push({ x, y: top, r: 3.2 * clamp01((g - 0.6) * 3), i, shape: 'puff', pollinated: f.pollinated });
          addSlot(x, top - 2, 'flower', i, x * 0.3, 0);
        });
        break;
      }
      case 'strawberry': {
        for (let k = 0; k < 3; k++) {
          if (g < k * 0.15) continue;
          const eaten = this.leafEaten[k] || 0;
          const a = -Math.PI / 2 + (k - 1) * 0.6;
          const len = H * (0.8 + 0.3 * this.h(100 + k));
          const tx = Math.cos(a) * len;
          const ty = Math.sin(a) * len * (1 - droop * 0.4);
          S.stems.push({ pts: [[0, 0], [tx * 0.5, ty * 0.7], [tx, ty]], w: 1 });
          S.leaves.push({ x: tx, y: ty, r: 4.6 * (0.6 + 0.4 * g) * (1 - eaten * 0.6), i: k, eaten, shape: 'trefoil' });
          addSlot(tx, ty, 'leaf', k, 0, 0);
        }
        this.flowers.forEach((f, i) => {
          if (g < 0.6) return;
          const dir = i - 1;
          const x = dir * 9 + 2;
          if (f.fruit > 0.05) {
            const y = -2.8;
            S.stems.push({ pts: [[0, -3], [x * 0.6, -7], [x, y - 3]], w: 0.8 });
            S.fruits.push({ x, y, r: 2.4 + f.fruit * 1.6, ripe: f.fruit, i, eaten: f.fruitEaten });
            addSlot(x, y - 1, 'fruit', i, 0, 0);
          } else {
            const y = -H * 0.7;
            S.stems.push({ pts: [[0, -2], [x * 0.6, y * 0.7], [x, y]], w: 0.8 });
            S.flowers.push({ x, y, r: 3 * clamp01((g - 0.6) * 3), i, shape: 'daisy', pollinated: f.pollinated });
            addSlot(x, y - 1, 'flower', i, 0, 0);
          }
        });
        break;
      }
      case 'bigleaf': {
        for (let k = 0; k < 3; k++) {
          if (g < k * 0.2) continue;
          const eaten = this.leafEaten[k] || 0;
          const a = -Math.PI / 2 + (k - 1) * 0.55 + (this.h(110 + k) - 0.5) * 0.2;
          const len = H * (0.65 + 0.35 * this.h(120 + k));
          const tx = Math.cos(a) * len;
          const ty = Math.sin(a) * len * (1 - droop * 0.3);
          S.stems.push({ pts: [[0, 0], [tx * 0.3, ty * 0.6], [tx, ty]], w: 2 });
          const size = 16 * (0.5 + 0.5 * g) * (1 - eaten * 0.55);
          S.leaves.push({ x: tx, y: ty, a: a + (k - 1) * 0.6 + Math.PI * 0.35 + droop, len: size, wid: size * 0.75, i: k, eaten, shape: 'heart' });
          addSlot(tx + Math.cos(a) * 4, ty - 3, 'leaf', k, 0, 0);
        }
        break;
      }
      case 'monstera': {
        // big split leaves on long stalks, the newest ones held highest
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.6) continue;
          const eaten = this.leafEaten[k] || 0;
          const side = k % 2 ? 1 : -1;
          const a = -Math.PI / 2 + side * (0.3 + 0.32 * Math.floor(k / 2)) + (this.h(180 + k) - 0.5) * 0.25;
          const len = H * (0.62 + 0.38 * this.h(190 + k)) * (1 - Math.floor(k / 2) * 0.12);
          const tx = Math.cos(a) * len;
          const ty = Math.sin(a) * len * (1 - droop * 0.35);
          S.stems.push({ pts: [[0, 0], [tx * 0.25, ty * 0.65], [tx, ty]], w: 1.8 });
          const size = 17 * (0.45 + 0.55 * g) * (1 - eaten * 0.5);
          const la = -Math.PI / 2 + side * (1.05 + droop * 0.8) + (this.h(200 + k) - 0.5) * 0.3;
          S.leaves.push({ x: tx, y: ty, a: la, len: size, wid: size * 0.82, i: k, eaten, shape: 'monstera', splits: g > 0.45 ? 3 : g > 0.25 ? 1 : 0 });
          addSlot(tx + Math.cos(la) * size * 0.5, ty + Math.sin(la) * size * 0.5, 'leaf', k, tx, ty);
        }
        break;
      }
      case 'palm': {
        // a slim ringed trunk with arching fronds at the crown
        const th = H * 0.62;
        const tpts = [];
        for (let i = 0; i <= 8; i++) tpts.push(stemPt(i / 8, th, lean * 0.6));
        S.extra = [{ type: 'trunk', pts: tpts, w: 3 + 3 * g }];
        const [cx, cy] = tpts[8];
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.45) continue;
          const eaten = this.leafEaten[k] || 0;
          const u = n > 1 ? k / (n - 1) - 0.5 : 0;
          const a = -Math.PI / 2 + u * 2.7 + (this.h(210 + k) - 0.5) * 0.2;
          const len = H * 0.42 * (0.7 + 0.3 * this.h(220 + k)) * (1 - Math.abs(u) * 0.25) * (1 - eaten * 0.5);
          const curl = (Math.abs(u) < 0.08 ? 0.5 : Math.sign(u)) * (1.5 + droop * 0.8);
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const ang = a + curl * t * t;
            const prev = pts[i - 1] || [cx, cy];
            pts.push(i === 0 ? [cx, cy] : [prev[0] + (Math.cos(ang) * len) / 8, prev[1] + (Math.sin(ang) * len) / 8]);
          }
          S.leaves.push({ pts, i: k, eaten, shape: 'palmFrond', len });
          const m = pts[4];
          addSlot(m[0], m[1], 'leaf', k, cx, cy);
        }
        addSlot(cx, cy, 'stem', 0, 0, 0);
        break;
      }
      case 'bromeliad': {
        // a rosette of stiff, arching straps around a bright bract
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.5) continue;
          const eaten = this.leafEaten[k] || 0;
          const u = k / (n - 1) - 0.5;
          const a = -Math.PI / 2 + u * 2.5 + (this.h(230 + k) - 0.5) * 0.2;
          const len = H * (0.75 + 0.35 * (1 - Math.abs(u) * 1.4)) * (1 - eaten * 0.6);
          const bend = Math.sign(u || 0.01) * (0.9 + droop) * Math.min(1, Math.abs(u) * 3);
          const pts = [];
          for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const ang = a + bend * t * t;
            const prev = pts[i - 1] || [u * 3, 0];
            pts.push(i === 0 ? [u * 3, 0] : [prev[0] + (Math.cos(ang) * len) / 6, prev[1] + (Math.sin(ang) * len) / 6]);
          }
          S.blades.push({ pts, i: k, w: 4.6 });
          addSlot(pts[3][0], pts[3][1], 'leaf', k, 0, 0);
        }
        this.flowers.forEach((f, i) => {
          if (g < 0.55) return;
          const open = clamp01((g - 0.55) / 0.3);
          const by = -H * (0.45 + 0.25 * open);
          S.stems.push({ pts: [[0, 0], [0.4, by * 0.5], [0, by]], w: 2 });
          S.flowers.push({ x: 0, y: by, r: 6.5 * (0.4 + 0.6 * open), i, open, shape: 'bract', pollinated: f.pollinated });
          addSlot(0, by - 3, 'flower', i, 0, 0);
        });
        break;
      }
      case 'mushroom': {
        const sh = H * 0.6;
        const cr = 9 * (0.35 + 0.65 * g) * (1 - this.capEaten * 0.5);
        S.extra = [{ type: 'mushroom', sh, cr, eaten: this.capEaten }];
        addSlot(0, -sh - cr * 0.5, 'cap', 0, 0, 0);
        break;
      }
      case 'cactus': {
        const ch = H;
        S.extra = [{ type: 'cactus', h: ch, w: 5 + 3 * g, arms: g > 0.5 ? (this.h(130) < 0.5 ? 1 : 2) : 0, armH: ch * 0.4, droop }];
        this.flowers.forEach((f, i) => {
          if (g < 0.8) return;
          S.flowers.push({ x: 0, y: -ch - 1, r: 4 * clamp01((g - 0.8) * 5), i, shape: 'daisy', pollinated: f.pollinated });
          addSlot(0, -ch - 3, 'flower', i, 0, 0);
        });
        addSlot(0, -ch * 0.6, 'stem', 0, 0, 0);
        break;
      }
      case 'succulent': {
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < (k / n) * 0.5) continue;
          const eaten = this.leafEaten[k] || 0;
          const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2;
          const len = H * (0.6 + 0.4 * (1 - Math.abs(k / (n - 1) - 0.5) * 2)) * (1 - eaten * 0.5);
          S.leaves.push({ x: 0, y: 0, a: a + droop * Math.sign(Math.cos(a) || 1) * 0.4, len, wid: len * 0.28, i: k, eaten, shape: 'fleshy' });
          addSlot(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, 'leaf', k, 0, 0);
        }
        break;
      }
      case 'lily': {
        const top = this.waterY - this.y; // negative (surface above base)
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          pts.push([Math.sin(t * 5 + this.h(140) * 6) * 4, top * t]);
        }
        S.stems.push({ pts, w: 1.2, underwater: true });
        const n = def.leaves;
        for (let k = 0; k < n; k++) {
          if (g < k * 0.25) continue;
          const eaten = this.leafEaten[k] || 0;
          const px = [-15, 7, 22][k] + (this.h(150 + k) - 0.5) * 4;
          const r = (6 + 5 * g) * (1 - eaten * 0.5) * (0.85 + 0.3 * this.h(160 + k));
          S.pads.push({ x: px, y: top, r, i: k, notch: this.h(170 + k) * TAU });
          addSlot(px, top - 1, 'pad', k, 0, top);
        }
        this.flowers.forEach((f, i) => {
          if (g < 0.6) return;
          // a lotus holds its bloom up out of the water on a stalk of its own
          const up = def.lotus ? 14 * clamp01((g - 0.6) * 3) : 0;
          if (up) S.stems.push({ pts: [[0, top], [1.2, top - up * 0.55], [0, top - up]], w: 1.4 });
          S.flowers.push({ x: 0, y: top - 2 - up, r: (def.lotus ? 8.5 : 6) * clamp01((g - 0.6) * 3), i, shape: 'lotus', pollinated: f.pollinated });
          addSlot(0, top - 4 - up, 'flower', i, 0, top);
        });
        break;
      }
      default:
        break;
    }
    // bounding box
    let x0 = -6;
    let x1 = 6;
    let y0 = -8;
    let y1 = 4;
    const grow = (x, y, pad = 4) => {
      x0 = Math.min(x0, x - pad);
      x1 = Math.max(x1, x + pad);
      y0 = Math.min(y0, y - pad);
      y1 = Math.max(y1, y + pad);
    };
    for (const s of S.stems) for (const p of s.pts) grow(p[0], p[1]);
    for (const b of S.blades) for (const p of b.pts) grow(p[0], p[1], 5);
    for (const l of S.leaves) {
      if (l.pts) for (const p of l.pts) grow(p[0], p[1], 7);
      else if (l.len) grow(l.x + Math.cos(l.a) * l.len, l.y + Math.sin(l.a) * l.len, l.wid + 4);
      else grow(l.x, l.y, (l.r || 4) * 2 + 3);
      if (l.len && !l.pts) grow(l.x, l.y);
    }
    for (const f of S.flowers) grow(f.x, f.y - (f.shape === 'bract' ? f.r * 1.6 : 0), f.r * 1.8 + 4);
    for (const f of S.fruits) grow(f.x, f.y, f.r + 4);
    for (const p of S.pads) grow(p.x, p.y, p.r + 4);
    if (S.extra) {
      for (const e of S.extra) {
        if (e.type === 'mushroom') grow(0, -e.sh - e.cr, e.cr + 4);
        if (e.type === 'cactus') {
          grow(0, -e.h - 6, e.w + 14);
          grow(0, 0, e.w + 14);
        }
        if (e.type === 'cattail') grow(e.x, e.y - e.h, 6);
        if (e.type === 'trunk') for (const p of e.pts) grow(p[0], p[1], e.w + 3);
      }
    }
    S.box = [x0, y0, x1, y1];
    this.shape = S;
    this.shapeVersion++;
  }

  // How the plant leans right now: a little sway (radians), a bend as the
  // breeze or the pond's current pushes on it (a shear: the tip moves, the
  // base stays put) and, for eelgrass, a ripple running up its ribbons.
  // Drawing and the critters clinging to it both go through here, so a
  // ladybug stays on its leaf however hard the leaf is blowing about.
  lean(time) {
    if (this.leanT === time) return this;
    this.leanT = time;
    const def = this.def;
    const g = 0.6 + this.growth * 0.4;
    if (def.place === 'underwater') {
      const h = Math.max(20, def.h * this.growth);
      breeze.current(this.x, this.y - h * 0.6, CUR);
      this.la = Math.sin(time * 0.9 + this.seed) * 0.04 * g;
      this.lk = clamp(CUR[0] * 0.012, -0.22, 0.22);
      this.lw = (2.5 + Math.abs(CUR[0]) * 0.35) * g;
      this.lph = time * 1.7 + this.seed;
      this.lh = h;
    } else if (def.place === 'surface') {
      // a lily's pads drift about on their long stems
      const reach = Math.max(30, this.y - this.waterY);
      breeze.current(this.x, this.waterY + 2, CUR);
      this.la = 0;
      this.lk = clamp((CUR[0] * 0.5 + breeze.wind(this.x) * 3) / reach, -7 / reach, 7 / reach);
      this.lw = 0;
    } else {
      const wind = breeze.wind(this.x);
      const flex = (FLEX[def.kind] || 0.1) * g * (this.dead ? 0.5 : 1);
      // a gust makes the leaves shiver as well as lean
      const push = wind + Math.sin(time * 7.3 + this.seed) * 0.12 * Math.abs(wind);
      this.la = Math.sin(time * 1.3 + this.seed) * 0.025 * g + push * flex * 0.12;
      this.lk = clamp(push * flex, -0.4, 0.4);
      this.lw = 0;
    }
    return this;
  }

  // Current sway angle (radians).
  sway(time) {
    return this.lean(time).la;
  }

  // How far a point ly above the base (up is negative) is pushed sideways by
  // the bend and the ripple. Call lean() first.
  bendX(ly) {
    let dx = -this.lk * ly;
    if (this.lw) dx += this.lw * clamp01(-ly / this.lh) * Math.sin(this.lph + ly * 0.06);
    return dx;
  }

  // A point in the plant's own space (base at 0,0) to where it is in the
  // tank right now, bent and swayed. Allocation-free.
  toWorld(lx, ly, time, out) {
    this.lean(time);
    const bx = lx + this.bendX(ly);
    const c = Math.cos(this.la);
    const s = Math.sin(this.la);
    out[0] = this.x + bx * c - ly * s;
    out[1] = this.y + bx * s + ly * c;
    return out;
  }

  // Allocation-free variant for hot loops.
  slotXY(slot, time, out) {
    return this.toWorld(slot.x, slot.y, time, out);
  }

  slotWorld(slot, time) {
    const out = this.toWorld(slot.x, slot.y, time, [0, 0]);
    if (this.def.place === 'surface' && (slot.kind === 'pad' || slot.kind === 'flower')) out[1] += Math.sin(time * 1.2 + slot.i) * 0.8;
    return out;
  }

  update(dt, world) {
    const def = this.def;
    if (this.dead) {
      this.witherT += dt;
      return;
    }
    this.age += dt;
    const env = world.env;
    const t = world.terrain;
    let T;
    let M;
    let L;
    if (def.aquatic) {
      T = env.pond.temp;
      M = 1;
      L = env.lightAt(this.x, t.waterLevel - 5, null) * (0.4 + 0.6 * env.pond.clarity);
      if (def.place === 'surface') {
        this.waterY = t.waterLevel;
        if (t.waterSurfaceAt(this.x) < 0 || this.y - t.waterLevel < 8) this.health -= dt / (DAY_LEN * 0.5);
      } else if (!t.waterAt(this.x, this.y - 8)) {
        this.health -= dt / (DAY_LEN * 0.6);
        M = 0;
      }
    } else {
      T = env.tempAt(this.x, this.y - 6, t);
      M = env.moistAt(this.x, this.y + 6, t);
      if (def.place === 'shore') M = Math.max(M, 0.7);
      L = env.lightAt(this.x, this.y - 12, t);
    }
    const tf = band(T, def.temp[0], def.temp[1], def.temp[2], def.temp[3]);
    const mf = band(M, def.moist[0], def.moist[1], def.moist[2], def.moist[3]);
    const comfort = Math.min(tf, mf);
    this.thirsty = mf < 0.5;
    this.comfort = comfort;
    const zone = env.zoneAt(this.x);
    const fert = zone === 'pond' ? 0.5 + env.pond.nutrients * 0.5 : env.fertility[zone] || 0.4;
    const lightF = def.likesDark ? 1.15 - L * 0.5 : 0.12 + 0.88 * L;
    if (this.growth < 1) {
      const rate = ((dt / (def.growDays * DAY_LEN)) * lightF * comfort * (0.6 + fert * 0.8)) * (world.owns('sprinkler') ? 2 : 1) * world.soilBoost(zone);
      this.growth = Math.min(1, this.growth + rate);
    }
    if (comfort < 0.4) this.health -= (dt * (0.4 - comfort)) / (0.5 * DAY_LEN);
    else this.health = Math.min(1, this.health + (dt * 0.6 * comfort) / DAY_LEN);
    if (this.sapDrain > 0) {
      this.health -= this.sapDrain * dt * 0.00012;
      this.sapDrain = 0;
    }
    // leaves regrow when happy
    const regrow = (dt * 0.5 * comfort * (0.5 + fert)) / DAY_LEN;
    for (let i = 0; i < this.leafEaten.length; i++) if (this.leafEaten[i] > 0) this.leafEaten[i] = Math.max(0, this.leafEaten[i] - regrow);
    if (this.capEaten > 0) this.capEaten = Math.max(0, this.capEaten - regrow * 0.5);
    // flowers
    for (let fi = 0; fi < this.flowers.length; fi++) {
      const f = this.flowers[fi];
      // (a moonflower fills with nectar by night; the sprinklers speed it all up)
      const lit = def.night ? 1 - env.sun * 0.85 : Math.max(0.2, L);
      f.nectar = Math.min(1, f.nectar + (dt * 1.6 * lit * (world.owns('sprinkler') ? 2 : 1)) / DAY_LEN);
      if (def.kind === 'lily') {
        // water lilies bloom for picking when the pond critters look after
        // them (seedT is the bloom timer here)
        if (this.growth > 0.6) f.seedT += dt * comfort * world.lilyCare();
        if (f.seedT > DAY_LEN * 1.3) f.seedT = world.bloomLily(this, fi) ? 0 : DAY_LEN * 1.3;
        continue;
      }
      if (this.growth > 0.6 && !f.pollinated && f.fruit <= 0 && Math.random() < (dt * 0.12) / DAY_LEN) f.pollinated = true; // a little self-pollination
      if (f.pollinated) {
        f.seedT += dt;
        if (def.kind === 'strawberry') {
          f.fruit = Math.min(1, f.fruit + dt / (DAY_LEN * 1.2));
          if (f.fruit >= 1 && f.seedT > DAY_LEN * 2.5) {
            world.spawnSeedling(this, 60);
            f.pollinated = false;
            f.seedT = 0;
            f.fruit = 0;
            f.fruitEaten = 0;
          }
        } else if (f.seedT > DAY_LEN * 0.9) {
          world.ripenSeeds(this, fi, def.spreads ? 50 : 90);
          f.pollinated = false;
          f.seedT = 0;
          f.nectar = 0.2;
        }
      }
    }
    // big leafy plants shed an old leaf now and then
    if (!def.aquatic && !def.memorial && def.leaves >= 3 && this.growth > 0.7 && def.kind !== 'succulent' && Math.random() < (dt * 0.35 * Math.min(2, def.h / 40)) / DAY_LEN) world.dropLitter(this);
    // grass/clover spread by runners
    if (def.spreads && this.growth > 0.9 && Math.random() < (dt * 0.25) / DAY_LEN) world.spawnSeedling(this, 40);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      world.events.emit('plantDied', { plant: this });
    }
    this.keyTimer -= dt;
    if (this.keyTimer <= 0) {
      this.keyTimer = 0.8;
      this.refresh();
    }
  }

  // Can a creature eat from this slot? Returns food value tags.
  slotFood(slot) {
    if (slot.kind === 'leaf' || slot.kind === 'pad') {
      const e = this.leafEaten[slot.i] || 0;
      if (e > 0.85) return null;
      if (this.def.kind === 'grass' || this.def.kind === 'reed') return 'grass';
      return 'leaf';
    }
    if (slot.kind === 'flower') {
      const f = this.flowers[slot.i];
      if (!f || f.nectar < 0.15) return null;
      return 'nectar';
    }
    if (slot.kind === 'fruit') {
      const f = this.flowers[slot.i];
      if (!f || f.fruit < 0.8 || f.fruitEaten > 0.9) return null;
      return 'fruit';
    }
    if (slot.kind === 'cap' && this.def.edibleCap && this.capEaten < 0.85) return 'fungus';
    return null;
  }

  eatSlot(slot, amount) {
    if (slot.kind === 'leaf' || slot.kind === 'pad') {
      this.leafEaten[slot.i] = Math.min(1, (this.leafEaten[slot.i] || 0) + amount * 0.9);
      this.health -= amount * 0.04;
    } else if (slot.kind === 'flower') {
      const f = this.flowers[slot.i];
      if (f) f.nectar = Math.max(0, f.nectar - amount * 2.5);
    } else if (slot.kind === 'fruit') {
      const f = this.flowers[slot.i];
      if (f) f.fruitEaten = Math.min(1, f.fruitEaten + amount * 1.2);
    } else if (slot.kind === 'cap') {
      this.capEaten = Math.min(1, this.capEaten + amount * 0.9);
    }
  }

  pollinate(slot) {
    const f = this.flowers[slot.i];
    if (f && !f.pollinated && this.growth > 0.6) {
      f.pollinated = true;
      f.seedT = 0;
      return true;
    }
    return false;
  }

  serialize() {
    return {
      type: this.type,
      x: Math.round(this.x * 10) / 10,
      y: Math.round(this.y * 10) / 10,
      seed: this.seed,
      growth: +this.growth.toFixed(3),
      health: +this.health.toFixed(3),
      age: Math.round(this.age),
      leafEaten: this.leafEaten.map((v) => +v.toFixed(2)),
      flowers: this.flowers.map((f) => ({ nectar: +f.nectar.toFixed(2), pollinated: f.pollinated, seedT: Math.round(f.seedT), fruit: +f.fruit.toFixed(2), fruitEaten: +f.fruitEaten.toFixed(2) })),
      capEaten: +this.capEaten.toFixed(2),
      dead: this.dead,
    };
  }

  static load(d) {
    const p = new Plant(d.type, d.x, d.y, d);
    p.capEaten = d.capEaten || 0;
    p.dead = !!d.dead;
    p.rebuild();
    return p;
  }
}

export { lerp };
