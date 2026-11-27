// test/sim/victoria-mod-c.test.js — 维多利亚 Mod C (Custom Lobby Modifications victoriaMod 'C', shared/rules.js;
// server/sim/content/bonds/core.js installVictoriaC / victoriaCPrice / victoriaCPrepEnd, server/match/player/economy.js
// _rollItemSlot). Battle: when a member's skill ends, 8 SP per carried 维式重锤; <6 members> ATK
// +(200 + 1.2·L) %, a 屏障 of 2 × max HP and 抵抗 at battle start; Mod A's damage multiplier is gone. Prep: shop hammers are
// the upgraded ones and cost 0 while 维多利亚 is active; at the end of the 休整期 a member carrying a hammer adds its tier in
// 维多利亚 stacks (and, with 6 members, 2 × its tier to its other active alliances).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { VICTORIA_C, isVictorianHammer, victoriaCPrepEnd } from '../../server/sim/content/bonds/core.js';
import { makeMatch } from '../match/harness.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };
const HAMMER = 'chess_item_1_01_e_a';
const SIX = ['chess_char_1_06_a', 'chess_char_2_05_a', 'chess_char_2_10_a', 'chess_char_3_08_a', 'chess_char_4_07_a', 'chess_char_5_08_a'];

function battle({ mod = 'C', count = 3, layers = 50, units }) {
  return makeBattle({
    defs: DEFS, timeLimit: 200, seed: 3, autoFinish: false,
    units, enemies: [{ key: 'enemy_dummy', pos: [10, 6] }],
    bonds: { victoriaShip: { count, active: true, tier: count >= 6 ? 2 : 1, layers } },
    flags: { rules: { victoriaMod: mod } },
  });
}

test('hammers: every 维式重锤 kind, normal and upgraded, and nothing else', () => {
  assert.equal(isVictorianHammer(HAMMER), true);
  assert.equal(isVictorianHammer('chess_item_1_01_e_b'), true);
  assert.equal(isVictorianHammer('chess_item_2_03_e_a'), true, '战栗维式重锤');
  assert.equal(isVictorianHammer('chess_item_1_02_e_a'), false);
});

test('SP per hammer: when a member\'s skill ends it recovers 8 per 维式重锤 (like 迅捷); none without a hammer or under Mod A', () => {
  const spAfter = (mod, items) => {
    const h = battle({ mod, units: [{ chessId: 'chess_char_5_08_a', row: 10, col: 3, items }] });
    const u = h.unit('chess_char_5_08_a');
    h.step(1);
    u.skill.sp = 0;
    h.b.emit('skillEnd', { unit: u, skill: u.skill, reason: 'end' });
    return u.skill.sp;
  };
  assert.equal(spAfter('C', [HAMMER, 'chess_item_2_03_e_a']), 2 * VICTORIA_C.spPerHammer, 'two hammers');
  assert.equal(spAfter('C', []), 0, 'no hammer');
  assert.equal(spAfter('A', [HAMMER]), 0, 'Mod A');
});

test('<6 members>: ATK +(200 + 1.2·L) %, a 屏障 of 2 × max HP and 抵抗; not with 3, and Mod A\'s damage multiplier is gone', () => {
  const units = SIX.map((chessId, i) => ({ chessId, row: 9 + (i % 2), col: 2 + i }));
  const six = battle({ count: 6, layers: 100, units });
  six.step(1);
  const u = six.unit('chess_char_3_08_a');
  assert.ok(u.buffs.some((b) => b.key === 'bond:victoria:c:atk'));
  const barrier = u.buffs.find((b) => b.key === 'bond:victoria:c:barrier');
  assert.ok(barrier && Math.abs(barrier.shield - Math.round(u.s.maxHp * 2)) <= 1, '屏障 2 × max HP');
  assert.ok(u.buffs.some((b) => b.status === 'resist'), '抵抗');
  assert.ok(!u.buffs.some((b) => b.key === 'bond:victoria'), 'no Mod A damage multiplier');
  const three = battle({ count: 3, layers: 100, units: units.slice(0, 3) });
  three.step(1);
  assert.ok(!three.unit('chess_char_1_06_a').buffs.some((b) => b.key === 'bond:victoria:c:atk'));
});

test('prep: shop hammers are upgraded and free while 维多利亚 is active; the 休整期 end adds the carriers\' tiers', () => {
  const h = makeMatch({ mode: 'solo', seed: 4, lobbyRules: { victoriaMod: 'C' } }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  // 维多利亚 active (as computeBonds would make it), a hammer slot rolled
  ps.bonds.victoriaShip = { ...(ps.bonds.victoriaShip || {}), active: true, count: 3 };
  let slot = null;
  for (let i = 0; i < 400 && !slot; i++) {
    const s = ps._rollItemSlot();
    if (s && isVictorianHammer(ps.gd.item(s.id))) slot = s;
  }
  assert.ok(slot, 'a hammer was rolled');
  assert.equal(ps.gd.item(slot.id).isGolden, true, 'the upgraded hammer');
  assert.equal(ps.priceOf(slot), 0, 'free');
  ps.bonds.victoriaShip.active = false;
  assert.ok(ps.priceOf(slot) > 0, 'priced again while 维多利亚 is not active');
  h.m.dispose();
});

test('休整期 end: a member carrying a hammer adds its tier in 维多利亚 stacks; with 6 members also 2 × tier to its other active alliances', () => {
  const run = (count, active = ['victoriaShip', 'arcaneShip']) => {
    const added = [];
    const tiers = { a: 2, b: 3, c: 4 };
    const ctx = {
      lobbyRules: { victoriaMod: 'C' },
      bondActive: (id) => active.includes(id),
      bondCount: () => count,
      board: () => [
        { uid: 'a', kind: 'chess', id: 'a', items: [{ uid: 'i1', id: HAMMER }] },     // 洛洛-like: 维多利亚 + 奥术
        { uid: 'b', kind: 'chess', id: 'b', items: [{ uid: 'i2', id: 'chess_item_1_02_e_a' }] }, // no hammer
        { uid: 'c', kind: 'chess', id: 'c', items: [{ uid: 'i3', id: 'chess_item_1_01_e_b' }] }, // not 维多利亚
      ],
      pieceBonds: (uid) => ({ a: ['victoriaShip', 'arcaneShip'], b: ['victoriaShip'], c: ['yanShip'] })[uid],
      chessRecord: (id) => ({ tier: tiers[id] }),
      addLayers: (b, n) => added.push([b, n]),
    };
    victoriaCPrepEnd(ctx);
    return added;
  };
  assert.deepEqual(run(3), [['victoriaShip', 2]]);
  assert.deepEqual(run(6), [['victoriaShip', 2], ['arcaneShip', 4]]);
  assert.deepEqual(run(6, ['victoriaShip']), [['victoriaShip', 2]], 'only active other alliances');
});
