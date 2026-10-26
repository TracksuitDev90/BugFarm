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
    await pg.click('text=Sandbox: full tank');
    await pg.waitForTimeout(1500);
    await shot('02-tank');
  },
  async tools() {
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
    await pg.click('text=Sandbox: full tank');
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
  // the basket's flavours, letters asking for a flavour, prize goods and a
  // critter, and choosing who goes
  async orders() {
    await pg.click('text=Sandbox: full tank');
    await pg.waitForTimeout(800);
    if (await pg.isVisible('text=Who lives here?')) {
      await pg.fill('#modal input', 'Juniper');
      await pg.click('text=That\'s us!');
      await pg.waitForTimeout(400);
    }
    await pg.evaluate(() => {
      const { game, journal, ui } = window.bugfarm;
      const w = game.world;
      const ord = journal.orders;
      for (let i = 0; i < 30 * 60; i++) w.step(1 / 30);
      w.stashGood('honey', 'clover', false, 3);
      w.stashGood('honey', 'wild', false, 2);
      w.stashGood('honey', 'lavender', true, 1);
      w.stashGood('lily', 'gold', false, 1);
      w.stashGood('silk', 'morpho', false, 1);
      w.stashGood('seeds', 'poppy', true, 2);
      w.stashGood('compost', 'castings', false, 2);
      ord.list.length = 0;
      ord.list.push({ id: 901, who: 'baker', needs: { honey: 2 }, flav: { honey: 'clover' }, why: 'Grandmother\'s recipe says clover honey, and only clover honey.', stars: 6, coins: 30, day: 1, t: Math.round(w.time) });
      ord.list.push({ id: 902, who: 'mayor', needs: { lily: 1 }, best: true, why: 'It\'s for the Busytown show, so only your very best will do!', stars: 4, coins: 20, day: 1, t: Math.round(w.time) });
      ord.list.push({ id: 903, who: 'school', needs: {}, critter: { sp: 'cricket' }, why: 'The class would love a grown-up cricket to sing at story time.', stars: 2, coins: 10, day: 1, t: Math.round(w.time) });
      ui.openOrders();
    });
    await pg.waitForTimeout(1200);
    await shot('orders');
    await pg.evaluate(() => document.querySelector('.sheet .body, .sheet') && document.querySelector('.order.pet').scrollIntoView());
    await pg.waitForTimeout(300);
    await shot('orders-2');
    await pg.click('text=Choose who goes');
    await pg.waitForTimeout(800);
    await shot('orders-pick');
    await pg.click('.pick-btns >> text=/^Send /');
    await pg.waitForTimeout(1500);
    await shot('orders-sent');
  },
  // visitors from the garden: in the tank, an idea, what a yes does, and
  // the Visitors' Book
  async visitors() {
    await pg.click('text=Sandbox: full tank');
    await pg.waitForTimeout(800);
    if (await pg.isVisible('text=Who lives here?')) {
      await pg.fill('#modal input', 'Juniper');
      await pg.click('text=That\'s us!');
      await pg.waitForTimeout(400);
    }
    const look = async (name, ids, zoom, secs = 25) => {
      await pg.evaluate(([ids, zoom, secs]) => {
        const { game, journal, ui } = window.bugfarm;
        const w = game.world;
        w.visitors.length = 0;
        const vs = [];
        for (const id of ids) {
          const v = journal.visitors.arrive(id);
          v.stay = 9999;
          v.asked = true;
          vs.push(v);
        }
        for (let i = 0; i < 30 * secs; i++) w.step(1 / 30);
        game.cam.zoom = game.cam.fitHeight * zoom;
        game.cam.x = vs.reduce((a, v) => a + v.x, 0) / vs.length;
        game.cam.y = vs.reduce((a, v) => a + v.y, 0) / vs.length - 20;
        game.cam.clampAll();
        ui.post.q.length = 0;
        ui.post.next();
        document.querySelectorAll('.toast').forEach((t) => t.remove());
      }, [ids, zoom, secs]);
      await pg.waitForTimeout(1200);
      await shot(name);
    };
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      for (let i = 0; i < 30 * 200; i++) w.step(1 / 30);
    });
    for (const id of ['robin', 'hedgehog', 'kingfisher', 'vole', 'tortoise', 'crab', 'mole']) await look('visit-' + id, [id], 3.2);
    // an idea, and saying yes
    await pg.evaluate(() => {
      const { game, journal } = window.bugfarm;
      const w = game.world;
      w.visitors.length = 0;
      const v = journal.visitors.arrive('mole');
      v.stay = 9999;
      window.bugfarm.ui.post.q.length = 0;
      window.bugfarm.ui.post.next();
      // (a visitor makes their offer a couple of minutes after coming in)
      journal.visitors.letterT = -1e9;
      for (let i = 0; i < 30 * 130; i++) {
        w.step(1 / 30);
        if (i % 30 === 0) journal.update(1);
      }
      game.cam.zoom = game.cam.fitHeight * 1.4;
      game.cam.x = v.x;
      game.cam.y = v.y + 40;
      game.cam.clampAll();
    });
    await pg.waitForTimeout(1500);
    await shot('visit-offer');
    await pg.click('text=Yes please, Mortimer!');
    await pg.waitForTimeout(2500);
    await shot('visit-yes');
    await pg.evaluate(() => {
      const { journal } = window.bugfarm;
      const vs = journal.visitors;
      vs.leaveNote('hedgehog', vs.giftFor('hedgehog'));
      window.bugfarm.ui.openJournal('visitors');
    });
    await pg.waitForTimeout(800);
    await shot('visit-book');
  },
  // the wardrobe: dressing a critter up, and the hats at the Market
  async dressup() {
    await pg.click('text=Sandbox: full tank');
    await pg.waitForTimeout(800);
    if (await pg.isVisible('text=Who lives here?')) {
      await pg.fill('#modal input', 'Juniper');
      await pg.click('text=That\'s us!');
      await pg.waitForTimeout(400);
    }
    await pg.evaluate(() => {
      const { game, ui } = window.bugfarm;
      const w = game.world;
      const c = w.creatures.find((k) => k.sp === 'snail' && k.isAdult) || w.creatures.find((k) => k.sp === 'beetle');
      game.cam.zoom = game.cam.fitHeight * 2.4;
      game.cam.x = c.x;
      game.cam.y = c.y;
      game.cam.clampAll();
      ui.select(c);
      ui.dressUp(c);
    });
    await pg.waitForTimeout(800);
    await shot('dress-1');
    await pg.click('.wear >> text=Top hat');
    await pg.click('.dye >> nth=1');
    await pg.waitForTimeout(400);
    await shot('dress-2');
    await pg.click('text=Looking good!');
    await pg.waitForTimeout(1500);
    await shot('dress-3');
    // a parade: a few critters in their best
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      const w = game.world;
      const hats = ['toque', 'party', 'tophat', 'mortar', 'mailcap', 'nurse', 'flowercrown', 'straw', 'bucket', 'hardhat', 'propeller', 'kerchief', 'feather', 'pearls'];
      let i = 0;
      for (const c of w.creatures) {
        if (!c.isAdult || c.role || !['beetle', 'cricket', 'gecko', 'goldfish', 'frog', 'turtle', 'snail', 'ladybug', 'koi', 'pillbug', 'firefly', 'butterfly'].includes(c.sp)) continue;
        w.dress(c, hats[i++ % hats.length], ['#d9483b', '#4c8fd6', '#77b255', '#8d6cc0'][i % 4]);
      }
      game.cam.zoom = game.cam.fitHeight * 3;
      game.cam.x = 1340;
      game.cam.y = w.terrain.surfaceY(1340) - 50;
      game.cam.clampAll();
      document.querySelectorAll('.toast, #post, #card').forEach((t) => t.classList.add('hidden'));
    });
    await pg.waitForTimeout(1500);
    await shot('dress-jungle');
    await pg.evaluate(() => {
      const { game } = window.bugfarm;
      game.cam.x = 820;
      game.cam.y = game.world.terrain.waterLevel + 120;
      game.cam.clampAll();
    });
    await pg.waitForTimeout(1200);
    await shot('dress-pond');
    await pg.evaluate(() => window.bugfarm.ui.openMarket());
    await pg.waitForTimeout(800);
    await shot('market');
  },
};
await steps[scenario]();
if (errors.length) console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 10).join('\n'));
else console.log('ok');
await browser.close();
server.close();
