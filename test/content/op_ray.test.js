// test/content/op_ray.test.js — the 自选 operator kit of 莱伊 (char_4117_ray, 6★ 猎手; kit
// server/sim/content/kits/ops/op-ray.js) and of her summon 沙地兽 (token_10034_ray_sndbst), fielded the production way (a DIY
// slot + its `diy` pick, simdata getDiy; the 沙地兽 as the placed hand piece of her player) in every form: tiers 5 / 6,
// normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, HUN-X 《跳舞的月光》 or HUN-Y 证明什么？
// at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_ray.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';
import { SANDBEAST, SPECIAL_TAG } from '../../server/sim/content/kits/ops/op-ray.js';
import { PUSH_TILES } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const RAY = 'char_4117_ray';
const FORMS = BACKUPS.units[RAY].forms;
const TOKREC = BACKUPS.tokens[SANDBEAST];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const HX = 'uniequip_002_ray', HY = 'uniequip_003_ray';
const S1 = 'skchr_ray_1', S2 = 'skchr_ray_2', S3 = 'skchr_ray_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
/** The 沙地兽's variant of a form, with the pick's module (getDiyToken). */
const tokOf = (tier, elite, mod) => {
  const v = TOKREC.variants[`${RAY}@${statusOf(tier, elite)}`];
  return mod && v.byModule?.[mod] ? { ...v, ...v.byModule[mod] } : v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_weak: dummy('enemy_weak', { hp: 10 }),
  enemy_atk: dummy('enemy_atk', { atk: 500, range: 2 }),
};
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, HX, HY].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 莱伊 as uid 1 at (row, col) facing RIGHT; `beast` = the 沙地兽 piece's tile (uid 2) or null. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 3, beast = null, beastFirst = false, others = [], seed = 5, flags = {} } = {}) {
  const op = { uid: 1, diy: { slot: SLOT[tier], charId: RAY, skillIndex: skill, uniEquipId: mod }, elite, row, col };
  const piece = beast ? [{ uid: 2, kind: 'token', tokenId: SANDBEAST, ownerUid: 1, row: beast[0], col: beast[1] }] : [];
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...flags }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'deploy', 'attack', 'kill'], captureNoisy: true,
    units: beastFirst ? [...piece, op, ...others] : [op, ...piece, ...others],
  });
  h.step();
  return { h, u: h.unit(1), t: h.b.allyUnits.find((a) => a.kind === 'token' && a.defId === SANDBEAST) ?? null };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** Record (time, ammo) every time her magazine changes. */
function ammoLog(h, u) {
  const log = [];
  let last = u.trait.ammo;
  h.b.on('tick', () => { if (u.trait.ammo !== last) { log.push([h.b.time, u.trait.ammo]); last = u.trait.ammo; } });
  return log;
}

test('莱伊 in every 自选 form: her kit (all three skills authored), the form\'s stats + module attributes, 4-9, 猎手 (ranged physical, hits air, 8 bullets, ×1.2 / HUN-Y ×1.33), blocks 1, ground-targetable, the triggers (S2 at full SP); offered as a pick', () => {
  assert.equal(OPERATOR_KITS[RAY], KITS[RAY]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [RAY, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.aspd],
        [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0), 100 + (m?.attr.aspd ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.canHitFly, u.profile.dmgType, u.profile.sub, u.base.bat, u.profile.ammoMax, u.profile.ammoScale, u.trait.ammo],
        [1, 'ranged', true, 'phys', 'hunter', 1.6, 8, mod === HY ? 1.33 : 1.2, 8], `${label(f)}: 猎手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 4-9`);
      assert.equal(u.skill.rule, skill === 1 ? 'SP_FULL' : form.skills[skill].trigger.rule, `${label(f)}: trigger`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual(formOf(6, true).skills.map((s) => s.trigger.rule), ['DEFAULT', 'DEFAULT', 'ACTIVE_RANGE']);
  assert.deepEqual([modOf(5, HX).attr, modOf(6, HX).attr, modOf(5, HY).attr, modOf(6, HY).attr],
    [{ maxHp: 150, atk: 50, def: 15 }, { maxHp: 200, atk: 70, def: 25 }, { maxHp: 100, atk: 60, aspd: 5 }, { maxHp: 200, atk: 75, aspd: 7 }]);
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(RAY) && [5, 6].every((t) => diyPool(t, { data, kitted: KITTED_CHARS }).includes(RAY)));
  assert.equal(validateDiyPicks({ [SLOT[5]]: { charId: RAY, skillIndex: 1, uniEquipId: HX } }, { data, kitted: KITTED_CHARS }).ok, true);
});

