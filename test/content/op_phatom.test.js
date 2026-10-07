// test/content/op_phatom.test.js — the 自选 operator kit of 傀影 (char_250_phatom, 6★ 处决者; kit
// server/sim/content/kits/ops/op-phatom.js) and of his summon 镜中虚影 (token_10007_phatom_twin), fielded the production way
// (a DIY slot + its `diy` pick, simdata getDiy; the twin as a placed token piece `{ kind: 'token', tokenId, ownerUid }`) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, EXE-X
// 克里斯汀小姐的毛毡, EXE-Y “如影随形” or ISW-A 傀影特限证章 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from
// data/backups.json (the form of that slot status, the token variant of that owner form); the fidelity checklist of
// kits/README.md item by item.
// Run: node --test test/content/op_phatom.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { TWIN } from '../../server/sim/content/kits/ops/op-phatom.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const PHATOM = 'char_250_phatom';
const FORMS = BACKUPS.units[PHATOM].forms;
const TOKEN = BACKUPS.tokens[TWIN];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const EX = 'uniequip_002_phatom', EY = 'uniequip_003_phatom', IS = 'uniequip_004_phatom';
const S1 = 'skchr_phatom_1', S2 = 'skchr_phatom_2', S3 = 'skchr_phatom_3';
const TEXAS = 'chess_char_1_08_a';
const statusKey = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusKey(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The twin's variant of an owner form (+ its module part). */
const twinOf = (tier, elite, mod) => {
  const v = TOKEN.variants[`${PHATOM}@${statusKey(tier, elite)}`];
  const bm = elite && mod ? v.byModule?.[mod] : null;
  return { stats: bm?.stats ?? v.stats, talents: bm?.talents ?? v.talents, skillOf: (i) => (i === 0 ? v.skill : v.bySkill[i].skill) };
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_heavy: dummy('enemy_heavy', { mass: 9 }), enemy_evade: dummy('enemy_evade'),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, EX, EY, IS].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 傀影 as uid 1 at (row, col) facing RIGHT, his twin piece (uid 2) at `twinAt` unless null, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, twinAt = [12, 4], others = [], seed = 5, dp = 0 } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: PHATOM, skillIndex: skill, uniEquipId: mod }, elite, row, col }];
  if (twinAt) units.push({ uid: 2, kind: 'token', tokenId: TWIN, ownerUid: 1, row: twinAt[0], col: twinAt[1] });
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'statusApplied', 'death', 'deploy', 'dodge'], captureNoisy: true,
    units: [...units, ...others],
  });
  h.step();
  h.b.players[0].dp = dp;
  return { h, u: h.unit(1), t: twinAt ? h.unit(2) : null };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Knock `u` out and bring it straight back on its tile (free). */
function redeployNow(h, u) {
  h.b.kill(u, null);
  assert.ok(h.b.redeploy(u, { free: true }), `${u.name} redeployed`);
}

