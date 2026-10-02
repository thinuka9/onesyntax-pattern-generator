/**
 * presets.ts — OneSyntax palettes, output formats, the nine named presets and the
 * parameter-space helpers (randomise, nudge, file naming).
 *
 * Every preset is a complete `Params` built with `withDefaults({...only what differs...})`,
 * so each one is a single self-contained JSON object (exactly what "Export JSON" writes).
 * Nothing here uses Math.random(): randomiseAll / nudge are driven by util.rng(seed).
 */
import type { Params, LayoutMode, ShapeKind, Source, ColourSource, AngleMode, Mirror, Mapping } from './types';
import { defaultParams, withDefaults } from './defaults';
import { rng, clamp, clone } from './util';

// ─────────────────────────────────────────────────────────── PALETTES

export interface Palette { background: string; stops: string[]; accent: string }

/** OneSyntax brand palettes. Stops are 2–3 evenly spaced gradient colours. */
export const PALETTES: Record<string, Palette> = {
  Signal: { background: '#FAFBFD', stops: ['#151515', '#151515'], accent: '#F76E43' },
  Azure: { background: '#E8F4FF', stops: ['#1B98FE', '#A2D5FF'], accent: '#1B98FE' },
  Night: { background: '#082A6F', stops: ['#1B98FE', '#A2D5FF'], accent: '#F76E43' },
  Meter: { background: '#151515', stops: ['#F76E43', '#5F6470'], accent: '#F76E43' },
  Heritage: { background: '#151515', stops: ['#00BCEA', '#00BCEA'], accent: '#F76E43' },
  Action: { background: '#FFFFFF', stops: ['#0A64C2', '#0A64C2'], accent: '#F76E43' },
};
const PALETTE_NAMES = Object.keys(PALETTES);

// ─────────────────────────────────────────────────────────── FORMATS

export interface Format { label: string; width: number; height: number }

export const FORMATS: Record<string, Format> = {
  '1:1': { label: '1:1 · 1080×1080', width: 1080, height: 1080 },
  '4:5': { label: '4:5 · 1080×1350', width: 1080, height: 1350 },
  '16:9': { label: '16:9 · 1600×900', width: 1600, height: 900 },
  '9:16': { label: '9:16 · 1080×1920', width: 1080, height: 1920 },
  '1920x1080': { label: '1920×1080', width: 1920, height: 1080 },
  'A4 portrait': { label: 'A4 portrait · 1240×1754', width: 1240, height: 1754 },
  'LinkedIn banner': { label: 'LinkedIn banner · 1584×396', width: 1584, height: 396 },
};

const canvasFor = (key: string) => ({ format: key, width: FORMATS[key].width, height: FORMATS[key].height });
const paletteFor = (name: string) => {
  const pal = PALETTES[name];
  return { palette: name, background: pal.background, stops: pal.stops.slice(), accent: pal.accent };
};

// ─────────────────────────────────────────────────────────── PRESETS

/** Wave A is on in the defaults; presets that don't want it switch it off explicitly. */
const OFF = { on: false };

