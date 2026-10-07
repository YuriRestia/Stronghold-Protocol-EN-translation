// test/content/op_necras.test.js — the 自选 operator kit of 死芒 (char_450_necras, 6★ 塑灵术师; kit
// server/sim/content/kits/ops/op-necras.js) and of her summon 悲叹的仆役 (token_10043_necras_skeltn, and its special form),
// fielded the production way (a DIY slot + its `diy` pick) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module)
// and elite (E2 Lv60, rank 7) with no module or SOC-X 未处理的遗产 at stage 1 (tier 5) / 3 (tier 6). Numbers from
// data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_necras.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const NEC = 'char_450_necras';
const SKEL = 'token_10043_necras_skeltn';
const FORMS = BACKUPS.units[NEC].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const X = 'uniequip_002_necras';
const S1 = 'skchr_necras_1', S2 = 'skchr_necras_2', S3 = 'skchr_necras_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const skelOf = (tier, elite, skill) => {
  let v = BACKUPS.tokens[SKEL].variants[`${NEC}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const ENEMIES = {
  enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }),
  enemy_weak: enemyRec({ key: 'enemy_weak', hp: 100, speed: 0, mass: 0 }),
  enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.5, mass: 0 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], [5, true, null], [5, true, X], [6, true, null], [6, true, X]];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 死芒 as uid 1 at (10, 3) facing RIGHT: her 3-1 is rows 9–11 × cols 3–5 and (10, 6). */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 3, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'death', 'deploy', 'statusApplied', 'heal'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: NEC, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const skels = (u) => (u.mem.necras?.skels ?? []).filter((s) => s.alive);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Knock an enemy out at `pos` (the kill is credited to nobody: anyone's kill counts). */
function killAt(h, pos, key = 'enemy_weak') {
  const e = h.spawn(key, { pos });
  h.step();
  h.b.kill(e, null);
  return e;
}

test('死芒 in every 自选 form: her kit (all three skills authored), stats + module attributes, 3-1, blocks 1, ranged arts that hit air, 维多利亚, no 特质, the data triggers (S3 SKILL_RANGE on its 3-3); offered as a pick', () => {
  assert.equal(OPERATOR_KITS[NEC], KITS[NEC]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [NEC, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat], [1, 'ranged', true, 'arts', 1.6], `${label(f)}: 塑灵术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['victoriaShip'], []], `${label(f)}: bonds / 特质`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'SKILL_RANGE']);
  assert.deepEqual([modOf(5, X).attr, modOf(6, X).attr], [{ maxHp: 120, atk: 35 }, { maxHp: 200, atk: 55 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(NEC));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(NEC), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: NEC, skillIndex: 2, uniEquipId: X } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: NEC, skillIndex: 2, uniEquipId: X } } });
});

