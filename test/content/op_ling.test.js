// test/content/op_ling.test.js — the 自选 operator kit of 令 (char_2023_ling, 6★ 召唤师; kit
// server/sim/content/kits/ops/op-ling.js, the summon deck of kits/shared/summoner.js) and of her summons “清平” / “逍遥” /
// “弦惊”, fielded the production way (a DIY slot + its `diy` pick, simdata getDiy; the summons as the placed hand pieces of her
// player) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module or
// SUM-Y 诗短梦长 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_ling.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const LING = 'char_2023_ling';
const FORMS = BACKUPS.units[LING].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SUMY = 'uniequip_002_ling';
const S1 = 'skchr_ling_1', S2 = 'skchr_ling_2', S3 = 'skchr_ling_3';
const Q = 'token_10020_ling_soul1', X = 'token_10020_ling_soul2', J = 'token_10020_ling_soul3';
const SOUL_OF = [Q, X, J];
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const tokOf = (tok, tier, elite, skill, mod) => {
  let v = BACKUPS.tokens[tok].variants[`${LING}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SUMY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 令 as uid 1 at (row, col) facing RIGHT; `souls` = [[tokenId, row, col, dir?]] placed pieces (uid 10 +). */
function field({ tier = 5, elite = false, mod = null, skill = 0, souls = [], row = 10, col = 3, seed = 5, dp = 99 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: dp }, captureNoisy: true,
    hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack', 'dodge'],
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: LING, skillIndex: skill, uniEquipId: mod }, elite, row, col },
      ...souls.map(([tokenId, r, c, dir], i) => ({ uid: 10 + i, kind: 'token', tokenId, ownerUid: 1, row: r, col: c, dir: dir ?? 'RIGHT' }))],
  });
  h.step();
  const u = h.unit(1);
  return { h, u, ss: h.b.allyUnits.filter((a) => a.kind === 'token'), deck: u.mem.summonDeck };
}
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('令 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-1, ranged arts, hits air, blocks 1, ground-targetable, the data triggers (DEFAULT), 炎, no 特质', () => {
  assert.equal(OPERATOR_KITS[LING], KITS[LING]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [LING, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 1.6], `${label(f)}: 召唤师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.skill.rule, form.skills[skill].trigger.rule], ['DEFAULT', 'DEFAULT'], `${label(f)}: the data's trigger`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['yanShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 852 / 430 / 114, E2 Lv60 1002 / 474 / 130; SUM-Y +100 / +30 → +150 / +50 HP / ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [852, 430, 1002, 474]);
  assert.deepEqual([modOf(5, SUMY).attr, modOf(6, SUMY).attr], [{ maxHp: 100, atk: 30 }, { maxHp: 150, atk: 50 }]);
});

