// Hosting build: writes the app to dist/ with every comment removed, so the published site (and the handover copy
// made from it) carries no notes on how the patterns are made. Those notes stay in the source and the .md files.
//   npm install && node build.mjs        (publish.sh runs it)
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { minify } from 'terser';

// Comments out and whitespace trimmed; names and logic untouched (no compression or renaming), so the code runs
// exactly as written.
const TERSER = { compress: false, mangle: false, format: { comments: false } };
const script = async (code) => (await minify(code, TERSER)).code;
const css = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n');
const noHtmlComments = (text) => text.replace(/<!--[\s\S]*?-->\n?/g, '');

/** The page's one stylesheet and its last (inline) script; the script holds other <style> text inside strings. */
async function page(html) {
  const styleOpen = html.indexOf('<style>'), styleClose = html.indexOf('</style>', styleOpen);
  const scriptOpen = html.lastIndexOf('<script>'), scriptClose = html.lastIndexOf('</script>');
  if (styleOpen < 0 || scriptOpen < styleClose || scriptClose < scriptOpen) throw new Error('index.html layout changed: update build.mjs');
  return noHtmlComments(html.slice(0, styleOpen + 7)) + css(html.slice(styleOpen + 7, styleClose))
    + noHtmlComments(html.slice(styleClose, scriptOpen + 8)) + '\n' + await script(html.slice(scriptOpen + 8, scriptClose)) + '\n' + html.slice(scriptClose);
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await writeFile('dist/index.html', await page(await readFile('index.html', 'utf8')));
await writeFile('dist/engine.js', await script(await readFile('engine.js', 'utf8')));
await cp('brand', 'dist/brand', { recursive: true });
// Fonts and libraries ship as they came from npm, licence notices included.
await cp('vendor', 'dist/vendor', { recursive: true });
console.log('dist/ written without comments');
