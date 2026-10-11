// shared/outfits.js — the outfit choice (fork feature, docs/OUTFITS.md): shared by the client (the picker, the
// renderer, the sync) and the server (room.outfits, room.state). Cosmetic only: nothing here touches the battle sim.
//
// A choice is `{ [charId]: skinId }` (data/outfits.json ids; an operator absent from the map wears its default look).
// Every player owns every outfit; a player's choice applies to their own units, and other players see it (room.state
// seats[].outfits). The stored / exported payload is `{ v: OUTFITS_VERSION, outfits }`.

/** localStorage key (store.js savePref: `sp.pref.outfits`) and the export payload's version. */
export const OUTFITS_PREF = 'outfits';
export const OUTFITS_VERSION = 1;
/** At most this many entries per choice (the roster has 115 operators with outfits). */
export const MAX_OUTFITS = 256;
/** A refused import above this size is never parsed (a real payload is a few KB). */
export const OUTFITS_IMPORT_MAX_BYTES = 64 * 1024;

const CHAR_RE = /^char_\d+_[a-z0-9]+$/;
const SKIN_RE = /^char_\d+_[a-z0-9]+@[A-Za-z0-9_]+#\d+$/;

/**
 * The operators that can wear an outfit, sorted: the roster's (data/chess.json) and the 自选编队 operators
 * (data/backups.json `diy.operators`, which are also the 补位 stand-ins). tools/build-outfits.mjs builds their outfits,
 * tools/fetch-assets.mjs plans their default artwork from the same list.
 * @param {any} chess data/chess.json
 * @param {any} [backups] data/backups.json
 * @returns {string[]}
 */
export function outfitRoster(chess, backups = {}) {
  const ids = Object.values(chess || {}).map((c) => c?.charId);
  const diy = backups?.diy?.operators;
  if (diy && typeof diy === 'object') ids.push(...Object.keys(diy));
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.startsWith('char_')))].sort();
}

/** Whether `skinId` is an outfit of `charId` by its shape (its own prefix). */
export const isOutfitOf = (charId, skinId) => typeof charId === 'string' && typeof skinId === 'string'
  && CHAR_RE.test(charId) && SKIN_RE.test(skinId) && skinId.startsWith(`${charId}@`);

/**
 * A structurally clean choice: well-formed pairs only (an outfit of its own operator), sorted, at most MAX_OUTFITS.
 * With `known` (data/outfits.json, or a Set of skinIds) an unknown outfit is dropped too.
 * @param {any} v @param {Record<string, any>|Set<string>|null} [known]
 * @returns {Record<string, string>}
 */
export function cleanOutfits(v, known = null) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const has = known instanceof Set ? (id) => known.has(id) : known ? (id) => Object.hasOwn(known, id) : () => true;
  const keys = Object.keys(v).filter((k) => isOutfitOf(k, v[k]) && has(v[k])).sort();
  for (const k of keys.slice(0, MAX_OUTFITS)) out[k] = v[k];
  return out;
}

/** C2S check of `room.outfits { outfits }` (shape only; the server also drops unknown outfits). */
export function isOutfitMap(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length <= MAX_OUTFITS && keys.every((k) => isOutfitOf(k, v[k]));
}

/** The export payload's `kind` (an import of another tab's file is refused by it). */
export const OUTFITS_EXPORT_KIND = 'outfits';

/** The stored / exported payload of a choice. */
export function serializeOutfits(outfits) {
  return JSON.stringify({ v: OUTFITS_VERSION, kind: OUTFITS_EXPORT_KIND, outfits: cleanOutfits(outfits) }, null, 1);
}

const N_ = (s) => s; // a msgid (shared/i18n.js N_; the caller translates it)

/**
 * Parse an exported payload. Returns `{ ok: true, outfits, asked }` (structurally clean; the caller drops the outfits
 * its data lacks; `asked` = the entries the payload had) or `{ ok: false, error, params? }` (a msgid — the same
 * messages as the 自选编队 import, ui/diyModel.js parseDiyImport).
 * @param {string} text
 */
export function parseOutfitsImport(text) {
  if (typeof text !== 'string') return { ok: false, error: N_('无法识别的格式') };
  if (text.length > OUTFITS_IMPORT_MAX_BYTES) return { ok: false, error: N_('内容过长，无法导入') };
  const s = text.trim();
  if (!s) return { ok: false, error: N_('没有可导入的内容') };
  let doc;
  try { doc = JSON.parse(s); } catch { return { ok: false, error: N_('无法识别的内容') }; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, error: N_('无法识别的格式') };
  const v = Number.isInteger(doc.v) ? doc.v : null;
  if (v != null && v > OUTFITS_VERSION) return { ok: false, error: N_('这份数据来自更新的版本（v{v}），请先更新游戏'), params: { v } };
  if (typeof doc.kind === 'string' && doc.kind !== OUTFITS_EXPORT_KIND) return { ok: false, error: N_('这不是时装的数据') }; // en: "This is not outfit data"
  const raw = doc.outfits;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: N_('里面没有时装的数据') }; // en: "It contains no outfit data"
  return { ok: true, outfits: cleanOutfits(raw), asked: Object.keys(raw).length };
}
