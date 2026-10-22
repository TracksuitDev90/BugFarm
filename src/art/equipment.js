// The keeper's equipment, drawn to look like the real thing so it's clear
// what each piece is for: clamp-on dome heat lamps, misting pumps with a
// water jug, hose and nozzle, a glass aquarium heater and an internal pond
// filter. Little paper name tags (Busytown labels everything) appear when
// zoomed in. Everything is drawn in world units at its spot in the tank;
// the lid rail runs from y = -26 to 0.
import { INK, TAU, ell, circ, fill, stroke, paint, highlight, line, curve } from './ink.js';
import { mix } from './plants.js';
import { clamp01 } from '../util/math.js';

const LW = 1;
export const LAMP_SHADE = { desert: '#e2553f', pond: '#77b255', jungle: '#4c8fd6' };

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}
// A knob whose pointer sweeps from 7 o'clock (0) to 5 o'clock (1).
function knob(g, x, y, r, v, col = '#4a4652') {
  paint(g, col, LW * 0.8, () => circ(g, x, y, r));
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI * 0.75 + (i / 4) * Math.PI * 1.5;
    line(g, x + Math.cos(a) * (r + 0.8), y + Math.sin(a) * (r + 0.8), x + Math.cos(a) * (r + 1.8), y + Math.sin(a) * (r + 1.8), LW * 0.5);
  }
  const a = Math.PI * 0.75 + clamp01(v) * Math.PI * 1.5;
  line(g, x, y, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, LW * 0.9, '#fffdf6');
}
function led(g, x, y, col, on) {
  if (on) {
    g.save();
    g.globalAlpha *= 0.45;
    circ(g, x, y, 3.4);
    fill(g, col);
    g.restore();
  }
  paint(g, on ? col : '#5e5a62', LW * 0.6, () => circ(g, x, y, 1.5));
}

// --------------------------------------------------------------- name tags
// A paper luggage tag on a string, tied to (ax, ay).
export function tag(g, text, ax, ay, dx, dy, alpha = 1) {
  if (alpha <= 0.02) return;
  g.save();
  g.globalAlpha *= alpha;
  g.font = "bold 6.5px 'Patrick Hand', sans-serif";
  const w = Math.ceil(g.measureText(text).width) + 8;
  const x = ax + dx;
  const y = ay + dy;
  curve(g, ax, ay, (ax + x) / 2, Math.max(ay, y) + 3, x - w / 2 + 2.5, y, LW * 0.5, '#9a7a4a');
  paint(g, '#fbf3df', LW * 0.6, () => {
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x - w / 2 + 3, y - 4.5);
    g.lineTo(x + w / 2, y - 4.5);
    g.lineTo(x + w / 2, y + 4.5);
    g.lineTo(x - w / 2 + 3, y + 4.5);
    g.closePath();
  });
  circ(g, x - w / 2 + 2.5, y, 0.8);
  fill(g, INK);
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + 1.5, y + 0.4);
  g.restore();
}

