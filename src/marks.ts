import { STRIDE, Layer, SHAPES } from './types';
import type { Params, Geometry, FieldSampler, StrandPath, Cell, Source, Mapping } from './types';
import { buildField } from './field';
import { buildLayout } from './layout';
import { hash01, hexToRgb, DEG, TAU } from './util';
import type { RGB } from './util';

/**
 * marks.ts — Params + time → Geometry. The single source of truth for screen, PNG, SVG and WebM.
 *
 * ── Instance conventions (renderer + SVG must reproduce exactly) ──────────────────────────────
 * Each instance is a box in local space: half-extent HW along local x, HH along local y. Local x is ALWAYS the
 * mark's long axis ("length"), local y its thickness. The box is sheared x' = x + SKEW * y, then rotated by
 * ANGLE (radians, standard matrix [cos -sin; sin cos] in y-down canvas px → positive = clockwise on screen),
 * then translated to (CX, CY). SVG equivalent: translate(cx cy) rotate(angle°) skewX(atan(skew)°), rect
 * x=-hw y=-hh width=2hw height=2hh rx=radius.
 *
 * - Grid / brick / rows: base angle 0 (long axis horizontal).
 * - Columns (and meters outside rows layout): base angle +π/2 — the box is emitted with HW = half the VERTICAL
 *   extent and HH = half the horizontal width, rotated by +90°. No axis swapping anywhere.
 * - Angle modes: 'fixed' / 'value' → base + angle + layout rotation + attractorBend.
 *   'flow' / 'swirl' are absolute screen directions (contour / tangent) + fixedAngle + attractorBend; layout
 *   rotation and base angle are NOT added there, otherwise marks would stop following the field.
 *   If the flow gradient (or swirl radius) is ~0 they fall back to the 'fixed' formula.
 * - Anchor (non-meter marks): pivot point is the start/end of the cell's available span along the layout axis
 *   (x for grid/brick/rows, y for columns, in the rotated layout frame); the mark extends from that pivot along
 *   its own (possibly bent) direction, sign chosen to point into the cell.
 *
 * ── Meters (shape 'meter') ─────────────────────────────────────────────────────────────────────
 * Vertical in every layout except 'rows' (horizontal). Span S = full column height (columns), cell height
 * × (1 - gutterY) (grid/brick), full row width (rows). Widths are fractions of the cell pitch across (w, or h
 * for rows). Fill rises from the bottom (vertical; top if anchor = 'start') or from the left (rows; right if
 * anchor = 'end'). The whole meter rotates about its cell centre by the computed angle (upright at fixed 0).
 * Emission order: ALL tracks (Layer.Track), then ALL fills (Layer.Fill), then ALL caps (Layer.Cap).
 * Accented meters keep their track as Layer.Track and emit fill + cap as Layer.Accent (still within the fill /
 * cap blocks). Threshold hides fill + cap but keeps the track.
 *
 * ── Strands ────────────────────────────────────────────────────────────────────────────────────
 * Geometry.strands holds one StrandPath per strand (exact; SVG uses these). For WebGL every consecutive point
 * pair is ALSO emitted as a capsule instance: centre = midpoint, HW = half segment length + HH, HH = average
 * half-thickness, RADIUS = HH, ANGLE = segment direction, SHAPE = 'line', LAYER = Layer.Strand (always, even on
 * accented strands — the StrandPath carries Layer.Accent instead). Segments with zero thickness are skipped.
 * Note: semi-transparent strands show overlap darkening at the capsule joins in WebGL; SVG is exact.
 * Threshold in strands sets the half-thickness to 0 where value < threshold (gaps along the strand).
 *
 * ── Buffer reuse ───────────────────────────────────────────────────────────────────────────────
 * `data` is a subarray view of a pooled, growing Float32Array, and StrandPath objects / their arrays are pooled
 * too. The NEXT call to buildGeometry overwrites them. Consume immediately (render / SVG / PNG do) or call
 * `cloneGeometry` if you need to keep a Geometry around.
 */

// ─────────────────────────────────────────────────────────── memo: field

let fieldKey = '';
let fieldCache: FieldSampler | null = null;

function getField(p: Params): FieldSampler {
  const L = p.layout;
  const key =
    JSON.stringify(p.field) + '|' + p.seed + '|' + L.cols + '|' + L.rows + '|' + L.margin + '|' +
    p.canvas.width + 'x' + p.canvas.height;
  if (key !== fieldKey || !fieldCache) {
    fieldCache = buildField(p);
    fieldKey = key;
  }
  return fieldCache;
}

