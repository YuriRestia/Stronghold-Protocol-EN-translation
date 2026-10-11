// Outfits (fork feature, docs/OUTFITS.md): a UnitView draws the model its owner's outfit names (ctx.outfitOf → info.model)
// when the manifest has it — Front, and Back facing up only when the outfit has a Back —, else its own model; enemies
// never ask; FORMS / sounds keep the operator's id (info.spine).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const SP = (n) => ({ skel: `/assets/${n}.skel`, atlas: `/assets/${n}.atlas`, textures: [`/assets/${n}.png`], anims: { idle: 'Idle' } });
const M = {
  chars: { char_1_a: { avatar: '/a/base.png', spine: { front: SP('base_f'), back: SP('base_b') } } },
  outfits: { chars: {
    'char_1_a@epoque#3': { avatar: '/o/av.png', spine: { front: SP('of_f'), back: SP('of_b') } },
    'char_1_a@boc#1': { avatar: '/o/av2.png', spine: { front: SP('of2_f') } },
  } },
};

function view(info, outfitOf) {
  const asked = [];
  const assets = {
    spineEntry: (id, o) => spineEntry(M, id, o),
    hasBack: (id) => hasBackSpine(M, id),
    picture: () => null,
    spine: { acquire: (entry) => { asked.push(entry.skel); return new Promise(() => {}); }, release() {}, restart() { return false; } },
  };
  const ctx = fakeViewCtx(fake.P, { cam: () => presetCamera('normal', { width: 1280, height: 720 }), assets, outfitOf });
  // (the view asks for its model as it is built)
  const v = new UnitView(ctx, { id: 1, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_1_a', avatar: 'char_1_a', tier: 1, x: 5, y: 5, maxHp: 1, dir: 'RIGHT', ...info });
  return { v, asked };
}

test('an outfit\'s own model, Front and Back; the operator\'s id stays the sound / FORMS key', () => {
  const { v, asked } = view({}, () => 'char_1_a@epoque#3');
  assert.equal(v.info.model, 'char_1_a@epoque#3');
  assert.equal(v.info.spine, 'char_1_a', 'spine unchanged');
  assert.deepEqual(asked, ['/assets/of_f.skel']);
  const up = view({ dir: 'UP' }, () => 'char_1_a@epoque#3');
  assert.deepEqual(up.asked, ['/assets/of_b.skel'], 'facing up: the outfit\'s Back');
});

test('a front-only outfit faces away with its Front; an outfit the manifest lacks keeps the own model; no outfit, no change', () => {
  assert.deepEqual(view({ dir: 'UP' }, () => 'char_1_a@boc#1').asked, ['/assets/of2_f.skel']);
  const missing = view({}, () => 'char_1_a@nope#9');
  assert.deepEqual(missing.asked, ['/assets/base_f.skel']);
  assert.deepEqual(view({}, () => null).asked, ['/assets/base_f.skel']);
  assert.deepEqual(view({ dir: 'UP' }, null).asked, ['/assets/base_b.skel'], 'no resolver (tests, the 2D fallback)');
  let calls = 0;
  view({ side: 'enemy', kind: 'enemy' }, () => { calls++; return 'char_1_a@epoque#3'; });
  assert.equal(calls, 0, 'enemies never ask');
  // a resolver that throws draws the default look
  assert.deepEqual(view({}, () => { throw new Error('boom'); }).asked, ['/assets/base_f.skel']);
});

test('the outfit picker\'s sprite preview: one scale for every model (the battle\'s), from the box only; feet low, centred', async () => {
  const { spriteFit } = await import('../../public/js/screens/outfits.js');
  const tall = spriteFit(200, 320), wide = spriteFit(400, 320);
  assert.equal(tall.k, Math.min(320 * 0.5, 200 * 0.62) / 320, 'a narrow box: capped by its width');
  assert.equal(wide.k, (320 * 0.5) / 320, 'a wide box: a tile is half its height');
  assert.deepEqual([wide.x, wide.y], [200, 320 * 0.9]);
  // nothing per model: two outfits with wildly different setup-pose bounds get the same size (2026-10-12)
  assert.deepEqual(spriteFit(300, 300), spriteFit(300, 300));
});
