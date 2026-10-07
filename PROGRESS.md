# Progress

## Status (5 October 2026)

The OneSyntax Pattern Generator (`index.html`) is the product. It lives in
`Dropbox\HAUX STUDIO\PROJECTS\ONESYNTAX REBRAND\PLUGIN\OneSyntaxPatternGenerator` and on GitHub at
[thinuka9/onesyntax-pattern-generator](https://github.com/thinuka9/onesyntax-pattern-generator) (`main`, private),
where it replaced the original TypeScript/Vite studio. That studio stays in the repository's history and in
`PLUGIN\_archive\OneSyntaxPatternGenerator-archive-2026-10-03.zip`, together with its build output, test scripts,
exported proofs and the earlier "classic" page. `PLUGIN\_archive\Archive.zip` holds the earlier generator projects
(claude-generator, codex) as they came off the Mac.

Live at https://onesyntax-pattern-generator.pages.dev (Cloudflare Pages, redeployed on every push to `main`, comments
stripped by `build.mjs`). 13 patterns, 45 built-in presets (7 October: Gauge, Barcode, Threshold Stripes and Strands retired; Readout and Silhouette added; old saves of the retired ones open in their replacements).

**Not done yet**

## Built so far

### Generator
- **Wave Rows:** rows of items with opacity and size driven by a sine wave: rows, items, gaps, roundness,
  frequency, phase, row shift, sharpness.
- **Studio patterns:** the original studio's nine presets, ported from TypeScript to plain JavaScript with
  identical geometry, each with a short set of tailored controls instead of the full parameter list. Refactor
  (Eddy) twists a 22 × 12 bar grid round a quiet centre: angle 90° ± 60° times the attractor bump
  (1 − d²/R²)², easing to nothing at radius R.
- **Orbit, Grid layout** (preset Event Loop; the Horizon pattern until 5 October, Vector Field before that; saves under
  either name open as Orbit in this layout, its settings kept under `grid`, colours and format shared): a
  direction-field plot. Each dash lies along F(x, y) = cos α·⟨−y, x⟩ + sin α·⟨x, y⟩ from the centre,
  normalised: α = 0 is the rotation field (circles), ±90° a source or sink, spirals between. The field sits on
  a plane receding towards the top (x = middle + X·near, y = lift·e^Z − lift, lift = 0.04 + 4(1 − depth)²,
  near = (bottom + lift) / stretch), sampled by rows evenly spaced in Z and columns spaced out from the centre's
  x by a gap that narrows by h = √((y + lift) / (bottom + lift)).
  - Dash length: the bottom row's column gap less Dash gap, one length on the plane (F normalised), softened to
    F / √(|F|² + c²) inside a core c dash lengths wide (Core, default 2): a vortex core, so the dashes nearest
    the centre shrink to dots instead of crossing.
  - Overlap: each dash is cut back to its cell along its own direction, room = (1 − Dash gap) /
    max(|uₓ| / g, |u_y| / p) × (1 + 3·Overlap), with g the row's column gap and p its row pitch (cellZ·(y + lift)).
    0 never crosses a neighbour; 1 lets the top run into continuous lines. Event Loop uses 0.15.
  - Thickness: (1 − Row gap) × √(p × bottom column gap), so dashes thin as the rows close in.
  - Roundness: corner radius = Roundness × thickness / 2 (1 is the old pill). Opacity scales every dash.
  - Motion: a wave (sine, or the Fourier triangle, square or sawtooth with chosen harmonics) through the dash
    lengths (Ripple outward, Sweep round) or through α (Twist, ±90° × Strength), whole cycles per loop.
  - Older saves sized dashes by length and thickness; `sanitizeVector` converts them exactly:
    Dash gap = 1 − length, Row gap = 1 − thickness·√(column gap / (cellZ·near)).