// ─────────────────────────────────────────────────────────── pools

let pool: Float32Array = new Float32Array(STRIDE * 4096);
let vals: Float32Array = new Float32Array(4096);
let fillBuf: Float32Array = new Float32Array(STRIDE * 1024);
let capBuf: Float32Array = new Float32Array(STRIDE * 1024);
const strandPool: StrandPath[] = [];

function grow(buf: Float32Array, floats: number): Float32Array {
  if (buf.length >= floats) return buf;
  return new Float32Array(Math.max(floats, Math.ceil(buf.length * 1.5)));
}

/** Deep copy of a Geometry, detached from the internal pools (use when a Geometry must outlive the next call). */
export function cloneGeometry(g: Geometry): Geometry {
  return {
    width: g.width,
    height: g.height,
    background: [g.background[0], g.background[1], g.background[2]],
    count: g.count,
    data: g.data.slice(0, g.count * STRIDE),
    strands: g.strands.map((s) => ({ ...s, xs: s.xs.slice(), ys: s.ys.slice(), hws: s.hws.slice() })),
    gradient: { ...g.gradient, stops: g.gradient.stops.map((s) => [s[0], s[1], s[2]] as [number, number, number]) },
  };
}

// ─────────────────────────────────────────────────────────── per-call state (numeric, monomorphic)

const SRC_FIELD = 0, SRC_X = 1, SRC_Y = 2, SRC_RADIAL = 3, SRC_CONST = 4, SRC_RANDOM = 5;
const ANG_FIXED = 0, ANG_VALUE = 1, ANG_FLOW = 2, ANG_SWIRL = 3;

function srcCode(s: Source | string): number {
  switch (s) {
    case 'field': return SRC_FIELD;
    case 'x': return SRC_X;
    case 'y': return SRC_Y;
    case 'radial': return SRC_RADIAL;
    case 'random': return SRC_RANDOM;
    default: return SRC_CONST;
  }
}

