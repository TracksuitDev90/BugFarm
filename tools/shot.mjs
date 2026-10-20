// Dev helper: serve the repo and screenshot a page with headless Chromium.
// usage: node tools/shot.mjs <path> <out.png> [width] [height] [waitMs] [fullPage]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [, , page = 'index.html', out = 'shot.png', w = '1280', h = '800', wait = '1500', full = '0'] = process.argv;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p.endsWith('/') ? p + 'index.html' : p, (err, data) => {
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
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e.stack || e)));
pg.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
});
await pg.goto(`http://localhost:${port}/${page}`);
await pg.waitForTimeout(+wait);
await pg.screenshot({ path: out, fullPage: full === '1' });
if (errors.length) console.log('ERRORS (' + errors.length + '):\n' + [...new Set(errors)].slice(0, 8).join('\n'));
else console.log('ok');
await browser.close();
server.close();
