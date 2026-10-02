/**
 * field.ts — the scalar field every mark samples.
 *
 * value(u, v, t) in 0..1 is a weighted average of enabled components (Wave A, Wave B, Radial,
 * Noise fbm, Data series, Linear gradient), followed by shaping.
 *
 * Coordinate spaces
 * - (u, v): normalised canvas coords 0..1, y down.
 * - (X, Y): aspect-corrected space, X = u * W / s, Y = v * H / s with s = min(W, H).
 *   The shorter side has length 1, so `freq` = cycles across the shorter side and circles are round.
 *
 * Shaping order (exact):
 *   1. mirror  — fold (u, v) around 0.5 FIRST. Folding the coordinates before anything else is
 *                what makes the symmetry exact: both halves feed identical coordinates to every
 *                later stage (warp, components, attractor), so the output is bit-identical.
 *   2. warp    — domain warp of (X, Y) with two decorrelated fbm lookups, using the folded coords.
 *   3. components → weighted average
 *   4. contrast  ≤ 1: (v - 0.5) * contrast + 0.5; > 1: smooth tanh S-curve (no hard clipping)
 *   5. bias      pow(v, bias)
 *   6. attractor v += strength * smoothstep(r, 0, d), clamped (before quantise so output stays stepped)
 *   7. quantise  N > 0: floor(v * N) / (N - 1), clamped (N levels spanning 0..1; N = 1 → 0.5)
 *   8. invert
 *
 * The attractor uses the folded but UN-warped position (it is a place on the canvas), and its
 * centre is folded the same way so a mirrored field shows a mirrored attractor.
 *
 * Pure and deterministic: everything derives from Params; tables are built once per buildField().
 */
import type { Params, FieldSampler } from './types';
import { rng } from './util';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * Empirical stretch per octave count so fbm keeps the spread of a single octave
 * (sd ≈ 0.21, ~1% of samples clamp at 0 or 1). Measured over 5 seeds.
 */
const NOISE_STRETCH = [1, 1, 1.2, 1.36, 1.46, 1.51, 1.53];

