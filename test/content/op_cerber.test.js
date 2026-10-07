// test/content/op_cerber.test.js — the 自选 operator kit of 刻俄柏 (char_2013_cerber, 6★ 中坚术师; kit
// server/sim/content/kits/ops/op-cerber.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, CCR-X
// “很干的面包” or CCR-Y “我打的刀” at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the
// form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_cerber.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_2013_cerber';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const CCRX = 'uniequip_002_cerber', CCRY = 'uniequip_003_cerber';
const S1 = 'skchr_cerber_1', S2 = 'skchr_cerber_2', S3 = 'skchr_cerber_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_d100: dummy('enemy_d100', { def: 100 }), enemy_d200: dummy('enemy_d200', { def: 200 }), enemy_d300: dummy('enemy_d300', { def: 300 }),
  enemy_d400: dummy('enemy_d400', { def: 400 }), enemy_r50: dummy('enemy_r50', { res: 50 }),
  enemy_elite: dummy('enemy_elite', { rank: 'ELITE' }), enemy_boss: dummy('enemy_boss', { rank: 'BOSS' }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, CCRX, CCRY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const SHELL = 'cerber:shell';
const shellOf = (c) => !!c.dmg?.tags?.includes(SHELL);

/** A battle with 刻俄柏 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 2, row = 10, col = 5, others = [], seed = 5, setup = null } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'spGain'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
    setup,
  });
  h.step();
  return { h, u: h.unit(1) };
}
const hitsBy = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u);
const atkHits = (h, u) => hitsBy(h, u).filter((c) => c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const arts = (amount, res, ignore = 0) => Math.max(amount * (1 - Math.max(0, res - ignore) / 100), amount * 0.05);

test('刻俄柏 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 3-1 range, ranged arts that hits air, block 1, 1.6 s, 空 bonds, no 特质', () => {
  assert.equal(OPERATOR_KITS[ID], KITS[ID]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 20], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.groundOnly, u.base.bat], [1, 'ranged', 'arts', true, false, 1.6], `${label(f)}: 中坚术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.raw.tokens], [['emptyShip'], [], []], `${label(f)}: bonds / 特质 / no summon`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  // E2 Lv1 1220 / 580 / 114, E2 Lv60 1449 / 656 / 123; CCR-X +130 / +40 → +180 / +65, CCR-Y +80 / +40 / +17 → +120 / +56 / +23
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1220, 580, 1449, 656]);
  assert.deepEqual([modOf(5, CCRX).attr, modOf(6, CCRX).attr, modOf(5, CCRY).attr, modOf(6, CCRY).attr], [{ maxHp: 130, atk: 40 }, { maxHp: 180, atk: 65 }, { maxHp: 80, atk: 40, def: 17 }, { maxHp: 120, atk: 56, def: 23 }]);
});

test('a 自选 pick: 刻俄柏 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(ID));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: ID, skillIndex: 0, uniEquipId: CCRX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: ID, skillIndex: 0, uniEquipId: CCRX } } });
});

test('S1 “很冰的斧” (AUTO, 1 / 2 charges, data DEFAULT): the next attack at 165 % / 180 % ATK arts on an unblocked enemy rather than a blocked one, binding it 2 / 2.5 s', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    // 角峰 blocks the dummy spawned on its tile; the other dummy is free (both in her range; the blocked one is nearer its goal)
    const { h, u } = field({ tier, elite, skill: 0, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 7 }] });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.maxCharges, sk.spCost, sk.bb.atk_scale, sk.bb.duration], ['DEFAULT', elite ? 'charges' : 'instant', elite ? 2 : 1, 7, elite ? 1.8 : 1.65, elite ? 2.5 : 2], `T${tier}`);
    u.skill.charges = 0;
    u.skill.sp = 0;
    const blocked = h.spawn('enemy_dummy', { pos: [10, 7] });
    const free = h.spawn('enemy_dummy', { pos: [11, 7] });
    h.run(0.2);
    assert.equal(blocked.blockedBy, h.unit(2), `T${tier}: 角峰 blocks it`);
    const n0 = atkHits(h, u).length;
    h.run(1.7);
    const plain = atkHits(h, u).slice(n0);
    assert.ok(plain.length >= 1 && plain.every((c) => c.target === blocked && !c.dmg.isSkill), `T${tier}: her plain attacks go to the blocked one`);
    u.skill.gainSp(999);
    const n1 = atkHits(h, u).length;
    assert.ok(h.runUntil(() => atkHits(h, u).slice(n1).some((c) => c.dmg.isSkill), 3), `T${tier}: cast`);
    const sh = atkHits(h, u).slice(n1).find((c) => c.dmg.isSkill);
    assert.equal(sh.target, free, `T${tier}: "优先攻击没有被阻挡的目标"`);
    approx(sh.amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
    assert.equal(sh.type, 'arts');
    const bind = h.hooksOf('statusApplied').find((c) => c.source === u && c.status === 'bind');
    assert.ok(bind && bind.target === free, `T${tier}: bound`);
    approx(bind.duration, sk.bb.duration, `T${tier}: 束缚 ${sk.bb.duration} s`);
    done(h);
  }
});

test('S2 “很热的刀” (MANUAL, data DEFAULT): 33 / 36 s, attack interval × 0.6 / × 0.4 (PRTS "(*0.4)"), the highest-DEF enemy first; all back after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.base_attack_time, sk.spCost, sk.initSp], ['DEFAULT', elite ? 36 : 33, elite ? 0.4 : 0.6, elite ? 44 : 47, elite ? 16 : 13], `T${tier}`);
    h.run(0.6);
    const iv0 = u.s.interval;
    const d1 = h.spawn('enemy_d100', { pos: [10, 6] }), d3 = h.spawn('enemy_d300', { pos: [11, 7] }), d2 = h.spawn('enemy_d200', { pos: [9, 6] });
    void d1; void d2;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    approx(u.skill.timeLeft, sk.duration, `T${tier}: ${sk.duration} s`, 0.05);
    approx(u.s.interval, iv0 * sk.bb.base_attack_time, `T${tier}: interval × ${sk.bb.base_attack_time}`);
    const n0 = atkHits(h, u).length;
    h.run(5);
    const hits = atkHits(h, u).slice(n0);
    assert.ok(hits.length >= Math.floor(5 / u.s.interval) - 1, `T${tier}: ${hits.length} attacks`);
    assert.ok(hits.every((c) => c.target === d3), `T${tier}: the DEF 300 enemy`);
    assert.ok(h.runUntil(() => !u.skill.active, sk.duration));
    approx(u.s.interval, iv0, `T${tier}: interval back`);
    done(h);
  }
});

test('S3 “很重的枪” (MANUAL, data ACTIVE_RANGE on 3-3): 56 / 57 s, range 3-3 while on, ATK +130 % / +160 %, physical, the lowest-DEF enemy first, each hit silences 2.5 / 3 s; arts and 3-1 again after', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, seed: 7 });
    assert.deepEqual([u.skill.rule, sk.trigger.rawRule, sk.rangeId, sk.duration, sk.bb.atk, sk.bb['attack@silence'], sk.initSp], ['ACTIVE_RANGE', 'DEFAULT', '3-3', elite ? 57 : 56, elite ? 1.6 : 1.3, elite ? 3 : 2.5, elite ? 47 : 41], `T${tier}`);
    assert.deepEqual(u.skill.triggerGrid, sk.rangeGrid, `T${tier}: the trigger grid is 3-3`);
    h.run(0.6);
    const atk0 = u.s.atk;
    u.skill.gainSp(999);
    // (9,8) / (11,8) are on 3-3, not on her 3-1: the cast comes with an enemy there
    const hi = h.spawn('enemy_d300', { pos: [9, 8] });
    const lo = h.spawn('enemy_d100', { pos: [11, 8] });
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: cast with enemies on 3-3 only`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 3-3 while on`);
    approx(u.s.atk, atk0 + u.base.atk * sk.bb.atk, `T${tier}: ATK`);
    const n0 = atkHits(h, u).length;
    h.run(5);
    const hits = atkHits(h, u).slice(n0);
    assert.ok(hits.length >= 2 && hits.every((c) => c.target === lo && c.type === 'phys'), `T${tier}: physical, on the lowest DEF`);
    approx(hits[0].amount, Math.max(u.s.atk - 100, u.s.atk * 0.05), `T${tier}: physical on DEF 100`);
    const sil = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'silence');
    assert.ok(sil.length >= hits.length && sil.every((c) => c.target === lo), `T${tier}: silenced on every hit`);
    approx(sil[0].duration, sk.bb['attack@silence'], `T${tier}: ${sk.bb['attack@silence']} s`);
    // 剥壳 stays arts: DEF 100 × 44 %
    const shells = hitsBy(h, u).slice(n0).filter(shellOf);
    assert.ok(shells.length >= hits.length - 1 && shells.every((c) => c.type === 'arts'), `T${tier}: 剥壳 arts`);
    u.skill.end('test');
    h.run(0.1);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 3-1`);
    void hi;
    done(h);
  }
});

test('T1 剥壳: each hit of her attacks adds DEF × 44 % arts (none on DEF 0); CCR-X stage 3: 54 % +5 % per hit on the same target up to 79 %, back to 54 % on another; stage 1 keeps 44 %', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const x3 = elite && tier === 6 && mod === CCRX;
    const t0 = u.def.raw.talents.find((t) => t.index === 0);
    assert.equal(t0.bb.atk_scale, x3 ? 0.54 : 0.44, `${label(f)}: the data`);
    u.skill.charges = 0;
    const a = h.spawn('enemy_d400', { pos: [10, 6] });
    const n0 = hitsBy(h, u).length;
    h.run(1.6 * 8 + 0.4);
    const shells = hitsBy(h, u).slice(n0).filter((c) => shellOf(c) && c.target === a);
    const plain = hitsBy(h, u).slice(n0).filter((c) => c.dmg.isAttack && c.target === a);
    assert.ok(plain.length >= 7 && shells.length === plain.length, `${label(f)}: one 剥壳 per hit (${shells.length} / ${plain.length})`);
    const want = x3 ? [0.54, 0.59, 0.64, 0.69, 0.74, 0.79, 0.79] : Array(7).fill(0.44);
    shells.slice(0, 7).forEach((c, i) => {
      approx(c.amount, 400 * want[i], `${label(f)}: hit ${i + 1}`);
      assert.deepEqual([c.type, !!c.dmg.isAttack], ['arts', false], `${label(f)}: a talent arts instance`);
    });
    // another target: back to the base ratio; a DEF-0 target takes no 剥壳
    h.b.kill(a, null);
    const b = h.spawn('enemy_d200', { pos: [10, 6] });
    const n1 = hitsBy(h, u).length;
    h.run(1.7);
    const sb = hitsBy(h, u).slice(n1).filter((c) => shellOf(c) && c.target === b);
    assert.ok(sb.length >= 1);
    approx(sb[0].amount, 200 * (x3 ? 0.54 : 0.44), `${label(f)}: a new target — the base ratio`);
    h.b.kill(b, null);
    const z = h.spawn('enemy_dummy', { pos: [10, 6] });
    const n2 = hitsBy(h, u).length;
    h.run(1.7);
    assert.ok(hitsBy(h, u).slice(n2).some((c) => c.target === z && c.dmg.isAttack), label(f));
    assert.ok(!hitsBy(h, u).slice(n2).some((c) => c.target === z && shellOf(c)), `${label(f)}: no 剥壳 on DEF 0`);
    done(h);
  }
});

test('T2 独行长路: ATK +8 % / ASPD +8 while nobody else is on her x-5 (a device too), off with a neighbour; an enemy-like ally does not switch it off but, seen while it is off, keeps it off until it leaves; CCR-Y stage 3: +15 % / +15 decided once per deployment', () => {
  const lone = (u) => u.findBuff('talent:cerber:lone');
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y3 = elite && tier === 6 && mod === CCRY;
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    h.step();
    const v = y3 ? { atkPct: 0.15, aspd: 15 } : { atkPct: 0.08, aspd: 8 };
    assert.deepEqual(lone(u)?.mods, v, `${label(f)}: alone`);
    const dev = h.b.spawnDevice('trap_1105_accrate', 10, 6, { name: 'test crate' });
    assert.ok(dev && dev.side === 'ally', label(f));
    h.step();
    assert.equal(!!lone(u), y3, `${label(f)}: a crate in front of her ${y3 ? '(the deployment decided)' : ''}`);
    h.b.kill(dev, null);
    h.step();
    assert.deepEqual(lone(u)?.mods, v, `${label(f)}: alone again`);
    if (!y3) {
      // an enemy-like ally (炎佑's kind: an ally built from an enemy record): stays on while on …
      const like = h.b.spawnDevice('trap_1105_accrate', 9, 5, { name: 'enemy-like' });
      like.defId = 'enemy_9012_acloon';
      h.step();
      assert.ok(lone(u), `${label(f)}: an enemy-like ally does not switch it off`);
      // … but seen while off (an ordinary neighbour came first) it keeps it off until it leaves the field
      const mate = h.b.spawnDevice('trap_1105_accrate', 11, 5, { name: 'mate' });
      h.step();
      assert.equal(lone(u), null, `${label(f)}: off with an ordinary neighbour`);
      h.b.kill(mate, null);
      h.step();
      assert.equal(lone(u), null, `${label(f)}: the enemy-like ally seen while off keeps it off`);
      h.b.relocate(like, 12, 9);
      h.step();
      assert.equal(lone(u), null, `${label(f)}: even away from her`);
      h.b.kill(like, null);
      h.step();
      assert.ok(lone(u), `${label(f)}: on once it left the field`);
    }
    done(h);
  }
  // CCR-Y stage 3 with a neighbour at the deployment: none for that deployment, then a lone redeploy gets it
  const { h, u } = field({ tier: 6, elite: true, mod: CCRY, skill: 1, others: [{ uid: 2, chessId: 'chess_char_1_08_a', row: 11, col: 5 }] });
  h.run(0.5);
  assert.equal(lone(u), null, 'a neighbour at the battle-start deployment');
  h.b.retreat(h.unit(2));
  h.run(0.5);
  assert.equal(lone(u), null, 'still none: decided at the deployment');
  h.b.retreat(u);
  h.b.redeploy(u);
  h.step();
  assert.deepEqual(lone(u)?.mods, { atkPct: 0.15, aspd: 15 }, 'a lone redeploy');
  done(h);
  const t1 = formOf(6, true).modules.find((m) => m.uniEquipId === CCRY).talentChanges.find((t) => t.talentIndex === 1);
  assert.match(t1.desc, /^部署时若周围四格内没有其他友方单位/);
});

test('modules: CCR-X "无视目标10点法术抗性" at stages 1 and 3 (× 0.6 on RES 50); CCR-Y "普通攻击命中精英或领袖敌人时获得1点技力" — not on a normal enemy, not from 剥壳', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const x = elite && mod === CCRX, y = elite && mod === CCRY;
    assert.equal(u.s.resIgnoreFlat, x ? 10 : 0, `${label(f)}: RES ignore`);
    if (y) assert.deepEqual(u.def.raw.trait.bb, { sp: 1 });
    const foe = h.spawn('enemy_r50', { pos: [10, 6] });
    const n0 = hitsBy(h, u).length;
    h.run(3.5);
    const hits = hitsBy(h, u).slice(n0).filter((c) => c.target === foe && c.dmg.isAttack);
    assert.ok(hits.length >= 2, label(f));
    approx(hits[0].amount, arts(u.s.atk, 50, x ? 10 : 0), `${label(f)}: arts on RES 50`);
    const traitSp = () => h.hooksOf('spGain').filter((c) => c.unit === u && c.reason === 'trait').length;
    assert.equal(traitSp(), 0, `${label(f)}: no SP from a normal enemy`);
    h.b.kill(foe, null);
    for (const key of ['enemy_elite', 'enemy_boss']) {
      const el = h.spawn(key, { pos: [10, 6] });
      const k0 = traitSp(), a0 = atkHits(h, u).filter((c) => c.target === el).length;
      h.run(3.5);
      const hitsE = atkHits(h, u).filter((c) => c.target === el).length - a0;
      assert.ok(hitsE >= 2, label(f));
      assert.equal(traitSp() - k0, y ? hitsE : 0, `${label(f)}: +1 SP per hit on an ${key}`);
      h.b.kill(el, null);
    }
    done(h);
  }
});
