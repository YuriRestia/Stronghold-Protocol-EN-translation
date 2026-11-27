// test/sim/risk-famiglia.test.js — the SPA-CC Famiglia tags' Blood Ledger (server/sim/content/risk.js installFamiglia):
// Unending (a permanent Asset Liquidation), Seasonal (the gauge, its Liquidation, the Silencer, the drain, the half-full
// start from round 10), Zaaro's +1/s and Furious Howl, the snapshot's `bl`; and the Level 1 stats of Patriot and the
// Delegation sub-wave's Degenbrecher.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { CC } from '../../shared/ruleData.js';

const F = CC.famiglia;
const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 100, def: 100, speed: 0 }) } };
const field = (rules, { round = 1 } = {}) => {
  const h = makeBattle({ defs: DEFS, autoFinish: false, timeLimit: 2000, seed: 2, round, flags: { rules },
    units: [{ chessId: 'chess_char_3_08_a', row: 10, col: 3 }] });
  h.step(1);
  return h;
};
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('no ledger without Unending / Seasonal (Cleaner alone)', () => {
  const h = field({ ccFamiglia: 1 });
  assert.equal(h.b.ledger, undefined);
  assert.equal(h.snapshot().bl, undefined);
});

test('Unending: every battle is a Liquidation — enemies +20 % ATK, +15 % DEF, the Silencers their stack; no Silencer comes', () => {
  const h = field({ ccFamiglia: 2 });
  const plain = field({});
  const d = h.spawn('enemy_dummy', { pos: [10, 7], routeIndex: 0 }), p = plain.spawn('enemy_dummy', { pos: [10, 7], routeIndex: 0 });
  assert.ok(p.s.atk > 0 && close(d.s.atk / p.s.atk, 1 + F.atkPct), `${d.s.atk} / ${p.s.atk}`);
  assert.ok(p.s.def > 0 && close(d.s.def / p.s.def, 1 + F.defPct), `${d.s.def} / ${p.s.def}`);
  const sil = h.spawn(F.summonKey, { pos: [10, 8], routeIndex: 0, mods: { speedMul: 0 } });
  assert.ok(sil.buffs.some((b) => b.key === 'risk:liquidationSilencer'), 'the Silencer stack');
  const n = h.enemies().length;
  h.run(200);
  assert.equal(h.enemies().length, n, 'no Silencer comes');
  assert.deepEqual(h.snapshot().bl, [F.max, F.max, 1, 1]);
});

test('Seasonal: fills 3 per game second; at 500 a Liquidation with one Shadow Silencer, the buffs, a 35 s drain without filling', () => {
  const h = field({ ccFamiglia: 4 });
  const d = h.spawn('enemy_dummy', { pos: [10, 7], routeIndex: 0 });
  const start = F.max * F.startShare;
  assert.ok(Math.abs(h.b.ledger.value - start) < 4, `fresh: ${start} before round 10, ${h.b.ledger.value}`);
  h.run(50);
  assert.ok(Math.abs(h.b.ledger.value - (start + 150)) < 4, `${h.b.ledger.value}`);
  assert.equal(h.b.ledger.liquidating, false);
  assert.ok(!d.buffs.some((b) => b.key === 'risk:liquidation'));
  h.runUntil(() => h.b.ledger.liquidating, 80);
  assert.ok(Math.abs(h.b.time - (1 + (F.max - start) / 3)) < 1.5, `at ${h.b.time}`);
  assert.ok(d.buffs.some((b) => b.key === 'risk:liquidation'), 'the enemies on the field');
  const sils = () => h.enemies().filter((e) => e.defId === F.summonKey);
  h.run(0.1);
  assert.equal(sils().length, 1, 'one Shadow Silencer');
  assert.equal(sils()[0].buffs.find((b) => b.key === 'risk:liquidationSilencer')?.mods?.aspd, F.silencer.aspd);
  h.run(F.drainSeconds / 2);
  assert.ok(Math.abs(h.b.ledger.value - F.max / 2) < 10, `half drained: ${h.b.ledger.value}`);
  h.run(F.drainSeconds / 2 + 0.5);
  assert.equal(h.b.ledger.liquidating, false);
  assert.ok(h.b.ledger.value < 5, 'it fills again from 0');
  assert.ok(!d.buffs.some((b) => b.key === 'risk:liquidation'), 'the buffs end with it');
  assert.equal(h.snapshot().bl[2], 0);
});

