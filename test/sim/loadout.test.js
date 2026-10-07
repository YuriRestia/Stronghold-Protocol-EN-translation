// test/sim/loadout.test.js — operator loadouts in the sim (DESIGN §16): resolving (chessId, skillIndex, moduleId) defs
// (simdata), the per-unit loadout fields of a BattleSpec (spec.js), the kit loader's skill selection (content/index.js)
// and the kit coverage report (tools/kit-coverage.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataSource, getDefaultSource, resolveLoadout, loadoutRecord, hasGeneratedData, isLoadoutView } from '../../server/sim/simdata.js';
import { Battle } from '../../server/sim/Battle.js';
import { loadoutOptions, resolveLoadout as resolveSeatLoadout } from '../../shared/protocol.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest, withUnitLoadouts, jsonClone } from '../../server/sim/spec.js';
import { setupUnitKit, selectSkillSpec, skillSpecSource } from '../../server/sim/content/index.js';
import { genericKit } from '../../server/sim/content/generic.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { kitCoverage } from '../../tools/kit-coverage.mjs';

const skip = !hasGeneratedData() && 'no generated data (run node tools/build-data.mjs)';
const ds = getDefaultSource();
const C = ds.raw.chess;
/** A fresh browser-like DataSource (no research fallback, empty caches). */
const freshDs = () => new DataSource(ds.raw, null);

const INSIDE = 'chess_char_1_01_a';     // 隐现 (T1, E1: S1–S2, default S2)
const MLYSS = 'chess_char_6_11_b';      // 缪尔赛思 精锐 (S1–S3, default S3; modules 002 default / 003)
const WTRMAN = 'token_10030_mlyss_wtrman';

test('resolveLoadout: legal choices resolve, anything else falls back to the default', { skip }, () => {
  const n = C[INSIDE];
  assert.deepEqual(resolveLoadout(n, null), { skillIndex: 1, moduleId: null, skillIsDefault: true, moduleIsDefault: true, isDefault: true });
  assert.equal(resolveLoadout(n, { skillIndex: 0 }).skillIndex, 0);
  assert.equal(resolveLoadout(n, { skill: 0 }).skillIndex, 0, 'client shape { skill, module } accepted');
  assert.equal(resolveLoadout(n, { skillIndex: 2 }).skillIndex, 1, 'S3 is not unlocked at E1 → default');
  for (const bad of [-1, 1.5, '0', null, 9]) assert.equal(resolveLoadout(n, { skillIndex: bad }).skillIndex, 1, `skillIndex ${bad}`);
  assert.equal(resolveLoadout(n, { moduleId: 'uniequip_002_inside' }).moduleId, null, 'normal chess have no module choice');
  const g = C[MLYSS];
  assert.equal(resolveLoadout(g, {}).moduleId, 'uniequip_002_mlyss');
  assert.equal(resolveLoadout(g, { moduleId: 'none' }).moduleId, 'none');
  assert.equal(resolveLoadout(g, { module: 'uniequip_003_mlyss' }).moduleId, 'uniequip_003_mlyss');
  assert.equal(resolveLoadout(g, { moduleId: 'uniequip_002_inside' }).moduleId, 'uniequip_002_mlyss', "another character's module → default");
  assert.equal(resolveLoadout(g, { moduleId: 'uniequip_001_mlyss' }).moduleId, 'uniequip_002_mlyss', 'INITIAL is not a choice ("none" is)');
  assert.equal(resolveLoadout(g, { skillIndex: 2, moduleId: 'uniequip_002_mlyss' }).isDefault, true);
  // research-shaped record (no skills list): always the default
  assert.equal(resolveLoadout({ skill: { skillId: 'x', index: 0 } }, { skillIndex: 1 }).skillIndex, 0);
  assert.equal(loadoutRecord(n, resolveLoadout(n, null)), n, 'default loadout = the record itself');
});

