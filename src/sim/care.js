// Reading the tank the way a keeper would: what the critters living in each
// zone need, how the climate compares, and what (if anything) wants doing.
// Pure functions of the world, so the HUD, the clipboard, the climate panel
// and the in-tank gauges all agree, and the tests can run them headless.
import { SPECIES } from '../data/species.js';
import { FOODS, FOOD_ORDER } from '../data/foods.js';
import { DAY_LEN, ZONE_X, TANK, TANK_MAX } from '../config.js';

export const ZONE_NAMES = { desert: 'Desert', pond: 'Pond', jungle: 'Jungle' };

// What a zone is set up for before anyone moves in.
const DEFAULT_BAND = {
  desert: { t: [22, 34], m: [0, 0.6] },
  pond: { t: [16, 27], m: null },
  jungle: { t: [18, 28], m: [0.4, 1] },
};

function plural(sp, n) {
  const d = SPECIES[sp];
  return (n === 1 ? d.name : d.plural).toLowerCase();
}
function listWords(a) {
  if (a.length <= 1) return a.join('');
  return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}

// Critters that count as living in a zone right now (eggs and chrysalises
// don't complain about the weather). Flyers only count at home, so a
// butterfly fluttering over the desert doesn't change what the desert needs.
export function residents(w, z) {
  const out = [];
  for (const c of w.creatures) {
    if (c.dead || c.stage === 'egg' || c.pupa || c.sp === 'fruitfly') continue;
    if (c.canFly) {
      if (c.def.zone === z) out.push(c);
    } else if (w.env.zoneAt(c.x) === z) out.push(c);
  }
  return out;
}

// The comfy temperature (and dampness) range that suits every species living
// in the zone. When two species want different things, it settles in the
// middle and says who disagrees.
export function zoneBand(w, z, list = residents(w, z)) {
  const sps = [...new Set(list.map((c) => c.sp))];
  const base = DEFAULT_BAND[z];
  if (!sps.length) return { t: base.t.slice(), m: base.m && base.m.slice(), sps, tLo: [], tHi: [], mLo: [], mHi: [], conflict: false };
  let lo = -99;
  let hi = 99;
  let tLo = [];
  let tHi = [];
  for (const sp of sps) {
    // burrowers live in cool, steady soil, so the air doesn't bother them
    if (SPECIES[sp].habitat === 'soil') continue;
    const t = SPECIES[sp].temp;
    if (t[1] > lo) {
      lo = t[1];
      tLo = [sp];
    } else if (t[1] === lo) tLo.push(sp);
    if (t[2] < hi) {
      hi = t[2];
      tHi = [sp];
    } else if (t[2] === hi) tHi.push(sp);
  }
  if (lo === -99) [lo, hi] = base.t;
  let conflict = false;
  if (lo > hi) {
    const mid = (lo + hi) / 2;
    lo = hi = mid;
    conflict = true;
  }
  // dampness only matters to critters that mind it (the sim ignores it for
  // the rest), so a zone of desert critters has no dampness range at all
  let m = null;
  let mLo = [];
  let mHi = [];
  if (z !== 'pond') {
    let mlo = 0;
    let mhi = 1;
    for (const sp of sps) {
      const mm = SPECIES[sp].moist;
      if (mm[0] < 0 && mm[3] > 1) continue;
      if (mm[1] > mlo) {
        mlo = mm[1];
        mLo = [sp];
      } else if (mm[1] === mlo && mlo > 0) mLo.push(sp);
      const top = Math.min(1, mm[2]);
      if (top < mhi) {
        mhi = top;
        mHi = [sp];
      } else if (top === mhi && mhi < 1) mHi.push(sp);
    }
    if (mLo.length || mHi.length) m = mlo <= mhi ? [mlo, mhi] : [(mlo + mhi) / 2, (mlo + mhi) / 2];
    else if (!sps.length && base.m) m = base.m.slice();
  }
  return { t: [lo, hi], m, sps, tLo, tHi, mLo, mHi, conflict };
}

