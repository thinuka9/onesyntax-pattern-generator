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
  return { name: file.suggestedFilename(), bytes: (await stat(path)).size, text: async () => readFile(path, 'utf8') };
}
const parses = (svg) => page.evaluate((text) => !new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror'), svg);

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
    for (let i = 0; i < a.count * STRIDE; i++) worst = Math.max(worst, Math.abs(a.instances[i] - z.instances[i]));
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
  for (const name of ['Hello World', 'Event Stream', 'Schema', 'Scope']) {
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

await check('Orbit animated SVG matches the app frame by frame', async () => {
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
  await view.close();
  return `within ${Math.max(...results).toFixed(2)}/255`;
});

await check('Presets window opens on the current pattern, with its group bar', async () => {
  await page.evaluate(() => applyPreset('builtin:Cluster'));
  await page.click('#presetButton');
  await page.waitForTimeout(900);
  const view = await page.evaluate(() => {
    const d = document.getElementById('looks'), card = d.querySelector('.look-card.current'), box = d.getBoundingClientRect(), r = card.getBoundingClientRect();
    return { shown: r.top >= box.top && r.bottom <= box.bottom, group: document.querySelector('#looksNav [aria-current="true"]')?.textContent, groups: document.querySelectorAll('#looksNav button').length };
  });
  await page.keyboard.press('Escape');
  expect(view.shown, 'the current preset is not in view');
  expect(view.group === 'Wave studies' && view.groups === 5, `group bar shows ${view.group} of ${view.groups} groups`);
});

await check('Sticker: link round-trip and exports', async () => {
  await page.evaluate(() => { applyPreset('builtin:Threads'); state.values.sticker = { ...STICKER_DEFAULTS, on: 'on', title: 'Shipped', subtitle: 'Release 142' }; requestRender(); });
  const back = await page.evaluate(async () => { const st = await decodeLook(await encodeLook(state)); return stickerOn(st) && st.values.sticker.title === 'Shipped'; });
  expect(back, 'the sticker did not survive a share link');
  const png = await download(() => exportPNG(1));
  expect(png.name.includes('sticker') && png.bytes > 10000, `the sticker PNG looks wrong (${png.name}, ${png.bytes} bytes)`);
  const svg = await (await download(() => exportSVG())).text();
  expect(await parses(svg) && svg.includes('id="sticker"') && svg.includes('Release 142'), 'the sticker SVG does not parse or lacks its parts');
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
    const v = { ...state.values, motion: 'none' }, g = silhouetteGeometry(v, 0), I = g.instances, marks = [];
    for (let n = 0; n < g.count; n++) marks.push({ y: I[n * STRIDE + 1], w: I[n * STRIDE + 2], h: I[n * STRIDE + 3] });
    const byRow = new Map();
    for (const m of marks) { const k = Math.round(m.y); byRow.set(k, (byRow.get(k) || []).concat(m)); }
    const rows = [...byRow.values()];
    // Each stripe spans the page edge to edge, and its thickest part is thickest far from the fold.
    return { rows: rows.length, lines: v.lines, spans: rows.map((r) => r.reduce((a, m) => a + m.w, 0)), first: Math.max(...rows[0].map((m) => m.h)), middle: Math.max(...rows[Math.floor(rows.length / 2)].map((m) => m.h)) };
  });
  expect(rows.rows === rows.lines, `${rows.rows} stripes drawn for ${rows.lines}`);
  expect(Math.max(...rows.spans) - Math.min(...rows.spans) < 2, 'a stripe does not run edge to edge');
  expect(rows.first > rows.middle * 2, `the bars do not thicken away from the fold (${rows.first} against ${rows.middle})`);
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