test('trait 猎手: 8 bullets, one per attack at ×1.2 (HUN-Y ×1.33); empty ⇒ a reload of her BASE attack time (1.6 s, ASPD +100 changes nothing) loads one bullet; HUN-X loads one more onto an empty magazine; with nobody to shoot she reloads to full and stops', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, HX], [6, true, HX], [6, true, HY]]) {
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    u.skill.sp = 0;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    h.b.addBuff(u, { key: 'test:fast', mods: { aspd: 100 } });
    const log = ammoLog(h, u);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => u.trait.ammo === 0, 20), `${mod}: the magazine runs out`);
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 8, `${mod}: 8 shots`);
    h.run(0.3); // the last arrow lands (the reload has begun meanwhile)
    const hits = atkHits(h, u);
    assert.equal(hits.length, 8);
    const sc = mod === HY ? 1.33 : 1.2;
    // (入神 adds +9 % / +10 % per attack on the same target; the first shot has one layer)
    const t1 = (mod === HY && tier === 6) ? 0.1 : 0.09;
    approx(hits[0].amount, u.base.atk * (1 + t1) * sc, `${mod}: ×${sc}`);
    const iv = u.s.interval;
    approx(iv, 1.6 * 100 / (u.base.aspd + 100), 'ASPD +100 shortens her attacks');
    // empty with a target: each reload (after the attack cooldown) loads, and she shoots at once — HUN-X: two bullets
    const hx = elite && mod === HX;
    assert.ok(h.runUntil(() => h.hooksOf('attack').filter((c) => c.attacker === u).length >= 12, 30), 'more shots');
    const ts = h.hooksOf('attack').filter((c) => c.attacker === u).map((c) => c.t);
    for (let i = 1; i < 8; i++) approx(ts[i] - ts[i - 1], iv, `${mod}: the magazine at ${iv.toFixed(2)} s`, 0.05);
    approx(ts[8] - ts[7], iv + 1.6, `${mod}: cooldown + a 1.6 s reload (never shortened)`, 0.05);
    if (hx) {
      approx(ts[9] - ts[8], iv, 'HUN-X: the second bullet of that reload', 0.05);
      approx(ts[10] - ts[9], iv + 1.6, 'then a reload again', 0.05);
    } else {
      approx(ts[9] - ts[8], iv + 1.6, `${mod}: one bullet per reload`, 0.05);
    }
    // nobody to shoot: one bullet per 1.6 s up to 8, then nothing
    h.b.kill(e, null);
    const n0 = log.length;
    h.run(20);
    const reloads = log.slice(n0);
    assert.equal(reloads[reloads.length - 1][1], 8, `${mod}: full`);
    for (let i = 1; i < reloads.length; i++) approx(reloads[i][0] - reloads[i - 1][0], 1.6, `${mod}: one bullet per 1.6 s`, 0.03);
    const tFull = reloads[reloads.length - 1][0];
    assert.ok(h.b.time - tFull > 5 && u.trait.ammo === 8, 'stops at 8');
    done(h);
  }
});

test('莱伊 shoots air units (猎手 "可对空"): a flyer in her range is her target; physical arrows', () => {
  for (const [tier, elite, mod] of [[5, false, null], [6, true, HY]]) {
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    u.skill.sp = 0;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    const fly = h.spawn('enemy_fly', { pos: [10, 6] });
    h.run(3);
    const hits = atkHits(h, u).filter((c) => c.target === fly);
    assert.ok(hits.length >= 1 && hits.every((c) => c.type === 'phys'), `T${tier}: the flyer is shot`);
    done(h);
  }
});

