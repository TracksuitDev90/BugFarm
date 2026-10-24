// The little things that make the tank feel alive between the critters:
// specks drifting round the pond on its slow current, and whatever the
// breeze picks up as a gust rolls through (leaves off the jungle canopy,
// petals from the flowers, dandelion fluff, wisps of sand off the dunes).
// Leaves that land on the pond float a while before they sink.
// Render-only and run on real time, like the other particles.
import { W, INK, ZONE_X } from '../config.js';
import { breeze } from '../world/breeze.js';
import { rrange, chance, rpick } from '../util/rng.js';
import { clamp } from '../util/math.js';

const TAU = Math.PI * 2;
const CUR = [0, 0];
const LEAF_COLS = ['#77b255', '#8cc152', '#c9b04a', '#e0a040', '#5f9e45'];

export class Ambient {
  constructor() {
    this.motes = [];
    this.bits = [];
    this.maxMotes = 30;
    this.maxBits = 24;
    this.spawnAcc = 0;
  }

  setQuality(q) {
    this.maxMotes = q.particles > 250 ? 42 : q.particles > 150 ? 30 : 14;
    this.maxBits = q.particles > 250 ? 30 : q.particles > 150 ? 22 : 10;
    if (this.motes.length > this.maxMotes) this.motes.length = this.maxMotes;
  }

  // a fresh speck somewhere in the open water
  placeMote(m, t) {
    for (let i = 0; i < 6; i++) {
      const x = rrange(ZONE_X.pond[0] - 20, ZONE_X.pond[1] + 20);
      const fy = t.surfaceY(x);
      if (fy - t.waterLevel < 16) continue;
      const y = rrange(t.waterLevel + 6, fy - 4);
      if (!t.waterAt(x, y)) continue;
      m.x = x;
      m.y = y;
      m.t = 0;
      m.life = rrange(14, 30);
      return true;
    }
    return false;
  }

