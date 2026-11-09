// test/render/clip-bounds-table.test.js — (fork) the precomputed impostor clip bounds (tools/assets/clip-bounds.mjs →
// data/clip-bounds.json → render/clipBoundsTable.js → spine.js seedClipBounds): what the page gets from the table is
// the runtime's own measurement rounded outward — every box contains the runtime box, by less than one step on a side —,
// and anything the table does not match (another skeleton under the same hash, an unknown hash, another sampler or
// format) is measured at runtime as before.
// The roster part needs the art (public/assets, git-ignored): a sample of the skeletons on disk, all of them with
// CLIP_BOUNDS_FULL=1 (minutes).
// Run: node --test test/render/clip-bounds-table.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { syntheticSkeleton } from '../helpers/syntheticSkeleton.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rt = createRequire(path.join(ROOT, 'package.json'))('@pixi-spine/runtime-3.8');
const ASSETS = path.join(ROOT, 'public', 'assets');

let spine, gen, tableMod;
before(async () => {
  gen = await import('../../tools/assets/clip-bounds.mjs');
  spine = await import('../../public/js/render/spine.js');
  tableMod = await import('../../public/js/render/clipBoundsTable.js');
});
after(() => spine?.clearClipBoundsSeed());

const drain = () => { while (spine.pendingClipBounds()) spine.stepClipBounds(Infinity); };
/** A fresh synthetic skeleton under Spine hash `hash`. */
const synth = (hash = 'Tq3x9ZbA0kLmNoPq') => Object.assign(syntheticSkeleton(rt), { hash });
/** The page's view of skeleton data `data`: the record requestClipBounds gives, nothing sampled yet. */
const seeded = (data) => spine.requestClipBounds(data, rt.Skeleton, data.animations.map((a) => a.name));
/** `box` contains `ref` and exceeds it by less than `step` on every side. */
function containsTight(box, ref, step, msg) {
  assert.ok(Array.isArray(box) && Array.isArray(ref), `${msg}: ${box} vs ${ref}`);
  assert.ok(box[0] <= ref[0] && box[1] <= ref[1] && box[2] >= ref[2] && box[3] >= ref[3], `${msg}: [${box}] does not contain [${ref}]`);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(box[i] - ref[i]) < step, `${msg}: side ${i} ${box[i]} vs ${ref[i]} (step ${step})`);
}
/** A table of the synthetic skeleton under `hash`, from the runtime's own measurement (the generator's path). */
async function synthTable(hash) {
  spine.clearClipBoundsSeed();
  const data = synth(hash);
  const rects = await gen.measureSkeleton(data);
  const entries = new Map([[hash.slice(0, spine.CLIP_BOUNDS_KEY_CHARS), await gen.entryOf(data, rects)]]);
  return { table: await gen.encodeTable(entries), rects };
}

