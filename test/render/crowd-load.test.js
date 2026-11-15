// test/render/crowd-load.test.js — (fork) when units switch to impostors (user-approved fixes of 2026-11-15, after Dev 44's
// Grand Alliance measurement): the adaptive load level (render/crowd.js stepLoad, render/app.js adaptLoad) ignores a
// battle's loading frames, needs 3 s of slow frames to step up and 2 s of calm frames to step down, and starts again at
// 0 every battle; a crowd's impostors are the enemies' first and the player's / helpers' units stay drawn directly
// (crowdIntervals, loadFloor, render/units.js UnitView.update); 设置「简化单位动画」 (spriteAnim) auto / quality /
// unlimited. Headless fake PIXI for the unit views (test/render/fakepixi.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  impostorBase, impostorInterval, crowdIntervals, loadFloor, SPRITE_ANIM_MODES, ROOMY_HIGH, LOAD_MAX,
  LOAD_GRACE_S, LOAD_UP_S, LOAD_DOWN_S, createLoadMeter, startBattleLoad, stepLoad,
} from '../../public/js/render/crowd.js';
import { sanitizeSettings, DEFAULT_SETTINGS, SPRITE_ANIM_MODES as STORED_MODES } from '../../public/js/ui/gameLogic/settings.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const FPS = 60;
/** Feed `secs` seconds of frames at `workMs` (a field with `busy` units) and return the level after each step. */
function feed(m, secs, workMs, busy = true) {
  const steps = [];
  for (let i = 0; i < Math.round(secs * FPS); i++) { const s = stepLoad(m, 1 / FPS, workMs, busy); if (s) steps.push(m.level); }
  return steps;
}

describe('load level timings (render/crowd.js stepLoad)', () => {
  test('the user-approved values', () => {
    assert.deepEqual([LOAD_GRACE_S, LOAD_UP_S, LOAD_DOWN_S, LOAD_MAX], [3, 3, 2, 3]);
  });

  test('a battle\'s loading frames never step the level up', () => {
    const m = createLoadMeter();
    startBattleLoad(m);
    assert.deepEqual(feed(m, LOAD_GRACE_S - 0.05, 30), [], '3 s of 30 ms loading frames: still level 0');
    assert.equal(m.level, 0);
    assert.equal(m.slowFor, 0, 'the grace period does not count toward a step');
  });

  test('stepping up needs 3 s of slow frames; a shorter spell or a calm frame in between does not', () => {
    const m = createLoadMeter();               // no battle start seen: no grace
    assert.deepEqual(feed(m, 2.5, 22), [], '2.5 s slow (the old rule stepped up after 1 s)');
    feed(m, 0.1, 10);                          // one calm moment resets the spell
    assert.deepEqual(feed(m, 2.9, 22), []);
    assert.deepEqual(feed(m, 0.2, 22), [1], '2.9 + 0.2 s = 3.1 s in a row: level 1');
  });

  test('stepping down takes 2 s of calm frames per level, whatever the level', () => {
    const m = createLoadMeter();
    feed(m, 3.1 * 3, 25);
    assert.equal(m.level, 3);
    assert.deepEqual(feed(m, 1.9, 10), [], 'not before 2 s');
    assert.deepEqual(feed(m, 0.2, 10), [2], '2 s at level 3 (was 18 s)');
    assert.deepEqual(feed(m, 4.2, 10), [1, 0], 'then 2 s per level (was 12 s + 6 s)');
  });

  test('every battle starts again at level 0 (it never reset before)', () => {
    const m = createLoadMeter();
    feed(m, 3.1 * 2, 25);
    assert.equal(m.level, 2);
    startBattleLoad(m);
    assert.equal(m.level, 0);
    assert.deepEqual([m.slowFor, m.fastFor, m.battleFor], [0, 0, 0]);
  });

  test('Dev 44\'s round-12 runs (per-second workMs as measured) no longer step up', () => {
    // [src: I:/ClaudeCrew/proofs/dev-44/ga-impostor-clean-c12{a,b,c}.csv workMs] — each second's mean, seconds 1–8; the
    // old rule stepped up in all three runs (0→1 at 1.2–1.4 s, run b to level 3 by 5.3 s)
    const runs = {
      a: [26.67, 18.08, 17.43, 21.23, 21.08, 9.9, 6.75, 5.6],
      b: [26.39, 15.74, 19.97, 21.31, 24.41, 15.18, 11.66, 12.25],
      c: [23.83, 12.3, 15.58, 15.18, 17.03, 9.66, 14.44, 10.72],
    };
    for (const [run, secs] of Object.entries(runs)) {
      const m = createLoadMeter();
      startBattleLoad(m);
      const steps = secs.flatMap((w) => feed(m, 1, w));
      assert.deepEqual(steps, [], `run ${run}`);
    }
  });
});

