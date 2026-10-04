# Progress

## Status (3 October 2026)

The OneSyntax Pattern Generator (`index.html`) is the product. It lives in
`Dropbox\HAUX STUDIO\PROJECTS\ONESYNTAX REBRAND\PLUGIN\OneSyntaxPatternGenerator` and on GitHub at
[thinuka9/onesyntax-pattern-generator](https://github.com/thinuka9/onesyntax-pattern-generator) (`main`),
where it replaced the original TypeScript/Vite studio. That studio stays in the repository's history and in
`PLUGIN\OneSyntaxPatternGenerator-archive-2026-10-03.zip`, together with its build output, test scripts, exported
proofs and the earlier "classic" page.

**Not done yet**
- Deploy to a public URL (Netlify, Vercel, Cloudflare Pages or GitHub Pages; see BUILD.md).

## Built so far

### Generator
- **Wave Rows:** rows of items with opacity and size driven by a sine wave: rows, items, gaps, roundness,
  frequency, phase, row shift, sharpness.
- **Studio patterns:** the original studio's nine presets, ported from TypeScript to plain JavaScript with
  identical geometry, each with a short set of tailored controls instead of the full parameter list. Refactor
  (Amaya Flow) twists a 22 × 12 bar grid round a quiet centre: angle 90° ± 60° times the attractor bump
  (1 − d²/R²)², easing to nothing at radius R.
- **Vector Field** (preset Event Loop): a direction-field plot. Each dash lies along F(x, y) = cos α·⟨−y, x⟩ +
  sin α·⟨x, y⟩ from the centre, normalised: α = 0 is the rotation field (circles), ±90° a source or sink, spirals
  between. The field sits on a plane receding towards the top (y = lift·e^Z − lift), sampled by rows evenly
  spaced in Z and columns whose gap narrows by √((y + lift) / (bottom + lift)), so arcs crowd into fine lines
  at the top. Motion is a sine wave through the dash lengths (Ripple outward, Sweep round) or through α (Twist).
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
- **Pulse:** an opacity and size wave over any studio pattern.
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
- Dropdowns open a brand-styled list (groups as headings, a check on the current choice) instead of the system
  list; paired limits (Thinnest/Thickest, Min/Max) never cross; every pattern with one shared mark opacity has an
  Opacity control.

### Saving, sharing, exporting
- Built-in presets, saved presets (browser storage, with JSON export/import), undo/redo, share links.
- PNG at 1× / 2× / 4× / 6× (stepping down past browser limits), SVG, web-optimised animated SVG, MP4/WebM loops,
  transparent backgrounds.

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
  Bracket presets and Event Loop (Ripple, Sweep and Twist all loop seamlessly; its 64 control checks all pass).

## Ideas not built yet
Phyllotaxis (sunflower) layout · curl-noise flow · epicycles drawing the logo · Lissajous layouts · moiré
overlays · reaction–diffusion.
