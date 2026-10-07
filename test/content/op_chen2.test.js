// test/content/op_chen2.test.js — the 自选 operator kit of 假日威龙陈 (char_1013_chen2, 6★ 散射手; kit
// server/sim/content/kits/ops/op-chen2.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, RPR-X
// 沙滩战斗套装 or RPR-Y 假期的最后一天 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist
// of kits/README.md item by item.
// Run: node --test test/content/op_chen2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { spareChance, waterOn, holidayLines, slimeOf, slimeKey } from '../../server/sim/content/kits/ops/op-chen2.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHEN = 'char_1013_chen2';
const FORMS = BACKUPS.units[CHEN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const RX = 'uniequip_002_chen2', RY = 'uniequip_003_chen2';
const S1 = 'skchr_chen2_1', S2 = 'skchr_chen2_2', S3 = 'skchr_chen2_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_armor: dummy('enemy_armor', { def: 500 }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.5, mass: 0 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, RX, RY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 假日威龙陈 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5, flags = {} } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...flags }, hooks: ['damaged', 'skillStart', 'skillEnd', 'ammoUsed', 'attack', 'statusApplied'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: CHEN, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Give the skill its SP and run until it starts. */
function cast(h, u, max = 5) {
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, max), 'cast');
}

test('假日威龙陈 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes (RPR-Y: cost −8), 2-5, 散射手 (every enemy in range, air too, ×1.5 / RPR-X ×1.6 on her front row), blocks 1, ground-targetable, the data triggers; offered as a pick', () => {
  assert.equal(OPERATOR_KITS[CHEN], KITS[CHEN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CHEN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.cost],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), form.stats.cost + (m?.attr.cost ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.allInRange, u.profile.sub, u.base.bat],
        [1, 'ranged', true, 'phys', true, 'reaperrange', 2.3], `${label(f)}: 散射手`);
      assert.equal(u.profile.frontScale, mod === RX ? 1.6 : 1.5, `${label(f)}: front-row scale`);
      assert.deepEqual(u.profile.frontGrid, [[1, 1], [0, 0], [0, 1], [-1, 1]], `${label(f)}: the trait's front grid`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 2-5`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth && !u.s.flags.untargetable, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'ACTIVE_RANGE']);
  assert.deepEqual([FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk, FORMS['2/1/4/0'].stats.cost], [682, 764, 30]);
  assert.deepEqual([modOf(5, RX).attr, modOf(6, RX).attr, modOf(5, RY).attr, modOf(6, RY).attr],
    [{ atk: 30, def: 37 }, { atk: 60, def: 45 }, { cost: -8, maxHp: 135, atk: 55 }, { cost: -8, maxHp: 180, atk: 100 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CHEN) && [5, 6].every((t) => diyPool(t, { data, kitted: KITTED_CHARS }).includes(CHEN)));
  assert.equal(validateDiyPicks({ [SLOT[6]]: { charId: CHEN, skillIndex: 2, uniEquipId: RY } }, { data, kitted: KITTED_CHARS }).ok, true);
});

test('trait 散射手: one attack strikes every enemy of her 2-5 (a flyer too) — ×1.5 (RPR-X ×1.6) on the trait front row (her column ahead), ×1 elsewhere; one attackId', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, RX], [6, true, RY]]) {
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    u.skill.charges = 0; u.skill.sp = 0;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    const front = h.spawn('enemy_dummy', { pos: [10, 5] }), up1 = h.spawn('enemy_dummy', { pos: [9, 5] });
    const far = h.spawn('enemy_dummy', { pos: [10, 6] }), fly = h.spawn('enemy_fly', { pos: [11, 6] });
    const out = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => atkHits(h, u).length >= 4, 5), 'an attack');
    const first = atkHits(h, u);
    const id = first[0].dmg.attackId;
    const hit = first.filter((c) => c.dmg.attackId === id);
    assert.deepEqual(new Set(hit.map((c) => c.target)), new Set([front, up1, far, fly]), `T${tier}: every enemy of 2-5`);
    const sc = mod === RX ? 1.6 : 1.5;
    for (const c of hit) approx(c.amount, u.s.atk * ([front, up1].includes(c.target) ? sc : 1), `T${tier} ${mod}: ${c.target.tileR},${c.target.tileC}`);
    assert.ok(!hit.some((c) => c.target === out), `T${tier}: [0,3] is outside 2-5`);
    done(h);
  }
});

test('S1 高压冲击 (AUTO, attack SP 6 / 5, data DEFAULT): after that many attacks ATK +55 % / +70 %, 4 bullets, every enemy of her range takes the trait multiplier; ends after 4 attacks', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spType, sk.spCost, sk.initSp, sk.bb.atk, sk.bb['attack@trigger_time'], sk.skillType], ['INCREASE_WHEN_ATTACK', elite ? 5 : 6, 0, elite ? 0.7 : 0.55, 4, 'AUTO'], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.spType], ['ammo', 'DEFAULT', 'attack']);
    const SP = h.b.rng.chance; // no spare shots for an exact count: her own 节约风气 is tested below
    h.b.rng.chance = () => false;
    h.spawn('enemy_dummy', { pos: [10, 5] });
    h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 60), `T${tier}: cast`);
    const plain = h.hooksOf('attack').filter((c) => c.attacker === u && !c.isSkill);
    assert.equal(plain.length, sk.spCost, `T${tier}: after ${sk.spCost} attacks`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK +${sk.bb.atk * 100} %`);
    h.runUntil(() => !u.skill.active, 30);
    h.b.rng.chance = SP;
    h.run(1); // the last arrows land
    const skillAttacks = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill);
    assert.equal(skillAttacks.length, 4, `T${tier}: 4 bullets, the cast's own attack the first`);
    const skillHits = atkHits(h, u).filter((c) => c.dmg.isSkill);
    assert.equal(skillHits.length, 8, `T${tier}: 4 attacks × 2 enemies`);
    // (the last attack's arrows land after the skill ended: the engine reads the ATK at the impact)
    const ids = [...new Set(skillHits.map((c) => c.dmg.attackId))];
    for (const c of skillHits.filter((x) => ids.indexOf(x.dmg.attackId) < 3)) approx(c.amount, u.base.atk * (1 + sk.bb.atk) * 1.5, `T${tier}: ×1.5 on both (the trait's front row and the tile beyond)`);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length, 4, `T${tier}: 4 bullets`);
    approx(u.s.atk, u.base.atk, `T${tier}: ATK back`);
    done(h);
  }
});

