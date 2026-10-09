// test/content/op_jesca2.test.js — the 自选 operator kit of 涤火杰西卡 (char_1034_jesca2, 6★ 哨戒铁卫; kit
// server/sim/content/kits/ops/op-jesca2.js) and her summon 机动盾牌 (token_10032_jesca2_jckshd), fielded the production way (a
// DIY slot + its `diy` pick; the shield as a token piece of hers) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4,
// no module) and elite (E2 Lv60, rank 7) with no module, SPT-X “私家英雄” or SPT-Y 未曾风化 at stage 1 (tier 5) / 3 (tier 6).
// Every number is read back from data/backups.json (the form of that slot status, the token's variant); the fidelity
// checklist of kits/README.md item by item.
// Run: node --test test/content/op_jesca2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const JESCA = 'char_1034_jesca2';
const SHIELD = 'token_10032_jesca2_jckshd';
const FORMS = BACKUPS.units[JESCA].forms;
const TOKEN = BACKUPS.tokens[SHIELD];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SPTX = 'uniequip_002_jesca2', SPTY = 'uniequip_003_jesca2';
const S1 = 'skchr_jesca2_1', S2 = 'skchr_jesca2_2', S3 = 'skchr_jesca2_3';
const statusKey = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusKey(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const variantOf = (tier, elite) => TOKEN.variants[`${JESCA}@${statusKey(tier, elite)}`];
const tokenStats = (tier, elite, mod) => (elite && mod && variantOf(tier, elite).byModule?.[mod]?.stats) || variantOf(tier, elite).stats;
const tokenTalent = (tier, elite, mod) => ((elite && mod && variantOf(tier, elite).byModule?.[mod]?.talents) || variantOf(tier, elite).talents).find((t) => t.bb.duration != null).bb;
const talentOf = (tier, elite, mod, i) => {
  const m = elite ? modOf(tier, mod) : null;
  return m?.talentChanges?.find((t) => t.talentIndex === i)?.bb ?? formOf(tier, elite).talents.find((t) => t.index === i).bb;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_shooter: dummy('enemy_shooter', { atk: 200, range: 2, bat: 0.5 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SPTX, SPTY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const K = (r, c) => r * 21 + c;
const sortN = (a) => [...a].sort((x, y) => x - y);
/** Her shield above her (she turns UP), beside her (the tile right of her: in front, no turn), behind her (she turns LEFT). */
const ABOVE = { row: 11, col: 4 }, FRONT = { row: 10, col: 5 }, BEHIND = { row: 10, col: 3 };

/** A battle with 涤火杰西卡 as uid 1 at (10, 4) facing RIGHT (`shield`: her piece as uid 2), plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, shield = ABOVE, others = [], seed = 5, dp = 99 } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: JESCA, skillIndex: skill, uniEquipId: mod }, elite, row: 10, col: 4 }];
  if (shield) units.push({ uid: 2, kind: 'token', tokenId: SHIELD, ownerUid: 1, row: shield.row, col: shield.col });
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: dp, dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'spGain', 'ammoUsed'], captureNoisy: true,
    units: [...units, ...others],
  });
  h.step();
  return { h, u: h.unit(1), t: shield ? h.unit(2) : null };
}
const bombHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('jesca2:bomb'));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('涤火杰西卡 in every 自选 form: her operator kit (all three skills authored), stats + module attributes, 2-2 (SPT-Y: +1), blocks 3, ranged physical, hits air, 维多利亚, no 特质; her 机动盾牌 piece: the form\'s token stats, 禁疗, taunt 1, no attack, blocks 2', () => {
  assert.equal(OPERATOR_KITS[JESCA], KITS[JESCA]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, t } = field({ tier, elite, mod, skill, shield: FRONT });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [JESCA, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [3, 'ranged', 'phys', true, 1.2], `${label(f)}: 哨戒铁卫`);
      const ext = mod === SPTY ? 1 : 0;
      assert.deepEqual(sortN(u.rangeKeys), sortN([...Array(3 + ext).keys()].map((i) => K(10, 4 + i))), `${label(f)}: 2-2${ext ? ' + 1' : ''}`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.tokens], [['victoriaShip'], [], [SHIELD]], `${label(f)}: bonds / 特质 / summon`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const ts = tokenStats(tier, elite, mod);
      assert.deepEqual([t.base.maxHp, t.base.def, t.base.atk, t.s.blockCnt, t.base.cost, t.base.respawnTime], [ts.maxHp, ts.def, 0, 2, 5, 30], `${label(f)}: shield stats`);
      assert.deepEqual([t.s.flags.noHeal, t.s.taunt, t.profile.noAttack, t.alive], [true, tokenTalent(tier, elite, mod).taunt_level, true, true], `${label(f)}: 禁疗 / taunt / no attack`);
      done(h);
    }
  }
  // E2 Lv1 2589 / 461 / 522, E2 Lv60 3265 / 520 / 651 (full potential: ATK +28); SPT-X +180 / +50 / +25 → +250 / +65 / +37,
  // SPT-Y +180 / +52 → +325 / +83; the shield 3041 / 619, 3545 / 709, SPT-X stage 3 3925 / 788 and 60 s
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.def], [2589, 461, 3265, 651]);
  assert.deepEqual([modOf(5, SPTX).attr, modOf(6, SPTX).attr, modOf(5, SPTY).attr, modOf(6, SPTY).attr], [{ maxHp: 180, atk: 50, def: 25 }, { maxHp: 250, atk: 65, def: 37 }, { maxHp: 180, atk: 52 }, { maxHp: 325, atk: 83 }]);
  assert.deepEqual([tokenStats(5, false).maxHp, tokenStats(5, true).maxHp, tokenStats(6, true, SPTX).maxHp, tokenStats(6, true, SPTX).def, tokenTalent(6, true, SPTX).duration, tokenTalent(5, true, SPTX).duration], [3041, 3545, 3925, 788, 60, 50]);
});

test('a 自选 pick: 涤火杰西卡 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(JESCA));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(JESCA), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: JESCA, skillIndex: 2, uniEquipId: SPTY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: JESCA, skillIndex: 2, uniEquipId: SPTY } } });
});

test('T1 灵活应变: she turns to face her shield (her range turns with her) and back once it leaves; while it stands next to her she and the unit on the tile behind her DEF +18 % (孤立 too), nobody else', () => {
  for (const f of [[5, false, null], [6, true, SPTX], [6, true, SPTY]]) {
    const [tier, elite, mod] = f;
    // shield above (11, 4): she faces UP; behind her is (9, 4); 德克萨斯 at (10, 3) was behind her RIGHT facing only
    const others = [{ uid: 3, chessId: 'chess_char_1_02_a', row: 9, col: 4 }, { uid: 4, chessId: 'chess_char_1_08_a', row: 10, col: 3 }];
    const { h, u, t } = field({ tier, elite, mod, skill: 0, shield: ABOVE, others });
    const yak = h.unit(3), texas = h.unit(4);
    const d = talentOf(tier, elite, mod, 0).def;
    assert.equal(d, 0.18);
    assert.deepEqual([u.dir, t.dir], ['UP', 'UP'], `${label(f)}: she faces her shield, it faces away from her`);
    const ext = mod === SPTY ? 1 : 0;
    assert.deepEqual(sortN(u.rangeKeys), sortN([...Array(3 + ext).keys()].map((i) => K(10 + i, 4))), `${label(f)}: her range turned UP`);
    assert.deepEqual(u.findBuff('talent:jesca2:def')?.mods, { defPct: d }, `${label(f)}: herself`);
    assert.deepEqual(yak.findBuff('talent:jesca2:def')?.mods, { defPct: d }, `${label(f)}: 角峰 behind her`);
    assert.equal(texas.findBuff('talent:jesca2:def'), null, `${label(f)}: 德克萨斯 beside her`);
    approx(u.s.def, u.base.def * (1 + d), `${label(f)}: her DEF`);
    // 孤立 does not keep it off (ignoreAllyTargetFree)
    h.b.addBuff(yak, { key: 'test:isolated', flags: { isolated: true } });
    h.run(0.5);
    assert.ok(yak.findBuff('talent:jesca2:def'), `${label(f)}: a 孤立 unit behind her`);
    // the shield leaves: she turns back to RIGHT, the aura ends
    h.b.retreat(t, { reason: 'expired', permanent: true });
    h.run(0.5);
    assert.deepEqual([u.dir, !!u.findBuff('talent:jesca2:def'), !!yak.findBuff('talent:jesca2:def')], ['RIGHT', false, false], `${label(f)}: back to RIGHT`);
    assert.deepEqual(sortN(u.rangeKeys), sortN([...Array(3 + ext).keys()].map((i) => K(10, 4 + i))), `${label(f)}: her range back`);
    done(h);
  }
  // behind her: she turns LEFT; in front: no turn; on a tile not next to her: no turn, no aura (the prep's placement rule)
  const b = field({ shield: BEHIND });
  assert.equal(b.u.dir, 'LEFT');
  assert.deepEqual(sortN(b.u.rangeKeys), sortN([K(10, 4), K(10, 3), K(10, 2)]), 'her range faces LEFT');
  done(b.h);
  const fr = field({ shield: FRONT });
  assert.deepEqual([fr.u.dir, !!fr.u.findBuff('talent:jesca2:def')], ['RIGHT', true]);
  done(fr.h);
  const far = field({ shield: { row: 12, col: 4 } });
  assert.deepEqual([far.u.dir, !!far.u.findBuff('talent:jesca2:def')], ['RIGHT', false], 'a shield two tiles away');
  done(far.h);
});

test('T1 灵活应变: the shield lasts 50 s (SPT-X stage 3: 60 s), comes back on its tile 30 s after it left paying 5 DP — only while she stands; it falls with her and her redeployment readies it at once', () => {
  for (const f of [[5, false, null], [6, true, SPTX], [5, true, SPTX]]) {
    const [tier, elite, mod] = f;
    const { h, u, t } = field({ tier, elite, mod, skill: 0, shield: ABOVE });
    const life = tokenTalent(tier, elite, mod).duration;
    assert.equal(life, tier === 6 && mod === SPTX ? 60 : 50, label(f));
    h.run(life - 0.6);
    assert.ok(t.alive, `${label(f)}: still there before ${life} s`);
    h.run(0.7);
    assert.ok(!t.alive && !t.removed, `${label(f)}: gone at ${life} s (the piece stays)`);
    assert.equal(u.dir, 'RIGHT');
    const dp0 = h.b.players[0].dp;
    h.run(29.5);
    assert.ok(!t.alive, `${label(f)}: not before 30 s`);
    h.run(0.7);
    assert.ok(t.alive, `${label(f)}: back after 30 s`);
    assert.deepEqual([t.tileR, t.tileC, u.dir], [11, 4, 'UP'], `${label(f)}: on its tile, she faces it again`);
    approx(h.b.players[0].dp, dp0 - 5, `${label(f)}: 5 DP`);
    // she falls ⇒ it falls; waiting while she is down; her redeployment brings it at once
    h.b.kill(u, null);
    h.step();
    assert.ok(!t.alive && !t.removed, `${label(f)}: falls with her`);
    assert.equal(u.dir, 'RIGHT', `${label(f)}: her facing restored for her redeployment`);
    h.run(40);
    assert.ok(!t.alive, `${label(f)}: no shield while she is down`);
    assert.ok(h.runUntil(() => u.alive, 60), `${label(f)}: she redeploys`);
    const back = h.b.time;
    assert.ok(h.runUntil(() => t.alive, 0.2), `${label(f)}: the shield with her (charge_token[born])`);
    assert.ok(h.b.time - back < 0.15, `${label(f)}: at once`);
    assert.equal(u.dir, 'UP');
    done(h);
  }
});

test('T2 蓄能释放: each damage instance on the shield (next to her) gives her 1 SP with 55 % (SPT-Y stage 3: 65 % and its next redeploy −1 s per success, ≤ 14 s); a 流失 does not count', () => {
  for (const f of [[5, false, null], [6, true, SPTY], [5, true, SPTY]]) {
    const [tier, elite, mod] = f;
    const tb = talentOf(tier, elite, mod, 1);
    const y3 = tier === 6 && mod === SPTY;
    assert.deepEqual([tb.prob, tb.sp, tb.respawn_time ?? 0, tb.respawn_time_max ?? 0], y3 ? [0.65, 1, 1, 14] : [0.55, 1, 0, 0], label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 0, shield: ABOVE, seed: 17 });
    // a shooter beside the shield and out of her range: it picks the shield (taunt 1), she cannot reach it
    h.spawn('enemy_shooter', { pos: [12, 5] });
    h.run(40);
    const hits = h.hooksOf('damaged').filter((c) => c.target === t && c.amount > 0).length;
    const gains = h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent');
    assert.ok(hits > 60, `${label(f)}: ${hits} hits`);
    assert.ok(gains.every((c) => c.amount === 1), `${label(f)}: 1 SP each`);
    const share = gains.length / hits;
    assert.ok(Math.abs(share - tb.prob) < 0.12, `${label(f)}: ${gains.length} / ${hits} ≈ ${tb.prob}`);
    assert.equal(t.mem.respawnCut, y3 ? Math.min(14, gains.length) : 0, `${label(f)}: redeploy cut`);
    const n = gains.length;
    h.b.loseHp(t, 10, { source: null });
    h.step();
    assert.equal(h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'talent').length, n, `${label(f)}: a 流失 gives nothing`);
    if (y3) {
      h.b.retreat(t, { reason: 'expired', permanent: true });
      approx(t.mem.readyAt, h.b.time + 30 - 14, `${label(f)}: back 30 − 14 s later`, 1e-6);
    }
    done(h);
  }
});

test('S1 坚守阵线 (AUTO, SP_FULL): at full SP with no enemy, 持续时间无限; ATK / DEF +40 % / +55 %; her shield DEF +40 % / +55 % and +20 s of life once per deployment', () => {
  for (const f of [[5, false, null], [6, true, SPTX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    const { h, u, t } = field({ tier, elite, mod, skill: 0, shield: ABOVE });
    assert.deepEqual([u.skill.rule, sk.trigger.rule, u.skill.kind, sk.spCost, sk.bb.atk, sk.bb.def, sk.bb.duration], ['SP_FULL', 'DEFAULT', 'toggle', elite ? 90 : 100, elite ? 0.55 : 0.4, elite ? 0.55 : 0.4, 20], label(f));
    const life = tokenTalent(tier, elite, mod).duration;
    assert.ok(h.runUntil(() => u.skill.active, sk.spCost + 1), `${label(f)}: cast at ${sk.spCost} s with no enemy`);
    approx(h.b.time, sk.spCost, `${label(f)}: at full SP`, 0.02);
    // the first shield expired before (life < cost) and came back at life + 30: it gets the 20 s now — or, T6 (60 + 30 =
    // the 90 s cost), on its return a tick after the cast (its timers count from its deployment on the first tick)
    assert.ok(h.runUntil(() => t.alive, 0.1), `${label(f)}: the shield is on the field`);
    h.step();
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb.def + 0.18), `${label(f)}: DEF (+18 % T1)`);
    approx(t.s.def, t.base.def * (1 + sk.bb.def), `${label(f)}: shield DEF`);
    approx(t.mem.lifeEnd - t.deployedAt, life + 20, `${label(f)}: shield life +20 s`);
    h.run(200);
    assert.ok(u.skill.active, `${label(f)}: still on 200 s later`);
    done(h);
  }
});

test('S2 掩蔽护卫 (MANUAL, data ACTIVE_RANGE — rawRule TAKE_DAMAGE): casts with an enemy on its 2-5 that her 2-2 does not reach; 15 s, range 2-5 (SPT-Y does not grow it), ATK +45 % / +60 %, interval 0.3 s, 75 % physical and arts dodge', () => {
  for (const f of [[5, false, null], [6, true, SPTY], [5, true, SPTY]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, mod, skill: 1, shield: null });
    assert.deepEqual([u.skill.rule, sk.trigger.rule, sk.trigger.rawRule, sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb.prob], ['ACTIVE_RANGE', 'ACTIVE_RANGE', 'TAKE_DAMAGE', 15, elite ? 0.6 : 0.45, -0.9, 0.75], label(f));
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${label(f)}: no enemy, no cast`);
    // (11, 6): on the 2-5 (local [1, 2]), not on her 2-2 (+1)
    h.spawn('enemy_dummy', { pos: [11, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: cast for an enemy only the skill range reaches`);
    approx(u.skill.timeLeft, 15, label(f), 0.01);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `${label(f)}: 2-5 exactly`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.interval, 0.3, `${label(f)}: 1.2 − 0.9 s`);
    assert.deepEqual([u.s.dodgePhys, u.s.dodgeArts], [0.75, 0.75], `${label(f)}: dodge`);
    h.runUntil(() => !u.skill.active, 20);
    const ext = mod === SPTY ? 1 : 0;
    assert.deepEqual(sortN(u.rangeKeys), sortN([...Array(3 + ext).keys()].map((i) => K(10, 4 + i))), `${label(f)}: back to her own range`);
    assert.deepEqual([u.s.dodgePhys, u.s.interval], [0, 1.2], `${label(f)}: all back`);
    done(h);
  }
});

test('S3 饱和迸射 (MANUAL, data ACTIVE_RANGE on 2-2 + 1): 20 bullets, range +1 (SPT-Y: +2), interval 1.8 s, ATK +240 % / +270 %, DEF +50 % / +65 %, shield DEF +100 % / +135 %; casts with an enemy only the larger range reaches', () => {
  for (const f of [[5, false, null], [6, true, SPTY], [6, true, SPTX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    const { h, u, t } = field({ tier, elite, mod, skill: 2, shield: BEHIND });
    assert.deepEqual([u.skill.rule, sk.trigger.rule, sk.trigger.rawRule, u.skill.kind, u.skill.ammo], ['ACTIVE_RANGE', 'ACTIVE_RANGE', 'TAKE_DAMAGE', 'ammo', 20], label(f));
    assert.equal(u.dir, 'LEFT');
    const ext = mod === SPTY ? 1 : 0;
    u.skill.gainSp(999);
    // facing LEFT from (10, 4): her own range reaches col 4 − 2 − ext; one more tile only with the skill
    h.spawn('enemy_dummy', { pos: [10, 1 - ext] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `${label(f)}: cast`);
    assert.deepEqual(sortN(u.rangeKeys), sortN([...Array(4 + ext).keys()].map((i) => K(10, 4 - i))), `${label(f)}: +1 tile (${ext ? 'and SPT-Y\'s' : 'no module'})`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.def, u.base.def * (1 + sk.bb['jesca2_s_3[def].def'] + 0.18), `${label(f)}: DEF (+18 % T1)`);
    approx(u.s.interval, 1.8, `${label(f)}: 1.2 + 0.6 s`);
    approx(t.s.def, t.base.def * (1 + sk.bb['jesca2_s_3_token[def].def']), `${label(f)}: shield DEF`);
    assert.deepEqual([sk.bb.atk, sk.bb['jesca2_s_3[def].def'], sk.bb['jesca2_s_3_token[def].def']], elite ? [2.7, 0.65, 1.35] : [2.4, 0.5, 1], label(f));
    h.runUntil(() => !u.skill.active, 60);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, 20, `${label(f)}: 20 bullets`);
    assert.equal(t.findBuff('skill:jesca2:shield'), null, `${label(f)}: shield DEF back`);
    done(h);
  }
});

test('S3 shell: with her shield next to her at the cast it flies ahead at 5 tiles / s, bursts on the first enemy it touches: every enemy within 1.7 (air units too) takes 250 % ATK physical and a 5 s stun; no bullet spent; none without a shield, one when a shield comes during the skill, held while she is disarmed', () => {
  for (const f of [[5, false, null], [6, true, SPTY]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.bb['attack@extrabomb.atk_scale'], sk.bb['attack@extrabomb.stun'], sk.bb['attack@extrabomb.projectile_range']], [2.5, 5, 1.7], label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 2, shield: FRONT });
    const near = h.spawn('enemy_dummy', { pos: [10, 7] }), side = h.spawn('enemy_dummy', { pos: [11, 7] });
    const fly = h.spawn('enemy_fly', { pos: [11, 6] }), far = h.spawn('enemy_dummy', { pos: [12, 8] });
    u.skill.gainSp(999);
    u.skill.activate('test');
    const atk = u.s.atk;
    assert.ok(h.runUntil(() => bombHits(h, u).length > 0, 2), `${label(f)}: the shell lands`);
    // from (10, 4) to the enemy at (10, 7): it touches it 0.5 before, at x 6.5, i.e. 2.5 tiles in 0.5 s
    approx(h.hooksOf('damaged').find((c) => c.dmg?.tags?.includes('jesca2:bomb')).t, 0.5 + h.hooksOf('skillStart').find((c) => c.unit === u).t, `${label(f)}: flight time`, 0.1);
    const hits = bombHits(h, u);
    assert.deepEqual(sortN(hits.map((c) => c.target.id)), sortN([near.id, side.id, fly.id]), `${label(f)}: within 1.7, the flyer too`);
    for (const c of hits) {
      approx(c.amount, atk * 2.5, `${label(f)}: 250 % ATK`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true], label(f));
    }
    const stuns = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun');
    assert.deepEqual(sortN(stuns.map((c) => c.target.id)), sortN([near.id, side.id, fly.id]), `${label(f)}: stunned`);
    for (const c of stuns) approx(c.duration, 5, `${label(f)}: 5 s`);
    assert.ok(!far.findBuff('stun'), `${label(f)}: out of the burst`);
    assert.equal(u.skill.ammoLeft + h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, 20, `${label(f)}: the shell spends no bullet`);
    h.run(3);
    assert.equal(bombHits(h, u).length, hits.length, `${label(f)}: one shell per cast`);
    // a shield coming during the skill fires another (her shield back at once)
    h.b.retreat(t, { reason: 'expired', permanent: true });
    t.mem.readyAt = h.b.time;
    assert.ok(h.runUntil(() => t.alive, 1), label(f));
    assert.ok(h.runUntil(() => bombHits(h, u).length > hits.length, 2), `${label(f)}: a second shell`);
    done(h);
  }
  // no shield: no shell; disarmed: it waits
  const a = field({ skill: 2, shield: null });
  a.h.spawn('enemy_dummy', { pos: [10, 6] });
  a.u.skill.gainSp(999);
  a.u.skill.activate('test');
  a.h.run(3);
  assert.equal(bombHits(a.h, a.u).length, 0, 'no shield: no shell');
  done(a.h);
  const b = field({ skill: 2, shield: FRONT });
  b.h.spawn('enemy_dummy', { pos: [10, 7] });
  b.h.b.addBuff(b.u, { key: 'test:disarm', flags: { disarm: true }, duration: 2 });
  b.u.skill.gainSp(999);
  b.u.skill.activate('test');
  b.h.run(1.5);
  assert.equal(bombHits(b.h, b.u).length, 0, 'disarmed: held');
  assert.ok(b.h.runUntil(() => bombHits(b.h, b.u).length > 0, 2), 'fired once the disarm is gone');
  done(b.h);
});

test('modules: SPT-X reveals the stealthed enemies of her range (stages 1 and 3); SPT-Y is a permanent +1 range (her initial range, S3 on top, never S2); with no module neither', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, shield: null });
    const inR = h.spawn('enemy_dummy', { pos: [10, 6] }), outR = h.spawn('enemy_dummy', { pos: [10, 9] });
    for (const e of [inR, outR]) h.b.addBuff(e, { key: 'test:stealth', flags: { stealth: true } });
    h.run(0.5);
    assert.equal(!!inR.s.flags.reveal, elite && mod === SPTX, `${label(f)}: reveal in range`);
    assert.equal(!!outR.s.flags.reveal, false, `${label(f)}: never out of range`);
    const ext = elite && mod === SPTY ? 1 : 0;
    assert.equal(u.s.baseRangeExtend, ext, `${label(f)}: permanent extension`);
    assert.deepEqual(u.liveRangeGrid.length, 3 + ext, `${label(f)}: initial range`);
    if (elite && mod) {
      const m = modOf(tier, mod);
      assert.ok(mod === SPTX ? /隐匿/.test(m.traitOverride.moduleDesc) : m.traitOverride.bb.ability_range_forward_extend === 1, `${label(f)}: the data`);
    }
    done(h);
  }
});
