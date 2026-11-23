// test/match/auto-award.test.js — (fork, GitHub #125) the autoAward lobby rule: Risk tags the room did not take are
// added at the end when the match shows they changed nothing (shared/autoAward.js, server/match/autoAward.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { ruleLabels, RULES } from '../../shared/rules.js';
import { strategyLateBandIds } from '../../shared/ruleData.js';
import { awardedTags, AWARDABLE, AWARD_CONDITIONS, isAwardable } from '../../shared/autoAward.js';
import { makeMatch } from './harness.js';
import fs from 'node:fs';

const ON = { autoAward: true };

test('awardedTags: only with the rule on; untaken tags; the highest level whose conditions all held', () => {
  const none = new Set();
  assert.deepEqual(awardedTags({}, none, { aiSeats: false }), {}, 'rule off: nothing');
  const PHASE1 = { ccInvestorBench: 2, ccSwift: 1, ccForesight: 1, ccStrategyLate: 2 };
  assert.deepEqual(awardedTags(ON, none, { aiSeats: false }),
    { ...PHASE1, ccTier1Price: 1, ccUpgrade: 2, ccLastLine: 1, ccJunk: 1 }, 'nothing broken, no AI seats: every awardable tag, top level');
  assert.deepEqual(awardedTags(ON, none, { aiSeats: true }), PHASE1, 'AI seats: only the versions marked aiOk');
  assert.deepEqual(awardedTags(ON, new Set(['barge', 'junk']), { aiSeats: false }),
    { ...PHASE1, ccTier1Price: 1, ccLastLine: 1 }, 'Barge 1 and 2 share one condition; Junk 2 is never awarded');
  assert.deepEqual(awardedTags({ ...ON, ccSwift: 1, ccStrategyLate: 1 }, none, { aiSeats: true }),
    { ccInvestorBench: 2, ccForesight: 1 }, 'a taken tag (any level) is not awarded or raised');
  assert.deepEqual(awardedTags(ON, new Set(['investorOps', 'strategy2', 'foresight']), { aiSeats: true }),
    { ccInvestorBench: 1, ccSwift: 1, ccStrategyLate: 1 }, 'a level drops to the one whose conditions held');
  assert.deepEqual(awardedTags(ON, new Set(['investor', 'strategy1', 'swift', 'foresight']), { aiSeats: true }), {},
    'a stacking tag needs its lower levels: no Investor 2 without Investor 1');
});

test('the awardable list: real tag versions, every condition has a text, ruleLabels counts awarded Risk', () => {
  const byKey = new Map(RULES.map((r) => [r.key, r]));
  for (const a of AWARDABLE) {
    const r = byKey.get(a.key);
    assert.ok(r && r.category === 'risk' && a.level < r.risk.length, `${a.key} ${a.level}`);
    for (const c of a.needs) assert.ok(AWARD_CONDITIONS[c], c);
  }
  assert.ok(isAwardable('ccSwift', 1) && !isAwardable('ccBoss', 1));
  assert.equal(byKey.get('autoAward')?.category, 'neutral', 'not a cheat');
  assert.deepEqual(ruleLabels({ ...ON, ccBoss: 2 }, { ccSwift: 1, ccInvestorBench: 2 }), { cheats: false, seeded: false, risk: 2 + 1 + 2 });
  assert.deepEqual(ruleLabels(ON), { cheats: false, seeded: false, risk: 0 });
});

test('Strategy 1 affects the 13 Strategies of the tag spec (named rounds, not the periodic one)', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../../data/bands.json', import.meta.url)));
  const ids = strategyLateBandIds(raw.bands || raw);
  assert.equal(ids.length, 13);
  assert.ok(!ids.includes('band_damaztic'), 'by period: not affected');
});

/** A solo match driven to its end with nobody acting: the result and the awards. */
function idleMatch(lobbyRules) {
  const h = makeMatch({ mode: 'solo', seed: 5, lobbyRules }).start();
  h.drive(() => h.m.phase === PHASE.RESULT);
  const out = { outcome: { ...h.m.outcome }, rounds: h.m.round, awarded: h.m.awarded, pub: h.m.publicView(), result: h.m.lastResultMsg };
  h.m.dispose();
  return out;
}

test('a match plays the same with the rule on or off, and an idle game earns the tags it never touched', () => {
  const off = idleMatch({});
  const on = idleMatch(ON);
  assert.deepEqual(on.outcome, off.outcome, 'the watchers change nothing');
  assert.equal(on.rounds, off.rounds);
  assert.equal(off.awarded ?? null, null, 'rule off: no awards');
  assert.ok(on.awarded && on.awarded.ccSwift === 1, `Swift never active: awarded (${JSON.stringify(on.awarded)})`);
  assert.equal(on.awarded.ccForesight, 1, 'no Foresight operator fought');
  assert.deepEqual(on.pub.awarded, on.awarded, 'the end screen reads them from m.public');
  assert.deepEqual(on.result.awarded, on.awarded, 'and from m.result');
});

