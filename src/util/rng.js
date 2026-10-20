// Small, fast deterministic random helpers.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
  }
  next() {
    return this.f();
  }
  range(a, b) {
    return a + (b - a) * this.f();
  }
  int(a, b) {
    return a + Math.floor((b - a + 1) * this.f());
  }
  pick(arr) {
    return arr[Math.floor(this.f() * arr.length)];
  }
  chance(p) {
    return this.f() < p;
  }
  sign() {
    return this.f() < 0.5 ? -1 : 1;
  }
}

// Global non-deterministic helpers for moment-to-moment simulation flavour.
export const rand = Math.random;
export function rrange(a, b) {
  return a + (b - a) * Math.random();
}
export function rint(a, b) {
  return a + Math.floor((b - a + 1) * Math.random());
}
export function rpick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
export function chance(p) {
  return Math.random() < p;
}

// Integer hash -> [0,1)
export function hash1(n, seed = 0) {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// 1D value noise in [0,1).
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  return hash1(i, seed) + (hash1(i + 1, seed) - hash1(i, seed)) * smooth(f);
}

// 2D value noise in [0,1).
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm1(x, seed = 0, oct = 3) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += noise1(x * f, seed + i * 31) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
}
