// test/match/records.test.js — (fork, GitHub #32) the anonymous match record (server/match/records.js): off by default
// (nothing installed, no `record` in the summary); on, it observes only (the match plays the same), holds the actions,
// shop rolls, round rows and battle specs, names no player, room or time, and its normal battles replay from their specs
// to the recorded result digests.
// Run: node --test test/match/records.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
// ids in the platform's formats (net.js 'p_' + 10 hex, lobby.js 'ai_' + 8 hex), names a record must never carry
const SEATS = [
  { seat: 0, playerId: 'p_0123456789', name: 'Alice Example', isBot: false, connected: true },
  { seat: 1, playerId: 'ai_deadbeef', name: 'AI-Two', isBot: true, connected: true },
  { seat: 2, playerId: 'ai_cafef00d', name: 'AI-Three', isBot: true, connected: true },
];

function play(record) {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats: SEATS.map((s) => ({ ...s })), seed: 11, record, clientCombat: true, captureFrames: false });
  h.autoHumans();
  h.m.start();
  h.run(() => h.ended != null, { maxSteps: 5e7 });
  assert.ok(h.ended, 'the match ended');
  return h;
}

let on = null;
const recorded = () => (on ??= play(true));

test('off by default: nothing is installed and the summary has no record', REAL, () => {
  const h = makeMatch({ mode: 'solo', seed: 3 });
  assert.equal(h.m._record, undefined);
  for (const ps of h.m.players.values()) assert.equal(Object.hasOwn(ps, 'buy'), false, 'PlayerState methods untouched');
  const off = play(undefined);
  assert.equal('record' in off.ended, false);
});

test('on, it only observes: the same seed plays the same match', REAL, () => {
  const off = play(undefined);
  const { record, ...rest } = recorded().ended;
  assert.ok(record);
  assert.deepEqual(rest, off.ended);
});

test('the record: seats, outcome, actions, shop rolls, round rows and battle specs', REAL, () => {
  const { record: r } = recorded().ended;
  assert.equal(r.v, 1);
  assert.deepEqual([r.mode, r.difficulty, r.seed], ['coop', 'FUNNY', 11]);
  assert.deepEqual(r.seats.map((s) => [s.seat, s.human]), [['s0', true], ['s1', false], ['s2', false]]);
  assert.ok(r.seats.every((s) => typeof s.band === 'string' && Number.isInteger(s.roundsPassed)));
  assert.equal(typeof r.result.victory, 'boolean');
  const kinds = new Set(r.actions.map((a) => a.a));
  for (const k of ['band', 'shop', 'buy', 'move', 'refresh', 'levelUp', 'card']) assert.ok(kinds.has(k), `an action '${k}'`);
  for (const a of r.actions) {
    assert.match(a.s, /^s[0-2]$/);
    assert.ok(Number.isInteger(a.r) && a.r >= 0);
  }
  // the human under AI 托管: its actions are marked as made by the bot
  assert.ok(r.actions.filter((a) => a.s === 's0' && a.a === 'buy').every((a) => a.bot === 1));
  const buy = r.actions.find((a) => a.a === 'buy');
  assert.equal(typeof buy.id, 'string');
  assert.ok(buy.got.length >= 1 && Number.isInteger(buy.got[0].uid), 'a buy names the piece it gave');
  assert.ok(r.rounds.length >= Math.min(r.result.roundsPassed, r.bossRound - 1), 'a row per settled round');
  assert.ok(r.rounds.every((row, i) => i === 0 || row.r > r.rounds[i - 1].r), 'rows in round order');
  // the round the match ended in has its row: a final boss round finishes without a SETTLE (first human records)
  const last = r.rounds[r.rounds.length - 1];
  assert.equal(last.r, recorded().m.round, 'a row for the last round');
  if (r.result.victory) assert.equal(last.final, true, 'the final boss round, marked');
  // (GitHub #59) no gaps: a round started without a SETTLE before it (the Hidden Core after a Final Assault) has its row
  assert.deepEqual(r.rounds.map((row) => row.r), Array.from({ length: last.r }, (_, i) => i + 1), 'a row for every round');
  for (const row of r.rounds) for (const s of Object.values(row.seats)) {
    for (const k of ['lp', 'level', 'funds', 'deployed', 'value', 'elites', 'items', 'layers']) assert.equal(typeof s[k], 'number', k);
    assert.ok(Array.isArray(s.units) && Array.isArray(s.bonds));
  }
  assert.ok(r.battles.length > 0);
  for (const b of r.battles) {
    assert.equal(typeof b.spec, 'object');
    assert.match(b.digest, /^[0-9a-f]{8}$/);
  }
});