test('S2 “堇青之夜” (MANUAL, data DEFAULT, 蓄力 2): 27 / 24 SP from 5 / 10; cast with one charge 8 bullets, ATK +50 % / +65 %; with both stored (蓄力) 20 bullets; every cast empties the SP', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.spCost, sk.initSp, sk.maxChargeTime, sk.bb.atk, sk.bb['attack@trigger_time'], sk.bb['attack@another_trigger_time']],
      [elite ? 24 : 27, elite ? 10 : 5, 2, elite ? 0.65 : 0.5, 8, 20], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    const atStart = [];
    h.b.on('skillStart', (c) => { if (c.unit === u) atStart.push([c.skill.ammoLeft, c.skill.ammoMax, c.skill.charges, c.skill.sp, u.mem.chen2Charged]); }, { priority: -1000 });
    assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.maxCharges], ['ammo', 'DEFAULT', 2]);
    approx(u.skill.sp, sk.initSp, `T${tier}: initial SP`, 0.02);
    // one charge and some SP towards the second: 8 bullets, everything spent
    u.skill.gainSp(sk.spCost - u.skill.sp + 5);
    assert.equal(u.skill.charges, 1);
    approx(u.skill.sp, 5, 'SP towards the second charge');
    h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => u.skill.active, 5), `T${tier}: cast`);
    assert.deepEqual(atStart[0], [8, 8, 0, 0, false], `T${tier}: 8 bullets, SP emptied`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `T${tier}: ATK`);
    u.skill.end('test');
    // 蓄力: both charges stored
    u.skill.gainSp(999, 'init');
    assert.equal(u.skill.charges, 2);
    assert.ok(h.runUntil(() => u.skill.active, 10), `T${tier}: charged cast`);
    assert.deepEqual(atStart[1], [20, 20, 0, 0, true], `T${tier}: 20 bullets`);
    done(h);
  }
});

