// test/content/op_nian.test.js — the 自选 operator kit of 年 (char_2014_nian, 6★ 铁卫; kit
// server/sim/content/kits/ops/op-nian.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, PRO-X
// 混沌阵列 or PRO-Y “请勿叩门” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form
// of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_nian.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const NIAN = 'char_2014_nian';
const FORMS = BACKUPS.units[NIAN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const PROX = 'uniequip_002_nian', PROY = 'uniequip_003_nian';
const S1 = 'skchr_nian_1', S2 = 'skchr_nian_2', S3 = 'skchr_nian_3';
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a'; // 角峰 (重装), 德克萨斯 (先锋)
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_hitter: dummy('enemy_hitter', { atk: 2000, bat: 1 }), enemy_shooter: dummy('enemy_shooter', { atk: 300, bat: 1, range: 3 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, PROX, PROY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 年 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: NIAN, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const skillBuff = (u) => u.findBuff(`skill:${u.id}`);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('年 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1 range, blocks 3 (PRO-Y: 4), physical melee ground-only, 炎, no 特质', () => {
  assert.equal(OPERATOR_KITS[NIAN], KITS[NIAN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [NIAN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.blockCnt],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 3 + (m?.attr.blockCnt ?? 0)], `${label(f)}: stats`);
      assert.equal(u.s.blockCnt, mod === PROY ? 4 : 3, `${label(f)}: 铁卫 blocks 3, “请勿叩门” 4`);
      assert.deepEqual([u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], ['melee', false, 'phys', 1.5], `${label(f)}: 铁卫`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN, full potential): E2 Lv1 2737 / 537 / 559, E2 Lv60 3375 / 607 / 690; PRO-X +200 HP / +60 DEF →
  // +375 / +50 / +80, PRO-Y +320 / +35 / +21 / block +1 → +550 / +70 / +30 / block +1
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/1/4/0'].stats.def, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.def], [2737, 537, 559, 3375, 690]);
  assert.deepEqual([modOf(5, PROX).attr, modOf(6, PROX).attr, modOf(5, PROY).attr, modOf(6, PROY).attr],
    [{ maxHp: 200, def: 60 }, { maxHp: 375, atk: 50, def: 80 }, { maxHp: 320, atk: 35, def: 21, blockCnt: 1 }, { maxHp: 550, atk: 70, def: 30, blockCnt: 1 }]);
});

test('a 自选 pick: 年 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(NIAN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(NIAN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: NIAN, skillIndex: 2, uniEquipId: PROY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: NIAN, skillIndex: 2, uniEquipId: PROY } } });
});

test('triggers: every skill is MANUAL with the data\'s DEFAULT (the owner\'s 重装 cast-in-range exception; rawRule TAKE_DAMAGE) — a ranged hit from outside her 1-1 casts nothing, an enemy on her front tile casts; a flyer there neither draws an attack nor a cast', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    for (const skill of [0, 1, 2]) {
      const sk = formOf(tier, elite).skills[skill];
      assert.deepEqual([sk.skillType, sk.trigger.rule, sk.trigger.rawRule], ['MANUAL', 'DEFAULT', 'TAKE_DAMAGE'], `T${tier} S${skill + 1}: data`);
      const { h, u } = field({ tier, elite, skill });
      assert.equal(u.skill.rule, 'DEFAULT', `T${tier} S${skill + 1}`);
      h.spawn('enemy_shooter', { pos: [10, 8] });
      h.spawn('enemy_fly', { pos: [10, 6] });
      u.skill.gainSp(999);
      h.run(3);
      assert.ok(h.hooksOf('damaged').some((c) => c.target === u && c.source?.defId === 'enemy_shooter'), `T${tier} S${skill + 1}: she is being shot`);
      assert.equal(u.skill.activations, 0, `T${tier} S${skill + 1}: no cast on a hit (no TAKE_DAMAGE) nor for the flyer in her range`);
      assert.equal(u.stats.attacks, 0, `T${tier} S${skill + 1}: ground-only — the flyer on her front tile is no target`);
      h.spawn('enemy_dummy', { pos: [10, 6] });
      assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier} S${skill + 1}: cast with a ground enemy in her range`);
      done(h);
    }
  }
});

test('S1 锡灼 (23 / 26 s): DEF +40 % / +55 %, ATK +20 % / +30 %, her normal attacks deal arts damage; physical again after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([sk.duration, sk.spCost, sk.initSp, sk.bb.def, sk.bb.atk], [elite ? 26 : 23, 30, 10, elite ? 0.55 : 0.4, elite ? 0.3 : 0.2], `T${tier}`);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    assert.deepEqual(skillBuff(u).mods, { defPct: sk.bb.def, atkPct: sk.bb.atk }, `T${tier}: the skill buff`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.01);
    const n0 = u.stats.attacks;
    h.run(4);
    const mine = h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.dmg.isAttack);
    assert.ok(u.stats.attacks > n0 && mine.length > 0 && mine.every((c) => c.type === 'arts'), `T${tier}: arts attacks during the skill`);
    approx(mine[mine.length - 1].amount, u.s.atk, `T${tier}: 100 % ATK (RES 0)`);
    u.skill.extend(-999);
    h.run(3);
    assert.ok(h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack).slice(-1)[0].type === 'phys', `T${tier}: physical once it ends`);
    assert.equal(skillBuff(u), null, `T${tier}: buff gone`);
    done(h);
  }
});

test('S2 铜印 (31 / 32 s): stops attacking; DEF +80 % / +100 %, block +1; every enemy damage instance she takes (its attack or not — official ON_TAKE_DAMAGE) returns 60 % / 70 % ATK arts to its source (ranged ones too, a direct pick) and silences it 3 s; nothing for a 流失, nothing once it ends', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, null], [6, true, PROY]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    assert.deepEqual([sk.duration, sk.spCost, sk.bb.def, sk.bb.block_cnt, sk.bb.atk_scale, sk.bb.silence], [elite ? 32 : 31, 50, elite ? 1 : 0.8, 1, elite ? 0.7 : 0.6, 3], `T${tier}`);
    const near = h.spawn('enemy_dummy', { pos: [10, 6] });
    const far = h.spawn('enemy_shooter', { pos: [10, 8] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    assert.deepEqual(skillBuff(u).mods, { defPct: sk.bb.def, blockCnt: 1 }, `T${tier}: the skill buff`);
    assert.equal(u.s.blockCnt, (mod === PROY ? 4 : 3) + 1, `T${tier}: block +1`);
    const n0 = u.stats.attacks;
    h.run(3);
    assert.equal(u.stats.attacks, n0, `T${tier}: no attack while it runs`);
    for (const src of [near, far]) {
      const before = h.hooksOf('damaged').length;
      h.b.dealDamage(src, u, { amount: 100, type: 'phys', isAttack: true });
      const back = h.hooksOf('damaged').slice(before).filter((c) => c.source === u && c.target === src);
      assert.equal(back.length, 1, `T${tier}: one counter on ${src.defId}`);
      assert.equal(back[0].type, 'arts', `T${tier}: arts`);
      approx(back[0].amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
      const sil = h.hooksOf('statusApplied').filter((c) => c.source === u && c.target === src && c.status === 'silence').slice(-1)[0];
      assert.ok(sil && Math.abs(sil.duration - 3) < 1e-9, `T${tier}: ${src.defId} silenced 3 s`);
    }
    // updated on purpose by the community report of 2026-10-06 (item 30): the official inverse_damage[magic] / nian_s_2 fire on
    // ON_TAKE_DAMAGE from an enemy source — a non-attack hit is answered too (it returned nothing up to 0.2.0); a 流失 is not
    const before = h.hooksOf('damaged').length;
    h.b.dealDamage(near, u, { amount: 100, type: 'phys' });
    assert.equal(h.hooksOf('damaged').slice(before).filter((c) => c.source === u && c.target === near).length, 1, `T${tier}: a non-attack hit is answered`);
    const beforeLoss = h.hooksOf('damaged').length;
    h.b.loseHp(u, 100, { source: near });
    assert.ok(!h.hooksOf('damaged').slice(beforeLoss).some((c) => c.source === u), `T${tier}: a 流失 returns nothing`);
    u.skill.extend(-999);
    h.run(0.1);
    const after = h.hooksOf('damaged').length;
    h.b.dealDamage(near, u, { amount: 100, type: 'phys', isAttack: true });
    assert.ok(!h.hooksOf('damaged').slice(after).some((c) => c.source === u), `T${tier}: no counter once it ended`);
    assert.equal(u.s.blockCnt, mod === PROY ? 4 : 3, `T${tier}: block back`);
    done(h);
  }
});

test('S3 铁御 (40 s): ATK +65 % / +80 % (her block +0); every other allied operator on her x-2 gets DEF +40 % / +50 %, block +1 and 抵抗 (0.5) while it runs, one outside nothing; all gone after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.spCost, sk.initSp, sk.rangeId, sk.bb['nian_s_3[self].atk'], sk.bb['nian_s_3[self].block_cnt'], sk.bb['nian_s_3[ally].def'], sk.bb['nian_s_3[ally].block_cnt'], sk.bb.one_minus_status_resistance],
      [40, 85, elite ? 56 : 48, 'x-2', elite ? 0.8 : 0.65, 0, elite ? 0.5 : 0.4, 1, -0.5], `T${tier}`);
    // 德克萨斯 one row up and one tile ahead (inside x-2), 角峰 two rows up and three tiles ahead (outside)
    const { h, u } = field({ tier, elite, skill: 2, others: [{ uid: 2, chessId: TEXAS, row: 11, col: 6 }, { uid: 3, chessId: YAK, row: 12, col: 8 }] });
    const tex = h.unit(2), yak = h.unit(3);
    h.spawn('enemy_dummy', { pos: [10, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    assert.deepEqual(skillBuff(u).mods, { atkPct: sk.bb['nian_s_3[self].atk'] }, `T${tier}: her ATK`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: her attack range stays 1-1 (x-2 is the skill's area)`);
    h.run(1);
    assert.deepEqual(tex.findBuff('skill:nian:ironGuard')?.mods, { defPct: sk.bb['nian_s_3[ally].def'], blockCnt: 1 }, `T${tier}: 德克萨斯 inside x-2`);
    assert.equal(tex.s.blockCnt, tex.base.blockCnt + 1, `T${tier}: his block +1`);
    assert.equal(h.b.resistOf(tex), 0.5, `T${tier}: 抵抗`);
    assert.deepEqual([yak.findBuff('skill:nian:ironGuard'), h.b.resistOf(yak)], [null, 0], `T${tier}: 角峰 outside x-2`);
    assert.equal(u.findBuff('skill:nian:ironGuard'), null, `T${tier}: not herself ("其他")`);
    h.runUntil(() => !u.skill.active, 60);
    assert.equal(tex.findBuff('skill:nian:ironGuard'), null, `T${tier}: the DEF / block buff ends with the skill`);
    h.run(0.3);
    assert.equal(h.b.resistOf(tex), 0, `T${tier}: the 抵抗 lapses`);
    done(h);
  }
});

