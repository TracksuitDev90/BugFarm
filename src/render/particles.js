// Lightweight pooled particles: bubbles, dust, splashes, rain, poofs and
// sparkles. Updated with real time so they stay calm at high sim speeds.
import { INK } from '../config.js';
import { rrange, chance } from '../util/rng.js';

const TAU = Math.PI * 2;

export class Particles {
  constructor(max = 260) {
    this.max = max;
    this.list = [];
    this.ripples = [];
    this.rainAcc = { desert: 0, jungle: 0 };
  }
  setMax(n) {
    this.max = n;
    if (this.list.length > n) this.list.length = n;
  }
  add(p) {
    if (this.list.length >= this.max) {
      if (p.type === 'rain' || p.type === 'dust') return;
      this.list.shift();
    }
    p.t = 0;
    this.list.push(p);
  }
  bubble(x, y) {
    this.add({ type: 'bubble', x, y, vx: 0, vy: -rrange(14, 26), r: rrange(0.9, 2.2), life: 8, ph: Math.random() * TAU });
  }
  dust(x, y, n = 3) {
    for (let i = 0; i < n; i++) this.add({ type: 'dust', x: x + rrange(-3, 3), y: y - rrange(0, 2), vx: rrange(-14, 14), vy: -rrange(6, 22), r: rrange(0.8, 1.8), life: rrange(0.5, 0.9) });
  }
  splash(x, y, s = 1) {
    this.ripples.push({ x, t: 0, s });
    if (this.ripples.length > 12) this.ripples.shift();
    for (let i = 0; i < 5 * s; i++) this.add({ type: 'drop', x: x + rrange(-3, 3), y: y - 1, vx: rrange(-30, 30) * s, vy: -rrange(30, 70) * s, r: rrange(0.8, 1.5), life: 0.8, wl: y });
  }
  poof(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      this.add({ type: 'puff', x, y, vx: Math.cos(a) * 22, vy: Math.sin(a) * 22 - 6, r: rrange(2.5, 4), life: 0.7 });
    }
    this.sparkle(x, y, 4);
  }
  sparkle(x, y, n = 5) {
    for (let i = 0; i < n; i++) this.add({ type: 'star', x: x + rrange(-6, 6), y: y + rrange(-6, 6), vx: rrange(-10, 10), vy: -rrange(8, 26), r: rrange(1.4, 2.6), life: rrange(0.7, 1.2), rot: Math.random() * TAU });
  }
  rain(x, power, dt, terrain) {
    const rate = power * 60;
    const zone = x < 800 ? 'desert' : 'jungle';
    this.rainAcc[zone] += rate * dt;
    while (this.rainAcc[zone] >= 1) {
      this.rainAcc[zone] -= 1;
      this.add({ type: 'rain', x: x + rrange(-190, 190), y: rrange(16, 30), vx: rrange(-6, 6), vy: rrange(240, 300), r: 1, life: 3, terrain });
    }
  }
  update(dt, terrain, time) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      let alive = p.t < p.life;
      switch (p.type) {
        case 'bubble':
          p.y += p.vy * dt;
          p.x += Math.sin(p.t * 5 + p.ph) * 6 * dt;
          if (!terrain.waterAt(p.x, p.y - 1)) {
            alive = false;
            if (chance(0.3)) this.ripples.push({ x: p.x, t: 0, s: 0.25 });
          }
          break;
        case 'dust':
        case 'puff':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 3;
          if (p.type === 'dust') p.vy += 30 * dt;
          break;
        case 'drop':
          p.vy += 300 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y > p.wl && p.vy > 0) alive = false;
          break;
        case 'star':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 20 * dt;
          p.rot += dt * 3;
          break;
        case 'rain':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (terrain.solidAt(p.x, p.y) || terrain.waterAt(p.x, p.y)) {
            alive = false;
            if (chance(0.25)) this.add({ type: 'drop', x: p.x, y: p.y - 1, vx: rrange(-15, 15), vy: -rrange(15, 35), r: 0.7, life: 0.4, wl: p.y });
          }
          break;
        default:
          break;
      }
      if (alive) L[j++] = p;
    }
    L.length = j;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 1.6) this.ripples.splice(i, 1);
    }
  }
  draw(g, view, zoom) {
    const lw = 0.6;
    for (const p of this.list) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      const k = 1 - p.t / p.life;
      switch (p.type) {
        case 'bubble':
          g.globalAlpha = 0.85;
          g.beginPath();
          g.arc(p.x, p.y, p.r, 0, TAU);
          g.fillStyle = 'rgba(235,250,255,0.35)';
          g.fill();
          g.lineWidth = 0.45;
          g.strokeStyle = 'rgba(255,255,255,0.95)';
          g.stroke();
          g.beginPath();
          g.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.3, 0, TAU);
          g.fillStyle = '#fff';
          g.fill();
          break;
        case 'dust':
          g.globalAlpha = k * 0.7;
          g.beginPath();
          g.arc(p.x, p.y, p.r * (1 + p.t), 0, TAU);
          g.fillStyle = '#d9c49a';
          g.fill();
          break;
        case 'puff':
          g.globalAlpha = k * 0.9;
          g.beginPath();
          g.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, TAU);
          g.fillStyle = '#fffaf0';
          g.fill();
          g.lineWidth = lw;
          g.strokeStyle = INK;
          g.stroke();
          break;
        case 'drop':
        case 'rain':
          g.globalAlpha = p.type === 'rain' ? 0.6 : 0.8 * k;
          g.beginPath();
          if (p.type === 'rain') {
            g.moveTo(p.x, p.y - 4);
            g.lineTo(p.x, p.y);
            g.lineWidth = 0.9;
            g.strokeStyle = '#8fc8ea';
            g.stroke();
          } else {
            g.arc(p.x, p.y, p.r, 0, TAU);
            g.fillStyle = '#bfe3f6';
            g.fill();
          }
          break;
        case 'star': {
          g.globalAlpha = Math.min(1, k * 1.5);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU;
            const r = i % 2 ? p.r * 0.45 : p.r;
            g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          g.closePath();
          g.fillStyle = '#f6d64a';
          g.fill();
          g.lineWidth = 0.35;
          g.strokeStyle = INK;
          g.stroke();
          g.restore();
          break;
        }
        default:
          break;
      }
    }
    g.globalAlpha = 1;
  }
}