test('slime (S2 / S3): each attack slimes the tiles of her attack range (2-5; S3 2-6) for 5 s; a ground enemy there — struck or not, stealthed too — moves ×0.8 / ×0.7 / ×0.6 and loses 100 / 150 / 200 DEF after its multipliers (not stacking); a flyer or an enemy outside never; it lapses 5 s after her last attack; two 假日威龙陈 each slow', () => {
  for (const [tier, elite, skill] of [[5, false, 1], [6, true, 1], [5, false, 2], [6, true, 2]]) {
    const sk = skillOf(tier, elite, [S1, S2, S3][skill]);
    const [ms, def, life] = [sk.bb['attack@move_speed'], sk.bb['attack@def'], sk.bb['attack@projectile_life_time']];
    const { h, u } = field({ tier, elite, skill });
    const e = h.spawn('enemy_armor', { pos: [10, 5] });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    const out = h.spawn('enemy_armor', { pos: [10, 8] });
    cast(h, u);
    assert.ok(h.runUntil(() => h.hooksOf('attack').some((c) => c.attacker === u && c.isSkill), 5), 'an attack');
    h.run(0.25);
    const tiles = slimeOf(h.b, u);
    assert.deepEqual([...tiles.keys()].sort((a, b) => a - b), [...u.rangeKeys].sort((a, b) => a - b), `T${tier} S${skill + 1}: her range (${skill === 2 ? '2-6' : '2-5'})`);
    const key = slimeKey(u);
    const b = e.findBuff(key);
    assert.ok(b, `T${tier} S${skill + 1}: the ground enemy is slimed`);
    approx(b.mods.moveMul, 1 + ms, `×${1 + ms}`);
    approx(e.s.def, 500 + def, `DEF ${def}`);
    assert.equal(fly.findBuff(key), null, 'never a flyer');
    assert.equal(out.findBuff(key), null, 'not outside her range');
    // a stealthed ground enemy that walks in (never struck: she cannot see it) — 无视无法选择
    const sneak = h.spawn('enemy_armor', { pos: [9, 6] });
    h.b.addBuff(sneak, { key: 'test:stealth', flags: { stealth: true } });
    h.run(0.25);
    assert.ok(sneak.findBuff(key), 'a stealthed enemy in the slime is slimed');
    // the DEF cut is a final addition: after a ×0.7 DEF status
    h.b.applyStatus(e, 'defDown', { duration: 30, value: 0.3, source: u });
    h.run(0.25);
    approx(e.s.def, 500 * 0.7 + def, 'DEF ×0.7 then the cut');
    assert.equal(e.buffs.filter((x) => x.key === key).length, 1, '不叠加');
    // stop her: the slime lapses life s after her last attack
    u.skill.end('test');
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    const tLast = h.hooksOf('attack').filter((c) => c.attacker === u).slice(-1)[0].t;
    h.run(tLast + life - 0.3 - h.b.time);
    assert.ok(e.findBuff(key), 'still slimed');
    h.run(0.7);
    assert.equal(e.findBuff(key), null, `gone ${life} s after her last attack`);
    done(h);
  }
  // two of them: one slow each (independentCharacterSource)
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 60, autoFinish: false, seed: 3, flags: { dpPerSec: 0 },
    units: [{ uid: 1, diy: { slot: 5, charId: CHEN, skillIndex: 1 }, row: 10, col: 4 }, { uid: 2, diy: { slot: 6, charId: CHEN, skillIndex: 1 }, row: 11, col: 4 }],
  });
  h.step();
  const e = h.spawn('enemy_armor', { pos: [10, 5] });
  for (const id of [1, 2]) h.unit(id).skill.gainSp(999);
  h.run(3);
  assert.ok(e.findBuff(slimeKey(h.unit(1))) && e.findBuff(slimeKey(h.unit(2))), 'both slimes');
  approx(e.s.def, 500 - 200, 'DEF −100 twice');
  done(h);
});

