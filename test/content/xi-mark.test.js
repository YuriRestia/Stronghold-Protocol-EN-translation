// test/content/xi-mark.test.js — (fork) “自在” (enemy_1517_xi, leaders.js kitXi): 【纬地经天】's target mark. The client's
// CrossAttackMark / CrossAttackMarkReborn (GloballUniqueBuffAbility, re-selected every tick) keep enemy_xi_mark[a] on the
// nearest unit (form 2: on the farthest, with enemy_xi_mark[b] on the nearest); the sim signals it display only
// (Battle.fxState → b.snap fxs, src the enemy), and the client plays the cross's hit for its 'telegraph' of kind 'xiCross'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { ENEMY_FX_BINDINGS, bindingEffects, enemyBinds } from '../../public/js/render/vfx/skills.js';

const MARK_A = 'enemy_xi_mark[a]', MARK_B = 'enemy_xi_mark[b]';
const probe = (id) => chessRec({ id, profession: 'SNIPER', projectile: 'none', stats: { atk: 1, maxHp: 1e7, bat: 99, blockCnt: 0 }, rangeGrid: [[0, 0]] });
const marksOf = (b) => {
  const out = {};
  for (const u of b.units) for (const [buff, src] of fxStateView(u) || []) if (buff === MARK_A || buff === MARK_B) out[buff] = [u.defId, src];
  return out;
};

function fight() {
  return makeBattle({ content: 'generic', extraContent: [enemiesMod], autoFinish: false, captureNoisy: true,
    defs: { chess: { near: probe('near'), far: probe('far') } },
    units: [{ chessId: 'near', row: 10, col: 6 }, { chessId: 'far', row: 10, col: 1 }],
    enemies: [{ key: 'enemy_1517_xi', pos: [10, 8], mods: { speedMul: 0 } }],
  });
}

test('form 1: the nearest unit carries enemy_xi_mark[a] from Free; it moves when another unit is nearer', () => {
  const h = fight();
  h.run(0.5);
  const e = h.enemy('enemy_1517_xi');
  assert.deepEqual(marksOf(h.b), { [MARK_A]: ['near', e.id] });
  h.b.kill(h.unit('near'), null);
  h.run(0.5);
  assert.deepEqual(marksOf(h.b), { [MARK_A]: ['far', e.id] }, 'the next nearest takes it');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

test('form 2: nearest enemy_xi_mark[b], farthest enemy_xi_mark[a]; none during the rebirth or after the death', () => {
  const h = fight();
  h.run(0.5);
  const e = h.enemy('enemy_1517_xi');
  h.b.kill(e, null);                                  // the first knock-out: the 重生
  h.run(1);
  assert.deepEqual(marksOf(h.b), {}, 'no mark while it is reborn');
  h.run(5);
  assert.equal(e.form, 'form2');
  assert.deepEqual(marksOf(h.b), { [MARK_A]: ['far', e.id], [MARK_B]: ['near', e.id] });
  h.b.kill(e, null);
  h.run(0.2);
  assert.ok(!e.alive);
  assert.deepEqual(marksOf(h.b), {}, 'gone with it');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

test("the cross's 'telegraph' plays projectile_enemy_xi_s's hit once at its point", () => {
  const [bind] = enemyBinds(ENEMY_FX_BINDINGS.enemy_1517_xi?.telegraph);
  assert.equal(bind?.xkind, 'xiCross');
  assert.equal(bind.owner, 'id');
  assert.equal(bind.once, true);
  const idx = { projectiles: { projectile_enemy_xi_s: { onHit: ['enemy_xi_skill_01_hit'] } } };
  assert.deepEqual(bindingEffects(idx, bind), ['enemy_xi_skill_01_hit']);
});
