// test/render/dynillust-host.test.js — render/dynillust/host.js without a browser: fake Workers that answer like
// render/dynillust/worker.js, a fake document. What it checks: an illustration's cards all go to one Worker, a new one
// to the Worker with the fewest; release() frees a Worker's keys; card states and ready() follow the Worker's messages;
// with no Worker that boots, the page falls back to the main-thread stage.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A Worker that boots (or fails) and records what the page sent. */
class FakeWorker {
  static all = [];
  static fail = false;
  constructor() {
    this.sent = [];
    this.onmessage = null;
    this.onerror = null;
    FakeWorker.all.push(this);
  }
  postMessage(m) {
    this.sent.push(m);
    if (m.t === 'opts') setTimeout(() => this.onmessage?.({ data: FakeWorker.fail ? { t: 'fail', message: 'no WebGL2' } : { t: 'ok', origin: 0 } }), 0);
    if (m.t === 'preload') setTimeout(() => this.onmessage?.({ data: { t: 'preloaded', rid: m.rid } }), 0);
  }
  answer(m) { this.onmessage?.({ data: m }); }
  terminate() { this.dead = true; }
}

function fakeCanvas() {
  return { width: 1, height: 1, style: {}, isConnected: false, transferControlToOffscreen() { return { offscreen: true }; }, getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0 }) };
}

let saved;
beforeEach(() => {
  saved = { Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas, HTMLCanvasElement: globalThis.HTMLCanvasElement, document: globalThis.document };
  FakeWorker.all = []; FakeWorker.fail = false;
  globalThis.Worker = FakeWorker;
  globalThis.OffscreenCanvas = function OffscreenCanvas() {};
  globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
  globalThis.HTMLCanvasElement.prototype.transferControlToOffscreen = () => ({});
  globalThis.document = { createElement: () => fakeCanvas(), hidden: false, addEventListener() {}, removeEventListener() {} };
});
afterEach(() => { Object.assign(globalThis, saved); for (const k of Object.keys(saved)) if (saved[k] === undefined) delete globalThis[k]; });

const { DynIllustHost, workersSupported, CARD_FIXED_BYTES } = await import('../../public/js/render/dynillust/host.js');

