/**
 * SVG export. Serialises a Geometry into a tidy, layered SVG that opens cleanly in Figma / Illustrator.
 *
 * Every mark is written as a <path> in absolute canvas coordinates: the instance's rounded box is built
 * in local space, sheared (x' = x + skew*y), rotated (positive = clockwise on screen, y down) and
 * translated — exactly like the WebGL renderer. Keeping everything in one coordinate space means
 * userSpaceOnUse gradients (continuous colour) line up with the screen render.
 *
 * Coordinates are rounded to 1/100 px and written with relative commands (computed from the rounded
 * absolute points, so there is no drift) to keep 20k-mark files small.
 *
 * Strands: Layer.Strand instances (GL segment capsules) are skipped; each Geometry.strands[i] is drawn
 * as one filled ribbon with round caps.
 */
import { I, Layer, LAYER_NAMES, STRIDE } from './types';
import type { Geometry, StrandPath } from './types';

const KAPPA = 0.5522847498;
const GRAD_ID = 'osp-continuous';

// ─────────────────────────────────────────────────────────── number + colour formatting

/** Integer hundredths → compact decimal string ("12.5", "-0.25", "3"). */
function fmtH(n: number): string {
  if (n === 0) return '0';
  const neg = n < 0;
  const a = neg ? -n : n;
  const int = Math.floor(a / 100);
  const frac = a - int * 100;
  let s = String(int);
  if (frac !== 0) s += frac % 10 === 0 ? '.' + frac / 10 : '.' + (frac < 10 ? '0' : '') + frac;
  return neg ? '-' + s : s;
}

/** Plain number → string with at most 2 decimals. */
const num = (x: number): string => fmtH(Math.round(x * 100));
/** Number with at most 4 decimals (gradient offsets / opacities). */
const num4 = (x: number): string => String(Math.round(x * 10000) / 10000);

const hex2 = (x: number) => {
  const v = Math.round((x < 0 ? 0 : x > 1 ? 1 : x) * 255);
  return (v < 16 ? '0' : '') + v.toString(16);
};
const hex = (r: number, g: number, b: number) => '#' + hex2(r) + hex2(g) + hex2(b);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────── path writer

/** Builds compact path data. All state is in integer hundredths of a pixel. */
class PathWriter {
  d = '';
  private px = 0;
  private py = 0;
  private sx = 0;
  private sy = 0;

  private nums(vals: number[]): void {
    for (let i = 0; i < vals.length; i++) {
      const s = fmtH(vals[i]);
      // command letter or a leading '-' already separates numbers
      if (i > 0 && s.charCodeAt(0) !== 45) this.d += ' ';
      this.d += s;
    }
  }
  M(x: number, y: number): void {
    const X = Math.round(x * 100), Y = Math.round(y * 100);
    this.d += 'M';
    this.nums([X, Y]);
    this.px = this.sx = X;
    this.py = this.sy = Y;
  }
  L(x: number, y: number): void {
    const X = Math.round(x * 100), Y = Math.round(y * 100);
    if (X === this.px && Y === this.py) return;
    this.d += 'l';
    this.nums([X - this.px, Y - this.py]);
    this.px = X;
    this.py = Y;
  }
  C(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    const X1 = Math.round(x1 * 100), Y1 = Math.round(y1 * 100);
    const X2 = Math.round(x2 * 100), Y2 = Math.round(y2 * 100);
    const X = Math.round(x * 100), Y = Math.round(y * 100);
    if (X === this.px && Y === this.py && X1 === X && Y1 === Y && X2 === X && Y2 === Y) return;
    const px = this.px, py = this.py;
    this.d += 'c';
    this.nums([X1 - px, Y1 - py, X2 - px, Y2 - py, X - px, Y - py]);
    this.px = X;
    this.py = Y;
  }
  /** Elliptical arc (circular, radius r) to (x, y). */
  A(r: number, sweep: 0 | 1, x: number, y: number): void {
    const X = Math.round(x * 100), Y = Math.round(y * 100);
    if (X === this.px && Y === this.py) return;
    const R = Math.max(1, Math.round(r * 100));
    // flags are written with explicit spaces (some importers choke on packed arc flags)
    this.d += 'a' + fmtH(R) + ' ' + fmtH(R) + ' 0 0 ' + sweep + ' ';
    this.nums([X - this.px, Y - this.py]);
    this.px = X;
    this.py = Y;
  }
  Z(): void {
    this.d += 'z';
    this.px = this.sx;
    this.py = this.sy;
  }
}

// ─────────────────────────────────────────────────────────── instance outline

