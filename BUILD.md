# Build, run and deploy

The app itself needs no build: it is `index.html`, `engine.js`, the SVGs in `brand/` and the fonts and libraries
in `vendor/`, and anything that serves static files can host it. Publishing adds one step: it strips every comment.

## Run locally

The page must be served over HTTP, not opened as a `file://` path: the Logo Field reads the brand SVGs back
from a canvas, which browsers block for local files.

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://127.0.0.1:4174/. Use `-Port 8080` for another port. Any other static server works too
(for example `npx serve .` or `python -m http.server`).

In Claude Code, the `app` entry in `.claude/launch.json` starts the same server.

## Requirements

- A current Chromium-based browser (Chrome, Edge, Arc) for everything, including WebGL 2 and video export.
  Firefox and Safari run the tool; video export depends on their MediaRecorder support.
- No internet connection: the fonts and libraries are in `vendor/` (see [README.md](README.md#dependencies)).

## Exports

| Export | Notes |
|---|---|
| PNG 1× / 2× / 4× / 6× | Optional transparent background. Sizes below. |
| SVG | Vector; the editable layers are `background`, `track`, `fill`, `cap`, `accent`. Orbit's arcs export each dash as one closed curve, grouped by colour. Margins clip every export to the frame. |
| Animated SVG | Built for the web: resolution-free, loops seamlessly, plays in browsers and `<img>` tags. Marks sharing a motion share one CSS animation; the rest keep only the keyframes they need. Most presets export at 15–400 KB. Orbit's arcs animate whole dashes (sliding with Flow, riding with Sway, fading and sizing with Pulse): Flow, Event Stream 0.37 MB and Event Queue 0.79 MB; Sway, Event Stream 0.71 MB and Event Queue 2.9 MB; with Pulse, 0.3–3.7 MB. Patterns with thousands of independently moving marks (Threads, Concurrency) stay heavy: use Video for those. Design tools import the first frame. |
| Sticker | With the Sticker section on, every export is of the sticker: PNG and video painted, SVG and animated SVG with the pattern's own file nested in the band, the text in Geist. Transparent leaves the page round the outline empty. |
| Video | MP4 (H.264), 30 fps, seamless 5 or 10 s loop, longest side up to 1920 px. Encoded frame by frame with WebCodecs, faster than real time and with the tab in the background (MP4 packing by mp4-muxer, MIT, loaded on first use). Browsers without it fall back to real-time recording (MP4 or WebM; keep the tab visible). |
| Presets (JSON) | From the preset picker: Export / Import. Also imports preset JSON from the original studio. |
| Copy link | A URL holding the exact preset. Works wherever the page is hosted. |

### PNG sizes

| Format | 1× | 2× | 4× | 6× |
|---|---|---|---|---|
| 1:1 | 1200 × 1200 | 2400 × 2400 | 4800 × 4800 | 7200 × 7200 |
| 4:5 | 1200 × 1500 | 2400 × 3000 | 4800 × 6000 | 7200 × 9000 |
| 9:16 | 1080 × 1920 | 2160 × 3840 | 4320 × 7680 | 6480 × 11520 |
| 16:9 | 1920 × 1080 | 3840 × 2160 | 7680 × 4320 | 11520 × 6480 |
| A4 portrait | 2480 × 3508 | 4960 × 7016 | 9920 × 14032 | 11583 × 16384 \* |
| LinkedIn banner | 1584 × 396 | 3168 × 792 | 6336 × 1584 | 9504 × 2376 |

\* Browsers refuse bitmaps beyond about 16,384 px a side or 250 megapixels, so oversized exports step down to the
largest size that fits, and the tool says so.

## Checks to run before a release

`check.mjs` opens the app in Edge or Chrome (as installed; nothing to download) and runs the checks in about five
minutes. Once, from this folder:

```bash
npm install
```

Then, before every release:

```bash
npm run check -- --dist
```

It builds the published site (`build.mjs`) and checks that copy; `npm run check` alone checks the source as it is.
To use another browser, set `CHECK_BROWSER` to its path. It checks that:

1. The page loads with no console errors, asks no other site for anything, and shows Geist and Geist Mono.
2. Every built-in preset draws, opens in its own pattern and shows its controls.
3. Every moving preset loops without a seam (its first frame and the frame at the loop length match).
4. No method words (Fourier, Chladni, Gibbs, vector field…) appear in any pattern's panel, tooltip or preset name.
5. Share links and preset JSON round-trip for every preset, and a save from before the `plate` rename still opens.
6. PNG, SVG and animated SVG exports download and parse, for every moving preset.
7. Orbit's animated SVG (Flow, Sway, and Pulse) and Silhouette's (Roll and Drift), frozen at set moments, match
   the app within 4/255 and loop without a seam.
8. The presets window opens on the current preset, with the group bar on its group.
9. The sticker survives a share link and exports as PNG, SVG and animated SVG, cut out (transparent round its
   outline, Transparent on or off); the seed dice never turns it back on.
10. Silhouette's fold: stripes edge to edge, bars thickest away from the fold; Roll and Drift loop one way and
    smoothly (no frame jumps more than 1.7 times the typical change).
11. Hidden errors, the kind that pass a glance at the code but not someone using the app:
    - every preset that moves moves on screen, and every still one keeps still (screenshots a second apart), and
      moving ones still move on the sticker;
    - seed remixes of a moving preset still move;
    - every slider and choice on every preset changes the drawing (none is dead), and none breaks it;
    - every preset in every format, and ten remixes of each, draws something, with valid numbers, on the page;
    - a returning session opens an untouched built-in preset as it is now (so fixes reach it) and keeps edits;
    - the centre knob (Orbit, Eddy, Silhouette) shows uncovered in Fill and Fit, and dragging it moves the centre.
12. With `--dist`: the published `index.html` and `engine.js` carry no comments.

It ends with "All checks passed." (exit code 0), or names each failure. Still by hand, in the browser:

1. Drag a few sliders on each pattern; nothing blanks, and it still looks right.
2. Press the seed dice a few times on Wave Rows and on a studio pattern; results stay uniform. Press shuffle: it
   opens another pattern, and one undo comes back.
3. Export a video; it opens and loops.
4. After the merge deploys, open the live site: it looks as the preview did.

## Deploy

### Preview, then go live

`main` is the live site: every push to it deploys within a minute. So changes go to a branch first:

1. Push the work to a branch (any name but `main`). Cloudflare Pages builds a preview of it at
   `https://<branch>.onesyntax-pattern-generator.pages.dev`, the branch name in lower case with anything but
   letters and digits turned into hyphens (`claude/sharp-davinci-3zf2xr` →
   `claude-sharp-davinci-3zf2xr.onesyntax-pattern-generator.pages.dev`). The link is also under **Workers & Pages →
   onesyntax-pattern-generator → Deployments**.
2. Run `npm run check -- --dist`, and look the preview over.
3. Open a pull request into `main` and merge it. The live site updates within a minute.

If a branch gets no preview, turn previews on under **Settings → Builds → Branch control** (preview branches: all
non-production branches).

Only the app is published, with every comment stripped: `publish.sh` installs terser (`npm install`) and runs
`build.mjs`, which writes `index.html`, `engine.js` and `brand/` into `dist/` with HTML, CSS and JavaScript comments
removed (names and logic untouched: no compression, no renaming). The notes on how the patterns are made stay in
the source and in these .md files, which are Haux Studio's: they, the build scripts and the preview server never
go live or to the client.

**Cloudflare Pages (recommended):** free for commercial use, and Cloudflare Access can limit the site to the
team's email addresses.

1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**, and pick the repository.
2. Framework preset **None**, build command **`sh publish.sh`**, build output directory **`dist`**.
3. Deploy. Every push to `main` then redeploys.
4. Optional: **Zero Trust → Access → Applications** → add the site and allow only the team's emails.

Netlify and Vercel take the same build command and output directory. Vercel's free plan is for
non-commercial use only.

### Handing over to the client

Hand over the published site, never this repository: its history holds the reference images and every note.
Once a push has deployed, from this folder:

```bash
powershell -ExecutionPolicy Bypass -File handover.ps1
```

It downloads the site exactly as served (comments already stripped), checks no comment slipped through, adds a
short hosting note (README.txt) and zips it as `OneSyntax-Pattern-Generator.zip` beside this folder. If the client
wants a repository, make a new one from that folder, so it starts with no history.

### Saving changes to GitHub

This folder is a Git working copy of that repository. Changes go on a branch, so they get a preview before they go
live (see Preview, then go live). From this folder, start a branch for the change:

```bash
git switch -c describe-the-change
```

After changing files:

```bash
git add -A
```

```bash
git commit -m "Describe the change"
```

```bash
git push -u origin describe-the-change
```

Check the preview, then open a pull request into `main` on GitHub and merge it. Afterwards, back on `main`:

```bash
git switch main
```

```bash
git pull
```

Saved presets live in each browser's storage for the address the page is served from, so a new URL starts with
none. Export them as JSON before moving, and import them on the new site.
