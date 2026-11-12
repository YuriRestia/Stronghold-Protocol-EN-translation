// test/content/enemy-fx-conditions.test.js — (fork) the enemies' official lasting effects whose condition the client
// never sees (enemy VFX audit, S-M rows): each kit's fxWhile / fxProbe turns its b.snap `fxs` row on while the
// condition its client template checks holds, and off again (display only: snapshot.js fxStateView).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { fxStateView } from '../../server/sim/snapshot.js';

const WALL = (id) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const CHESS = { t_wall: WALL('t_wall') };
const NOATK = () => ({ trait: { noAttack: true } });

function arena(o = {}) {
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    defs: { chess: CHESS }, kits: { t_wall: NOATK }, enemies: [], ...o,
  });
}
/** Spawn a pinned enemy (speed ×0) at a tile. */
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });
/** Whether enemy `e`'s snapshot holds the fxs row of `buff` now. */
const on = (h, e, buff) => !!(fxStateView(e, h.b.time) || []).some((r) => r[0] === buff);

for (const key of ['enemy_1272_nhtank', 'enemy_1272_nhtank_2']) {
  test(`${key}: enemy_nhtank_s_effect's glow while its SP is full (the next shot is 秽蚀轰击)`, () => {
    const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
    h.step();
    const e = put(h, key, [9, 5]);
    const a = e.mem.ab.list.find((x) => x && 'sp' in x);
    a.sp = 0;
    assert.equal(on(h, e, 'nhtank_skill_effect[buff]'), false);
    a.sp = 2;
    assert.equal(on(h, e, 'nhtank_skill_effect[buff]'), true);
    h.runUntil(() => a.sp === 0, 30);
    assert.equal(on(h, e, 'nhtank_skill_effect[buff]'), false, 'spent by 秽蚀轰击');
  });
}

test('enemy_1158_divman / enemy_1162_magmot: their swim effects on a deep-water tile only', () => {
  const h = arena({ flat: { rows: { 11: '##hddddrrrfrrrrrrrf##' } } });
  h.step();
  const d = put(h, 'enemy_1158_divman', [11, 3]), d2 = put(h, 'enemy_1158_divman', [10, 3]);
  const m = put(h, 'enemy_1162_magmot', [11, 4]), m2 = put(h, 'enemy_1162_magmot', [10, 4]);
  h.run(1);
  assert.equal(on(h, d, 'divman_swim'), true);
  assert.equal(on(h, d2, 'divman_swim'), false);
  assert.equal(on(h, m, 'magmot_effect'), true);
  assert.equal(on(h, m2, 'magmot_effect'), false);
});

test('enemy_1422_lrsldr(_2): its originium-mode glow on an infection tile only', () => {
  const h = arena({ flat: { rows: { 11: '##hiiiirrrfrrrrrrrf##' } } });
  h.step();
  for (const key of ['enemy_1422_lrsldr', 'enemy_1422_lrsldr_2']) {
    const a = put(h, key, [11, 3]), b = put(h, key, [10, 3]);
    assert.equal(on(h, a, 'enemy_lrsldr[switchMode][toOrig]'), true, key);
    assert.equal(on(h, b, 'enemy_lrsldr[switchMode][toOrig]'), false, key);
  }
});

test('enemy_1328_cbjedi: its bleed while unbalanced', () => {
  const h = arena();
  h.step();
  const j = put(h, 'enemy_1328_cbjedi', [10, 7]);
  h.step(2);
  assert.equal(on(h, j, 'enemy_cbjedi_bleed'), false);
  h.b.push(j, j.s.massLevel, { from: { x: j.x - 1, y: j.y } });
  h.step();
  assert.equal(on(h, j, 'enemy_cbjedi_bleed'), true);
  h.run(2);
  assert.equal(on(h, j, 'enemy_cbjedi_bleed'), false, 'the state over');
});

test('enemy_1072_dlancer: its charge glow while unblocked, gone at its charged hit', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = h.spawn('enemy_1072_dlancer', { pos: [9, 8], routeIndex: 0 });
  h.step();
  assert.equal(on(h, e, 'dlancer_t_listener[c]'), true);
  h.runUntil(() => e.stats.attacks >= 1, 30);
  h.step();
  assert.equal(on(h, e, 'dlancer_t_listener[c]'), false);
});

test('enemy_10087_hlchgr: its glow from the first enhancement on', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_10087_hlchgr', [10, 7]);
  assert.equal(on(h, e, 'hlchgr_t[attribute_storage]'), false);
  h.runUntil(() => !!e.findBuff('ab:enhance'), 20);
  assert.equal(on(h, e, 'hlchgr_t[attribute_storage]'), true);
});

test('enemy_1174_duholy / enemy_1175_dushdo_2: their trait effects while paired', () => {
  const h = arena();
  h.step();
  const g = put(h, 'enemy_1174_duholy', [10, 7]), s = put(h, 'enemy_1175_dushdo_2', [10, 12]);
  h.step();
  assert.equal(on(h, g, 'duholy_traitAbility[TauntLevelUp]'), false);
  assert.equal(on(h, s, 'dushdo_traitAbility[BaseAttackTimeDown]'), false);
  const s2 = put(h, 'enemy_1175_dushdo_2', [10, 8]);
  h.step();
  assert.equal(on(h, g, 'duholy_traitAbility[TauntLevelUp]'), true);
  assert.equal(on(h, s2, 'dushdo_traitAbility[BaseAttackTimeDown]'), true);
  assert.equal(on(h, s2, 'dushdo_traitAbility[effect]'), true);
  assert.equal(on(h, s, 'dushdo_traitAbility[effect]'), false, 'the far one stays unpaired');
});
