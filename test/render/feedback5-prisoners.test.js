// test/render/feedback5-prisoners.test.js — community report of 2026-10-06 「囚徒类敌人出门就是已解放的模型」, client side.
// The 孤岛风云 prisoners' skeletons carry three clip sets whose collar light is grey, blinking orange and red; their
// official battle prefabs (local client battle/enm_pfb_6.ab: the Graphic component's anim key → clip table and the
// modes' replace pairs) draw 【禁锢】 on the grey set (the Spine starts on it), mode R — the warning before the last
// confined attack — on the orange set and 【解放】 (mode L) on the red one. The manifest's default roles used to pick
// 普通囚犯 / 老练囚犯's unnumbered set, the red one (tools/assets/spine.mjs PREFAB_SPINE_ROLES fixes it), and no FORMS entry
// existed, so no prisoner ever changed. The 3D board draws the same Pixi views over its canvas (render/board3d/scene.js),
// so one fix covers both boards. Headless fake PIXI (test/render/fakepixi.js); sim side:
// test/content/feedback5-prisoners.test.js.
// Run: node --test test/render/feedback5-prisoners.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { ANIM } from '../../shared/constants.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { resolveRoles } from '../../tools/assets/anim-roles.mjs';
import { PREFAB_SPINE_ROLES, applyRoleFix } from '../../tools/assets/spine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

/**
 * The official prefabs' idle clip per mode (Default = confined / R = warning / L = liberty) and the clip-name suffix of
 * that mode's Move / Attack / Die (read from battle/enm_pfb_6.ab; the light colours from the skeletons' slot colour
 * timelines: 普通囚犯 Idle red / Idle2 orange / Idle3 grey, 强壮囚犯 Idle grey / Idle2 orange / Idle3 red).
 */
const OFFICIAL = {
  enemy_1116_liprr: ['3', '2', ''],
  enemy_1116_liprr_2: ['3', '2', ''],
  enemy_1119_vofsd: ['', '2', '3'],
  enemy_1118_lidbox_2: ['_grey', '_orange', '_red'],
  enemy_1121_lifbos: ['_grey', '_orange', '_red'],
  enemy_1121_lifbos_2: ['_grey', '_orange', '_red'],
};

let fake, UnitView, FORMS;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FORMS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store(id) {
  const entry = assets.enemies[id].spine;
  const names = Object.keys(entry.animations || {});
  return {
    picture: () => null,
    image: async () => null,
    spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
}
async function view(id, info = {}) {
  const ctx = fakeViewCtx(fake.P, { assets: store(id), cam });
  const v = new UnitView(ctx, { id: 7, side: 'enemy', kind: 'enemy', defId: id, spine: id, tier: 1, x: 8, y: 9, maxHp: 1000, facing: -1, ...info });
  await tick(); await tick();
  assert.ok(v.actor, `${id}: Spine model built`);
  return v;
}
const sample = (anim = 0) => ({ x: 8, y: 9, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim, vx: 0 });

test('the manifest draws every prisoner confined first (the official prefab\'s grey set), and FORMS holds its warning and liberty sets', () => {
  for (const [id, [conf, warn, free]] of Object.entries(OFFICIAL)) {
    const sp = assets.enemies[id].spine;
    assert.equal(sp.anims.idle, `Idle${conf}`, `${id} idle`);
    assert.equal(sp.anims.move.loop, `Move${conf}`, `${id} move`);
    assert.equal(sp.anims.attack.loop, `Attack${conf}`, `${id} attack`);
    assert.equal(sp.anims.die, `Die${conf}`, `${id} die`);
    for (const [form, suf] of [['warning', warn], ['liberty', free]]) {
      const r = FORMS[id]?.[form]?.roles;
      assert.ok(r, `${id}: FORMS.${form}`);
      assert.deepEqual([r.idle, r.move.loop, r.attack.loop, r.die], [`Idle${suf}`, `Move${suf}`, `Attack${suf}`, `Die${suf}`], `${id} ${form}`);
      for (const n of [r.idle, r.move.loop, r.attack.loop, r.die]) assert.ok(n in sp.animations, `${id}: ${n} in the skeleton`);
      assert.equal(FORMS[id][form].change, null, 'the prefab switches the set at once');
    }
  }
});

test('a prisoner view: confined clips, the orange set on \'warning\', the red set on \'liberty\'; a view built freed starts red', async () => {
  for (const [id, [conf, warn, free]] of Object.entries(OFFICIAL)) {
    const v = await view(id);
    v.sync(sample(), 1);
    assert.equal(v.actor.current, `Idle${conf}`, `${id} out of the gate`);
    v.sync(sample(ANIM.MOVE), 2);
    assert.equal(v.actor.current, `Move${conf}`, `${id} walking confined`);
    v.setForm('warning');
    assert.equal(v.actor.current, `Move${warn}`, `${id} warning`);
    v.setForm('liberty');
    assert.equal(v.actor.current, `Move${free}`, `${id} freed`);
    v.sync(sample(), 3);
    assert.equal(v.actor.current, `Idle${free}`, `${id} freed idle`);
    const late = await view(id, { form: 'liberty' });
    late.sync(sample(), 1);
    assert.equal(late.actor.current, `Idle${free}`, `${id}: a view built after the liberation (UnitInfo form)`);
  }
});

test('a swing already running when the mode changes goes on in the new mode\'s attack clip (the freeing attack shows red, not orange)', async () => {
  // official buff_template_holder.ab enemy_liberty_listener[warning]: SwitchMode on ON_BEFORE_ATTACK, before the attack starts
  for (const [id, [conf, warn, free]] of Object.entries(OFFICIAL)) {
    const v = await view(id);
    v.sync(sample(), 1);
    v.onAttack(null, 2);
    assert.equal(v.actor.current, `Attack${conf}`, `${id}: the confined swing`);
    v.setForm('warning');
    assert.equal(v.actor.current, `Attack${warn}`, `${id}: the swing goes on orange`);
    v.setForm('liberty');
    assert.equal(v.actor.current, `Attack${free}`, `${id}: the swing goes on red`);
  }
});

test('the warning fx draws nothing of its own (the blinking collar is the model\'s); the liberation keeps its white blast', () => {
  assert.equal(fxSpec('phase', { kind: 'warning', form: 'warning' }).a, 'none');
  assert.equal(fxSpec('liberate', { form: 'liberty' }).a, 'blast');
});

test('tools/assets/spine.mjs PREFAB_SPINE_ROLES: the committed manifest is what fetch-assets resolves for 普通囚犯 / 老练囚犯', () => {
  for (const id of ['enemy_1116_liprr', 'enemy_1116_liprr_2']) {
    const sp = assets.enemies[id].spine;
    const out = applyRoleFix(resolveRoles(Object.keys(sp.animations), { skillIndices: [0], durations: sp.animations }), PREFAB_SPINE_ROLES[id], sp.animations);
    assert.deepEqual(out.missing, []);
    assert.deepEqual(out.roles, sp.anims, id);
  }
});
