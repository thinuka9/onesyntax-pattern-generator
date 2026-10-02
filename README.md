# OneSyntax Pattern Generator

A local WebGL2 tool for generating OneSyntax brand patterns, built at Haux Studio. Every pattern is a pure
function of one parameter object and a time value. The same parameters and time always produce the same
marks on screen, in PNG, in SVG and in WebM.

## Install and run

```bash
npm install        # Vite, TypeScript, Tweakpane, playwright-core (dev)
npm run dev        # http://localhost:5173 — the generator
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run check      # renders every preset to out/<Preset-Name>.png + .svg and fails on errors / blank renders
```

`npm run check` starts its own Vite server on port 5180. It drives the system Chrome headless through
playwright-core and falls back to Edge. Set `CHROME_PATH` to use another Chromium build. `CHECK_TIME` (default 2 s)
and `CHECK_SCALE` (default 1) control the render. It logs the mark count, render time and ink coverage for each
preset, and it prints any page errors.

## Architecture

```
Params ──► field.ts   buildField    scalar value(u, v, t) 0..1 + gradient + attractor bend
       ──► layout.ts  buildLayout   cell centres (grid / brick / columns / rows / strands)
       ──► marks.ts   buildGeometry one instance per drawable box (+ strand paths)  ← single source of truth
              ├─► renderer.ts  WebGL2 instanced SDF quads (screen, offscreen PNG, WebM frames)
              └─► svg.ts       layered SVG (background, track, fill, cap, accent, marks, strands)
```

- `src/types.ts` holds the full `Params` schema and the module contracts. Angles are in degrees. Field
  coordinates are normalised (y down). Mark sizes are fractions of the cell pitch.
- `src/defaults.ts`: `defaultParams()` and `withDefaults(partial)`, which deep-merges partial or old JSON onto
  the defaults.
- `src/presets.ts`: palettes, formats, the named presets, randomise / nudge and file naming.
- `src/ui.ts` + `src/main.ts`: the Tweakpane panel, render loop, shortcuts, status line and the `window.__osp`
  check hook.
- `src/export.ts`: PNG / SVG / JSON / clipboard / browser-saved presets / WebM.
- Nothing calls `Math.random()`. All randomness is seeded through `util.rng` / `util.hash01`.

## Controls

The canvas fills the left side and the panel sits on the right. Ranges below are the slider ranges.

### Preset
- **Preset**: load one of the named presets (see below).
- **Palette**: apply a OneSyntax palette (background, stops and accent).
- **Seed**: global seed. Drives noise permutation, jitter and random colours.
- **New seed**: pick a fresh seed and keep everything else.
- **Randomise all (R)**: a new random pattern. It uses a random preset as a skeleton and keeps the current
  canvas size.
- **Randomise within preset**: nudge every numeric value by up to ±15 % of its range.
- **Reset to preset**: reload the current preset and discard your edits.
- **Save as / Save to browser / Saved / Load saved / Delete saved**: named presets in localStorage.

### Field
The scalar field is the weighted average of the enabled components. Every component has **On** and
**Weight** (0..1).
- **Wave A / Wave B**: plane waves.
  - **Frequency** (0..20 cycles across the shorter side)
  - **Direction** (0..360°, 0 = +x, 90 = down)
  - **Phase** (0..1)
  - **Speed** (−2..2 cycles/s)
- **Radial**: concentric rings.
  - **Centre X / Y** (0..1)
  - **Rings** (0..20 across the shorter side)
  - **Speed** (−2..2, positive moves outward)
- **Noise**: fbm value noise.
  - **Scale** (0.2..12 features across the shorter side)
  - **Octaves** (1..6)
  - **Drift** (0..2 noise units/s)
- **Data**: a seeded random walk, or numbers you paste in.
  - **Values**: e.g. `12, 18, 9, 22`. When parseable, these override the walk.
  - **Axis**: one value per column (x) or per row (y).
  - **Data seed**
  - **Smoothing**: 0 = stepped, 1 = smooth.
  - **Trend** (−1..1)
  - **Volatility** (0..1)
  - **Scroll speed** (0..2)
- **Gradient**: a linear ramp.
  - **Angle** (0 = left→right, 90 = top→bottom)
