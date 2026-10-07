// test/content/op_kalts2.test.js — the 自选 operator kit of 凯尔希·思衡托 (char_1052_kalts2, 6★ 守望者; kit
// server/sim/content/kits/ops/op-kalts2.js) and her summon 战术锚点 (token_10068_kalts2_mtship), fielded the production way (a
// DIY slot + its `diy` pick; the anchor as a token piece of hers) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4)
// and elite (E2 Lv60, rank 7) — she has no module. Every number is read back from data/backups.json (the form of that slot
// status, the token's variant); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_kalts2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { COLS } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const KALTS2 = 'char_1052_kalts2';
const ANCHOR = 'token_10068_kalts2_mtship';
const FORMS = BACKUPS.units[KALTS2].forms;
const TOKEN = BACKUPS.tokens[ANCHOR];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const S1 = 'skchr_kalts2_1', S2 = 'skchr_kalts2_2', S3 = 'skchr_kalts2_3';
const statusKey = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusKey(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const talentOf = (tier, elite, i) => formOf(tier, elite).talents.find((t) => t.index === i).bb;
const variantOf = (tier, elite) => TOKEN.variants[`${KALTS2}@${statusKey(tier, elite)}`];
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_biter: dummy('enemy_biter', { atk: 400, range: 1.2, bat: 1 }),
  enemy_flybiter: dummy('enemy_flybiter', { atk: 300, range: 1.6, bat: 1, motion: 'FLY' }),
};
/** Every 自选 form: [tier, elite] (no module). */
const FORMS_ALL = [[5, false], [6, false], [5, true], [6, true]];
const label = ([tier, elite]) => `T${tier} ${elite ? 'elite' : 'normal'}`;
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a', PERFUMER = 'chess_char_2_14_a';

/** A battle with 凯尔希·思衡托 as uid 1 at (10, 4) facing RIGHT (`anchor`: her piece as uid 2), plus `others`. */
function field({ tier = 5, elite = false, skill = 0, anchor = null, others = [], seed = 5, dp = 99 } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: KALTS2, skillIndex: skill }, elite, row: 10, col: 4 }];
  if (anchor) units.push({ uid: 2, kind: 'token', tokenId: ANCHOR, ownerUid: 1, row: anchor.row, col: anchor.col, dir: anchor.dir ?? 'RIGHT' });
  const log = [];   // heal / damaged in the order they happen
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: dp, dpPerSec: 0, dpMax: 999 },
    hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'blocked'], captureNoisy: true,
    units: [...units, ...others],
    setup: (b) => {
      b.on('heal', (c) => { if (!c.opts?.regen) log.push({ name: 'heal', ...c }); }, { priority: -1000 });
      b.on('damaged', (c) => log.push({ name: 'damaged', ...c }), { priority: -1000 });
    },
  });
  h.step();
  return { h, u: h.unit(1), a: anchor ? h.unit(2) : null, log };
}
const heals = (h, u) => h.hooksOf('heal').filter((c) => c.source === u && !c.opts?.regen);
const inRange = (u, x) => u.rangeKeySet.has(x.tileR * COLS + x.tileC);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('凯尔希·思衡托 in every 自选 form: her operator kit (all three skills authored), the form\'s stats with 遗尘守望, y-6, one heal per attack, blocks 2, 起飞, 罗德岛, no module, no 特质; her 战术锚点: the form\'s token stats', () => {
  assert.equal(OPERATOR_KITS[KALTS2], KITS[KALTS2]);
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, a } = field({ tier, elite, skill, anchor: { row: 10, col: 9 } });
      const form = formOf(tier, elite), t0 = talentOf(tier, elite, 0);
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [KALTS2, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.bat, u.base.cost], [form.stats.maxHp, form.stats.atk, form.stats.def, 2.85, 17], `${label(f)}: stats`);
      approx(u.s.maxHp, form.stats.maxHp * (1 + t0.max_hp), `${label(f)}: 生命上限 +30 %`);
      approx(u.s.def, form.stats.def * (1 + t0.def), `${label(f)}: 防御力 +30 %`);
      assert.deepEqual([u.s.blockCnt, u.s.blockRadiusScale, t0.block_cnt, t0.block_radius_scale], [2, 0.23, 1, 0.23], `${label(f)}: 阻挡数 +1, 阻挡半径倍率 +0.23`);
      assert.deepEqual([u.profile.dmgType, u.profile.heal, u.profile.attack, u.def.subProf], ['heal', { mode: 'single' }, 'ranged', 'watchman'], `${label(f)}: 守望者 heal`);
      assert.deepEqual([u.s.flags.liftoff, u.s.flags.blockFly], [true, true], `${label(f)}: 起飞`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: y-6`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.tokens, u.def.raw.nationId, !!u.def.raw.module?.active, form.modules?.length ?? 0],
        [BACKUPS.diy.operators[KALTS2].bonds, [], [ANCHOR], 'rhodes', false, 0], `${label(f)}: bonds / 特质 / summon / no module`);
      const ts = variantOf(tier, elite).stats;
      assert.deepEqual([a.base.maxHp, a.base.atk, a.base.cost, a.base.respawnTime, a.s.blockCnt], [ts.maxHp, 0, 3, 70, 0], `${label(f)}: 战术锚点 stats`);
      assert.deepEqual([a.s.flags.invulnerable, a.s.flags.untargetable, a.profile.noAttack, !!a.kit.generic], [true, true, true, false], `${label(f)}: 战术锚点 无敌, never targeted, no attack`);
      assert.equal(a.alive, skill === 2, `${label(f)}: the anchor piece takes the field only with S3 (a skill's summon)`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 1393 / 433 / 220, E2 Lv60 1543 / 501 / 257; the anchor 2235 HP, 3 DP, 70 s
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/3'].stats.atk], [1393, 433, 1543, 501]);
  assert.deepEqual([variantOf(5, false).stats.maxHp, variantOf(6, true).stats.cost, TOKEN.placeable], [2235, 3, true]);
});

