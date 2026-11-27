// test/sim/issue27-bubble-spring-counter.test.js — issue #27: 泡泡 (chess_char_2_08) S2 “挨打” and “碎铳之簧” 法术护盾
// (enemy_9018_actrpa) set each other off: her counter is physical, the shield answers a physical hit with its own counter on
// the attacker, and she answered that one in turn — down to the hook depth limit (`hook nesting deeper than 32`), with the
// handlers further down skipped. The spring's physical counter is 无来源 (PRTS "对来源造成…无来源物理附加伤害"): hooks see no
// source, and no operator counter strikes back at sourceless damage (kits/shared/tier1.js byEnemyAttack).
// Run: node --test test/sim/issue27-bubble-spring-counter.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const BUBBLE = 'chess_char_2_08_a';
const SPRING_A = 'enemy_9018_actrpa';    // “碎铳之簧” 法术护盾: phys hits → "对来源造成…无来源物理附加伤害" + erosion

const tagged = (tag) => (c) => (c.dmg?.tags || []).includes(tag);

test('泡泡 S2 “挨打” against “碎铳之簧” 法术护盾: one counter each way, no ping-pong, no hook depth error', REAL, () => {
  const h = makeBattle({
    stageId: 'act2autochess_m02', seed: 3, autoFinish: false, timeLimit: 60, hooks: ['damaged'], captureNoisy: true,
    units: [{ chessId: BUBBLE, row: 9, col: 5, skillIndex: 1 }],
    enemies: [{ key: SPRING_A, pos: [9, 6], mods: { hpMul: 1e4, speedMul: 0 } }],
  });
  const u = h.unit(BUBBLE);
  h.step();                                // the spring spawns on the first step
  const spring = h.enemy(SPRING_A);
  u.skill.gainSp(999, 'test');
  if (!u.skill.active) assert.ok(u.skill.activate('test'), 'cast');
  h.run(10);
  checkInvariants(h.b);
  assert.deepEqual(h.b.errors.map((e) => e.label), [], 'no handler errors (hookDepth)');

  const dmg = h.hooksOf('damaged');
  const answers = dmg.filter((c) => c.source === u && c.target === spring && c.type === 'phys' && tagged('counter')(c));
  const springCounters = dmg.filter((c) => c.credit === spring && c.target === u && c.type === 'phys' && tagged('springCounter')(c));
  const springHits = dmg.filter((c) => c.source === spring && c.target === u && !tagged('springCounter')(c) && c.type !== 'element');
  assert.ok(answers.length > 0, 'her counter lands on the spring');
  assert.ok(springCounters.length > 0, 'the shield answers her physical counter');
  assert.ok(springCounters.every((c) => c.source === null && c.dmg.sourceless), 'the shield\'s counter is 无来源 (hooks see no source)');
  assert.equal(answers.length, springHits.length, 'she answers the spring\'s own hits only, not its counters');
});