/** Outline of one instance (rounded, sheared, rotated box) in canvas coordinates. */
function instancePath(data: Float32Array, o: number): string {
  const cx = data[o + I.CX], cy = data[o + I.CY];
  const hw = Math.abs(data[o + I.HW]), hh = Math.abs(data[o + I.HH]);
  const ang = data[o + I.ANGLE] || 0, k = data[o + I.SKEW] || 0;
  const rr = Math.max(0, Math.min(data[o + I.RADIUS] || 0, hw, hh));
  const c = Math.cos(ang), s = Math.sin(ang);
  const w = new PathWriter();
  // local (x, y) → shear → rotate → translate
  const tx = (x: number, y: number) => cx + c * (x + k * y) - s * y;
  const ty = (x: number, y: number) => cy + s * (x + k * y) + c * y;
  const M = (x: number, y: number) => w.M(tx(x, y), ty(x, y));
  const L = (x: number, y: number) => w.L(tx(x, y), ty(x, y));
  const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
    w.C(tx(x1, y1), ty(x1, y1), tx(x2, y2), ty(x2, y2), tx(x, y), ty(x, y));

  if (rr < 0.01) {
    M(-hw, -hh);
    L(hw, -hh);
    L(hw, hh);
    L(-hw, hh);
    w.Z();
    return w.d;
  }
  const q = rr * KAPPA;
  M(-hw + rr, -hh);
  L(hw - rr, -hh);
  C(hw - rr + q, -hh, hw, -hh + rr - q, hw, -hh + rr);
  L(hw, hh - rr);
  C(hw, hh - rr + q, hw - rr + q, hh, hw - rr, hh);
  L(-hw + rr, hh);
  C(-hw + rr - q, hh, -hw, hh - rr + q, -hw, hh - rr);
  L(-hw, -hh + rr);
  C(-hw, -hh + rr - q, -hw + rr - q, -hh, -hw + rr, -hh);
  w.Z();
  return w.d;
}

// ─────────────────────────────────────────────────────────── strand ribbon

/** One strand as a closed ribbon: left offset forward, round end cap, right offset backward, round start cap. */
function strandPath(sp: StrandPath): string {
  const n = Math.min(sp.xs.length, sp.ys.length, sp.hws.length);
  const w = new PathWriter();
  if (n === 0) return '';
  if (n === 1) {
    const r = Math.abs(sp.hws[0]);
    if (r <= 0) return '';
    w.M(sp.xs[0] + r, sp.ys[0]);
    w.A(r, 1, sp.xs[0] - r, sp.ys[0]);
    w.A(r, 1, sp.xs[0] + r, sp.ys[0]);
    w.Z();
    return w.d;
  }
  const lx = new Float64Array(n), ly = new Float64Array(n);
  const rx = new Float64Array(n), ry = new Float64Array(n);
  let lnx = 0, lny = 1; // last valid normal, reused across degenerate (zero-length) spans
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
    const dx = sp.xs[b] - sp.xs[a], dy = sp.ys[b] - sp.ys[a];
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      // normal = tangent rotated +90° (screen: points to the right-hand side when walking forward)
      lnx = -dy / len;
      lny = dx / len;
    }
    const h = Math.abs(sp.hws[i]);
    lx[i] = sp.xs[i] + lnx * h; ly[i] = sp.ys[i] + lny * h;
    rx[i] = sp.xs[i] - lnx * h; ry[i] = sp.ys[i] - lny * h;
  }
  w.M(lx[0], ly[0]);
  for (let i = 1; i < n; i++) w.L(lx[i], ly[i]);
  // end cap: half circle bulging forward (+tangent). With y down, going from +normal to -normal
  // through +tangent is a decreasing screen angle → sweep 0.
  const he = Math.abs(sp.hws[n - 1]);
  if (he > 0.005) w.A(he, 0, rx[n - 1], ry[n - 1]);
  else w.L(rx[n - 1], ry[n - 1]);
  for (let i = n - 2; i >= 0; i--) w.L(rx[i], ry[i]);
  const hs = Math.abs(sp.hws[0]);
  if (hs > 0.005) w.A(hs, 0, lx[0], ly[0]);
  w.Z();
  return w.d;
}

// ─────────────────────────────────────────────────────────── gradient

function gradientDef(geo: Geometry): string | null {
  const g = geo.gradient;
  if (!g || !g.stops || g.stops.length === 0) return null;
  const rep = Math.max(1e-3, g.repeat || 1);
  const ns = g.stops.length;
  const stops = g.stops
    .map((st, i) => {
      const off = ns === 1 ? 0 : i / (ns - 1);
      return `    <stop offset="${num4(off)}" stop-color="${hex(st[0], st[1], st[2])}"/>`;
    })
    .join('\n');
  if (g.kind === 'radial') {
    const r = Math.max(0.01, (g.radius || Math.hypot(geo.width, geo.height) / 2) / rep);
    return (
      `  <radialGradient id="${GRAD_ID}" gradientUnits="userSpaceOnUse" spreadMethod="reflect" ` +
      `cx="${num(g.cx)}" cy="${num(g.cy)}" r="${num(r)}">\n${stops}\n  </radialGradient>`
    );
  }
  // linear: t = 0..1 across the canvas along (cos a, sin a), measured from the extreme corners.
  const ca = Math.cos(g.angle || 0), sa = Math.sin(g.angle || 0);
  const W = geo.width, H = geo.height;
  const proj = [0, W * ca, H * sa, W * ca + H * sa];
  const pmin = Math.min(...proj), pmax = Math.max(...proj);
  const span = Math.max(1e-6, pmax - pmin);
  // anchor on the line through the canvas centre
  const pc = (W / 2) * ca + (H / 2) * sa;
  const x1 = W / 2 + ca * (pmin - pc), y1 = H / 2 + sa * (pmin - pc);
  const x2 = x1 + ca * (span / rep), y2 = y1 + sa * (span / rep);
  return (
    `  <linearGradient id="${GRAD_ID}" gradientUnits="userSpaceOnUse" spreadMethod="reflect" ` +
    `x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}">\n${stops}\n  </linearGradient>`
  );
}

