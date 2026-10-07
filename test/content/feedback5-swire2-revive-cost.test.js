// test/content/feedback5-swire2-revive-cost.test.js — 琳琅诗怀雅's 破财消灾 (「受到致命伤害时，若费用足够则消耗5点部署费用使生命恢复到
// 70%，每次触发该天赋时消耗的费用翻倍」; 80 % at full potential, the owner's decision of 2026-10-07): the doubled cost restarts at 5 with every deployment — PRTS 备注 「再部署时重置本天赋费用
// 消耗」 (community report of 2026-10-06 「进入联防阶段琳琅诗怀雅所需的复活费用应该重置，正常对局中死亡之后再部署复活费用也应该
// 重置」). A 联防 field is a battle of its own, so it always started at 5; a redeploy used to keep the doubled cost.
// Run: node --test test/content/feedback5-swire2-revive-cost.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';

const ID = 'chess_char_3_04_a';

function field(kind = 'normal') {
  const h = makeBattle({ kind, units: [{ chessId: ID, row: 10, col: 5 }], timeLimit: 300, autoFinish: false, flags: { dpInit: 60, dpMax: 99 } });
  h.step();
  return { h, u: h.unit(ID), ps: h.b.getPlayer('p1') };
}

/** A lethal hit with `dp` DP in the pool: returns the DP the talent took (0 when she fell). */
function lethal(h, u, ps, dp = 90) {
  ps.dp = dp;
  h.b.dealDamage(null, u, { amount: u.s.maxHp * 5, type: 'true', canDodge: false });
  return u.alive ? dp - ps.dp : 0;
}

test('破财消灾 doubles within one deployment and restarts at 5 DP after a redeploy', () => {
  const { h, u, ps } = field();
  assert.equal(lethal(h, u, ps), 5, 'first save: 5 DP');
  assert.ok(u.alive && Math.abs(u.hp - u.s.maxHp * 0.8) < 1e-6, 'back to 80 % HP (hp_ratio at full potential)');
  assert.equal(lethal(h, u, ps), 10, 'second save of the same deployment: doubled');
  h.b.retreat(u);
  assert.ok(!u.alive);
  ps.dp = 90;
  assert.ok(h.runUntil(() => u.alive && u.deployed, 120), 'redeployed');
  assert.equal(lethal(h, u, ps), 5, 'after the redeploy: 5 DP again (it used to cost 20)');
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('a 联防 field starts at 5 DP: a battle of its own', () => {
  const { h, u, ps } = field('unite');
  assert.equal(lethal(h, u, ps), 5);
  assert.equal(lethal(h, u, ps), 10);
});