- **Orbit, Arcs layout** (presets Event Stream, the studio's "01" and Orbit's default, and Event Queue): the client's arcs rebuilt as an
  array of ellipses with curved dashes following each one.
  - Lines: ellipses x = c_x + r·stretch·cos t, y = c_y + r·sin t (rotated), whose centre shifts with size,
    c(r) = C + D·r. The line through a point solves ((l_x − D_x r)/s)² + (l_y − D_y r)² = r², a quadratic in r. The
    shift is held to (D_x/s)² + D_y² ≤ 0.9 so the lines stay nested.
  - Sizes: r = r_in + (r_out − r_in)·(e^{c·x} − 1)/(e^c − 1), x = (k + ½)/N (Crowding c); r_out covers every corner.
  - Depth: the lines lie on a plane receding to the top, page y = lift·e^{Y·n} − lift, lift = 0.04 + 40(1 − depth)³.
  - Dashes: laid along each line's arc length (one table of the unit ellipse per stretch, scaled), spacing
    S = spacing·(r / r_out)^growth, one Dash length, centred at (i + k·bend) spacings from the line's point facing
    the page's middle. Lines whose far side shows on the page close their count evenly instead (no seam). Each
    dash is drawn as 2–12 overlapping round pieces so it curves with its line.
  - Thickness: Thickness·√(line spacing × mean spacing), the line spacing measured across the stretch (× √stretch),
    capped at 0.9 × line spacing and 0.6 × dash length (the dash itself at 0.95 × its spacing); Roundness rounds
    the ends, Taper thins them. Saves from the Horizon days carried Row gap: Thickness = 1 − Row gap.
  - Fitted to the reference (539 detected strokes, directions from second moments): one shared centre fits the
    stroke directions to 19° RMS; a shifting centre to 7.3°; shifting centre on a receding plane to 4.9°
    (stretch 2.414, D = (−0.882, 0.401), rotation 9.4°, lift 0.42, centre (−0.057, −0.141) on the plane). Line
    spacing on the reference's left edge runs 9.5 → 69 px, linear in y; fitted line for line: 73 lines,
    Crowding 1.36, Centre gap 1.4%, within 0.29 of a line spacing. Dash length 0.055 of the short side, spacing
    0.147 × (r / r_out)^0.35. Bend 0.5 chosen by eye (the reference's per-line offsets are too noisy to measure).
    Still short: the reference packs its finest lines tighter along the top right (parked; see MEMORY).
  - Motion: Flow slides the dashes one spacing per loop; Sway rocks the bend by ±Strength/2.
- **Centre handle:** Orbit (each layout its own centre) and Eddy (so Refactor) show their centre on the artwork on hover: rings round
  a knob that drags it, snapping within 10 px to the edges and middle (Alt drags freely); arrow keys nudge it
  (Shift for 10%), double-click returns it to the preset. Orbit's centre is measured inside the margin; Eddy's
  attractor across the whole canvas.
- **Orbit additions (5 October):** Thickness (a share of the gap between lines) and Roundness for the arcs; Pulse
  for both layouts, read once per dash at its middle and applied to the whole dash (a fade mixes the dash towards
  the flat background, so its overlapping pieces stay even). Margins now cut cleanly: a pattern can give a frame
  (`geometry.clip`) that the GPU scissor, the canvas drawing, SVG and animated SVG all clip to.
- **Interface (5 October):** the artwork arrows, ← → and the dots step through the current pattern's presets
  only (saved first), and hide when there is just one; the shuffle button picks another pattern at random, one
  of its presets, and a random seed (new colours and settings) at the current format, while the seed dice remixes
  within the pattern; the Pattern menu shows each pattern's first preset as a preview.
- **Orbit vector files (5 October):** the SVG export draws each arc dash as one closed path (its two edges as
  Catmull–Rom curves written as cubic Béziers, joined by caps of two quarter-ellipse curves sized by Roundness),
  grouped by colour, numbers relative to the pen (rounded steps, so no drift): half the size of the old
  piece-by-piece file. In the app, a tapering dash now gets 3 + 7 × Taper pieces so its outline matches the file.
  The animated SVG for Flow (no Pulse) slides each dash along its line instead: a translate and a rotate through
  4 points per spacing, and its outline eased from its shape at the start to the shape a dash has at the end;
  every dash ends where another began, so it loops without a seam, and it opens on the first frame for design
  tools. Event Queue 0.79 MB (was 2.6), Event Stream 0.37 MB (was 1.35). Pulse joined it later (below).
- **Orbit Sway animated SVG (5 October):** each dash rides its own line too, once per sway, however many sways a
  loop holds: line k's dashes rock ±k × Strength / 2 spacings, a sine in arc length on the plane.
  - Track: `animateMotion` (rotate auto) along cubics through the line, handles from its tangent, halved wherever
    one strays more than 0.35 px from the line (only where it can show: on the page or within a dash length).
  - Timing: `keyPoints` are distances along the track as drawn (the browser's measure, so a rough off-page stretch
    shifts nothing), and between keys a `keySplines` cubic matches the sine's pace at both ends (x handles at ⅓ and
    ⅔, y = pace / span / 3), so the plane's depth, which speeds a dash up sharply as it swings out of the distance,
    is followed exactly. Keys start at the quarters (the turning points) and are halved, to 1/256 of a sway,
    wherever position, length or thickness strays past tolerance while the dash shows.
  - Shape: the first-frame outline, stretched along and across (`scale`, on the same keys) by the dash's length and
    middle thickness. A shape morph, keyed or not, cost more than the old file; bend is the residue (Event Queue:
    median 1.1 px, 90th percentile 3.6 px, mostly the small tight dashes at the top left).
  - The group's pose is the first frame for design tools; a frozen `translate(0 0)` clears it in browsers. One
    sway's `dur` keeps six decimals (10 s / 3 rounded to 3.3 s drifted off the loop).
  - Event Queue 2.9 MB (was 5.8), Event Stream 0.71 MB (was 2.27); Strength 1: 8.1 MB (was 11.5–14.6). Size no
    longer grows with Speed, and it builds faster (0.4–1.9 s).
