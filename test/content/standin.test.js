// test/content/standin.test.js — 补位 stand-ins in the battle simulation (DATA.md §18; kits/README.md "Stand-in kits").
//
// The data layer: simdata getChess(id, { standIn: true }) / getStandIn — the chess's identity (ids, bonds, 特质, tier)
// with the stand-in's body, skill and module (shared/standIn.js standInRecord over data/backups.json) —, the per-battle
// view, the BattleSpec field `standIn`; the kit lookup by the stand-in's charId, never the replaced operator's kit
// (content/index.js kitOf); the harness option `units[].standIn`; and the eight 预备干员 (char_600–607) on the generic
// path, on every chess they replace (normal + elite): the stand-in body, the skill firing with its blackboard numbers,
// the unconditional stat talent (generic.js genericTalents), 一击即退 lasting its 10 s from every deployment (PRTS
// 预备干员-特种: 被动, 持续 10), 冲锋号令's DP at full SP (as 德克萨斯's kit casts the same skill) and 预备干员-重装 casting
// with an enemy in range (the owner's 重装 exception for the stand-ins, 2026-10-05; tools/build-data.mjs
// STANDIN_TRIGGER_DEVIATIONS).
// Run: node --test test/content/standin.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, standInRec, checkInvariants } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource, withUnitLoadouts } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, sanitizeUnitLoadout } from '../../server/sim/spec.js';
import { KITS, kitOf, isStandInDef, skillSpecSource } from '../../server/sim/content/index.js';
import { statTalentMods } from '../../server/sim/content/generic.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { standInRecord, unitForm } from '../../shared/standIn.js';
import { bodyInKeys } from '../../server/sim/body.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ds = getDefaultSource();
const RESERVES = ['char_600_cpione', 'char_601_cguard', 'char_602_cdfend', 'char_603_csnipe', 'char_604_ccast', 'char_605_cmedic', 'char_606_csuppo', 'char_607_cspec'];
/** Every chess record (normal + elite) a 预备干员 stands in for. */
const RESERVE_RECORDS = Object.values(CHESS).filter((c) => c.chessType === 'NORMAL' && RESERVES.includes(c.backup.charId))
  .sort((a, b) => a.chessId.localeCompare(b.chessId));
const DUMMY = { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 0, speed: 1 }) };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// ---------------------------------------------------------------------------------------------------------------
// data layer

test('data: every NORMAL chess record resolves to its stand-in def — the chess identity, the stand-in body and backup selection — cached and frozen; PRESET / DIY keep their own def', () => {
  let n = 0;
  for (const c of Object.values(CHESS)) {
    const d = ds.getChess(c.chessId, { standIn: true });
    if (c.chessType !== 'NORMAL') {
      assert.equal(d, ds.getChess(c.chessId), `${c.chessId}: a ${c.chessType} chess fights as itself`);
      assert.equal(d?.standInFor, undefined);
      continue;
    }
    const r = standInRecord(c, BACKUPS);
    const where = `${c.chessId} → ${c.backup.charId}`;
    assert.deepEqual([d.id, d.baseId, d.golden, d.tier, d.charId, d.standInFor, d.name], [c.chessId, c.baseId, !!c.isGolden, c.tier, c.backup.charId, c.charId, r.name], where);
    assert.deepEqual([d.bonds, d.raw.garrisonIds], [c.bonds, c.garrisonIds], `${where}: bonds / 特质 of the chess`);
    for (const k of ['maxHp', 'atk', 'def', 'res', 'blockCnt', 'cost', 'respawnTime']) assert.equal(d.stats[k], r.stats[k], `${where}: ${k} of the stand-in`);
    assert.deepEqual([d.profession, d.subProf, d.rangeGrid], [r.profession, r.subProfessionId, r.rangeGrid], `${where}: class and range of the stand-in`);
    assert.deepEqual([d.skill.id, d.skill.index, d.skill.bb], [r.skill.skillId, c.backup.skillIndex, r.skill.bb], `${where}: the chess's backup skill`);
    assert.equal(d.loadout.standIn, true);
    assert.equal(d.loadout.moduleId ?? null, c.status.equipLevel > 0 ? (c.backup.uniEquipId ?? 'none') : null, `${where}: the backup module`);
    assert.equal(!!d.raw.module?.active, !!(c.backup.uniEquipId && c.status.equipLevel > 0), `${where}: module active`);
    assert.ok(Object.isFrozen(d) && Object.isFrozen(d.skill.bb), `${where}: frozen`);
    assert.equal(ds.getChess(c.chessId, { standIn: true, skillIndex: 0, moduleId: 'none' }), d, `${where}: a stand-in's skill / module cannot be changed`);
    const own = ds.getChess(c.chessId);
    assert.ok(own !== d && own.charId === c.charId && own.standInFor === undefined, `${where}: the chess's own def is untouched`);
    assert.ok(isStandInDef(d) && !isStandInDef(own));
    n++;
  }
  assert.equal(n, 110);
});