export const PRESETS: Record<string, Params> = {
  // HERO — Sinky tag: a row of vertical meters. Downward-trending data series, orange → slate across columns.
  'Sinky Meter': withDefaults({
    name: 'Sinky Meter',
    seed: 23021,
    field: {
      waveA: { on: true, weight: 0.12, freq: 0.8, dir: 0, phase: 0, speed: 0.06 },
      data: { on: true, weight: 1, seed: 41, smoothing: 0.35, trend: -0.75, volatility: 0.5, axis: 'x', values: '', speed: 0.12 },
      shaping: { contrast: 1.05 },
    },
    layout: { mode: 'columns', cols: 16, rows: 1, margin: 0.14, gutterX: 0, gutterY: 0, anchor: 'end' },
    marks: {
      shape: 'meter', radius: 0,
      meter: {
        trackThickness: 0.07, trackOpacity: 0.3, fillThickness: 0.36, capSize: 1,
        capOffset: 0.26, capFollowsWave: false, capWaveFreq: 1.2, capWaveSpeed: 0.15,
      },
    },
    map: {
      thickness: { source: 'const', min: 0.36, max: 0.36 },
      length: { source: 'field', min: 0.08, max: 0.56 },
      colour: { source: 'x', min: 0, max: 1 },
    },
    colour: { ...paletteFor('Meter'), source: 'x' },
    canvas: canvasFor('4:5'),
  }),

  // HERO — Amaya headshot: rows of short horizontal dashes on light blue, bending around the subject.
  'Amaya Flow': withDefaults({
    name: 'Amaya Flow',
    seed: 40817,
    field: {
      waveA: { on: true, weight: 0.35, freq: 1.2, dir: 30, phase: 0, speed: 0.05 },
      noise: { on: true, weight: 0.65, scale: 2.4, octaves: 2, drift: 0.04 },
      attractor: { on: true, x: 0.55, y: 0.44, radius: 0.34, strength: 0.15, bend: 0.45 },
    },
    layout: { mode: 'grid', cols: 9, rows: 17, margin: 0.05, gutterX: 0.06, gutterY: 0.1 },
    marks: { shape: 'rect', radius: 0.3 },
    map: {
      thickness: { source: 'field', min: 0.3, max: 0.36 },
      length: { source: 'field', min: 0.84, max: 0.95 },
      offsetY: { source: 'field', min: -0.05, max: 0.05 },
      colour: { source: 'field', min: 0, max: 1 },
      // small per-dash wobble from the field; the attractor bend dominates around the subject
      angle: { source: 'field', min: -5, max: 5 },
      angleMode: 'value', fixedAngle: 0,
    },
    colour: { palette: 'Azure', background: '#A2D5FF', stops: ['#1B98FE', '#57A9F5'], accent: '#1B98FE', source: 'field' },
    canvas: canvasFor('4:5'),
  }),

  // Shape Therapy barcode: rows of vertical bars, thick ones merge into solid blocks.
  Barcode: withDefaults({
    name: 'Barcode',
    seed: 71093,
    field: {
      waveA: { on: true, weight: 0.25, freq: 2.5, dir: 0, phase: 0.1, speed: 0.12 },
      noise: { on: true, weight: 0.75, scale: 4, octaves: 2, drift: 0.06 },
      shaping: { contrast: 1.5, bias: 2.2, quantise: 4 },
    },
    // Grid marks: `length` always spans the cell WIDTH and `thickness` the cell HEIGHT (marks.ts), so an
    // unrotated rect gives vertical bars directly: bar width = length (field), bar height = thickness (const).
    // gutterX 0 + length 1 → the widest bars touch their neighbours and merge into solid blocks.
    layout: { mode: 'grid', cols: 32, rows: 7, margin: 0.22, gutterX: 0, gutterY: 0.16 },
    marks: { shape: 'rect', radius: 0 },
    map: {
      thickness: { source: 'const', min: 1, max: 1 },
      length: { source: 'field', min: 0.3, max: 1.0 },
      colour: { source: 'field', min: 0.55, max: 1 },
      threshold: 0,
      angleMode: 'fixed', fixedAngle: 0,
    },
    colour: { ...paletteFor('Night'), source: 'field' },
    canvas: canvasFor('1:1'),
  }),

  // Image 233: big horizontal bars, stepped lengths, continuous screen-space gradient.
  'Threshold Stripes': withDefaults({
    name: 'Threshold Stripes',
    seed: 12733,
    field: {
      waveA: { on: true, weight: 0.18, freq: 0.8, dir: 90, phase: 0, speed: 0.08 },
      gradient: { on: true, weight: 1, angle: 90 },
      // invert(gradient^bias): rows stay near full width at the top, then fall away fast (image 233's curve).
      // Each row samples one value, so the rows themselves are the quantised steps.
      shaping: { contrast: 1, bias: 3.4, quantise: 0, invert: true },
    },
    layout: { mode: 'rows', rows: 18, margin: 0.07, gutterX: 0, gutterY: 0.04, anchor: 'start' },
    marks: { shape: 'rect', radius: 0 },
    map: {
      thickness: { source: 'const', min: 1, max: 1 },
      length: { source: 'field', min: 0.06, max: 1 },
      colour: { source: 'field', min: 0, max: 1 },
    },
    colour: { ...paletteFor('Night'), stops: ['#1B98FE', '#A2D5FF'], continuous: true, gradAngle: 0, gradRepeat: 3 },
    canvas: canvasFor('1:1'),
  }),

  // Diagonal halftone: up-right strokes that join into continuous diagonals, thick toward bottom-left.
  'Halftone Diagonal': withDefaults({
    name: 'Halftone Diagonal',
    seed: 50211,
    field: {
      waveA: { on: true, weight: 0.12, freq: 0.8, dir: 135, phase: 0, speed: 0.08 },
      gradient: { on: true, weight: 1, angle: 135 },
      shaping: { contrast: 1.1, bias: 1.8 },
    },
    // 4:5 canvas, margin 0.12 → 820×1090 box; 12×16 cells ≈ 68×68 px (square, so diagonals line up).
    layout: { mode: 'grid', cols: 12, rows: 16, margin: 0.12, gutterX: 0, gutterY: 0 },
    marks: { shape: 'line', radius: 1 },
    map: {
      thickness: { source: 'field', min: 0.03, max: 0.58 },
      length: { source: 'const', min: 1.42, max: 1.42 },
      colour: { source: 'field', min: 0, max: 1 },
      angleMode: 'fixed', fixedAngle: -45,
    },
    colour: { ...paletteFor('Heritage'), source: 'field' },
    canvas: canvasFor('4:5'),
  }),

  // Holst poster: a grid of short dashes following the contours of a smooth field, colour by value.
  'Contour Field': withDefaults({
    name: 'Contour Field',
    seed: 64409,
    field: {
      waveA: OFF,
      radial: { on: true, weight: 0.75, cx: 0.78, cy: 0.18, freq: 0.9, speed: 0.06 },
      noise: { on: true, weight: 0.3, scale: 0.8, octaves: 3, drift: 0.03 },
      shaping: { warpAmount: 0.08, warpScale: 1.2, contrast: 1.3 },
    },
    // 16:9, margin 0.07 → 1474×774 box; 40×22 cells ≈ 37×35 px.
    layout: { mode: 'grid', cols: 40, rows: 22, margin: 0.07, gutterX: 0.1, gutterY: 0.1 },
    marks: { shape: 'rect', radius: 0.2 },
    map: {
      thickness: { source: 'field', min: 0.12, max: 0.3 },
      length: { source: 'field', min: 0.55, max: 0.9 },
      opacity: { source: 'field', min: 0.55, max: 1 },
      colour: { source: 'field', min: 1, max: 0 },
      angleMode: 'flow', fixedAngle: 0,
    },
    colour: { ...paletteFor('Meter'), source: 'field' },
    canvas: canvasFor('16:9'),
  }),

  // Deakin poster: continuous vertical lines kinked sideways along a diagonal, thicker to the right.
  Strands: withDefaults({
    name: 'Strands',
    seed: 31416,
    // One slow wave travelling toward the bottom-left (144°), ~0.35 cycles either side of centre: its single
    // zero crossing (steepened by contrast) is the kink line running top-left → bottom-right like the poster.
    // A faint gradient along the same axis keeps the far corners saturated; speed drifts the kink across strands.
    field: {
      waveA: { on: true, weight: 1, freq: 0.6, dir: 144, phase: 0.11, speed: 0.04 },
      gradient: { on: true, weight: 0.15, angle: 144 },
      shaping: { contrast: 4 },
    },
    layout: {
      mode: 'strands', cols: 26, rows: 1, margin: 0.07, gutterX: 0, gutterY: 0,
      strandAxis: 'vertical', strandSamples: 240, strandAmount: 0.6,
    },
    marks: { shape: 'line', radius: 0 },
    map: {
      thickness: { source: 'x', min: 0.22, max: 0.6 },
      colour: { source: 'x', min: 0, max: 1 },
    },
    colour: { ...paletteFor('Signal'), source: 'x' },
    canvas: canvasFor('4:5'),
  }),

  // Image 229: mirrored XY pixel kaleidoscope in blues and cyan.
  'Kaleido Pixels': withDefaults({
    name: 'Kaleido Pixels',
    seed: 22990,
    field: {
      waveA: OFF,
      radial: { on: true, weight: 0.4, cx: 0.5, cy: 0.5, freq: 1.4, speed: 0.08 },
      noise: { on: true, weight: 0.8, scale: 3.2, octaves: 3, drift: 0.05 },
      shaping: { mirror: 'xy', contrast: 1.6, quantise: 8 },
    },
    // 16:9, no margin → 40×22 cells ≈ 40×41 px.
    layout: { mode: 'grid', cols: 40, rows: 22, margin: 0, gutterX: 0, gutterY: 0 },
    marks: { shape: 'rect', radius: 0 },
    map: {
      thickness: { source: 'const', min: 1, max: 1 },
      length: { source: 'const', min: 1, max: 1 },
      colour: { source: 'field', min: 0, max: 1 },
    },
    colour: { palette: 'Azure', background: '#1B98FE', stops: ['#1B98FE', '#00BCEA', '#E8F4FF'], accent: '#1B98FE', source: 'field' },
    canvas: canvasFor('16:9'),
  }),

  // Oxide RFD cards: stacked horizontal bars like an ASCII bar chart, stepped lengths, accent rows.
  'RFD Stack': withDefaults({
    name: 'RFD Stack',
    seed: 80544,
    field: {
      waveA: OFF,
      data: { on: true, weight: 1, seed: 11, smoothing: 0.2, trend: 0.2, volatility: 0.6, axis: 'y', values: '', speed: 0.1 },
      shaping: { quantise: 8 },
    },
    layout: { mode: 'rows', rows: 24, margin: 0.1, gutterX: 0, gutterY: 0.38, anchor: 'start' },
    marks: { shape: 'rect', radius: 0 },
    map: {
      thickness: { source: 'const', min: 1, max: 1 },
      length: { source: 'field', min: 0.06, max: 1 },
      colour: { source: 'field', min: 0, max: 1 },
    },
    colour: { ...paletteFor('Signal'), source: 'field', accentEvery: 6, accentTarget: 'row' },
    canvas: canvasFor('1:1'),
  }),
};

