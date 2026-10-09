// test/render/eyemask.test.js — closed eyes without the stencil masks (GitHub #177; PR #384 by @Convey123, re-implemented):
// the eyelids of these models are Spine clipping attachments, the masks are off on a crowded field or below high
// quality (render/app.js pickClipping), and SpineActor._eyeMaskFallback (render/spine.js) hides a covered slot whose
// centre leaves the clip polygon.
//
// Real runtime objects throughout: the official skeletons read by @pixi-spine/runtime-3.8, drawn by its real Spine
// (pixi-spine's slot containers and meshes on @pixi/core display objects — a 16 px canvas stand-in is all it needs
// headless) inside the real SpineActor. The eyeballs are meshes, drawn through `slot.currentMesh` — PR #384 hid
// `slot.currentSprite` (null on a mesh slot) and its test stubbed one onto every slot, so nothing was hidden in the
// game. The skeletons are not in the repository (public/assets: `npm run assets`): without them those tests skip.
// Run: node --test test/render/eyemask.test.js

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ASSETS = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const dirOf = (id) => path.join(ROOT, 'public', 'assets', 'spine', 'op', id, 'front');
const have = (id) => existsSync(path.join(dirOf(id), `${id}.skel`)) && existsSync(path.join(dirOf(id), `${id}.atlas`));
const MODELS = ['char_4058_pepe', 'char_4082_qiubai', 'char_4010_etlchi', 'char_1033_swire2'];

let SpineActor, pointInPolygon, rt, base, core;
before(async () => {
  // headless pixi: its shader-precision probe and Texture.WHITE ask for a canvas; no WebGL context is needed to build
  // and update a Spine's display tree
  class HeadlessCanvas { constructor() { this.width = 16; this.height = 16; } getContext(kind) { return kind === '2d' ? { fillStyle: '', fillRect() {}, clearRect() {}, drawImage() {} } : null; } }
  globalThis.HTMLCanvasElement ??= HeadlessCanvas;
  globalThis.document ??= { createElement: () => new HeadlessCanvas() };
  rt = require('@pixi-spine/runtime-3.8');
  base = require('@pixi-spine/base');
  core = require('@pixi/core');
  globalThis.PIXI = { spine: { Spine: rt.Spine } };   // SpineActor builds `new PIXI.spine.Spine(data)`
  ({ SpineActor, pointInPolygon } = await import('../../public/js/render/spine.js'));
});

const cache = new Map();
function skeletonData(id) {
  if (!cache.has(id)) {
    const atlas = new base.TextureAtlas(readFileSync(path.join(dirOf(id), `${id}.atlas`), 'utf8'), (line, cb) => cb(new core.BaseTexture(null, { width: 1024, height: 1024 })));
    cache.set(id, new rt.SkeletonBinary(new rt.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(readFileSync(path.join(dirOf(id), `${id}.skel`)))));
  }
  return cache.get(id);
}
/** A real SpineActor of `id` with its manifest entry, clipping masks on or off. */
function actor(id, clip) {
  const a = new SpineActor(skeletonData(id), ASSETS.chars[id].spine.front);
  a.setClipping(clip);
  return a;
}
/** Slots whose container the fallback hid: still attached (pixi-spine shows those), yet not visible. */
const hidden = (a) => a.spine.skeleton.slots.filter((s) => s.getAttachment() && a.spine.slotContainers[s.data.index].visible === false).map((s) => s.data.name).sort();
/** Hidden slots `t` s into clip `clip` ('Die' through SpineActor.die — a knock-down — or 'Idle'), masks off. A fresh
 *  actor per time: pixi-spine's state.update takes a delta. */
function hiddenAt(id, clip, t) {
  const a = actor(id, false);
  if (clip === 'Die') a.die(); else a.spine.state.setAnimation(0, clip, true);
  a.update(t);
  return hidden(a);
}

test('pointInPolygon: inside / outside of a convex and a concave polygon', () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.equal(pointInPolygon(5, 5, square, 4), true);
  for (const [x, y] of [[-1, 5], [11, 5], [5, -3]]) assert.equal(pointInPolygon(x, y, square, 4), false);
  const l = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];   // an L: the notch is outside
  assert.equal(pointInPolygon(6, 6, l, 6), false);
  assert.equal(pointInPolygon(2, 6, l, 6), true);
  assert.equal(pointInPolygon(8, 2, l, 6), true);
});

