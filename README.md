# OneSyntax Pattern Generator

A browser tool for making OneSyntax brand patterns: grids of marks whose opacity, size and angle are driven by
wave functions. It runs as a single static page with no build step, and exports PNG, SVG, animated SVG and
seamless video loops.

- **Run it:** see [BUILD.md](BUILD.md). In short: `powershell -ExecutionPolicy Bypass -File serve.ps1`,
  then open http://127.0.0.1:4174/.
- **What's been built and what's next:** [PROGRESS.md](PROGRESS.md).

## What it does

- **14 pattern types in four groups**
  - *Wave Rows*: rows of items whose opacity and size follow a sine wave.
  - *Studio patterns*: Sinky Meter, Amaya Flow, Barcode, Threshold Stripes, Halftone Diagonal, Contour Field,
    Strands, Kaleido Pixels, RFD Stack (ported from the original studio).
  - *Wave studies*: Cymatics (Chladni plates), Interference (ripple tank) and Logo Field (contours around the
    OneSyntax symbol, the {OS} monogram, the `{ }` bracket or any text).
  - *Bracket*: the brand's `{ }` mark on its own Geist Pixel grid (9 × 23 cells, read from the Figma file), drawn
    as pixels, lines, dots or slashes, alone or repeated in columns and rows, with looping effects: wave, scan,
    build, glitch, ripple, sparkle.
- **Built-in presets named in code vocabulary:** Hello World, Throughput, Checksum, Telemetry, Bitstream, Stack Trace,
  Gradient Descent, Recursion, Resonance, Concurrency, Source, Scope, Render, Compile, Loop and more.
- **Wave shapes:** every wave can be a sine, triangle, square or sawtooth, built from a Fourier series with a
  chosen number of harmonics.
- **Pulse:** fades and scales the marks of any studio pattern along its own wave.
- **Remix (shuffle / dice):** composes a new, uniform variation of the current pattern from its seed; the same
  preset and seed always give the same result.
- **Motion:** every animation loops seamlessly in 5 or 10 seconds. Waves flow one way; the wave studies morph,
  swaying each figure through its shapes and back (or flow, if you choose).
- **OneSyntax brand only:** Geist type, the brand colour list and palettes, the official logo files.
- **Presets:** built-in presets, saved presets (stored in the browser; export them as JSON), share links.
- **Exports:** PNG at 1×, 2×, 4× or 6×; SVG; animated SVG (SMIL); MP4 or WebM video loops; transparent
  backgrounds for PNG and SVG.

## Project layout

```
index.html          The app: UI, controls, presets, remix, exports.
engine.js           Pattern engine: fields, layouts, marks, SVG export, WebGL renderer.
serve.ps1           Local preview server (Windows PowerShell, no Node needed).
publish.sh          Hosting build step: copies only the app into dist/.
brand/              Official OneSyntax logo files (from the Rebranding Figma file).
.claude/            Preview configuration for Claude Code.
```

## Dependencies

Geist and Motion load from CDNs at runtime; the icons are part of the page:

| Library | Version | Licence | Used for |
|---|---|---|---|
| [Geist / Geist Mono](https://vercel.com/font) (Google Fonts) | latest | SIL OFL 1.1 | Brand typography |
| [Lucide](https://lucide.dev) | 0.460.0 | ISC | Icons: the 24 the app uses are kept in the page, not loaded |
| [Motion](https://motion.dev) | 12.23.12 | MIT | UI micro-animations |

Without the CDNs the tool still works: text falls back to the system font and animations are skipped.

The OneSyntax name, logo files and colours belong to OneSyntax.
