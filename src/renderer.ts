/**
 * WebGL2 instanced SDF renderer.
 *
 * Every instance in `Geometry.data` is drawn as ONE quad (4-vertex strip, one draw call for
 * all instances) that covers a skewed, rotated, rounded box plus an antialiasing margin.
 * The fragment shader evaluates the rounded-box SDF in un-sheared local space and turns it
 * into exact screen-pixel coverage, so edges are a crisp 1-device-pixel ramp at any scale
 * (live view at devicePixelRatio, and 1x/2x/4x PNG export).
 *
 * Conventions (shared with svg.ts so both outputs match):
 * - Coordinates: logical canvas px, origin top-left, y DOWN.
 * - Local box: x in [-hw, hw] (length axis), y in [-hh, hh].
 * - Shear first: x' = x + skew * y  (skew = tan(skewAngle)). Because y is down, a POSITIVE skew
 *   moves the top edge LEFT and the bottom edge RIGHT ("\" lean) — identical to SVG `skewX(+deg)`.
 * - Then rotate by `angle` (radians): world = c + [cos -sin; sin cos] * (x', y').
 *   With y down a POSITIVE angle turns CLOCKWISE on screen — identical to SVG `rotate(+deg)`
 *   and Canvas2D `rotate`.
 *   SVG equivalent: transform="translate(cx cy) rotate(angleDeg) skewX(atan(skew)deg)" applied to
 *   <rect x=-hw y=-hh width=2hw height=2hh rx=r ry=r>.
 * - Corner radius is applied BEFORE the shear (in un-sheared space), clamped to min(hw, hh) — like
 *   an SVG rounded rect inside the skew transform.
 * - Colours are sRGB values (hex/255) blended directly in sRGB with premultiplied alpha
 *   (no linearisation), like SVG. Output alpha is always 1 (opaque background).
 * - Marks thinner than 1 device px are not dropped: their half-thickness is clamped to 0.5 device
 *   px and their opacity is multiplied by trueThickness / clampedThickness (coverage-preserving).
 */
import { STRIDE, type Geometry } from './types';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface RendererOptions {
  preserveDrawingBuffer?: boolean;
}

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_quad;  // unit quad corner, -1..1
layout(location = 1) in vec4 a0;      // cx, cy, hw, hh
layout(location = 2) in vec4 a1;      // angle, skew, radius, r
layout(location = 3) in vec4 a2;      // g, b, a, layer
layout(location = 4) in vec4 a3;      // cont, shape, -, -

uniform vec4 u_view;   // logical px rect mapped to the viewport: x0, y0, w, h
uniform float u_scale; // device px per logical px

out vec2 v_p;          // un-sheared local position (logical px)
out vec2 v_world;      // world position (logical px), for the continuous gradient
flat out vec4 v_box;   // effective hw, hh, radius, skew
flat out vec4 v_col;   // r, g, b, alpha (opacity * thin-mark factor)
flat out float v_cont;

void main() {
  float hw = a0.z, hh = a0.w;
  float skew = a1.y;
  float alpha = a2.z;
  if (!(hw > 0.0 && hh > 0.0 && alpha > 0.0)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // cull: degenerate & outside clip
    return;
  }
  float px = 1.0 / u_scale;                 // one device px in logical px
  float shearLen = sqrt(1.0 + skew * skew);
  // Thin marks: clamp the PERPENDICULAR half-thickness to >= 0.5 device px and fade by coverage.
  // Perpendicular half-width across the slanted edges is hw / sqrt(1 + skew^2).
  float hwE = max(hw, 0.5 * px * shearLen);
  float hhE = max(hh, 0.5 * px);
  float thin = (hw / hwE) * (hh / hhE);
  float rTrue = clamp(a1.z, 0.0, min(hw, hh));
  float rE = (rTrue / min(hw, hh)) * min(hwE, hhE); // keep the same roundness fraction

  // Quad covering the sheared box + AA margin (1.5 device px, perpendicular).
  float aa = 1.5 * px;
  vec2 ext = vec2(hwE + abs(skew) * hhE + aa * shearLen, hhE + aa);
  vec2 q = a_quad * ext;                     // sheared local (x', y)
  v_p = vec2(q.x - skew * q.y, q.y);         // invert the shear (affine => exact when interpolated)

  float c = cos(a1.x), s = sin(a1.x);
  vec2 world = a0.xy + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  v_world = world;

  vec2 n = (world - u_view.xy) / u_view.zw;  // 0..1 across the view, y down
  gl_Position = vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);

  v_box = vec4(hwE, hhE, rE, skew);
  v_col = vec4(a1.w, a2.x, a2.y, alpha * thin);
  v_cont = a3.x;
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_p;
in vec2 v_world;
flat in vec4 v_box;
flat in vec4 v_col;
flat in float v_cont;

