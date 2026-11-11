// test/content/standin_acmedc.test.js — the Touch (char_613_acmedc) 补位 stand-in kit (kits/ops/standin-acmedc.js) on every
// chess she replaces: 5 塞雷娅, 6 塑心 / 纯烬艾雅法拉 (all S3, module PHY-X on the elite); S1 / S2 through the harness
// `standIn: { skillIndex }`. S3 and the talents are content/tokens.js touchGospel / mapCharTalents, the implementation the
// 外勤医疗 strategy's Touch runs (test/content/tokens_devices.test.js). Triggers: the official MEDIC row [ATTACK_RANGE_ALLY,
// SKILL_RANGE_ALLY] on all three skills -> SKILL_RANGE with allies (an injured ally inside the skill's range grid; S1 has
// none: her own range).
// Run: node --test test/content/standin_acmedc.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { touchGospel } from '../../server/sim/content/tokens.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHAR = 'char_613_acmedc';
const S1 = 'skchr_acmedc_1', S2 = 'skchr_acmedc_2', S3 = 'skchr_acmedc_3';
const RECORDS = BACKUPS.units[CHAR].standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
const DEFS = {
  chess: {
    test_tank_a: chessRec({ id: 'test_tank_a', profession: 'TANK', stats: { maxHp: 100000, atk: 1, def: 0 }, skill: null }),
    test_tank2_a: chessRec({ id: 'test_tank2_a', profession: 'TANK', stats: { maxHp: 100000, atk: 1, def: 0 }, skill: null }),
    // SP only from 攫升: an attack-SP skill and no enemy to attack
    test_sp_a: chessRec({ id: 'test_sp_a', profession: 'TANK', stats: { maxHp: 100000, atk: 1, def: 0 }, skill: { spType: 'INCREASE_WHEN_ATTACK', spCost: 1000, initSp: 0 } }),
    test_sp2_a: chessRec({ id: 'test_sp2_a', profession: 'TANK', stats: { maxHp: 1000, atk: 1, def: 0 }, skill: { spType: 'INCREASE_WHEN_ATTACK', spCost: 1000, initSp: 0 } }),
    test_medic_a: chessRec({ id: 'test_medic_a', profession: 'MEDIC', subProfessionId: 'physician', stats: { atk: 300 }, skill: null, rangeGrid: [[0, 0]] }),
  },
};
const close = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const formOf = (id) => unitForm(BACKUPS, CHAR, CHESS[id].status);
const skillOf = (id, skillId) => formOf(id).skills.find((s) => s.skillId === skillId);
const moduleOf = (id) => (CHESS[id].backup.uniEquipId && CHESS[id].status.equipLevel > 0 ? formOf(id).modules.find((m) => m.uniEquipId === CHESS[id].backup.uniEquipId) : null);

/**
 * Touch (unit 1) on (10,3) facing right — her 3-3 covers columns 3–6, S2's 3-10 columns 3–7, S3's 5-2 columns 3–8 — and
 * `allies` [[chessId, row, col, hpRatio]] (injured at once). h.heals: { t, tgt, uid, amount (final, before the HP cap), ratio }.
 */
function battle(touch, allies, opts = {}) {
  const heals = [];
  const h = makeBattle({
    defs: DEFS, timeLimit: 300, autoFinish: false, seed: opts.seed ?? 5, flags: { dpPerSec: 0 },
    units: [{ chessId: touch.id, row: 10, col: 3, standIn: touch.standIn ?? true, ...(touch.carry ? { carryState: touch.carry } : null) },
      ...allies.map(([chessId, row, col]) => ({ chessId, row, col }))],
    setup(b) {
      b.on('heal', (c) => { if (c.source?.uid === 1) heals.push({ t: b.time, tgt: c.target.id, uid: c.target.uid, amount: c.amount, ratio: c.target.hpRatio }); }, { priority: -999 });
    },
  });
  h.heals = heals;
  h.step();
  allies.forEach(([, , , ratio], i) => { const a = h.unit(i + 2); if (ratio < 1) h.b.loseHp(a, a.hp * (1 - ratio)); });
  return h;
}