// --------------------------------------------------------------- heat lamp
// A reflector dome on a spring clamp gripping the lid rail, with the bulb
// peeping out underneath and a dimmer on its cord.
//   s: { power 0..1, zone, time, part }
// part 'body' is everything that only changes with the dimmer (so it can be
// cached), 'live' the glow and heat shimmer; leave it out for both.
export function heatLamp(g, x, s) {
  const p = s.power;
  const shade = LAMP_SHADE[s.zone] || '#e2553f';
  const body = s.part !== 'live';
  const live = s.part !== 'body';
  g.save();
  g.translate(x, 0);
  if (body) lampBody(g, p, shade);
  if (live && p > 0.02) {
    // warm light spilling from the bulb
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha *= 0.2 + 0.3 * p;
    const gr = g.createRadialGradient(0, 25, 1, 0, 25, 26);
    gr.addColorStop(0, 'rgba(255,214,140,1)');
    gr.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gr;
    g.fillRect(-26, 0, 52, 52);
    g.restore();
  }
  // heat shimmer under a lamp that's turned up
  if (live && p > 0.25) {
    const k = Math.min(0.45, (p - 0.25) * 0.7);
    for (let j = -1; j <= 1; j++) {
      for (let i = 0; i < 8; i++) {
        const y0 = 40 + i * 4;
        g.globalAlpha = k * Math.sin((i / 8) * Math.PI);
        const xa = j * 9 + Math.sin(y0 * 0.35 - s.time * 5 + j * 2) * 2;
        const xb = j * 9 + Math.sin((y0 + 4) * 0.35 - s.time * 5 + j * 2) * 2;
        line(g, xa, y0, xb, y0 + 4, 0.9, '#f08c4a');
      }
    }
    g.globalAlpha = 1;
  }
  g.restore();
}
function lampBody(g, p, shade) {
  // cord from the socket up to the dimmer on the rail
  g.beginPath();
  g.moveTo(3, 4);
  g.bezierCurveTo(10, 3, 12, -4, 16, -9);
  stroke(g, 1.6 + LW, INK);
  stroke(g, 1.6, '#5e5a62');
  // dimmer: a little cream box with a knob showing how high it's turned
  paint(g, '#efe7d6', LW * 0.8, () => rrect(g, 13, -21, 15, 15, 2.5));
  knob(g, 20.5, -13.5, 4, p, '#4a4652');
  // spring clamp gripping the rail
  paint(g, '#55505e', LW * 0.8, () => rrect(g, -5.5, -29, 11, 4, 1.5));
  paint(g, '#55505e', LW * 0.8, () => rrect(g, -4, -26, 8, 28, 2));
  paint(g, '#e2853a', LW * 0.6, () => rrect(g, -6, -30, 3, 3, 1));
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(0, -18 + i * 3.2, 3, 1.4, 0, 0, TAU);
    stroke(g, LW * 0.6, '#c9c2b0');
  }
  paint(g, '#9aa0a6', LW * 0.7, () => circ(g, 0, -6, 2.4));
  line(g, -1.4, -6, 1.4, -6, LW * 0.5);
  // swivel neck and ceramic socket
  paint(g, '#9aa0a6', LW * 0.8, () => rrect(g, -1.6, 1, 3.2, 5, 1));
  paint(g, '#fbf3df', LW * 0.8, () => rrect(g, -4.5, 5, 9, 4, 1.5));
  // the dome
  const dome = () => {
    g.beginPath();
    g.moveTo(-5, 8);
    g.bezierCurveTo(-14, 8, -19, 15, -20, 23);
    g.lineTo(20, 23);
    g.bezierCurveTo(19, 15, 14, 8, 5, 8);
    g.closePath();
  };
  paint(g, shade, LW, dome);
  g.save();
  dome();
  g.clip();
  for (const yy of [13, 18]) {
    g.beginPath();
    g.moveTo(-22, yy + 3);
    g.quadraticCurveTo(0, yy - 2, 22, yy + 3);
    stroke(g, LW * 0.55, mix(shade, '#2a1a10', 0.35));
  }
  g.restore();
  highlight(g, -9, 14, 2.4, 5, 0.45, 0.5);
  // shiny inside of the rim, then the bulb hanging out of it
  paint(g, '#e8e6de', LW * 0.8, () => ell(g, 0, 23, 20, 3.6));
  const hot = p > 0.02;
  const glass = hot ? mix('#ffcf7a', '#fff6d0', p) : '#d8d2c4';
  paint(g, glass, LW * 0.8, () => {
    g.beginPath();
    g.ellipse(0, 23, 8, 7.5, 0, 0, Math.PI);
    g.closePath();
  });
  // filament
  g.beginPath();
  g.moveTo(-3, 25);
  for (let i = 0; i <= 6; i++) g.lineTo(-3 + i, 25 + (i % 2 ? 1.6 : 0));
  stroke(g, LW * 0.6, hot ? '#ff8a3c' : '#8a7a6a');
  highlight(g, -3.6, 26.5, 1.6, 1, 0.6, 0);
  // a wire guard round the bulb, like every reptile heat lamp has
  g.beginPath();
  g.ellipse(0, 23, 13, 12, 0, 0, Math.PI);
  for (let i = -2; i <= 2; i++) {
    const xx = i * 5.2;
    g.moveTo(xx, 23);
    g.lineTo(xx, 23 + 12 * Math.sqrt(1 - (xx / 13) ** 2));
  }
  g.moveTo(-12, 29);
  g.lineTo(12, 29);
  stroke(g, LW * 0.6, '#5e5a62');
}