- **Attractor**: a point that pushes field values and bends mark angles around itself.
  - **Centre** (x, y)
  - **Radius** (0..1 of the shorter side)
  - **Strength** (−1..1, raises or lowers the value inside the radius)
  - **Bend** (0..1, angle deflection like flow around an obstacle)

### Shaping
Shaping is applied in this order: mirror → warp → combine → contrast → bias → attractor → quantise → invert.
- **Warp amount** (0..0.5) / **Warp scale** (0.2..12): noise domain warp.
- **Mirror**: None / X / Y / X + Y. Folds the coordinates around the centre for exact symmetry.
- **Contrast** (0..4, 1 = neutral, pivots at 0.5). Below 1 flattens; above 1 is a smooth S-curve, so transitions sharpen without hard corners.
- **Bias (gamma)** (0.1..5, `v = v^bias`, 1 = neutral).
- **Quantise** (0..32 steps, 0 = off).
- **Invert**.

### Layout
- **Mode**:
  - **grid**
  - **brick**: grid with odd rows offset.
  - **columns**: one full-height mark per column.
  - **rows**: one full-width mark per row.
  - **strands**: continuous lines displaced by the field.
- **Columns / Rows** (1..400).
- **Margin** (0..0.45 of the shorter side, on all sides).
- **Gutter X / Gutter Y** (0..0.95 of the cell left empty).
- **Jitter** (0..1 of a cell, seeded).
- **Rotation** (−180..180°, the whole layout).
- **Brick stagger** (0..1 of a cell, brick mode only).
- **Anchor** (start / center / end): where marks sit along their length. Columns: start = top. Rows: start = left.
- **Strand axis** (vertical / horizontal), **Strand samples** (8..400 points per strand), **Strand amount**
  (0..2, sideways displacement in cell pitches).

### Marks
- **Shape**:
  - rect
  - pill
  - parallelogram
  - line
  - dot
  - meter: track + fill + cap, the Sinky look.
- **Corner radius** (0..1 of half the thickness, 1 = fully round).
- **Skew** (−75..75°, base skew; the Skew mapping adds to it).
- **Meter**:
  - **Track width** (0..1 of the cell width)
  - **Track opacity** (0..1)
  - **Fill width** (0..1 of the cell width)
  - **Cap size** (0..1 of the cell width, cap height)
  - **Cap offset** (0..1 of the column height above the fill)
  - **Cap follows wave**: the cap rides its own wave instead of sitting above the fill.
  - **Cap wave freq** (0..10)
  - **Cap wave speed** (−2..2)

### Mappings
Each mapping turns a source value `s` (0..1) into `min + (max − min) · s`. The **Source** is one of:
- field
- x
- y
- radial
- const (`s = 1`, so the value is **Max**)

Controls:
- **Threshold** (0..1): hide marks whose field value is below it, which gives barcode-style gaps.
- **Angle mode**:
  - **Fixed**: base angle.
  - **From value**: the Angle mapping.
  - **Flow (contours)**: marks follow the field's contour lines (read from a blurred structure tensor, so ridges and valleys stay continuous).
  - **Swirl**: marks run tangent around the attractor or the centre.
- **Base angle** (−180..180°): the fixed angle, also added to flow and swirl.
- **Thickness** (0..1.5 of the cell pitch across the mark).
- **Length** (0..3 of the cell pitch along the mark; in columns / rows, a fraction of the full span).
- **Angle** (−180..180°, used by "From value").
- **Opacity** (0..1).
- **Colour position** (0..1 position on the colour gradient).
- **Offset X / Offset Y** (−1..1 of the cell).
- **Skew** (−75..75°).

Grid convention: **Length** always runs along the cell's width and **Thickness** along its height. For example,
an unrotated rect with a field-driven Length draws vertical barcode bars.

### Colour
- **Palette**: the same picker as in Preset.
- **Background**.
- **Stops**: 2 or 3, edited with **Stop 1 / 2 / 3**.
- **Colour by**: Field / X position / Y position / Radial / Random. This sets the per-mark gradient position,
  through the Colour position mapping.