test('every choice the lobby accepts (shared loadoutOptions) resolves to itself in the sim; defaults agree', { skip }, () => {
  const d = freshDs();
  let n = 0;
  for (const c of Object.values(C)) {
    if (c.isGolden || !c.visible) continue;
    const g = C[c.goldenId];
    const opt = loadoutOptions(c, g);
    assert.equal(opt.defaultSkill, c.skill.index, `${c.chessId}: default skill`);
    assert.equal(opt.defaultModule, resolveLoadout(g, null).moduleId, `${c.chessId}: default module`);
    for (const skill of opt.skills) {
      for (const module of opt.modules) {
        const seat = { [c.chessId]: { skill, module } };
        for (const rec of [c, g]) {
          const lo = resolveSeatLoadout(seat, rec, (id) => C[id]);   // what PlayerState puts on the unit
          const def = d.getChess(rec.chessId, lo);
          assert.equal(def.loadout.skillIndex, skill, `${rec.chessId} S${skill + 1}`);
          assert.equal(def.skill.id, rec.skills.find((s) => s.index === skill).skillId);
          if (rec.isGolden) assert.equal(def.loadout.moduleId, module, `${rec.chessId} ${module}`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 1000, `${n} unit defs resolved`);
});

test('getChess(id, loadout): selected skill (bb, SP, trigger) and module (stats, trait, talents); cached; default = same def', { skip }, () => {
  const d = freshDs();
  const def0 = d.getChess(INSIDE);
  assert.equal(d.getChess(INSIDE, { skillIndex: 1 }), def0, 'explicit default loadout = the default def');
  assert.equal(d.getChess(INSIDE, { skillIndex: 7 }), def0, 'illegal loadout = the default def');
  const s1 = d.getChess(INSIDE, { skillIndex: 0 });
  assert.notEqual(s1, def0);
  assert.equal(d.getChess(INSIDE, { skillIndex: 0 }), s1, 'variant defs are cached');
  assert.equal(s1.id, INSIDE, 'def id stays the chess id');
  assert.equal(s1.skill.id, 'skchr_inside_1');
  assert.deepEqual(s1.skill.bb, C[INSIDE].skills[0].bb);
  assert.equal(s1.skill.spCost, C[INSIDE].skills[0].spCost);
  assert.deepEqual(s1.loadout, { skillIndex: 0, moduleId: null, skillIsDefault: false, moduleIsDefault: true, isDefault: false });
  assert.deepEqual(s1.stats, def0.stats, 'a skill choice never changes stats');
  assert.ok(Object.isFrozen(s1) && Object.isFrozen(s1.skill.bb), 'variant defs are frozen like every def');
  assert.equal(C[INSIDE].skill.skillId, 'skchr_inside_2', 'the raw record is never mutated');
  // per-skill trigger (PRTS 技能策略): 角峰's MANUAL skills both cast when hit (the 重装 row covers every skill); 古米's
  // AUTO S1 keeps its own rule (DEFAULT in data, its kit: an injured ally of the skill range), his MANUAL S2 TAKE_DAMAGE
  assert.equal(d.getChess('chess_char_1_02_a', { skillIndex: 0 }).skill.trigger.rule, 'TAKE_DAMAGE');
  assert.equal(d.getChess('chess_char_1_02_a', { skillIndex: 1 }).skill.trigger.rule, 'TAKE_DAMAGE');
  assert.equal(d.getChess('chess_char_1_10_a', { skillIndex: 0 }).skill.trigger.rule, 'DEFAULT');
  assert.equal(d.getChess('chess_char_1_10_a', { skillIndex: 1 }).skill.trigger.rule, 'TAKE_DAMAGE');

  // modules on the elite: statsBase + module attr; trait / talents of that module; 'none' = the base
  const g = C[MLYSS];
  const dm = d.getChess(MLYSS);
  const m3 = d.getChess(MLYSS, { moduleId: 'uniequip_003_mlyss' });
  const none = d.getChess(MLYSS, { moduleId: 'none' });
  assert.equal(dm.stats.maxHp, 1893);
  assert.equal(m3.stats.maxHp, g.statsBase.maxHp + 170);
  assert.equal(m3.stats.atk, g.statsBase.atk + 28);
  assert.equal(none.stats.maxHp, g.statsBase.maxHp);
  assert.equal(m3.traitBb.atk_scale, 1.65, 'module trait upgrade');
  assert.deepEqual(none.traitBb, g.traitBase.bb);
  assert.equal(m3.raw.module.id, 'uniequip_003_mlyss');
  assert.equal(m3.raw.module.active, true);
  assert.equal(none.raw.module.active, false, 'no module ⇒ moduleOn(chess) false for kits');
  // 开源节流 at full potential (runtime_cost −2; the module restates it) and the module's own data-only talents (sp_other)
  assert.ok(m3.talents.some((t) => t.bb.runtime_cost === -2 && t.bb.cost === -2), 'module talent change applied');
  assert.ok(m3.talents.some((t) => t.bb.sp_other === 10) && !none.talents.some((t) => t.bb.sp_other === 10), 'the module-only talent');
  assert.equal(m3.skill.id, dm.skill.id, 'a module choice keeps the skill');
  const both = d.getChess(MLYSS, { skillIndex: 0, moduleId: 'none' });
  assert.equal(both.skill.id, 'skchr_mlyss_1');
  assert.equal(both.stats.maxHp, g.statsBase.maxHp);
});

test('getToken(id, owner, ownerLoadout): summons follow the owner\'s skill slot and module', { skip }, () => {
  const d = freshDs();
  const t0 = d.getToken(WTRMAN, MLYSS);
  const t1 = d.getToken(WTRMAN, MLYSS, { skillIndex: 0, moduleId: 'none' });
  assert.equal(t0.skill.id, 'sktok_mlyss_wtrman_3');
  assert.equal(t1.skill.id, 'sktok_mlyss_wtrman_1', '流形 uses the skill of the owner\'s selected slot');
  assert.equal(t0.talents[0].bb.scale, 1);
  assert.equal(t1.talents[0].bb.scale, 0.9, 'no module ⇒ 90% copy (module isToken part not applied)');
  assert.equal(d.getToken(WTRMAN, MLYSS, { skillIndex: 2 }), t0, 'default owner loadout = the default token def');
  assert.equal(d.getToken(WTRMAN, MLYSS, { skillIndex: 0, moduleId: 'none' }), t1, 'cached per owner loadout');
  // 凛御银灰: the talent's eagle follows the selected skill (S1 → eagle1)
  const sv = d.getChess('chess_char_5_14_a', { skillIndex: 0 });
  assert.equal(sv.talents[0].tokenKey, 'token_10057_svash2_eagle1');
  assert.equal(d.getChess('chess_char_5_14_a').talents[0].tokenKey, 'token_10057_svash2_eagle2');
});

test('kit loader: skills[selected] → kit.skill (default only) → generic; talents / trait / install always from the kit', { skip }, () => {
  const d = freshDs();
  const specA = { kind: 'duration', duration: 1, mods: { atkPct: 0.1 } };
  const specS1 = { kind: 'instant', mods: { atkPct: 0.2 } };
  const talent = { install() {} };
  const install = () => {};
  const kitFn = () => ({ skill: specA, talents: [talent], trait: { priority: 'fly' }, install });
  const battle = { opts: { kits: { [INSIDE]: kitFn } }, _handlerError(label, u, e) { throw e; } };
  const unit = (def) => ({ kind: 'op', def });
  // default skill: kit.skill
  const k0 = setupUnitKit(battle, unit(d.getChess(INSIDE)), 'full');
  assert.equal(k0.skill, specA);
  // non-default, not authored: the generic spec of the SELECTED skill, kit talents / trait kept
  const defS1 = d.getChess(INSIDE, { skillIndex: 0 });
  const k1 = setupUnitKit(battle, unit(defS1), 'full');
  assert.equal(k1.skillSource, 'generic');
  assert.deepEqual(k1.skill, genericKit(defS1.skill.bb, defS1.raw, defS1).skill);
  assert.deepEqual([k1.talents[0], k1.trait.priority, k1.install], [talent, 'fly', install]);
  // authored per skill id
  battle.opts.kits[INSIDE] = () => ({ skill: specA, skills: { skchr_inside_1: specS1 }, talents: [] });
  const k2 = setupUnitKit(battle, unit(defS1), 'full');
  assert.equal(k2.skill, specS1);
  assert.equal(k2.skillSource, 'skills');
  assert.equal(setupUnitKit(battle, unit(d.getChess(INSIDE)), 'full').skill, specA, 'skills map without the default id → kit.skill');
  // an explicit null in skills means "never casts"
  assert.equal(selectSkillSpec({ skill: specA, skills: { skchr_inside_1: null } }, {}, defS1.raw, defS1).skill, null);
  // the kit receives the selected skill and its blackboard
  let seen = null;
  battle.opts.kits[INSIDE] = (bb, chess) => { seen = [bb, chess.skill.skillId]; return { skill: specA, talents: [] }; };
  setupUnitKit(battle, unit(defS1), 'full');
  assert.deepEqual(seen, [C[INSIDE].skills[0].bb, 'skchr_inside_1']);
  // generic install of the generic skill chains after the kit's own install
  const order = [];
  const gi = selectSkillSpec({ skill: specA, talents: [], install: () => order.push('kit') }, {}, defS1.raw, { ...defS1, skill: { ...defS1.skill, bb: {} } });
  assert.equal(typeof gi.install, 'function');
  // coverage probe
  assert.equal(skillSpecSource(d.getChess(INSIDE), { [INSIDE]: () => ({ skill: specA }) }), 'kit');
  assert.equal(skillSpecSource(defS1, { [INSIDE]: () => ({ skill: specA }) }), 'generic');
  assert.equal(skillSpecSource(defS1, { [INSIDE]: () => ({ skill: specA, skills: { skchr_inside_1: specS1 } }) }), 'skills');
  assert.equal(skillSpecSource(defS1, {}), 'none');
});

/** A normal-field spec with one player's units and a real wave (act1autochess_01 on 战场#05). */
function normalSpec(units, { seed = 4242 } = {}) {
  const tpl = ds.getWave('act1autochess_01');
  const routes = tpl.routes;
  const spawns = tpl.spawns.filter((s) => !s.action && !s.slot).map((s) => ({ time: s.time, enemyKey: s.key, routeIndex: s.routeIndex, count: s.count, interval: s.interval }));
  return buildBattleSpec({
    battleId: 'b1', fieldId: 'n:p1', kind: 'normal', seed, modeId: 'mode_multi_normal', round: 1, stageId: 'act2autochess_m01',
    timeLimit: 90, players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units, bonds: {}, playerEffects: [] }],
    spawns, routes, flags: {}, waveId: 'act1autochess_01',
  });
}

test('BattleSpec: units carry skillIndex / moduleId (sanitised); a battle uses the selected skill and module', { skip }, () => {
  const spec = normalSpec([
    { uid: 1, chessId: INSIDE, row: 10, col: 5, dir: 'RIGHT', skillIndex: 0 },
    { uid: 2, chessId: MLYSS, row: 11, col: 4, dir: 'RIGHT', skillIndex: 0, moduleId: 'uniequip_003_mlyss' },
    { uid: 3, chessId: 'chess_char_1_02_a', row: 10, col: 7, dir: 'RIGHT', skillIndex: 'x', moduleId: '../../etc' },
    { uid: 4, kind: 'token', tokenId: WTRMAN, ownerUid: 2, row: 12, col: 6, skillIndex: 1 },
  ]);
  const u = spec.players[0].units;
  assert.deepEqual([u[0].skillIndex, u[1].skillIndex, u[1].moduleId], [0, 0, 'uniequip_003_mlyss']);
  assert.ok(!('skillIndex' in u[2]) && !('moduleId' in u[2]), 'malformed loadout fields dropped');
  assert.ok(!('skillIndex' in u[3]), 'tokens carry no loadout');
  assert.equal(JSON.stringify(jsonClone(spec)), JSON.stringify(spec), 'JSON-safe');

  const b = createBattleFromSpec(spec, freshDs(), { recordEvents: false, quiet: true });
  const inside = b.allyUnits.find((x) => x.uid === 1);
  assert.equal(inside.def.skill.id, 'skchr_inside_1');
  assert.equal(inside.skill.id, 'skchr_inside_1', 'the unit\'s skill runtime is the selected skill');
  assert.deepEqual(inside.skill.bb, C[INSIDE].skills[0].bb, 'with that skill\'s blackboard');
  assert.equal(inside.skill.baseSpCost, C[INSIDE].skills[0].spCost);
  const ml = b.allyUnits.find((x) => x.uid === 2);
  assert.equal(ml.base.maxHp, C[MLYSS].statsBase.maxHp + 170, 'module attr applied to the elite\'s stats');
  assert.equal(ml.base.atk, C[MLYSS].statsBase.atk + 28);
  assert.equal(ml.skill.id, 'skchr_mlyss_1');
  const jf = b.allyUnits.find((x) => x.uid === 3);
  assert.equal(jf.skill.id, C.chess_char_1_02_a.skill.skillId, 'malformed loadout ⇒ default');
  const tok = b.allyUnits.find((x) => x.uid === 4);
  assert.ok(tok, '流形 piece created');
  assert.equal(tok.def.skill?.id, 'sktok_mlyss_wtrman_1', '流形 piece follows its owner\'s S1');
  // 落叶四季's isToken part makes the 流形 taunt (+1); the 100% copy belongs to 梳妆流形 only
  assert.equal(tok.def.talents[0].bb.scale, 0.9);
  assert.ok(tok.def.talents.some((t) => t.bb.taunt_level === 1), '流形 gets the module 003 token talent');
  // the Battle still runs to the end
  b.runToEnd(4000);
  assert.ok(b.finished);
});

test('determinism: a spec with loadouts gives identical results on independent sources; the loadout matters', { skip }, () => {
  const units = [
    { uid: 1, chessId: INSIDE, row: 10, col: 5, dir: 'RIGHT', skillIndex: 0 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 8, dir: 'RIGHT', skillIndex: 0 },
    { uid: 3, chessId: MLYSS, row: 11, col: 4, dir: 'RIGHT', skillIndex: 1, moduleId: 'none' },
  ];
  const spec = normalSpec(units);
  const run = (s, src) => resultDigest(createBattleFromSpec(s, src, { recordEvents: false, quiet: true }).runToEnd(4000));
  const a = run(spec, freshDs());
  const b = run(JSON.parse(JSON.stringify(spec)), freshDs());
  const c = run(spec, ds); // shared (cached) default source, other construction order
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash, c.hash);
  // the same board with default loadouts builds different units (the selected skills / module are really used)
  const sp = (s) => createBattleFromSpec(s, freshDs(), { recordEvents: false, quiet: true });
  const withLo = sp(spec), withoutLo = sp(normalSpec(units.map(({ skillIndex, moduleId, ...x }) => x)));
  const sig = (bt) => bt.allyUnits.map((x) => [x.skill.id, x.base.maxHp]);
  assert.deepEqual(sig(withLo), [['skchr_inside_1', C[INSIDE].stats.maxHp], [C.chess_char_1_02_a.skills[0].skillId, C.chess_char_1_02_a.stats.maxHp], ['skchr_mlyss_2', C[MLYSS].statsBase.maxHp]]);
  assert.deepEqual(sig(withoutLo), [['skchr_inside_2', C[INSIDE].stats.maxHp], [C.chess_char_1_02_a.skill.skillId, C.chess_char_1_02_a.stats.maxHp], ['skchr_mlyss_3', C[MLYSS].stats.maxHp]]);
});

test('withUnitLoadouts: per-battle view; explicit loadouts win; conflicting chess ids are reported', { skip }, () => {
  const base = freshDs();
  assert.equal(withUnitLoadouts(base, [{ units: [{ chessId: INSIDE }] }]), base, 'no loadouts ⇒ the source itself');
  const players = [
    { playerId: 'a', units: [{ uid: 1, chessId: INSIDE, skillIndex: 0 }, { uid: 2, chessId: MLYSS, skillIndex: 0 }] },
    { playerId: 'b', units: [{ uid: 1, chessId: MLYSS, skillIndex: 1 }] },
  ];
  const v = withUnitLoadouts(base, players);
  assert.ok(v instanceof DataSource);
  assert.equal(v.getChess(INSIDE).skill.id, 'skchr_inside_1');
  assert.equal(v.getChess(INSIDE, { skillIndex: 1 }).skill.id, 'skchr_inside_2', 'explicit loadout wins');
  assert.equal(v.getChess(INSIDE), base.getChess(INSIDE, { skillIndex: 0 }), 'caches shared with the source');
  assert.deepEqual(v.loadoutConflicts, [MLYSS]);
  assert.equal(v.getToken(WTRMAN, MLYSS).skill.id, 'sktok_mlyss_wtrman_1', 'summons: owner loadout from the view');
  assert.equal(v.getToken(WTRMAN, MLYSS, { skillIndex: 1 }).skill.id, 'sktok_mlyss_wtrman_2');
  assert.equal(v.getEnemy('enemy_1422_lrsldr'), base.getEnemy('enemy_1422_lrsldr'), 'everything else delegates');
});

test('multi-player field: the same chess with different loadouts per player — every unit (and summon) gets its own', { skip }, () => {
  const mk = (playerId, seat, colOffset, units) => ({ playerId, seat, side: 'L', colOffset, units, bonds: {}, playerEffects: [] });
  const spec = buildBattleSpec({
    battleId: 'u1', fieldId: 'u:p1', kind: 'unite', seed: 7, modeId: 'mode_multi_normal', round: 4, stageId: 'act2autochess_m01', timeLimit: 60,
    players: [
      mk('p1', 0, 0, [{ uid: 1, chessId: MLYSS, row: 10, col: 4, skillIndex: 0, moduleId: 'uniequip_003_mlyss' }, { uid: 2, kind: 'token', tokenId: WTRMAN, ownerUid: 1, row: 11, col: 4 }]),
      mk('p2', 1, 8, [{ uid: 1, chessId: MLYSS, row: 10, col: 4, skillIndex: 2, moduleId: 'uniequip_002_mlyss' }, { uid: 2, kind: 'token', tokenId: WTRMAN, ownerUid: 1, row: 11, col: 4 }]),
    ],
    spawns: [], routes: [],
  });
  const b = createBattleFromSpec(spec, freshDs(), { quiet: true });
  const of = (pid, uid) => b.allyUnits.find((u) => u.player.playerId === pid && u.uid === uid);
  assert.deepEqual([of('p1', 1).skill.id, of('p1', 1).base.maxHp], ['skchr_mlyss_1', C[MLYSS].statsBase.maxHp + 170]);
  assert.deepEqual([of('p2', 1).skill.id, of('p2', 1).base.maxHp], ['skchr_mlyss_3', C[MLYSS].stats.maxHp]);
  assert.equal(of('p1', 2).def.skill.id, 'sktok_mlyss_wtrman_1');
  assert.equal(of('p2', 2).def.skill.id, 'sktok_mlyss_wtrman_3');
  assert.equal(of('p2', 2).def.talents[0].bb.scale, 1);
  assert.equal(of('p1', 1).hp, of('p1', 1).s.maxHp, 'HP follows the swapped stats');
  // determinism of the same multi-player spec
  const d1 = resultDigest(createBattleFromSpec(spec, freshDs(), { quiet: true, recordEvents: false }).runToEnd(200));
  const d2 = resultDigest(createBattleFromSpec(jsonClone(spec), ds, { quiet: true, recordEvents: false }).runToEnd(200));
  assert.equal(d1.hash, d2.hash);
});

test('harness battle with injected kits: non-default skill via the view uses the authored skills entry', { skip }, () => {
  const specS1 = { kind: 'duration', duration: 5, mods: { atkPct: 1 } };
  const players = [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: INSIDE, row: 10, col: 5, skillIndex: 0 }], bonds: {}, playerEffects: [] }];
  const h = makeBattle({ players, data: withUnitLoadouts(freshDs(), players), kits: { [INSIDE]: () => ({ skill: null, skills: { skchr_inside_1: specS1 }, talents: [] }) } });
  const u = h.battle.allyUnits[0];
  assert.equal(u.kit.skill, specS1);
  assert.equal(u.skill.kind, 'duration');
  assert.equal(u.skill.id, 'skchr_inside_1');
});