test('T2 入神: +9 % ATK per attack on the same target, ≤ 3 layers (HUN-Y stage 3: +10 %, ≤ 4), lost on a new target (one layer again)', () => {
  for (const [tier, elite, mod] of [[5, false, null], [5, true, HY], [6, true, HY], [6, true, HX]]) {
    const y3 = tier === 6 && mod === HY;
    const [per, max] = y3 ? [0.1, 4] : [0.09, 3];
    const t1 = (mod ? formOf(tier, true) : formOf(tier, elite)).talents.find((t) => t.index === 1).bb;
    if (!y3) assert.deepEqual(t1, { atk: 0.09, max_stack_cnt: 3 });
    const { h, u } = field({ tier, elite, mod, skill: 1 });
    u.skill.sp = 0;
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    const atks = [];
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg.isAttack) atks.push([c.target, u.s.atk]); }, { priority: -100 });
    const a = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => atks.length >= 6, 20);
    for (let i = 0; i < 6; i++) approx(atks[i][1], u.base.atk * (1 + per * Math.min(max, i + 1)), `${label([tier, elite, mod])}: attack ${i + 1}`);
    h.b.kill(a, null);
    const b = h.spawn('enemy_dummy', { pos: [10, 6] });
    const n = atks.length;
    h.runUntil(() => atks.length >= n + 1, 20);
    assert.equal(atks[n][0], b);
    approx(atks[n][1], u.base.atk * (1 + per), 'a new target: one layer');
    done(h);
  }
});

test('S1 脱身矢 (MANUAL, 2 charges, data DEFAULT): a special bullet at once (no bullet of the magazine) for 290 % / 360 % × the trait scale, pushed 中力 along her facing; off her facing radial at 力度 −1; a kill loads one more bullet at the next reload; with an empty magazine it still fires', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.spCost, sk.initSp, sk.maxChargeTime, sk.bb.atk_scale, sk.bb.force, sk.bb.cnt], elite ? [12, 10, 2, 3.6, 1, 1] : [14, 10, 2, 2.9, 1, 1], `T${tier}`);
    // straight ahead: pushed along +x
    {
      const { h, u } = field({ tier, elite, skill: 0, row: 11 });
      assert.deepEqual([u.skill.kind, u.skill.rule, u.skill.maxCharges], ['charges', 'DEFAULT', 2]);
      const atkAt = [];
      h.b.on('damaged', (c) => { if (c.source === u) atkAt.push([c, u.s.atk]); }, { priority: -100 });
      const e = h.spawn('enemy_dummy', { pos: [11, 5] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations === 1, 3), `T${tier}: cast`);
      const ammo0 = u.trait.ammo;
      h.run(0.6);
      const special = atkAt.filter(([c]) => c.dmg.tags?.includes(SPECIAL_TAG));
      assert.equal(special.length, 1, `T${tier}: one special bullet`);
      const [c, atk] = special[0];
      approx(c.amount, atk * sk.bb.atk_scale * 1.2, `T${tier}: ${sk.bb.atk_scale * 100} % × 1.2`);
      assert.deepEqual([c.type, c.dmg.isSkill, c.dmg.isAttack], ['phys', true, true]);
      assert.equal(ammo0, 7, `T${tier}: the cast's normal attack took one bullet, the special one none`);
      approx(e.x, 5 + PUSH_TILES[1], `T${tier}: pushed ${PUSH_TILES[1]} tiles along her facing`, 0.03);
      approx(e.y, 11, 'no sideways push');
      done(h);
    }
    // beside her (90° off): radial, 力度 −1 (中力 − 1 = level 0 on a weight-0 enemy — the wall stops it at 8.5)
    {
      const { h, u } = field({ tier, elite, skill: 0, row: 11 });
      const e = h.spawn('enemy_dummy', { pos: [10, 3] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations === 1, 3));
      h.run(0.6);
      approx(e.x, 3, 'no forward push');
      assert.ok(10 - e.y > 1, `T${tier}: radial at level 0 (${(10 - e.y).toFixed(2)} tiles, the engine's −2 would be ${PUSH_TILES[-1] ?? 0.44})`);
      done(h);
    }
    // a kill: +1 bullet at the next reload; an empty magazine: the cast still comes
    {
      const { h, u } = field({ tier, elite, skill: 0 });
      u.trait.ammo = 0;
      const log = ammoLog(h, u);
      h.spawn('enemy_weak', { pos: [10, 5] });
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.activations === 1, 1), `T${tier}: cast with an empty magazine`);
      h.run(0.6);
      assert.equal(h.hooksOf('kill').filter((k) => k.killer === u).length, 1, 'the special bullet killed it');
      assert.equal(u.trait.ammo, 0, 'no bullet spent, none loaded yet');
      assert.ok(h.runUntil(() => u.trait.ammo > 0, 5));
      assert.equal(log[log.length - 1][1], 2, `T${tier}: 1 + 1 bullets`);
      done(h);
    }
  }
});

