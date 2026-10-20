// Pointer gestures for the tank canvas: tap, hold, drag (pan or tool), pinch.
export class Input {
  constructor(el, camera, handlers) {
    this.el = el;
    this.cam = camera;
    this.h = handlers;
    this.pointers = new Map();
    this.dragMode = 'pan'; // 'pan' | 'tool'
    this.state = 'idle';
    this.holdTimer = 0;
    this.lastTap = 0;
    this.samples = [];

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.h.hover && this.h.hover(null);
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.cam.zoomAt(e.offsetX, e.offsetY, f);
      },
      { passive: false }
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pos(e) {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    this.el.setPointerCapture && this.el.setPointerCapture(e.pointerId);
    const [x, y] = this.pos(e);
    this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now() });
    this.cam.vx = this.cam.vy = 0;
    if (this.pointers.size === 1) {
      this.state = 'press';
      this.pressT = performance.now();
      this.samples.length = 0;
      this.holdFired = false;
      this.h.press && this.h.press(...this.cam.toWorld(x, y), x, y);
    } else if (this.pointers.size === 2) {
      if (this.state === 'tooldrag') this.h.dragEnd && this.h.dragEnd();
      this.state = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    const [x, y] = this.pos(e);
    if (!p) {
      if (e.pointerType === 'mouse') this.h.hover && this.h.hover(...this.cam.toWorld(x, y));
      return;
    }
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (this.state === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (this.pinchD > 0) this.cam.zoomAt(mid[0], mid[1], d / this.pinchD);
      this.cam.panBy(mid[0] - this.pinchMid[0], mid[1] - this.pinchMid[1]);
      this.pinchD = d;
      this.pinchMid = mid;
      return;
    }
    if (this.state === 'press') {
      if (Math.hypot(x - p.sx, y - p.sy) > 9) {
        if (this.dragMode === 'tool') {
          this.state = 'tooldrag';
          this.h.dragStart && this.h.dragStart(...this.cam.toWorld(p.sx, p.sy));
        } else this.state = 'pan';
      }
    }
    if (this.state === 'pan') {
      this.cam.panBy(dx, dy);
      const now = performance.now();
      this.samples.push({ dx, dy, t: now });
      while (this.samples.length && now - this.samples[0].t > 90) this.samples.shift();
    } else if (this.state === 'tooldrag') {
      this.h.dragMove && this.h.dragMove(...this.cam.toWorld(x, y));
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (this.state === 'press' && !this.holdFired) {
      const [wx, wy] = this.cam.toWorld(p.x, p.y);
      const now = performance.now();
      const dbl = now - this.lastTap < 300 && Math.hypot(p.x - this.lastTapX, p.y - this.lastTapY) < 30;
      this.lastTap = now;
      this.lastTapX = p.x;
      this.lastTapY = p.y;
      this.h.tap && this.h.tap(wx, wy, p.x, p.y, dbl);
    } else if (this.state === 'pan') {
      // fling
      let sx = 0;
      let sy = 0;
      if (this.samples.length > 1) {
        const span = Math.max(16, this.samples[this.samples.length - 1].t - this.samples[0].t);
        for (const s of this.samples) {
          sx += s.dx;
          sy += s.dy;
        }
        this.cam.vx = (sx / span) * 1000;
        this.cam.vy = (sy / span) * 1000;
      }
    } else if (this.state === 'tooldrag') {
      this.h.dragEnd && this.h.dragEnd();
    }
    if (this.state === 'press' || this.state === 'hold') this.h.release && this.h.release();
    if (this.pointers.size === 0) this.state = 'idle';
    else if (this.state === 'pinch' && this.pointers.size === 1) {
      const q = [...this.pointers.values()][0];
      q.sx = q.x;
      q.sy = q.y;
      this.state = 'pan';
      this.samples.length = 0;
    }
  }

  cancel(e) {
    this.pointers.delete(e.pointerId);
    if (this.state === 'tooldrag') this.h.dragEnd && this.h.dragEnd();
    if (this.pointers.size === 0) this.state = 'idle';
  }

  // Called every frame: fires hold events while a finger rests in place.
  update() {
    if (this.state !== 'press' && this.state !== 'hold') return;
    const p = [...this.pointers.values()][0];
    if (!p) return;
    const held = performance.now() - this.pressT;
    if (held > 420) {
      this.state = 'hold';
      this.holdFired = true;
      this.h.hold && this.h.hold(...this.cam.toWorld(p.x, p.y), held);
    }
  }
}