/** s in 0..1 for a mapping source. 'const' → 1. */
function sv(code: number, fv: number, u: number, v: number, r: number): number {
  let s: number;
  switch (code) {
    case SRC_FIELD: s = fv; break;
    case SRC_X: s = u; break;
    case SRC_Y: s = v; break;
    case SRC_RADIAL: s = r; break;
    default: return 1;
  }
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

/** Flattened mapping: code, min, max. */
interface FM { c: number; lo: number; d: number }
const fm = (m: Mapping): FM => ({ c: srcCode(m.source), lo: +m.min || 0, d: (+m.max || 0) - (+m.min || 0) });
const mv = (m: FM, fv: number, u: number, v: number, r: number) => m.lo + m.d * sv(m.c, fv, u, v, r);

const S = {
  W: 1, H: 1, hx: 0.5, hy: 0.5, invHalfDiag: 1, seed: 0, t: 0,
  rot: 0, rc: 1, rs: 0,
  angMode: 0, fixed: 0, swX: 0, swY: 0,
  colSrc: 0, cLo: 0, cD: 1,
  accEvery: 0, accTarget: 0, // 0 mark, 1 column, 2 row
  cont: 0,
  nStops: 2,
  st: new Float64Array(9),
  acc: new Float64Array(3),
};
// scratch colour output
let oR = 0, oG = 0, oB = 0;

function sampleColour(t: number): void {
  const n = S.nStops, st = S.st;
  if (n === 1) { oR = st[0]; oG = st[1]; oB = st[2]; return; }
  const x = (t < 0 ? 0 : t > 1 ? 1 : t) * (n - 1);
  let i = Math.floor(x);
  if (i > n - 2) i = n - 2;
  const f = x - i, a = i * 3, b = a + 3;
  oR = st[a] + (st[b] - st[a]) * f;
  oG = st[a + 1] + (st[b + 1] - st[a + 1]) * f;
  oB = st[a + 2] + (st[b + 2] - st[a + 2]) * f;
}

function colourPos(fv: number, u: number, v: number, r: number, index: number): number {
  let s: number;
  switch (S.colSrc) {
    case SRC_FIELD: s = fv; break;
    case SRC_X: s = u; break;
    case SRC_Y: s = v; break;
    case SRC_RADIAL: s = r; break;
    case SRC_RANDOM: s = hash01(S.seed, index); break;
    default: s = 1;
  }
  if (s < 0) s = 0; else if (s > 1) s = 1;
  return S.cLo + S.cD * s;
}

function isAccent(c: Cell): boolean {
  const n = S.accEvery;
  if (n <= 0) return false;
  const k = S.accTarget === 0 ? c.index : S.accTarget === 1 ? c.col : c.row;
  return k % n === 0;
}

// ─────────────────────────────────────────────────────────── flow field (structure tensor)
//
// 'flow' marks follow the field's contours. A raw per-point gradient is unusable on ridges and valleys
// (it vanishes and flips sign, so marks spin 90°). Instead: sample the smooth pre-quantise field on a lattice,
// take the gradient per lattice cell, accumulate the sign-free structure tensor (gx², gx·gy, gy²), blur it 3×3,
// and read the dominant orientation bilinearly at each mark. Ridges get their direction from both flanks,
// which agree, so contours stay continuous. Cost ≈ one field sample per lattice node, independent of mark count.

let fNx = 0, fNy = 0;
let fJ: Float64Array = new Float64Array(0);   // blurred tensor per lattice cell: [xx, xy, yy]
let fTmp: Float64Array = new Float64Array(0);
let fNode: Float64Array = new Float64Array(0);

function buildFlow(p: Params, field: FieldSampler, t: number): void {
  const W = p.canvas.width, H = p.canvas.height;
  // lattice resolution tracks the mark grid but is capped: the tensor is blurred anyway, and the cap keeps
  // flow at 20k marks inside the 60 fps budget (≈ 9k field samples per frame at most)
  const long = Math.max(48, Math.min(128, Math.round(1.25 * Math.max(p.layout.cols, p.layout.rows))));
  const nx = W >= H ? long : Math.max(8, Math.round((long * W) / H));
  const ny = H >= W ? long : Math.max(8, Math.round((long * H) / W));
  fNx = nx; fNy = ny;
  const nodes = (nx + 1) * (ny + 1), cellsN = nx * ny * 3;
  if (fNode.length < nodes) fNode = new Float64Array(nodes);
  if (fJ.length < cellsN) { fJ = new Float64Array(cellsN); fTmp = new Float64Array(cellsN); }
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) fNode[j * (nx + 1) + i] = field.raw(i / nx, j / ny, t);
  // gradient per cell in pixel-proportional units (angles must be measured in screen space)
  const sx = nx / W, sy = ny / H;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = fNode[j * (nx + 1) + i], b = fNode[j * (nx + 1) + i + 1];
      const c = fNode[(j + 1) * (nx + 1) + i], d = fNode[(j + 1) * (nx + 1) + i + 1];
      const gx = 0.5 * (b - a + d - c) * sx, gy = 0.5 * (c - a + d - b) * sy;
      const o = (j * nx + i) * 3;
      fTmp[o] = gx * gx; fTmp[o + 1] = gx * gy; fTmp[o + 2] = gy * gy;
    }
  }
  // 3×3 box blur of the tensor (clamped at the borders)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let xx = 0, xy = 0, yy = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj < 0 ? 0 : j + dj >= ny ? ny - 1 : j + dj;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di < 0 ? 0 : i + di >= nx ? nx - 1 : i + di;
          const o = (jj * nx + ii) * 3;
          xx += fTmp[o]; xy += fTmp[o + 1]; yy += fTmp[o + 2];
        }
      }
      const o = (j * nx + i) * 3;
      fJ[o] = xx; fJ[o + 1] = xy; fJ[o + 2] = yy;
    }
  }
}

