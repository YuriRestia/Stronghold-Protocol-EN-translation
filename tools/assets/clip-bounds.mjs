// tools/assets/clip-bounds.mjs — (fork) the impostor clip bounds of every Spine model on disk, measured at build time.
//
// The game sizes a crowd unit's impostor from the bounds of every clip its model plays (GitHub #542,
// public/js/render/spine.js "clip bounds"). In the browser those are measured pose by pose in the frame budget, and a
// unit is drawn in full until its model is done — seconds of slow frames when a crowd arrives. This step runs the very
// same measurement (spine.js requestClipBounds / stepClipBounds, the same @pixi-spine/runtime-3.8 the page's
// pixi-spine bundles) on every skeleton under public/assets and writes data/clip-bounds.json; the page loads it with
// the battle renderer (render/clipBoundsTable.js) and starts each matching model measured. Rects are rounded outward to
// CLIP_BOUNDS_STEP skeleton units, so a box built from them is never smaller than the runtime's (at most that much
// larger on a side; the impostor box pads by 24 units + 4 % on top).
//
//   { format: 1, sampler: '<spine.js clipBoundsSamplerKey()>', step: 4, generated, count, clips, names: ['Idle', …],
//     skeletons: { '<first spine.js CLIP_BOUNDS_KEY_CHARS (8) of the Spine hash>': ['<bones>.<slots>.<animations>', [i, x0, y0, x1, y1, -j-1, …]] } }
//
// Per clip: its index in `names`, then its rect in steps (x0, y0 rounded down, x1, y1 up; × step = skeleton units), or
// -(index + 1) for a clip that draws nothing (runtime null). A clip the runtime cannot pose (false) is left out: the page
// tries it. A hash key two different skeletons share is left out entirely (the page measures them). Sizes on the
// overnight machine's art (1,406 skeletons, 13,645 clips): ~270 KB raw, ~98 KB gzip, ~78 KB brotli.
// Re-run after anything changes the art (npm run assets, the local-client extract, a release-local zip):
//   npm run clip-bounds                 (node tools/assets/clip-bounds.mjs [--assets <dir>] [--out <file>])
// npm run assets and tools/fetch-release-local.mjs run it at their end.

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CLIP_BOUNDS_FILE = path.join(ROOT, 'data', 'clip-bounds.json');
export const CLIP_BOUNDS_FORMAT = 1;
/** Skeleton units per step of a stored rect (rounded outward). */
export const CLIP_BOUNDS_STEP = 4;

/** Headless stand-ins the Spine runtime's modules touch when they load (no canvas is drawn). */
function headlessGlobals() {
  class HeadlessCanvas { constructor() { this.width = 16; this.height = 16; } getContext(kind) { return kind === '2d' ? { fillStyle: '', fillRect() {}, clearRect() {}, drawImage() {} } : null; } }
  globalThis.HTMLCanvasElement ??= HeadlessCanvas;
  globalThis.document ??= { createElement: () => new HeadlessCanvas() };
}

let runtime = null;
/** The Spine 3.8 runtime and spine.js, loaded once. */
async function loadRuntime() {
  if (runtime) return runtime;
  headlessGlobals();
  const require = createRequire(path.join(ROOT, 'package.json'));
  const rt = require('@pixi-spine/runtime-3.8');
  const base = require('@pixi-spine/base');
  const core = require('@pixi/core');
  globalThis.PIXI ??= { spine: { Spine: rt.Spine } };
  const spine = await import(pathToFileURL(path.join(ROOT, 'public/js/render/spine.js')).href);
  runtime = { rt, base, core, spine };
  return runtime;
}

