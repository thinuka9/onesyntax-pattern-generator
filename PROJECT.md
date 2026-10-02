# OneSyntax Pattern Generator — Project Handoff

Everything you need to rebuild, run or continue this project on any machine. For what each UI control does,
see `README.md`. This file covers the why, the rules and the current state.

- **Client:** OneSyntax (product & engineering partner). Rebrand by **Haux Studio**.
- **Purpose:** the brand uses data-driven patterns, and every pattern in the system is generated with this tool.
  It has to be robust, repeatable and exportable.
- **Started:** 2026-10-02. **Status:** v1 complete; all 9 presets render and pass the visual check.

---

## 1. Quick start (any machine)

Requirements: **Node 22+** (built on Node 24) and **Chrome or Edge** installed (the check script uses it headlessly).

```bash
cd onesyntax-pattern-generator
npm install
npm run dev        # open the printed localhost URL
npm run check      # renders every preset to ./out as PNG + SVG and fails on errors or blank renders
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build to ./dist
```

- **Browser for `npm run check`:** it looks for Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`,
  then Edge. On macOS/Linux, or with a different install, set `CHROME_PATH`:
  - macOS: `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run check`
  - Optional: `CHECK_TIME=2` (seconds into the animation) and `CHECK_SCALE=1`.
- **URL params:** `?preset=Sinky%20Meter&t=1.5&paused=1` loads a preset at a given time, paused.
- **Keyboard:** Space play/pause · R randomise all · S save PNG.

---

## 2. The brief (source of truth)

**Stack:** Vite, TypeScript (strict), raw WebGL2, Tweakpane v4 for the panel. **No other runtime dependencies.**
Dev-only: `playwright-core` (for the check script), `typescript`, `vite`, `@tweakpane/core` (types).

**Core idea:** everything is driven by maths, mainly sine and wave functions. One scalar field, value(x, y, t)
normalised to 0..1, drives every visual property of a grid of marks. Geometry is computed on the CPU each frame and
drawn with WebGL2 instanced quads. Because geometry lives on the CPU, the exact same marks export to SVG.

1. **Field:** a weighted sum of components, each with its own weight and on/off switch:
   - Wave A and Wave B (frequency, direction, phase, speed)
   - Radial wave (centre, frequency, speed)
   - Noise (fbm value noise: scale, octaves, drift)
   - Data series (seeded random walk: seed, smoothing, trend, volatility, axis; or pasted comma-separated real numbers)
   - Linear gradient (angle)

   Shaping comes next (warp, mirror, contrast, bias/gamma, quantise, invert), plus an **attractor** (radius, strength)
   that pushes values and bends angles around it.
2. **Layout:** Grid, Brick, Columns, Rows, Strands. Controls: cols, rows, margin, gutters, jitter, global rotation.
3. **Marks** are SDF shapes with clean antialiasing at any scale: Rect, Pill, Parallelogram (skew), Line, Dot, and
   **Meter** (track + fill + cap, from the Sinky tag). Corner radius applies to all.
4. **Mappings:** thickness, length, angle, opacity, colour position, offset x/y and skew. Each has min/max plus a
   source (field / x / y / radial / constant). Threshold hides marks below a value. Angle modes: value, flow
   (follows contours), swirl (around the attractor), fixed.
5. **Colour:**
   - Background plus a 2–3 stop gradient, coloured by field, x, y, radial or random.
   - A continuous screen-space gradient toggle (SVG: a `linearGradient`/`radialGradient` in user space).
   - Accent every Nth mark, column or row.
   - OneSyntax palettes (section 6), plus free colour pickers.
6. **Motion:** play/pause, global speed, time scrub. Target **60 fps at 20,000 marks**.
7. **Presets:** Sinky Meter, Amaya Flow, Barcode, Threshold Stripes, Halftone Diagonal, Contour Field, Strands,
   Kaleido Pixels, RFD Stack. Also: Randomise all, Randomise within preset (±15%), Reset. Everything is seeded.
8. **Canvas & export:**
   - Formats: 1:1, 4:5, 16:9, 9:16, 1920×1080, A4 portrait, LinkedIn banner 1584×396, custom.
   - PNG at 1×/2×/4× (re-rendered offscreen).
   - SVG with grouped layers (background, track, fill, cap, accent).
   - Preset JSON export/import, localStorage presets and copy to clipboard.
   - 5 s WebM via MediaRecorder.
   - **File names:** `OneSyntax_Pattern-PresetName_seed.png` (same base name for svg/json/webm).
9. **UI:** canvas on the left; Tweakpane on the right with folders Preset, Field, Shaping, Layout, Marks, Mappings,
   Colour, Motion, Export. Instrument Sans for UI text, JetBrains Mono for numbers. A status line shows the seed and
   mark count.

**Quality bar:** field and geometry are pure functions, separate from rendering, so the same parameters always
give the same output on screen, in PNG and in SVG. Render every preset to `./out` and **look** at the PNGs before
calling anything done.

---

## 3. Architecture

```
Params ──► field.ts   buildField(p)        → FieldSampler { value, raw, gradient, attractorBend }
       ──► layout.ts  buildLayout(p)       → Cell[]   (memoised; constant during animation)
       ──► marks.ts   buildGeometry(p, t)  → Geometry  ← THE single source of truth
                              │
                ┌─────────────┼───────────────────────┐
           renderer.ts    svg.ts                export.ts
           WebGL2 SDF     geometryToSVG         PNG (renderToPNG) / SVG / JSON / WebM / localStorage
