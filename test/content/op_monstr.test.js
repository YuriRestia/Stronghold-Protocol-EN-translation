// test/content/op_monstr.test.js — the 自选 operator kit of Mon3tr (char_4179_monstr, 6★ 链愈师; kit
// server/sim/content/kits/ops/op-monstr.js) and her summon 重构体 (token_10050_monstr_prosts), fielded the production way (a
// DIY slot + its `diy` pick; the 重构体 as a token piece of hers) in every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no
// module) and elite (E2 Lv60, rank 7) with no module or XAH-X 记忆存档 at stage 1 (tier 5) / 3 (tier 6). Every number is read
// back from data/backups.json (the form of that slot status, the token's variant); the fidelity checklist of kits/README.md
// item by item.
// Run: node --test test/content/op_monstr.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const MONSTR = 'char_4179_monstr';
const PROSTS = 'token_10050_monstr_prosts';
const FORMS = BACKUPS.units[MONSTR].forms;
const TOKEN = BACKUPS.tokens[PROSTS];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const XAHX = 'uniequip_002_monstr';
const S1 = 'skchr_monstr_1', S2 = 'skchr_monstr_2', S3 = 'skchr_monstr_3';
const statusKey = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusKey(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const variantOf = (tier, elite) => TOKEN.variants[`${MONSTR}@${statusKey(tier, elite)}`];
/** The trait / T1 blackboards a form fights with (module changes applied). */
const traitOf = (tier, elite, mod) => (elite && mod ? modOf(tier, mod).traitOverride.bb : formOf(tier, elite).trait.bb);
const t0Of = (tier, elite, mod) => (elite && mod && modOf(tier, mod).talentChanges.find((t) => t.talentIndex === 0)?.bb) || formOf(tier, elite).talents.find((t) => t.index === 0).bb;
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_biter: dummy('enemy_biter', { atk: 300, range: 1.2, bat: 1 }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, XAHX].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
const YAK = 'chess_char_1_02_a', ESTELLE = 'chess_char_1_12_a', SILENCE = 'chess_char_2_02_a', PERFUMER = 'chess_char_2_14_a';

/**
 * A battle with Mon3tr as uid 1 at (10, 4) facing RIGHT (`prosts`: her piece as uid 2), plus `others`; `log` = her heals /
 * damage in the order they happen.
 */
function field({ tier = 5, elite = false, mod = null, skill = 0, prosts = null, others = [], seed = 5, dp = 99 } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: MONSTR, skillIndex: skill, uniEquipId: mod }, elite, row: 10, col: 4 }];
  if (prosts) units.push({ uid: 2, kind: 'token', tokenId: PROSTS, ownerUid: 1, row: prosts.row, col: prosts.col });
  const log = [];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: dp, dpPerSec: 0, dpMax: 999 },
    hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'death', 'deploy', 'fatal'], captureNoisy: true,
    units: [...units, ...others],
    setup: (b) => {
      b.on('heal', (c) => { if (!c.opts?.regen) log.push({ name: 'heal', ...c, t: b.time }); }, { priority: -1000 });
      b.on('damaged', (c) => log.push({ name: 'damaged', ...c, t: b.time }), { priority: -1000 });
    },
  });
  h.step();
  return { h, u: h.unit(1), p: prosts ? h.unit(2) : null, log };
}
const healsOf = (log, u, from = 0) => log.slice(from).filter((c) => c.name === 'heal' && c.source === u);
const setHp = (x, r) => { x.hp = x.s.maxHp * r; };
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('Mon3tr in every 自选 form: her operator kit (all three skills authored), stats + module attributes, y-2, one main heal per attack (her own chain), blocks 1, ground-targetable, 罗德岛, no 特质; her 重构体: the form\'s token stats, 禁疗, block 0, taunt −1', () => {
  assert.equal(OPERATOR_KITS[MONSTR], KITS[MONSTR]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u, p } = field({ tier, elite, mod, skill, prosts: { row: 10, col: 6 } });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [MONSTR, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.bat, u.base.cost], [form.stats.maxHp, form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 2.85, 16], `${label(f)}: stats`);
      assert.deepEqual([u.profile.dmgType, u.profile.heal, u.profile.attack, u.def.subProf, u.s.blockCnt], ['heal', { mode: 'single' }, 'ranged', 'chainhealer', 1], `${label(f)}: 链愈师`);
      assert.deepEqual(u.def.traitBb, traitOf(tier, elite, mod), `${label(f)}: the trait (XAH-X 0.85)`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: y-2`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds, u.def.tokens, u.def.raw.nationId], [BACKUPS.diy.operators[MONSTR].bonds, [], [PROSTS], 'rhodes'], `${label(f)}: bonds / 特质 / summon`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: enemies target her`);
      const ts = ((elite && mod && variantOf(tier, elite).byModule?.[mod]) || variantOf(tier, elite)).stats;
      assert.deepEqual([p.base.maxHp, p.base.def, p.base.atk, p.base.cost, p.base.respawnTime, p.s.blockCnt, p.s.taunt], [ts.maxHp, ts.def, 0, 3, 15, 0, -1], `${label(f)}: 重构体 stats`);
      assert.deepEqual([p.s.flags.noHeal, p.s.flags.noBlock, p.profile.noAttack, !!p.kit.generic, p.alive], [true, true, true, false, true], `${label(f)}: 禁疗, blocks nothing, no attack, on the field`);
      done(h);
    }
  }
  // E2 Lv1 1492 / 447 / 176, E2 Lv60 1653 / 517 / 206; XAH-X +40 / +30 → +65 / +40 ATK / DEF; the 重构体 4292 / 181 → 5048 / 208
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1492, 447, 1653, 517]);
  assert.deepEqual([modOf(5, XAHX).attr, modOf(6, XAHX).attr], [{ atk: 40, def: 30 }, { atk: 65, def: 40 }]);
  assert.deepEqual([variantOf(5, false).stats.maxHp, variantOf(5, false).stats.def, variantOf(6, true).stats.maxHp], [4292, 181, 5048]);
  assert.deepEqual([t0Of(5, true, XAHX).atk, t0Of(6, true, XAHX).atk, t0Of(6, true, XAHX)['attack@chain.extra_cnt'], t0Of(6, false, null).atk], [0.2, 0.3, 1, 0.2]);
});