test('S3 “假日风暴” (MANUAL, data ACTIVE_RANGE on 2-6): an enemy only on 2-6 casts it; range 2-6 (and back); ATK +55 % / +70 %, every attack strikes twice with the trait multiplier on every enemy; 32 bullets, 2 per attack (16 attacks), one left still attacks', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.spCost, sk.initSp, sk.bb.atk, sk.bb['attack@trigger_time'], sk.rangeId], [elite ? 60 : 65, elite ? 25 : 20, elite ? 0.7 : 0.55, 32, '2-6'], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['ammo', 'ACTIVE_RANGE']);
    const SP = h.b.rng.chance;
    h.b.rng.chance = () => false;
    const n0 = h.hooksOf('ammoUsed').filter((c) => c.unit === u).length;
    const a0 = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill).length;
    u.skill.gainSp(999);
    const corner = h.spawn('enemy_dummy', { pos: [12, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast for [2,2] (outside 2-5)`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 2-6 while it runs`);
    const front = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => !u.skill.active, 60);
    h.b.rng.chance = SP;
    const attacks = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill).length - a0;
    assert.equal(attacks, 16, `T${tier}: 32 bullets / 2`);
    assert.equal(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length - n0, 32, `T${tier}: one ammoUsed per bullet`);
    const hits = atkHits(h, u).filter((c) => c.dmg.isSkill && c.target === front);
    assert.ok(hits.length >= 28, `T${tier}: two hits per attack (${hits.length})`);
    const byId = new Map();
    for (const c of hits) byId.set(c.dmg.attackId, (byId.get(c.dmg.attackId) ?? 0) + 1);
    assert.ok([...byId.values()].every((n) => n === 2), `T${tier}: two damage instances per attack`);
    const atk = u.base.atk * (1 + sk.bb.atk);
    for (const c of hits) approx(c.amount, atk * 1.5, `T${tier}: front ×1.5`);
    const onCorner = atkHits(h, u).filter((c) => c.dmg.isSkill && c.target === corner);
    assert.ok(onCorner.length >= 30, `T${tier}: [2,2] struck too`);
    for (const c of onCorner) approx(c.amount, atk * 1.5, `T${tier}: [2,2] also ×1.5`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 2-5`);
    // 即使剩余弹药数小于2发仍可"消耗2发弹药"进行攻击
    h.b.on('skillStart', (c) => { if (c.unit === u) c.skill.ammoLeft = 3; }, { priority: -1000 });
    h.b.rng.chance = () => false;
    const a1 = h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill).length;
    u.skill.gainSp(999, 'init');
    assert.ok(h.runUntil(() => u.skill.active, 5));
    h.runUntil(() => !u.skill.active, 30);
    h.b.rng.chance = SP;
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u && c.isSkill).length - a1, 2, `T${tier}: 3 bullets ⇒ 2 attacks (2 + the last one)`);
    done(h);
  }
});

test('T1 节约风气: her ammo-skill attacks spare their bullets 22 % of the time (RPR-X stage 3: 27 %) — one roll per attack, S3 spares both bullets, every ammoUsed still fires', () => {
  for (const [tier, elite, mod, p] of [[5, false, null, 0.22], [5, true, RX, 0.22], [6, true, RX, 0.27], [6, true, RY, 0.22]]) {
    for (const skill of [1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill, seed: 17 });
      h.spawn('enemy_dummy', { pos: [10, 5] });
      cast(h, u);
      assert.equal(spareChance(h.b, u), p, `T${tier} ${mod}: her chance`);
      u.skill.ammoLeft = 100000;
      const u0 = h.hooksOf('ammoUsed').filter((c) => c.unit === u).length;
      const before = new Map();
      h.b.on('attack', (c) => { if (c.attacker === u) before.set(u.stats.attacks, u.skill.ammoLeft); }, { priority: 1000 });
      const spent = [];
      h.b.on('attack', (c) => { if (c.attacker === u) h.b.after(0, () => spent.push(before.get(u.stats.attacks) - u.skill.ammoLeft)); }, { priority: 1000 });
      h.run(900);
      h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
      h.step(3);
      const per = skill === 2 ? 2 : 1;
      assert.ok(spent.length > 300, `${spent.length} attacks`);
      assert.ok(spent.every((n) => n === 0 || n === per), `T${tier} S${skill + 1}: 0 or ${per} per attack`);
      const r = spent.filter((n) => n === 0).length / spent.length;
      assert.ok(Math.abs(r - p) < 0.05, `T${tier} ${mod} S${skill + 1}: spare rate ${r} ≈ ${p}`);
      const used = h.hooksOf('ammoUsed').filter((c) => c.unit === u).length - u0;
      assert.equal(used, spent.length * per, `T${tier} S${skill + 1}: every bullet's ammoUsed fires, spared or not`);
      done(h);
    }
  }
});

