// Release checks: opens the app in a real browser and runs the checks BUILD.md lists, in about a minute.
//   npm install            (once: terser for the build, playwright-core to drive the browser)
//   npm run check          the source, as it is in this folder
//   npm run check -- --dist   builds the published site first (build.mjs) and checks that instead
// It uses Edge or Chrome as installed (no browser download); set CHECK_BROWSER to a browser's path to pick one.
// Exit code 0 when everything passes. Video export and how things look still want a person (BUILD.md).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const dist = process.argv.includes('--dist');
if (dist) execFileSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
const root = join(process.cwd(), dist ? 'dist' : '.');

// ---------- A static server for the folder (the page must be served, not opened from disk) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown' };
const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = join(root, path);
  try {
    if (!file.startsWith(root) || !(await stat(file)).isFile()) throw new Error('not found');
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

async function launch() {
  if (process.env.CHECK_BROWSER) return chromium.launch({ executablePath: process.env.CHECK_BROWSER });
  for (const channel of ['msedge', 'chrome']) { try { return await chromium.launch({ channel }); } catch {} }
  try { return await chromium.launch(); } catch {}
  throw new Error('No browser found: install Edge or Chrome, or set CHECK_BROWSER to a Chromium-based browser.');
}

// ---------- Reporting ----------
let failures = 0;
async function check(name, run) {
  const started = Date.now();
  try {
    const note = await run();
    console.log(`  ok    ${name}${note ? ` · ${note}` : ''} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (error) {
    failures++;
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).split('\n').join('\n        ')}`);
  }
}
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const problems = [], outside = [];
page.on('pageerror', (error) => problems.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
page.on('request', (request) => { const url = request.url(); if (!url.startsWith(origin) && !/^(data|blob):/.test(url)) outside.push(url); });
console.log(`Checking ${dist ? 'the published build (dist/)' : 'the source'} in ${browser.version()}`);
await page.goto(origin + '/');
await page.waitForFunction(() => typeof BUILT_INS !== 'undefined' && document.fonts.status === 'loaded');
/** Runs an export the way its menu item does and returns the downloaded file's name and size. */
async function download(trigger) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(trigger)]);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: (await stat(path)).size, text: async () => readFile(path, 'utf8'), base64: async () => (await readFile(path)).toString('base64') };
}
const parses = (svg) => page.evaluate((text) => !new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror'), svg);
/** How far two PNG screenshots (base64) differ, in 0..255 per pixel on average. */
const pixelDifference = (a, b) => page.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'), g = c.getContext('2d');
  c.width = ia.width; c.height = ia.height;
  g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
  g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0; for (let i = 0; i < da.length; i += 4) sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
  return sum / (da.length / 4);
}, [a, b]);
/** How much the artwork changes on screen over most of a second. */
async function screenMotion() {
  const clip = { x: 80, y: 80, width: 560, height: 560 };
  await page.waitForTimeout(1100);  // past the cross-fade from what was showing before
  const a = (await page.screenshot({ clip })).toString('base64');
  await page.waitForTimeout(700);
  return pixelDifference(a, (await page.screenshot({ clip })).toString('base64'));
}

await check('Loads without errors, entirely from this site, in Geist', async () => {
  await page.waitForTimeout(800);
  expect(!problems.length, `Console errors:\n${problems.join('\n')}`);
  expect(!outside.length, `Requests to other sites:\n${outside.join('\n')}`);
  const fonts = await page.evaluate(() => [document.fonts.check('500 16px Geist'), document.fonts.check('500 16px "Geist Mono"'), typeof window.Motion]);
  expect(fonts[0] && fonts[1], 'Geist or Geist Mono did not load');
  expect(fonts[2] === 'object', 'Motion did not load');
});

await check('Every built-in preset draws and opens in its own pattern', async () => {
  const bad = await page.evaluate(() => BUILT_INS.filter((b) => {
    applyPreset('builtin:' + b.name);
    const geo = geometryFor(state, 0);
    return state.pattern !== b.pattern || !geo.count || !document.querySelector('.panel .row, .panel [role]');
  }).map((b) => b.name));
  expect(!bad.length, `These did not draw or show controls: ${bad.join(', ')}`);
  return `${await page.evaluate(() => BUILT_INS.length)} presets`;
});

