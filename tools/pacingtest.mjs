// How busy a new farm feels: plays the first hour of a new farm at 1x (with
// a relaxed keeper who feeds now and then and sends what's ready) and logs
// every interruption the keeper would actually see, as the UI paces them:
// discoveries, news and level-ups through the herald, Busytown's letters,
// and new to-dos on the clipboard (steadied the way the badge is). Fails if
// a new farm gets noisy again.
// usage: node tools/pacingtest.mjs [minutes=60] [seed=3] [-v]
const args = process.argv.slice(2).filter((a) => a !== '-v');
const verbose = process.argv.includes('-v');
const mins = +(args[0] || 60);
const seed = +(args[1] || 3);
// (the same farm every time for a seed, so the check never flickers)
let rs = (seed * 2654435761) >>> 0;
Math.random = () => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const { World } = await import('../src/world/world.js');
await import('../src/ai/ants.js');
const { Journal } = await import('../src/sim/journal.js');
const { tankNeeds, NeedWatch, needKey } = await import('../src/sim/care.js');
const { Herald, newsPriority } = await import('../src/ui/herald.js');
const { SIM_DT, DAY_LEN } = await import('../src/config.js');
const w = new World();
w.newGame(seed, 'farm');
const j = new Journal();
j.attach(w);
j.reset();
const herald = new Herald();
const watch = new NeedWatch();
const seen = []; // [minute, kind, text]
const clock = () => (w.time - DAY_LEN / 3) / 60;
let letterT = -1; // a letter card is up (the keeper is reading it)
j.onUnlock = (d) => herald.push({ prio: d.reward ? 2 : 1, kind: 'discovery', text: d.title });
j.progress.onLevel = (z, lv) => herald.push({ prio: 3, kind: 'level', text: `${z} ${lv}` });
j.orders.onOrder = (o) => {
  seen.push([clock(), 'letter', o.who]);
  herald.note();
  letterT = 10;
};
w.events.on('log', (l) => {
  const nw = newsPriority(l);
  if (nw) herald.push({ prio: nw.prio, kind: 'news', key: nw.key, text: l.text.slice(0, 64) });
});
herald.hold(60); // the welcome tips, then a minute to look round
let counted = new Set();
const steps = Math.round((mins * 60) / SIM_DT);
for (let i = 0; i < steps; i++) {
  w.step(SIM_DT);
  if (letterT > 0) letterT -= SIM_DT;
  if (i % 30 === 0) j.update(1);
  const it = herald.tick(SIM_DT, (w.time - DAY_LEN / 3) / DAY_LEN, letterT > 0);
  if (it) seen.push([clock(), it.kind, it.kind === 'summary' ? `${it.n} waiting in the journal` : it.text]);
  if (i % 30 === 0) {
    const now = new Set(watch.filter(tankNeeds(w), 1).filter((n) => n.sev >= 1).map(needKey));
    for (const k of now) if (!counted.has(k)) seen.push([clock(), 'to-do', k]);
    counted = now;
  }
  // a relaxed keeper: every 5 minutes a snack for each zone, collect, send
  if (i && i % Math.round(300 / SIM_DT) === 0) {
    for (const [f, x] of [['seedmix', 280], ['flakes', 810], ['lettuce', 1330]]) w.addFood(f, x, 40, { vy: 20 });
    for (const g of [...w.goods]) w.collectGood(g);
    for (const o of j.orders.ready()) j.orders.send(o);
  }
}
if (verbose) for (const [t, k, s] of seen) console.log(t.toFixed(1).padStart(5) + 'm  ' + k.padEnd(10) + s);
const pops = seen.filter((e) => e[1] !== 'to-do');
const by = {};
for (const e of seen) by[e[1]] = (by[e[1]] || 0) + 1;
const gaps = [];
for (let i = 1; i < pops.length; i++) gaps.push(pops[i][0] - pops[i - 1][0]);
gaps.sort((a, b) => a - b);
const median = gaps.length ? gaps[gaps.length >> 1] : mins;
const first10 = pops.filter((e) => e[0] < 10).length;
const firstLetter = seen.find((e) => e[1] === 'letter');
const todo30 = seen.filter((e) => e[1] === 'to-do' && e[0] < 30).length;
console.log(`first ${mins} min: ${JSON.stringify(by)}`);
console.log(`pop-ups ${pops.length}, median gap ${median.toFixed(2)} min, ${first10} in the first 10 min; first letter at ${firstLetter ? firstLetter[0].toFixed(1) + ' min' : 'none'}; ${todo30} new to-dos in the first 30 min`);
const fails = [];
if (first10 > 8) fails.push(`${first10} pop-ups in the first 10 minutes (want at most 8; it was 13 to 15 before the herald)`);
if (mins >= 30 && median < 1) fails.push(`pop-ups only ${median.toFixed(2)} min apart on average (want at least 1)`);
if (firstLetter && firstLetter[0] < 2.5) fails.push(`the first letter came after ${firstLetter[0].toFixed(1)} min (want at least 2.5)`);
if (mins >= 30 && todo30 > 14) fails.push(`${todo30} new to-dos in the first half hour (want at most 14)`);
if (fails.length) {
  console.log('PACING FAILED:\n  ' + fails.join('\n  '));
  process.exit(1);
}
console.log('pacing ok');
