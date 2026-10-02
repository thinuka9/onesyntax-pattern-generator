/**
 * OneSyntax Pattern Generator — parameter schema and module contracts.
 *
 * A preset is exactly one `Params` object. Everything visible on screen, in PNG
 * and in SVG is a pure function of (Params, time). Nothing reads Math.random().
 *
 * Units
 * - Angles in the schema are DEGREES. Geometry instances store RADIANS.
 * - Positions inside the field are normalised: u = x / width, v = y / height (0..1, y down).
 * - Mark sizes in mappings are fractions of the cell pitch (see Mappings).
 * - Geometry output is in canvas pixels (params.canvas.width × height, y down).
 */

// ─────────────────────────────────────────────────────────── FIELD

export interface WaveComponent {
  on: boolean;
  weight: number;   // 0..1   contribution to the weighted sum
  freq: number;     // 0..20  cycles across the canvas's shorter side
  dir: number;      // 0..360 degrees, direction the wave travels (0 = +x, 90 = +y)
  phase: number;    // 0..1   phase offset in cycles
  speed: number;    // -2..2  cycles per second
}

export interface RadialComponent {
  on: boolean;
  weight: number;
  cx: number;       // 0..1 centre, normalised canvas coords
  cy: number;       // 0..1
  freq: number;     // 0..20 rings across the shorter side
  speed: number;    // -2..2 cycles per second (positive = rings move outward)
}

export interface NoiseComponent {
  on: boolean;
  weight: number;
  scale: number;    // 0.2..12 features across the shorter side
  octaves: number;  // 1..6 fbm octaves
  drift: number;    // 0..2 drift speed, units of noise space per second
}

export interface DataComponent {
  on: boolean;
  weight: number;
  seed: number;        // integer, seeds the random walk (independent of global seed)
  smoothing: number;   // 0..1  0 = stepped per column/row, 1 = smooth cosine interpolation + moving average
  trend: number;       // -1..1 linear drift of the walk across the series
  volatility: number;  // 0..1  step size of the walk
  axis: 'x' | 'y';     // 'x' = one value per column, 'y' = one value per row
  values: string;      // optional pasted numbers "12, 18, 9, 22". Non-empty & parseable overrides the walk.
  speed: number;       // 0..2  how fast the series scrolls along its axis over time (0 = static)
}

export interface GradientComponent {
  on: boolean;
  weight: number;
  angle: number;    // degrees, ramp direction (0 = left→right, 90 = top→bottom)
}

export type Mirror = 'none' | 'x' | 'y' | 'xy';

export interface Shaping {
  warpAmount: number;  // 0..0.5 domain warp displacement in normalised units
  warpScale: number;   // 0.2..12 warp noise frequency
  mirror: Mirror;      // fold coordinates around the centre before sampling
  contrast: number;    // 0..4   1 = neutral, pivot 0.5
  bias: number;        // 0.1..5 gamma: v = pow(v, bias). 1 = neutral
  quantise: number;    // 0..32 integer steps, 0 = off
  invert: boolean;
}

export interface Attractor {
  on: boolean;
  x: number;         // 0..1
  y: number;         // 0..1
  radius: number;    // 0..1 of the shorter side
  strength: number;  // -1..1 positive pushes field value up inside radius, negative pulls down
  bend: number;      // 0..1 how strongly mark angles bend around it (flow-around-obstacle, Amaya look)
}

export interface FieldParams {
  waveA: WaveComponent;
  waveB: WaveComponent;
  radial: RadialComponent;
  noise: NoiseComponent;
  data: DataComponent;
  gradient: GradientComponent;
  shaping: Shaping;
  attractor: Attractor;
}

// ─────────────────────────────────────────────────────────── LAYOUT

export type LayoutMode = 'grid' | 'brick' | 'columns' | 'rows' | 'strands';
export type Anchor = 'start' | 'center' | 'end';

export interface LayoutParams {
  mode: LayoutMode;
  cols: number;        // 1..400
  rows: number;        // 1..400
  margin: number;      // 0..0.45 fraction of the shorter side, applied on all sides
  gutterX: number;     // 0..0.95 fraction of the cell width left empty between cells
  gutterY: number;     // 0..0.95 fraction of the cell height left empty between cells
  jitter: number;      // 0..1 seeded positional jitter, fraction of cell size
  rotation: number;    // -180..180 degrees, rotates the whole layout about canvas centre
  stagger: number;     // 0..1 brick mode: horizontal offset of odd rows, fraction of cell width
  anchor: Anchor;      // where marks sit along their length axis inside the cell
                       // (columns: start = top, end = bottom; rows: start = left)
  strandAxis: 'vertical' | 'horizontal';
  strandSamples: number; // 8..400 samples per strand
  strandAmount: number;  // 0..2 sideways displacement = (value - 0.5) * amount * cell pitch
}