await check('Every moving preset loops without a seam', async () => {
  const seams = await page.evaluate(() => BUILT_INS.map((b) => {
    const st = presetState('builtin:' + b.name);
    if (!isAnimated(st)) return null;
    const a = geometryFor(st, 0), z = geometryFor(st, loopSeconds(st));
    if (a.count !== z.count) return `${b.name}: ${a.count} marks at the start, ${z.count} at the end`;
    let worst = 0;
    // What shows, not the marks' numbers: Silhouette's travelling stripes each take another's place by the end.
    for (let i = 0; i < a.count * STRIDE; i++) if (i % STRIDE !== 13) worst = Math.max(worst, Math.abs(a.instances[i] - z.instances[i]));
    return worst > 1e-3 ? `${b.name}: frames differ by ${worst}` : null;
  }).filter(Boolean));
  expect(!seams.length, seams.join('\n'));
});

await check('No method words in what the app shows', async () => {
  const words = await page.evaluate(() => {
    const banned = /fourier|chladni|gibbs|vector field|distance transform|b-spline|felzenszwalb|catmull|peucker|douglas/i, found = new Set();
    for (const name of [...new Set(BUILT_INS.map((b) => b.pattern))]) {
      applyPreset('builtin:' + firstPreset(name).name);
      const text = [document.body.innerText, ...[...document.querySelectorAll('[title], [data-tip], [aria-label]')].flatMap((el) => [el.title, el.dataset.tip, el.getAttribute('aria-label')])].join('\n');
      for (const match of text.match(new RegExp(banned, 'gi')) || []) found.add(`${name}: "${match}"`);
    }
    for (const b of BUILT_INS) if (banned.test(b.name)) found.add(`preset name: ${b.name}`);
    return [...found];
  });
  expect(!words.length, words.join('\n'));
});

await check('Share links, saved presets and older saves round-trip', async () => {
  const broken = await page.evaluate(async () => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), out = [];
    for (const b of BUILT_INS) {
      const st = presetState('builtin:' + b.name);
      if (!same((await decodeLook(await encodeLook(st))).values, st.values)) out.push(`link: ${b.name}`);
      const saved = fromImported({ v: STORAGE_VERSION, name: 'x', pattern: st.pattern, values: structuredClone(st.values) }, 'x');
      if (!same(saved.values, st.values)) out.push(`preset JSON: ${b.name}`);
    }
    // A plate saved under its old key (before 5 October) opens with the same settings.
    const old = structuredClone(presetState('builtin:Overflow').values);
    old.field.chladni = { ...old.field.plate, n: 9 }; delete old.field.plate;
    const back = fromImported({ v: 5, name: 'old', pattern: 'Cymatics', values: old }, 'old');
    if (!back || back.values.field.plate.n !== 9 || 'chladni' in back.values.field) out.push('old plate key did not convert');
    return out;
  });
  expect(!broken.length, broken.join('\n'));
});

await check('Exports: PNG, SVG and animated SVG', async () => {
  const notes = [];
  await page.evaluate(() => applyPreset('builtin:Hello World'));
  const png = await download(() => exportPNG(1));
  expect(png.name.endsWith('.png') && png.bytes > 10000, `PNG looks empty (${png.bytes} bytes)`);
  for (const name of ['Hello World', 'Event Stream', 'Data Flow', 'Scope']) {
    await page.evaluate((n) => applyPreset('builtin:' + n), name);
    const svg = await download(() => exportSVG());
    expect(await parses(await svg.text()), `${name}: the SVG does not parse`);
  }
  const moving = await page.evaluate(() => BUILT_INS.filter((b) => isAnimated(presetState('builtin:' + b.name))).map((b) => b.name));
  for (const name of moving) {
    await page.evaluate((n) => applyPreset('builtin:' + n), name);
    const file = await download(() => exportAnimatedSVG());
    const text = await file.text();
    // Marks sharing a motion move by CSS animation, the rest by SMIL.
    expect(await parses(text) && /<animate|@keyframes/.test(text), `${name}: the animated SVG does not parse or does not move`);
    notes.push(`${name} ${Math.round(file.bytes / 1e3)} KB`);
  }
  return `animated: ${notes.join(', ')}`;
});

