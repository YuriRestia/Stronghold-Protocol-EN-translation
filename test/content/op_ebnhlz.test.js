// test/content/op_ebnhlz.test.js — the 自选 operator kit of 黑键 (char_4046_ebnhlz, 6★ 秘术师; kit
// server/sim/content/kits/ops/op-ebnhlz.js) and of his S2 summon 旧日残影 (token_10024_ebnhlz_rcube), fielded the
// production way (a DIY slot + its `diy` pick, simdata getDiy) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4,
// no module) and elite (E2 Lv60, rank 7) with no module, MSC-X 源石骰子收纳盒, MSC-Y “乐理阐释者” or MSC-Δ 朽坏传承 at stage 1
// (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_ebnhlz.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const EBN = 'char_4046_ebnhlz';
const REMNANT = 'token_10024_ebnhlz_rcube';
const FORMS = BACKUPS.units[EBN].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const MX = 'uniequip_002_ebnhlz', MY = 'uniequip_003_ebnhlz', MD = 'uniequip_004_ebnhlz';
const S1 = 'skchr_ebnhlz_1', S2 = 'skchr_ebnhlz_2', S3 = 'skchr_ebnhlz_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The composed talent `i` of a form + module (the module's change replaces the base talent). */
const talentOf = (tier, elite, mod, i) => modOf(tier, mod)?.talentChanges.find((t) => t.talentIndex === i)?.bb ?? formOf(tier, elite).talents[i].bb;
const traitOf = (tier, elite, mod) => modOf(tier, mod)?.traitOverride?.bb ?? formOf(tier, elite).trait.bb;
const hiddenOf = (tier, mod) => Object.assign({}, ...(modOf(tier, mod)?.talentChanges ?? []).filter((t) => t.talentIndex === -1).map((t) => t.bb));
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_elite: dummy('enemy_elite', { rank: 'ELITE' }), enemy_boss: dummy('enemy_boss', { rank: 'BOSS' }),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_heavy: dummy('enemy_heavy', { mass: 3 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, MX, MY, MD].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 黑键 as uid 1 at (row, col) facing `dir` (default RIGHT), plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, dir = 'RIGHT', others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'attack', 'death'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: EBN, skillIndex: skill, uniEquipId: mod }, elite, row, col, dir }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const stored = (u) => ({ n: u.trait.ebn?.n ?? 0, e: u.trait.ebn?.e ?? 0 });
const tagged = (c, t) => (c.dmg?.tags || []).includes(t);
const mainHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack && !tagged(c, 'ebnhlz:energy'));
const energyHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && tagged(c, 'ebnhlz:energy'));
const yiyinHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && tagged(c, 'ebnhlz:yiyin'));
/** Hold his skill off (SP 0, no charge): the trait / talent checks see no cast. */
const holdSkill = (u) => { u.skill.sp = 0; u.skill.charges = 0; };
/** Start a check with nothing stored. */
const clearEnergy = (u) => { const v = u.trait.ebn; if (v) { v.n = 0; v.e = 0; } };
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Step until he holds `n` / `e` (no enemy on the field), recording [time, interval] at each store. */
function storeUp(h, u, n, e, max = 60) {
  const log = [];
  let last = stored(u).n + stored(u).e;
  for (let i = 0; i < max * 30; i++) {
    const s = stored(u);
    if (s.n === n && s.e === e) return log;
    h.step();
    const t = stored(u).n + stored(u).e;
    if (t !== last) { log.push([h.b.time, u.atkCd]); last = t; }
  }
  assert.fail(`stores up to ${n}/${e}: ${JSON.stringify(stored(u))}`);
  return log;
}

