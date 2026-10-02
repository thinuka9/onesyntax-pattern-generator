// Quality check: render every preset to out/<Preset-Name>.png + .svg through the real app.
// Usage: npm run check   (env CHROME_PATH overrides the browser; env CHECK_TIME / CHECK_SCALE optional)
//
// Starts a Vite dev server, drives the system Chrome (or Edge) headless via playwright-core,
// waits for window.__osp.ready and calls the check hook described in the brief:
//   __osp.renderPNG(name, scale, time) → data URL, __osp.renderSVG(name, time) → SVG text,
//   __osp.markCount(name, time) → number.
// Exits non-zero if the app fails to initialise, any preset throws, or any render is blank.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');
const TIME = Number(process.env.CHECK_TIME ?? 2.0);
const SCALE = Number(process.env.CHECK_SCALE ?? 1);

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const slug = (name) => name.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, '') || 'Untitled';

async function main() {
  const executablePath = BROWSERS.find((p) => existsSync(p));
  if (!executablePath) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
  mkdirSync(outDir, { recursive: true });

  const server = await createServer({
    root,
    logLevel: 'warn',
    server: { port: 5180, strictPort: false, open: false },
  });
  let browser;
  let failures = 0;
  try {
    await server.listen();
    const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5180/';
    console.log(`vite   ${url}`);
    console.log(`browser ${executablePath}`);

    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    // HTTP failures are reported with their URL here (the browser's own console line has none);
    // a missing /favicon.ico is harmless and ignored.
    page.on('response', (res) => {
      if (res.status() < 400) return;
      const u = new URL(res.url());
      if (u.pathname === '/favicon.ico') return;
      const line = `[http ${res.status()}] ${u.pathname}`;
      pageErrors.push(line);
      console.log(line);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().startsWith('Failed to load resource')) return; // see 'response'
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const line = `[page ${msg.type()}] ${msg.text()}`;
        if (msg.type() === 'error') pageErrors.push(line);
        console.log(line);
      }
    });
    page.on('pageerror', (err) => {
      const line = `[page exception] ${err.message}`;
      pageErrors.push(line);
      console.log(line);
    });

    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__osp?.ready === true, null, { timeout: 30000 });
    } catch {
      throw new Error('window.__osp.ready never became true (app failed to initialise)');
    }

    const names = await page.evaluate(() => window.__osp.presets);
    console.log(`\n${names.length} presets · time ${TIME}s · scale ${SCALE}×\n`);
    console.log('preset'.padEnd(20) + 'marks'.padStart(8) + 'png ms'.padStart(9) + 'svg ms'.padStart(9) + '  size'.padEnd(14) + 'ink%'.padStart(7) + '  status');

    for (const name of names) {
      let res;
      try {
        res = await page.evaluate(
          async ({ name, time, scale }) => {
            const osp = window.__osp;
            const t0 = performance.now();
            const png = await osp.renderPNG(name, scale, time);
            const t1 = performance.now();
            const svg = osp.renderSVG(name, time);
            const t2 = performance.now();
            const marks = osp.markCount(name, time);

            // Blank detection: decode the PNG and measure how many pixels differ from the background
            // (taken as the top-left pixel) plus the luminance spread.
            const img = new Image();
            img.src = png;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            const r0 = d[0], g0 = d[1], b0 = d[2];
            let differ = 0, sum = 0, sum2 = 0;
            const n = d.length / 4;
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], g = d[i + 1], b = d[i + 2];
              if (Math.abs(r - r0) > 6 || Math.abs(g - g0) > 6 || Math.abs(b - b0) > 6) differ++;
              const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += l;
              sum2 += l * l;
            }
            const mean = sum / n;
            const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
            return {
              png, svg, marks,
              pngMs: t1 - t0, svgMs: t2 - t1,
              width: c.width, height: c.height,
              inkFraction: differ / n, lumStd: std,
            };
          },
          { name, time: TIME, scale: SCALE },
        );
      } catch (err) {
        failures++;
        console.log(`${name.padEnd(20)}  THREW: ${String(err?.message ?? err).split('\n')[0]}`);
        continue;
      }

      const file = slug(name);
      const b64 = res.png.slice(res.png.indexOf(',') + 1);
      writeFileSync(join(outDir, `${file}.png`), Buffer.from(b64, 'base64'));
      writeFileSync(join(outDir, `${file}.svg`), res.svg, 'utf8');

      const problems = [];
      if (!res.png.startsWith('data:image/png')) problems.push('not a PNG data URL');
      if (res.inkFraction < 0.002 || res.lumStd < 0.5) problems.push('BLANK render');
      if (!res.marks || res.marks <= 0) problems.push('0 marks');
      if (!/<svg[\s>]/.test(res.svg) || res.svg.length < 200) problems.push('empty SVG');
      if (problems.length) failures++;

      console.log(
        name.padEnd(20) +
          String(res.marks).padStart(8) +
          res.pngMs.toFixed(0).padStart(9) +
          res.svgMs.toFixed(0).padStart(9) +
          `  ${res.width}×${res.height}`.padEnd(14) +
          (res.inkFraction * 100).toFixed(1).padStart(7) +
          '  ' + (problems.length ? 'FAIL: ' + problems.join(', ') : 'ok'),
      );
    }

    if (pageErrors.length) {
      console.log(`\n${pageErrors.length} page error(s) logged above.`);
      failures += pageErrors.length;
    }
    console.log(`\nWrote ${outDir}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
  return failures;
}

main().then(
  (failures) => {
    console.log(failures ? `\nCHECK FAILED (${failures})` : '\nCHECK PASSED');
    process.exit(failures ? 1 : 0);
  },
  (err) => {
    console.error('\nCHECK ERROR:', err?.stack ?? err);
    process.exit(1);
  },
);