test('tools/kit-coverage: every visible chess and each selectable skill, defaults hand-authored', { skip }, () => {
  const rep = kitCoverage();
  assert.equal(rep.summary.chess, 112);
  assert.equal(rep.chess.length, 112);
  for (const r of rep.chess) {
    const ch = loadoutOptions(C[r.chessId], C[C[r.chessId].goldenId]);
    assert.deepEqual(r.skills.map((s) => s.index), ch.skills, `${r.chessId}: selectable skills listed`);
    for (const s of r.skills) {
      assert.ok(['skills', 'kit', 'generic', 'none'].includes(s.normal) && ['skills', 'kit', 'generic', 'none'].includes(s.elite));
      assert.equal(s.covered, ['skills', 'kit'].includes(s.normal) && ['skills', 'kit'].includes(s.elite));
    }
  }
  assert.equal(rep.summary.skills, rep.chess.reduce((n, r) => n + r.skills.length, 0));
  // every chess already has a hand-authored kit for its default skill (the coverage baseline kits build on)
  assert.equal(rep.summary.defaultCovered, rep.summary.defaults);
  assert.equal(kitCoverage({ tier: 6 }).chess.every((r) => r.tier === 6), true);
});

// ---- adversarial review (data-contract) regressions -------------------------------------------------------------

