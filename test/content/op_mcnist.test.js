// test/content/op_mcnist.test.js — the 自选 operator kit of 机械师 (char_4230_mcnist, 6★ 哨戒铁卫; kit
// server/sim/content/kits/ops/op-mcnist.js) and her summon 结构性原理 (token_10069_mcnist_mcgraf), fielded the production way
// (a DIY slot + its `diy` pick; the summon as a token piece of hers) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank
// 4, no module) and elite (E2 Lv60, rank 7) with no module or SO-A 机械师特勤证章 at stage 1 (tier 5) / 3 (tier 6). Every
// number is read back from data/backups.json (the form of that slot status, the token's variant); the fidelity checklist
// of kits/README.md item by item.
// Run: node --test test/content/op_mcnist.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const MCN = 'char_4230_mcnist';
const GRAF = 'token_10069_mcnist_mcgraf';
const FORMS = BACKUPS.units[MCN].forms;
const TOKEN = BACKUPS.tokens[GRAF];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const SOA = 'uniequip_002_mcnist';
const S1 = 'skchr_mcnist_1', S2 = 'skchr_mcnist_2', S3 = 'skchr_mcnist_3';
const statusKey = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusKey(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const variantOf = (tier, elite) => TOKEN.variants[`${MCN}@${statusKey(tier, elite)}`];
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_brute: dummy('enemy_brute', { atk: 2000, range: 3, bat: 1 }), enemy_poke: dummy('enemy_poke', { atk: 1, range: 3, bat: 0.5 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, SOA].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const K = (r, c) => r * 21 + c;
const sortN = (a) => [...a].sort((x, y) => x - y);

/** A battle with 机械师 as uid 1 at (10, 3) facing RIGHT (`graf`: her 结构性原理 as uid 2 at graf.row / col), plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, graf = { row: 10, col: 4 }, others = [], seed = 5, dp = 99 } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: MCN, skillIndex: skill, uniEquipId: mod }, elite, row: 10, col: 3 }];
  if (graf) units.push({ uid: 2, kind: 'token', tokenId: GRAF, ownerUid: 1, row: graf.row, col: graf.col, dir: graf.dir });
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: dp, dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'ammoUsed'], captureNoisy: true,
    units: [...units, ...others],
  });
  h.step();
  return { h, u: h.unit(1), t: graf ? h.unit(2) : null };
}
const barrier = (x, key) => x.findBuff(key);
const tagged = (h, u, tag) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes(tag));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('机械师 in every 自选 form: her operator kit (all three skills authored), stats + SO-A attributes, 2-2, blocks 3, ranged physical, hits air, 罗德岛, no 特质; her 结构性原理: the form\'s token stats, 禁疗, blocks 3, melee ground-only physical', () => {
  assert.equal(OPERATOR_KITS[MCN], KITS[MCN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, t } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [MCN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp, form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [3, 'ranged', 'phys', true, 1.2], `${label(f)}: 哨戒铁卫`);
      assert.deepEqual(sortN(u.rangeKeys), sortN([K(10, 3), K(10, 4), K(10, 5)]), `${label(f)}: 2-2`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.tokens], [BACKUPS.diy.operators[MCN].bonds, [], [GRAF]], `${label(f)}: bonds / 特质 / summon`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const ts = variantOf(tier, elite).stats;
      assert.deepEqual([t.base.maxHp, t.base.atk, t.base.def, t.s.blockCnt, t.base.bat, t.base.cost, t.base.respawnTime], [ts.maxHp, ts.atk, ts.def, 3, 1.5, 10, 40], `${label(f)}: 结构性原理 stats`);
      assert.deepEqual([t.s.flags.noHeal, t.profile.attack, t.profile.dmgType, t.profile.canHitFly, t.profile.noAttack], [true, 'melee', 'phys', false, false], `${label(f)}: 禁疗, melee ground-only`);
      done(h);
    }
  }
  // E2 Lv1 2614 / 425 / 542, E2 Lv60 3288 / 483 / 669 (full potential: DEF +28); SO-A +60 / +40 → +100 / +80 ATK / DEF; the token
  // 2800 / 492 / 451 → 3264 / 564 / 517
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.def], [2614, 425, 3288, 669]);
  assert.deepEqual([modOf(5, SOA).attr, modOf(6, SOA).attr], [{ atk: 60, def: 40 }, { atk: 100, def: 80 }]);
  assert.deepEqual([variantOf(5, false).stats.maxHp, variantOf(6, true).stats.maxHp], [2800, 3264]);
});

test('a 自选 pick: 机械师 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(MCN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(MCN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: MCN, skillIndex: 2, uniEquipId: null } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: MCN, skillIndex: 2, uniEquipId: null } } });
});

test('T1 结构性原理: it lasts 30 s from each deployment (SO-A stage 3 too — its 无限 is 集成战略-only), comes back on its tile 40 s after it left paying 10 DP — only while she stands; it falls with her and her redeployment readies it at once', () => {
  for (const f of [[5, false, null], [6, true, SOA], [5, true, SOA]]) {
    const [tier, elite, mod] = f;
    const { h, u, t } = field({ tier, elite, mod, skill: 0 });
    assert.equal(variantOf(tier, elite).talents.find((x) => x.bb['skill@duration'] != null).bb['skill@duration'], 30);
    h.run(29.4);
    assert.ok(t.alive, `${label(f)}: on the field before 30 s`);
    h.run(0.7);
    assert.ok(!t.alive && !t.removed, `${label(f)}: gone at 30 s (the piece stays)`);
    const dp0 = h.b.players[0].dp;
    h.run(39.4);
    assert.ok(!t.alive, `${label(f)}: not before 40 s`);
    h.run(0.7);
    assert.ok(t.alive, `${label(f)}: back after 40 s`);
    assert.deepEqual([t.tileR, t.tileC], [10, 4], label(f));
    approx(h.b.players[0].dp, dp0 - 10, `${label(f)}: 10 DP`);
    h.b.kill(u, null);
    h.step();
    assert.ok(!t.alive && !t.removed, `${label(f)}: falls with her`);
    h.run(45);
    assert.ok(!t.alive, `${label(f)}: none while she is down`);
    assert.ok(h.runUntil(() => u.alive, 60), `${label(f)}: she redeploys`);
    assert.ok(h.runUntil(() => t.alive, 0.2), `${label(f)}: with it at once (charge_token[born])`);
    done(h);
  }
});

test('T2 生命方程: she and her 结构性原理 get a 屏障 of 40 % max HP at each deployment; it takes physical and arts damage, not true; 超额防护: the hit that breaks it is cancelled whole, the next one hurts', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const { h, u, t } = field({ tier, elite, mod, skill: 0 });
    const hr = formOf(tier, elite).talents.find((x) => x.index === 1).bb.hp_ratio;
    assert.equal(hr, 0.4);
    for (const x of [u, t]) {
      const b = barrier(x, 'mcnist:t2:barrier');
      approx(b.shield, x.s.maxHp * hr, `${label(f)}: ${x.kind} 屏障`);
      assert.deepEqual(b.shieldType, ['phys', 'arts'], label(f));
    }
    // true damage passes it; a physical hit bigger than it is cancelled whole; the next physical hit hurts
    const hp0 = u.hp, sh0 = barrier(u, 'mcnist:t2:barrier').shield;
    h.b.dealDamage(null, u, { amount: 100, type: 'true' });
    approx(u.hp, hp0 - 100, `${label(f)}: true damage reaches HP`);
    approx(barrier(u, 'mcnist:t2:barrier').shield, sh0, `${label(f)}: the 屏障 untouched`);
    h.b.dealDamage(null, u, { amount: 300, type: 'arts' });
    approx(barrier(u, 'mcnist:t2:barrier').shield, sh0 - 300, `${label(f)}: arts absorbed`);
    const hp1 = u.hp;
    const got = h.b.dealDamage(null, u, { amount: sh0 * 3, type: 'phys', canDodge: false });
    assert.equal(got, 0, `${label(f)}: the breaking hit is blocked whole`);
    assert.deepEqual([u.hp, barrier(u, 'mcnist:t2:barrier')], [hp1, null], `${label(f)}: HP untouched, 屏障 gone`);
    const got2 = h.b.dealDamage(null, u, { amount: 500, type: 'phys', canDodge: false });
    approx(got2, Math.max(500 - u.s.def, 25), `${label(f)}: the next hit hurts`);
    // redeployed: a new one
    h.b.kill(u, null);
    assert.ok(h.runUntil(() => u.alive, 80), label(f));
    approx(barrier(u, 'mcnist:t2:barrier').shield, u.s.maxHp * hr, `${label(f)}: a new 屏障`);
    done(h);
  }
});

test('S1 聚类分析 (AUTO, attack SP, data DEFAULT): 11 / 9 SP, 3 bullets, interval 1.2 + 1.3 s, each attack strikes 5 times every 0.2 s at 95 % / 110 % ATK physical every enemy within 1.1 of its landing point (air units too)', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.skillType, sk.spType, sk.spCost, sk.bb['attack@trigger_time'], sk.bb['attack@times'], sk.bb['attack@interval'], sk.bb['attack@projectile_range'], sk.bb['attack@atk_scale']],
      ['AUTO', 'INCREASE_WHEN_ATTACK', elite ? 9 : 11, 3, 5, 0.2, 1.1, elite ? 1.1 : 0.95], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, graf: null });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.spType], ['DEFAULT', 'ammo', 'attack'], label(f));
    const main = h.spawn('enemy_dummy', { pos: [10, 5] }), near = h.spawn('enemy_dummy', { pos: [11, 5] });
    const fly = h.spawn('enemy_fly', { pos: [9, 5] }), far = h.spawn('enemy_dummy', { pos: [12, 5] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${label(f)}: cast on her next attack`);
    approx(u.s.interval, 2.5, `${label(f)}: 1.2 + 1.3 s`);
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').slice(n0).some((c) => c.source === u && c.dmg?.isSkill), 3), label(f));
    h.run(1.2);
    const hits = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.dmg?.isSkill);
    const by = (e) => hits.filter((c) => c.target === e);
    assert.deepEqual([by(main).length, by(near).length, by(fly).length, by(far).length], [5, 5, 5, 0], `${label(f)}: 5 strikes on each within 1.1`);
    const atk = u.s.atk;
    for (const c of hits) approx(c.amount, atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale'] * 100} % ATK`);
    const times = by(main).map((c) => c.t);
    for (let i = 1; i < times.length; i++) approx(times[i] - times[i - 1], 0.2, `${label(f)}: 0.2 s apart`, 0.1);
    h.runUntil(() => !u.skill.active, 20);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, 3, `${label(f)}: 3 bullets`);
    done(h);
  }
});

test('S2 协防术式 (MANUAL, data DEFAULT — rawRule TAKE_DAMAGE): ATK +90 % / +120 %; she and her 结构性原理 get a 10 % 屏障; a break: 200 % ATK arts and 战栗 2 s around the holder (1.5), a bullet spent and a new 屏障; attacks spend none; the last bullet ends the skill and leaves its 屏障', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.trigger.rule, sk.trigger.rawRule, sk.bb.atk, sk.bb.hp_ratio, sk.bb.trigger_time, sk.bb.range_radius, sk.bb.atk_scale, sk.bb.not_combat],
      ['DEFAULT', 'TAKE_DAMAGE', elite ? 1.2 : 0.9, 0.1, elite ? 7 : 6, 1.5, 2, 2], label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 1 });
    // her T2 屏障 first spent, so the S2 one is what breaks
    h.b.removeBuff(u, 'mcnist:t2:barrier');
    const e0 = h.spawn('enemy_dummy', { pos: [10, 5] }), e1 = h.spawn('enemy_dummy', { pos: [11, 4] }), e2 = h.spawn('enemy_fly', { pos: [11, 3] }), out = h.spawn('enemy_dummy', { pos: [12, 5] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${label(f)}: cast as she is about to attack`);
    assert.equal(u.skill.rule, 'DEFAULT');
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    for (const x of [u, t]) approx(barrier(x, 'mcnist:s2:barrier').shield, x.s.maxHp * 0.1, `${label(f)}: ${x.kind} 10 % 屏障`);
    h.run(6);
    assert.equal(u.skill.ammoLeft, sk.bb.trigger_time, `${label(f)}: attacks spend no bullet`);
    // break hers
    const hp0 = u.hp;
    const got = h.b.dealDamage(null, u, { amount: u.s.maxHp, type: 'phys', canDodge: false });
    assert.deepEqual([got, u.hp], [0, hp0], `${label(f)}: the breaking hit blocked whole (超额防护)`);
    const burst = tagged(h, u, 'mcnist:shieldBurst');
    assert.deepEqual(sortN(burst.map((c) => c.target.id)), sortN([e1.id, e2.id]), `${label(f)}: within 1.5 of her, the flyer too`);
    for (const c of burst) { approx(c.amount, u.s.atk * 2, `${label(f)}: 200 % ATK`); assert.equal(c.type, 'arts'); }
    const tr = h.hooksOf('statusApplied').filter((c) => c.status === 'tremble' && c.source === u);
    assert.deepEqual(sortN(tr.map((c) => c.target.id)), sortN([e1.id, e2.id]), `${label(f)}: 战栗`);
    for (const c of tr) approx(c.duration, 2, `${label(f)}: 2 s`);
    assert.ok(!out.findBuff('tremble') && !e0.findBuff('tremble'), `${label(f)}: 2 tiles away: none`);
    assert.equal(u.skill.ammoLeft, sk.bb.trigger_time - 1, `${label(f)}: one bullet`);
    approx(barrier(u, 'mcnist:s2:barrier').shield, u.s.maxHp * 0.1, `${label(f)}: a new 屏障`);
    // spend the rest: the skill ends, the last 屏障 stays without its break effect
    for (let i = 0; i < 20 && u.skill.active; i++) h.b.dealDamage(null, i % 2 ? t : u, { amount: 1e5, type: 'phys', canDodge: false });
    assert.ok(!u.skill.active, `${label(f)}: ended with its bullets`);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, sk.bb.trigger_time, label(f));
    const last = barrier(u, 'mcnist:s2:barrier') ?? barrier(t, 'mcnist:s2:barrier');
    assert.ok(last && last.shield > 0, `${label(f)}: the last 屏障 stays`);
    const n = tagged(h, u, 'mcnist:shieldBurst').length;
    h.b.dealDamage(null, barrier(u, 'mcnist:s2:barrier') ? u : t, { amount: 1e5, type: 'phys', canDodge: false });
    assert.equal(tagged(h, u, 'mcnist:shieldBurst').length, n, `${label(f)}: no burst after the skill`);
    done(h);
  }
  // a 结构性原理 deployed during S2 gets one at once
  const { h, u, t } = field({ skill: 1 });
  h.spawn('enemy_dummy', { pos: [10, 5] });
  h.b.retreat(t, { reason: 'expired', permanent: true });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  t.mem.readyAt = h.b.time;
  assert.ok(h.runUntil(() => t.alive, 1));
  assert.ok(barrier(t, 'mcnist:s2:barrier'), 'a deployment during S2');
  done(h);
});

test('S3 工程学十字星 (MANUAL, data DEFAULT, 40 s): ATK +160 % / +220 %, interval 1.2 + 2.3 s; each attack lands a cross 0.8 s later: 220 % / 240 % ATK arts on every enemy of the x-6 around its target\'s tile (air units too); the enemies her 结构性原理 blocks are her targets', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.trigger.rule, sk.trigger.rawRule, sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb['attack@atk_scale'], sk.bbStr['attack@projectile_range']],
      ['DEFAULT', 'TAKE_DAMAGE', 40, elite ? 2.2 : 1.6, 2.3, elite ? 2.4 : 2.2, 'x-6'], label(f));
    // the 结构性原理 on (12, 3) facing LEFT: its charge stays in place (high ground at (12, 2)), far from the targets
    const { h, u } = field({ tier, elite, mod, skill: 2, graf: { row: 12, col: 3, dir: 'LEFT' } });
    const main = h.spawn('enemy_dummy', { pos: [10, 5] }), up2 = h.spawn('enemy_fly', { pos: [12, 5] });
    const side2 = h.spawn('enemy_dummy', { pos: [10, 7] }), diag = h.spawn('enemy_dummy', { pos: [11, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `${label(f)}: cast`);
    approx(u.skill.timeLeft, 40, label(f), 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.interval, 3.5, `${label(f)}: 1.2 + 2.3 s`);
    const atk = u.s.atk;
    assert.ok(h.runUntil(() => tagged(h, u, 'mcnist:cross').length > 0, 5), `${label(f)}: a cross lands`);
    const first = tagged(h, u, 'mcnist:cross');
    const t0 = first[0].t;
    const wave = first.filter((c) => Math.abs(c.t - t0) < 1e-6);
    assert.deepEqual(sortN(wave.map((c) => c.target.id)), sortN([main.id, up2.id, side2.id]), `${label(f)}: the x-6 around (10, 5)`);
    assert.ok(!wave.some((c) => c.target === diag), `${label(f)}: not the diagonal (11, 6)`);
    for (const c of wave) { approx(c.amount, atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale'] * 100} %`); assert.equal(c.type, 'arts'); }
    // 0.8 s after the throw (the attack that threw it made no damage of its own)
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && !c.dmg?.tags?.includes('mcnist:cross') && c.target.side === 'enemy' && c.dmg?.isAttack && c.t < t0).length, 0, label(f));
    done(h);
  }
  // her 结构性原理 on (9, 7), out of her range, blocks a walker: during S3 she attacks it (its charge lands in place)
  const { h, u, t } = field({ skill: 2, graf: { row: 9, col: 7, dir: 'RIGHT' } });
  const w = h.spawn('enemy_walk', { routeIndex: 0 });
  assert.ok(h.runUntil(() => t.blocking.includes(w), 30), 'the walker reaches it');
  assert.ok(!u.rangeKeySet.has(Math.round(w.y) * 21 + Math.round(w.x)), 'out of her range');
  h.run(2);
  assert.equal(h.hooksOf('damaged').filter((c) => c.source === u && c.target === w).length, 0, 'not her target without S3');
  u.skill.gainSp(999);
  u.skill.activate('test');
  assert.ok(h.runUntil(() => t.alive && t.blocking.includes(w), 1), 'its charge stops at once (the walker next to it) and it blocks again');
  assert.ok(h.runUntil(() => tagged(h, u, 'mcnist:cross').some((c) => c.target === w), 6), 'a cross on the blocked walker');
  done(h);
});

test('S3 charge: the 结构性原理 runs along its facing to the farthest free low tile before an enemy (0.2 s + the distance at 20 tiles / s), deals 300 % of her ATK physical within 1.5 of the stop tile and is deployed anew there (full HP, 生命方程 again); then a weaken aura of 1.5: 50 % − 2.5 % per second', () => {
  for (const f of [[5, false, null], [6, true, SOA]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    const w = variantOf(tier, elite).talents.find((x) => x.bb.atk_interval != null).bb;
    assert.deepEqual([sk.bb.atk_scale, sk.bb.projectile_range, w.atk, w.atk_interval, w.interval, w.range_radius], [3, 1.5, -0.5, 0.025, 1, 1.5], label(f));
    const { h, u, t } = field({ tier, elite, mod, skill: 2, graf: { row: 11, col: 3, dir: 'RIGHT' } });
    const wall = h.spawn('enemy_dummy', { pos: [11, 8] }), hit2 = h.spawn('enemy_fly', { pos: [12, 7] }), front = h.spawn('enemy_dummy', { pos: [10, 5] });
    t.hp = 100;
    u.skill.gainSp(999);
    const atk0 = u.s.atk;
    assert.ok(h.runUntil(() => u.skill.active, 3), `${label(f)}: cast (her own target in range)`);
    const cast = h.b.time;
    const atk = u.s.atk;
    assert.ok(atk > atk0, label(f));
    assert.ok(!t.alive, `${label(f)}: off the field while it charges`);
    // from (11, 3) to (11, 7): 4 tiles ⇒ 0.2 + 4 / 20 s
    assert.ok(h.runUntil(() => t.alive, 1), `${label(f)}: lands`);
    approx(h.b.time - cast, 0.2 + 4 / 20, `${label(f)}: flight time`, 0.1);
    assert.deepEqual([t.tileR, t.tileC], [11, 7], `${label(f)}: the farthest tile before the enemy`);
    approx(t.hp, t.s.maxHp, `${label(f)}: a new deployment (full HP)`);
    approx(barrier(t, 'mcnist:t2:barrier').shield, t.s.maxHp * 0.4, `${label(f)}: 生命方程 again`);
    const ch = tagged(h, u, 'mcnist:charge');
    assert.deepEqual(sortN(ch.map((c) => c.target.id)), sortN([wall.id, hit2.id]), `${label(f)}: within 1.5 of (11, 7), the flyer too`);
    for (const c of ch) { approx(c.amount, atk * 3, `${label(f)}: 300 % of her ATK`); assert.equal(c.type, 'phys'); }
    h.run(0.3);
    const wk = (e) => h.hooksOf('statusApplied').filter((c) => c.status === 'weaken' && c.target === e);
    approx(wk(wall).at(-1).value, 0.5, `${label(f)}: 50 % at first`);
    assert.equal(wk(front).length, 0, `${label(f)}: out of the aura`);
    h.run(4);
    approx(wk(wall).at(-1).value, 0.5 - 0.025 * 4, `${label(f)}: −2.5 % per second`, 1e-6);
    h.run(17);
    const n = wk(wall).length;
    h.run(1);
    assert.equal(wk(wall).length, n, `${label(f)}: gone at 0 (20 s)`);
    done(h);
  }
  // no 结构性原理 at the cast: its next deployment during the skill charges
  const { h, u, t } = field({ skill: 2, graf: { row: 11, col: 3, dir: 'RIGHT' } });
  h.spawn('enemy_dummy', { pos: [10, 5] });
  h.b.retreat(t, { reason: 'expired', permanent: true });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  t.mem.readyAt = h.b.time;
  assert.ok(h.runUntil(() => t.alive && t.tileC !== 3, 2), 'charged after its deployment');
  done(h);
});

test('SO-A 机械师特勤证章: only its attributes act (stages 1 and 3) — no 集成战略 ATK ×1.5 on blocked enemies, the 结构性原理 keeps its 30 s', () => {
  for (const [tier, mod] of [[5, SOA], [6, SOA], [6, null]]) {
    const { h, u, t } = field({ tier, elite: true, mod, skill: 0, graf: { row: 10, col: 4 } });
    const m = modOf(tier, mod);
    if (m) assert.match(m.traitOverride.moduleDesc, /沉沦者的黑流树海/);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    const n0 = h.hooksOf('damaged').length;
    h.run(3);
    const hits = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.target === e && c.dmg?.isAttack && !c.dmg?.isSkill);
    assert.ok(hits.length > 0, 'attacks');
    for (const c of hits) approx(c.amount, u.s.atk, `T${tier} ${mod}: plain ATK`);
    h.run(28);
    assert.ok(!t.alive, `T${tier} ${mod}: the 结构性原理 left at 30 s`);
    done(h);
  }
});
