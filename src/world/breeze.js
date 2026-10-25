// Moving air and moving water. A closed tank still has its weather: warm air
// lifts off the heat lamps, the lid vents breathe, and every so often a soft
// gust rolls through from the window side, bending the grass and shaking the
// leaves as it passes. Under the water, the filter's outflow stirs the pond
// into one slow loop: along the top away from the filter, down the far bank,
// back along the bottom and up past the filter again.
//
// It's one shared field (only one tank ever runs at a time), read by the
// plants and critters in the simulation and by the renderer, so a bending
// stem and the ladybug clinging to it always agree.
import { W, ZONE_X, ZONE_MID } from '../config.js';
import { clamp } from '../util/math.js';
import { rrange, chance } from '../util/rng.js';

// the pond's middle and half-width, in tank units
const POND_CX = ZONE_MID.pond;
const POND_HW = (ZONE_X.pond[1] - ZONE_X.pond[0]) / 2;

class Breeze {
  constructor() {
    this.time = 0;
    this.gusts = []; // { x: where the front is, dir, speed, str, len }
    this.nextGust = rrange(3, 8);
    this.flow = 0.5; // how hard the pond filter is pushing
    this.terrain = null;
  }

  update(dt, w) {
    this.time = w.time;
    this.terrain = w.terrain;
    this.flow = w.env.filterFlow;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      // mostly from the window side (left), now and then back the other way
      const dir = chance(0.72) ? 1 : -1;
      const len = rrange(280, 560);
      this.gusts.push({ x: dir > 0 ? -80 : W + 80, dir, speed: rrange(150, 290), str: rrange(0.45, 1), len });
      // gusts sometimes come in twos and threes, then it goes still for a while
      this.nextGust = chance(0.3) ? rrange(2.5, 6) : rrange(12, 34);
    }
    for (let i = this.gusts.length - 1; i >= 0; i--) {
      const g = this.gusts[i];
      g.x += g.dir * g.speed * dt;
      if ((g.dir > 0 && g.x - g.len > W + 60) || (g.dir < 0 && g.x + g.len < -60)) this.gusts.splice(i, 1);
    }
  }

  // Sideways push of the air at x, about -1..1 (+ is rightward). A gentle
  // drift that wanders on its own, plus any gust passing through: it builds
  // quickly as the front arrives and dies away slowly behind it.
  wind(x) {
    const t = this.time;
    let v = 0.12 * Math.sin(t * 0.21 + x * 0.004) + 0.07 * Math.sin(t * 0.53 - x * 0.011);
    for (let i = 0; i < this.gusts.length; i++) {
      const g = this.gusts[i];
      const d = (g.x - x) * g.dir; // how far the front has already gone past x
      if (d < -70 || d > g.len) continue;
      let e = d < 0 ? 1 + d / 70 : 1 - d / g.len;
      e = e * e * (3 - 2 * e);
      v += g.dir * g.str * e;
    }
    return v;
  }

  // How gusty it is anywhere in the tank right now (0..1): for sounds,
  // drifting fluff and the windmill.
  get gustiness() {
    let s = 0;
    for (const g of this.gusts) if (g.x > -g.len && g.x < W + g.len) s = Math.max(s, g.str);
    return s;
  }

  // The pond's slow loop at (x, y), in tank units per second. out = [vx, vy].
  current(x, y, out) {
    const t = this.terrain;
    out[0] = 0;
    out[1] = 0;
    if (!t) return out;
    const wl = t.waterLevel;
    const depth = Math.max(24, t.surfaceY(x) - wl);
    const v = clamp((y - wl) / depth, 0, 1); // 0 at the surface, 1 on the floor
    const u = clamp((x - POND_CX) / POND_HW, -1.2, 1.2); // -1 far bank, +1 by the filter
    const s = 3 + this.flow * 16;
    const tm = this.time;
    // along the top away from the filter, back along the bottom
    out[0] = -s * (1 - 2 * v) * (1 - u * u * 0.5);
    // down the far bank, up past the filter
    out[1] = -u * s * 0.55 * Math.sin(Math.PI * v);
    // little eddies so nothing drifts in perfect lines
    out[0] += 1.6 * Math.sin(tm * 0.37 + y * 0.031) + 1.1 * Math.sin(tm * 0.61 - x * 0.023);
    out[1] += 1.2 * Math.sin(tm * 0.29 + x * 0.027);
    // the breeze drags the very top of the water along with it
    const top = 1 - v;
    out[0] += this.wind(x) * 9 * top * top * top * top;
    return out;
  }
}

export const breeze = new Breeze();