// --------------------------------------------------------------- mister
// A misting pump clipped to the rail, drinking from a water jug through a
// hose and spraying through a nozzle under the lid.
//   s: { setting 0..1, spraying 0..1, water 0..1, time, part }
// part 'body' is the hardware as its dials and jug stand (cacheable), 'live'
// the spray and the warning blink; leave it out for both.
export function mister(g, x, s) {
  const empty = s.water < 0.15 && s.setting > 0.02;
  const body = s.part !== 'live';
  const live = s.part !== 'body';
  g.save();
  g.translate(x, 0);
  // spray: a fine cone of mist from the nozzle
  if (live && s.spraying > 0.02) {
    g.save();
    const a = 0.22 * s.spraying;
    const gr = g.createLinearGradient(0, 8, 0, 90);
    gr.addColorStop(0, `rgba(225,244,252,${a * 2})`);
    gr.addColorStop(1, 'rgba(225,244,252,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-2.5, 8);
    g.lineTo(2.5, 8);
    g.lineTo(80, 90);
    g.lineTo(-80, 90);
    g.closePath();
    g.fill();
    // droplet streaks shooting out of the nozzle
    for (let i = 0; i < 9; i++) {
      const ang = Math.PI / 2 + (i / 8 - 0.5) * 1.5;
      const t = (s.time * 1.6 + i * 0.37) % 1;
      const r0 = 8 + t * 46;
      g.globalAlpha = (1 - t) * 0.8 * s.spraying;
      line(g, Math.cos(ang) * r0, 8 + Math.sin(ang) * r0, Math.cos(ang) * (r0 + 5), 8 + Math.sin(ang) * (r0 + 5), 0.9, '#cfeaf8');
    }
    g.restore();
  }
  if (live && empty && Math.sin(s.time * 6) > 0) {
    // the pump's light blinks red when the jug runs dry
    led(g, 26.5, -15, '#e2553f', true);
    rrect(g, 34, -14, 16, 34, 4);
    stroke(g, 2, '#e2553f');
  }
  if (body) misterBody(g, s, empty);
  g.restore();
}
function misterBody(g, s, empty) {
  // hose: jug -> pump -> nozzle
  const hose = (fn) => {
    fn();
    stroke(g, 2.2 + LW * 1.4, INK);
    fn();
    stroke(g, 2.2, 'rgba(214,236,246,1)');
  };
  hose(() => {
    g.beginPath();
    g.moveTo(42, 19);
    g.bezierCurveTo(42, 30, 22, 26, 21, -4);
  });
  hose(() => {
    g.beginPath();
    g.moveTo(10, -9);
    g.bezierCurveTo(4, -9, 1, -6, 0, 1);
  });
  // nozzle poking down under the lid
  paint(g, '#c9a65a', LW * 0.8, () => rrect(g, -2.5, -1, 5, 5, 1));
  paint(g, '#9aa0a6', LW * 0.8, () => {
    g.beginPath();
    g.moveTo(-4, 4);
    g.lineTo(4, 4);
    g.lineTo(2.6, 8.5);
    g.lineTo(-2.6, 8.5);
    g.closePath();
  });
  for (const dx of [-1.3, 0, 1.3]) {
    circ(g, dx, 7.4, 0.45);
    fill(g, INK);
  }
  // pump box on the rail, with its dial and a running light
  paint(g, '#e8e2d6', LW, () => rrect(g, 9, -24, 22, 21, 3));
  paint(g, '#7cc0e6', LW * 0.7, () => rrect(g, 9, -24, 22, 5, 3));
  knob(g, 17, -11, 4.2, s.setting, '#4a4652');
  led(g, 26.5, -15, '#7dd35a', !empty && s.spraying > 0.02);
  // a little raindrop printed on the front
  g.beginPath();
  g.moveTo(26.5, -10.5);
  g.quadraticCurveTo(24.3, -7, 26.5, -6);
  g.quadraticCurveTo(28.7, -7, 26.5, -10.5);
  fill(g, '#4c8fd6');
  // the water jug, hooked over the rail
  g.beginPath();
  g.moveTo(42, -22);
  g.quadraticCurveTo(42, -32, 37, -30);
  g.lineTo(36, -25);
  stroke(g, LW * 1.2, '#9aa0a6');
  const body = () => rrect(g, 34, -14, 16, 34, 4);
  paint(g, 'rgba(236,246,252,0.95)', LW, body);
  // water inside, showing how much is left
  const wv = clamp01(s.water);
  if (wv > 0.01) {
    g.save();
    body();
    g.clip();
    const top = 19 - 32 * wv;
    g.fillStyle = '#7cc0e6';
    g.fillRect(34, top, 16, 40);
    line(g, 35, top + 0.5, 49, top + 0.5, 0.8, 'rgba(255,255,255,0.8)');
    g.restore();
  }
  // shoulder, cap and markings
  paint(g, 'rgba(236,246,252,0.95)', LW, () => {
    g.beginPath();
    g.moveTo(36, -13);
    g.lineTo(39, -19);
    g.lineTo(45, -19);
    g.lineTo(48, -13);
    g.closePath();
  });
  paint(g, '#4c8fd6', LW * 0.9, () => rrect(g, 38.5, -23, 7, 4.5, 1));
  for (let i = 1; i <= 3; i++) line(g, 47, 19 - i * 8, 49.5, 19 - i * 8, LW * 0.5);
  highlight(g, 37.5, 2, 1.2, 9, 0.6, 0);
  body();
  g.lineWidth = empty ? 1.3 : LW;
  g.strokeStyle = empty ? '#e2553f' : INK;
  g.stroke();
}

// --------------------------------------------------------------- pond heater
// A glass tube heater held to the glass with suction cups. A coil inside
// glows while it's warming the water; the dial on the cap sets the
// temperature and its light shows when it's heating.
//   s: { on, heating 0..1, target 0..1 (dial), time }
export function pondHeater(g, x, wl, s) {
  g.save();
  g.translate(x, wl - 12);
  g.rotate(-0.1);
  // suction cups behind the tube
  for (const yy of [26, 62]) paint(g, 'rgba(207,232,246,0.85)', LW * 0.7, () => ell(g, 5.5, yy, 3.4, 4.4));
  // glass tube
  const tube = () => rrect(g, -5, 0, 10, 80, 5);
  paint(g, 'rgba(226,242,248,0.6)', LW, tube);
  // ceramic core and coil
  paint(g, '#efe6d6', LW * 0.6, () => rrect(g, -2, 12, 4, 60, 2));
  const h = s.on ? s.heating : 0;
  if (h > 0.02) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha *= 0.35 * h;
    paint(g, '#ff8a4a', 0, () => rrect(g, -4.5, 10, 9, 64, 4));
    g.restore();
  }
  g.beginPath();
  for (let i = 0; i <= 26; i++) g.lineTo(i % 2 ? 2.4 : -2.4, 13 + i * 2.25);
  stroke(g, LW * 0.75, h > 0.02 ? mix('#c96a3a', '#ff6a2a', h) : '#9a8a7a');
  paint(g, null, LW, tube);
  highlight(g, -2.6, 40, 0.9, 30, 0.7, 0);
  // clips round the tube
  for (const yy of [26, 62]) paint(g, 'rgba(160,180,190,0.9)', LW * 0.6, () => rrect(g, -6, yy - 2, 12, 4, 1.5));
  // cap with the dial and light
  paint(g, '#3d3a44', LW, () => rrect(g, -6, -10, 12, 13, 2.5));
  // dial: blue (cool) to red (warm) arc, pointer at the set temperature
  g.save();
  g.translate(0, -13);
  g.beginPath();
  g.arc(0, 0, 6.2, Math.PI * 1.1, Math.PI * 1.5);
  stroke(g, 1.6, '#4c8fd6');
  g.beginPath();
  g.arc(0, 0, 6.2, Math.PI * 1.5, Math.PI * 1.9);
  stroke(g, 1.6, '#e2553f');
  paint(g, '#5e5a62', LW * 0.8, () => ell(g, 0, 0, 5, 3.2));
  const a = Math.PI * 1.1 + clamp01(s.target) * Math.PI * 0.8;
  line(g, 0, 0, Math.cos(a) * 4.6, Math.sin(a) * 4.6 * 0.7, LW * 0.9, '#fffdf6');
  g.restore();
  led(g, 0, -3.5, h > 0.02 ? '#ff7a3c' : '#7dd35a', s.on);
  g.restore();
}

