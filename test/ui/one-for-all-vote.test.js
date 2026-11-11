// (fork) One for All (Grand Alliance draft mode, crew-docs one-for-all-design.md §2.2 and Q11): the vote draft's client
// helpers (the secret vote state, the held screen, the clock, the tip) and One for All as its own mode on the stats page.
// node --test test/ui/one-for-all-vote.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVote, heldDraftPub } from '../../public/js/ui/gameLogic.js';
import { draftClock, draftSeconds, voteTip } from '../../public/js/screens/bandDraft.js';
import { buildRecord, buildQuitRecord, normalizeRecord, compactRecord, recordToResult, aggregateStats, statsModeOf } from '../../public/js/ui/stats.js';
import { PHASE } from '../../shared/constants.js';

describe('normalizeVote: the secret vote as the client sees it', () => {
  test('outside vote mode: null', () => {
    assert.equal(normalizeVote({ order: ['a'], turn: 'a', picks: {} }, {}, 'a'), null);
    assert.equal(normalizeVote(null, {}, 'a'), null);
  });
  test('the count only, and my own vote from the private state', () => {
    const v = normalizeVote({ mode: 'vote', voters: 8, locked: 3 }, { playerId: 'p1', vote: { bandId: 'band_fang', locked: true } }, 'p1');
    assert.deepEqual(v, { voters: 8, locked: 3, inVote: null, myVote: 'band_fang', myLocked: true, done: false });
  });
  test('voters as playerIds say whether I vote; locked never exceeds voters; all locked = done', () => {
    const v = normalizeVote({ mode: 'vote', voters: ['p1', 'p2'], locked: 5 }, null, 'p3');
    assert.equal(v.voters, 2);
    assert.equal(v.locked, 2);
    assert.equal(v.inVote, false);
    assert.equal(v.done, true);
    assert.equal(normalizeVote({ mode: 'vote', voters: ['p1', 'p2'], locked: 1 }, null, 'p1').inVote, true);
  });
  test('an unlocked highlight is no locked vote; another player\'s private state is ignored', () => {
    assert.equal(normalizeVote({ mode: 'vote', voters: 4, locked: 0 }, { vote: { bandId: 'band_fang', locked: false } }, 'p1').myLocked, false);
    assert.equal(normalizeVote({ mode: 'vote', voters: 4, locked: 1 }, { playerId: 'p2', vote: { bandId: 'band_fang', locked: true } }, 'p1').myVote, null);
  });
});

describe('heldDraftPub in vote mode keeps the vote secret', () => {
  test('the winner in players[].bandId never becomes a pick; the held screen reads every vote in', () => {
    const last = { phase: PHASE.BAND_DRAFT, deadline: 123, players: [{ playerId: 'p1' }, { playerId: 'p2' }],
      draft: { mode: 'vote', voters: 2, locked: 1, turnDeadline: 123 } };
    const pub = { players: [{ playerId: 'p1', bandId: 'band_fang' }, { playerId: 'p2', bandId: 'band_fang' }] };
    const held = heldDraftPub(last, pub);
    assert.equal(held.deadline, 0);
    assert.equal(held.draft.picks, undefined, 'no picks written into the held vote');
    assert.equal(held.draft.locked, 2);
    assert.equal(normalizeVote(held.draft, null, 'p1').done, true);
  });
  test('the co-op draft still fills the picks from the players (unchanged)', () => {
    const held = heldDraftPub({ players: [], draft: { order: ['p1'], picks: {} } }, { players: [{ playerId: 'p1', bandId: 'band_fang' }] });
    assert.equal(held.draft.picks.p1, 'band_fang');
  });
});