test('傀影 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 1-1, blocks 1, melee ground-only, 16 s redeploy, 维多利亚, no 特质; his placed 镜中虚影 deploys after him with the variant\'s stats, 禁疗 and its copy of his skill', () => {
  assert.equal(OPERATOR_KITS[PHATOM], KITS[PHATOM]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, t } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null, tw = twinOf(tier, elite, mod);
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, u.skill.kind, !!u.kit.generic, u.kit.skillSource], [PHATOM, SLOT[tier], form.skills[skill].skillId, 'passive', false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd, u.base.respawnTime, u.base.cost],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 100 + (m?.attr.aspd ?? 0), 16, 8], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly], [1, 'melee', 'phys', false], `${label(f)}: 处决者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      // the twin
      assert.deepEqual([t.defId, t.ownerUnit === u, t.alive, t.deployed, t.deploySeq > u.deploySeq, !!t.kit.generic], [TWIN, true, true, true, true, false], `${label(f)}: twin deployed after him`);
      assert.deepEqual([t.base.maxHp, t.base.atk, t.base.def, t.base.respawnTime, t.base.cost], [tw.stats.maxHp, tw.stats.atk, tw.stats.def, 45, 5], `${label(f)}: twin stats`);
      assert.deepEqual([t.def.skill.id, t.skill.kind], [tw.skillOf(skill).skillId, 'passive'], `${label(f)}: twin skill copy`);
      assert.deepEqual([t.s.blockCnt, t.profile.attack, t.profile.canHitFly, t.liveRangeGrid], [1, 'melee', false, [[0, 0], [0, 1]]], `${label(f)}: twin executor`);
      assert.ok(t.s.flags.noHeal, `${label(f)}: twin 持有禁疗`);
      done(h);
    }
  }
  // the numbers (zh_CN): 傀影 E2 Lv1 1413 / 457 / 270, E2 Lv60 1653 / 539 / 304; the twin 1126 / 429 / 226 → 1318 / 508 / 254,
  // EXE-Y stage 3 "属性进一步增强" 1418 / 568 / 294; modules
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1413, 457, 1653, 539]);
  assert.deepEqual([twinOf(5, false).stats.maxHp, twinOf(5, true).stats.atk, twinOf(6, true, EY).stats.maxHp, twinOf(6, true, EY).stats.atk, twinOf(5, true, EY).stats.atk], [1126, 508, 1418, 568, 508]);
  assert.deepEqual([modOf(5, EX).attr, modOf(6, EX).attr, modOf(5, EY).attr, modOf(6, EY).attr, modOf(5, IS).attr, modOf(6, IS).attr],
    [{ maxHp: 100, atk: 50 }, { maxHp: 140, atk: 73 }, { atk: 40, def: 24 }, { atk: 75, def: 30 }, { atk: 37, aspd: 5 }, { atk: 71, aspd: 7 }]);
});

test('a 自选 pick: 傀影 is offered at tiers 5 and 6; a roster with EXE-X / EXE-Y passes validateDiyPicks, his 集成战略 module ISW-A is refused', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(PHATOM));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(PHATOM), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: PHATOM, skillIndex: 2, uniEquipId: EY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: PHATOM, skillIndex: 2, uniEquipId: EY } } });
  const bad = validateDiyPicks({ [SLOT[5]]: { charId: PHATOM, skillIndex: 0, uniEquipId: IS } }, { data, kitted: KITTED_CHARS });
  assert.equal(bad.error, 'BAD_TARGET');
  assert.match(bad.detail, /集成战略/);
});

test('S1 暗夜魅影 (被动): at each deployment 30 % / 40 % physical dodge and a 屏障 of 35 % / 50 % max HP that absorbs physical damage only, both 10 s; the twin\'s copy on itself', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EY]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.skillType, sk.spType, sk.bb.prob, sk.bb.hp_ratio, sk.bb.duration], ['PASSIVE', 'ON_DEPLOY', elite ? 0.4 : 0.3, elite ? 0.5 : 0.35, 10]);
    const { h, u, t } = field({ tier, elite, mod, skill: 0 });
    for (const x of [u, t]) {
      const b = x === u ? sk.bb : twinOf(tier, elite, mod).skillOf(0).bb;
      approx(x.s.dodgePhys, b.prob, `${x.name}: physical dodge`);
      assert.equal(x.s.dodgeArts, 0, `${x.name}: no arts dodge`);
      const sh = x.buffs.find((y) => y.shield > 0);
      approx(sh.shield, x.s.maxHp * b.hp_ratio, `${x.name}: ${b.hp_ratio * 100} % max HP`);
      assert.equal(sh.shieldType, 'phys', `${x.name}: physical only`);
    }
    // arts damage passes the barrier, physical damage is absorbed
    const hp0 = u.hp;
    h.b.dealDamage(null, u, { amount: 100, type: 'arts', canDodge: false });
    approx(u.hp, hp0 - 100, 'arts passes');
    h.b.dealDamage(null, u, { amount: 100, type: 'phys', canDodge: false });
    approx(u.hp, hp0 - 100, 'physical absorbed');
    h.run(10.2);
    assert.ok(u.s.dodgePhys === 0 && !u.buffs.some((y) => y.shield > 0), 'gone after 10 s');
    redeployNow(h, u);
    approx(u.s.dodgePhys, sk.bb.prob, 'again at a redeployment');
    done(h);
  }
});

test('S2 血色乐章 (被动): at each deployment 8 / 9 stacks of ATK +13 % / +16 %; each damage instance he deals uses one (a dodged attack none); the twin\'s copy has its own', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EX]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.bb.times, sk.bb.atk], [elite ? 9 : 8, elite ? 0.16 : 0.13]);
    const { h, u, t } = field({ tier, elite, mod, skill: 1 });
    assert.equal(u.findBuff('phatom:skill').stacks, sk.bb.times);
    assert.equal(t.findBuff('phatom:twin:skill').stacks, sk.bb.times, 'the twin\'s own stacks');
    approx(u.s.atk, u.base.atk * (1 + sk.bb.times * sk.bb.atk + (u.findBuff('trait:phatom:lonely') ? 0.1 : 0)), 'ATK');
    // an enemy that dodges everything: no stack used
    const ev = h.spawn('enemy_evade', { pos: [10, 5] });
    h.b.addBuff(ev, { key: 'test:dodge', mods: { dodgePhys: 1 } });
    h.run(3);
    assert.ok(h.hooksOf('dodge').some((c) => c.source === u), 'dodged attacks');
    assert.equal(u.findBuff('phatom:skill').stacks, sk.bb.times, 'none used');
    h.b.removeBuff(ev, 'test:dodge');
    const fullAtk = u.s.atk;
    const n0 = h.hooksOf('damaged').filter((c) => c.source === u).length;
    h.run(0.95);
    const hits = h.hooksOf('damaged').filter((c) => c.source === u).slice(n0);
    assert.ok(hits.length >= 1, 'hits');
    assert.equal(u.findBuff('phatom:skill').stacks, sk.bb.times - hits.length, 'one per damage instance');
    approx(hits[0].amount, fullAtk, 'the first hit at full stacks (a 0-DEF target)');
    approx(u.s.atk, fullAtk - u.base.atk * sk.bb.atk * hits.length, 'ATK −atk per stack used');
    h.run(30);
    assert.equal(u.findBuff('phatom:skill'), null, 'all used');
    done(h);
  }
});

test('S3 夜幕突袭 (被动): at each deployment 210 % / 240 % ATK physical to every ground enemy of the x-4, a radial 小力 push and ONE status for all — 停顿 / 晕眩 / 束缚 2.5 / 3 s (each drawn over the casts); flyers and enemies outside untouched; the twin\'s copy at its deployment', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EY]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.rangeId, sk.bb.atk_scale, sk.bb.force, sk.bb.sluggish, sk.bb.root, sk.bb.stun], ['x-4', elite ? 2.4 : 2.1, 0, elite ? 3 : 2.5, elite ? 3 : 2.5, elite ? 3 : 2.5]);
    const drawn = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { h, u, t } = field({ tier, elite, mod, skill: 2, seed, twinAt: [11, 6] });
      const ahead = h.spawn('enemy_dummy', { pos: [10, 5] }), diag = h.spawn('enemy_dummy', { pos: [9, 3] });
      const heavy = h.spawn('enemy_heavy', { pos: [11, 4] });
      const fly = h.spawn('enemy_fly', { pos: [9, 4] }), far = h.spawn('enemy_dummy', { pos: [10, 6] });
      h.step();   // the enemy tile index
      const n0 = h.hooksOf('damaged').length, s0 = h.hooksOf('statusApplied').length;
      redeployNow(h, u);
      const hits = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.dmg?.tags?.includes('phatom:raid'));
      assert.deepEqual(hits.map((c) => c.target).sort((a, b) => a.id - b.id), [ahead, diag, heavy].sort((a, b) => a.id - b.id), `seed ${seed}: the ground enemies of his x-4`);
      for (const c of hits) {
        approx(c.amount, u.s.atk * sk.bb.atk_scale, `seed ${seed}: ${sk.bb.atk_scale * 100} % ATK`);
        assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true]);
      }
      assert.ok(!hits.some((c) => c.target === fly || c.target === far), 'flyer / outside untouched');
      assert.ok(ahead.x > 5.5, `seed ${seed}: pushed away (radial, 小力)`);
      approx(heavy.y, 11, `seed ${seed}: 重量 9 — 小力 moves nothing`);
      const st = h.hooksOf('statusApplied').slice(s0).filter((c) => c.source === u);
      assert.equal(new Set(st.map((c) => c.status)).size, 1, `seed ${seed}: one status for the cast`);
      assert.equal(st.length, 3, `seed ${seed}: on each of the three`);
      for (const c of st) approx(c.duration, sk.bb[c.status === 'bind' ? 'root' : c.status], `seed ${seed}: ${c.status}`);
      drawn.add(st[0].status);
      // the twin's copy at its own deployment
      const tn0 = h.hooksOf('damaged').length;
      redeployNow(h, t);
      const th = h.hooksOf('damaged').slice(tn0).filter((c) => c.source === t && c.dmg?.tags?.includes('phatom:raid'));
      assert.ok(th.length >= 1 && th.every((c) => Math.abs(c.amount - t.s.atk * twinOf(tier, elite, mod).skillOf(2).bb.atk_scale) < 1e-6), `seed ${seed}: the twin's burst`);
      done(h);
    }
    assert.deepEqual([...drawn].sort(), ['bind', 'sluggish', 'stun'], 'all three statuses over the casts');
  }
});