describe('eyelids on the official skeletons, drawn by the real pixi-spine runtime', { skip: !MODELS.every(have) && 'the operator skeletons are not in public/assets (npm run assets)' }, () => {
  test('the eyeballs are meshes drawn through slot.currentMesh, inside the eyelid clip\'s container', () => {
    const a = actor('char_4058_pepe', true);
    a.update(0.1);
    const slots = a.spine.skeleton.slots.filter((s) => /^F_[LR]_Eye_[BC]$/.test(s.data.name));
    assert.equal(slots.length, 4);
    const clip = a.spine.skeleton.slots.find((s) => s.clippingContainer);
    for (const s of slots) {
      assert.equal(s.getAttachment().constructor.name, 'MeshAttachment', s.data.name);
      assert.ok(s.currentMesh && !s.currentSprite, `${s.data.name}: a mesh, no sprite`);
      assert.equal(a.spine.slotContainers[s.data.index].parent, clip.clippingContainer, `${s.data.name} is clipped`);
    }
  });

  test('佩佩 knocked down (Die): the four eyeball / eye-white slots hide once the eyes close (0.13 → 1.00 s), none before', () => {
    for (const t of [0, 0.1]) assert.deepEqual(hiddenAt('char_4058_pepe', 'Die', t), [], `open at ${t}`);
    for (const t of [0.3, 0.52, 1]) assert.deepEqual(hiddenAt('char_4058_pepe', 'Die', t), ['F_L_Eye_B', 'F_L_Eye_C', 'F_R_Eye_B', 'F_R_Eye_C'], `closed at ${t}`);
  });

  test('仇白 knocked down: both eyeballs hide once the eyes close', () => {
    for (const t of [0, 0.1]) assert.deepEqual(hiddenAt('char_4082_qiubai', 'Die', t), [], `open at ${t}`);
    for (const t of [0.2, 0.52, 1]) assert.deepEqual(hiddenAt('char_4082_qiubai', 'Die', t), ['F_L_Eyeball', 'F_R_Eyeball'], `closed at ${t}`);
  });

  test('隐德来希 / 琳琅诗怀雅 blink in Idle (2.13–2.37 s / 2.90–3.00 s): hidden then, never with the eyes open', () => {
    for (const t of [0.5, 1.9, 3]) assert.deepEqual(hiddenAt('char_4010_etlchi', 'Idle', t), [], `隐德来希 open at ${t}`);
    for (const t of [2.13, 2.25, 2.37]) assert.ok(hiddenAt('char_4010_etlchi', 'Idle', t).length >= 4, `隐德来希 blinking at ${t}`);
    for (const t of [0.5, 2.6, 3.2]) assert.deepEqual(hiddenAt('char_1033_swire2', 'Idle', t), [], `琳琅诗怀雅 open at ${t}`);
    for (const t of [2.9, 2.97, 3]) assert.deepEqual(hiddenAt('char_1033_swire2', 'Idle', t), ['F_H_L_Eyeball', 'F_H_L_Eyew', 'F_H_R_Eyeball', 'F_H_R_Eyew'], `琳琅诗怀雅 at ${t}`);
  });

  test('a whole clip sampled at 30 Hz: hiding is rare outside a knock-down and never takes more than the eyes', () => {
    // [model, clip, seconds, share of frames with something hidden: at least, at most]
    for (const [id, clip, dur, lo, hi] of [
      ['char_4058_pepe', 'Idle', 4, 0, 0], ['char_4058_pepe', 'Die', 1.5, 0.5, 1],
      ['char_4082_qiubai', 'Idle', 4, 0, 0.35], ['char_4082_qiubai', 'Die', 1, 0.5, 1],
      ['char_4010_etlchi', 'Idle', 4, 0.02, 0.2], ['char_1033_swire2', 'Idle', 4, 0.01, 0.2],
    ]) {
      let hit = 0, frames = 0, most = 0;
      for (let t = 0; t <= dur; t += 1 / 30) { const n = hiddenAt(id, clip, t).length; frames++; if (n) hit++; most = Math.max(most, n); }
      assert.ok(hit / frames >= lo && hit / frames <= hi, `${id} ${clip}: ${Math.round(hit / frames * 100)} % of frames (want ${lo * 100}–${hi * 100} %)`);
      assert.ok(most <= 8, `${id} ${clip}: at most ${most} slots in one frame`);
    }
  });

  test('with the masks on nothing is hidden (the stencil cuts), and turning them back on shows what the fallback hid', () => {
    const on = actor('char_4058_pepe', true);
    on.die();
    on.update(0.52);
    assert.deepEqual(hidden(on), [], 'masks on: the fallback stays out');
    const off = actor('char_4058_pepe', false);
    off.die();
    off.update(0.52);
    assert.equal(hidden(off).length, 4, 'masks off: the closed eyes are hidden');
    off.setClipping(true);
    assert.deepEqual(hidden(off), [], 'shown again for the stencil');
    const clip = off.spine.skeleton.slots.find((s) => s.clippingContainer);
    assert.equal(clip.clippingContainer.mask, clip.currentGraphics, 'the mask is back on');
  });
});
