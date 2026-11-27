// test/content/spacc-untargetable.test.js — #47: the 无敌 after a SPA-CC leader's revive (爱国者's reborn_invincible, the
// ccVengeance Invincible Blade 2 “复仇者”'s 15 s) is untargetable too, as Xi's (#510): no operator selects him, area hits
// deal 0, an operator's status (诱导) does not land — while a source-less aura (莫斯提马's 主观缓时 slow) still does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { canTargetEnemy } from '../../server/sim/targeting.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };

/** The leader knocked out and stood up again: in his post-revive 无敌 (`${key}:inv`). */
function revived(key, { rules = {}, mods = {} } = {}) {
  const h = makeBattle({
    defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules },
    units: [{ chessId: 'chess_char_3_01_a', row: 10, col: 2 }],
  });
  h.step(1);
  const e = h.spawn(key, { pos: [10, 4], routeIndex: 0, mods: { speedMul: 0, ...mods } });
  h.run(0.5);
  h.b.dealDamage(null, e, { amount: e.hp + 1, type: 'true', sourceless: true });
  assert.ok(h.runUntil(() => e.findBuff('ab:reborn:inv'), 120), 'stood up into his 无敌');
  return { h, e, op: h.unit('chess_char_3_01_a') };
}

function untargetable({ h, e, op }) {
  assert.ok(e.s.flags.invulnerable && e.s.flags.untargetable, '无敌 and untargetable');
  assert.equal(canTargetEnemy(op, e, op.profile), false, 'no operator selects him');
  const hp = e.hp;
  h.b.dealDamage(op, e, { amount: 1e5, type: 'phys', isSkill: true, isSplash: true, tags: ['skill'] });
  assert.equal(e.hp, hp, 'an area hit deals 0');
  assert.equal(h.b.applyStatus(e, 'attract', { source: op, duration: 3 }), false, 'no 诱导');
  h.b.addBuff(e, { key: 'mostma:slow:test', mods: { moveMul: 0.85 }, duration: 0.75, status: 'slow', visible: true });
  assert.ok(e.findBuff('mostma:slow:test'), 'a source-less aura slow still lands');
}

test('爱国者: his post-revive 无敌 is untargetable', () => {
  const f = revived('enemy_1506_patrt');
  untargetable(f);
  const inv = f.e.findBuff('ab:reborn:inv');
  f.h.run((inv.duration ?? 0) + 0.5);
  assert.ok(!f.e.s.flags.untargetable, 'targetable again after it');
  assert.equal(canTargetEnemy(f.op, f.e, f.op.profile), true);
});

test('ccVengeance Invincible Blade 2: the tag\'s “复仇者” is untargetable in his 15 s 无敌; a plain one keeps the data\'s', () => {
  untargetable(revived('enemy_1539_reid', { rules: { ccVengeance: 2 }, mods: { bountyId: 'risk:vengeance' } }));
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, units: [] });
  h.step(1);
  const plain = h.spawn('enemy_1539_reid', { pos: [10, 4], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.5);
  h.b.dealDamage(null, plain, { amount: plain.hp + 1, type: 'true', sourceless: true });
  assert.ok(h.runUntil(() => plain.alive && !plain.findBuff('ab:reborn'), 120), 'stood up');
  assert.ok(!plain.s.flags.untargetable, 'the official one: no change');
});