describe('DynIllustHost', () => {
  test('one Worker per illustration; a new one to the Worker with the fewest', async () => {
    assert.equal(workersSupported(), true);
    const H = new DynIllustHost({ workers: 2, manifest: async () => ({ groups: { dynillust: { a: {}, b: {}, c: {} } } }) });
    await H.ready;
    const a1 = H.mount('a'), b1 = H.mount('b'), a2 = H.mount('a'), c1 = H.mount('c');
    await tick();
    const [w0, w1] = FakeWorker.all;
    const mounts = (w) => w.sent.filter((m) => m.t === 'mount').map((m) => m.key);
    assert.deepEqual(mounts(w0), ['a', 'a', 'c']);
    assert.deepEqual(mounts(w1), ['b']);
    assert.equal(a1.worker, a2.worker);
    assert.notEqual(a1.worker, b1.worker);
    // the canvas went with the message (transferred)
    assert.ok(w0.sent.find((m) => m.t === 'mount').canvas);
    // release: a key no card shows leaves its Worker
    c1.unmount();
    H.release([]);
    assert.deepEqual([...H.workers[0].keys].sort(), ['a']);
    assert.ok(w0.sent.some((m) => m.t === 'unmount' && m.id === c1.id));
  });

  test('preload splits by cost: the heaviest first, each to the least loaded Worker', async () => {
    const g = { h1: { bytes: 6e6 }, h2: { bytes: 5e6 }, l1: { bytes: 2e6 }, l2: { bytes: 1e6, bytesHalf: 5e5 } };
    const H = new DynIllustHost({ workers: 2, manifest: async () => ({ groups: { dynillust: g } }) });
    await H.ready;
    const done = H.preload(['l2', 'l1', 'h2', 'h1']);   // the screen's order: lightest first
    await tick();
    for (const w of FakeWorker.all) for (const m of w.sent) if (m.t === 'preload') w.answer({ t: 'preloaded', rid: m.rid });
    await done;
    const asked = FakeWorker.all.map((w) => w.sent.filter((m) => m.t === 'preload').flatMap((m) => m.keys));
    // with the fixed part F per card: h1 → W0 (6 + F), h2 → W1 (5 + F), l1 → W1 (7 + 2F), l2 → W0 (7 + 2F)
    assert.deepEqual(asked, [['h1', 'l2'], ['h2', 'l1']]);
    assert.deepEqual(H.stats().load, [7e6 + 2 * CARD_FIXED_BYTES, 7e6 + 2 * CARD_FIXED_BYTES]);
    // a mount of a preloaded key stays on its Worker
    H.mount('l1');
    await tick();
    assert.ok(FakeWorker.all[1].sent.some((m) => m.t === 'mount' && m.key === 'l1'));
  });

  test('a page swap: only what each Worker draws now counts, not what it keeps from the last page', async () => {
    const g = { a: { bytes: 5e6 }, b: { bytes: 5e6 }, c: { bytes: 5e6 }, d: { bytes: 1e6 }, e: { bytes: 1e6 }, f: { bytes: 1e6 } };
    const H = new DynIllustHost({ workers: 2, manifest: async () => ({ groups: { dynillust: g } }) });
    await H.ready;
    const old = ['a', 'b', 'c'].map((k) => H.mount(k));
    await tick();
    // a, c on W0; b on W1
    assert.deepEqual(H.stats().load, [10e6 + 2 * CARD_FIXED_BYTES, 5e6 + CARD_FIXED_BYTES]);
    for (const c of old) c.unmount();
    assert.deepEqual(H.stats().load, [0, 0]);
    const next = ['d', 'e', 'f'].map((k) => H.mount(k));
    await tick();
    // spread again from zero (by the old totals all three would have gone to W1)
    assert.deepEqual(next.map((c) => c.worker.i), [0, 1, 0]);
  });

  test('the home framing goes to the Worker with the card (mount option framing / centre)', async () => {
    const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: { a: {} } } }) });
    await H.ready;
    H.mount('a', { framing: 'home', centre: 'illust' });
    H.mount('a');
    await tick();
    const m = FakeWorker.all[0].sent.filter((x) => x.t === 'mount');
    assert.deepEqual(m.map((x) => [x.framing, x.centre]), [['home', 'illust'], ['card', undefined]]);
  });

  test("a card's size comes from the ResizeObserver, not its transformed box", async () => {
    // a seat in its entrance animation: getBoundingClientRect is scaled, the layout size (contentRect) is not
    const obs = [];
    const savedRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; obs.push(this); } observe(el) { this.el = el; } unobserve() {} disconnect() {} };
    try {
      const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: { a: {} } } }) });
      await H.ready;
      const c = H.mount('a');
      c.canvas.isConnected = true;
      c.canvas.getBoundingClientRect = () => ({ width: 721.3, height: 404.1 });
      await tick();
      const w = FakeWorker.all[0];
      assert.equal(w.sent.find((m) => m.t === 'mount').box, null);
      obs[0].cb([{ target: c.canvas, contentRect: { width: 720, height: 403 } }]);
      assert.deepEqual(w.sent.filter((m) => m.t === 'box').map((m) => [m.w, m.h]), [[720, 403]]);
    } finally { if (savedRO === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = savedRO; }
  });

  test('setFraming goes to the Worker as a framing message (no remount)', async () => {
    const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: { a: {} } } }) });
    await H.ready;
    const c = H.mount('a');
    await tick();
    c.setFraming({ mode: 'card', zoom: 1.4, fy: 0.3 });
    const w = FakeWorker.all[0];
    assert.deepEqual(w.sent.filter((m) => m.t === 'framing').map((m) => [m.id, m.framing, m.centre]), [[c.id, { mode: 'card', zoom: 1.4, fy: 0.3 }, undefined]]);
    assert.equal(w.sent.filter((m) => m.t === 'mount').length, 1);
  });

  test("diag() returns each Worker's answer", async () => {
    const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: { a: {} } } }) });
    await H.ready;
    const p = H.diag();
    const w = FakeWorker.all[0];
    const ask = w.sent.find((m) => m.t === 'diag');
    w.answer({ t: 'diag', rid: ask.rid, gl: 0, stage: { r: [720, 403] }, cards: [{ key: 'a', wh: [720, 403] }] });
    assert.deepEqual(await p, [{ worker: 0, gl: 0, stage: { r: [720, 403] }, cards: [{ key: 'a', wh: [720, 403] }] }]);
  });

  test('a card follows its Worker: states, ready(), start()', async () => {
    const H = new DynIllustHost({ workers: 1, manifest: async () => ({ groups: { dynillust: { a: {} } } }) });
    await H.ready;
    const seen = [];
    const c = H.mount('a', { onState: (s) => seen.push(s) });
    await tick();
    const [w] = FakeWorker.all;
    w.answer({ t: 'state', id: c.id, s: 'ready' });
    w.answer({ t: 'ready', id: c.id, ok: true });
    assert.equal(await c.ready, true);
    c.start();
    assert.equal(c.state, 'live');
    assert.equal(c.canvas.style.opacity, '1');
    assert.ok(w.sent.some((m) => m.t === 'start' && m.id === c.id));
    w.answer({ t: 'opacity', id: c.id, a: 0.5 });
    assert.equal(c.canvas.style.opacity, '0.5');
    assert.deepEqual(seen, ['ready', 'live']);
  });

  test('no Worker boots: the main-thread stage takes the cards', async () => {
    FakeWorker.fail = true;
    const H = new DynIllustHost({ workers: 2, manifest: async () => ({ groups: { dynillust: {} } }) });
    await H.ready;
    assert.equal(H.workers.length, 0);
    assert.ok(H.fallback, 'fell back to DynIllustStage');
    assert.ok(FakeWorker.all.every((w) => w.dead));
  });
});