await check('Orbit and Silhouette animated SVGs match the app frame by frame', async () => {
  const view = await browser.newPage({ viewport: { width: 700, height: 700 } });
  const shot = async (svg, t) => {
    await view.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg id="s" style="width:600px;height:600px;display:block" ')}</body>`);
    if (t != null) await view.evaluate((at) => { const s = document.getElementById('s'); s.pauseAnimations(); s.setCurrentTime(at); }, t);
    return (await view.locator('#s').screenshot()).toString('base64');
  };
  const difference = (a, b) => page.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = ia.width; c.height = ia.height;
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < da.length; i += 4) sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
    return sum / (da.length / 4);
  }, [a, b]);
  const results = [];
  for (const [name, settings] of [['Event Stream', { motion: 'flow', speed: 1 }], ['Event Stream', { motion: 'sway', speed: 1 }], ['Event Queue', { motion: 'none', pulse: { enabled: true, opacityMin: 0.2, opacityMax: 1, sizeMin: 0.5, sizeMax: 1.2, frequency: 2, direction: 30, phase: 0, sharpness: 1, speed: 1, shape: 'sine', harmonics: 8 } }]]) {
    const files = await page.evaluate(([n, extra]) => {
      applyPreset('builtin:' + n); Object.assign(state.values, extra);
      const { svg, loop } = orbitAnimatedSVG(state);
      return { svg, loop, stills: [0.3, 0.7].map((f) => orbitSVG(state, f * loop)) };
    }, [name, settings]);
    for (const [i, f] of [0.3, 0.7].entries()) {
      const off = await difference(await shot(files.svg, f * files.loop), await shot(files.stills[i]));
      results.push(off);
      expect(off < 4, `${name} ${settings.motion}${settings.pulse ? ' with Pulse' : ''}: ${off.toFixed(2)}/255 from the app at ${f} of the loop`);
    }
    const seam = await difference(await shot(files.svg, 0), await shot(files.svg, files.loop));
    expect(seam < 0.2, `${name} ${settings.motion}: the loop shows a seam (${seam.toFixed(2)}/255)`);
  }
  // Silhouette's stripes move through the shape (Roll) or inside it (Drift); the file follows them stripe by stripe.
  for (const motion of ['roll', 'drift']) {
    const files = await page.evaluate((m) => {
      applyPreset('builtin:Merge'); state.values.motion = m;
      const { svg, loop } = animatedSVG(state), still = (t) => { const g = geometryFor(state, t); return E.toSVG(g, g.params, state, {}); };
      return { svg, loop, stills: [0.3, 0.7].map((f) => still(f * loop)) };
    }, motion);
    for (const [i, f] of [0.3, 0.7].entries()) {
      const off = await difference(await shot(files.svg, f * files.loop), await shot(files.stills[i]));
      results.push(off);
      expect(off < 4, `Merge ${motion}: ${off.toFixed(2)}/255 from the app at ${f} of the loop`);
    }
    const seam = await difference(await shot(files.svg, 0), await shot(files.svg, files.loop));
    expect(seam < 0.2, `Merge ${motion}: the loop shows a seam (${seam.toFixed(2)}/255)`);
  }
  await view.close();
  return `within ${Math.max(...results).toFixed(2)}/255`;
});

await check('Presets window opens on the current pattern, with its group bar', async () => {
  await page.evaluate(() => applyPreset('builtin:Cluster'));
  await page.click('#presetButton');
  await page.waitForTimeout(900);
  const view = await page.evaluate(() => {
    const d = document.getElementById('looks'), card = d.querySelector('.look-card.current'), box = d.getBoundingClientRect(), r = card.getBoundingClientRect();
    return { shown: r.top >= box.top && r.bottom <= box.bottom, group: document.querySelector('#looksNav [aria-current="true"]')?.textContent, groups: document.querySelectorAll('#looksNav button').length, patterns: PATTERNS.length };
  });
  await page.keyboard.press('Escape');
  expect(view.shown, 'the current preset is not in view');
  // A heading per pattern, after Saved; Cluster is an Interference preset.
  expect(view.group === 'Interference' && view.groups === view.patterns + 1, `group bar shows ${view.group} of ${view.groups} groups`);
});

