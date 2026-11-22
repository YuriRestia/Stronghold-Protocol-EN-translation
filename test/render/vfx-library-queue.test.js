// test/render/vfx-library-queue.test.js — render/vfx/library.js _limit: at most 8 loads at once; waiting loads are
// served per owner in turn (the animated illustrations' cards), loads without an owner first-in, first-out.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxLibrary } from '../../public/js/render/vfx/library.js';

/** A load that finishes when told: { fn, done() }. */
function gate(log, name) {
  let open;
  const p = new Promise((r) => { open = r; });
  return { fn: () => { log.push(name); return p; }, done: () => open() };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('FxLibrary._limit', () => {
  test('a freed slot goes to the waiting owners in turn', async () => {
    const lib = new FxLibrary({ list: { groups: {} } });
    const log = [];
    const busy = Array.from({ length: 8 }, (_, i) => gate(log, 'busy' + i));
    for (const g of busy) lib._limit(g.fn, 'A');
    await tick();
    assert.equal(lib.active, 8);
    // A queues four more, then B two: B must not wait for all of A's
    for (let i = 0; i < 4; i++) lib._limit(gate(log, 'A' + i).fn, 'A');
    for (let i = 0; i < 2; i++) lib._limit(gate(log, 'B' + i).fn, 'B');
    for (const g of busy.slice(0, 6)) { g.done(); await tick(); await tick(); }
    assert.deepEqual(log.slice(8), ['A0', 'B0', 'A1', 'B1', 'A2', 'A3']);
  });
  test('loads without an owner keep first-in, first-out', async () => {
    const lib = new FxLibrary({ list: { groups: {} } });
    const log = [];
    const busy = Array.from({ length: 8 }, (_, i) => gate(log, 'busy' + i));
    for (const g of busy) lib._limit(g.fn);
    for (let i = 0; i < 3; i++) lib._limit(gate(log, 'n' + i).fn);
    for (const g of busy.slice(0, 3)) { g.done(); await tick(); await tick(); }
    assert.deepEqual(log.slice(8), ['n0', 'n1', 'n2']);
  });
});
