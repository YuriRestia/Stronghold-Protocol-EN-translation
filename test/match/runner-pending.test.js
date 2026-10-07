// The browser battle runner (public/js/battle/runner.js) while a b.start is still being prepared — the simulation module
// loading (a deferred loader here) or the silent catch-up to the field clock (it waits for an animation frame after every
// PREPARE_SLICE of 600 ticks): a b.end (takeover / forced), a second b.start of the same battle, a b.start of another
// field, b.pool, the solo pause and the next prep's clear that arrive meanwhile are applied to that battle, in order,
// once it exists (PR #266 by @siruimei07). Manual clock and animation frames, a real round-2 b.start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBattleRunner } from '../../public/js/battle/runner.js';
import { createStore, initialState } from '../../public/js/store.js';
import * as specMod from '../../server/sim/spec.js';
import { DataSource } from '../../server/sim/simdata.js';
import { validateC2S } from '../../shared/protocol.js';
import { PHASE } from '../../shared/constants.js';
import { DATA, makeMatch } from './harness.js';

const DS = new DataSource(DATA, null);
const QUIET = { error() {}, warn() {}, info() {}, debug() {} };
const tick = () => new Promise((res) => setImmediate(res));

/** A real authoritative b.start of round 2 (a board with operators) from a client-combat match. */
const START = (() => {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 1, bots: 1, seed: 7301, captureFrames: false, clientCombat: true, clients: false });
  h.autoHumans();
  h.m.start();
  h.run(() => h.m.phase === PHASE.COMBAT && h.m.round === 2, { maxSteps: 3e6 });
  const msg = h.lastTo('p_0', 'b.start');
  h.m.dispose();
  assert.ok(msg && msg.authoritative && msg.kind === 'normal');
  return msg;
})();

let bossStart = null;
/** A real b.start of a Final Assault field (a shared boss pool). */
function realBossStart() {
  if (bossStart) return bossStart;
  const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', humans: 1, seed: 7304, captureFrames: false, clientCombat: true, clients: false });
  h.autoHumans();
  h.m.start();
  h.run(() => h.ended != null || h.m.phase === PHASE.FINAL_ASSAULT, { maxSteps: 5e6 });
  bossStart = h.lastTo('p_0', 'b.start');
  h.m.dispose();
  assert.equal(bossStart && bossStart.kind, 'boss');
  return bossStart;
}

/** A display replica of another field (a teammate's battle). */
const watched = () => ({ ...START, battleId: `${START.battleId}w`, fieldId: 'n:p_9', spec: { ...START.spec, fieldId: 'n:p_9' }, authoritative: false, watch: true, elapsed: 0 });

function rig() {
  let t = 1000;
  let frames = [];
  const handlers = new Map();
  const sent = [];
  const built = [];
  const shown = [];
  let release;
  const loaded = new Promise((res) => { release = res; });
  const sim = { ds: DS, spec: { ...specMod, createBattleFromSpec: (...a) => { const b = specMod.createBattleFromSpec(...a); built.push(b); return b; } } };
  const net = {
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); },
    emit(type, msg) { for (const fn of handlers.get(type) || []) fn({ t: type, ...msg }); },
    send(type, fields) { const msg = { ...fields, t: type }; assert.equal(validateC2S(msg), null, `invalid ${type}`); sent.push(msg); return true; },
    request(type, fields) { const msg = { ...fields, t: type, rid: 1 }; assert.equal(validateC2S(msg), null, `invalid ${type}`); sent.push(msg); return Promise.resolve({ t: 'ok' }); },
  };
  const store = createStore(initialState);
  const runner = createBattleRunner({
    net, store, doc: { hidden: false, addEventListener() {} }, now: () => t,
    raf: (fn) => { frames.push(fn); return frames.length; }, caf: () => {},
    setInterval: () => 1, clearInterval: () => {},
    loadSim: () => loaded, logger: QUIET,
  });
  runner.on('field', (f) => shown.push(f.battleId));
  store.patch('match', { public: { phase: PHASE.COMBAT } });
  return {
    runner, net, store, sent, built, shown,
    load() { release(sim); },
    elapse(ms) { t += ms; },
    /** `n` animation frames `ms` apart, the promise continuations settled before and after each */
    async frames(n = 1, ms = 0) {
      for (let i = 0; i < n; i++) {
        await tick();
        t += ms;
        const q = frames;
        frames = [];
        for (const fn of q) fn(t);
      }
      await tick();
    },
    end(reason, battleId = START.battleId) { net.emit('b.end', { battleId, fieldId: START.fieldId, reason }); },
    results: (battleId = START.battleId) => sent.filter((m) => m.t === 'b.result' && m.battleId === battleId),
  };
}

