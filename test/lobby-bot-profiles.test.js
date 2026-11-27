// test/lobby-bot-profiles.test.js — (fork, GitHub #107) an AI seat's bot profile in the room: room.addBot { bot? },
// room.setBot { seat, bot } and room.fillBots { preset } (host-only, before the match, co-op), room.state's seat `bot`
// (only when not the default), and the match's opts.botStrategySeats (only when some seat has a profile).
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer } from '../server/index.js';
import { roomBotSeats } from '../server/lobby.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { BOT_STRATEGIES, getBotStrategySeats } from '../server/match/botStrategies.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { ROOM_BOTS, DEFAULT_ROOM_BOT, FILL_PRESETS, roomBot } from '../shared/botProfiles.js';

function clientPool(getUrl) {
  const open = new Set();
  return {
    async player(name) {
      const c = await TestClient.connect(getUrl());
      open.add(c);
      const w = await c.hello(name);
      c.id = w.playerId;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}
const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
const bots = (state) => state.seats.filter((s) => s && s.isBot);
async function createRoom(c, mode = 'coop') {
  await ok(c, { t: 'room.create', mode, difficulty: 'NORMAL' });
  return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
}

const started = [];
class RecordingMatch extends StubMatch {
  constructor(opts) {
    super(opts);
    started.push(opts);
  }
}

test('the room\'s bot list: registered ids, legacy first and the default, no external; presets name listed bots; en labels', () => {
  assert.equal(ROOM_BOTS[0].id, 'legacy');
  assert.equal(DEFAULT_ROOM_BOT, 'legacy');
  assert.ok(ROOM_BOTS.every((b) => Object.hasOwn(BOT_STRATEGIES, b.id) || b.id === 'legacy'), 'every id is registered');
  assert.ok(!ROOM_BOTS.some((b) => b.id === 'external'));
  assert.equal(new Set(ROOM_BOTS.map((b) => b.id)).size, ROOM_BOTS.length);
  assert.ok(ROOM_BOTS.some((b) => b.id === 'fish-level') && ROOM_BOTS.some((b) => b.id === 'fish-tier6'));
  assert.equal(roomBot('nope').id, 'legacy');
  assert.equal(roomBot(undefined).id, 'legacy');
  assert.deepEqual(FILL_PRESETS.map((p) => p.id), ['basic']);
  for (const p of FILL_PRESETS) {
    const ids = p.bots(3);
    assert.equal(ids.length, 3);
    for (const id of ids) assert.ok(ROOM_BOTS.some((b) => b.id === id), `${p.id}: ${id}`);
  }
  const en = JSON.parse(readFileSync(new URL('../public/i18n/en.json', import.meta.url), 'utf8'));
  for (const s of [...ROOM_BOTS.flatMap((b) => [b.label, b.desc]), ...FILL_PRESETS.map((p) => p.label), '用 AI 填满空位', 'AI 方案']) {
    assert.ok(en[s], `en.json has ${s}`);
  }
  assert.equal(en['全部基础 AI'], 'All basic bot');
});

test('protocol: room.addBot takes an optional listed bot; room.setBot a seat and a listed bot; room.fillBots a preset', () => {
  assert.equal(validateC2S({ t: 'room.addBot' }), null);
  assert.equal(validateC2S({ t: 'room.addBot', lang: 'en', bot: 'fish-tier6' }), null);
  for (const bot of ['external', 'nope', '', 1, null]) assert.notEqual(validateC2S({ t: 'room.addBot', bot }), null, JSON.stringify(bot));
  assert.equal(validateC2S({ t: 'room.setBot', seat: 2, bot: 'legacy' }), null);
  assert.notEqual(validateC2S({ t: 'room.setBot', seat: 2 }), null);
  assert.notEqual(validateC2S({ t: 'room.setBot', seat: 9, bot: 'legacy' }), null);
  assert.notEqual(validateC2S({ t: 'room.setBot', seat: 1, bot: 'external' }), null);
  assert.equal(validateC2S({ t: 'room.fillBots', preset: 'basic' }), null);
  assert.equal(validateC2S({ t: 'room.fillBots', preset: 'basic', lang: 'ja' }), null);
  assert.notEqual(validateC2S({ t: 'room.fillBots' }), null);
  assert.notEqual(validateC2S({ t: 'room.fillBots', preset: 'optimized' }), null);
});

test('roomBotSeats: none without a profile; the room\'s profiles over SP_BOT_STRATEGY_SEATS; Match resolves them', () => {
  const room = (...seats) => ({ seats });
  const human = { seat: 0, isBot: false };
  assert.deepEqual(roomBotSeats(room(human, { seat: 1, isBot: true }, null, null), '2:ioleta'), {});
  const r = room(human, { seat: 1, isBot: true, bot: 'fish-tier6' }, { seat: 2, isBot: true }, { seat: 3, isBot: true, bot: 'adaptive' });
  assert.deepEqual(roomBotSeats(r, ''), { botStrategySeats: { 1: 'fish-tier6', 3: 'adaptive' } });
  assert.deepEqual(roomBotSeats(r, ' 2:ioleta , 3:legacy'), { botStrategySeats: { 2: 'ioleta', 3: 'adaptive', 1: 'fish-tier6' } });
  const seats = getBotStrategySeats(roomBotSeats(r, '2:ioleta').botStrategySeats);
  assert.deepEqual(Object.fromEntries(Object.entries(seats).map(([k, v]) => [k, v.id])), { 1: 'fish-tier6', 2: 'ioleta', 3: 'adaptive' });
});

describe('bot profiles in the room (lobby)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RecordingMatch, lobbyGraceMs: 60_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('addBot with and without a bot; setBot host-only, AI seats only; the default leaves no key in room.state', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await ok(guest, { t: 'room.join', code: st.code });
    await host.waitFor('room.state', (s) => !!seatOf(s, guest.id));

    await ok(host, { t: 'room.addBot', lang: 'en' });
    let s = await host.waitFor('room.state', (x) => bots(x).length === 1);
    assert.ok(!('bot' in bots(s)[0]), 'a default AI seat carries no bot key');
    await ok(host, { t: 'room.addBot', lang: 'en', bot: 'fish-tier6' });
    s = await host.waitFor('room.state', (x) => bots(x).length === 2);
    const [a, b] = bots(s);
    assert.equal(b.bot, 'fish-tier6');
    assert.equal(b.name, 'AI·Amiya');

    await err(guest, { t: 'room.setBot', seat: a.seat, bot: 'fish-level' }, ERR.NOT_HOST);
    await err(host, { t: 'room.setBot', seat: seatOf(s, guest.id).seat, bot: 'fish-level' }, ERR.BAD_TARGET);
    await ok(host, { t: 'room.setBot', seat: a.seat, bot: 'fish-level' });
    await guest.waitFor('room.state', (x) => bots(x)[0]?.bot === 'fish-level');
    await ok(host, { t: 'room.setBot', seat: b.seat, bot: 'legacy' });
    s = await guest.waitFor('room.state', (x) => bots(x).length === 2 && !('bot' in bots(x)[1]));
    assert.equal(bots(s)[0].bot, 'fish-level');
  });

  test('fillBots fills every free seat with the preset; host-only; co-op only; a full room refuses', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await ok(guest, { t: 'room.join', code: st.code });
    await host.waitFor('room.state', (s) => !!seatOf(s, guest.id));
    await err(guest, { t: 'room.fillBots', preset: 'basic' }, ERR.NOT_HOST);
    await ok(host, { t: 'room.fillBots', preset: 'basic', lang: 'ja' });
    const s = await host.waitFor('room.state', (x) => x.seats.every(Boolean));
    assert.equal(bots(s).length, 2);
    assert.ok(bots(s).every((x) => !('bot' in x) && x.name.startsWith('AI·')));
    assert.equal(new Set(bots(s).map((x) => x.name)).size, 2);
    await err(host, { t: 'room.fillBots', preset: 'basic' }, ERR.ROOM_FULL);

    const solo = await pool.player('Solo');
    await createRoom(solo, 'solo');
    await err(solo, { t: 'room.fillBots', preset: 'basic' }, ERR.ROOM_FULL);
  });

  test('the match gets opts.botStrategySeats only when an AI seat has a profile', async () => {
    const host = await pool.player('Host');
    await createRoom(host);
    await ok(host, { t: 'room.fillBots', preset: 'basic' });
    await host.waitFor('room.state', (x) => x.seats.every(Boolean));
    started.length = 0;
    await ok(host, { t: 'room.start' });
    assert.equal(started.length, 1);
    assert.ok(!('botStrategySeats' in started[0]), 'a default room\'s opts keep their keys');

    const host2 = await pool.player('Host2');
    await createRoom(host2);
    await ok(host2, { t: 'room.addBot' });
    await ok(host2, { t: 'room.addBot', bot: 'fish-tier6' });
    const s = await host2.waitFor('room.state', (x) => bots(x).length === 2);
    await err(host2, { t: 'room.setBot', seat: 9, bot: 'legacy' }, ERR.BAD_MSG);
    started.length = 0;
    await ok(host2, { t: 'room.start' });
    assert.deepEqual(started[0].botStrategySeats, { [String(bots(s)[1].seat)]: 'fish-tier6' });
    await err(host2, { t: 'room.setBot', seat: bots(s)[0].seat, bot: 'fish-level' }, ERR.ROOM_STARTED);
  });
});
