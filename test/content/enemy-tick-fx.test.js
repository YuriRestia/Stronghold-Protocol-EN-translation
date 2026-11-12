// (fork) Enemy VFX audit, S rows: enemy skill moments the client never sees, sent as fx 'tick' (battle.tickFx) so it
// plays that skill plan's pulse rows — Jetman's take-off jets, Blackhorn Rhuul's mark on its blocker and its clash hit.
// Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';

/** Three operators (a defender blocking route 0) and enemy `key` spawned on route 0. */
function field(key) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_3_01_a', row: 10, col: 4 },
    { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }, { uid: 3, chessId: 'chess_char_2_01_a', row: 11, col: 5 }] });
  h.b.start(); h.step();
  return { h, e: h.spawn(key, { route: 0 }) };
}
/** Runs until `pred`, keeping every fx 'tick' event of enemy `id`. */
function ticksUntil(h, id, pred, secs) {
  const ticks = () => h.events.filter((ev) => ev[0] === 'fx' && ev[1] === 'tick' && ev[4]?.id === id).map((ev) => ev[4]);
  const ok = h.runUntil(() => { h.step(0); return pred(ticks()); }, secs);
  return { ok, out: ticks() };
}

test("Jetman: taking off sends one tick on itself (its take-off jets), tag 'balloon:takeoff'", () => {
  const { h, e } = field('enemy_2004_balloon');
  const { ok, out } = ticksUntil(h, e.id, (o) => o.length > 0, 60);
  assert.ok(ok, 'it took off');
  assert.ok(e.buffs.some((b) => b.key === 'ab:takeoff'));
  assert.deepEqual(out.map((t) => [t.on, t.skill, t.key ?? null]), [[e.id, 'balloon:takeoff', null]]);
  checkInvariants(h.b);
});

test("Blackhorn Rhuul: its charge marks its blocker (enemy_xdelk_buff_03), a failed push hits it (enemy_xdelk_skill_hit_01)", () => {
  const { h, e } = field('enemy_10144_xdelk_2');
  const { ok, out } = ticksUntil(h, e.id, (o) => o.some((t) => t.skill === 'elk:clash'), 90);
  assert.ok(ok, 'a clash came');
  const blocker = h.unit(2);
  assert.deepEqual(out.slice(0, 2).map((t) => [t.on, t.skill, t.key]), [
    [blocker.id, 'elk:charge', 'enemy_xdelk_buff_03'], [blocker.id, 'elk:clash', 'enemy_xdelk_skill_hit_01']]);
  checkInvariants(h.b);
});
