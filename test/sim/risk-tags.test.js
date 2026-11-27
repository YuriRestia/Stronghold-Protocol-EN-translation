// test/sim/risk-tags.test.js — the battle side of the SPA-CC Risk tags (server/sim/content/risk.js, the Swift override in
// content/bonds/addon/battle.js): 远见 operators −20 ASPD whether 远见 is active or not, slower time SP, leaders' damage
// reduction outside a burst, the final bosses' ATK, 迅捷's chance per stack. Rules arrive in BattleSpec flags.rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { isLeaderEnemy } from '../../server/sim/content/risk.js';
import { CC } from '../../shared/ruleData.js';
import { SharedBossPool } from '../../server/match/finalAssault.js';
import { bossRiskConfig } from '../../server/sim/bossRisk.js';
import { LocalBossPool, battleProgress } from '../../server/sim/spec.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };
const battle = (rules, units, enemies = [{ key: 'enemy_dummy', pos: [10, 7] }], bonds = undefined) => {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 100, seed: 2, units, enemies, bonds, flags: { rules } });
  h.step(1);
  return h;
};

test('远见 operators −20 ASPD with the tag, even with 远见 inactive; others unchanged', () => {
  // 风笛 is 维多利亚 / 远见 / 不屈; 远见 needs 2 members to activate and she is alone
  const on = battle({ ccForesight: 1 }, [{ chessId: 'chess_char_4_07_a', row: 10, col: 3 }]);
  const off = battle({}, [{ chessId: 'chess_char_4_07_a', row: 10, col: 3 }]);
  assert.equal(on.allies()[0].s.aspd - off.allies()[0].s.aspd, CC.foresightAspd);
  const other = battle({ ccForesight: 1 }, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }]);
  assert.ok(!other.allies()[0].buffs.some((b) => b.key === 'risk:foresight'), '薄绿 is not 远见');
});

test('time SP recovers 0.2 / 0.5 / 0.8 SP/s slower per level', () => {
  const rec = (lv) => battle({ ccSpRecovery: lv }, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }]).allies()[0].s.spRecovery;
  const base = rec(0);
  for (const lv of [1, 2, 3]) assert.ok(Math.abs(base - rec(lv) - CC.spRecovery[lv]) < 1e-9, `level ${lv}`);
});

test('leaders take 50 / 90 % less Physical and Arts damage, not True damage, and none while under a burst', () => {
  const h = battle({ ccLeaderDr: 2 }, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }], [{ key: 'enemy_1535_wlfmster', pos: [10, 7] }]);
  const zaaro = h.enemies()[0];
  assert.equal(isLeaderEnemy(zaaro), true);
  const hit = (type) => { const c = { target: zaaro, dmg: { type, mul: 1 } }; h.b.emit('hit', c); return c.dmg.mul; };
  assert.ok(Math.abs(hit('phys') - 0.1) < 1e-9);
  assert.ok(Math.abs(hit('arts') - 0.1) < 1e-9);
  assert.equal(hit('true'), 1);
  h.b.addBuff(zaaro, { key: 'test:burst', duration: 5, flags: { burstLock: true } });
  assert.equal(hit('phys'), 1, 'under a burst');
  const plain = battle({ ccLeaderDr: 2 }, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }]);
  assert.equal(isLeaderEnemy(plain.enemies()[0]), false, 'an ordinary enemy');
});