test('黑键 in every 自选 form: his operator kit (all three skills authored), the form\'s stats + module attributes, 3-14, ranged arts every 3 s that hits air units, blocks 1, ground-targetable, the data\'s DEFAULT triggers (S2: the kit casts it), 空 bond, no 特质', () => {
  assert.equal(OPERATOR_KITS[EBN], KITS[EBN]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [EBN, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res, u.base.aspd],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), form.stats.res + (m?.attr.res ?? 0), 100 + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 3], `${label(f)}: 秘术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-14`);
      assert.equal(u.skill.rule, skill === 1 ? 'NEVER' : 'DEFAULT', `${label(f)}: the data's trigger (S2: the kit's own cast)`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      done(h);
    }
  }
  // the numbers (zh_CN, full potential): E2 Lv1 1359 / 1186 / 120 / 20, E2 Lv60 1570 / 1362 / 130 / 20; MSC-X +58 ATK +3 ASPD → +90 / +5,
  // MSC-Y +80 HP +88 ATK → +175 / +135, MSC-Δ +76 ATK +4 RES → +124 / +5
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk], [1359, 1186, 1362]);
  assert.deepEqual([modOf(5, MX).attr, modOf(6, MX).attr, modOf(5, MY).attr, modOf(6, MY).attr, modOf(5, MD).attr, modOf(6, MD).attr],
    [{ atk: 58, aspd: 3 }, { atk: 90, aspd: 5 }, { maxHp: 80, atk: 88 }, { maxHp: 175, atk: 135 }, { atk: 76, res: 4 }, { atk: 124, res: 5 }]);
  // he hits a flyer
  const { h, u } = field({ skill: 2 });
  holdSkill(u);
  const f = h.spawn('enemy_fly', { pos: [10, 6] });
  assert.ok(h.runUntil(() => mainHits(h, u).some((c) => c.target === f), 5), 'an air unit is hit');
  done(h);
});

test('a 自选 pick: 黑键 is offered at tiers 5 and 6 (he has a kit) and a roster with him passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(EBN));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(EBN), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: EBN, skillIndex: 1, uniEquipId: MD } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: EBN, skillIndex: 1, uniEquipId: MD } } });
});

test('trait + T1 强弱法: no target ⇒ one energy per attack interval (an attack action — PRTS 分支特性信息), up to times (3; MSC-X 4), then the one elite-only energy, then idle; MSC-Y: ASPD +30 while he holds any', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const N = traitOf(tier, elite, mod).times, E = talentOf(tier, elite, mod, 0).times_2;
    assert.deepEqual([N, E], [mod === MX ? 4 : 3, 1], `${label(f)}: times / times_2`);
    assert.deepEqual(stored(u), { n: 1, e: 0 }, `${label(f)}: the first at once (his attack is ready at deployment)`);
    const first = [h.b.time, u.atkCd];
    approx(first[1], u.base.bat * 100 / u.base.aspd, `${label(f)}: then a full interval`, 1e-6);
    const log = [first, ...storeUp(h, u, N, E)];
    assert.equal(log.length, N + E, `${label(f)}: ${N} + ${E} stores`);
    for (let i = 1; i < log.length; i++) approx(log[i][0] - log[i - 1][0], log[i - 1][1], `${label(f)}: store ${i + 1} one interval after the last`, 0.02);
    const aspd = hiddenOf(tier, mod).attack_speed ?? 0;
    assert.equal(aspd, mod === MY ? 30 : 0, `${label(f)}: MSC-Y attack_speed`);
    approx(u.s.aspd, u.base.aspd + aspd, `${label(f)}: ASPD while holding energy`);
    const before = h.b.time;
    h.run(10);
    assert.deepEqual(stored(u), { n: N, e: E }, `${label(f)}: full — idle`);
    assert.ok(h.b.time - before >= 10 - 1e-9);
    done(h);
  }
});

test('the volley: his next attack releases every normal energy at its target, ATK × atk_scale (1.35; MSC-X stage 3 1.43) arts attack hits landing with the main bolt; the elite energy only at an elite or leader target', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const N = traitOf(tier, elite, mod).times, E = talentOf(tier, elite, mod, 0).times_2;
    const scale = talentOf(tier, elite, mod, 0).atk_scale;
    assert.equal(scale, mod === MX && tier === 6 ? 1.43 : 1.35, `${label(f)}: 强弱法 scale`);
    storeUp(h, u, N, E);
    holdSkill(u);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5), `${label(f)}: attacks`);
    const main = mainHits(h, u)[0];
    const en = energyHits(h, u).filter((c) => c.dmg.attackId === main.dmg.attackId);
    assert.equal(en.length, N, `${label(f)}: ${N} normal energies at a normal enemy`);
    for (const c of en) { approx(c.amount, u.s.atk * scale, `${label(f)}: energy ×${scale}`, 1e-3); assert.deepEqual([c.type, c.target, c.dmg.isAttack], ['arts', e, true]); }
    approx(main.amount, u.s.atk, `${label(f)}: the main bolt 100 %`, 1e-3);
    assert.deepEqual(stored(u), { n: 0, e: E }, `${label(f)}: the elite energy kept`);
    // an elite target: the elite energy goes too
    h.b.kill(e, null);
    holdSkill(u);
    const el = h.spawn('enemy_elite', { pos: [10, 6] });
    const n0 = mainHits(h, u).length;
    assert.ok(h.runUntil(() => mainHits(h, u).length > n0 && mainHits(h, u).at(-1).target === el, 8), `${label(f)}: attacks the elite`);
    const m2 = mainHits(h, u).at(-1);
    const en2 = energyHits(h, u).filter((c) => c.dmg.attackId === m2.dmg.attackId);
    assert.equal(en2.length, E, `${label(f)}: the elite energy at an elite`);
    assert.deepEqual(stored(u), { n: 0, e: 0 });
    done(h);
  }
  // a leader (BOSS rank) takes it too
  const { h, u } = field({ tier: 6, elite: true });
  storeUp(h, u, 3, 1);
  holdSkill(u);
  h.spawn('enemy_boss', { pos: [10, 6] });
  assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5));
  assert.equal(energyHits(h, u).length, 4, 'three normal + the elite energy at a leader');
  done(h);
});

