// server/http/buildTag.js — the build tag of the browser runtime this process serves (/healthz `build`).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './config.js';

// ---------------------------------------------------------------------------------------------------
// build tag — the "your page is stale" signal (public/js/ui/buildGuard.js)
// ---------------------------------------------------------------------------------------------------

/**
 * The files that make up the runtime the BROWSER loads. A change in any of them is a new build: an already-open page
 * keeps the modules it imported at load time (ES modules live in the page's module map for its whole lifetime), so
 * without this signal a deployed fix could never reach a player who does not reload — a client-only battle fix
 * shipped exactly that way and stayed invisible on a page that had been opened before the deploy.
 *
 * The browser also imports `/sim/` from `server/sim/` and `/shared/`, and caches JSON from `/data/`. Include those
 * trees so a simulation-only or data-only deploy reaches old pages after the server restarts. `buildTag()` caches
 * this fingerprint for the process lifetime: files changing on disk do not advertise a new build before restart.
 * The rest of `server/` and downloaded media are not included.
 *
 * The tag hashes file CONTENTS, not sizes and mtimes: two servers running the same commit (deploy-regions.mjs) must
 * advertise the same build, because peerLink / crossMatch treat a peer on another build as other rules and
 * deploy-regions refuses to activate builds that differ. mtimes differ per checkout, so they cannot be part of it.
 */
export const BUILD_INPUTS = Object.freeze(['public/index.html', 'public/js', 'public/css', 'server/sim', 'shared', 'data']);

/** Names the static server never serves: dot files (`.DS_Store`, `.main.js.swp`) and editor backups (`main.js~`). */
const isIgnoredBuildName = (name) => name.startsWith('.') || name.endsWith('~');

/**
 * Files under BUILD_INPUTS that describe this server's media, not the game's rules, and so differ between servers of
 * one release: the per-machine extraction lists and clip bounds (shared links into app/, absent on a --no-art server)
 * and the asset manifest, which a release's fetch-assets may rewrite (scripts/generations.mjs ensureAssets).
 */
export const BUILD_EXCLUDED = Object.freeze(['data/assets.json', 'data/local-assets.json', 'data/local-fx.json', 'data/clip-bounds.json']);
const EXCLUDED = new Set(BUILD_EXCLUDED);

/**
 * Trees under BUILD_INPUTS the browser is served only in part: the official versions' data (DESIGN §35.22, §35.23) — a
 * child of data/versions/ counts only when this process serves it (`servedVersionDirs`: the enabled versions'
 * directories, server/versions.js), so rebuilding a version the server does not offer is no new build.
 */
const VERSIONS_BUILD_DIR = 'data/versions';

/** @type {{ tag: string|null }|null} */
let buildCache = null;

/**
 * Every file under `abs` (or `abs` itself), as `[relative path, absolute path]`, sorted by path. Missing → [].
 * @param {string} abs @param {string} rel @param {any[]} out @param {Set<string>} served the served data/versions children
 */
function buildEntries(abs, rel, out, served) {
  let stat;
  try { stat = fs.statSync(abs); } catch { return; }
  if (stat.isFile()) { if (!EXCLUDED.has(rel)) out.push([rel, abs]); return; }
  if (!stat.isDirectory()) return;
  let names;
  try { names = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const d of names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (isIgnoredBuildName(d.name)) continue;
    const child = path.join(abs, d.name);
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      if (rel === VERSIONS_BUILD_DIR && !served.has(childRel)) continue;
      buildEntries(child, childRel, out, served);
    }
    else if (d.isFile() && !EXCLUDED.has(childRel)) out.push([childRel, child]);
  }
}

/**
 * Short hash of the served browser runtime (path + contents of every BUILD_INPUTS file but BUILD_EXCLUDED); null when
 * nothing is readable. Same files → same tag on any machine, whatever their timestamps.
 * @param {string} [root]
 * @param {{ servedVersionDirs?: string[] }} [opts] the absolute data/versions/<slug>/ directories this process serves
 */
export function computeBuildTag(root = ROOT, { servedVersionDirs = [] } = {}) {
  const out = [];
  const versionsAbs = path.join(root, ...VERSIONS_BUILD_DIR.split('/'));
  const served = new Set(servedVersionDirs.map((d) => path.relative(versionsAbs, path.resolve(d)))
    .filter((r) => r && !r.startsWith('..') && !path.isAbsolute(r) && !r.includes(path.sep)).map((r) => `${VERSIONS_BUILD_DIR}/${r}`));
  for (const rel of BUILD_INPUTS) buildEntries(path.join(root, rel), rel, out, served);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = createHash('sha1');
  let read = 0;
  for (const [rel, abs] of out) {
    let body;
    try { body = fs.readFileSync(abs); } catch { continue; }
    read++;
    h.update(`${rel}\0${body.length}\0`);
    h.update(body);
    h.update('\n');
  }
  if (!read) return null;
  return h.digest('hex').slice(0, 12);
}

/**
 * The build tag of THIS process. Computed once (`startServer` warms it at startup): the tag describes the files the
 * process is actually serving, every update restarts the server (DEPLOY.md), and re-reading the tree on a timer would
 * let a half-finished deploy — or a file that changed while the process kept running — move the tag under a page.
 * @param {string} [root] used by the first call only (tests)
 * @param {{ servedVersionDirs?: string[] }} [opts] used by the first call only (computeBuildTag)
 */
export function buildTag(root = ROOT, opts = {}) {
  if (buildCache === null) buildCache = { tag: computeBuildTag(root, opts) };
  return buildCache.tag;
}

/** Drop the cache: the next `buildTag()` re-reads the tree (tests, and `startServer`). */
export function resetBuildTag() { buildCache = null; }