describe('precomputed clip bounds: table → page', () => {
  test('a matching skeleton starts measured: nothing queued, every box contains the runtime box (less than a step larger)', async () => {
    const hash = 'Tq3x9ZbA0kLmNoPq';
    const { table, rects } = await synthTable(hash);
    assert.equal(table.format, 1);
    assert.equal(table.sampler, spine.clipBoundsSamplerKey());
    assert.equal(table.count, 1);
    assert.equal(table.clips, rects.size, 'every clip the runtime measures (none unposable here)');
    // through JSON, as the page gets it
    assert.equal(spine.seedClipBounds(JSON.parse(JSON.stringify(table))), 0, 'nothing was queued to fill');
    const before = spine.pendingClipBounds();
    const rec = seeded(synth(hash));
    assert.equal(spine.pendingClipBounds(), before, 'no clip queued: all came from the table');
    for (const [name, r] of rects) {
      if (r === null) assert.equal(rec.rects.get(name), null, `${name}: draws nothing in both`);
      else containsTight(rec.rects.get(name), r, table.step, name);
    }
    spine.clearClipBoundsSeed();
    // a clip that draws nothing (runtime null) is stored as -(index + 1) and comes back as null, next to a rect
    const key = 'N0thing0'.slice(0, spine.CLIP_BOUNDS_KEY_CHARS);
    const t2 = await gen.encodeTable(new Map([[key, [spine.skeletonSignature(synth()), { Ghost: 0, Still: [-13, -50, 13, 1] }]]]));
    assert.ok(t2.skeletons[key][1].some((v) => v < 0), 'stored as a negative index');
    spine.seedClipBounds(t2);
    const rec2 = seeded(synth(`${key}rest`));
    assert.equal(rec2.rects.get('Ghost'), null, 'draws nothing');
    assert.deepEqual(rec2.rects.get('Still'), [-13 * t2.step, -50 * t2.step, 13 * t2.step, 1 * t2.step], 'steps × step');
    drain();
    spine.clearClipBoundsSeed();
  });

  test('another skeleton under the same hash (signature differs), an unknown hash, another sampler or format: measured at runtime', async () => {
    const hash = 'Zz9yXw8vU7tS6rQp';
    const { table, rects } = await synthTable(hash);
    // the same hash, one animation more: the signature no longer matches
    spine.seedClipBounds(table);
    const other = synth(hash);
    other.animations.push(new rt.Animation('Extra', [], 0));
    seeded(other);
    assert.ok(spine.pendingClipBounds() >= rects.size, 'queued for the runtime');
    drain();
    const rec = spine.requestClipBounds(other, rt.Skeleton, ['Wave']);
    assert.deepEqual(rec.rects.get('Wave'), rects.get('Wave'), 'the runtime\'s exact rect, not the table\'s rounded one');
    // an unknown hash
    seeded(synth('Unknown0hash0000'));
    assert.ok(spine.pendingClipBounds() > 0, 'unknown hash: queued');
    drain();
    // a skeleton without a hash
    seeded(synth(''));
    assert.ok(spine.pendingClipBounds() > 0, 'no hash: queued');
    drain();
    // another sampler / format / no step: the table is refused and nothing changes
    spine.clearClipBoundsSeed();
    assert.equal(spine.seedClipBounds({ ...table, sampler: `${table.sampler}|other` }), -1);
    assert.equal(spine.seedClipBounds({ ...table, format: 2 }), -1);
    assert.equal(spine.seedClipBounds({ ...table, step: 0 }), -1);
    assert.equal(spine.seedClipBounds(null), -1);
    assert.equal(spine.seedClipBounds({ format: 0, note: 'not generated: npm run clip-bounds' }), -1, 'the server answer when the file is missing');
    seeded(synth(hash));
    assert.ok(spine.pendingClipBounds() > 0, 'refused table: queued');
    drain();
  });

  test('a broken entry is ignored whole (measured at runtime), never half-used', async () => {
    const hash = 'Br0kenEntry12345';
    const { table } = await synthTable(hash);
    const key = hash.slice(0, spine.CLIP_BOUNDS_KEY_CHARS);
    const [sig, flat] = table.skeletons[key];
    for (const bad of [[...flat, 0], [999, 0, 0, 1, 1], [flat[0], 5, 5, 1, 1], [0.5, 0, 0, 1, 1]]) {
      spine.seedClipBounds({ ...table, skeletons: { [key]: [sig, bad] } });
      const rec = seeded(synth(hash));
      assert.equal(rec.rects.size, 0, `nothing seeded from ${JSON.stringify(bad)}`);
      drain();
    }
    spine.clearClipBoundsSeed();
  });

  test('a table that arrives while models wait fills them and empties their part of the queue', async () => {
    const hash = 'Late0arrival0abc';
    const { table, rects } = await synthTable(hash);
    spine.clearClipBoundsSeed();
    const rec = seeded(synth(hash));
    const waiting = spine.pendingClipBounds();
    assert.ok(waiting >= rects.size, 'queued before the table');
    spine.stepClipBounds(0);   // one pose: a clip in progress
    assert.ok(spine.seedClipBounds(table) > 0, 'seeded into the waiting record');
    assert.equal(spine.pendingClipBounds(), 0, 'nothing left to sample');
    for (const [name, r] of rects) if (r) containsTight(rec.rects.get(name), r, table.step, name);
    spine.clearClipBoundsSeed();
  });

  test('the page loader: fetches once (low priority), seeds, and a missing or failing file changes nothing', async () => {
    const hash = 'Loader0test00xyz';
    const { table } = await synthTable(hash);
    spine.clearClipBoundsSeed();
    tableMod.resetClipBoundsTable();
    let calls = 0;
    const later = [];
    const ok = tableMod.loadClipBoundsTable({ url: '/data/clip-bounds.json', later: (t) => later.push(t), fetchFn: async (u, o) => { calls++; assert.equal(u, '/data/clip-bounds.json'); assert.equal(o?.priority, 'low', 'behind what the screen needs now'); return { ok: true, json: async () => table }; } });
    assert.equal(calls, 0, 'nothing fetched before the task runs');
    assert.equal(later.length, 1);
    assert.equal(tableMod.loadClipBoundsTable(), ok, 'once per page');
    await later[0]();
    assert.equal(await ok, 0);
    assert.equal(calls, 1);
    const before = spine.pendingClipBounds();
    seeded(synth(hash));
    assert.equal(spine.pendingClipBounds(), before, 'seeded');
    spine.clearClipBoundsSeed();
    for (const fetchFn of [async () => ({ ok: false, json: async () => table }), async () => { throw new Error('offline'); }, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })]) {
      tableMod.resetClipBoundsTable();
      assert.equal(await tableMod.loadClipBoundsTable({ url: '/x', later: (t) => t(), fetchFn }), -1);
      seeded(synth(hash));
      assert.ok(spine.pendingClipBounds() > 0, 'no table: measured at runtime');
      drain();
    }
    tableMod.resetClipBoundsTable();
    assert.equal(await tableMod.loadClipBoundsTable(), -1, 'not a page (no location): nothing fetched');
    tableMod.resetClipBoundsTable();
  });

  test('rounding is outward: the stored rect × step contains the runtime rect on every side', () => {
    for (const r of [[-0.1, -0.1, 0.1, 0.1], [-358.91, -835.83, 530.11, 63.7], [4, 8, 12, 16], [-4.0001, 3.9999, 7.9999, 8.0001]]) {
      for (const step of [1, 2, 4]) {
        const q = gen.roundOut(r, step).map((v) => v * step);
        containsTight(q, r, step + 1e-9, `${r} step ${step}`);
      }
    }
  });
});