// ─────────────────────────────────────────────────────────── MARKS

export type ShapeKind = 'rect' | 'pill' | 'parallelogram' | 'line' | 'dot' | 'meter';

export interface MeterParams {
  trackThickness: number; // 0..1 fraction of cell width
  trackOpacity: number;   // 0..1
  fillThickness: number;  // 0..1 fraction of cell width
  capSize: number;        // 0..1 cap height as fraction of cell width (cap width = fillThickness)
  capOffset: number;      // 0..1 gap above the fill top, fraction of column height
  capFollowsWave: boolean;// cap position follows a second wave instead of sitting above fill
  capWaveFreq: number;    // 0..10
  capWaveSpeed: number;   // -2..2
}

export interface MarkParams {
  shape: ShapeKind;
  radius: number;     // 0..1 corner radius as fraction of half-thickness (1 = fully round)
  skew: number;       // -75..75 degrees base skew (parallelogram); added to the skew mapping
  meter: MeterParams;
}

// ─────────────────────────────────────────────────────────── MAPPINGS

export type Source = 'field' | 'x' | 'y' | 'radial' | 'const';

/** value = min + (max - min) * s, where s in 0..1 comes from `source` ('const' → s = 1). */
export interface Mapping {
  source: Source;
  min: number;
  max: number;
}

export type AngleMode = 'value' | 'flow' | 'swirl' | 'fixed';

export interface MappingParams {
  thickness: Mapping; // fraction of cell pitch across the mark   (0..1.5)
  length: Mapping;    // fraction of cell pitch along the mark     (0..3). Columns/rows: fraction of full span
  angle: Mapping;     // degrees, used when angleMode = 'value'    (-180..180)
  opacity: Mapping;   // 0..1
  colour: Mapping;    // 0..1 position on the colour gradient (only used when colour.source = 'field' etc., see ColourParams)
  offsetX: Mapping;   // fraction of cell width   (-1..1)
  offsetY: Mapping;   // fraction of cell height  (-1..1)
  skew: Mapping;      // degrees (-75..75), added to marks.skew
  threshold: number;  // 0..1 marks whose field value < threshold are hidden (barcode gaps)
  angleMode: AngleMode;
  fixedAngle: number; // degrees, base angle for 'fixed', 'flow' and 'swirl' are added to it
}

// ─────────────────────────────────────────────────────────── COLOUR

export type ColourSource = 'field' | 'x' | 'y' | 'radial' | 'random';
export type AccentTarget = 'mark' | 'column' | 'row';

export interface ColourParams {
  palette: string;      // name of the palette last applied (informational)
  background: string;   // '#rrggbb'
  stops: string[];      // 2 or 3 '#rrggbb' gradient stops
  source: ColourSource; // drives per-mark gradient position (through mappings.colour min/max)
  continuous: boolean;  // colour by SCREEN position in the fragment shader instead of per mark
  gradAngle: number;    // degrees, direction of the continuous gradient (ignored for 'radial')
  gradRepeat: number;   // 1..12 mirrored repeats of the continuous gradient
  accent: string;       // '#rrggbb'
  accentEvery: number;  // 0 = off, else every Nth mark/column/row gets the accent colour
  accentTarget: AccentTarget;
}

// ─────────────────────────────────────────────────────────── MOTION / CANVAS

export interface MotionParams {
  playing: boolean;
  speed: number;     // 0..4 global time multiplier
  time: number;      // seconds, current scrub position
  loopSeconds: number; // length of the WebM export (default 5)
}

export interface CanvasParams {
  format: string;   // key into FORMATS in presets.ts, or 'custom'
  width: number;    // logical pixels
  height: number;
}

export interface Params {
  version: 1;
  name: string;        // preset name, used in file names
  seed: number;        // integer 0..999999, drives jitter, random colours, noise permutation
  field: FieldParams;
  layout: LayoutParams;
  marks: MarkParams;
  map: MappingParams;
  colour: ColourParams;
  motion: MotionParams;
  canvas: CanvasParams;
}

