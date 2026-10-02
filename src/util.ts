/** Shared pure helpers: seeded randomness, maths and colour. No module may use Math.random(). */

/** mulberry32: small, fast, deterministic PRNG. Returns a function yielding floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless integer hash → [0, 1). Use for per-mark randomness: hash01(seed, index, salt). */
export function hash01(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const clamp = (x: number, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export type RGB = [number, number, number];

/** '#rrggbb' or '#rgb' → [0..1, 0..1, 0..1] (sRGB, hex/255). Invalid input → black. */
export function hexToRgb(hex: string): RGB {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.round(clamp(x) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Sample a 2- or 3-stop gradient at t in 0..1 (stops evenly spaced). Interpolates in sRGB. */
export function sampleStops(stops: RGB[], t: number): RGB {
  const n = stops.length;
  if (n === 0) return [0, 0, 0];
  if (n === 1) return stops[0];
  const x = clamp(t) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const f = x - i;
  const a = stops[i], b = stops[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/** Deep clone of plain JSON data (Params are pure JSON). */
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