test('S2 广域警觉 (AUTO, attack SP 16): on at full SP — no enemy needed beyond the attacks that fill it — for good: range 4-10, ATK +60 % / +90 %', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S2);
    assert.deepEqual([sk.skillType, sk.spType, sk.spCost, sk.bb.atk, sk.bb.respawn_time, sk.rangeId], ['AUTO', 'INCREASE_WHEN_ATTACK', 16, elite ? 0.9 : 0.6, elite ? -0.3 : -0.2, '4-10'], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['toggle', 'SP_FULL']);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    assert.ok(h.runUntil(() => u.skill.active, 120), `T${tier}: on`);
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 16, `T${tier}: after 16 attacks (reloads give no SP)`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 4-10`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk + u.mem.rayStacks * 0.09), `T${tier}: ATK (with 入神's layers)`);
    h.b.kill(e, null);
    h.run(200);
    assert.ok(u.skill.active, `T${tier}: 持续时间无限`);
    // an enemy two tiles above her: only 4-10 reaches it
    const top = h.spawn('enemy_dummy', { pos: [12, 3] });
    h.run(3);
    assert.ok(atkHits(h, u).some((c) => c.target === top), `T${tier}: [2,0] of 4-10`);
    done(h);
  }
});

test('S3 “得见光芒” (MANUAL, 16 s, data ACTIVE_RANGE on 3-8): an enemy only on 3-8 casts it; no attack until the magazine is full, reloading every 0.4 s (1.6 − 1.2); range 3-8; attacks 230 % / 270 % × 1.2 and 束缚 2 s; a kill during it ⇒ +10 SP at its end, through 阻回', () => {
  for (const [tier, elite] of [[5, false], [6, true]]) {
    const sk = skillOf(tier, elite, S3);
    assert.deepEqual([sk.duration, sk.spCost, sk.initSp, sk.bb.reload_interval, sk.bb['attack@atk_scale'], sk.bb['attack@unmove_duration'], sk.bb.sp, sk.rangeId],
      [16, elite ? 33 : 37, elite ? 20 : 15, -1.2, elite ? 2.7 : 2.3, 2, 10, '3-8'], `T${tier}`);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.kind, u.skill.rule], ['duration', 'ACTIVE_RANGE']);
    u.trait.ammo = 2;
    const log = ammoLog(h, u);
    u.skill.gainSp(999);
    const side = h.spawn('enemy_dummy', { pos: [11, 6] });   // [1,3]: in 3-8, not in 4-9
    assert.ok(h.runUntil(() => u.skill.active, 1), `T${tier}: cast for [1,3]`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `T${tier}: 3-8 while it runs`);
    const tCast = h.b.time;
    const attacksAfter = () => h.hooksOf('attack').filter((c) => c.attacker === u && c.t > tCast - 1e-9);
    assert.ok(h.runUntil(() => attacksAfter().length > 0, 5), 'attacks once full');
    // 2 → 8 one bullet every 0.4 s, the first attack on the reload that fills it (the log sees 3 … 7, then 7 after that shot)
    const fills = log.filter((x) => x[0] > tCast - 1e-9);
    assert.deepEqual(fills.map((x) => x[1]), [3, 4, 5, 6, 7], `T${tier}: one at a time`);
    for (let i = 1; i < fills.length; i++) approx(fills[i][0] - fills[i - 1][0], 0.4, `T${tier}: a reload every 0.4 s`, 0.05);
    approx(attacksAfter()[0].t - fills[fills.length - 1][0], 0.4, `T${tier}: the 8th bullet, then the shot`, 0.05);
    assert.equal(u.trait.ammo, 7, `T${tier}: full when it shot`);
    const atkAt = [];
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg.isAttack) atkAt.push([c, u.s.atk]); }, { priority: -100 });
    h.run(4);
    assert.ok(atkAt.length >= 2, `T${tier}: attacks once full`);
    for (const [c, atk] of atkAt) approx(c.amount, atk * sk.bb['attack@atk_scale'] * 1.2, `T${tier}: ${sk.bb['attack@atk_scale'] * 100} % × 1.2`);
    const binds = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'bind' && c.target === side);
    assert.ok(binds.length >= 2 && binds.every((c) => Math.abs(c.duration - 2) < 1e-6), `T${tier}: 束缚 2 s on each hit`);
    // a kill during it: +10 SP at its end, through 阻回
    const weak = h.spawn('enemy_weak', { pos: [10, 4] });
    h.runUntil(() => !weak.alive, 10);
    h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
    h.runUntil(() => !u.skill.active, 20);
    approx(u.skill.sp, sk.bb.sp, `T${tier}: +${sk.bb.sp} SP at the end`, 0.01);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `T${tier}: back to 4-9`);
    done(h);
  }
});