// How a zone is doing against its band. sev: 0 fine, 1 a little off,
// 2 uncomfortable, 3 dangerous.
export function zoneStatus(w, z, band = zoneBand(w, z)) {
  const env = w.env;
  const T = z === 'pond' ? env.pond.temp : env[z].temp;
  const [lo, hi] = band.t;
  let tState = 'ok';
  let tSev = 0;
  // a degree either side is still fine
  if (T < lo - 1) {
    tState = 'cold';
    const d = lo - T;
    tSev = d < 3 ? 1 : d < 6 ? 2 : 3;
  } else if (T > hi + 1) {
    tState = 'hot';
    const d = T - hi;
    tSev = d < 3 ? 1 : d < 6 ? 2 : 3;
  }
  let M = null;
  let mState = 'ok';
  let mSev = 0;
  if (band.m) {
    M = env[z].moist;
    if (M < band.m[0] - 0.02) {
      mState = 'dry';
      const d = band.m[0] - M;
      mSev = d < 0.08 ? 1 : d < 0.2 ? 2 : 3;
    } else if (M > band.m[1] + 0.02) {
      mState = 'wet';
      const d = M - band.m[1];
      mSev = d < 0.08 ? 1 : 2;
    }
  }
  let water = 'ok';
  let wSev = 0;
  if (z === 'pond') {
    const p = env.pond;
    if (p.oxygen < 0.45) {
      water = 'air';
      wSev = p.oxygen < 0.3 ? 3 : 2;
    } else if (p.clarity < 0.62) {
      water = 'cloudy';
      wSev = 1;
    }
  }
  const sev = Math.max(tSev, mSev, wSev);
  return { z, T, M, band, tState, tSev, mState, mSev, water, wSev, sev, ok: sev === 0 };
}

// Snacks a group of critters would like most, from what the keeper can use.
export function favouriteFoods(sps, canUse = () => true, n = 2) {
  const score = {};
  for (const id of FOOD_ORDER) {
    if (FOODS[id].busy || !canUse('feed', id)) continue;
    let s = 0;
    for (const sp of sps) {
      const d = SPECIES[sp];
      const diets = [d.diet, ...d.stages.map((st) => st.diet).filter(Boolean)];
      let best = 0;
      for (const diet of diets) for (const t of FOODS[id].tags) best = Math.max(best, diet[t] || 0);
      s += best;
    }
    if (s > 0.6) score[id] = s;
  }
  return Object.keys(score)
    .sort((a, b) => score[b] - score[a])
    .slice(0, n);
}

