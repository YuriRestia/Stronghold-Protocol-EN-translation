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

const { DynIllustHost, workersSupported } = await import('../../public/js/render/dynillust/host.js');

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