test('迅捷 at 100 stacks: 20 + 0.25 × stacks % with the tag (55 % → 45 %), fixed seeds', () => {
  // 异客 is a 迅捷 member; each skill end rolls the chance once (40+ stacks: a second roll for the power part)
  const procs = (rules) => {
    let n = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 100, seed, units: [{ chessId: 'chess_char_6_05_a', row: 10, col: 3 }],
        enemies: [{ key: 'enemy_dummy', pos: [10, 7] }], bonds: { swiftShip: { count: 2, active: true, tier: 1, layers: 100 } }, flags: { rules } });
      h.step(1);
      const u = h.allies()[0];
      h.b.on('spGain', (c) => { if (c.unit === u && c.reason === 'bond') n++; });
      h.b.emit('skillEnd', { unit: u, skill: u.skill, reason: 'end' });
    }
    return n / 240;
  };
  const base = procs({}), nerf = procs({ ccSwift: 1 });
  assert.ok(Math.abs(base - 0.55) < 0.08, `base ${base}`);
  assert.ok(Math.abs(nerf - 0.45) < 0.08, `nerf ${nerf}`);
  assert.ok(nerf < base);
});

test('Deep Infiltration halves DP generation; Low Efficiency: redeployment time × 1.75', () => {
  const on = battle({ ccDeepInfiltration: 1, ccLowEfficiency: 1 }, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }]);
  const off = battle({}, [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }]);
  assert.equal(on.b.flags.dpPerSec, off.b.flags.dpPerSec * CC.dpPerSecMul);
  assert.ok(Math.abs(on.allies()[0].s.redeployMul / off.allies()[0].s.redeployMul - CC.redeployMul) < 1e-9);
});

test('Low Efficiency: the battle counts every operator that left the field (`downs`): the one thing the tag changes', () => {
  const units = [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }];
  const idle = battle({ ccLowEfficiency: 1 }, units);
  const pid = idle.allies()[0].ownerId;
  assert.equal(idle.b._pp(pid).downs, 0, 'nobody left: no redeploy timer ever ran, so the tag changed nothing');
  const op = (rules) => { const h = battle(rules, units); const u = h.allies()[0]; h.b.retreat(u); return { h, u }; };
  const on = op({ ccLowEfficiency: 1 }); const off = op({});
  assert.equal(on.h.b._pp(on.u.ownerId).downs, 1, 'a retreat starts a redeploy timer');
  assert.equal(off.h.b._pp(off.u.ownerId).downs, 1, 'counted with or without the tag (the result does not depend on it)');
  assert.ok(Math.abs((on.u.respawnAt - on.u.deathAt) / (off.u.respawnAt - off.u.deathAt) - CC.redeployMul) < 1e-9, 'the tag is only visible in that timer');
  assert.equal(on.h.b._pp(on.u.ownerId).deaths, 0, 'a retreat is not a death');
});

