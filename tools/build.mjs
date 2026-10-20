// Production build: bundles + minifies everything into dist/ so the game
// loads in very few small requests (good for slow connections), lowers modern
// syntax for older phones, and stamps the service worker with a build hash.
// usage: npm run build
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'assets/fonts'), { recursive: true });
fs.mkdirSync(path.join(dist, 'assets/icons'), { recursive: true });

const targets = ['es2017', 'safari12', 'chrome64', 'firefox62', 'edge79'];
const js = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: targets,
  write: false,
  legalComments: 'none',
});
const code = js.outputFiles[0].text;
const hash = crypto.createHash('sha1').update(code).digest('hex').slice(0, 10);
const jsName = `app.${hash}.js`;
fs.writeFileSync(path.join(dist, jsName), code);

let css = fs.readFileSync(path.join(root, 'src/ui/style.css'), 'utf8').replaceAll('../../assets/', 'assets/');
css = (await esbuild.transform(css, { loader: 'css', minify: true, target: targets })).code;

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="src/ui/style.css">', `<style>${css}</style>`);
html = html.replace('<script type="module" src="src/main.js"></script>', `<script defer src="${jsName}"></script>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);

fs.writeFileSync(path.join(dist, 'sw.js'), fs.readFileSync(path.join(root, 'sw.js'), 'utf8').replace('__BUILD__', hash));
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));
for (const f of fs.readdirSync(path.join(root, 'assets/fonts'))) fs.copyFileSync(path.join(root, 'assets/fonts', f), path.join(dist, 'assets/fonts', f));
for (const f of fs.readdirSync(path.join(root, 'assets/icons'))) fs.copyFileSync(path.join(root, 'assets/icons', f), path.join(dist, 'assets/icons', f));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const size = (f) => {
  const b = fs.readFileSync(path.join(dist, f));
  return `${(b.length / 1024).toFixed(1)}KB (${(zlib.gzipSync(b, { level: 9 }).length / 1024).toFixed(1)}KB gzipped)`;
};
console.log(`built dist/ in ${hash}`);
console.log(`  index.html ${size('index.html')}`);
console.log(`  ${jsName} ${size(jsName)}`);
let total = 0;
for (const f of ['index.html', jsName, 'assets/fonts/patrick-hand-latin.woff2', 'assets/fonts/chewy-latin.woff2']) total += fs.statSync(path.join(dist, f)).size;
console.log(`  first load (html + js + fonts, before gzip): ${(total / 1024).toFixed(0)}KB`);
