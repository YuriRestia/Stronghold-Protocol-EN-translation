// test/matchmaker.test.js — server/matchmaker.js planMerges (DESIGN §90).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { planMerges, isMatchable, groupReady, roomSize } from '../server/matchmaker.js';
import { MAX_SEATS } from '../shared/constants.js';

let n = 0;
/** A fake lobby room: `humans` humans (the first is host, the rest ready), `bots` AI seats. */
function room({ humans = 1, bots = 0, difficulty = 'NORMAL', since = 0, searching = true, ready = true, connected = true, mode = 'coop' } = {}) {
  const code = `R${String(n++).padStart(3, '0')}`;
  const seats = new Array(MAX_SEATS).fill(null);
  let i = 0;
  for (let h = 0; h < humans; h++, i++) seats[i] = { seat: i, playerId: `${code}_h${h}`, isBot: false, left: false, ready: h === 0 ? false : ready, connected };
  for (let b = 0; b < bots; b++, i++) seats[i] = { seat: i, playerId: `${code}_b${b}`, isBot: true, left: false, ready: true, connected: true };
  return { code, mode, difficulty, searching, searchSince: since, hostId: humans ? `${code}_h0` : null, seats, match: null, disposed: false };
}
const sizes = (p) => [p.target, ...p.sources].map(roomSize);

describe('matchmaker planner', () => {
  test('eligibility: co-op, searching, 1–3 seats, everyone but the host ready and connected', () => {
    assert.equal(isMatchable(room()), true);
    assert.equal(isMatchable(room({ humans: 2, bots: 1 })), true);
    assert.equal(isMatchable(room({ humans: 2, bots: 2 })), false, 'full');
    assert.equal(isMatchable(room({ searching: false })), false);
    assert.equal(isMatchable(room({ mode: 'solo' })), false);
    assert.equal(isMatchable(room({ humans: 2, ready: false })), false, 'a pre-made member is not ready: paused');
    assert.equal(isMatchable(room({ humans: 2, connected: false })), false, 'someone dropped: paused');
    assert.equal(groupReady(room({ humans: 1 })), true, 'the host never needs ready');
    assert.equal(isMatchable({ ...room(), match: {} }), false);
  });

  test('exact fills: 3+1, 2+2, 2+1+1, 1+1+1+1', () => {
    for (const parts of [[3, 1], [2, 2], [2, 1, 1], [1, 1, 1, 1]]) {
      const rooms = parts.map((h) => room({ humans: h }));
      const plans = planMerges(rooms, 0, { partialMergeAfterMs: 0 });
      assert.equal(plans.length, 1, String(parts));
      assert.equal(plans[0].fills, true);
      assert.equal(sizes(plans[0]).reduce((a, b) => a + b), MAX_SEATS);
      assert.equal(roomSize(plans[0].target), Math.max(...parts), 'the biggest group is the target');
    }
  });

  test('AI seats count as filled: 1 human + 2 AI takes only one more player', () => {
    const withBots = room({ humans: 1, bots: 2 });
    const solo1 = room({ since: 5 });
    const pair = room({ humans: 2, since: 1 });
    const plans = planMerges([withBots, pair, solo1], 10, { partialMergeAfterMs: 0 });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].target, withBots);
    assert.deepEqual(plans[0].sources, [solo1]);
  });

  test('only the same difficulty merges', () => {
    const plans = planMerges([room({ humans: 3 }), room({ difficulty: 'HARD' })], 0, { partialMergeAfterMs: 0 });
    assert.deepEqual(plans, []);
  });

  test('the longest search goes first among equal groups', () => {
    const a = room({ since: 30 });
    const b = room({ since: 10 });
    const c = room({ since: 20 });
    const trio = room({ humans: 3, since: 40 });
    const plans = planMerges([a, b, c, trio], 50, { partialMergeAfterMs: 0 });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].target, trio);
    assert.deepEqual(plans[0].sources, [b], 'the oldest single searcher fills the trio');
  });

  test('partial merges only after the delay, never reaching a full room', () => {
    const a = room({ since: 0 });
    const b = room({ since: 0 });
    assert.deepEqual(planMerges([a, b], 5_000, { partialMergeAfterMs: 10_000 }), []);
    const plans = planMerges([a, b], 10_000, { partialMergeAfterMs: 10_000 });
    assert.equal(plans.length, 1);
    assert.equal(plans[0].fills, false);
    assert.equal(sizes(plans[0]).reduce((x, y) => x + y), 2);
    assert.deepEqual(planMerges([a, b], 99_999, { partialMergeAfterMs: 0 }), [], '0 = exact fills only');
  });

  test('randomised: every room appears in at most one plan, whole, and no plan overfills', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let round = 0; round < 300; round++) {
      const rooms = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => {
        const humans = 1 + Math.floor(rnd() * 3);
        return room({ humans, bots: Math.floor(rnd() * (MAX_SEATS - humans)), since: Math.floor(rnd() * 20_000),
          difficulty: rnd() < 0.5 ? 'NORMAL' : 'HARD', ready: rnd() < 0.9 });
      });
      const seen = new Set();
      for (const p of planMerges(rooms, 20_000, { partialMergeAfterMs: 10_000 })) {
        const all = [p.target, ...p.sources];
        for (const r of all) { assert.ok(!seen.has(r), 'a room in two plans'); seen.add(r); assert.ok(isMatchable(r)); }
        assert.ok(all.every((r) => r.difficulty === p.target.difficulty));
        const total = sizes(p).reduce((a, b) => a + b);
        assert.ok(p.fills ? total === MAX_SEATS : total < MAX_SEATS, `total ${total}`);
      }
    }
  });
});