// ---------------------------------------------------------------------------------------------------------------

test('Touch fields on all 6 records she replaces: her body (+ PHY-X attributes on the elites), S3 恳切福音 everywhere, her own kit, SKILL_RANGE (allies) on the 5-2', () => {
  assert.equal(RECORDS.length, 6);
  for (const id of RECORDS) {
    const c = CHESS[id];
    const form = formOf(id);
    const mod = moduleOf(id);
    const h = battle({ id }, []);
    const u = h.unit(1);
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id, c.backup.skillIndex], [CHAR, c.charId, S3, 2], id);
    assert.ok(!u.kit.generic && u.kit.skillSource === 'skills', `${id}: her kit's own spec`);
    assert.equal(!!u.def.raw.module?.active, !!mod, `${id}: module`);
    assert.equal(!!mod, c.isGolden, `${id}: PHY-X on every elite`);
    assert.deepEqual([u.base.atk, u.base.maxHp], [form.stats.atk + (mod?.attr.atk ?? 0), form.stats.maxHp + (mod?.attr.maxHp ?? 0)], `${id}: stats`);
    assert.deepEqual(u.skill.rules, ['SKILL_RANGE', 'SKILL_RANGE'], `${id}: trigger (ATTACK_RANGE_ALLY on her own range, SKILL_RANGE_ALLY on the 5-2)`);
    assert.equal(u.skill.triggerAllies, true, `${id}: an injured ally`);
    assert.equal(u.skill.alsoRules[0].grid.length, 18, `${id}: the 5-2 running range as the skill-range grid`);
    assert.equal(u.profile.dmgType, 'heal');
    // S3 is the strategy's touchGospel spec
    const g = touchGospel(skillOf(id, S3).bb, skillOf(id, S3));
    const k = u.kit.skill;
    assert.deepEqual([k.kind, k.heal, k.mods, k.targeting], [g.skill.kind, g.skill.heal, g.skill.mods, g.skill.targeting], `${id}: touchGospel`);
    assert.equal(h.b.errors.length, 0);
  }
});

test('S3 恳切福音: cast with an injured ally inside the 5-2 only (no heal before); 40 s on the 5-2, 2 targets, ×1.35 / ×1.40 below half HP, +30 % extra heal', () => {
  for (const [id, atk, boost] of [['chess_char_5_11_a', 0.2, 1.35], ['chess_char_6_20_a', 0.2, 1.35], ['chess_char_6_09_b', 0.3, 1.4]]) {
    const phy = moduleOf(id) ? 1.15 : 1;
    const sk = skillOf(id, S3);
    assert.deepEqual([sk.bb.atk, sk.bb.heal_scale, sk.bb['attack@addition_heal_scale'], sk.duration], [atk, boost, 0.3, 40]);
    // (10,8): outside her 3-3 and S2's 3-10, inside the 5-2; (10,5) full HP
    const h = battle({ id }, [['test_tank_a', 10, 8, 0.3], ['test_tank2_a', 9, 5, 1]]);
    const u = h.unit(1), near = h.unit(3);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    assert.equal(u.rangeKeys.length, 12);
    assert.ok(h.runUntil(() => cast != null, sk.spCost), `${id}: cast`);
    close(cast, sk.spCost - sk.initSp, `${id}: as soon as the SP is full`, 0.01);
    assert.equal(h.heals.filter((x) => x.t < cast).length, 0, `${id}: no heal before the cast — it was out of her range`);
    assert.equal(u.rangeKeys.length, 18, `${id}: the 5-2`);
    close(u.s.atk, u.base.atk * (1 + atk), `${id}: ATK`);
    h.step();
    assert.ok(h.runUntil(() => h.heals.length > 0, 2), `${id}: the first heal`); // lands one wind-up after the cast (official cast → hit, ai.js allyCastWindup)
    const first = h.heals.filter((x) => x.t === h.heals[0].t);
    assert.ok(first[0].t >= cast, `${id}: the first heal comes with the cast`);
    assert.deepEqual(first.map((x) => x.uid), [2, 2], `${id}: the main heal on the far ally, then the extra on it (the lowest HP ratio of it and its neighbours)`);
    close(first[0].amount, u.s.atk * phy * boost, `${id}: main heal ×${boost}${phy > 1 ? ' ×1.15 PHY-X' : ''}`);
    close(first[1].amount, u.s.atk * 0.3 * phy * boost, `${id}: extra heal = 30 % of the main heal's base, its still-low recipient's bonuses on it`);
    // two injured allies: both healed per action
    // a cast under way has locked its targets before this ally was hurt: let it land, the next action takes both
    h.runUntil(() => !u.cast, 2);
    h.b.loseHp(near, near.hp * 0.2);
    const n0 = h.heals.length;
    h.runUntil(() => h.heals.length > n0, 5);
    h.step();
    const action = h.heals.slice(n0);
    assert.deepEqual(new Set(action.map((x) => x.uid)), new Set([2, 3]), `${id}: 2 targets`);
    close(action.find((x) => x.uid === 3).amount, u.s.atk * 1, `${id}: no bonus above half HP`);
    h.runUntil(() => !u.skill.active, 45);
    assert.equal(u.rangeKeys.length, 12, `${id}: back to the 3-3`);
    checkInvariants(h.b);
    assert.equal(h.b.errors.length, 0);
  }
  // none: no cast however long, and none for an injured ally beyond the 5-2
  for (const allies of [[['test_tank_a', 10, 8, 1]], [['test_tank_a', 10, 9, 0.3]]]) {
    const h = battle({ id: 'chess_char_5_11_a', carry: { sp: 999 } }, allies);
    h.run(5);
    assert.equal(h.unit(1).skill.activations, 0, JSON.stringify(allies));
  }
});