/** Patriot on a field with two operators (薄绿 blocks in front of him, 芬 behind), not walking. */
function patriotField(rules) {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules },
    units: [{ chessId: 'chess_char_3_01_a', row: 10, col: 2 }, { chessId: 'chess_char_3_08_a', row: 10, col: 6 }] });
  h.step(1);
  const p = h.spawn(CC.patriot.key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const d = h.spawn('enemy_dummy', { pos: [11, 9], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.5);
  return { h, p, d };
}

test('Patriot Undying 1: his leak costs 5; Undying 2: 90 % less damage from non-blockers in Marching Stance, nothing else', () => {
  const one = patriotField({ ccPatriot: 1 });
  assert.equal(one.p.lpr, CC.patriot.leakLp);
  const base = one.p.s.maxHp;
  const { h, p } = patriotField({ ccPatriot: 2 });
  assert.equal(p.s.maxHp, base, 'no HP (Undying 3 has it since the balance draft of 2026-11)');
  const ally = h.allies().find((u) => u !== p.blockedBy);
  const hit = (src, type) => { const c = { source: src, target: p, dmg: { type, mul: 1 } }; h.b.emit('hit', c); return c.dmg.mul; };
  assert.ok(Math.abs(hit(ally, 'phys') - (1 - CC.patriot.marchDr)) < 1e-9);
  assert.ok(Math.abs(hit(ally, 'arts') - (1 - CC.patriot.marchDr)) < 1e-9);
  assert.equal(hit(ally, 'true'), 1);
  if (p.blockedBy) assert.equal(hit(p.blockedBy, 'phys'), 1, 'his blocker');
  assert.equal(h.b.applyStatus(p, 'slow', { duration: 3, source: ally }), true, 'statuses land (Undying 3 refuses them)');
  // out of Marching Stance (the kit drops 'ab:patriotMarch' at his knock-out): no reduction
  h.b.removeBuff(p, 'ab:patriotMarch');
  assert.equal(hit(ally, 'phys'), 1);
});

test('Patriot Undying 3: +200 % HP, the statuses refused in Marching Stance, never below base speed; no aura on the other enemies', () => {
  const base = patriotField({ ccPatriot: 1 }).p.s.maxHp;
  const { h, p, d } = patriotField({ ccPatriot: 3 });
  assert.ok(Math.abs(p.s.maxHp / base - (1 + CC.patriot.hpPct)) < 1e-9);
  const ally = h.allies().find((u) => u !== p.blockedBy);
  const hit = (src, type) => { const c = { source: src, target: p, dmg: { type, mul: 1 } }; h.b.emit('hit', c); return c.dmg.mul; };
  assert.ok(Math.abs(hit(ally, 'phys') - (1 - CC.patriot.marchDr)) < 1e-9, 'Undying 2 under it');
  for (const st of ['stun', 'slow', 'freeze', 'attract']) assert.equal(h.b.applyStatus(p, st, { duration: 3, source: ally }), false, st);
  h.b.addBuff(p, { key: 'test:slow', duration: 5, mods: { moveMul: 0.1 } });
  assert.ok(p.s.moveSpeed >= p.base.moveSpeed - 1e-9, 'never below his base speed');
  assert.ok(!d.buffs.some((b) => b.key.startsWith('risk:patriot')), 'the old Undying 3 aura (+40 % move speed, +40 ASPD) is gone');
  h.b.removeBuff(p, 'ab:patriotMarch');
  assert.equal(h.b.applyStatus(p, 'slow', { duration: 3, source: ally }), true, 'out of Marching Stance');
});

test('Delegation United 3: Degenbrecher\'s second form stops at every 25 %, loses nothing while casting, bursts after the cast', () => {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules: { ccDelegation: 3 } },
    units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 6 }] });
  h.step(1);
  const dg = h.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.5);
  const hitHard = (n) => h.b.dealDamage(null, dg, { amount: n, type: 'true', sourceless: true });
  hitHard(dg.hp + 1);                                          // the knock-out: her 5 s revive, then 10 s 无敌
  h.runUntil(() => !dg.s.flags.invulnerable && !dg.buffs.some((b) => b.key === 'ab:reborn'), 60);
  const max = dg.s.maxHp;
  assert.ok(Math.abs(dg.hp - max) < 1e-6, 'full after the revive');
  const bursts = () => h.eventsOf('fx').filter((e) => e[1] === 'explode' && JSON.stringify(e).includes('clearSp')).length;
  const b0 = bursts();
  hitHard(max * 0.5);
  assert.ok(Math.abs(dg.hp / max - (1 - CC.delegation.gateRatio)) < 1e-6, `stopped at the first step: ${dg.hp / max}`);
  hitHard(max * 0.5);
  assert.ok(Math.abs(dg.hp / max - (1 - CC.delegation.gateRatio)) < 1e-6, 'nothing while casting');
  assert.equal(bursts(), b0, 'the burst waits for the cast');
  h.run(CC.delegation.castSeconds + 0.2);
  assert.equal(bursts(), b0 + 1);
  hitHard(max * 0.5);
  assert.ok(Math.abs(dg.hp / max - (1 - 2 * CC.delegation.gateRatio)) < 1e-6, 'the next step');
  // without the tag: 25 % steps, no gate
  const plain = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 6 }] });
  plain.step(1);
  const d2 = plain.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  plain.run(0.5);
  plain.b.dealDamage(null, d2, { amount: d2.hp + 1, type: 'true', sourceless: true });
  plain.runUntil(() => !d2.s.flags.invulnerable && !d2.buffs.some((b) => b.key === 'ab:reborn'), 60);
  plain.b.dealDamage(null, d2, { amount: d2.s.maxHp * 0.5, type: 'true', sourceless: true });
  assert.ok(Math.abs(d2.hp / d2.s.maxHp - 0.5) < 1e-6, 'no gate');
});

