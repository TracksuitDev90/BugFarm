// Small DOM helpers shared by the UI modules.
import { CREATURE_ART, PALETTES, drawWorm } from '../art/creatures.js';
import { drawHat, drawNeckwear, isNeckwear } from '../art/ink.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Fit art of a given local box into a canvas.
export function artCanvas(css, box, draw, dpr = Math.min(2, window.devicePixelRatio || 1)) {
  const [cw, ch] = css;
  const c = el('canvas');
  c.width = Math.round(cw * dpr);
  c.height = Math.round(ch * dpr);
  c.style.width = cw + 'px';
  c.style.height = ch + 'px';
  const g = c.getContext('2d');
  const [x0, y0, x1, y1] = box;
  const s = Math.min((cw * dpr * 0.9) / (x1 - x0), (ch * dpr * 0.9) / (y1 - y0));
  g.setTransform(s, 0, 0, s, c.width / 2 - ((x0 + x1) / 2) * s, c.height / 2 - ((y0 + y1) / 2) * s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  try {
    draw(g);
  } catch (e) {
    /* ignore */
  }
  return c;
}

// A critter's picture for a tray, card or guide.
export function creatureArt(sp, stage, pose = 'idle', palIdx = 0, acc = null, accColor = '#e2553f', css = [64, 52]) {
  const art = CREATURE_ART[sp];
  if (!art) return artCanvas(css, [-10, -10, 10, 10], () => {});
  const [bw, bh] = art.box(stage);
  const pal = PALETTES[sp][palIdx % PALETTES[sp].length];
  if (sp === 'worm') return wormIcon(css, palIdx, acc, accColor);
  return artCanvas(css, [-bw, -bh, bw, bh], (g) => art.draw(g, { stage, pose, frame: 1, pal, acc, accColor, lw: art.lw, closed: false }));
}

// Something to wear on its own, big enough to see (for the wardrobe and
// the Market).
export function outfitIcon(id, colour = '#e2553f', css = [46, 40]) {
  const neck = isNeckwear(id);
  return artCanvas(css, neck ? [-7, -6, 7, 6] : [-12, -14, 12, 4], (g) => {
    if (neck) drawNeckwear(g, id, 0, 0, 6, 0.9, colour);
    else drawHat(g, id, 0, 2, 6, 0.9, colour);
  });
}

export function wormIcon(css = [64, 52], palIdx = 0, acc = 'cap', accColor = '#4c8fd6') {
  return artCanvas(css, [-22, -11, 22, 9], (g) => {
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push({ x: 17 - i * 3.2, y: Math.sin(i * 0.7) * 3 });
    drawWorm(g, pts, PALETTES.worm[palIdx % PALETTES.worm.length], 0.8, false, acc, accColor);
  });
}