/** Contour direction (radians) at (u, v), or NaN where the field is flat. */
function flowAngle(u: number, v: number): number {
  const nx = fNx, ny = fNy;
  let x = u * nx - 0.5, y = v * ny - 0.5;
  x = x < 0 ? 0 : x > nx - 1 ? nx - 1 : x;
  y = y < 0 ? 0 : y > ny - 1 ? ny - 1 : y;
  const i0 = Math.min(nx - 2, Math.floor(x)), j0 = Math.min(ny - 2, Math.floor(y));
  const fx = x - i0, fy = y - j0;
  const o00 = (j0 * nx + i0) * 3, o10 = o00 + 3, o01 = o00 + nx * 3, o11 = o01 + 3;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const xx = fJ[o00] * w00 + fJ[o10] * w10 + fJ[o01] * w01 + fJ[o11] * w11;
  const xy = fJ[o00 + 1] * w00 + fJ[o10 + 1] * w10 + fJ[o01 + 1] * w01 + fJ[o11 + 1] * w11;
  const yy = fJ[o00 + 2] * w00 + fJ[o10 + 2] * w10 + fJ[o01 + 2] * w01 + fJ[o11 + 2] * w11;
  if (xx + yy < 1e-14) return NaN;
  // dominant gradient orientation, rotated 90° → along the contour
  return 0.5 * Math.atan2(2 * xy, xx - yy) + Math.PI / 2;
}

/**
 * Final angle (radians) of a mark's long axis. `base` = 0 (horizontal) or π/2 (vertical).
 */
function angleFor(field: FieldSampler, angM: FM, fv: number, u: number, v: number, r: number, cx: number, cy: number, base: number): number {
  const bend = field.attractorBend(u, v);
  switch (S.angMode) {
    case ANG_VALUE:
      return base + mv(angM, fv, u, v, r) * DEG + S.rot + bend;
    case ANG_FLOW: {
      const a = flowAngle(u, v);
      if (a === a) return a + S.fixed + bend; // NaN = no structure here → fixed fallback
      break;
    }
    case ANG_SWIRL: {
      const dx = cx - S.swX, dy = cy - S.swY;
      if (dx * dx + dy * dy > 1e-6) return Math.atan2(dy, dx) + Math.PI / 2 + S.fixed + bend;
      break;
    }
  }
  return base + S.fixed + S.rot + bend;
}

function put(
  buf: Float32Array, o: number, cx: number, cy: number, hw: number, hh: number, ang: number, skew: number,
  rad: number, r: number, g: number, b: number, a: number, layer: number, cont: number, shape: number,
): void {
  buf[o] = cx; buf[o + 1] = cy; buf[o + 2] = hw; buf[o + 3] = hh;
  buf[o + 4] = ang; buf[o + 5] = skew; buf[o + 6] = rad;
  buf[o + 7] = r; buf[o + 8] = g; buf[o + 9] = b; buf[o + 10] = a;
  buf[o + 11] = layer; buf[o + 12] = cont; buf[o + 13] = shape;
  buf[o + 14] = 0; buf[o + 15] = 0;
}