test('multi-player field: a unit WITHOUT loadout fields fights with the default even when another player picked a variant', { skip }, () => {
  const mk = (playerId, seat, colOffset, units) => ({ playerId, seat, side: 'L', colOffset, units, bonds: {}, playerEffects: [] });
  const spec = buildBattleSpec({
    battleId: 'u2', fieldId: 'u:p1', kind: 'unite', seed: 9, modeId: 'mode_multi_normal', round: 4, stageId: 'act2autochess_m01', timeLimit: 60,
    players: [
      // p1 is listed first: the per-battle view maps MLYSS / INSIDE to p1's choices for id-only lookups
      mk('p1', 0, 0, [{ uid: 1, chessId: MLYSS, row: 10, col: 4, skillIndex: 0, moduleId: 'none' }, { uid: 3, chessId: INSIDE, row: 9, col: 4, skillIndex: 0 }]),
      mk('p2', 1, 8, [{ uid: 1, chessId: MLYSS, row: 10, col: 4 }, { uid: 2, kind: 'token', tokenId: WTRMAN, ownerUid: 1, row: 11, col: 4 }, { uid: 3, chessId: INSIDE, row: 9, col: 4 }]),
    ],
    spawns: [], routes: [],
  });
  const b = createBattleFromSpec(spec, freshDs(), { quiet: true });
  const of = (pid, uid) => b.allyUnits.find((u) => u.player.playerId === pid && u.uid === uid);
  assert.equal(of('p1', 1).skill.id, 'skchr_mlyss_1');
  assert.equal(of('p1', 3).skill.id, 'skchr_inside_1');
  assert.deepEqual([of('p2', 1).skill.id, of('p2', 1).base.maxHp], ['skchr_mlyss_3', C[MLYSS].stats.maxHp], 'no loadout fields ⇒ the default, not p1\'s choice');
  assert.equal(of('p2', 3).skill.id, 'skchr_inside_2');
  assert.equal(of('p2', 2).def.skill.id, 'sktok_mlyss_wtrman_3', 'its summon piece follows the default owner');
  assert.equal(of('p2', 2).def.talents[0].bb.scale, 1);
});

