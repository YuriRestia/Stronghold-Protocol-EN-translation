// test/perfbench.test.js — the battle perf tooling: the committed specs of public/dev/perf (tools/capture-specs.mjs) still
// build and run with the current data and sim, the capture helpers, the perf page's frame figures (public/dev/frame-stats.js),
// and tools/perfbench.mjs's profile summary and per-platform Chrome flags. The page itself:
// test/render/battle-perf.browser.test.js (opt-in).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getData } from '../server/data.js';
import { DataSource } from '../server/sim/simdata.js';
import { createBattleFromSpec } from '../server/sim/spec.js';
import { specMeta, pickDefaults, cleanStart } from '../tools/capture-specs.mjs';
import { aggregateProfile, gpuArgs, areaOf } from '../tools/perfbench.mjs';
import { frameFigures } from '../public/dev/frame-stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/dev/perf');
const index = JSON.parse(readFileSync(path.join(DIR, 'index.json'), 'utf8'));

describe('committed perf specs (public/dev/perf)', () => {
  const ds = new DataSource(getData({ log: { warn() {}, error() {}, info() {} } }), null);

  test('the index lists one spec of each kind, each file a clean b.start', () => {
    assert.deepEqual(index.map((s) => s.kind), ['normal', 'unite', 'boss', 'hidden']);
    for (const s of index) {
      const f = path.join(DIR, `${s.name}.json`);
      assert.ok(existsSync(f), s.name);
      const msg = JSON.parse(readFileSync(f, 'utf8'));
      assert.equal(msg.t, 'b.start');
      assert.equal(msg.kind, s.kind);
      assert.equal(msg.elapsed, 0);
      assert.equal(msg.authoritative, true);
      assert.equal(msg.spec.stageId, s.stageId);
      assert.equal(msg.spec.players.length, s.players);
    }
  });

  for (const s of index) {
    test(`${s.name}: builds with the current data and runs 20 game seconds`, () => {
      const msg = JSON.parse(readFileSync(path.join(DIR, `${s.name}.json`), 'utf8'));
      const b = createBattleFromSpec(msg.spec, ds, { recordEvents: false });
      for (let i = 0; i < 600 && !b.finished; i++) b.step();
      assert.ok(b.finished || b.time >= 19.9, `battle time ${b.time}`);
      const snap = b.snapshot();
      assert.ok(Array.isArray(snap.units) && snap.units.length > 0, 'units on the field');
    });
  }
});

describe('tools/capture-specs.mjs helpers', () => {
  const start = (kind, n) => ({ t: 'b.start', kind, spec: { stageId: 'st', players: [{ units: Array(n).fill({}) }, { units: Array(n).fill({}) }] }, elapsed: 3.5, startAt: 9, serverNow: 9, authoritative: false });
  test('specMeta names and counts a b.start', () => {
    assert.deepEqual(specMeta('HARD', start('unite', 8), 9), { name: 'hard-unite-r9', title: '联防 · 第 9 回合', kind: 'unite', round: 9, stageId: 'st', players: 2, units: 16 });
  });
  test('pickDefaults keeps the latest normal / unite / boss / hidden, the last send of a resent battle', () => {
    const resent = start('boss', 8);
    const picked = pickDefaults([
      { round: 4, msg: start('normal', 1) }, { round: 13, msg: start('normal', 8) }, { round: 7, msg: start('unite', 4) },
      { round: 9, msg: start('unite', 8) }, { round: 14, msg: start('boss', 8) }, { round: 14, msg: resent },
    ]);
    assert.deepEqual(picked.map((c) => `${c.msg.kind}-r${c.round}`), ['normal-r13', 'unite-r9', 'boss-r14']);
    assert.equal(picked[2].msg, resent);
  });
  test('cleanStart: from the start, authoritative, no capture clocks', () => {
    const c = cleanStart(start('normal', 1));
    assert.deepEqual([c.elapsed, c.startAt, c.serverNow, c.authoritative, c.watch, c.done], [0, 0, 0, true, false, false]);
  });
});

describe("the perf page's frame figures (public/dev/frame-stats.js)", () => {
  test('average fps, nearest-rank percentiles and the stutter share of a sample', () => {
    assert.deepEqual(frameFigures([40, 16, 17, 17], 33.4), { fps: 44.4, p50: 17, p95: 40, p99: 40, over33: 25 });
  });

  test('one frame time is enough; no frame time gives null figures, not NaN / Infinity (the single-frame sample)', () => {
    assert.deepEqual(frameFigures([16.7], 33.4), { fps: 59.9, p50: 16.7, p95: 16.7, p99: 16.7, over33: 0 });
    assert.deepEqual(frameFigures([], 33.4), { fps: null, p50: null, p95: null, p99: null, over33: null });
    assert.equal(frameFigures([0, 0], 33.4).fps, null);
  });
});

describe('tools/perfbench.mjs', () => {
  test('Chrome GPU flags per platform: D3D11 on Windows, Metal on macOS, the default elsewhere', () => {
    assert.ok(gpuArgs('win32').includes('--use-angle=d3d11'));
    assert.ok(gpuArgs('darwin').includes('--use-angle=metal'));
    assert.ok(!gpuArgs('linux').some((a) => a.startsWith('--use-angle')));
  });

  test('areaOf sorts call frames by source', () => {
    assert.equal(areaOf({ url: 'http://h/vendor/pixi-spine.js', functionName: 'apply' }), 'spine');
    assert.equal(areaOf({ url: 'http://h/vendor/pixi.min.js', functionName: 'render' }), 'pixi');
    assert.equal(areaOf({ url: 'http://h/sim/Battle.js', functionName: 'step' }), 'sim');
    assert.equal(areaOf({ url: '', functionName: '(idle)' }), 'idle');
  });

  test('aggregateProfile: idle excluded; self time by area / function; stages inclusive, once per stack', () => {
    const cf = (functionName, url) => ({ functionName, url, lineNumber: 0 });
    const profile = {
      nodes: [
        { id: 1, callFrame: cf('(root)', ''), children: [2, 6, 7] },
        { id: 2, callFrame: cf('frameBody', 'http://h/js/render/app.js'), children: [3] },
        { id: 3, callFrame: cf('update', 'http://h/js/render/spine.js'), children: [4] },
        { id: 4, callFrame: cf('update', 'http://h/js/render/spine.js'), children: [5] },  // recursion: counted once
        { id: 5, callFrame: cf('apply', 'http://h/vendor/pixi-spine.js'), children: [] },
        { id: 6, callFrame: cf('(idle)', ''), children: [] },
        { id: 7, callFrame: cf('(program)', ''), children: [] },
      ],
      samples: [5, 5, 3, 6, 6, 7],
      timeDeltas: [1000, 1000, 1000, 5000, 5000, 1000],
    };
    const s = aggregateProfile(profile);
    assert.equal(s.busyMs, 4);
    assert.deepEqual(s.areas.map((a) => [a.area, a.pct]), [['spine', 50], ['render', 25], ['program', 25]]);
    const st = Object.fromEntries(s.stages.map((x) => [x.stage, x.pct]));
    assert.equal(st.spinePose, 75);
    assert.equal(st.frameBody, 75);
    assert.equal(st.program, 25);
    assert.equal(st.sim, 0);
    assert.match(s.top[0].fn, /^apply \/vendor\/pixi-spine\.js:1$/);
  });
});
