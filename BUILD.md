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
| Animated SVG | Built for the web: resolution-free, loops seamlessly, plays in browsers and `<img>` tags. Marks sharing a motion share one CSS animation; the rest keep only the keyframes they need. Most presets export at 15–400 KB. Orbit's Flow and Sway (without Pulse) slide whole dashes along their lines: Flow, Event Stream 0.37 MB and Event Queue 0.79 MB; Sway, Event Stream 0.71 MB and Event Queue 2.9 MB. Patterns with thousands of independently moving marks (Threads, Concurrency, Orbit with Pulse) stay heavy: use Video for those. Design tools import the first frame. |
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

There is no automated test runner (Node is used only to strip comments when publishing). Before shipping, in the
browser:

1. The page loads with no console errors, with the icons and Geist type showing.
2. Open every pattern from the Pattern menu, and step through its presets with ← →. Each draws, and the panel
   shows its controls.
3. Drag a few sliders on each pattern; nothing blanks or errors.
4. Press the seed dice a few times on Wave Rows and on a studio pattern; results stay uniform. Press shuffle: it
   opens another pattern, and one undo comes back.
5. Export a PNG at each scale, an SVG, an animated SVG and a video; each opens.
6. Save a preset, export the presets JSON, delete the preset, import the JSON back.
7. Copy link, open it in a new tab: the same preset appears.
8. After the push deploys, open the live site: no console errors, and no comments in its source.

## Deploy

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

This folder is a Git working copy of that repository (branch `main`). After changing files, from this folder:

```bash
git add -A
```

```bash
git commit -m "Describe the change"
```

```bash
git push
```

Saved presets live in each browser's storage for the address the page is served from, so a new URL starts with
none. Export them as JSON before moving, and import them on the new site.
