// test/match/bot-world.test.js — (fork) piece 1 + 2 of docs/host-browser-bots.md: seat streams, the snapshot and the match
// restored from it. Run: node --test test/match/bot-world.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOT_UID_BLOCK } from '../../server/match/match/botTasks.js';
import { buildWorld, decode, encode, encodeMemo, encodeSeat, applyMemo, BotWorldError, seatHash } from '../../server/match/botWorld.js';
import { ShadowMatch } from '../../server/match/shadowMatch.js';
import { createFakeBotHost, nodeBotEnv, wire } from './fakeBotHost.js';
import { DATA, makeMatch } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEATS = [
  { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: false },
  { seat: 1, playerId: 'ai_1', name: 'A1', isBot: true, connected: true },
  { seat: 2, playerId: 'ai_2', name: 'A2', isBot: true, connected: true },
];

test('seat streams: swapped while the seat acts, always restored, a block of uids per task', () => {
  const h = makeMatch({ seats: SEATS, seed: 5, seatStreams: true, fake: true });
  const { m } = h;
  const before = { shop: m.rngShop, meta: m.rngMeta, bots: m.rngBots, uid: m.uidSeq };
  const ps = m.players.get('ai_1');
  const task = m.newBotTask(ps);
  assert.equal(m.uidSeq, before.uid + BOT_UID_BLOCK, 'the block is reserved at once, so nobody else takes those uids');
  const uid = m.withSeatStreams(task, () => {
    assert.equal(m.rngShop, task.rngShop);
    assert.equal(m.rngMeta, task.rngMeta);
    assert.equal(m.rngBots, task.rngBots);
    return m.nextUid();
  });
  assert.equal(uid, before.uid + 1);
  assert.equal(task.uidCursor, before.uid + 1);
  assert.throws(() => m.withSeatStreams(task, () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual([m.rngShop, m.rngMeta, m.rngBots, m.uidSeq], [before.shop, before.meta, before.bots, before.uid + BOT_UID_BLOCK]);
  const retry = m.newBotTask(ps);
  assert.notDeepEqual(retry.seeds, task.seeds, 'a retry rolls differently from the attempt it replaces');
  h.m.dispose();
});

test('seat streams: a bot\'s rolls leave the shared streams alone, and a match without the option never sees them', () => {
  const shared = (o) => {
    const h = makeMatch({ seats: SEATS, seed: 5, fake: true, ...o }).autoHumans().start();
    h.runToPhase('COMBAT', 2);
    const out = { shop: h.m.rngShop.state(), bots: h.m.rngBots.state(), uid: h.m.uidSeq };
    h.m.dispose();
    return out;
  };
  const plain = shared({});
  const seat = shared({ seatStreams: true });
  assert.notEqual(plain.shop, seat.shop, 'on the option the bots draw elsewhere');
  assert.ok(seat.uid > plain.uid + BOT_UID_BLOCK, 'and take their uids from reserved blocks');
  assert.deepEqual(shared({}), plain, 'off, it stays what it always was');
});

test('codec: every value a seat holds crosses JSON unchanged, and what cannot cross is named', () => {
  const v = { a: 1, inf: Infinity, neg: -Infinity, nan: NaN, zero: -0, u: undefined, n: null, s: new Set([1, 'x']),
    m: new Map([['k', { deep: new Map([[3, new Set([4])]]) }]]), list: [1, undefined, new Map()] };
  assert.deepStrictEqual(decode(wire(encode(v))), v);
  assert.throws(() => encode({ bad: { fn() {} } }, 'x'), (e) => e instanceof BotWorldError && /x\.bad\.fn/.test(e.message));
  assert.throws(() => encode({ d: new Date(0) }), BotWorldError);
});

test('snapshot: restoring gives back every seat exactly, at every prep of a real match', () => {
  const h = makeMatch({ seats: SEATS, seed: 9, fake: true, seatStreams: true }).autoHumans().start();
  const env = nodeBotEnv({ data: DATA, modeId: h.m.modeId });
  let checked = 0;
  for (let round = 1; round <= 6; round++) {
    h.runToPhase('COMBAT', round);
    for (const ps of h.m.order) {
      const world = wire(buildWorld(h.m, ps, h.m.newBotTask(ps)));
      const copy = new ShadowMatch(world, env);
      assert.equal(copy.order.length, h.m.order.length);
      for (const p of h.m.order) {
        const back = copy.players.get(p.playerId);
        assert.deepEqual(wire(encodeSeat(back)), wire(encodeSeat(p)), `R${round} seat ${p.playerId}`);
        assert.equal(seatHash(back), seatHash(p));
      }
      assert.deepEqual([...copy.pool.entries], [...h.m.pool.entries]);
      assert.equal(copy.botRehearsal, h.m.botTaskLayouts, 'the gates in bot.js read the task\'s count');
      checked++;
    }
  }
  assert.equal(checked, 18);
  h.m.dispose();
});

test('snapshot: no shared stream state, no caches, and a size the wire can take', () => {
  const h = makeMatch({ seats: SEATS, seed: 9, fake: true, seatStreams: true }).autoHumans().start();
  h.runToPhase('COMBAT', 5);
  const ps = h.m.players.get('ai_1');
  ps._botRangeRecs = new Map([['huge', 'x'.repeat(50000)]]);
  const text = JSON.stringify(buildWorld(h.m, ps, h.m.newBotTask(ps)));
  for (const secret of ['rngShop', 'rngWaves', 'rngDraft', 'rngSetup', '_botRangeRecs', '_deployMap', 'sendFn']) assert.ok(!text.includes(secret), secret);
  assert.ok(text.length < 80_000, `${text.length} bytes`);
  h.m.dispose();
});

test('memo: the bot\'s own fields travel back, and an answer can write nothing else', () => {
  const h = makeMatch({ seats: SEATS, seed: 9, fake: true }).start();
  const ps = h.m.players.get('ai_1');
  ps._botSeenUids = new Set([1, 2]);
  ps._botPrepToken = 7;
  ps._botRangeRecs = new Map();
  const memo = wire(encodeMemo(ps));
  assert.deepEqual(Object.keys(memo), ['_botSeenUids'], 'not the token, not the cache');
  const funds = ps.funds;
  ps._botSeenUids = null;
  applyMemo(ps, { ...memo, funds: 9999, hand: [], m: null, _botPrepToken: 99 });
  assert.deepEqual(ps._botSeenUids, new Set([1, 2]));
  assert.equal(ps.funds, funds);
  assert.equal(ps._botPrepToken, 7);
  assert.ok(ps.m === h.m);
  h.m.dispose();
});

test('the copy brings every match field the bot and the handlers read', () => {
  // `misses` holds the reads of a field missing on the copy. One the real match lacks too is simply undefined on both sides.
  const misses = new Set();
  let h = null;
  const env = nodeBotEnv({ data: DATA, modeId: 'mode_multi_normal', misses });
  const host = createFakeBotHost(() => h.m, env);
  h = makeMatch({ seats: SEATS, seed: 3, fake: true, botExecution: 'host', botExecutor: host, botTaskLayouts: 0 }).autoHumans().start();
  h.runToEnd();
  const real = [...misses].filter((k) => k in h.m);
  assert.deepEqual(real, [], `missing from the snapshot: ${real.join(', ')}`);
  assert.ok(host.tasks.length > 20);
  h.m.dispose();
});

test('the code a browser Worker would load imports nothing from Node', () => {
  const seen = new Set();
  const nodeOnly = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)import\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith('.')) { nodeOnly.push(`${path.relative(ROOT, file)} → ${spec}`); continue; }
      // server/data.js is served to browsers as a stand-in (/data.js, server/http/static.js)
      const target = path.resolve(path.dirname(file), spec);
      if (target !== path.join(ROOT, 'server', 'data.js')) walk(target);
    }
  };
  walk(path.join(ROOT, 'server', 'match', 'botRunner.js'));
  assert.deepEqual(nodeOnly, []);
  assert.ok(seen.size > 50, `${seen.size} modules walked`);
});
