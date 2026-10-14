// test/content/feedback7-champagne-hold.test.js — 琳琅诗怀雅 S2's 香槟炸弹 (token_10031_swire2_gdtrap) under the owner's
// decision D2 of 2026-10-08: it holds 禁疗, loses no HP (活性源石, damage, a 流失) and never leaves because of its HP; its
// 见面礼 is unchanged (the first ground enemy that touches it, then it is gone). Both kits: 琳琅诗怀雅's own bomb and the
// token kit (content/tokens.js champagne, a bomb spawned without her kit).
// Run: node --test test/content/feedback7-champagne-hold.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const TRAP = 'token_10031_swire2_gdtrap';
const SW = 'chess_char_3_04_a';
for (const path of ['owner', 'token']) test(`香槟炸弹 (${path}) rejects ordinary allied auras and inspiration without isolating normal summons (#476)`, () => {
  const { h, bomb: ownBomb } = herBomb({ units: [
    { uid: 2, chessId: 'chess_char_5_20_a', row: 10, col: 4, skillIndex: 0 },
    { uid: 3, chessId: 'chess_char_6_04_a', row: 10, col: 5, skillIndex: 1 },
  ] });
  const angelina = h.unit(2), skadi = h.unit(3);
  if (path === 'token') h.b.retreat(ownBomb, { reason: 'expired', permanent: true });
  const bomb = path === 'owner' ? ownBomb : h.b.spawnToken(h.unit(1), TRAP, 9, 6);
  const control = h.b.spawnToken(skadi, 'token_10017_skadi2_dedant', 9, 4);
  assert.ok(bomb && control);
  assert.ok(skadi.skill.activate('test', { free: true })); h.run(0.7);
  assert.equal(h.b.allySelectable(bomb, angelina), false);
  assert.equal(bomb.s.aspd, bomb.base.aspd);
  assert.equal(bomb.s.hpRegen, 0);
  assert.equal(bomb.findBuff('inspire'), null);
  assert.equal(bomb.findBuff('inspire:def'), null);
  assert.ok(h.b.allySelectable(control, angelina), 'a normal unhealable summon is still selectable');
  assert.ok(control.s.aspd > control.base.aspd, 'Angelina still affects the ordinary summon');
  assert.ok(bomb.alive && bomb.hp === bomb.s.maxHp); checkInvariants(h.b);
});
/** 琳琅诗怀雅 on (9,5) of a field whose only free x-6 tile is (9,6) — 活性源石 when `infected`; she throws one bomb there. */
function herBomb({ infected = false, units = [], enemies = [] } = {}) {
  const row9 = infected ? '##ERRriRrrSrrrrrrrS##' : '##ERRrrRrrSrrrrrrrS##';
  const h = makeBattle({
    flat: { rows: { 9: row9, 10: '##hrrRrrrrfrrrrrrrf##', 11: '##hrrRrrrrfrrrrrrrf##' } },
    defs: { enemies: { e_w: enemyRec({ key: 'e_w', hp: 1e6, speed: 1, def: 0, atk: 0 }) } },
    timeLimit: 60, autoFinish: false, hooks: ['heal', 'death', 'damaged'], captureNoisy: true,
    units: [{ uid: 1, chessId: SW, row: 9, col: 5 }, ...units], enemies,
  });
  h.step();
  h.unit(1).mem.coins = 1;
  assert.ok(h.runUntil(() => h.b.allyUnits.some((t) => t.alive && t.defId === TRAP), 6), 'she threw a bomb');
  const bomb = h.b.allyUnits.find((t) => t.alive && t.defId === TRAP);
  assert.deepEqual([bomb.tileR, bomb.tileC], [9, 6]);
  return { h, bomb, sw: h.unit(1) };
}

test('香槟炸弹 (her kit): no HP loss on 活性源石, 禁疗, a lethal 流失 or hit leaves it at full HP and on the field', () => {
  const { h, bomb } = herBomb({ infected: true });
  assert.ok(bomb.s.flags.untargetable && bomb.s.flags.noHeal && bomb.s.flags.healFree, '不可选中 + 禁疗');
  assert.ok(!bomb.s.flags.invulnerable, 'no 无敌 flag (no badge on the client)');
  h.run(3.2);
  assert.equal(bomb.hp, bomb.s.maxHp, '活性源石 takes nothing');
  assert.equal(h.b.heal(h.unit(1), bomb, 500), 0, 'no heal reaches it');
  assert.equal(h.b.injuredAlliesInKeys([9 * 21 + 6], h.unit(1)).length, 0, 'no healer picks it');
  h.b.dealDamage(null, bomb, { amount: 1e6, type: 'true', tags: ['test'] });
  h.b.loseHp(bomb, 1e6, { tags: ['test'] });
  h.step();
  assert.ok(bomb.alive && bomb.deployed, 'not gone because of its HP');
  assert.equal(bomb.hp, bomb.s.maxHp);
  assert.equal(h.hooksOf('death').filter((c) => c.unit === bomb).length, 0);
  checkInvariants(h.b);
});

test('香槟炸弹 (her kit): its 见面礼 is unchanged — the first ground enemy touching it is hit and slowed, then the bomb is gone', () => {
  const { h, bomb } = herBomb({ enemies: [{ key: 'e_w', route: 0, time: 1 }] });
  assert.ok(h.runUntil(() => !bomb.alive, 30), 'set off');
  const e = h.b.enemies.find((x) => x.alive);
  assert.ok(e && e.hp < 1e6 && e.findBuff('sluggish'), 'hit + 停顿');
  assert.ok(h.hooksOf('death').some((c) => c.unit === bomb && c.reason === 'expired'), 'used up');
  checkInvariants(h.b);
});

test('香槟炸弹 (the token kit, spawned without her kit): the same 禁疗, no HP loss, no knock-out', () => {
  const h = makeBattle({ timeLimit: 30, autoFinish: false, hooks: ['death'], units: [{ uid: 1, chessId: SW, row: 12, col: 3 }] });
  h.step();
  const bomb = h.b.spawnToken(h.unit(1), TRAP, 9, 6);
  assert.ok(bomb && bomb.s.flags.noHeal && bomb.s.flags.healFree && bomb.s.flags.untargetable);
  h.b.loseHp(bomb, 1e6, { tags: ['test'] });
  h.b.dealDamage(null, bomb, { amount: 1e6, type: 'true', tags: ['test'] });
  h.step();
  assert.ok(bomb.alive && bomb.hp === bomb.s.maxHp);
  assert.equal(h.b.heal(h.unit(1), bomb, 500), 0);
  checkInvariants(h.b);
});