test('复燃: a knock-out on her range (anyone\'s, stealth ignored) makes a 悲叹的仆役 on its tile 0.1 s later (facing as she does); off her range nothing; up to 3, then the upgrade (+100 % HP / ATK, +40 % DEF, block +1, healed to full; not yet upgraded first), all upgraded: the lowest healed; they leave with her', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const t0 = formOf(tier, elite).talents.find((t) => t.index === 0).bb;
    const v = skelOf(tier, elite, 0);
    assert.deepEqual([t0.max_token_cnt, t0.max_hp, t0.atk, t0.def, t0.block_cnt], [3, 1, 1, 0.4, 1], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    killAt(h, [10, 5]);
    assert.equal(skels(u).length, 0, `T${tier}: not at once`);
    h.run(0.11);
    const [a] = skels(u);
    assert.ok(a, `T${tier}: one 0.1 s later`);
    assert.deepEqual([a.tileR, a.tileC, a.dir, a.defId], [10, 5, u.dir, SKEL], `T${tier}: on the kill tile, facing as she does`);
    assert.deepEqual([a.base.maxHp, a.base.atk, a.base.def, a.s.blockCnt, a.profile.dmgType, a.profile.attack, a.profile.canHitFly], [v.stats.maxHp, v.stats.atk, v.stats.def, 1, 'arts', 'melee', false], `T${tier}: the token's stats, arts melee, ground only`);
    assert.deepEqual(a.liveRangeGrid, v.rangeGrid, `T${tier}: x-5`);
    assert.ok(a.s.flags.noHeal && a.s.flags.noSp && a.s.flags.silence, `T${tier}: 禁疗, 阻回, 沉默`);
    killAt(h, [10, 8]);
    h.run(0.2);
    assert.equal(skels(u).length, 1, `T${tier}: off her range — nothing`);
    killAt(h, [9, 4]);
    h.run(0.2);
    killAt(h, [11, 4]);
    h.run(0.2);
    assert.equal(skels(u).length, 3, `T${tier}: three`);
    const [, b, c] = skels(u);
    b.hp = b.s.maxHp * 0.5;
    c.hp = c.s.maxHp * 0.3;
    killAt(h, [10, 4]);
    h.run(0.2);
    assert.equal(skels(u).length, 3, `T${tier}: no 4th`);
    assert.ok(c.findBuff('necras:upgrade') && !a.findBuff('necras:upgrade') && !b.findBuff('necras:upgrade'), `T${tier}: the lowest-HP one upgraded`);
    assert.deepEqual(c.findBuff('necras:upgrade').mods, { hpPct: 1, atkPct: 1, defPct: 0.4, blockCnt: 1 });
    assert.deepEqual([c.hp, c.s.maxHp, c.s.blockCnt], [c.base.maxHp * 2, c.base.maxHp * 2, 2], `T${tier}: healed to full, block 2`);
    killAt(h, [10, 4]);
    h.run(0.2);
    killAt(h, [10, 4]);
    h.run(0.2);
    assert.ok(skels(u).every((s) => s.findBuff('necras:upgrade')), `T${tier}: all three upgraded`);
    b.hp = 100;
    killAt(h, [10, 4]);
    h.run(0.2);
    assert.equal(b.hp, b.s.maxHp, `T${tier}: all upgraded — the lowest healed`);
    h.b.kill(u, null);
    assert.equal(skels(u).length, 0, `T${tier}: they leave with her`);
    done(h);
  }
});

test('复燃: no deployable kill tile ⇒ a random free low melee tile of her range, those with an enemy first; no tile at all ⇒ the upgrade instead', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 1, others: [
    { uid: 3, chessId: 'chess_char_1_02_a', row: 9, col: 3 }, { uid: 4, chessId: 'chess_char_1_02_a', row: 9, col: 4 }, { uid: 5, chessId: 'chess_char_1_02_a', row: 9, col: 5 },
    { uid: 6, chessId: 'chess_char_1_02_a', row: 11, col: 3 }, { uid: 7, chessId: 'chess_char_1_02_a', row: 11, col: 4 }, { uid: 8, chessId: 'chess_char_1_02_a', row: 11, col: 5 },
  ] });
  // her range: (9|10|11, 3–5) + (10, 6); free: (10, 4), (10, 5), (10, 6); an enemy stands on (10, 6)
  h.spawn('enemy_dummy', { pos: [10, 6] });
  // a kill on a taken tile (an operator on it) ⇒ the tile with the enemy
  killAt(h, [9, 4]);
  h.run(0.2);
  const [a] = skels(u);
  assert.deepEqual([a.tileR, a.tileC], [10, 6], 'the free tile with an enemy');
  killAt(h, [9, 5]);
  h.run(0.2);
  killAt(h, [9, 5]);
  h.run(0.2);
  assert.deepEqual(skels(u).map((s) => [s.tileR, s.tileC]).sort(), [[10, 4], [10, 5], [10, 6]], 'then the other free tiles');
  done(h);
});