/** Every *.skel under `dir` that has its .atlas next to it, sorted. */
export function findSkeletons(dir) {
  const out = [];
  const walk = (d) => {
    let names;
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      const p = path.join(d, n);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (n.endsWith('.skel') && existsSync(p.slice(0, -5) + '.atlas')) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

/** Skeleton data of `skelPath` (its atlas next to it; page sizes do not matter to the bounds: a stand-in page as large as any atlas). */
export async function readSkeleton(skelPath) {
  const { rt, base, core } = await loadRuntime();
  const atlas = new base.TextureAtlas(readFileSync(skelPath.slice(0, -5) + '.atlas', 'utf8'), (line, cb) => cb(new core.BaseTexture(null, { width: 16384, height: 16384 })));
  return new rt.SkeletonBinary(new rt.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(readFileSync(skelPath)));
}

/** A rect rounded outward to steps of `step` units, in steps: × step it contains the rect. */
export const roundOut = (r, step = CLIP_BOUNDS_STEP) => [Math.floor(r[0] / step), Math.floor(r[1] / step), Math.ceil(r[2] / step), Math.ceil(r[3] / step)];

/**
 * The runtime's bounds of every clip of skeleton data `data` (spine.js, drained at once): Map clip → rect | null | false.
 * @returns {Promise<Map<string, number[]|null|false> | null>} null when this runtime cannot pose it
 */
export async function measureSkeleton(data) {
  const { rt, spine } = await loadRuntime();
  const names = (data.animations || []).map((a) => a.name);
  const rec = spine.requestClipBounds(data, rt.Skeleton, names);
  if (rec.failed) return null;
  for (let guard = 0; spine.pendingClipBounds() > 0 && guard < 1e7; guard++) spine.stepClipBounds(Infinity);
  return new Map(names.map((n) => [n, rec.rects.has(n) ? rec.rects.get(n) : false]));
}

/**
 * The table entry of skeleton data `data` from its runtime clip rects (measureSkeleton): [signature, { clip: rect in
 * steps | 0 }]; a clip the runtime cannot pose (false) is left out.
 */
export async function entryOf(data, rects, step = CLIP_BOUNDS_STEP) {
  const { spine } = await loadRuntime();
  const clips = {};
  for (const [name, r] of rects) {
    if (r === false) continue;
    clips[name] = r ? roundOut(r, step) : 0;
  }
  return [spine.skeletonSignature(data), clips];
}

/** The table (the format in the header) of `entries`: Map hash key → entryOf(…). */
export async function encodeTable(entries, step = CLIP_BOUNDS_STEP) {
  const { spine } = await loadRuntime();
  // clip names once, most used first (small indexes); each skeleton a flat list
  const uses = new Map();
  for (const [, clips] of entries.values()) for (const n of Object.keys(clips)) uses.set(n, (uses.get(n) || 0) + 1);
  const names = [...uses.keys()].sort((a, b) => uses.get(b) - uses.get(a) || (a < b ? -1 : a > b ? 1 : 0));
  const index = new Map(names.map((n, i) => [n, i]));
  const skeletons = {};
  let clipCount = 0;
  for (const h of [...entries.keys()].sort()) {
    const [sig, clips] = entries.get(h);
    const flat = [];
    for (const n of Object.keys(clips).sort()) { const r = clips[n]; clipCount++; if (r === 0) flat.push(-index.get(n) - 1); else flat.push(index.get(n), ...r); }
    skeletons[h] = [sig, flat];
  }
  return { format: CLIP_BOUNDS_FORMAT, sampler: spine.clipBoundsSamplerKey(), step, generated: new Date().toISOString(), count: entries.size, clips: clipCount, names, skeletons };
}

/**
 * Measure every skeleton under `assetsDir`.
 * @param {{ assetsDir?: string, files?: string[], log?: (s: string) => void }} [o] `files`: these skeletons only (tests)
 * @returns {Promise<{ table: any, stats: { files: number, skeletons: number, clips: number, unreadable: string[], unposable: number, noHash: number, conflicts: number, ms: number } }>}
 */
export async function buildClipBoundsTable({ assetsDir = path.join(ROOT, 'public', 'assets'), files: only = null, log = () => {} } = {}) {
  const { spine } = await loadRuntime();
  const t0 = Date.now();
  const files = only || findSkeletons(assetsDir);
  const entries = new Map();       // hash key → [signature, { clip: rect in steps | 0 }]
  const conflicted = new Set();
  const stats = { files: files.length, skeletons: 0, clips: 0, unreadable: [], unposable: 0, noHash: 0, conflicts: 0, ms: 0 };
  for (const [i, file] of files.entries()) {
    if (i && i % 200 === 0) log(`[clip-bounds] ${i}/${files.length} skeletons`);
    let data;
    try { data = await readSkeleton(file); } catch (e) { stats.unreadable.push(`${path.relative(ROOT, file)}: ${e?.message || e}`); continue; }
    const hash = typeof data.hash === 'string' ? data.hash.slice(0, spine.CLIP_BOUNDS_KEY_CHARS) : '';   // the key the page looks up
    if (hash.length < spine.CLIP_BOUNDS_KEY_CHARS) { stats.noHash++; continue; }
    const rects = await measureSkeleton(data);
    if (!rects) { stats.unposable++; continue; }
    const entry = await entryOf(data, rects);
    const prev = entries.get(hash);
    if (prev && JSON.stringify(prev) !== JSON.stringify(entry)) conflicted.add(hash);
    else entries.set(hash, entry);
  }
  for (const h of conflicted) entries.delete(h);
  stats.conflicts = conflicted.size;
  const table = await encodeTable(entries);
  stats.skeletons = table.count;
  stats.clips = table.clips;
  stats.ms = Date.now() - t0;
  return { table, stats };
}

/** Build and write the table (atomically). @returns the stats, with `bytes` and `out` */
export async function writeClipBounds({ assetsDir, out = CLIP_BOUNDS_FILE, log = (s) => console.log(s) } = {}) {
  const { table, stats } = await buildClipBoundsTable({ assetsDir, log });
  const body = JSON.stringify(table);
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, out);
  log(`[clip-bounds] ${stats.skeletons} skeletons · ${stats.clips} clips · ${(body.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, out)} · ${(stats.ms / 1000).toFixed(1)} s`
    + `${stats.unreadable.length ? ` · ${stats.unreadable.length} unreadable` : ''}${stats.noHash ? ` · ${stats.noHash} without a Spine hash` : ''}`
    + `${stats.conflicts ? ` · ${stats.conflicts} shared hashes left out` : ''}${stats.unposable ? ` · ${stats.unposable} not posable` : ''}`);
  for (const u of stats.unreadable.slice(0, 10)) log(`  unreadable: ${u}`);
  return { ...stats, bytes: body.length, out };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--assets') o.assetsDir = path.resolve(argv[++i]);
    else if (argv[i] === '--out') o.out = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') o.help = true;
  }
  return o;
}

const invoked = (() => { try { return pathToFileURL(path.resolve(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) console.log('node tools/assets/clip-bounds.mjs [--assets public/assets] [--out data/clip-bounds.json]');
  else writeClipBounds(o).then(() => { process.exitCode = 0; }, (e) => { console.error(`[clip-bounds] FAILED: ${e?.stack || e}`); process.exitCode = 1; });
}