test('a 自选 pick: 凯尔希·思衡托 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(KALTS2));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(KALTS2), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: KALTS2, skillIndex: 2 } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: KALTS2, skillIndex: 2, uniEquipId: null } } });
});

test('trait: her heals take 凯尔希\'s Mon3tr through its 禁疗 (her selection too); another 禁疗 summon stays out', () => {
  const others = [{ uid: 3, diy: { slot: 6, charId: 'char_003_kalts', skillIndex: 0 }, row: 12, col: 2 },
    { uid: 4, kind: 'token', tokenId: 'token_10002_kalts_mon3tr', ownerUid: 3, row: 10, col: 5 }];
  const { h, u } = field({ skill: 0, others });
  const m = h.unit(4);
  assert.ok(m.s.flags.noHeal && inRange(u, m), '凯尔希\'s Mon3tr: 禁疗, in her range');
  m.hp = m.s.maxHp * 0.4;
  const n0 = heals(h, u).length;
  assert.ok(h.runUntil(() => heals(h, u).length > n0, 4), 'a heal');
  assert.equal(heals(h, u)[n0].target, m, 'it is her target');
  approx(heals(h, u)[n0].amount, u.s.atk, 'a full heal through its 禁疗');
  done(h);
});

test('T1 遗尘守望 起飞: no ground enemy targets her or is blocked by her; she blocks a flyer 1.0 tile away (air radius 0.8944 × 1.23), two at most; the mod blockRadiusScale on any blocker', () => {
  const { h, u } = field({ skill: 0, others: [{ uid: 3, chessId: YAK, row: 11, col: 7 }] });
  const yak = h.unit(3);
  const g = h.spawn('enemy_biter', { pos: [10, 5] });
  const f1 = h.spawn('enemy_fly', { pos: [10, 5] });
  const f2 = h.spawn('enemy_fly', { pos: [11, 4] });
  const f3 = h.spawn('enemy_fly', { pos: [9, 4] });
  h.run(3);
  assert.equal(g.blockedBy, null, 'a ground enemy on the next tile is not blocked');
  assert.equal(h.hooksOf('damaged').filter((c) => c.target === u).length, 0, 'nor does it attack her (对地规避)');
  assert.equal([f1, f2, f3].filter((e) => e.blockedBy === u).length, 2, 'two of the three flyers 1.0 away: block 2');
  assert.ok(f1.blockedBy === u, 'the first one in contact');
  // the engine rule on another unit: a blockFly unit blocks a flyer 1.0 away only with 阻挡半径倍率 ≥ 1.118
  const f4 = h.spawn('enemy_fly', { pos: [11, 8] });
  h.b.addBuff(yak, { key: 'test:air', flags: { blockFly: true } });
  h.run(0.5);
  assert.equal(f4.blockedBy, null, 'radius 0.8944: out of reach');
  h.b.addBuff(yak, { key: 'test:scale', mods: { blockRadiusScale: 0.23 } });
  h.run(0.5);
  assert.equal(f4.blockedBy, yak, 'radius 0.8944 × 1.23: blocked');
  assert.equal(yak.s.blockRadiusScale, 0.23);
  done(h);
});