test('沙地兽 (her placed piece): untargetable, 无敌, 禁疗, no attack; while it scouts (25 s) the enemies of its 3×3 are in her range and her skill trigger range, she shoots them first, ×1.15 (HUN-X stage 3: ×1.2) physical; then it leaves, and comes back on its tile after 30 s (HUN-X stage 3: 20 s) paying 3 DP', () => {
  for (const [tier, elite, mod, ds, resp] of [[5, false, null, 0.15, 30], [5, true, HX, 0.15, 30], [6, true, HX, 0.2, 20], [6, true, HY, 0.15, 30]]) {
    for (const beastFirst of [false, true]) {
      const { h, u, t } = field({ tier, elite, mod, skill: 2, beast: [10, 6], beastFirst });
      assert.ok(t && t.alive && t.deployed, `${mod}: deployed with the board`);
      assert.equal(t.ownerUnit, u);
      assert.deepEqual([t.base.respawnTime, t.base.cost, t.s.blockCnt], [tokOf(tier, elite, mod).stats.respawnTime, 3, 0], `${mod}: its stats`);
      assert.equal(t.base.respawnTime, resp);
      assert.ok(t.s.flags.untargetable && t.s.flags.invulnerable && t.s.flags.noHeal && t.profile.noAttack, `${mod}: untargetable, 无敌, 禁疗, no attack`);
      assert.equal(t.kit.skill, null, 'no skill of its own');
      // its area: in her range (and the trigger range of her skill)
      const away = h.spawn('enemy_dummy', { pos: [11, 7] });   // [1,4] of hers: outside 4-9 (and 3-8), inside its 3×3
      assert.ok(u.rangeKeySet.has(11 * 21 + 7), 'in her range');
      u.skill.gainSp(999);
      assert.ok(h.runUntil(() => u.skill.active, 1), `${mod}: S3 cast for an enemy of the area only`);
      u.skill.end('test');
      u.skill.sp = 0;
      h.b.addBuff(u, { key: 'test:noSp', flags: { noSp: true } });
      h.run(1); // S3's arrows land
      // priority: an enemy in her own range nearer the goal loses to the one of the area
      const near = h.spawn('enemy_dummy', { pos: [10, 4] });
      const atkAt = [];
      h.b.on('damaged', (c) => { if (c.source === u && c.dmg.isAttack) atkAt.push([c, u.s.atk]); }, { priority: -100 });
      h.run(3);
      assert.ok(atkAt.length >= 1 && atkAt.every(([c]) => c.target === away), `${mod}: she shoots the area's enemy first`);
      for (const [c, atk] of atkAt) approx(c.amount, atk * 1.2 * (mod === HY ? 1.33 / 1.2 : 1) * (1 + ds), `${mod}: ×${1 + ds} in the area`);
      h.b.kill(away, null);
      const n = atkAt.length;
      h.run(3);
      for (const [c, atk] of atkAt.slice(n)) { assert.equal(c.target, near); approx(c.amount, atk * (mod === HY ? 1.33 : 1.2), 'no bonus outside'); }
      // it leaves after its 25 s, her range is her own again
      const life = tokOf(tier, elite, mod).talents[0].bb.duration;
      assert.equal(life, 25);
      assert.ok(h.runUntil(() => !t.alive, 30), 'leaves');
      approx(h.b.time, life + h.b.dt, `${mod}: after ${life} s`, 0.02);
      assert.ok(!u.rangeKeySet.has(11 * 21 + 7), 'her range back');
      // back after its redeploy time, paying 3 DP
      h.b.players[0].dp = 10;
      const left = h.b.time;
      assert.ok(h.runUntil(() => t.alive, resp + 2), `${mod}: back`);
      approx(h.b.time - left, resp, `${mod}: after ${resp} s`, 0.3);
      assert.deepEqual([t.tileR, t.tileC, h.b.players[0].dp], [10, 6, 7], `${mod}: on its tile, 3 DP paid`);
      done(h);
    }
  }
});

