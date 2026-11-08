#!/usr/bin/env node
// tools/build-avatars.mjs — (fork) data/avatars.json: the official player profile icons (头像, display_meta_table
// playerAvatarData) a Doctor picks for their profile in the lobby and on their room seat card (ui/avatars.js).
//
// Sources (official gamedata, pinned to a commit so the output only changes when the pin moves):
//   zh_CN  Kengxxiao/ArknightsGameData@CN_SHA   excel/display_meta_table.json  playerAvatarData: defaultAvatarId,
//          avatarTypeData (the groups: typeName, sortId, avatarIdList = the order inside a group), avatarList (names)
//   en     ArknightsAssets/ArknightsGamedata@EN_SHA  the same table: which icons the EN client has (an icon it lacks gets
//          the English name of tools/i18n/fallback-avatars-en.json — the wiki's official one or our own, `unofficial`)
// The art is the CN client's sprite pack spritepack/ui_player_avatar_list_h2_0.ab (tools/local-extract/extract.py, group
// `avatar`, WebP): the ASSISTANT group (名片形象, the account's assistant operator) has no picture of its own and stays out;
// the DYNAMIC group's animated icons are drawn with the still frame the sprite pack holds.
// [ASSUMED] The newest CN table rather than the season pin of tools/versions/act2autochess.mjs: the icons are cosmetic,
// not 盟约 rules, and the art comes from the current client.
//
// Output (deterministic, no timestamps):
//   { version, source, defaultId,
//     groups: [{ type, sortId, name, ids: [id…] }],          official sortId order, ids in avatarIdList order
//     avatars: { [id]: { type, name, unofficial? } } }       name = the zh avatarItemName (data/i18n/en.json translates
//                                                            it, tools/build-i18n.mjs); unofficial = our own English name
//
// Usage: node tools/build-avatars.mjs [--offline] [--check] [--out data/avatars.json] [--cache .cache/gamedata]
//                                     [--cache-en .cache/gamedata-en]
//   --check    compare with the existing output file instead of writing it (exit 1 when it would change)

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Kengxxiao/ArknightsGameData master on 2026-11-08 (CN 2.7.91 tables). */
export const CN_SHA = '63c7cec73c3858d0ae913f85cc89af3cef4d744f';
/** ArknightsAssets/ArknightsGamedata master on 2026-11-08. */
export const EN_SHA = 'b9ce366846458c23f87b456801b0be1cc14e8fba';
const REL = 'excel/display_meta_table.json';
const SOURCES = Object.freeze({
  zh: { url: `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/${CN_SHA}/zh_CN/gamedata/`, sha: CN_SHA },
  en: { url: `https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/${EN_SHA}/en/gamedata/`, sha: EN_SHA },
});
/** Groups without a picture of their own. */
const NO_ART = new Set(['ASSISTANT']);
/** The English names tools/build-i18n.mjs uses for the icons the EN client lacks. */
export const FALLBACK_EN = join(ROOT, 'tools', 'i18n', 'fallback-avatars-en.json');

/**
 * Build the icon catalog (pure; exported for tests).
 * @param {{ zh: any, en?: any, fallbackEn?: Record<string, any> }} src the parsed zh / en display_meta_table and
 *   fallback-avatars-en.json ({ "<zh name>": "<English name>", _unofficial: ["<zh name>"…] })
 * @returns {{ doc: object, warnings: string[] }}
 */