test('T2 倚音: per projectile (the main bolt and every energy) a target with no other enemy within range_radius 1.1 takes ATK × atk_scale arts (17 %; MSC-Y 22 %, MSC-Δ 32 % at stage 3); with one there: nothing — MSC-Y stage 3 ATK × 36 % arts splash on the others instead; MSC-Δ stage 3: + ATK × 30 % 元素伤害 on a target in its 凋亡 burst', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t1 = talentOf(tier, elite, mod, 1);
    assert.equal(t1.range_radius, 1.1);
    assert.equal(t1.atk_scale, tier === 6 && mod === MY ? 0.22 : tier === 6 && mod === MD ? 0.32 : 0.17, `${label(f)}: atk_scale`);
    // alone: the main bolt + 2 energies ⇒ 3 additions
    {
      const { h, u } = field({ tier, elite, mod, skill: 0 });
      storeUp(h, u, 2, 0);
      holdSkill(u);
      const e = h.spawn('enemy_dummy', { pos: [10, 6] });
      assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5));
      const id = mainHits(h, u)[0].dmg.attackId;
      const add = yiyinHits(h, u).filter((c) => c.dmg.attackId === id && c.type === 'arts');
      assert.equal(add.length, 3, `${label(f)}: the main bolt and 2 energies`);
      for (const c of add) { approx(c.amount, u.s.atk * t1.atk_scale, `${label(f)}: ${t1.atk_scale}`, 1e-3); assert.equal(c.target, e); }
      done(h);
    }
    // not alone: an enemy 1.0 away (within 1.1)
    {
      const { h, u } = field({ tier, elite, mod, skill: 0 });
      holdSkill(u);
      clearEnergy(u);
      const a = h.spawn('enemy_dummy', { pos: [10, 6] });
      const b = h.spawn('enemy_dummy', { pos: [11, 6] });
      assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5));
      const main = mainHits(h, u)[0];
      const add = yiyinHits(h, u).filter((c) => c.dmg.attackId === main.dmg.attackId);
      const other = main.target === a ? b : a;
      if (t1.atk_scale_2 > 0) {
        assert.equal(t1.atk_scale_2, 0.36, `${label(f)}: MSC-Y stage 3`);
        assert.deepEqual(add.map((c) => c.target), [other], `${label(f)}: the splash spares the main target`);
        approx(add[0].amount, u.s.atk * 0.36, `${label(f)}: 36 %`, 1e-3);
        assert.ok(add[0].dmg.isSplash);
      } else assert.equal(add.length, 0, `${label(f)}: no addition with another enemy near`);
      done(h);
    }
    // MSC-Δ stage 3: a target in its 凋亡 burst
    if (t1.element_atk_scale > 0) {
      assert.deepEqual([tier, mod, t1.element_atk_scale], [6, MD, 0.3]);
      const { h, u } = field({ tier, elite, mod, skill: 0 });
      holdSkill(u);
      clearEnergy(u);
      const e = h.spawn('enemy_dummy', { pos: [10, 6] });
      h.b.addBuff(e, { key: 'apoptosisBurst', duration: 15, flags: { burstLock: true } });
      assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5));
      const id = mainHits(h, u)[0].dmg.attackId;
      const add = yiyinHits(h, u).filter((c) => c.dmg.attackId === id);
      assert.deepEqual(add.map((c) => c.type), ['arts', 'elemental'], 'arts first, then 元素伤害 (PRTS 备注)');
      approx(add[1].amount, u.s.atk * 0.3, '30 % 元素伤害', 1e-3);
      done(h);
    }
  }
});

