import { W, H } from '../config.js';
import { clamp, damp } from '../util/math.js';

// 2D camera with smooth targets, inertia and follow mode.
export class Camera {
  constructor() {
    this.x = W / 2;
    this.y = H / 2;
    this.zoom = 0.6;
    this.vw = 400;
    this.vh = 700;
    this.padTop = 60;
    this.padBottom = 96;
    this.vx = 0;
    this.vy = 0;
    this.target = null;
    this.follow = null;
    this.minZoom = 0.2;
    this.maxZoom = 5;
  }

  setViewport(vw, vh, padTop, padBottom) {
    this.vw = vw;
    this.vh = vh;
    this.padTop = padTop;
    this.padBottom = padBottom;
    const usableH = Math.max(100, vh - padTop - padBottom);
    this.fitHeight = usableH / (H + 70);
    this.fitAll = Math.min(this.fitHeight, (vw - 16) / (W + 70));
    this.minZoom = this.fitAll * 0.92;
    this.clampAll();
  }

  get centerY() {
    return this.padTop + (this.vh - this.padTop - this.padBottom) / 2;
  }

  get portrait() {
    return this.vw < this.vh;
  }

  defaultZoom() {
    // Portrait phones: zoom in on the busy band around the ground line and
    // pan between zones. Wide screens: show the whole tank.
    return this.portrait ? Math.min(this.maxZoom, this.fitHeight * 1.75) : this.fitAll;
  }

  reset(animate) {
    const z = this.defaultZoom();
    const tgt = { x: this.portrait ? 300 : W / 2, y: this.portrait ? 430 : H / 2, zoom: z };
    if (animate) this.target = tgt;
    else {
      this.x = tgt.x;
      this.y = tgt.y;
      this.zoom = tgt.zoom;
    }
    this.clampAll();
  }

  toScreen(wx, wy) {
    return [(wx - this.x) * this.zoom + this.vw / 2, (wy - this.y) * this.zoom + this.centerY];
  }
  toWorld(sx, sy) {
    return [(sx - this.vw / 2) / this.zoom + this.x, (sy - this.centerY) / this.zoom + this.y];
  }

  view(margin = 0) {
    const hw = this.vw / 2 / this.zoom;
    const top = this.centerY / this.zoom;
    const bottom = (this.vh - this.centerY) / this.zoom;
    return {
      x0: this.x - hw - margin,
      x1: this.x + hw + margin,
      y0: this.y - top - margin,
      y1: this.y + bottom + margin,
    };
  }

  panBy(dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.target = null;
    this.follow = null;
    this.clampAll();
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.target = null;
    this.clampAll();
  }

  flyTo(x, y, zoom) {
    this.target = { x, y, zoom: zoom == null ? this.zoom : clamp(zoom, this.minZoom, this.maxZoom) };
    this.vx = this.vy = 0;
  }

  clampAll() {
    const hw = this.vw / 2 / this.zoom;
    const usableHalf = (this.vh - this.padTop - this.padBottom) / 2 / this.zoom;
    const margin = 60;
    if (hw * 2 >= W + margin * 2) this.x = W / 2;
    else this.x = clamp(this.x, hw - margin, W - hw + margin);
    if (usableHalf * 2 >= H + margin * 2) this.y = H / 2;
    else this.y = clamp(this.y, usableHalf - margin, H - usableHalf + margin);
  }

  update(dt) {
    if (this.follow) {
      const f = this.follow;
      if (f.dead && f.deadT > 3) this.follow = null;
      else {
        this.x = damp(this.x, f.x, 4, dt);
        this.y = damp(this.y, f.y, 4, dt);
      }
    } else if (this.target) {
      const t = this.target;
      this.x = damp(this.x, t.x, 6, dt);
      this.y = damp(this.y, t.y, 6, dt);
      this.zoom = damp(this.zoom, t.zoom, 6, dt);
      if (Math.abs(this.x - t.x) < 0.5 && Math.abs(this.y - t.y) < 0.5 && Math.abs(this.zoom - t.zoom) < 0.002) this.target = null;
    } else if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) {
      this.x -= (this.vx * dt) / this.zoom;
      this.y -= (this.vy * dt) / this.zoom;
      const k = Math.exp(-5 * dt);
      this.vx *= k;
      this.vy *= k;
    }
    this.clampAll();
  }

  serialize() {
    return { x: this.x, y: this.y, zoom: this.zoom };
  }
  load(d) {
    if (!d) return;
    this.x = d.x;
    this.y = d.y;
    this.zoom = clamp(d.zoom, this.minZoom, this.maxZoom);
    this.clampAll();
  }
}