test('data: a source without backups.json fields the chess itself (a browser that did not fetch it); with it, the stand-in', () => {
  const rec = CHESS.chess_char_4_04_a;
  const bare = new DataSource({ chess: { [rec.chessId]: rec } }, null);
  assert.equal(bare.rawBackups(), null);
  const d = bare.getChess(rec.chessId, { standIn: true });
  assert.deepEqual([d.charId, d.standInFor], [rec.charId, undefined]);
  const full = new DataSource({ chess: { [rec.chessId]: rec }, backups: BACKUPS }, null);
  assert.deepEqual([full.getChess(rec.chessId, { standIn: true }).charId, full.getChess(rec.chessId, { standIn: true }).standInFor], ['char_607_cspec', rec.charId]);
  // a fallback chain finds the default source's backups (test DataSources over getDefaultSource)
  assert.equal(new DataSource({}, ds).rawBackups(), ds.rawBackups());
});

test('spec and view: buildBattleSpec keeps standIn only when exactly true (never on a token); createBattleFromSpec fields the stand-in; the view maps id-only lookups', () => {
  assert.deepEqual(sanitizeUnitLoadout({ chessId: 'x', standIn: true }), { chessId: 'x', standIn: true });
  assert.deepEqual(sanitizeUnitLoadout({ chessId: 'x', standIn: 'true' }), { chessId: 'x' });
  assert.deepEqual(sanitizeUnitLoadout({ chessId: 'x', standIn: 1 }), { chessId: 'x' });
  assert.deepEqual(sanitizeUnitLoadout({ kind: 'token', tokenId: 't', standIn: true }), { kind: 'token', tokenId: 't' });
  const spec = buildBattleSpec({
    battleId: 'standin', fieldId: 'f', kind: 'normal', seed: 9, modeId: 'mode_multi_normal', round: 3, stageId: 'act2autochess_m01', timeLimit: 30,
    players: [{
      playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, bandId: null, playerEffects: [],
      units: [
        { uid: 1, kind: 'chess', chessId: 'chess_char_4_04_a', row: 10, col: 4, standIn: true },
        { uid: 2, kind: 'chess', chessId: 'chess_char_4_07_a', row: 11, col: 4, standIn: 'yes' },
      ],
    }],
    spawns: [], routes: [],
  });
  assert.deepEqual(spec.players[0].units.map((u) => u.standIn), [true, undefined]);
  const b = createBattleFromSpec(spec, ds);
  b.step();
  const [u1, u2] = [1, 2].map((uid) => b.allyUnits.find((u) => u.uid === uid));
  assert.deepEqual([u1.def.charId, u1.def.standInFor, u1.defId], ['char_607_cspec', CHESS.chess_char_4_04_a.charId, 'chess_char_4_04_a']);
  assert.deepEqual([u2.def.charId, u2.def.standInFor], [CHESS.chess_char_4_07_a.charId, undefined]);
  assert.equal(b.data.getChess('chess_char_4_04_a'), u1.def, 'the per-battle view: an id-only lookup is the stand-in');
  assert.deepEqual(b.data.loadoutConflicts, []);
  assert.equal(b.errors.length, 0);
  // two players of one field: one fields the chess as its stand-in, the other as itself — the first wins id-only lookups
  const view = withUnitLoadouts(ds, [
    { units: [{ chessId: 'chess_char_4_04_a', standIn: true }] },
    { units: [{ chessId: 'chess_char_4_04_a' }] },
  ]);
  assert.deepEqual(view.loadoutConflicts, ['chess_char_4_04_a']);
  assert.equal(view.getChess('chess_char_4_04_a').charId, 'char_607_cspec');
  assert.equal(view.getChess('chess_char_4_04_a', {}).charId, CHESS.chess_char_4_04_a.charId, 'an explicit loadout is exact');
});

// ---------------------------------------------------------------------------------------------------------------
// kit lookup