// --------------------------------------------------------------- pond filter
// An internal power filter: water is drawn in through the slots at the
// bottom, through a sponge (which browns as it clogs), and pushed out of
// the spout at the top by the motor.
//   s: { flow 0..1, setting 0..1, clean 0..1, time, part }
// part 'body' is the filter itself (cacheable), 'live' the water flowing in
// and out; leave it out for both.
export function pondFilter(g, x, wl, s) {
  g.save();
  g.translate(x, wl);
  const flow = s.flow;
  const live = s.part !== 'body';
  // water being drawn in at the bottom
  if (live && flow > 0.02) {
    g.save();
    g.globalAlpha *= Math.min(0.8, flow * 1.4);
    for (let i = 0; i < 3; i++) {
      const t = (s.time * (0.6 + flow) + i / 3) % 1;
      for (const side of [-1, 1]) {
        const xx = side * (24 - t * 11);
        curve(g, xx, 40 + i * 3, xx - side * 2, 42 + i * 3, xx, 44 + i * 3, 0.9, 'rgba(255,255,255,0.9)');
      }
    }
    g.restore();
  }
  if (s.part !== 'live') filterBody(g, s);
  // the clean water gushing out of the spout
  if (live && flow > 0.02) {
    g.save();
    for (let i = 0; i < 4; i++) {
      const t = (s.time * (0.8 + flow * 1.4) + i / 4) % 1;
      g.globalAlpha = (1 - t) * Math.min(1, flow * 1.6);
      const xx = -26 - t * 34 * (0.5 + flow);
      curve(g, xx + 6, -2 + i * 1.6, xx + 2, 1 + i * 1.6 + Math.sin(s.time * 7 + i) * 1.2, xx - 6, i * 1.6, 1, 'rgba(255,255,255,0.95)');
    }
    g.restore();
  }
  g.restore();
}
function filterBody(g, s) {
  // suction cups behind
  for (const yy of [8, 38]) paint(g, 'rgba(207,232,246,0.85)', LW * 0.7, () => ell(g, 11, yy, 3.6, 4.6));
  const body = () => rrect(g, -11, -5, 22, 55, 3);
  paint(g, 'rgba(198,220,230,0.92)', LW, body);
  // window onto the sponge
  const gunk = 1 - clamp01(s.clean);
  const sponge = mix('#f2d37a', '#7a5a32', gunk);
  paint(g, sponge, LW * 0.7, () => rrect(g, -7, 4, 14, 31, 2));
  for (let i = 0; i < 14; i++) {
    const px = -5 + (i % 4) * 3.4 + (Math.floor(i / 4) % 2) * 1.6;
    const py = 7 + Math.floor(i / 4) * 7.4;
    circ(g, px, py, 0.8);
    fill(g, mix(sponge, '#3a2a1f', 0.35));
  }
  if (gunk > 0.4) {
    for (let i = 0; i < 5; i++) {
      circ(g, -4 + i * 2.2, 30 - (i % 2) * 3, 0.9 + gunk);
      fill(g, 'rgba(90,64,34,0.7)');
    }
  }
  highlight(g, -5, 14, 1, 7, 0.55, 0);
  // intake slots
  for (let i = 0; i < 4; i++) line(g, -7, 38.5 + i * 2.6, 7, 38.5 + i * 2.6, LW * 0.8);
  // motor head above the water, with a flow lever along a slot
  paint(g, '#4a4652', LW, () => rrect(g, -12, -17, 24, 14, 3));
  line(g, -7, -13, 7, -13, 1.6, '#2a2630');
  paint(g, '#efe7d6', LW * 0.7, () => rrect(g, -8.5 + clamp01(s.setting) * 14 - 1.5, -15.5, 3.4, 5, 1));
  led(g, 8.5, -7.5, '#7dd35a', s.setting > 0.02);
  // spout at the water line, pointing out into the pond
  paint(g, '#4a4652', LW * 0.9, () => {
    g.beginPath();
    g.moveTo(-11, -5);
    g.lineTo(-22, -4);
    g.lineTo(-24, -7);
    g.lineTo(-24, 3);
    g.lineTo(-22, 0);
    g.lineTo(-11, 1);
    g.closePath();
  });
}