describe('enemies first, and the 简化单位动画 modes (render/crowd.js)', () => {
  test('a crowd past the base puts the enemies on impostors while the allies alone fit', () => {
    assert.deepEqual(crowdIntervals(50, 16, { quality: 'high', loadLevel: 1, roomy: true }), { enemy: 2, ally: 0 }, 'base 44, 16 helpers');
    assert.deepEqual(crowdIntervals(50, 46, { quality: 'high' }), { enemy: 2, ally: 2 }, 'the allies alone are past the base');
    assert.deepEqual(crowdIntervals(40, 20, { quality: 'high' }), { enemy: 0, ally: 0 });
    assert.deepEqual(crowdIntervals(10, 10, { force: true }), { enemy: 2, ally: 2 }, 'forced (dev): everyone');
  });

  test('the load floor: enemies from level 1 (far) / 2 (all), allies only at the top level', () => {
    assert.equal(loadFloor(1, { enemy: true, far: true }), 2);
    assert.equal(loadFloor(1, { enemy: true, far: false }), 0);
    assert.equal(loadFloor(2, { enemy: true }), 2);
    assert.equal(loadFloor(2, { enemy: false, far: true }), 0, 'a helper\'s operator stays direct at level 2');
    assert.equal(loadFloor(LOAD_MAX, { enemy: false }), 2, 'at the top level everyone');
    assert.equal(loadFloor(0, { enemy: true, far: true }), 0);
  });

  test('quality: the load level never matters, only a crowd past ROOMY_HIGH; unlimited: never', () => {
    assert.deepEqual([...SPRITE_ANIM_MODES], ['auto', 'quality', 'unlimited']);
    assert.deepEqual([...STORED_MODES], [...SPRITE_ANIM_MODES], 'the stored values match the renderer\'s');
    assert.equal(impostorBase({ quality: 'low', loadLevel: 3, mode: 'quality' }), ROOMY_HIGH);
    assert.equal(impostorInterval(88, { quality: 'low', loadLevel: 3, mode: 'quality' }), 0);
    assert.equal(impostorInterval(89, { quality: 'high', loadLevel: 3, mode: 'quality' }), 2, '89 units: impostors, at the level-0 rate');
    assert.equal(loadFloor(3, { enemy: true, far: true, mode: 'quality' }), 0);
    assert.equal(impostorInterval(500, { loadLevel: 3, mode: 'unlimited' }), 0);
    assert.equal(loadFloor(3, { enemy: true, far: true, mode: 'unlimited' }), 0);
    assert.equal(impostorInterval(89, { quality: 'high', roomy: true, mode: 'auto' }), 2, 'auto: as before');
  });

  test('the setting is stored with the others; a missing or junk value is auto', () => {
    assert.equal(DEFAULT_SETTINGS.spriteAnim, 'auto');
    assert.equal(sanitizeSettings(null).spriteAnim, 'auto');
    assert.equal(sanitizeSettings({ spriteAnim: 'quality' }).spriteAnim, 'quality');
    assert.equal(sanitizeSettings({ spriteAnim: 'unlimited' }).spriteAnim, 'unlimited');
    for (const bad of ['max', 1, null, true]) assert.equal(sanitizeSettings({ spriteAnim: bad }).spriteAnim, 'auto');
  });

  test('every option text is in every language pack', () => {
    const src = readFileSync(new URL('../../public/js/ui/settings.js', import.meta.url), 'utf8');
    const ids = ['简化单位动画', '画质优先', '无限制', '完整动画。帧率下降时，单位会切换为简化动画，直到帧率恢复。',
      '即使帧率下降，单位也保持完整动画。规模极大的单位群（约 90 个以上）仍会使用简化动画。', '所有单位始终播放完整动画。手机烫得能煎蛋可别怪我。'];
    for (const id of ids) assert.ok(src.includes(id), `settings.js uses ${id}`);
    for (const code of ['en', 'ja', 'ko', 'zh-TW']) {
      const pack = JSON.parse(readFileSync(new URL(`../../public/i18n/${code}.json`, import.meta.url), 'utf8'));
      for (const id of ids) assert.ok(pack[id], `${code}: ${id}`);
    }
  });
});

