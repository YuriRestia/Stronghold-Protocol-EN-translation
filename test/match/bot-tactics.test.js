// (fork) Tactics and profiles (server/match/botTactics.js, botTacticsBasic.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_BOT } from '../../server/match/botStrategyContract.js';
import { BOT_STRATEGIES } from '../../server/match/botStrategies.js';
import { PASS, DECISION_POINTS, defineTactic, defineProfile, profileOf, resolveParams } from '../../server/match/botTactics.js';
import { LEVEL_CURVE, BUY_TIER, TAKE_PATRIOT } from '../../server/match/botTacticsBasic.js';
import { makeMatch, checkInvariants } from './harness.js';

const soloBot = (opts = {}) => makeMatch({ mode: 'solo', difficulty: 'NORMAL', fake: true,
  seats: [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }], ...opts });

/** A tactic on every decision point that only counts the asks and passes. */
function passEverywhere(calls) {
  const at = {};
  for (const [point, dp] of Object.entries(DECISION_POINTS)) {
    // eslint-disable-next-line require-yield
    at[point] = dp.gen ? function* () { calls[point] = (calls[point] || 0) + 1; return PASS; }
      : () => { calls[point] = (calls[point] || 0) + 1; return PASS; };
  }
  return defineTactic({ id: 'pass-all', at });
}

/** What a whole fake-battle solo match left: the result and the seat's end state. */
function playOut(botStrategy, seed) {
  const h = soloBot({ botStrategy, seed });
  try {
    h.start();
    const ended = h.runToEnd();
    const ps = h.m.order[0];
    checkInvariants(h.m);
    assert.deepEqual(h.logs.error, []);
    return JSON.stringify({ ended, round: h.m.round, lp: ps.lp, funds: ps.funds, level: ps.shop.level,
      units: ps.allChess().map((p) => `${p.id}@${p.area}:${p.key ?? ''}`).sort(), stats: ps.stats });
  } finally { h.m.dispose(); }
}

test('definitions: ids, decision points, generator kinds, parameter declarations and values fail early', () => {
  assert.throws(() => defineTactic({ id: 'legacy', at: { levelUp: () => PASS } }), /bad id/);
  assert.throws(() => defineTactic({ id: 'Bad', at: { levelUp: () => PASS } }), /bad id/);
  assert.throws(() => defineTactic({ id: 'x', at: {} }), /at least one decision point/);
  assert.throws(() => defineTactic({ id: 'x', at: { buy: () => PASS } }), /unknown decision point buy/);
  assert.throws(() => defineTactic({ id: 'x', at: { arrangeSteps: () => PASS } }), /arrangeSteps needs a generator function/);
  // eslint-disable-next-line require-yield
  assert.throws(() => defineTactic({ id: 'x', at: { levelUp: function* () { return PASS; } } }), /levelUp needs a function/);
  assert.throws(() => defineTactic({ id: 'x', extra: 1, at: { levelUp: () => PASS } }), /unknown field extra/);
  assert.throws(() => defineTactic({ id: 'x', params: { n: { type: 'int', min: 0, max: 3, default: 5 } }, at: { levelUp: () => PASS } }), /within 0\.\.3/);
  assert.throws(() => defineTactic({ id: 'x', params: { n: { type: 'float', default: 1 } }, at: { levelUp: () => PASS } }), /type must be/);
  assert.throws(() => defineTactic({ id: 'x', params: { c: { type: 'choice', choices: [], default: 'a' } }, at: { levelUp: () => PASS } }), /choices required/);
  assert.deepEqual(resolveParams(LEVEL_CURVE), { scale: 'boss', shift: 0, maxLevel: 5, reserve: 0 });
  assert.deepEqual(resolveParams(LEVEL_CURVE, { shift: 2 }).shift, 2);
  assert.throws(() => resolveParams(LEVEL_CURVE, { shift: 1.5 }), /shift must be an integer/);
  assert.throws(() => resolveParams(LEVEL_CURVE, { scale: 'x' }), /one of round, boss/);
  assert.throws(() => resolveParams(LEVEL_CURVE, { nope: 1 }), /unknown param nope/);
  assert.throws(() => defineProfile({ id: 'p', tactics: [{ levelUp: () => PASS }] }), /entry 0 is not a defined tactic/);
  assert.throws(() => defineProfile({ id: 'p', tactics: [{ tactic: BUY_TIER, params: { minTier: 7 } }] }), /within 3\.\.6/);
  assert.ok(Object.isFrozen(LEVEL_CURVE) && Object.isFrozen(LEVEL_CURVE.params) && Object.isFrozen(LEVEL_CURVE.at));
});

test('a profile whose tactics take no decision point is legacy itself; one point taken leaves the others legacy', () => {
  const empty = defineProfile({ id: 'empty' });
  for (const hook of ['pickBand', 'pickCard', 'prepBegin', 'prepEnd', 'bountyKillChance']) assert.equal(empty[hook], LEGACY_BOT[hook], hook);
  const bandOnly = defineProfile({ id: 'band-only', tactics: [defineTactic({ id: 't', at: { pickBand: () => PASS } })] });
  assert.notEqual(bandOnly.pickBand, LEGACY_BOT.pickBand);
  for (const hook of ['pickCard', 'prepBegin', 'prepEnd', 'bountyKillChance']) assert.equal(bandOnly[hook], LEGACY_BOT[hook], hook);
  assert.deepEqual(profileOf(empty), { tunables: null, tactics: [], slots: { draft: [], economy: [], placement: [] } });
  assert.equal(profileOf(LEGACY_BOT), null);
});

