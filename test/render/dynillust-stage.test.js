// test/render/dynillust-stage.test.js — render/dynillust/renderer.js staging: a card's first-draw work runs as pieces
// after each frame's own work, within STAGE_BUDGET_MS (at least one piece a frame), a piece that is not done yet going
// to the back; a queue settles once its last piece is done.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DynIllustStage, STAGE_BUDGET_MS } from '../../public/js/render/dynillust/renderer.js';

const stage = () => new DynIllustStage({ raf: () => 1, hidden: () => false, manifest: async () => ({ groups: {} }) });

describe('DynIllustStage staging', () => {
  test('at least one piece a frame, more while the frame is under budget', () => {
    const S = stage();
    const ran = [];
    S._enqueue([() => (ran.push('a'), true), () => (ran.push('b'), true), () => (ran.push('c'), true)]);
    // a frame that already used its whole budget still runs one piece
    S._runJobs(performance.now() - STAGE_BUDGET_MS - 1);
    assert.deepEqual(ran, ['a']);
    // a fresh frame runs the rest (cheap pieces)
    S._runJobs(performance.now());
    assert.deepEqual(ran, ['a', 'b', 'c']);
    assert.equal(S._jobs.length, 0);
  });

  test('a piece that is not done yet is tried again later; the queue settles after its last piece', async () => {
    const S = stage();
    let tries = 0, settled = false;
    const p = S._enqueue([() => ++tries >= 3]).then(() => { settled = true; });
    S._runJobs(performance.now()); await Promise.resolve();
    assert.equal(settled, false);
    S._runJobs(performance.now()); S._runJobs(performance.now());
    await p;
    assert.equal(tries, 3);
    assert.equal(settled, true);
  });

  test('a throwing piece is dropped, the queue goes on', () => {
    const S = stage();
    const ran = [];
    const warn = console.warn; console.warn = () => {};
    try {
      S._enqueue([() => { throw new Error('gone'); }, () => (ran.push('next'), true)]);
      S._runJobs(performance.now());
    } finally { console.warn = warn; }
    assert.deepEqual(ran, ['next']);
  });
});
