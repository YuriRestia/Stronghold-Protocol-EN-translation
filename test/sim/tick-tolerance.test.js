// An attack interval or a time-SP cost that is a whole number of ticks takes exactly that many ticks (PR #402 by
// @Cloudnyco, 0.2.2). Floating point alone left a residue (1/30 is not a binary fraction): 1 s counted down in thirty
// steps of 1/30 stops at 2.1e-16, so an attack with a 1 s interval came every 31 ticks; 300 gains of 1/30 SP sum to
// 9.999999999999975, so a 10-SP charge took 301. ai.js attackCountdown and SkillRuntime.gainSp treat what is within
// 1e-9 as reached (docs/SIM.md §2, §7.1). Official (PRTS 作战机制/sandbox 「帧对齐机制对攻速的影响」): one frame = 1/30 s,
// an exact 1 s is 30 frames; a non-integer count is rounded there (四舍五入 since 2019-12-24) — here it still ends on the
// tick that crosses 0 (⌈30 × interval⌉), a separate, older difference this file locks as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackCountdown } from '../../server/sim/ai.js';
import { TICK } from '../../server/sim/constants.js';
import { hasGeneratedData, getDefaultSource } from '../../server/sim/simdata.js';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const REAL = { skip: !hasGeneratedData() };

test('the residue: thirty steps of 1/30 leave 1 s above 0, 300 gains of 1/30 leave 10 SP short', () => {
  let cd = 1;
  for (let i = 0; i < 30; i++) cd = Math.max(0, cd - TICK);
  assert.ok(cd > 0 && cd < 1e-15, `${cd}`);
  let sp = 0;
  for (let i = 0; i < 300; i++) sp += TICK;
  assert.ok(sp < 10 && sp > 10 - 1e-13, `${sp}`);
});

test('attackCountdown: every interval bat × 100 / aspd (bat 0.1 … 10 s, aspd 20 … 600) takes ⌈30 × interval⌉ ticks', () => {
  const wrong = [];
  for (let j = 1; j <= 100; j++) {
    const bat = j / 10;
    for (const aspd of [20, 50, 60, 75, 80, 100, 110, 120, 125, 150, 200, 240, 300, 600]) {
      const interval = (bat * 100) / aspd;                          // units.js _recalc
      const exact = 300 * j;                                        // 30 × interval = 300 j / aspd, in integers
      const want = exact % aspd === 0 ? exact / aspd : Math.ceil(exact / aspd);
      let left = interval, n = 0;
      while (left > 0) { left = attackCountdown(left, TICK); n++; }
      if (n !== want) wrong.push(`${bat} s @ ${aspd}: ${n} ticks, want ${want}`);
    }
  }
  assert.deepEqual(wrong, []);
});

/** Ticks between consecutive normal attacks of `id` (hook `attack`), over `seconds` of battle. */
function attackGaps(h, id, seconds) {
  h.run(seconds);
  const t = h.hooksOf('attack').filter((c) => c.attacker.id === id && !c.isSkill).map((c) => Math.round(c.t / TICK));
  return t.slice(1).map((x, i) => x - t[i]);
}

test('a 1 s operator attacks every 30 ticks, a 3 s ranged enemy every 90', () => {
  const h = makeBattle({
    defs: {
      chess: { t_one: chessRec({ id: 't_one', stats: { bat: 1, maxHp: 1e6 }, skill: null }) },
      enemies: { enemy_t_three: enemyRec({ key: 'enemy_t_three', hp: 1e9, speed: 0, bat: 3, atk: 1, range: 2.5 }) },
    },
    units: [{ chessId: 't_one', row: 10, col: 4 }],
    enemies: [{ key: 'enemy_t_three', pos: [10, 5] }],
    hooks: ['attack'], captureNoisy: true, timeLimit: 60,
  });
  h.run(0.5);                                    // both deployed / spawned and fighting from here on
  const u = h.unit('t_one'), e = h.enemy('enemy_t_three');
  assert.equal(u.s.interval, 1);
  assert.equal(e.s.interval, 3);
  const ally = attackGaps(h, u.id, 20), enemy = h.hooksOf('attack').filter((c) => c.attacker.id === e.id).map((c) => Math.round(c.t / TICK));
  assert.ok(ally.length >= 15, `${ally.length} operator attacks`);
  assert.deepEqual([...new Set(ally)], [30]);
  const eg = enemy.slice(1).map((x, i) => x - enemy[i]);
  assert.ok(eg.length >= 5, `${eg.length} enemy attacks`);
  assert.deepEqual([...new Set(eg)], [90]);
  checkInvariants(h.b);
});

