// (fork) 干员调配's one 导出 / 导入 (the user's call of 2026-11-09): any of the four settings a player keeps in this browser —
// 干员调配 (choices, 潜能 / 练度), 干员持有, 自选编队 and 时装 — in one file, or any one of them in its own page's format.
//
// 导出 writes the parts the player ticks: one part is that page's own payload (so its own 导入 reads it too), two or more
// a bundle ({ kind: BACKUP_KIND, v, exportedAt, parts: { [part]: payload } }) of those same payloads. 导入 reads a bundle,
// or one page's file of any version that page's own parser reads (a v1 loadout by 第二期下半's chess ids, a bare
// { chessId: { skill, module } } map, a bare not-owned list, …): each part goes through its own parser, so a bundle part
// is held to the same rules as the file it came from. Parsing is structural; the caller applies (and sanitises) each part
// as that page's own import does.
import { exportPayload, parseImport, LOADOUT_EXPORT_KIND } from './loadoutModel.js';
import { exportOwnership, parseOwnershipImport, OWNERSHIP_EXPORT_KIND } from './ownershipModel.js';
import { exportDiy, parseDiyImport, DIY_EXPORT_KIND } from './diyModel.js';
import { serializeOutfits, parseOutfitsImport, OUTFITS_EXPORT_KIND } from '../../../shared/outfits.js';

export const BACKUP_KIND = 'stronghold.all';
export const BACKUP_VERSION = 1;
/** The parts, in the dialogs' order. */
export const BACKUP_PARTS = Object.freeze(['loadout', 'ownership', 'diy', 'outfits']);
/** A picked file / pasted text longer than this is refused before parsing (the four parts' own limits together). */
export const BACKUP_IMPORT_MAX_BYTES = 512 * 1024;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const N_ = (s) => s; // a msgid (shared/i18n.js N_; the caller translates it)

/**
 * One part's payload, as its own page exports it.
 * @param {string} part one of BACKUP_PARTS
 * @param {{ byChar?: any, ops?: any, notOwnedChars?: string[], diy?: any, diyVersion?: string|null, outfits?: any }} src
 * @param {number} now
 */
export function partPayload(part, src, now = Date.now()) {
  if (part === 'loadout') return exportPayload(src.byChar || {}, { now, ops: src.ops || {} });
  if (part === 'ownership') return exportOwnership(src.notOwnedChars || [], { now });
  if (part === 'diy') return exportDiy(src.diy || {}, { now, version: src.diyVersion ?? null });
  if (part === 'outfits') return JSON.parse(serializeOutfits(src.outfits || {}));
  throw new Error(`unknown part ${part}`);
}

/**
 * The export text of the ticked `parts`: one part → its page's own payload; more → a bundle of them. Null when none.
 * @param {Parameters<typeof partPayload>[1]} src @param {string[]} parts @param {{ now?: number }} [o]
 */
export function serializeBackup(src, parts, { now = Date.now() } = {}) {
  const chosen = BACKUP_PARTS.filter((p) => parts.includes(p));
  if (!chosen.length) return null;
  if (chosen.length === 1) return JSON.stringify(partPayload(chosen[0], src, now), null, 2);
  return JSON.stringify({
    kind: BACKUP_KIND,
    v: BACKUP_VERSION,
    exportedAt: new Date(Number.isFinite(now) ? now : Date.now()).toISOString(),
    parts: Object.fromEntries(chosen.map((p) => [p, partPayload(p, src, now)])),
  }, null, 2);
}

/** The file name part of an export: the one part's, or `all`. */
export const backupFileKind = (parts) => (parts.length === 1 ? parts[0] : 'all');

const PARSERS = {
  loadout: (o) => parseImport(o),
  ownership: (o) => parseOwnershipImport(o),
  diy: (o) => parseDiyImport(o),
  outfits: (o) => parseOutfitsImport(JSON.stringify(o)),
};

/** Which page a single file (not a bundle) belongs to: its `kind`, else its shape (an old or a bare payload). */
function partOf(doc) {
  if (Array.isArray(doc)) return 'ownership'; // a bare not-owned list
  const kind = typeof doc.kind === 'string' ? doc.kind : null;
  if (kind === LOADOUT_EXPORT_KIND) return 'loadout';
  if (kind === OWNERSHIP_EXPORT_KIND) return 'ownership';
  if (kind === DIY_EXPORT_KIND) return 'diy';
  if (kind === OUTFITS_EXPORT_KIND) return 'outfits';
  if (kind) return null;
  if (isObj(doc.picks)) return 'diy';
  if (isObj(doc.outfits)) return 'outfits';
  if (Array.isArray(doc.notOwned) || Array.isArray(doc.notOwnedChars)) return 'ownership';
  return 'loadout'; // { v, entries } / { byChar } / a bare { chessId: choice } map: the loadout parser decides
}

/**
 * Read an import: a bundle, or one page's file. `parts` holds each part that parsed (its parser's result), `failed`
 * each part that did not (a msgid and its params); `bundle` says which it was.
 * @param {string} text
 * @returns {{ ok: true, bundle: boolean, parts: Record<string, any>, failed: Record<string, { error: string, params?: any }> }
 *   | { ok: false, error: string, params?: any }}
 */
export function readBackup(text) {
  if (typeof text !== 'string') return { ok: false, error: N_('无法识别的格式') };
  if (text.length > BACKUP_IMPORT_MAX_BYTES) return { ok: false, error: N_('内容过长，无法导入') };
  const s = text.trim();
  if (!s) return { ok: false, error: N_('没有可导入的内容') };
  let doc;
  try { doc = JSON.parse(s); } catch { return { ok: false, error: N_('无法识别的内容') }; }
  if (!doc || typeof doc !== 'object') return { ok: false, error: N_('无法识别的格式') };
  const bundle = !Array.isArray(doc) && doc.kind === BACKUP_KIND;
  if (bundle) {
    const v = Number.isInteger(doc.v) ? doc.v : null;
    if (v != null && v > BACKUP_VERSION) return { ok: false, error: N_('这份数据来自更新的版本（v{v}），请先更新游戏'), params: { v } };
    if (!isObj(doc.parts)) return { ok: false, error: N_('无法识别的格式') };
  }
  const found = bundle ? BACKUP_PARTS.filter((p) => doc.parts[p] != null).map((p) => [p, doc.parts[p]]) : [[partOf(doc), doc]];
  if (!found.length || found[0][0] == null) return { ok: false, error: N_('无法识别的格式') };
  const parts = {}, failed = {};
  for (const [p, payload] of found) {
    const r = PARSERS[p](payload);
    if (r.ok) parts[p] = r;
    else failed[p] = { error: r.error, params: r.params };
  }
  if (!bundle && !Object.keys(parts).length) {
    const [p] = found[0];
    return { ok: false, error: failed[p].error, params: failed[p].params };
  }
  return { ok: true, bundle, parts, failed };
}
