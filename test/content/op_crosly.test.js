// test/content/op_crosly.test.js — the 自选 operator kit of 弑君者 (char_1502_crosly, 6★ 处决者; kit
// server/sim/content/kits/ops/op-crosly.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in
// every form: tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, EXE-X 弑君刃
// or EXE-Y 木炭画 at stage 1 (tier 5) / 3 (tier 6). Every number is read back from data/backups.json (the form of that slot
// status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_crosly.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CROSLY = 'char_1502_crosly';
const FORMS = BACKUPS.units[CROSLY].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const EX = 'uniequip_002_crosly', EY = 'uniequip_003_crosly';
const S1 = 'skchr_crosly_1', S2 = 'skchr_crosly_2', S3 = 'skchr_crosly_3';
const YAK = 'chess_char_1_02_a', TEXAS = 'chess_char_1_08_a';
const formOf = (tier, elite) => FORMS[elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The talents a form fights with: the module's changes composed (index 0 / 1, −1 = hidden). */
const talentOf = (tier, elite, mod, i) => {
  const base = formOf(tier, elite).talents.find((t) => t.index === i)?.bb ?? {};
  const ch = (elite ? modOf(tier, mod)?.talentChanges ?? [] : []).find((t) => t.talentIndex === i)?.bb ?? {};
  return { ...base, ...ch };
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_hitter: dummy('enemy_hitter', { atk: 200, range: 1.5, bat: 0.5 }), enemy_caster: dummy('enemy_caster', { atk: 200, range: 1.5, bat: 0.5, dmgType: 'arts' }),
  enemy_flyhitter: dummy('enemy_flyhitter', { atk: 200, range: 1.5, bat: 0.5, motion: 'FLY' }),
};
/** Every 自选 form: [tier, elite, module]. */
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, EX, EY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** A battle with 弑君者 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 4, others = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: CROSLY, skillIndex: skill, uniEquipId: mod }, elite, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
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
/**
 * Watch the 命中率 cut `hitter` suffers from now on: its attacks counted before (priority 295) and after (270) the smoke's
 * handler (280); allies are kept alive. Returns () => { n, rate }.
 */
function watch(h, hitter) {
  const seen = new Set(), passed = new Set();
  h.b.on('hit', (c) => { if (c.source === hitter && c.dmg.isAttack) seen.add(c.dmg.attackId); }, { priority: 295 });
  h.b.on('hit', (c) => { if (c.source === hitter && c.dmg.isAttack && !c.dmg.cancel) passed.add(c.dmg.attackId); }, { priority: 270 });
  h.b.on('fatal', (c) => { if (c.unit.side === 'ally') c.prevented = true; });
  return () => ({ n: seen.size, rate: seen.size ? 1 - passed.size / seen.size : 0 });
}

