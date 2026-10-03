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
  identical geometry, each with a short set of tailored controls instead of the full parameter list.
- **Wave studies:**
  - *Cymatics*: Chladni plate figures, cos(nπx)cos(mπy) mixed with cos(mπx)cos(nπy).
  - *Interference*: superposed circular waves from 1–8 orbiting sources.
  - *Logo Field*: contours from an exact Euclidean distance transform (Felzenszwalb–Huttenlocher) of the
    OneSyntax symbol, the {OS} monogram or text in Geist.
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
- Colours can only be chosen from the brand list; older looks convert automatically and anything off-brand is
  flagged.
- Design system: square corners, filled (never outlined) controls, sliding segmented choices, square toggle
  switches, palette tiles, brand colour rows, 34 px controls on an 8 px rhythm, Lucide icons.
- The panel's text colour adapts to the pixels behind it; the glass is dense enough to stay readable.
- Motion (motion.dev) micro-animations: spring section open/close, staggered entrances, menus and pickers,
  press feedback, canvas cross-fades. Respects "reduce motion".
- Full-screen preview with Fill / Fit, ← → stepping through looks, page dots, pause.

### Saving, sharing, exporting
- Built-in looks, saved looks (browser storage, with JSON export/import), undo/redo, share links.
- PNG at 1× / 2× / 4× / 6× (stepping down past browser limits), SVG, animated SVG, MP4/WebM loops,
  transparent backgrounds.

## Verified (3 October 2026)
- All 253 sliders across the 13 patterns move without errors; no console errors.
- Every pattern loops seamlessly at its loop length, in both directions.
- Remix: 6 different looks from 6 seeds on every pattern, brand colours only, never blank, repeatable.
- Exports: PNG 2400 × 2400 (2×), SVG and animated SVG parse, animated-SVG playback matches the live pattern,
  MP4 at exactly 5.00 s.

## Ideas not built yet
Phyllotaxis (sunflower) layout · curl-noise flow · epicycles drawing the logo · Lissajous layouts · moiré
overlays · reaction–diffusion.