describe('UnitView: enemies first (render/units.js)', () => {
  let fake, UnitView;
  before(async () => {
    fake = installFakePixi();
    ({ UnitView } = await import('../../public/js/render/units.js'));
  });
  after(() => fake.restore());
  const tick = () => new Promise((r) => setImmediate(r));
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const ENTRY = { skel: '/s/u.skel', atlas: '/s/u.atlas', textures: ['/s/u.png'], anims: { idle: 'Idle' }, animations: { Idle: 1 } };
  const DATA = { animations: [{ name: 'Idle' }] };

  /** A unit with a Spine model in a field whose crowd intervals are { enemy, ally }, at load level `lvl`, mode `mode`. */
  async function unit(side, { enemy = 0, ally = 0, lvl = 0, mode = 'auto' } = {}) {
    let frame = 0;
    const atlas = {
      alloc: (w, h, o) => ({ w, h, tex: new fake.P.Texture(), clip: !!o?.clip }),
      free() {}, park(o) { o.visible = false; }, unpark(o) { o.visible = true; }, draw() {},
    };
    const ctx = fakeViewCtx(fake.P, {
      cam, frameNo: () => frame, impostors: atlas, impostorInterval: (isEnemy = true) => (isEnemy ? enemy : ally),
      loadLevel: () => lvl, spriteAnim: () => mode, clipAllowed: () => true,
      renderer: { resolution: 1, render() {} },
      assets: { picture: () => null, image: async () => null, spineEntry: () => ENTRY, spine: { acquire: async () => DATA, release() {} } },
    });
    const v = new UnitView(ctx, { id: side === 'enemy' ? 2 : 1, side, kind: side === 'enemy' ? 'enemy' : 'chess', defId: 'x', tier: 1, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' });
    await tick(); await tick();
    assert.ok(v.spineReady, 'spine ready');
    for (let i = 0; i < 4; i++) { v.update(1 / 60, cam(), frame / 60); frame++; }
    return v;
  }

  test('a crowd on impostors: the enemy is one, the helper\'s operator is drawn directly', async () => {
    assert.ok((await unit('enemy', { enemy: 2, ally: 0 })).imp, 'enemy: impostor');
    assert.ok(!(await unit('ally', { enemy: 2, ally: 0 })).imp, 'ally: drawn directly');
  });

  test('load level 2: every enemy on impostors, the allies still direct; level 3: everyone', async () => {
    assert.ok((await unit('enemy', { lvl: 2 })).imp);
    assert.ok(!(await unit('ally', { lvl: 2 })).imp, 'ally at level 2 (before: every unit)');
    assert.ok((await unit('ally', { lvl: 3 })).imp, 'ally at level 3');
  });

  test('quality / unlimited: the load level turns nobody into an impostor', async () => {
    assert.ok(!(await unit('enemy', { lvl: 3, mode: 'quality' })).imp);
    assert.ok(!(await unit('enemy', { lvl: 3, mode: 'unlimited' })).imp);
    assert.ok((await unit('enemy', { enemy: 2, lvl: 3, mode: 'quality' })).imp, 'quality: a crowd past 88 still is');
  });
});