export function buildAvatars({ zh, en, fallbackEn = {} }) {
  const warnings = [];
  const pad = zh?.playerAvatarData;
  if (!pad || !Array.isArray(pad.avatarList) || !pad.avatarTypeData) throw new Error('display_meta_table: playerAvatarData missing');
  const rows = new Map(pad.avatarList.filter((r) => r && typeof r.avatarId === 'string').map((r) => [r.avatarId, r]));
  const enIds = new Set((en?.playerAvatarData?.avatarList || []).map((r) => r?.avatarId).filter(Boolean));
  const unofficial = new Set(Array.isArray(fallbackEn._unofficial) ? fallbackEn._unofficial : []);
  const named = (name) => !name.startsWith('_') && typeof fallbackEn[name] === 'string';
  const groups = [];
  const avatars = {};
  const types = Object.values(pad.avatarTypeData).filter((t) => t && typeof t.avatarType === 'string')
    .sort((a, b) => (a.sortId ?? 0) - (b.sortId ?? 0) || (a.avatarType < b.avatarType ? -1 : 1));
  for (const t of types) {
    if (NO_ART.has(t.avatarType)) continue;
    const ids = [];
    for (const id of t.avatarIdList || []) {
      const r = rows.get(id);
      if (!r) { warnings.push(`${id}: listed by ${t.avatarType} but not in avatarList`); continue; }
      if (avatars[id]) { warnings.push(`${id}: listed twice, kept in ${avatars[id].type}`); continue; }
      const name = String(r.avatarItemName || id);
      const rec = { type: t.avatarType, name };
      if (en && !enIds.has(id)) {
        if (!named(name)) warnings.push(`${id} ${name}: no English name (add it to tools/i18n/fallback-avatars-en.json)`);
        else if (unofficial.has(name)) rec.unofficial = true;
      }
      avatars[id] = rec;
      ids.push(id);
    }
    if (ids.length) groups.push({ type: t.avatarType, sortId: t.sortId ?? null, name: String(t.typeName || t.avatarType), ids });
  }
  const defaultId = typeof pad.defaultAvatarId === 'string' && avatars[pad.defaultAvatarId] ? pad.defaultAvatarId : groups.at(-1)?.ids[0];
  if (defaultId !== pad.defaultAvatarId) warnings.push(`defaultAvatarId ${pad.defaultAvatarId} has no icon, using ${defaultId}`);
  const doc = {
    version: 1,
    source: `display_meta_table.playerAvatarData (zh_CN Kengxxiao/ArknightsGameData@${CN_SHA.slice(0, 8)}; en ArknightsAssets/ArknightsGamedata@${EN_SHA.slice(0, 8)})`,
    defaultId,
    groups,
    avatars,
  };
  return { doc, warnings };
}

/** Pretty JSON with one group / icon per line (stable, diff-friendly). */
export function formatAvatars(doc) {
  const line = (o) => JSON.stringify(o);
  return `{\n  "version": ${doc.version},\n  "source": ${line(doc.source)},\n  "defaultId": ${line(doc.defaultId)},\n`
    + `  "groups": [\n${doc.groups.map((g) => `    ${line(g)}`).join(',\n')}\n  ],\n`
    + `  "avatars": {\n${Object.entries(doc.avatars).map(([id, a]) => `    ${line(id)}: ${line(a)}`).join(',\n')}\n  }\n}\n`;
}

async function ensureTable(dir, src, { offline }) {
  const abs = join(dir, REL);
  if (existsSync(abs)) return abs;
  if (offline) throw new Error(`missing cached file ${abs} (offline mode)`);
  await mkdir(dirname(abs), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(src.url + REL, { signal: AbortSignal.timeout(180_000) });
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
  throw new Error(`download failed for ${REL}: ${lastErr?.message}`);
}

async function main(argv) {
  const opts = { offline: false, check: false, out: join(ROOT, 'data', 'avatars.json'), cache: join(ROOT, '.cache', 'gamedata'), 'cache-en': join(ROOT, '.cache', 'gamedata-en') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') opts.offline = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--out' || a === '--cache' || a === '--cache-en') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a path`);
      opts[a.slice(2)] = resolve(v);
    } else throw new Error(`unknown option ${a}\nusage: node tools/build-avatars.mjs [--offline] [--check] [--out <file>] [--cache <dir>] [--cache-en <dir>]`);
  }
  const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
  const zh = await read(await ensureTable(`${opts.cache}@${CN_SHA}`, SOURCES.zh, opts));
  const en = await read(await ensureTable(`${opts['cache-en']}@${EN_SHA}`, SOURCES.en, opts));
  const fallbackEn = existsSync(FALLBACK_EN) ? await read(FALLBACK_EN) : {};
  const { doc, warnings } = buildAvatars({ zh, en, fallbackEn });
  for (const w of warnings) console.warn(`build-avatars: ${w}`);
  const text = formatAvatars(doc);
  const count = `${doc.groups.length} groups, ${Object.keys(doc.avatars).length} icons`;
  if (opts.check) {
    const old = existsSync(opts.out) ? await readFile(opts.out, 'utf8') : null;
    if (old !== text) { console.error(`build-avatars: ${opts.out} is out of date (run node tools/build-avatars.mjs)`); return 1; }
    console.log(`build-avatars: ${opts.out} is up to date (${count})`);
    return 0;
  }
  await writeFile(opts.out, text);
  console.log(`build-avatars: wrote ${opts.out} (${count})`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(`build-avatars: ${e.message}`); process.exitCode = 2; });
}
