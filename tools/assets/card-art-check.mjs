// (fork) Card art framing check (docs/OUTFITS.md "Adding outfits"): the full arts of the asset list that
// data/card-art-framing.json has no framing for (a new outfit: its cards show the art unplaced). fetch-assets.mjs prints
// it at the end of a run; `node tools/card-art-framing.mjs --check [--strict]` prints it all.
//
// Read only, Node built-ins only: it ships in the player package with fetch-assets (tools/assets/ ships whole), while
// tools/card-art-framing.mjs (registration, capture: sharp, puppeteer) stays author-only and re-exports these.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The full art of an animated illustration's key (data/dyn-card-framing.json keys): its outfit's art, else (`…_2`, the
 * Elite 2 illustration) the operator's default art. */
export function artOfKey(assets, key) {
  const lower = new Map(Object.entries(assets.outfits.chars).map(([id, r]) => [id.replace('@', '_').toLowerCase(), r]));
  const rec = lower.get(key.toLowerCase());
  if (rec) return rec.art || null;
  const m = /^(.*)_2$/.exec(key);
  return m ? assets.outfits.defaults[m[1]]?.art || null : null;
}
/** Every full art's file name (the table's key) → its manifest path (data/assets.json `art`, e.g. /assets/outfit/art2k/…):
 * the files live where the asset list says (outfit/art → outfit/art2k, 2026-11-24), never at a fixed folder. */
export function artFiles(assets) {
  const m = new Map();
  for (const r of [...Object.values(assets.outfits.chars), ...Object.values(assets.outfits.defaults)]) {
    if (r?.art) m.set(path.posix.basename(r.art), r.art);
  }
  return m;
}

/** How a new art gets framed (docs/OUTFITS.md "Adding outfits"): `<name>` = the art's file name without .webp. */
export const FRAME_FILL = 'frame them (docs/OUTFITS.md "Adding outfits"), per art <name>: node tools/card-art-framing.mjs '
  + '--register <scratch> --keep-registered --keep-stills --stills --only <name>; .venv-extract/Scripts/python.exe -I -B '
  + 'tools/local-extract/illust_framing.py . <CN AB root> --out <scratch>/frames.json --only <name>; then --official and '
  + '--reface <scratch>/frames.json --only <name>';
/**
 * The full arts of the asset list the table has no framing for (a new outfit or operator: its cards show the art
 * unplaced until it is framed): every art --stills would frame (an outfit with its portrait, an operator's default art
 * with an Elite portrait on disk) whose file is on disk and has no `stills` entry. `exists(url)` checks a public URL.
 */
export function unframedArts(table, assets, exists = () => true) {
  const have = new Set(Object.keys(table?.stills || {}));
  const out = [];
  const add = (id, art) => { const b = path.posix.basename(art); if (!have.has(b) && exists(art)) out.push({ id, art: b }); };
  for (const [id, r] of Object.entries(assets?.outfits?.chars || {})) if (r?.art && r.portrait) add(id, r.art);
  for (const [cid, r] of Object.entries(assets?.outfits?.defaults || {})) {
    if (r?.art && [2, 1].some((e) => exists(`/assets/char/portrait/${cid}_${e}.png`))) add(cid, r.art);
  }
  return out;
}
/** Human lines for unframedArts (fetch-assets prints at most 20 arts). */
export function describeUnframed(rows, max = Infinity) {
  if (!rows.length) return ['card art framing: every full art is framed'];
  const lines = [`card art framing: ${rows.length} full arts have no framing (their cards show them unplaced); ${FRAME_FILL}`,
    ...rows.slice(0, max).map((r) => `  ${r.id}: ${r.art}`)];
  if (rows.length > max) lines.push(`  … ${rows.length - max} more (node tools/card-art-framing.mjs --check lists them all)`);
  return lines;
}
/** The check of this checkout (null without the asset list's files: nothing to check). */
export function checkFraming(root = ROOT) {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')); } catch { return null; } };
  const assets = read('data/assets.json');
  if (!assets || !fs.existsSync(path.join(root, 'public/assets/outfit'))) return null;
  return unframedArts(read('data/card-art-framing.json'), assets, (u) => fs.existsSync(path.join(root, 'public', u.replace(/^\//, ''))));
}