await check('Sticker: link round-trip and exports', async () => {
  await page.evaluate(() => { applyPreset('builtin:Threads'); state.values.sticker = { ...STICKER_DEFAULTS, on: 'on', title: 'Shipped', subtitle: 'Release 142' }; requestRender(); });
  const back = await page.evaluate(async () => { const st = await decodeLook(await encodeLook(state)); return stickerOn(st) && st.values.sticker.title === 'Shipped'; });
  expect(back, 'the sticker did not survive a share link');
  const png = await download(() => exportPNG(1));
  expect(png.name.includes('sticker') && png.bytes > 10000, `the sticker PNG looks wrong (${png.name}, ${png.bytes} bytes)`);
  // Cut out: the corners outside the outline are see-through, whatever Transparent is set to; inside is solid.
  for (const transparent of [false, true]) {
    await page.evaluate((t) => { exportOptions.transparent = t; }, transparent);
    const file = await download(() => exportPNG(1));
    const alpha = await page.evaluate(async (b64) => {
      const img = await new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const at = (x, y) => g.getImageData(Math.round(x * img.width), Math.round(y * img.height), 1, 1).data[3];
      return { corners: [at(0.02, 0.02), at(0.98, 0.98)], middle: at(0.5, 0.5) };
    }, await file.base64());
    expect(alpha.corners.every((a) => a === 0) && alpha.middle === 255, `the sticker PNG is not cut out (Transparent ${transparent}: corners ${alpha.corners}, middle ${alpha.middle})`);
  }
  await page.evaluate(() => { exportOptions.transparent = false; });
  const svg = await (await download(() => exportSVG())).text();
  expect(await parses(svg) && svg.includes('id="sticker"') && svg.includes('Release 142'), 'the sticker SVG does not parse or lacks its parts');
  expect(!svg.includes('id="page"'), 'the sticker SVG has a page behind it: it should be cut out');
  await page.evaluate(() => { applyPreset('builtin:Event Stream'); state.values.motion = 'flow'; });
  const moving = await (await download(() => exportAnimatedSVG())).text();
  expect(await parses(moving) && /<animate/.test(moving) && moving.includes('id="sticker"'), 'the animated sticker SVG does not parse or does not move');
  await page.evaluate(() => { state.values.sticker.on = 'off'; requestRender(); });
  // A preset loaded while the sticker was on still starts with it; a seed remix after turning it off must keep it off.
  const after = await page.evaluate(() => {
    state.values.sticker.on = 'on'; applyPreset('builtin:Query'); state.values.sticker.on = 'off'; newVariation(); return stickerOn(state);
  });
  expect(!after, 'the seed dice turned the sticker back on');
  const schemes = await page.evaluate(() => Object.values(STICKER_SCHEMES).filter((x) => [x.fill, x.title, x.art].every((c) => /^#[0-9A-F]{6}$/.test(c))).length);
  expect(schemes === Object.keys(await page.evaluate(() => STICKER_SCHEMES)).length && schemes > 5, 'a sticker scheme has a broken colour');
});

await check('Silhouette Fold: thin stripes, thick bars round the shape above the fold and inside it below', async () => {
  const rows = await page.evaluate(() => {
    applyPreset('builtin:Merge');
    const v = { ...state.values, motion: 'none' }, g = silhouetteGeometry(v, 0), I = g.instances;
    // Pieces by stripe (a stripe's marks share its number's block of 48), each stripe's pieces as spans across.
    const byRow = new Map();
    for (let n = 0; n < g.count; n++) {
      const o = n * STRIDE, row = Math.floor(I[o + 13] / 48);
      byRow.set(row, (byRow.get(row) || []).concat({ a: I[o] - I[o + 2] / 2, b: I[o] + I[o + 2] / 2, h: I[o + 3] }));
    }
    const rows = [...byRow.keys()].sort((x, y) => x - y).map((k) => byRow.get(k));
    const covered = (pieces) => { let total = 0, end = -Infinity; for (const p of [...pieces].sort((x, y) => x.a - y.a)) { total += Math.max(0, p.b - Math.max(p.a, end)); end = Math.max(end, p.b); } return total; };
    // Each stripe spans the page edge to edge, and its thickest part is thickest far from the fold.
    return { rows: rows.length, lines: v.lines, spans: rows.map(covered), first: Math.max(...rows[0].map((m) => m.h)), middle: Math.max(...rows[Math.floor(rows.length / 2)].map((m) => m.h)) };
  });
  expect(rows.rows === rows.lines, `${rows.rows} stripes drawn for ${rows.lines}`);
  expect(Math.max(...rows.spans) - Math.min(...rows.spans) < 2, 'a stripe does not run edge to edge');
  expect(rows.first > rows.middle * 2, `the bars do not thicken away from the fold (${rows.first} against ${rows.middle})`);
  // Drift and Roll run one way: they loop exactly, and never pass back through a frame they showed on the way out
  // (a swing would draw the same frame at a tenth and at four tenths of its loop).
  const motion = await page.evaluate(() => ['drift', 'roll'].map((m) => {
    const st = structuredClone(presetState('builtin:Merge')); st.values.motion = m;
    const L = loopSeconds(st), at = (t) => { const g = geometryFor(st, t); return Array.from(g.instances.slice(0, g.count * STRIDE)); };
    const same = (a, b) => a.length === b.length && a.every((x, i) => i % STRIDE === 13 || Math.abs(x - b[i]) < 1e-3);
    return [m, same(at(0), at(L)), !same(at(0.1 * L), at(0.4 * L))];
  }));
  for (const [m, loops, oneWay] of motion) expect(loops && oneWay, `${m}: ${loops ? 'swings back' : 'does not loop'}`);
  // Smooth: no frame of the loop jumps against the others (a stripe crossing the shape's flat top or bottom used to
  // switch all at once), and slow, in step with the other patterns.
  const smooth = await page.evaluate(() => ['roll', 'drift'].map((m) => {
    const st = structuredClone(presetState('builtin:Merge')); st.values.motion = m;
    const L = loopSeconds(st), c = document.createElement('canvas'); c.width = c.height = 400;
    const g = c.getContext('2d', { willReadFrequently: true });
    const frame = (t) => { const geo = geometryFor(st, t); g.clearRect(0, 0, 400, 400); draw(g, geo, 400 / geo.width); return g.getImageData(0, 0, 400, 400).data; };
    let previous = frame(0); const steps = [];
    for (let k = 1; k <= L * 30; k++) {
      const now = frame(k / 30); let sum = 0;
      for (let i = 0; i < now.length; i += 4) sum += Math.abs(now[i] - previous[i]) + Math.abs(now[i + 1] - previous[i + 1]) + Math.abs(now[i + 2] - previous[i + 2]);
      steps.push(sum); previous = now;
    }
    const sorted = [...steps].sort((a, b) => a - b);
    return [m, sorted[sorted.length - 1] / sorted[Math.floor(sorted.length / 2)]];
  }));
  for (const [m, jump] of smooth) expect(jump < 1.7, `${m}: a frame jumps ${jump.toFixed(2)} times the typical change`);
  // No slivers or specks, in every way of drawing the inside, shape and direction, still or moving: every piece sits
  // centred on a stripe of its own set (or is cut by the frame's edge), none is a hairline, and none is a dot.
  const loose = await page.evaluate(() => {
    const out = [];
    for (const inside of ['fold', 'bars', 'shift', 'gap']) for (const shape of ['symbol', 'mark', 'monogram']) for (const direction of ['across', 'down']) for (const motion of ['none', 'roll', 'drift']) {
      const st = structuredClone(presetState('builtin:Merge'));
      Object.assign(st.values, { inside, shape, direction, motion, lines: 26, weight: inside === 'fold' ? 0.12 : 0.3 });
      const v = st.values, side = Math.min(...FORMATS[v.format]), margin = v.margin * side, span = FORMATS[v.format][direction === 'down' ? 0 : 1];
      const pitch = (span - 2 * margin) / 26, thin = Math.min(0.96, v.weight) * pitch, L = loopSeconds(st);
      for (const t of motion === 'none' ? [0] : [0.13, 0.41, 0.77].map((f) => f * L)) {
        const g = geometryFor(st, t), I = g.instances, middles = new Map(), label = `${inside} ${shape} ${direction} ${motion} at ${t.toFixed(2)} s`;
        for (let n = 0; n < g.count; n++) {
          const o = n * STRIDE, across = direction === 'down' ? I[o] : I[o + 1], width = direction === 'down' ? I[o + 2] : I[o + 3], length = direction === 'down' ? I[o + 3] : I[o + 2];
          const cut = across - width / 2 <= margin + 0.01 || across + width / 2 >= span - margin - 0.01;
          if (cut) continue;
          if (width < 0.4 * thin) { out.push(`${label}: a hairline ${width.toFixed(1)} px thick`); break; }
          if (length < width * 0.99) { out.push(`${label}: a dot ${length.toFixed(1)} px long`); break; }
          const stripe = Math.floor(I[o + 13] / 48);
          if (!middles.has(stripe)) middles.set(stripe, across);
          else if (Math.abs(middles.get(stripe) - across) > 0.01) { out.push(`${label}: a piece ${Math.abs(middles.get(stripe) - across).toFixed(1)} px off its stripe`); break; }
        }
      }
    }
    return out.slice(0, 12);
  });
  expect(!loose.length, loose.join('\n'));
});

// ---------- Hidden errors: things that look fine in the code but not to someone using the app ----------
await check('Every preset that moves moves on screen, and every still one keeps still', async () => {
  const wrong = [], names = await page.evaluate(() => BUILT_INS.map((b) => b.name));
  await page.waitForTimeout(800);  // the page's own opening animation
  for (const name of names) {
    const moving = await page.evaluate((n) => { applyPreset('builtin:' + n); return isAnimated(state); }, name);
    const change = await screenMotion();
    if (moving ? change < 0.05 : change > 0.05) wrong.push(`${name}: ${moving ? 'should move but is still' : 'should be still but moves'} (${change.toFixed(2)})`);
  }
  // On the sticker too, for a pattern of each kind that moves.
  for (const name of ['Recursion', 'Merge', 'Query', 'Event Stream', 'Night Build']) {
    const moving = await page.evaluate((n) => { applyPreset('builtin:' + n); if (n === 'Event Stream') state.values.motion = 'flow'; state.values.sticker = { ...STICKER_DEFAULTS, on: 'on' }; buildPanel(); requestRender(); return isAnimated(state); }, name);
    const change = await screenMotion();
    if (moving && change < 0.05) wrong.push(`${name} on the sticker: should move but is still (${change.toFixed(2)})`);
  }
  await page.evaluate(() => { state.values.sticker.on = 'off'; buildPanel(); requestRender(); });
  expect(!wrong.length, wrong.join('\n'));
  return `${names.length} presets`;
});

await check('Seed remixes keep a moving preset moving', async () => {
  const still = await page.evaluate(async () => {
    const out = [];
    for (const b of BUILT_INS) {
      applyPreset('builtin:' + b.name);
      if (!isAnimated(state)) continue;
      for (const seed of [7, 4242, 9001]) {
        applySeed(seed);
        if (kindOf(state) === 'studio') await ensureLogoSdf(scaledStudio(state.values)).catch(() => {});  // the logo's distances come after a change
        const a = geometryFor(state, 0), z = geometryFor(state, 0.37 * loopSeconds(state));
        let change = a.count !== z.count;
        for (let i = 0; !change && i < a.count * STRIDE; i++) if (i % STRIDE !== 13 && Math.abs(a.instances[i] - z.instances[i]) > 1e-3) change = true;
        if (!isAnimated(state) || !change) out.push(`${b.name} seed ${seed}`);
      }
    }
    return out;
  });
  expect(!still.length, 'remixes that stopped moving: ' + still.join(', '));
});

await check('Every control changes the drawing', async () => {
  // On every built-in, every slider and choice showing is moved across its range and each option tried (Pulse's
  // with Pulse on); one that changes nothing, still or over the loop, is dead.
  const out = await page.evaluate(() => {
    const sig = (st) => {
      let h = 0, n = 0;
      for (const t of [0, 1.3, 0.37 * loopSeconds(st)]) {
        const g = geometryFor(st, t), I = g.instances;
        for (let i = 0; i < g.count * STRIDE; i++) if (i % STRIDE !== 13) h = (h * 31 + Math.round(I[i] * 1000)) | 0;
        n += g.count;
        const s = JSON.stringify([g.params.colour, g.params.canvas, g.width, g.height]);
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      }
      return h + ':' + n;
    };
    const dead = [], thrown = [];
    for (const bi of BUILT_INS) {
      const base = presetState('builtin:' + bi.name), pat = patternOf(base.pattern);
      const pulseOn = (st) => { if (st.values.pulse) Object.assign(st.values.pulse, { enabled: true, opacityMin: 0.2, sizeMin: 0.5, speed: st.values.pulse.speed || 1 }); return st; };
      const controls = [...pat.sections.filter((s) => !s[3] || s[3](base.values)).flatMap((s) => s[1].map((c) => [s[0], c])), ...pat.look.map((c) => ['Colour', c])]
        .filter(([, c]) => (c.type === 'range' || c.type === 'select') && (!c.when || c.when(base.values)));
      for (const [section, c] of controls) {
        const keys = keysOf(c), now = getPath(base.values, keys[0]);
        const tries = c.type === 'range'
          ? [0, 1, 0.5, 0.25, 0.75].map((f) => c.min + (c.max - c.min) * f).filter((x) => Math.abs(x - now) > 1e-9)
          : c.options.map((o) => o[1]).filter((x) => String(x) !== String(now));
        const start = section === 'Pulse' ? pulseOn(structuredClone(base)) : structuredClone(base);
        let ref;
        try { ref = sig(start); } catch (e) { thrown.push(`${bi.name}: ${e.message}`); continue; }
        let changed = false;
        for (const x of tries) {
          const st = structuredClone(start);
          for (const k of keys) setPath(st.values, k, c.type === 'range' ? x : (typeof now === 'number' ? Number(x) : x));
          try { if (sig(st) !== ref) changed = true; } catch (e) { thrown.push(`${bi.name} · ${c.label} = ${x}: ${e.message}`); }
        }
        if (tries.length && !changed) dead.push(`${bi.name} · ${section} · ${c.label}`);
      }
    }
    return { dead, thrown };
  });
  expect(!out.thrown.length, 'controls that break the drawing:\n' + out.thrown.join('\n'));
  expect(!out.dead.length, 'controls that change nothing:\n' + out.dead.join('\n'));
});

await check('Every preset draws in every format and remix: something, valid, on the page', async () => {
  const issues = await page.evaluate(() => {
    const issues = [];
    const inspect = (st, label) => {
      const L = loopSeconds(st);
      for (const t of [0, 0.25 * L, 0.5 * L, 0.9 * L]) {
        let g;
        try { g = geometryFor(st, t); } catch (e) { issues.push(`${label}: throws ${e.message}`); return; }
        // Bracket's Build takes the mark apart before it builds it again, so its page is empty for an instant.
        if (!g.count) { if (!(st.pattern === 'Bracket' && st.values.effect === 'build')) issues.push(`${label} at ${t.toFixed(2)} s: draws nothing`); continue; }
        const I = g.instances;
        let invalid = 0, inside = 0;
        for (let n = 0; n < g.count; n++) {
          for (let f = 0; f < 14; f++) if (!Number.isFinite(I[n * STRIDE + f])) invalid++;
          const x = I[n * STRIDE], y = I[n * STRIDE + 1];
          if (x >= -1 && x <= g.width + 1 && y >= -1 && y <= g.height + 1) inside++;
        }
        if (invalid) issues.push(`${label} at ${t.toFixed(2)} s: ${invalid} invalid numbers`);
        if (inside < g.count / 2) issues.push(`${label} at ${t.toFixed(2)} s: only ${inside} of ${g.count} marks on the page`);
      }
    };
    for (const b of BUILT_INS) {
      for (const f of Object.keys(FORMATS)) { applyPreset('builtin:' + b.name); setFormat(f); inspect(structuredClone(state), `${b.name} ${f}`); }
      applyPreset('builtin:' + b.name);
      for (let seed = 1; seed <= 10; seed++) inspect({ pattern: state.pattern, values: variationOf(state.pattern, baseline.values, seed * 977) }, `${b.name} seed ${seed * 977}`);
    }
    return issues;
  });
  expect(!issues.length, issues.join('\n'));
});

await check('A returning session opens untouched presets as they are now, and keeps edits', async () => {
  const open = async (session) => {
    const context = await browser.newContext();
    if (session) await context.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('wave-rows-session', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, session);
    const view = await context.newPage();
    await view.goto(origin + '/');
    await view.waitForFunction(() => typeof BUILT_INS !== 'undefined');
    const info = await view.evaluate(() => ({ speed: state.values.motion.speed, columns: state.values.layout.columns, sticker: state.values.sticker && state.values.sticker.on }));
    await context.close();
    return info;
  };
  // Recursion saved before it moved, as an older version left it (no record of edits), with its sticker on.
  const old = await page.evaluate(() => { const st = presetState('builtin:Recursion'); st.values.motion.speed = 0; st.values.sticker = { ...STICKER_DEFAULTS, on: 'on' }; return st; });
  const fresh = await open({ v: 5, state: old, current: 'builtin:Recursion' });
  expect(fresh.speed === 0.5 && fresh.sticker === 'on', `an untouched Recursion reopened with speed ${fresh.speed}, sticker ${fresh.sticker}`);
  const tweaked = structuredClone(old); tweaked.values.layout.columns = 22;
  const kept = await open({ v: 5, state: tweaked, current: 'builtin:Recursion', edited: true });
  expect(kept.columns === 22, `an edited Recursion lost its edit (${kept.columns} columns)`);
});

await check('The centre knob shows where it can be grabbed, and moves the centre', async () => {
  const wrong = [];
  for (const [name, view] of [['Event Stream', 'fill'], ['Event Stream', 'fit'], ['Event Queue', 'fit'], ['Event Loop', 'fill'], ['Data Flow', 'fill'], ['Refactor', 'fit'], ['Merge', 'fill'], ['Merge', 'fit']]) {
    await page.evaluate((n) => applyPreset('builtin:' + n), name);
    await page.click(`[data-view="${view}"]`);
    await page.waitForTimeout(500);
    await page.mouse.move(500, 450); await page.mouse.move(520, 470); await page.waitForTimeout(400);
    const knob = await page.evaluate(() => {
      const k = document.querySelector('#centreHandle .knob'), r = k.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return { shown: !document.getElementById('centreHandle').hidden && getComputedStyle(k).opacity === '1', x, y, top: document.elementFromPoint(x, y) === k };
    });
    if (!knob.shown || !knob.top) { wrong.push(`${name} (${view}): the knob is ${knob.shown ? 'covered' : 'not shown'} at ${Math.round(knob.x)}, ${Math.round(knob.y)}`); continue; }
    const before = await page.evaluate(() => { const c = centreOf(); return c.keys.map((k) => getPath(state.values, k)); });
    // A press or click leaves the centre alone, even when the knob shows at the art's edge for a centre off it.
    await page.mouse.move(knob.x, knob.y); await page.mouse.down(); await page.mouse.up();
    const clicked = await page.evaluate(() => { const c = centreOf(); return c.keys.map((k) => getPath(state.values, k)); });
    if (clicked.some((v, i) => v !== before[i])) wrong.push(`${name} (${view}): a click on the knob moved the centre`);
    await page.mouse.move(knob.x, knob.y); await page.mouse.down(); await page.mouse.move(knob.x + 90, knob.y + 70, { steps: 5 }); await page.mouse.up();
    const after = await page.evaluate(() => { const c = centreOf(); return c.keys.map((k) => getPath(state.values, k)); });
    if (after.every((v, i) => v === before[i])) wrong.push(`${name} (${view}): dragging the knob moved nothing`);
  }
  await page.click('[data-view="fill"]');
  expect(!wrong.length, wrong.join('\n'));
});

await check('The motion switch turns every look off and on, and back to its preset', async () => {
  const wrong = await page.evaluate(() => {
    const out = [];
    for (const b of BUILT_INS) {
      applyPreset('builtin:' + b.name);
      const wasMoving = isAnimated(state), able = wasMoving || looksMoving(withMotion(state));
      if (!able) {
        // Unavailable: says why, and a click changes nothing.
        const before = JSON.stringify(state.values);
        toggleMotion();
        if (JSON.stringify(state.values) !== before) out.push(`${b.name}: the switch changed a look with nothing to move`);
        if (!/can move/.test(stillReason())) out.push(`${b.name}: no reason given`);
        continue;
      }
      toggleMotion();
      if (isAnimated(state) === wasMoving) { out.push(`${b.name}: the switch did not turn motion ${wasMoving ? 'off' : 'on'}`); continue; }
      if (!wasMoving && !looksMoving(state)) out.push(`${b.name}: turned on, but nothing moves`);
      if (!edited()) out.push(`${b.name}: switched, but not marked edited`);
      toggleMotion();
      if (isAnimated(state) !== wasMoving) out.push(`${b.name}: switching back did not return its motion`);
      if (edited()) out.push(`${b.name}: switched off and on, but no longer the preset`);
    }
    return out;
  });
  expect(!wrong.length, wrong.join('\n'));
});

await check('A copied link opens exactly the look it was copied from, edits and all', async () => {
  // On every preset, a few of its sliders moved (its grid among them, when it has one), then the link opened again.
  const wrong = await page.evaluate(async () => {
    const out = [];
    for (const b of BUILT_INS) {
      const st = presetState('builtin:' + b.name), pat = patternOf(st.pattern);
      const sliders = pat.sections.flatMap((s) => s[1]).filter((c) => c.type === 'range' && (!c.when || c.when(st.values)));
      for (const c of sliders.slice(0, 4)) { const k = keysOf(c), now = getPath(st.values, k[0]), next = Math.min(c.max, now + (c.max - c.min) * 0.17); for (const key of k) setPath(st.values, key, Math.round(next / c.step) * c.step); }
      const back = await decodeLook(await encodeLook(st));
      const a = geometryFor(st, 0.7), z = geometryFor(back, 0.7);
      let same = a.count === z.count;
      for (let i = 0; same && i < a.count * STRIDE; i++) if (i % STRIDE !== 13 && Math.abs(a.instances[i] - z.instances[i]) > 1e-3) same = false;
      if (!same) out.push(b.name);
    }
    return out;
  });
  expect(!wrong.length, 'opened differently from the link: ' + wrong.join(', '));
});

if (dist) await check('The published files carry no comments', async () => {
  const code = (await readFile(join(root, 'index.html'), 'utf8')) + (await readFile(join(root, 'engine.js'), 'utf8'));
  const found = code.match(/<!--|\/\*\*|^\s*\/\/ /m);
  expect(!found, `a comment is left: "${found && code.slice(found.index, found.index + 60)}"`);
});

await check('No errors along the way', async () => { expect(!problems.length, problems.join('\n')); expect(!outside.length, outside.join('\n')); });

await browser.close();
server.close();
console.log(failures ? `\n${failures} check${failures > 1 ? 's' : ''} failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