/**
 * The b.start, stopped while the sim still loads ('load', elapsed 0: the COMBAT start) or while the silent catch-up to
 * 30 game s (900 ticks at 2×) waits for its next frame after the first 600-tick slice ('catch-up', a reconnect).
 */
async function startAt(r, stage, msg = START) {
  r.net.emit('b.start', { ...msg, elapsed: stage === 'catch-up' ? 30 : 0 });
  if (stage === 'catch-up') r.load();
  await tick();
  if (stage === 'catch-up') {
    assert.equal(r.built.length, 1);
    assert.equal(r.built[0].tickCount, 600, 'one silent catch-up slice, waiting for the next frame');
    assert.ok(!r.built[0].finished);
  } else {
    assert.equal(r.built.length, 0, 'the simulation still loads');
  }
  assert.equal(r.runner._entries.size, 0, 'not registered yet');
  assert.equal(r.runner.state().loading, true);
}

/** Let the preparation finish (the sim arrives when it was still loading). */
async function prepared(r, stage) {
  if (stage === 'load') r.load();
  await r.frames(5);
}

async function runOut(r, e) {
  for (let i = 0; i < 400 && !e.battle.finished; i++) await r.frames(1, 1000);
  assert.ok(e.battle.finished, 'the battle ran to its end');
}

for (const stage of ['load', 'catch-up']) {
  test(`b.end takeover during the ${stage}: the battle is still shown but never reports from then on`, async () => {
    const r = rig();
    await startAt(r, stage);
    const before = r.sent.length;
    r.end('takeover');
    await prepared(r, stage);
    const e = r.runner._entries.get(START.battleId);
    assert.ok(e, 'registered and shown (a takeover keeps displaying)');
    assert.deepEqual(r.shown, [START.battleId]);
    assert.equal(e.authoritative, false);
    assert.equal(r.runner.state().authoritative, false);
    await runOut(r, e);
    assert.equal(r.sent.length, before, 'no b.progress / b.result after the takeover');
    r.runner.dispose();
  });

  test(`b.end forced during the ${stage}: the battle ends with that reason as soon as it exists and reports once (the first end wins)`, async () => {
    const r = rig();
    await startAt(r, stage);
    r.end('forced');
    if (stage === 'catch-up') {
      assert.ok(r.built[0].finished, 'ended at once, no further catch-up');
      assert.equal(r.built[0].tickCount, 600);
      assert.equal(r.results().length, 1, 'reported at once');
    }
    r.end('timeout');
    await prepared(r, stage);
    const e = r.runner._entries.get(START.battleId);
    assert.ok(e && e.done && e.battle.finished);
    assert.equal(e.battle.tickCount, stage === 'catch-up' ? 600 : 0, 'never stepped past the end');
    assert.equal(e.battle.result().reason, 'forced');
    assert.equal(r.results().length, 1);
    assert.equal(r.results()[0].result.reason, 'forced');
    assert.deepEqual(r.shown, [START.battleId]);
    assert.equal(r.runner.state().done, true);
    await r.frames(5, 1000);
    r.end('forced');
    assert.equal(r.results().length, 1, 'once');
    r.runner.dispose();
  });

  test(`b.end takeover then forced during the ${stage}: applied in that order — ended, no result`, async () => {
    const r = rig();
    await startAt(r, stage);
    const before = r.sent.length;
    r.end('takeover');
    r.end('forced');
    await prepared(r, stage);
    const e = r.runner._entries.get(START.battleId);
    assert.ok(e && e.battle.finished);
    assert.equal(e.battle.result().reason, 'forced');
    assert.equal(e.authoritative, false);
    assert.equal(r.sent.length, before, 'the former authority sends nothing');
    r.runner.dispose();
  });

  test(`a second b.start of the battle during the ${stage}: the same preparation, one Battle, the flags of the last message`, async () => {
    const r = rig();
    await startAt(r, stage);
    r.end('takeover');
    r.net.emit('b.start', { ...START, elapsed: 30 }); // authoritative again (a resync / a handover back)
    await prepared(r, stage);
    assert.equal(r.built.length, 1, 'one Battle per battleId');
    const e = r.runner._entries.get(START.battleId);
    assert.equal(e.authoritative, true, 'the later b.start grants the authority again');
    assert.deepEqual(r.shown, [START.battleId], 'shown once');
    await r.frames(3, 1000);
    assert.ok(r.sent.some((m) => m.t === 'b.progress'), 'reporting');
    r.end('takeover');
    const n = r.sent.length;
    await r.frames(5, 1000);
    assert.equal(r.sent.length, n, 'the last takeover wins');
    r.runner.dispose();
  });

  test(`the next prep during the ${stage} drops the battle: nothing is built, stepped, registered or reported afterwards`, async () => {
    const r = rig();
    await startAt(r, stage);
    r.store.patch('match', { public: { phase: PHASE.PREP } });
    const n = r.sent.length;
    const ticks = r.built.map((b) => b.tickCount);
    if (stage === 'load') r.load();
    await r.frames(5, 1000);
    r.end('forced');
    await r.frames(3, 1000);
    assert.equal(r.runner._entries.size, 0);
    assert.equal(r.runner.state(), null);
    assert.equal(r.store.get().match.battle, null);
    assert.deepEqual(r.built.map((b) => b.tickCount), ticks, 'no build, no step');
    assert.equal(r.sent.length, n);
    assert.deepEqual(r.shown, []);
    r.runner.dispose();
  });

  test(`another field's b.start during the ${stage}: the latest view is shown, the own authoritative battle still runs and reports`, async () => {
    const r = rig();
    await startAt(r, stage);
    r.net.emit('b.start', watched());
    await prepared(r, stage);
    assert.equal(r.runner.state().battleId, watched().battleId, 'the latest view');
    const e = r.runner._entries.get(START.battleId);
    assert.ok(e && e.authoritative, 'the authority is kept');
    await runOut(r, e);
    await r.frames(2);
    assert.equal(r.results().length, 1);
    assert.equal(r.results(watched().battleId).length, 0, 'the display replica never reports');
    assert.deepEqual(r.shown, [watched().battleId], 'the authority never takes the view back');
    r.runner.dispose();
  });
}

