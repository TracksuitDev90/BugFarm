// Fits each swimmer's collision hull to its real drawing: renders every look,
// tail beat and swimming pose, takes everything any of them paints, and
// covers it with a few circles along the body (each the smallest circle round
// its stretch of the body). The sim keeps every circle in the water and out
// of the ground, so no fin or tail ever shows over the bank. Paste what it
// prints into `body` in src/data/species.js whenever a swimmer's art changes.
// usage: node tools/hulls.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
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
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const pg = await (await browser.newContext()).newPage();
pg.on('pageerror', (e) => console.error(String(e)));
await pg.goto(`http://localhost:${server.address().port}/tools/dev.html`);
const hulls = await pg.evaluate(async () => {
  const { CREATURE_ART, PALETTES } = await import('/src/art/creatures.js');
  const { SPECIES } = await import('/src/data/species.js');
  // who swims, at which stage, in which poses (what artPose can pick in the water)
  const SWIMMERS = [
    ['goldfish', 'adult', ['swim', 'gasp']],
    ['guppy', 'adult', ['swim']],
    ['tetra', 'adult', ['swim']],
    ['koi', 'adult', ['swim']],
    ['puffer', 'adult', ['swim', 'puff']],
    ['axolotl', 'adult', ['swim']],
    ['turtle', 'adult', ['swim', 'bask']],
    ['frog', 'tadpole', ['swim']],
    ['frog', 'froglet', ['swim']],
  ];
  const S = 4; // pixels per tank unit
  const out = [];
  for (const [sp, stage, poses] of SWIMMERS) {
    const art = CREATURE_ART[sp];
    const [bw, bh] = art.box(stage);
    const pad = 12;
    const cw = (bw + pad) * 2 * S;
    const chh = (bh + pad) * 2 * S;
    const mask = new Uint8Array(cw * chh);
    const pals = PALETTES[sp] || [{}];
    for (const pal of pals) {
      for (const pose of poses) {
        for (let frame = 0; frame < 4; frame++) {
          const c = document.createElement('canvas');
          c.width = cw;
          c.height = chh;
          const g = c.getContext('2d');
          g.setTransform(S, 0, 0, S, cw / 2, chh / 2);
          art.draw(g, { stage, pose, frame, pal, acc: null, accColor: '#000', lw: art.lw, closed: false, liveWings: false });
          const d = g.getImageData(0, 0, cw, chh).data;
          for (let i = 0; i < mask.length; i++) if (d[i * 4 + 3] > 60) mask[i] = 1;
        }
      }
    }
    // everything painted, in tank units
    const pts = [];
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) if (mask[y * cw + x]) pts.push([(x + 0.5 - cw / 2) / S, (y + 0.5 - chh / 2) / S]);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
    }
    // smallest circle round a set of points (Welzl, iteratively)
    const circle2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1]) / 2];
    const circle3 = (a, b, c) => {
      const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
      if (Math.abs(d) < 1e-9) return null;
      const ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d;
      const uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d;
      return [ux, uy, Math.hypot(a[0] - ux, a[1] - uy)];
    };
    const inC = (c, p) => c && Math.hypot(p[0] - c[0], p[1] - c[1]) <= c[2] + 1e-7;
    const enclose = (ps) => {
      const P = ps.slice();
      for (let i = P.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [P[i], P[j]] = [P[j], P[i]];
      }
      let c = null;
      for (let i = 0; i < P.length; i++) {
        if (inC(c, P[i])) continue;
        c = [P[i][0], P[i][1], 0];
        for (let j = 0; j < i; j++) {
          if (inC(c, P[j])) continue;
          c = circle2(P[i], P[j]);
          for (let k = 0; k < j; k++) if (!inC(c, P[k])) c = circle3(P[i], P[j], P[k]) || c;
        }
      }
      return c;
    };
    // only the outline matters for enclosing
    const edge = pts.filter(([x, y]) => {
      const i = Math.floor(y * S + chh / 2) * cw + Math.floor(x * S + cw / 2);
      return !mask[i - 1] || !mask[i + 1] || !mask[i - cw] || !mask[i + cw];
    });
    // try 1..4 circles, splitting the body along its length where it covers
    // the least spare water; keep the fewest that hug it well
    const area = (cs) => {
      // the union's area, by sampling
      let n = 0;
      const st = 0.5;
      const bx0 = Math.min(...cs.map((c) => c[0] - c[2]));
      const bx1 = Math.max(...cs.map((c) => c[0] + c[2]));
      const by0 = Math.min(...cs.map((c) => c[1] - c[2]));
      const by1 = Math.max(...cs.map((c) => c[1] + c[2]));
      for (let y = by0; y < by1; y += st) for (let x = bx0; x < bx1; x += st) if (cs.some((c) => (x - c[0]) ** 2 + (y - c[1]) ** 2 <= c[2] ** 2)) n++;
      return n * st * st;
    };
    let best = null;
    for (let k = 1; k <= 4; k++) {
      let bk = null;
      const tries = k === 1 ? 1 : 160;
      for (let t = 0; t < tries; t++) {
        const cuts = [];
        for (let i = 1; i < k; i++) cuts.push(x0 + ((x1 - x0) * i) / k + (t ? (Math.random() - 0.5) * ((x1 - x0) / k) * 0.9 : 0));
        cuts.sort((a, b) => a - b);
        const bounds = [x0 - 1, ...cuts, x1 + 1];
        const cs = [];
        for (let i = 0; i < k; i++) {
          const seg = edge.filter((p) => p[0] >= bounds[i] && p[0] < bounds[i + 1]);
          if (seg.length) cs.push(enclose(seg));
        }
        const a = area(cs);
        if (!bk || a < bk.a) bk = { cs, a };
      }
      // another circle has to save a good slice of spare water to be worth it
      if (!best || bk.a < best.a * 0.9) best = bk;
    }
    const r1 = (v) => Math.round(v * 2) / 2;
    const hull = best.cs.map((c) => [r1(c[0]), r1(c[1]), Math.ceil(c[2] * 2) / 2]).sort((a, b) => a[0] - b[0]);
    out.push({ sp, stage, size: SPECIES[sp].size, hull, drawn: Math.round(pts.length / (S * S)), covered: Math.round(best.a) });
  }
  return out;
});
for (const h of hulls) {
  console.log(`${(h.sp + (h.sp === 'frog' ? ':' + h.stage : '')).padEnd(14)} body: ${JSON.stringify(h.hull).replace(/,/g, ', ')}   (drawn ${h.drawn}, hull ${h.covered} sq units)`);
}
await browser.close();
server.close();
