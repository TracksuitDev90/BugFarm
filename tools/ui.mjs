// Dev helper: drive the real UI in a phone-sized headless browser and take screenshots.
// usage: node tools/ui.mjs <scenario> <outdir> [w] [h]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [, , scenario = 'start', outDir = '.', w = '390', h = '844'] = process.argv;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: true, isMobile: +w < 900 });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e.stack || e)));
pg.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
const shot = async (name) => pg.screenshot({ path: path.join(outDir, name + '.png') });
await pg.goto(`http://localhost:${port}/index.html`);
await pg.waitForTimeout(1200);
const steps = {
  async start() {
    await shot('01-welcome');
    await pg.click('text=Full tank');
    await pg.waitForTimeout(1500);
    await shot('02-tank');
  },
  async tools() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(800);
    for (const t of ['Feed', 'Critters', 'Plants', 'Decor', 'Shape', 'Climate']) {
      await pg.click(`#toolbar >> text=${t}`);
      await pg.waitForTimeout(500);
      await shot('tool-' + t.toLowerCase());
    }
    await pg.click('#toolbar >> text=Journal');
    await pg.waitForTimeout(500);
    await shot('journal');
  },
  async night() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 60 * 6; i++) w.step(1 / 30);
      w.env.time = Math.floor(w.env.time / 720) * 720 + 720 * (22.5 / 24);
      for (let i = 0; i < 30 * 40; i++) w.step(1 / 30);
      game.cam.zoom = game.cam.fitHeight * 2.2;
      game.cam.x = 1360;
      game.cam.y = 420;
      game.cam.clampAll();
    });
    await pg.waitForTimeout(1500);
    await shot('night');
  },
  async pond() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 120; i++) w.step(1 / 30);
      game.cam.zoom = game.cam.fitHeight * 2.4;
      game.cam.x = 800;
      game.cam.y = 600;
      game.cam.clampAll();
    });
    await pg.waitForTimeout(1500);
    await shot('pond');
  },
  async later() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 720 * 2; i++) w.step(1 / 30);
      game.cam.reset();
    });
    await pg.waitForTimeout(2500);
    await shot('later');
  },
  async landscape() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(800);
    await pg.click('#toolbar button[aria-label="Critters"]');
    await pg.waitForTimeout(300);
    await pg.evaluate(() => {
      const { game, ui } = window.bugfarm;
      ui.select(game.world.creatures.find((k) => k.sp === 'turtle'));
    });
    await pg.waitForTimeout(800);
    await shot('landscape');
  },
  async jungle() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 200; i++) w.step(1 / 30);
      game.cam.zoom = game.cam.fitHeight * 3.2;
      game.cam.x = 1300;
      game.cam.y = 420;
      game.cam.clampAll();
    });
    await pg.waitForTimeout(1500);
    await shot('jungle');
  },
  async readme() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 720 * 1.15; i++) w.step(1 / 30);
      w.env.time = Math.floor(w.env.time / 720) * 720 + 720 * (13 / 24);
      for (let i = 0; i < 30 * 30; i++) w.step(1 / 30);
      game.cam.reset();
      document.querySelectorAll('.toast').forEach((t) => t.remove());
    });
    await pg.waitForTimeout(2500);
    await pg.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await shot('readme');
  },
  async inspect() {
    await pg.click('text=Full tank');
    await pg.waitForTimeout(800);
    // fly to the jungle and tap a critter via the page API
    await pg.evaluate(() => {
      const { game, ui } = window.bugfarm;
      const c = game.world.creatures.find((k) => k.sp === 'snail') || game.world.creatures[0];
      game.cam.zoom = 2.2;
      game.cam.x = c.x;
      game.cam.y = c.y;
      game.cam.clampAll();
      ui.select(c);
    });
    await pg.waitForTimeout(1500);
    await shot('inspect');
  },
};
await steps[scenario]();
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
else console.log('ok');
await browser.close();
server.close();