- **Readout (7 October, replaced Barcode), after the RFD cards:** rows of cells, each a glyph by its level in a
  field: nothing, a dot, a dash, a double dash or a solid bar (bars run together into blocks), or pixel digits (a 1,
  a 0 or a dot). The level is a slope across the grid plus a wave down it plus a seeded grain, through Contrast;
  Mirror folds it about the middle; Speed sends the wave through. Presets Query, Binary, Topology, Minibar (brand
  colours, so violet and blue rather than the cards' green).
- **Silhouette (7 October, replaced Threshold Stripes), after Vonyes and One Grove:** stripes across (or down) the
  page that break round a shape, each stripe cut where it crosses the shape so the edge steps; inside, the stripes
  become bars in the second colour, shift half a stripe (stairs) or leave a gap. Shapes: the symbol's base (the
  sticker's cut-corner square), V, steps, diamond, circle. Motion breathes or drifts the shape. Presets Interface,
  Merge (Vonyes), Branch (One Grove).
- **Stack (7 October):** Deploy leads it; Call Stack, Buffer and Register are gone; Release and Cache follow the two
  violet slanted-bar references (shaded across the grid; dense and see-through). Strands is removed.
- **Bars follow the grid (7 October):** `layout.fitWidth`/`fitHeight` keep each preset's own cell as the reference, so
  margins and more columns or rows shrink the bars rather than overlapping them. Sliders stretch to include the
  current and preset values, so a value past the usual range no longer snaps back.
- **Sticker, matched to Figma (7 October):** the outline, band and type now come from the Figma "Sticker" frame
  (421 units): corners cut 142.52 (33.86%), 32 margins, the brand {OS} monogram file 39 tall top right, title Geist
  Medium 40 at −4% and subtitle Geist Mono 32 at −4% and 64% in 125% line boxes (baselines measured from the fonts),
  and a fixed band at y 143, 135 tall, the pattern edge to edge in it (no margin of its own). Colours are the file's
  five stickers (Blue, Violet, Grey, Black, White), each with its fill, inks and the colour the pattern is drawn in
  (`stickerState`); Shuffle colours and the header dice roll one. Pattern on/off makes plain stickers. The adjustable
  band, corners and free sticker colour are gone. Fixed: turning the sticker off left its canvas covering the pattern
  (`display: block` beat `hidden`).
- **Sticker (7 October):** any pattern can be shown as the {OS} sticker (Sticker section, on every pattern): the
  square with its top-left and bottom-right corners cut (Corners, a third of the side by default, from the Figma
  stickers), a brand colour, {OS} top right and an editable title (Geist 500) and subtitle (Geist Mono) bottom left in
  an ink that suits the colour (dark on light, soft dark on mid greys, light on dark), and the pattern masked into a
  band (Pattern top and height) at its own format, scaled to cover the band, on the sticker's colour or its own
  background (Behind pattern). Settings live in `values.sticker` (`sanitizeSticker`), so saves, links and undo keep
  them; built-in presets have none, so loading one keeps the sticker, and the sticker never counts as an edit.
  - Preview: a 2D canvas over the pattern view, always fitted, on a neutral grey page (`STICKER_PAGE`).
  - Exports: PNG and video paint the same way (`drawSticker`); SVG and animated SVG nest the pattern's own file as an
    inner `<svg>` covering the band, cut to the outline and band, with the outline and text round it. Transparent
    leaves the page round the outline empty. `check.mjs` covers the link round trip and all three file exports.
- **Render redone (7 October):** the scan's blue sweep over grey lines was not liked; Render is now Loop's calm in the
  brand's line version: a 3 × 3 grid on Mono Dark, a slow ripple (speed 0.5) that changes size only.
- **Reference presets (7 October):** Deploy (Stack, after a lanyard badge: seven columns of slanted bars in Coral's
  orange and white; Parallelogram marks stood on end so their sides stay upright, columns stepped by an x offset) and
  Branch (Strands, after the One Grove card: eight thick square-ended bars mirrored about the middle, a stepped
  notch down the centre). `layout.fit` now grows a bar's length along its own direction and its thickness across it,
  so upright bars widen with wider cells too. Hairlines take Roundness (square ends by default). Barcode gets
  Rotation.
- **Strands reworked (7 October), after the AlphaSense card:** the engine's new `Hairlines` layout draws each row as a
  thin line only where the field reaches the threshold (Edge), each unbroken run one mark coloured and faded by its
  mean value, so lines start and break along the field's contour. A slope (gradient) plus a long low wave across the
  rows makes the wavy edge; a fine second wave across the rows staggers each line's start (Breaks). Rotation turns
  it (Threads at −35°, Protocol −45°, Socket 90°). Saves of the old wavy strands open as Threads in their own
  colours and format.
- **Kaleido Pixels moves (7 October):** its three presets were still (Speed 0), so nothing happened; Recursion and
  Mutex now move at 0.5 and Kernel at 1, the mirrored waves folding into a turning kaleidoscope, and Kernel is in
  Coral instead of Ember's orange and grey. Every control was checked to change the picture.
- **Rotation and fit (7 October):** Threshold Stripes and Stack have a Rotation control. The engine lays the grid
  out in a frame turned by `layout.rotation` about the centre and sized to cover the page once turned (at 90° a
  16:9 page lays out as 9:16), so a turned pattern fills every format; at 0° the frame is the page, so every other
  pattern draws as before. With `layout.fit` (on for both patterns' presets) bar lengths scale with the cell's width
  against the 1200 px square they were tuned on, so a wide page gets wide bars.
- **Shorter shared animations (7 October):** the mark-by-mark export's shared CSS animations write `opacity` and the
  `scale` property instead of `fill-opacity` and `transform:scale()` (a mark is one filled shape, so they look the
  same), a start delay used by three or more marks is a class, and round dots are `<circle>`. 24–36% smaller on the
  CSS-animated presets (Overflow 4.2 → 2.7 MB, Daemon 5.5 → 3.6, Webhook 6.4 → 4.6, Resonance 1.3 → 0.85); frames
  unchanged. Concurrency and Cluster (SMIL per dot, no two dots alike) stay at 7.1 and 4.5 MB: video suits them.
- **Orbit Pulse animated SVG (5 October):** every animated Orbit arcs file is now dash by dash, Still included; the
  mark-by-mark export is left for the other patterns.
  - The dashes are laid out with Pulse off (full colour, full size). For each dash, Pulse is read where its middle
    is (`place` at its Flow or Sway position) at 100 moments a loop and thinned to the keyframes it needs by the
    shared `keyframer` (lifted out of the mark-by-mark export, whose files stay byte for byte the same): the
    shortest of even, timed or eased keys. Tolerances 0.015 opacity and 0.3 px at the dash's ends.
  - Fade is `opacity` on the path (on the flat background, the same as the app's mix towards it). A size that never
    changes is drawn into the outline; one that does is a `scale` about the dash's middle, `additive="sum"` on top
    of Flow's turn or Sway's stretch, its first value written out for design tools. Dashes faded or shrunk away the
    whole loop are left out.
  - Pulse at 15–100% opacity and 45–125% size: Event Stream Still 0.33 MB (mark by mark 1.48), Event Queue Flow
    1.13 MB (2.37), Event Stream Sway 1.29 MB (4.18), Event Queue Sway with a square pulse 3.7 MB (7.11). Frozen
    frames match the still SVG to 0.6–2.0/255; every case loops without a seam and opens on its first frame.
- **More presets (5 October):** every pattern that had one preset now has three, each drawn from the first with
  another density, wave and palette: Uptime and Benchmark (Gauge), Hash and Payload (Barcode), Bandwidth
  and Packet (Threshold Stripes), Latency and Throttle (Halftone Diagonal), Heap and Closure (Contour Field, from Schema),
  Protocol and Socket (Strands), Kernel and Mutex (Kaleido Pixels), Buffer and Register (Stack), Overflow and
  Daemon (Cymatics), Cluster and Webhook (Interference). 50 built-in presets in all; each loops seamlessly.
- **Renames (5 October):** the studio's three borrowed names are gone: Sinky Meter is Gauge, Amaya Flow is Eddy,
  RFD Stack is Stack (in the engine and the app). Saves and share links under the old names open in the new
  patterns (`PATTERN_ALIASES`), and a studio save's own name is refreshed on load, so SVG titles follow. Contour
  Field's first preset, Vector Field (a method term), is now Schema. The plate's setting key `chladni` is now
  `plate`; older saves, sessions and links convert on load (`sanitizeState`), and all 50 presets draw identically. A session left on an old preset name (Vector
  Field, or the studio's Sinky Meter, Amaya Flow, RFD Stack) opens the renamed preset (`RENAMED_LOOKS`).
- **Large formats (5 October):** studio sizes are pixels on the 1200 px square they were designed on; on a page
  whose shorter side is larger (A4 portrait, 2480 px) `scaledStudio` multiplies margins, gutters, mark lengths and
  thicknesses, meter parts, strand swing and offsets by shorter side / 1200 at draw time, so marks keep their
  proportion to the page. Smaller and wide formats keep their sizes (their presets were tuned there); the stored
  settings and the panel keep the 1200 px values.
- **Shuffle undo (5 October):** one undo returns to before a shuffle (the preset it passes through is dropped
  from the history).
- **Publishing (5 October):** the published site carries no comments: `publish.sh` runs `build.mjs` (terser,
  comments off, no compression or renaming; CSS and HTML comments by pattern). Checked by running the stripped
  page: no errors, all presets load. `handover.ps1` downloads the deployed site, refuses it if a comment slipped
  through, adds README.txt and zips it beside the repository: the client copy, with no notes and no history.
- **Wave studies:**
  - *Cymatics*: Chladni plate figures, cos(nπx)cos(mπy) mixed with cos(mπx)cos(nπy).
  - *Interference*: superposed circular waves from 1–8 orbiting sources.
  - *Logo Field*: contours from an exact Euclidean distance transform (Felzenszwalb–Huttenlocher) of the
    OneSyntax symbol, the {OS} monogram, the `{ }` bracket or text in Geist. Sharpness thins the bands into fine
    lines, Fade lets them die away from the mark, and the inside can be solid, empty or contoured.
- **Bracket:** the `{ }` mark from the Rebranding file (Geist Pixel, 9 × 23 cells per brace, read off the Figma
  vectors). Drawn as pixels, lines (the brand's line version), dots or slashes, with finer detail per cell; one
  mark or columns × rows of them, centred on a shared cell grid; effects (wave, scan, build, glitch, ripple,
  sparkle) that loop seamlessly. Four presets: Scope, Render, Compile, Loop.
- **Morph motion** for the wave studies: the Chladni figure melts into its neighbours and back, interference
  sources drift apart and swing, logo contours breathe. Flow (rings travelling outward) remains an option.
- **Fourier wave shapes:** sine, triangle, square, sawtooth, with 1–32 harmonics, on every wave.
- **Pulse:** an opacity and size wave over any studio pattern and over Orbit (both layouts).
- **Motion:** one-way, seamless loops. Waves advance whole or half cycles per loop (5 or 10 s); noise drifts one
  way and cross-fades with itself one loop earlier.
- **Seeds and remix:** a seed is a repeatable remix of the preset. Remixes are composed: even cells, one item count
  per row, whole wave cycles with at least six cells each, bands at clean angles, one brand palette whose mark
  colours contrast with the background.

### Brand and UI
- OneSyntax rebrand from the Figma file: Geist / Geist Mono, the brand colour list (core, tints, mids, brights,
  deeps, neutrals), 13 brand palettes, the official logo SVGs, the {OS} monogram.
- Colours can only be chosen from the brand list; older presets convert automatically and anything off-brand is
  flagged.
- Design system: square corners, filled (never outlined) controls, sliding segmented choices, square toggle
  switches, palette tiles, brand colour rows, 34 px controls on an 8 px rhythm, Lucide icons.
- The panel's text colour adapts to the pixels behind it; the glass is dense enough to stay readable.
- Motion (motion.dev) micro-animations: spring section open/close, staggered entrances, menus and pickers,
  press feedback, canvas cross-fades. Respects "reduce motion".
- Full-screen preview with Fill / Fit, ← → stepping through presets, page dots, pause. Marks are clipped to the
  artwork's frame, as in every export.
- Built-in presets are named in code vocabulary (Hello World, Telemetry, Stack Trace, Source, Scope…); a session
  left on an old name follows it to the new one.
- Brand tooltips (inverted ink, square, shortcut chips) replace the system ones; solid presets header and thin
  scrollbars.
- The presets window opens on the current pattern's presets: its group heading in view when the current card fits
  below it, otherwise the current card's row just under the title bar. Only the cards in view stagger in, and their
  thumbnails paint first.
- A group bar under the presets title (Saved, Wave Rows, Studio patterns, Wave studies, Bracket): a sliding
  segmented control whose names jump to each group and whose highlight follows the group in view. On a phone the bar
  scrolls sideways (keeping the current name in view) and Import / Export shrink to their icons.
- Dropdowns open a brand-styled list (groups as headings, a check on the current choice) instead of the system
  list; paired limits (Thinnest/Thickest, Min/Max) never cross; every pattern with one shared mark opacity has an
  Opacity control.

### Saving, sharing, exporting
- Built-in presets, saved presets (browser storage, with JSON export/import), undo/redo, share links.
- PNG at 1× / 2× / 4× / 6× (stepping down past browser limits), SVG, web-optimised animated SVG, MP4/WebM loops,
  transparent backgrounds.

## Verified (5 October 2026)
- Orbit Sway animated SVG, frozen at set moments against the still SVG at the same time: dash positions within
  0.75 px on the page (Event Queue at Speed 1 and −0.5, Strength 0.3 and 0.6); pixels 0.8–1.6/255 on average for
  Event Stream and 1.1–3.8 for Event Queue, where the mark-by-mark file it replaces measured 2.2 and 3.1–12. Loops
  seamlessly at Speeds 1.5, 2, 3 and −1 (with a margin and at 4:5); with its animation stripped it shows the first
  frame. Flow's animated SVG is byte for byte unchanged.
- The presets window opens on the current pattern's presets (current, unsaved and last preset), and the stripped
  build serves it with no comments and no console errors.
- All 50 built-in presets loop seamlessly at 1:1 and at A4 portrait.
- Orbit's SVG matches the app to 1–3/255 per pixel on average; its Flow animated SVG, frozen at set moments,
  matches the app.
- No method words (formulas or method names) in any panel text, description or hint.
- The live site (after commit b092455) serves the stripped build: no comments, 196 KB page (258 KB before), no
  console errors, 50 presets load, the pattern list shows Gauge, Eddy and Stack, and Event Stream exports one
  vector path per dash.
- Handover: `handover.ps1` made `PLUGIN\OneSyntax-Pattern-Generator.zip` (107 KB: the page, engine, five brand
  SVGs, README.txt), byte for byte the live page, no comments. Setting keys and function names in the code still
  carried a method word (`chladni`, since renamed `plate`; see Renames).

## Verified (4 October 2026)
- Every control on every built-in preset changes the output (564 controls checked; the exceptions are by design,
  such as Pulse controls while Pulse is off). No console errors.
- Every built-in preset loops seamlessly: frame 0 and the frame at the loop length match exactly.
- Panel alignment: every control starts and ends on the same column in all 15 patterns, rows are 34 px, and no
  label or value is clipped. Export menu labels share one icon column; the PNG scale labels are centred.
- Performance: a frame draws at most once per screen refresh, however many edits arrive; storage writes and the
  panel's tone check are throttled; marks are written without per-mark allocations; thumbnails are cached.
  Built-in presets build in 0–2 ms; at the slider extremes the slowest (Strands, 60,000 segments) builds in about
  15 ms, and Bracket detail steps down past 80,000 parts.
- Remix: 6 different results from 6 seeds on every pattern, brand colours only, never blank, repeatable.
- Animated SVG: 59% smaller across all presets (Scope 15 KB, Loop 187 KB, Hello World 90 KB, Source 1.6 MB);
  played back and frozen at set moments it matches the app to under 1/255 per pixel on average.
- Exports: PNG 2400 × 2400 (2×), SVG and animated SVG parse and animate, MP4 at exactly 5.00 s, including the
  Bracket presets and Event Loop (Ripple, Sweep and Twist loop seamlessly in every wave shape; 77 control checks pass).

## Ideas not built yet
Phyllotaxis (sunflower) layout · curl-noise flow · epicycles drawing the logo · Lissajous layouts · moiré
overlays · reaction–diffusion.
