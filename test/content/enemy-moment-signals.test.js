// (fork, enemy sound audit job 3) Display-only fx the sim sends for official enemy sounds no other event marks: Jetman's
// landing (fx 'sound' kind 'land') and 泥岩巨像's attack tiers (fx 'mode' n — the official enemy_mdrock_s_1[persistent]
// ON_BEFORE_ATTACK: charge stacks 1/2/3/5/6 switch to Tier 1/2/3/4/5, 4 stacks switch nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';

/** Three operators (a defender blocking route 0) and enemy `key` spawned on route 0. */
function field(key, spawn = { route: 0 }) {
  const h = makeBattle({ autoFinish: false, timeLimit: 600, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }, { uid: 3, chessId: 'chess_char_2_01_a', row: 11, col: 5 }] });
  h.b.start(); h.step();
  return { h, e: h.spawn(key, spawn) };
}

test("Jetman: its landing after the take-off sends fx 'sound' kind 'land' on itself, once", () => {
  const { h, e } = field('enemy_2004_balloon');
  const lands = () => h.events.filter((ev) => ev[0] === 'fx' && ev[1] === 'sound' && ev[4]?.id === e.id && ev[4]?.kind === 'land');
  assert.ok(h.runUntil(() => { h.step(0); return e.buffs.some((b) => b.key === 'ab:takeoff'); }, 60), 'it took off');
  assert.equal(lands().length, 0, 'no landing while it flies');
  assert.ok(h.runUntil(() => { h.step(0); return lands().length > 0 || !e.alive; }, 30), 'it landed');
  if (e.alive) {
    assert.equal(lands().length, 1);
    assert.ok(e.buffs.some((b) => b.key === 'ab:landing'), 'the landing brake runs with it');
  }
  checkInvariants(h.b);
});

test("泥岩巨像: before its 2nd/3rd/4th/6th/7th attack the tier fx 'mode' n = 1/2/3/4/5 (the official charge-stack rule)", () => {
  const { h, e } = field('enemy_1511_mdrock', { route: 0, mods: { speedMul: 0.25 } });   // slow: it stays in reach long enough
  h.b.addBuff(e, { key: 't:inv', persist: true, flags: { invulnerable: true } });   // it outlives the field's attacks
  const mine = () => h.events.filter((ev) => (ev[0] === 'atk' && ev[1] === e.id) || (ev[0] === 'fx' && ev[1] === 'mode' && ev[4]?.id === e.id));
  const atks = () => mine().filter((ev) => ev[0] === 'atk').length;
  const done = h.runUntil(() => { h.step(0); return atks() >= 8 || !e.alive; }, 240);
  assert.ok(done, 'it attacked 8 times');
  // the attack number each tier fx came before
  const seen = [];
  let n = 0;
  for (const ev of mine()) {
    if (ev[0] === 'atk') n++;
    else seen.push([ev[4].n, n + 1]);
  }
  assert.deepEqual(seen, [[1, 2], [2, 3], [3, 4], [4, 6], [5, 7]]);
  checkInvariants(h.b);
});
