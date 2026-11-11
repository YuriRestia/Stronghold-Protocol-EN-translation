// test/content/skill-begin-clip.test.js — (fork) a skill with a begin clip starts when the clip ends (the lead's job of
// 2026-11-11: the first attack cut 水月 S3's Skill_2_Start). Official (CN client): SkillState.OnEnter → BasicSkill.
// OnBeforeSkillStart plays `_beginAnim` (skills marked `_playSkillBeginAnim`, tools/assets/skill-begin-anims.mjs) and
// waits its length (PlayBeginAnimation: WaitForFixedSeconds) before DoStartSkill → Cast; the Attack state is left
// meanwhile, and leaving the Skill state first (SkillState.OnExit → InterruptStartIfNot) drops the cast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { SKILL_BEGIN_ANIMS } from '../../tools/assets/skill-begin-anims.mjs';

const chess = JSON.parse(readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e8, speed: 0, ...o });
const MIZUKI = 'chess_char_4_09_a';

/** 水月 on skill slot `skillIndex` beside one dummy; `cast` = the battle time her cast was made (null before). */
function mizuki(skillIndex) {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: MIZUKI, row: 10, col: 4, skillIndex }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }], timeLimit: 200, hooks: [], seed: 9 });
  const u = h.unit(MIZUKI);
  return { h, u, sk: u.skill };
}
const mine = (h, u, kinds) => h.events.filter((e) => kinds.includes(e[0]) && e[1] === u.id);

test('the data: 水月 S3 begins with Skill_2_Start (1 s), her S1 / S2 and 莫斯提马 S3 play none', () => {
  const s = (id, i) => chess[id].skills.find((k) => k.index === i);
  assert.deepEqual(s(MIZUKI, 2).beginAnim, { clip: 'Skill_2_Start', dur: 1 });
  assert.equal(s(MIZUKI, 0).beginAnim, undefined);
  assert.equal(s(MIZUKI, 1).beginAnim, undefined);
  assert.equal(SKILL_BEGIN_ANIMS.skchr_mostma_3, undefined, 'the client plays no begin clip for 莫斯提马 S3');
  for (const c of Object.values(chess)) {
    for (const k of c.skills || []) {
      if (!k.beginAnim) continue;
      assert.ok(SKILL_BEGIN_ANIMS[String(k.prefabId || k.skillId).toLowerCase().replace(/\[\d+\]$/, '')], `${c.chessId} ${k.skillId}: only the client's _playSkillBeginAnim skills`);
      assert.ok(k.beginAnim.dur > 0 && k.beginAnim.dur < 5, `${c.chessId} ${k.skillId}`);
    }
  }
});

test('水月 S3: the cast plays its begin clip; the skill starts, SP is spent and she attacks only when it ends', () => {
  const { h, u, sk } = mizuki(2);
  assert.equal(sk.beginDur, 1);
  assert.ok(h.runUntil(() => !!sk.starting, 120), 'she casts S3');
  const t0 = h.b.time;
  const sp = sk.spTotal;
  const n = h.events.length;
  assert.equal(sk.active, false, 'not started at the cast');
  assert.ok(sp >= sk.spCost, 'nothing spent at the cast');
  let before = n;                       // the events up to the tick before the start
  for (let i = 0; i < 150 && !sk.active; i++) { before = h.events.length; h.step(); }
  assert.equal(sk.active, true);
  const dt = h.b.time - t0;
  assert.ok(dt >= 1 - 1e-9 && dt < 1 + 1 / 15, `starts one begin clip after the cast (${dt} s)`);
  assert.ok(sk.spTotal < sp, 'the SP is spent when it starts');
  const during = h.events.slice(n, before).filter((e) => e[1] === u.id && ['atkCast', 'atk'].includes(e[0]));
  assert.deepEqual(during, [], 'no attack during the begin clip');
  assert.ok(h.events.slice(before).some((e) => e[0] === 'atkCast' && e[1] === u.id), 'her first attack is cast as the skill starts');
  const skillEvents = mine(h, u, ['skill']);
  assert.equal(skillEvents.filter((e) => e[2] === 1).length, 1, 'one skill event: at the cast, none again at the start');
  h.run(2);
  assert.ok(mine(h, u, ['atk']).length > 0, 'she attacks once the skill runs');
});

test('水月 S3: a stun during the begin clip drops the cast — nothing spent, the skill clip ends — and she casts again later', () => {
  const { h, u, sk } = mizuki(2);
  assert.ok(h.runUntil(() => !!sk.starting, 120));
  const sp = sk.spTotal;
  h.step();
  h.b.applyStatus(u, 'stun', { duration: 2 });
  h.step();
  assert.equal(sk.starting, null, 'dropped');
  assert.equal(sk.active, false);
  assert.ok(sk.spTotal >= sp, 'no SP spent');
  const ev = mine(h, u, ['skill']);
  assert.deepEqual(ev[ev.length - 1].slice(0, 3), ['skill', u.id, 0], 'the client ends the begin clip');
  assert.ok(h.runUntil(() => sk.active, 10), 'cast again after the stun, and started');
});

test('水月 S2 (no begin clip): the skill starts at its cast, as before', () => {
  const { h, sk } = mizuki(1);
  assert.equal(sk.beginDur, 0);
  assert.ok(h.runUntil(() => sk.active, 120));
  assert.equal(sk.starting, null);
});