test('T2 医者丰碑: an operator entering her range gets 1 护盾 layer (one damage instance blocked) and 生命回复速度 +60 for 30 s (罗德岛 +120); summons and she get nothing; a new entry refreshes, never a 2nd layer', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const t1 = talentOf(tier, elite, 1);
    assert.deepEqual([t1.buff_duration, t1.hp_recovery_per_sec, t1.rhodes_bonus], [30, 60, 2], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: PERFUMER, row: 9, col: 5 },
      { uid: 5, chessId: TEXAS, row: 12, col: 8 }, { uid: 6, diy: { slot: 6, charId: 'char_003_kalts', skillIndex: 0 }, row: 12, col: 2 },
      { uid: 7, kind: 'token', tokenId: 'token_10002_kalts_mon3tr', ownerUid: 6, row: 11, col: 5 }];
    const { h, u } = field({ tier, elite, skill: 0, others });
    const yak = h.unit(3), pf = h.unit(4), tx = h.unit(5), m = h.unit(7);
    assert.equal(pf.def.raw.nationId, 'rhodes');
    assert.ok(yak.findBuff('talent:kalts2:shield') && yak.findBuff('talent:kalts2:shield').shieldHits === 1, `${label(f)}: 角峰 1 护盾 layer`);
    assert.deepEqual([yak.findBuff('talent:kalts2:regen')?.mods, pf.findBuff('talent:kalts2:regen')?.mods], [{ hpRegen: 60 }, { hpRegen: 120 }], `${label(f)}: 60 / 罗德岛 120 HP/s (生命回复速度)`);
    approx(yak.findBuff('talent:kalts2:regen').timeLeft, 30, `${label(f)}: 30 s`, 0.01);
    assert.ok(!m.findBuff('talent:kalts2:shield') && !m.findBuff('talent:kalts2:regen'), `${label(f)}: no summon`);
    assert.ok(!u.findBuff('talent:kalts2:shield') && !u.findBuff('talent:kalts2:regen'), `${label(f)}: not herself`);
    assert.ok(!tx.findBuff('talent:kalts2:regen'), `${label(f)}: 德克萨斯 outside her range`);
    // the 护盾 blocks one damage instance whole
    const hp0 = yak.hp;
    assert.equal(h.b.dealDamage(null, yak, { amount: 500, type: 'true', sourceless: true }), 0, `${label(f)}: blocked`);
    assert.equal(yak.hp, hp0);
    assert.equal(yak.findBuff('talent:kalts2:shield'), null, `${label(f)}: used up`);
    assert.ok(h.b.dealDamage(null, yak, { amount: 500, type: 'true', sourceless: true }) > 0, `${label(f)}: the next one lands`);
    // still inside: no new entry; out and back in: a new layer and a fresh 30 s
    h.run(5);
    assert.equal(yak.findBuff('talent:kalts2:shield'), null, `${label(f)}: no entry while it stays`);
    approx(yak.findBuff('talent:kalts2:regen').timeLeft, 25, `${label(f)}: ticking`, 0.05);
    h.b.relocate(yak, 10, 8);
    h.step();
    assert.ok(!inRange(u, yak));
    h.b.relocate(yak, 10, 5);
    h.step();
    assert.ok(yak.findBuff('talent:kalts2:shield'), `${label(f)}: re-entry: 护盾 again`);
    approx(yak.findBuff('talent:kalts2:regen').timeLeft, 30, `${label(f)}: re-entry: 30 s again`, 0.05);
    h.b.relocate(yak, 10, 8); h.step(); h.b.relocate(yak, 10, 5); h.step();
    assert.equal(yak.buffs.filter((b) => b.key === 'talent:kalts2:shield').length, 1, `${label(f)}: one layer at most`);
    // 30 s on: the regen ends (德克萨斯 entering later gets its own)
    const r0 = tx.s.hpRegen;   // (调香师's own 熏衣草 regen on everyone)
    assert.ok(h.b.relocate(tx, 9, 3));
    h.step();
    approx(tx.s.hpRegen - r0, 60, `${label(f)}: 德克萨斯 enters`);
    assert.deepEqual(tx.findBuff('talent:kalts2:regen')?.mods, { hpRegen: 60 });
    done(h);
  }
});