test('kits: a stand-in finds its kit by its charId only — never the kit of the operator it replaces (kitOf, skillSpecSource)', () => {
  const sd = ds.getChess('chess_char_4_04_a', { standIn: true });
  const od = ds.getChess('chess_char_4_04_a');
  const fChess = () => ({}), fStand = () => ({});
  assert.equal(typeof KITS.chess_char_4_04_a, 'function', '伊内丝 has a kit of her own');
  assert.equal(kitOf(sd, { chess_char_4_04_a: fChess, chess_char_4_04: fChess }), undefined);
  assert.equal(kitOf(sd, { chess_char_4_04_a: fChess, char_607_cspec: fStand }), fStand);
  assert.equal(kitOf(od, { chess_char_4_04_a: fChess, char_607_cspec: fStand }), fChess);
  assert.equal(kitOf(ds.getChess('chess_char_4_04_b'), { chess_char_4_04_a: fChess }), fChess, 'the elite finds the base kit as before');
  assert.equal(kitOf(sd, KITS), undefined, 'no stand-in kit is registered for 预备干员-特种');
  assert.equal(skillSpecSource(sd), 'none');
  assert.equal(skillSpecSource(od), 'kit');
  assert.equal(skillSpecSource(sd, { char_607_cspec: () => ({ skills: { 'skcom_born_up[2]': { kind: 'passive' } } }) }), 'skills');
  assert.equal(skillSpecSource(sd, { char_607_cspec: () => ({ skill: { kind: 'passive' } }) }), 'generic', 'a stand-in has no default skill');
});

test('kits in battle: injected kits keyed by the chess id reach the operator only, keyed by the charId the stand-in only; without one the stand-in runs the generic kit', () => {
  const calls = [];
  const spy = (tag) => (bb, chess, def) => { calls.push([tag, def.charId]); return { skill: null, talents: [] }; };
  const h = makeBattle({
    units: [{ chessId: 'chess_char_4_04_a', row: 10, col: 4, standIn: true }, { chessId: 'chess_char_4_04_b', row: 11, col: 4 }],
    kits: { chess_char_4_04_a: spy('chess'), char_607_cspec: spy('standIn') },
  });
  h.step();
  assert.deepEqual(calls.sort(), [['chess', CHESS.chess_char_4_04_b.charId], ['standIn', 'char_607_cspec']]);
  checkInvariants(h.b);
  const g = makeBattle({ units: [{ chessId: 'chess_char_4_04_a', row: 10, col: 4, standIn: true }, { chessId: 'chess_char_4_04_b', row: 11, col: 4 }] });
  g.step();
  const [s, o] = [g.unit(1), g.unit(2)];
  assert.equal(s.kit.generic, true, 'the stand-in: generic kit');
  assert.equal(s.kit.talents.length, 1, 'plus its one unconditional stat talent');
  assert.ok(!o.kit.generic, 'the operator: her own kit');
  assert.equal(g.b.errors.length, 0);
});

test('kits: a stand-in kit has no default skill — `skills[skillId]` is its spec, `skill` is never used (the generic spec instead)', () => {
  const run = (kit) => {
    const h = makeBattle({ units: [{ chessId: 'chess_char_4_07_a', row: 10, col: 4, standIn: true }], kits: { char_601_cguard: () => kit } });
    h.step();
    return h.unit(1).kit;
  };
  const k1 = run({ skill: { kind: 'duration', mods: { atkPct: 9 } }, talents: [] });
  assert.equal(k1.skillSource, 'generic');
  assert.deepEqual(k1.skill.mods, { atkPct: 0.35 }, '攻击力强化·β型 at Lv4: atk 0.35 from the blackboard');
  const k2 = run({ skills: { 'skcom_atk_up[2]': { kind: 'duration', mods: { atkPct: 0.123 } } }, talents: [] });
  assert.equal(k2.skillSource, 'skills');
  assert.deepEqual(k2.skill.mods, { atkPct: 0.123 });
});

test('loadout sync keeps a stand-in whose entry also names a skill / module; UnitInfo carries standInFor for the client', () => {
  const h = makeBattle({ units: [
    { chessId: 'chess_char_4_07_b', row: 10, col: 4, standIn: true, skillIndex: 0, moduleId: 'none' },
    { chessId: 'chess_char_4_04_a', row: 11, col: 4 },
  ] });
  h.step();
  const [s, o] = [h.unit(1), h.unit(2)];
  assert.deepEqual([s.def.charId, s.skill.id], ['char_601_cguard', 'skcom_atk_up[2]']);
  assert.equal(unitInfo(s).standInFor, CHESS.chess_char_4_07_b.charId);
  assert.equal(unitInfo(s).spine, 'char_601_cguard', 'the stand-in model');
  assert.equal(unitInfo(o).standInFor, undefined);
  assert.equal(h.b.errors.length, 0);
});