```

| File | Role |
|---|---|
| `src/types.ts` | **The contract.** Full `Params` schema (ranges in comments) and every module interface. Read first. |
| `src/defaults.ts` | `defaultParams()`; `withDefaults(partial)` deep-merges any partial/old JSON onto defaults |
| `src/util.ts` | Seeded `rng` (mulberry32), `hash01`, clamp/lerp, hex↔rgb, `sampleStops` |
| `src/field.ts` | Scalar field: components, shaping, attractor, noise, data series |
| `src/layout.ts` | Cell centres for every layout mode, with jitter and rotation |
| `src/marks.ts` | Mappings → packed instance buffer; meters; strands; flow lattice; seam bleed |
| `src/renderer.ts` | WebGL2 instanced SDF renderer; tiled offscreen PNG export; context-loss recovery |
| `src/svg.ts` | Layered SVG; every mark is a `<path>` in absolute canvas coordinates |
| `src/presets.ts` | `PALETTES`, `FORMATS`, `PRESETS`, `RANGES`, `randomiseAll`, `nudge`, `applyPalette`, `applyFormat`, `fileBase` |
| `src/ui.ts` | Tweakpane panel (binds directly to the live `params` object) |
| `src/main.ts` | App shell, render loop, keyboard, status line, `window.__osp` check hook |
| `src/export.ts` | Downloads, JSON import/export, clipboard, localStorage (`osp.presets.v1`), WebM |
| `src/style.css`, `index.html` | Theme and fonts |
| `scripts/render-presets.mjs` | `npm run check`: Vite + headless Chrome → `./out/*.png|svg` |
| `refs/` | Reference images (copied in so the project is self-contained) |

---

## 4. Rules and conventions (don't break these)

### Determinism
- **Never use `Math.random()`** in field, layout, marks or presets. Use `rng(seed)` or `hash01(seed, index, salt)`
  from `util.ts`. (`newSeed()` in the UI uses `crypto` only to pick a new seed number; the pattern itself is
  seeded.)
- **Time:** `params.motion.time` is effective seconds. The loop does `time += dt * motion.speed` while playing;
  scrubbing sets it directly. Every output calls `buildGeometry(params, params.motion.time)`.

### Units
- **Schema:** angles are in **degrees**. Geometry instances store **radians**.
- **Field coordinates:** normalised `(u, v)` 0..1, y down. Internally, aspect-corrected: the shorter side = 1, so
  `freq` = cycles across the shorter side.
- **Mapping sizes:** fractions of the cell's available size, after gutters.
- **Geometry:** logical canvas px. The renderer scales by pixelRatio; exports scale by 1/2/4.

### Instance format (`STRIDE = 16` floats, offsets in `I`)
`CX CY HW HH ANGLE SKEW RADIUS R G B A LAYER CONT SHAPE 0 0`

- **Local box:** x ∈ [−HW, HW] is the mark's long axis; y ∈ [−HH, HH] is its thickness.
- **Transform order:** shear `x' = x + SKEW·y`, then rotate by ANGLE (positive = **clockwise** on screen, y down),
  then translate. SVG equivalent: `translate(cx cy) rotate(deg) skewX(atan(skew)°)`.
- **Corner radius:** clamped to min(HW, HH), applied before the shear.
- **Colour:** sRGB 0..1 (hex/255), not premultiplied. Blending happens in sRGB, both in GL and in SVG.
- **Columns and meters:** base angle +π/2, emitted with HW along the vertical; axes are never swapped.

### Layers (SVG group names)
background · track · fill · cap · marks · strands · accent.

- **Meters:** emitted as ALL tracks, then ALL fills, then ALL caps.
- **Accented meters:** fill and cap are tagged Accent.
- **Strands:** WebGL draws capsule segments (Layer.Strand); SVG skips those and draws each `geometry.strands[i]` as
  one ribbon path.

### Continuous gradient (GL and SVG must match)
- **Linear:** t runs 0..1 across the canvas along `gradAngle`, using the min/max of the 4 projected corners.
- **Radial:** t = distance from the centre / half-diagonal.
- **Repeat:** a mirrored triangle wave (`spreadMethod="reflect"` in SVG).

### Buffer reuse
`buildGeometry` returns **views into pooled buffers**, and the next call overwrites them. Consume immediately, or use
`cloneGeometry()` to keep one.

### Params mutation in the UI
Tweakpane binds to one live `params` object. Presets, randomise and import copy new values **into** it with
`deepAssign`; never replace nested objects, or the bindings go stale.

### Changing the schema
1. Add the field to `types.ts` (with its range comment) and to `defaults.ts`.
2. Add it to `RANGES` in `presets.ts` if it's numeric.
3. Add a control in `ui.ts`.
4. Add a line to `README.md`.

Old JSON still loads thanks to `withDefaults`.

---

## 5. Decisions that differ from the literal brief (deliberate)

1. **Mirror runs before warp.** Folding the coordinates first is what makes the symmetry exact. Full order:
   mirror → warp → components → contrast → bias → attractor → quantise → invert.
2. **Contrast above 1 is a smooth tanh S-curve**, not a linear clamp. This gives smooth S-bends (Strands / Deakin)
   instead of hard corners. Contrast ≤ 1 is linear.
3. **Attractor bend** comes from a softened stream function `ψ = y·(1 − 0.95·R²/(r²+R²))`. It is smooth everywhere,
   with no flips at the centre. Bend = 1 is about 48°; Amaya uses 0.45 (about 22°), matching the reference.
4. **Flow angle mode** reads a structure tensor sampled on a lattice (at most 128 points on the long side) and blurred
   3×3. This avoids 90° flips on ridges and valleys, and costs about one field sample per lattice point.
5. **Layout rotation isn't added in flow and swirl modes**, because those marks follow absolute field directions.
6. **Seam bleed:** opaque, axis-aligned marks that fill their cell on a gutterless axis get 0.5 px of overlap. This
   removes antialiasing hairlines between touching marks (Kaleido, Barcode blocks).
7. **Grid marks:** length runs along the cell width and thickness along the cell height. Barcode therefore uses
   unrotated rects with a field-driven length.
8. **Opacity below 1 on strands:** WebGL shows slightly darker joins between segments. SVG is exact.

---

## 6. Brand palettes (in `PALETTES`)

| Name | Background | Stops | Accent |
|---|---|---|---|
| Signal | #FAFBFD | #151515 | #F76E43 |
| Azure | #E8F4FF | #1B98FE → #A2D5FF | #1B98FE |
| Night | #082A6F | #1B98FE → #A2D5FF | #F76E43 |
| Meter | #151515 | #F76E43 → #5F6470 | #F76E43 |
| Heritage | #151515 | #00BCEA | #F76E43 |
| Action | #FFFFFF | #0A64C2 | #F76E43 |

(Check `src/presets.ts` for the exact stops; it is the source of truth.)

---

## 7. References (`refs/`)

| File | Reference | What it teaches / which preset |
|---|---|---|
| `image 231.png` | **Sinky tag (HERO)** | Track + fill rising from the bottom + cap; orange → slate. **Sinky Meter** |
| `image 234.png` | **Amaya headshot (HERO)** | Dash rows bending around the subject (attractor bend). **Amaya Flow** |
| `file-b91f….png` | Shape Therapy barcode | Bars of varying width merging into blocks. **Barcode** |
| `file-2ec4….png` (= `Screenshot 2026-10-02 145444.png`) | Threshold Generator | Control philosophy: few controls, rich output |
| `image 233.png` | Gradient stepped bars | **Threshold Stripes** |
| `file-cb46….png`, `file-f2aa….png` | Diagonal halftone | Strokes thickening along a gradient. **Halftone Diagonal** |
| `file-64ee….png` | Holst poster | Dashes following a smooth field. **Contour Field** |
| `file-a155….png` | Deakin poster | Lines displaced sideways by a wave. **Strands** |
| `image 229.png` | Pixel kaleidoscope | XY-mirrored blocks. **Kaleido Pixels** |
| `image 228.png` | Rows of dashes, varying density | Oxide RFD-style bars. **RFD Stack** |
| `file-b26a….png` | Red skew poster | Parallelograms in staggered rows (brick + skew) |
| `image 227.png`, `image 230.png`, `image 235.png`, `image 232.png` | Misc. | Bar gradients, brick rects, dense dashes bending, pixel motif |

Note: early notes had the image numbers off by one (Sinky is **231**, the kaleidoscope is **229**). This table is
correct.

---

## 8. Verified state (2026-10-02)

- `npm run typecheck`, `npm run build` and `npm run check` all pass. All 9 presets were rendered and visually
  reviewed against their references after the fixes in section 5.
- **Performance at ~20,000 marks** (geometry + GPU draw, synced, Intel UHD laptop): fixed 4.6 ms, value 4.2 ms,
  flow 6.8 ms per frame. Well inside 60 fps.
- **PNG:** the 1×, 4× and tiled renders are pixel-identical. A 4× export of 1920×1080 (7680×4320) takes about 0.7 s.
- **SVG:** about 3.4 MB for 20k rounded marks; layers are named correctly (e.g. Sinky: background, track, fill, cap).
- **Also tested in Chrome:** WebM export, PNG/SVG/JSON downloads with correct names, the keyboard shortcuts and the
  URL params.

## 9. Open decisions / known limitations

- **Meter palette midtones:** #F76E43 → #5F6470 passes through a dusty mauve, while the Sinky tag passes through
  tan. OKLab blending barely helps; the cause is the two brand colours. Option: add a warm-neutral 3rd stop (a brand
  decision).
- **Threshold Stripes:** has a deliberate 4% row gutter. Set Gutter Y to 0 for touching bars like `image 233`.
- **Value noise:** a single octave can show lattice-aligned creases in flow mode. Use 2+ octaves (presets do).
- **Strands:** semi-transparent strands show darker joins in WebGL only.

## 10. Ideas for next steps

- A warm 3-stop Meter palette variant, after brand sign-off.
- An image or SVG mask as an attractor (bend around a real silhouette, e.g. a headshot cut-out).
- Data series: CSV upload and multiple series (one per row).
- A seamless-loop option (time wraps at `loopSeconds` with periodic speeds) for perfect WebM loops.
- Batch export: every preset × every format in one click.
- `git init` and commit. The project is not under version control yet.

## 11. How to add a preset

Add an entry to `PRESETS` in `src/presets.ts` with only the fields that differ, and add its name to `PRESET_NAMES`:

```ts
'My Preset': withDefaults({
  name: 'My Preset',
  seed: 12345,
  field: { waveA: { on: true, weight: 1, freq: 3, dir: 30, phase: 0, speed: 0.1 } },
  layout: { mode: 'grid', cols: 30, rows: 30 },
  colour: { ...paletteFor('Azure') },
  canvas: canvasFor('1:1'),
}),
```

Or design it in the UI, use **Export JSON**, and paste the object in. Then run `npm run check` and look at
`out/My-Preset.png`.

---

## 12. Resuming with Claude Code

Open the project folder and start with:

> Read `PROJECT.md`, `README.md` and `src/types.ts`. This is the OneSyntax pattern generator. Then [your task].
> Keep field and geometry pure and seeded, keep GL and SVG matching, and after any visual change run
> `npm run check` and look at the PNGs in `./out` before saying it's done.