test('an inline token def of a PlayerBattleInput entry is never replaced by the loadout sync', { skip }, () => {
  for (const lo of [{}, { skillIndex: 0, moduleId: 'uniequip_003_mlyss' }]) {
    const players = [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, playerEffects: [], units: [
      { uid: 1, chessId: MLYSS, row: 10, col: 5, ...lo },
      { uid: 2, kind: 'token', tokenId: WTRMAN, ownerUid: 1, row: 11, col: 5, def: { name: 'inline', stats: { maxHp: 77 } } },
    ] }];
    const h = makeBattle({ players, data: withUnitLoadouts(freshDs(), players) });
    const t = h.battle.allyUnits.find((u) => u.uid === 2);
    assert.deepEqual([t.def.name, t.base.maxHp], ['inline', 77], `inline def kept (${JSON.stringify(lo)})`);
    const op = h.battle.allyUnits.find((u) => u.uid === 1);
    assert.equal(op.def.loadout.skillIndex, lo.skillIndex ?? 2);
  }
});

test('getToken: def.sources / def.count follow the owner loadout (which summons a chess really produces)', { skip }, () => {
  const d = freshDs();
  const SHADOW = 'token_10022_kazema_shadow', KAZEMA = 'chess_char_2_11_a';
  assert.deepEqual(d.getToken(SHADOW, KAZEMA).sources, ['skill']);
  assert.deepEqual(d.getToken(SHADOW, KAZEMA, { skillIndex: 0 }).sources, [], '风丸 S1 makes no 纸偶');
  const TRAP = 'token_10031_swire2_gdtrap', SWIRE = 'chess_char_3_04_b';
  assert.deepEqual(d.getToken(TRAP, SWIRE).sources, ['skill'], '琳琅诗怀雅 S2 (default) makes the 香槟炸弹');
  for (const s of [0, 2]) assert.deepEqual(d.getToken(TRAP, SWIRE, { skillIndex: s }).sources, [], `S${s + 1} makes none`);
  assert.deepEqual(d.getToken(WTRMAN, MLYSS, { skillIndex: 0, moduleId: 'none' }).sources, ['talent', 'display'], '流形 is a talent summon: every skill');
  assert.deepEqual([d.getToken('token_10041_cathy_catsld', 'chess_char_4_11_b', { skillIndex: 0 }).count, d.getToken('token_10041_cathy_catsld', 'chess_char_4_11_a').count], [4, 3], '凯瑟琳 devices: count per owner');
  const HEAL = 'token_10000_silent_healrb';
  assert.deepEqual(d.getToken(HEAL, 'chess_char_2_02_a', { skillIndex: 0 }).sources, ['display'], '赫默 S1: no drone piece');
});