test('anonymous: no playerId, name, room code, IP or time of day anywhere in the record', REAL, () => {
  const { record: r } = recorded().ended;
  const json = JSON.stringify(r);
  for (const s of [...SEATS.flatMap((x) => [x.playerId, x.name]), 'TEST']) assert.equal(json.includes(s), false, `'${s}' in the record`);
  assert.equal(/\b\d{1,3}(\.\d{1,3}){3}\b/.test(json), false, 'an IPv4 address');
  const banned = new Set(['name', 'roomCode', 'code', 'ip', 'token', 'reconnectToken', 'userAgent', 'emote', 'report', 'at', 'startedAt', 'endedAt']);
  const walk = (v, where) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      assert.equal(banned.has(k), false, `key '${k}' at ${where}`);
      // the specs keep their player keys (a replay needs them), holding the seat id
      if (/playerId$/i.test(k)) assert.ok(x == null || /^s[0-3]$/.test(x), `${where}.${k} = ${x}`);
      walk(x, `${where}.${k}`);
    }
    // an epoch time in ms (2001 … 2286) would date the match more precisely than its day
    else if (typeof v === 'number') assert.ok(!(v > 1e12 && v < 1e13), `a timestamp ${v} at ${where}`);
  };
  walk(r, 'record');
});

test('replay: each recorded normal battle runs from its spec to the recorded result digest', REAL, () => {
  const h = recorded();
  const { record: r } = h.ended;
  const normal = r.battles.filter((b) => b.kind === 'normal' && !b.synthetic);
  assert.ok(normal.length >= 10, `normal battles (${normal.length})`);
  for (const b of normal) {
    const res = createBattleFromSpec(JSON.parse(JSON.stringify(b.spec)), h.m.ds, { recordEvents: false, quiet: true }).runToEnd(4000);
    assert.equal(resultDigest(res).hash, b.digest, `R${b.r} ${b.field}`);
  }
});

test('a human\'s own intents: recorded in order without the bot mark; a refused one is not recorded', REAL, () => {
  const h = makeMatch({ mode: 'solo', seats: [{ ...SEATS[0] }], seed: 21, record: true });
  h.m.start();
  h.toPrep(1);
  const pid = SEATS[0].playerId;
  const ps = h.m.players.get(pid);
  const log = h.m._record.actions;
  const from = log.length;
  const slot = ps.shop.slots.findIndex((s) => s && s.kind === 'chess' && ps.priceOf(s) <= ps.funds);
  assert.ok(slot >= 0, 'an affordable operator');
  const id = ps.shop.slots[slot].id;
  assert.equal(h.m.handle(pid, { t: 'g.buy', slot }).ok, true);
  assert.ok(h.m.handle(pid, { t: 'g.buy', slot }).error, 'the sold slot is refused');
  ps.funds = Math.max(ps.funds, h.m.gd.refreshPrice);
  assert.equal(h.m.handle(pid, { t: 'g.refresh' }).ok, true);
  const mine = log.slice(from);
  assert.deepEqual(mine.map((a) => a.a), ['buy', 'refresh', 'shop']);
  assert.ok(mine.every((a) => a.s === 's0' && a.r === 1 && !('bot' in a)));
  assert.equal(mine[0].id, id);
  assert.deepEqual(mine[2].ids, ps.shop.slots.map((s) => (s ? s.id : null)), 'the new shop');
});

test('(GitHub #59) a round the next one starts after without a SETTLE gets its row, once', REAL, () => {
  const h = makeMatch({ mode: 'solo', seats: [{ ...SEATS[0] }], seed: 21, record: true });
  h.autoHumans();
  h.m.start();
  h.toPrep(2);
  const rows = h.m._record.rounds;
  assert.deepEqual(rows.map((row) => row.r), [1]);
  // as the Final Assault won does (bossRounds.js: straight to the Hidden Core)
  h.m.startRound(3);
  assert.deepEqual(rows.map((row) => [row.r, !!row.noSettle]), [[1, false], [2, true]]);
  for (const s of Object.values(rows[1].seats)) assert.equal(typeof s.lp, 'number');
  h.toPrep(4);
  assert.deepEqual(rows.map((row) => [row.r, !!row.noSettle]), [[1, false], [2, true], [3, false]]);
});

test('GitHub #90: after a refresh the record holds the shop the player saw, after the refresh\'s own effects', REAL, () => {
  const h = makeMatch({ mode: 'solo', seed: 7, record: true });
  h.m.start();
  const ps = [...h.m.players.values()].find((p) => !p.isBot);
  assert.ok(h.drive(() => h.m.phase === 'PREP' && h.m.round >= 2, { ready: true, band: 'band_duyaoy' }));
  assert.equal(ps.bandId, 'band_duyaoy');
  ps.funds = 20;
  let changed = 0;
  for (let i = 0; i < 4; i++) {
    const before = h.m._record.actions.length;
    assert.deepEqual(ps.refresh(), { ok: true });
    const shops = h.m._record.actions.slice(before).filter((a) => a.a === 'shop');
    assert.ok(shops.length >= 1, 'the roll is logged');
    assert.deepEqual(shops.at(-1).ids, ps.shop.slots.map((s) => (s ? s.id : null)), `refresh ${i + 1}: the last logged shop is the one shown`);
    if (shops.at(-1).after === 'refresh') changed++;
  }
  h.m.dispose();
  assert.ok(changed > 0, 'Du Yaoye\'s first refreshes change the shop after the roll (her Yan offers)');
});