test('令\'s skills in every form: the data\'s SP (time SP, spCost, initSp, charges) and her 3-1 range while each runs (none changes it)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const sk = formOf(tier, elite).skills[skill];
      const { h, u } = field({ tier, elite, mod, skill });
      assert.deepEqual([u.skill.spType, u.skill.spCost, u.skill.maxCharges], ['time', sk.spCost, sk.maxChargeTime], `${label(f)} S${skill + 1}: SP`);
      assert.ok(Math.abs(u.skill.sp - sk.initSp) < 0.1, `${label(f)} S${skill + 1}: initSp ${sk.initSp} (${u.skill.sp})`);
      h.spawn('enemy_dummy', { pos: [10, 4] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations > 0, 3), `${label(f)} S${skill + 1}: cast with an enemy in her range`);
      assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)} S${skill + 1}: 3-1 while it runs`);
      done(h);
    }
  }
});

test('a 自选 pick: 令 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(LING));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(LING), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: LING, skillIndex: 1, uniEquipId: SUMY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: LING, skillIndex: 1, uniEquipId: SUMY } } });
});

test('T1 挑灯问梦: her skill\'s summon is her piece; the deck — 5 held, cap 5 (8 with SUM-Y: +3 on the card), at most 3 standing (4 at SUM-Y stage 3); every summon holds 禁疗 and fights with its data (清平 1-1 melee physical blocks 1, 逍遥 3-1 arts hits air, 弦惊 1-1 blocks 2 strikes all it blocks)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const tok = SOUL_OF[skill];
      const { h, u, ss, deck } = field({ tier, elite, mod, skill, souls: [[tok, 10, 6]] });
      const s = ss[0], v = tokOf(tok, tier, elite, skill, mod);
      const y = elite && mod === SUMY;
      assert.ok(h.b.producesToken(u, tok) && SOUL_OF.filter((x) => x !== tok).every((x) => !h.b.producesToken(u, x)), `${label(f)} S${skill + 1}: only ${tok}`);
      assert.deepEqual([deck.charge, deck.cap, deck.held, deck.maxDeployed], [5, y ? 8 : 5, y ? 8 : 5, y && tier === 6 ? 4 : 3], `${label(f)} S${skill + 1}: deck`);
      assert.deepEqual([s.base.maxHp, s.base.atk, s.base.def, s.base.res, s.base.cost, s.base.respawnTime, s.base.bat], [v.stats.maxHp, v.stats.atk, v.stats.def, v.stats.res, v.stats.cost, v.stats.respawnTime, v.stats.bat], `${label(f)}: summon stats`);
      assert.deepEqual([s.alive, !!s.s.flags.noHeal, s.kit.skill], [true, true, null], `${label(f)}: deployed, 禁疗, no skill`);
      assert.deepEqual(s.liveRangeGrid, v.rangeGrid, `${label(f)}: its range`);
      const want = { [Q]: ['melee', 'phys', false, 1, false], [X]: ['ranged', 'arts', true, 1, false], [J]: ['melee', 'phys', false, 2, true] }[tok];
      assert.deepEqual([s.profile.attack, s.profile.dmgType, s.profile.canHitFly, s.s.blockCnt, !!s.profile.hitAllBlocked], want, `${label(f)}: ${tok}`);
      done(h);
    }
  }
  // SUM-Y: 清平 / 逍遥 −3 DP, 弦惊 −5 ("部署费用-3 / -5"); stage 3 清平 +150 HP +45 ATK, 逍遥 +100 / +35, 弦惊 +250 / +60
  assert.deepEqual(SOUL_OF.map((t, i) => tokOf(t, 6, false, i, null).stats.cost - tokOf(t, 6, true, i, SUMY).stats.cost), [3, 3, 5]);
  assert.deepEqual(SOUL_OF.map((t, i) => [tokOf(t, 6, true, i, SUMY).stats.maxHp - tokOf(t, 6, true, i, null).stats.maxHp, tokOf(t, 6, true, i, SUMY).stats.atk - tokOf(t, 6, true, i, null).stats.atk]), [[150, 45], [100, 35], [250, 60]]);
});

test('T2 随付笺咏醉屠苏: a summon knocked out, recalled or absorbed ⇒ +4 SP and a stack of ATK +3 % (at most 5); not when her summons leave with her; no SP while a timed skill of hers runs', () => {
  const { h, u, ss } = field({ tier: 6, elite: true, skill: 0, souls: [[Q, 10, 6], [Q, 11, 6], [Q, 9, 6]] });
  const t1 = formOf(6, true).talents.find((t) => t.index === 1).bb;
  assert.deepEqual(t1, { max_stack_cnt: 5, sp: 4, atk: 0.03 });
  const atk0 = u.s.atk;
  const sp0 = u.skill.sp;
  h.b.kill(ss[0], null);
  approx(u.skill.sp - sp0, 4, '+4 SP', 1e-3);
  assert.equal(u.findBuff('ling:t2').stacks, 1, 'one stack');
  approx(u.s.atk, atk0 * 1.03, 'ATK +3 %');
  for (let i = 0; i < 6; i++) { h.b.kill(ss[1 + (i % 2)], null); h.runUntil(() => ss.every((s) => s.alive), 15); }
  assert.equal(u.findBuff('ling:t2').stacks, 5, 'at most 5 stacks');
  approx(u.s.atk, atk0 * 1.15, 'ATK +15 %');
  // no SP while S1 runs
  h.spawn('enemy_dummy', { pos: [10, 4] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'S1 cast');
  const spOn = u.skill.sp;
  h.b.kill(ss[0], null);
  assert.equal(u.skill.sp, spOn, 'no SP during a timed skill');
  // her leaving: the summons go with her, nothing more
  const st = u.findBuff('ling:t2').stacks;
  h.b.retreat(u);
  assert.equal(u.findBuff('ling:t2'), null, 'the stacks leave with her');
  assert.equal(st, 5);
  done(h);
});

test('S1 重进酒: +1 held at the cast; she and her summons ATK +29 % / +38 % and ASPD +29 / +38 for 25 s; her summons\' attacks deal arts damage meanwhile, physical before and after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, ss, deck } = field({ tier, elite, mod, skill: 0, souls: [[Q, 10, 6]] });
    const s = ss[0];
    assert.deepEqual([sk.bb.atk, sk.bb.attack_speed, sk.bb.cnt, sk.duration], [elite ? 0.38 : 0.29, elite ? 38 : 29, 1, 25]);
    h.spawn('enemy_dummy', { pos: [10, 7] });   // its 1-1 (outside her 3-1)
    h.spawn('enemy_dummy', { pos: [11, 4] });   // hers
    h.run(3);
    assert.ok(from(h, s).length && from(h, s).every((c) => c.type === 'phys'), 'physical before');
    deck.held = 2;
    const atk0 = u.s.atk, satk0 = s.s.atk;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.equal(deck.held, 3, '技能开启时获得1个召唤物');
    approx(u.s.atk, atk0 * (1 + sk.bb.atk), 'her ATK');
    approx(s.s.atk, satk0 * (1 + sk.bb.atk), 'its ATK');
    assert.deepEqual([u.s.aspd, s.s.aspd], [100 + sk.bb.attack_speed, 100 + sk.bb.attack_speed], 'ASPD');
    const n0 = from(h, s).length;
    h.run(4);
    assert.ok(from(h, s).slice(n0).length && from(h, s).slice(n0).every((c) => c.type === 'arts'), 'arts during S1');
    // knocked out during it: back 10 s later with the skill's bonus and arts
    h.b.kill(s, null);
    assert.ok(h.runUntil(() => s.alive, 10.5) && u.skill.active, 'back while it runs');
    assert.deepEqual(s.findBuff('ling:s1:soul')?.mods, { atkPct: sk.bb.atk, aspd: sk.bb.attack_speed }, 'a summon deployed during it takes the bonus');
    h.runUntil(() => !u.skill.active, 30);
    approx(h.b.time, h.hooksOf('skillStart').at(-1).skill.lastStart + 25, '25 s', 0.01);
    const n1 = from(h, s).length;
    h.run(3);
    assert.ok(from(h, s).slice(n1).every((c) => c.type === 'phys') && s.s.aspd === 100, 'physical and its ASPD back');
    done(h);
  }
});

test('S2 笑鸣瑟 (2 charges): her cast-attack strikes 2 enemies for 310 % / 370 % ATK arts and 束缚 2 / 2.5 s each; every summon of hers breaks off and strikes 2 enemies of its range for its 2.atk_scale × its ATK + 束缚 2.duration s (silenced / disarmed ones too); 1.2 s later the summons below half HP are recalled (+1 held, T2)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, ss, deck } = field({ tier, elite, mod, skill: 1, souls: [[X, 10, 5], [X, 11, 5], [X, 9, 5]] });
    const [hurt, muted, fine] = ss;
    const tv = tokOf(X, tier, elite, 1, mod);
    assert.deepEqual([u.skill.maxCharges, sk.bb.atk_scale, sk.bb['ling_s2_unmovable.duration'], sk.bb.value, sk.bb.hp_ratio, tv.skill.bb['2.atk_scale'], tv.skill.bb['2.duration']],
      [2, elite ? 3.7 : 3.1, elite ? 2.5 : 2, 2, 0.5, elite ? 3.7 : 3.1, elite ? 2.5 : 2]);
    const a = h.spawn('enemy_dummy', { pos: [10, 5] }), b = h.spawn('enemy_dummy', { pos: [10, 6] }), c = h.spawn('enemy_dummy', { pos: [11, 6] });
    hurt.hp = hurt.s.maxHp * 0.45;
    fine.hp = fine.s.maxHp * 0.55;
    h.b.applyStatus(muted, 'silence', { duration: 30, force: true });
    h.b.applyStatus(muted, 'disarm', { duration: 30, force: true });
    deck.held = 1;
    u.skill.gainSp(999);
    const sp0 = u.skill.sp;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 3), 'cast on her attack');
    const castAt = h.b.time;
    h.run(0.6);
    const mine = from(h, u).filter((x) => x.dmg.isSkill);
    assert.equal(mine.length, 2, 'her two targets');
    for (const x of mine) approx(x.amount, u.s.atk * sk.bb.atk_scale, 'her scale');
    const binds = h.hooksOf('statusApplied').filter((x) => x.status === 'bind');
    assert.ok(binds.some((x) => x.source === u) && binds.filter((x) => x.source === u).every((x) => Math.abs(x.duration - sk.bb['ling_s2_unmovable.duration']) < 1e-9), 'her 束缚');
    for (const s of ss) {
      const hits = from(h, s).filter((x) => x.dmg.tags?.includes('ling:s2'));
      assert.equal(hits.length, 2, `${s.uid}: two targets`);
      for (const x of hits) approx(x.amount, s.s.atk * tv.skill.bb['2.atk_scale'] * (1 - x.target.s.res / 100), `${s.uid}: its scale`);
      assert.ok(binds.filter((x) => x.source === s).length === 2, `${s.uid}: 束缚 ×2`);
    }
    const struck = new Set(h.hooksOf('damaged').filter((x) => x.dmg?.isSkill).map((x) => x.target));
    assert.ok(struck.size >= 2 && [...struck].every((e) => e.s.flags.bind), 'every struck enemy bound');
    void a; void b; void c;
    // 1.2 s after the cast: the summon below half HP is recalled (T2: +4 SP, a stack)
    h.runUntil(() => h.b.time >= castAt + 1.1, 2);
    assert.ok(hurt.alive, 'not before 1.2 s');
    const spBefore = u.skill.sp;
    assert.ok(h.runUntil(() => !hurt.alive, 0.2), 'recalled at 1.2 s');
    assert.deepEqual([hurt.alive, muted.alive, fine.alive], [false, true, true], 'only the one below half');
    assert.equal(deck.held, 2, '+1 held');
    assert.ok(Math.abs(u.skill.sp - spBefore - 4) < 0.2, `T2: +4 SP (${spBefore} → ${u.skill.sp})`);
    assert.equal(u.findBuff('ling:t2').stacks, 1, 'T2 stack');
    void sp0;
    done(h);
  }
});

test('S3 宁作吾: she and her summons ATK +55 % / +70 %, DEF +50 % / +60 % for 25 / 30 s; every 0.5 s each summon\'s x-5 ground enemies take 20 % of 令\'s ATK as arts (her damage, not dodgeable; no air, nothing outside); +1 held at its end', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u, ss, deck } = field({ tier, elite, mod, skill: 2, souls: [[J, 10, 6, 'RIGHT']] });
    const s = ss[0];
    assert.deepEqual([sk.bb.atk, sk.bb.def, sk.bb.atk_scale, sk.bb.interval, sk.bb.cnt, sk.duration], [elite ? 0.7 : 0.55, elite ? 0.6 : 0.5, 0.2, 0.5, 1, elite ? 30 : 25]);
    const front = h.spawn('enemy_dummy', { pos: [10, 7] }), side = h.spawn('enemy_dummy', { pos: [11, 6] });
    const fly = h.spawn('enemy_fly', { pos: [9, 6] }), diag = h.spawn('enemy_dummy', { pos: [11, 7] });
    h.spawn('enemy_dummy', { pos: [10, 4] });
    deck.held = 0;
    const atk0 = u.s.atk, satk0 = s.s.atk, sdef0 = s.s.def;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    approx(u.s.atk, atk0 * (1 + sk.bb.atk), 'her ATK');
    approx(s.s.atk, satk0 * (1 + sk.bb.atk), 'its ATK');
    approx(s.s.def, sdef0 * (1 + sk.bb.def), 'its DEF');
    h.run(3.05);
    const pulses = h.hooksOf('damaged').filter((x) => x.dmg?.tags?.includes('ling:s3'));
    assert.ok(pulses.length > 0, 'pulses');
    assert.ok(pulses.every((x) => x.source === u), '令\'s damage');
    assert.deepEqual(new Set(pulses.map((x) => x.target)), new Set([front, side]), 'its x-5 ground enemies only');
    for (const x of pulses) { approx(x.amount, u.s.atk * 0.2, '20 % of her ATK'); assert.deepEqual([x.type, x.dmg.canDodge, x.dmg.isSplash], ['arts', false, true]); }
    assert.equal(pulses.filter((x) => x.target === front).length, 6, 'every 0.5 s (6 in 3 s)');
    void fly; void diag;
    h.runUntil(() => !u.skill.active, 40);
    assert.equal(deck.held, 1, '技能结束时获得1个召唤物');
    done(h);
  }
});

test('the 弦惊 merge: another basic 弦惊 on a new one\'s range ⇒ that one turns 高级形态 and the new one is absorbed (T2); a new one on the range of basic ones ⇒ it turns 高级形态 and the latest of them is absorbed; 高级形态 = HP / ATK / DEF ×(1 + 1 / 0.8 / 0.8), RES ×2, interval +0.8 s, block +2, arts, full HP; never with a 高级形态 one', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SUMY]]) {
    const tb = tokOf(J, tier, elite, 2, mod).skill.bb;
    assert.deepEqual(tb, { '2.max_hp': 1, '2.atk': 0.8, '2.def': 0.8, '2.magic_resistance': 1, '2.base_attack_time': 0.8, '2.block_cnt': 2 });
    // case 1: B (deployed second) faces A — A on B's range ⇒ A evolves, B absorbed
    const { h, u, ss } = field({ tier, elite, mod, skill: 2, souls: [[J, 9, 5, 'RIGHT'], [J, 9, 6, 'LEFT']] });
    const [a, b] = ss;
    assert.deepEqual([a.alive, a.mem.lingAdvanced, b.alive], [true, true, false], 'case 1');
    const base = tokOf(J, tier, elite, 2, mod).stats;
    approx(a.s.maxHp, base.maxHp * 2, 'HP ×2');
    approx(a.hp, a.s.maxHp, 'full HP');
    approx(a.s.atk, base.atk * 1.8, 'ATK ×1.8');
    approx(a.s.def, base.def * 1.8, 'DEF ×1.8');
    approx(a.s.res, base.res * 2, 'RES ×2');
    approx(a.s.interval, base.bat + 0.8, 'interval +0.8 s');
    assert.equal(a.s.blockCnt, base.blockCnt + 2, 'block +2');
    assert.equal(u.findBuff('ling:t2')?.stacks, 1, 'T2: absorbed');
    // its attacks are arts
    h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => from(h, a).some((x) => x.dmg?.isAttack), 60), 'it fights');
    assert.ok(from(h, a).filter((x) => x.dmg?.isAttack).every((x) => x.type === 'arts'), 'arts');
    // the absorbed one comes back basic beside it (no merge with a 高级形态 one)
    assert.ok(h.runUntil(() => b.alive, 25), 'the absorbed piece comes back');
    assert.deepEqual([b.mem.lingAdvanced, a.mem.lingAdvanced, a.alive], [false, true, true], 'no second merge');
    done(h);
    // case 2: A faces B and B deploys later — B on A's range ⇒ B evolves, A (the latest such) absorbed
    const r2 = field({ tier, elite, mod, skill: 2, souls: [[J, 10, 5, 'RIGHT'], [J, 10, 6, 'RIGHT']] });
    const [a2, b2] = r2.ss;
    assert.deepEqual([a2.alive, b2.alive, b2.mem.lingAdvanced], [false, true, true], 'case 2');
    // not facing each other: no merge
    const r3 = field({ tier, elite, mod, skill: 2, souls: [[J, 10, 5, 'LEFT'], [J, 10, 6, 'RIGHT']] });
    assert.ok(r3.ss.every((x) => x.alive && !x.mem.lingAdvanced), 'apart: none');
    done(r2.h);
    done(r3.h);
  }
});

test('SUM-Y 诗短梦长: +3 held on the card and cap 8 (5 + 3) at both stages, 4 standing at stage 3; the module\'s talent text is the stage-3 T1', () => {
  const { h, deck } = field({ tier: 5, elite: true, mod: SUMY, skill: 0 });
  assert.deepEqual([deck.held, deck.cap, deck.maxDeployed], [8, 8, 3], 'stage 1');
  done(h);
  const { h: h2, deck: d2 } = field({ tier: 6, elite: true, mod: SUMY, skill: 0 });
  assert.deepEqual([d2.held, d2.cap, d2.maxDeployed], [8, 8, 4], 'stage 3');
  assert.match(modOf(6, SUMY).talentChanges[0].desc, /最多同时部署4个/);
  done(h2);
});
