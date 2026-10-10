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
- **Parked: Event Queue's top-right density.** The reference packs its finest lines tighter along the top right
  than the fit does. Leave it exactly as it is: don't work on it, propose it or list it as a next step unless the
  studio asks for it by name (5 October).

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
- **Orbit Pulse animated SVG (5 October):** Orbit's arcs never go mark by mark any more; Pulse rides on the dash's
  own path as opacity and a scale (2–4 × smaller than before, as close to the app).
- **Setting keys (5 October):** the plate's settings key is `plate`, not `chladni`. `sanitizeState` moves an old
  `field.chladni` to `field.plate`, so saves, sessions, imported JSON and share links from before still open (checked
  with a link and a preset made in the old version: identical output).
- **Orbit Sway animated SVG (5 October):** dashes ride their lines (`animateMotion`) and stretch along and across,
  instead of going mark by mark: half the size or less, and closer to the app. Small bend errors on tight dashes
  are the accepted cost.

## Studio feedback, 7 October (to work through)

- **Gauge:** not wanted; remove it completely (old saves and links must still open in another pattern).
- **Barcode:** keep, improve.
- **Threshold Stripes, Stack, Strands:** not liked as they are. Threshold Stripes and Stack must turn horizontal (any
  angle) and adapt to every format, as Eddy (Refactor) already does. Strands: try something better.
- **Kaleido Pixels:** a control does nothing visible and it reads weakly as a pattern (the note was unclear: ask).
- **Interference:** good as it is.
- **Bracket:** Loop is liked (keep, polish only if asked). Render's default animation and colours are not liked.
- **References for new presets:** a lanyard badge (columns of slanted parallelogram bars), AlphaSense business card
  (diagonal hairlines of varying length forming a wave edge), One Grove card (horizontal bars with a stepped gap down
  the middle). Achieve them from the existing patterns where possible.
- **New section, Stickers:** the {OS} sticker (a square with two cut corners, top left and bottom right, refined in
  Figma), the {OS} logo top right recolouring to suit the background, an editable title and subtitle (Geist and
  Geist Mono) updating live, and a pattern from the generator inside the sticker as a masked frame at its set height.
  Same exports (SVG, animated SVG, PNG, video, transparent outside the shape), presets, seeds.
- **Done 7 October:** Gauge removed; Threshold Stripes, Stack and Barcode rotate and fit every format; Kaleido
  Pixels' presets move (the "does nothing"); Strands reworked after AlphaSense (Threads, Protocol, Socket);
  Deploy (badge) and Branch (One Grove) presets; Render redone; the Sticker section built.
