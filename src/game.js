// Game: owns world, camera, renderer and the fixed-step loop.
import { SIM_DT, W, H } from './config.js';
import { World } from './world/world.js';
import './ai/ants.js';
import { Camera } from './ui/camera.js';
import { Renderer } from './render/renderer.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.world = new World();
    this.cam = new Camera();
    this.renderer = new Renderer(canvas, this.world, this.cam);
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.last = 0;
    this.frameMs = 16;
    this.avgFrame = 16;
    this.avgDt = 1 / 60;
    this.simMs = 0;
    this.listeners = [];
    this.running = false;
    this.onFrame = null;
    this.maxSteps = 8;
    this.fpsCap = 0;
  }

  resize(w, h, padTop, padBottom) {
    this.cam.setViewport(w, h, padTop, padBottom);
    this.renderer.resize(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      if (this.fpsCap && dt < 1 / this.fpsCap - 0.002) return;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.tick(dt);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  tick(dt) {
    this.avgDt = this.avgDt * 0.95 + Math.min(dt, 0.2) * 0.05;
    const t0 = performance.now();
    if (!this.paused) {
      this.acc += dt * this.speed;
      let steps = 0;
      const maxSteps = this.maxSteps * Math.max(1, Math.ceil(this.speed / 2));
      while (this.acc >= SIM_DT && steps < maxSteps) {
        this.world.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0; // can't keep up: drop time rather than spiral
    }
    const t1 = performance.now();
    this.cam.update(dt);
    const alpha = this.paused ? 1 : Math.min(1, this.acc / SIM_DT);
    this.renderer.paused = this.paused;
    this.renderer.frame(alpha, dt);
    const t2 = performance.now();
    this.simMs = this.simMs * 0.9 + (t1 - t0) * 0.1;
    this.frameMs = t2 - t0;
    this.avgFrame = this.avgFrame * 0.95 + this.frameMs * 0.05;
    if (this.onFrame) this.onFrame(dt);
  }
}

export { W, H };