const haveArt = existsSync(path.join(ASSETS, 'spine'));
describe('precomputed clip bounds: the art on disk', { skip: !haveArt && 'no public/assets (npm run assets)' }, () => {
  const FULL = process.env.CLIP_BOUNDS_FULL === '1';
  test(`${FULL ? 'every skeleton' : 'a sample of the skeletons'}: the table the page gets contains the runtime's measurement, less than a step larger; nothing left to measure`, { timeout: FULL ? 3_600_000 : 600_000 }, async (t) => {
    const all = gen.findSkeletons(ASSETS);
    // the sample: every 50th skeleton, plus the models the impostor tests name (Ines, Gummy, Ashlock, Horn, SilverAsh, Wild Mane)
    const named = ['char_4087_ines', 'char_196_sunbr', 'char_431_ashlok', 'char_4039_horn', 'char_172_svrash', 'char_496_wildmn'];
    const files = FULL ? all : all.filter((f, i) => i % 50 === 0 || named.some((n) => path.basename(f).startsWith(n)));
    spine.clearClipBoundsSeed();
    const { table, stats } = await gen.buildClipBoundsTable({ files });
    t.diagnostic(`${files.length} files: ${stats.skeletons} skeletons, ${stats.clips} clips, ${stats.unreadable.length} unreadable, ${stats.conflicts} shared hashes left out, ${(stats.ms / 1000).toFixed(1)} s`);
    assert.ok(stats.skeletons > 0);
    assert.equal(spine.seedClipBounds(JSON.parse(JSON.stringify(table))), 0);
    let checked = 0, seededClips = 0;
    for (const file of files) {
      let a, b;
      try { a = await gen.readSkeleton(file); b = await gen.readSkeleton(file); } catch { continue; }
      if (!a.hash) continue;
      // the runtime's own measurement, on a skeleton the table does not know
      a.hash = `!${a.hash}`;
      const runtimeRects = await gen.measureSkeleton(a);
      if (!runtimeRects) continue;
      // the page's view: the same skeleton under its own hash, from the table
      const rec = seeded(b);
      const key = b.hash.slice(0, spine.CLIP_BOUNDS_KEY_CHARS);
      if (!table.skeletons[key]) continue;   // a shared hash left out: measured at runtime (counted in the diagnostic)
      for (const [name, r] of runtimeRects) {
        if (r === false) continue;
        assert.ok(rec.rects.has(name), `${path.basename(file)} ${name}: in the table`);
        if (r === null) assert.equal(rec.rects.get(name), null, `${path.basename(file)} ${name}: draws nothing`);
        else containsTight(rec.rects.get(name), r, table.step, `${path.basename(file)} ${name}`);
        seededClips++;
      }
      drain();   // (only a clip the runtime could not pose was queued again)
      checked++;
    }
    t.diagnostic(`checked ${checked} skeletons, ${seededClips} clips`);
    assert.ok(checked > 0);
    spine.clearClipBoundsSeed();
  });
});