- **Screen gradient**: colour by screen position in the shader instead of per mark.
  - **Gradient angle**
  - **Gradient repeat** (1..12 mirrored repeats)
- **Accent**: accent colour.
  - **Accent every** (0 = off; every Nth item)
  - **Accent target** (Mark / Column / Row)

### Motion
- **Playing (space)**.
- **Speed** (0..4 global time multiplier).
- **Time (s)**: scrub.
- **Loop length (s)**: WebM duration, 5 s by default.

### Export
- **Format**: 1:1 1080×1080 · 4:5 1080×1350 · 16:9 1600×900 · 9:16 1080×1920 · 1920×1080 ·
  A4 portrait 1240×1754 · LinkedIn banner 1584×396 · custom.
- **Width / Height**: editing either one switches the format to custom.
- **PNG scale**: 1× / 2× / 4×. The canvas is re-rendered offscreen at that scale, not upscaled.
- **Save PNG (S)**, **Save SVG**: layered SVG with groups background / track / fill / cap / accent / marks / strands.
- **Export JSON / Import JSON / Copy JSON**: the complete parameter object.
- **Record WebM**: records the loop length in real time with MediaRecorder.

## Keyboard
| Key | Action |
| --- | --- |
| Space | play / pause |
| R | randomise all |
| S | save PNG |

Shortcuts are ignored while a text field has focus.

## File naming
`OneSyntax_Pattern-<Preset-Name>_<seed>.<png|svg|json|webm>`. Spaces in the name become hyphens and other
characters outside `A–Z a–z 0–9 -` are dropped. Example: `OneSyntax_Pattern-Sinky-Meter_23021.png`.
Randomised patterns are named `Random`.

## Palettes
| Name | Background | Stops | Accent |
| --- | --- | --- | --- |
| Signal | #FAFBFD | #151515 | #F76E43 |
| Azure | #E8F4FF | #1B98FE → #A2D5FF | #1B98FE |
| Night | #082A6F | #1B98FE → #A2D5FF | #F76E43 |
| Meter | #151515 | #F76E43 → #5F6470 | #F76E43 |
| Heritage | #151515 | #00BCEA | #F76E43 |
| Action | #FFFFFF | #0A64C2 | #F76E43 |

## Presets
| Preset | Reference | Idea |
| --- | --- | --- |
| Sinky Meter | Sinky tag | Columns of meters; downward-trending data series; orange → slate across columns |
| Amaya Flow | Amaya headshot | Rows of short dashes on light blue, bending around an attractor |
| Barcode | Shape Therapy | 32×7 vertical bars; the widest merge into solid blocks |
| Threshold Stripes | image 233 | Full-width rows with stepped lengths and a repeating screen-space gradient |
| Halftone Diagonal | diagonal halftone | Up-right strokes joining into diagonals, thickening toward the bottom-left |
| Contour Field | Holst poster | Short dashes following the field's contours, coloured by value |
| Strands | Deakin poster | Vertical lines kinked along a diagonal, thicker to the right |
| Kaleido Pixels | image 229 | XY-mirrored pixel blocks in blues and cyan |
| RFD Stack | Oxide RFD | Stepped horizontal bars like an ASCII bar chart; every 6th row in orange |

## How to add a new preset
1. **Design it in the UI**, then use **Export JSON** (or **Copy JSON**).
2. Add an entry to `PRESETS` in `src/presets.ts`. Either paste the JSON, wrapped as `withDefaults(<json>)`, or
   write only the fields that differ from `defaultParams()`:
   ```ts
   'My Pattern': withDefaults({
     name: 'My Pattern',
     seed: 12345,
     field: { waveA: { on: false }, noise: { on: true, weight: 1, scale: 3 } },
     layout: { mode: 'brick', cols: 30, rows: 30 },
     map: { thickness: { source: 'field', min: 0.2, max: 0.8 } },
     colour: { ...paletteFor('Night'), source: 'field' },
     canvas: canvasFor('4:5'),
   }),
   ```
   Wave A is on by default, so switch it off if you don't want it.
3. Add the name to `PRESET_NAMES` in the order it should appear in the panel.
4. Run `npm run typecheck` and `npm run check`, then look at `out/My-Pattern.png`.
