// (fork) Enemy VFX audit, S rows: the buffs enemies put on units carry the official buff key whose lasting effect the
// carrier shows while the buff lasts (b.snap fxs → render/vfx/skills.js STATE_BUFFS): 'Pompeii''s burn on its targets,
// 'Gravestone''s shield, Fallen Snowpriest's buff on the enemies it reaches, Garum Gourmet's barrel zone. Display only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

const OP = 'chess_char_2_06_a';
const rows = (u, buff) => (fxStateView(u, 999) || []).filter((r) => r[0] === buff);

/** One operator at (10, 4), a defender blocking route 0 at (9, 6), and the given enemies spawned on route 0 at once. */
function field(keys) {
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: OP, row: 10, col: 4 }, { uid: 2, chessId: 'chess_char_1_02_a', row: 9, col: 6 }] });
  h.b.start(); h.step();
  return { h, es: keys.map((k) => h.spawn(k, { route: 0 })) };
}

test("'Pompeii': its burn shows lslime_t_dot on the unit it hits, from it, while the DoT lasts", () => {
  const { h, es: [pom] } = field(['enemy_1050_lslime']);
  const op = h.unit(1);
  assert.ok(h.runUntil(() => rows(op, 'lslime_t_dot').length > 0, 60), 'its burn reached the operator');
  assert.deepEqual(rows(op, 'lslime_t_dot'), [['lslime_t_dot', pom.id, null]]);
  checkInvariants(h.b);
});

test("'Gravestone': its barrier shows flking_shiled on itself while it holds", () => {
  const { h, es: [g] } = field(['enemy_2008_flking']);
  assert.ok(h.runUntil(() => g.buffs.some((b) => b.key === 'ab:tombShield'), 60), 'it raised its barrier');
  assert.deepEqual(rows(g, 'flking_shiled'), [['flking_shiled', null, null]]);
  const buff = g.buffs.find((b) => b.key === 'ab:tombShield');
  g.buffs.splice(g.buffs.indexOf(buff), 1);
  assert.deepEqual(rows(g, 'flking_shiled'), [], 'gone with the barrier');
  checkInvariants(h.b);
});

test('Fallen Snowpriest: its chain buff shows enemy_smsha_buffs on the enemies it reaches, from it', () => {
  const { h, es: [sha, a, b] } = field(['enemy_2050_smsha', 'enemy_1007_slime', 'enemy_1007_slime']);
  const got = () => [a, b].filter((o) => rows(o, 'enemy_smsha_buffs').length);
  assert.ok(h.runUntil(() => got().length > 0, 60), 'it buffed another enemy');
  for (const o of got()) assert.deepEqual(rows(o, 'enemy_smsha_buffs'), [['enemy_smsha_buffs', sha.id, null]]);
  assert.deepEqual(rows(sha, 'enemy_smsha_buffs'), [], 'not on itself');
  checkInvariants(h.b);
});

test('Garum Gourmet: its barrel zone shows wintun_t[attack_speed] on the enemies in it, from it', () => {
  const { h, es: [w, a] } = field(['enemy_10044_wintun', 'enemy_1007_slime']);
  const on = () => [w, a].filter((o) => o.alive && rows(o, 'wintun_t[attack_speed]').length);
  assert.ok(h.runUntil(() => on().length > 0, 60), 'its zone holds an enemy');
  for (const o of on()) assert.deepEqual(rows(o, 'wintun_t[attack_speed]'), [['wintun_t[attack_speed]', w.id, null]]);
  checkInvariants(h.b);
});

test('the client plays these buffs as state rows', () => {
  for (const k of ['lslime_t_dot', 'flking_shiled', 'enemy_smsha_buffs', 'wintun_t[attack_speed]']) assert.equal(STATE_BUFFS[k], true, k);
});