test('harness: standIn: { skillIndex, moduleId } fields another skill / module of the stand-in (standInRec); a chess without a stand-in throws', () => {
  const r = standInRec('chess_char_5_11_b', { skillIndex: 0 });
  assert.deepEqual([r.charId, r.skill.skillId, r.module.id, r.module.active, r.standInFor], ['char_613_acmedc', 'skchr_acmedc_1', 'uniequip_002_acmedc', true, CHESS.chess_char_5_11_b.charId]);
  assert.deepEqual(standInRec('chess_char_5_11_b'), standInRecord(CHESS.chess_char_5_11_b, BACKUPS), 'no selection: the chess backup');
  const h = makeBattle({ units: [{ chessId: 'chess_char_5_11_b', row: 10, col: 4, standIn: { skillIndex: 0, moduleId: 'none' } }] });
  h.step();
  const u = h.unit(1);
  assert.deepEqual([u.def.charId, u.skill.id, !!u.def.raw.module?.active, u.def.standInFor], ['char_613_acmedc', 'skchr_acmedc_1', false, CHESS.chess_char_5_11_b.charId]);
  assert.equal(u.base.atk, unitForm(BACKUPS, 'char_613_acmedc', CHESS.chess_char_5_11_b.status).stats.atk, 'no module: the form ATK');
  assert.throws(() => standInRec('chess_char_1_01_a'), /no 补位 stand-in/);
  assert.throws(() => standInRec('chess_char_5_11_b', { skillIndex: 7 }), /has no skill/);
});

// ---------------------------------------------------------------------------------------------------------------
// the eight 预备干员 on the generic path

/** The skill buff mods the generic spec should give for a stat skill's blackboard (generic.js key map). */
function statMods(bb) {
  const m = {};
  if (bb.atk) m.atkPct = bb.atk;
  if (bb.def) m.defPct = bb.def;
  if (bb.attack_speed) m.aspd = bb.attack_speed;
  return m;
}

test('the eight 预备干员: every chess record they replace fields the stand-in body; the skill fires with its blackboard numbers; the stat talent applies', () => {
  const seen = new Set();
  for (const c of RESERVE_RECORDS) {
    const charId = c.backup.charId;
    const form = unitForm(BACKUPS, charId, c.status);
    const sk = form.skills.find((s) => s.index === c.backup.skillIndex);
    const where = `${c.chessId} ${c.name} → ${BACKUPS.units[charId].name} ${sk.name}`;
    const medic = charId === 'char_605_cmedic';
    const units = [{ chessId: c.chessId, row: 9, col: 5, dir: 'RIGHT', standIn: true, carryState: { sp: 999 } }];
    if (medic) units.push({ chessId: 'chess_char_1_02_a', row: 10, col: 6 });
    const h = makeBattle({
      defs: { enemies: DUMMY }, units, timeLimit: 60, autoFinish: false, flags: { dpPerSec: 0 },
      enemies: medic ? [] : [{ key: 'enemy_dummy', route: 0, time: 0 }], hooks: ['skillStart'],
    });
    const u = h.unit(1);
    if (medic) { h.step(); const a = h.unit(2); h.b.loseHp(a, a.hp * 0.6); }
    // the stand-in body and the generic kit, never the replaced operator's
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id, u.kit.generic], [charId, c.charId, sk.skillId, true], where);
    for (const k of ['maxHp', 'atk', 'def']) assert.equal(u.base[k], form.stats[k], `${where}: base ${k}`);
    // the unconditional stat talent (攻击力+8% / 防御力+10% / 攻击速度+9), as a persistent talent buff
    const talent = form.talents[0];
    const tMods = statTalentMods({ description: talent.desc, bb: talent.bb });
    assert.ok(tMods, `${where}: ${talent.desc} is a plain stat talent`);
    assert.deepEqual(u.findBuff('talent:generic:0')?.mods, tMods, `${where}: talent ${talent.name}`);
    const dp0 = h.b.players[0].dp;
    if (sk.skillType === 'PASSIVE') {
      h.step();
      // a deploy-timed passive runs the duration lifecycle from the deployment (#109): the skill's own mods
      assert.deepEqual([u.skill.kind, !!u.skill.spec.activateOnDeploy, u.skill.active], ['duration', true, true], `${where}: deploy-timed skill`);
      assert.deepEqual(u.findBuff(`skill:${u.id}`)?.mods, statMods(sk.bb), `${where}: deploy buff`);
    } else {
      assert.ok(h.runUntil(() => u.skill.activations > 0, 30), `${where}: the skill fires`);
      h.step();
      if (sk.prefabId === 'skcom_charge_cost') {
        assert.equal(u.skill.rule, 'SP_FULL', `${where}: AUTO, nothing to wait for`);
        assert.equal(h.b.players[0].dp, dp0 + sk.bb.cost, `${where}: +${sk.bb.cost} DP`);
      } else {
        const buff = u.findBuff(`skill:${u.id}`);
        assert.deepEqual(buff?.mods, statMods(sk.bb), `${where}: skill buff from the blackboard`);
        assert.equal(u.skill.kind, 'duration', where);
        assert.equal(u.skill.duration, sk.duration, `${where}: ${sk.duration} s`);
        // the stat the skill raises, exactly: base × (1 + talent + skill) or base + talent + skill
        if (sk.bb.atk) close(u.s.atk, form.stats.atk * (1 + (tMods.atkPct ?? 0) + sk.bb.atk), `${where}: ATK`);
        if (sk.bb.def) close(u.s.def, form.stats.def * (1 + (tMods.defPct ?? 0) + sk.bb.def), `${where}: DEF`);
        if (sk.bb.attack_speed) assert.equal(u.s.aspd, form.stats.aspd + (tMods.aspd ?? 0) + sk.bb.attack_speed, `${where}: ASPD`);
      }
    }
    checkInvariants(h.b);
    assert.equal(h.b.errors.length, 0, `${where}: ${JSON.stringify(h.b.errors[0])}`);
    seen.add(charId);
  }
  assert.equal(RESERVE_RECORDS.length, 28);
  assert.deepEqual([...seen].sort(), RESERVES);
});