test('回光黯淡: her and her summons\' damage on an enemy below 60 % HP ×1.45 (the final damage); SOC-X "攻击力提升至115%" on an enemy her summon blocks (stage 1 and 3), which she can attack anywhere', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, X], [6, true, X]]) {
    const f = label([tier, elite, mod]);
    const { h, u } = field({ tier, elite, mod, skill: 1, row: 9, col: 3 });
    const e = h.spawn('enemy_dummy', { pos: [9, 5] });
    h.run(3);
    const hits = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.dmg.isAttack);
    const full = hits().at(-1).amount;
    approx(full, u.s.atk, `${f}: ×1 at full HP`);
    e.hp = e.s.maxHp * 0.59;
    const n0 = hits().length;
    h.run(2);
    approx(hits().slice(n0).at(-1).amount, u.s.atk * 1.45, `${f}: ×1.45 below 60 %`);
    done(h);
  }
  // the trait: she attacks the enemy her summon blocks out of her range (×1.15 with SOC-X)
  for (const [tier, elite, mod, mul] of [[5, false, null, 1], [5, true, X, 1.15], [6, true, X, 1.15]]) {
    const f = label([tier, elite, mod]);
    const { h, u } = field({ tier, elite, mod, skill: 1, row: 12, col: 8 });
    // her range: rows 11–13 × cols 8–10 and (12, 11); a 悲叹的仆役 made on (11, 9) blocks a walker on row 11 coming from the right
    killAt(h, [11, 9]);
    h.run(0.2);
    const [s] = skels(u);
    assert.deepEqual([s.tileR, s.tileC], [11, 9]);
    const w = h.spawn('enemy_walk', { pos: [11, 13] });
    assert.ok(h.runUntil(() => w.blockedBy === s, 20), `${f}: blocked by her summon`);
    h.step(3);
    assert.ok(u.extraRangeKeys && u.extraRangeKeys.includes(Math.round(w.y) * 21 + Math.round(w.x)), `${f}: its tile is her target`);
    const n0 = h.hooksOf('damaged').filter((c) => c.source === u && c.target === w).length;
    h.run(4);
    const hit = h.hooksOf('damaged').filter((c) => c.source === u && c.target === w && c.dmg.isAttack).slice(n0);
    assert.ok(hit.length >= 1, `${f}: she attacks it`);
    approx(hit[0].amount, u.s.atk * mul, `${f}: ×${mul}`);
    done(h);
  }
});

test('SOC-X stage 3: a knock-out on her range or her summons\' ranges ⇒ her ATK +25 % for 10 s (refreshed); one on a summon\'s range only also makes a 悲叹的仆役 (a random tile of her range) — none of it at stage 1', () => {
  for (const [tier, mod, on] of [[5, X, false], [6, X, true], [6, null, false]]) {
    const f = label([tier, true, mod]);
    const { h, u } = field({ tier, elite: true, mod, skill: 1, row: 10, col: 3 });
    // a summon on the tip of her range (10, 6): its x-5 reaches (10, 7), (9, 6), (11, 6) — outside hers
    killAt(h, [10, 6]);
    h.run(0.2);
    const [s] = skels(u);
    assert.deepEqual([s.tileR, s.tileC], [10, 6]);
    assert.equal(!!u.findBuff('necras:killAtk'), on, `${f}: ATK buff`);
    if (on) {
      assert.deepEqual(u.findBuff('necras:killAtk').mods, { atkPct: 0.25 });
      approx(u.findBuff('necras:killAtk').timeLeft, 10 - 0.2, `${f}: 10 s`, 0.02);
      h.run(5);
      killAt(h, [9, 4]);
      approx(u.findBuff('necras:killAtk').timeLeft, 10, `${f}: refreshed`, 0.02);
      h.run(0.2);
    }
    const n = skels(u).length;
    killAt(h, [10, 7]);
    h.run(0.2);
    assert.equal(skels(u).length, on ? n + 1 : n, `${f}: the summon-range kill makes one (stage 3 only)`);
    done(h);
  }
});

