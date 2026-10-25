// Headless check of the visitors from the garden: each one comes in, keeps
// to its patch, makes its offer (or leaves its present) and goes home; a
// yes really changes the tank (and lets the keeper plant or build the same
// thing); a visit survives a save; a happy tank gets visitors of its own
// accord; and time away can bring a note or a present.
// usage: node tools/visitortest.mjs
import { World } from '../src/world/world.js';
import '../src/ai/ants.js';
import { Journal } from '../src/sim/journal.js';
import { VISITORS, VISITOR_ORDER } from '../src/data/visitors.js';
import { tankCheer } from '../src/sim/visitors.js';
import { Visitor } from '../src/entities/visitor.js';
import { SIM_DT, DAY_LEN, W, H, ZONE_X } from '../src/config.js';

let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg);
  if (!ok) failed++;
};
// A full, settled tank on a farm (not a sandbox, so the locks are real).
function tank(seed = 5) {
  const w = new World();
  w.newGame(seed, true);
  const j = new Journal();
  j.attach(w);
  j.reset();
  for (let i = 0; i < (DAY_LEN * 0.3) / SIM_DT; i++) w.step(SIM_DT);
  return { w, j };
}
function run(w, j, secs, each) {
  for (let i = 0; i < secs / SIM_DT; i++) {
    w.step(SIM_DT);
    if (i % 30 === 0) j.update(1);
    if (each) each();
  }
}

// every visitor: in, about, an offer or a present, and home again
for (const id of VISITOR_ORDER) {
  const { w, j } = tank();
  const def = VISITORS[id];
  const v = j.visitors.arrive(id);
  v.stay = 200;
  let bad = 0;
  let outside = 0;
  const [z0, z1] = ZONE_X[def.zone];
  let offer = null;
  let gift = null;
  j.visitors.onOffer = (vv) => (offer = vv.offer);
  j.visitors.onGift = (_, g) => (gift = g);
  run(w, j, 190, () => {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.y > H + 5 || v.x < 0 || v.x > W) bad++;
    if (v.state === 'stay' && !v.hidden && (v.x < z0 - 60 || v.x > z1 + 60)) outside++;
  });
  check(!bad && v.state === 'stay', `${v.name} comes in and settles down (${v.state}, at ${Math.round(v.x)})`);
  check(!outside, `${v.name} keeps to the ${def.zone}`);
  if (def.gift.kind === 'outfit') {
    check(!!gift && w.wardrobeHas(def.gift.item), `${v.name} leaves a present: ${def.gift.item} for the wardrobe`);
  } else {
    check(!!offer && v.waiting, `${v.name} has an idea, and waits for an answer`);
    const before = { decor: w.decor.length, plants: w.plants.length, airy: w.boons.airy, solid: 0 };
    const r = j.visitors.accept(id, offer, v);
    check(r.ok, `saying yes to ${v.name}: ${r.text}`);
    if (offer.kind === 'decor') check(w.decor.length === before.decor + 1 && j.canUse('decor', offer.decor), `a ${offer.decor} is built, and the keeper can place more`);
    if (offer.kind === 'sow') check(w.plants.length > before.plants && j.canUse('plant', offer.plant), `${offer.plant} is sown, and the keeper can plant it now`);
    if (offer.kind === 'tunnels') check(w.boons.airy === before.airy + 1, 'the jungle soil is aired, and its plants will grow faster');
  }
  // save mid-visit and load
  const save = JSON.parse(JSON.stringify(w.serialize()));
  const w2 = new World();
  w2.load(save);
  check(w2.visitors.length === 1 && w2.visitors[0].type === id, `${v.name}'s visit survives a save`);
  run(w, j, 200);
  check(!w.visitors.length && v.state === 'gone', `${v.name} goes home again`);
}

// an idea nobody answered is left as a note, and can be taken up later
{
  const { w, j } = tank();
  const v = j.visitors.arrive('hedgehog');
  v.stay = 130;
  run(w, j, 130 + DAY_LEN * 0.35);
  check(j.visitors.notes.length === 1 && !w.visitors.length, 'an unanswered idea is left as a note in the Visitors\' Book');
  const n = j.visitors.notes[0];
  const r = j.visitors.accept(n.id, n.offer, null);
  check(r.ok && !j.visitors.notes.length && w.decor.some((d) => d.type === 'leafPile'), 'and saying yes to the note builds the leaf pile');
}

// the lotus and the visitors' buildings are locked until a visitor brings them
{
  const { j } = tank();
  check(!j.canUse('plant', 'lotus') && !j.canUse('decor', 'leafPile') && !j.canUse('decor', 'stoneDen'), 'what only visitors bring starts locked');
}

// a happy tank gets visitors of its own accord
{
  const { w, j } = tank(9);
  const came = [];
  j.visitors.onArrive = (v) => came.push(`d${w.env.day} ${v.name}`);
  j.visitors.onOffer = (v) => j.visitors.accept(v.type, v.offer, v);
  // a keeper who feeds everyone
  let t = 0;
  run(w, j, DAY_LEN * 8, () => {
    if ((t += SIM_DT) > 60) {
      t = 0;
      for (const [f, x] of [['seedmix', 280], ['flakes', 810], ['lettuce', 1330], ['honey', 1450]]) w.addFood(f, x, 40, { vy: 20 });
    }
  });
  console.log(`    cheer ${tankCheer(w).toFixed(2)}; came: ${came.join(', ') || 'nobody'}`);
  check(came.length >= 2, `visitors come by in a happy tank (${came.length} in 8 days)`);
}

// time away
{
  const { w, j } = tank();
  w.env.time += DAY_LEN * 3;
  let got = 0;
  for (let i = 0; i < 20; i++) {
    j.visitors.lastId = '';
    if (j.visitors.awayVisit(8 * 3600)) got++;
  }
  check(got >= 8, `someone often comes by while the keeper's away overnight (${got} of 20)`);
  check(!j.visitors.awayVisit(600), 'but not after a few minutes away');
}

// a visitor loads only if it's still visiting
check(Visitor.load({ id: 1, t: 'nobody', x: 0, y: 0 }) === null, 'an unknown visitor in a save is ignored');

console.log(failed ? `\n${failed} check(s) failed` : '\nvisitors ok');
process.exit(failed ? 1 : 0);
