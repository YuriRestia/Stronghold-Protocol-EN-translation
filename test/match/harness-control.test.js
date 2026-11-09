// The browser-test harness controls (test/e2e/harnessControl.mjs): end the timed phase now, hold / release a battle.
// They take the real paths (the deadline's own callback through the scheduler; the solo pause's freeze and resume), and
// a production match or server has none of them: they live only in test/e2e/fastServer.mjs, answered over its IPC
// channel, so no socket and no player can reach them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PHASE, ERR } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { Match } from '../../server/match/Match.js';
import { RESULT_GRACE_MS } from '../../server/match/fields.js';
import { harnessMatchClass, endPhaseNow, holdBattle, releaseBattle, handleHarnessMessage, HARNESS_MSG, HARNESS_CMDS } from '../e2e/harnessControl.mjs';
import { makeMatch, give, chessOfTier } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HarnessMatch = harnessMatchClass(Match);
const pub = (h) => { h.m.flush(true); return h.lastBc('m.public'); };
const coop = (seed, MatchClass = HarnessMatch) => makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed, fake: true, clientCombat: true, clients: false, instant: false, MatchClass }).start();

test('end phase: the briefing deadline\'s own callback, through the scheduler — the same next phase as the expired timer', () => {
  const natural = coop(7101);
  const ended = coop(7101);
  for (const h of [natural, ended]) assert.equal(h.m.phase, PHASE.INFO_CHECK, 'co-op briefing: a timed phase');
  // the timer runs out
  natural.sched.advance(Math.max(0, natural.m.deadline - natural.sched.now()) + 1);
  // a page that has not seen the next phase yet never ends the one after it
  assert.deepEqual([endPhaseNow(ended.m, PHASE.SETTLE).code, ended.m.phase], ['WRONG_PHASE', PHASE.INFO_CHECK]);
  // the harness ends it at once
  const r = endPhaseNow(ended.m, PHASE.INFO_CHECK);
  assert.deepEqual([r.ok, r.from], [true, PHASE.INFO_CHECK]);
  assert.equal(ended.m.phase, PHASE.INFO_CHECK, 'nothing runs inline: the callback is scheduled like the timer');
  ended.sched.advance(0);
  assert.equal(ended.m.phase, natural.m.phase, 'the same phase follows');
  assert.equal(ended.m.round, natural.m.round);
  assert.notEqual(ended.m.phase, PHASE.INFO_CHECK);
  assert.ok(ended.sched.now() < natural.sched.now(), 'without waiting for the deadline');
  for (const h of [natural, ended]) { assert.equal(h.m.errorCount, 0); h.m.dispose(); }
});

test('end phase: refused without an armed deadline (a battle ends by its fields, never by this)', () => {
  const h = coop(7102);
  assert.ok(h.drive(() => h.m.phase === PHASE.COMBAT));
  const r = endPhaseNow(h.m);
  assert.deepEqual([r.ok, r.code, r.phase], [false, 'NO_DEADLINE', PHASE.COMBAT]);
  assert.equal(h.m.phase, PHASE.COMBAT);
  h.m.dispose();
});

test('hold: a co-op battle freezes like the solo pause, published as m.public.hold (no paused plate); release shifts every clock', () => {
  const h = coop(7103);
  const m = h.m;
  assert.ok(h.drive(() => m.phase === PHASE.COMBAT));
  const f = m.fields.find((x) => x.mode === 'client');
  assert.ok(f, 'a client-run field');
  const deadline0 = m.deadline;
  const due0 = f.startAt + Math.round((f.spec.timeLimit / m.gameSpeed) * 1000) + RESULT_GRACE_MS;
  h.sched.advance(2000);
  assert.equal(releaseBattle(m).code, 'NOT_HELD');
  assert.deepEqual([holdBattle(m).ok, m.paused, m.pauseQuiet], [true, true, true]);
  assert.equal(holdBattle(m).code, 'HELD');
  const p = pub(h);
  assert.deepEqual([p.paused, p.hold], [false, true], 'the pages freeze their clocks without the 暂停中 plate');
  const el = m._fieldElapsed(f);
  const HOLD = 10 * 60 * 1000;
  h.sched.advance(HOLD);
  assert.equal(m.phase, PHASE.COMBAT);
  assert.deepEqual([f.mode, f.done], ['client', false], 'no takeover while held (its deadline passed long ago)');
  assert.equal(m._fieldElapsed(f), el, 'the field clock stood still');
  assert.equal(releaseBattle(m).ok, true);
  const q = pub(h);
  assert.deepEqual([q.paused, 'hold' in q], [false, false]);
  assert.equal(q.deadline, deadline0 + HOLD, 'the countdown moved on by the hold');
  h.sched.advance(due0 + HOLD - h.sched.now() - 50);
  assert.equal(f.mode, 'client', 'the result deadline moved by the hold');
  h.sched.advance(100);
  assert.equal(f.mode, 'server', 'then the silent client is taken over, as without a hold');
  assert.equal(m.errorCount, 0);
  m.dispose();
});