export const PRESET_NAMES: string[] = [
  'Sinky Meter', 'Amaya Flow', 'Barcode', 'Threshold Stripes', 'Halftone Diagonal',
  'Contour Field', 'Strands', 'Kaleido Pixels', 'RFD Stack',
];

/** Deep clone of a named preset (defaults for an unknown name). */
export function getPreset(name: string): Params {
  return clone(PRESETS[name] ?? defaultParams());
}

/** New params with background / stops / accent / palette name from PALETTES (unknown name → unchanged copy). */
export function applyPalette(p: Params, name: string): Params {
  const out = clone(p);
  if (!PALETTES[name]) return out;
  Object.assign(out.colour, paletteFor(name));
  return out;
}

/** New params with canvas.format/width/height set from FORMATS. 'custom' keeps the current size. */
export function applyFormat(p: Params, key: string): Params {
  const out = clone(p);
  if (key === 'custom') { out.canvas.format = 'custom'; return out; }
  const f = FORMATS[key];
  if (!f) return out;
  out.canvas = { format: key, width: f.width, height: f.height };
  return out;
}

// ─────────────────────────────────────────────────────────── RANGES

/**
 * Documented range of every numeric field that nudge() may move (mirrors the comments in types.ts).
 * `span` (optional) is the width used for nudging when the documented range is far wider than what
 * reads as "a nudge" (e.g. cols 1..400); clamping always uses [min, max].
 * `wrap` = circular (degrees 0..360).
 */