test('S3 extra heal (PRTS 备注): 30 % of the main heal\'s base, its own recipient\'s ×heal_scale (and PHY-X); the lowest HP ratio of the main target and its 4 neighbours; exactly half HP is not 「低于」', () => {
  for (const id of ['chess_char_5_11_a', 'chess_char_6_09_b']) {
    const phy = moduleOf(id) ? 1.15 : 1;
    const boost = skillOf(id, S3).bb.heal_scale;
    // the main target on (10,8) (inside the 5-2, outside her 3-3); its neighbour (10,9) is beyond the 5-2 (never a main target)
    const firstAction = (mainRatio, nearRatio) => {
      const h = battle({ id, carry: { sp: 999 } }, [['test_tank_a', 10, 8, mainRatio], ['test_tank2_a', 10, 9, nearRatio]]);
      const u = h.unit(1);
      assert.ok(h.runUntil(() => h.heals.length >= 2, 5), `${id}: healed`);
      assert.ok(u.skill.active, `${id}: S3 running`);
      const t0 = h.heals[0].t;
      const act = h.heals.filter((x) => x.t === t0);
      assert.equal(act.length, 2, `${id}: one main heal and one extra heal`);
      checkInvariants(h.b);
      return { u, main: act[0], extra: act[1] };
    };
    // main above half: no bonus; the extra goes to the neighbour below half (lower ratio), with both bonuses
    let r = firstAction(0.55, 0.45);
    assert.deepEqual([r.main.uid, r.extra.uid], [2, 3], `${id}: the extra on the lower-ratio neighbour`);
    close(r.main.amount, r.u.s.atk, `${id}: no bonus at 55 %`);
    close(r.extra.amount, r.u.s.atk * 0.3 * boost * phy, `${id}: the extra takes its own recipient's ×${boost}`);
    // main at exactly half: "低于" — no ×heal_scale, no PHY-X; the extra on it (its neighbour is full), no bonus either
    r = firstAction(0.5, 1);
    assert.deepEqual([r.main.uid, r.extra.uid], [2, 2], `${id}: the full neighbour has the higher ratio`);
    close(r.main.amount, r.u.s.atk, `${id}: exactly 50 % is not below half`);
    close(r.extra.amount, r.u.s.atk * 0.3, `${id}: extra = 30 % of the base`);
    // main just below half: boosted; the extra lands on it after it crossed half — 30 % of the base, not of the boosted heal
    r = firstAction(0.499, 1);
    assert.deepEqual([r.main.uid, r.extra.uid], [2, 2]);
    close(r.main.amount, r.u.s.atk * boost * phy, `${id}: ×${boost} below half`);
    assert.ok(r.extra.ratio >= 0.5, `${id}: its recipient is above half now`);
    close(r.extra.amount, r.u.s.atk * 0.3, `${id}: the extra's base excludes the main heal's bonuses`);
  }
});

