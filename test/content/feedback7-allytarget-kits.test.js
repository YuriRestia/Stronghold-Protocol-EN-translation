// test/content/feedback7-allytarget-kits.test.js — a skill that 白铁's 铁钳号·原型机 (a registered ally target) opens must act on
// it (Grok's review of round 22: 蕾缪安 S3, 艾丽妮 S3, 陈 S2 and 引星棘刺 S2 opened on the device alone and were spent on
// nothing — their kits picked enemies only). The owner's rule (2026-10-08): the device draws aggro like an enemy. So:
// - these four kits now take ally targets in their selectors (the hits are cancelled by the device, its 受击回复 counts;
//   蕾缪安's locks spend her bullets);
// - a skill whose effect does not reach it — one that picks its own victims and has no kit flag `allyTargets: true` — is
//   not opened by it (skills.js `allyTargetsOk`), e.g. 德克萨斯 S2 剑雨: it waits for an enemy.
// Run: node --test test/content/feedback7-allytarget-kits.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const CRAB = 'token_10027_ironmn_pile3';
const IRON = { uid: 2, diy: { slot: 6, charId: 'char_4072_ironmn', skillIndex: 2 }, elite: true, row: 12, col: 9, dir: 'RIGHT' };
const crabAt = (col) => ({ uid: 10, kind: 'token', tokenId: CRAB, ownerUid: 2, row: 10, col, dir: 'RIGHT' });
const diy = (charId, skillIndex) => ({ uid: 1, diy: { slot: 6, charId, skillIndex }, elite: true, row: 10, col: 4, dir: 'RIGHT' });

function field(unit, extra = {}) {
  const h = makeBattle({
    timeLimit: 60, autoFinish: false, seed: 3, flags: { dpPerSec: 0, dpMax: 999, dpInit: 99 },
    hooks: ['hit', 'skillStart', 'skillEnd', 'ammoUsed'], captureNoisy: true,
    defs: { enemies: { e_d: enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, atk: 0 }) } },
    units: [unit, IRON, crabAt(5)], ...extra,
  });
  h.step();
  const u = h.unit(1);
  const crab = h.b.allyUnits.find((a) => a.defId === CRAB);
  return { h, u, crab };
}
/** Hits of `u`'s skill on the device (cancelled by it). */
const skillHits = (h, u, crab) => h.hooksOf('hit').filter((c) => c.target === crab && (c.source === u || c.credit === u) && c.dmg?.isSkill);

test('蕾缪安 S3: on the device alone she locks it, spends her bullets on it and ends with the last one', () => {
  const { h, u, crab } = field({ uid: 1, chessId: 'chess_char_6_01_a', skillIndex: 2, row: 10, col: 4, dir: 'RIGHT' });
  assert.equal(u.skill.id, 'skchr_lemuen_3');
  u.skill.gainSp(999, 'test');
  const ammo = u.skill.ammo;
  assert.ok(h.runUntil(() => u.skill.activations > 0, 5), 'opened');
  assert.ok(h.runUntil(() => !u.skill.active, 15), 'ended');
  assert.ok(h.hooksOf('skillEnd').some((c) => c.unit === u && c.reason === 'ammo'), 'by its bullets');
  assert.ok(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length >= ammo, `${ammo} bullets spent`);
  assert.equal(crab.hp, crab.s.maxHp);
  checkInvariants(h.b);
});

test('艾丽妮 S3 / 陈 S2: on the device alone their strikes land on it (cancelled)', () => {
  for (const [charId, si, id] of [['char_4009_irene', 2, 'skchr_irene_3'], ['char_010_chen', 1, 'skchr_chen_2']]) {
    const { h, u, crab } = field(diy(charId, si));
    assert.equal(u.skill.id, id);
    u.skill.gainSp(999, 'test');
    assert.ok(h.runUntil(() => u.skill.activations > 0, 5), `${id} opened`);
    h.run(4);
    assert.ok(skillHits(h, u, crab).length >= 1, `${id} hit the device`);
    assert.equal(crab.hp, crab.s.maxHp);
    checkInvariants(h.b);
  }
});

test('引星棘刺 S2: on the device alone the alchemy unit lands on it, not on the far tile ahead', () => {
  const { h, u, crab } = field({ uid: 1, chessId: 'chess_char_5_15_a', skillIndex: 1, row: 10, col: 4, dir: 'RIGHT' });
  assert.equal(u.skill.id, 'skchr_thorn2_2');
  u.skill.gainSp(999, 'test');
  assert.ok(h.runUntil(() => u.skill.activations > 0, 5), 'opened');
  const z = u.mem.zones?.[0];
  assert.ok(z, 'a zone');
  assert.ok(Math.abs(z.x - crab.x) < 0.3 && Math.abs(z.y - crab.y) < 0.3, `thrown at the device (${z.x}, ${z.y})`);
  checkInvariants(h.b);
});

test('a skill whose effect picks enemies only (德克萨斯 S2 剑雨) is not opened by the device; an enemy opens it', () => {
  const { h, u } = field({ uid: 1, chessId: 'chess_char_1_08_a', skillIndex: 1, row: 10, col: 4, dir: 'RIGHT' });
  assert.equal(u.skill.id, 'skchr_texas_2');
  u.skill.gainSp(999, 'test');
  const ch = u.skill.charges;
  h.run(5);
  assert.equal(u.skill.activations, 0, 'kept for an enemy');
  assert.equal(u.skill.charges, ch);
  h.spawn('e_d', { pos: [10, 6] });
  assert.ok(h.runUntil(() => u.skill.activations > 0, 5), 'an enemy opens it');
  checkInvariants(h.b);
});

test('the engine rule: the device opens a skill acting through the attacks or flagged allyTargets — not an onStart-only or a no-attack one', () => {
  const id = 'test_cast_a';
  const opens = (skill) => {
    const h = makeBattle({
      defs: { chess: { [id]: chessRec({ id, profession: 'SNIPER', rangeGrid: [[0, 0], [0, 1]], skill: { skillType: 'MANUAL', spCost: 1, initSp: 1 } }) } },
      kits: { [id]: () => ({ skill: { spCost: 1, initSp: 1, trigger: 'DEFAULT', ...skill } }) },
      units: [{ uid: 1, chessId: id, row: 10, col: 4, dir: 'RIGHT' }, IRON, crabAt(5)],
      timeLimit: 20, autoFinish: false, seed: 2, flags: { dpPerSec: 0, dpMax: 999 },
    });
    h.step();
    const u = h.unit(1);
    u.skill.gainSp(999, 'test');
    h.run(3);
    checkInvariants(h.b);
    return u.skill.activations > 0;
  };
  assert.equal(opens({ kind: 'duration', duration: 3 }), true, 'a timed skill that keeps attacking');
  assert.equal(opens({ kind: 'instant', attack: { atkScale: 2 } }), true, 'a cast that is the next attack');
  assert.equal(opens({ kind: 'instant', onStart() {} }), false, 'an onStart-only cast');
  assert.equal(opens({ kind: 'duration', duration: 3, attack: { noAttack: true } }), false, 'a timed skill that stops attacking');
  assert.equal(opens({ kind: 'instant', onStart() {}, allyTargets: true }), true, 'flagged by its kit');
  assert.equal(opens({ kind: 'duration', duration: 3, allyTargets: false }), false, 'opted out by its kit');
});