test('a real field with a Foresight operator and an active Swift breaks both', async () => {
  const { noteBattle, finishAwards } = await import('../../server/match/autoAward.js');
  const h = makeMatch({ mode: 'solo', seed: 5, lobbyRules: ON }).start();
  h.toPrep(1);
  const visi = Object.entries(h.m.gd.raw.chess).find(([, c]) => Array.isArray(c.bonds) && c.bonds.includes('visiShip'))[0];
  noteBattle(h.m, { players: [{ units: [{ chessId: visi }], bonds: { swiftShip: { active: true } } }] });
  const a = finishAwards(h.m) || {};
  assert.equal(a.ccForesight, undefined);
  assert.equal(a.ccSwift, undefined);
  h.m.dispose();
});

test('phase 2 watchers: a late tier-1 buy, a level-5 Dispatch Center, a full hand, Last Line\'s extra LP', async () => {
  const { noteBuy, noteLevel, noteHand, noteSettle, noteTeamLp } = await import('../../server/match/autoAward.js');
  const h = makeMatch({ mode: 'solo', seed: 5, lobbyRules: ON }).start();
  h.toPrep(1);
  const m = h.m; const ps = [...m.players.values()][0];
  const tier = (t) => Object.keys(m.gd.raw.chess).find((id) => m.gd.tierOf(id) === t);
  const broken = () => new Set(m._awardBroken || []);
  noteBuy(m, ps, tier(1));
  assert.ok(!broken().has('intern'), 'round 1: tier-1 buys cost the same');
  m.round = 3; noteBuy(m, ps, tier(2));
  assert.ok(!broken().has('intern'), 'round 3: a tier-2 buy is not affected');
  noteBuy(m, ps, tier(1));
  assert.ok(broken().has('intern'), 'round 3: a tier-1 buy breaks Intern');
  ps.shop.level = 4; noteLevel(m, ps); assert.ok(!broken().has('barge'));
  ps.shop.level = 5; noteLevel(m, ps); assert.ok(broken().has('barge'), 'level 5 breaks Barge');
  const hand = ps.hand; ps.hand = hand.map(() => null); ps.hand[0] = { kind: 'item', id: 'x' };
  noteHand(m, ps); assert.ok(!broken().has('junk'), 'a free slot left');
  ps.hand = ps.hand.map(() => ({ kind: 'item', id: 'x' })); noteHand(m, ps);
  assert.ok(broken().has('junk'), 'a full hand breaks Junk 1');
  ps.hand = hand;
  const lp = ps.lp;
  ps.lp = 10; noteSettle(m, ps, true); noteSettle(m, ps, false); noteSettle(m, ps, true);
  assert.ok(!broken().has('lastLine'), '10 LP less 4 extra: still alive');
  ps.lp = 4; noteSettle(m, ps, false);
  assert.ok(broken().has('lastLine'), '4 LP less 4 extra: eliminated');
  m._awardBroken.delete('lastLine'); m.teamLp = 5; noteTeamLp(m);
  assert.ok(!broken().has('lastLine'), 'team LP 5 less 4: the boss fight goes on');
  m.teamLp = 4; noteTeamLp(m);
  assert.ok(broken().has('lastLine'), 'team LP 4 less 4: it would have ended');
  ps.lp = lp;
  h.m.dispose();
});

test('an idle solo game without AI seats also earns Intern, Barge 2 and Junk 1 (nothing bought, levelled or held)', () => {
  const on = idleMatch(ON);
  assert.equal(on.awarded.ccTier1Price, 1);
  assert.equal(on.awarded.ccUpgrade, 2);
  assert.equal(on.awarded.ccJunk, 1);
});

test('the "why not" notes: each untaken, unawarded version with its first break (round, operator) or the AI-seat reason', async () => {
  const { awardNotes } = await import('../../shared/autoAward.js');
  const why = { swift: { r: 6 }, investorOps: { r: 4, id: 'chess_char_6_11_a' }, strategy1: { r: null, id: 'band_mlyss' } };
  const notes = awardNotes({ ...ON, ccJunk: 1 }, { ccInvestorBench: 1, ccForesight: 1 }, why, { aiSeats: true });
  const by = Object.fromEntries(notes.map((n) => [`${n.key}${n.level}`, n]));
  assert.deepEqual(by.ccInvestorBench2.broken, [{ c: 'investorOps', r: 4, id: 'chess_char_6_11_a' }], 'Investor 1 awarded: only level 2 explained');
  assert.ok(!by.ccInvestorBench1 && !by.ccForesight1, 'awarded versions are not listed');
  assert.deepEqual(by.ccSwift1.broken, [{ c: 'swift', r: 6 }]);
  assert.deepEqual(by.ccStrategyLate2.broken, [{ c: 'strategy1', r: null, id: 'band_mlyss' }]);
  assert.ok(by.ccTier1Price1.ai && by.ccTier1Price1.broken.length === 0, 'AI seats: the reason is the seats');
  assert.ok(!by.ccJunk1, 'a taken tag is not listed');
  assert.deepEqual(awardNotes({}, {}, why, { aiSeats: false }), [], 'rule off: nothing');
  const idle = idleMatch(ON);
  assert.deepEqual(idle.pub.awardNotes ?? null, idle.result.awardNotes ?? null, 'the result and the public view carry the same notes');
});