test('a 自选 pick: Mon3tr is offered at tiers 5 and 6 (she has a kit) and a roster with her and XAH-X passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(MONSTR));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(MONSTR), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: MONSTR, skillIndex: 2, uniEquipId: XAHX } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: MONSTR, skillIndex: 2, uniEquipId: XAHX } } });
});

test('trait 链愈师: the heal jumps to the lowest-HP-ratio injured ally of the 3×3 around the last one healed, ×0.75 per jump (XAH-X ×0.85), 3 units healed; a full-HP unit and one two tiles away are skipped', () => {
  for (const f of [[5, false, null], [6, true, null], [5, true, XAHX], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const step = traitOf(tier, elite, mod)['attack@chain.atk_scale'];
    assert.equal(step, mod ? 0.85 : 0.75, label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: ESTELLE, row: 11, col: 6 }, { uid: 5, chessId: SILENCE, row: 12, col: 7 },
      { uid: 6, chessId: PERFUMER, row: 9, col: 7 }, { uid: 7, chessId: 'chess_char_1_11_a', row: 10, col: 6 }];
    const { h, u, log } = field({ tier, elite, mod, skill: 2, others });
    const [A, B, C, F, G] = [3, 4, 5, 6, 7].map((i) => h.unit(i));
    setHp(A, 0.2); setHp(B, 0.5); setHp(C, 0.6); setHp(F, 0.3);
    const n0 = log.length;
    assert.ok(h.runUntil(() => healsOf(log, u, n0).length > 0, 4), label(f));
    h.step();
    const hs = healsOf(log, u, n0).filter((c) => c.t === healsOf(log, u, n0)[0].t);
    assert.deepEqual(hs.map((c) => c.target), [A, B, C], `${label(f)}: A → B → C (G full, F two tiles off)`);
    const atk = u.s.atk;
    approx(hs[0].amount, atk, `${label(f)}: the main heal`);
    approx(hs[1].amount, atk * step, `${label(f)}: ×${step}`);
    approx(hs[2].amount, atk * step * step, `${label(f)}: ×${step}²`);
    assert.ok(!healsOf(log, u, n0).some((c) => c.target === F || c.target === G), `${label(f)}: F / G not healed`);
    done(h);
  }
});

