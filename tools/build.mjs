/* ============================================================
   Cloud Deliberate — regenerate the derived files.

   NOT a build step: the site is hand-written static HTML served
   straight from the repo. This script produces three things that
   would otherwise be hand-maintained and silently rot, and it is
   committed so the OG template stays reviewable in a diff — the
   sibling site's generator never was, so its 24 share images can
   now only be hand-edited.

     1. assets/og/*.png   1200x630 share images
     2. sitemap.xml + robots.txt
     3. copy.md
     4. a verification pass: every page's <title>, description,
        og:*, twitter:* and canonical must match tools/content.json

   Usage
     node tools/build.mjs
         verify the pages against the manifest, then regenerate.
         Fails if a page and the manifest disagree — that mismatch is
         how a share card ends up describing a page that changed.

     node tools/build.mjs --check
         verify only. Worth wiring into CI.

     node tools/build.mjs --site=<origin> [--noindex|--index]
         retarget the whole site to a different origin: rewrites every
         canonical, og:url and absolute image URL, then verifies and
         regenerates. This is the one command that moves the site
         between the GitHub Pages test URL and production.

           # test deploy, kept out of search
           node tools/build.mjs --site=https://frijec.github.io/cloud-deliberate --noindex

           # production
           node tools/build.mjs --site=https://cloud-deliberate.consid.engineering --index
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const M = JSON.parse(readFileSync(join(ROOT, 'tools/content.json'), 'utf8'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const siteArg = (argv.find(a => a.startsWith('--site=')) || '').split('=').slice(1).join('=').replace(/\/$/, '');
const indexArg = argv.includes('--index') ? false : argv.includes('--noindex') ? true : null;

/* ---------- 0. retarget ----------------------------------- */
/* The manifest is the single source of the origin and the indexing
   policy; everything else derives from it. Changing them here rewrites
   the pages to match, so moving domains is one command rather than a
   hunt through five files for absolute URLs. */
