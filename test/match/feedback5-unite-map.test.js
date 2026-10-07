// 联防 plays on the round's battlefield again (0.2.1, the owner's decision of 2026-10-07 after the report 「联防阶段地形全消失
// 了」: 「官服保留地形，改回去」). The 联防 field is the match stage opened to both halves (GEO.UNITE_RECT, cols 0–20) with its
// terrain, crates, water, devices and runes, as in 0.1.x; the escaped wave templates route the leaked enemies (one helper:
// escaped_single, entering at the middle gate (9,10); two helpers: escaped_multi, entering at col 18 through (9,10));
// every helper's pieces stand on their prep tiles, the first of two shifted 8 columns onto the right half ("率先迎敌(即位于右侧
// 阵地)"). 0.2.0 fought it on the escaped levels' own map, an empty road (GitHub #41 item 3, docs/history/0.2.0.md
// §25.6.4) — withdrawn; data/stages.json keeps those two records (kind 'unite'), which no field uses. Every test here
// fails on 0.2.0 (the field was act1autochess_escaped_single / _multi there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEO, PHASE } from '../../shared/constants.js';
import { Battle } from '../../server/sim/Battle.js';
import { createBattleFromSpec } from '../../server/sim/spec.js';
import { DataSource } from '../../server/sim/simdata.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch, give, chessOfTier, legalTileFor, checkInvariants } from './harness.js';

/** A real battle that only ends by its time limit (the check follows the enemies, whatever the helpers do). */
class NoFinish extends Battle {
  constructor(o) { super({ ...o, autoFinish: false }); }
}

const CRATE = 'trap_1105_accrate';
/** 战场#01's active 阻隔工事 on the 联防 rows: three on the left half (#001–#003), three on the right half (#101–#103). */
const M01_CRATES = [[10, 5], [10, 6], [10, 13], [10, 14], [11, 5], [11, 13]];

/**
 * Co-op on `stageId` (战场#01's row 9 is walled off at cols 5–7: "##Err###rrSrr###rrS##"): p_0 leaks 3 enemies, the other
 * players are perfect — 1 helper with 2 humans, 2 helpers with 3. Each helper fields one ranged operator on the first
 * legal tile in reading order (战场#01: the 围墙 (12,3)).
 */
function scenario({ humans, clientCombat, stageId = 'act1autochess_m01', data = DATA, seed = 4101 + humans }) {
  const h = makeMatch({
    mode: 'coop', humans, seed, fake: true, clientCombat, data,
    script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 3 } } : {}),
  }).start();
  const m = h.m;
  h.toPrep(1);
  h.setStage(stageId);
  const ranged = chessOfTier(1, (c) => c.position === 'RANGED').filter((x) => m.pool.has(x));
  const helpers = [];
  for (let i = 1; i < humans; i++) {
    const ps = h.ps(`p_${i}`);
    const id = ranged[i];
    helpers.push({ ps, piece: give(m, ps, id, 'board', legalTileFor(m, ps, id)) });
  }
  h.drive(() => m.phase === PHASE.UNITE);
  return { h, m, helpers };
}

/** The 联防 field's spec / options as the match built them, and a real battle over them. */
function uniteField(m, clientCombat) {
  if (clientCombat) {
    const f = m.fields[0];
    return { opts: f.spec, battle: createBattleFromSpec(f.spec, new DataSource(DATA, null), { BattleClass: NoFinish, recordEvents: false }) };
  }
  const u = FakeBattle.instances.find((b) => b.kind === 'unite');
  return { opts: u.opts, battle: new NoFinish({ ...u.opts, data: m.ds, logger: { warn() {}, error() {}, info() {}, debug() {} } }) };
}

const tileOf = (ps, piece) => [...ps.board.entries()].find(([, p]) => p === piece)[0].split(',').map(Number);
const startOf = (r) => r.start ?? [r.startPosition?.row, r.startPosition?.col];
/** The crates standing on the field (device units, sorted by tile). */
const crates = (b) => b.allyUnits.filter((u) => u.kind === 'device' && u.defId === CRATE && u.alive).map((u) => [u.tileR, u.tileC])
  .sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]);
