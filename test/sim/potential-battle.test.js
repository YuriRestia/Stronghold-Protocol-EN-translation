// test/sim/potential-battle.test.js — potential and 练度 on a battle unit (0.2.2, the owner's decision of 2026-10-08:
// 「调配干员里自己设置吧，默认满潜满加成」): a PlayerBattleInput operator entry's `potential` (潜能 1–6) composes its def at
// that potential (stats, talents, its summons' talents at the owner's potential), its `cultivate` (练度 0–3: effects.json
// aceffect_char_1…4 char_attribute_mul) multiplies ATK / DEF / max HP on top of every other bonus (Πmul, never summed
// with the 直接乘算 percentages: PRTS 盟约记录 「…与自持有干员的属性加成独立」); a stand-in and a prototype 自选 pick take
// neither. The spec keeps both when well-formed, so the browser and the server field the same unit (docs/SIM.md §12).
// Run: node --test test/sim/potential-battle.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { unitStatsEntry } from '../../shared/protocol.js';
import { tokenStat } from '../../server/sim/content/kits/shared/summoner.js';

const VENDLA = 'chess_char_1_06_a';   // 刺玫 (PRESET): E1 Lv55, 潜能 6 = ATK 435 / cost 15 / 66 s
const T6 = 'chess_char_6_diy1_a';
const unit = (h, id) => h.b.allyUnits.find((u) => u.defId === id && u.kind === 'op');
const talentBb = (u, name) => u.def.talents.find((t) => t.name === name)?.bb;

test('potential on a battle unit: the def at that potential (stats, redeploy, cost, talent), 潜能 6 / absent = the data record', () => {
  const at = (potential) => {
    const h = makeBattle({ units: [{ chessId: VENDLA, row: 10, col: 5, ...(potential != null ? { potential } : null) }], timeLimit: 1 });
    const u = unit(h, VENDLA);
    return [u.base.atk, u.base.cost, u.base.respawnTime, talentBb(u, '土壤基肥改良').heal_scale, u.def.loadout.potential];
  };
  assert.deepEqual(at(1), [413, 17, 70, 1.08, 1]);
  assert.deepEqual(at(3), [413, 16, 66, 1.08, 3]);
  assert.deepEqual(at(5), [435, 16, 66, 1.11, 5]);
  assert.deepEqual(at(6), [435, 15, 66, 1.11, 6]);
  assert.deepEqual(at(null), [435, 15, 66, 1.11, 6], 'absent: full potential');
  // the elite with another module: statsBase at the potential + the module's attr
  const h = makeBattle({ units: [{ chessId: 'chess_char_1_06_b', moduleId: 'none', potential: 1, row: 10, col: 5 }], timeLimit: 1 });
  assert.deepEqual([unit(h, 'chess_char_1_06_b').base.atk, unit(h, 'chess_char_1_06_b').base.cost], [508, 17]);
});

