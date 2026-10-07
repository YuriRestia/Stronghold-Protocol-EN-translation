// test/content/op_radian.test.js — the 自选 operator kit of 电弧 (char_4195_radian, 6★ 召唤师; kit
// server/sim/content/kits/ops/op-radian.js, the summon deck of kits/shared/summoner.js) and of her summons 戴乌 / 赛柯 /
// 桑特拉, fielded the production way (a DIY slot + its `diy` pick, simdata getDiy; the summons as the placed hand pieces of her
// player) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module,
// SO-A 电弧特勤证章 or SO-B 新起点 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of
// kits/README.md.
// Run: node --test test/content/op_radian.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const RAD = 'char_4195_radian';
const FORMS = BACKUPS.units[RAD].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SOA = 'uniequip_002_radian', SOB = 'uniequip_003_radian';
const S1 = 'skchr_radian_1', S2 = 'skchr_radian_2', S3 = 'skchr_radian_3';
const DIVE = 'token_10051_radian_tower1', CYCLE = 'token_10052_radian_tower2', CENTRE = 'token_10053_radian_tower3';
const TOWER_OF = [DIVE, CYCLE, CENTRE];
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const tokOf = (tok, tier, elite, skill, mod) => {
  let v = BACKUPS.tokens[tok].variants[`${RAD}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SOA, SOB].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 电弧 as uid 1 at (row, col) facing RIGHT; `towers` = [[tokenId, row, col, dir?]] placed pieces (uid 10 +). */
function field({ tier = 5, elite = false, mod = null, skill = 0, towers = [], row = 10, col = 3, seed = 5, dp = 99 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: dp }, captureNoisy: true,
    hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack'],
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: RAD, skillIndex: skill, uniEquipId: mod }, elite, row, col },
      ...towers.map(([tokenId, r, c, dir], i) => ({ uid: 10 + i, kind: 'token', tokenId, ownerUid: 1, row: r, col: c, dir: dir ?? 'RIGHT' }))],
  });
  h.step();
  const u = h.unit(1);
  return { h, u, ts: h.b.allyUnits.filter((a) => a.kind === 'token'), deck: u.mem.summonDeck };
}
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('电弧 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-1, ranged arts, hits air, blocks 1, ground-targetable, the data triggers (DEFAULT), 协防, no 特质', () => {
  assert.equal(OPERATOR_KITS[RAD], KITS[RAD]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [RAD, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.maxTargets, u.base.bat], [1, 'ranged', 'arts', true, 1, 1.6], `${label(f)}: 召唤师 (SO-B's 额外攻击一个目标 is 集成战略-only)`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.skill.rule, form.skills[skill].trigger.rule], ['DEFAULT', 'DEFAULT'], `${label(f)}: the data's trigger`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // the numbers of the forms (zh_CN): E2 Lv1 844 / 424 / 118, E2 Lv60 993 / 468 / 135; SO-A +125 / +27 → +165 / +43 HP / ATK,
  // SO-B +41 → +65 ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [844, 424, 993, 468]);
  assert.deepEqual([modOf(5, SOA).attr, modOf(6, SOA).attr, modOf(5, SOB).attr, modOf(6, SOB).attr], [{ maxHp: 125, atk: 27 }, { maxHp: 165, atk: 43 }, { atk: 41 }, { atk: 65 }]);
});

test('电弧\'s skills in every form: the data\'s SP (time SP, spCost, initSp, charges) and her 3-1 range while each runs (none changes it)', () => {
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

test('a 自选 pick: 电弧 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks — without a module: the 岁的界园志异 modules SO-A / SO-B are refused like ISW-A (0.2.0 WE2)', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(RAD));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(RAD), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: RAD, skillIndex: 0, uniEquipId: null } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: RAD, skillIndex: 0, uniEquipId: null } } });
  for (const uniEquipId of [SOA, SOB]) {
    assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: RAD, skillIndex: 0, uniEquipId } }, { data, kitted: KITTED_CHARS }).error, 'BAD_TARGET', uniEquipId);
  }
});

test('T1 卡带里的灵感: her skill\'s summon is her piece; the deck — 5 held, cap 5, at most 3 standing; every summon holds 禁疗 and fights with its data (戴乌 0-1 melee physical blocks 3, 赛柯 blocks 2 and fires straight ahead, 桑特拉 3-1 arts hits air)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const tok = TOWER_OF[skill];
      const { h, u, ts, deck } = field({ tier, elite, mod, skill, towers: [[tok, 10, 6]] });
      const t = ts[0], v = tokOf(tok, tier, elite, skill, mod);
      assert.ok(h.b.producesToken(u, tok) && TOWER_OF.filter((x) => x !== tok).every((x) => !h.b.producesToken(u, x)), `${label(f)} S${skill + 1}: only ${tok}`);
      assert.deepEqual([deck.charge, deck.cap, deck.held, deck.maxDeployed], [5, 5, 5, 3], `${label(f)} S${skill + 1}: deck`);
      assert.deepEqual([t.base.maxHp, t.base.atk, t.base.def, t.base.res, t.base.cost, t.base.respawnTime, t.base.bat], [v.stats.maxHp, v.stats.atk, v.stats.def, v.stats.res, v.stats.cost, v.stats.respawnTime, v.stats.bat], `${label(f)}: summon stats (no module change)`);
      assert.deepEqual([t.alive, !!t.s.flags.noHeal, t.kit.skill], [true, true, null], `${label(f)}: deployed, 禁疗, no skill`);
      const want = { [DIVE]: [3, 'melee', 'phys', false, false], [CYCLE]: [2, 'melee', 'phys', false, true], [CENTRE]: [1, 'ranged', 'arts', true, false] }[tok];
      assert.deepEqual([t.s.blockCnt, t.profile.attack, t.profile.dmgType, t.profile.canHitFly, !!t.profile.noAttack], want, `${label(f)}: ${tok}`);
      done(h);
    }
  }
});

test('T2 加油~: her summons on the field get 鼓舞 = 15 % of HER current ATK / DEF / max HP (PRTS 修正 电弧自身), added after their own multipliers, refreshed every second; the strongest 鼓舞 of a kind is kept', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const { h, u, ts } = field({ tier, elite, mod, skill: 0, towers: [[DIVE, 10, 6]] });
    const t = ts[0];
    assert.deepEqual(formOf(tier, elite).talents.find((x) => x.index === 1).bb, { max_hp: 0.15, def: 0.15, atk: 0.15 });
    approx(t.s.atk, t.base.atk + 0.15 * u.s.atk, `${label(f)}: ATK`);
    approx(t.s.def, t.base.def + 0.15 * u.s.def, `${label(f)}: DEF`);
    approx(t.s.maxHp, t.base.maxHp + 0.15 * u.s.maxHp, `${label(f)}: max HP`);
    // her ATK rises: the 鼓舞 follows within a second
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
    h.run(1.05);
    approx(t.s.atk, t.base.atk + 0.15 * u.s.atk, 'updated every second');
    // a summon's own ATK +% does not scale it
    h.b.addBuff(t, { key: 'test:tatk', mods: { atkPct: 0.5 } });
    h.run(1.05);
    approx(t.s.atk, t.base.atk * 1.5 + 0.15 * u.s.atk, 'after its multipliers');
    // a stronger 鼓舞 of another source stays
    h.b.addBuff(t, { key: 'inspire', mods: { atkFlat: 5000 }, duration: 30, data: { src: -1, val: 5000 } });
    h.run(1.05);
    assert.equal(t.findBuff('inspire').data.val, 5000, 'the strongest kept');
    done(h);
  }
});

test('S1 律动线: +1 held; she and her summons DEF +40 % / +60 % and a 屏障 of 30 % / 70 % of their max HP until it ends (25 s; it stops every type but 元素伤害); a summon deployed during it takes it at its deployment with its 鼓舞 HP', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SOB]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u, ts, deck } = field({ tier, elite, mod, skill: 0, towers: [[DIVE, 10, 6], [DIVE, 11, 6]] });
    const [t, late] = ts;
    assert.deepEqual([sk.bb.hp_ratio, sk.bb.def, sk.bb.cnt, sk.duration], [elite ? 0.7 : 0.3, elite ? 0.6 : 0.4, 1, 25]);
    h.b.kill(late, null);
    h.spawn('enemy_dummy', { pos: [10, 4] });
    deck.held = 0;
    const def0 = u.s.def;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.equal(deck.held, 1, '技能开启时获得1个召唤物');
    approx(u.s.def, def0 * (1 + sk.bb.def), 'her DEF');
    assert.deepEqual(t.findBuff('radian:s1:tower')?.mods, { defPct: sk.bb.def }, 'its DEF');
    const bu = u.findBuff('radian:s1:barrier'), bt = t.findBuff('radian:s1:barrier');
    approx(bu.shield, u.s.maxHp * sk.bb.hp_ratio, 'her 屏障');
    approx(bt.shield, t.s.maxHp * sk.bb.hp_ratio, 'its 屏障');
    assert.deepEqual(bt.shieldType, ['phys', 'arts', 'true'], 'not 元素伤害');
    // the knocked-out one comes back during the skill: its 屏障 counts its 鼓舞 HP
    assert.ok(h.runUntil(() => late.alive, 21), 'back during the skill');
    approx(late.findBuff('radian:s1:barrier').shield, (late.base.maxHp + 0.15 * u.s.maxHp) * sk.bb.hp_ratio, 'with 鼓舞 HP');
    h.runUntil(() => !u.skill.active, 30);
    assert.ok([u, t, late].every((x) => !x.findBuff('radian:s1:barrier')), 'gone at its end');
    assert.equal(t.findBuff('radian:s1:tower'), null, 'DEF back');
    done(h);
  }
});

test('赛柯 (S2\'s summon): picks no target — every attack interval it fires a bullet straight ahead (5 tiles/s, 0.6 s, radius 0.5) at the first ground enemy it touches (100 % ATK physical 普通伤害), none at air units or farther than 3 tiles; stunned: no shot', () => {
  const { h, u, ts } = field({ tier: 5, elite: false, skill: 1, towers: [[CYCLE, 10, 5]] });
  const t = ts[0];
  const near = h.spawn('enemy_dummy', { pos: [10, 7] }), behind = h.spawn('enemy_dummy', { pos: [10, 7.4] });
  const fly = h.spawn('enemy_fly', { pos: [10, 6] }), far = h.spawn('enemy_dummy', { pos: [11, 9] });
  h.run(4);
  const hits = from(h, t);
  assert.equal(hits.length, 3, '3 shots landed in 4 s (one at its deployment, then every 1.8 s; 0.3 s of flight)');
  assert.ok(hits.every((c) => c.target === near), 'the first ground enemy ahead only');
  for (const c of hits) assert.deepEqual([c.type, c.dmg.isAttack, Math.abs(c.amount - t.s.atk) < 1e-6], ['phys', true, true]);
  void behind; void fly; void far;
  // nothing past its 3 tiles
  near.hp = 0; h.b.kill(near, null); behind.hp = 0; h.b.kill(behind, null);
  const out = h.spawn('enemy_dummy', { pos: [10, 8.6] });
  const n0 = from(h, t).length;
  h.run(4);
  assert.equal(from(h, t).length, n0, 'out of reach (3 tiles of flight + 0.5 radius)');
  void out;
  // stunned: no shot
  const close = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.b.applyStatus(t, 'stun', { duration: 5, force: true });
  const n1 = from(h, t).length;
  h.run(4);
  assert.equal(from(h, t).length, n1, 'no shot while stunned');
  h.run(3);
  assert.ok(from(h, t).some((c) => c.target === close), 'shoots again');
  void u;
  done(h);
});

test('S2 环形鳞地: +1 held; she and her summons ATK +35 % / +50 % for 25 s; 赛柯 fires three bullets per attack that fly 0.6 / 0.8 s (rank 4 / 7: "子弹飞行距离+1")', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SOA]]) {
    const sk = skillOf(tier, elite, S2);
    const life = tokOf(CYCLE, tier, elite, 1, mod).skill.bb['attack@projectile_life_time'];
    assert.deepEqual([sk.bb.atk, sk.bb.base_attack_time, life], [elite ? 0.5 : 0.35, 0, elite ? 0.8 : 0.6]);
    const { h, u, ts, deck } = field({ tier, elite, mod, skill: 1, towers: [[CYCLE, 10, 5]] });
    const t = ts[0];
    h.spawn('enemy_dummy', { pos: [10, 4] });
    const reach = h.spawn('enemy_dummy', { pos: [10, 5 + 3.8] });   // 3.8 tiles ahead: past 0.6 s + 0.5, inside 0.8 s + 0.5
    deck.held = 0;
    const atk0 = u.s.atk, tatk0 = t.s.atk;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.equal(deck.held, 1, '+1 held');
    approx(u.s.atk, atk0 * (1 + sk.bb.atk), 'her ATK');
    approx(t.s.atk, tatk0 * (1 + sk.bb.atk), 'its ATK');
    const n0 = from(h, t).length;
    h.run(3.7);
    const hits = from(h, t).slice(n0);
    if (elite) {
      assert.ok(hits.length >= 3 && hits.length % 3 === 0, `three bullets per attack: ${hits.length}`);
      assert.ok(hits.every((c) => c.target === reach), 'they reach 3.8 tiles');
    } else assert.equal(hits.length, 0, 'rank 4: 0.6 s — 3.8 tiles is out of reach');
    done(h);
  }
});

test('S3 手牵手: +1 held; she and her summons ATK +80 % / +110 % for 30 s; before each damage of her attacks and of her summons on an enemy: 停顿 2 s and 法术脆弱 10 % / 20 % 2 s', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, SOB]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u, ts, deck } = field({ tier, elite, mod, skill: 2, towers: [[CENTRE, 11, 5]] });
    const t = ts[0];
    assert.deepEqual([sk.bb.atk, sk.bb.sluggish, sk.bb['weak[magic][limit]'], sk.bb.damage_scale, sk.duration], [elite ? 1.1 : 0.8, 2, 2, elite ? 1.2 : 1.1, 30]);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.run(3);
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.status === 'artsFragile').length, 0, 'nothing before it');
    deck.held = 0;
    const atk0 = u.s.atk, tatk0 = t.s.atk;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
    assert.equal(deck.held, 1, '+1 held');
    approx(u.s.atk, atk0 * (1 + sk.bb.atk), 'her ATK');
    approx(t.s.atk, tatk0 * (1 + sk.bb.atk), 'its ATK');
    h.run(3);
    const st = h.hooksOf('statusApplied').filter((c) => c.target === e);
    assert.ok(st.some((c) => c.status === 'sluggish' && c.source === u) && st.some((c) => c.status === 'sluggish' && c.source === t), '停顿 from both');
    const frag = st.filter((c) => c.status === 'artsFragile');
    assert.ok(frag.length && frag.every((c) => Math.abs(c.value - (sk.bb.damage_scale - 1)) < 1e-9 && Math.abs(c.duration - 2) < 1e-9), '法术脆弱');
    // before the damage: a hit of hers right after it is ×(1 + fragile)
    const hit = from(h, u).filter((c) => c.dmg.isAttack).at(-1);
    approx(hit.amount, u.s.atk * (1 + sk.bb.damage_scale - 1), 'her hit carries it (RES 0)');
    done(h);
  }
});

test('桑特拉 协同攻击: when one attacks, another of the field with no target of its own, its attack ready and the first inside its range shoots a link that strikes the first one\'s target (100 % of ITS ATK, arts), then asks the others; not one with a target, nor one out of range', () => {
  // a sees e; b has a in its range; c has b (not a) in its range — it answers b's request in turn; d sees none of them
  const { h, ts } = field({ tier: 6, elite: true, skill: 2, towers: [[CENTRE, 10, 5], [CENTRE, 11, 5], [CENTRE, 12, 3], [CENTRE, 12, 9]] });
  const [a, b, c, d] = ts;
  const e = h.spawn('enemy_dummy', { pos: [10, 8] });   // a's range only
  h.run(4);
  const links = h.hooksOf('damaged').filter((x) => x.dmg?.tags?.includes('radian:link'));
  assert.ok(links.length >= 4, `links: ${links.length}`);
  assert.ok(links.every((x) => x.target === e), 'the first one\'s target');
  assert.ok(links.some((x) => x.source === b), 'b (a inside its range) answers');
  assert.ok(links.some((x) => x.source === c), 'c answers b\'s request (the chain)');
  for (const x of links) assert.deepEqual([x.type, x.dmg.isAttack, Math.abs(x.amount - x.source.s.atk) < 1e-6], ['arts', true, true], 'its own ATK, arts');
  assert.ok(!links.some((x) => x.source === d), 'd (none of them in its range) does not');
  const nb = links.filter((x) => x.source === b).length, na = h.hooksOf('attack').filter((x) => x.attacker === a).length;
  assert.ok(nb <= na && nb >= na - 1, `at most one link per attack of a (b answers when its own attack is ready): ${nb} / ${na}`);
  // b with a target of its own attacks that one instead
  const mine = h.spawn('enemy_dummy', { pos: [12, 6] });
  const n0 = links.length;
  h.run(4);
  const after = h.hooksOf('damaged').filter((x) => x.dmg?.tags?.includes('radian:link')).slice(n0);
  assert.ok(!after.some((x) => x.source === b), 'b busy with its own target');
  assert.ok(from(h, b).some((x) => x.target === mine && !x.dmg.tags?.includes('radian:link')), 'b attacks it');
  done(h);
});

test('modules SO-A / SO-B: only their attributes act — the 集成战略 parts the record carries (SO-A\'s respawn_time / sp, SO-B\'s attack@max_target and the x-5 recall) change nothing: same deck, one target, the summons\' redeploy time and no SP when one leaves', () => {
  for (const mod of [SOA, SOB]) {
    const { h, u, ts, deck } = field({ tier: 6, elite: true, mod, skill: 0, towers: [[DIVE, 10, 4]] });
    const t = ts[0];
    assert.ok(u.def.raw.talents.some((x) => x.index === -1), `${mod}: the record carries its hidden 集成战略 talent`);
    assert.deepEqual([deck.charge, deck.cap, deck.maxDeployed, u.profile.maxTargets, u.s.maxTargets], [5, 5, 3, 1, 0], `${mod}: nothing`);
    assert.ok(t.alive, `${mod}: the summon beside her stays (no x-5 recall)`);
    const sp0 = u.skill.sp;
    h.b.kill(t, null);
    assert.equal(u.skill.sp, sp0, `${mod}: no SP`);
    h.run(19.5);
    assert.equal(t.alive, false, `${mod}: its full redeploy time (20 s)`);
    assert.ok(h.runUntil(() => t.alive, 1), `${mod}: back after 20 s`);
    done(h);
  }
});
