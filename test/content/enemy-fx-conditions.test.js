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

test('enemy_1439_dslntf(_2): its combat-state aura from its first damage taken', () => {
  const h = arena();
  h.step();
  for (const key of ['enemy_1439_dslntf', 'enemy_1439_dslntf_2']) {
    const e = put(h, key, [10, 7]);
    h.step();
    assert.equal(on(h, e, 'dslntf_tr_1'), false, key);
    h.b.dealDamage(null, e, { amount: 1, type: 'true' });
    h.step();
    assert.equal(on(h, e, 'dslntf_tr_1'), true, key);
  }
});

test("enemy_2005_axetro: its glow from 3 attack stacks, gone when they reset", () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = put(h, 'enemy_2005_axetro', [9, 5]);
  h.runUntil(() => e.stats.attacks >= 2, 30);
  assert.equal(on(h, e, 'axetro_t'), false, 'two stacks');
  h.runUntil(() => e.stats.attacks >= 3, 30);
  assert.equal(on(h, e, 'axetro_t'), true);
  h.b.removeBuff(e, 'ab:axeStack');
  assert.equal(on(h, e, 'axetro_t'), false);
});

test('enemy_2010_csdcr: warning glow from its warning hit count, the song burst on it and the ASPD glow on every enemy (src it)', () => {
  const h = arena();
  h.step();
  const s = put(h, 'enemy_2010_csdcr', [10, 7]), o = put(h, 'enemy_1007_slime', [11, 7]);
  const E = s.mem.ab.t;
  const hit = () => h.b.dealDamage(null, s, { amount: 1, type: 'true' });
  const rows = (u) => (fxStateView(u, h.b.time) || []).filter((r) => r[0] === 'csdcr_t');
  for (let i = 1; i < E['AttackSpeedUp.warning_stack_cnt']; i++) hit();
  assert.deepEqual(rows(s), []);
  hit();
  assert.deepEqual(rows(s), [['csdcr_t', null, 'warn']]);
  for (let i = E['AttackSpeedUp.warning_stack_cnt']; i < E['AttackSpeedUp.stack_cnt']; i++) hit();
  assert.deepEqual(rows(s).map((r) => r[2]).sort(), ['aspd', 'song']);
  assert.deepEqual(rows(o), [['csdcr_t', s.id, 'aspd']]);
  h.run(1.5);
  assert.deepEqual(rows(s).map((r) => r[2]), ['aspd'], 'the burst once; the warning gone with the count');
  h.run(E['AttackSpeedUp.duration']);
  assert.deepEqual(rows(o), [], 'the ASPD over');
});

test('enemy_9008_acbunn: its stealth glow while hidden, the switch burst as it turns', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = h.spawn('enemy_9008_acbunn', { pos: [9, 9], routeIndex: 0 });
  h.step(2);
  assert.equal(on(h, e, 'acbunn_invisible'), true);
  h.runUntil(() => !!e.blockedBy, 30);
  h.run(0.2);
  assert.equal(on(h, e, 'acbunn_invisible'), false, 'blocked: revealed');
  assert.equal(on(h, e, 'enemy_acbunn[horror]'), true, 'the switch out of hiding');
});

test('enemy_10045_parrot: its sprint glow while the first-hit sprint lasts', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_10045_parrot', [10, 7]);
  h.step();
  assert.equal(on(h, e, 'parrot_m0_t[speed_up]'), false);
  h.b.dealDamage(null, e, { amount: 1, type: 'true' });
  h.step();
  assert.equal(on(h, e, 'parrot_m0_t[speed_up]'), true);
  h.run(e.mem.ab.t['M0SpeedUp.duration'] + 0.5);
  assert.equal(on(h, e, 'parrot_m0_t[speed_up]'), false);
});

// one-shot bursts: a short timed row (Battle.fxState `dur`) at the moment the client's template plays it
test("enemy_9023_acdums: its switch burst at its form switch (acdums_t_1's hit_times run out)", () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = put(h, 'enemy_9023_acdums', [10, 7]);
  h.step();
  const form = e.mem.ab.form;
  assert.equal(on(h, e, 'acdums_t_1'), false);
  h.runUntil(() => { h.b.dealDamage(h.unit('t_wall'), e, { amount: 1, type: 'true' }); return e.mem.ab.form !== form; }, 30);
  assert.notEqual(e.mem.ab.form, form, 'switched');
  assert.equal(on(h, e, 'acdums_t_1'), true);
  h.run(1.5);
  assert.equal(on(h, e, 'acdums_t_1'), false, 'the one-shot row gone');
});

test('enemy_10081_mpplai: its burst for the change at its 4th physical hit', () => {
  const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
  h.step();
  const e = put(h, 'enemy_10081_mpplai', [10, 7]);
  for (let i = 0; i < 3; i++) h.b.dealDamage(h.unit('t_wall'), e, { amount: 1, type: 'phys' });
  assert.equal(on(h, e, 'enemy_mpplai_passive_p0'), false);
  h.b.dealDamage(h.unit('t_wall'), e, { amount: 1, type: 'phys' });
  assert.equal(on(h, e, 'enemy_mpplai_passive_p0'), true);
  h.run(2.5);
  assert.equal(on(h, e, 'enemy_mpplai_passive_p0'), false, 'over with the change');
});

test('enemy_10138_xdsnow: its burst at a high-ground hit while unbalanced, not on an open road', () => {
  const h = arena();
  h.step();
  const sn = put(h, 'enemy_10138_xdsnow', [10, 3]), sn2 = put(h, 'enemy_10138_xdsnow', [11, 6]);
  h.step(2);
  h.b.displace(sn, { x: -1, y: 0 }, 1, { force: 3 });                // (10,3) → high ground at (10,2)
  h.b.displace(sn2, { x: 1, y: 0 }, 0.5, { force: 3 });              // open road: no collision
  h.step();
  assert.equal(on(h, sn, 'enemy_xdsnow_t[wall]'), true);
  assert.equal(on(h, sn2, 'enemy_xdsnow_t[wall]'), false);
});

test('enemy_10065_ftzlc: its burning glow while ignited', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_10065_ftzlc', [10, 7]);
  h.step();
  assert.equal(on(h, e, 'enemy_ftzlc[boom]'), false);
  e.mem.ab.ignited = true;
  assert.equal(on(h, e, 'enemy_ftzlc[boom]'), true);
});

// death bursts: no state row (a dead unit has none) — the kit's 'explode' at the point where it fell, in its death
// hook, is what skills.js ENEMY_FX_BINDINGS (owner 'died') turns into the official burst
for (const [key, kind] of [['enemy_1407_hummbd', 'expose'], ['enemy_10156_mncrer', 'heal']]) {
  test(`${key}: its death's '${kind}' explode at the point where it fell (the official death burst's signal)`, () => {
    const h = arena({ units: [{ chessId: 't_wall', row: 9, col: 5 }] });
    h.step();
    const e = put(h, key, [10, 7]);
    h.step();
    h.b.dealDamage(h.unit('t_wall'), e, { amount: 1e9, type: 'true' });
    h.step();
    assert.equal(e.alive, false);
    const f = h.eventsOf('fx').filter((x) => x[1] === 'explode' && x[4].kind === kind);
    assert.equal(f.length, 1);
    assert.deepEqual([f[0][2], f[0][3]], [e.x, e.y]);
  });
}
