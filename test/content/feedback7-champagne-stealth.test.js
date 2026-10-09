// test/content/feedback7-champagne-stealth.test.js — 琳琅诗怀雅's 香槟炸弹 does not go off on a 隐匿 enemy that is neither
// revealed nor blocked (community report: 「香槟炸到没有破隐的隐匿敌人了」). PRTS 作战机制 §隐匿: "隐匿效果使得获得该效果的单位无法被
// 任何敌方的能力索敌选中" — the bomb's pages carry no 无视隐匿 note, and the other contact traps (多萝西's 共振装置, 望's 棋子)
// select their enemies so too. A revealed (反隐) or blocked one, and every visible ground enemy, still set it off.
// Run: node --test test/content/feedback7-champagne-stealth.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const TRAP = 'token_10031_swire2_gdtrap';
const trapHits = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('trap'));

test('her bombs: a 隐匿 walker crosses one unharmed; a visible walker after it sets it off', () => {
  const h = makeBattle({
    timeLimit: 120, autoFinish: false, hooks: ['damaged', 'death'], captureNoisy: true,
    defs: { enemies: { e_w: enemyRec({ key: 'e_w', hp: 1e6, speed: 1, def: 0, atk: 0 }) } },
    units: [{ uid: 1, chessId: 'chess_char_3_04_a', row: 9, col: 5 }],
  });
  h.step();
  const sw = h.unit(1);
  const bombAt = (r, c) => h.b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.tileR === r && t.tileC === c);
  for (let i = 0; i < 15 && !bombAt(9, 7); i++) { sw.mem.coins = 3; h.run(2); }
  const bomb = bombAt(9, 7);
  assert.ok(bomb, 'a bomb on (9,7), on the walkers\' road before her block');
  const hidden = h.spawn('e_w', { route: 0 });
  h.b.addBuff(hidden, { key: 'test:stealth', persist: true, flags: { stealth: true } });
  assert.ok(h.runUntil(() => hidden.x < 6.6, 20), 'it walked over (9,7)');
  assert.ok(bomb.alive, 'not set off');
  assert.equal(trapHits(h, hidden).length, 0);
  const seen = h.spawn('e_w', { route: 0 });
  assert.ok(h.runUntil(() => !bomb.alive, 20), 'a visible walker sets it off');
  assert.ok(trapHits(h, seen).length > 0 && seen.findBuff('sluggish'));
  checkInvariants(h.b);
});

test('a bomb (the token kit) under a standing 隐匿 enemy waits; revealed (反隐), it goes off', () => {
  const h = makeBattle({
    timeLimit: 30, autoFinish: false, hooks: ['damaged'], captureNoisy: true,
    defs: { enemies: { e_d: enemyRec({ key: 'e_d', hp: 1e6, speed: 0, def: 0, atk: 0 }) } },
    units: [{ uid: 1, chessId: 'chess_char_3_04_a', row: 12, col: 3 }], enemies: [{ key: 'e_d', pos: [9, 7] }],
  });
  h.step();
  const e = h.b.enemies.find((x) => x.alive);
  h.b.addBuff(e, { key: 'test:stealth', persist: true, flags: { stealth: true } });
  const bomb = h.b.spawnToken(h.unit(1), TRAP, 9, 7);
  assert.ok(bomb);
  h.run(2);
  assert.ok(bomb.alive && !e.blockedBy, 'a 隐匿 enemy on its tile does not set it off');
  assert.equal(trapHits(h, e).length, 0);
  h.b.addBuff(e, { key: 'test:reveal', persist: true, flags: { reveal: true } });
  h.step(2);
  assert.ok(!bomb.alive, 'revealed: it goes off');
  assert.ok(trapHits(h, e).length > 0);
  checkInvariants(h.b);
});
