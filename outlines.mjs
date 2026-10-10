// Writes the outlines a sticker SVG is drawn with, so it opens cleanly in tools that drop text and fill touching
// shapes oddly (Blender, After Effects):
//   brand/onesyntax-os-monogram-solid.svg  the {OS} monogram with each part's pixel squares merged into one outline
//   vendor/fonts/geist-outlines.json        Geist Medium and Geist Mono Regular as outlines, advances and kerning
// Overlaps are removed (the variable fonts keep them, the "t" crossbar crosses its stem), since those tools fill
// overlapping contours as holes. Run again only if the fonts or the monogram change:
//   npm install && node outlines.mjs
import { readFile, writeFile } from 'node:fs/promises';
import * as fontkit from 'fontkit';
import wawoff2 from 'wawoff2';
import PathKitInit from 'pathkit-wasm/bin/pathkit.js';

const PathKit = await PathKitInit({ wasmBinary: await readFile(new URL("./node_modules/pathkit-wasm/bin/pathkit.wasm", import.meta.url)) });
const round = (x, places = 1) => { const v = Math.round(x * 10 ** places) / 10 ** places; return Object.is(v, -0) ? 0 : v; };

/** A path's outline with overlaps removed, as compact path data: lines, and curves as they come (quadratic or cubic). A curve whose
 *  handles sit on its chord is written as the line it is, and runs of lines along one direction as one. */
function solid(d, places) {
  // Each path is made solid on its own, then they are joined, so shapes that touch or overlap become one outline.
  const pieces = [].concat(d).map((one) => { const p = PathKit.FromSVGString(one); p.simplify(); return p; });
  const path = pieces.shift();
  for (const p of pieces) { path.op(p, PathKit.PathOp.UNION); p.delete(); }
  path.simplify();
  const commands = path.toCmds();
  path.delete();
  const out = [];
  let pen = null, start = null, last = null;  // last: the previous line's direction, to merge straight runs
  const n = (x) => String(round(x, places));
  const onChord = (a, b, c) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / l < 10 ** -places / 2; };
  const lineTo = (p) => {
    const dir = [p[0] - pen[0], p[1] - pen[1]], l = Math.hypot(...dir);
    if (l < 10 ** -places / 2) return;
    const unit = [dir[0] / l, dir[1] / l];
    if (last && out.length && out[out.length - 1][0] === 'L' && Math.abs(unit[0] * last[1] - unit[1] * last[0]) < 1e-6 && unit[0] * last[0] + unit[1] * last[1] > 0) out[out.length - 1] = ['L', p];
    else out.push(['L', p]);
    last = unit; pen = p;
  };
  for (const [verb, ...a] of commands) {
    if (verb === PathKit.MOVE_VERB) { pen = start = [a[0], a[1]]; out.push(['M', pen]); last = null; }
    else if (verb === PathKit.LINE_VERB) lineTo([a[0], a[1]]);
    else if (verb === PathKit.QUAD_VERB) {
      const q = [a[0], a[1]], p = [a[2], a[3]];
      if (onChord(pen, p, q)) { lineTo(p); continue; }
      out.push(['Q', q, p]);
      pen = p; last = null;
    } else if (verb === PathKit.CUBIC_VERB) {
      const c1 = [a[0], a[1]], c2 = [a[2], a[3]], p = [a[4], a[5]];
      if (onChord(pen, p, c1) && onChord(pen, p, c2)) { lineTo(p); continue; }
      out.push(['C', c1, c2, p]); pen = p; last = null;
    } else if (verb === PathKit.CLOSE_VERB) { out.push(['Z']); pen = start; last = null; }
    else throw new Error('unexpected path verb ' + verb);
  }
  // A closing line back to the start is implied by Z.
  for (let i = 1; i < out.length; i++) if (out[i][0] === 'Z' && out[i - 1][0] === 'L') {
    let m = i - 1; while (m >= 0 && out[m][0] !== 'M') m--;
    const s = out[m][1], p = out[i - 1][1];
    if (Math.abs(s[0] - p[0]) < 1e-9 && Math.abs(s[1] - p[1]) < 1e-9) { out.splice(i - 1, 1); i--; }
  }
  return out.map(([c, ...ps]) => c + ps.map((p) => `${n(p[0])} ${n(p[1])}`).join(' ')).join('');
}

// ---------- The monogram ----------
const MONOGRAM = 'brand/onesyntax-os-monogram.svg';
const source = await readFile(MONOGRAM, 'utf8');
const [, width, height] = source.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const parts = [...source.matchAll(/<g id="(Monogram Outline \d+)">([\s\S]*?)<\/g>/g)]
  .map(([, id, body]) => ({ id, d: solid([...body.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]), 3) }));