export interface Range { min: number; max: number; int?: boolean; span?: number; wrap?: boolean }

const wave = (pre: string): Record<string, Range> => ({
  [`${pre}.weight`]: { min: 0, max: 1 },
  [`${pre}.freq`]: { min: 0, max: 20, span: 6 },
  [`${pre}.dir`]: { min: 0, max: 360, wrap: true },
  [`${pre}.phase`]: { min: 0, max: 1, wrap: true },
  [`${pre}.speed`]: { min: -2, max: 2, span: 1 },
});
const mapping = (pre: string, min: number, max: number, span?: number): Record<string, Range> => ({
  [`${pre}.min`]: { min, max, span },
  [`${pre}.max`]: { min, max, span },
});

export const RANGES: Record<string, Range> = {
  ...wave('field.waveA'),
  ...wave('field.waveB'),
  'field.radial.weight': { min: 0, max: 1 },
  'field.radial.cx': { min: 0, max: 1 },
  'field.radial.cy': { min: 0, max: 1 },
  'field.radial.freq': { min: 0, max: 20, span: 6 },
  'field.radial.speed': { min: -2, max: 2, span: 1 },
  'field.noise.weight': { min: 0, max: 1 },
  'field.noise.scale': { min: 0.2, max: 12, span: 6 },
  'field.noise.octaves': { min: 1, max: 6, int: true },
  'field.noise.drift': { min: 0, max: 2, span: 0.5 },
  'field.data.weight': { min: 0, max: 1 },
  'field.data.smoothing': { min: 0, max: 1 },
  'field.data.trend': { min: -1, max: 1 },
  'field.data.volatility': { min: 0, max: 1 },
  'field.data.speed': { min: 0, max: 2, span: 0.5 },
  'field.gradient.weight': { min: 0, max: 1 },
  'field.gradient.angle': { min: 0, max: 360, wrap: true },
  'field.shaping.warpAmount': { min: 0, max: 0.5 },
  'field.shaping.warpScale': { min: 0.2, max: 12, span: 6 },
  'field.shaping.contrast': { min: 0, max: 4 },
  'field.shaping.bias': { min: 0.1, max: 5, span: 2 },
  'field.shaping.quantise': { min: 0, max: 32, int: true, span: 12 },
  'field.attractor.x': { min: 0, max: 1 },
  'field.attractor.y': { min: 0, max: 1 },
  'field.attractor.radius': { min: 0, max: 1 },
  'field.attractor.strength': { min: -1, max: 1 },
  'field.attractor.bend': { min: 0, max: 1 },
  'layout.cols': { min: 1, max: 400, int: true, span: 40 },
  'layout.rows': { min: 1, max: 400, int: true, span: 40 },
  'layout.margin': { min: 0, max: 0.45 },
  'layout.gutterX': { min: 0, max: 0.95 },
  'layout.gutterY': { min: 0, max: 0.95 },
  'layout.jitter': { min: 0, max: 1 },
  'layout.rotation': { min: -180, max: 180 },
  'layout.stagger': { min: 0, max: 1 },
  'layout.strandSamples': { min: 8, max: 400, int: true, span: 100 },
  'layout.strandAmount': { min: 0, max: 2 },
  'marks.radius': { min: 0, max: 1 },
  'marks.skew': { min: -75, max: 75 },
  'marks.meter.trackThickness': { min: 0, max: 1 },
  'marks.meter.trackOpacity': { min: 0, max: 1 },
  'marks.meter.fillThickness': { min: 0, max: 1 },
  'marks.meter.capSize': { min: 0, max: 1 },
  'marks.meter.capOffset': { min: 0, max: 1 },
  'marks.meter.capWaveFreq': { min: 0, max: 10, span: 4 },
  'marks.meter.capWaveSpeed': { min: -2, max: 2, span: 1 },
  ...mapping('map.thickness', 0, 1.5),
  ...mapping('map.length', 0, 3),
  ...mapping('map.angle', -180, 180),
  ...mapping('map.opacity', 0, 1),
  ...mapping('map.colour', 0, 1),
  ...mapping('map.offsetX', -1, 1),
  ...mapping('map.offsetY', -1, 1),
  ...mapping('map.skew', -75, 75),
  'map.threshold': { min: 0, max: 1, span: 0.5 },
  'map.fixedAngle': { min: -180, max: 180 },
  'colour.gradAngle': { min: 0, max: 360, wrap: true },
  'colour.gradRepeat': { min: 1, max: 12, int: true, span: 6 },
  'colour.accentEvery': { min: 0, max: 32, int: true, span: 8 },
};

