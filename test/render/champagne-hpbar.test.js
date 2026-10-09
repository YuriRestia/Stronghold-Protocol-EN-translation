// test/render/champagne-hpbar.test.js — 琳琅诗怀雅's 香槟炸弹 (token_10031_swire2_gdtrap) never shows an HP bar: PRTS 香槟炸弹
// 备注 "即使自身生命值未满，模型下方也不会显示生命值槽" (the owner's report of 2026-10-08, 「香槟会掉血，会被治疗」). Allies
// otherwise always draw one (render/units.js _updateHud). Only the bar changes; its HP and healing stay as they are.
// Run: node --test test/render/champagne-hpbar.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const view = (defId, id) => new UnitView(fakeViewCtx(fake.P, { cam }), { id, side: 'ally', kind: 'summon', defId, tier: 1, x: 11, y: 10, maxHp: 1000, hp: 1000 }, {});
const frames = (v) => { for (let i = 0; i < 2; i++) v.update(1 / 60, cam(), i / 60); };
const bar = (v) => [v.hpBg.visible, v.hpFill.visible, v.hpGhost.visible];

test('香槟炸弹 shows no HP bar at full HP, below it, or healed back up', () => {
  const bomb = view('token_10031_swire2_gdtrap', 1);
  frames(bomb);
  assert.deepEqual(bar(bomb), [false, false, false], 'full HP');
  bomb.sync({ x: 11, y: 10, hp: 860, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0 }, 1);
  frames(bomb);
  assert.equal(bomb.hp, 860, 'the view keeps its HP');
  assert.deepEqual(bar(bomb), [false, false, false], 'hurt (活性源石: 70 true damage a second)');
  bomb.sync({ x: 11, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0 }, 2);
  frames(bomb);
  assert.deepEqual(bar(bomb), [false, false, false], 'healed');
});

test('another summon still draws its HP bar, full or hurt', () => {
  const other = view('token_10000_silent_healrb', 2);
  frames(other);
  assert.deepEqual(bar(other), [true, true, true]);
  other.sync({ x: 11, y: 10, hp: 400, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0 }, 1);
  frames(other);
  assert.deepEqual(bar(other), [true, true, true]);
});
