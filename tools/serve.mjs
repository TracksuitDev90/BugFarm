// Tiny static file server for local play/dev. usage: npm run dev [-- dist] [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const base = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', process.argv[2] || '.');
const port = +(process.argv[3] || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
http
  .createServer((req, res) => {
    let p = path.join(base, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(base)) return res.writeHead(403), res.end();
    if (p.endsWith(path.sep) || p === base) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) return res.writeHead(404), res.end('not found');
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Critter Farm running at http://localhost:${port}/  (serving ${base})`));