test('T1 节约风气 on others while she is on the field: another 【狙击】 operator\'s 弹药类技能 22 %, her own (PRTS 修正 over the text\'s 10 %; RPR-X stage 3: 20 %), another 远程 operator\'s 0 % / 12 % (RPR-X stage 3), never a 技能 without "攻击装有X发" nor a summon; none once she leaves; the highest of two 假日威龙陈', () => {
  const t0 = FORMS['2/1/4/0'].talents.find((t) => t.index === 0);
  assert.deepEqual(t0.bb, { 'spareshot_chen.prob': 0.22, prob: 0.1 }, 'the base row: 22 % / the text\'s 10 %');
  assert.deepEqual(modOf(6, RX).talentChanges[0].bb, { 'e_spareshot_chen.prob': 0.27, 'chen2_t_002[spareshot][other].prob': 0.12, 'chen2_t_002[spareshot][sniper].prob': 0.2 });
  for (const [tier, elite, mod, sniper, other] of [[5, false, null, 0.22, 0], [5, true, RX, 0.22, 0], [6, true, RX, 0.2, 0.12], [6, true, RY, 0.22, 0]]) {
    const others = [
      { uid: 2, chessId: 'chess_char_1_01_a', row: 11, col: 3 },   // 隐现 (狙击): S2 "攻击装有14发弹药"
      { uid: 3, chessId: 'chess_char_5_03_a', row: 12, col: 3 },   // 烛煌 (术师, 远程): S3 "攻击装有18发弹药"
      { uid: 4, chessId: 'chess_char_5_08_a', skillIndex: 1, row: 9, col: 7 },   // 号角 (重装): S2 "技能拥有10枚弹药" — no 攻击装有
    ];
    const { h, u } = field({ tier, elite, mod, skill: 0, others });
    const inside = h.unit(2), blaze = h.unit(3), horn = h.unit(4);
    assert.equal(spareChance(h.b, inside), sniper, `${tier} ${mod}: 狙击`);
    assert.equal(spareChance(h.b, blaze), other, `${tier} ${mod}: 远程`);
    assert.equal(spareChance(h.b, horn), 0, `${tier} ${mod}: 地面`);
    // the roll only applies to a running 弹药类技能 (whose text says 攻击装有X发…)
    for (const x of [inside, blaze]) assert.match(x.skill.def.description, /攻击装有\d+发/);
    assert.doesNotMatch(horn.skill.def.description, /攻击装有\d+发/);
    // 隐现's S2 over many attacks
    h.spawn('enemy_dummy', { pos: [11, 5] });
    inside.skill.gainSp(999);
    assert.ok(h.runUntil(() => inside.skill.active, 10), '隐现 casts');
    inside.skill.ammoLeft = 100000;
    let spared = 0, n = 0;
    h.b.on('attack', (c) => {
      if (c.attacker !== inside) return;
      const left = inside.skill.ammoLeft;
      h.b.after(0, () => { n++; if (inside.skill.ammoLeft === left) spared++; });
    }, { priority: 1000 });
    h.run(500);
    h.b.addBuff(inside, { key: 'test:disarm', flags: { disarm: true } });
    h.step(3);
    assert.ok(n > 200, `${n} attacks`);
    assert.ok(Math.abs(spared / n - sniper) < 0.06, `T${tier} ${mod}: 隐现 ${spared}/${n} ≈ ${sniper}`);
    // she leaves: nobody's chance
    h.b.retreat(u);
    assert.deepEqual([spareChance(h.b, inside), spareChance(h.b, blaze)], [0, 0], 'only while she is on the field');
    done(h);
  }
  // two 假日威龙陈 (a shared field): each takes the highest — the RPR-X stage-3 one gives the other 20 % (below her own 22 %,
  // which she keeps), the other gives her 22 % (below her own 27 %)
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 60, autoFinish: false, seed: 3, flags: { dpPerSec: 0 },
    units: [{ uid: 1, diy: { slot: 6, charId: CHEN, skillIndex: 0, uniEquipId: RX }, elite: true, row: 10, col: 4 },
      { uid: 2, diy: { slot: 5, charId: CHEN, skillIndex: 0, uniEquipId: null }, elite: false, row: 11, col: 4 },
      { uid: 3, chessId: 'chess_char_5_03_a', row: 12, col: 3 }],
  });
  h.step();
  assert.deepEqual([spareChance(h.b, h.unit(1)), spareChance(h.b, h.unit(2)), spareChance(h.b, h.unit(3))], [0.27, 0.22, 0.12]);
  done(h);
});