if (parts.length !== 3) throw new Error(`expected the monogram's three parts, found ${parts.length}`);
// Left to right: the opening brace, OS, the closing brace.
const left = (d) => Math.min(...d.match(/-?\d+\.?\d*/g).filter((_, i) => i % 2 === 0).map(Number));
parts.sort((a, b) => left(a.d) - left(b.d));
const names = ['brace-open', 'os', 'brace-close'];
await writeFile('brand/onesyntax-os-monogram-solid.svg', `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- ${MONOGRAM} with each part's pixel squares merged into one outline (outlines.mjs): the same shape, safe for tools that fill touching shapes as holes. -->
<g id="monogram">
${parts.map((p, i) => `<path id="monogram-${names[i]}" d="${p.d}" fill="white"/>`).join('\n')}
</g>
</svg>
`);

// ---------- The fonts ----------
// Glyph outlines for Latin (with Latin-1 and Extended A and B), punctuation, currency, letterlike symbols, arrows and
// maths; kerning among the characters a title is likely to use. Other scripts stay live text in the file.
const GLYPHS = (c) => c >= 0x20 && (c < 0x250 || (c >= 0x2000 && c < 0x2070) || (c >= 0x20A0 && c < 0x20D0) || (c >= 0x2100 && c < 0x2300));
const KERNED = (c) => c >= 0x20 && (c < 0x7F || (c >= 0xA0 && c < 0x180) || [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x20AC, 0x2122].includes(c));
const NO_LIGATURES = { liga: false, clig: false, dlig: false, calt: false, rlig: false };  // the app's type is tracked, which turns ligatures off

async function outlines(file, wght) {
  const font = fontkit.create(Buffer.from(await wawoff2.decompress(await readFile(`vendor/fonts/${file}`)))).getVariation({ wght });
  const chars = font.characterSet.filter(GLYPHS).sort((a, b) => a - b), glyphs = {};
  for (const c of chars) {
    const glyph = font.glyphForCodePoint(c), d = glyph.path.toSVG();
    glyphs[String.fromCodePoint(c)] = d ? [round(glyph.advanceWidth), solid(d, 0)] : [round(glyph.advanceWidth)];
  }
  // Kerning as classes: characters whose kerning rows match share a left class, matching columns a right class.
  const kerned = chars.filter(KERNED).map((c) => String.fromCodePoint(c)), size = kerned.length, table = new Float64Array(size * size);
  let any = false;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    const run = font.layout(kerned[i] + kerned[j], NO_LIGATURES);
    if (run.glyphs.length !== 2) continue;
    const k = round(run.positions[0].xAdvance - run.glyphs[0].advanceWidth);
    if (k) { table[i * size + j] = k; any = true; }
  }
  const classes = (key) => {
    const byKey = new Map();
    for (let i = 0; i < size; i++) { const k = key(i); if (/[^0,]/.test(k)) (byKey.get(k) || byKey.set(k, []).get(k)).push(i); }
    return [...byKey.values()];
  };
  const leftClasses = any ? classes((i) => Array.from(table.subarray(i * size, (i + 1) * size)).join(',')) : [];
  const rightClasses = any ? classes((j) => Array.from({ length: size }, (_, i) => table[i * size + j]).join(',')) : [];
  const pairs = [];
  leftClasses.forEach((ls, l) => rightClasses.forEach((rs, r) => { const v = table[ls[0] * size + rs[0]]; if (v) pairs.push([l, r, v]); }));
  return {
    unitsPerEm: font.unitsPerEm,
    glyphs,
    kerning: { left: leftClasses.map((ls) => ls.map((i) => kerned[i]).join('')), right: rightClasses.map((rs) => rs.map((j) => kerned[j]).join('')), pairs },
  };
}

const data = {
  note: 'Geist (SIL Open Font License, vendor/fonts/OFL.txt) as outlines for sticker SVGs. Made by outlines.mjs.',
  'Geist 500': await outlines('Geist-Variable.woff2', 500),
  'Geist Mono 400': await outlines('GeistMono-Variable.woff2', 400),
};
const json = JSON.stringify(data);
await writeFile('vendor/fonts/geist-outlines.json', json);
for (const [name, f] of Object.entries(data)) if (f.glyphs) console.log(`${name}: ${Object.keys(f.glyphs).length} glyphs, ${f.kerning.left.length} × ${f.kerning.right.length} kerning classes, ${f.kerning.pairs.length} pairs`);
console.log(`vendor/fonts/geist-outlines.json ${Math.round(json.length / 1000)} KB; brand/onesyntax-os-monogram-solid.svg`);