const MODES = [[true, 'client-side combat'], [false, 'server-run']];

for (const [clientCombat, label] of MODES) {
  test(`联防 with 1 helper (${label}): the round's battlefield — 战场#01's walls and crates on both halves, the helper on its 围墙, walkers from the middle gate go round the walls`, () => {
    const { m, helpers } = scenario({ humans: 2, clientCombat });
    assert.deepEqual(m.unitePlan.helpers.map((p) => p.playerId), ['p_1']);
    const { opts, battle: b } = uniteField(m, clientCombat);
    assert.equal(opts.stageId, 'act1autochess_m01', 'the match stage (0.2.0: act1autochess_escaped_single)');
    assert.equal(opts.stageId, m.stageId);
    assert.deepEqual(opts.rect, GEO.UNITE_RECT, 'both halves of the stage');
    assert.ok(opts.routes.every((r) => startOf(r)[1] === 10), 'escaped_single\'s routes enter at the middle gate (col 10)');
    assert.equal(b.stage.id, 'act1autochess_m01');
    assert.deepEqual(b.stage.rows, m.stage.rows, 'tile for tile the stage the boards stand on');
    for (const c of [5, 6, 7]) assert.ok(!b.grid.groundPassable(9, c), `(9,${c}) is 战场#01's wall, no road`);
    b.step();
    assert.deepEqual(crates(b), M01_CRATES, 'the 阻隔工事 of both halves stand (0.2.0: none)');
    // the helper's piece on its prep tile — the same 围墙 it stood on in prep
    const { ps, piece } = helpers[0];
    const [r, c] = tileOf(ps, piece);
    assert.deepEqual([r, c], [12, 3]);
    const u = b.allyUnits.find((x) => x.uid === piece.uid && x.ownerId === 'p_1');
    assert.deepEqual([u.tileR, u.tileC], [r, c]);
    assert.equal(b.grid.tile(r, c).key, 'tile_fence_bound', 'its tile is 战场#01\'s 围墙 (0.2.0: road)');
    // walkers go round 战场#01's walls: never on row 9 cols 5–7, through the top row instead
    const seen = new Set();
    while (b.time < 60 && !b.finished) {
      b.step();
      for (const e of b.enemies) if (e.alive && e.motion !== 'FLY') seen.add(`${Math.round(e.y)},${Math.round(e.x)}`);
    }
    assert.ok(!['9,5', '9,6', '9,7'].some((k) => seen.has(k)), `no walker on the wall (${[...seen].sort().join(' ')})`);
    assert.ok([4, 5, 6, 7].some((cc) => seen.has(`12,${cc}`)), `a walker on the top row (${[...seen].sort().join(' ')})`);
    assert.equal(b.errorCount || 0, 0);
    checkInvariants(m);
    m.dispose();
  });

  test(`联防 with 2 helpers (${label}): the round's battlefield — the first helper on the right half (+8 columns) on the same 围墙 as in prep, crates on both halves, every viewer gets the match stage`, () => {
    const { h, m, helpers } = scenario({ humans: 3, clientCombat });
    const order = m.unitePlan.helpers.map((p) => p.playerId);
    assert.equal(order.length, 2);
    const { opts, battle: b } = uniteField(m, clientCombat);
    assert.equal(opts.stageId, 'act1autochess_m01', 'the match stage (0.2.0: act1autochess_escaped_multi)');
    assert.deepEqual(opts.players.map((p) => [p.playerId, p.colOffset]), [[order[0], 8], [order[1], 0]]);
    assert.ok(opts.routes.every((r) => startOf(r)[1] === 18), 'escaped_multi\'s routes enter at col 18');
    assert.ok(opts.routes.filter((r) => r.motion === 'WALK').every((r) => r.checkpoints.some(([rr, cc]) => rr === 9 && cc === 10)), 'walkers pass (9,10)');
    assert.deepEqual(b.stage.rows, m.stage.rows);
    b.step();
    assert.deepEqual(crates(b), M01_CRATES, 'the 阻隔工事 of both halves stand (0.2.0: none)');
    for (const { ps, piece } of helpers) {
      const [r, c] = tileOf(ps, piece);
      const u = b.allyUnits.find((x) => x.uid === piece.uid && x.ownerId === ps.playerId);
      const off = ps.playerId === order[0] ? 8 : 0;
      assert.deepEqual([u.tileR, u.tileC], [r, c + off], `${ps.playerId}: its prep tile${off ? ' on the right half' : ''}`);
      // the stage's right half is its left half + 8 columns: the shifted helper stands on the tile kind it prepared on
      assert.equal(b.grid.tile(r, c + off).key, m.stage.tiles[m.stage.rows[r][c]].tileKey, `${ps.playerId}: the prep tile's kind`);
      assert.equal(b.grid.tile(r, c + off).key, 'tile_fence_bound', `${ps.playerId}: 战场#01's 围墙 (0.2.0: road)`);
    }
    // what the other browsers are given: the 联防 field names the match stage, the one their boards are drawn on
    if (clientCombat) {
      const start = h.lastTo('p_0', 'b.start');
      assert.equal(start && start.spec && start.spec.stageId, m.stageId, 'the leaker simulates the 联防 spec on the match stage');
    } else {
      m.handle('p_0', { t: 'g.watch', fieldId: 'u' });
      const meta = h.lastTo('p_0', 'm.field');
      assert.equal(meta && meta.stageId, m.stageId, 'a watcher\'s m.field names the match stage');
    }
    assert.equal(m.publicView().stageId, 'act1autochess_m01');
    checkInvariants(m);
    m.dispose();
  });
}