test('T2 假日余韵: ASPD +8 (no level of the mode has the water TAG); RPR-Y stage 3: ATK +15 % ASPD +12, and while her skill runs the field counts as water: ATK +28 % ASPD +20 — for every 假日威龙陈 of the field — until it ends', () => {
  // the two rows of the data: base [map] = the step (8 + 4 = 12), module [map] = the totals (20 / 28 %), as their texts say
  const base = FORMS['2/1/4/0'].talents.find((t) => t.index === 1);
  assert.match(base.desc, /改为攻击速度\+12/);
  assert.deepEqual(holidayLines(base), { common: { atkPct: 0, aspd: 8 }, water: { atkPct: 0, aspd: 12 } });
  const row = modOf(6, RY).talentChanges[0];
  assert.match(row.desc, /改为攻击力\+28%，攻击速度\+20，技能开启时，场地视为水地形/);
  assert.deepEqual(holidayLines({ ...row, fromModule: true }), { common: { atkPct: 0.15, aspd: 12 }, water: { atkPct: 0.28, aspd: 20 } });
  assert.deepEqual(modOf(5, RY).talentChanges, [], 'RPR-Y stage 1 changes no talent');
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const y3 = elite && mod === RY && tier === 6;
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [{ uid: 2, diy: { slot: 5, charId: CHEN, skillIndex: 0 }, row: 12, col: 4 }] });
    const mate = h.unit(2);
    approx(u.s.aspd, 100 + (elite ? (modOf(tier, mod)?.attr.aspd ?? 0) : 0) + (y3 ? 12 : 8), `${label(f)}: ASPD`);
    approx(u.s.atk, u.base.atk * (y3 ? 1.15 : 1), `${label(f)}: ATK`);
    assert.equal(waterOn(h.b), false);
    h.spawn('enemy_dummy', { pos: [10, 5] });
    cast(h, u);
    h.step();
    assert.equal(waterOn(h.b), y3, `${label(f)}: water while her skill runs`);
    approx(u.s.aspd, 100 + (y3 ? 20 : 8), `${label(f)}: ASPD during the skill`);
    approx(u.s.atk, u.base.atk * (1 + skillOf(tier, elite, S3).bb.atk + (y3 ? 0.28 : 0)), `${label(f)}: ATK during the skill`);
    approx(mate.s.aspd, 100 + (y3 ? 12 : 8), `${label(f)}: the other 假日威龙陈 (no module) gets the water line too`);
    u.skill.end('test');
    h.step();
    assert.equal(waterOn(h.b), false, `${label(f)}: the TAG ends with the skill`);
    approx(u.s.aspd, 100 + (y3 ? 12 : 8), `${label(f)}: back`);
    approx(mate.s.aspd, 108, `${label(f)}: the other back to +8`);
    if (y3) {
      cast(h, u);
      h.step();
      assert.equal(waterOn(h.b), true);
      h.b.retreat(u);
      h.step();
      assert.equal(waterOn(h.b), false, 'cleared when she leaves');
    }
    done(h);
  }
});
