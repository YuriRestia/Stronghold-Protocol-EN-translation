// test/render/dynillust-stage.test.js — render/dynillust/renderer.js staging: a card's first-draw work runs as pieces
// after each frame's own work, within STAGE_BUDGET_MS (at least one piece a frame), a piece that is not done yet going
// to the back; a queue settles once its last piece is done.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DynIllustStage, STAGE_BUDGET_MS } from '../../public/js/render/dynillust/renderer.js';
import { cardFraming } from '../../public/js/render/dynillust/framing.js';

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

  test('maxFps: on a 240 Hz display a 60 fps cap draws every 4th frame and steps by the real time between', () => {
    const S = new DynIllustStage({ raf: () => 1, hidden: () => false, manifest: async () => ({ groups: {} }), maxFps: 60 });
    const dts = [];
    S.cards.add({ sync: (dt) => dts.push(dt) });   // a stand-in card: sync runs once per drawn frame
    // (rAF times start after page load; the stage reads a time of 0 as "no frame yet")
    const step = 1000 / 240, t0 = 1000;
    for (let i = 0; i < 241; i++) S._frame(t0 + i * step);
    assert.equal(S.frameNo, 61, 'one drawn frame per 4 display frames, plus the first');
    const total = dts.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `stepped ${total} s over 1 s`);
    assert.ok(dts.slice(1).every((d) => Math.abs(d - 4 * step / 1000) < 1e-9));
    // without a cap every display frame draws
    const U = stage();
    U.cards.add({ sync() {} });
    for (let i = 0; i < 241; i++) U._frame(t0 + i * step);
    assert.equal(U.frameNo, 241);
  });

  test('quality Full → Half frees the full tier no card shows; a shown one goes when its last card does', () => {
    const S = stage();
    const freed = [], dropped = [];
    const prep = (name, tex) => ({ pages: new Map([[name, { destroy: () => freed.push(name) }]]), fxDef: { textures: tex } });
    S.cache.set('a|full', { prep: prep('a', ['ta', 'shared']) });
    S.cache.set('b|full', { prep: prep('b', ['tb', 'shared']) });
    S.cache.set('c|half', { prep: prep('c', ['tc']) });
    S.glr = { dropTexture: (k, half) => dropped.push(`${k}|${half ? 'half' : 'full'}`) };
    // a card still shows b at the full tier (its screen re-mounts it after the switch)
    const cardB = { key: 'b', tier: 'full', state: 'live' };
    S.cards.add(cardB);
    S.quality = 'half';
    // a freed: its page, and its own effect texture; 'shared' stays (b still uses it); b and the current tier stay
    assert.deepEqual(freed, ['a']);
    assert.deepEqual(dropped, ['ta|full']);
    assert.deepEqual([...S.cache.keys()].sort(), ['b|full', 'c|half']);
    // b's last card unmounts: the full tier goes
    cardB.state = 'unmounted';
    S._unmount(cardB);
    assert.deepEqual(freed, ['a', 'b']);
    assert.deepEqual(dropped.sort(), ['shared|full', 'ta|full', 'tb|full']);
    assert.deepEqual([...S.cache.keys()], ['c|half']);
    // setting the same tier again frees nothing
    S.quality = 'half';
    assert.deepEqual([...S.cache.keys()], ['c|half']);
  });

  test('setFraming: a slot only this card draws is reframed in place; a shared one is left for the next frame', () => {
    const S = stage();
    const home = cardFraming('home'), card0 = cardFraming('card');
    // a stand-in slot (Slot.reframe sets frameId and the framing map: the constructor's own code)
    const slotFor = (cards) => {
      const s = { id: `k|full|720x403|${card0.id}`, w: 720, h: 403, frameId: card0.id, cards: new Set(cards), framed: [] };
      s.reframe = (f) => { s.framed.push(f.mode); s.frameId = f.id; };
      s.destroy = () => {};
      S.slots.set(s.id, s);
      return s;
    };
    const a = S.mount('k');
    const sa = slotFor([a]); a.slot = sa;
    a.setFraming('home');
    assert.equal(a.slot, sa, 'the same slot: no rebuild, the animation goes on');
    assert.deepEqual(sa.framed, ['home']);
    assert.equal(sa.id, `k|full|720x403|${home.id}`);
    assert.deepEqual([...S.slots.keys()], [sa.id]);
    assert.equal(a.frameId, home.id);
    // the same framing again: nothing
    a.setFraming('home');
    assert.deepEqual(sa.framed, ['home']);
    // shared: the slot stays as it is; the card's frameId differs from it, so its next sync re-attaches it
    S.slots.clear();
    const b = S.mount('k'), c = S.mount('k');
    const sb = slotFor([b, c]); b.slot = sb; c.slot = sb;
    b.setFraming('home');
    assert.deepEqual(sb.framed, []);
    assert.equal(sb.id, `k|full|720x403|${card0.id}`);
    assert.notEqual(b.slot.frameId, b.frameId);
    assert.equal(c.slot.frameId, c.frameId);
    for (const x of [a, b, c]) x.unmount();
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