// ─────────────────────────────────────────────────────────── MODULE CONTRACTS

/** field.ts: `buildField(p: Params): FieldSampler` — precomputes data series / permutation tables once. */
export interface FieldSampler {
  /** Final shaped value 0..1 at normalised (u, v) and time t (seconds, already multiplied by motion.speed). */
  value(u: number, v: number, t: number): number;
  /** Shaped value BEFORE quantise (sign-flipped when invert is on) — smooth, for the 'flow' angle mode. */
  raw(u: number, v: number, t: number): number;
  /**
   * Gradient of the shaped value with respect to (u, v) in aspect-corrected space,
   * used by the 'flow' angle mode (marks follow contours = perpendicular to gradient).
   */
  gradient(u: number, v: number, t: number): [number, number];
  /**
   * Angular deflection in radians that the attractor applies at (u, v): marks bend around it
   * like a flow field around an obstacle. 0 when attractor is off or far away.
   */
  attractorBend(u: number, v: number): number;
}

/** layout.ts: `buildLayout(p: Params): Cell[]` — pure, deterministic for a given seed. */
export interface Cell {
  index: number;   // running index in emission order
  col: number;
  row: number;
  cx: number;      // centre in canvas px (after jitter + global rotation)
  cy: number;
  w: number;       // cell pitch along x (px), before gutter
  h: number;       // cell pitch along y (px), before gutter
  u: number;       // cx / width (normalised, used to sample the field)
  v: number;       // cy / height
}

/** Layer tags; svg.ts groups by these and the renderer may use them. */
export const Layer = {
  Background: 0,
  Track: 1,
  Fill: 2,
  Cap: 3,
  Accent: 4,
  Mark: 5,   // ordinary non-meter marks
  Strand: 6, // segments of a strand; SVG draws strands from Geometry.strands instead
} as const;
export type Layer = (typeof Layer)[keyof typeof Layer];
export const LAYER_NAMES = ['background', 'track', 'fill', 'cap', 'accent', 'marks', 'strands'] as const;

/**
 * One drawable instance = a skewed, rotated rounded box (SDF in the fragment shader).
 * Packed into Float32Array with this stride and these offsets.
 * The box is defined in local space: half-extent hw along local x, hh along local y,
 * a horizontal shear x' = x + skew * y (skew = tan(skewAngle)), then rotated by `angle`
 * and translated to (cx, cy). Corner radius in px, clamped to min(hw, hh) by consumers.
 * Dot = hw == hh with radius = hh. Pill/line = radius = min(hw, hh).
 */
export const STRIDE = 16;
export const I = {
  CX: 0, CY: 1, HW: 2, HH: 3,
  ANGLE: 4,   // radians
  SKEW: 5,    // tan(skew angle)
  RADIUS: 6,  // px
  R: 7, G: 8, B: 9, A: 10, // sRGB 0..1 (hex/255, gamma-encoded, NOT premultiplied); A = opacity
  LAYER: 11,  // Layer value
  CONT: 12,   // 1 = take colour from the continuous screen-space gradient, 0 = use R,G,B
  SHAPE: 13,  // index into SHAPES (for SVG naming)
  // 14, 15 reserved (0)
} as const;
export const SHAPES: ShapeKind[] = ['rect', 'pill', 'parallelogram', 'line', 'dot', 'meter'];

export interface StrandPath {
  /** centre-line points in px */
  xs: Float32Array;
  ys: Float32Array;
  /** half thickness at each point, px */
  hws: Float32Array;
  r: number; g: number; b: number; a: number;
  cont: boolean;
  layer: Layer;
}

export interface ContinuousGradient {
  enabled: boolean;
  kind: 'linear' | 'radial';
  angle: number;    // radians
  repeat: number;   // mirrored repeats
  /** radial centre px and radius px (radius = half diagonal) */
  cx: number; cy: number; radius: number;
  stops: [number, number, number][]; // 2..3 stops as 0..1 sRGB (hex/255)
}

/** marks.ts: `buildGeometry(p: Params, t: number): Geometry` — the single source of truth for every output. */
export interface Geometry {
  width: number;
  height: number;
  background: [number, number, number];
  count: number;          // number of instances used in `data`
  data: Float32Array;     // count * STRIDE floats, drawn in order (painter's order)
  strands: StrandPath[];  // non-empty only in strands layout
  gradient: ContinuousGradient;
}