const TAN75 = Math.tan(75 * DEG);
function skewTan(deg: number): number {
  const t = Math.tan(deg * DEG);
  return t > TAN75 ? TAN75 : t < -TAN75 ? -TAN75 : t;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const gutter = (g: number) => (g > 0.95 ? 0.95 : g > 0 ? g : 0);
const BLEED = 0.5; // logical px of overlap between touching opaque marks (see emitMarks)

// ─────────────────────────────────────────────────────────── main

export function buildGeometry(p: Params, t: number): Geometry {
  const W = p.canvas.width, H = p.canvas.height;
  const cells = buildLayout(p);
  const field = getField(p);
  const C = p.colour, L = p.layout;

  // per-call state
  S.W = W; S.H = H; S.hx = W / 2; S.hy = H / 2;
  S.invHalfDiag = 1 / Math.max(1e-6, Math.hypot(W / 2, H / 2));
  S.seed = p.seed | 0; S.t = t;
  S.rot = (L.rotation || 0) * DEG; S.rc = Math.cos(S.rot); S.rs = Math.sin(S.rot);
  const am = p.map.angleMode;
  S.angMode = am === 'value' ? ANG_VALUE : am === 'flow' ? ANG_FLOW : am === 'swirl' ? ANG_SWIRL : ANG_FIXED;
  S.fixed = (p.map.fixedAngle || 0) * DEG;
  const at = p.field.attractor;
  S.swX = at.on ? at.x * W : W / 2;
  S.swY = at.on ? at.y * H : H / 2;
  S.colSrc = srcCode(C.source);
  S.cLo = +p.map.colour.min || 0; S.cD = (+p.map.colour.max || 0) - S.cLo;
  S.accEvery = Math.max(0, Math.floor(C.accentEvery || 0));
  S.accTarget = C.accentTarget === 'mark' ? 0 : C.accentTarget === 'row' ? 2 : 1;
  S.cont = C.continuous ? 1 : 0;
  const stopsRgb: RGB[] = (Array.isArray(C.stops) && C.stops.length ? C.stops : ['#000000']).slice(0, 3).map(hexToRgb);
  S.nStops = stopsRgb.length;
  for (let i = 0; i < stopsRgb.length; i++) { S.st[i * 3] = stopsRgb[i][0]; S.st[i * 3 + 1] = stopsRgb[i][1]; S.st[i * 3 + 2] = stopsRgb[i][2]; }
  const acc = hexToRgb(C.accent);
  S.acc[0] = acc[0]; S.acc[1] = acc[1]; S.acc[2] = acc[2];

  if (S.angMode === ANG_FLOW) buildFlow(p, field, t);

  let count = 0;
  let strands: StrandPath[] = [];
  if (L.mode === 'strands') {
    const r = emitStrands(p, t, cells, field);
    count = r;
    strands = strandPool.slice(0, cells.length);
  } else if (p.marks.shape === 'meter') {
    count = emitMeters(p, t, cells, field);
  } else {
    count = emitMarks(p, t, cells, field);
  }

  return {
    width: W,
    height: H,
    background: hexToRgb(C.background),
    count,
    data: pool.subarray(0, count * STRIDE),
    strands,
    gradient: {
      enabled: !!C.continuous,
      kind: C.source === 'radial' ? 'radial' : 'linear',
      angle: (C.gradAngle || 0) * DEG,
      repeat: Math.max(1, C.gradRepeat || 1),
      cx: W / 2, cy: H / 2, radius: Math.hypot(W / 2, H / 2),
      stops: stopsRgb.map((s) => [s[0], s[1], s[2]] as [number, number, number]),
    },
  };
}

function sampleValues(cells: Cell[], field: FieldSampler, t: number): void {
  const n = cells.length;
  if (vals.length < n) vals = new Float32Array(Math.max(n, Math.ceil(vals.length * 1.5)));
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    vals[i] = field.value(c.u, c.v, t);
  }
}

// ─────────────────────────────────────────────────────────── ordinary marks

