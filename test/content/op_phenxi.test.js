// test/content/op_phenxi.test.js — the 自选 operator kit of 菲亚梅塔 (char_300_phenxi, 6★ 炮手; kit
// server/sim/content/kits/ops/op-phenxi.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, ART-Y
// “‘律外’特种弹药配给组”, ART-X “漫长的旅途” or ISW-A “菲亚梅塔特限证章” at stage 1 (tier 5) / 3 (tier 6). Every number is read
// back from data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_phenxi.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const PX = 'char_300_phenxi';
const FORMS = BACKUPS.units[PX].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const Y = 'uniequip_002_phenxi', X = 'uniequip_003_phenxi', ISW = 'uniequip_004_phenxi';
const S1 = 'skchr_phenxi_1', S2 = 'skchr_phenxi_2', S3 = 'skchr_phenxi_3';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_def: dummy('enemy_def', { def: 300 }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, Y, X, ISW].map((m) => [t, true, m]))];
const P1 = 'phenxi_t_1[peak_1].peak_performance', P2 = 'phenxi_t_1[peak_2].peak_performance';

/** 菲亚梅塔 as uid 1 at (10, 4) facing RIGHT (3-10: rows 9–11, columns 4–8; her 4th tile ahead is (10, 8)). `pin` keeps
 *  her HP full at the end of every tick (陈述苦难's 流失 would move 精力充沛 under exact damage checks). */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5, pin = false } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'hit'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: PX, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  const u = h.unit(1);
  if (pin) h.b.on('tick', () => { if (u.alive) u.hp = u.s.maxHp; });
  h.step();
  return { h, u };
}
const from = (h, src) => h.hooksOf('damaged').filter((c) => c.source === src && !c.dmg.tags?.includes('hpLoss'));
const on = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;
/** The talents a form fights with: the base ones under the 集成战略 module. */
const talentsOf = (tier, elite, mod) => {
  const form = formOf(tier, elite);
  const m = elite ? modOf(tier, mod) : null;
  if (!m || mod === ISW) return form.talents;
  return form.talents.map((t) => {
    const ch = m.talentChanges.find((c) => c.talentIndex === t.index);
    return ch ? { ...t, bb: { ...t.bb, ...ch.bb } } : t;
  });
};