test('一击即退 (预备干员-特种 for 伊内丝): ATK / DEF up for exactly its 10 s from every deployment, normal and elite', () => {
  for (const id of ['chess_char_4_04_a', 'chess_char_4_04_b']) {
    const c = CHESS[id];
    const form = unitForm(BACKUPS, 'char_607_cspec', c.status);
    const sk = form.skills.find((s) => s.index === c.backup.skillIndex);
    assert.deepEqual([sk.skillId, sk.skillType, sk.duration], ['skcom_born_up[2]', 'PASSIVE', 10]);
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }], timeLimit: 200, autoFinish: false });
    const u = h.unit(1);
    const on = () => { close(u.s.atk, form.stats.atk * (1.08 + sk.bb.atk), `${id} ATK on`); close(u.s.def, form.stats.def * (1 + sk.bb.def), `${id} DEF on`); };
    const off = () => { close(u.s.atk, form.stats.atk * 1.08, `${id} ATK off`); close(u.s.def, form.stats.def, `${id} DEF off`); };
    h.run(9.9);
    on();
    h.run(0.2);
    off();
    // knocked out and redeployed (再部署时间大幅度减少): the buff starts again with the new deployment
    h.b.kill(u);
    assert.ok(h.runUntil(() => u.alive && u.deployed, 60), `${id}: redeployed`);
    const back = h.b.time;
    h.step();
    on();
    h.runUntil(() => h.b.time >= back + 9.9, 20);
    on();
    h.run(0.2);
    off();
    checkInvariants(h.b);
    assert.equal(h.b.errors.length, 0);
  }
});

test('冲锋号令·γ型 (预备干员-先锋 for 圣约送葬人): +12 DP as soon as the SP is full — no enemy needed — then again after each refill', () => {
  for (const id of ['chess_char_5_01_a', 'chess_char_5_01_b']) {
    const c = CHESS[id];
    const sk = unitForm(BACKUPS, 'char_600_cpione', c.status).skills.find((s) => s.index === c.backup.skillIndex);
    assert.deepEqual([sk.skillId, sk.skillType, sk.bb.cost], ['skcom_charge_cost[3]', 'AUTO', 12]);
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 4, standIn: true }], timeLimit: 200, autoFinish: false, flags: { dpPerSec: 0 }, hooks: ['skillStart'] });
    const u = h.unit(1);
    const dp = () => h.b.players[0].dp;
    h.step();
    const dp0 = dp();
    // initial SP initSp, then +1/s: the first cast when the SP reaches the cost (41 − 12 s normal, 38 − 14 s elite)
    assert.ok(h.runUntil(() => u.skill.activations === 1, 60));
    close(Math.round(h.b.time), sk.spCost - sk.initSp, `${id}: first cast at full SP`);
    h.step();
    assert.equal(dp(), dp0 + 12, `${id}: +12 DP`);
    assert.ok(h.runUntil(() => u.skill.activations === 2, 60));
    h.step();
    assert.equal(dp(), dp0 + 24, `${id}: +12 DP again`);
    assert.equal(h.hooksOf('skillStart').length, 2);
    assert.equal(h.b.enemies.length, 0, 'no enemy at all');
    checkInvariants(h.b);
  }
});