test('T1 积甲成山: every 重装 operator of her team (her included) max HP +20 % for the whole battle — +25 % with PRO-Y stage 3; a 先锋 nothing', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [{ uid: 2, chessId: YAK, row: 11, col: 3 }, { uid: 3, chessId: TEXAS, row: 11, col: 7 }] });
    const yak = h.unit(2), tex = h.unit(3);
    const want = elite && mod === PROY && tier === 6 ? 0.25 : 0.2;
    assert.equal(u.def.raw.talents.find((t) => t.index === 0).bb.max_hp, want, `${label(f)}: data`);
    for (const a of [u, yak]) assert.deepEqual(a.findBuff('talent:nian:armor')?.mods, { hpPct: want }, `${label(f)}: ${a.defId}`);
    assert.equal(tex.findBuff('talent:nian:armor'), null, `${label(f)}: 德克萨斯 (先锋)`);
    assert.ok(yak.findBuff('talent:nian:armor').persist, `${label(f)}: kept through a knock-out (编入队伍时)`);
    if (!(elite && mod === PROY && tier === 6)) approx(yak.s.maxHp, yak.base.maxHp * (1 + want), `${label(f)}: 角峰's max HP`);
    done(h);
  }
});

test('T2 干明可鉴: 3 护盾 layers at every deployment, each negating one damage instance; PRO-X stage 3: each broken layer ATK / DEF +7 % (≤ 3 stacks) and +3 SP; stage 1 and the other forms none', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, row: 9, col: 5 });
    const t1 = u.def.raw.talents.find((t) => t.index === 1).bb;
    const x3 = elite && mod === PROX && tier === 6;
    assert.deepEqual(t1, x3 ? { times: 3, atk: 0.07, def: 0.07, sp: 3, max_stack_cnt: 3 } : { times: 3 }, `${label(f)}: data`);
    assert.equal(u.findBuff('talent:nian:shield')?.shieldHits, 3, `${label(f)}: 3 layers`);
    const e = h.spawn('enemy_dummy', { pos: [9, 8] });
    assert.ok(u.s.maxHp > 0); // (stats are lazy: settle the HP ratio before reading the HP)
    const hp0 = u.hp;
    u.skill.sp = 0;
    for (let i = 1; i <= 3; i++) {
      const sp = u.skill.sp;
      h.b.dealDamage(e, u, { amount: 1500, type: 'phys', isAttack: true });
      assert.equal(u.hp, hp0, `${label(f)}: hit ${i} negated`);
      assert.equal(u.findBuff('talent:nian:shield')?.shieldHits ?? 0, 3 - i, `${label(f)}: ${3 - i} layers left`);
      assert.equal(u.findBuff('talent:nian:shieldBreak')?.stacks ?? 0, x3 ? i : 0, `${label(f)}: stacks`);
      approx(u.skill.sp - sp, x3 ? 3 : 0, `${label(f)}: SP of layer ${i}`);
    }
    if (x3) assert.deepEqual(u.findBuff('talent:nian:shieldBreak').mods, { atkPct: 0.07, defPct: 0.07 }, 'per stack (×3)');
    if (x3) approx(u.s.atk, u.base.atk * (1 + 0.21), `${label(f)}: ATK +21 %`);
    h.b.dealDamage(e, u, { amount: 1500, type: 'phys', isAttack: true });
    assert.ok(u.hp < hp0, `${label(f)}: the 4th hit lands`);
    assert.equal(u.findBuff('talent:nian:shieldBreak')?.stacks ?? 0, x3 ? 3 : 0, `${label(f)}: no 4th stack`);
    // a new deployment: 3 new layers, the stacks of the last one are gone
    h.b.retreat(u);
    h.b.redeploy(u);
    h.step();
    assert.equal(u.findBuff('talent:nian:shield')?.shieldHits, 3, `${label(f)}: 3 layers again`);
    assert.equal(u.findBuff('talent:nian:shieldBreak'), null, `${label(f)}: stacks reset`);
    done(h);
  }
});