test('菲亚梅塔 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 3-10, ranged physical 炮手 (splash 1.0), hits air, blocks 1, ground-targetable, the data triggers; offered as a pick', () => {
  assert.equal(OPERATOR_KITS[PX], KITS[PX]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [PX, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.base.bat, u.profile.splashRadius, u.profile.sub],
        [1, 'ranged', true, 'phys', 2.8, 1, 'aoesniper'], `${label(f)}: 炮手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-10`);
      assert.equal(u.skill.rule, form.skills[skill].trigger.rule, `${label(f)}: the data's trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => [s.skillType, s.trigger.rule]), [['MANUAL', 'DEFAULT'], ['MANUAL', 'DEFAULT'], ['MANUAL', 'DEFAULT']]);
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1540, 706, 1796, 832]);
  assert.deepEqual([Y, X, ISW].flatMap((id) => [modOf(5, id).attr, modOf(6, id).attr]),
    [{ atk: 48, def: 26 }, { atk: 70, def: 43 }, { atk: 60, def: 17 }, { atk: 85, def: 32 }, { maxHp: 85, atk: 65 }, { maxHp: 115, atk: 90 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(PX) && [5, 6].every((t) => diyPool(t, { data, kitted: KITTED_CHARS }).includes(PX)));
  assert.equal(validateDiyPicks({ [SLOT[5]]: { charId: PX, skillIndex: 2, uniEquipId: X } }, { data, kitted: KITTED_CHARS }).ok, true);
});

test('T1 陈述苦难: every 0.1 s a 流失 of ⌈0.5 % of her current HP⌉ (no hit, no SP), never below 1; ART-X stage 3: none at or under 50.3 %; ISW-A: the base talent (its 集成战略 0.2 s / 0.2 % floor ignored)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t0 = talentsOf(tier, elite, mod)[0].bb;
    const x3 = elite && mod === X && tier === 6;
    assert.deepEqual([t0.interval, t0.hp_ratio, t0.min_hp_ratio ?? 0], [0.1, 0.005, x3 ? 0.503 : 0], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    if (elite && mod === ISW && tier === 6) assert.equal(u.def.raw.talents.find((t) => t.index === 0).bb.interval, 0.2, 'the composed record carries the 集成战略 blackboard');
    h.run(1.02);
    const loss = h.hooksOf('damaged').filter((c) => c.target === u && c.dmg.tags?.includes('phenxi:bleed'));
    assert.equal(loss.length, 10, `${label(f)}: ten in a second`);
    let hp = u.s.maxHp;
    for (const c of loss) {
      const want = Math.ceil(hp * 0.005 - 1e-9);
      assert.equal(c.amount, want, `${label(f)}: ⌈0.5 % of ${hp}⌉`);
      assert.ok(c.dmg.tags.includes('hpLoss') && c.dmg.noSp, `${label(f)}: a 流失`);
      hp -= want;
    }
    assert.equal(h.hooksOf('hit').filter((c) => c.target === u).length, 0, `${label(f)}: no hit`);
    approx(u.hp, hp, `${label(f)}: HP`);
    h.run(120);
    if (x3) {
      assert.ok(u.hpRatio > 0.5 && u.hpRatio <= 0.503, `${label(f)}: stops just above 50 % (${u.hpRatio})`);
      const n = h.hooksOf('damaged').filter((c) => c.target === u).length;
      h.run(2);
      assert.equal(h.hooksOf('damaged').filter((c) => c.target === u).length, n, `${label(f)}: no more`);
    } else assert.equal(u.hp, 1, `${label(f)}: down to 1, never 0`);
    assert.ok(u.alive, label(f));
    done(h);
  }
});

test('T1 精力充沛: ATK +25 % above 50 % HP, +50 % above 80 % (ART-X stage 3: +30 % / +60 %; ISW-A: +25 % / +50 %, not its 集成战略 double)', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t0 = talentsOf(tier, elite, mod)[0].bb;
    const x3 = elite && mod === X && tier === 6;
    assert.deepEqual([t0[`${P1}.atk`], t0[`${P1}.hp_ratio`], t0[`${P2}.atk`], t0[`${P2}.hp_ratio`]], x3 ? [0.3, 0.5, 0.6, 0.8] : [0.25, 0.5, 0.5, 0.8], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    const at = (ratio) => {
      u.hp = u.s.maxHp * ratio;
      h.step();
      return u.findBuff('talent:phenxi:peak')?.mods.atkPct ?? 0;
    };
    assert.equal(at(1), t0[`${P2}.atk`], `${label(f)}: full HP`);
    approx(u.s.atk, u.base.atk * (1 + t0[`${P2}.atk`]), `${label(f)}: ATK`);
    assert.equal(at(0.79), t0[`${P1}.atk`], `${label(f)}: under 80 %`);
    assert.equal(at(0.49), 0, `${label(f)}: under 50 %`);
    approx(u.s.atk, u.base.atk, `${label(f)}: none`);
    done(h);
  }
});

test('T2 宣告终局: ASPD +30 outside a running skill, none while S1 / S3 run (S2 is instant); ART-Y stage 3: +33 outside, +10 inside', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t1 = talentsOf(tier, elite, mod)[1].bb;
    const y3 = elite && mod === Y && tier === 6;
    assert.deepEqual([t1.attack_speed, t1['phenxi_e_t_2[in_skill].attack_speed'] ?? 0], y3 ? [33, 10] : [30, 0], label(f));
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const own = formOf(tier, elite).stats.aspd + (elite ? modOf(tier, mod)?.attr.aspd ?? 0 : 0);
      assert.equal(u.s.aspd, own + t1.attack_speed, `${label(f)} S${skill + 1}: outside`);
      u.skill.gainSp(999);
      h.spawn('enemy_dummy', { pos: [10, 7] });
      assert.ok(h.runUntil(() => u.skill.activations === 1, 6), `${label(f)} S${skill + 1}: cast`);
      h.step();
      assert.equal(u.s.aspd, own + (skill === 1 ? t1.attack_speed : (t1['phenxi_e_t_2[in_skill].attack_speed'] ?? 0)), `${label(f)} S${skill + 1}: while it runs`);
      if (skill === 0) {
        u.skill.end('test');
        h.step();
        assert.equal(u.s.aspd, own + t1.attack_speed, `${label(f)}: back after S1`);
      }
      done(h);
    }
  }
});

test('S1 “你须直面” (MANUAL, attack SP 17 / 14 from 5, 30 s, data DEFAULT — the 2026-08 client grows no range: tools/build-data.mjs UNIT_TRIGGER_CORRECTIONS): ATK +45 % / +60 %; since the 2026-08 client her attacks pick ground enemies only (the splash still hits air) and her range stays 3-10', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spType, sk.spCost, sk.initSp, sk.duration, sk.bb.atk, sk.bb.ability_range_forward_extend], ['INCREASE_WHEN_ATTACK', elite ? 14 : 17, 5, 30, elite ? 0.6 : 0.45, 1], `T${tier}`);
    assert.equal(sk.trigger.customRangeGrid, null, `T${tier}: no +1 trigger grid`);
    const { h, u } = field({ tier, elite, skill: 0, pin: true });
    assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.spType], ['duration', 'DEFAULT', 'attack'], `T${tier}`);
    const far = h.spawn('enemy_dummy', { pos: [10, 9] });   // 5 tiles ahead: outside 3-10
    u.skill.gainSp(999);
    h.run(2);
    assert.equal(u.skill.activations, 0, `T${tier}: an enemy out of her reach casts nothing (DEFAULT)`);
    const g = h.spawn('enemy_dummy', { pos: [11, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `T${tier}: cast as she is about to attack a ground enemy in range`);
    approx(u.skill.timeLeft, 30, `T${tier}: 30 s`, 0.05);
    assert.deepEqual(u.findBuff(`skill:${u.id}`)?.mods, { atkPct: sk.bb.atk }, `T${tier}: ATK +${sk.bb.atk * 100} %`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: her range stays 3-10`);
    h.run(6);
    assert.equal(on(h, far).length, 0, `T${tier}: 5 tiles ahead stays out of reach`);
    const fly = h.spawn('enemy_fly', { pos: [10, 7] });
    h.run(6);
    assert.equal(on(h, fly).filter((c) => !c.dmg.isSplash).length, 0, `T${tier}: no air target while it runs`);
    assert.ok(h.runUntil(() => on(h, g).length > 0, 4), `T${tier}: a ground target`);
    h.run(0.3);
    const id = on(h, g).at(-1).dmg.attackId; // a shell fired with the flyer on the field
    assert.ok(on(h, fly).some((c) => c.dmg.attackId === id && c.dmg.isSplash), `T${tier}: her shell still splashes the flyer 1.0 away`);
    for (const c of from(h, u).filter((c) => c.dmg.attackId === id)) approx(c.amount, u.base.atk * (1 + sk.bb.atk + u.findBuff('talent:phenxi:peak').mods.atkPct), `T${tier}: ATK`);
    u.skill.end('test');
    h.b.kill(g, null);
    assert.ok(h.runUntil(() => on(h, fly).some((c) => !c.dmg.isSplash), 4), `T${tier}: flyers are targets again once it ends`);
    done(h);
  }
});