export function buildField(p: Params): FieldSampler {
  const F = p.field;
  const W = Math.max(1, p.canvas.width);
  const H = Math.max(1, p.canvas.height);
  const S = Math.min(W, H);
  const AX = W / S; // aspect extents: X in 0..AX, Y in 0..AY
  const AY = H / S;

  // ─────────────────────────────── noise tables (seeded by params.seed)
  const perm = new Uint8Array(512);
  const lat = new Float64Array(256);
  {
    const r = rng(((p.seed | 0) ^ 0x5bd1e995) >>> 0);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    // stratified lattice values: a shuffled 0..1 ramp, so every seed has the same exact
    // value distribution (mean 0.5) and the noise never leans light or dark per seed
    for (let i = 0; i < 256; i++) lat[i] = (i + 0.5) / 256;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = lat[i]; lat[i] = lat[j]; lat[j] = tmp;
    }
  }

  /** Smooth value noise in 0..1 (quintic interpolation of a hashed lattice). */
  const vnoise = (x: number, y: number): number => {
    const fx = Math.floor(x), fy = Math.floor(y);
    const tx = x - fx, ty = y - fy;
    const xi = fx & 255, yi = fy & 255;
    const xj = (xi + 1) & 255;
    const pa = perm[yi], pb = perm[yi + 1];
    const a = lat[perm[xi + pa]], b = lat[perm[xj + pa]];
    const c = lat[perm[xi + pb]], d = lat[perm[xj + pb]];
    const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
    const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sy;
  };

  /**
   * fbm, lacunarity 2, gain 0.5, normalised and stretched to 0..1. Each octave is rotated
   * (~36.87°) and offset so lattice axes never line up — no visible grid.
   */
  const fbm = (x: number, y: number, octaves: number): number => {
    let sum = 0, amp = 1, norm = 0;
    // initial rotation hides the first octave's lattice axes too
    let px = 0.8 * x + 0.6 * y, py = -0.6 * x + 0.8 * y;
    for (let o = 0; o < octaves; o++) {
      sum += amp * vnoise(px, py);
      norm += amp;
      amp *= 0.5;
      const nx = 1.6 * px + 1.2 * py + 19.19;
      py = -1.2 * px + 1.6 * py + 7.31;
      px = nx;
    }
    const k = NOISE_STRETCH[octaves] ?? 1.53;
    const v = 0.5 + (sum / norm - 0.5) * k;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };

  // ─────────────────────────────── components (precomputed constants)
  const wa = F.waveA, wb = F.waveB, rd = F.radial, nz = F.noise, dt = F.data, gr = F.gradient;
  const onA = wa.on && wa.weight > 0;
  const onB = wb.on && wb.weight > 0;
  const onR = rd.on && rd.weight > 0;
  const onN = nz.on && nz.weight > 0;
  const onD = dt.on && dt.weight > 0;
  const onG = gr.on && gr.weight > 0;
  const wSum =
    (onA ? wa.weight : 0) + (onB ? wb.weight : 0) + (onR ? rd.weight : 0) +
    (onN ? nz.weight : 0) + (onD ? dt.weight : 0) + (onG ? gr.weight : 0);
  const anyOn = wSum > 0;
  const invW = anyOn ? 1 / wSum : 0;

  const aDx = Math.cos(wa.dir * DEG) * wa.freq, aDy = Math.sin(wa.dir * DEG) * wa.freq;
  const bDx = Math.cos(wb.dir * DEG) * wb.freq, bDy = Math.sin(wb.dir * DEG) * wb.freq;
  const rCx = rd.cx * AX, rCy = rd.cy * AY;

  const nScale = nz.scale;
  const nOct = Math.max(1, Math.min(6, Math.round(nz.octaves)));
  const nDrift = nz.drift;

  // linear gradient: project onto direction, normalise by the canvas extent along it
  const gDx = Math.cos(gr.angle * DEG), gDy = Math.sin(gr.angle * DEG);
  let gMin = Infinity, gMax = -Infinity;
  for (const [cx, cy] of [[0, 0], [AX, 0], [0, AY], [AX, AY]]) {
    const q = cx * gDx + cy * gDy;
    if (q < gMin) gMin = q;
    if (q > gMax) gMax = q;
  }
  const gInv = gMax - gMin > 1e-9 ? 1 / (gMax - gMin) : 0;

  // ─────────────────────────────── data series (precomputed once)
  const axisX = dt.axis !== 'y';
  const N = Math.max(2, Math.round(axisX ? p.layout.cols : p.layout.rows) || 2);
  const series = buildSeries(dt.values, dt.seed, dt.volatility, dt.trend, N);
  const smoothSeries = movingAverage(series, Math.max(1, Math.round(N * 0.15)));
  const dSmooth = Math.max(0, Math.min(1, dt.smoothing));
  // map aspect coord → cell coordinate (0..N across the layout's inner area, inside margins)
  const marginPx = Math.max(0, p.layout.margin) * S;
  const span = axisX ? W : H;
  const inner = Math.max(1e-6, span - 2 * marginPx);
  const dA = (S / inner) * N; // cell = X * dA + dB  (X in aspect units → px = X * S)
  const dB = (-marginPx / inner) * N;
  const dScrollRate = dt.speed * Math.max(1, N / 10); // cells per second
  const dScrolling = dt.speed !== 0;

  const sampleData = (X: number, Y: number, t: number): number => {
    let c = (axisX ? X : Y) * dA + dB;
    if (dScrolling) c -= dScrollRate * t;
    // stepped: one flat value per cell
    let step = 0;
    if (dSmooth < 1) {
      let i = Math.floor(c);
      i = dScrolling ? ((i % N) + N) % N : i < 0 ? 0 : i >= N ? N - 1 : i;
      step = series[i];
      if (dSmooth <= 0) return step;
    }
    // smooth: cosine interpolation between cell centres of the moving-averaged series
    const cc = c - 0.5;
    const k = Math.floor(cc);
    const f = cc - k;
    let i0 = k, i1 = k + 1;
    if (dScrolling) {
      i0 = ((i0 % N) + N) % N;
      i1 = ((i1 % N) + N) % N;
    } else {
      i0 = i0 < 0 ? 0 : i0 >= N ? N - 1 : i0;
      i1 = i1 < 0 ? 0 : i1 >= N ? N - 1 : i1;
    }
    const w = 0.5 - 0.5 * Math.cos(Math.PI * f);
    const sm = smoothSeries[i0] + (smoothSeries[i1] - smoothSeries[i0]) * w;
    return dSmooth >= 1 ? sm : step + (sm - step) * dSmooth;
  };

  // ─────────────────────────────── shaping constants
  const sh = F.shaping;
  const mirX = sh.mirror === 'x' || sh.mirror === 'xy';
  const mirY = sh.mirror === 'y' || sh.mirror === 'xy';
  const warpAmt = sh.warpAmount;
  const doWarp = warpAmt > 0;
  const warpScale = sh.warpScale;
  const contrast = Math.max(0, sh.contrast);
  // tanh S-curve steepness: contrast 1 → identity (k → 0), 4 → k = 4.5 (near-binary, still smooth)
  const cK = Math.max(1e-4, (contrast - 1) * 1.5);
  const cInv = 1 / Math.tanh(cK);
  const bias = sh.bias > 0 ? sh.bias : 1;
  const doBias = bias !== 1;
  const Q = Math.max(0, Math.round(sh.quantise));
  const invert = sh.invert;

  // attractor (centre folded like the coordinates so mirrored fields stay symmetric)
  const at = F.attractor;
  const atR = Math.max(0, at.radius);
  const atOn = at.on && atR > 0;
  let atU = at.x, atV = at.y;
  if (mirX) atU = 0.5 - Math.abs(atU - 0.5);
  if (mirY) atV = 0.5 - Math.abs(atV - 0.5);
  const atX = atU * AX, atY = atV * AY;
  const atValOn = atOn && at.strength !== 0;
  const atStrength = at.strength;
  const atBendOn = atOn && at.bend !== 0;

  /** Shaped value BEFORE quantise and invert (shared by value() and gradient()). */
  const pre = (u: number, v: number, t: number): number => {
    // 1. mirror: fold coordinates first (exact symmetry)
    if (mirX) u = 0.5 - Math.abs(u - 0.5);
    if (mirY) v = 0.5 - Math.abs(v - 0.5);
    const X0 = u * AX, Y0 = v * AY;
    let X = X0, Y = Y0;

    // 2. domain warp (two decorrelated lookups; drifts with noise.drift)
    if (doWarp) {
      const wx = X0 * warpScale, wy = Y0 * warpScale;
      const dd = nDrift * t * 0.5;
      X += warpAmt * (fbm(wx + 31.7 + dd, wy + 11.3, 2) - 0.5) * 2;
      Y += warpAmt * (fbm(wx - 47.2, wy + 83.9 - dd, 2) - 0.5) * 2;
    }

    // 3. components → weighted average
    let val = 0.5;
    if (anyOn) {
      let acc = 0;
      if (onA) acc += wa.weight * (0.5 + 0.5 * Math.sin(TAU * (X * aDx + Y * aDy - wa.speed * t + wa.phase)));
      if (onB) acc += wb.weight * (0.5 + 0.5 * Math.sin(TAU * (X * bDx + Y * bDy - wb.speed * t + wb.phase)));
      if (onR) {
        const dx = X - rCx, dy = Y - rCy;
        acc += rd.weight * (0.5 + 0.5 * Math.sin(TAU * (rd.freq * Math.sqrt(dx * dx + dy * dy) - rd.speed * t)));
      }
      if (onN) {
        const d = nDrift * t;
        acc += nz.weight * fbm(X * nScale + d, Y * nScale + d, nOct);
      }
      if (onD) acc += dt.weight * sampleData(X, Y, t);
      if (onG) {
        let g = (X * gDx + Y * gDy - gMin) * gInv;
        g = g < 0 ? 0 : g > 1 ? 1 : g;
        acc += gr.weight * g;
      }
      val = acc * invW;
    }

    // 4. contrast — ≤ 1 flattens linearly; > 1 is a smooth tanh S-curve that maps 0..1 onto
    //    0..1 exactly, so high contrast sharpens transitions without hard clipping corners
    if (contrast <= 1) val = (val - 0.5) * contrast + 0.5;
    else val = 0.5 + 0.5 * Math.tanh(2 * cK * (val - 0.5)) * cInv;
    val = val < 0 ? 0 : val > 1 ? 1 : val;
    // 5. bias (gamma)
    if (doBias) val = Math.pow(val, bias);
    // 6. attractor (folded, un-warped position)
    if (atValOn) {
      const dx = X0 - atX, dy = Y0 - atY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < atR) {
        const x = 1 - d / atR; // smoothstep(r, 0, d)
        val += atStrength * x * x * (3 - 2 * x);
        val = val < 0 ? 0 : val > 1 ? 1 : val;
      }
    }
    return val;
  };

  const value = (u: number, v: number, t: number): number => {
    let val = pre(u, v, t);
    // 7. quantise
    if (Q > 0) {
      if (Q === 1) val = 0.5;
      else {
        val = Math.floor(val * Q) / (Q - 1);
        if (val > 1) val = 1;
      }
    }
    // 8. invert
    return invert ? 1 - val : val;
  };

  // gradient: central differences in aspect space, of the PRE-quantise value (so 'flow' mode
  // still has smooth contours to follow when quantise is on); sign follows invert.
  const eps = 1 / (4 * Math.max(p.layout.cols, p.layout.rows, 64));
  const du = eps / AX, dv = eps / AY;
  const gSign = (invert ? -1 : 1) / (2 * eps);
  const gradient = (u: number, v: number, t: number): [number, number] => [
    (pre(u + du, v, t) - pre(u - du, v, t)) * gSign,
    (pre(u, v + dv, t) - pre(u, v - dv, t)) * gSign,
  ];

  /**
   * Uniform +x flow deflected around the attractor, from a softened stream function
   *   ψ = y · (1 − c·R² / (r² + R²)),   velocity = (∂ψ/∂y, −∂ψ/∂x)
   * With c < 1 the flow never reverses, so the direction is smooth EVERYWHERE (no stagnation
   * points, no flips at the centre): horizontal marks above the point arch up and over, below it
   * dip under, and the row through the centre stays flat. Max raw deflection ≈ 22° at c = 0.95;
   * BEND_GAIN scales it so bend = 1 reaches ≈ 48°. Faded to exactly 0 between 2R and 3.5R.
   */
  const R2 = atR * atR;
  const BEND_C = 0.95, BEND_GAIN = 2.2;
  const fadeIn = 2 * atR, fadeOut = 3.5 * atR;
  const attractorBend = (u: number, v: number): number => {
    if (!atBendOn) return 0;
    let sgn = 1;
    // same fold as value(); reflecting across an axis negates angles (marks are mirrored too)
    if (mirX && u > 0.5) { u = 0.5 - (u - 0.5); sgn = -sgn; }
    if (mirY && v > 0.5) { v = 0.5 - (v - 0.5); sgn = -sgn; }
    const dx = u * AX - atX, dy = v * AY - atY;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2);
    if (d >= fadeOut) return 0;
    const q = d2 + R2, cq = (BEND_C * R2) / q, cq2 = cq / q;
    const vx = 1 - cq + 2 * cq2 * dy * dy;
    const vy = -2 * cq2 * dx * dy;
    const ang = Math.atan2(vy, vx);
    let fade = 1;
    if (d > fadeIn) {
      const x = 1 - (d - fadeIn) / (fadeOut - fadeIn);
      fade = x * x * (3 - 2 * x);
    }
    return sgn * at.bend * BEND_GAIN * ang * fade;
  };

  const raw = invert ? (u: number, v: number, t: number) => 1 - pre(u, v, t) : pre;

  return { value, raw, gradient, attractorBend };
}

