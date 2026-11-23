// (fork) One for All (server/match/match/oneForAll.js): every seat holds the voted strategy. The user's decision of
// 2026-11-13 ("One for all: C"): there, a strategy's item grants and those of an operator's garrison effect are apart from
// the shop / reward stock — never refused, they take no copy (pool.js offStock), selling one repays nothing. Before, the
// room's stock (sized for one holder per strategy) ran out: the 8th 缪尔赛思 holder got no advanced 博士投影 (en: Doctor
// Hologram) and 4 of 8 马克维茨 holders no 商业包装方案 (en: Commercial Packaging Plan). Every other match keeps the
// official rule: equipment from any source occupies the stock (路标月报#2, BV1eLXXBqEgF 1:30 / 2:30; docs/history/0.2.5.md
// §30.1).
// Run: node --test test/one-for-all-strategy-items.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { Match } from '../server/match/Match.js';
import { VirtualScheduler } from '../server/match/scheduler.js';
import { makeCtx } from '../server/match/effectsMeta.js';
import { collectViolations } from '../server/match/invariants.js';
import { PHASE } from '../shared/constants.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

/** A full 8-seat Grand Alliance run to round 1's prep; One for All: every seat votes `bandId`. */
function fullRoom({ oneForAll, bandId = null }) {
  const data = getData({ log: quiet });
  const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ seat: i, playerId: `p_${i}`, name: `P${i + 1}`, isBot: false, connected: true }));
  const sched = new VirtualScheduler();
  const m = new Match({ roomCode: 'T', mode: 'coop', difficulty: 'NORMAL', seats, seed: 7, data, log: quiet, scheduler: sched,
    battleContent: 'full', botRehearsal: 0, largeRoom: true, oneForAll, send: () => true, broadcast: () => {}, onEnd: () => {} });
  m.phase = PHASE.INFO_CHECK;
  m.enterBandDraft();
  const ps = [...m.players.values()];
  if (oneForAll) for (const p of ps) assert.deepEqual(m.pickBand(p, bandId), { ok: true });
  for (let k = 0; k < 600 && !(m.phase === PHASE.PREP && m.round === 1); k++) sched.advance(1000);
  assert.equal(m.phase, PHASE.PREP, 'round 1 prep reached');
  return { m, ps };
}
const pieces = (p, id) => [...p.hand, ...p.temp, ...p.allChess().flatMap((c) => c.items || [])].filter((x) => x && x.kind === 'item' && x.id === id);
const noFail = (m) => assert.deepEqual(collectViolations(m), []);

for (const [bandId, item] of [['band_mlyss', 'chess_item_5_06_e_b'], ['band_malkie', 'chess_item_5_07_e_a']]) {
  test(`One for All, ${bandId}: all 8 holders get ${item}, and the shop stock keeps every copy`, () => {
    const { m, ps } = fullRoom({ oneForAll: true, bandId });
    for (const p of ps) assert.equal(p.bandId, bandId);
    for (const p of ps) assert.equal(pieces(p, item).length, 1, `${p.playerId} holds its ${item}`);
    const pool = m.itemPool;
    assert.equal(pool.held(item), 0, 'no copy of the stock is taken');
    assert.equal(pool.left(item), pool.cap(item), 'the shop and rewards keep the full stock');
    assert.equal(pool.debtOf(item), 0, 'no debt');
    noFail(m);
    // selling / destroying one repays nothing and leaves the stock as it was
    const one = pieces(ps[0], item)[0];
    assert.equal(ps[0].releaseItemStock(one), 0);
    assert.equal(pool.left(item), pool.cap(item));
    m.dispose();
  });
}

test('One for All: a garrison effect\'s grant takes no copy; a merge keeps only the stock copy it used; other sources still count', () => {
  const { m, ps } = fullRoom({ oneForAll: true, bandId: 'band_bldsk' });
  const pool = m.itemPool, item = 'chess_item_3_12_e_a', cap = pool.cap(item);
  const garrison = (p) => makeCtx(m, p, { kind: 'garrison', key: 'SERVER_GAIN_EQUIP', bb: {}, bbStr: {} }, 'onGain');
  const choice = (p) => makeCtx(m, p, { kind: 'choice', key: 'choice' }, 'onPrepStart');
  for (const p of ps) assert.ok(garrison(p).grantItem(item, { requirePool: false }), `${p.playerId}: garrison grant`);
  assert.equal(pool.held(item), 0, 'garrison grants take no copy');
  // a 机变 grant is not a strategy or garrison grant: it takes a copy, and completes the merge into the advanced item
  assert.ok(choice(ps[0]).grantItem(item));
  const adv = pieces(ps[0], 'chess_item_3_12_e_b');
  assert.equal(adv.length, 1, 'merged');
  assert.equal(adv[0].offStock, 1, 'the advanced piece keeps the one off-stock copy');
  assert.equal(pool.held(item), 1, 'and holds the one copy the 机变 grant took');
  assert.equal(pool.left(item), cap - 1);
  noFail(m);
  m.dispose();
});

test('Normal Grand Alliance (no One for All): strategy grants still occupy the stock and stop at it (official rule)', () => {
  const { m, ps } = fullRoom({ oneForAll: false });
  const pool = m.itemPool, item = 'chess_item_5_07_e_a', cap = pool.cap(item);
  const before = pool.held(item);
  let got = 0;
  for (const p of ps) {
    const ctx = makeCtx(m, p, { kind: 'band', key: 'preparation_start_gain_chess_from_round', bandId: 'band_malkie' }, 'onPrepStart');
    if (ctx.grantItem(item, { requirePool: false, source: 'band' })) got++;
  }
  assert.equal(got, cap - before, 'only as many as the stock has');
  assert.equal(pool.held(item), cap);
  for (const p of ps) for (const x of pieces(p, item)) assert.equal(x.offStock, undefined, 'no off-stock mark outside One for All');
  noFail(m);
  m.dispose();
});