test('T1 自我修复 free link: her 重构体 in a chain uses no target of the count and the next jump keeps the amount; XAH-X stage 3: one more jump without decay', () => {
  for (const f of [[5, false, null], [5, true, XAHX], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const step = traitOf(tier, elite, mod)['attack@chain.atk_scale'];
    const extra = t0Of(tier, elite, mod)['attack@chain.extra_cnt'] ?? 0;
    assert.equal(extra, tier === 6 && mod ? 1 : 0, label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: ESTELLE, row: 11, col: 6 }, { uid: 5, chessId: SILENCE, row: 12, col: 7 }];
    const { h, u, p, log } = field({ tier, elite, mod, skill: 2, prosts: { row: 11, col: 5 }, others });
    const [A, B, C] = [3, 4, 5].map((i) => h.unit(i));
    setHp(A, 0.2); setHp(p, 0.3); setHp(B, 0.5); setHp(C, 0.6);
    const n0 = log.length;
    assert.ok(h.runUntil(() => healsOf(log, u, n0).length > 0, 4), label(f));
    const hs = healsOf(log, u, n0).filter((c) => c.t === healsOf(log, u, n0)[0].t);
    assert.deepEqual(hs.map((c) => c.target), [A, p, B, C], `${label(f)}: A → 重构体 → B → C (4 healed: the 重构体 is not counted)`);
    const atk = u.s.atk;
    approx(hs[1].amount, atk * step, `${label(f)}: the jump onto it decays`);
    approx(hs[2].amount, atk * step, `${label(f)}: the next one does not`);
    approx(hs[3].amount, atk * step * (extra ? 1 : step), `${label(f)}: then ${extra ? 'still no decay (下次跳跃也不衰减)' : 'it decays again'}`);
    done(h);
  }
});