test('a display replica superseded during the catch-up is dropped (no Battle kept for it)', async () => {
  const r = rig();
  await startAt(r, 'catch-up', { ...START, authoritative: false, watch: true });
  r.net.emit('b.start', watched());
  await r.frames(5);
  assert.equal(r.runner._entries.has(START.battleId), false);
  assert.equal(r.runner.state().battleId, watched().battleId);
  assert.equal(r.sent.length, 0);
  r.runner.dispose();
});

test('solo pause during the catch-up: the paused time is not caught up', async () => {
  const r = rig();
  await startAt(r, 'catch-up');
  r.store.patch('match', { public: { phase: PHASE.COMBAT, paused: true } });
  r.elapse(5000);
  r.store.patch('match', { public: { phase: PHASE.COMBAT, paused: false } });
  await r.frames(3);
  const e = r.runner._entries.get(START.battleId);
  assert.equal(e.battle.tickCount, 900, 'the field clock (30 game s), not 5 paused real seconds further');
  r.runner.dispose();
});

test('b.pool during the catch-up of a boss field reaches its Battle at once', async () => {
  const start = realBossStart();
  const r = rig();
  r.net.emit('b.start', { ...start, elapsed: 30 });
  r.load();
  await tick();
  assert.equal(r.runner._entries.size, 0, 'still catching up');
  const pool = r.built[0].sharedBoss;
  const hp = pool.maxHp * 0.75;
  r.net.emit('b.pool', { hp, max: pool.maxHp, teamLp: 20, acked: { [start.fieldId]: pool.cum } });
  assert.ok(Math.abs(pool.hp - hp) < 1e-6, 'the server hp when everything is acknowledged');
  await r.frames(3);
  assert.equal(r.runner._entries.get(start.battleId).battle, r.built[0]);
  r.runner.dispose();
});