test('S1 噩愿: each 悲叹的仆役 made or upgraded strikes every enemy within 1.5 for her ATK × 310 % / 370 % arts (air units too); the cast re-makes them all — 1 per summon, 2 per upgraded one, 1 with none', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.bb.atk_scale, sk.bb.range_radius], [elite ? 3.7 : 3.1, 1.5]);
    const { h, u } = field({ tier, elite, skill: 0 });
    const near = h.spawn('enemy_fly', { pos: [11, 5] });
    const far = h.spawn('enemy_dummy', { pos: [12, 7] });
    killAt(h, [10, 5]);
    h.run(0.2);
    const by = (t) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === t && c.dmg.tags?.includes('necras:s1'));
    assert.equal(by(near).length, 1, `T${tier}: the flyer within 1.5`);
    approx(by(near)[0].amount, u.s.atk * sk.bb.atk_scale, `T${tier}: ${sk.bb.atk_scale * 100} % ATK`);
    assert.equal(by(far).length, 0, `T${tier}: farther untouched`);
    // fill to 3 and upgrade one (another strike)
    killAt(h, [10, 4]);
    h.run(0.2);
    killAt(h, [11, 4]);
    h.run(0.2);
    const k0 = by(near).length;
    killAt(h, [10, 4]);
    h.run(0.2);
    assert.ok(skels(u).some((s) => s.findBuff('necras:upgrade')));
    assert.ok(by(near).length >= k0, `T${tier}: the upgrade strikes too`);
    // the cast: 2 + 1 + 1 = 4 credits ⇒ 3 summons + 1 upgrade
    const old = skels(u).map((s) => s.id);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `T${tier}: cast`);
    h.run(0.5);
    const now = skels(u);
    assert.equal(now.length, 3, `T${tier}: three again`);
    assert.ok(now.every((s) => !old.includes(s.id)), `T${tier}: all re-made`);
    assert.equal(now.filter((s) => s.findBuff('necras:upgrade')).length, 1, `T${tier}: the 4th credit upgrades one`);
    done(h);
  }
  // none on the field ⇒ one
  const { h, u } = field({ tier: 6, elite: true, skill: 0 });
  h.spawn('enemy_dummy', { pos: [10, 5] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 4));
  h.run(0.3);
  assert.equal(skels(u).length, 1, 'none ⇒ one');
  done(h);
});