// Everything that could use the keeper's attention, most urgent first.
//   sev 0 = just so you know (forecasts), 1 = soon, 2 = now, 3 = right now!
//   act: { kind: 'climate' | 'feed' | 'refill' | 'clean' | 'rinse' | 'topup' | 'tidy', zone, food }
export function tankNeeds(w, canUse = () => true, fmt = (t) => Math.round(t) + '°C') {
  const env = w.env;
  const needs = [];
  const add = (zone, sev, icon, text, act) => needs.push({ zone, sev, icon, text, act });
  for (const z of ['desert', 'pond', 'jungle']) {
    const list = residents(w, z);
    const band = zoneBand(w, z, list);
    const st = zoneStatus(w, z, band);
    const Z = ZONE_NAMES[z];
    const who = (sps) => listWords(sps.slice(0, 2).map((sp) => plural(sp, 2)));
    if (st.tState !== 'ok') {
      const hot = st.tState === 'hot';
      const sps = hot ? band.tHi : band.tLo;
      const whom = sps.length ? ` for the ${who(sps)}` : '';
      let fix;
      if (z === 'pond') {
        const p = env.pond;
        fix = hot ? (p.heater ? 'turn the heater down' : p.lamp > 0.2 ? 'turn the pond lamp down' : 'cool the room a little') : p.heater ? 'turn the heater up' : 'switch on the pond heater';
      } else {
        const e = env[z];
        fix = hot ? (e.lamp > 0.05 ? 'turn the heat lamp down' : 'cool the room thermostat') : e.lamp < 0.95 ? 'turn the heat lamp up' : 'warm the room thermostat';
      }
      add(z, st.tSev + 0.5, hot ? 'hot' : 'cold', `${Z} is too ${hot ? 'hot' : 'chilly'}${whom}: ${fmt(st.T)}, comfy is ${fmt(band.t[0])}–${fmt(band.t[1])}. ${fix[0].toUpperCase() + fix.slice(1)}.`, { kind: 'climate', zone: z });
    }
    if (st.mState !== 'ok') {
      const dry = st.mState === 'dry';
      const e = env[z];
      const sps = dry ? band.mLo : band.mHi;
      const whom = sps.length ? ` for the ${who(sps)}` : '';
      if (dry && e.water <= 0.001 && e.mister > 0.02) {
        add(z, st.mSev + 0.6, 'drop', `The ${z} mister's jug has run dry, so the air is drying out${whom}. Refill it.`, { kind: 'refill', zone: z });
      } else {
        add(z, st.mSev + 0.4, 'drop', `${Z} air is too ${dry ? 'dry' : 'soggy'}${whom}. Turn the mister ${dry ? 'up' : 'down'}.`, { kind: 'climate', zone: z });
      }
    }
    if (z !== 'pond') {
      const e = env[z];
      if (e.mister > 0.02 && e.water > 0.001 && e.water < 0.25) add(z, 1, 'drop', `The ${z} mister's water jug is nearly empty.`, { kind: 'refill', zone: z });
    }
    // hungry critters with nothing they fancy in sight
    const hungry = list.filter((c) => c.hunger > 0.62 && c.memory.ffT != null && !c.memory.ff && c.sp !== 'aphid');
    if (hungry.length) {
      const sps = [...new Set(hungry.map((c) => c.sp))];
      const foods = favouriteFoods(sps, canUse);
      const sev = hungry.some((c) => c.hunger > 0.85) ? 2 : 1;
      const names = foods.map((f) => FOODS[f].name.toLowerCase());
      const n = hungry.length;
      add(z, sev + 0.2, 'food', `${n} hungry ${n === 1 ? plural(sps[0], 1) : sps.length === 1 ? plural(sps[0], 2) : 'critters'} in the ${z} can't find food${names.length ? ` — try ${listWords(names)}` : ''}.`, { kind: 'feed', zone: z, food: foods[0] });
    }
  }
  const p = env.pond;
  if (p.oxygen < 0.45) add('pond', p.oxygen < 0.3 ? 3.2 : 2.2, 'drop', 'The water is short of air. Turn the filter up, cool the water, clean out old food or add a bubble stone.', { kind: 'climate', zone: 'pond' });
  if (p.clarity < 0.62) add('pond', 1.5, 'drop', 'The pond is going cloudy from leftovers. Give it a clean.', { kind: 'clean', zone: 'pond' });
  else if (p.algae > 0.55) add('pond', 1.2, 'leaf', 'Algae is taking over the pond. A clean and less lamp light will help.', { kind: 'clean', zone: 'pond' });
  if (p.filterClean < 0.35 && p.filter > 0.05) add('pond', p.filterClean < 0.1 ? 1.8 : 1.1, 'drop', 'The filter sponge is clogged with gunk, so it barely cleans. Rinse it out.', { kind: 'rinse', zone: 'pond' });
  if (env.lowWater > 0) add('pond', env.lowWater > 0.6 ? 1.8 : 1, 'drop', 'Pond water has been evaporating. Top it back up to the line.', { kind: 'topup', zone: 'pond' });
  // plants
  const wilting = w.plants.filter((pl) => !pl.dead && pl.health < 0.5 && !pl.def.memorial);
  if (wilting.length) {
    const z = env.zoneAt(wilting[0].x);
    add(z, 1, 'flower', `${wilting.length} plant${wilting.length > 1 ? 's are' : ' is'} wilting${wilting[0].thirsty ? ' — too dry' : ' — the weather is wrong for ' + (wilting.length > 1 ? 'them' : 'it')}.`, { kind: 'climate', zone: z });
  }
  const rotten = w.foods.filter((f) => !f.inWater && f.fresh < 0.35);
  if (rotten.length >= 3) add(env.zoneAt(rotten[0].x), 1, 'leaf', `${rotten.length} squishy leftovers are lying about. Tidy them before the fruit flies find them.`, { kind: 'tidy' });
  // a zone filling up: the builder can make it bigger
  for (const z of ['desert', 'pond', 'jungle']) {
    const [x0, x1] = ZONE_X[z];
    let stuff = 0;
    for (const pl of w.plants) if (!pl.dead && pl.x >= x0 && pl.x < x1) stuff += 1;
    for (const d of w.decor) if (d.x >= x0 && d.x < x1) stuff += d.def.w / 30;
    if (stuff / ((x1 - x0) / 100) > 4.2 && TANK[z] < TANK_MAX[z]) add(z, 0, 'house', `The ${z} is getting crowded. Bertie the builder can make it bigger: look in the Market.`, { kind: 'market' });
  }
  // the forecast, so a change in the weather is never a surprise
  const fc = env.forecast;
  if (fc && fc !== env.weather && (fc.temp || fc.moist)) {
    const hrs = Math.max(1, Math.round(((env.wx.change - env.time) / DAY_LEN) * 24));
    const tip = fc.temp >= 4 ? 'be ready to turn the lamps down' : fc.temp <= -4 ? 'be ready to warm things up' : fc.moist < -0.1 ? 'keep the misters topped up' : fc.moist > 0.05 ? 'the misters can take a rest' : 'nothing much to do';
    if (hrs <= 12) add(null, 0, fc.icon, `${fc.name} coming in about ${hrs} hour${hrs > 1 ? 's' : ''}: ${tip}.`, null);
  }
  needs.sort((a, b) => b.sev - a.sev);
  return needs;
}