test('弑君者 in every 自选 form: her operator kit (all three skills authored), the form\'s stats + module attributes, 1-1, melee ground-only, 18 s redeploy, 叙拉古, no 特质; each skill a timed deployment skill (被动 ON_DEPLOY), running from the deployment', () => {
  assert.equal(OPERATOR_KITS[CROSLY], KITS[CROSLY]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null, rec = form.skills[skill];
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [CROSLY, SLOT[tier], rec.skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.respawnTime, u.base.cost],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 18, 9], `${label(f)}: stats`);
      assert.deepEqual([u.profile.attack, u.profile.dmgType, u.profile.canHitFly], ['melee', 'phys', false], `${label(f)}: 处决者`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 1-1 (S3 too)`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['siracusaShip'], []], `${label(f)}: bonds / 特质`);
      assert.deepEqual([rec.skillType, rec.spType, u.skill.kind, u.skill.rule, u.skill.active, u.skill.activations], ['PASSIVE', 'ON_DEPLOY', 'duration', 'NEVER', true, 1], `${label(f)}: S${skill + 1} from the deployment`);
      approx(u.skill.timeLeft, [rec.duration, rec.bb.duration, rec.duration][skill], `${label(f)}: S${skill + 1} duration`, 0.01);
      assert.equal(u.s.blockCnt, skill === 2 ? 0 : 1, `${label(f)}: blocks ${skill === 2 ? 0 : 1}`);
      done(h);
    }
  }
  // the numbers (zh_CN): E2 Lv1 1322 / 425 / 273, E2 Lv60 1569 / 505 / 307; EXE-X +90 / +34 / +23 → +130 / +45 / +30,
  // EXE-Y +84 / +63 → +135 / +88 HP / ATK
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1322, 425, 1569, 505]);
  assert.deepEqual([modOf(5, EX).attr, modOf(6, EX).attr, modOf(5, EY).attr, modOf(6, EY).attr],
    [{ maxHp: 90, atk: 34, def: 23 }, { maxHp: 130, atk: 45, def: 30 }, { maxHp: 84, atk: 63 }, { maxHp: 135, atk: 88 }]);
});

test('a 自选 pick: 弑君者 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(CROSLY));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(CROSLY), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[5]]: { charId: CROSLY, skillIndex: 2, uniEquipId: EY } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[5]]: { charId: CROSLY, skillIndex: 2, uniEquipId: EY } } });
});

test('S1 尘烟蔽目 (被动): for 10 s from each deployment ATK +65 % / +80 % and 30 % / 40 % physical and arts dodge', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EX]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.prob], [10, elite ? 0.8 : 0.65, elite ? 0.4 : 0.3]);
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    assert.deepEqual([u.s.dodgePhys, u.s.dodgeArts], [sk.bb.prob, sk.bb.prob], 'dodge');
    h.run(10.1);
    assert.deepEqual([u.skill.active, u.s.atk, u.s.dodgePhys, u.s.dodgeArts], [false, u.base.atk, 0, 0], 'over');
    redeployNow(h, u);
    assert.ok(u.skill.active && u.skill.activations === 2, 'again at a redeployment');
    done(h);
  }
});

test('S2 硝烟震爆 (被动): for 8 s no attacks and taunt level −1; then 270 % / 350 % ATK physical to every ground enemy of the x-4 smoke (fresh ones ×T2); no blast when she is stunned as it ends', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EY]]) {
    const sk = skillOf(tier, elite, S2), t1 = talentOf(tier, elite, mod, 1);
    assert.deepEqual([sk.bb.duration, sk.bb.taunt_level, sk.bb['attack@atk_scale_s2'], sk.bb.talent_scale], [8, -1, elite ? 3.5 : 2.7, 2]);
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    assert.equal(u.s.taunt, -1, 'taunt level −1');
    const front = h.spawn('enemy_dummy', { pos: [10, 5] }), diag = h.spawn('enemy_dummy', { pos: [11, 3] });
    const marked = h.spawn('enemy_dummy', { pos: [9, 4] });
    const fly = h.spawn('enemy_fly', { pos: [9, 5] }), far = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.step();
    h.b.dealDamage(marked, u, { amount: 1, type: 'phys', canDodge: false });   // it has damaged her
    h.run(7);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === u).length, 0, 'no attacks while it runs');
    assert.ok(h.runUntil(() => !u.skill.active, 2), 'over after 8 s');
    const blast = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('crosly:blast'));
    assert.deepEqual(blast.map((c) => c.target).sort((a, b) => a.id - b.id), [front, diag, marked].sort((a, b) => a.id - b.id), 'the ground enemies of her x-4');
    for (const c of blast) {
      approx(c.amount, u.s.atk * sk.bb['attack@atk_scale_s2'] * (c.target === marked ? 1 : t1.damage_scale), `${c.target === marked ? 'marked' : 'fresh'}: ${sk.bb['attack@atk_scale_s2'] * 100} %`);
      assert.deepEqual([c.type, c.dmg.isSkill], ['phys', true]);
    }
    assert.ok(!blast.some((c) => c.target === fly || c.target === far), 'flyer / outside untouched');
    assert.equal(u.s.taunt, 0, 'taunt back');
    // stunned as it ends: no blast
    redeployNow(h, u);
    h.run(7.5);
    h.b.applyStatus(u, 'stun', { duration: 2, force: true });
    const n0 = h.hooksOf('damaged').length;
    h.run(1);
    assert.ok(!u.skill.active, 'ended');
    assert.equal(h.hooksOf('damaged').slice(n0).filter((c) => c.dmg?.tags?.includes('crosly:blast')).length, 0, 'stunned: no blast');
    done(h);
  }
});

test('S3 烽烟行刑场 (被动, 16 s): 隐匿 and block count 0 (enemies neither target nor are blocked by her); a strike every 2 s on one unmarked ground enemy of the x-1 — 2 hits × 150 % / 190 % ATK and 晕眩 1.5 s — marking it 6 s; her range stays 1-1; all back after', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, EX]]) {
    const sk = skillOf(tier, elite, S3), t1 = talentOf(tier, elite, mod, 1);
    assert.deepEqual([sk.duration, sk.rangeId, sk.bb['attack@s3_cd'], sk.bb['attack@times'], sk.bb['attack@atk_scale_s3'], sk.bb['attack@stun'], sk.bb.mark_duration],
      [16, 'x-1', 2, 2, elite ? 1.9 : 1.5, 1.5, 6]);
    const { h, u } = field({ tier, elite, mod, skill: 2 });
    assert.deepEqual([!!u.s.flags.stealth, u.s.blockCnt, u.liveRangeGrid], [true, 0, formOf(tier, elite).rangeGrid], '隐匿, block 0, 1-1');
    const a = h.spawn('enemy_dummy', { pos: [10, 5] }), b = h.spawn('enemy_dummy', { pos: [12, 4] }), c = h.spawn('enemy_dummy', { pos: [10, 6] });
    const fly = h.spawn('enemy_fly', { pos: [9, 4] }), far = h.spawn('enemy_dummy', { pos: [10, 7] });
    const hitter = h.spawn('enemy_hitter', { pos: [11, 4] });
    h.run(15.5);
    const hits = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack);
    assert.equal(hits.length % 2, 0, 'two hits a strike');
    const strikes = [];
    for (const x of hits) if (!strikes.length || Math.abs(strikes[strikes.length - 1].t - x.t) > 1e-6) strikes.push({ t: x.t, target: x.target });
    assert.ok(strikes.length >= 7, `${strikes.length} strikes`);
    for (let i = 1; i < strikes.length; i++) approx(strikes[i].t - strikes[i - 1].t, 2, 'every 2 s', 0.02);
    assert.ok(hits.every((x) => [a, b, c, hitter].includes(x.target)), 'unmarked ground enemies of the x-1 only (no flyer, nothing 3 tiles away)');
    assert.ok(!hits.some((x) => x.target === fly || x.target === far));
    for (const x of hits) {
      assert.deepEqual([x.type, x.dmg.isSkill], ['phys', true]);
      approx(x.amount, u.s.atk * sk.bb['attack@atk_scale_s3'] * t1.damage_scale, `${sk.bb['attack@atk_scale_s3'] * 100} % ×T2 (fresh)`);
    }
    // the 6 s mark: never the same target twice within 6 s
    const last = new Map();
    for (const st of strikes) {
      if (last.has(st.target)) assert.ok(st.t - last.get(st.target) >= 6 - 1e-6, `marked 6 s (${st.target.defId})`);
      last.set(st.target, st.t);
    }
    const stuns = h.hooksOf('statusApplied').filter((x) => x.source === u && x.status === 'stun');
    assert.equal(stuns.length, strikes.length, 'one 晕眩 a strike');
    for (const x of stuns) approx(x.duration, sk.bb['attack@stun'], '1.5 s');
    assert.equal(h.hooksOf('damaged').filter((x) => x.source === hitter && x.target === u).length, 0, '隐匿: the hitter beside her never targets her');
    assert.equal(u.blocking.length, 0, 'blocks nothing');
    h.run(1);
    assert.deepEqual([u.skill.active, !!u.s.flags.stealth, u.s.blockCnt], [false, false, 1], 'all back after 16 s');
    done(h);
  }
});

test('T1 吞咽苦厄: while her skill runs, the attacks of ground enemies in her smoke miss 20 % (EXE-X stage 3: 25 %; S2: ×2) — x-4, S3 x-1; none outside it, none for air units, none once the skill is over', () => {
  // S1, normal: a hitter in her x-4 (beside her) — 20 %; another two tiles ahead — 0 %
  {
    const t0 = talentOf(5, false, null, 0);
    assert.deepEqual([t0.damage_hitrate_physical, t0.damage_hitrate_magical], [-0.2, -0.2]);
    const { h, u } = field({ tier: 5, skill: 0, others: [{ uid: 2, chessId: YAK, row: 10, col: 7 }] });
    const inside = h.spawn('enemy_caster', { pos: [11, 4] }), outside = h.spawn('enemy_hitter', { pos: [10, 6] });
    u.skill.extend(400);
    const wIn = watch(h, inside), wOut = watch(h, outside);
    h.run(300);
    const rIn = wIn(), rOut = wOut();
    assert.ok(rIn.n > 300 && Math.abs(rIn.rate - 0.2) < 0.05, `arts attacker in the x-4: ${rIn.rate} of ${rIn.n}`);
    assert.ok(rOut.n > 300 && rOut.rate === 0, `two tiles ahead: ${rOut.rate} of ${rOut.n}`);
    u.skill.extend(-999);
    h.step(2);
    const wAfter = watch(h, inside);
    h.run(60);
    const after = wAfter();
    assert.ok(after.n > 60 && after.rate === 0, 'skill over: no smoke');
    done(h);
  }
  // S2 at EXE-X stage 3: 25 % × 2
  {
    const t0 = talentOf(6, true, EX, 0);
    assert.equal(t0.damage_hitrate_physical, -0.25);
    const { h, u } = field({ tier: 6, elite: true, mod: EX, skill: 1 });
    const hitter = h.spawn('enemy_hitter', { pos: [10, 5] });
    const fly = h.spawn('enemy_flyhitter', { pos: [9, 4] });
    u.skill.extend(400);
    const w = watch(h, hitter), wFly = watch(h, fly);
    h.run(300);
    const r = w(), rFly = wFly();
    assert.ok(r.n > 300 && Math.abs(r.rate - 0.5) < 0.05, `S2 ×2: ${r.rate} of ${r.n}`);
    assert.ok(rFly.n > 300 && rFly.rate === 0, `an air unit in the smoke: ${rFly.rate} of ${rFly.n}`);
    done(h);
  }
  // S3: the x-1 reaches two tiles ahead
  {
    const { h, u } = field({ tier: 5, skill: 2, others: [{ uid: 2, chessId: YAK, row: 10, col: 7 }] });
    const hitter = h.spawn('enemy_hitter', { pos: [10, 6] });
    u.skill.extend(400);
    const w = watch(h, hitter);
    h.run(300);
    const r = w();
    assert.ok(r.n > 150 && Math.abs(r.rate - 0.2) < 0.06, `S3 x-1: ${r.rate} of ${r.n}`);
    done(h);
  }
});

test('T2 弑君者威名: physical damage she deals to a ground enemy that has not damaged her this deployment ×1.22 (EXE-Y stage 3: ×1.37, and her 晕眩 on it ×1.5); a 持续伤害 tick marks nothing; the marks go when she leaves the field', () => {
  for (const f of [[5, false, null], [6, true, EY], [5, true, EY]]) {
    const [tier, elite, mod] = f;
    const t1 = talentOf(tier, elite, mod, 1), hidden = talentOf(tier, elite, mod, -1);
    const y3 = elite && mod === EY && tier === 6;
    assert.deepEqual([t1.damage_scale, hidden.one_minus_status_resistance ?? 0], y3 ? [1.37, 0.5] : [1.22, 0], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0 });
    h.run(10.1);   // S1 over: plain attacks
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    const hitsOn = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e && c.dmg?.isAttack);
    h.run(2);
    approx(hitsOn().slice(-1)[0].amount, u.s.atk * t1.damage_scale, `${label(f)}: fresh ×${t1.damage_scale}`);
    h.b.dealDamage(e, u, { amount: 5, type: 'true', canDodge: false, tags: ['dot'] });
    h.run(2);
    approx(hitsOn().slice(-1)[0].amount, u.s.atk * t1.damage_scale, `${label(f)}: a DoT tick marks nothing`);
    h.b.dealDamage(e, u, { amount: 5, type: 'phys', canDodge: false });
    h.run(2);
    approx(hitsOn().slice(-1)[0].amount, u.s.atk, `${label(f)}: it damaged her ⇒ ×1`);
    // EXE-Y stage 3: a stun of hers lasts ×1.5 on a fresh enemy only
    const fresh = h.spawn('enemy_dummy', { pos: [9, 5] });
    h.b.applyStatus(fresh, 'stun', { duration: 2, source: u });
    h.b.applyStatus(e, 'stun', { duration: 2, source: u });
    const st = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'stun').slice(-2);
    approx(st[0].duration, y3 ? 3 : 2, `${label(f)}: fresh ×${y3 ? 1.5 : 1}`);
    approx(st[1].duration, 2, `${label(f)}: marked ×1`);
    // her redeployment clears the marks
    redeployNow(h, u);
    h.run(10.1);
    h.run(2);
    approx(hitsOn().slice(-1)[0].amount, u.s.atk * t1.damage_scale, `${label(f)}: fresh again after a redeployment`);
    done(h);
  }
});

test('EXE-X 弑君刃: the refund has no effect (no retreat in battle); EXE-Y 木炭画: ATK +10 % while no allied operator stands on the 4 tiles beside her (stages 1 and 3)', () => {
  {
    const { h, u } = field({ tier: 6, elite: true, mod: EX, skill: 0 });
    assert.deepEqual(u.def.traitBb, { withdraw_cost_recover_ratio: 0.8 });
    h.b.players[0].dp = 3;
    h.b.retreat(u);
    h.step();
    assert.equal(h.b.players[0].dp, 3, 'no refund');
    done(h);
  }
  for (const f of [[5, true, EY], [6, true, EY], [6, true, EX]]) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 1, others: [{ uid: 2, chessId: TEXAS, row: 12, col: 7 }] });
    const texas = h.unit(2);
    assert.equal(!!u.findBuff('trait:crosly:lonely'), mod === EY, `${label(f)}: alone`);
    if (mod === EY) approx(u.s.atk, u.base.atk * 1.1, `${label(f)}: ATK +10 %`);
    assert.ok(h.b.relocate(texas, 10, 5));
    h.step();
    assert.equal(u.findBuff('trait:crosly:lonely'), null, `${label(f)}: an operator beside her`);
    done(h);
  }
});
