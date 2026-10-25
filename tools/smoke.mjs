// End-to-end smoke test in headless Chromium (phone-sized, touch).
// usage: npm test            (tests the source)
//        node tools/smoke.mjs dist   (tests the production build)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', process.argv[2] || '.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => {
    if (err) return res.writeHead(404), res.end();
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e.stack || e)));
pg.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
let failed = 0;
const check = (ok, msg) => {
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg);
  if (!ok) failed++;
};

await pg.goto(url);
await pg.waitForSelector('text=Start my farm', { timeout: 15000 });
check(true, 'welcome screen shows');
await pg.click('text=Start my farm');
// Busytown asks who to write to
await pg.waitForSelector('.name-in', { timeout: 5000 });
check(true, 'a new farm asks for a name');
await pg.fill('.name-in', 'Juniper');
await pg.click("text=That's us!");
await pg.waitForTimeout(2500);
check((await pg.evaluate(() => window.bugfarm.game.world.keeper && window.bugfarm.game.world.keeper.name)) === 'Juniper', 'the farm remembers its name');
// a new farm settles in quietly: discoveries queue for the herald rather than piling up
check((await pg.locator('#toasts .toast.big').count()) === 0, 'a new farm starts calm (no discovery cards piling up)');
const n0 = await pg.evaluate(() => window.bugfarm.game.world.creatures.length);
const sp0 = await pg.evaluate(() => Object.entries(window.bugfarm.game.world.counts).filter(([, v]) => v).length);
check(n0 > 15 && sp0 === 6, `a new farm starts with two kinds of critter per zone (${sp0} kinds, ${n0} critters)`);

// feed
await pg.click('#toolbar >> text=Feed');
await pg.waitForTimeout(300);
const f0 = await pg.evaluate(() => window.bugfarm.game.world.foods.length);
await pg.mouse.click(200, 300);
await pg.waitForTimeout(400);
const f1 = await pg.evaluate(() => window.bugfarm.game.world.foods.length);
check(f1 === f0 + 1, 'tapping with Feed drops food');

// progression: the gecko waits for a later desert level; crickets can move in
await pg.click('#toolbar >> text=Critters');
check(await pg.isVisible('.item.locked >> text=Gecko'), 'gecko is locked in a new farm');
check((await pg.locator('.item >> text=Harvester ants').count()) === 1 && (await pg.locator('.item >> text=Guppy').count()) === 1, 'the critter tray has the ant kinds and the new pond fish');
await pg.click('.item >> text=Cricket');
const c0 = await pg.evaluate(() => window.bugfarm.game.world.count('cricket'));
await pg.evaluate(() => window.bugfarm.game.cam.flyTo(250, 480));
await pg.waitForTimeout(800);
await pg.mouse.click(195, 380);
await pg.waitForTimeout(300);
const c1 = await pg.evaluate(() => window.bugfarm.game.world.count('cricket'));
check(c1 === c0 + 1, 'adopting an unlocked critter works');

// the keeper's clipboard: needs, gauges and goals
await pg.click('button[aria-label="Keeper\'s clipboard"]');
await pg.waitForTimeout(400);
check(await pg.isVisible('#sheet .zrow'), 'clipboard shows how each zone is doing');
await pg.click('#sheet .tabs >> text=Desert');
await pg.waitForTimeout(300);
check((await pg.locator('#sheet .goal').count()) === 3, 'clipboard lists the desert goals');

// climate slider
await pg.click('#toolbar >> text=Climate');
await pg.waitForTimeout(300);
await pg.evaluate(() => {
  const r = document.querySelector('#sheet input[aria-label="Heat lamp"]');
  r.value = 1;
  r.dispatchEvent(new Event('input', { bubbles: true }));
});
const lamp = await pg.evaluate(() => window.bugfarm.game.world.env.desert.lamp);
check(lamp === 1, 'heat lamp slider changes the climate');
await pg.evaluate(() => (window.bugfarm.game.world.env.jungle.water = 0.1));
await pg.click('#sheet .zonecard[data-z="jungle"] >> text=Refill');
const water = await pg.evaluate(() => window.bugfarm.game.world.env.jungle.water);
check(water > 0.99, 'refilling a mister fills its bottle');