// A to-do that flickers on and off (a hungry fish finds a crumb, then it's
// gone; the desert hovers right at the edge of too warm) shouldn't make the
// clipboard's badge blink. Each kind of need has a presence that rises
// while it's listed and falls while it isn't, and it only counts once it's
// clearly there (and stops once it's clearly gone). Real seconds. Anything
// urgent counts at once; the "just so you know" notes pass straight through.
export function needKey(n) {
  return n.icon + ':' + (n.act ? n.act.kind + ':' + (n.act.zone || '') : '') + ':' + (n.zone || '');
}
export class NeedWatch {
  constructor(tau = 4, on = 0.75, off = 0.3) {
    this.p = new Map(); // key -> { v: presence 0..1, on: counted, n: latest need }
    this.tau = tau;
    this.on = on;
    this.off = off;
  }
  // The keeper just dealt with it: drop it straight away.
  clear(key) {
    this.p.delete(key);
  }
  filter(needs, dt) {
    const k = 1 - Math.exp(-dt / this.tau);
    const here = new Set();
    for (const n of needs) {
      if (n.sev < 1) continue;
      const key = needKey(n);
      here.add(key);
      const e = this.p.get(key) || { v: 0, on: false, n };
      e.n = n;
      e.v += (1 - e.v) * k;
      if (e.v >= this.on || n.sev >= 3) e.on = true;
      this.p.set(key, e);
    }
    for (const [key, e] of this.p) {
      if (here.has(key)) continue;
      e.v -= e.v * k;
      if (e.v <= this.off) e.on = false;
      if (e.v < 0.02) this.p.delete(key);
    }
    const out = needs.filter((n) => n.sev < 1 || this.p.get(needKey(n)).on);
    // (still counted while it fades, so the badge doesn't drop and come back)
    for (const [key, e] of this.p) if (e.on && !here.has(key)) out.push(e.n);
    return out.sort((a, b) => b.sev - a.sev);
  }
}

export { listWords, plural };