test('S2 “你须愧悔” (MANUAL, attack SP 11 / 10, data DEFAULT): the attack it is cast for fires the 灼痕弹 instead — 260 % / 320 % within 1.5 of her 4th tile ahead ≈ 0.5 s later, a 灼痕 every 0.66 tiles bursting 0.8 s after it was left for 130 % / 160 % within 1.1, air too; cast every 12th attack', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.spType, sk.spCost, sk.initSp, sk.bb.atk_scale, sk.bb.atk_scale_2, sk.bb.dist], ['INCREASE_WHEN_ATTACK', elite ? 10 : 11, 0, elite ? 3.2 : 2.6, elite ? 1.6 : 1.3, 0.66], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1, pin: true });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['instant', 'DEFAULT'], `T${tier}`);
    const A = h.spawn('enemy_dummy', { pos: [10, 8] });     // the end point; 灼痕 5 (7.30) and 6 (7.96) within 1.1
    const B = h.spawn('enemy_dummy', { pos: [11, 8] });     // 1.0 from the end; 灼痕 6 within 1.1
    const M = h.spawn('enemy_dummy', { pos: [11, 6] });     // only 灼痕 3 (5.98) within 1.1
    const F = h.spawn('enemy_fly', { pos: [9, 6] });        // the same, an air unit
    const C = h.spawn('enemy_dummy', { pos: [9, 9.4] });    // 1.72 from the end, 1.75 from 灼痕 6
    u.skill.gainSp(999);
    const a0 = u.stats.attacks;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 4), `T${tier}: cast`);
    const t0 = h.b.time;
    assert.equal(u.stats.attacks, a0, `T${tier}: that attack was the cast`);
    h.run(1.6);
    const sk2 = (c) => c.dmg.tags?.includes('phenxi:s2') ? 'end' : c.dmg.tags?.includes('phenxi:mark') ? 'mark' : 'attack';
    const scales = (e) => on(h, e).filter((c) => c.source === u && sk2(c) !== 'attack' && c.t <= t0 + 1.6).map((c) => [sk2(c), Math.round(c.amount / u.s.atk * 1000) / 1000]).sort();
    const end = Math.round(sk.bb.atk_scale * 1000) / 1000, mark = Math.round(sk.bb.atk_scale_2 * 1000) / 1000;
    assert.deepEqual(scales(A), [['end', end], ['mark', mark], ['mark', mark]], `T${tier}: A`);
    assert.deepEqual(scales(B), [['end', end], ['mark', mark]], `T${tier}: B`);
    assert.deepEqual(scales(M), [['mark', mark]], `T${tier}: M`);
    assert.deepEqual(scales(F), [['mark', mark]], `T${tier}: the flyer`);
    assert.deepEqual(scales(C), [], `T${tier}: C`);
    const endHit = on(h, A).find((c) => sk2(c) === 'end');
    assert.ok(Math.abs(endHit.t - t0 - 0.5) < 0.07, `T${tier}: the shell bursts ≈ 0.5 s later (${endHit.t - t0})`);
    const mHit = on(h, M).find((c) => sk2(c) === 'mark');
    assert.ok(Math.abs(mHit.t - t0 - (3 * 0.66 / 8 + 0.8)) < 0.07, `T${tier}: 灼痕 3 bursts 0.8 s after it was left (${mHit.t - t0})`);
    assert.ok(on(h, A).every((c) => c.dmg.type === 'phys'), `T${tier}: physical`);
    // attack SP: the next cast after spCost more attacks
    const n1 = u.stats.attacks;
    assert.ok(h.runUntil(() => u.skill.activations === 2, 60), `T${tier}: cast again`);
    assert.equal(u.stats.attacks - n1, sk.spCost, `T${tier}: after ${sk.spCost} attacks`);
    done(h);
  }
});