/**
 * A real battle (the 重装 trigger check of test/sim/feedback1-tank-triggers.test.js): the stand-in of `chessId` on
 * (9,5) of 战场#01(下半) facing the gate with its SP full; one 萨卡兹枯朽前锋 (melee) walks the lane from 3 s. Returns the
 * first cast (time, reason, an enemy on its range or blocked then) and the time the unit first took damage.
 */
function firstCast(chessId) {
  const h = makeBattle({
    stageId: 'act2autochess_m01', seed: 3, timeLimit: 120, autoFinish: false,
    units: [{ chessId, row: 9, col: 5, dir: 'RIGHT', standIn: true, carryState: { sp: 999 } }],
    enemies: [{ key: 'enemy_1422_lrsldr', route: 0, time: 3 }],
  });
  const u = h.unit(chessId);
  const out = { rule: u.skill.rule, cast: null, reason: null, enemyInRange: false, blocking: false, hurt: null };
  h.b.on('damaged', (ctx) => { if (ctx.target === u && out.hurt == null) out.hurt = h.b.time; }, { priority: 1000 });
  h.b.on('skillStart', (ctx) => {
    if (ctx.unit !== u || out.cast != null) return;
    out.cast = h.b.time;
    out.reason = ctx.reason;
    const keys = new Set(u.baseRangeKeys || u.rangeKeys);
    out.enemyInRange = h.b.enemies.some((e) => e.alive && e.deployed && bodyInKeys(e, keys));
    out.blocking = u.blocking.length > 0;
  }, { priority: 1000 });
  h.runUntil(() => out.cast != null && out.hurt != null, 40);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return { ...out, charId: u.def.charId, skill: u.skill.id, trigger: u.def.skill.trigger };
}

test('预备干员-重装 (for 泥岩 S2, 乌尔比安 S3): casts with an enemy in range before anything hits it — the official 重装 row [ON_TAKE_DAMAGE, SKILL_RANGE_ENEMY] (TAKE_DAMAGE + SEARCH), no deviation', () => {
  for (const id of ['chess_char_4_18_a', 'chess_char_4_18_b', 'chess_char_5_05_a', 'chess_char_5_05_b']) {
    const r = firstCast(id);
    const where = `${id}: ${JSON.stringify(r)}`;
    assert.equal(r.charId, 'char_602_cdfend', where);
    assert.deepEqual(r.trigger, { rule: 'TAKE_DAMAGE', grid: null, also: [{ rule: 'SEARCH', grid: null }] }, where);
    assert.equal(r.rule, 'TAKE_DAMAGE', where);
    assert.ok(r.cast != null && r.cast >= 3, `cast once the enemy is on the field — ${where}`);
    // the SEARCH entry (a tick rule: an enemy in the initial range, or one it blocks) casts it, not the TAKE_DAMAGE entry
    assert.equal(r.reason, 'SEARCH', where);
    assert.ok(r.enemyInRange || r.blocking, `an enemy on its tile at the cast — ${where}`);
    assert.ok(r.hurt == null || r.hurt > r.cast, `cast before the first hit — ${where}`);
  }
  // the data carries the official 重装 row on every skill of both 重装 stand-ins (rawRule = the first official type)
  for (const charId of ['char_602_cdfend', 'char_610_acfend']) {
    for (const f of Object.values(BACKUPS.units[charId].forms)) for (const s of f.skills) assert.deepEqual([s.trigger.rule, s.trigger.rawRule, s.trigger.official, s.trigger.also.map((a) => a.rule)], ['TAKE_DAMAGE', 'ON_TAKE_DAMAGE', ['ON_TAKE_DAMAGE', 'SKILL_RANGE_ENEMY'], ['SEARCH']], `${charId} ${s.skillId}`);
  }
});