const getPath = (o: any, path: string): any => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o: any, path: string, v: unknown) => {
  const ks = path.split('.');
  const last = ks.pop()!;
  const parent = ks.reduce((a, k) => a[k], o);
  parent[last] = v;
};

/** Clamp (or wrap) a value into a range, rounding integers. */
function fit(v: number, r: Range): number {
  if (r.wrap) {
    const w = r.max - r.min;
    v = ((((v - r.min) % w) + w) % w) + r.min;
  } else {
    v = clamp(v, r.min, r.max);
  }
  if (r.int) v = clamp(Math.round(v), r.min, r.max);
  return v;
}

// ─────────────────────────────────────────────────────────── NUDGE

/**
 * Move every numeric field in field/layout/marks/map/colour by up to ±amount × its range (span),
 * clamped to the documented range; integers rounded. Booleans, strings, canvas, motion, the global
 * seed and the data-series seed are untouched. Deterministic for a given seed. Keeps the name.
 */
export function nudge(p: Params, seed: number, amount = 0.15): Params {
  const out = clone(p);
  const r = rng(((seed | 0) ^ 0x2545f491) >>> 0);
  for (const path of Object.keys(RANGES)) {
    const range = RANGES[path];
    const cur = getPath(out, path);
    const d = r() * 2 - 1; // always draw, so the sequence doesn't depend on which fields exist
    if (typeof cur !== 'number' || !Number.isFinite(cur)) continue;
    const span = range.span ?? range.max - range.min;
    let step = d * amount * span;
    // integers: guarantee a visible change of at least ±1 when the draw is meaningfully non-zero
    if (range.int && Math.abs(step) >= 0.25 && Math.abs(step) < 1) step = Math.sign(step);
    setPath(out, path, fit(cur + step, range));
  }
  // keep mapping min/max meaningful for const sources (const uses max) — nothing else to fix up
  out.seed = seed | 0;
  return out;
}