test('T1 自我修复 — the 重构体: only her heals reach it (禁疗), it loses 8 HP every 0.1 s from 1 s after it lands, every ally of its 3×3 ATK +20 % (XAH-X stage 3 +30 %; not 2 tiles away); gone ⇒ back 15 s later for 3 DP while she stands; withdrawn when she leaves, her redeployment readies it', () => {
  for (const f of [[5, false, null], [6, true, XAHX], [5, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const atkUp = t0Of(tier, elite, mod).atk;
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 6 }, { uid: 4, chessId: ESTELLE, row: 12, col: 6 }, { uid: 5, chessId: SILENCE, row: 9, col: 3 }];
    const { h, u, p } = field({ tier, elite, mod, skill: 0, prosts: { row: 10, col: 6 }, others, dp: 50 });
    const yak = h.unit(3), tx = h.unit(4), sil = h.unit(5);
    h.run(0.3);
    approx(yak.s.atk, yak.base.atk * (1 + atkUp), `${label(f)}: 角峰 next to it ATK +${atkUp * 100} %`);
    approx(u.s.atk, u.base.atk, `${label(f)}: Mon3tr (two tiles off) nothing`);
    approx(tx.s.atk, tx.base.atk, `${label(f)}: 艾丝黛尔 (two rows off) nothing`);
    assert.equal(p.findBuff('talent:monstr:prostsAtk'), null, `${label(f)}: not itself`);
    // the 流失: none in the first second, then 80 per second
    const hp0 = p.hp;
    assert.equal(hp0, p.s.maxHp);
    h.run(0.6);
    assert.equal(p.hp, hp0, `${label(f)}: nothing before 1 s`);
    h.run(1.0);
    const lost = hp0 - p.hp;
    assert.ok(lost > 60 && lost < 100, `${label(f)}: ≈80 HP in the next second (${lost})`);
    assert.ok(h.hooksOf('damaged').some((c) => c.target === p && c.dmg?.tags?.includes('hpLoss')), `${label(f)}: a 流失`);
    // 禁疗: 赫默 never heals it; Mon3tr does
    setHp(p, 0.3);
    h.run(6);
    assert.equal(h.hooksOf('heal').filter((c) => c.source === sil && c.target === p).length, 0, `${label(f)}: no heal from 赫默`);
    assert.ok(h.hooksOf('heal').some((c) => c.source === u && c.target === p), `${label(f)}: Mon3tr heals it`);
    // destroyed: back 15 s later for 3 DP
    const dp0 = h.b.players[0].dp;
    h.b.kill(p, null);
    h.run(14.5);
    assert.ok(!p.alive, `${label(f)}: not before 15 s`);
    h.run(0.7);
    assert.ok(p.alive, `${label(f)}: back`);
    assert.deepEqual([p.tileR, p.tileC], [10, 6], `${label(f)}: on its tile`);
    approx(h.b.players[0].dp, dp0 - 3, `${label(f)}: 3 DP`);
    // she leaves: withdrawn; it comes with her redeployment at once
    h.b.kill(u, null);
    h.step();
    assert.ok(!p.alive && !p.removed, `${label(f)}: withdrawn with her`);
    assert.ok(h.runUntil(() => u.alive, 90), `${label(f)}: she redeploys`);
    assert.ok(h.runUntil(() => p.alive, 0.3), `${label(f)}: at once`);
    done(h);
  }
});

test('T2 战术协同: each heal of hers gives its target and her ASPD +22 for 10 s (no stacking: refreshed); under S2 ×1.8 / ×2.3 — the strongest effect stays', () => {
  for (const f of [[5, false, null], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const t1 = formOf(tier, elite).talents.find((t) => t.index === 1).bb;
    const s2 = skillOf(tier, elite, S2);
    assert.deepEqual([t1.attack_speed, t1.buff_duration, s2.bb.talent_scale], [22, 10, elite ? 2.3 : 1.8], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }];
    const { h, u, log } = field({ tier, elite, mod, skill: 1, others });
    const yak = h.unit(3);
    setHp(yak, 0.3);
    const n0 = log.length;
    assert.ok(h.runUntil(() => healsOf(log, u, n0).length > 0, 4), label(f));
    assert.deepEqual([yak.findBuff('talent:monstr:aspd')?.mods, u.findBuff('talent:monstr:aspd')?.mods], [{ aspd: 22 }, { aspd: 22 }], `${label(f)}: target and herself`);
    approx(yak.findBuff('talent:monstr:aspd').timeLeft, 10, `${label(f)}: 10 s`, 0.05);
    assert.equal(yak.s.aspd, yak.base.aspd + 22, label(f));
    // S2 (an enemy in her y-2): ×talent_scale
    h.spawn('enemy_dummy', { pos: [11, 6] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 2), `${label(f)}: S2`);
    setHp(yak, 0.3);
    const n1 = log.length;
    assert.ok(h.runUntil(() => healsOf(log, u, n1).some((c) => c.target === yak), 6), label(f));
    approx(yak.findBuff('talent:monstr:aspd').mods.aspd, 22 * s2.bb.talent_scale, `${label(f)}: ×${s2.bb.talent_scale}`);
    approx(u.findBuff('talent:monstr:aspd').mods.aspd, 22 * s2.bb.talent_scale, `${label(f)}: herself too`);
    done(h);
  }
});

