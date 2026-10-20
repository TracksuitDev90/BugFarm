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
await pg.waitForSelector('text=Full tank', { timeout: 15000 });
check(true, 'welcome screen shows');
await pg.click('text=Full tank');
await pg.waitForTimeout(2500);
const n0 = await pg.evaluate(() => window.bugfarm.game.world.creatures.length);
check(n0 > 40, `tank is populated (${n0} critters)`);

// feed
await pg.click('#toolbar >> text=Feed');
await pg.waitForTimeout(300);
const f0 = await pg.evaluate(() => window.bugfarm.game.world.foods.length);
await pg.mouse.click(200, 300);
await pg.waitForTimeout(400);
const f1 = await pg.evaluate(() => window.bugfarm.game.world.foods.length);
check(f1 === f0 + 1, 'tapping with Feed drops food');

// adopt a gecko in the desert
await pg.click('#toolbar >> text=Critters');
await pg.click('.item >> text=Gecko');
const g0 = await pg.evaluate(() => window.bugfarm.game.world.count('gecko'));
await pg.evaluate(() => window.bugfarm.game.cam.flyTo(250, 480));
await pg.waitForTimeout(800);
await pg.mouse.click(195, 380);
await pg.waitForTimeout(300);
const g1 = await pg.evaluate(() => window.bugfarm.game.world.count('gecko'));
check(g1 === g0 + 1, 'adopting a gecko works');

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

// inspect a critter
await pg.click('#toolbar >> text=Look');
await pg.evaluate(() => {
  const { game, ui } = window.bugfarm;
  ui.select(game.world.creatures.find((c) => c.sp === 'goldfish'));
});
await pg.waitForTimeout(600);
check(await pg.isVisible('#card .thought'), 'info card shows what a critter is thinking');
await pg.click('#card >> text=Pet');
await pg.click('#card .card-close');

// journal & settings
await pg.click('#toolbar >> text=Journal');
check(await pg.isVisible('text=Field Journal'), 'journal opens');
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
  const { game } = window.bugfarm;
  window.bugfarm.ui.hooks.save();
  return { n: game.world.creatures.length, day: game.world.env.day, t: game.world.env.time };
});
await pg.reload();
await pg.waitForTimeout(3000);
const welcome = await pg.isVisible('text=Full tank');
const after = await pg.evaluate(() => ({ n: window.bugfarm.game.world.creatures.length, t: window.bugfarm.game.world.env.time }));
check(!welcome, 'reload skips the welcome (save found)');
check(Math.abs(after.n - before.n) <= 3 && after.t >= before.t, `tank restored after reload (${before.n} → ${after.n} critters)`);

check(errors.length === 0, 'no errors on the page' + (errors.length ? ':\n' + [...new Set(errors)].slice(0, 6).join('\n') : ''));
await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall good');
process.exit(failed ? 1 : 0);