// inspect a critter
await pg.click('#toolbar >> text=Look');
await pg.evaluate(() => {
  const { game, ui } = window.bugfarm;
  ui.select(game.world.creatures.find((c) => c.sp === 'goldfish'));
});
await pg.waitForTimeout(600);
check(await pg.isVisible('#card .thought'), 'info card shows what a critter is thinking');
check(await pg.isVisible('#card .job'), 'the card says what job a critter does');
await pg.click('#card >> text=Pet');
await pg.click('#card .card-close');

// equipment explains itself: tap the pond filter in the tank
const filterAt = await pg.evaluate(() => {
  const { game } = window.bugfarm;
  const wl = game.world.terrain.waterLevel;
  game.cam.zoom = game.cam.fitHeight * 2.4;
  game.cam.x = 1000;
  game.cam.y = wl;
  game.cam.clampAll();
  game.cam.target = null;
  return game.cam.toScreen(1016, wl + 20);
});
await pg.waitForTimeout(300);
await pg.mouse.click(filterAt[0], filterAt[1]);
await pg.waitForTimeout(400);
check((await pg.textContent('#card .card-name').catch(() => '')) === 'Pond filter' && (await pg.isVisible('#card >> text=Faster')), 'tapping the filter explains what it is, with its controls');
await pg.click('#card .card-close');

// goods: collect one from the tank, then send Busytown an order
const goods = await pg.evaluate(() => {
  const { game, journal, ui } = window.bugfarm;
  const w = game.world;
  const p = w.plants.find((q) => q.def.kind === 'lily');
  w.bloomLily(p, 0);
  const g = w.goods.find((q) => q.type === 'lily');
  ui.tap(g.x, g.y - 3, 0, 0, false);
  const got = w.pantry.lily;
  w.pantry.seeds = 9;
  journal.orders.list.push({ id: 99, who: 'florist', needs: { seeds: 2 }, why: 'Test.', stars: 2, day: 1 });
  return { got, left: w.goods.includes(g) };
});
check(goods.got === 1 && !goods.left, 'tapping a water lily collects it into the basket');
// a letter from Busytown pops up with the neighbour's portrait
await pg.evaluate(() => {
  const { journal, ui } = window.bugfarm;
  ui.newLetter(journal.orders.list[journal.orders.list.length - 1]);
});
await pg.waitForTimeout(400);
check(await pg.isVisible('#post .postcard canvas'), 'a letter pops up with a portrait of whoever wrote it');
check((await pg.textContent('#post .postcard .bubble')).includes('Dear Juniper,'), 'the letter is addressed to the keeper by name');
await pg.click('#post >> text=Later');
const coins0 = await pg.evaluate(() => window.bugfarm.game.world.coins);
await pg.click('button[aria-label="Keeper\'s clipboard"]');
await pg.click('#sheet .tabs >> text=Orders');
await pg.waitForTimeout(300);
await pg.click('#sheet .order >> text=Send it!');
await pg.waitForTimeout(400);
const sent = await pg.evaluate(() => ({ sent: window.bugfarm.journal.orders.sent, seeds: window.bugfarm.game.world.pantry.seeds, coins: window.bugfarm.game.world.coins, hearts: window.bugfarm.journal.orders.heartsOf('florist') }));
check(sent.sent === 1 && sent.seeds === 7, 'sending an order uses up the goods and thanks the farm');
check(sent.coins > coins0 && sent.hearts === 1 && (await pg.isVisible('#post .postcard.thanks')), `the neighbour pays coins and becomes a friend (${coins0} → ${sent.coins} coins)`);
await pg.click('#post >> text=Lovely!');
await pg.click('#toolbar >> text=Look');

// the Busytown Market: Flora sells moonflower seeds to a friend
await pg.evaluate(() => (window.bugfarm.game.world.coins = 100));
await pg.click('button[aria-label="Busytown Market"]');
await pg.waitForTimeout(400);
check(await pg.isVisible('text=Busytown Market') && (await pg.locator('#modal .stall').count()) >= 10, 'the purse opens the Market, with a stall for every neighbour');
await pg.click('#modal .ware:has-text("Moonflower seeds") button');
await pg.waitForTimeout(400);
const bought = await pg.evaluate(() => ({ owns: window.bugfarm.game.world.owns('moonflower'), coins: window.bugfarm.game.world.coins, plant: window.bugfarm.journal.canUse('plant', 'moonflower') }));
check(bought.owns && bought.plant && bought.coins === 70, 'buying a ware pays for it and unlocks it');
await pg.click('#modal .card-close');

