// (fork) One for All (server/match/match/oneForAll.js): every seat holds the voted strategy, and each holder's strategy works
// as it does for a sole holder. A strategy's item grant comes out of the room's equipment stock, which is sized for one
// holder per strategy (8 seats: tier-5 stock 14 copies; an advanced item takes 2): before 2026-11-13 the 8th 缪尔赛思
// holder got no advanced 博士投影, and 4 of 8 马克维茨 holders no 商业包装方案 (stock 2 → 4). Now every holder gets its
// item and the copies past the stock are recorded as debt (effectsMeta grantItem, acquireItem `displayed`).
// Run: node --test test/one-for-all-strategy-items.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { PHASE } from '../shared/constants.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

/** A full One for All room (8 human seats), every seat voting `bandId`, run to round 1's prep. */
function fullRoom(bandId, { oneForAll = true } = {}) {
  const data = getData({ log: quiet });
  const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ seat: i, playerId: `p_${i}`, name: `P${i + 1}`, isBot: false, connected: true }));
  const sched = new VirtualScheduler();
  const m = new Match({ roomCode: 'T', mode: 'coop', difficulty: 'NORMAL', seats, seed: 7, data, log: quiet, scheduler: sched,
    battleContent: 'full', botRehearsal: 0, largeRoom: true, oneForAll, send: () => true, broadcast: () => {}, onEnd: () => {} });
  m.phase = PHASE.INFO_CHECK;
  m.enterBandDraft();
  const ps = [...m.players.values()];
  if (oneForAll) for (const p of ps) assert.deepEqual(m.pickBand(p, bandId), { ok: true });
  else for (const p of ps) p.bandId = bandId;
  for (let k = 0; k < 400 && !(m.phase === PHASE.PREP && m.round === 1); k++) sched.advance(1000);
  assert.equal(m.phase, PHASE.PREP, 'round 1 prep reached');
  assert.equal(m.round, 1);
  return { m, ps };
}
const owned = (p, id) => [...p.hand, ...p.temp, ...p.allChess().flatMap((c) => c.items || [])].filter((x) => x && x.kind === 'item' && x.id === id).length;

for (const [bandId, item, why] of [
  ['band_mlyss', 'chess_item_5_06_e_b', 'advanced 博士投影: 2 of the 14 tier-5 copies each'],
  ['band_malkie', 'chess_item_5_07_e_a', '商业包装方案: stock 2, 4 in an 8-seat room'],
]) {
  test(`One for All, ${bandId}: all 8 holders get their round-1 item (${why})`, () => {
    const { m, ps } = fullRoom(bandId);
    for (const p of ps) assert.equal(p.bandId, bandId);
    for (const p of ps) assert.equal(owned(p, item), 1, `${p.playerId} holds its ${item}`);
    const pool = m.itemPool;
    assert.ok(pool.held(item) > pool.cap(item), 'more than the room stock is held');
    assert.equal(pool.debtOf(item), pool.held(item) - pool.cap(item), 'the copies past the stock are debt');
    m.dispose();
  });
}