test('S1 应急肃正防线 (MANUAL, data DEFAULT — as she is about to heal): 35 s, ATK +60 % / +75 %, ASPD +25 / +35; every other 起飞 operator 阻挡半径倍率 +0.23 meanwhile (not a grounded one, not her twice)', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.attack_speed, sk.bb['attack@block_radius_scale'], sk.spCost, sk.initSp, sk.trigger.rule],
      [35, elite ? 0.75 : 0.6, elite ? 35 : 25, 0.23, 35, elite ? 20 : 18, 'DEFAULT'], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: TEXAS, row: 12, col: 9 }];
    const { h, u } = field({ tier, elite, skill: 0, others });
    const yak = h.unit(3), tx = h.unit(4);
    h.b.addBuff(tx, { key: 'test:liftoff', flags: { liftoff: true } });
    assert.equal(u.skill.rule, 'DEFAULT');
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `${label(f)}: nobody injured: no cast`);
    yak.hp = yak.s.maxHp * 0.5;
    assert.ok(h.runUntil(() => u.skill.active, 4), `${label(f)}: cast as she heals`);
    approx(u.skill.timeLeft, 35, `${label(f)}: 35 s`, 0.05);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    assert.equal(u.s.aspd, u.base.aspd + sk.bb.attack_speed, `${label(f)}: ASPD`);
    h.run(0.4);
    assert.equal(tx.s.blockRadiusScale, 0.23, `${label(f)}: the 起飞 德克萨斯 (anywhere on the field)`);
    assert.equal(yak.s.blockRadiusScale, 0, `${label(f)}: 角峰 is not 起飞`);
    assert.equal(u.s.blockRadiusScale, 0.23, `${label(f)}: hers stays 0.23 (同名效果取最高)`);
    h.runUntil(() => !u.skill.active, 40);
    h.run(0.5);
    assert.deepEqual([tx.s.blockRadiusScale, u.s.atk, u.s.aspd], [0, u.base.atk, u.base.aspd], `${label(f)}: all back`);
    done(h);
  }
});