describe('the vote clock and tip', () => {
  test('one clock: m.public.deadline, its length from voteSeconds else turnSeconds', () => {
    assert.deepEqual(draftClock({ deadline: 5000, draft: { mode: 'vote', voters: 8, locked: 0, turnSeconds: 50 } }), { deadline: 5000, total: 50 });
    assert.equal(draftSeconds({ mode: 'vote', voteSeconds: 45, turnSeconds: 50 }), 45);
    assert.equal(draftSeconds({ turnSeconds: 50, voteSeconds: 45 }), 50, 'voteSeconds is read in vote mode only');
    assert.equal(draftClock({ deadline: 5000, draft: { mode: 'vote', untimed: true } }), null);
  });
  test('the tip names the highlighted strategy, else the random vote; untimed names no clock', () => {
    assert.match(voteTip({ timed: true, autoName: '华法琳' }), /确认后投票即锁定.*超时将投给当前选中的「华法琳」/);
    assert.match(voteTip({ timed: true }), /超时未选中策略将随机投票/);
    assert.match(voteTip({ timed: false }), /本局不限时/);
    assert.equal(voteTip({ timed: true, autoName: 'x', locked: true }), '得票最多的策略将由全体博士共同使用');
  });
});

function result(over = {}) {
  return {
    victory: true, roundsPassed: 14, modeId: 'mode_multi_2', difficulty: 'NORMAL', seed: 7, durationMs: 1000,
    players: [{ playerId: 'p1', seat: 0, name: 'A', isBot: false, alive: true, victory: true, roundsPassed: 14, bandId: 'band_fang', trophies: 20, stats: {} }],
    ...over,
  };
}

describe('stats: One for All is its own mode (Q11)', () => {
  test('the server\'s mode becomes the record\'s flag, kept through compaction and back to the result', () => {
    const rec = buildRecord(result({ mode: 'oneForAll' }), { myId: 'p1', roomMode: 'coop', now: 1 });
    assert.equal(rec.oneForAll, true);
    assert.equal(rec.roomMode, 'coop', 'still a co-op room (trophies count as before)');
    assert.equal(statsModeOf(rec), 'oneForAll');
    assert.equal(compactRecord(rec).oneForAll, true);
    assert.equal(recordToResult(rec).mode, 'oneForAll');
    assert.equal(buildRecord(result(), { myId: 'p1', roomMode: 'coop', oneForAll: true, now: 1 }).oneForAll, true, 'the room switch counts too');
  });
  test('an ordinary record carries no flag; only the literal true is kept', () => {
    const rec = buildRecord(result(), { myId: 'p1', roomMode: 'coop', now: 1 });
    assert.equal('oneForAll' in rec, false);
    assert.equal(statsModeOf(rec), 'coop');
    assert.equal('oneForAll' in normalizeRecord({ ...rec, oneForAll: 'yes' }), false);
    assert.equal(recordToResult(rec).mode, undefined);
  });
  test('aggregates: One for All counts in its own row, not in co-op; trophies still count', () => {
    const recs = [
      buildRecord(result({ mode: 'oneForAll', seed: 1 }), { myId: 'p1', roomMode: 'coop', now: 3 }),
      buildRecord(result({ seed: 2 }), { myId: 'p1', roomMode: 'coop', now: 2 }),
      buildRecord(result({ seed: 3, modeId: 'mode_single_2' }), { myId: 'p1', roomMode: 'solo', now: 1 }),
    ];
    const agg = aggregateStats(recs);
    assert.equal(agg.byMode.oneForAll.games, 1);
    assert.equal(agg.byMode.oneForAll.wins, 1);
    assert.equal(agg.byMode.coop.games, 1);
    assert.equal(agg.byMode.solo.games, 1);
    assert.equal(agg.trophies, 40);
  });
  test('a match left early during the vote is recorded as One for All', () => {
    const state = {
      me: { playerId: 'p1' }, room: { code: 'R1', mode: 'coop', oneForAll: true },
      match: { result: null, public: { phase: PHASE.BAND_DRAFT, round: 0, modeId: 'mode_multi_2', players: [{ playerId: 'p1', seat: 0, alive: true }],
        draft: { mode: 'vote', voters: 8, locked: 2 } } },
    };
    const live = { active: true, test: false, startedAt: 1, sawStart: true, aliveRound: null };
    assert.equal(buildQuitRecord(state, { live, now: 10 }).oneForAll, true);
    const plain = { ...state, room: { code: 'R1', mode: 'coop' }, match: { ...state.match, public: { ...state.match.public, draft: { order: ['p1'] } } } };
    assert.equal('oneForAll' in buildQuitRecord(plain, { live, now: 10 }), false);
  });
});
