// (fork) Enemy VFX audit, S rows: an enemy talent's aura buff carries the official buff key whose lasting effect the
// units it reaches show (b.snap fxs → render/vfx/skills.js STATE_BUFFS): Defender-4's DEF aura, Frost's ASPD-down
// aura, the Dublinn Phalanx's aura. Display only: the buffs' numbers are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

const OP = 'chess_char_2_06_a';

/** A battle with one operator at (10, 4) and the given enemies spawned, then placed at [x, y] and held there 150 ticks. */
function field(spots) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: OP, row: 10, col: 4 }] });
  h.b.start(); h.step();
  const es = spots.map(([key, x, y]) => {
    const e = h.spawn(key, { route: 0 });
    e.x = x; e.y = y;
    return e;
  });
  // hold them in place: freeze movement by re-placing every tick
  for (let i = 0; i < 150; i++) { es.forEach((e, j) => { e.x = spots[j][1]; e.y = spots[j][2]; }); h.step(); }
  return { h, es };
}
const rows = (u, buff) => (fxStateView(u, 999) || []).filter((r) => r[0] === buff);

test('Defender-4: its DEF aura shows defdrn_t_defup on the other enemies in range, from the drone', () => {
  const { h, es: [drone, other, far] } = field([['enemy_1017_defdrn', 3, 9], ['enemy_1007_slime', 3.5, 9], ['enemy_1007_slime', 9, 9]]);
  assert.deepEqual(rows(other, 'defdrn_t_defup'), [['defdrn_t_defup', drone.id, null]]);
  assert.deepEqual(rows(far, 'defdrn_t_defup'), [], 'out of range: none');
  assert.deepEqual(rows(drone, 'defdrn_t_defup'), [], 'not on the drone itself');
  checkInvariants(h.b);
});

test('Frost: its ASPD-down aura shows frostd_t_attack_speed_down on the operator in range, from Frost', () => {
  const { h, es: [frost] } = field([['enemy_1042_frostd', 4, 9]]);
  assert.deepEqual(rows(h.unit(1), 'frostd_t_attack_speed_down'), [['frostd_t_attack_speed_down', frost.id, null]]);
  checkInvariants(h.b);
});

test('Dublinn Phalanx: a phalanx another one reaches shows duphlx_t_aura (its own talent); a lone one none', () => {
  const { h, es: [a, b, lone] } = field([['enemy_1169_duphlx', 3, 9], ['enemy_1169_duphlx', 3.5, 9], ['enemy_1169_duphlx', 9, 9]]);
  assert.deepEqual(rows(a, 'duphlx_t_aura'), [['duphlx_t_aura', null, null]]);
  assert.deepEqual(rows(b, 'duphlx_t_aura'), [['duphlx_t_aura', null, null]]);
  assert.deepEqual(rows(lone, 'duphlx_t_aura'), []);
  checkInvariants(h.b);
});

test('the client plays these buffs as state rows', () => {
  for (const k of ['defdrn_t_defup', 'frostd_t_attack_speed_down', 'duphlx_t_aura', 'enemy_lrcmra[originum][dmg]']) assert.equal(STATE_BUFFS[k], true, k);
});
