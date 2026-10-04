# Memory

> **Internal to Haux Studio**, like README, BUILD and PROGRESS: never published, never handed over. PROGRESS says
> what is built; this file says what was decided, why, and what was tried and dropped. Add to it whenever a
> decision is made.

## Who

Haux Studio builds the generator; OneSyntax is the client. The client gets the app, not the know-how.

## Standing rules

- **No method text in the app.** Panel text, pattern descriptions, hints, tooltips and names say what a control
  does, never how a pattern is made: no formulas, no method names (Fourier, Chladni, Gibbs, vector field, distance
  transform, B-spline…). The Wave Shape hint ("Each shape is a Fourier series… Gibbs effect") was the example to
  remove. The maths lives only in these .md files.
- **The notes never leave the studio.** The published site is built with every comment stripped (`build.mjs`). The
  client gets the zip `handover.ps1` makes from the live site, never the repository: its history holds the
  reference images and every note.
- **Reference images are never committed.** They stay in `PLUGIN\references`; copy one into `exports/` (ignored by
  Git) only while working, then delete it.
- **Nothing breaks.** Old saves and share links keep opening (`PATTERN_ALIASES`, the `sanitize…` functions), every
  built-in preset loops seamlessly, and margins clip the same in the app and in every export.
- **A push goes live.** Cloudflare Pages redeploys `main` in about 35 seconds, so push only when a batch is approved.
- **Names are our own.** Patterns are named by their look; presets in code vocabulary (Hello World, Telemetry, Event
  Stream…). The studio's borrowed names were replaced: Sinky Meter → Gauge, Amaya Flow → Eddy, RFD Stack → Stack.
  The no-method rule covers preset names too: Contour Field's "Vector Field" became Schema (5 October). Old names
  stay in the code only as forwards (`PATTERN_ALIASES`, `RENAMED_LOOKS`), so old saves and sessions still open.
- **Brand only.** Colours from the brand list, Geist type, the official logo files.

## Decisions

- **3 October:** the single static page replaced the TypeScript/Vite studio (archived in `PLUGIN\_archive`).
- **Orbit (4–5 October):** the client's arcs went through four versions: Arc Field (gaps at the edges, broken
  dashes at wide spacing) → Vector Field (a rotation field on a receding plane, then renamed Horizon) → an array of
  ellipses whose centre drifts with size, with per-line offset spacing and rotation. The last was judged "the best"
  and became Orbit, with Horizon folded in as its Grid layout (Horizon on its own was not wanted).
  - Orbit's default is the studio's "01" preset, now Event Stream.
  - Thickness and Roundness on the arcs, Pulse on both layouts, a centre handle shown on hover.
- **Interface (5 October):**
  - The arrows step through the current pattern's presets, not through patterns.
  - The Pattern menu shows a preview of each pattern.
  - Shuffle jumps to a random pattern, preset, colours and settings; the seed dice remixes within the pattern;
    one undo comes back from a shuffle.
- **Presets (5 October):** every pattern has at least three; 50 in all.
- **Large formats (5 October):** studio patterns scale with the page (A4), so marks keep their proportion.
- **Publishing (5 October):** comments stripped on publish; handover is a zip of the live site.

## Tried and dropped

- **A bending (warp) generator** built as its own pattern to compare with Event Loop. Dropped: it read as an image
  being bent, not as lines following a path. Deleted.
- **Arc Field**, the first Event Loop: gaps at the edges, breaks and dots at wide spacing. Patched, then replaced.
- **Concentric ellipses** for the reference: stroke directions off by 19° RMS against the reference, against 4.9°
  for drifting ellipses on a receding plane (see PROGRESS).

## Open

- Event Queue: the reference packs its finest lines tighter along the top right.
- The presets window could open scrolled to the current pattern.
- A lighter animated SVG for Orbit's Sway.
- Setting keys in the code still say `chladni`; renaming them means converting old saves and links.
- `PLUGIN\_archive\Archive.zip` (184 MB) is mostly dependencies and Mac system files; the `codex` project in it
  exists nowhere else. Repack it with just the source, or delete it.

## Where things are

```
PLUGIN
├─ OneSyntaxPatternGenerator/        this repository (private: thinuka9/onesyntax-pattern-generator)
├─ OneSyntax-Pattern-Generator.zip   the client's copy (handover.ps1)
├─ references/                       client reference images (never committed)
└─ _archive/                         the old studio and the earlier Mac projects
```

Live: https://onesyntax-pattern-generator.pages.dev