test('MSC-Δ 朽坏传承: every arts damage of his (attacks, energies, 倚音) and of his 旧日残影 attaches 8 % of it as 凋亡损伤; none without the module', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const ratio = hiddenOf(tier, mod).ep_damage_ratio ?? 0;
    assert.equal(ratio, mod === MD ? 0.08 : 0, label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    holdSkill(u);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 5));
    const id = mainHits(h, u)[0].dmg.attackId;
    const arts = h.hooksOf('damaged').filter((c) => c.source === u && c.type === 'arts' && c.dmg.attackId === id);
    const sum = arts.reduce((s, c) => s + c.amount, 0);
    approx(e.elem.apoptosis, sum * ratio, `${label(f)}: 凋亡 gauge = ${ratio} × the arts dealt`, 1e-6);
    done(h);
  }
  // the remnant's blast too
  const { h, u } = field({ tier: 6, elite: true, mod: MD, skill: 1 });
  u.skill.gainSp(999);
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source?.defId === REMNANT), 5), 'a remnant blast');
  const blast = h.hooksOf('damaged').find((c) => c.source?.defId === REMNANT && c.type === 'arts');
  const fills = h.hooksOf('damaged').filter((c) => c.source === blast.source && c.type === 'element');
  approx(fills[0].dmg.amount, blast.amount * 0.08, 'the remnant attaches 8 % too', 1e-6);
  assert.equal(e.alive, true);
  done(h);
});

