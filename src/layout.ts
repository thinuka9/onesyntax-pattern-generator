import type { Params, Cell } from './types';
import { hash01, DEG } from './util';

/**
 * Cell centres for grid / brick / columns / rows / strands. Pure + seeded.
 *
 * Conventions (shared with marks.ts):
 * - Content box = canvas inset by margin * min(W, H) on every side.
 * - grid / brick: w = boxW / cols, h = boxH / rows. Brick: odd rows shifted right by stagger * w; a cell whose
 *   right edge would leave the box is dropped (so odd rows hold cols - 1 cells when stagger > 0) — edges stay clean.
 * - columns: one cell per column, w = boxW / cols, h = boxH, row = 0, cy = box centre.
 * - rows:    one cell per row,    w = boxW, h = boxH / rows, col = 0, cx = box centre.
 * - strands: vertical   → one cell per column (like columns), the strand runs the full h;
 *            horizontal → one cell per row (like rows), the strand runs the full w.
 * - Jitter (seeded via hash01(seed, index, 1|2)) moves centres by up to jitter * 0.5 * pitch. In columns /
 *   vertical strands only x is jittered, in rows / horizontal strands only y, so spans stay inside the box.
 * - Rotation: all centres rotated about the canvas centre by layout.rotation (degrees, positive = clockwise on
 *   screen since y is down). u = cx / W, v = cy / H are taken AFTER rotation. w/h are unrotated pitches;
 *   marks.ts rotates the cell frame by the same angle.
 * - Emission order: row-major (row, then col). `index` is the running index in that order.
 *
 * The result is memoised on (layout, canvas size, seed) and must be treated as read-only.
 */

let cacheKey = '';
let cacheCells: Cell[] = [];

export function buildLayout(p: Params): Cell[] {
  const L = p.layout;
  const W = p.canvas.width;
  const H = p.canvas.height;
  const key = JSON.stringify(L) + '|' + W + 'x' + H + '|' + p.seed;
  if (key === cacheKey) return cacheCells;

  const cols = Math.max(1, Math.round(L.cols) || 1);
  const rows = Math.max(1, Math.round(L.rows) || 1);
  const margin = Math.max(0, Math.min(0.49, L.margin || 0)) * Math.min(W, H);
  const x0 = margin;
  const y0 = margin;
  const boxW = Math.max(1e-6, W - 2 * margin);
  const boxH = Math.max(1e-6, H - 2 * margin);
  const jitter = Math.max(0, L.jitter || 0);
  const seed = p.seed | 0;

  const rot = (L.rotation || 0) * DEG;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const ox = W / 2;
  const oy = H / 2;

  const cells: Cell[] = [];
  let index = 0;

  const push = (col: number, row: number, x: number, y: number, w: number, h: number, jx: boolean, jy: boolean) => {
    if (jitter > 0) {
      if (jx) x += (hash01(seed, index, 1) * 2 - 1) * jitter * 0.5 * w;
      if (jy) y += (hash01(seed, index, 2) * 2 - 1) * jitter * 0.5 * h;
    }
    let cx = x;
    let cy = y;
    if (rot !== 0) {
      const dx = x - ox;
      const dy = y - oy;
      cx = ox + dx * cr - dy * sr;
      cy = oy + dx * sr + dy * cr;
    }
    cells.push({ index, col, row, cx, cy, w, h, u: cx / W, v: cy / H });
    index++;
  };

  const mode = L.mode;
  const vertical = mode === 'columns' || (mode === 'strands' && L.strandAxis !== 'horizontal');
  const horizontal = mode === 'rows' || (mode === 'strands' && L.strandAxis === 'horizontal');

  if (vertical) {
    const w = boxW / cols;
    for (let c = 0; c < cols; c++) push(c, 0, x0 + (c + 0.5) * w, y0 + boxH / 2, w, boxH, true, false);
  } else if (horizontal) {
    const h = boxH / rows;
    for (let r = 0; r < rows; r++) push(0, r, x0 + boxW / 2, y0 + (r + 0.5) * h, boxW, h, false, true);
  } else {
    const w = boxW / cols;
    const h = boxH / rows;
    const brick = mode === 'brick';
    const stagger = brick ? Math.max(0, Math.min(1, L.stagger || 0)) : 0;
    for (let r = 0; r < rows; r++) {
      const shift = brick && (r & 1) === 1 ? stagger * w : 0;
      for (let c = 0; c < cols; c++) {
        // Drop the overflow cell instead of wrapping so the right edge stays clean.
        if (shift > 0 && (c + 1) * w + shift > boxW + 1e-6) continue;
        push(c, r, x0 + (c + 0.5) * w + shift, y0 + (r + 0.5) * h, w, h, true, true);
      }
    }
  }

  cacheKey = key;
  cacheCells = cells;
  return cells;
}
