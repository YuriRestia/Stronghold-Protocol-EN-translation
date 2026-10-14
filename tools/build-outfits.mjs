#!/usr/bin/env node
// tools/build-outfits.mjs — data/outfits.json: the official outfits (时装) of the roster's and the 自选编队 operators
// (outfitRoster; fork feature, docs/OUTFITS.md). Cosmetic only: the battle sim never reads this file.
//
// Source (official gamedata, cached under .cache/gamedata/ like tools/build-data.mjs and downloaded from the same
// Kengxxiao zh_CN mirror when missing):
//   excel/skin_table.json  charSkins: every outfit (skinId 'char_x@brand#n'; the built-in E0/E1/E2 looks have no '@')
// and the generated data/chess.json (the roster's charIds), data/backups.json (the 自选编队 operators `diy.operators`),
// data/tokens.json + data/backups.json (the summons a game can field — an outfit's `tokens` keeps only those).
//
// Output (deterministic, one record per line, sorted by charId then the table's order):
//   { [skinId]: { id, charId, name, series, model, avatar, portrait, voice, tokens } }
//     name / series  displaySkin.skinName / skinGroupName (official Chinese; data/i18n/<lang>.json carries the
//                    translations — tools/build-i18n.mjs walks skin_table side by side)
//     model          battleSkin.skinOrPrefabId: the outfit's battle Spine id (fexli folder: '#' → '_')
//     avatar / portrait  the outfit's avatarId / portraitId (the full artwork is the portrait id + 'b')
//     voice          voiceId when the outfit has its own voice set (charword wordKey), else null
//     tokens         { [tokenId]: tokenSkinId } — the outfit's look of each summon (tokenSkinMap), or {}
//     layout         the folders of the model on fexli/ArknightsResource (tools/assets/plan.mjs plans from it):
//                    'fb' Front + Back, 'front' Front only (the client draws it facing away too), 'single' one
//                    non-directional `Spine/` model, null unknown (plan: Front, else Spine; no Back)
// Only outfits with a battle model are kept (every roster outfit has one, checked 2026-10-11).
// The layouts come from one GitHub API listing of fexli's spine/ tree (2 unauthenticated requests); without it
// (--offline, a network or rate-limit failure) each outfit keeps the layout of the current output file.
//
// Usage: node tools/build-outfits.mjs [--offline] [--check] [--out data/outfits.json] [--cache .cache/gamedata]
//   --check    compare with the existing output file instead of writing it (exit 1 when it would change)

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outfitRoster } from '../shared/outfits.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAMEDATA_URL = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/';

/** An outfit id: 'char_<n>_<name>@<brand>#<n>' (the built-in looks have no '@'). */
export const OUTFIT_ID_RE = /^char_\d+_[a-z0-9]+@[A-Za-z0-9_]+#\d+$/;

// the operators that can wear an outfit (shared/outfits.js: tools/fetch-assets.mjs ships and reads it too; this tool
// does not ship)
export { outfitRoster };

/**
 * Build the outfit catalog (pure; exported for tests).
 * @param {{ skins: any, chess: any, tokens?: any, backups?: any,
 *   layoutOf?: (charId: string, model: string, skinId: string) => 'fb'|'front'|'single'|null }} src parsed skin_table /
 *   data/chess.json / data/tokens.json / data/backups.json, and the model folders (modelLayouts)
 * @returns {{ doc: Record<string, any>, warnings: string[] }}
 */
export function buildOutfits({ skins, chess, tokens = {}, backups = {}, layoutOf = () => null }) {
  const warnings = [];
  const table = skins?.charSkins;
  if (!table || typeof table !== 'object') throw new Error('skin_table: charSkins missing');
  if (!Object.values(chess || {}).some((c) => typeof c?.charId === 'string')) throw new Error('data/chess.json: no charIds');
  const roster = new Set(outfitRoster(chess, backups));
  const knownTokens = new Set([...Object.keys(tokens || {}), ...Object.keys(backups?.tokens || {})]);
  const str = (v) => (typeof v === 'string' && v ? v : null);
  const rows = [];
  let order = 0;
  for (const s of Object.values(table)) {
    order++;
    if (!s || !roster.has(s.charId) || !OUTFIT_ID_RE.test(String(s.skinId))) continue;
    const model = str(s.battleSkin?.skinOrPrefabId);
    if (!model) { warnings.push(`${s.skinId}: no battle model, left out`); continue; }
    const out = {};
    for (const t of Array.isArray(s.tokenSkinMap) ? s.tokenSkinMap : []) {
      if (str(t?.tokenId) && str(t?.tokenSkinId) && knownTokens.has(t.tokenId)) out[t.tokenId] = t.tokenSkinId;
    }
    rows.push({
      order,
      rec: {
        id: s.skinId, charId: s.charId,
        name: str(s.displaySkin?.skinName) || s.skinId, series: str(s.displaySkin?.skinGroupName),
        model, avatar: str(s.avatarId) || model, portrait: str(s.portraitId) || model,
        voice: str(s.voiceId), tokens: out, layout: layoutOf(s.charId, model, s.skinId),
      },
    });
  }
  rows.sort((a, b) => (a.rec.charId < b.rec.charId ? -1 : a.rec.charId > b.rec.charId ? 1 : a.order - b.order));
  const doc = {};
  for (const { rec } of rows) doc[rec.id] = rec;
  return { doc, warnings };
}