test('沙地兽 with S2: 广域警觉 cuts its redeploy time by 20 % / 30 % while on; its passive gives back the bullets that hit in its area when it leaves; withdrawn when 莱伊 leaves, back once she is', () => {
  for (const [tier, elite, mod, resp] of [[5, false, null, 30], [6, true, null, 30], [6, true, HX, 20]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, t } = field({ tier, elite, mod, skill: 1, beast: [10, 6] });
    const e = h.spawn('enemy_dummy', { pos: [11, 7] });   // in its area only
    // the bullets that hit in its area: counted, given back when it leaves
    h.runUntil(() => u.trait.ammo <= 3, 20);
    const spent = 8 - u.trait.ammo;
    h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });
    h.run(1);
    const before = u.trait.ammo;
    assert.ok(h.runUntil(() => !t.alive, 30), 'leaves');
    assert.equal(u.trait.ammo, Math.min(8, before + spent), `T${tier}: ${spent} bullets back`);
    h.b.removeBuff(u, 'test:disarm');
    h.b.kill(e, null);
    // S2 on ⇒ redeploy ×(1 + respawn_time)
    u.skill.gainSp(999, 'init');
    h.step();
    assert.ok(u.skill.active, 'S2 on');
    const left = h.b.time;
    assert.ok(h.runUntil(() => t.alive, resp + 2), 'back');
    approx(h.b.time - left, resp * (1 + sk.bb.respawn_time), `T${tier} ${mod}: ${resp} × ${1 + sk.bb.respawn_time} s`, 0.3);
    // 莱伊 leaves: the 沙地兽 goes too; it waits for her
    h.b.retreat(u);
    h.step();
    assert.ok(!t.alive, 'withdrawn with her');
    h.run(resp + 5);
    assert.ok(!t.alive, 'not back while she is away');
    h.b.redeploy(u);
    assert.ok(h.runUntil(() => t.alive, 2), 'back with her');
    done(h);
  }
});