test('hold: a 联防 (UNITE) battle freezes and resumes the same way', () => {
  const h = makeMatch({ mode: 'coop', humans: 3, seed: 9111, fake: true, clientCombat: true, clients: false, MatchClass: HarnessMatch,
    script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 4 } } : {}) }).start();
  const m = h.m;
  h.toPrep(1);
  const ps1 = h.ps('p_1');
  const id = chessOfTier(1, (c) => c.position === 'MELEE').find((x) => m.pool.has(x));
  give(m, ps1, id, 'board', [...ps1.deployMap()].find(([, v]) => v === 'melee')[0].split(',').map(Number));
  assert.ok(h.drive(() => m.phase === PHASE.UNITE));
  const f = m.fields.find((x) => x.fieldId === 'u');
  assert.ok(f && !f.done);
  assert.equal(holdBattle(m).ok, true);
  assert.equal(pub(h).hold, true);
  const el = m._fieldElapsed(f);
  h.sched.advance(10 * 60 * 1000);
  assert.deepEqual([m.phase, f.done, m._fieldElapsed(f)], [PHASE.UNITE, false, el], 'the 联防 field stood still');
  assert.equal(releaseBattle(m).ok, true);
  assert.equal(m.paused, false);
  assert.equal(m.errorCount, 0);
  m.dispose();
});

test('hold: refused outside a battle and over a real solo pause; the battle phase ending drops it', () => {
  const h = coop(7104);
  assert.equal(h.m.phase, PHASE.INFO_CHECK);
  assert.deepEqual([holdBattle(h.m).ok, h.m.paused, h.m.pauseQuiet], [false, false, false], 'no battle running');
  assert.ok(h.drive(() => h.m.phase === PHASE.COMBAT));
  assert.equal(holdBattle(h.m).ok, true);
  h.m._clearPause(); // what the battle phase ending calls
  assert.deepEqual([h.m.paused, h.m.pauseQuiet, 'hold' in pub(h)], [false, false, false]);
  h.m.dispose();

  const solo = makeMatch({ mode: 'solo', difficulty: 'FUNNY', humans: 1, seed: 7105, fake: true, clientCombat: true, clients: false, instant: false, MatchClass: HarnessMatch }).start();
  assert.ok(solo.drive(() => solo.m.phase === PHASE.COMBAT));
  assert.deepEqual(solo.m.handle('p_0', { t: 'g.pause', on: true }), { ok: true });
  assert.equal(holdBattle(solo.m).code, 'PAUSED', 'a player\'s pause is not taken over');
  assert.equal(releaseBattle(solo.m).code, 'NOT_HELD', 'nor resumed by the harness');
  assert.equal(pub(solo).paused, true);
  solo.m.dispose();
});

test('production: a server/match/Match.js match has no controls — the harness refuses it and changes nothing', () => {
  const h = coop(7106, Match);
  const m = h.m;
  for (const k of ['_harnessPhaseFn', 'endPhaseNow', 'holdBattle', 'releaseBattle']) assert.equal(k in m, false, k);
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.equal(endPhaseNow(m).code, 'NOT_HARNESS');
  assert.ok(h.drive(() => m.phase === PHASE.COMBAT));
  assert.equal(holdBattle(m).code, 'NOT_HARNESS');
  assert.equal(releaseBattle(m).code, 'NOT_HARNESS');
  assert.deepEqual([m.phase, m.paused, m.pauseQuiet], [PHASE.COMBAT, false, false]);
  // the lobby-side dispatcher on a production room answers NOT_HARNESS too
  const lobby = { getRoom: (code) => (code === 'TEST' ? { match: m } : null) };
  for (const cmd of ['endPhase', 'hold', 'release']) {
    assert.deepEqual(handleHarnessMessage(lobby, { tag: HARNESS_MSG, id: 1, cmd, room: 'TEST' }), { tag: HARNESS_MSG, id: 1, ok: false, code: 'NOT_HARNESS', phase: PHASE.COMBAT, round: m.round });
  }
  assert.equal(handleHarnessMessage(lobby, { tag: 'other', cmd: 'hold', room: 'TEST' }), null, 'not a harness message');
  assert.equal(m.paused, false);
  m.dispose();
});

test('production: no socket message reaches them — the protocol and the match refuse every such intent', () => {
  const h = coop(7107, Match);
  for (const t of ['g.endPhase', 'g.hold', 'g.release', 'g.harness', HARNESS_MSG]) {
    assert.notEqual(validateC2S({ t, room: 'TEST' }), null, `${t}: not a client-to-server message`);
    assert.equal(h.m.handle('p_0', { t }).error, ERR.BAD_MSG, `${t}: refused by the match`);
  }
  // g.test (the test rooms' host commands) has no such command either
  const gTest = readFileSync(path.join(ROOT, 'shared/testMode.js'), 'utf8');
  for (const cmd of HARNESS_CMDS) assert.equal(new RegExp(`'${cmd}'`).test(gTest.match(/TEST_COMMANDS = Object\.freeze\(\[([^\]]*)\]/)[1]), false, cmd);
  h.m.dispose();
});

test('production: only the e2e fast server loads the harness and answers its IPC messages', () => {
  const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
  for (const p of ['server/index.js', 'server/lobby.js', 'server/net.js', 'server/match/Match.js']) {
    assert.equal(/from ['"][^'"]*harnessControl|import\(['"][^'"]*harnessControl|'sp-harness'|HARNESS_MSG/.test(read(p)), false, `${p} never loads the harness`);
  }
  const fast = read('test/e2e/fastServer.mjs');
  assert.match(fast, /import \{ harnessMatchClass, handleHarnessMessage \} from '\.\/harnessControl\.mjs'/);
  assert.match(fast, /process\.on\('message'/, 'the fast server answers over its IPC channel');
  assert.equal(/process\.on\('message'/.test(read('server/index.js')), false, 'the production entry has no IPC handler');
});