test('S3 “你须偿还” (MANUAL, attack SP 22 / 19, data DEFAULT, a toggle): 持续攻击 — every attack interval a shell on her 4th tile ahead, enemy or not: 110 % / 115 % within 2.0, 170 % / 185 % within 1.1, air too; it never ends; a stun holds it', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.spCost, sk.duration, sk.bb['attack@atk_scale'], sk.bb['attack@atk_scale_2'], sk.bb['attack@dist'], sk.bb.base_attack_time],
      [elite ? 19 : 22, -1, elite ? 1.85 : 1.7, elite ? 1.15 : 1.1, 1.1, 0], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2, pin: true });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['toggle', 'DEFAULT'], `T${tier}`);
    const core = h.spawn('enemy_dummy', { pos: [10, 8] });
    const ring = h.spawn('enemy_dummy', { pos: [11, 8] });      // 1.0: the centre circle
    const outer = h.spawn('enemy_dummy', { pos: [10, 9.5] });   // 1.5
    const fly = h.spawn('enemy_fly', { pos: [9, 8.5] });        // 1.118: outside the centre circle
    const far = h.spawn('enemy_dummy', { pos: [11, 10] });      // 2.24
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4), `T${tier}: cast`);
    const a0 = u.stats.attacks;
    h.run(20);
    assert.ok(u.skill.active, `T${tier}: 持续时间无限`);
    const shots = u.stats.attacks - a0;
    assert.equal(shots, Math.floor(20 / u.s.interval) + 1, `T${tier}: one shell at once, then one per attack interval (${u.s.interval} s)`);
    const s3 = (e) => on(h, e).filter((c) => c.dmg.tags?.includes('phenxi:s3'));
    for (const [e, sc] of [[core, sk.bb['attack@atk_scale']], [ring, sk.bb['attack@atk_scale']], [outer, sk.bb['attack@atk_scale_2']], [fly, sk.bb['attack@atk_scale_2']]]) {
      assert.ok(s3(e).length >= shots - 1, `T${tier}: ${e.defId} hit by every shell`);
      for (const c of s3(e)) {
        approx(c.amount, u.s.atk * sc, `T${tier}: ×${sc}`);
        assert.deepEqual([c.type, c.dmg.isAttack, c.dmg.isSkill], ['phys', true, true], `T${tier}: her attack`);
      }
    }
    assert.equal(s3(far).length, 0, `T${tier}: 2.24 away untouched`);
    assert.equal(from(h, u).filter((c) => !c.dmg.tags?.includes('phenxi:s3') && c.t > h.b.time - 19).length, 0, `T${tier}: no normal attack meanwhile`);
    for (const e of [core, ring, outer, fly, far]) h.b.kill(e, null);
    const a1 = u.stats.attacks;
    h.run(6);
    assert.ok(u.stats.attacks - a1 >= 2, `T${tier}: no enemy, still firing`);
    h.b.applyStatus(u, 'stun', { duration: 6, force: true });
    const a2 = u.stats.attacks;
    h.run(5.5);
    assert.equal(u.stats.attacks, a2, `T${tier}: a stun holds it`);
    h.run(3);
    assert.ok(u.stats.attacks > a2, `T${tier}: and it goes on`);
    done(h);
  }
});