// ─────────────────────────────────────────────────────────── groups

interface Item {
  d: string;
  fill: string;
  op: string; // '' when fully opaque
}

const GROUP_ORDER: number[] = [Layer.Track, Layer.Fill, Layer.Cap, Layer.Mark, Layer.Strand, Layer.Accent];

function writeGroup(id: string, items: Item[], out: string[]): void {
  if (items.length === 0) return;
  const f0 = items[0].fill, o0 = items[0].op;
  let sameFill = true, sameOp = true;
  for (let i = 1; i < items.length; i++) {
    if (items[i].fill !== f0) sameFill = false;
    if (items[i].op !== o0) sameOp = false;
    if (!sameFill && !sameOp) break;
  }
  let attrs = `id="${id}" data-name="${id}"`;
  if (sameFill) attrs += ` fill="${f0}"`;
  if (sameOp && o0) attrs += ` fill-opacity="${o0}"`;
  out.push(`  <g ${attrs}>`);
  for (const it of items) {
    let a = '';
    if (!sameFill) a += ` fill="${it.fill}"`;
    if (!sameOp && it.op) a += ` fill-opacity="${it.op}"`;
    out.push(`    <path${a} d="${it.d}"/>`);
  }
  out.push('  </g>');
}

// ─────────────────────────────────────────────────────────── main

/** Serialise geometry to a tidy, layered SVG string (groups: background, track, fill, cap, marks, strands, accent). */
export function geometryToSVG(geo: Geometry, title: string): string {
  const W = geo.width, H = geo.height;
  const gradDef = gradientDef(geo);
  const gradFill = gradDef ? `url(#${GRAD_ID})` : '';
  let usesGradient = false;

  const buckets = new Map<number, Item[]>();
  for (const l of [Layer.Background, ...GROUP_ORDER]) buckets.set(l, []);
  const bucket = (layer: number) => buckets.get(layer) ?? (buckets.get(Layer.Mark) as Item[]);

  const opStr = (a: number) => (a < 0.9999 ? num4(Math.max(0, a)) : '');

  // instances, in painter's order within each layer
  const data = geo.data;
  const count = Math.min(geo.count, Math.floor(data.length / STRIDE));
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const layer = Math.round(data[o + I.LAYER]);
    if (layer === Layer.Strand) continue; // drawn as ribbons from geo.strands
    const a = data[o + I.A];
    if (!(a > 0.0005)) continue;
    if (!(data[o + I.HW] > 0) || !(data[o + I.HH] > 0)) continue;
    let fill: string;
    if (data[o + I.CONT] >= 0.5 && gradFill) {
      fill = gradFill;
      usesGradient = true;
    } else fill = hex(data[o + I.R], data[o + I.G], data[o + I.B]);
    bucket(layer).push({ d: instancePath(data, o), fill, op: opStr(a) });
  }

  // strand ribbons
  for (const sp of geo.strands ?? []) {
    if (!(sp.a > 0.0005)) continue;
    const d = strandPath(sp);
    if (!d) continue;
    let fill: string;
    if (sp.cont && gradFill) {
      fill = gradFill;
      usesGradient = true;
    } else fill = hex(sp.r, sp.g, sp.b);
    const layer = sp.layer === Layer.Accent ? Layer.Accent : Layer.Strand;
    bucket(layer).push({ d, fill, op: opStr(sp.a) });
  }

  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(W)}" height="${num(H)}" viewBox="0 0 ${num(W)} ${num(H)}">`,
  );
  out.push(`  <title>${esc(title)}</title>`);
  if (usesGradient && gradDef) out.push('  <defs>\n' + gradDef + '\n  </defs>');

  // background (always present)
  const bg = geo.background ?? [1, 1, 1];
  out.push('  <g id="background" data-name="background">');
  out.push(`    <rect width="${num(W)}" height="${num(H)}" fill="${hex(bg[0], bg[1], bg[2])}"/>`);
  for (const it of buckets.get(Layer.Background) as Item[]) {
    out.push(`    <path fill="${it.fill}"${it.op ? ` fill-opacity="${it.op}"` : ''} d="${it.d}"/>`);
  }
  out.push('  </g>');

  for (const layer of GROUP_ORDER) writeGroup(LAYER_NAMES[layer], buckets.get(layer) as Item[], out);

  out.push('</svg>');
  return out.join('\n') + '\n';
}