test('S2 折朽: 12 s; up to 2 enemies of her range sleep while linked and take her ATK × 100 % / 130 % arts every 0.5 s through it; no attack meanwhile; a linked one knocked out ⇒ +2 summons; every link broken ⇒ the skill ends and the sleep with it', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.bb.atk_scale, sk.bb.max_target, sk.bb.interval, sk.bb.additional_token_cnt], [12, elite ? 1.3 : 1, 2, 0.5, 2], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    const a = h.spawn('enemy_dummy', { pos: [10, 5] });
    const b = h.spawn('enemy_dummy', { pos: [9, 5] });
    const c = h.spawn('enemy_dummy', { pos: [11, 5] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast`);
    const slept = [a, b, c].filter((e) => e.findBuff('sleep'));
    assert.equal(slept.length, 2, `T${tier}: two asleep`);
    assert.deepEqual(u.skill.spec.attack, { noAttack: true });
    const t0 = h.b.time;
    h.run(3.01);
    const ticks = h.hooksOf('damaged').filter((x) => x.source === u && slept.includes(x.target) && x.dmg.tags?.includes('necras:s2') && x.t > t0 - 1e-9);
    assert.equal(ticks.length, 12, `T${tier}: 6 ticks each in 3 s`);
    for (const x of ticks) approx(x.amount, u.s.atk * sk.bb.atk_scale * (1 - x.target.s.res / 100), `T${tier}: ${sk.bb.atk_scale * 100} % arts`, 1e-3);
    assert.ok(ticks.every((x) => x.target.findBuff('sleep')), `T${tier}: through the sleep`);
    // a linked one knocked out ⇒ +2 summons (and 复燃's own one on its tile)
    const n0 = skels(u).length;
    h.b.kill(slept[0], null);
    h.run(0.4);
    assert.equal(skels(u).length, n0 + 3, `T${tier}: 2 + 1 summons`);
    assert.ok(u.skill.active, `T${tier}: one link left`);
    h.b.kill(slept[1], null);
    h.step(3);
    assert.equal(u.skill.active, false, `T${tier}: every link broken ⇒ ends`);
    done(h);
  }
  // the end releases the sleep; a stun interrupts it
  const { h, u } = field({ tier: 6, elite: true, skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  assert.ok(e.findBuff('sleep'));
  h.b.applyStatus(u, 'stun', { duration: 1 });
  h.step(3);
  assert.ok(!u.skill.active && !e.findBuff('sleep'), 'stunned: interrupted, the sleep gone');
  done(h);
});

test('S3 冠死以冕: the next 悲叹的仆役 is the special form (+200 % HP / ATK, +100 % DEF, +10 RES, +0.7 s, block +1; 怨火缠身 15 SP / 8 s, 120 % ATK / s on its 1-1); the cast (SKILL_RANGE, 3-3 meanwhile): 2 strikes at her attack interval on every enemy of the 3-3 (550 % / 650 %), each consuming a normal summon to upgrade it (twice for an upgraded one; +80 / 80 / 40 %, heal 20 %, 3rd: block +1, 攻击距离 +1)', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    const v = skelOf(tier, elite, 2);
    const dr = formOf(tier, elite).talents.find((t) => t.index === 3).bb;
    assert.deepEqual([dr.max_hp, dr.atk, dr.def, dr.magic_resistance, dr.base_attack_time, dr.block_cnt], [2, 2, 1, 10, 0.7, 1]);
    assert.deepEqual([sk.bb['attack@atk_scale'], sk.bb['attack@max_hp'], sk.bb['attack@atk'], sk.bb['attack@def'], sk.bb['attack@hp_ratio'], sk.bb['attack@max_stack_cnt'], sk.rangeId], [elite ? 6.5 : 5.5, 0.8, 0.8, 0.4, 0.2, 6, '3-3'], `T${tier}`);
    assert.deepEqual([v.skill.skillId, v.skill.spCost, v.skill.bb['attack@atk_scale'], v.skill.bb['attack@duration']], ['sktok_necras_skeltn_3', 15, 1.2, 8]);
    const { h, u } = field({ tier, elite, skill: 2 });
    killAt(h, [10, 5]);
    h.run(0.2);
    const [d] = skels(u);
    assert.ok(d.mem.necrasDragon, `T${tier}: the first one is the special form`);
    assert.deepEqual([d.s.maxHp, d.s.atk, d.s.def, d.s.res, d.s.blockCnt], [d.base.maxHp * 3, d.base.atk * 3, d.base.def * 2, d.base.res + 10, 2], `T${tier}: the special form's attributes`);
    approx(d.s.bat, d.base.bat + 0.7, `T${tier}: +0.7 s`);
    assert.ok(!d.s.flags.noSp && d.skill.spCost === 15, `T${tier}: its skill charges`);
    killAt(h, [10, 4]);
    h.run(0.2);
    killAt(h, [11, 4]);
    h.run(0.2);
    const [, n1, n2] = skels(u);
    assert.ok(!n1.mem.necrasDragon && !n2.mem.necrasDragon && n1.s.flags.noSp, `T${tier}: the others normal, 阻回`);
    // upgrade n1 (the earliest normal one), so its consumption upgrades twice
    killAt(h, [10, 4]);
    h.run(0.2);
    assert.equal([n1, n2].filter((x) => x.findBuff('necras:upgrade')).length, 1, `T${tier}: one normal summon upgraded`);
    const up1 = n1.findBuff('necras:upgrade') ? n1 : n2;
    // the cast
    const foe = h.spawn('enemy_dummy', { pos: [9, 6] });
    const u0atk = u.s.atk;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 2), `T${tier}: SKILL_RANGE — an enemy in the 3-3`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 3-3 while it runs`);
    const tCast = h.b.time;
    assert.ok(h.runUntil(() => !u.skill.active, 5), `T${tier}: ends after its 2 strikes`);
    const strikes = h.hooksOf('damaged').filter((x) => x.source === u && x.target === foe && x.dmg.tags?.includes('necras:s3'));
    assert.equal(strikes.length, 2, `T${tier}: 2 strikes`);
    approx(strikes[0].amount, u0atk * sk.bb['attack@atk_scale'] * (1 - foe.s.res / 100), `T${tier}: ${sk.bb['attack@atk_scale'] * 100} % arts`, 1e-3);
    approx(strikes[1].t - strikes[0].t, u.s.interval, `T${tier}: at her attack interval`, 0.05);
    void tCast;
    h.run(0.3);
    assert.ok(!n1.alive && !n2.alive, `T${tier}: both normal summons consumed`);
    void up1;
    assert.equal(d.mem.necrasUps, 3, `T${tier}: 2 (the upgraded one) + 1 upgrades`);
    assert.deepEqual(d.findBuff('necras:dragonUp').mods, { hpPct: 0.8 * 3, atkPct: 0.8 * 3, defPct: 0.4 * 3, blockCnt: 1, rangeExtend: 1 }, `T${tier}: 3 upgrades — block +1, 攻击距离 +1`);
    assert.equal(u.liveRangeGrid.length, formOf(tier, elite).rangeGrid.length, `T${tier}: her range back`);
    done(h);
  }
});

test('怨火缠身 (the special form\'s skill): 15 SP over time, 8 s, its ATK × 120 % arts every second on every enemy of its 1-1; the normal forms never cast (阻回)', () => {
  const { h, u } = field({ tier: 6, elite: true, skill: 2 });
  killAt(h, [10, 5]);
  h.run(0.2);
  const [d] = skels(u);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => d.skill.active, 17), 'cast at 15 SP with an enemy in range');
  approx(d.skill.timeLeft, 8, '8 s', 0.05);
  const t0 = h.b.time;
  h.runUntil(() => !d.skill.active, 10);
  const ticks = h.hooksOf('damaged').filter((x) => x.source === d && x.target === e && x.dmg.isSkill && x.t >= t0 - 1e-9);
  assert.equal(ticks.length, 8, 'one per second for 8 s');
  approx(ticks[0].amount, d.s.atk * 1.2 * (1 - e.s.res / 100), '120 % arts', 1e-3);
  done(h);
});

test('复燃: a stealthed enemy knocked out on her range counts (天赋无视隐匿); with no free tile left the summon becomes the upgrade', () => {
  const tiles = [[9, 3], [9, 4], [9, 5], [11, 3], [11, 4], [11, 5], [10, 4], [10, 6]];
  const { h, u } = field({ tier: 6, elite: true, skill: 1, others: tiles.map(([r, c], i) => ({ uid: 3 + i, chessId: 'chess_char_1_02_a', row: r, col: c })) });
  const e = h.spawn('enemy_weak', { pos: [10, 5] });
  h.step();
  h.b.addBuff(e, { key: 'test:stealth', flags: { stealth: true } });
  h.step();
  h.b.kill(e, null);
  h.run(0.2);
  const [s1] = skels(u);
  assert.ok(s1, 'a summon for the stealthed one');
  assert.deepEqual([s1.tileR, s1.tileC], [10, 5]);
  killAt(h, [9, 4]);
  h.run(0.2);
  assert.equal(skels(u).length, 1, 'no free tile: no second summon');
  assert.ok(s1.findBuff('necras:upgrade'), '… the upgrade instead');
  done(h);
});