test('a Battle built WITHOUT the spec path (server-run fields) resolves mid-battle summons with the owner loadout', { skip }, () => {
  // 缪尔赛思 without a 流形 piece: her 援军 is summoned during the battle (凯瑟琳's devices, the old example, are placed
  // pieces since user playtest #6)
  const MLYSS = 'chess_char_6_11_a', WTRMAN = 'token_10030_mlyss_wtrman';
  const run = (skillIndex) => {
    const players = [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, playerEffects: [],
      units: [{ uid: 1, kind: 'chess', chessId: MLYSS, row: 10, col: 5, dir: 'RIGHT', ...(skillIndex != null ? { skillIndex } : {}) }] }];
    const b = new Battle({ seed: 3, kind: 'normal', stageId: 'act2autochess_m01', timeLimit: 30, players, spawns: [], routes: [], data: freshDs(), recordEvents: false, quiet: true });
    for (let i = 0; i < 60 && !b.allyUnits.some((u) => u.defId === WTRMAN); i++) b.step();
    const t = b.allyUnits.find((u) => u.defId === WTRMAN);
    assert.ok(t && t.uid == null, 'a 流形 spawned during the battle');
    return [b, t];
  };
  const [b1, t1] = run(0);
  assert.ok(isLoadoutView(b1.data), 'installContent gave the battle the loadout view');
  assert.equal(b1.allyUnits.find((u) => u.uid === 1).skill.id, C[MLYSS].skills[0].skillId);
  assert.equal(t1.def.skill.id, 'sktok_mlyss_wtrman_1', 'the summon follows the owner\'s S1');
  const [, t2] = run(null);
  assert.equal(t2.def.skill.id, 'sktok_mlyss_wtrman_3', 'default owner (S3) ⇒ default token skill');
  // the spec path is not wrapped twice
  const spec = normalSpec([{ uid: 1, chessId: INSIDE, row: 10, col: 5, dir: 'RIGHT', skillIndex: 0 }]);
  const b3 = createBattleFromSpec(spec, freshDs(), { recordEvents: false, quiet: true });
  assert.ok(isLoadoutView(b3.data) && !isLoadoutView(Object.getPrototypeOf(b3.data)));
});