function emitMarks(p: Params, t: number, cells: Cell[], field: FieldSampler): number {
  const N = cells.length;
  pool = grow(pool, N * STRIDE);
  sampleValues(cells, field, t);
  const buf = pool;
  const L = p.layout, M = p.map, K = p.marks;
  const mode = L.mode;
  const gx = gutter(L.gutterX), gy = gutter(L.gutterY);
  const shape = K.shape;
  let shapeIdx = SHAPES.indexOf(shape);
  if (shapeIdx < 0) shapeIdx = 0;
  const isDot = shape === 'dot';
  const roundFull = shape === 'pill' || shape === 'line';
  const cornerK = Math.max(0, Math.min(1, K.radius || 0));
  const vertical = mode === 'columns';
  const base = vertical ? Math.PI / 2 : 0;
  const anchor = L.anchor === 'start' ? -1 : L.anchor === 'end' ? 1 : 0;
  // layout axis (unit, rotated layout frame)
  const axX = vertical ? -S.rs : S.rc;
  const axY = vertical ? S.rc : S.rs;
  const thr = M.threshold || 0;
  const thkM = fm(M.thickness), lenM = fm(M.length), angM = fm(M.angle), opM = fm(M.opacity);
  const oxM = fm(M.offsetX), oyM = fm(M.offsetY), skM = fm(M.skew);
  const constSkew = skM.c === SRC_CONST;
  const skewConstVal = isDot ? 0 : skewTan((K.skew || 0) + skM.lo + skM.d);
  const hasOffset = !(oxM.c === SRC_CONST && oxM.lo + oxM.d === 0 && oyM.c === SRC_CONST && oyM.lo + oyM.d === 0);
  const cont = S.cont;
  const hx = S.hx, hy = S.hy, ihd = S.invHalfDiag, rc = S.rc, rs = S.rs;

  let n = 0;
  for (let i = 0; i < N; i++) {
    const fv = vals[i];
    if (thr > 0 && fv < thr) continue;
    const c = cells[i];
    const u = c.u, v = c.v;
    const r = Math.hypot(c.cx - hx, c.cy - hy) * ihd;

    let availW: number, availH: number, along: number, across: number;
    if (vertical) { availW = c.w * (1 - gx); availH = c.h; along = availH; across = availW; }
    else if (mode === 'rows') { availW = c.w; availH = c.h * (1 - gy); along = availW; across = availH; }
    else { availW = c.w * (1 - gx); availH = c.h * (1 - gy); along = availW; across = availH; }

    const thk = mv(thkM, fv, u, v, r);
    let hw: number, hh: number, rad: number;
    if (isDot) {
      hw = hh = 0.5 * thk * (availW < availH ? availW : availH);
      rad = hh;
    } else {
      hw = 0.5 * mv(lenM, fv, u, v, r) * along;
      hh = 0.5 * thk * across;
      const m = hw < hh ? hw : hh;
      rad = roundFull ? m : cornerK * m;
    }
    if (!(hw > 0.01 && hh > 0.01)) continue;
    const op = clamp01(mv(opM, fv, u, v, r));
    if (op <= 0) continue;

    let cx = c.cx, cy = c.cy;
    if (hasOffset) {
      const ox = mv(oxM, fv, u, v, r) * availW, oy = mv(oyM, fv, u, v, r) * availH;
      cx += ox * rc - oy * rs;
      cy += ox * rs + oy * rc;
    }
    const ang = angleFor(field, angM, fv, u, v, r, cx, cy, base);
    if (anchor !== 0) {
      let dx = Math.cos(ang), dy = Math.sin(ang);
      if (dx * axX + dy * axY < 0) { dx = -dx; dy = -dy; }
      // pivot at the anchored end of the span, extend back into the cell
      const half = 0.5 * along;
      cx += anchor * (axX * half - dx * hw);
      cy += anchor * (axY * half - dy * hw);
    }
    const skew = isDot ? 0 : constSkew ? skewConstVal : skewTan((K.skew || 0) + mv(skM, fv, u, v, r));

    // Seam bleed: two antialiased edges meeting mid-pixel each cover ~50%, letting the background show
    // through as a hairline. Opaque, axis-aligned marks that fill their cell along a gutterless axis get
    // BLEED px of overlap on that axis — invisible when opaque, and it removes the seam at every scale.
    if (!isDot && op >= 0.999 && skew === 0 && Math.abs(Math.sin(ang - base)) < 1e-4) {
      const gAlong = vertical ? gy : gx, gAcross = vertical ? gx : gy;
      if (gAlong === 0 && 2 * hw >= along - 0.01) hw += BLEED;
      if (gAcross === 0 && 2 * hh >= across - 0.01) hh += BLEED;
    }

    let cr: number, cg: number, cb: number, layer: number = Layer.Mark, cflag = cont;
    if (isAccent(c)) {
      cr = S.acc[0]; cg = S.acc[1]; cb = S.acc[2]; layer = Layer.Accent; cflag = 0;
    } else {
      sampleColour(colourPos(fv, u, v, r, c.index));
      cr = oR; cg = oG; cb = oB;
    }
    put(buf, n * STRIDE, cx, cy, hw, hh, ang, skew, rad, cr, cg, cb, op, layer, cflag, shapeIdx);
    n++;
  }
  return n;
}

// ─────────────────────────────────────────────────────────── meters (Sinky)