  update(dt, w, view) {
    const t = w.terrain;
    // pond specks: only worth moving while the pond's in view
    if (view.x1 > ZONE_X.pond[0] - 40 && view.x0 < ZONE_X.pond[1] + 40 && view.y1 > t.waterLevel) {
      while (this.motes.length < this.maxMotes) {
        const m = { x: 0, y: 0, t: 0, life: 1, r: rrange(0.5, 1.2), ph: Math.random() * TAU, green: chance(0.35) };
        if (!this.placeMote(m, t)) break;
        m.t = rrange(0, m.life * 0.8); // so they don't all fade in together
        this.motes.push(m);
      }
      for (const m of this.motes) {
        m.t += dt;
        breeze.current(m.x, m.y, CUR);
        const nx = m.x + (CUR[0] + Math.sin(m.t * 0.9 + m.ph) * 1.5) * dt;
        const ny = m.y + (CUR[1] + Math.cos(m.t * 0.7 + m.ph) * 1.2 + 0.4) * dt;
        if (m.t > m.life || !t.waterAt(nx, ny) || ny < t.waterLevel + 3) this.placeMote(m, t);
        else {
          m.x = nx;
          m.y = ny;
        }
      }
    }
    // things on the breeze
    const gust = breeze.gustiness;
    this.spawnAcc += dt * (0.25 + gust * 7);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.bits.length < this.maxBits) this.spawn(w, gust);
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      if (b.float) {
        // floating on the pond, riding the surface current
        breeze.current(b.x, t.waterLevel + 1, CUR);
        const nx = b.x + CUR[0] * 0.6 * dt;
        if (t.surfaceY(nx) - t.waterLevel > 8 && t.waterAt(nx, t.waterSurfY(nx) + 2)) b.x = nx;
        b.y = t.waterSurfY(b.x) - 0.5 + Math.sin(b.t * 1.4 + b.ph) * 0.5;
        b.rot += Math.sin(b.t * 0.5 + b.ph) * dt * 0.3;
        if (b.t > b.life) this.bits.splice(i, 1);
        continue;
      }
      if (b.rest) {
        b.rest -= dt;
        // a gust can pick a fallen leaf up again
        if (b.kind !== 'sand' && Math.abs(breeze.wind(b.x)) > 0.6 && chance(dt * 1.5)) {
          b.rest = 0;
          b.vy = -rrange(10, 25);
        } else {
          if (b.rest <= 0 || b.t > b.life) this.bits.splice(i, 1);
          continue;
        }
      }
      const wind = breeze.wind(b.x);
      const drag = b.kind === 'fluff' ? 2.2 : b.kind === 'sand' ? 4 : 1.4;
      b.vx += (wind * (b.kind === 'sand' ? 70 : 55) - b.vx) * Math.min(1, dt * drag);
      if (b.kind === 'fluff') {
        // fluff hangs in the air and rises over a warm lamp
        const lamp = w.env.lampAt(b.x);
        const lift = lamp.power * 14 * Math.max(0, 1 - Math.abs(b.x - lamp.x) / 140);
        b.vy += (3 - lift + Math.sin(b.t * 1.7 + b.ph) * 4 - b.vy) * Math.min(1, dt * 1.5);
      } else if (b.kind === 'sand') {
        b.vy += (2 - b.vy) * Math.min(1, dt * 3);
      } else {
        // leaves and petals see-saw down
        b.vy += (16 + Math.sin(b.t * 3 + b.ph) * 10 - b.vy) * Math.min(1, dt * 1.6);
        b.vx += Math.cos(b.t * 3 + b.ph) * 14 * dt;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt * (0.4 + Math.abs(wind));
      if (b.x < 4 || b.x > W - 4 || b.y < 6 || b.t > b.life) {
        this.bits.splice(i, 1);
        continue;
      }
      if (t.waterAt(b.x, b.y)) {
        if (b.kind === 'leaf' || b.kind === 'petal') {
          b.float = true;
          b.t = 0;
          b.life = rrange(12, 24);
          if (w.fx && chance(0.5)) w.fx.ripples.push({ x: b.x, t: 0, s: 0.2 });
        } else this.bits.splice(i, 1);
        continue;
      }
      const gy = t.surfaceY(b.x);
      if (b.y >= gy - 1) {
        b.y = gy - 1;
        b.vx = b.vy = 0;
        b.rest = b.kind === 'sand' ? 0.01 : rrange(3, 7);
      }
    }
  }

  spawn(w, gust) {
    const t = w.terrain;
    const r = Math.random();
    // when it's calm, just the odd seed drifting about
    if (gust < 0.2) {
      if (r < 0.5) return;
      const p = pickPlant(w, (q) => q.def.kind === 'flower' || q.def.kind === 'grass' || q.def.kind === 'clover');
      if (p) this.add('fluff', p.x + rrange(-6, 6), p.y - p.def.h * p.growth * 0.8);
      return;
    }
    if (r < 0.34) {
      // the jungle canopy sheds a leaf (or a plant does)
      const p = chance(0.5) ? pickPlant(w, (q) => q.def.h > 40 && q.x > ZONE_X.jungle[0]) : null;
      if (p) this.add('leaf', p.x + rrange(-12, 12), p.y - p.def.h * p.growth * rrange(0.5, 0.9));
      else this.add('leaf', rrange(ZONE_X.jungle[0] + 10, W - 10), rrange(70, 220));
    } else if (r < 0.52) {
      const p = pickPlant(w, (q) => q.flowers.length > 0 && !q.def.aquatic && q.def.kind !== 'cactus');
      if (p) this.add('petal', p.x + rrange(-6, 6), p.y - p.def.h * p.growth * 0.85, p.def.petals);
    } else if (r < 0.72) {
      const p = pickPlant(w, (q) => q.def.kind === 'flower' || q.def.kind === 'grass' || q.def.kind === 'clover');
      if (p) this.add('fluff', p.x + rrange(-6, 6), p.y - p.def.h * p.growth * 0.8);
    } else {
      // sand lifted off the desert where the gust is strongest
      for (let k = 0; k < 3; k++) {
        const x = rrange(20, ZONE_X.desert[1] - 30);
        if (Math.abs(breeze.wind(x)) < 0.45) continue;
        for (let j = 0; j < 3; j++) this.add('sand', x + rrange(-8, 8), t.surfaceY(x) - rrange(1, 7));
        break;
      }
    }
  }

  add(kind, x, y, col) {
    if (this.bits.length >= this.maxBits) return;
    this.bits.push({
      kind, x, y, vx: 0, vy: kind === 'leaf' || kind === 'petal' ? 0 : -rrange(2, 8),
      t: 0, life: kind === 'sand' ? rrange(0.6, 1.4) : kind === 'fluff' ? rrange(10, 18) : rrange(9, 16),
      rot: Math.random() * TAU, vr: rrange(-4, 4), ph: Math.random() * TAU, rest: 0, float: false,
      col: col || (kind === 'leaf' ? rpick(LEAF_COLS) : kind === 'petal' ? '#ffffff' : '#fffaf0'), s: rrange(0.8, 1.2),
    });
  }

  // Pond specks go in with the underwater layer, so the water tints them.
  drawMotes(g, view, w) {
    const algae = Math.min(1, w.env.pond.algae * 2);
    const murk = 1 - w.env.pond.clarity;
    for (const m of this.motes) {
      if (m.x < view.x0 || m.x > view.x1 || m.y < view.y0 || m.y > view.y1) continue;
      const fade = Math.min(1, m.t / 2, (m.life - m.t) / 2);
      if (fade <= 0) continue;
      g.globalAlpha = fade * (0.55 + murk * 0.4);
      g.fillStyle = m.green && algae > 0.15 ? '#7f9e58' : '#f4fbff';
      g.beginPath();
      g.arc(m.x, m.y, m.r * (m.green ? 1.2 : 1), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // r: the renderer (for its world transform helpers)
  drawBits(g, view, r) {
    for (const b of this.bits) {
      if (b.x < view.x0 - 10 || b.x > view.x1 + 10 || b.y < view.y0 - 10 || b.y > view.y1 + 10) continue;
      const fade = b.float ? Math.min(1, (b.life - b.t) / 3) : b.rest ? Math.min(1, b.rest) : Math.min(1, b.t * 3, (b.life - b.t) * 2);
      if (fade <= 0) continue;
      g.globalAlpha = fade;
      r.put(g, b.x, b.y, b.rot, b.s, b.s);
      switch (b.kind) {
        case 'leaf':
          g.beginPath();
          g.moveTo(-3.2, 0);
          g.quadraticCurveTo(0, -2.4, 3.2, 0);
          g.quadraticCurveTo(0, 2.4, -3.2, 0);
          g.fillStyle = b.col;
          g.fill();
          g.lineWidth = 0.45;
          g.strokeStyle = INK;
          g.stroke();
          g.beginPath();
          g.moveTo(-2.6, 0);
          g.lineTo(2.6, 0);
          g.lineWidth = 0.3;
          g.stroke();
          break;
        case 'petal':
          g.beginPath();
          g.ellipse(0, 0, 1.9, 1.1, 0, 0, TAU);
          g.fillStyle = b.col;
          g.fill();
          g.lineWidth = 0.35;
          g.strokeStyle = INK;
          g.stroke();
          break;
        case 'fluff':
          // a dandelion seed: a little parachute of filaments over a seed
          g.beginPath();
          for (let k = 0; k < 7; k++) {
            const a = Math.PI + (k / 6) * Math.PI;
            g.moveTo(0, 0);
            g.lineTo(Math.cos(a) * 2.6, Math.sin(a) * 2.6);
          }
          g.lineWidth = 0.3;
          g.strokeStyle = 'rgba(90,80,70,0.7)';
          g.stroke();
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(0, 2.2);
          g.lineWidth = 0.4;
          g.stroke();
          g.beginPath();
          g.arc(0, 2.4, 0.5, 0, TAU);
          g.fillStyle = '#8a6a4a';
          g.fill();
          break;
        case 'sand':
          r.setWorld(g);
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.lineTo(b.x - clamp(b.vx * 0.12, -6, 6), b.y + 0.3);
          g.lineWidth = 0.9;
          g.strokeStyle = 'rgba(214,190,140,0.75)';
          g.stroke();
          break;
        default:
          break;
      }
    }
    g.globalAlpha = 1;
    r.setWorld(g);
  }
}

function pickPlant(w, ok) {
  const ps = w.plants;
  if (!ps.length) return null;
  for (let i = 0; i < 6; i++) {
    const p = rpick(ps);
    if (!p.dead && p.growth > 0.3 && ok(p)) return p;
  }
  return null;
}
