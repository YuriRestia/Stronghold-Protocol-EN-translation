// (fork) evobot (server/match/botTacticsEvo.js): the weekend evolution race's winner as a room profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT_STRATEGIES, TACTICS, profileFromData } from '../../server/match/botStrategies.js';
import { builtinBotStrategy } from '../../server/match/botStrategyList.js';
import { profileOf, resolveParams } from '../../server/match/botTactics.js';
import { SELL_SINGLES, PLAN_ITEMS } from '../../server/match/botTacticsEvo.js';
import { ROOM_BOTS } from '../../shared/botProfiles.js';
import { makeMatch, checkInvariants } from './harness.js';

// the race's best.json (fish-edition/ai-players/10, "The weekend race")
const BEST = { id: 'evo-99f84d0e339c', tactics: [
  { tactic: 'sell-singles', params: { fromRound: 9, maxTier: 2 } },
  { tactic: 'plan-items', params: { set: 'both', fromRound: 5, reserve: 9 } },
] };

function playOut(botStrategy, seed) {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', fake: true, botStrategy, seed,
    seats: [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }] });
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

test('evobot: registered, in the room list, browser-safe, and the race\'s best.json exactly', () => {
  assert.ok(Object.hasOwn(BOT_STRATEGIES, 'evobot'));
  assert.ok(ROOM_BOTS.some((b) => b.id === 'evobot'));
  assert.equal(builtinBotStrategy('evobot').id, 'evobot');
  assert.equal(TACTICS['sell-singles'], SELL_SINGLES);
  assert.equal(TACTICS['plan-items'], PLAN_ITEMS);
  assert.deepEqual(profileOf('evobot').tactics, BEST.tactics);
  assert.deepEqual(profileOf('evobot').slots, { draft: [], economy: ['sell-singles', 'plan-items'], placement: [] });
  // the same tactics given as data (botbench --profile best.json) define the same profile
  assert.deepEqual(profileOf(profileFromData(BEST).id).tactics, BEST.tactics);
});

test('evobot plays a whole match without errors, deterministically', () => {
  const a = playOut('evobot', 7);
  assert.equal(playOut('evobot', 7), a);
});

test('sell-singles sells the hand\'s low-tier single copies from its round on, after legacy\'s own selling', () => {
  const tier = { t1: 1, t2: 2, t3: 3 };
  const gd = { isGolden: () => false, baseIdOf: (id) => id, tierOf: (id) => tier[id] };
  const hand = [{ kind: 'chess', id: 't1', uid: 1 }, { kind: 'chess', id: 't2', uid: 2 }, { kind: 'chess', id: 't2', uid: 3 },
    { kind: 'chess', id: 't3', uid: 4 }, null, { kind: 'item', id: 'x', uid: 5 }];
  const run = (round) => {
    const sold = []; let handed = false;
    const ps = { gd, hand, allChess: () => hand.filter((p) => p && p.kind === 'chess'), sell: (uid) => { sold.push(uid); return { ok: true }; } };
    SELL_SINGLES.at.sellJunk({ match: { round, gd }, player: ps, args: [], params: resolveParams(SELL_SINGLES, BEST.tactics[0].params),
      state: () => ({}), next: () => { handed = true; } });
    assert.ok(handed, 'legacy sells first');
    return sold;
  };
  assert.deepEqual(run(8), []);
  assert.deepEqual(run(9), [1], 'the pair of t2 and the tier-3 single stay');
});
