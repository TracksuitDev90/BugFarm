// The vines trailing from the jungle's lid are living plants. Each one roots
// as a little cutting, grows down over a day or two, lives its life and then
// yellows and withers away, and something new takes its place. Most new
// vines are cuttings of a neighbour, so the canopy has runs of the same
// plant (a curtain of pothos, a few strings of hearts side by side) with the
// odd newcomer, rather than a row of nine different things. A dry jungle
// browns them sooner; the garden sprinklers grow them faster.
// Only the simulation lives here; the renderer draws and sways them.
import { DAY_LEN, W, ZONE_X } from '../config.js';
import { clamp01 } from '../util/math.js';
import { rrange, rint, chance, rpick } from '../util/rng.js';
import { LAMP_X, MISTER_X } from './environment.js';
import { GAUGE_AT } from '../sim/equipment.js';
import { SPRINKLER_X } from '../data/market.js';

// common: how often it turns up as a newcomer. len: how long it grows.
// half: how much lid it takes either side of its hook.
export const VINE_KINDS = {
  pothos: { name: 'pothos', common: 5, len: [150, 210], half: 22 },
  hearts: { name: 'string of hearts', common: 4, len: [170, 230], half: 16 },
  pearls: { name: 'string of pearls', common: 3, len: [110, 150], half: 16 },
  hoya: { name: 'hoya', common: 2, len: [130, 170], half: 16 },
  morning: { name: 'morning glory', common: 2, len: [200, 260], half: 16 },
  passion: { name: 'passion flower', common: 1.5, len: [190, 240], half: 18 },
  moss: { name: 'Spanish moss', common: 1.5, len: [90, 120], half: 30 },
  pitcher: { name: 'pitcher plant', common: 1, len: [150, 190], half: 26 },
  liana: { name: 'liana', common: 0.8, len: [100, 140], half: 12, span: 72 },
};
const KIND_IDS = Object.keys(VINE_KINDS);
// a fresh cutting: the pot (or moss ball, or twig) and a few leaves
export const VINE_MIN = 52;
const STEP = 36; // spacing between hooks in the lid

// Where vines can hang: hooks along the jungle's lid, clear of the mister's
// spray, the lamp, the thermometer, the sprinklers and anything hung there.
export function vineHooks(w) {
  const x0 = ZONE_X.jungle[0] + 12;
  const x1 = W - 14;
  const keep = [[MISTER_X.jungle, 34], [LAMP_X.jungle, 36], [GAUGE_AT.jungle[0], 16]];
  if (w.owns && w.owns('sprinkler')) for (const x of SPRINKLER_X) keep.push([x, 14]);
  for (const d of w.decor) if (d.def.place === 'top') keep.push([d.x, d.def.w / 2 + 12]);
  const out = [];
  for (let x = x0; x <= x1; x += STEP) if (!keep.some(([kx, r]) => Math.abs(kx - x) < r)) out.push(x);
  return out;
}

export class Vines {
  constructor() {
    this.list = []; // { id, x, kind, seed, len, max, age, life, wither, span?, sag? }
    this.seq = 1;
    this.nextT = 0;
    this.recent = []; // kinds that withered lately (their cuttings live on)
    this.acc = 0;
  }

  // A new farm's canopy: a couple of kinds, in runs, at all ages.
  seed(w) {
    this.list = [];
    const hooks = vineHooks(w);
    const main = [];
    while (main.length < 3) {
      const k = this.newcomer();
      if (!main.includes(k)) main.push(k);
    }
    // runs of two to four of the same plant, then a change
    let run = rpick(main);
    let left = rint(2, 4);
    for (const x of hooks) {
      if (left <= 0) {
        run = rpick(main.filter((k) => k !== run));
        left = rint(2, 4);
      }
      if (!chance(0.85)) continue;
      const v = this.make(w, run, x, hooks);
      if (!v) continue;
      left--;
      const k = rrange(0.1, 0.8);
      v.age = v.life * k;
      v.len = Math.max(VINE_MIN, v.max * clamp01(k * 1.8));
    }
    this.nextT = w.time + DAY_LEN * rrange(0.3, 0.7);
  }

  newcomer() {
    let total = 0;
    for (const k of KIND_IDS) total += VINE_KINDS[k].common;
    let r = Math.random() * total;
    for (const k of KIND_IDS) if ((r -= VINE_KINDS[k].common) <= 0) return k;
    return 'pothos';
  }

  // Is there room on the lid for this kind at x?
  free(x, kind, ignore) {
    const def = VINE_KINDS[kind];
    const a0 = x - def.half;
    const a1 = x + (def.span || 0) + def.half;
    for (const v of this.list) {
      if (v === ignore) continue;
      const d = VINE_KINDS[v.kind];
      const b0 = v.x - d.half;
      const b1 = v.x + (v.span || 0) + d.half;
      if (a0 < b1 - 4 && b0 < a1 - 4) return false;
    }
    return x + (def.span || 0) <= W - 12;
  }