test('ART-X trait: ×1.1 on her damage to a blocked enemy (attack, splash, S2 blasts), stages 1 and 3; ART-Y trait: ignores 100 DEF; ISW-A: attributes only', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const x = elite && mod === X, y = elite && mod === Y;
    const { h, u } = field({ tier, elite, mod, skill: 2, pin: true, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 8, dir: 'LEFT' }] });
    const blockedE = h.spawn('enemy_dummy', { pos: [10, 8] });
    const free = h.spawn('enemy_dummy', { pos: [11, 8] });
    h.step();
    assert.ok(blockedE.blockedBy, `${label(f)}: blocked`);
    assert.ok(h.runUntil(() => from(h, u).some((c) => c.target === free), 6), `${label(f)}: an attack`);
    const id = from(h, u).find((c) => c.target === free).dmg.attackId;
    const amt = (e) => from(h, u).find((c) => c.dmg.attackId === id && c.target === e)?.amount;
    approx(amt(free), u.s.atk, `${label(f)}: not blocked`);
    approx(amt(blockedE), u.s.atk * (x ? 1.1 : 1), `${label(f)}: blocked`);
    assert.deepEqual(u.def.raw.trait.bb, x ? { atk_scale: 1.1 } : y ? { def_penetrate_fixed: 100 } : {}, `${label(f)}: trait bb`);
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    const d = h.spawn('enemy_def', { pos: [9, 12] });
    approx(h.b.dealDamage(u, d, { amount: 1000, type: 'phys', canDodge: false }), y ? 800 : 700, `${label(f)}: DEF 300`);
    done(h);
  }
  // S2's blasts on a blocked enemy (ART-X stage 3)
  const { h, u } = field({ tier: 6, elite: true, mod: X, skill: 1, pin: true, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 8, dir: 'LEFT' }] });
  const blockedE = h.spawn('enemy_dummy', { pos: [10, 8] });
  const free = h.spawn('enemy_dummy', { pos: [11, 8] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.activations === 1, 4));
  h.run(1);
  const endOf = (e) => on(h, e).find((c) => c.dmg.tags?.includes('phenxi:s2'))?.amount;
  approx(endOf(blockedE), endOf(free) * 1.1, 'the shell ×1.1 on the blocked one');
  done(h);
});