test('T1 镜中虚影 / T2 虚影精通: the twin (禁疗: no heal reaches it) is withdrawn when he leaves the field and comes back on its tile 35 s (45 − 10; EXE-X stage 3: 45 − 16) after its LAST deployment, paying 5 DP, only while he stands', () => {
  for (const f of [[5, false, null], [5, true, EX], [6, true, EX]]) {
    const [tier, elite, mod] = f;
    const cut = twinOf(tier, elite, mod).talents.find((x) => x.bb.respawn_time != null).bb.respawn_time;
    assert.equal(cut, tier === 6 && mod === EX ? -16 : -10, label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 1, dp: 50 });
    const wait = 45 + cut;
    // 禁疗: an ally heal does not reach it
    t.hp = 100;
    h.b.heal(u, t, 500);
    assert.equal(t.hp, 100, `${label(f)}: 禁疗`);
    // knocked out while he stands: back `wait` s after its deployment at 0 s, 5 DP paid
    h.run(5);
    h.b.kill(t, null);
    assert.ok(!t.alive && !t.removed, `${label(f)}: the piece stays`);
    h.run(wait - 5 - 1);
    assert.ok(!t.alive, `${label(f)}: not before ${wait} s`);
    assert.ok(h.runUntil(() => t.alive, 1.5), `${label(f)}: back at ${wait} s`);
    assert.deepEqual([t.tileR, t.tileC, h.b.players[0].dp], [12, 4, 45], `${label(f)}: its tile, 5 DP`);
    const at = h.b.time;
    // he is knocked out: the twin is withdrawn with him (强制撤退 — KillTokens) and waits for him
    h.b.kill(u, null);
    u.respawnAt = Infinity;   // he stays down until the test brings him back
    assert.ok(!t.alive, `${label(f)}: withdrawn with him`);
    assert.equal(h.hooksOf('death').filter((c) => c.unit === t).slice(-1)[0].reason, 'retreat', `${label(f)}: a withdrawal, not a knock-out`);
    h.run(wait + 1);
    assert.ok(!t.alive && !u.alive, `${label(f)}: no return while he is down`);
    assert.ok(h.b.redeploy(u, { free: true }));
    assert.ok(h.runUntil(() => t.alive, 0.5), `${label(f)}: back with him once its own timer (from ${at.toFixed(1)} s) has run`);
    // no DP: it waits
    h.b.kill(t, null);
    h.b.players[0].dp = 0;
    h.run(wait + 1);
    assert.ok(!t.alive, `${label(f)}: no DP, no return`);
    h.b.players[0].dp = 5;
    assert.ok(h.runUntil(() => t.alive, 0.5), `${label(f)}: back with the DP`);
    done(h);
  }
});