test('S1 策略：超压链接 (AUTO, attack SP 5 / 3, data DEFAULT — the next heal): that heal is 135 % / 170 % ATK and heals 4 units', () => {
  for (const f of [[5, false, null], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    const step = traitOf(tier, elite, mod)['attack@chain.atk_scale'];
    assert.deepEqual([sk.skillType, sk.spType, sk.spCost, sk.initSp, sk.bb.heal_scale, sk.bb['chain.max_target'], sk.trigger.rule],
      ['AUTO', 'INCREASE_WHEN_ATTACK', elite ? 3 : 5, 0, elite ? 1.7 : 1.35, 4, 'DEFAULT'], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 10, col: 5 }, { uid: 4, chessId: ESTELLE, row: 11, col: 6 }, { uid: 5, chessId: SILENCE, row: 12, col: 7 }, { uid: 6, chessId: PERFUMER, row: 12, col: 8 }];
    const { h, u, log } = field({ tier, elite, mod, skill: 0, others });
    const [A, B, C, D] = [3, 4, 5, 6].map((i) => h.unit(i));
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost], ['DEFAULT', 'attack', sk.spCost], label(f));
    u.skill.gainSp(999);
    setHp(A, 0.2); setHp(B, 0.4); setHp(C, 0.5); setHp(D, 0.6);
    const n0 = log.length;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `${label(f)}: cast as she heals`);
    const hs = healsOf(log, u, n0);
    assert.deepEqual(hs.slice(0, 4).map((c) => c.target), [A, B, C, D], `${label(f)}: 4 units`);
    const base = u.s.atk * sk.bb.heal_scale;
    hs.slice(0, 4).forEach((c, i) => approx(c.amount, base * step ** i, `${label(f)}: link ${i}`));
    assert.ok(!u.skill.active, `${label(f)}: spent on that heal`);
    done(h);
  }
});

test('S2 策略：超负荷 (MANUAL, data SKILL_RANGE on y-2: an enemy there; 30 s): her 重构体 in range is her heal target, even at full HP with nobody injured; 0.6 s after her attack healed it a second chain starts on it', () => {
  for (const f of [[5, false, null], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.duration, sk.trigger.rule, sk.rangeId, sk.spCost, sk.initSp], [30, 'SKILL_RANGE', 'y-2', 15, elite ? 8 : 7], label(f));
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 5 }, { uid: 4, chessId: ESTELLE, row: 12, col: 6 }];
    const { h, u, p, log } = field({ tier, elite, mod, skill: 1, prosts: { row: 10, col: 5 }, others });
    const yak = h.unit(3), tx = h.unit(4);
    assert.equal(u.skill.rule, 'SKILL_RANGE');
    u.skill.gainSp(999);
    setHp(yak, 0.3);
    h.run(2);
    assert.equal(u.skill.activations, 0, `${label(f)}: an injured ally, no enemy: no cast`);
    h.spawn('enemy_dummy', { pos: [9, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 0.5), `${label(f)}: an enemy in her y-2`);
    approx(u.skill.timeLeft, 30, `${label(f)}: 30 s`, 0.05);
    // 角峰 is lower, the 重构体 is still the target
    setHp(p, 0.9); setHp(yak, 0.2);
    let n0 = log.length;
    assert.ok(h.runUntil(() => healsOf(log, u, n0).length > 0, 4), label(f));
    const first = healsOf(log, u, n0);
    assert.equal(first[0].target, p, `${label(f)}: the 重构体 first`);
    const t0 = first[0].t;
    // the second chain 0.6 s later, on it again
    h.run(0.7);
    const again = healsOf(log, u, n0).filter((c) => c.t > t0 + 0.5);
    assert.ok(again.length > 0, `${label(f)}: a second chain`);
    approx(again[0].t - t0, 0.6, `${label(f)}: 0.6 s later`, 0.06);
    assert.equal(again[0].target, p, `${label(f)}: starting on the 重构体`);
    approx(again[0].amount, u.s.atk, `${label(f)}: her ATK`);
    // nobody injured: she heals the full-HP 重构体 anyway
    setHp(yak, 1); setHp(tx, 1); setHp(u, 1); p.hp = p.s.maxHp;
    n0 = log.length;
    h.run(4);
    assert.ok(healsOf(log, u, n0).some((c) => c.target === p), `${label(f)}: the full-HP 重构体 healed`);
    done(h);
  }
});

