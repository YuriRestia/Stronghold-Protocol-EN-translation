// test/sim/risk-pool.test.js — the SPA-CC Risk tags on the final boss's shared pool (server/sim/bossRisk.js): Originium
// Zone Arts / Physical (pool-wide damage-type shares), Lockout (a hard gate and 10 s of 无敌 per step), Delegation United
// 2 (no death while a Degenbrecher lives on any field); the server pool (finalAssault.js SharedBossPool), a field's local
// view (spec.js LocalBossPool) and the buffs a field puts on its boss (content/risk.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bossRiskConfig, initialRiskView, BossRiskState } from '../../server/sim/bossRisk.js';
import { SharedBossPool, CreditPool } from '../../server/match/finalAssault.js';
import { LocalBossPool } from '../../server/sim/spec.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { CC } from '../../shared/ruleData.js';

test('no config without a boss-pool tag', () => {
  assert.equal(bossRiskConfig(null), null);
  assert.equal(bossRiskConfig({ ccBoss: 3 }), null);
  const u1 = bossRiskConfig({ ccBoss: 3, ccDelegation: 1 });
  assert.ok(u1.degen && !u1.hold, 'United 1: the linked Degenbrecher HP bar, no hold');
  assert.ok(bossRiskConfig({ ccDelegation: 2 }).hold);
  assert.equal(bossRiskConfig({ ccLockout: 2 }).every, CC.lockout.every[2]);
});

test('Arts / Physical: the share of the pool counts every field (server-run damage and client reports)', () => {
  const changes = [];
  const pool = new SharedBossPool(1000, { risk: bossRiskConfig({ ccOzArts: 1, ccOzPhys: 1 }), onRisk: (c) => changes.push(...c) });
  pool.damage('p_0', 300, 'arts');
  pool.noteTyped('b2', 150, 0);
  assert.equal(pool.riskView().res, false);
  pool.noteTyped('b2', 210, 0); // 300 + 210 ≥ 500
  assert.equal(pool.riskView().res, true);
  assert.deepEqual(changes, ['res']);
  pool.damage('p_0', 200, 'true');
  assert.equal(pool.riskView().def, false, 'True damage is neither');
  pool.noteTyped('b2', 100, 499); // lower Arts report: the highest stays
  assert.equal(pool.risk.total('arts'), 510);
  pool.damage('p_1', 1, 'phys');
  assert.equal(pool.riskView().def, true);
});

test('Lockout: the pool stops at each step, 无敌 until released, then the next step', () => {
  const changes = [];
  const pool = new SharedBossPool(1000, { risk: bossRiskConfig({ ccLockout: 2 }), onRisk: (c) => changes.push(...c) }); // every 28 %
  assert.equal(pool.riskView().floor, 720);
  assert.equal(pool.damage('p_0', 500, 'phys'), 280, 'a big hit stops at the gate');
  assert.equal(pool.hp, 720);
  assert.equal(pool.riskView().inv, true);
  assert.deepEqual(changes, ['inv']);
  assert.equal(pool.damage('p_0', 100, 'phys'), 0, 'invulnerable');
  pool.releaseLock();
  assert.deepEqual(pool.riskView(), { res: false, def: false, inv: false, hold: false, floor: 440 });
  pool.damage('p_0', 280, 'phys'); pool.releaseLock();
  pool.damage('p_0', 280, 'phys'); pool.releaseLock();
  assert.equal(pool.hp, 160);
  assert.equal(pool.riskView().floor, 0, 'no step left (4 × 28 % > 100 %)');
  pool.damage('p_0', 1000, 'phys');
  assert.equal(pool.hp, 0);
});

test('United 2: the pool stops at 1 HP while a field holds it', () => {
  const pool = new SharedBossPool(1000, { risk: bossRiskConfig({ ccDelegation: 2 }) });
  pool.setHold('b1', true);
  pool.setHold('b2', true);
  pool.damage('p_0', 5000, 'phys');
  assert.equal(pool.hp, 1);
  pool.setHold('b1', false);
  pool.damage('p_0', 5000, 'phys');
  assert.equal(pool.hp, 1, 'b2 still holds');
  pool.setHold('b2', false);
  pool.damage('p_0', 5000, 'phys');
  assert.equal(pool.hp, 0);
});

test('CreditPool forwards the type, the view and the hold', () => {
  const pool = new SharedBossPool(1000, { risk: bossRiskConfig({ ccOzArts: 1, ccDelegation: 2 }) });
  const credit = new CreditPool(pool);
  credit.setHold('b1', true);
  credit.damage('p_0', 600, 'arts');
  assert.equal(credit.riskView().res, true);
  credit.damage('p_0', 600, 'arts');
  assert.equal(pool.hp, 1);
});

test('a field clamps its own damage to the view it has, counts Arts / Physical and reports its hold', () => {
  const lp = new LocalBossPool(1000, 1000, initialRiskView(bossRiskConfig({ ccLockout: 1 }), 1000)); // every 68 %
  assert.equal(lp.riskView().floor, 320);
  assert.equal(lp.damage('p_0', 900, 'arts'), 680);
  assert.equal(lp.hp, 320);
  assert.equal(lp.typed.arts, 680);
  lp.sync(320, 680, { res: false, def: false, inv: true, hold: false, floor: 320 });
  assert.equal(lp.damage('p_0', 50, 'phys'), 0, 'invulnerable');
  lp.sync(320, 680, { res: false, def: false, inv: false, hold: false, floor: 0 });
  lp.setHold('b1', true);
  assert.equal(lp.damage('p_0', 5000, 'phys'), 319, 'its own Degenbrecher: 1 HP left');
  const plain = new LocalBossPool(1000);
  assert.equal(plain.damage('p_0', 300, 'arts'), 300);
  assert.equal(plain.riskView(), null);
});

test('the field puts the view on its boss units: +RES, +DEF, 无敌; a living Degenbrecher holds the pool', () => {
  const pool = new SharedBossPool(1e6, { risk: bossRiskConfig({ ccOzArts: 1, ccOzPhys: 1, ccLockout: 1, ccDelegation: 2 }) });
  const h = makeBattle({
    defs: { enemies: { enemy_boss: enemyRec({ key: 'enemy_boss', hp: 1e6, speed: 0 }) } }, kind: 'boss', autoFinish: false,
    timeLimit: 100, seed: 2, units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }], sharedBoss: pool, fieldId: 'b1',
    flags: { rules: { ccOzArts: 1, ccOzPhys: 1, ccLockout: 1, ccDelegation: 2 } },
  });
  h.step(1);
  const boss = h.spawn('enemy_boss', { pos: [10, 7], routeIndex: 0, tag: 'boss' });
  assert.ok(boss.bossPool, 'a pool boss');
  const res0 = boss.s.res, def0 = boss.s.def;
  pool.damage('p_0', 5e5, 'arts');
  pool.damage('p_0', 3e5, 'phys'); // stops at the 68 % gate: 无敌
  h.run(0.3);
  assert.equal(boss.s.res - res0, CC.ozArts.res);
  assert.equal(boss.s.def - def0, 0, 'Physical below its share');
  assert.equal(boss.s.flags.invulnerable, true);
  pool.releaseLock();
  h.run(0.3);
  assert.ok(!boss.s.flags.invulnerable);
  assert.equal(pool.risk.holds.size, 0);
  h.spawn(CC.delegation.degen, { pos: [11, 9], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.3);
  assert.ok(pool.risk.holds.has('b1'), 'held while she lives');
});
