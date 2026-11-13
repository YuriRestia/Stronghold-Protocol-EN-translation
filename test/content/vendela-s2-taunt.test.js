// test/content/vendela-s2-taunt.test.js — 刺玫 (Vendela) S2 荆藤庇荫: who gets the taunt (user report 2026-11-13, "Vendela s2
// seems to target herself and taunt"). Client skill prefab skchr_vendla_2, ability MaxHpSelector: allies in her attack
// range, _postFilter MAX_HP_DES, _excludeOwner 0 (she herself is a candidate), _professionMask 639 (every operator class,
// not TOKEN / TRAP: summons never). blackboard taunt_level 1, for the skill's duration.
// Run: node --test test/content/vendela-s2-taunt.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';

const VENDLA = 'chess_char_1_06_a';
const ally = (id, maxHp) => chessRec({ id, stats: { maxHp, atk: 0, def: 0 }, skill: null });

/** 刺玫 on (10, 4); `others` = [chessId, row, col] in her range; S2 started by hand. */
function field(defs, others, extra) {
  const h = makeBattle({
    defs: { chess: defs }, units: [{ chessId: VENDLA, row: 10, col: 4 }, ...others.map(([chessId, row, col]) => ({ chessId, row, col }))],
    autoFinish: false, timeLimit: 60, seed: 3,
  });
  const v = h.unit(VENDLA);
  h.run(1);
  extra?.(h, v);
  const sk = v.skill;
  sk.sp = sk.spCost; sk.charges = Math.max(1, sk.charges);
  assert.ok(sk.activate('manual'), 'S2 starts');
  return { h, v, taunt: sk.def?.bb?.taunt_level ?? 1 };
}

test('S2 taunts 刺玫 herself when no operator in her range has more max HP (MaxHpSelector, _excludeOwner 0)', () => {
  const { h, v } = field({ t_low: ally('t_low', 300) }, [['t_low', 11, 4]]);
  const low = h.unit('t_low');
  assert.ok(v.s.maxHp > low.s.maxHp);
  assert.equal(v.mem.protege, v, 'she is the protégé');
  assert.equal(v.s.taunt, 1, 'taunt_level 1 on herself');
  assert.equal(low.s.taunt, 0);
  h.run(v.skill.duration + 0.5);
  assert.equal(v.s.taunt, 0, 'gone when the skill ends');
  checkInvariants(h.b);
});

test('S2 taunts the operator with the most max HP in her range, never a summon (_professionMask 639)', () => {
  let tok = null, tokTaunt0 = null;
  const { h, v } = field({ t_tank: ally('t_tank', 3000) }, [['t_tank', 11, 4]], (h2, v2) => {
    tok = h2.b.spawnToken(v2, 'token_10022_kazema_shadow', 10, 5, { stats: { maxHp: 50000 } });
    tokTaunt0 = tok?.s.taunt;
  });
  const tank = h.unit('t_tank');
  assert.ok(tok?.alive && tok.kind === 'token', 'a summon stands in her range');
  assert.ok(tok.s.maxHp > tank.s.maxHp, 'with more max HP than the operator');
  assert.equal(v.mem.protege, tank, 'the operator, not the summon');
  assert.equal(tank.s.taunt, 1);
  assert.equal(tok.s.taunt, tokTaunt0, 'the summon gets no taunt');
  checkInvariants(h.b);
});