uniform float u_scale;
uniform int u_gKind;     // 0 = off, 1 = linear, 2 = radial
uniform vec4 u_gLin;     // dir.x, dir.y, min projection, 1 / (max - min)
uniform vec3 u_gRad;     // cx, cy, 1 / radius
uniform float u_gRepeat;
uniform int u_gN;        // number of stops (1..3)
uniform vec3 u_stops[3];

out vec4 outColor;

vec3 gradientColour(vec2 pos) {
  float t;
  if (u_gKind == 2) t = distance(pos, u_gRad.xy) * u_gRad.z;
  else t = (dot(pos, u_gLin.xy) - u_gLin.z) * u_gLin.w;
  t = clamp(t, 0.0, 1.0) * u_gRepeat;
  float m = mod(t, 2.0);
  t = m <= 1.0 ? m : 2.0 - m;              // mirrored repeat (triangle wave)
  if (u_gN <= 1) return u_stops[0];
  float x = t * float(u_gN - 1);
  if (u_gN == 2 || x <= 1.0) return mix(u_stops[0], u_stops[1], clamp(x, 0.0, 1.0));
  return mix(u_stops[1], u_stops[2], clamp(x - 1.0, 0.0, 1.0));
}

void main() {
  vec2 b = v_box.xy;
  float r = v_box.z;
  float skew = v_box.w;
  vec2 sp = vec2(v_p.x < 0.0 ? -1.0 : 1.0, v_p.y < 0.0 ? -1.0 : 1.0);
  vec2 q = abs(v_p) - (b - r);
  float d;
  vec2 g; // gradient of d w.r.t. un-sheared local p
  if (q.x > 0.0 && q.y > 0.0) {
    float l = length(q);
    d = l - r;
    g = (q / l) * sp;
  } else {
    d = max(q.x, q.y) - r;
    g = q.x > q.y ? vec2(sp.x, 0.0) : vec2(0.0, sp.y);
  }
  // p = (x' - skew*y', y'); rotation + uniform scale are isotropic, so the screen-space gradient
  // magnitude is u_scale * |(dd/dx', dd/dy')| = u_scale * |(g.x, g.y - skew*g.x)|.
  float gl = length(vec2(g.x, g.y - skew * g.x));
  float distPx = d * u_scale / max(gl, 1e-6);
  float cov = clamp(0.5 - distPx, 0.0, 1.0);
  float a = v_col.a * cov;
  if (a <= 0.0) discard;
  vec3 rgb = (v_cont > 0.5 && u_gKind != 0) ? gradientColour(v_world) : v_col.rgb;
  outColor = vec4(rgb * a, a);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('renderer: createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('renderer: shader compile failed: ' + log);
  }
  return sh;
}

interface Uniforms {
  view: WebGLUniformLocation | null;
  scaleV: WebGLUniformLocation | null;
  gKind: WebGLUniformLocation | null;
  gLin: WebGLUniformLocation | null;
  gRad: WebGLUniformLocation | null;
  gRepeat: WebGLUniformLocation | null;
  gN: WebGLUniformLocation | null;
  stops: WebGLUniformLocation | null;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private instBuf: WebGLBuffer | null = null;
  private instCapacity = 0; // bytes
  private u: Uniforms | null = null;
  private stopsArr = new Float32Array(9);
  private lost = false;
  private disposed = false;
  private logicalW = 0;
  private logicalH = 0;
  private pixelRatio = 1;
  private lastGeo: Geometry | null = null;
  private readonly onLost: (e: Event) => void;
  private readonly onRestored: () => void;