test('Seasonal from round 10 starts 75 % full', () => {
  const h = field({ ccFamiglia: 4 }, { round: 10 });
  const late = F.max * F.lateShare;
  assert.ok(h.b.ledger.value >= late);
  h.runUntil(() => h.b.ledger.liquidating, 120);
  assert.ok(Math.abs(h.b.time - (1 + (F.max - late) / 3)) < 1.5, `at ${h.b.time}`);
});

test('Zaaro adds 1 per second, and 35 per second while his Furious Howl lasts (second form, outside a Liquidation)', () => {
  const h = field({ ccFamiglia: 4 });
  const z = h.spawn(F.zaaro.key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  const v0 = h.b.ledger.value;
  h.run(10);
  assert.ok(Math.abs(h.b.ledger.value - v0 - 40) < 1.5, `+4 / s: ${h.b.ledger.value - v0}`);
  // his second form: knock him out, let the revive finish
  h.b.dealDamage(null, z, { amount: z.s.maxHp * 10, type: 'true', sourceless: true }); // through his −30 % damage taken
  assert.ok(h.runUntil(() => z.findBuff('ab:wolfRage'), 80) !== false && z.findBuff('ab:wolfRage'), 'his second form');
  // the first Howl comes WildCalling's icd (5) s into the second form and lasts 5.5 s: measure inside it from an empty
  // gauge (a Liquidation would stop the filling)
  h.run(5.5);
  h.b.ledger.liquidating = false;
  h.b.ledger.value = 0;
  h.run(4);
  assert.ok(Math.abs(h.b.ledger.value - 4 * (F.perSec + F.zaaroPerSec + F.howl.perSec)) < 2, `39 / s during the Howl: ${h.b.ledger.value}`);
  h.run(10);                                                  // past it
  h.b.ledger.liquidating = false;                             // (from empty again: 200 is reached quickly)
  h.b.ledger.value = 0;
  const v2 = h.b.ledger.value;
  h.run(5);
  assert.ok(Math.abs(h.b.ledger.value - v2 - 20) < 1.5, `back to 4 / s: ${h.b.ledger.value - v2}`);
});

test('the snapshot carries the Ledger', () => {
  const h = field({ ccFamiglia: 4 });
  h.run(10);
  const bl = h.snapshot().bl;
  assert.equal(bl.length, 4);
  assert.ok(Math.abs(bl[0] - (F.max * F.startShare + 30)) <= 4 && bl[1] === F.max && bl[2] === 0 && bl[3] === 0, JSON.stringify(bl));
});

test('Level 1 stats: Patriot under ccPatriot; the Delegation sub-wave Degenbrecher only', () => {
  const pat = field({ ccPatriot: 1 });
  const p = pat.spawn(CC.patriot.key, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  assert.equal(p.base.maxHp, 60000);
  assert.equal(p.base.atk, 2000);
  assert.equal(p.hp, p.s.maxHp);
  const dg = field({ ccDelegation: 1 });
  const sub = dg.spawn(CC.delegation.degen, { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0, bountyId: `risk:delegation:${CC.delegation.degen}`, hpMul: 5 } });
  assert.equal(sub.base.maxHp, 45000 * 5);
  assert.equal(sub.base.def, 800);
  const other = dg.spawn(CC.delegation.degen, { pos: [11, 8], routeIndex: 0, mods: { speedMul: 0 } });
  assert.equal(other.base.maxHp, 28000, 'a bounty Degenbrecher keeps Level 0');
});
