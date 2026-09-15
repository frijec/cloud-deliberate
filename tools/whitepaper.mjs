/* ============================================================
   CONSID · CLOUD DELIBERATE — whitepaper PDF.

   Renders tools/whitepaper.html to assets/cloud-deliberate-whitepaper.pdf
   through the same headless Chrome the OG images use.

       node tools/whitepaper.mjs

   The document it replaced was English and came out of pdf-lib, which
   draws text box by box. Going through Chrome instead means the PDF is
   authored as HTML with the site's own tokens and webfonts, so the
   whitepaper and the pages stay one piece of work, and editing it is
   editing markup rather than coordinates.

   Kept out of build.mjs on purpose: that script regenerates everything
   derived from tools/content.json on every run, and a 360KB binary that
   changes bytes each time it is rendered has no business in that loop.
   ============================================================ */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SRC = join(ROOT, 'tools/whitepaper.html');
const OUT = join(ROOT, 'assets/cloud-deliberate-whitepaper.pdf');

if (!existsSync(CHROME)) {
  console.error(`! Chrome not found at ${CHROME} — cannot render the whitepaper.`);
  process.exit(1);
}

execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-pdf-header-footer',
  // The fonts come from Google Fonts, so give the renderer time to
  // fetch them before it prints. Without this the PDF falls back to
  // system faces and stops looking like the site.
  '--virtual-time-budget=20000',
  `--print-to-pdf=${OUT}`,
  pathToFileURL(SRC).href
], { stdio: 'ignore' });

if (!existsSync(OUT)) {
  console.error('! Chrome exited without writing the PDF.');
  process.exit(1);
}
console.log(`✓ assets/cloud-deliberate-whitepaper.pdf (${Math.round(statSync(OUT).size / 1024)} KB)`);