const ROBOTS_META = '<meta name="robots" content="noindex,nofollow">';
if (siteArg || indexArg !== null) {
  if (siteArg) M.site = siteArg;
  if (indexArg !== null) M.noindex = indexArg;
  writeFileSync(join(ROOT, 'tools/content.json'), JSON.stringify(M, null, 2) + '\n');

  for (const p of M.pages) {
    const f = join(ROOT, p.file);
    let h = readFileSync(f, 'utf8');
    const url = M.site + p.path;
    const img = `${M.site}/assets/og/${p.slug}.png`;
    h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
         .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
         .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${img}$2`)
         .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${img}$2`);
    // JSON-LD carries absolute URLs too — rewrite any origin we've used before.
    h = h.replace(/https:\/\/(?:cloud-deliberate\.consid\.engineering|frijec\.github\.io\/cloud-deliberate)/g, M.site);
    // robots meta: present only while the site is meant to stay out of search
    h = h.replace(new RegExp('\\n?[ \\t]*' + ROBOTS_META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    if (M.noindex) h = h.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${ROBOTS_META}`);
    writeFileSync(f, h);
  }
  console.log(`✓ retargeted to ${M.site}${M.noindex ? ' (noindex)' : ''}`);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 1. verification ------------------------------- */
/* This is what makes the script worth re-running: it fails loudly
   when a headline is edited in the HTML but not in the manifest,
   which is the exact drift that leaves a share card describing a
   page that no longer says that. */
let problems = 0;
const pick = (html, re) => (html.match(re) || [, null])[1];

for (const p of M.pages) {
  const html = readFileSync(join(ROOT, p.file), 'utf8');
  const url = M.site + p.path;
  const img = `${M.site}/assets/og/${p.slug}.png`;
  const expect = {
    '<title>': [pick(html, /<title>([^<]*)<\/title>/), p.title],
    'meta description': [pick(html, /<meta name="description" content="([^"]*)"/), p.description],
    'canonical': [pick(html, /<link rel="canonical" href="([^"]*)"/), url],
    'og:title': [pick(html, /<meta property="og:title" content="([^"]*)"/), p.title],
    'og:description': [pick(html, /<meta property="og:description" content="([^"]*)"/), p.description],
    'og:url': [pick(html, /<meta property="og:url" content="([^"]*)"/), url],
    'og:image': [pick(html, /<meta property="og:image" content="([^"]*)"/), img],
    'og:image:alt': [pick(html, /<meta property="og:image:alt" content="([^"]*)"/), p.ogImageAlt],
    'twitter:title': [pick(html, /<meta name="twitter:title" content="([^"]*)"/), p.title],
    'twitter:description': [pick(html, /<meta name="twitter:description" content="([^"]*)"/), p.description],
    'twitter:image': [pick(html, /<meta name="twitter:image" content="([^"]*)"/), img]
  };
  for (const [field, [got, want]] of Object.entries(expect)) {
    const norm = s => s == null ? s : s.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    if (norm(got) !== want) {
      problems++;
      console.error(`  ✗ ${p.file} · ${field}\n      html: ${got}\n      json: ${want}`);
    }
  }
}
console.log(problems ? `\n${problems} mismatch(es) between the pages and tools/content.json` : '✓ all 5 pages match tools/content.json');
if (problems) process.exit(1);
if (checkOnly) process.exit(0);

/* ---------- 2. sitemap ------------------------------------ */
/* lastmod comes from git rather than the clock, so re-running this
   on an unchanged page doesn't churn the date. */
const lastmod = file => {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return d || new Date().toISOString().slice(0, 10);
  } catch { return new Date().toISOString().slice(0, 10); }
};
writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  M.pages.map(p => `  <url>\n    <loc>${M.site}${p.path}</loc>\n    <lastmod>${lastmod(p.file)}</lastmod>\n` +
    `    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`).join('\n') +
  `\n</urlset>\n`);
console.log('✓ sitemap.xml');

/* robots.txt — no Sitemap: line while the site is noindex, since
   advertising a sitemap for a site you are asking crawlers to skip is
   a contradiction they are entitled to ignore. */
writeFileSync(join(ROOT, 'robots.txt'), M.noindex
  ? `User-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: ${M.site}/sitemap.xml\n`);
console.log(`✓ robots.txt${M.noindex ? ' (Disallow: /)' : ''}`);

/* ---------- 3. OG images ---------------------------------- */
const mark = pathToFileURL(join(ROOT, 'assets/brand-mark.png')).href;
const card = p => `<!doctype html><html lang="da"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#492A34;color:#fff;
    font-family:Onest,sans-serif;padding:64px 72px;display:flex;flex-direction:column}
  .top{display:flex;align-items:center;gap:18px}
  .top img{height:26px;width:auto;filter:brightness(0) invert(1)}
  .sub{font-family:"IBM Plex Mono",monospace;font-size:15px;letter-spacing:.06em;
    color:rgba(255,255,255,.62);padding-left:18px;border-left:1px solid rgba(255,255,255,.24)}
  .mid{margin-top:auto}
  .kicker{font-family:"IBM Plex Mono",monospace;font-size:16px;letter-spacing:.11em;
    text-transform:uppercase;color:#F49E88}
  h1{font-size:${p.headline.length > 34 ? 60 : 76}px;font-weight:700;letter-spacing:-.035em;
    line-height:1.03;margin-top:22px;max-width:19ch}
  p{margin-top:22px;font-size:22px;line-height:1.45;color:rgba(255,255,255,.66);max-width:52ch;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .foot{margin-top:auto;font-family:"IBM Plex Mono",monospace;font-size:14px;letter-spacing:.11em;
    text-transform:uppercase;color:rgba(255,255,255,.45)}
</style></head><body>
  <div class="top"><img src="${mark}" alt=""><span class="sub">${esc(M.brand)}</span></div>
  <div class="mid">
    <div class="kicker">${esc(p.kicker)}</div>
    <h1>${esc(p.headline)}</h1>
    <p>${esc(p.description)}</p>
  </div>
  <div class="foot">${esc(M.footerLine)}</div>
</body></html>`;

/* ---------- 3b. 404 --------------------------------------- */
/* GitHub Pages serves this for any unmatched path, but leaves the
   browser's URL at that deep path — so relative asset paths would
   resolve against the wrong directory. It is therefore self-contained:
   inline styles, no local assets, and absolute links built from the
   manifest so they follow a retarget. */
writeFileSync(join(ROOT, '404.html'), `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<title>Siden findes ikke — Cloud Deliberate</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;700;900&family=EB+Garamond:wght@600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{min-height:100vh;display:flex;flex-direction:column;justify-content:center;
    gap:2rem;padding:clamp(1.1rem,4.5vw,4rem);background:#F5F3F1;color:#1B1B1D;
    font-family:Onest,"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:1.0625rem;line-height:1.6}
  .mark{font-family:"EB Garamond",Georgia,serif;font-size:clamp(1.1rem,2vw,1.5rem);font-weight:600;letter-spacing:.02em}
  .code{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:.75rem;
    letter-spacing:.13em;text-transform:uppercase;color:#726C66}
  h1{font-size:clamp(2rem,4.2vw,3.6rem);line-height:1.04;letter-spacing:-.034em;font-weight:700;max-width:16ch}
  p{color:#636166;max-width:52ch}
  .row{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
  a.btn{display:inline-flex;align-items:center;gap:.75rem;padding:.95rem 1.6rem;border-radius:999px;
    font-size:.9375rem;font-weight:600;text-decoration:none;
    box-shadow:0 1px 2px rgba(20,20,22,.03),0 6px 18px -10px rgba(20,20,22,.10)}
  .primary{background:#90263B;color:#fff}
  .soft{background:#FDFCFB;color:#1B1B1D}
  a:focus-visible{outline:2px solid #90263B;outline-offset:3px}
</style>
</head>
<body>
  <span class="mark">Cloud&middot;Deliberate</span>
  <div>
    <p class="code">Fejl 404</p>
    <h1 style="margin-top:1rem">Den side findes ikke.</h1>
    <p style="margin-top:1.5rem">Linket er enten forældet, eller også er adressen skrevet forkert. Alt indholdet ligger stadig et af de to steder herunder.</p>
    <div class="row">
      <a class="btn primary" href="${M.site}/">Til forsiden</a>
      <a class="btn soft" href="${M.site}/ydelser/">Se ydelser</a>
    </div>
  </div>
  <span class="code">Et Consid Denmark-initiativ</span>
</body>
</html>
`);
console.log('✓ 404.html');

/* ---------- 4. copy.md ------------------------------------ */
/* Generated from the pages, never maintained alongside them — the
   sibling site's hand-written copy.md drifted until it listed ten
   offerings for a site that had six.

   In Python because Node has no built-in HTML parser, and a five-page
   static site with no build step should not grow an npm dependency to
   read its own markup. Regex genuinely cannot do this: nested
   same-name tags defeat it. */
try {
  execFileSync('python3', [join(ROOT, 'tools/copy_md.py')], { cwd: ROOT, stdio: 'inherit' });
} catch {
  console.error('! copy.md skipped — python3 not available');
}

if (!existsSync(CHROME)) {
  console.error(`! Chrome not found at ${CHROME} — skipped the OG images (sitemap and verification still ran).`);
  process.exit(0);
}
mkdirSync(join(ROOT, 'assets/og'), { recursive: true });
const work = join(tmpdir(), 'cd-og');
mkdirSync(work, { recursive: true });
for (const p of M.pages) {
  const src = join(work, `${p.slug}.html`);
  writeFileSync(src, card(p));
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1200,630',
    '--virtual-time-budget=6000',
    `--screenshot=${join(ROOT, 'assets/og', p.slug + '.png')}`,
    pathToFileURL(src).href
  ], { stdio: 'ignore' });
  console.log(`✓ assets/og/${p.slug}.png`);
}
rmSync(work, { recursive: true, force: true });
