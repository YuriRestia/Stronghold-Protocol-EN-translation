// test/render/impostor-snap.test.js — an impostor sprite sits on whole screen pixels (render/units.js
// UnitView._snapImpostor). Its slot holds the skeleton already drawn at the screen's scale; at a fractional screen
// position the sprite samples it a second time between texels and every edge comes out up to half a pixel soft, while
// the units around it are drawn directly. A model with a clip that is not an eyelid (char_1026_gvial2's F_F) is always
// an impostor, so it alone looked blurry on an ordinary field. Headless fake PIXI (test/render/fakepixi.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const ENTRY = { skel: '/s/op.skel', atlas: '/s/op.atlas', textures: ['/s/op.png'], anims: { idle: 'Idle', die: 'Die' }, animations: { Idle: 1, Die: 0.8 } };
const DATA = { animations: [{ name: 'Idle' }, { name: 'Die' }] };
const near = (x, eps = 1e-6) => Math.abs(x - Math.round(x)) < eps;

/** An operator drawn through an impostor atlas whose slots sit at (16, 32) of a page at `texRes` (screen: `res`). */
async function operator({ res = 1.5, texRes = res, dir = 'RIGHT', x = 5, y = 10 } = {}) {
  let frame = 0;
  const atlas = {
    alloc: (w, h, o) => {
      const base = new fake.P.BaseTexture({ width: 1024, height: 1024 });
      base.resolution = texRes;
      return { w, h, clip: !!o?.clip, tex: new fake.P.Texture(base, new fake.P.Rectangle(16, 32, w, h)) };
    },
    free() {}, park(o) { o.visible = false; }, unpark(o) { o.visible = true; }, draw() {},
  };
  const ctx = fakeViewCtx(fake.P, {
    // impostorSlot 0: refreshes on even frames (without it each unit draws a random phase, units.js _updateImpostor)
    cam, frameNo: () => frame, impostors: atlas, impostorInterval: () => 2, impostorSlot: () => 0,
    renderer: { resolution: res, render() {} },
    assets: { picture: () => null, image: async () => null, spineEntry: () => ENTRY, spine: { acquire: async () => DATA, release() {} } },
  });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x, y, maxHp: 1000, dir });
  await tick(); await tick();
  assert.ok(v.spineReady, 'spine ready');
  const step = (n = 1) => { for (let i = 0; i < n; i++) { v.update(1 / 60, cam(), frame / 60); frame++; } };
  return { v, step, res };
}

/** Screen-pixel offset of the slot's texel grid (whole = 1:1 copy), with and without the sprite's own position. */
function grid(v, res) {
  const sp = v.imp.sprite, f = sp.texture.frame, flip = Math.sign(sp.scale.x);
  const gx = v.root.position.x + v.body.position.x, gy = v.root.position.y + v.body.position.y;
  const ax = sp.anchor.x * f.width, ay = sp.anchor.y * f.height;
  const raw = { x: res * (flip < 0 ? gx + ax + f.x : gx - ax - f.x), y: res * (gy - ay - f.y) };
  return { raw, at: { x: raw.x + res * sp.position.x, y: raw.y + res * sp.position.y }, sp };
}

describe('UnitView: impostor sprites on whole screen pixels', () => {
  test('facing right: the slot\'s texels land on screen pixels, moved by under one pixel', async () => {
    const { v, step, res } = await operator({ res: 1.5 });
    step(4);
    assert.ok(v.imp && v.imp.slot, 'impostor mode, in an atlas slot');
    const g = grid(v, res);
    assert.ok(!near(g.raw.x) || !near(g.raw.y), `the unit stands between pixels (${g.raw.x}, ${g.raw.y}), else this test proves nothing`);
    assert.ok(near(g.at.x) && near(g.at.y), `on the pixel grid (${g.at.x}, ${g.at.y})`);
    assert.ok(Math.abs(g.sp.position.x) * res <= 0.5 + 1e-9 && Math.abs(g.sp.position.y) * res <= 0.5 + 1e-9, 'at most half a pixel away');
  });

  test('facing left (mirrored sprite): on the pixel grid too', async () => {
    const { v, step, res } = await operator({ res: 2, dir: 'LEFT', x: 7, y: 11 });
    step(4);
    const g = grid(v, res);
    assert.ok(g.sp.scale.x < 0, 'mirrored');
    assert.ok(near(g.at.x) && near(g.at.y), `on the pixel grid (${g.at.x}, ${g.at.y})`);
  });

  test('not a 1:1 copy: another scale between refreshes, or a page at another resolution, stays unmoved', async () => {
    const a = await operator({ res: 1.5 });
    a.step(5);                                           // frames 0–4: the next one (5) is no refresh turn
    a.v.modelK *= 1.05;                                  // within the 12 % rescale threshold: the slot is only stretched
    a.step(1);
    assert.notEqual(Math.abs(a.v.imp.sprite.scale.y), 1, 'stretched');
    assert.deepEqual([a.v.imp.sprite.position.x, a.v.imp.sprite.position.y], [0, 0]);
    const b = await operator({ res: 1.5, texRes: 1 });
    b.step(4);
    assert.deepEqual([b.v.imp.sprite.position.x, b.v.imp.sprite.position.y], [0, 0]);
  });
});
