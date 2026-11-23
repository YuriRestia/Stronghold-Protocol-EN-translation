// The official ALWAYS skills whose cast needs a target (Passenger S3, Degenbrecher S2 / S3, Irene S2 / S3) wait with
// full SP until an enemy of their trigger's selector stands on the skill range; with none there, nothing is cast and
// no SP is spent. Official: AutoChessBattleTrigger._TryTriggerSkill (ALWAYS: no range check, UseSkill) →
// CastSkill.DoCast (`_trigger` without a target and `_allowNoTarget` 0: false before ReduceSp); prefab flags from
// battle/prefabs/[uc]skills.ab (the kits' comments cite them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };

/** One operator at (10, 3) facing right, its SP topped up after the first step; `enemies` as makeBattle takes them. */
function field(unit, enemies = []) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 600, autoFinish: false, seed: 3,
    flags: { dpPerSec: 0, dpMax: 999 },
    units: [{ uid: 1, row: 10, col: 3, ...unit }], enemies,
  });
  h.step();
  const u = h.unit(1);
  u.skill.gainSp(999, 'test');
  return { h, u };
}

function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

const CASES = [
  // [label, unit, a tile inside the skill range, a tile outside it] (range_table: x-3 / x-1 diamonds of radius 3 / 2,
  // 1-4 = rows −1..1 × cols 0..1, 3-12 = that plus (0, 2) and (0, 3))
  ['Passenger S3 (x-3)', { chessId: 'chess_char_6_05_a' }, [10, 6], [10, 8]],
  ['Degenbrecher S3 (x-1)', { chessId: 'chess_char_6_19_a' }, [11, 4], [10, 7]],
  ['Degenbrecher S2 (1-4)', { chessId: 'chess_char_6_19_a', skillIndex: 1 }, [11, 4], [10, 9]],
  ['Irene S2 (3-12)', { diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4009_irene', skillIndex: 1 } }, [10, 6], [10, 9]],
  ['Irene S3 (x-1)', { diy: { slot: 'chess_char_6_diy1_a', charId: 'char_4009_irene', skillIndex: 2 } }, [12, 3], [10, 7]],
];

for (const [label, unit, inside, outside] of CASES) {
  test(`${label}: full SP and no enemy on the skill range → no cast, SP kept`, () => {
    const { h, u } = field(unit, [{ key: 'enemy_dummy', pos: outside }]);
    const charges = u.skill.charges;
    assert.ok(u.skill.ready, 'ready');
    h.run(8);
    assert.equal(u.skill.activations, 0, 'never cast');
    assert.equal(u.skill.charges, charges, 'charges kept');
    done(h);
  });

  test(`${label}: an enemy steps onto the skill range → cast`, () => {
    const { h, u } = field(unit, [{ key: 'enemy_dummy', pos: inside }]);
    assert.ok(h.runUntil(() => u.skill.activations > 0, 8), 'cast with a target on the skill range');
    done(h);
  });
}

test('Degenbrecher S2 / Irene S2: a flying enemy alone on the skill range does not open the ground-only skill', () => {
  for (const unit of [CASES[2][1], CASES[3][1]]) {
    const { h, u } = field(unit, [{ key: 'enemy_fly', pos: [11, 4] }]);
    h.run(8);
    assert.equal(u.skill.activations, 0, JSON.stringify(unit));
    done(h);
  }
});

test('Passenger S3 / Degenbrecher S3 / Irene S3: a flying enemy on the skill range opens them (their trigger takes flyers)', () => {
  for (const unit of [CASES[0][1], CASES[1][1], CASES[4][1]]) {
    const { h, u } = field(unit, [{ key: 'enemy_fly', pos: [11, 4] }]);
    assert.ok(h.runUntil(() => u.skill.activations > 0, 8), JSON.stringify(unit));
    done(h);
  }
});