test('EXE-X / ISW-A: EXE-X\'s refund has no effect (no retreat in battle) — only its attributes and T2 at stage 3; ISW-A acts by its attributes only (集成战略-only trait and talent)', () => {
  {
    const { h, u } = field({ tier: 6, elite: true, mod: EX, skill: 0, dp: 7 });
    assert.deepEqual(u.def.traitBb, { withdraw_cost_recover_ratio: 0.8 });
    h.b.retreat(u);
    h.step();
    assert.equal(h.b.players[0].dp, 7, 'no refund');
    done(h);
  }
  {
    const { h, u, t } = field({ tier: 6, elite: true, mod: IS, skill: 1, dp: 50 });
    assert.match(modOf(6, IS).traitOverride.moduleDesc, /^在集成战略中/);
    assert.ok(modOf(6, IS).talentChanges.filter((x) => x.desc).every((x) => /在集成战略中/.test(x.desc)));
    assert.equal(u.findBuff('module:phatom:both'), null, 'no ATK while both stand');
    h.spawn('enemy_dummy', { pos: [10, 5] });
    h.run(5);
    h.b.kill(t, null);
    assert.ok(!h.runUntil(() => t.alive, 29), 'its attacks shorten no redeploy time');
    done(h);
  }
});

test('EXE-Y “如影随形”: ATK +10 % while no allied operator stands on the 4 tiles beside him (the twin does not count); stage 3: ATK +10 % on him and the twin while both are on the field', () => {
  for (const f of [[5, true, EY], [6, true, EY], [6, true, null]]) {
    const [tier, elite, mod] = f;
    const ey = mod === EY, y3 = ey && tier === 6;
    const { h, u, t } = field({ tier, elite, mod, skill: 0, twinAt: [10, 5], others: [{ uid: 3, chessId: TEXAS, row: 12, col: 7 }] });
    const texas = h.unit(3);
    assert.equal(!!u.findBuff('trait:phatom:lonely'), ey, `${label(f)}: the twin beside him does not count`);
    if (ey) assert.deepEqual(u.findBuff('trait:phatom:lonely').mods, { atkPct: 0.1 });
    assert.equal(!!u.findBuff('module:phatom:both'), y3, `${label(f)}: both on the field`);
    assert.equal(!!t.findBuff('module:phatom:both'), y3, `${label(f)}: the twin too`);
    if (y3) assert.match(FORMS['2/60/7/3'].modules.find((m) => m.uniEquipId === EY).talentChanges[0].desc, /本体和虚影同时在场时，攻击力各\+10%/);
    // an operator beside him
    assert.ok(h.b.relocate(texas, 11, 4), 'moved beside him');
    h.step();
    assert.equal(u.findBuff('trait:phatom:lonely'), null, `${label(f)}: an operator beside`);
    // the twin down: the shared ATK goes
    h.b.kill(t, null);
    h.step();
    assert.equal(u.findBuff('module:phatom:both'), null, `${label(f)}: twin down`);
    done(h);
  }
});
