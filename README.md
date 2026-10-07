# OneSyntax Pattern Generator

> **Internal to Haux Studio.** These notes (README, BUILD, PROGRESS, MEMORY) record how the patterns are made: the studio's
> own knowledge. Keep them up to date and never hand them over to the client. The panel text in the app says what each
> control does, never how a pattern is built.

A browser tool for making OneSyntax brand patterns: grids of marks whose opacity, size and angle are driven by
wave functions. It runs as a single static page with no build step, and exports PNG, SVG, animated SVG and
seamless video loops.

- **Run it:** see [BUILD.md](BUILD.md). In short: `powershell -ExecutionPolicy Bypass -File serve.ps1`,
  then open http://127.0.0.1:4174/.
- **What's been built and what's next:** [PROGRESS.md](PROGRESS.md).
- **What was decided and why, and what was dropped:** [MEMORY.md](MEMORY.md).

## What it does

- **14 pattern types in four groups**
  - *Wave Rows*: rows of items whose opacity and size follow a sine wave.
  - *Studio patterns*: Eddy, Barcode, Threshold Stripes, Halftone Diagonal, Contour Field,
    Strands, Kaleido Pixels, Stack (ported from the original studio, where Eddy and Stack were Amaya Flow and RFD Stack; its
    Gauge, once Sinky Meter, was removed on 7 October and its saves open as Barcode), and Orbit: dashes round nested arcs, in two
    layouts. Arcs lays curved dashes along ellipses whose centre shifts as they grow, on a plane receding towards
    the top (Event Stream, Event Queue); Grid (once the Horizon pattern) sets straight dashes on a grid, each laid
    along F(x, y) = ⟨−y, x⟩ (the rotation field, turned towards a spiral by α) on a plane receding towards
    the top, so arcs crowd into fine lines there.
  - *Wave studies*: Cymatics (Chladni plates), Interference (ripple tank) and Logo Field (contours around the
    OneSyntax symbol, the {OS} monogram, the `{ }` bracket or any text).
  - *Bracket*: the brand's `{ }` mark on its own Geist Pixel grid (9 × 23 cells, read from the Figma file), drawn
    as pixels, lines, dots or slashes, alone or repeated in columns and rows, with looping effects: wave, scan,
    build, glitch, ripple, sparkle.
- **49 built-in presets named in code vocabulary:** Hello World, Throughput, Checksum, Bitstream, Stack
  Trace, Gradient Descent, Recursion, Resonance, Concurrency, Source, Refactor, Event Loop, Scope, Render, Compile,
  Loop and more; every pattern has at least three. Refactor (Eddy) twists a bar grid round a quiet centre; Event
  Stream, Event Queue and Event Loop are Orbit.
- **Wave shapes:** every wave can be a sine, triangle, square or sawtooth, built from a Fourier series with a
  chosen number of harmonics.
- **Pulse:** fades and scales the marks of any studio pattern (Orbit included) along its own wave.
- **Browsing:** the Pattern menu shows a preview of each pattern; the artwork arrows, ← → and the dots step through
  the current pattern's presets.
- **Shuffle and dice:** shuffle jumps to another pattern at random, one of its presets, with new colours and
  settings (one undo comes back). The seed dice composes a new, uniform variation of the current pattern from its
  seed; the same preset and seed always give the same result.
- **Motion:** every animation loops seamlessly in 5 or 10 seconds. Waves flow one way; the wave studies morph,
  swaying each figure through its shapes and back (or flow, if you choose).
- **OneSyntax brand only:** Geist type, the brand colour list and palettes, the official logo files.
- **Sticker:** any pattern shown on the {OS} sticker (cut corners, {OS}, a live title and subtitle, the pattern
  masked into a band), with every export, presets and links.
- **Presets:** built-in presets, saved presets (stored in the browser; export them as JSON), share links.
- **Exports:** PNG at 1×, 2×, 4× or 6×; SVG; animated SVG (SMIL); MP4 or WebM video loops; transparent
  backgrounds for PNG and SVG.

## Project layout

```
index.html          The app: UI, controls, presets, remix, exports.
engine.js           Pattern engine: fields, layouts, marks, SVG export, WebGL renderer.
serve.ps1           Local preview server (Windows PowerShell, no Node needed).
publish.sh          Hosting build step: installs terser and runs build.mjs.
build.mjs           Writes the app into dist/ with every comment stripped (the published site).
check.mjs           Release checks in a real browser (npm run check; see BUILD.md).
package.json        Build and check tooling only (terser, playwright-core); the app itself needs no install.
handover.ps1        Downloads the live site and zips the client's copy (no notes, no history).
brand/              Official OneSyntax logo files (from the Rebranding Figma file).
vendor/             Geist fonts, Motion and mp4-muxer as they came from npm, with their licences.
.claude/            Preview configuration for Claude Code.
```

## Dependencies

Everything ships with the app in `vendor/` (copied from npm, with each licence beside it), so it runs offline and
makes no requests to other sites; the icons are part of the page:

| Library | Version | Licence | Used for |
|---|---|---|---|
| [Geist / Geist Mono](https://vercel.com/font) (npm `geist`) | 1.7.2 | SIL OFL 1.1 | Brand typography: the two variable fonts (`vendor/fonts`, 141 KB), preloaded |
| [Lucide](https://lucide.dev) | 0.460.0 | ISC | Icons: the 24 the app uses are kept in the page, not loaded |
| [Motion](https://motion.dev) | 12.23.12 | MIT | UI micro-animations (`vendor/motion.js`) |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | 5.2.1 | MIT | Packing fast video exports into MP4 (`vendor/mp4-muxer.js`, loaded only when exporting video) |

To update one, replace its file from the npm package (`npm pack <name>@<version>`) and its licence, then change the
version here.

The OneSyntax name, logo files and colours belong to OneSyntax.