test('Delegation United 2: the sub-wave Degenbrecher charges while unblocked (+300 % after 10 s), reset when blocked', () => {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules: { ccDelegation: 2 } },
    units: [{ chessId: 'chess_char_3_08_a', row: 12, col: 2 }] });
  h.step(1);
  const dg = h.spawn(CC.delegation.degen, { pos: [10, 9], routeIndex: 0, mods: { speedMul: 0.0001, bountyId: `risk:delegation:${CC.delegation.degen}` } });
  const other = h.spawn(CC.delegation.degen, { pos: [11, 9], routeIndex: 0, mods: { speedMul: 0.0001 } });
  const mul = (u) => u.findBuff('risk:degenCharge')?.mods?.moveMul ?? 1;
  h.run(5);
  assert.ok(Math.abs(mul(dg) - (1 + CC.delegation.chargePct * 0.5)) < 0.05, `half way: ${mul(dg)}`);
  h.run(10);
  assert.ok(Math.abs(mul(dg) - (1 + CC.delegation.chargePct)) < 1e-9, `full: ${mul(dg)}`);
  assert.equal(mul(other), 1, 'a bounty Degenbrecher does not charge');
  dg.blockedBy = h.allies()[0];
  h.run(0.2);
  dg.blockedBy = null;
  assert.ok(mul(dg) < 1 + CC.delegation.chargePct * 0.05, `reset when blocked: ${mul(dg)}`);
  h.run(10);
  h.b.applyStatus(dg, 'bind', { duration: 1, source: h.allies()[0], force: true });
  h.run(0.2);
  assert.ok(mul(dg) < 1 + CC.delegation.chargePct * 0.05, `reset when unable to move: ${mul(dg)}`);
  const off = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules: { ccDelegation: 1 } }, units: [] });
  off.step(1);
  const d1 = off.spawn(CC.delegation.degen, { pos: [10, 9], routeIndex: 0, mods: { speedMul: 0.0001, bountyId: `risk:delegation:${CC.delegation.degen}` } });
  off.run(5);
  assert.equal(mul(d1), 1, 'United 1: no charge');
});