- **Second round, 7 October:** Strands removed for good ("not a pattern"); Barcode replaced by Readout (RFD cards) and
  Threshold Stripes by Silhouette (Vonyes; One Grove as Branch; the symbol's base as a shape); Stack keeps only Deploy
  plus Release and Cache; the sticker is fixed to the Figma frame (shape, type, band) with its five colour schemes and
  a dice for them. Kaleido Pixels is liked now.
- **8 October:** Silhouette still "not the same" as the Vonyes poster; a close crop showed the real effect (thin
  lines edge to edge, thick bars round the shape above a fold and inside it below, thicker away from the fold), now
  Fold. Sticker colours: "experiment with all the colours, but matching and complementary". Bug: the seed dice
  brought a turned-off sticker back (seen on Query).
- **8 October, later:** Silhouette keeps only Merge ("this is the default"); shapes only the symbol, the S mark and
  {OS} ("3 for now"); cut-off names must show in full on hover; Drift and Roll should loop one way, "without ping
  pong". Then: a seamless loop "doesn't mean repeated shapes, it has to be from lines": the motion comes from the
  stripes moving, with the shape and fold still.
- **8 October, after the merge:** "no motion in Kaleido Pixels Recursion, check if any other has this issue";
  "I need a full check for hidden errors like this, then deploy after the fix". The release checks now include
  the hidden-error sweep (BUILD.md check 11); run it before every merge.
- **8 October, later:** "0.5 speed is too fast, check all"; Roll and Drift "not smooth, glitchy, not seamless" (it
  was so before too). Silhouette was the only pattern far faster than the rest; fixed with the glitches.
- **Decided 8 October:** Stack's Cache: bars must not touch or overlap ("don't touch" meant the bars). Spaced out;
  a release check keeps every Stack preset's bars apart in every format.
- **8 October, later still:** a motion on/off icon in the panel header ("perfect UX and logic, think before doing
  it"): built as the waves switch. The centre knob jumped on touch; Stairs shifted the S; slivers came back in
  other modes. All fixed, with checks.
- **8 October, last in the cloud session:** "am I in Workers or Pages?": Cloudflare Pages (`.pages.dev`, the
  "Cloudflare Pages" check on GitHub). Logo hover: tried stripes, then a pixel strobe; removed ("we'll do it in a
  different stage"), so the logo is as it was. "Another preset for Deploy" from the studio's link: Rollout. "Copy link should get the values":
  links now always carry the reference cell. All pushed to the branch, not merged; work continues locally.
- **9 October:** "no rotation or roundness, check other patterns as well" (on Gradient Descent): every studio
  pattern and wave study now has Rotation; Roundness on all but the dot patterns. Lines and pills were always
  fully round; their Roundness (`marks.roundness`, 0–1) defaults to 1, so old saves look the same. Readout,
  Silhouette, Bracket, Wave Rows and Orbit's Grid were left as they are.
- **10 October:** "always roundness to 0": every default, preset and remix is square; the Roundness sliders stay.
  Contour Field "not pretty or tidy": it now draws the field's own contour lines, dashed to fit each line (Draw as
  Lines, the default), with the old marks kept as Grid, their directions smoothed so neighbours agree. Sticker rows
  were cut at the band's top and bottom: patterns in level rows now show whole rows, cut midway between them.
  Kaleido Pixels: Columns, Rows and both gaps (pixels fill their cells); its remixes use a dark-to-light ramp.
  Wave Rows got Rotation. The app is named **Pattern.OS** (wordmark {Pattern.OS} from the Figma file, node 885:774, in brand/) ("a pattern engine, not a generator"; picked over Syntex,
  Pattern Syntax, Parsely and Runtime): tab title, panel eyebrow, export notes and the handover zip. The live
  address still says pattern-generator (renaming means renaming the Cloudflare project). Reference: Calendly's Patternly (six patterns, few plain controls):
  narrow ours to six, and simplify the controls. "We don't use dots": Cymatics and Interference go with the cut.
- **10 October, the cut:** asked to narrow to six like Patternly, the studio chose instead: "keep all of them", drop
  Contour Field (even after its new contour-lines style; that code is in `PLUGIN\_archive\contour-lines-2026-10-10.js`)
  and Stack, and Bracket keeps Scope and Compile (Render and Loop dropped). The dot patterns, Cymatics and
  Interference, stay for now ("keep all of them" came after "we don't use dots": ask before removing them). Old saves
  open in Eddy (Contour Field) and Halftone Diagonal (Stack); `RENAMED_LOOKS` forwards the dropped presets. Presets are
  now listed pattern by pattern: one heading each in the presets window, and `BUILT_INS` sorted to the menu's order.
  The panel header shows the {Pattern.OS} wordmark. Readout got Rotation and Gap. Not given rotation, on purpose:
  Bracket (the brand mark), Silhouette (its fold breaks round the shape; Across/Down only), Orbit's Grid layout.
- **10 October, Silhouette:** "uneven, not balanced, not seeing through, line defects, not seamless" (screenshots of
  remixes: Stairs on the S mark, rolling). Fixed: stripes sliding under the frame's edge, and one-sided stripes
  crossing the shape's flat edges, now fade (quickly, centred on half) instead of thinning to hairlines; Fold's bars
  grow out of the line instead of dipping below it; specks (a lone piece under half a stripe or 1.5× its thickness)
  go. Remixes keep to combinations that read (no Stairs or Gap on {OS}; the S mark only in Rise). The release check
  now fails any hairline, speck or edge sliver, at 12 moments a loop. The studio "loved" a "Vector Transition"
  poster: built as Rise (stripes thicken down the page, faster inside the shape, which emerges from its own top)
  and the Migration preset.
- **10 October, later:** Silhouette's motion "fades, and broken": Stairs, Gap and Drift were dropped (they drew one
  side of a stripe, so a stripe crossing the shape's edge could only thin, fade or jump; saves open as Bars and Roll).
  Every stripe now draws both sides: crossing an edge, its bar grows out of its line; short pieces on moving stripes
  taper into their neighbours; at the frame's edge bars ease to the base line before it slides under. No opacity
  anywhere. The centre knob is gone from Silhouette ("no need to move knob") and, elsewhere, is a small knob shown
  only near the pointer (the rings were "what the hell is this"). Panel section descriptions removed; the
  {Pattern.OS} wordmark moved to the top left (the panel eyebrow reads "Pattern 06 / 11"). The local folder is now
  `PLUGIN\pattern-os`; the GitHub repo and the live address still carry the old name.
- **10 October, last:** "no gaps, fix all and deploy". Breathe's animated SVG was broken (9/255 off: marks followed
  by number, and numbers pass between pieces as the shape breathes); geometry can now ask the exporter to follow
  marks by place (`followShapes`), with pieces that split off or join into a like mark held opaque across the change.
  The release check compares Merge and Migration, Roll and Breathe, at five moments a loop. Its remaining ~3.6/255 on
  Migration is edge smoothing (moving SVG marks are antialiased; the still is crisp), not a fault.
- **10 October, Skyline:** Migration "not centred" (it sat low and ran past the margin): centred, as are Rise remixes.
  {OS} and the S mark in Rise were illegible (their tops barely thickened) and could be cut by the margins: Rise got
  Emerge (how gradually the shape rises; remixes use little for detailed shapes), detailed shapes are sized to fit,
  and remixes draw the shape in the palette's colour that stands out most. A Tower shape and a Bootstrap preset were
  tried for the "Vector Transition" poster and removed at once ("remove this"); a close crop showed the poster's real
  structure, so it became its own pattern, **Skyline**: lines edge to edge, the page split into columns, each
  thickening from its own depth (Arch, Valley, Ramp), Rise and Wave motions with the lines still. Presets Gateway,
  Firewall, Ramp Up. Each line is one full-width mark at its thinnest column's weight with thicker columns laid over
  it, every mark keeping its number (seams and a broken animated SVG came from joining pieces). The SVG exporter no
  longer renders files with hairlines crisp (it rounded them away). Silhouette also got Lines from (stripes start
  partway down) and gives the sticker a between-rows crop (the band's top line touched its edge).
- **10 October, colours:** "random seed, not enough colour combos" (remixes drew from the 13 brand palettes, filtered
  further per pattern). A third of remixes still take a brand palette; the rest put one together from the brand
  colours (`mixedPalette`): a background from the ends of each family or the brights (no mid tones or mid greys:
  muddy), marks tonal, complementary (blue/warm, violet/yellow) or neutral, each clear of the background. The panel
  shows them as Custom colours. Palette helpers take a name or a palette (`paletteOf`).
- **10 October, Eddy thickness:** Refactor's lines thicken across the page, but dragging Thickness set both ends to
  one value and the gradient was gone. Thickening (Even / Across / Down) now picks the spread; Even shows one
  Thickness, the others Thinnest and Thickest. Switching keeps the look (a choice's `chosen` hook, `spreadThickness`).
- **10 October, clean SVGs:** pattern and sticker SVGs "break" in Blender and After Effects: both drop clip paths
  and nested `<svg>`. Still SVGs are now cut in the geometry (`E.svgMarks`, `E.cutToBox`; Orbit's `dashOutline`):
  a mark inside the frame stays a plain rect, ellipse or curve, one outside is left out, one crossing becomes its
  cut outline. The sticker SVG places the marks straight into the band and {OS} as a plain group, in layers
  `sticker`, `pattern`, `monogram`, `title`, `subtitle`. Animated SVGs keep their clip (motion crosses the edge; they
  are for the web). Text stays live text (Blender skips it: outline it in Illustrator or Figma first).
- **Idea, not urgent:** a motion per pattern that brings out that pattern (Pulse stays on/off for all).

## Tried and dropped

- **A bending (warp) generator** built as its own pattern to compare with Event Loop. Dropped: it read as an image
  being bent, not as lines following a path. Deleted.
- **Arc Field**, the first Event Loop: gaps at the edges, breaks and dots at wide spacing. Patched, then replaced.
- **Morphing the dash outline for Sway** (between its shapes at the middle and both ends, then keyed adaptively):
  the three-shape morph was 46% of the file and still wrong mid-swing, since a dash swinging out of the distance
  changes shape unevenly; keyed to 0.35 px it would have been larger than the old file. Replaced by a stretch.
- **Concentric ellipses** for the reference: stroke directions off by 19° RMS against the reference, against 4.9°
  for drifting ellipses on a receding plane (see PROGRESS).

## Open

- `PLUGIN\_archive\Archive.zip` (184 MB) is mostly dependencies and Mac system files; the `codex` project in it
  exists nowhere else. `repack-archive.ps1` (handed to the studio on 5 October, not kept here) writes
  `Archive-source.zip` beside it without node_modules, Mac files or caches, and never touches the original: run it,
  check the new zip, then delete the old one.

## Where things are

```
PLUGIN
├─ pattern-os/                       this repository (private: thinuka9/pattern-os, once renamed on GitHub)
├─ OneSyntax-Pattern-Generator.zip   the client's copy (handover.ps1)
├─ references/                       client reference images (never committed)
└─ _archive/                         the old studio and the earlier Mac projects
```

Live: https://onesyntax-pattern-generator.pages.dev