test('S3 策略：熔毁 (MANUAL, data DEFAULT, 25 s): refused without her 重构体; with it: it is withdrawn and she moves onto its tile — x-4, ATK +, interval 1.35 s, block 3, max HP +5000 (ratio kept), 流失 80/s; true damage on every ground enemy she blocks, a chain heal on herself (0.5 ATK, a free link) each attack; back at the end with SP 0, the 重构体 returns', () => {
  for (const f of [[5, false, null], [6, true, XAHX]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.base_attack_time, sk.bb.block_cnt, sk.bb.max_hp, sk.bb.damage_per_second, sk.bb['attack@heal_scale'], sk.rangeId, sk.trigger.rule],
      [25, elite ? 2.8 : 2.5, -1.5, 2, 5000, 80, 0.5, 'x-4', 'DEFAULT'], label(f));
    // refused without the 重构体 (destroyed: its piece waits)
    const r0 = field({ tier, elite, mod, skill: 2, prosts: { row: 10, col: 6 }, others: [{ uid: 3, chessId: YAK, row: 11, col: 4 }] });
    r0.h.b.kill(r0.p, null);
    r0.u.skill.gainSp(999);
    setHp(r0.h.unit(3), 0.3);
    r0.h.run(3);
    assert.equal(r0.u.skill.activations, 0, `${label(f)}: no cast without the 重构体`);
    assert.ok(r0.u.skill.ready, `${label(f)}: still ready`);
    done(r0.h);
    const others = [{ uid: 3, chessId: YAK, row: 11, col: 4 }, { uid: 4, chessId: ESTELLE, row: 9, col: 7 }];
    const { h, u, p, log } = field({ tier, elite, mod, skill: 2, prosts: { row: 10, col: 6 }, others, dp: 50 });
    const yak = h.unit(3), tx = h.unit(4);
    const hpRatio = 0.8;
    setHp(u, hpRatio);
    u.skill.gainSp(999);
    setHp(yak, 0.3);
    assert.ok(h.runUntil(() => u.skill.active, 4), label(f));
    assert.ok(!p.alive && !p.removed, `${label(f)}: the 重构体 withdrawn (its piece waits)`);
    assert.deepEqual([u.tileR, u.tileC, u.ground], [10, 6, true], `${label(f)}: on its tile (a ground tile)`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `${label(f)}: x-4`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${label(f)}: ATK`);
    approx(u.s.interval, 2.85 - 1.5, `${label(f)}: 1.35 s`);
    assert.equal(u.s.blockCnt, 3, `${label(f)}: block 3`);
    approx(u.s.maxHp, u.base.maxHp + 5000, `${label(f)}: max HP +5000`);
    approx(u.hpRatio, hpRatio, `${label(f)}: the ratio kept`, 1e-3);
    // the 流失
    const hpA = u.hp;
    h.run(1);
    approx(hpA - u.hp, 80, `${label(f)}: 80 per second`, 0.15);
    // the blocked: two ground enemies on her tile, a flyer beside her
    const g1 = h.spawn('enemy_dummy', { pos: [10, 6] });
    const g2 = h.spawn('enemy_dummy', { pos: [10, 6] });
    const fly = h.spawn('enemy_fly', { pos: [10, 7] });
    h.step();
    assert.deepEqual([g1.blockedBy, g2.blockedBy], [u, u], `${label(f)}: blocked`);
    const n0 = log.length;
    assert.ok(h.runUntil(() => log.slice(n0).some((c) => c.name === 'damaged' && c.source === u && c.target.side === 'enemy'), 3), label(f));
    h.step();
    const atkHits = log.slice(n0).filter((c) => c.name === 'damaged' && c.source === u && c.dmg?.isAttack);
    const id = atkHits[0].dmg.attackId;
    const one = atkHits.filter((c) => c.dmg.attackId === id);
    assert.deepEqual(one.map((c) => c.target).sort((a, b) => a.id - b.id), [g1, g2].sort((a, b) => a.id - b.id), `${label(f)}: both blocked enemies, not the flyer`);
    for (const c of one) { assert.equal(c.type, 'true', `${label(f)}: true damage`); approx(c.amount, u.s.atk, `${label(f)}: 100 % ATK`); }
    assert.ok(!log.slice(n0).some((c) => c.target === fly), `${label(f)}: ground only`);
    const self = log.slice(n0).find((c) => c.name === 'heal' && c.source === u && c.target === u);
    assert.ok(self, `${label(f)}: the attack heals herself`);
    approx(self.amount, u.s.atk * 0.5, `${label(f)}: 50 % ATK`);
    // the end: back on her tile, SP 0, the 重构体 returns (its 15 s are long past) for 3 DP
    const dp0 = h.b.players[0].dp;
    h.runUntil(() => !u.skill.active, 30);
    assert.deepEqual([u.tileR, u.tileC, u.skill.sp], [10, 4, 0], `${label(f)}: 【返回】, SP emptied`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${label(f)}: y-2 again`);
    approx(u.s.maxHp, u.base.maxHp, `${label(f)}: max HP back`);
    assert.ok(h.runUntil(() => p.alive, 0.5), `${label(f)}: the 重构体 back`);
    assert.deepEqual([p.tileR, p.tileC], [10, 6], label(f));
    approx(h.b.players[0].dp, dp0 - 3, `${label(f)}: 3 DP`);
    assert.ok(tx.alive, label(f));
    done(h);
  }
});

