#!/usr/bin/env node
// (fork) Merging generated JSON files without hand edits (docs/ASSETS.md "Merging branches").
//
// data/assets.json is one 3.6 MB line: two branches that each change any entry always conflict in git's line merge,
// and its `hash` and `stats` change on every rebuild. This tool merges such a file entry by entry (a three-way merge
// of the parsed JSON): an entry only one side changed takes that side; both sides' new entries are kept; an entry
// both sides changed differently is a real conflict. It then recomputes the manifest's `hash` and `stats` for the
// merged content. test/audio-pools-data.snapshot.json is merged the same way and rewritten from the merged manifest.
//
//   npm run merge:generated -- --setup     once per clone: register the git merge driver (.gitattributes names the files)
//   npm run merge:generated                after a merge: resolve those files if git left them conflicted, then rewrite
//                                          the pool snapshot from data/assets.json; exit 1 on a real conflict, or
//                                          when one side changed the asset generator and the other side's units need
//                                          a rebuild (it prints the fetch-assets command; afterwards rerun with
//                                          --rebuilt, which skips that check)
//   node tools/merge-generated.mjs --driver %O %A %B %P    (what git runs; writes the result over %A)
//
// Every read and write is capped at MAX_BYTES (storage rule): a bigger file is refused, nothing is written.
import { readFileSync, writeFileSync, renameSync, statSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contentHash, countStats } from './assets/manifest.mjs';
import { formatSnapshot, writeSnapshot } from './assets/pool-snapshot.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_BYTES = 64 * 1024 * 1024;
export const DRIVER = 'generated-json';
const MISSING = Symbol('missing');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Deep equality of JSON values, key order ignored. */
export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}

/**
 * Three-way merge of parsed JSON. Objects merge key by key (ours' key order, then theirs' new keys); arrays and
 * scalars are single entries. Returns the merged value and the dotted paths of real conflicts (both sides changed
 * the same entry differently), where the merged value keeps ours.
 * @param {any} base @param {any} ours @param {any} theirs
 * @returns {{ value: any, conflicts: string[] }}
 */
export function mergeJson(base, ours, theirs) {
  const conflicts = [];
  const at = (path, k) => (path ? `${path}.${k}` : String(k));
  const eq = (a, b) => (a === MISSING || b === MISSING ? a === b : same(a, b));
  const merge = (b, o, t, path) => {
    if (eq(o, t)) return o;
    if (eq(b, o)) return t;
    if (eq(b, t)) return o;
    if (isObj(o) && isObj(t)) {
      const bb = isObj(b) ? b : {};
      const out = {};
      for (const k of [...Object.keys(o), ...Object.keys(t).filter((k) => !Object.prototype.hasOwnProperty.call(o, k))]) {
        const has = (x) => Object.prototype.hasOwnProperty.call(x, k);
        const v = merge(has(bb) ? bb[k] : MISSING, has(o) ? o[k] : MISSING, has(t) ? t[k] : MISSING, at(path, k));
        if (v !== MISSING) out[k] = v;
      }
      return out;
    }
    conflicts.push(path || '(root)');
    return o;
  };
  return { value: merge(base, ours, theirs, ''), conflicts };
}

/** data/assets.json: merge the body, then rebuild `hash` and `stats` (file count and bytes: base + both sides' change). */
function mergeManifest(base, ours, theirs) {
  const split = (m) => { const { version, hash, generator, stats, ...body } = m || {}; return { head: { version, generator }, stats: stats || {}, body }; };
  const b = split(base), o = split(ours), t = split(theirs);
  const head = mergeJson(b.head, o.head, t.head);
  const body = mergeJson(b.body, o.body, t.body);
  const delta = (k) => (Number(o.stats[k]) || 0) + (Number(t.stats[k]) || 0) - (Number(b.stats[k]) || 0);
  const value = {
    version: head.value.version,
    hash: contentHash(body.value),
    generator: head.value.generator,
    stats: countStats(body.value, delta('bytes'), delta('files')),
    ...body.value,
  };
  return { value, conflicts: [...head.conflicts, ...body.conflicts] };
}

/** The files this tool merges: path → how to merge and how to write. */
export const FILES = {
  'data/assets.json': { merge: mergeManifest, format: (v) => JSON.stringify(v) + '\n' },
  'test/audio-pools-data.snapshot.json': { merge: mergeJson, format: formatSnapshot },
};

/** Merge three texts of one registered file. @returns {{ text: string, conflicts: string[] }} */
export function mergeTexts(path, baseText, oursText, theirsText) {
  const spec = FILES[path.replace(/\\/g, '/')];
  if (!spec) throw new Error(`merge-generated: ${path} is not a registered generated file`);
  const parse = (s) => (s && s.trim() ? JSON.parse(s) : {});
  const { value, conflicts } = spec.merge(parse(baseText), parse(oursText), parse(theirsText));
  const text = spec.format(value);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(`merge-generated: merged ${path} would be ${Buffer.byteLength(text)} bytes (cap ${MAX_BYTES})`);
  return { text, conflicts };
}

function readCapped(file) {
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`merge-generated: ${file} is ${size} bytes (cap ${MAX_BYTES}); refusing to read it`);
  return readFileSync(file, 'utf8');
}

