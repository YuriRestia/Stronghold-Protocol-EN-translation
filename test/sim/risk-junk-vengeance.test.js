// test/sim/risk-junk-vengeance.test.js — the battle side of SPA-CC Junk (the Toxic Waste's carrier ATK −50 %) and
// Vengeance (Invincible Blade 2 / 3 on the Reids the tag adds: ATK, Status Resistance, damage reduction below half HP,
// 15 s invulnerable after the revive, +100 ASPD below half HP at 3), server/sim/content/risk.js and his kit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { CC } from '../../shared/ruleData.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0 }) } };
const V = CC.vengeance;

test('Junk: the Toxic Waste\'s carrier has −50 % ATK, nobody else', () => {
  const op = (items, rules) => {
    const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 100, seed: 2, flags: { rules },
      units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 3, items }] });
    h.step(1);
    return h.allies()[0];
  };
  const base = op([], { ccJunk: 1 }).s.atk;
  const cursed = op([CC.junk.itemId], { ccJunk: 1 });
  assert.ok(cursed.buffs.some((b) => b.key === 'risk:cursedHammer'), 'the carrier');
  assert.ok(Math.abs(cursed.s.atk - base * (1 + CC.junk.atkPct)) < 1e-6, `${cursed.s.atk} vs ${base}`);
  assert.ok(!op([CC.junk.itemId], {}).buffs.some((b) => b.key === 'risk:cursedHammer'), 'no tag, no effect');
});

function reidField(level) {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3, flags: { rules: { ccVengeance: level } },
    units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 2 }] });
  h.step(1);
  const r = h.spawn(V.key, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0, bountyId: 'risk:vengeance' } });
  const plain = h.spawn(V.key, { pos: [11, 8], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.3);
  return { h, r, plain };
}

test('Invincible Blade 2: +50 % ATK, Status Resistance; 40 % less damage below half HP; no extra HP; only the Reids the tag adds', () => {
  const { h, r, plain } = reidField(2);
  assert.ok(Math.abs(r.s.maxHp - plain.s.maxHp) < 1e-6, 'no extra HP (the balance draft of 2026-11)');
  assert.ok(Math.abs(r.s.atk / plain.s.atk - (1 + V.atkPct)) < 1e-6);
  assert.ok(r.buffs.some((b) => b.key === 'resist'), 'Status Resistance');
  assert.ok(!plain.buffs.some((b) => b.key === 'risk:vengeance'), 'a bounty Reid is untouched');
  const hit = (u) => { const c = { target: u, dmg: { type: 'phys', mul: 1 } }; h.b.emit('hit', c); return c.dmg.mul; };
  assert.equal(hit(r), 1, 'above half HP');
  r.hp = r.s.maxHp * 0.4;
  assert.ok(Math.abs(hit(r) - (1 - V.lowDr2)) < 1e-9);
  plain.hp = plain.s.maxHp * 0.4;
  assert.equal(hit(plain), 1, 'a bounty Reid below half HP: no reduction');
});

test('Invincible Blade 2: invulnerable for 15 s after his revive', () => {
  const { h, r, plain } = reidField(2);
  for (const u of [r, plain]) h.b.dealDamage(null, u, { amount: u.s.maxHp * 10, type: 'true', sourceless: true });
  h.runUntil(() => !r.buffs.some((b) => b.key === 'ab:reborn'), 30);
  h.run(0.5);
  assert.ok(r.alive && r.s.flags.invulnerable, 'invulnerable after standing up');
  h.run(V.reviveInvincible);
  assert.ok(!r.s.flags.invulnerable, 'over after 15 s');
  assert.ok(!plain.s.flags.invulnerable, 'a bounty Reid keeps his data (none)');
});

test('Invincible Blade 3: below half HP 80 % less damage and +100 ASPD; no immunities', () => {
  const { h, r } = reidField(3);
  const { r: r2 } = reidField(2);
  assert.equal(r.s.aspd, r2.s.aspd, 'above half HP: no ASPD');
  r.hp = r.s.maxHp * 0.4;
  h.run(0.3);
  assert.equal(r.s.aspd - r2.s.aspd, V.aspd, 'below half HP');
  const c = { target: r, dmg: { type: 'arts', mul: 1 } };
  h.b.emit('hit', c);
  assert.ok(Math.abs(c.dmg.mul - (1 - V.lowDr3)) < 1e-9);
  assert.equal(h.b.applyStatus(r, 'stun', { duration: 3, source: h.allies()[0], force: true }), true, 'a stun lands below half too');
  r.hp = r.s.maxHp;
  h.run(0.5);
  assert.equal(r.s.aspd, r2.s.aspd, 'back above half: the ASPD goes');
});