test('PRO-X 混沌阵列 trait: DEF +20 % while she blocks an enemy (stages 1 and 3); none without it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const x = elite && mod === PROX;
    if (x) assert.deepEqual(u.def.raw.trait.bb, { def: 0.2 }, label(f));
    h.run(0.5);
    assert.equal(u.findBuff('trait:nian:block'), null, `${label(f)}: nothing blocked`);
    h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => u.blocking.length > 0, 2), `${label(f)}: blocking`);
    h.step();
    assert.deepEqual(u.findBuff('trait:nian:block')?.mods ?? null, x ? { defPct: 0.2 } : null, `${label(f)}: DEF +20 %`);
    done(h);
  }
});

test('PRO-Y “请勿叩门”: blocks 4 at both stages; stage 3 only: per 重装 operator on the field (her included, ≤ 3) max HP +4 % and healing received ×(1 + 0.04 n)', () => {
  for (const [tier, n] of [[5, 4], [6, 1], [6, 2], [6, 3], [6, 4]]) {
    const yaks = Array.from({ length: n - 1 }, (_, i) => ({ uid: 2 + i, chessId: YAK, row: 12, col: 3 + 2 * i }));
    const { h, u } = field({ tier, elite: true, mod: PROY, skill: 0, others: [...yaks, { uid: 9, chessId: TEXAS, row: 9, col: 9 }] });
    h.step();
    assert.equal(u.s.blockCnt, 4, `T${tier}: blocks 4`);
    const tb = u.def.raw.trait.bb;
    if (tier === 5) {
      assert.deepEqual(tb, {}, 'stage 1: no trait blackboard');
      assert.equal(u.findBuff('trait:nian:fortify'), null, 'stage 1: nothing per 重装');
      done(h);
      continue;
    }
    assert.deepEqual(tb, { max_hp: 0.04, heal_scale: 1, max_stack_cnt: 3, heal_scale_addition: 0.04, heal_scale_max_value: 1.12 }, 'stage 3');
    const k = Math.min(3, n);
    const fort = u.findBuff('trait:nian:fortify');
    approx(fort.mods.hpPct, 0.04 * k, `${n} 重装: max HP`);
    approx(fort.mods.healingTakenMul, 1 + 0.04 * k, `${n} 重装: healing received`);
    approx(u.s.maxHp, u.base.maxHp * (1 + 0.25 + 0.04 * k), `${n} 重装: with 积甲成山's 25 %`);
    // a heal of 1000 lands as 1000 × (1 + 0.04 k)
    u.hp = 1;
    const got = h.b.heal(h.unit(9), u, 1000);
    approx(got, 1000 * (1 + 0.04 * k), `${n} 重装: heal`);
    if (n === 2) { // a 重装 leaving the field takes its stack away
      h.b.retreat(h.unit(2));
      h.step();
      approx(u.findBuff('trait:nian:fortify').mods.hpPct, 0.04, 'back to 1 stack');
    }
    done(h);
  }
});