test('S1 渐快急板 (MANUAL, data DEFAULT): 5 s, range 4-1, attack interval ×0.2, every attack 35 % / 40 % ATK arts — the energies released meanwhile 35 % / 40 % × 强弱法; all back after', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.bb['attack@atk_scale'], sk.bb.base_attack_time, sk.rangeId, sk.spCost, sk.initSp], [5, elite ? 0.4 : 0.35, 0.2, '4-1', elite ? 19 : 22, 5], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    const own = () => u.base.bat * 100 / u.s.aspd;
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0, `${label(f)}: no enemy, no cast`);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 5), `${label(f)}: cast with an enemy in 3-14`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `${label(f)}: 4-1`);
    approx(u.skill.timeLeft, 5, `${label(f)}: 5 s`, 0.02);
    approx(u.s.interval, own() * 0.2, `${label(f)}: ×0.2`, 1e-6);
    assert.ok(h.runUntil(() => mainHits(h, u).length > 0, 2));
    const main = mainHits(h, u)[0];
    approx(main.amount, u.s.atk * sk.bb['attack@atk_scale'], `${label(f)}: ${sk.bb['attack@atk_scale']} ATK`, 1e-3);
    const en = energyHits(h, u).filter((c) => c.dmg.attackId === main.dmg.attackId);
    assert.equal(en.length, 1);
    approx(en[0].amount, u.s.atk * sk.bb['attack@atk_scale'] * talentOf(tier, elite, mod, 0).atk_scale, `${label(f)}: the energy at the skill's scale`, 1e-3);
    // the 4-1 reaches 4 tiles ahead (3-14 only 3)
    const far = h.spawn('enemy_dummy', { pos: [10, 8] });
    h.b.kill(e, null);
    assert.ok(h.runUntil(() => mainHits(h, u).some((c) => c.target === far), 2), `${label(f)}: the 4-1's far tile`);
    h.runUntil(() => !u.skill.active, 6);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: 3-14 back`);
    approx(u.s.interval, own(), `${label(f)}: interval back`, 1e-6);
    done(h);
  }
});

test('S2 荒芜回响 (AUTO: full SP and one free placeable tile in his range, no enemy needed — PRTS 备注, prefab _minTileNum 1): spends every energy (elite first) on energies + 1 旧日残影 on free tiles of his range — the enemy\'s tile first, then the nearest; fewer tiles ⇒ fewer spent; no free tile ⇒ no cast', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, MX]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.skillType, sk.bb.atk_scale, sk.bb.force, sk.spCost, sk.initSp], ['AUTO', elite ? 2 : 1.7, 1, elite ? 14 : 15, 0]);
    // no enemy on the field: it casts as soon as its SP is full
    {
      const { h, u } = field({ tier, elite, mod, skill: 1 });
      assert.equal(u.skill.rule, 'NEVER', 'the kit casts it');
      let before = stored(u);
      for (let i = 0; i < (sk.spCost + 1) * 30 && u.skill.activations === 0; i++) { before = stored(u); h.step(); }
      assert.equal(u.skill.activations, 1, 'cast at full SP with no enemy anywhere');
      approx(h.b.time, sk.spCost, `T${tier}: at ${sk.spCost} s`, 0.2);
      assert.equal(h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === REMNANT && t.alive).length, before.n + before.e + 1, 'the energies stored meanwhile + 1 remnants');
      assert.deepEqual(stored(u), { n: 0, e: 0 }, 'every energy spent');
      done(h);
    }
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    const N = traitOf(tier, elite, mod).times;
    holdSkill(u);
    storeUp(h, u, N, 1);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5), 'cast');
    const rem = h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === REMNANT);
    assert.equal(rem.length, N + 2, `${N} + 1 energies + 1 remnants`);
    assert.deepEqual([rem[0].tileR, rem[0].tileC], [10, 7], 'the enemy\'s tile first');
    const d = (t) => Math.hypot(t.tileC - 7, t.tileR - 10);
    for (let i = 2; i < rem.length; i++) assert.ok(d(rem[i]) >= d(rem[i - 1]) - 1e-9, 'then by the distance to the enemy');
    assert.deepEqual(stored(u), { n: 0, e: 0 }, 'every energy spent');
    assert.equal(energyHits(h, u).length, 0, 'none left for the attack');
    void e;
    done(h);
  }
  // the flat stage's edge (col 2: RANGED tiles; cols 0–1 none): facing LEFT from (10, 2) no tile of his range is free
  {
    const { h, u } = field({ tier: 5, skill: 1, row: 10, col: 2, dir: 'LEFT' });
    holdSkill(u);
    storeUp(h, u, 3, 1);
    h.spawn('enemy_dummy', { pos: [10, 1] });
    u.skill.gainSp(999);
    h.run(5);
    assert.equal(u.skill.activations, 0, 'no placeable tile: no cast, an enemy in range notwithstanding');
    assert.equal(h.b.allyUnits.filter((t) => t.kind === 'token').length, 0, 'no remnant');
    assert.ok(u.skill.ready, 'the charge waits');
    done(h);
  }
  // fewer free tiles than energies + 1: facing LEFT from (10, 3) only (10, 2) and (11, 2) are placeable
  {
    const { h, u } = field({ tier: 5, skill: 1, row: 10, col: 3, dir: 'LEFT' });
    holdSkill(u);
    storeUp(h, u, 3, 1);
    let atEnd = null;
    h.b.on('skillEnd', (c) => { if (c.unit === u) atEnd = stored(u); });
    h.spawn('enemy_dummy', { pos: [10, 2] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5));
    const rem = h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === REMNANT);
    assert.deepEqual(rem.map((t) => [t.tileR, t.tileC]), [[10, 2], [11, 2]], 'the enemy\'s tile, then the other free one');
    assert.deepEqual(atEnd, { n: 3, e: 0 }, 'one energy spent — the elite one first');
    assert.ok(h.runUntil(() => energyHits(h, u).length === 3, 4), 'his next attack (3 s interval) releases the three left');
    done(h);
  }
});

test('旧日残影: a selectable ground enemy within 1.35 activates it; 0.93 s later every ground enemy within 1.35 takes 黑键\'s ATK × 170 % / 200 % arts from it and a 中力 inward push, then it withdraws; never flyers; 30 s life; it leaves with 黑键', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u } = field({ tier, elite, skill: 1 });
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5));
    const r = h.b.allyUnits.find((t) => t.kind === 'token' && t.defId === REMNANT && t.tileR === 10 && t.tileC === 7);
    assert.ok(r && r.alive, 'a remnant on the enemy');
    const near = h.spawn('enemy_dummy', { pos: [11, 8] });   // 1.41 away: outside
    const fly = h.spawn('enemy_fly', { pos: [10, 8] });
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').some((c) => c.source === r), 3), 'it goes off');
    approx(h.b.time - t0, 0.93, 'about 0.93 s after the activation', 0.05);
    const hits = h.hooksOf('damaged').filter((c) => c.source === r && c.type === 'arts');
    assert.deepEqual(hits.map((c) => c.target), [e], 'only the ground enemy within 1.35');
    approx(hits[0].amount, u.s.atk * sk.bb.atk_scale, `${sk.bb.atk_scale} × his ATK`, 1e-3);
    assert.ok(!hits.some((c) => c.target === fly || c.target === near));
    assert.ok(!r.alive, 'withdrawn once its skill went off');
    done(h);
  }
  // an inward push: a light enemy 1 tile off is drawn towards it
  {
    const { h, u } = field({ tier: 6, elite: true, skill: 1 });
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5));
    const r = h.b.allyUnits.find((t) => t.kind === 'token' && t.tileR === 10 && t.tileC === 7);
    const side = h.spawn('enemy_dummy', { pos: [11, 7] });
    const d0 = Math.hypot(side.x - r.x, side.y - r.y);
    assert.ok(h.runUntil(() => !r.alive, 3));
    assert.ok(Math.hypot(side.x - r.x, side.y - r.y) < d0 - 0.1, 'pulled in (a push towards it)');
    void e;
    done(h);
  }
  // life 30 s (no enemy near), and gone with 黑键
  {
    const { h, u } = field({ tier: 5, skill: 1 });
    storeUp(h, u, 3, 1);
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5));
    const quiet = h.b.allyUnits.filter((t) => t.kind === 'token' && t.alive && Math.hypot(t.x - e.x, t.y - e.y) > 1.35);
    assert.ok(quiet.length >= 1, 'a remnant out of reach');
    assert.equal(h.b.tokenDef(REMNANT, u).talents[0].bb.duration, 30);
    h.b.kill(e, null);
    h.run(29);
    assert.ok(quiet.every((t) => t.alive), 'still there at 29 s');
    h.run(1.5);
    assert.ok(quiet.every((t) => !t.alive), 'gone after 30 s');
    done(h);
  }
  {
    const { h, u } = field({ tier: 5, skill: 1 });
    u.skill.gainSp(999);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.activations === 1, 5));
    h.b.kill(e, null);
    assert.ok(h.b.allyUnits.some((t) => t.kind === 'token' && t.alive));
    h.b.retreat(u);
    h.step();
    assert.ok(!h.b.allyUnits.some((t) => t.kind === 'token' && t.alive), 'withdrawn when he leaves');
    done(h);
  }
});

test('S3 寂静之声 (MANUAL, data DEFAULT): 30 s, ASPD +50 / +60, ATK +43 % / +50 %; attacks only elite or leader enemies (with none he stores elite energy); energies turn elite at its start, deal × talent_scale_multiplier (1.23 / 1.30); at its end one stays elite, the rest normal', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, false, null], [5, true, MY], [6, true, MX]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.bb.attack_speed, sk.bb.atk, sk.bb.talent_scale_multiplier, sk.spCost, sk.initSp],
      [30, elite ? 60 : 50, elite ? 0.5 : 0.43, elite ? 1.3 : 1.23, elite ? 22 : 24, elite ? 8 : 6]);
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const N = traitOf(tier, elite, mod).times;
    storeUp(h, u, 2, 0);
    u.skill.gainSp(999);
    let atCast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) atCast = stored(u); });
    const a = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 5), 'cast with an enemy in range');
    assert.deepEqual(atCast, { n: 0, e: 2 }, 'the stored energies turned elite');
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    const n0 = mainHits(h, u).length;
    h.run(8);
    assert.equal(mainHits(h, u).length, n0, 'never a normal enemy');
    assert.deepEqual(stored(u), { n: 0, e: N + 1 }, `elite energies only, up to ${N} + 1`);
    const el = h.spawn('enemy_elite', { pos: [11, 6] });
    assert.ok(h.runUntil(() => mainHits(h, u).length > n0, 5), 'the elite is attacked');
    const main = mainHits(h, u).at(-1);
    assert.equal(main.target, el);
    const en = energyHits(h, u).filter((c) => c.dmg.attackId === main.dmg.attackId);
    assert.equal(en.length, N + 1);
    const scale = talentOf(tier, elite, mod, 0).atk_scale * sk.bb.talent_scale_multiplier;
    approx(en[0].amount, u.s.atk * scale, `energies × ${scale}`, 1e-3);
    approx(u.s.aspd, u.base.aspd + sk.bb.attack_speed, 'ASPD');
    // at the end: one elite stays, the rest normal
    h.b.kill(el, null);
    h.runUntil(() => stored(u).e === N + 1, 30);
    u.skill.end('test');
    assert.deepEqual(stored(u), { n: N, e: 1 }, 'one elite kept, the rest normal (up to times)');
    void a;
    done(h);
  }
});
