// (fork) Outfit effects check (docs/OUTFITS.md "Adding outfits"): does every outfit of data/outfits.json play its own
// official effects? The client ships an outfit's own effects as twins of its operator's effect prefabs,
// `<key>_<outfit>#N` (fx.py skin_variant: `halo2_skill_03_start_01_striker#4`), in the operator's effect bundle
// battle/prefabs/effects/<code>.ab. The game plays a twin only when the local fx index has it
// (public/assets/local/fx/index.json, render/vfx/wiring.js skinKey).
//
// Read only, no UnityPy: the client's effect names come from the extractor's container cache (.cache/fx/effects.json,
// written by every `extract.py --only fx` run: bundle rel → { size, mtime, prefabs }). With a client (--game, else
// SP_GAME_DIR, else setup.mjs clientCandidates) it also stats each outfit owner's effect bundle, hot update first
// (Arknights_Data/PersistentData/Bundles, as fx.py ab_path): a bundle whose size or mtime differs from the cache was
// updated since the last fx run, so its twins are unknown until the next one.
//
// Usage: node tools/assets/outfit-fx-check.mjs [--game <install dir or AB root>] [--json] [--strict]
//   prints one line per outfit with missing (or unknown) twins and the command that fills them; exit 1 with --strict
//   when any is found, else 0. fetch-assets.mjs runs it after a build (warnings only).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AB_TAIL = ['Arknights_Data', 'StreamingAssets', 'AB', 'Windows'];
const SKIN_SEG = /_([a-z0-9]+#\d+)(?=_|$)/;
export const FX_SKINS_FILL = 'fill them: .venv-extract/Scripts/python.exe -I -B tools/local-extract/extract.py --only fx '
  + '--fx-skins --fx-add-only --game "<CN client install>" (staged as docs/OUTFITS.md "Adding outfits" says), then '
  + 'node tools/fetch-assets.mjs --add-only';

/** fx.py skin_variant in JS: [base key, outfit suffix] of an outfit twin, or null. */
export function skinVariant(key) {
  const m = SKIN_SEG.exec(key || '');
  return m ? [key.slice(0, m.index) + key.slice(m.index + m[0].length), m[1]] : null;
}

/** The operator code of a charId ('char_1047_halo2' → 'halo2'): its effect bundle's name. */
export const charCode = (charId) => String(charId).split('_').slice(2).join('_');

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/**
 * The bundle roots to stat, hot update first: [Arknights_Data/PersistentData/Bundles, …/StreamingAssets/AB/Windows]
 * for an install dir or its AB root; [dir] for a hand-made AB root (.cache/ab-cn); [] when `game` does not exist.
 */
export function clientRoots(game) {
  if (!game || !existsSync(game)) return [];
  const dir = resolve(game);
  const ab = dir.replace(/\\/g, '/').endsWith(AB_TAIL.join('/')) ? dir : join(dir, ...AB_TAIL);
  if (!existsSync(ab)) return [dir];
  const hot = resolve(ab, '..', '..', '..', 'PersistentData', 'Bundles');
  return existsSync(hot) ? [hot, ab] : [ab];
}

/** The local CN client: `game`, else SP_GAME_DIR, else setup.mjs findClient (the remembered one, then the usual
 * install places); null if none. */
export async function findClient(game) {
  if (game) return game;
  if (process.env.SP_GAME_DIR) return process.env.SP_GAME_DIR;
  try {
    const found = (await import('../setup.mjs')).findClient(null);
    return found?.exists !== false && found?.path ? found.path : null;
  } catch { return null; }
}

/**
 * Per outfit: the client's twins of the effects the index already has for its operator, those the index lacks, and
 * whether the client's bundle changed since the cache was written. Only outfits with a gap are returned.
 * @param {{ outfits: Record<string, {charId: string}>, index: {prefabs?: object}|null,
 *   cache: Record<string, {size: number, mtime: number, prefabs: string[]}>|null, roots?: string[] }} o
 */
export function outfitFxGaps({ outfits, index, cache, roots = [] }) {
  const have = new Set(Object.keys(index?.prefabs || {}));
  const rows = [];
  for (const [skinId, rec] of Object.entries(outfits || {})) {
    const suffix = String(skinId).split('@')[1];
    if (!suffix || !rec?.charId) continue;
    const bundle = `battle/prefabs/effects/${charCode(rec.charId)}.ab`;
    const c = cache?.[bundle] || null;
    let stale = false;
    const file = roots.map((r) => join(r, bundle)).find((p) => existsSync(p));
    if (file) {
      const st = statSync(file);
      stale = !c || c.size !== st.size || c.mtime !== Math.floor(st.mtimeMs / 1000);
    }
    const twins = (c?.prefabs || []).filter((k) => { const v = skinVariant(k); return v && v[1] === suffix && have.has(v[0]); });
    const missing = twins.filter((k) => !have.has(k));
    if (missing.length || stale) rows.push({ skinId, charId: rec.charId, bundle, twins: twins.length, missing, stale });
  }
  return rows;
}

/** Load the inputs of a checkout and run outfitFxGaps; null when the checkout has no local fx index. */
export async function checkOutfitFx({ root = ROOT, game = null } = {}) {
  const index = readJson(join(root, 'public/assets/local/fx/index.json'));
  if (!index) return null;
  const client = await findClient(game);
  const rows = outfitFxGaps({
    outfits: readJson(join(root, 'data/outfits.json')) || {},
    index,
    cache: readJson(join(root, '.cache/fx/effects.json')),
    roots: clientRoots(client),
  });
  return { client, rows };
}

/** Human lines for a result, at most `max` outfit lines (fetch-assets prints 20). */
export function describeGaps(res, max = Infinity) {
  if (!res) return ['outfit effects: no local fx index (public/assets/local/fx/index.json), nothing to check'];
  const lines = res.rows.slice(0, max).map((r) => (r.stale
    ? `  ${r.skinId}: the client's ${r.bundle} changed since the last fx run (its twins unknown${r.missing.length ? `, ${r.missing.length} known missing` : ''})`
    : `  ${r.skinId}: ${r.missing.length} of ${r.twins} effect twins missing (${r.missing.slice(0, 4).join(', ')}${r.missing.length > 4 ? ', …' : ''})`));
  const head = res.rows.length
    ? [`outfit effects: ${res.rows.length} outfits may lack their own official effects; ${FX_SKINS_FILL}`]
    : ['outfit effects: every outfit has the effect twins its client bundles hold'];
  if (res.rows.length > max) lines.push(`  … ${res.rows.length - max} more (node tools/assets/outfit-fx-check.mjs lists them all)`);
  const tail = res.client ? [] : ['  (no local CN client found: pass --game or set SP_GAME_DIR to also catch updated bundles)'];
  return [...head, ...lines, ...tail];
}

async function main(argv) {
  const gi = argv.indexOf('--game');
  const res = await checkOutfitFx({ game: gi >= 0 ? argv[gi + 1] : null });
  if (argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
  else for (const l of describeGaps(res)) console.log(l);
  return argv.includes('--strict') && res?.rows.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e?.stack || e); process.exitCode = 2; });
}