// ─────────────────────────────────────────────────────────── data series helpers

function parseValues(s: string): number[] {
  if (!s) return [];
  const out: number[] = [];
  for (const tok of s.split(/[\s,;]+/)) {
    if (!tok) continue;
    const n = Number(tok);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function normalise(a: Float64Array): Float64Array {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  const r = hi - lo;
  for (let i = 0; i < a.length; i++) a[i] = r > 1e-12 ? (a[i] - lo) / r : 0.5;
  return a;
}

/** Edge-clamped centred moving average with the given window. */
function movingAverage(a: Float64Array, win: number): Float64Array {
  const n = a.length;
  const out = new Float64Array(n);
  if (win <= 1) { out.set(a); return out; }
  const h = (win - 1) / 2;
  const lo = Math.floor(h), hi = Math.ceil(h);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - lo; j <= i + hi; j++) {
      s += a[j < 0 ? 0 : j >= n ? n - 1 : j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

/**
 * N values in 0..1. Pasted numbers (≥ 2) are normalised and linearly resampled across N cells.
 * Otherwise a seeded walk: a smooth wander (moving-averaged random walk) blended towards a rough,
 * jittery walk by `volatility`, then tilted by `trend` (relative to the walk's own range so the
 * tilt stays visible at any volatility), then normalised.
 */
function buildSeries(values: string, seed: number, volatility: number, trend: number, N: number): Float64Array {
  const out = new Float64Array(N);
  const pasted = parseValues(values);
  if (pasted.length >= 2) {
    // normalise the pasted numbers first (min → 0, max → 1), then resample across N cells
    const M = pasted.length;
    const pn = normalise(Float64Array.from(pasted));
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * (M - 1);
      const k = Math.min(M - 2, Math.floor(x));
      const f = x - k;
      out[i] = pn[k] + (pn[k + 1] - pn[k]) * f;
    }
    return out;
  }
  const r = rng((seed | 0) >>> 0);
  const walk = new Float64Array(N);
  const jit = new Float64Array(N);
  let w = 0;
  for (let i = 0; i < N; i++) {
    w += (r() - 0.5) * 2;
    walk[i] = w;
    jit[i] = (r() - 0.5) * 2;
  }
  const smooth = movingAverage(walk, Math.max(2, Math.round(N / 6)));
  const vol = Math.max(0, Math.min(1, volatility));
  for (let i = 0; i < N; i++) out[i] = smooth[i] + (walk[i] + jit[i] * 1.5 - smooth[i]) * vol;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) { if (out[i] < lo) lo = out[i]; if (out[i] > hi) hi = out[i]; }
  const range = Math.max(hi - lo, 1e-6);
  const tr = Math.max(-1, Math.min(1, trend));
  // trend tilts downward-to-upward visually: positive trend → values rise along the axis
  for (let i = 0; i < N; i++) out[i] += tr * (i / (N - 1) - 0.5) * range * 2;
  return normalise(out);
}