function emitMeters(p: Params, t: number, cells: Cell[], field: FieldSampler): number {
  const N = cells.length;
  pool = grow(pool, N * 3 * STRIDE);
  fillBuf = grow(fillBuf, N * STRIDE);
  capBuf = grow(capBuf, N * STRIDE);
  sampleValues(cells, field, t);
  const L = p.layout, M = p.map, K = p.marks, MT = K.meter;
  const mode = L.mode;
  const gy = gutter(L.gutterY);
  const horizontal = mode === 'rows';
  const base = horizontal ? 0 : Math.PI / 2;
  // sgn: which end of the meter axis (+dir or -dir) the fill grows from
  const sgn = horizontal ? (L.anchor === 'end' ? 1 : -1) : (L.anchor === 'start' ? -1 : 1);
  const thr = M.threshold || 0;
  const lenM = fm(M.length), angM = fm(M.angle), opM = fm(M.opacity), oxM = fm(M.offsetX), oyM = fm(M.offsetY);
  const hasOffset = !(oxM.c === SRC_CONST && oxM.lo + oxM.d === 0 && oyM.c === SRC_CONST && oyM.lo + oyM.d === 0);
  const cornerK = Math.max(0, Math.min(1, K.radius || 0));
  const trackT = Math.max(0, MT.trackThickness || 0), trackOp = clamp01(MT.trackOpacity ?? 0);
  const fillT = Math.max(0, MT.fillThickness || 0), capSize = Math.max(0, MT.capSize || 0);
  const capOff = MT.capOffset || 0;
  const follow = !!MT.capFollowsWave, wf = MT.capWaveFreq || 0, ws = MT.capWaveSpeed || 0;
  const shapeIdx = SHAPES.indexOf('meter');
  const cont = S.cont;
  const hx = S.hx, hy = S.hy, ihd = S.invHalfDiag, rc = S.rc, rs = S.rs;
  const buf = pool, fb = fillBuf, kb = capBuf;

  let nt = 0, nf = 0, nc = 0;
  for (let i = 0; i < N; i++) {
    const fv = vals[i];
    const c = cells[i];
    const u = c.u, v = c.v;
    const r = Math.hypot(c.cx - hx, c.cy - hy) * ihd;
    let span: number, pitch: number, availW: number, availH: number;
    if (horizontal) { span = c.w; pitch = c.h; availW = c.w; availH = c.h * (1 - gy); }
    else if (mode === 'columns') { span = c.h; pitch = c.w; availW = c.w; availH = c.h; }
    else { span = c.h * (1 - gy); pitch = c.w; availW = c.w; availH = span; }
    if (!(span > 0)) continue;

    const op = clamp01(mv(opM, fv, u, v, r));
    let cx = c.cx, cy = c.cy;
    if (hasOffset) {
      const ox = mv(oxM, fv, u, v, r) * availW, oy = mv(oyM, fv, u, v, r) * availH;
      cx += ox * rc - oy * rs;
      cy += ox * rs + oy * rc;
    }
    const ang = angleFor(field, angM, fv, u, v, r, cx, cy, base);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const half = 0.5 * span;
    // base point (where the fill starts)
    const bx = cx + dx * sgn * half, by = cy + dy * sgn * half;

    sampleColour(colourPos(fv, u, v, r, c.index));
    const cr = oR, cg = oG, cb = oB;
    const accent = isAccent(c);

    // TRACK — full span, always drawn (even when thresholded), min 1 px wide
    const thh = Math.max(0.5, 0.5 * trackT * pitch);
    if (trackOp * op > 0 && trackT > 0) {
      put(buf, nt * STRIDE, cx, cy, half, thh, ang, 0, cornerK * Math.min(half, thh), cr, cg, cb, trackOp * op, Layer.Track, cont, shapeIdx);
      nt++;
    }
    if ((thr > 0 && fv < thr) || op <= 0) continue;

    const fr = accent ? S.acc[0] : cr, fg = accent ? S.acc[1] : cg, fbb = accent ? S.acc[2] : cb;
    const layerF = accent ? Layer.Accent : Layer.Fill, layerC = accent ? Layer.Accent : Layer.Cap;
    const cf = accent ? 0 : cont;

    // FILL
    let fillLen = mv(lenM, fv, u, v, r) * span;
    if (fillLen > span) fillLen = span;
    if (fillLen < 0) fillLen = 0;
    const fhh = 0.5 * fillT * pitch;
    if (fillLen > 0.01 && fhh > 0.01) {
      const fhw = 0.5 * fillLen;
      put(fb, nf * STRIDE, bx - dx * sgn * fhw, by - dy * sgn * fhw, fhw, fhh, ang, 0, cornerK * Math.min(fhw, fhh),
        fr, fg, fbb, op, layerF, cf, shapeIdx);
      nf++;
    }

    // CAP
    let capH = capSize * pitch;
    if (capH > span) capH = span;
    if (capH > 0.01 && fhh > 0.01) {
      let pos: number; // distance of cap centre from the base point, along the axis
      if (follow) {
        const q = horizontal ? v : u;
        const s = 0.5 + 0.5 * Math.sin(TAU * (wf * q - ws * t));
        pos = capH / 2 + s * (span - capH);
      } else {
        pos = fillLen + capOff * span + capH / 2;
      }
      const lo = capH / 2, hi = span - capH / 2;
      pos = pos < lo ? lo : pos > hi ? hi : pos;
      const chw = capH / 2;
      put(kb, nc * STRIDE, bx - dx * sgn * pos, by - dy * sgn * pos, chw, fhh, ang, 0, cornerK * Math.min(chw, fhh),
        fr, fg, fbb, op, layerC, cf, shapeIdx);
      nc++;
    }
  }
  buf.set(fb.subarray(0, nf * STRIDE), nt * STRIDE);
  buf.set(kb.subarray(0, nc * STRIDE), (nt + nf) * STRIDE);
  return nt + nf + nc;
}

