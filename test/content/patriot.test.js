// test/content/patriot.test.js — 爱国者 (Patriot), the Fish Edition pilot enemy for SPA-CC (server/sim/content/enemies/leaders.js
// kitPatriot; data via tools/build-data.mjs FORK_ENEMY_KEYS): 强化 on every other enemy, 行军姿态 (buffs, 4 hits), the 60 s
// revive with its true-damage pulse, then 毁灭姿态 (rage buffs, stun / freeze / levitate immunity, the pulse, and the spear at
// the farthest unit on high ground).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };

function field({ walk = false } = {}) {
  const h = makeBattle({
    defs: DEFS, autoFinish: false, timeLimit: 400, seed: 3,
    units: [{ chessId: 'chess_char_3_01_a', row: 10, col: 2 }, { chessId: 'chess_char_3_08_a', row: 10, col: 6 }],
  });
  h.step(1);
  const p = h.spawn('enemy_1506_patrt', { pos: [10, 7], routeIndex: 0, mods: walk ? {} : { speedMul: 0 } });
  const d = h.spawn('enemy_dummy', { pos: [11, 9], routeIndex: 0, mods: { speedMul: 0 } });
  h.run(0.5);
  return { h, p, d };
}

test('the data and the kit are there: 爱国者 is a leader with his own kit', async () => {
  const { LEADER_KITS } = await import('../../server/sim/content/enemies/leaders.js');
  assert.ok(LEADER_KITS.enemy_1506_patrt);
});

test('行军姿态: his buffs, 强化 on the other enemies, and 4 hits per attack', () => {
  const { h, p, d } = field({ walk: true });
  assert.ok(p.buffs.some((b) => b.key === 'ab:patriotMarch'), '行军姿态');
  assert.ok(d.buffs.some((b) => b.key.startsWith('ab:patriotStrength')), '强化 on another enemy');
  assert.ok(!p.buffs.some((b) => b.key.startsWith('ab:patriotStrength')), 'not on himself');
  // a blocker that outlives the four hits (each hit would stop at its death)
  const mint = h.unit('chess_char_3_08_a');
  h.b.addBuff(mint, { key: 'test:wall', persist: true, mods: { hpFlat: 1e8, defFlat: 5000 } });
  mint.hp = mint.s.maxHp;
  const hits = [];
  h.b.on('hit', (c) => { if (c.source === p && c.target.side === 'ally') hits.push(c.dmg.tags?.includes('secondHit') ? 'extra' : 'attack'); });
  h.run(20);
  const attacks = hits.filter((x) => x === 'attack').length, extra = hits.filter((x) => x === 'extra').length;
  assert.ok(attacks >= 1, `attacked ${attacks}`);
  assert.equal(extra, attacks * 3, '3 more hits per attack');
});

test('KO: a 60 s revive with the true-damage pulse, then 毁灭姿态 with its immunities and the spear on high ground', () => {
  const { h, p } = field();
  h.b.dealDamage(null, p, { amount: p.hp + 1, type: 'true', sourceless: true });
  h.step(1);
  assert.ok(p.buffs.some((b) => b.key === 'ab:reborn'), 'reviving');
  assert.ok(p.alive);
  const pulses = [];
  h.b.on('hit', (c) => { if (c.source === p && c.dmg.tags?.includes('patriotPulse')) pulses.push(h.b.time); });
  h.run(30);
  assert.ok(pulses.length > 0, 'the pulse during the revive');
  assert.ok(Math.abs(p.hp / p.s.maxHp - 0.5) < 0.05, `the HP bar refills over the revive: ${(p.hp / p.s.maxHp).toFixed(2)} at 30 of 60 s`);
  h.run(32);
  assert.ok(!p.buffs.some((b) => b.key === 'ab:reborn'), 'stood up after 60 s');
  assert.ok(p.buffs.some((b) => b.key === 'ab:patriotRage'), '毁灭姿态');
  assert.ok(!p.buffs.some((b) => b.key === 'ab:patriotMarch'), '行军 buffs gone');
  assert.ok(p.mem.ab.immune.has('stun') && p.mem.ab.immune.has('frozen'));
  const spears = [];
  h.b.on('hit', (c) => { if (c.source === p && c.dmg.tags?.includes('patriotSpear')) spears.push(c.target); });
  h.run(45);
  const fx = h.eventsOf('fx').map((ev) => ev[1]);
  assert.ok(fx.includes('patriotSpearMark') && fx.includes('patriotSpear') && fx.includes('patriotSpearHit'), 'the wind-up mark, the throw and the impact are shown');
  assert.ok(spears.length >= 1, 'a spear');
  assert.ok(spears.every((t) => t.ground === false), 'at the unit on high ground');
});