test('S2 保护性拒止 (MANUAL, data ACTIVE_RANGE on its y-11: an injured ally there): 10 shots, range y-11, ATK +; at an enemy (air too): true damage + 5 s 停顿 within 1.5, then the heal there; at an ally (no enemy): heal first, no 停顿', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.bb.atk, sk.bb['attack@atk_scale'], sk.bb['attack@heal_scale'], sk.bb['attack@sluggish'], sk.bb['attack@trigger_time'], sk.rangeId, sk.trigger.rule],
      [elite ? 1.25 : 1.1, elite ? 3.5 : 3.1, elite ? 1.7 : 1.35, 5, 10, 'y-11', 'ACTIVE_RANGE'], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 7 }, { uid: 4, chessId: TEXAS, row: 11, col: 4 }];
    const { h, u, log } = field({ tier, elite, skill: 1, others });
    const yak = h.unit(3);
    const mine = (from) => log.slice(from).filter((c) => c.source === u);
    assert.deepEqual([u.skill.rule, u.skill.kind], ['ACTIVE_RANGE', 'ammo'], label(f));
    assert.ok(!inRange(u, yak), `${label(f)}: (10,7) is outside her y-6`);
    u.skill.gainSp(999);
    h.run(1.5);
    assert.equal(u.skill.activations, 0, `${label(f)}: nobody injured: no cast`);
    // an ally shot first: 角峰 injured inside the y-11 only, no enemy she can select (the dummy is beyond it)
    const e = h.spawn('enemy_dummy', { pos: [11, 8] });   // √2 from 角峰, outside the y-11 (col +4)
    const n0 = log.length;
    yak.hp = yak.s.maxHp * 0.3;
    assert.ok(h.runUntil(() => u.skill.active, 0.5), `${label(f)}: cast for the y-11`);
    assert.deepEqual([u.liveRangeGrid, u.skill.ammoMax], [sk.rangeGrid, 10], `${label(f)}: y-11, 10 shots`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    assert.ok(h.runUntil(() => u.skill.ammoLeft === 9, 3), `${label(f)}: one shot (the cast's attack)`);
    const shot = mine(n0);
    assert.deepEqual(shot.slice(0, 2).map((c) => [c.name, c.target]), [['heal', yak], ['damaged', e]], `${label(f)}: at an ally — heal first, then the enemy within 1.5`);
    approx(shot[0].amount, u.s.atk * sk.bb['attack@heal_scale'], `${label(f)}: heal ${sk.bb['attack@heal_scale'] * 100} % ATK`);
    approx(shot[1].amount, u.s.atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale'] * 100} % ATK true`);
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.source === u).length, 0, `${label(f)}: no 停顿 from an ally shot`);
    // an enemy inside the y-11 is the target from now on — a flyer
    const fly = h.spawn('enemy_fly', { pos: [9, 7] });   // 1.0 from 角峰
    const n1 = log.length;
    assert.ok(h.runUntil(() => mine(n1).some((c) => c.name === 'damaged'), 4), `${label(f)}: another shot lands (a 医疗单元 in flight)`);
    const burst = mine(n1);
    assert.equal(burst[0].name, 'damaged', `${label(f)}: at an enemy — damage first`);
    assert.equal(burst[0].target, fly, `${label(f)}: the flyer (可对空)`);
    for (const c of burst.filter((x) => x.name === 'damaged')) assert.deepEqual([c.type, c.dmg.isAttack, c.dmg.isSplash, c.dmg.isSkill], ['true', true, false, true], `${label(f)}: 真实普通伤害`);
    assert.ok(burst.some((c) => c.name === 'heal' && c.target === yak), `${label(f)}: then 角峰 (1.0 away) healed`);
    assert.ok(!burst.some((c) => c.target === e), `${label(f)}: the dummy (2.2 from the flyer) untouched`);
    const slugs = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'sluggish');
    assert.ok(slugs.length >= 1 && slugs.every((c) => c.duration === 5 && c.target === fly), `${label(f)}: 停顿 5 s on the enemy struck`);
    h.runUntil(() => !u.skill.active, 40);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: back to y-6 after 10 shots`);
    done(h);
  }
});

test('S3 破梏重生 (MANUAL, data DEFAULT): 35 s, ATK +, attack interval 1.30 s (−1.55 flat), 2 heal targets; with no anchor she stays', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.spCost, sk.initSp, sk.trigger.rule, sk.overrideTokenKey],
      [35, elite ? 1.25 : 1.1, -1.55, elite ? 60 : 65, elite ? 30 : 25, 'DEFAULT', ANCHOR], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: TEXAS, row: 11, col: 5 }];
    const { h, u } = field({ tier, elite, skill: 2, others });
    const yak = h.unit(3), tx = h.unit(4);
    u.skill.gainSp(999);
    yak.hp = yak.s.maxHp * 0.3; tx.hp = tx.s.maxHp * 0.4;
    const n0 = heals(h, u).length;
    assert.ok(h.runUntil(() => u.skill.active, 4), label(f));
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.interval, 2.85 - 1.55, `${label(f)}: 1.30 s`);
    h.runUntil(() => heals(h, u).length >= n0 + 2, 3);
    const two = heals(h, u).slice(n0, n0 + 2);   // the cast's heal (same tick) already heals two
    assert.deepEqual(two.map((c) => c.target.id).sort(), [yak.id, tx.id].sort(), `${label(f)}: two targets per heal`);
    assert.equal(two[0].t, two[1].t, `${label(f)}: in one attack`);
    h.run(2);
    assert.deepEqual([u.tileR, u.tileC, u.hidden], [10, 4, false], `${label(f)}: no anchor: no move`);
    h.runUntil(() => !u.skill.active, 40);
    approx(u.s.interval, 2.85, `${label(f)}: interval back`);
    done(h);
  }
});

test('S3 with her anchor: 0.1 s after the cast she flies to it (hidden, 无敌, the skill time paused, 3.5 tiles/s; operators within 2.2 of her flight enter T2), the two latest-deployed operators of her range are withdrawn 0.6 s on and back at once; she lands on its tile facing its way; the anchor is withdrawn for the rest of the skill', () => {
  for (const f of [[5, false], [6, true]]) {
    const [tier, elite] = f;
    // deployment order (left column first, top row first): (11,5) → (10,5) → (9,5); (12,7) beside her flight
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 5 }, { uid: 4, chessId: TEXAS, row: 10, col: 5 }, { uid: 5, chessId: PERFUMER, row: 9, col: 5 },
      { uid: 6, chessId: 'chess_char_2_02_a', row: 12, col: 7 }];
    const { h, u, a } = field({ tier, elite, skill: 2, anchor: { row: 10, col: 9, dir: 'UP' }, others });
    const yak = h.unit(3), tx = h.unit(4), pf = h.unit(5), sil = h.unit(6);
    assert.ok(a.alive && u.mem.k2link === a, `${label(f)}: the anchor deployed at the start, linked to her`);
    assert.ok(!inRange(u, a), `${label(f)}: outside her range`);
    assert.ok(!sil.findBuff('talent:kalts2:regen'), `${label(f)}: 赫默 (12,7) is outside her range`);
    const seq = [yak.deploySeq, tx.deploySeq, pf.deploySeq];
    assert.ok(seq[0] < seq[1] && seq[1] < seq[2], label(f));
    u.skill.gainSp(999);
    yak.hp = yak.s.maxHp * 0.3;
    assert.ok(h.runUntil(() => u.skill.active, 4), label(f));
    const t0 = h.b.time;
    h.runUntil(() => u.hidden, 0.2);
    assert.ok(u.hidden && u.mem.k2flight, `${label(f)}: flying`);
    approx(h.b.time - t0, 0.1, `${label(f)}: 0.1 s after the cast`, 0.4);
    const tl = u.skill.timeLeft;
    assert.equal(h.b.dealDamage(null, u, { amount: 5000, type: 'true', sourceless: true }), 0, `${label(f)}: 无敌 in flight`);
    const T = 5 / 3.5;
    h.run(0.7);
    approx(u.skill.timeLeft, tl, `${label(f)}: skill time paused`, 1e-6);
    // the two latest deployed (护理 (9,5) and 德克萨斯 (10,5)) withdrawn and back on their tiles; 角峰 stays
    for (const x of [pf, tx]) {
      assert.ok(h.hooksOf('death').some((c) => c.unit === x && c.reason === 'retreat'), `${label(f)}: ${x.defId} withdrawn`);
      assert.ok(x.alive && x.deploySeq > seq[2], `${label(f)}: ${x.defId} back at once`);
    }
    assert.ok(!h.hooksOf('death').some((c) => c.unit === yak), `${label(f)}: 角峰 (the first deployed) stays`);
    assert.deepEqual([tx.tileR, tx.tileC, pf.tileR, pf.tileC], [10, 5, 9, 5], `${label(f)}: on their tiles`);
    h.runUntil(() => !u.hidden, T);
    assert.ok(!u.hidden, `${label(f)}: landed`);
    approx(h.b.time - t0, 0.1 + T, `${label(f)}: after ${T.toFixed(2)} s of flight`, 0.1);
    assert.deepEqual([u.tileR, u.tileC, u.dir], [10, 9, 'UP'], `${label(f)}: on the anchor's tile, facing its way`);
    assert.ok(!a.alive && !a.removed && a.mem.docked, `${label(f)}: the anchor withdrawn (its piece kept)`);
    assert.equal(u.mem.summonStock[ANCHOR], 0, `${label(f)}: stock emptied`);
    assert.ok(u.skill.active, label(f));
    approx(u.skill.timeLeft, tl, `${label(f)}: the remaining time kept`, 0.1);
    assert.equal(sil.findBuff('talent:kalts2:regen')?.mods.hpRegen, 60, `${label(f)}: 赫默, 2.0 from her flight, entered T2`);
    h.runUntil(() => !u.skill.active, 40);
    h.run(5);
    assert.ok(!a.alive, `${label(f)}: no anchor back after the skill (stock 0)`);
    done(h);
  }
});