function writeAtomic(file, text) {
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: MAX_BYTES, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const stage = (n, path) => { try { return git(['show', `:${n}:${path}`]); } catch { return ''; } };

/** git's merge driver: %O %A %B %P. Writes the result over %A; exit 1 when a real conflict is left. */
function driver([base, ours, theirs, path]) {
  const { text, conflicts } = mergeTexts(path, readCapped(base), readCapped(ours), readCapped(theirs));
  writeAtomic(ours, text);
  if (conflicts.length) {
    process.stderr.write(`merge-generated: ${path}: ${conflicts.length} entr${conflicts.length === 1 ? 'y' : 'ies'} changed on both sides (kept ours): ${conflicts.slice(0, 20).join(', ')}\n`);
    return 1;
  }
  return 0;
}

/** The asset generator: a change here can change entries the other side's manifest still has the old way. */
export const GENERATOR = ['tools/assets/', 'tools/fetch-assets.mjs'];

/**
 * The units whose manifest entries differ between two manifests (sound entries, models, and their outfits'): the ids
 * `fetch-assets --add-only --refresh-units` rebuilds.
 * @param {any} a @param {any} b
 */
export function changedUnits(a, b) {
  const ids = new Set();
  const cmp = (x, y, idOf) => { for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) if (!same(x?.[k], y?.[k])) ids.add(idOf(k)); };
  const own = (k) => k.split('@')[0];
  cmp(a?.audio?.sfx?.units, b?.audio?.sfx?.units, (k) => k);
  cmp(a?.audio?.sfx?.outfits, b?.audio?.sfx?.outfits, own);
  cmp(a?.chars, b?.chars, (k) => k);
  cmp(a?.outfits?.chars, b?.outfits?.chars, own);
  return [...ids].sort();
}

/**
 * The merge being made (MERGE_HEAD) or just made (HEAD with two parents): when one side changed the asset generator
 * and the other side changed manifest entries, those entries were built by the old generator and an entry-by-entry
 * merge keeps them as they are. Returns, per such side, the units to rebuild.
 */
function generatorCheck() {
  const rev = (r) => { try { return git(['rev-parse', '-q', '--verify', r]).trim(); } catch { return ''; } };
  const merging = rev('MERGE_HEAD');
  const [ours, theirs] = merging ? [rev('HEAD'), merging] : rev('HEAD^2') ? [rev('HEAD^1'), rev('HEAD^2')] : [];
  if (!ours || !theirs) return [];
  const base = git(['merge-base', ours, theirs]).trim();
  const gen = (side) => git(['diff', '--name-only', base, side, '--', ...GENERATOR]).split('\n').filter(Boolean);
  const manifest = (r) => { try { return JSON.parse(git(['show', `${r}:data/assets.json`])); } catch { return null; } };
  const mb = manifest(base);
  const out = [];
  for (const [name, side, other] of [['ours', ours, theirs], ['theirs', theirs, ours]]) {
    const g = gen(other);
    if (!g.length) continue;
    const units = changedUnits(mb, manifest(side));
    if (units.length) out.push({ side: name, generatorFiles: g, units });
  }
  return out;
}

/** After a merge: resolve the registered files git left conflicted, then rewrite the pool snapshot from the manifest. */
function afterMerge(rebuilt = false) {
  let status = 0;
  for (const c of rebuilt ? [] : generatorCheck()) {
    console.log(`merge-generated: the other side changed the asset generator (${c.generatorFiles.join(', ')}) and ${c.side} changed ` +
      `${c.units.length} unit(s) in data/assets.json with the old one. Rebuild them with the merged generator (needs the art on disk):\n` +
      `  node tools/fetch-assets.mjs --offline --add-only --refresh-units=${c.units.join(',')}\n  then: npm run merge:generated -- --rebuilt   (skips this check)`);
    status = 1;
  }
  const unmerged = new Set(git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean));
  for (const path of Object.keys(FILES)) {
    if (!unmerged.has(path)) continue;
    const { text, conflicts } = mergeTexts(path, stage(1, path), stage(2, path), stage(3, path));
    writeAtomic(join(ROOT, path), text);
    if (conflicts.length) {
      console.log(`merge-generated: ${path}: ${conflicts.length} real conflict(s), ours kept: ${conflicts.slice(0, 20).join(', ')}`);
      status = 1;
    } else {
      git(['add', '--', path]);
      console.log(`merge-generated: ${path}: merged entry by entry`);
    }
  }
  const before = readCapped(join(ROOT, 'test/audio-pools-data.snapshot.json'));
  const after = writeSnapshot();
  console.log(`merge-generated: pool snapshot ${before === after ? 'already matches data/assets.json' : 'rewritten from data/assets.json'}`);
  if (unmerged.has('test/audio-pools-data.snapshot.json') && status === 0) git(['add', '--', 'test/audio-pools-data.snapshot.json']);
  return status;
}

function setup() {
  git(['config', `merge.${DRIVER}.name`, 'entry-by-entry merge of generated JSON (tools/merge-generated.mjs)']);
  git(['config', `merge.${DRIVER}.driver`, 'node tools/merge-generated.mjs --driver %O %A %B %P']);
  console.log(`merge-generated: git merge driver "${DRIVER}" registered for this clone and its worktrees (.gitattributes names the files)`);
  return 0;
}

const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) {
  const args = process.argv.slice(2);
  try {
    process.exitCode = args[0] === '--driver' ? driver(args.slice(1)) : args.includes('--setup') ? setup() : afterMerge(args.includes('--rebuilt'));
  } catch (e) {
    console.error(e?.message || e);
    process.exitCode = 2;
  }
}