test('练度 on a battle unit: ×ATK / ×DEF / ×max HP of its tier, a multiplier of its own on top of the percentages', () => {
  const field = (cultivate, extra = {}) => {
    const h = makeBattle({ units: [{ chessId: VENDLA, row: 10, col: 5, ...(cultivate != null ? { cultivate } : null), ...extra }], timeLimit: 1 });
    return unit(h, VENDLA);
  };
  const raw = field(null);
  assert.deepEqual([raw.s.atk, raw.s.def, raw.s.maxHp, raw.cultivate, raw.cultMul], [435, 77, 1137, null, null], 'absent: no 练度');
  const t = (c) => { const u = field(c); return [u.s.atk, u.s.def, u.s.maxHp]; };
  assert.deepEqual(t(0), [435, 77, 1137], '未精英化 +0%');
  assert.deepEqual(t(1), [435 * 1.05, 77 * 1.05, 1137], '精英1: ATK / DEF +5%');
  assert.deepEqual(t(2), [435 * 1.1, 77 * 1.05, 1137 * 1.05], '精英2: ATK +10%, DEF / HP +5%');
  assert.deepEqual(t(3), [435 * 1.1, 77 * 1.1, 1137 * 1.1], '精英2 Lv.60: +10% each');
  // with a 直接乘算 bonus (+20 % ATK) the tier multiplies the result — never 1 + 0.2 + 0.1
  const u = field(3);
  u.buffs.push({ key: 'test:atk', mods: { atkPct: 0.2 }, timeLeft: Infinity, duration: Infinity, stacks: 1, maxStacks: 1 });
  u.markDirty();
  assert.equal(u.s.atk, 435 * 1.2 * 1.1);
  // the deployed unit starts at its multiplied max HP; the card's own numbers include the tier
  const h = makeBattle({ units: [{ chessId: VENDLA, row: 10, col: 5, cultivate: 3 }], timeLimit: 3 });
  h.run(1);
  const d = unit(h, VENDLA);
  assert.ok(d.alive && Math.abs(d.hp - 1137 * 1.1) < 1e-9, `HP ${d.hp}`);
  const e = unitStatsEntry(d, d.s);
  assert.deepEqual([e.atk, e.base.atk, e.maxHp, e.base.maxHp, e.def, e.base.def], [479, 479, 1251, 1251, 85, 85], 'no green delta for the tier');
  assert.deepEqual([unitInfo(d).cultivate, unitInfo(d).potential], [3, undefined]);
});

test('a 补位 stand-in and a prototype 自选 pick take neither; an owned 自选 pick takes both', () => {
  const h = makeBattle({
    units: [
      { chessId: 'chess_char_3_21_a', standIn: true, potential: 1, cultivate: 3, row: 10, col: 3 },
      { diy: { slot: 6, charId: 'char_609_acguad' }, potential: 1, cultivate: 3, row: 10, col: 5 },
      { diy: { slot: 'chess_char_6_diy2_a', charId: 'char_003_kalts', skillIndex: 0 }, potential: 1, cultivate: 3, row: 11, col: 5 },
    ],
    timeLimit: 1,
  });
  const ops = h.b.allyUnits.filter((u) => u.kind === 'op');
  const st = ops.find((u) => u.def.standInFor);
  const proto = ops.find((u) => u.def.charId === 'char_609_acguad');
  const kalts = ops.find((u) => u.def.charId === 'char_003_kalts');
  assert.deepEqual([st.cultMul, st.def.loadout.potentialIsDefault ?? true], [null, true], 'stand-in');
  assert.deepEqual([proto.cultMul, proto.def.loadout.potential], [null, 6], 'prototype');
  // 凯尔希 潜能1: E2 Lv1 ATK 392 / cost 20 / 70 s (潜能 6: 417 / 18 / 66), ×1.1
  assert.deepEqual([kalts.base.atk, kalts.base.cost, kalts.base.respawnTime, kalts.def.loadout.potential], [392, 20, 70, 1]);
  assert.equal(kalts.s.atk, 392 * 1.1);
  // the spec drops both on a stand-in entry (and on summons)
  const spec = buildBattleSpec({ players: [{ playerId: 'p1', units: [
    { uid: 1, kind: 'chess', chessId: 'chess_char_3_21_a', standIn: true, potential: 2, cultivate: 1, row: 10, col: 3 },
    { uid: 2, kind: 'token', tokenId: 'token_10028_vigil_wolf', potential: 2, cultivate: 1, row: 10, col: 4, ownerUid: 1 },
  ] }] });
  for (const u of spec.players[0].units) assert.deepEqual(['potential' in u, 'cultivate' in u], [false, false], u.kind);
});

