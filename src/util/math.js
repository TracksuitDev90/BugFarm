export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function invLerp(a, b, v) {
  return (v - a) / (b - a);
}
export function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function approach(v, target, rate) {
  if (v < target) return Math.min(target, v + rate);
  return Math.max(target, v - rate);
}
// Exponential smoothing that is framerate independent.
export function damp(v, target, lambda, dt) {
  return lerp(v, target, 1 - Math.exp(-lambda * dt));
}
// Returns 1 inside [okLo, okHi], falling to 0 at lo/hi.
export function band(v, lo, okLo, okHi, hi) {
  if (v < okLo) return clamp01((v - lo) / (okLo - lo));
  if (v > okHi) return clamp01((hi - v) / (hi - okHi));
  return 1;
}
export function fmtTemp(c, units) {
  if (units === 'F') return Math.round(c * 1.8 + 32) + '°F';
  return Math.round(c) + '°C';
}
export function plural(n, one, many) {
  return n === 1 ? one : many || one + 's';
}
