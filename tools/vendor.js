// Self-hosts third-party code and fonts so the app loads nothing from CDNs (no supply-chain surprises, no font
// requests to Google). Run once after changing a version below; the output in js/vendor/ and fonts/ is committed.
//   node tools/vendor.js
// Uses npm + esbuild in a temporary folder; the app itself still has no build step.
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKGS = ['@supabase/supabase-js@2.45.4', 'barcode-detector@3.2.2', 'esbuild@0.24.0'];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap';

const tmp = mkdtempSync(join(tmpdir(), 'trainer-vendor-'));
const run = (cmd) => execSync(cmd, { cwd: tmp, stdio: 'inherit' });
const vendor = join(ROOT, 'js', 'vendor');
mkdirSync(vendor, { recursive: true });

try {
  writeFileSync(join(tmp, 'package.json'), '{"private":true,"type":"module"}');
  run(`npm install --no-audit --no-fund --ignore-scripts=false ${PKGS.join(' ')}`);

  writeFileSync(join(tmp, 'supabase-entry.js'), "export { createClient } from '@supabase/supabase-js';\n");
  writeFileSync(join(tmp, 'scanner-entry.js'), "export { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';\n");
  const esbuild = join(tmp, 'node_modules', '.bin', 'esbuild');
  const banner = (name) => `--banner:js="/* ${name} — bundled by tools/vendor.js, do not edit */"`;
  run(`"${esbuild}" supabase-entry.js --bundle --format=esm --minify --platform=browser --target=es2020 ${banner('@supabase/supabase-js 2.45.4')} --outfile="${join(vendor, 'supabase.js')}"`);
  run(`"${esbuild}" scanner-entry.js --bundle --format=esm --minify --platform=browser --target=es2020 ${banner('barcode-detector 3.2.2 (zxing-wasm)')} --outfile="${join(vendor, 'barcode-detector.js')}"`);

  // zxing WebAssembly reader (loaded at runtime from our own site, see js/food-api.js)
  const wasmDir = join(tmp, 'node_modules', 'zxing-wasm', 'dist', 'reader');
  const wasm = readdirSync(wasmDir).find((f) => f.endsWith('.wasm'));
  copyFileSync(join(wasmDir, wasm), join(vendor, 'zxing_reader.wasm'));

  // Fonts: ask Google for woff2 (modern browser UA), store the files and a local stylesheet.
  const fontDir = join(ROOT, 'fonts');
  mkdirSync(fontDir, { recursive: true });
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
  let css = await (await fetch(FONTS_CSS, { headers: { 'User-Agent': ua } })).text();
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) || [])];
  for (const [i, url] of urls.entries()) {
    const family = css.slice(0, css.indexOf(url)).match(/font-family: '([^']+)'/g).at(-1).match(/'([^']+)'/)[1];
    const file = `${family.toLowerCase().replace(/\s+/g, '-')}-${i}.woff2`;
    writeFileSync(join(fontDir, file), Buffer.from(await (await fetch(url)).arrayBuffer()));
    css = css.replaceAll(url, `../fonts/${file}`);
  }
  writeFileSync(join(ROOT, 'css', 'fonts.css'), `/* Press Start 2P + VT323 (SIL Open Font License), self-hosted by tools/vendor.js */\n${css}`);
  console.log(`vendor ok: supabase.js, barcode-detector.js, ${wasm} → zxing_reader.wasm, ${urls.length} font files`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