  constructor(readonly canvas: AnyCanvas, opts: RendererOptions = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.onLost = (e: Event) => {
      e.preventDefault(); // allow restoration
      this.lost = true;
      this.program = null;
      this.vao = null;
      this.quadBuf = null;
      this.instBuf = null;
      this.instCapacity = 0;
      this.u = null;
    };
    this.onRestored = () => {
      if (this.disposed) return;
      this.lost = false;
      this.init();
      if (this.logicalW > 0) this.resize(this.logicalW, this.logicalH, this.pixelRatio);
      if (this.lastGeo) this.render(this.lastGeo);
    };
    canvas.addEventListener('webglcontextlost', this.onLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', this.onRestored as EventListener, false);

    this.init();
  }

  private init(): void {
    const gl = this.gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram();
    if (!prog) throw new Error('renderer: createProgram failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error('renderer: program link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.program = prog;
    this.u = {
      view: gl.getUniformLocation(prog, 'u_view'),
      scaleV: gl.getUniformLocation(prog, 'u_scale'),
      gKind: gl.getUniformLocation(prog, 'u_gKind'),
      gLin: gl.getUniformLocation(prog, 'u_gLin'),
      gRad: gl.getUniformLocation(prog, 'u_gRad'),
      gRepeat: gl.getUniformLocation(prog, 'u_gRepeat'),
      gN: gl.getUniformLocation(prog, 'u_gN'),
      stops: gl.getUniformLocation(prog, 'u_stops[0]'),
    };

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vao = vao;

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.instBuf = gl.createBuffer();
    this.instCapacity = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const strideBytes = STRIDE * 4;
    for (let k = 0; k < 4; k++) {
      const loc = 1 + k;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, strideBytes, k * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Backing store = round(width*pixelRatio) × round(height*pixelRatio); geometry stays in logical px. */
  resize(width: number, height: number, pixelRatio: number): void {
    const pr = pixelRatio > 0 && Number.isFinite(pixelRatio) ? pixelRatio : 1;
    this.logicalW = Math.max(1, width);
    this.logicalH = Math.max(1, height);
    this.pixelRatio = pr;
    const w = Math.max(1, Math.round(this.logicalW * pr));
    const h = Math.max(1, Math.round(this.logicalH * pr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    // CSS size is deliberately untouched — the UI fits the canvas element.
  }

  /** Clear to geo.background and draw all instances with SDF antialiasing. */
  render(geo: Geometry): void {
    this.lastGeo = geo;
    if (this.lost || this.disposed) return;
    if (this.logicalW <= 0) this.resize(geo.width, geo.height, 1);
    // The browser may clamp the drawing buffer below canvas.width/height on huge canvases;
    // always map the full logical view onto the buffer we actually got.
    const gl = this.gl;
    this.drawView(geo, 0, 0, this.logicalW, this.logicalH, 0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  /**
   * Low-level draw: maps the logical rect (vx, vy, vw, vh) onto the GL viewport (px, py, pw, ph)
   * (GL convention: py measured from the bottom of the drawing buffer). Used for tiled export.
   */
  drawView(
    geo: Geometry,
    vx: number, vy: number, vw: number, vh: number,
    px: number, py: number, pw: number, ph: number,
  ): void {
    if (this.lost || this.disposed || !this.program || !this.u) return;
    const gl = this.gl;
    const u = this.u;
    gl.viewport(px, py, pw, ph);
    const bg = geo.background;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const count = Math.min(geo.count | 0, Math.floor(geo.data.length / STRIDE));
    if (count <= 0) return;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Instance upload: grow-only buffer, sub-upload exactly count*STRIDE floats (no allocation).
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const bytes = count * STRIDE * 4;
    if (bytes > this.instCapacity) {
      const cap = Math.max(bytes, Math.ceil(this.instCapacity * 1.5), 4096 * STRIDE * 4);
      gl.bufferData(gl.ARRAY_BUFFER, cap, gl.DYNAMIC_DRAW);
      this.instCapacity = cap;
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.data, 0, count * STRIDE);

    gl.uniform4f(u.view, vx, vy, vw, vh);
    gl.uniform1f(u.scaleV, pw / vw);
    this.setGradientUniforms(geo);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }

  private setGradientUniforms(geo: Geometry): void {
    const gl = this.gl;
    const u = this.u!;
    const g = geo.gradient;
    const n = g && g.stops ? Math.min(3, g.stops.length) : 0;
    if (!g || !g.enabled || n === 0) {
      gl.uniform1i(u.gKind, 0);
      return;
    }
    const sa = this.stopsArr;
    for (let i = 0; i < 3; i++) {
      const s = g.stops[Math.min(i, n - 1)];
      sa[i * 3] = s[0];
      sa[i * 3 + 1] = s[1];
      sa[i * 3 + 2] = s[2];
    }
    gl.uniform3fv(u.stops, sa);
    gl.uniform1i(u.gN, n);
    gl.uniform1f(u.gRepeat, Math.max(1e-6, g.repeat || 1));
    if (g.kind === 'radial') {
      gl.uniform1i(u.gKind, 2);
      const r = g.radius > 0 ? g.radius : 0.5 * Math.hypot(geo.width, geo.height);
      gl.uniform3f(u.gRad, g.cx, g.cy, 1 / r);
    } else {
      gl.uniform1i(u.gKind, 1);
      const dx = Math.cos(g.angle), dy = Math.sin(g.angle);
      // Project the four canvas corners onto the direction: t runs 0..1 across the canvas.
      const W = geo.width, H = geo.height;
      const p1 = W * dx, p2 = H * dy, p3 = W * dx + H * dy;
      const mn = Math.min(0, p1, p2, p3);
      const mx = Math.max(0, p1, p2, p3);
      gl.uniform4f(u.gLin, dx, dy, mn, mx - mn > 1e-9 ? 1 / (mx - mn) : 0);
    }
  }

  /** Query hardware limits relevant to export (device px). */
  maxTileSize(): number {
    const gl = this.gl;
    const rb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const tex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    return Math.max(1, Math.min(rb || 4096, tex || 4096, vp ? vp[0] : 4096, vp ? vp[1] : 4096));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost as EventListener, false);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored as EventListener, false);
    const gl = this.gl;
    if (!gl.isContextLost()) {
      if (this.instBuf) gl.deleteBuffer(this.instBuf);
      if (this.quadBuf) gl.deleteBuffer(this.quadBuf);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.instBuf = this.quadBuf = null;
    this.vao = null;
    this.program = null;
    this.u = null;
    this.lastGeo = null;
  }

  /** Dispose and release the GPU context immediately (WEBGL_lose_context). Used by offscreen export. */
  destroy(): void {
    this.dispose();
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext && !this.gl.isContextLost()) ext.loseContext();
  }
}

// ─────────────────────────────────────────────────────────── EXPORT

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasToPNG(c: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}

/** Default upper bound for one GPU tile (device px); keeps memory modest and avoids driver clamps. */
const DEFAULT_MAX_TILE = 4096;

/**
 * Re-render `geo` offscreen at `scale`× its logical size and return a PNG blob.
 * Renders in tiles (each tile = a sub-rectangle projection of the same geometry) composited into
 * a 2D canvas, so any output size the 2D canvas supports works (e.g. 4× of 1920×1080 = 7680×4320).
 * `opts.maxTile` is for testing (forces smaller tiles).
 */
export async function renderToPNG(geo: Geometry, scale: number, opts: { maxTile?: number } = {}): Promise<Blob> {
  const s = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const W = Math.max(1, Math.round(geo.width * s));
  const H = Math.max(1, Math.round(geo.height * s));
  // Exact per-axis device-px-per-logical-px so tile edges land on whole device pixels.
  const sx = W / geo.width;
  const sy = H / geo.height;

  const glCanvas = makeCanvas(Math.min(W, DEFAULT_MAX_TILE), Math.min(H, DEFAULT_MAX_TILE));
  const r = new Renderer(glCanvas, { preserveDrawingBuffer: true });
  try {
    let tile = Math.min(DEFAULT_MAX_TILE, r.maxTileSize(), opts.maxTile ?? Infinity);
    tile = Math.max(16, Math.floor(tile));
    let cw = Math.min(W, tile);
    let ch = Math.min(H, tile);
    glCanvas.width = cw;
    glCanvas.height = ch;
    // If the browser clamped the drawing buffer, shrink the tile to what we really got.
    cw = Math.min(cw, r.gl.drawingBufferWidth);
    ch = Math.min(ch, r.gl.drawingBufferHeight);
    if (r.gl.isContextLost()) throw new Error('WebGL context lost during export');

    if (cw >= W && ch >= H) {
      // Single tile: encode straight from the GL canvas.
      r.drawView(geo, 0, 0, geo.width, geo.height, 0, ch - H, W, H);
      if (glCanvas.width === W && glCanvas.height === H) return await canvasToPNG(glCanvas);
    }

    const out = makeCanvas(W, H);
    const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('2D canvas unavailable for PNG export');
    ctx.imageSmoothingEnabled = false;
    for (let ty = 0; ty < H; ty += ch) {
      const th = Math.min(ch, H - ty);
      for (let tx = 0; tx < W; tx += cw) {
        const tw = Math.min(cw, W - tx);
        // Viewport at the TOP-left of the drawing buffer (GL y is bottom-up).
        r.drawView(geo, tx / sx, ty / sy, tw / sx, th / sy, 0, r.gl.drawingBufferHeight - th, tw, th);
        if (r.gl.isContextLost()) throw new Error('WebGL context lost during export');
        ctx.drawImage(glCanvas, 0, 0, tw, th, tx, ty, tw, th);
      }
    }
    return await canvasToPNG(out);
  } finally {
    r.destroy();
  }
}