/** fexli's folder of a model id ('char_x_epoque#28' → 'char_x_epoque_28'). */
export const modelDir = (model) => String(model).replace(/#/g, '_');

/**
 * The layout of every model folder in a fexli `spine/` tree listing (paths relative to spine/: 'char_x/<model dir>/Front/…').
 * @param {string[]} paths
 * @returns {(charId: string, model: string) => 'fb'|'front'|'single'|null}
 */
export function layoutsFromTree(paths) {
  const sub = new Map(); // 'char_x/<model dir>' → Set of its sub-folders
  for (const p of paths) {
    const parts = String(p).split('/');
    if (parts.length < 3) continue;
    const k = `${parts[0]}/${parts[1]}`;
    if (!sub.has(k)) sub.set(k, new Set());
    sub.get(k).add(parts[2]);
  }
  return (charId, model) => {
    const s = sub.get(`${charId}/${modelDir(model)}`);
    if (!s) return null;
    if (s.has('Front')) return s.has('Back') ? 'fb' : 'front';
    return s.has('Spine') ? 'single' : null;
  };
}

/** The paths of fexli/ArknightsResource's spine/ tree (GitHub API, recursive listing), or null. */
async function fetchFexliTree() {
  const api = 'https://api.github.com/repos/fexli/ArknightsResource';
  const get = async (url) => {
    const res = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'stronghold-protocol-build-outfits' }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  };
  try {
    const root = await get(`${api}/contents/`);
    const spine = Array.isArray(root) ? root.find((e) => e?.name === 'spine' && e.type === 'dir') : null;
    if (!spine?.sha) throw new Error('no spine/ folder');
    const tree = await get(`${api}/git/trees/${spine.sha}?recursive=1`);
    if (tree.truncated) throw new Error('listing truncated');
    return tree.tree.map((e) => e.path);
  } catch (e) {
    console.warn(`build-outfits: fexli listing unavailable (${e.message}); layouts kept from the current file`);
    return null;
  }
}

/** Pretty JSON with one outfit per line (stable, diff-friendly). */
export function formatOutfits(doc) {
  const lines = Object.entries(doc).map(([id, rec]) => `  ${JSON.stringify(id)}: ${JSON.stringify(rec)}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

async function ensureGamedata(cache, rel, { offline }) {
  const abs = join(cache, rel);
  if (existsSync(abs)) return abs;
  if (offline) throw new Error(`missing cached file ${rel} (offline mode)`);
  await mkdir(dirname(abs), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GAMEDATA_URL + rel, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text); // never cache a truncated file
      const tmp = `${abs}.tmp-${process.pid}`;
      await writeFile(tmp, text);
      await rename(tmp, abs);
      return abs;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error(`download failed for ${rel}: ${lastErr?.message}`);
}

async function main(argv) {
  const opts = { offline: false, check: false, out: join(ROOT, 'data', 'outfits.json'), cache: join(ROOT, '.cache', 'gamedata') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') opts.offline = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--out' || a === '--cache') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a path`);
      opts[a.slice(2)] = resolve(v);
    } else throw new Error(`unknown option ${a}\nusage: node tools/build-outfits.mjs [--offline] [--check] [--out <file>] [--cache <dir>]`);
  }
  const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
  const readData = async (name) => { const p = join(ROOT, 'data', `${name}.json`); return existsSync(p) ? read(p) : {}; };
  const skins = await read(await ensureGamedata(opts.cache, 'excel/skin_table.json', opts));
  const prev = existsSync(opts.out) ? await read(opts.out).catch(() => ({})) : {};
  const tree = opts.offline || opts.check ? null : await fetchFexliTree();
  const fromTree = tree ? layoutsFromTree(tree) : null;
  const layoutOf = (charId, model, skinId) => (fromTree ? fromTree(charId, model) : prev[skinId]?.layout ?? null);
  const { doc, warnings } = buildOutfits({ skins, chess: await readData('chess'), tokens: await readData('tokens'), backups: await readData('backups'), layoutOf });
  for (const r of Object.values(doc)) if (!r.layout) warnings.push(`${r.id}: model folder ${modelDir(r.model)} not found on fexli (layout unknown)`);
  for (const w of warnings) console.warn(`build-outfits: ${w}`);
  const text = formatOutfits(doc);
  const n = Object.keys(doc).length;
  const chars = new Set(Object.values(doc).map((r) => r.charId)).size;
  if (opts.check) {
    const old = existsSync(opts.out) ? await readFile(opts.out, 'utf8') : null;
    if (old !== text) { console.error(`build-outfits: ${opts.out} is out of date (run node tools/build-outfits.mjs)`); return 1; }
    console.log(`build-outfits: ${opts.out} is up to date (${n} outfits of ${chars} operators)`);
    return 0;
  }
  await writeFile(opts.out, text);
  console.log(`build-outfits: wrote ${opts.out} (${n} outfits of ${chars} operators)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`build-outfits: ${e.message}`); process.exitCode = 2; });
}