test('Delegation: the Degenbrechers of the boss fields share one HP bar (both lives); each field reports its own damage', () => {
  const rules = { ccDelegation: 1 };
  const pool = new SharedBossPool(1e9, { risk: bossRiskConfig(rules) });
  const field = (fieldId) => {
    const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, fieldId, sharedBoss: pool, flags: { rules } });
    h.step(1);
    const dg = h.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0, bountyId: `risk:delegation:${CC.delegation.degen}` } });
    return { h, dg };
  };
  const a = field('b1'), b = field('b2');
  const max = a.dg.s.maxHp;
  assert.equal(b.dg.s.maxHp, max);
  const both = (s) => { for (let t = 0; t < s - 1e-9; t += 0.1) { a.h.run(0.1); b.h.run(0.1); } };
  const hit = (f, x) => f.h.b.dealDamage(null, f.dg, { amount: x, type: 'true', sourceless: true });
  const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 1, `${msg}: ${x} vs ${y}`);
  hit(a, max * 0.4);
  both(0.5);
  near(b.dg.hp, max * 0.6, 'the other field\'s copy took it');
  near(a.dg.hp, max * 0.6, 'nothing comes back');
  near(pool.riskView().degen.b1, max * 0.4, 'b1 reported');
  hit(b, max * 0.3);
  both(0.5);
  near(a.dg.hp, max * 0.3, 'and the other way');
  near(b.dg.hp, max * 0.3, 'b2 itself');
  // b2's KO (her first life) knocks out b1's copy too; both revive into the second form at full HP
  hit(b, max);
  both(0.5);
  assert.ok(a.dg.buffs.some((x) => x.key === 'ab:reborn') && b.dg.buffs.some((x) => x.key === 'ab:reborn'), 'both reviving');
  for (let i = 0; i < 600 && [a, b].some((f) => f.dg.s.flags.invulnerable || f.dg.buffs.some((x) => x.key === 'ab:reborn')); i++) both(0.1);
  near(a.dg.hp, max, 'b1 full again');
  near(b.dg.hp, max, 'b2 full again');
  // b1 ends her second life: b2's copy dies with her
  hit(a, max);
  both(0.5);
  assert.equal(a.dg.alive, false);
  assert.equal(b.dg.alive, false, 'b2\'s copy died too');
  // a client field (LocalBossPool) reports its own damage in b.progress
  const local = new LocalBossPool(1e9, 1e9, pool.riskView());
  const c = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, fieldId: 'b3', sharedBoss: local, flags: { rules } });
  c.step(1);
  const dg = c.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0, bountyId: `risk:delegation:${CC.delegation.degen}` } });
  c.b.dealDamage(null, dg, { amount: 1000, type: 'true', sourceless: true });
  c.run(0.3);
  near(battleProgress(c.b).degen, 1000, 'b.progress degen');
  // without the tag: no link
  const plain = new SharedBossPool(1e9, { risk: bossRiskConfig({ ccDelegation: 0 }) });
  assert.equal(plain.riskView(), null);
});

test('Delegation United 3: one field\'s finished Momentum Murder opens the gate on every field (no lock-up on a field that never casts)', () => {
  const rules = { ccDelegation: 3 };
  const pool = new SharedBossPool(1e9, { risk: bossRiskConfig(rules) });
  const field = (fieldId) => {
    const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, fieldId, sharedBoss: pool, flags: { rules } });
    h.step(1);
    const dg = h.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0, bountyId: `risk:delegation:${CC.delegation.degen}` } });
    return { h, dg };
  };
  const a = field('b1'), b = field('b2');
  const max = a.dg.s.maxHp, step = CC.delegation.gateRatio;
  const both = (s) => { for (let t = 0; t < s - 1e-9; t += 0.1) { a.h.run(0.1); b.h.run(0.1); } };
  const hit = (f, x) => f.h.b.dealDamage(null, f.dg, { amount: x, type: 'true', sourceless: true });
  const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 1, `${msg}: ${x} vs ${y}`);
  // the gate is the second form's: knock both into it
  hit(a, max);
  both(0.5);
  for (let i = 0; i < 600 && [a, b].some((f) => f.dg.s.flags.invulnerable || f.dg.buffs.some((x) => x.key === 'ab:reborn')); i++) both(0.1);
  near(a.dg.hp, max, 'second form, full');
  assert.equal(a.dg.degenGate.done(), 0);
  // only b2 steps: its copy reaches the gate, casts, and the step is done there
  hit(b, max * (step + 0.03));
  near(b.dg.hp, max * (1 - step), 'b2 held at the gate');
  for (let t = 0; t < CC.delegation.castSeconds + 0.3; t += 0.1) b.h.run(0.1);
  assert.equal(b.dg.degenGate.done(), 1, 'b2 cast');
  near(pool.riskView().degenGate.b2, 1, 'b2 reported its step');
  // b1 never cast: within one sync its gate is open, and b2's damage came through without a cast there
  a.h.run(0.3);
  assert.equal(a.dg.degenGate.done(), 1, 'b1\'s gate opened by b2\'s cast');
  near(a.dg.hp, max * (1 - step), 'b2\'s damage reached b1');
  hit(a, max * 0.05);
  near(a.dg.hp, max * (1 - step - 0.05), 'past the old gate on b1');
});