test('S1 慨赠: cast on an injured ally in her range; 20 s of ATK +40 % / +50 %, each heal a 40 % / 50 % chance of a second heal of the same ally', () => {
  for (const [id, atk, p] of [['chess_char_5_11_a', 0.4, 0.4], ['chess_char_5_11_b', 0.5, 0.5]]) {
    assert.deepEqual([skillOf(id, S1).bb.atk, skillOf(id, S1).bb['attack@prob'], skillOf(id, S1).duration], [atk, p, 20]);
    let actions = 0, doubles = 0;
    for (let seed = 1; seed <= 6; seed++) {
      // the ally stays above half HP (no PHY-X bonus), inside her 3-3
      const h = battle({ id, standIn: { skillIndex: 0 }, carry: { sp: 999 } }, [['test_tank_a', 10, 5, 0.7]], { seed });
      const u = h.unit(1);
      assert.equal(u.skill.id, S1);
      assert.deepEqual(u.skill.rules, ['SKILL_RANGE']);
      assert.equal(u.skill.triggerAllies, true);
      let cast = null;
      h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
      assert.ok(h.runUntil(() => cast != null, 5));
      h.step();
      close(u.s.atk, u.base.atk * (1 + atk), `${id}: ATK`);
      h.runUntil(() => !u.skill.active, 25);
      close(h.b.time - cast, 20, `${id}: 20 s`, 0.01);
      const during = h.heals.filter((x) => x.t >= cast && x.t < cast + 20);
      const byT = new Map();
      for (const x of during) byT.set(x.t, [...(byT.get(x.t) ?? []), x]);
      for (const list of byT.values()) {
        actions++;
        assert.ok(list.length <= 2 && list.every((x) => x.uid === 2), `${id}: at most one extra heal, on the same ally`);
        if (list.length === 2) { doubles++; close(list[1].amount, list[0].amount, `${id}: the same amount`); }
      }
      checkInvariants(h.b);
    }
    assert.ok(actions >= 30, `${id}: ${actions} heals`);
    assert.ok(Math.abs(doubles / actions - p) < 0.2, `${id}: ${doubles} / ${actions} extra heals for p = ${p}`);
  }
});