test('summons follow their owner\'s potential: Mon3tr\'s 不毁重构 and 望\'s 棋子 deploy limit / holding', () => {
  const ds = getDefaultSource();
  const owner = (potential) => ds.getChess(T6, { diy: { charId: 'char_003_kalts', skillIndex: 0 }, potential });
  const mon = (p) => ds.getToken('token_10002_kalts_mon3tr', T6, owner(p).loadout).talents.find((t) => t.name === '不毁重构').bb;
  assert.deepEqual([mon(4).stun, mon(4).value], [3, 1200]);
  assert.deepEqual([mon(5).stun, mon(5).value], [3.5, 1400]);
  assert.deepEqual([mon(null).stun, mon(null).value], [3.5, 1400]);
  // 望 (tier-6 slot, normal form E2 Lv1): her 棋子 hold 7 / deploy 6 below 潜能3, 8 / 7 from it (the kit's tokenStat)
  const wang = (potential) => {
    const h = makeBattle({ units: [{ diy: { slot: 6, charId: 'char_2027_wang', skillIndex: 0 }, potential, row: 10, col: 5 }], timeLimit: 1 });
    const u = h.b.allyUnits.find((x) => x.kind === 'op');
    return [tokenStat(h.b, u, 'token_10064_wang_stone1', 'deployLimit'), tokenStat(h.b, u, 'token_10064_wang_stone1', 'deckStack')];
  };
  assert.deepEqual(wang(2), [6, 7]);
  assert.deepEqual(wang(3), [7, 8]);
  // a chess owner (tokens.json): 夕's “小自在” 化境 15 层 below 潜能5
  const dusk = (p) => ds.getToken('token_10015_dusk_drgn', 'chess_char_5_12_a', ds.getChess('chess_char_5_12_a', { potential: p }).loadout).talents[0].bb.max_stack_cnt;
  assert.deepEqual([dusk(4), dusk(5)], [15, 18]);
});

test('spec round trip: potential / 练度 kept when well-formed, dropped otherwise; the JSON spec fields the same battle', () => {
  const units = [
    { uid: 1, kind: 'chess', chessId: VENDLA, potential: 2, cultivate: 1, row: 10, col: 5 },
    { uid: 2, kind: 'chess', chessId: 'chess_char_1_02_a', potential: 7, cultivate: 4, row: 10, col: 3 },
    { uid: 3, kind: 'chess', chessId: 'chess_char_1_14_a', potential: '3', cultivate: 2.5, row: 11, col: 3 },
  ];
  const spec = buildBattleSpec({ battleId: 'b1', fieldId: 'n:p1', kind: 'normal', seed: 7, stageId: 'act2autochess_m01', timeLimit: 30,
    players: [{ playerId: 'p1', units }], spawns: [{ time: 1, enemyKey: 'enemy_1007_slime', routeIndex: 0, count: 3, interval: 1 }] });
  const [a, b, c] = spec.players[0].units;
  assert.deepEqual([a.potential, a.cultivate], [2, 1]);
  assert.deepEqual(['potential' in b, 'cultivate' in b, 'potential' in c, 'cultivate' in c], [false, false, false, false]);
  const run = (s) => {
    const battle = createBattleFromSpec(s, undefined, { quiet: true });
    battle.start();
    const u = battle.allyUnits.find((x) => x.uid === 1);
    const out = [u.base.atk, u.base.cost, u.s.atk, u.s.def];
    while (!battle.finished) battle.step();
    return { out, digest: resultDigest(battle.result()).hash };
  };
  const direct = run(spec);
  const wire = run(JSON.parse(JSON.stringify(spec)));
  assert.deepEqual(direct.out, [413, 16, 413 * 1.05, 77 * 1.05]);
  assert.deepEqual(wire, direct);
});

test('two players field the same chess at different potentials and 练度 on one field: each unit is exact', () => {
  const players = [
    { playerId: 'p1', side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: VENDLA, potential: 1, cultivate: 0, row: 10, col: 5 }] },
    { playerId: 'p2', side: 'L', colOffset: 8, units: [{ uid: 2, kind: 'chess', chessId: VENDLA, potential: 6, cultivate: 3, row: 10, col: 5 }] },
  ];
  const battle = createBattleFromSpec(buildBattleSpec({ kind: 'unite', seed: 3, stageId: 'act2autochess_m01', players, timeLimit: 10 }), undefined, { quiet: true });
  battle.start();
  const [u1, u2] = [1, 2].map((uid) => battle.allyUnits.find((x) => x.uid === uid));
  assert.deepEqual([u1.base.atk, u1.s.atk, u1.base.cost], [413, 413, 17]);
  assert.deepEqual([u2.base.atk, u2.s.atk, u2.base.cost], [435, 435 * 1.1, 15]);
});