  make(w, kind, x, hooks) {
    if (!this.free(x, kind)) return null;
    if (VINE_KINDS[kind].span) {
      // a liana needs its second hook clear too
      const x2 = x + VINE_KINDS[kind].span;
      if (!hooks.some((h) => Math.abs(h - x2) < STEP * 0.6)) return null;
    }
    const def = VINE_KINDS[kind];
    const v = {
      id: this.seq++,
      x,
      kind,
      seed: rint(1, 9999),
      len: VINE_MIN,
      max: rrange(def.len[0], def.len[1]),
      age: 0,
      life: DAY_LEN * rrange(6, 14),
      wither: 0,
    };
    if (def.span) {
      v.span = def.span;
      v.sag = rrange(78, 100);
    }
    this.list.push(v);
    return v;
  }

  // A new cutting roots: usually from a vine already here (and next to it),
  // sometimes something new altogether.
  sprout(w) {
    const hooks = vineHooks(w).filter((x) => this.free(x, 'pothos'));
    if (!hooks.length) return null;
    const pool = this.list.map((v) => v.kind).concat(this.recent);
    const cutting = pool.length && chance(0.72);
    const kind = cutting ? rpick(pool) : this.newcomer();
    let x = rpick(hooks);
    if (cutting) {
      // beside a parent if there's room
      const kin = this.list.filter((v) => v.kind === kind);
      let best = Infinity;
      for (const h of hooks) {
        for (const p of kin) {
          const d = Math.abs(h - p.x);
          if (d < best && this.free(h, kind)) {
            best = d;
            x = h;
          }
        }
      }
    }
    const v = this.make(w, kind, x, vineHooks(w));
    if (v) w.addLog(`A new ${VINE_KINDS[kind].name} is trailing down from the jungle lid.`, 'leaf');
    return v;
  }

  // How many vines the lid has room for, roughly.
  get room() {
    return this.cap || 8;
  }

  update(w, dt) {
    // (a vine's life is slow: every couple of seconds is plenty)
    this.acc += dt;
    if (this.acc < 2) return;
    const step = this.acc;
    this.acc = 0;
    const e = w.env.jungle;
    // happiest in damp air, struggling in a drought
    const damp = clamp01((e.moist - 0.22) / 0.3);
    const vigor = (0.25 + 0.75 * damp) * (w.owns && w.owns('sprinkler') ? 2 : 1);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      v.age += step;
      if (v.age < v.life && v.wither < 0.5) {
        if (v.len < v.max) v.len = Math.min(v.max, v.len + (v.max / (DAY_LEN * 1.8)) * vigor * step);
        // a dry spell browns it; it greens up again once it's damp
        if (damp < 0.25) v.wither = Math.min(1, v.wither + ((0.25 - damp) * step) / (DAY_LEN * 1.6));
        else if (v.wither > 0) v.wither = Math.max(0, v.wither - step / (DAY_LEN * 1.5));
      } else {
        // old age: yellowing, dropping leaves, then gone
        v.wither = Math.min(1, v.wither + step / (DAY_LEN * 0.9));
        if (v.wither > 0.45) v.len = Math.max(VINE_MIN * 0.8, v.len - ((v.max / (DAY_LEN * 1.6)) * step));
      }
      if (v.wither >= 1) {
        this.list.splice(i, 1);
        this.recent.unshift(v.kind);
        if (this.recent.length > 3) this.recent.length = 3;
        w.addLog(`The old ${VINE_KINDS[v.kind].name} on the jungle lid has withered away.`, 'leaf');
      }
    }
    this.cap = Math.max(3, Math.round(vineHooks(w).length * 0.8));
    if (w.time >= this.nextT) {
      // (a sparse canopy fills back in quicker)
      const sparse = this.list.length < this.room * 0.6 ? 0.45 : 1;
      this.nextT = w.time + (DAY_LEN * rrange(0.25, 0.6) * sparse) / Math.max(0.4, vigor);
      if (this.list.length < this.room) this.sprout(w);
    }
  }

  serialize() {
    const list = this.list.map((v) => {
      const o = { id: v.id, x: v.x, kind: v.kind, seed: v.seed, len: +v.len.toFixed(1), max: Math.round(v.max), age: Math.round(v.age), life: Math.round(v.life), wither: +v.wither.toFixed(3) };
      if (v.span) {
        o.span = v.span;
        o.sag = Math.round(v.sag);
      }
      return o;
    });
    return { seq: this.seq, nextT: Math.round(this.nextT), recent: this.recent, list };
  }
  load(d, w) {
    if (!d || !Array.isArray(d.list)) return this.seed(w);
    this.list = d.list.filter((v) => VINE_KINDS[v.kind] && isFinite(v.x) && isFinite(v.len)).map((v) => ({ id: v.id, x: v.x, kind: v.kind, seed: v.seed | 0, len: v.len, max: v.max || v.len, age: v.age || 0, life: v.life || DAY_LEN * 10, wither: v.wither || 0, span: v.span, sag: v.sag }));
    this.seq = d.seq || this.list.length + 1;
    this.nextT = d.nextT || w.time;
    this.recent = (d.recent || []).filter((k) => VINE_KINDS[k]);
  }
}