test('S2 宛如天启: cast with an injured ally inside the 3-10 only; 30 s on the 3-10, 2 targets, every 医疗 operator of hers ATK +21 % / +30 % (herself too)', () => {
  for (const [id, v] of [['chess_char_6_09_a', 0.21], ['chess_char_6_09_b', 0.3]]) {
    const sk = skillOf(id, S2);
    assert.deepEqual([sk.bb['attack@atk'], sk.bb['attack@max_target'], sk.duration, sk.trigger.rule], [v, 2, 30, 'SKILL_RANGE']);
    const h = battle({ id, standIn: { skillIndex: 1 } }, [['test_tank_a', 10, 7, 0.6], ['test_medic_a', 12, 2, 1], ['test_tank2_a', 9, 4, 1]]);
    const u = h.unit(1), tank = h.unit(2), medic = h.unit(3), tank2 = h.unit(4);
    assert.equal(u.skill.id, S2);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === u) cast = h.b.time; });
    assert.ok(h.runUntil(() => cast != null, sk.spCost), `${id}: cast`);
    close(cast, sk.spCost - sk.initSp, `${id}: as soon as the SP is full`, 0.01);
    assert.equal(h.heals.filter((x) => x.t < cast).length, 0, `${id}: (10,7) is outside her 3-3`);
    h.step();
    assert.equal(u.rangeKeys.length, 15, `${id}: the 3-10`);
    close(u.s.atk, u.base.atk * (1 + v), `${id}: her ATK`);
    close(medic.s.atk, medic.base.atk * (1 + v), `${id}: another medic's ATK`);
    close(tank.s.atk, tank.base.atk, `${id}: not a non-medic`);
    // a cast under way has locked its targets before this ally was hurt: let it land, the next action takes both
    h.runUntil(() => !u.cast, 2);
    h.b.loseHp(tank2, tank2.hp * 0.3);
    const n0 = h.heals.length;
    h.runUntil(() => h.heals.length > n0, 5);
    assert.deepEqual(new Set(h.heals.slice(n0).map((x) => x.uid)), new Set([2, 4]), `${id}: 2 targets`);
    h.runUntil(() => !u.skill.active, 35);
    h.step();
    assert.equal(u.rangeKeys.length, 12);
    close(medic.s.atk, medic.base.atk, `${id}: the aura ends with the skill`);
    close(u.s.atk, u.base.atk, `${id}: hers too`);
    checkInvariants(h.b);
  }
  // an injured ally on (10,8) is beyond the 3-10: no cast
  const h = battle({ id: 'chess_char_6_09_a', standIn: { skillIndex: 1 }, carry: { sp: 999 } }, [['test_tank_a', 10, 8, 0.3]]);
  h.run(5);
  assert.equal(h.unit(1).skill.activations, 0);
});

test('攫升 / 超脱 (the strategy\'s mapCharTalents): a healed unit +3 SP; an operator knocked out — or forced out — in her range +5 SP (+8 with PHY-X Lv3)', () => {
  for (const [id, sp] of [['chess_char_5_11_a', 5], ['chess_char_5_11_b', 5], ['chess_char_6_20_b', 8]]) {
    const h = battle({ id }, [['test_sp_a', 10, 5, 0.6], ['test_tank_a', 9, 4, 1], ['test_tank2_a', 9, 10, 1], ['test_tank_a', 11, 4, 1], ['test_tank2_a', 11, 5, 1], ['test_tank_a', 9, 5, 1], ['test_tank2_a', 11, 6, 1]]);
    const u = h.unit(1), ally = h.unit(2);
    const gains = [];
    h.b.on('spGain', (c) => { if (c.unit === ally) gains.push([c.reason, c.amount]); });
    h.runUntil(() => h.heals.length > 0, 5);
    h.step();
    assert.deepEqual(gains, [['talent', 3]], `${id}: 攫升`);
    assert.equal(u.def.talents[1].bb.sp, sp);
    const before = u.skill.sp;
    h.b.kill(h.unit(3)); // (9,4): in her range
    close(u.skill.sp, before + sp, `${id}: 超脱`);
    const mid = u.skill.sp;
    h.b.kill(h.unit(4)); // (9,10): out of it
    close(u.skill.sp, mid, `${id}: not out of range`);
    // PRTS 备注: a forced exit with a death animation (史尔特尔's 余烬: a `dying` retreat) counts; not a skill's planned
    // retreat (耀骑士临光 S2, 伊内丝 S3: a plain 'retreat'), the 商人's automatic 撤退 ('merchant') or the 突袭 jump ('raid')
    h.b.retreat(h.unit(5), { reason: 'retreat', dying: true }); // (11,4)
    close(u.skill.sp, mid + sp, `${id}: 超脱 on a dying forced exit`);
    h.b.retreat(h.unit(6), { reason: 'retreat' }); // (11,5)
    h.b.retreat(h.unit(7), { reason: 'merchant' }); // (9,5)
    h.b.retreat(h.unit(8), { reason: 'raid' }); // (11,6)
    close(u.skill.sp, mid + sp, `${id}: not on a planned, a 商人's or a 突袭 retreat`);
    checkInvariants(h.b);
  }
});

