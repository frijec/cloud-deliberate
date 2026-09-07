# tools

Not a build step. The site is hand-written static HTML served straight from
the repo — open `index.html` and it works. These files regenerate the things
that would otherwise be hand-maintained and quietly rot.

```bash
node tools/build.mjs
```

That verifies, then regenerates:

1. **Verifies** every page's `<title>`, description, `og:*`, `twitter:*` and
   `<link rel=canonical>` against `content.json`, and exits non-zero on any
   mismatch. This is the part worth re-running: it catches a headline edited
   in the HTML but not in the manifest — the drift that leaves a share card
   describing a page that no longer says that.
2. `sitemap.xml` (`lastmod` from `git log`, not the clock, so an unchanged
   page doesn't churn its date) and `robots.txt`.
3. `404.html` — self-contained, because GitHub Pages serves it for any
   unmatched path while leaving the browser's URL at that deep path, so
   relative asset paths would resolve against the wrong directory.
4. `assets/og/*.png`, the 1200×630 share images, through headless Chrome.
   The template lives in the script, so it stays reviewable in a diff. The
   sibling site's generator was never committed, which is why its 24 share
   images can now only be hand-edited.
5. `copy.md`, the labelled copy-review document (via `copy_md.py` — Node has
   no built-in HTML parser, and a five-page site with no build step should
   not grow an npm dependency to read its own markup).

`node tools/build.mjs --check` runs step 1 only. Worth wiring into CI.

## Moving between the test URL and production

`content.json` holds the origin and the indexing policy, and everything
absolute derives from them — canonicals, `og:url`, share-image URLs, the
JSON-LD, `sitemap.xml`, `robots.txt` and the 404's links. Switching is one
command; it rewrites the pages and then verifies them.

```bash
# GitHub Pages test deploy — kept out of search
node tools/build.mjs --site=https://frijec.github.io/cloud-deliberate --noindex

# production
node tools/build.mjs --site=https://cloud-deliberate.consid.engineering --index
```

`--noindex` adds `<meta name="robots" content="noindex,nofollow">` to every
page and makes `robots.txt` a blanket `Disallow: /`, with no `Sitemap:` line
— advertising a sitemap for a site you are asking crawlers to skip is a
contradiction they are entitled to ignore. `--index` removes both.

## Deploying

The repo root *is* the site, so GitHub Pages serves it with no build step:
Settings → Pages → Deploy from a branch → `main` / `/ (root)`.

`.nojekyll` is present so Pages skips Jekyll — nothing here needs it, and it
would otherwise ignore any file or directory beginning with an underscore.

Every path in the site is relative and `dither.js` resolves `matcap.jpg`
through `import.meta.url`, so the site works unchanged at a domain root or
under a project subpath like `/cloud-deliberate/`.

Chrome is expected at `/Applications/Google Chrome.app`. Without it, every
step except the share images still runs.
