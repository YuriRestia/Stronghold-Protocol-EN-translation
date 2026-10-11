// Outfits (fork feature, docs/OUTFITS.md): room.outfits (lobby: stored per session and seat, shown to the room through
// room.state, any phase, unknown outfits dropped) and the client's resolvers (ui/outfits.js: whose choice a unit wears,
// summons, voice sets).

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTFITS = JSON.parse(readFileSync(path.join(ROOT, 'data', 'outfits.json'), 'utf8'));
const MLYNAR = 'char_4064_mlynar@epoque#28';
const AMIYA = Object.keys(OUTFITS).find((id) => id.startsWith('char_002_amiya@')) || null;

const quietLog = () => ({ info() {}, warn() {}, debug() {}, error() {} });
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };

test('protocol: room.outfits takes a { charId: own outfit } map only', () => {
  assert.equal(validateC2S({ t: 'room.outfits', outfits: {} }), null);
  assert.equal(validateC2S({ t: 'room.outfits', outfits: { char_4064_mlynar: MLYNAR } }), null);
  assert.notEqual(validateC2S({ t: 'room.outfits', outfits: { char_002_amiya: MLYNAR } }), null, 'another operator\'s outfit');
  assert.notEqual(validateC2S({ t: 'room.outfits', outfits: [MLYNAR] }), null);
  assert.notEqual(validateC2S({ t: 'room.outfits' }), null);
});

describe('room.outfits (lobby, stub match)', () => {
  let srv;
  const open = new Set();
  const player = async (name, token) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name, token);
    c.id = w.playerId;
    c.token = w.token;
    return c;
  };
  before(async () => { srv = await startServer({ port: 0, host: '127.0.0.1', log: quietLog(), MatchClass: StubMatch, heavyBurst: 12, heavyPerSec: 4 }); });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); });

  test('stored per session, shown to the room (seats[].outfits), unknown outfits dropped, kept across a resume, any phase', async () => {
    const host = await player('Host');
    await err(host, { t: 'room.outfits', outfits: { char_002_amiya: MLYNAR } }, ERR.BAD_MSG);
    // outside a room: stored on the session (an unknown outfit of the right shape is dropped)
    await ok(host, { t: 'room.outfits', outfits: { char_4064_mlynar: MLYNAR, char_002_amiya: 'char_002_amiya@nope#99' } });
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    let st = await host.waitFor('room.state', (s) => s.hostId === host.id);
    const mine = (s, id) => s.seats.find((x) => x && x.playerId === id);
    assert.deepEqual(mine(st, host.id).outfits, { char_4064_mlynar: MLYNAR }, 'the seat carries the session\'s choice');
    const guest = await player('Guest');
    await ok(guest, { t: 'room.join', code: st.code });
    st = await guest.waitFor('room.state', (s) => !!mine(s, guest.id));
    assert.equal(mine(st, guest.id).outfits, undefined, 'no choice: no field');
    assert.deepEqual(mine(st, host.id).outfits, { char_4064_mlynar: MLYNAR }, 'a member sees the host\'s outfits');
    // a change reaches every member at once
    const pick = AMIYA ? { char_002_amiya: AMIYA } : { char_4064_mlynar: MLYNAR };
    await ok(guest, { t: 'room.outfits', outfits: pick });
    st = await host.waitFor('room.state', (s) => !!mine(s, guest.id)?.outfits);
    assert.deepEqual(mine(st, guest.id).outfits, pick);
    await ok(guest, { t: 'room.outfits', outfits: pick }); // the same choice again: accepted (no change to show)
    // a resumed session keeps its choice
    await guest.terminate();
    await host.waitFor('room.state', (s) => mine(s, guest.id)?.connected === false);
    host.inbox.length = 0; // (waitFor also reads earlier frames: only the resume's own room.state counts)
    const back = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(back);
    await back.hello('Guest', guest.token);
    st = await host.waitFor('room.state', (s) => mine(s, guest.id)?.connected === true);
    assert.deepEqual(mine(st, guest.id).outfits, pick);
    // during a match: accepted (cosmetic), shown at once
    await ok(back, { t: 'room.ready', ready: true });
    await ok(host, { t: 'room.start' });
    await host.waitFor('room.state', (s) => s.inMatch);
    await ok(back, { t: 'room.outfits', outfits: {} });
    st = await host.waitFor('room.state', (s) => s.inMatch && !mine(s, guest.id)?.outfits);
    assert.equal(mine(st, guest.id).outfits, undefined, 'cleared');
  });
});

