// Renders the app icons using the game's own art. usage: node tools/make-icons.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) return res.writeHead(404), res.end();
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'text/javascript' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const pg = await browser.newPage();
for (const [size, mask, name] of [[512, 0, 'icon-512.png'], [192, 0, 'icon-192.png'], [180, 0, 'icon-180.png'], [512, 1, 'maskable-512.png'], [32, 0, 'favicon-32.png']]) {
  await pg.setViewportSize({ width: size, height: size });
  await pg.goto(`http://localhost:${port}/tools/icons.html?size=${size}&maskable=${mask}`);
  await pg.waitForFunction(() => window.__done);
  const el = await pg.$('#c');
  await el.screenshot({ path: path.join(root, 'assets/icons', name), omitBackground: !mask });
  console.log('wrote', name);
}
await browser.close();
server.close();