test('the non-integer control: 1.2 s takes 36 ticks (on time before as well), 1.25 s still ⌈37.5⌉ = 38', () => {
  for (const [bat, want] of [[1.2, 36], [1.25, 38]]) {
    const h = makeBattle({
      defs: {
        chess: { t_bat: chessRec({ id: 't_bat', stats: { bat, maxHp: 1e6 }, skill: null }) },
        enemies: { enemy_t_wall: enemyRec({ key: 'enemy_t_wall', hp: 1e9, speed: 0 }) },
      },
      units: [{ chessId: 't_bat', row: 10, col: 4 }],
      enemies: [{ key: 'enemy_t_wall', pos: [10, 5] }],
      hooks: ['attack'], captureNoisy: true, timeLimit: 60,
    });
    h.run(0.5);
    const u = h.unit('t_bat');
    const gaps = attackGaps(h, u.id, 20);
    assert.ok(gaps.length >= 10, `${bat} s: ${gaps.length} attacks`);
    assert.deepEqual([...new Set(gaps)], [want], `${bat} s`);
    checkInvariants(h.b);
  }
});

test('a time skill of cost N at 1 SP/s gets each charge after exactly 30 × N more gains (one and two charges)', () => {
  // 4, 10, 16 and 50 were a tick late (their float sums fall short); a second charge counts on from the first's remainder
  for (const charges of [1, 2]) for (const cost of [4, 10, 16, 20, 30, 50]) {
    const h = makeBattle({
      defs: { chess: { t_sp: chessRec({ id: 't_sp', skill: { spCost: cost, initSp: 0, maxChargeTime: charges } }) } },
      units: [{ chessId: 't_sp', row: 10, col: 4 }],
      timeLimit: charges * cost + 10, autoFinish: false,
    });
    const u = h.unit('t_sp');
    const at = [];
    let gains = 0;
    while (u.skill.charges < charges && gains < 30 * charges * cost + 5) {
      const sp = u.skill.sp, n = u.skill.charges;
      h.step(1);
      if (u.skill.sp !== sp || u.skill.charges > n) gains++;
      if (u.skill.charges > n) at.push(gains);
    }
    assert.deepEqual(at, Array.from({ length: charges }, (_, i) => 30 * cost * (i + 1)), `cost ${cost}, ${charges} charge(s)`);
    checkInvariants(h.b);
  }
});

test('the same countdown: a “双眼皮” turret at 0 layers (BAT 4 s) shoots every 120 ticks', REAL, () => {
  const ds = getDefaultSource();
  const d = ds.getStage('act2autochess_m01').devices.find((x) => x.raw?.alias === 'trap_1104_aclasert#1');
  assert.equal(d.raw.stats.bat, 4);
  const players = [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [],
    playerEffects: [{ id: 'aceffect_band_43', key: 'auto_chess_change_map', params: { 'trap_1104_aclasert#1': 1 } }] }];
  const h = makeBattle({
    stageId: 'act2autochess_m01', players, defs: { enemies: { enemy_t_wall: enemyRec({ key: 'enemy_t_wall', hp: 1e9, speed: 0 }) } },
    enemies: [{ key: 'enemy_t_wall', pos: [10, 9] }], hooks: ['attack'], captureNoisy: true, autoFinish: false, timeLimit: 60,
  });
  h.step();
  const t = h.b.allyUnits.find((u) => u.defId === 'trap_1104_aclasert');
  assert.ok(t && t.alive, 'turret online');
  const gaps = attackGaps(h, t.id, 30);
  assert.equal(t.s.interval, 4);
  assert.ok(gaps.length >= 5, `${gaps.length} shots`);
  assert.deepEqual([...new Set(gaps)], [120]);
  checkInvariants(h.b);
});

test('the same countdown: 寒檀 S2 drops an icicle every 15 ticks (BAT 2.9 − 2.4 = 0.5 s)', REAL, () => {
  const h = makeBattle({
    defs: { enemies: { enemy_t_wall: enemyRec({ key: 'enemy_t_wall', hp: 1e9, speed: 0 }) } },
    units: [{ chessId: 'chess_char_5_21_a', row: 10, col: 3 }],
    enemies: [{ key: 'enemy_t_wall', pos: [10, 4] }], autoFinish: false, timeLimit: 60,
  });
  h.step();
  const u = h.unit('chess_char_5_21_a');
  u.skill.gainSp(1000);
  assert.ok(h.runUntil(() => u.skill.active, 5));
  assert.ok(Math.abs(u.s.interval - 0.5) < 1e-12, `${u.s.interval}`);
  const at = [];
  for (let n = u.stats.attacks, i = 0; i < 150 && u.skill.active; i++) {
    h.step();
    if (u.stats.attacks > n) at.push(Math.round(h.b.time / TICK));
    n = u.stats.attacks;
  }
  const gaps = at.slice(1).map((x, i) => x - at[i]);
  assert.ok(gaps.length >= 5, `${gaps.length} icicles`);
  assert.deepEqual([...new Set(gaps)], [15]);
  checkInvariants(h.b);
});