describe('room.outfits rate limit (default heavy bucket)', () => {
  let srv;
  before(async () => { srv = await startServer({ port: 0, host: '127.0.0.1', log: quietLog() }); });
  after(async () => { await srv?.close(); });

  test('a burst beyond the heavy bucket is refused with RATE (it broadcasts room.state to the whole room)', async () => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    try {
      await c.hello('Spam');
      const replies = await Promise.all(Array.from({ length: 12 }, (_, i) =>
        c.request({ t: 'room.outfits', outfits: i % 2 ? { char_4064_mlynar: MLYNAR } : {} })));
      const codes = replies.map((r) => (r.t === 'ok' ? 'ok' : r.code));
      assert.ok(codes.includes('ok'), JSON.stringify(codes));
      assert.ok(codes.includes(ERR.RATE), `refused once the bucket is empty: ${JSON.stringify(codes)}`);
      assert.ok(codes.filter((x) => x === 'ok').length <= 7, JSON.stringify(codes));
    } finally { await c.terminate().catch(() => {}); }
  });
});

describe('ui/outfits.js resolvers', () => {
  let mod, store, data;
  before(async () => {
    globalThis.localStorage = { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };
    ({ store } = await import('../public/js/store.js'));
    ({ data } = await import('../public/js/data.js'));
    mod = await import('../public/js/ui/outfits.js');
    // the data singleton fetches through globalThis.fetch: serve data/outfits.json (+ the manifest) from the repository
    const orig = globalThis.fetch;
    const local = { 'outfits.json': JSON.stringify(OUTFITS), 'assets.json': readFileSync(path.join(ROOT, 'data', 'assets.json'), 'utf8') };
    globalThis.fetch = async (u) => {
      const hit = Object.keys(local).find((k) => String(u).includes(k));
      return hit ? new Response(local[hit], { status: 200 }) : orig(u);
    };
    try { await data.loadAll('outfits', 'assets'); } finally { globalThis.fetch = orig; }
  });
  after(() => { delete globalThis.localStorage; });

  test('a unit wears its owner\'s choice: the own one (no ownerId / the own id), a seat\'s from room.state; summons; voice', (t) => {
    if (!data.get('outfits')) { t.skip('data/outfits.json could not be loaded in this environment'); return; }
    store.set({ me: { playerId: 'p1', name: 'A', token: null }, room: { seats: [{ playerId: 'p1' }, { playerId: 'p2', outfits: { char_1012_skadi2: 'char_1012_skadi2@iteration#2' } }, { playerId: 'bot', isBot: true }] } });
    mod.setOutfits({ char_4064_mlynar: MLYNAR });
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'ally', spine: 'char_4064_mlynar' }), MLYNAR, 'an own piece (no ownerId)');
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'ally', spine: 'char_4064_mlynar', ownerId: 'p1' }), MLYNAR);
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'ally', spine: 'char_4064_mlynar', ownerId: 'p2' }), null, 'the teammate has no outfit on it');
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'ally', spine: 'char_1012_skadi2', ownerId: 'p2' }), 'char_1012_skadi2@iteration#2');
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'ally', spine: 'char_1012_skadi2', ownerId: 'bot' }), null, 'bots wear the default look');
    assert.equal(mod.outfitModelOf({ kind: 'op', side: 'enemy', spine: 'char_4064_mlynar' }), null);
    // Skadi the Corrupting Heart's summon wears the look her outfit gives it
    const tokenId = Object.keys(OUTFITS['char_1012_skadi2@iteration#2'].tokens)[0];
    assert.equal(mod.outfitModelOf({ kind: 'token', side: 'ally', spine: tokenId, ownerId: 'p2' }), OUTFITS['char_1012_skadi2@iteration#2'].tokens[tokenId]);
    assert.equal(mod.outfitModelOf({ kind: 'token', side: 'ally', spine: tokenId, ownerId: 'p1' }), null);
    // voice sets
    assert.equal(mod.outfitVoiceOf({ charId: 'char_4064_mlynar' }), 'char_4064_mlynar_epoque#28', 'the own choice (detail / result lines)');
    assert.equal(mod.outfitVoiceOf({ kind: 'op', spine: 'char_1012_skadi2', ownerId: 'p2' }), 'char_1012_skadi2_iteration#2');
    assert.equal(mod.outfitVoiceOf({ kind: 'token', spine: tokenId, ownerId: 'p2' }), null, 'summons say nothing');
    // the choice persists like the loadout, the default look clears an entry
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem('sp.pref.outfits')).outfits, { char_4064_mlynar: MLYNAR });
    mod.setOutfit('char_4064_mlynar', null);
    assert.deepEqual(mod.outfitStore.get().outfits, {});
    // an import keeps the outfits this build knows
    assert.deepEqual(mod.applyOutfitsImport({ char_4064_mlynar: MLYNAR, char_002_amiya: 'char_002_amiya@nope#99' }), { applied: 1, dropped: 1 });
    // another player's unit (the detail card): THEIR choice, never the viewer's — a teammate without one shows the default
    assert.equal(mod.outfitOptsOf('char_4064_mlynar', null), undefined, 'own unit: the own choice applies by itself');
    assert.equal(mod.outfitOptsOf('char_4064_mlynar', 'p1'), undefined);
    assert.deepEqual(mod.outfitOptsOf('char_4064_mlynar', 'p2'), { outfit: null }, 'the viewer wears W Dali, the teammate does not');
    assert.deepEqual(mod.outfitOptsOf('char_1012_skadi2', 'p2'), { outfit: 'char_1012_skadi2@iteration#2' });
    assert.equal(mod.outfitVoiceOf({ charId: 'char_4064_mlynar', ownerId: 'p2' }), null);
  });

  test('UnitThumb `outfitOwner` (bond popup, result lineup): another player\'s operator wears THEIR outfit, not the viewer\'s', async (t) => {
    if (!data.get('outfits')) { t.skip('data/outfits.json could not be loaded in this environment'); return; }
    const { UnitThumb } = await import('../public/js/ui/gameComponents.js');
    if (!data.get('assets')?.outfits) { t.skip('no assets manifest in the data store'); return; }
    store.set({ me: { playerId: 'p1', name: 'A', token: null }, room: { seats: [{ playerId: 'p1' }, { playerId: 'p2', outfits: { char_1012_skadi2: 'char_1012_skadi2@iteration#2' } }] } });
    mod.setOutfits({ char_4064_mlynar: MLYNAR, char_1012_skadi2: 'char_1012_skadi2@boc#4' });
    const src = (charId, outfitOwner) => {
      const v = UnitThumb({ kind: 'chess', id: 'x', rec: { charId, name: charId, tier: 6 }, outfitOwner });
      const find = (n) => (!n || typeof n !== 'object' ? null : n.type === 'img' || typeof n.props?.src === 'string' ? n.props.src
        : [].concat(n.props?.children || []).map(find).find(Boolean) || null);
      return find(v);
    };
    assert.match(src('char_4064_mlynar', null), /outfit\/avatar\/char_4064_mlynar_epoque_28/, 'own unit: the own outfit');
    assert.doesNotMatch(src('char_4064_mlynar', 'p2') || '', /outfit\//, 'the teammate has none on Młynar: the default look');
    assert.match(src('char_1012_skadi2', 'p2'), /outfit\/avatar\/char_1012_skadi2_iteration_2/, 'the teammate\'s own choice');
    mod.setOutfits({});
  });

  test('installOutfitSync: sends after a welcome and after an edit (debounced), never while offline', async () => {
    const sent = [];
    const handlers = {};
    const net = { status: 'online', on: (t, fn) => { handlers[t] = fn; return () => {}; }, request: async (t, body) => { sent.push([t, body]); return { t: 'ok' }; } };
    const timers = { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout: () => {} };
    const sync = mod.installOutfitSync({ net, timers });
    try {
      handlers.welcome?.({});
      await new Promise((r) => setTimeout(r, 10));
      mod.setOutfits({ char_4064_mlynar: MLYNAR });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepEqual(sent.at(-1), ['room.outfits', { outfits: { char_4064_mlynar: MLYNAR } }]);
      const n = sent.length;
      await sync.flush();
      assert.equal(sent.length, n, 'nothing new to send');
      net.status = 'offline';
      mod.setOutfits({});
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(sent.length, n, 'offline: the next welcome resends');
    } finally { sync.dispose(); }
  });
});