// ─────────────────────────────────────────────────────────── RANDOMISE

/**
 * A fresh, sensible random Params driven by rng(seed). A random preset supplies the skeleton
 * (layout mode, mark family); continuous values are drawn inside their documented ranges but biased
 * toward pleasing values. Canvas and motion state come from `p`. Deterministic for a given seed.
 */
export function randomiseAll(p: Params, seed: number): Params {
  const r = rng(((seed | 0) ^ 0x6a09e667) >>> 0);
  const between = (a: number, b: number) => a + (b - a) * r();
  const int = (a: number, b: number) => Math.floor(between(a, b + 1 - 1e-9));
  const chance = (x: number) => r() < x;
  const pick = <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];
  const weighted = <T>(xs: readonly [T, number][]): T => {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let x = r() * total;
    for (const [v, w] of xs) { x -= w; if (x <= 0) return v; }
    return xs[xs.length - 1][0];
  };
  const r2 = (x: number) => Math.round(x * 100) / 100;

  const skeletonName = pick(PRESET_NAMES);
  const out = clone(PRESETS[skeletonName]);
  out.name = 'Random';
  out.seed = seed | 0;
  out.canvas = clone(p.canvas);
  out.motion = clone(p.motion);

  const W = out.canvas.width, H = out.canvas.height;
  const aspect = H / Math.max(1, W);
  const F = out.field;
  // grid skeletons sometimes become brick (image 235: staggered rows of rects)
  if (out.layout.mode === 'grid' && chance(0.25)) out.layout.mode = 'brick';
  const mode: LayoutMode = out.layout.mode;

  // ── field components
  const randWave = (w: typeof F.waveA, on: boolean) => {
    w.on = on;
    w.weight = r2(between(0.3, 1));
    w.freq = r2(weighted([[between(0.5, 2), 3], [between(2, 6), 2]]));
    w.dir = chance(0.5) ? pick([0, 45, 90, 135, 180, 225, 270, 315]) : Math.round(between(0, 360));
    w.phase = r2(r());
    w.speed = r2((chance(0.5) ? 1 : -1) * between(0.03, 0.25));
  };
  randWave(F.waveA, chance(0.75));
  randWave(F.waveB, chance(0.35));
  F.radial.on = chance(0.35);
  F.radial.weight = r2(between(0.3, 1));
  F.radial.cx = r2(between(0.2, 0.8));
  F.radial.cy = r2(between(0.2, 0.8));
  F.radial.freq = r2(between(0.6, 4));
  F.radial.speed = r2((chance(0.7) ? 1 : -1) * between(0.03, 0.2));
  F.noise.on = chance(0.55);
  F.noise.weight = r2(between(0.3, 1));
  F.noise.scale = r2(between(0.8, 5));
  F.noise.octaves = int(1, 4);
  F.noise.drift = r2(between(0.02, 0.15));
  const dataSkeleton = F.data.on;
  F.data.on = dataSkeleton ? chance(0.85) : chance(0.12);
  F.data.weight = r2(between(0.6, 1));
  F.data.seed = int(1, 9999);
  F.data.smoothing = r2(between(0, 0.8));
  F.data.trend = r2(between(-0.8, 0.8));
  F.data.volatility = r2(between(0.2, 0.8));
  F.data.axis = mode === 'rows' ? 'y' : mode === 'columns' ? 'x' : pick(['x', 'y'] as const);
  F.data.values = '';
  F.data.speed = r2(chance(0.5) ? between(0.05, 0.25) : 0);
  F.gradient.on = chance(0.3);
  F.gradient.weight = r2(between(0.3, 1));
  F.gradient.angle = pick([0, 45, 90, 135, 180, 225, 270, 315]);
  if (!F.waveA.on && !F.waveB.on && !F.radial.on && !F.noise.on && !F.data.on && !F.gradient.on) {
    F.waveA.on = true;
  }

  // ── shaping
  const S = F.shaping;
  S.warpAmount = chance(0.35) ? r2(between(0.03, 0.2)) : 0;
  S.warpScale = r2(between(1, 4));
  S.mirror = weighted<Mirror>([['none', 6], ['x', 1.5], ['y', 1], ['xy', 1.5]]);
  S.contrast = r2(between(0.8, 2));
  S.bias = r2(between(0.6, 1.8));
  S.quantise = chance(0.6) ? 0 : int(3, 10);
  S.invert = chance(0.2);

  // ── attractor
  const A = F.attractor;
  A.on = skeletonName === 'Amaya Flow' ? true : chance(0.25);
  A.x = r2(between(0.3, 0.7));
  A.y = r2(between(0.3, 0.7));
  A.radius = r2(between(0.2, 0.45));
  A.strength = r2(between(-0.5, 0.5));
  A.bend = r2(between(0.3, 0.9));

  // ── layout (cells kept roughly square in grid modes; mark count kept sane)
  const L = out.layout;
  if (mode === 'grid' || mode === 'brick') {
    L.cols = int(8, 48);
    L.rows = clamp(Math.round(L.cols * aspect), 1, 120);
  } else if (mode === 'columns') {
    L.cols = int(8, 40);
  } else if (mode === 'rows') {
    L.rows = int(8, 40);
  } else {
    L.cols = int(12, 44);
    L.rows = int(12, 44);
    L.strandAmount = r2(between(0.4, 1.4));
    L.strandSamples = 200;
  }
  L.margin = r2(between(0.04, 0.16));
  L.gutterX = r2(between(0.05, 0.5));
  L.gutterY = r2(between(0.05, 0.5));
  L.jitter = chance(0.15) ? r2(between(0.05, 0.3)) : 0;
  L.rotation = chance(0.15) ? pick([-30, -15, 15, 30, 45]) : 0;
  L.stagger = r2(between(0.25, 0.75));
  L.anchor = pick(['start', 'center', 'end'] as const);

  // ── marks
  const M = out.marks;
  if (M.shape !== 'meter') {
    M.shape = mode === 'strands' ? M.shape
      : weighted<ShapeKind>([['rect', 4], ['pill', 3], ['line', 2], ['parallelogram', 1.5], ['dot', 1]]);
  } else {
    M.meter.trackThickness = r2(between(0.03, 0.12));
    M.meter.trackOpacity = r2(between(0.15, 0.5));
    M.meter.fillThickness = r2(between(0.25, 0.6));
    M.meter.capSize = r2(between(0.3, 1));
    M.meter.capOffset = r2(between(0.04, 0.3));
    M.meter.capFollowsWave = chance(0.3);
    M.meter.capWaveFreq = r2(between(0.5, 3));
    M.meter.capWaveSpeed = r2(between(-0.3, 0.3));
  }
  M.radius = M.shape === 'rect' ? (chance(0.6) ? 0 : r2(between(0.1, 0.5))) : r2(between(0.3, 1));
  M.skew = M.shape === 'parallelogram' ? Math.round(between(15, 40)) * (chance(0.5) ? 1 : -1) : 0;

  // ── mappings
  const map = out.map;
  const sources: [Source, number][] = [['field', 5], ['x', 1], ['y', 1], ['radial', 1], ['const', 1.5]];
  const randMap = (m: Mapping, lo: number, hi: number, minSpan: number) => {
    m.source = weighted(sources);
    const a = r2(between(lo, hi - minSpan));
    m.min = a;
    m.max = r2(between(a + minSpan, hi));
  };
  if (mode === 'columns' || mode === 'rows') {
    randMap(map.thickness, 0.2, 0.95, 0.1);
    map.thickness.source = chance(0.6) ? 'const' : map.thickness.source;
    randMap(map.length, 0.05, 1, 0.3);
    map.length.source = 'field';
  } else if (mode === 'strands') {
    randMap(map.thickness, 0.1, 0.8, 0.1);
  } else {
    randMap(map.thickness, 0.1, 0.8, 0.1);
    randMap(map.length, 0.3, 1.2, 0.1);
  }
  map.opacity = chance(0.75) ? { source: 'const', min: 1, max: 1 } : { source: 'field', min: r2(between(0.3, 0.7)), max: 1 };
  map.colour = { source: 'field', min: 0, max: 1 };
  map.offsetX = { source: 'const', min: 0, max: 0 };
  map.offsetY = { source: 'const', min: 0, max: 0 };
  map.skew = { source: 'const', min: 0, max: 0 };
  map.threshold = chance(0.2) ? r2(between(0.05, 0.3)) : 0;
  if (mode === 'grid' || mode === 'brick') {
    map.angleMode = weighted<AngleMode>([['fixed', 4], ['value', 2], ['flow', 2], ['swirl', 1]]);
    map.fixedAngle = pick([0, 0, 90, 45, -45]);
    map.angle = { source: 'field', min: Math.round(between(-90, 0)), max: Math.round(between(0, 90)) };
  }

  // ── colour
  const palName = pick(PALETTE_NAMES);
  Object.assign(out.colour, paletteFor(palName));
  out.colour.source = weighted<ColourSource>([['field', 4], ['x', 1.5], ['y', 1.5], ['radial', 1], ['random', 0.5]]);
  out.colour.continuous = chance(0.2);
  out.colour.gradAngle = pick([0, 45, 90, 135]);
  out.colour.gradRepeat = int(1, 4);
  out.colour.accentEvery = chance(0.3) ? int(4, 12) : 0;
  out.colour.accentTarget = mode === 'rows' ? 'row' : mode === 'columns' ? 'column' : pick(['mark', 'column', 'row'] as const);

  return withDefaults(out);
}

// ─────────────────────────────────────────────────────────── FILE NAMES

/** `OneSyntax_Pattern-Preset-Name_seed` — same base for png / svg / json / webm. */
export function fileBase(p: Params): string {
  const name = (p.name || 'Untitled').trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '') || 'Untitled';
  return `OneSyntax_Pattern-${name}_${p.seed | 0}`;
}
