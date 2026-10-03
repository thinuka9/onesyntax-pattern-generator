/*
 * Pattern engine for the OneSyntax Pattern Generator (index.html).
 * Field, layout, marks, SVG export, WebGL renderer and the nine studio presets started as a plain-JS
 * port of the original TypeScript studio (archived in OneSyntaxPatternGenerator-archive-2026-10-03.zip), so the
 * page runs without a build step. Since then: one-way seamless motion, Fourier wave shapes, Chladni
 * plates, ripple interference and the logo distance field.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const STRIDE = 16; // x,y,width,height,angle,radius,skew,shape,r,g,b,opacity,layer,0,0,0
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const radians = (degrees) => degrees * Math.PI / 180;

  // ---------- field.ts ----------
  function hash01(seed, index) {
    let h = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
  }

  function lattice(x, y, seed) { return hash01(seed ^ Math.imul(x, 0x1f123bb5), y); }

  function noise2(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed);
    const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + ((c - a) + (a - b - c + d) * sx) * sy;
  }

  function makeSeries(params) {
    const data = params.field.data;
    const supplied = data.values.trim().split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (supplied.length) {
      let min = Infinity, max = -Infinity;
      for (const value of supplied) { min = Math.min(min, value); max = Math.max(max, value); }
      const extent = max - min;
      return Float64Array.from(supplied, (value) => extent > 1e-10 ? (value - min) / extent : 0.5);
    }
    const count = Math.max(2, Math.min(4096, Math.round(data.axis === 'x' ? params.layout.columns : params.layout.rows)));
    const raw = new Float64Array(count);
    const seed = (data.seed | 0) ^ Math.imul(params.seed | 0, 31);
    let value = 0.5;
    for (let i = 0; i < count; i++) {
      value = clamp(value + (hash01(seed, i) - 0.5) * data.volatility * 0.8 + data.trend * 0.08);
      raw[i] = value;
    }
    const radius = Math.round(clamp(data.smoothing) * Math.min(12, count / 3));
    if (!radius) return raw;
    const smoothed = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      let sum = 0, weight = 0;
      for (let j = -radius; j <= radius; j++) {
        const w = radius + 1 - Math.abs(j);
        sum += raw[Math.max(0, Math.min(count - 1, i + j))] * w;
        weight += w;
      }
      smoothed[i] = sum / weight;
    }
    return smoothed;
  }

  // ---------- Fourier wave shapes ----------
  // Partial Fourier sums, tabulated once per shape and harmonic count. Each is scaled by its own peak,
  // so the Gibbs overshoot near the jumps stays visible instead of clipping.
  const SHAPES = ['sine', 'triangle', 'square', 'sawtooth'];
  const TABLE_SIZE = 2048;
  const tables = new Map();
  function waveTable(shape, harmonics) {
    const terms = Math.max(1, Math.min(64, Math.round(harmonics)));
    const key = shape + terms;
    if (tables.has(key)) return tables.get(key);
    const table = new Float32Array(TABLE_SIZE + 1);
    let peak = 0;
    for (let i = 0; i <= TABLE_SIZE; i++) {
      const x = i / TABLE_SIZE * TAU;
      let v = 0;
      if (shape === 'square') for (let j = 0, k = 1; j < terms; j++, k += 2) v += Math.sin(k * x) / k;                         // 4/π Σ sin(kx)/k, odd k
      else if (shape === 'triangle') for (let j = 0, k = 1; j < terms; j++, k += 2) v += (j % 2 ? -1 : 1) * Math.sin(k * x) / (k * k); // 8/π² Σ ±sin(kx)/k², odd k
      else if (shape === 'sawtooth') for (let k = 1; k <= terms; k++) v += (k % 2 ? 1 : -1) * Math.sin(k * x) / k;              // 2/π Σ (−1)^(k+1) sin(kx)/k
      table[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    for (let i = 0; i <= TABLE_SIZE; i++) table[i] /= peak || 1;
    tables.set(key, table);
    return table;
  }
  /** A drop-in for Math.sin with the chosen shape: same period, same phase, range −1..1. */
  function waveFn(shape, harmonics) {
    if (!SHAPES.includes(shape) || shape === 'sine') return Math.sin;
    const table = waveTable(shape, harmonics);
    return (x) => {
      let u = (x / TAU) % 1;
      if (u < 0) u += 1;
      const f = u * TABLE_SIZE, i = Math.floor(f);
      return table[i] + (table[i + 1] - table[i]) * (f - i);
    };
  }

  /** Cycles per 5 s for each moving wave in directional motion: `motion.speed` is wave A's cycles, in half steps. */
  const roundHalf = (x) => Math.round(x * 2) / 2;
  const waveCycles = (params, part) => roundHalf(params.motion.speed * part.speed / 0.2);
  const isOn = (part) => !!part && part.enabled && part.weight > 0;
  function motionCycles(params) {
    const f = params.field;
    const cycles = [f.waveA, f.waveB, f.radial, f.chladni, f.ripples, f.logo].filter(isOn).map((part) => waveCycles(params, part));
    if (isOn(f.ripples) && f.ripples.orbit) cycles.push(roundHalf(f.ripples.orbit));  // orbit turns on its own, Speed or not
    return cycles;
  }

  /** Bilinear lookup in a signed distance grid laid over the canvas (`options.sdf`, built by the page). */
  function sampleDistance(sdf, x, y) {
    const fx = clamp(x) * (sdf.cols - 1), fy = clamp(y) * (sdf.rows - 1);
    const ix = Math.min(sdf.cols - 2, Math.floor(fx)), iy = Math.min(sdf.rows - 2, Math.floor(fy));
    const tx = fx - ix, ty = fy - iy, d = sdf.data, i = iy * sdf.cols + ix;
    const top = d[i] + (d[i + 1] - d[i]) * tx, bottom = d[i + sdf.cols] + (d[i + sdf.cols + 1] - d[i + sdf.cols]) * tx;
    return top + (bottom - top) * ty;
  }

  /**
   * `options.directional` replaces the studio's closed-path motion (which sways back and forth) with
   * one-way motion: waves advance whole or half cycles per loop and noise drifts one way, cross-fading
   * with itself one loop earlier, so every frame at `loopSeconds` matches frame 0.
   */
  function createField(params, time, options = {}) {
    const { field, shaping, attractor } = params;
    const seed = params.seed | 0;
    const a = field.waveA, b = field.waveB, radial = field.radial, n = field.noise, data = field.data;
    const aa = radians(a.direction), ba = radians(b.direction), ga = radians(field.gradient.direction);
    const ax = Math.cos(aa) * a.frequency * TAU, ay = Math.sin(aa) * a.frequency * TAU;
    const bx = Math.cos(ba) * b.frequency * TAU, by = Math.sin(ba) * b.frequency * TAU;
    const gx = Math.cos(ga), gy = Math.sin(ga);
    const gradientExtent = Math.max(1e-6, Math.abs(gx) + Math.abs(gy));
    const speed = params.motion.speed;
    const chladni = field.chladni, ripples = field.ripples, logo = field.logo;
    let ap, bp, rp, nx, ny, nxEarlier = 0, nyEarlier = 0, fade = 0, turn, orbitTurn;
    if (options.directional) {
      const loop = Math.max(1e-6, options.loopSeconds || 5);
      const t = ((time % loop) + loop) % loop;
      turn = (part) => TAU * waveCycles(params, part) * t / 5;
      orbitTurn = ripples ? TAU * roundHalf(ripples.orbit) * t / 5 : 0;
      ap = radians(a.phase) + turn(a);
      bp = radians(b.phase) + turn(b);
      rp = turn(radial);
      const rate = speed * n.speed;  // noise units per second, drifting along wave A
      nx = Math.cos(aa) * rate * t; ny = Math.sin(aa) * rate * t;
      nxEarlier = Math.cos(aa) * rate * (t - loop); nyEarlier = Math.sin(aa) * rate * (t - loop);
      fade = rate ? t / loop : 0;
    } else {
      // A closed path in the sampling domain permits arbitrary speeds without a seam.
      const loopTime = ((time % 5) + 5) % 5;
      const loopAngle = loopTime * TAU / 5;
      const driftX = params.motion.loop ? (Math.cos(loopAngle) - 1) * speed : time * speed * 0.35;
      const driftY = params.motion.loop ? Math.sin(loopAngle) * speed : time * speed;
      const phaseMotion = (driftY + driftX * 0.35) * TAU;
      turn = (part) => phaseMotion * part.speed;
      orbitTurn = ripples ? phaseMotion * ripples.orbit : 0;
      ap = radians(a.phase) + phaseMotion * a.speed;
      bp = radians(b.phase) + phaseMotion * b.speed;
      rp = phaseMotion * radial.speed;
      nx = driftX * n.speed * 0.7; ny = driftY * n.speed * 0.7;
    }
    const wave = waveFn(field.shape, field.harmonics);
    const wa = a.enabled ? Math.max(0, a.weight) : 0;
    const wb = b.enabled ? Math.max(0, b.weight) : 0;
    const wr = radial.enabled ? Math.max(0, radial.weight) : 0;
    const wn = n.enabled ? Math.max(0, n.weight) : 0;
    const wd = data.enabled ? Math.max(0, data.weight) : 0;
    const wg = field.gradient.enabled ? Math.max(0, field.gradient.weight) : 0;
    const wc = isOn(chladni) ? chladni.weight : 0;
    const wp = isOn(ripples) ? ripples.weight : 0;
    const wl = isOn(logo) && options.sdf ? logo.weight : 0;  // the logo needs its distance grid from the page
    const total = wa + wb + wr + wn + wd + wg + wc + wp + wl;
    const canvasWidth = Math.max(1, params.canvas.width), canvasHeight = Math.max(1, params.canvas.height);
    // Distances for ripples and the logo are measured in units of the canvas's shorter side, so circles stay round.
    const minSide = Math.min(canvasWidth, canvasHeight), aspectX = canvasWidth / minSide, aspectY = canvasHeight / minSide;

    // Chladni plate: cos(nπx)cos(mπy) and cos(mπx)cos(nπy) mixed at an angle; −45° is the classic free-edge figure.
    // Sand (value 1) collects on the nodal lines where the plate stays still.
    const plateN = wc ? Math.PI * Math.max(1, Math.round(chladni.n)) : 0, plateM = wc ? Math.PI * Math.max(1, Math.round(chladni.m)) : 0;
    // Morph: each study sways through its own shapes on a sine of its cycle, so it eases out and back seamlessly.
    const morphing = options.directional && field.motion === 'morph', morph = clamp(field.morph);
    const sway = (part, offset = 0) => Math.sin(turn(part) + offset);
    // The plate's mix swings up to 90° either side, so the figure melts into its neighbours and back.
    const plateAngle = !wc ? 0 : radians(chladni.mix) + (morphing ? morph * Math.PI / 2 * sway(chladni) : turn(chladni));
    const plateA = Math.cos(plateAngle), plateB = Math.sin(plateAngle);

    // Ripple tank: point sources on a ring (rotating with `orbit`), each sending circular waves outward.
    // Morphing, the sources drift apart and back and swing round instead, so the moiré fringes reshape.
    const sources = [];
    let rippleK = 0, ripplePhase = 0;
    if (wp) {
      const count = Math.max(1, Math.min(8, Math.round(ripples.sources)));
      const swing = morphing ? morph * Math.PI / count * sway(ripples, Math.PI / 2) : 0;
      const spread = ripples.spread * (morphing ? 1 + 0.6 * morph * sway(ripples) : 1);
      const start = radians(ripples.rotation) + orbitTurn + swing;
      for (let k = 0; k < count; k++) {
        const angle = start + TAU * k / count;
        sources.push([0.5 + Math.cos(angle) * spread / aspectX, 0.5 + Math.sin(angle) * spread / aspectY]);
      }
      rippleK = TAU * ripples.frequency;
      ripplePhase = morphing ? 0 : turn(ripples);
    }
    const rippleDecay = wp ? Math.max(0, ripples.decay) * 4 : 0;
    // Logo contours: flowing, they march outward; morphing, they breathe in and out while their spacing shifts.
    const logoK = !wl ? 0 : TAU * logo.frequency * (morphing ? 1 + 0.3 * morph * sway(logo, Math.PI / 2) : 1);
    const logoPhase = !wl ? 0 : morphing ? morph * Math.PI * sway(logo) : turn(logo);
    const logoInside = !wl ? null : logo.fill === 'on' ? 1 : logo.fill === 'empty' ? 0 : null;  // null: contours continue inside
    const logoFade = wl ? Math.max(0, logo.fade || 0) * 4 : 0, logoLine = wl ? Math.max(1, logo.line || 1) : 1;
    const series = wd ? makeSeries(params) : new Float64Array(0);
    const octaves = Math.max(1, Math.min(8, Math.round(n.octaves)));
    const noiseScale = Math.max(0.001, n.scale);
    const warpScale = Math.max(0.001, shaping.warpScale);
    const warp = shaping.warp * 0.22;
    const mirrorX = shaping.mirror === 'X' || shaping.mirror === 'XY';
    const mirrorY = shaping.mirror === 'Y' || shaping.mirror === 'XY';
    const gamma = Math.max(0.05, shaping.gamma);
    const quantise = Math.max(0, Math.round(shaping.quantise));
    const contrast = shaping.contrast, invert = shaping.invert;
    const radialX = radial.x, radialY = radial.y, radialFrequency = radial.frequency * TAU;
    const dataAxis = data.axis, smoothing = clamp(data.smoothing);
    const attractorEnabled = attractor.enabled, attractorStrength = attractor.strength;
    const attractorX = attractor.x, attractorY = attractor.y;
    const radius = Math.max(0.001, attractor.radius);

    const sample = (inputX, inputY) => {
      let x = inputX, y = inputY;
      if (warp) {
        x += (noise2(inputX * warpScale + 19.4, inputY * warpScale - 9.1, seed + 37) - 0.5) * warp * 2;
        y += (noise2(inputX * warpScale - 41.7, inputY * warpScale + 12.3, seed + 93) - 0.5) * warp * 2;
      }
      if (mirrorX) x = Math.abs(x - 0.5) * 2;
      if (mirrorY) y = Math.abs(y - 0.5) * 2;
      let value = 0;
      if (wa) value += (wave(x * ax + y * ay + ap) * 0.5 + 0.5) * wa;
      if (wb) value += (wave(x * bx + y * by + bp) * 0.5 + 0.5) * wb;
      if (wr) value += (wave(Math.hypot(x - radialX, y - radialY) * radialFrequency + rp) * 0.5 + 0.5) * wr;
      if (wc) {
        const plate = plateA * Math.cos(plateN * x) * Math.cos(plateM * y) + plateB * Math.cos(plateM * x) * Math.cos(plateN * y);
        value += (1 - Math.min(1, Math.abs(plate) / Math.SQRT2)) * wc;
      }
      if (wp) {
        // Superposition: crests that meet add up, a crest meeting a trough cancels.
        let sum = 0;
        for (const [sx, sy] of sources) {
          const r = Math.hypot((x - sx) * aspectX, (y - sy) * aspectY);
          sum += wave(r * rippleK - ripplePhase) / (1 + rippleDecay * r);
        }
        value += (0.5 + 0.5 * sum / sources.length) * wp;
      }
      if (wl) {
        const d = sampleDistance(options.sdf, x, y);  // negative inside the logo
        let contour;
        if (d <= 0 && logoInside !== null) contour = logoInside;
        else contour = Math.pow(0.5 + 0.5 * wave(d * logoK - logoPhase), logoLine) / (1 + logoFade * Math.abs(d));
        value += contour * wl;
      }
      if (wn) {
        const fbm = (ox, oy) => {
          let frequency = noiseScale, amplitude = 1, sum = 0, amplitudes = 0;
          for (let octave = 0; octave < octaves; octave++) {
            sum += noise2(x * frequency + ox, y * frequency + oy, seed + octave * 1013) * amplitude;
            amplitudes += amplitude;
            frequency *= 2;
            amplitude *= 0.5;
          }
          return sum / amplitudes;
        };
        let noiseValue = fbm(nx, ny);
        if (fade > 0) {
          // Blend with the same drift one loop back; rescale so contrast holds steady through the blend.
          const mixed = noiseValue * (1 - fade) + fbm(nxEarlier, nyEarlier) * fade;
          noiseValue = 0.5 + (mixed - 0.5) / Math.hypot(1 - fade, fade);
        }
        value += noiseValue * wn;
      }
      if (wd) {
        const position = clamp(dataAxis === 'x' ? x : y) * (series.length - 1);
        const index = Math.min(series.length - 1, Math.floor(position));
        const fraction = position - index;
        const interpolation = fraction + (fraction * fraction * (3 - 2 * fraction) - fraction) * smoothing;
        value += (series[index] + (series[Math.min(index + 1, series.length - 1)] - series[index]) * interpolation) * wd;
      }
      if (wg) value += clamp(0.5 + ((x - 0.5) * gx + (y - 0.5) * gy) / gradientExtent) * wg;
      value = total ? value / total : 0.5;
      if (attractorEnabled && attractorStrength) {
        const distance = Math.hypot(inputX - attractorX, inputY - attractorY) / radius;
        if (distance < 1) {
          const influence = 1 - distance * distance;
          value += influence * influence * attractorStrength * 0.35;
        }
      }
      value = Math.pow(clamp((value - 0.5) * contrast + 0.5), gamma);
      if (quantise > 1) value = Math.round(value * (quantise - 1)) / (quantise - 1);
      if (quantise === 1) value = value >= 0.5 ? 1 : 0;
      return invert ? 1 - value : value;
    };

    return {
      sample,
      angle(x, y) {
        const epsilon = 0.0025;
        const dx = sample(x + epsilon, y) - sample(x - epsilon, y);
        const dy = sample(x, y + epsilon) - sample(x, y - epsilon);
        return Math.abs(dx) + Math.abs(dy) < 1e-8 ? 0 : Math.atan2(dy / canvasHeight, dx / canvasWidth) + Math.PI / 2;
      },
      waveB(x, y) { return wave(x * bx + y * by + bp) * 0.5 + 0.5; },
    };
  }

  // ---------- layout.ts ----------
  function buildLayout(params) {
    const { layout, canvas } = params;
    const width = Math.max(1, canvas.width), height = Math.max(1, canvas.height);
    const margin = Math.max(0, Math.min(layout.margin, Math.min(width, height) / 2 - 0.5));
    const availableWidth = width - 2 * margin, availableHeight = height - 2 * margin;
    const columns = layout.mode === 'Rows' ? 1 : Math.max(1, Math.min(1000, Math.round(layout.columns)));
    const rows = layout.mode === 'Columns' || layout.mode === 'Strands' ? 1 : Math.max(1, Math.min(1000, Math.round(layout.rows)));
    const gutterX = clamp(layout.gutterX, 0, availableWidth / columns * 0.98);
    const gutterY = clamp(layout.gutterY, 0, availableHeight / rows * 0.98);
    const cellWidth = (availableWidth - (columns - 1) * gutterX) / columns;
    const cellHeight = (availableHeight - (rows - 1) * gutterY) / rows;
    const stepX = cellWidth + gutterX, stepY = cellHeight + gutterY;
    const jitter = Math.max(0, layout.jitter);
    const cells = new Array(columns * rows);
    for (let row = 0; row < rows; row++) {
      const shift = layout.mode === 'Brick' && row % 2 ? stepX * layout.stagger : 0;
      for (let column = 0; column < columns; column++) {
        const index = row * columns + column;
        const x = margin + cellWidth / 2 + column * stepX + shift + (hash01(params.seed + 137, index) - 0.5) * cellWidth * jitter;
        const y = margin + cellHeight / 2 + row * stepY + (hash01(params.seed + 541, index) - 0.5) * cellHeight * jitter;
        cells[index] = { x, y, width: cellWidth, height: cellHeight, column, row, index, u: x / width, v: y / height };
      }
    }
    return cells;
  }

  // ---------- marks.ts ----------
  function hexRgb(hex) {
    const value = hex.replace('#', '').trim();
    const expanded = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
    const n = Number.parseInt(expanded, 16);
    if (!Number.isFinite(n)) return [0, 0, 0];
    return [(n >>> 16 & 255) / 255, (n >>> 8 & 255) / 255, (n & 255) / 255];
  }

  function sourceValue(source, value, u, v) {
    switch (source) {
      case 'x': return clamp(u);
      case 'y': return clamp(v);
      case 'radial': return clamp(Math.hypot(u - 0.5, v - 0.5) * Math.SQRT2);
      case 'constant': return 0.5;
      default: return value;
    }
  }

  const mapped = (mapping, value, u, v) => mapping.min + (mapping.max - mapping.min) * sourceValue(mapping.source, value, u, v);
  const shapeIds = { Rectangle: 0, Pill: 1, Parallelogram: 2, Line: 3, Dot: 4, Meter: 0 };

  /** Slot 13 of each instance holds a mark id that stays the same from frame to frame. */
  function buildGeometry(params, time, options = {}) {
    const cells = buildLayout(params), field = createField(params, time, options);
    const { mappings, marks, layout, canvas, colour } = params;
    const strands = layout.mode === 'Strands';
    const strandSamples = Math.max(2, Math.min(2048, Math.round(layout.strandSamples)));
    const capacity = cells.length * (strands ? strandSamples - 1 : marks.shape === 'Meter' ? 3 : 1);
    const instances = new Float32Array(capacity * STRIDE);
    const globalAngle = radians(layout.rotation), gc = Math.cos(globalAngle), gs = Math.sin(globalAngle);
    const centerX = canvas.width / 2, centerY = canvas.height / 2;
    const stop1 = hexRgb(colour.stop1), stop2 = hexRgb(colour.stop2), stop3 = hexRgb(colour.stop3);
    const accentColor = hexRgb(colour.accent);
    const accentEvery = Math.max(0, Math.round(colour.accentEvery));
    let count = 0, markCount = 0;
    let red = 0, green = 0, blue = 0;

    const setColor = (value, u, v, index, accent) => {
      if (accent) { red = accentColor[0]; green = accentColor[1]; blue = accentColor[2]; return; }
      const selectedSource = mappings.colour.source !== 'field' ? mappings.colour.source : colour.source;
      const raw = selectedSource === 'random' ? hash01(params.seed + 401, index) : sourceValue(selectedSource, value, u, v);
      const t = clamp(mappings.colour.min + (mappings.colour.max - mappings.colour.min) * raw) * (colour.stops === 3 ? 2 : 1);
      const lower = t > 1 ? stop2 : stop1;
      const upper = colour.stops === 3 ? (t > 1 ? stop3 : stop2) : stop2;
      const fraction = t > 1 ? t - 1 : t;
      red = lower[0] + (upper[0] - lower[0]) * fraction;
      green = lower[1] + (upper[1] - lower[1]) * fraction;
      blue = lower[2] + (upper[2] - lower[2]) * fraction;
    };

    const append = (x, y, width, height, angle, radius, skew, shape, opacity, layer, id) => {
      if (width <= 0.001 || height <= 0.001 || opacity <= 0) return;
      instances[count * STRIDE + 13] = id;
      const i = count++ * STRIDE, dx = x - centerX, dy = y - centerY;
      instances[i] = centerX + dx * gc - dy * gs;
      instances[i + 1] = centerY + dx * gs + dy * gc;
      instances[i + 2] = width;
      instances[i + 3] = height;
      instances[i + 4] = angle + globalAngle;
      instances[i + 5] = Math.max(0, Math.min(radius, width / 2, height / 2));
      instances[i + 6] = skew;
      instances[i + 7] = shape;
      instances[i + 8] = red;
      instances[i + 9] = green;
      instances[i + 10] = blue;
      instances[i + 11] = clamp(opacity);
      instances[i + 12] = layer;
    };

    const isAccent = (cell, index) => {
      if (!accentEvery) return false;
      const n = colour.accentAxis === 'column' ? cell.column : colour.accentAxis === 'row' ? cell.row : index;
      return (n + 1) % accentEvery === 0;
    };

    if (strands) {
      for (const cell of cells) {
        const top = cell.y - cell.height / 2;
        let previousX = 0, previousY = 0, previousValue = 0;
        for (let j = 0; j < strandSamples; j++) {
          const baseY = top + cell.height * j / (strandSamples - 1);
          const u = cell.x / canvas.width, v = baseY / canvas.height;
          const value = field.sample(u, v);
          const x = cell.x + (value - 0.5) * layout.strandDisplacement * 2 + mapped(mappings.offsetX, value, u, v);
          const y = baseY + mapped(mappings.offsetY, value, u, v);
          if (j) {
            // A segment takes the mean of its two ends rather than sampling the field again: one sample per point.
            const middleX = (x + previousX) / 2, middleY = (y + previousY) / 2;
            const mu = middleX / canvas.width, mv = middleY / canvas.height, middleValue = (value + previousValue) / 2;
            if (middleValue >= marks.threshold) {
              const index = cell.index * (strandSamples - 1) + j - 1;
              const accent = isAccent(cell, index), thickness = mapped(mappings.thickness, middleValue, mu, mv);
              setColor(middleValue, mu, mv, index, accent);
              const before = count;
              append(middleX, middleY, Math.hypot(x - previousX, y - previousY) + Math.max(0, thickness), thickness, Math.atan2(y - previousY, x - previousX), thickness / 2, 0, 3, mapped(mappings.opacity, middleValue, mu, mv), accent ? 3 : 1, index);
              if (count > before) markCount++;
            }
          }
          previousX = x; previousY = y; previousValue = value;
        }
      }
    } else {
      for (const cell of cells) {
        const { u, v } = cell;
        const value = field.sample(u, v);
        if (value < marks.threshold) continue;
        const accent = isAccent(cell, cell.index);
        const opacity = mapped(mappings.opacity, value, u, v);
        if (opacity <= 0) continue;
        const x = cell.x + mapped(mappings.offsetX, value, u, v);
        const y = cell.y + mapped(mappings.offsetY, value, u, v);
        let angle;
        if (marks.angleMode === 'fixed') angle = radians(marks.fixedAngle);
        else if (marks.angleMode === 'flow') angle = field.angle(u, v) + radians(marks.fixedAngle);
        else if (marks.angleMode === 'swirl') angle = Math.atan2((v - params.attractor.y) * canvas.height, (u - params.attractor.x) * canvas.width) + Math.PI / 2 + radians(marks.fixedAngle);
        else angle = radians(mapped(mappings.angle, value, u, v));
        setColor(value, u, v, cell.index, accent);
        const before = count;
        if (marks.shape === 'Meter') {
          const height = cell.height, fillHeight = height * value;
          const sn = Math.sin(angle), cs = Math.cos(angle);
          append(x, y, marks.trackThickness, height, angle, marks.radius, 0, 0, opacity * marks.trackOpacity, accent ? 3 : 0, cell.index * 3);
          const fillOffset = (height - fillHeight) / 2;
          append(x - fillOffset * sn, y + fillOffset * cs, marks.fillThickness, fillHeight, angle, marks.radius, 0, 0, opacity, accent ? 3 : 1, cell.index * 3 + 1);
          const capValue = marks.capWave ? field.waveB(u, v) : value;
          const capOffset = clamp(height / 2 - height * capValue - marks.capOffset, -height / 2, height / 2);
          append(x - capOffset * sn, y + capOffset * cs, marks.fillThickness * 1.4, marks.capSize, angle, marks.radius, 0, 0, opacity, accent ? 3 : 2, cell.index * 3 + 2);
        } else {
          append(x, y, mapped(mappings.length, value, u, v), mapped(mappings.thickness, value, u, v), angle, marks.radius, (marks.shape === 'Parallelogram' ? marks.skew : 0) + mapped(mappings.skew, value, u, v), shapeIds[marks.shape], opacity, accent ? 3 : 1, cell.index);
        }
        if (count > before) markCount++;
      }
    }
    return { instances: count === capacity ? instances : instances.slice(0, count * STRIDE), count, markCount };
  }

  // ---------- presets.ts ----------
  const PALETTES = [
    { name: 'Signal', background: '#FAFBFD', stop1: '#151515', stop2: '#151515', stop3: '#F76E43', accent: '#F76E43', stops: 2 },
    { name: 'Azure', background: '#E8F4FF', stop1: '#1B98FE', stop2: '#A2D5FF', stop3: '#0A64C2', accent: '#F76E43', stops: 2 },
    { name: 'Night', background: '#082A6F', stop1: '#1B98FE', stop2: '#A2D5FF', stop3: '#E8F4FF', accent: '#F76E43', stops: 2 },
    { name: 'Meter', background: '#151515', stop1: '#F76E43', stop2: '#5F6470', stop3: '#A2D5FF', accent: '#F76E43', stops: 2 },
    { name: 'Heritage', background: '#151515', stop1: '#00BCEA', stop2: '#00BCEA', stop3: '#A2D5FF', accent: '#F76E43', stops: 2 },
    { name: 'Action', background: '#FFFFFF', stop1: '#0A64C2', stop2: '#0A64C2', stop3: '#1B98FE', accent: '#F76E43', stops: 2 },
  ];

  const mapping = (source, min, max) => ({ source, min, max });

  function base(name, paletteName) {
    const palette = PALETTES.find((item) => item.name === paletteName);
    return {
      version: 1, name, seed: 240618,
      field: {
        waveA: { enabled: true, weight: 1, frequency: 1.5, direction: 30, phase: 0, speed: 0.2 },
        waveB: { enabled: false, weight: 0.3, frequency: 2.6, direction: 120, phase: 46, speed: -0.12 },
        radial: { enabled: false, weight: 0.5, x: 0.5, y: 0.5, frequency: 2, speed: 0.15 },
        noise: { enabled: false, weight: 0.25, scale: 3, octaves: 3, speed: 0.08 },
        data: { enabled: false, weight: 1, seed: 731, smoothing: 0.65, trend: 0, volatility: 0.3, axis: 'x', values: '' },
        gradient: { enabled: false, weight: 1, direction: 0 },
        // Wave studies (not in the original studio): a vibrating plate, interfering point sources and a logo distance field.
        chladni: { enabled: false, weight: 1, n: 3, m: 7, mix: -45, speed: 0.2 },
        ripples: { enabled: false, weight: 1, sources: 3, spread: 0.2, frequency: 10, decay: 0, rotation: 90, orbit: 0, speed: 0.2 },
        // fill: 'on' solid, 'off' contours run inside too, 'empty' leaves the mark as negative space.
        // fade dims contours with distance from the outline; line > 1 thins them into fine lines.
        logo: { enabled: false, weight: 1, shape: 'symbol', text: 'OneSyntax', size: 0.42, frequency: 9, fill: 'on', fade: 0, line: 1, speed: 0.2 },
        // Every periodic wave (A, B, radial, ripples, logo contours) takes this Fourier shape.
        shape: 'sine', harmonics: 8,
        // How the wave studies move: 'flow' sends rings outward and turns the plate one way; 'morph' sways each
        // figure back and forth through its shapes (by `morph`, 0..1), still a whole number of cycles per loop.
        motion: 'flow', morph: 0.6,
      },
      shaping: { warp: 0, warpScale: 3, mirror: 'none', contrast: 1, gamma: 1, quantise: 0, invert: false },
      attractor: { enabled: false, x: 0.5, y: 0.48, radius: 0.32, strength: 0.55 },
      layout: { mode: 'Grid', columns: 28, rows: 28, margin: 100, gutterX: 0, gutterY: 0, jitter: 0, rotation: 0, stagger: 0.5, strandDisplacement: 90, strandSamples: 100 },
      marks: { shape: 'Rectangle', radius: 0, skew: 0, threshold: 0, angleMode: 'fixed', fixedAngle: 0, trackThickness: 1.5, trackOpacity: 0.25, fillThickness: 12, capSize: 8, capOffset: 32, capWave: true },
      mappings: {
        thickness: mapping('constant', 5, 5), length: mapping('constant', 26, 26),
        angle: mapping('field', -28, 28), opacity: mapping('constant', 1, 1), colour: mapping('field', 0, 1),
        offsetX: mapping('constant', 0, 0), offsetY: mapping('constant', 0, 0), skew: mapping('constant', 0, 0),
      },
      colour: { palette: palette.name, background: palette.background, stop1: palette.stop1, stop2: palette.stop2, stop3: palette.stop3, stops: palette.stops, source: 'field', continuous: false, gradientAngle: 0, accent: palette.accent, accentEvery: 0, accentAxis: 'mark' },
      motion: { playing: false, speed: 1, time: 0, loop: true },
      canvas: { format: '1:1', width: 1200, height: 1200, pngScale: 2 },
    };
  }

  function preset(name, palette, tune) { const p = base(name, palette); tune(p); return p; }

  const PRESETS = [
    preset('Sinky Meter', 'Meter', (p) => {
      p.layout.mode = 'Columns'; p.layout.columns = 32; p.layout.rows = 1; p.layout.margin = 145;
      p.marks.shape = 'Meter'; p.marks.fillThickness = 11; p.marks.capSize = 7; p.marks.capOffset = 60; p.marks.capWave = false; p.marks.trackOpacity = 0.38;
      p.field.waveA.enabled = false; p.field.waveB.enabled = true; p.field.waveB.weight = 0.13; p.field.waveB.frequency = 0.8; p.field.waveB.direction = 0;
      p.field.data.enabled = true; p.field.data.values = '78,76,70,68,65,58,56,50,44,40,35,30,25,21,15,9'; p.field.data.smoothing = 0.7;
      p.shaping.gamma = 1.25; p.colour.source = 'x';
    }),
    preset('Amaya Flow', 'Azure', (p) => {
      p.layout.columns = 20; p.layout.rows = 25; p.layout.margin = 65;
      p.field.gradient.enabled = true; p.field.gradient.direction = 90; p.field.gradient.weight = 1;
      p.field.waveA.frequency = 0.7; p.field.waveA.direction = 90; p.field.waveA.weight = 0.1;
      p.field.waveB.enabled = false; p.field.waveB.frequency = 0.6; p.field.waveB.weight = 0.35; p.field.waveB.phase = 29;
      p.attractor.enabled = true; p.attractor.radius = 0.38; p.attractor.strength = 0.4;
      p.marks.angleMode = 'flow'; p.mappings.thickness = mapping('constant', 11, 11); p.mappings.length = mapping('constant', 42, 42);
      p.colour.stop2 = '#1B98FE'; p.colour.background = '#D1E8FF'; p.colour.source = 'constant';
    }),
    preset('Barcode', 'Signal', (p) => {
      p.layout.columns = 88; p.layout.rows = 8; p.layout.margin = 85;
      p.field.waveA.frequency = 2.3; p.field.waveA.direction = 18; p.field.waveB.enabled = true; p.field.waveB.frequency = 3.1; p.field.waveB.direction = 90; p.field.waveB.weight = 0.4;
      p.shaping.contrast = 1.7; p.marks.threshold = 0.12; p.marks.fixedAngle = 90;
      p.mappings.thickness = mapping('field', 1.8, 14.4); p.mappings.length = mapping('constant', 108, 108);
    }),
    preset('Threshold Stripes', 'Night', (p) => {
      p.layout.mode = 'Rows'; p.layout.rows = 44; p.layout.columns = 1; p.layout.margin = 80;
      p.field.waveA.frequency = 1.2; p.field.waveA.direction = 90; p.field.waveB.enabled = true; p.field.waveB.frequency = 2.7; p.field.waveB.weight = 0.2;
      p.shaping.contrast = 1.55; p.shaping.gamma = 0.8; p.shaping.quantise = 7;
      p.mappings.thickness = mapping('field', 2, 20); p.mappings.length = mapping('field', 230, 1040);
      p.colour.continuous = true; p.colour.source = 'y'; p.colour.gradientAngle = 90;
    }),
    preset('Halftone Diagonal', 'Action', (p) => {
      p.layout.columns = 33; p.layout.rows = 33; p.layout.margin = 80;
      p.field.waveA.enabled = false; p.field.gradient.enabled = true; p.field.gradient.direction = 42;
      p.marks.shape = 'Line'; p.marks.fixedAngle = -45;
      p.mappings.thickness = mapping('field', 0.7, 12); p.mappings.length = mapping('constant', 29, 29); p.shaping.gamma = 1.35;
    }),
    preset('Contour Field', 'Heritage', (p) => {
      p.layout.columns = 44; p.layout.rows = 44; p.layout.margin = 80;
      p.field.waveA.frequency = 1.2; p.field.waveA.direction = 35; p.field.waveB.enabled = true; p.field.waveB.frequency = 1.7; p.field.waveB.direction = 128; p.field.waveB.weight = 0.6;
      p.field.radial.enabled = true; p.field.radial.weight = 0.25; p.shaping.warp = 0.07;
      p.marks.shape = 'Pill'; p.marks.angleMode = 'flow'; p.marks.radius = 3;
      p.mappings.thickness = mapping('constant', 2.5, 2.5); p.mappings.length = mapping('field', 8, 22);
    }),
    preset('Strands', 'Signal', (p) => {
      p.layout.mode = 'Strands'; p.layout.columns = 56; p.layout.rows = 1; p.layout.margin = 110; p.layout.strandDisplacement = 72; p.layout.strandSamples = 140;
      p.field.waveA.frequency = 1.4; p.field.waveA.direction = 65; p.field.waveB.enabled = true; p.field.waveB.frequency = 0.8; p.field.waveB.direction = 110; p.field.waveB.weight = 0.4;
      p.marks.shape = 'Line'; p.mappings.thickness = mapping('field', 1.1, 3.2);
      p.colour.accentEvery = 13; p.colour.accentAxis = 'column';
    }),
    preset('Kaleido Pixels', 'Azure', (p) => {
      p.layout.columns = 40; p.layout.rows = 40; p.layout.margin = 60;
      p.field.waveA.frequency = 2.1; p.field.waveA.direction = 40; p.field.waveB.enabled = true; p.field.waveB.frequency = 1.8; p.field.waveB.direction = 112; p.field.waveB.weight = 0.8;
      p.field.noise.enabled = true; p.field.noise.weight = 0.2; p.shaping.mirror = 'XY'; p.shaping.quantise = 6; p.shaping.warp = 0;
      p.mappings.thickness = mapping('constant', 27, 27); p.mappings.length = mapping('constant', 27, 27);
      p.colour.stops = 3; p.colour.stop1 = '#082A6F'; p.colour.stop2 = '#1B98FE'; p.colour.stop3 = '#A2D5FF';
    }),
    preset('RFD Stack', 'Night', (p) => {
      p.layout.mode = 'Grid'; p.layout.columns = 4; p.layout.rows = 31; p.layout.margin = 95; p.layout.gutterX = 30;
      p.field.waveA.frequency = 1.2; p.field.waveA.direction = 83; p.field.waveB.enabled = true; p.field.waveB.frequency = 1.4; p.field.waveB.direction = 0; p.field.waveB.weight = 0.4;
      p.shaping.quantise = 8; p.mappings.thickness = mapping('constant', 6, 6); p.mappings.length = mapping('field', 28, 206);
      p.colour.stop1 = '#A2D5FF'; p.colour.stop2 = '#A2D5FF';
    }),
  ];

  const PRESET_DESCRIPTIONS = {
    'Sinky Meter': 'Data, made visible. Precise meters in a warm-to-cool spectrum.',
    'Amaya Flow': 'A field of blue dashes bending around a quiet centre.',
    Barcode: 'Rhythmic bars, variable widths, intentional negative space.',
    'Threshold Stripes': 'Stepped waves, translated into luminous horizontal bands.',
    'Halftone Diagonal': 'A gradual shift in weight across a field of diagonal strokes.',
    'Contour Field': 'Small gestures following the contours of an invisible field.',
    Strands: 'Continuous lines tracing a shared, gently shifting wave.',
    'Kaleido Pixels': 'Mirrored interference, reduced to a precise colour grid.',
    'RFD Stack': 'Quantised horizontal bars with the rhythm of a data readout.',
  };


  // ---------- svg.ts ----------
  function screenGradient(params) {
    const { width, height } = params.canvas;
    const source = params.mappings.colour.source !== 'field' ? params.mappings.colour.source : params.colour.source;
    const angle = source === 'x' ? 0 : source === 'y' ? Math.PI / 2 : params.colour.gradientAngle * Math.PI / 180;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const span = Math.max(0.0001, Math.abs(dx) * width + Math.abs(dy) * height);
    return {
      radial: source === 'radial',
      start: [width / 2 - dx * span / 2, height / 2 - dy * span / 2],
      end: [width / 2 + dx * span / 2, height / 2 + dy * span / 2],
      centre: [width / 2, height / 2],
      radius: [width / Math.SQRT2, height / Math.SQRT2],
    };
  }

  function colourRGB(hex) {
    let value = String(hex).trim().replace(/^#/, '');
    if (value.length === 3) value = [...value].map((char) => char + char).join('');
    if (!/^[\da-f]{6}$/i.test(value)) return [0, 0, 0];
    return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  }

  function paletteAt(params, position) {
    const t = clamp(position);
    const three = params.colour.stops === 3;
    const left = colourRGB(three && t > 0.5 ? params.colour.stop2 : params.colour.stop1);
    const right = colourRGB(three && t > 0.5 ? params.colour.stop3 : params.colour.stop2);
    const amount = three ? (t > 0.5 ? (t - 0.5) * 2 : t * 2) : t;
    return left.map((value, index) => value + (right[index] - value) * amount);
  }

  /** Colour stops of the screen-space gradient, shared by the canvas renderer and SVG export. */
  function gradientStops(params) {
    const { min, max } = params.mappings.colour;
    const offsets = [0, 1];
    if (min !== max) {
      for (const position of params.colour.stops === 3 ? [0, 0.5, 1] : [0, 1]) {
        const offset = (position - min) / (max - min);
        if (offset > 0 && offset < 1) offsets.push(offset);
      }
    }
    offsets.sort((a, b) => a - b);
    return offsets.map((offset) => [offset, paletteAt(params, min + (max - min) * offset)]);
  }

  const number = (value) => Number(value.toFixed(5)).toString();
  const escape = (value) => value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);
  const rgb = (value) => `rgb(${value.map((channel) => `${number(clamp(channel) * 100)}%`).join(' ')})`;

  function gradientDefinition(params) {
    const spec = screenGradient(params);
    const stops = gradientStops(params).map(([offset, colour]) => `<stop offset="${number(offset)}" stop-color="${rgb(colour)}"/>`).join('');
    const shared = 'id="screen-gradient" gradientUnits="userSpaceOnUse" spreadMethod="pad" color-interpolation="sRGB"';
    if (spec.radial) return `<radialGradient ${shared} cx="0" cy="0" r="1" gradientTransform="translate(${spec.centre.map(number).join(' ')}) scale(${spec.radius.map(number).join(' ')})">${stops}</radialGradient>`;
    return `<linearGradient ${shared} x1="${number(spec.start[0])}" y1="${number(spec.start[1])}" x2="${number(spec.end[0])}" y2="${number(spec.end[1])}">${stops}</linearGradient>`;
  }

  /** Bake an affine transform into exact SVG arcs so the screen gradient stays fixed. */
  function worldPath(x, y, width, height, angle, radius, skew, dot) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const a = cos, b = sin, c = cos * skew - sin, d = sin * skew + cos;
    const point = (px, py) => `${number(x + a * px + c * py)} ${number(y + b * px + d * py)}`;
    const hw = width / 2, hh = height / 2;
    if (dot) {
      const ellipse = `${number(hw)} ${number(hh)} ${number(angle * 180 / Math.PI)} 1 1`;
      return `M${point(hw, 0)} A${ellipse} ${point(-hw, 0)} A${ellipse} ${point(hw, 0)} Z`;
    }
    if (radius <= 0) return `M${point(-hw, -hh)} L${point(hw, -hh)} L${point(hw, hh)} L${point(-hw, hh)} Z`;
    const aa = a * a + c * c, bb = b * b + d * d, ab = a * b + c * d;
    const largest = Math.max(1e-10, (aa + bb + Math.hypot(aa - bb, 2 * ab)) / 2);
    const axis = Math.atan2(2 * ab, aa - bb) * 90 / Math.PI;
    const rx = radius * Math.sqrt(largest), ry = radius / Math.sqrt(largest);
    const arc = `A${number(rx)} ${number(ry)} ${number(axis)} 0 1`;
    return `M${point(-hw + radius, -hh)} L${point(hw - radius, -hh)} ${arc} ${point(hw, -hh + radius)} L${point(hw, hh - radius)} ${arc} ${point(hw - radius, hh)} L${point(-hw + radius, hh)} ${arc} ${point(-hw, hh - radius)} L${point(-hw, -hh + radius)} ${arc} ${point(-hw + radius, -hh)} Z`;
  }

  /** `metadata` is embedded as JSON so an exported SVG can be traced back to its settings. */
  function toSVG(geometry, params, metadata = params, options = {}) {
    const layers = [[], [], [], []];
    const names = ['track', 'fill', 'cap', 'accent'];
    const instances = geometry.instances;
    const count = Math.min(geometry.count, Math.floor(instances.length / STRIDE));
    for (let index = 0; index < count; index++) {
      const offset = index * STRIDE;
      const [x, y, width, height, angle, rawRadius, rawSkew, shape, red, green, blue, rawOpacity, rawLayer] = instances.subarray(offset, offset + STRIDE);
      if (width <= 0 || height <= 0 || rawOpacity <= 0) continue;
      const layer = Math.round(clamp(rawLayer, 0, 3));
      const radius = shape === 1 || shape === 3 ? Math.min(width, height) / 2 : clamp(rawRadius, 0, Math.min(width, height) / 2);
      const skew = shape === 2 ? rawSkew : 0;
      const continuous = params.colour.continuous && layer !== 3;
      const fill = continuous ? 'url(#screen-gradient)' : rgb([red, green, blue]);
      const paint = `fill="${fill}" fill-opacity="${number(clamp(rawOpacity))}"`;
      if (continuous && (angle !== 0 || skew !== 0)) {
        layers[layer].push(`<path d="${worldPath(x, y, width, height, angle, radius, skew, shape === 4)}" ${paint}/>`);
        continue;
      }
      const transform = angle !== 0 || skew !== 0 ? ` transform="translate(${number(x)} ${number(y)}) rotate(${number(angle * 180 / Math.PI)})${skew !== 0 ? ` skewX(${number(Math.atan(skew) * 180 / Math.PI)})` : ''}"` : '';
      const cx = transform ? 0 : x, cy = transform ? 0 : y;
      if (shape === 4) layers[layer].push(`<ellipse cx="${number(cx)}" cy="${number(cy)}" rx="${number(width / 2)}" ry="${number(height / 2)}"${transform} ${paint}/>`);
      else layers[layer].push(`<rect x="${number(cx - width / 2)}" y="${number(cy - height / 2)}" width="${number(width)}" height="${number(height)}" rx="${number(radius)}"${transform} ${paint}/>`);
    }
    const { width, height } = params.canvas;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}" color-interpolation="sRGB">\n<title>${escape(params.name)} · OneSyntax</title>\n<desc>Seed ${params.seed}. ${geometry.markCount} marks. Generated with the OneSyntax Pattern Generator.</desc>\n<metadata id="onesyntax-preset">${escape(JSON.stringify(metadata))}</metadata>\n${params.colour.continuous ? `<defs>${gradientDefinition(params)}</defs>\n` : ''}<g id="background" data-name="background">${options.transparent ? '' : `<rect width="${number(width)}" height="${number(height)}" fill="${rgb(colourRGB(params.colour.background))}"/>`}</g>\n${names.map((name, layer) => `<g id="${name}" data-name="${name}">\n${layers[layer].join('\n')}\n</g>`).join('\n')}\n</svg>`;
  }

  // ---------- renderer.ts ----------
  // Instanced WebGL 2 renderer. Each mark is an SDF quad, so edges stay crisp at any size.
  const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCentre;