test('chains: top first, PASS asks the next, a result stops the chain, next() hands on with the same or new arguments', () => {
  const order = [];
  const a = defineTactic({ id: 'a', at: { pickCard: () => { order.push('a'); return PASS; } } });
  const b = defineTactic({ id: 'b', params: { pick: { type: 'int', min: 0, max: 9, default: 0 } },
    at: { pickCard: (ctx) => { order.push('b'); return ctx.params.pick === 9 ? PASS : ctx.args[1][ctx.params.pick]; } } });
  const c = defineTactic({ id: 'c', at: { pickCard: (ctx) => { order.push('c'); return ctx.next(ctx.args[0], ctx.args[1].slice(1)); } } });
  const p1 = defineProfile({ id: 'p1', tactics: [a, { tactic: b, params: { pick: 1 } }, c] });
  assert.equal(p1.pickCard(null, null, [], [10, 11, 12]), 11);
  assert.deepEqual(order, ['a', 'b']);
  order.length = 0;
  // b passes (pick 9), c hands legacy's own picker a shorter list: here a stand-in bottom, through a nested profile
  const inner = defineTactic({ id: 'inner', at: { pickCard: (ctx) => ctx.args[1][0] } });
  const p2 = defineProfile({ id: 'p2', tactics: [a, { tactic: b, params: { pick: 9 } }, c, inner] });
  assert.equal(p2.pickCard(null, null, [], [10, 11, 12]), 11);
  assert.deepEqual(order, ['a', 'b', 'c']);
  // per-seat state is the entry's own, kept on neither the definition nor the player object
  const counter = defineTactic({ id: 'count', at: { pickCard: (ctx) => { const s = ctx.state(); s.n = (s.n || 0) + 1; return s.n; } } });
  const p3 = defineProfile({ id: 'p3', tactics: [counter, counter] });
  const ps1 = {}, ps2 = {};
  assert.deepEqual([p3.pickCard(null, ps1, [], [0]), p3.pickCard(null, ps1, [], [0]), p3.pickCard(null, ps2, [], [0])], [1, 2, 1]);
  assert.deepEqual(Object.keys(ps1), []);
  assert.deepEqual(profileOf('p3').tactics.map((t) => t.tactic), ['count', 'count']);
});

test('a profile whose tactics pass at every point plays a whole match exactly like legacy', () => {
  const calls = {};
  const passing = defineProfile({ id: 'passing', tactics: [passEverywhere(calls)] });
  for (const seed of [3, 11]) assert.equal(playOut(passing, seed), playOut('legacy', seed), `seed ${seed}`);
  // every point was asked, and the prep points as often as legacy's prep calls them
  for (const point of Object.keys(DECISION_POINTS)) {
    if (point === 'bountyKillChance' || point === 'pickCard') continue; // no bounty estimate / 机变 draft on a fake solo NORMAL
    assert.ok(calls[point] > 0, point);
  }
});

test('the registered profiles: opt-in ids, slot views, and their tactics act through the game\'s own intents', () => {
  assert.deepEqual(Object.keys(BOT_STRATEGIES).filter((id) => id.startsWith('fish-')), ['fish-level', 'fish-tier6', 'fish-patriot']);
  assert.deepEqual(profileOf('fish-tier6'), {
    tunables: null,
    tactics: [{ tactic: 'buy-tier', params: { minTier: 6, reserve: 0 } }, { tactic: 'level-curve', params: { scale: 'boss', shift: 0, maxLevel: 6, reserve: 0 } }],
    slots: { draft: [], economy: ['buy-tier', 'level-curve'], placement: [] },
  });
  const h = soloBot({ botStrategy: 'fish-level' }).start().toPrep(), { m } = h, ps = m.order[0];
  try {
    // round 9 of a 14-round mode: the curve wants level 5 (legacy's own wants it too); funds for every step
    m.round = 9;
    ps.funds = 200;
    const before = ps.shop.level;
    const levelUp = LEVEL_CURVE.at.levelUp;
    let handed = false;
    levelUp({ match: m, player: ps, args: [], params: resolveParams(LEVEL_CURVE), state: () => ({}), next: () => { handed = true; } });
    assert.ok(ps.shop.level >= Math.max(before, 5), `level ${ps.shop.level}`);
    assert.ok(handed, "legacy's level-ups follow");
    checkInvariants(m);
  } finally { m.dispose(); }
});

test('take-patriot: the round-9 Improv\'s Patriot card (ccPatriot Undying 1) is picked whenever offered; any other draft is legacy\'s', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 1 } });
  try {
    const { m } = h;
    m.round = 9;
    m.enterSpDraft();
    const cards = m.sp.cards;
    const idx = cards.findIndex((c) => c.id === 'risk:patriot');
    assert.ok(idx >= 0, 'offered');
    const ps = m.order[0];
    const all = cards.map((_, i) => i);
    assert.equal(BOT_STRATEGIES['fish-patriot'].pickCard(m, ps, cards, all), idx);
    const at = (available) => TAKE_PATRIOT.at.pickCard({ args: [cards, available] });
    assert.equal(at(all.filter((i) => i !== idx)), PASS, 'taken by someone else: legacy picks');
    assert.equal(at([idx]), idx);
  } finally { h.m.dispose(); }
});
