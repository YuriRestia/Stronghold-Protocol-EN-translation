// (fork) The layered legacy bot (server/match/botTacticsLegacy.js) and legacy's tunables per seat (bot.js
// withLegacyTunables, botTactics.js defineProfile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_TUNABLES, LAYOUT_PARAMS, withLegacyTunables } from '../../server/match/bot.js';
import { BOT_STRATEGIES, TACTICS, profileFromData } from '../../server/match/botStrategies.js';
import { PASS, defineTactic, defineProfile, profileOf } from '../../server/match/botTactics.js';
import { LEGACY_TACTICS, LEGACY_ARRANGE, LEGACY_LEVEL, levelTarget } from '../../server/match/botTacticsLegacy.js';
import { ROOM_BOTS } from '../../shared/botProfiles.js';
import { makeMatch, checkInvariants } from './harness.js';

const bots = (n) => Array.from({ length: n }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));

/** What a whole fake-battle match left: the result and every seat's end state. */
function playOut(opts) {
  const h = makeMatch({ difficulty: 'NORMAL', fake: true, ...opts });
  try {
    h.start();
    const ended = h.runToEnd();
    checkInvariants(h.m);
    assert.deepEqual(h.logs.error, []);
    return JSON.stringify({ ended, round: h.m.round, seats: h.m.order.map((ps) => ({ lp: ps.lp, funds: ps.funds,
      level: ps.shop.level, band: ps.bandId, units: ps.allChess().map((p) => `${p.id}@${p.area}:${p.key ?? ''}`).sort(),
      stats: ps.stats })) });
  } finally { h.m.dispose(); }
}

test('legacy-layered: one tactic per decision point, registered for benches but not offered in rooms; defaults are legacy\'s values', () => {
  assert.ok(Object.hasOwn(BOT_STRATEGIES, 'legacy-layered'));
  assert.ok(!ROOM_BOTS.some((b) => b.id === 'legacy-layered'));
  const p = profileOf('legacy-layered');
  assert.deepEqual(p.tactics.map((t) => t.tactic), LEGACY_TACTICS.map((t) => t.id));
  assert.deepEqual(p.tunables, LEGACY_TUNABLES);
  assert.deepEqual(levelTarget([3, 5, 7, 9]), LEGACY_TUNABLES.LEVEL_TARGET);
  assert.deepEqual(levelTarget([9, 3, 7, 5]), LEGACY_TUNABLES.LEVEL_TARGET, 'out-of-order rounds are sorted');
  for (const t of LEGACY_TACTICS) assert.equal(TACTICS[t.id], t);
});

test('legacy-layered plays whole matches exactly like legacy, solo and with four bot seats', () => {
  for (const seed of [3, 11]) {
    const solo = { mode: 'solo', seats: bots(1), seed };
    assert.equal(playOut({ ...solo, botStrategy: 'legacy-layered' }), playOut({ ...solo, botStrategy: 'legacy' }), `solo seed ${seed}`);
  }
  const coop = { mode: 'coop', seats: bots(4), seed: 5 };
  assert.equal(playOut({ ...coop, botStrategy: 'legacy-layered' }), playOut({ ...coop, botStrategy: 'legacy' }), 'coop4');
});

test('a changed parameter changes play: the level cap 2 keeps the shop at level 2', () => {
  const capped = defineProfile({ id: 'test-capped', tactics: [{ tactic: LEGACY_LEVEL, params: { maxLevel: 2 } }] });
  const level = (botStrategy) => JSON.parse(playOut({ mode: 'solo', seats: bots(1), seed: 3, botStrategy })).seats[0].level;
  assert.ok(level('legacy') > 2);
  assert.equal(level(capped), 2);
});

test('tuned values apply to their own seat only, in every step, and are back to legacy\'s after', () => {
  const seen = { tuned: new Set(), plain: new Set() };
  const probe = (key) => defineTactic({
    id: `probe-${key}`,
    at: {
      levelUp: () => { seen[key].add(LAYOUT_PARAMS.hold); return PASS; },
      // eslint-disable-next-line require-yield
      *arrangeSteps(ctx) { seen[key].add(LAYOUT_PARAMS.hold); const r = yield* ctx.next(); seen[key].add(LAYOUT_PARAMS.hold); return r; },
    },
  });
  const tuned = defineProfile({ id: 'test-tuned', tactics: [probe('tuned'), { tactic: LEGACY_ARRANGE, params: { hold: 9 } }] });
  const plain = defineProfile({ id: 'test-plain', tactics: [probe('plain')] });
  playOut({ mode: 'coop', seats: bots(2), seed: 7, botStrategy: 'legacy', botStrategySeats: { 0: tuned, 1: plain } });
  assert.deepEqual([...seen.tuned], [9]);
  assert.deepEqual([...seen.plain], [LEGACY_TUNABLES.LAYOUT_PARAMS.hold]);
  assert.equal(LAYOUT_PARAMS, LEGACY_TUNABLES.LAYOUT_PARAMS);
});

test('withLegacyTunables: known keys only, and the previous values come back when the call throws', () => {
  const hold = { LAYOUT_PARAMS: Object.freeze({ ...LEGACY_TUNABLES.LAYOUT_PARAMS, hold: 7 }) };
  assert.equal(withLegacyTunables(hold, () => LAYOUT_PARAMS.hold), 7);
  assert.throws(() => withLegacyTunables(hold, () => { throw new Error('boom'); }), /boom/);
  assert.equal(LAYOUT_PARAMS, LEGACY_TUNABLES.LAYOUT_PARAMS);
  assert.throws(() => withLegacyTunables({ NOPE: 1 }, () => 0), /Unknown legacy tunable NOPE/);
  assert.equal(withLegacyTunables(null, () => 'as is'), 'as is');
  assert.throws(() => defineTactic({ id: 'x', at: { levelUp: () => PASS }, tunables: () => ({ NOPE: 1 }) }), /unknown legacy tunable NOPE/);
  assert.throws(() => defineTactic({ id: 'x', at: { levelUp: () => PASS }, tunables: 3 }), /tunables must be a function/);
});

test('profileFromData: tactics by id with checked parameters; legacy implied below', () => {
  const p = profileFromData({ id: 'test-data', tactics: ['level-curve', { tactic: 'legacy-buy', params: { mergeHit: 40 } }] });
  assert.equal(p.id, 'test-data');
  assert.deepEqual(profileOf('test-data').tactics.map((t) => t.tactic), ['level-curve', 'legacy-buy']);
  assert.equal(profileOf('test-data').tunables.MERGE_HIT, 40);
  assert.throws(() => profileFromData({ tactics: ['nope'] }), /unknown tactic "nope"/);
  assert.throws(() => profileFromData({ tactics: [{ tactic: 'legacy-buy', params: { nope: 1 } }] }), /unknown param nope/);
  assert.throws(() => profileFromData({ tactics: [{ tactic: 'legacy-level', params: { maxLevel: 9 } }] }), /within 2\.\.6/);
  assert.throws(() => profileFromData({}), /tactics/);
});