// ─────────────────────────────────────────────────────────── strands (Deakin)

function emitStrands(p: Params, t: number, cells: Cell[], field: FieldSampler): number {
  const L = p.layout, M = p.map;
  const N = cells.length;
  const samples = Math.max(2, Math.min(2000, Math.round(L.strandSamples) || 2));
  pool = grow(pool, N * (samples - 1) * STRIDE);
  const buf = pool;
  const horizontal = L.strandAxis === 'horizontal';
  const rc = S.rc, rs = S.rs;
  // along = direction the strand runs, across = displacement direction (rotated layout frame)
  const alX = horizontal ? rc : -rs, alY = horizontal ? rs : rc;
  const acX = horizontal ? -rs : rc, acY = horizontal ? rc : rs;
  const g = gutter(horizontal ? L.gutterY : L.gutterX);
  const amount = L.strandAmount || 0;
  const thr = M.threshold || 0;
  const thkM = fm(M.thickness), opM = fm(M.opacity);
  const W = S.W, H = S.H, hx = S.hx, hy = S.hy, ihd = S.invHalfDiag;
  const cont = S.cont;
  const lineIdx = SHAPES.indexOf('line');

  let n = 0;
  for (let i = 0; i < N; i++) {
    const c = cells[i];
    let sp = strandPool[i];
    if (!sp || sp.xs.length !== samples) {
      sp = { xs: new Float32Array(samples), ys: new Float32Array(samples), hws: new Float32Array(samples), r: 0, g: 0, b: 0, a: 1, cont: false, layer: Layer.Strand };
      strandPool[i] = sp;
    }
    const xs = sp.xs, ys = sp.ys, hws = sp.hws;
    const span = horizontal ? c.w : c.h;
    const pitch = horizontal ? c.h : c.w;
    const availAcross = pitch * (1 - g);
    let sum = 0;
    for (let k = 0; k < samples; k++) {
      const l = -0.5 * span + (span * k) / (samples - 1);
      const px = c.cx + alX * l, py = c.cy + alY * l;
      const u = px / W, v = py / H;
      const fv = field.value(u, v, t);
      sum += fv;
      const d = (fv - 0.5) * amount * pitch;
      xs[k] = px + acX * d;
      ys[k] = py + acY * d;
      if (thr > 0 && fv < thr) { hws[k] = 0; continue; }
      const r = Math.hypot(px - hx, py - hy) * ihd;
      const hw = 0.5 * mv(thkM, fv, u, v, r) * availAcross;
      hws[k] = hw > 0 ? hw : 0;
    }
    const mean = sum / samples;
    const cr0 = Math.hypot(c.cx - hx, c.cy - hy) * ihd;
    const op = clamp01(mv(opM, mean, c.u, c.v, cr0));
    let cr: number, cg: number, cb: number, cflag = cont, layer: number = Layer.Strand;
    if (S.accEvery > 0 && i % S.accEvery === 0) {
      cr = S.acc[0]; cg = S.acc[1]; cb = S.acc[2]; cflag = 0; layer = Layer.Accent;
    } else {
      sampleColour(colourPos(mean, c.u, c.v, cr0, c.index));
      cr = oR; cg = oG; cb = oB;
    }
    sp.r = cr; sp.g = cg; sp.b = cb; sp.a = op; sp.cont = cflag === 1; sp.layer = layer as StrandPath['layer'];
    if (op <= 0) continue;

    for (let k = 0; k < samples - 1; k++) {
      const hh = 0.5 * (hws[k] + hws[k + 1]);
      if (hh <= 0.01) continue;
      const x0 = xs[k], y0 = ys[k], x1 = xs[k + 1], y1 = ys[k + 1];
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      put(buf, n * STRIDE, (x0 + x1) / 2, (y0 + y1) / 2, len / 2 + hh, hh, Math.atan2(dy, dx), 0, hh,
        cr, cg, cb, op, Layer.Strand, cflag, lineIdx);
      n++;
    }
  }
  return n;
}

