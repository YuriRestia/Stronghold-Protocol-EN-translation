// test/content/feedback7-thorn2-regen.test.js — 引星棘刺's alchemy units restore HP as 生命回复速度 (community report:
// 炼金师分支干员的炼金单元无法给不屈者等禁疗的干员提供生命恢复). S1 度算浪波 "每秒回复相当于攻击力…的生命值" and S2 解构涌潮
// "友方单位每秒恢复相当于攻击力…的生命" carry 锡人 S2's wording and blackboard key (hp_recovery_per_sec_ratio), and PRTS 锡人
// 备注 says that recovery "为增加目标的“生命回复速度”属性，不受治疗加成和禁疗影响" — an hpRegen buff, which 不屈者 (no heal
// from others) and 禁疗 units take too. Up to 0.2.1 both were heals (battle.heal), which those units refuse.
// Run: node --test test/content/feedback7-thorn2-regen.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

/** 引星棘刺 (skill `skillIndex`) beside 角峰 (10,5), 折桠 — 不屈者 — (10,6) and a 禁疗 角峰 (10,7); her skill cast at once. */
function field(skillIndex) {
  const h = makeBattle({
    defs: { enemies: { e_dummy: enemyRec({ key: 'e_dummy', hp: 1e9, speed: 0, atk: 0 }) } },
    timeLimit: 20, autoFinish: false, seed: 2, flags: { dpInit: 99, dpPerSec: 0, dpMax: 999 }, hooks: ['heal'], captureNoisy: true,
    units: [
      { uid: 1, chessId: 'chess_char_5_15_a', row: 10, col: 4, dir: 'RIGHT', skillIndex },
      { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 5 },
      { uid: 3, chessId: 'chess_char_2_17_a', row: 10, col: 6 },
      { uid: 4, chessId: 'chess_char_1_02_a', row: 10, col: 7 },
    ],
  });
  h.step();
  const [thorn, plain, unyield, banned] = [1, 2, 3, 4].map((uid) => h.b.allyUnits.find((u) => u.uid === uid));
  h.b.addBuff(banned, { key: 'test:healFree', status: 'healFree', flags: { noHeal: true, healFree: true } });   // 禁疗
  plain.hp = plain.s.maxHp * 0.3;
  unyield.hp = unyield.s.maxHp * 0.2;   // S1 picks the lowest HP ratio: its 3×3 covers all three
  banned.hp = banned.s.maxHp * 0.3;
  const hp0 = new Map([plain, unyield, banned].map((a) => [a, a.hp]));
  h.spawn('e_dummy', { pos: [10, 6] });
  thorn.skill.gainSp(999, 'test');
  assert.ok(thorn.skill.activate('manual'), thorn.skill.id);
  h.run(3.2);
  return { h, thorn, plain, unyield, banned, gained: (a) => a.hp - hp0.get(a) };
}

for (const [skillIndex, id, key] of [[0, 'skchr_thorn2_1', 'hp_recovery_per_sec_ratio'], [1, 'skchr_thorn2_2', 'hp_recovery_per_sec_ratio_chr']]) {
  test(`引星棘刺 ${id}: the alchemy unit's 生命回复速度 reaches 不屈者 (折桠) and 禁疗 operators as much as the others`, () => {
    const { h, thorn, plain, unyield, banned, gained } = field(skillIndex);
    assert.equal(thorn.skill.id, id);
    assert.equal(unyield.profile.noHeal, true, '不屈者: no heal from others');
    const perSec = thorn.s.atk * thorn.def.skill.bb[key];
    for (const a of [plain, unyield, banned]) {
      const regen = a.buffs.find((b) => b.source === thorn && b.mods?.hpRegen > 0);
      assert.ok(regen, `${a.defId}: an hpRegen buff`);
      assert.ok(Math.abs(regen.mods.hpRegen - perSec) < 1e-6, `${regen.mods.hpRegen} ≈ ${perSec}`);
      assert.ok(gained(a) > perSec, `${a.defId} recovered ${gained(a).toFixed(1)}`);
    }
    assert.ok(Math.abs(gained(unyield) - gained(plain)) < 1, 'the same for 不屈者');
    assert.ok(Math.abs(gained(banned) - gained(plain)) < 1, 'the same under 禁疗');
    assert.equal(h.hooksOf('heal').filter((c) => c.source === thorn).length, 0, 'no heal of hers (治疗加成 does not apply)');
    checkInvariants(h.b);
  });
}