test('the anchor link: she leaves the field before her S3 ⇒ the anchor on the field no longer moves her (kalts2_s_3[on_token_born] is lost with her); with S1 / S2 the anchor piece never takes the field', () => {
  const { h, u, a } = field({ tier: 6, elite: true, skill: 2, anchor: { row: 10, col: 9 }, others: [{ uid: 3, chessId: YAK, row: 10, col: 5 }] });
  const yak = h.unit(3);
  assert.equal(u.mem.k2link, a);
  h.b.kill(u, null);
  h.step();
  assert.equal(u.mem.k2link, null, 'link lost');
  assert.ok(h.runUntil(() => u.alive, 90), 'she redeploys');
  assert.ok(a.alive, 'the anchor still stands');
  u.skill.gainSp(999);
  yak.hp = yak.s.maxHp * 0.3;
  assert.ok(h.runUntil(() => u.skill.active, 4));
  h.run(3);
  assert.deepEqual([u.tileR, u.tileC, u.hidden], [10, 4, false], 'no transport');
  done(h);
  for (const skill of [0, 1]) {
    const r = field({ skill, anchor: { row: 10, col: 9 } });
    r.h.run(2);
    assert.ok(!r.a.alive && r.a.deferDeploy, `S${skill + 1}: the anchor stays off the field`);
    done(r.h);
  }
});
