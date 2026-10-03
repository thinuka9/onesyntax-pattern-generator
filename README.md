# OneSyntax Pattern Generator

A browser tool for making OneSyntax brand patterns: grids of marks whose opacity, size and angle are driven by
wave functions. It runs as a single static page with no build step, and exports PNG, SVG, animated SVG and
seamless video loops.

- **Run it:** see [BUILD.md](BUILD.md). In short: `powershell -ExecutionPolicy Bypass -File serve.ps1`,
  then open http://127.0.0.1:4174/.
- **What's been built and what's next:** [PROGRESS.md](PROGRESS.md).

## What it does

- **13 pattern types in three groups**
  - *Wave Rows*: rows of items whose opacity and size follow a sine wave.
  - *Studio patterns*: Sinky Meter, Amaya Flow, Barcode, Threshold Stripes, Halftone Diagonal, Contour Field,
    Strands, Kaleido Pixels, RFD Stack (ported from the original studio).
  - *Wave studies*: Cymatics (Chladni plates), Interference (ripple tank) and Logo Field (distance from the
    OneSyntax symbol, the {OS} monogram or any text).
- **Wave shapes:** every wave can be a sine, triangle, square or sawtooth, built from a Fourier series with a
  chosen number of harmonics.
- **Pulse:** fades and scales the marks of any studio pattern along its own wave.
- **Remix (shuffle / dice):** composes a new, uniform variation of the current pattern from its seed; the same
  preset and seed always give the same look.
- **Motion:** every animation moves one way and loops seamlessly in 5 or 10 seconds.
- **OneSyntax brand only:** Geist type, the brand colour list and palettes, the official logo files.
- **Looks:** built-in presets, saved looks (stored in the browser; export them as JSON), share links.
- **Exports:** PNG at 1×, 2×, 4× or 6×; SVG; animated SVG (SMIL); MP4 or WebM video loops; transparent
  backgrounds for PNG and SVG.

## Project layout

```
index.html          The app: UI, controls, presets, remix, exports.
engine.js           Pattern engine: fields, layouts, marks, SVG export, WebGL renderer.
serve.ps1           Local preview server (Windows PowerShell, no Node needed).
brand/              Official OneSyntax logo files (from the Rebranding Figma file).
references/         Inspiration screenshots. Not loaded by the app.
.claude/            Preview configuration for Claude Code.
```

## Dependencies

All loaded from CDNs at runtime, so the page needs an internet connection:

| Library | Version | Licence | Used for |
|---|---|---|---|
| [Geist / Geist Mono](https://vercel.com/font) (Google Fonts) | latest | SIL OFL 1.1 | Brand typography |
| [Lucide](https://lucide.dev) | 0.460.0 | ISC | Icons |
| [Motion](https://motion.dev) | 12.23.12 | MIT | UI micro-animations |

Without the CDNs the tool still works: text falls back to the system font, icon buttons keep their labels for
screen readers, and animations are skipped.

The OneSyntax name, logo files and colours belong to OneSyntax.
