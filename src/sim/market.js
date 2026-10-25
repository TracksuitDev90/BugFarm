// Buying from the Busytown Market. A ware is offered once the farm is good
// enough friends with whoever makes it, costs coins, and does its job from
// the moment it's bought: a gadget switches on, a building is put up in a
// sensible spot, new critters arrive, new seeds are sown.
import { WARES, WARE_BY_ID } from '../data/market.js';
import { DECOR } from '../data/decor.js';
import { SPECIES } from '../data/species.js';
import { ZONE_X, ZONE_MID, W, X, TANK } from '../config.js';
import { tankTier, tankTiers } from './tank.js';
import { ZONE_NAMES } from './care.js';
import { rrange } from '../util/rng.js';


// Where a ware stands: 'owned' | 'sale' (offered, maybe not affordable yet)
// | 'locked' (needs more friendship). Stock wares are never 'owned'.
export function wareState(journal, w, ware) {
  const free = journal.sandbox;
  const hearts = journal.orders.heartsOf(ware.who);
  if (ware.kind === 'build') {
    // a step at a time, each once the zone has grown enough
    const z = ware.zone;
    const tier = tankTier(TANK, z);
    const max = tankTiers(z);
    if (tier >= max) return { owned: true, need: 0, hearts, cost: 0, state: 'owned', afford: true, tier, max };
    const t = ware.tiers[tier];
    const p = journal.progress;
    const locked = !free && !p.legacy && p.levels[z] < t.level;
    const cost = free ? 0 : t.cost;
    return { owned: false, need: locked ? 1 : 0, lock: `when the ${ZONE_NAMES[z].toLowerCase()} reaches level ${t.level}`, hearts, cost, state: locked ? 'locked' : 'sale', afford: w.coins >= cost, tier, max };
  }
  const need = free ? 0 : Math.max(0, ware.hearts - hearts);
  const owned = ware.kind !== 'stock' && w.owns(ware.id);
  const cost = free ? 0 : ware.cost;
  return { owned, need, hearts, cost, state: owned ? 'owned' : need > 0 ? 'locked' : 'sale', afford: w.coins >= cost };
}

// What the keeper has "seen" of a ware: each new step of building is news.
export function wareKey(ware) {
  return ware.kind === 'build' ? ware.id + ':' + tankTier(TANK, ware.zone) : ware.id;
}

// Wares on sale right now that the keeper hasn't bought.
export function onSale(journal, w) {
  return WARES.filter((wr) => wareState(journal, w, wr).state === 'sale' && wr.kind !== 'stock');
}

// A decoration's spot: open ground (or the lid) in its zone, near the middle.
function findSpot(w, type, zone) {
  const def = DECOR[type];
  const [x0, x1] = ZONE_X[zone];
  const mid = ZONE_MID[zone];
  for (let i = 0; i < 40; i++) {
    const x = Math.round(Math.max(x0 + 30, Math.min(x1 - 30, mid + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 22 + rrange(-6, 6))));
    if (x < 30 || x > W - 30) continue;
    if (def.place !== 'top' && w.decor.some((d) => Math.abs(d.x - x) < (d.def.w + def.w) * 0.45)) continue;
    if (w.canPlace('decor', type, x, null).ok) return x;
  }
  return null;
}

// The zone a building suits best.
function homeZone(w, type) {
  if (type === 'butterflyHouse') return 'jungle';
  if (type === 'hamper') {
    // the corner with the most mouths to feed and no hamper yet
    let best = 'jungle';
    let bn = -1;
    for (const z of ['desert', 'pond', 'jungle']) {
      if (w.decor.some((d) => d.type === 'hamper' && w.env.zoneAt(d.x) === z)) continue;
      const n = w.creatures.filter((c) => !c.dead && w.env.zoneAt(c.x) === z).length;
      if (n > bn) {
        bn = n;
        best = z;
      }
    }
    return best;
  }
  if (type === 'schoolhouse') return 'desert';
  return 'jungle';
}

export function placeWare(w, type) {
  for (const z of [homeZone(w, type), 'jungle', 'desert']) {
    const x = findSpot(w, type, z);
    if (x == null) continue;
    const r = w.placeDecor(type, x, null);
    if (r.ok) {
      w.sparkle(x, r.d.y - 20, 12);
      return r.d;
    }
  }
  return null;
}

// Pay for a ware and put it to work. Returns { ok, msg, d?, c? }.
export function buy(journal, w, ware) {
  if (typeof ware === 'string') ware = WARE_BY_ID[ware];
  if (!ware) return { ok: false, msg: 'Nothing like that for sale.' };
  const st = wareState(journal, w, ware);
  if (st.state === 'owned') return { ok: false, msg: 'You have one already.' };
  if (st.state === 'locked') return { ok: false, msg: `Help them ${st.need} more time${st.need === 1 ? '' : 's'} first.` };
  if (!w.spend(st.cost)) return { ok: false, msg: `That costs ${st.cost} coins. Send a few more orders!` };
  const out = { ok: true, msg: '' };
  if (ware.kind === 'build') {
    // (the game saves, widens the saved tank and comes back to it)
    out.build = ware.zone;
    out.cost = st.cost;
    out.msg = 'Bertie\'s builders are on their way!';
    w.addLog(`Bertie Bricks is making the ${ware.zone} bigger.`, 'coin');
    w.events.emit('bought', { ware, d: null });
    return out;
  }
  if (ware.kind === 'stock') {
    w.stock[ware.id] = (w.stock[ware.id] || 0) + ware.stock;
    out.msg = `${ware.stock} ${ware.name.toLowerCase()} in your basket. Find them in Feed.`;
  } else {
    w.perks[ware.id] = true;
    if (ware.kind === 'decor') {
      out.d = placeWare(w, ware.decor);
      out.msg = out.d ? `The ${DECOR[ware.decor].name.toLowerCase()} is up and open for business!` : `No room for it just now. Find it in Decor.`;
    } else if (ware.kind === 'critter') {
      // the first ones come with it, settled into the pond
      const sp = ware.sp;
      const n = sp === 'axolotl' ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const r = w.adopt(sp, ZONE_MID.pond - 50 + i * 70 + rrange(-20, 20), w.terrain.waterLevel + 60);
        if (r.ok && r.c) out.c = r.c;
      }
      out.msg = `${n === 1 ? 'Your new ' + SPECIES[sp].name.toLowerCase() + ' is' : 'Your new ' + SPECIES[sp].plural.toLowerCase() + ' are'} in the pond! More can be adopted from Critters.`;
    } else if (ware.kind === 'plant') {
      for (const x of [X(1200), X(1450)]) w.placePlant(ware.plant, x + rrange(-30, 30));
      out.msg = 'Two moonflowers planted in the jungle. Watch them after dark!';
    } else if (ware.id === 'courier') {
      out.c = w.ensureCourier();
      out.msg = 'Dash the mail dragonfly is on the job!';
    } else out.msg = `${ware.name} installed!`;
  }
  w.addLog(`Bought the ${ware.name.toLowerCase()} at the Busytown Market.`, 'coin');
  w.events.emit('bought', { ware, d: out.d || null });
  return out;
}