// the herald brings a discovery round when there's room, and the journal button shows it's new
const herald = await pg.evaluate(async () => {
  const { ui } = window.bugfarm;
  const h = ui.herald;
  h.holdUntil = 0;
  h.last = -1e9;
  h.busyAt = -1e9;
  ui.discovery({ id: 'x', title: 'Test discovery', text: 'Something happened.' });
  await new Promise((r) => setTimeout(r, 500));
  // (the oldest waiting discovery comes first)
  return { card: [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('Discovery:')), dot: !ui.journalDot.classList.contains('hidden') };
});
check(herald.card && herald.dot, 'the herald shows a discovery, and the journal button has a dot');
// journal & settings
await pg.click('#toolbar >> text=Journal');
check(await pg.isVisible('text=Field Journal'), 'journal opens');
check(await pg.evaluate(() => window.bugfarm.ui.journalDot.classList.contains('hidden')), 'opening the journal clears its dot');
await pg.click('#modal .tabs >> text=Field guide');
await pg.click('#modal .card-close');
await pg.click('button[aria-label="Settings"]');
check(await pg.isVisible('text=Export to file'), 'settings open');
await pg.click('#modal .card-close');

// run fast for a bit
await pg.evaluate(() => window.bugfarm.ui.setSpeed(8));
await pg.waitForTimeout(4000);
const perf = await pg.evaluate(() => ({ frame: window.bugfarm.game.avgFrame, sim: window.bugfarm.game.simMs }));
check(perf.frame < 40, `frames stay smooth at 8× (${perf.frame.toFixed(1)}ms frame, ${perf.sim.toFixed(1)}ms sim)`);

// save & reload
const before = await pg.evaluate(() => {
  const { game, journal } = window.bugfarm;
  journal.progress.levels.pond = 2;
  window.bugfarm.ui.hooks.save();
  return { n: game.world.creatures.length, day: game.world.env.day, t: game.world.env.time };
});
await pg.reload();
await pg.waitForTimeout(3000);
const welcome = await pg.isVisible('text=Start my farm');
const after = await pg.evaluate(() => ({ n: window.bugfarm.game.world.creatures.length, t: window.bugfarm.game.world.env.time, pond: window.bugfarm.journal.progress.levels.pond, shrimp: window.bugfarm.journal.canUse('adopt', 'shrimp'), sent: window.bugfarm.journal.orders.sent, lily: window.bugfarm.game.world.pantry.lily, moon: window.bugfarm.game.world.owns('moonflower'), hearts: window.bugfarm.journal.orders.heartsOf('florist'), coins: window.bugfarm.game.world.coins }));
check(!welcome, 'reload skips the welcome (save found)');
check(Math.abs(after.n - before.n) <= 3 && after.t >= before.t, `tank restored after reload (${before.n} → ${after.n} critters)`);
check(after.pond === 2 && after.shrimp, 'farm levels and unlocks survive a reload');
check(after.sent === 1 && after.lily >= 1, 'the basket and sent orders survive a reload');
check(after.moon && after.hearts === 1 && after.coins >= 70, 'coins, friendships and Market wares survive a reload');

// the builder makes the desert bigger: the game saves, widens the tank and comes back to it
await pg.evaluate(() => {
  const { game, journal, ui } = window.bugfarm;
  journal.progress.levels.desert = 2;
  game.world.coins = 200;
  ui.openMarket();
});
await pg.waitForTimeout(300);
await pg.locator('#modal .ware', { hasText: 'Bigger desert' }).locator('button').click();
await pg.waitForEvent('load', { timeout: 15000 });
await pg.waitForTimeout(2500);
const built = await pg.evaluate(() => {
  const { game } = window.bugfarm;
  const w = game.world;
  return { cols: w.terrain.groundTop.length, n: w.creatures.length, coins: w.coins, name: w.keeper && w.keeper.name, toast: [...document.querySelectorAll('#toasts .toast')].some((t) => t.textContent.includes('desert is bigger')) };
});
check(built.cols === 464 && built.coins <= 150 && built.coins >= 135, `the builder widens the desert (${built.cols * 4} wide, ${built.coins} coins left)`);
check(Math.abs(built.n - after.n) <= 3 && built.name === 'Juniper' && built.toast, `everyone moves into the bigger tank, and it's celebrated (${built.n} critters)`);

check(errors.length === 0, 'no errors on the page' + (errors.length ? ':\n' + [...new Set(errors)].slice(0, 6).join('\n') : ''));
await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall good');
process.exit(failed ? 1 : 0);