test('S3 不死: a fatal blow leaves her at 1 HP (untargetable, blocking nothing), the skill ends on the next tick and she returns at ≤ 1 HP with 1 s of 不死; afterwards a fatal blow knocks her out', () => {
  const { h, u, p } = field({ tier: 6, elite: true, mod: XAHX, skill: 2, prosts: { row: 10, col: 6 }, others: [{ uid: 3, chessId: YAK, row: 11, col: 4 }] });
  u.skill.gainSp(999);
  setHp(h.unit(3), 0.3);
  assert.ok(h.runUntil(() => u.skill.active, 4));
  assert.deepEqual([u.tileR, u.tileC], [10, 6]);
  h.b.dealDamage(null, u, { amount: 1e7, type: 'true', sourceless: true });
  assert.deepEqual([u.alive, u.hp, u.s.flags.untargetable, u.s.flags.noBlock, u.skill.active], [true, 1, true, true, true], 'held at 1 HP');
  assert.ok(h.hooksOf('fatal').some((c) => c.unit === u && c.prevented));
  h.step();
  assert.ok(!u.skill.active, 'the skill ended');
  assert.deepEqual([u.tileR, u.tileC], [10, 4], 'returned');
  assert.ok(!u.s.flags.untargetable, 'targetable again');
  h.b.dealDamage(null, u, { amount: 1e7, type: 'true', sourceless: true });
  assert.ok(u.alive && u.hp <= 1, '1 s 不死 after the return');
  h.run(1.1);
  h.b.dealDamage(null, u, { amount: 1e7, type: 'true', sourceless: true });
  assert.ok(!u.alive, 'then a knock-out');
  assert.ok(!p.alive, 'her 重构体 off the field');
  done(h);
});