layout(location=1) in vec2 aSize;
layout(location=2) in vec4 aProperties;
layout(location=3) in vec4 aColour;
layout(location=4) in float aLayer;
uniform vec4 uView;     // logical -> device pixels: scale x, scale y, offset x, offset y
uniform vec2 uViewport; // device pixels
uniform float uPadding;
out vec2 vLocal;
out vec2 vScreen;
flat out vec2 vHalfSize;
flat out vec3 vProperties;
flat out vec4 vColour;
flat out float vLayer;
const vec2 QUAD[6] = vec2[6](vec2(-1.,-1.),vec2(1.,-1.),vec2(-1.,1.),vec2(-1.,1.),vec2(1.,-1.),vec2(1.,1.));
void main() {
  float angle = aProperties.x;
  float shape = aProperties.w;
  float skew = shape == 2. ? aProperties.z : 0.;
  vec2 halfSize = max(aSize * .5, vec2(.0001));
  vec2 bounds = halfSize + vec2(abs(skew) * halfSize.y, 0.) + uPadding;
  vLocal = QUAD[gl_VertexID] * bounds;
  float c = cos(angle), s = sin(angle);
  vScreen = aCentre + mat2(c,s,-s,c) * vLocal;
  vec2 device = vScreen * uView.xy + uView.zw;
  gl_Position = vec4(device.x / uViewport.x * 2. - 1., 1. - device.y / uViewport.y * 2., 0., 1.);
  vHalfSize = halfSize;
  vProperties = vec3(aProperties.y, skew, shape);
  vColour = aColour;
  vLayer = aLayer;
}`;

  const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vScreen;
flat in vec2 vHalfSize;
flat in vec3 vProperties;
flat in vec4 vColour;
flat in float vLayer;
uniform bool uContinuous;
uniform bool uRadial;
uniform int uStops;
uniform vec3 uStop1;
uniform vec3 uStop2;
uniform vec3 uStop3;
uniform vec4 uGradient;
uniform vec4 uRadialGeometry;
uniform vec2 uColourRange;
out vec4 outColour;
void main() {
  float radius = clamp(vProperties.x, 0., min(vHalfSize.x, vHalfSize.y));
  float shape = vProperties.z;
  if (shape == 1. || shape == 3.) radius = min(vHalfSize.x, vHalfSize.y);
  vec2 p = vLocal;
  p.x -= vProperties.y * p.y;
  float distanceToEdge;
  if (shape == 4.) {
    distanceToEdge = (length(p / vHalfSize) - 1.) * min(vHalfSize.x, vHalfSize.y);
  } else {
    vec2 q = abs(p) - vHalfSize + radius;
    distanceToEdge = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
  }
  float aa = max(fwidth(distanceToEdge), .00001);
  float coverage = 1. - smoothstep(-aa * .5, aa * .5, distanceToEdge);
  if (coverage <= 0.) discard;
  vec3 colour = vColour.rgb;
  if (uContinuous && vLayer < 2.5) {
    vec2 direction = uGradient.zw - uGradient.xy;
    float t = uRadial ? length((vScreen - uRadialGeometry.xy) / uRadialGeometry.zw) : dot(vScreen - uGradient.xy, direction) / max(dot(direction, direction), .00001);
    t = clamp(mix(uColourRange.x, uColourRange.y, clamp(t, 0., 1.)), 0., 1.);
    colour = uStops == 3 ? (t <= .5 ? mix(uStop1, uStop2, t * 2.) : mix(uStop2, uStop3, (t - .5) * 2.)) : mix(uStop1, uStop2, t);
  }
  outColour = vec4(colour, clamp(vColour.a, 0., 1.) * coverage);
}`;

  function shader(gl, type, source) {
    const result = gl.createShader(type);
    if (!result) throw new Error('Unable to allocate a WebGL shader.');
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(result);
      gl.deleteShader(result);
      throw new Error(`Pattern shader failed to compile: ${reason}`);
    }
    return result;
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
      if (!gl) throw new Error('WebGL 2 is unavailable.');
      this.canvas = canvas;
      this.gl = gl;
      this.ordered = new Float32Array(0);
      this.lost = false;
      this.disposed = false;
      this.loseContext = (event) => { event.preventDefault(); this.lost = true; };
      this.restoreContext = () => { this.initialise(); this.lost = false; };
      this.initialise();
      canvas.addEventListener('webglcontextlost', this.loseContext);
      canvas.addEventListener('webglcontextrestored', this.restoreContext);
    }

    initialise() {
      const gl = this.gl;
      const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
      const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const reason = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Pattern shader failed to link: ${reason}`);
      }
      this.program = program;
      this.vao = gl.createVertexArray();
      this.buffer = gl.createBuffer();
      this.bufferBytes = 0;
      const maximum = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      const maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      this.maxSize = [Math.min(maximum[0], maxRenderbuffer), Math.min(maximum[1], maxRenderbuffer)];
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      for (const [location, size, offset] of [[0, 2, 0], [1, 2, 2], [2, 4, 4], [3, 4, 8], [4, 1, 12]]) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
        gl.vertexAttribDivisor(location, 1);
      }
      this.uniforms = {};
      for (const name of ['uView', 'uViewport', 'uPadding', 'uContinuous', 'uRadial', 'uStops', 'uStop1', 'uStop2', 'uStop3', 'uGradient', 'uRadialGeometry', 'uColourRange']) this.uniforms[name] = gl.getUniformLocation(program, name);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DITHER);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    /** `view` places the artwork in device pixels: [scaleX, scaleY, offsetX, offsetY]. By default it fills the canvas. */
    render(geometry, params, pixelWidth = this.canvas.width, pixelHeight = this.canvas.height, view = null) {
      if (this.disposed || this.lost || this.gl.isContextLost()) return;
      const gl = this.gl;
      const width = Math.max(1, Math.min(this.maxSize[0], Math.round(pixelWidth)));
      const height = Math.max(1, Math.min(this.maxSize[1], Math.round(pixelHeight)));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      gl.viewport(0, 0, width, height);
      const background = colourRGB(params.colour.background);
      gl.clearColor(background[0], background[1], background[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const count = Math.min(geometry.count, Math.floor(geometry.instances.length / STRIDE));
      if (!count) return;
      const data = this.layered(geometry.instances, count);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      if (data.byteLength > this.bufferBytes) {
        this.bufferBytes = Math.max(data.byteLength, this.bufferBytes * 2);
        gl.bufferData(gl.ARRAY_BUFFER, this.bufferBytes, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      const u = this.uniforms;
      const gradient = screenGradient(params);
      const [sx, sy, ox, oy] = view || [width / params.canvas.width, height / params.canvas.height, 0, 0];
      gl.uniform4f(u.uView, sx, sy, ox, oy);
      gl.uniform2f(u.uViewport, width, height);
      gl.uniform1f(u.uPadding, 2 / Math.max(1e-6, Math.min(sx, sy)));
      gl.uniform1i(u.uContinuous, Number(params.colour.continuous));
      gl.uniform1i(u.uRadial, Number(gradient.radial));
      gl.uniform1i(u.uStops, params.colour.stops);
      gl.uniform3fv(u.uStop1, colourRGB(params.colour.stop1));
      gl.uniform3fv(u.uStop2, colourRGB(params.colour.stop2));
      gl.uniform3fv(u.uStop3, colourRGB(params.colour.stop3));
      gl.uniform4f(u.uGradient, ...gradient.start, ...gradient.end);
      gl.uniform4f(u.uRadialGeometry, ...gradient.centre, ...gradient.radius);
      gl.uniform2f(u.uColourRange, params.mappings.colour.min, params.mappings.colour.max);
      // Marks pushed past the artwork's edge (a wide swing, long stripes) are cut at the frame, as in every export.
      const left = Math.max(0, Math.floor(ox)), right = Math.min(width, Math.ceil(ox + params.canvas.width * sx));
      const top = Math.max(0, Math.floor(oy)), bottom = Math.min(height, Math.ceil(oy + params.canvas.height * sy));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(left, height - bottom, Math.max(0, right - left), Math.max(0, bottom - top));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.disable(gl.SCISSOR_TEST);
    }

    layered(instances, count) {
      const counts = [0, 0, 0, 0];
      let previous = 0, sorted = true;
      for (let index = 0; index < count; index++) {
        const layer = Math.max(0, Math.min(3, Math.round(instances[index * STRIDE + 12])));
        counts[layer]++;
        if (layer < previous) sorted = false;
        previous = layer;
      }
      if (sorted) return instances.subarray(0, count * STRIDE);
      if (this.ordered.length < count * STRIDE) this.ordered = new Float32Array(count * STRIDE);
      const offsets = [0, counts[0], counts[0] + counts[1], counts[0] + counts[1] + counts[2]];
      for (let index = 0; index < count; index++) {
        const source = index * STRIDE;
        const layer = Math.max(0, Math.min(3, Math.round(instances[source + 12])));
        const target = offsets[layer]++ * STRIDE;
        for (let item = 0; item < STRIDE; item++) this.ordered[target + item] = instances[source + item];
      }
      return this.ordered.subarray(0, count * STRIDE);
    }

    dispose(releaseContext = false) {
      if (this.disposed) return;
      this.disposed = true;
      this.canvas.removeEventListener('webglcontextlost', this.loseContext);
      this.canvas.removeEventListener('webglcontextrestored', this.restoreContext);
      this.gl.deleteBuffer(this.buffer);
      this.gl.deleteVertexArray(this.vao);
      this.gl.deleteProgram(this.program);
      if (releaseContext) { const lose = this.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    }
  }

  window.WaveEngine = {
    STRIDE, clamp, buildGeometry, motionCycles, waveFn, basePreset: base, PRESETS, PRESET_DESCRIPTIONS,
    screenGradient, colourRGB, paletteAt, gradientStops, toSVG, Renderer,
  };
})();
