// Performance check with CPU throttling to mimic old phones.
// usage: node tools/perf.mjs [dir=dist] [throttle=6]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', process.argv[2] || 'dist');
const rate = +(process.argv[3] || 6);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (err, data) => (err ? (res.writeHead(404), res.end()) : (res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }), res.end(data))));
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const pg = await ctx.newPage();
await pg.goto(`http://localhost:${server.address().port}/`);
await pg.waitForSelector('text=Sandbox: full tank');
await pg.click('text=Sandbox: full tank');
await pg.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(pg);
await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const measure = async (label, setup) => {
  await pg.evaluate(setup);
  await pg.waitForTimeout(1500);
  const r = await pg.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const t0 = last;
        const f = (now) => {
          times.push(now - last);
          last = now;
          if (now - t0 < 4000) requestAnimationFrame(f);
          else {
            times.sort((a, b) => a - b);
            const g = window.bugfarm.game;
            resolve({ fps: times.length / 4, p95: times[Math.floor(times.length * 0.95)], work: g.avgFrame, sim: g.simMs, q: g.renderer.qualityName, n: g.world.creatures.length });
          }
        };
        requestAnimationFrame(f);
      })
  );
  console.log(`${label.padEnd(34)} fps ${r.fps.toFixed(0).padStart(3)}  p95 ${r.p95.toFixed(1).padStart(5)}ms  work ${r.work.toFixed(1).padStart(5)}ms (sim ${r.sim.toFixed(1)}ms)  quality=${r.q} critters=${r.n}`);
};
console.log(`CPU throttle ${rate}x, 390x844 @3x`);
await measure('portrait default, 1x', () => {
  const { game, ui } = window.bugfarm;
  ui.setSpeed(1);
  game.cam.reset();
});
await measure('zoomed into ant nest, 1x', () => {
  const { game } = window.bugfarm;
  game.cam.zoom = 3;
  game.cam.x = 240;
  game.cam.y = 560;
  game.cam.clampAll();
});
await measure('whole tank, 1x', () => {
  const { game } = window.bugfarm;
  game.cam.zoom = game.cam.fitAll;
  game.cam.clampAll();
});
await measure('whole tank, 8x', () => window.bugfarm.ui.setSpeed(8));
await measure('busy tank (+80 critters), 3x', () => {
  const { game, ui } = window.bugfarm;
  ui.setSpeed(3);
  const w = game.world;
  for (let i = 0; i < 20; i++) w.adopt('ant', 200, 400);
  for (const sp of ['pillbug', 'firefly', 'shrimp', 'pondsnail', 'ladybug', 'snail', 'cricket']) for (let i = 0; i < 8; i++) w.adopt(sp, sp === 'shrimp' || sp === 'pondsnail' ? 800 : sp === 'cricket' ? 300 : 1300, sp === 'shrimp' || sp === 'pondsnail' ? 650 : 400);
  game.cam.reset();
});
await browser.close();
server.close();