test('超脱 on 史尔特尔\'s 余烬 exit (PRTS 备注 "如史尔特尔的天赋效果"): her forced exit 8 s after the lethal blow gives Touch the SP', () => {
  const id = 'chess_char_5_11_a', sp = 5;
  const h = battle({ id }, [['chess_char_5_07_a', 9, 4, 1]]);
  const u = h.unit(1), surtr = h.unit(2);
  const exits = [];
  h.b.on('death', (c) => { if (c.unit === surtr) exits.push([c.reason, c.dying]); });
  h.b.dealDamage(null, surtr, { amount: 1e7, type: 'true' });
  assert.ok(surtr.alive && surtr.findBuff('surtr:ember'), '余烬: kept alive');
  const before = u.skill.sp;
  const gains = [];
  h.b.on('spGain', (c) => { if (c.unit === u && c.reason === 'talent') gains.push(c.amount); });
  assert.ok(h.runUntil(() => !surtr.alive, 12), 'she withdraws');
  assert.deepEqual(exits, [['retreat', true]], 'a dying forced exit');
  assert.deepEqual(gains, [sp], '超脱');
  assert.ok(u.skill.sp >= before + sp - 1e-6);
  checkInvariants(h.b);
});

test('攫升 (PRTS 备注 "只需Touch输出治疗便能触发（无需实际产生治疗量）"): her heal on herself and a heal that restores nothing (S3\'s extra heal on a full unit) give SP too', () => {
  for (const id of ['chess_char_5_11_a', 'chess_char_6_09_b']) {
    // herself: injured, she heals herself (her 3-3 holds her own tile)
    let h = battle({ id }, []);
    let u = h.unit(1);
    h.b.loseHp(u, u.hp * 0.4);
    const own = [];
    h.b.on('spGain', (c) => { if (c.unit === u && c.reason === 'talent') own.push(c.amount); });
    assert.ok(h.runUntil(() => h.heals.length > 0, 5), `${id}: a self-heal`);
    h.step();
    assert.equal(h.heals[0].uid, 1);
    assert.deepEqual(own, [3], `${id}: 攫升 on her own heal`);
    checkInvariants(h.b);
    // S3: the main heal fills a 1000-HP unit at 90 %, then the extra heal lands on it at full HP — still +3 SP
    h = battle({ id, carry: { sp: 999 } }, [['test_sp2_a', 10, 8, 0.9]]);
    u = h.unit(1);
    const tgt = h.unit(2);
    const got = [];
    h.b.on('spGain', (c) => { if (c.unit === tgt && c.reason === 'talent') got.push(c.amount); });
    assert.ok(h.runUntil(() => h.heals.length >= 2, 5), `${id}: S3 heals`);
    h.step();
    assert.ok(u.skill.active);
    assert.deepEqual(h.heals.slice(0, 2).map((x) => [x.uid, x.ratio === 1]), [[2, false], [2, true]], `${id}: the extra heal on the now full unit`);
    assert.deepEqual(got, [3, 3], `${id}: 攫升 for the main heal and for the extra heal that restored nothing`);
    checkInvariants(h.b);
  }
});

test('module PHY-X (elites): every heal of hers on an ally below 50 % HP ×1.15 — none at or above it, none on the normal chess', () => {
  for (const id of ['chess_char_5_11_a', 'chess_char_5_11_b', 'chess_char_6_09_b']) {
    const mod = moduleOf(id);
    if (mod) assert.deepEqual([mod.traitOverride.bb.heal_scale, mod.traitOverride.bb.hp_ratio], [1.15, 0.5]);
    for (const [ratio, mul] of [[0.3, mod ? 1.15 : 1], [0.5, 1], [0.8, 1]]) {
      const h = battle({ id }, [['test_tank_a', 10, 5, ratio]]);
      const u = h.unit(1);
      h.runUntil(() => h.heals.length >= 1, 10);
      assert.equal(u.skill.active, false, `${id}: a normal heal`);
      close(h.heals[0].amount, u.s.atk * mul, `${id}: at ${ratio} HP`);
      checkInvariants(h.b);
    }
  }
});
