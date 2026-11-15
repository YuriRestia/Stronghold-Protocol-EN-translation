// test/content/vendela-s2-taunt.test.js — 刺玫 (Vendela) S2 荆藤庇荫: who gets the taunt (user report 2026-11-13, "Vendela s2
// seems to target herself and taunt"). Client skill prefab skchr_vendla_2, ability MaxHpSelector: allies in her attack
// range, _postFilter MAX_HP_DES, _excludeOwner 0 (she herself is a candidate), _professionMask 639 (every operator class,
// not TOKEN / TRAP: summons never). blackboard taunt_level 1, for the skill's duration.
// Run: node --test test/content/vendela-s2-taunt.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

const VENDLA = 'chess_char_1_06_a';
const ally = (id, maxHp) => chessRec({ id, stats: { maxHp, atk: 0, def: 0 }, skill: null });
/** b.snap fxs rows of the protégé glow (client buff vendla_s_2[self]) on a unit: [src] each. */
const glow = (h, u) => (fxStateView(u, h.b.time) || []).filter((r) => r[0] === 'vendla_s_2[self]').map((r) => r[1]);

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

// (fork) The protégé's glow (user report 2026-11-15, "vendela s2 vfx … not showing on the operator she's targeting"): the
// client's vendla_s_2[self] gives the MaxHpSelector pick vendla_s_2, whose overrideEffectKey vendla_skill_02_buff_01
// loops on it for the skill's duration (LIMITED `duration`, _finishDerivedBuffIfParentFinish; config/
// buff_template_holder.ab). The sim names that unit in b.snap fxs (the taunt buff's `fx`, src 刺玫), display only.
test('S2 puts the protégé glow row (b.snap fxs) on the higher-max-HP ally, not on 刺玫, and clears it at the end', () => {
  const { h, v } = field({ t_tank: ally('t_tank', 3000) }, [['t_tank', 11, 4]]);
  const tank = h.unit('t_tank');
  assert.ok(STATE_BUFFS['vendla_s_2[self]'], 'the client knows the buff');
  assert.deepEqual(glow(h, tank), [v.id], 'on the protégé, src = 刺玫');
  assert.deepEqual(glow(h, v), [], 'not on 刺玫');
  h.run(v.skill.duration / 2);
  assert.deepEqual(glow(h, tank), [v.id], 'for the whole skill');
  h.run(v.skill.duration);
  assert.equal(v.skill.active, false);
  assert.deepEqual(glow(h, tank), [], 'gone when the skill ends');
  checkInvariants(h.b);
});

test('S2 glow row sits on 刺玫 herself when she is her own protégé, and goes with a protégé knocked out', () => {
  const self = field({ t_low: ally('t_low', 300) }, [['t_low', 11, 4]]);
  assert.deepEqual(glow(self.h, self.v), [self.v.id]);
  assert.deepEqual(glow(self.h, self.h.unit('t_low')), []);
  const { h, v } = field({ t_tank: ally('t_tank', 3000) }, [['t_tank', 11, 4]]);
  const tank = h.unit('t_tank');
  h.b.loseHp(tank, tank.hp + 1, { sourceless: true });
  h.run(0.2);
  assert.ok(!tank.alive, 'the protégé is down');
  assert.deepEqual(glow(h, tank), [], 'no row on a knocked-out protégé');
  assert.ok(v.skill.active);
  checkInvariants(h.b);
});

test('S2 counter fx names the attacker (`target`), where the client plays vendla_skill_02_hit_01', () => {
  const still = (r, c) => ({ motion: 'WALK', start: [r, c], end: [r, c], checkpoints: [] });
  const h = makeBattle({
    defs: { chess: { t_tank: ally('t_tank', 9000) }, enemies: { e_dummy: enemyRec({ key: 'e_dummy', hp: 1e8, atk: 300, speed: 0, range: 5, bat: 1 }) } },
    units: [{ chessId: VENDLA, row: 10, col: 4 }, { chessId: 't_tank', row: 11, col: 4 }],
    enemies: [{ key: 'e_dummy', time: 0, pos: [10, 6], route: still(10, 6) }],
    autoFinish: false, timeLimit: 60, seed: 3,
    setup: (b) => b.on('beforeAttack', (ctx) => { if (ctx.attacker.side === 'enemy') ctx.targets = [b.allyUnits.find((u) => u.defId === 't_tank')]; }, { priority: 50 }),
  });
  const v = h.unit(VENDLA);
  h.run(1);
  const foe = h.enemy();
  assert.ok(foe?.alive, 'the attacker stands');
  const sk = v.skill;
  sk.sp = sk.spCost; sk.charges = Math.max(1, sk.charges);
  assert.ok(sk.activate('manual'));
  h.run(5);
  const counters = h.eventsOf('fx').filter((e) => e[1] === 'counter' && e[4]?.id === v.id);
  assert.ok(counters.length >= 2, `counters drawn: ${counters.length}`);
  assert.ok(counters.every((e) => e[4].target === foe.id), 'each names the attacker');
  checkInvariants(h.b);
});
