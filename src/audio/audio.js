// Procedural sound effects: every sound is synthesised once into a tiny
// buffer, so there is nothing to download. Audio starts on first touch.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.6;
    this.buffers = {};
    this.last = {};
    this.master = null;
  }

  unlock() {
    if (this.ctx || !this.enabled) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.build();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
    else if (this.ctx) this.ctx.suspend();
    if (on && this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  make(dur, fn) {
    const sr = this.ctx.sampleRate;
    const n = Math.max(1, Math.floor(dur * sr));
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const r = fn(t, i / n, sr);
      // fn returns [freq, amp] for an oscillator voice or a raw sample
      if (Array.isArray(r)) {
        phase += (r[0] / sr) * Math.PI * 2;
        d[i] = Math.sin(phase) * r[1];
      } else d[i] = r;
    }
    return buf;
  }

  build() {
    const env = (k, a = 0.005) => (k < a ? k / a : Math.exp(-(k - a) * 7));
    let lp = 0;
    this.buffers.plop = this.make(0.16, (t, k) => [620 - 440 * k, 0.5 * env(k, 0.02)]);
    this.buffers.tap = this.make(0.06, (t, k) => {
      lp += ((Math.random() * 2 - 1) - lp) * 0.3;
      return lp * 0.6 * (1 - k);
    });
    this.buffers.chirp = this.make(0.11, (t) => {
      const pulse = t % 0.036 < 0.022 ? Math.sin(((t % 0.036) / 0.022) * Math.PI) : 0;
      return [4300, 0.28 * pulse];
    });
    this.buffers.croak = this.make(0.32, (t) => {
      const gate = t % 0.15 < 0.11 ? Math.sin(((t % 0.15) / 0.11) * Math.PI) : 0;
      const f = 92;
      const s = Math.sin(t * f * 6.283) * 0.6 + Math.sin(t * f * 2 * 6.283) * 0.3 + Math.sin(t * f * 3 * 6.283) * 0.25 + Math.sin(t * f * 7 * 6.283) * 0.12;
      return s * gate * 0.45;
    });
    this.buffers.bubble = this.make(0.07, (t, k) => [480 + 900 * k, 0.25 * Math.sin(k * Math.PI)]);
    this.buffers.pop = this.make(0.06, (t, k) => [880 - 300 * k, 0.35 * (1 - k)]);
    this.buffers.place = this.make(0.14, (t, k) => [170 - 80 * k, 0.6 * env(k, 0.01)]);
    this.buffers.sparkle = this.make(0.5, (t) => {
      const notes = [1046, 1318, 1568, 2093];
      const i = Math.min(3, Math.floor(t / 0.1));
      const lt = t - i * 0.1;
      return [notes[i], 0.22 * Math.exp(-lt * 9)];
    });
    this.buffers.buzz = this.make(0.3, (t, k) => {
      const f = 175 + Math.sin(t * 40) * 8;
      const saw = ((t * f) % 1) * 2 - 1;
      return saw * 0.12 * Math.sin(k * Math.PI);
    });
    this.buffers.splash = this.make(0.3, (t, k) => {
      lp += ((Math.random() * 2 - 1) - lp) * 0.5;
      return lp * 0.4 * Math.exp(-k * 5);
    });
    this.buffers.knock = this.make(0.12, (t, k) => [210 - 60 * k, 0.7 * Math.exp(-k * 12)]);
  }

  play(name, vol = 1, rate = 1, minGap = 0.04) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const b = this.buffers[name];
    if (!b) return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < minGap) return;
    this.last[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1, vol);
    src.connect(g);
    g.connect(this.master);
    src.start();
  }
}