test('联防 on 战场#04: the round\'s special terrain is on the field — walkers pick up the 活性源石 on their way round the walls', () => {
  const { m } = scenario({ humans: 2, clientCombat: false, stageId: 'act1autochess_m04' });
  const { opts, battle: b } = uniteField(m, false);
  assert.equal(opts.stageId, 'act1autochess_m04');
  assert.ok(b.stage.special && b.stage.special.infection, 'the stage\'s 活性源石 parameters (0.2.0: none)');
  const infection = [];
  for (let r = GEO.UNITE_RECT.r0; r <= GEO.UNITE_RECT.r1; r++) for (let c = GEO.UNITE_RECT.c0; c <= GEO.UNITE_RECT.c1; c++) if (b.grid.tile(r, c).terrain === 'infection') infection.push([r, c]);
  assert.deepEqual(infection, [[10, 6], [10, 14], [11, 6], [11, 14]], '战场#04\'s 活性源石 tiles on both halves');
  let burnt = null;
  while (b.time < 60 && !b.finished && !burnt) {
    b.step();
    burnt = b.enemies.find((e) => e.alive && e.findBuff && e.findBuff('terrain:infection')) || null;
  }
  assert.ok(burnt, 'a walker carries the 活性源石 effect');
  assert.equal(b.errorCount || 0, 0);
  m.dispose();
});

test('the 联防 field does not depend on the escaped levels\' map records: with or without them it is the same battlefield', () => {
  const stages = Object.fromEntries(Object.entries(DATA.stages).filter(([, s]) => s.kind !== 'unite'));
  const run = (data) => {
    const { m } = scenario({ humans: 2, clientCombat: false, data, seed: 4199 });
    const { opts } = uniteField(m, false);
    const out = { stageId: opts.stageId, routes: opts.routes, offsets: opts.players.map((p) => [p.playerId, p.colOffset]) };
    m.dispose();
    return out;
  };
  const full = run(DATA);
  const degraded = run({ ...DATA, stages });
  assert.equal(full.stageId, 'act1autochess_m01');
  assert.deepEqual(full, degraded, 'the same stage, routes and helper offsets');
});
