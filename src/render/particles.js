// Lightweight pooled particles: bubbles, dust, splashes, rain, poofs and
// sparkles. Updated with real time so they stay calm at high sim speeds.
import { INK, ZONE_MID } from '../config.js';
import { rrange, chance } from '../util/rng.js';
import { breeze } from '../world/breeze.js';

const TAU = Math.PI * 2;
const CUR = [0, 0];

export class Particles {
  constructor(max = 260) {
    this.max = max;
    this.list = [];
    this.ripples = [];
    this.pours = [];
    this.rainAcc = { desert: 0, jungle: 0 };
  }
  setMax(n) {
    this.max = n;
    if (this.list.length > n) this.list.length = n;
  }
  add(p) {
    if (this.list.length >= this.max) {
      if (p.type === 'rain' || p.type === 'dust' || p.type === 'mist' || p.type === 'smoke') return;
      this.list.shift();
    }
    p.t = 0;
    this.list.push(p);
  }
  // A ribbon of water poured in from the lid, splashing where it lands.
  pour(x, y) {
    this.pours.push({ x, y, t: 0, life: 1.4 });
    if (this.pours.length > 3) this.pours.shift();
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
  // Crumbs flicked off a snack mid-bite. floor < 0 means they drift in water.
  crumbs(x, y, colors, floor) {
    for (let i = 0; i < 3; i++) {
      this.add({ type: 'crumb', x: x + rrange(-2, 2), y: y + rrange(-1, 1), vx: rrange(-18, 18), vy: -rrange(10, 28), r: rrange(0.45, 0.9), life: rrange(0.8, 1.2), col: colors[i % colors.length], floor, rot: Math.random() * TAU });
    }
  }
  // A curl of chimney smoke (or teapot steam) from a house with someone home.
  smoke(x, y, steam) {
    this.add({ type: 'smoke', x, y, vx: 0, vy: -rrange(6, 10), r: rrange(1.4, 2.2), life: rrange(2.4, 3.6), steam, ph: Math.random() * TAU });
  }
  // A soft puff of ground mist drifting over damp jungle soil.
  mist(x, y) {
    this.add({ type: 'mist', x, y, vx: rrange(-5, 5), vy: -rrange(0.5, 2), r: rrange(14, 26), life: rrange(5, 8) });
  }
  rain(x, power, dt, terrain) {
    const rate = power * 60;
    const zone = x < ZONE_MID.pond ? 'desert' : 'jungle';
    this.rainAcc[zone] += rate * dt;
    while (this.rainAcc[zone] >= 1) {
      this.rainAcc[zone] -= 1;
      // drops leave the nozzle in a cone, so the far ones start lower
      const d = rrange(-190, 190);
      this.add({ type: 'rain', x: x + d, y: 12 + Math.abs(d) * 0.34 + rrange(0, 8), vx: d * 0.04 + rrange(-6, 6), vy: rrange(240, 300), r: 1, life: 3, terrain });
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
          // bubbles wobble up and get carried a little by the current
          breeze.current(p.x, p.y, CUR);
          p.y += p.vy * dt;
          p.x += (Math.sin(p.t * 5 + p.ph) * 6 + CUR[0] * 0.6) * dt;
          if (!terrain.waterAt(p.x, p.y - 1)) {
            alive = false;
            if (chance(0.3)) this.ripples.push({ x: p.x, t: 0, s: 0.25 });
          }
          break;
        case 'mist':
          p.x += (p.vx + breeze.wind(p.x) * 14) * dt;
          p.y += p.vy * dt;
          break;
        case 'smoke':
          // rises, spreads, and leans over in the breeze
          p.vx += (breeze.wind(p.x) * 26 - p.vx) * Math.min(1, dt * 1.5);
          p.x += (p.vx + Math.sin(p.t * 2 + p.ph) * 2) * dt;
          p.y += p.vy * dt;
          p.vy *= 1 - dt * 0.25;
          break;
        case 'dust':
        case 'puff':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 3;
          if (p.type === 'dust') {
            p.vy += 30 * dt;
            p.x += breeze.wind(p.x) * 10 * dt;
          }
          break;
        case 'crumb':
          if (p.floor < 0) {
            p.vx *= 1 - dt * 2;
            p.vy += (8 - p.vy) * dt * 3;
          } else {
            p.vy += 220 * dt;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.floor >= 0 && p.y >= p.floor) {
            p.y = p.floor;
            p.vx = p.vy = 0;
          }
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
          // the mister's spray drifts in a gust
          p.x += (p.vx + breeze.wind(p.x) * 30) * dt;
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
    for (let i = this.pours.length - 1; i >= 0; i--) {
      const p = this.pours[i];
      p.t += dt;
      if (p.t > p.life) {
        this.pours.splice(i, 1);
        continue;
      }
      if (chance(dt * 14)) this.splash(p.x + rrange(-2, 2), p.y, 0.35);
      if (chance(dt * 6)) this.bubble(p.x + rrange(-6, 6), p.y + rrange(6, 30));
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 1.6) this.ripples.splice(i, 1);
    }
  }
  draw(g, view, zoom) {
    const lw = 0.6;
    for (const p of this.pours) {
      // the stream thins out as the pour finishes
      const k = Math.min(1, p.t * 6, (p.life - p.t) * 3);
      const top = Math.max(4, p.y - (p.y - 4) * Math.min(1, p.t * 3));
      const bot = p.t > p.life - 0.35 ? p.y - (p.y - 4) * ((p.t - (p.life - 0.35)) / 0.35) : p.y;
      if (bot <= top + 2) continue;
      const wd = 2.6 * k;
      g.beginPath();
      for (let y = top; y <= bot; y += 6) g.lineTo(p.x - wd + Math.sin(y * 0.15 + p.t * 20) * 0.6, y);
      for (let y = bot; y >= top; y -= 6) g.lineTo(p.x + wd + Math.sin(y * 0.15 + p.t * 20 + 1) * 0.6, y);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fillStyle = '#a9d8f2';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = INK;
      g.stroke();
      g.beginPath();
      g.moveTo(p.x - wd * 0.3, top + 4);
      g.lineTo(p.x - wd * 0.3, bot - 3);
      g.lineWidth = 0.7;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
    }
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
        case 'smoke': {
          const u = p.t / p.life;
          g.globalAlpha = Math.min(1, u * 6) * (1 - u) * (p.steam ? 0.55 : 0.45);
          g.beginPath();
          g.arc(p.x, p.y, p.r * (1 + u * 2.4), 0, TAU);
          g.fillStyle = p.steam ? '#ffffff' : '#d8d2c8';
          g.fill();
          g.lineWidth = 0.35;
          g.strokeStyle = 'rgba(58,42,31,0.35)';
          g.stroke();
          break;
        }
        case 'mist': {
          g.globalAlpha = Math.sin((p.t / p.life) * Math.PI) * 0.22;
          g.beginPath();
          g.ellipse(p.x, p.y, p.r * (1 + p.t * 0.08), p.r * 0.45, 0, 0, TAU);
          g.fillStyle = '#ffffff';
          g.fill();
          break;
        }
        case 'crumb':
          g.globalAlpha = Math.min(1, k * 2.5);
          g.beginPath();
          g.ellipse(p.x, p.y - p.r * 0.5, p.r * 1.2, p.r, p.rot, 0, TAU);
          g.fillStyle = p.col;
          g.fill();
          g.lineWidth = 0.3;
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
