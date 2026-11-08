// test/avatars.test.js — (fork) player profile icons: data/avatars.json (tools/build-avatars.mjs) and its English names,
// the id check (shared/avatars.js), hello.avatar on the wire, the room seat over WebSocket (a known id only, a repeated
// hello updates it, an older client's hello shows none), the match's m.public / m.result, and the browser's pref.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAvatars, formatAvatars } from '../tools/build-avatars.mjs';
import { ASSISTANT_AVATAR, DEFAULT_AVATAR, avatarOrDefault, isOperatorAvatar, knownAvatar } from '../shared/avatars.js';
import { validateC2S } from '../shared/protocol.js';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { buildResult } from '../server/match/results.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';
import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { getData } from '../server/data.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const CATALOG = read('../data/avatars.json');
const EN = read('../data/i18n/en.json');
const FALLBACK = read('../tools/i18n/fallback-avatars-en.json');
const SPECIAL = 'avatar_special_01';
const UNOFFICIAL = 'avatar_special_77';   // “靓眼银灰”, CN only: our own English name
const OPERATOR = 'char_498_inside';       // 隐现 (chess.json, a seat-card operator)

describe('data/avatars.json', () => {
  test('official groups in sortId order, no ASSISTANT, every icon in exactly one group, the default known', () => {
    assert.deepEqual(CATALOG.groups.map((g) => g.type), ['DYNAMIC', 'SPECIAL', 'ACTIVITY', 'DEFAULT']);
    const ids = CATALOG.groups.flatMap((g) => g.ids);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(new Set(ids), new Set(Object.keys(CATALOG.avatars)));
    assert.equal(CATALOG.defaultId, DEFAULT_AVATAR);
    assert.ok(CATALOG.avatars[DEFAULT_AVATAR]);
    for (const [id, a] of Object.entries(CATALOG.avatars)) assert.match(id, /^avatar_[A-Za-z0-9_]+$/, id), assert.equal(typeof a.name, 'string');
  });

  test('every icon has an English name; the unofficial ones are exactly the fallback list', () => {
    const names = EN.files.avatars.avatars;
    const cjk = /[㐀-鿿]/;
    // a name with no Chinese in it ('“Wink——”') needs no translation and has no overlay entry
    for (const [id, a] of Object.entries(CATALOG.avatars)) assert.ok(names[id] ? !cjk.test(names[id].name) : !cjk.test(a.name), `${id} has an English name`);
    assert.deepEqual(EN.files.avatars.groups[3], { name: 'Default Icon' });
    const flagged = Object.entries(CATALOG.avatars).filter(([, a]) => a.unofficial).map(([, a]) => a.name).sort();
    assert.deepEqual(flagged, [...FALLBACK._unofficial].sort());
    assert.equal(CATALOG.avatars[UNOFFICIAL].unofficial, true);
    assert.equal(names[UNOFFICIAL].name, "'Dazzling SilverAsh'");
    assert.equal(CATALOG.avatars.avatar_special_11.unofficial, undefined, 'a wiki (official EN) name is not marked');
  });

  test('buildAvatars: groups, the unofficial flag and a warning for an icon with no English name', () => {
    const zh = { playerAvatarData: { defaultAvatarId: 'avatar_def_01',
      avatarTypeData: { DEFAULT: { avatarType: 'DEFAULT', typeName: '默认头像', sortId: 5, avatarIdList: ['avatar_def_01'] },
        ASSISTANT: { avatarType: 'ASSISTANT', typeName: '名片形象', sortId: 1, avatarIdList: ['avatar_ass_01'] },
        SPECIAL: { avatarType: 'SPECIAL', typeName: '特殊获取', sortId: 3, avatarIdList: ['avatar_special_01', 'avatar_special_02', 'avatar_special_03'] } },
      avatarList: [{ avatarId: 'avatar_def_01', avatarItemName: '“符号”' }, { avatarId: 'avatar_ass_01', avatarItemName: '助理干员' },
        { avatarId: 'avatar_special_01', avatarItemName: '“甲”' }, { avatarId: 'avatar_special_02', avatarItemName: '“乙”' },
        { avatarId: 'avatar_special_03', avatarItemName: '“丙”' }] } };
    const en = { playerAvatarData: { avatarList: [{ avatarId: 'avatar_def_01' }, { avatarId: 'avatar_special_01' }] } };
    const { doc, warnings } = buildAvatars({ zh, en, fallbackEn: { '“乙”': "'B'", _unofficial: ['“乙”'] } });
    assert.deepEqual(doc.groups.map((g) => [g.type, g.ids.length]), [['SPECIAL', 3], ['DEFAULT', 1]]);
    assert.equal(doc.avatars.avatar_special_02.unofficial, true);
    assert.equal(doc.avatars.avatar_special_01.unofficial, undefined);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /avatar_special_03/);
    assert.equal(formatAvatars(doc), formatAvatars(JSON.parse(formatAvatars(doc))), 'stable output');
  });
});

describe('shared/avatars.js', () => {
  test('knownAvatar keeps a catalog id only; avatarOrDefault falls back to the default icon', () => {
    assert.equal(knownAvatar(SPECIAL, CATALOG), SPECIAL);
    for (const bad of [null, undefined, 3, '', 'avatar_nope', 'https://evil.example/x.png', '__proto__', 'constructor', 'x'.repeat(200)]) {
      assert.equal(knownAvatar(bad, CATALOG), null, String(bad));
      assert.equal(avatarOrDefault(bad, CATALOG), DEFAULT_AVATAR, String(bad));
    }
    assert.equal(knownAvatar(SPECIAL, null), null);
    assert.equal(avatarOrDefault(SPECIAL, null), null);
    // an operator: only one of the room's seat-card operators
    const ops = new Set([OPERATOR]);
    assert.equal(knownAvatar(OPERATOR, CATALOG, ops), OPERATOR);
    assert.equal(knownAvatar(OPERATOR, CATALOG), null, 'no operator list, no operator');
    assert.equal(knownAvatar('char_9999_fake', CATALOG, ops), null);
    assert.equal(avatarOrDefault('char_9999_fake', CATALOG, ops), DEFAULT_AVATAR);
    assert.equal(knownAvatar(ASSISTANT_AVATAR, CATALOG, ops), null, 'the Assistant pick never travels');
    assert.equal(isOperatorAvatar(OPERATOR), true);
    assert.equal(isOperatorAvatar('char_1_x/../y'), false);
  });

  test('hello.avatar on the wire: optional, a short string; anything else is a bad hello', () => {
    // validateC2S: null = valid, else the reason
    assert.equal(validateC2S({ t: 'hello', name: 'Doc' }), null);
    assert.equal(validateC2S({ t: 'hello', name: 'Doc', avatar: SPECIAL }), null);
    assert.equal(validateC2S({ t: 'hello', name: 'Doc', avatar: 'avatar_unknown' }), null, 'the lobby, not the wire, drops an unknown id');
    for (const bad of [42, {}, ['avatar_def_01'], 'x'.repeat(49)]) assert.notEqual(validateC2S({ t: 'hello', name: 'Doc', avatar: bad }), null, JSON.stringify(bad));
  });
});

const quietLog = () => ({ info() {}, warn() {}, debug() {}, error() {} });
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id);

describe('room seats (lobby, stub match)', () => {
  let srv;
  const open = new Set();
  const player = async (name, extra) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name, null, extra);
    c.id = w.playerId;
    return c;
  };
  before(async () => { srv = await startServer({ port: 0, host: '127.0.0.1', log: quietLog(), MatchClass: StubMatch }); });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); });

  test('a known icon shows on the seat for everyone; an unknown one and an older client\'s hello show none', async () => {
    const a = await player('Alpha', { avatar: SPECIAL });
    const r = await a.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' });
    assert.equal(r.t, 'ok');
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id);
    assert.equal(seatOf(st, a.id).avatar, SPECIAL);
    const b = await player('Bravo', { avatar: 'https://evil.example/x.png' });
    assert.equal((await b.request({ t: 'room.join', code: st.code })).t, 'ok');
    const st2 = await a.waitFor('room.state', (s) => !!seatOf(s, b.id));
    assert.equal(seatOf(st2, a.id).avatar, SPECIAL);
    assert.equal('avatar' in seatOf(st2, b.id), false, 'an unknown id is never published');
    const c = await player('Charlie');
    assert.equal((await c.request({ t: 'room.join', code: st.code })).t, 'ok');
    const st3 = await c.waitFor('room.state', (s) => !!seatOf(s, c.id));
    assert.equal('avatar' in seatOf(st3, c.id), false, 'an older client (no field) shows the default icon');
  });

  test('an operator of the room seat cards is kept; an unknown operator id is dropped', async () => {
    const a = await player('Echo', { avatar: OPERATOR });
    assert.equal((await a.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' })).t, 'ok');
    const st = await a.waitFor('room.state', (s) => seatOf(s, a.id)?.avatar === OPERATOR);
    const b = await player('Foxtrot', { avatar: 'char_9999_fake' });
    assert.equal((await b.request({ t: 'room.join', code: st.code })).t, 'ok');
    const st2 = await a.waitFor('room.state', (s) => !!seatOf(s, b.id));
    assert.equal('avatar' in seatOf(st2, b.id), false);
  });

  test('a repeated hello with another icon updates the seat; one without it clears it', async () => {
    const a = await player('Delta', { avatar: SPECIAL });
    assert.equal((await a.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' })).t, 'ok');
    await a.waitFor('room.state', (s) => seatOf(s, a.id)?.avatar === SPECIAL);
    await a.hello('Delta', null, { avatar: UNOFFICIAL });
    await a.waitFor('room.state', (s) => seatOf(s, a.id)?.avatar === UNOFFICIAL);
    await a.hello('Delta');
    await a.waitFor('room.state', (s) => !!seatOf(s, a.id) && !('avatar' in seatOf(s, a.id)));
  });
});

describe('Grand Alliance (8 seats)', () => {
  test('every one of the 8 seats carries its icon, through a seat move and a host swap, into the match', () => {
    class Rec { static last = null; constructor(opts) { Rec.last = opts; } start() {} dispose() {} onLeave() {} onDisconnect() {} }
    const registry = new SessionRegistry();
    const quiet = { info() {}, warn() {}, error() {}, debug() {} };
    const lobby = new Lobby({ registry, log: quiet, MatchClass: Rec, content: { cs: 'a0'.repeat(32) }, getData, options: { largeRooms: true, roomListGapMs: 0 } });
    const icons = [SPECIAL, UNOFFICIAL, OPERATOR, 'avatar_def_02', 'avatar_def_03', 'avatar_dyn_01', 'avatar_activity_mujica', 'char_9999_fake'];
    const states = [];
    const ps = icons.map((avatar, i) => {
      const sess = registry.create(`P${i}`);
      Object.assign(sess, { connected: true, disconnectedAt: null, avatar });
      sess.ws = { readyState: 1, bufferedAmount: 0, send(d) { const m = JSON.parse(d); if (m.t === 'room.state') states.push(m); }, terminate() {} };
      return sess;
    });
    assert.deepEqual(lobby.create(ps[0], { mode: 'coop', capacity: 8 }), { ok: true });
    const code = states.at(-1).code;
    for (const p of ps.slice(1)) assert.deepEqual(lobby.join(p, { code }), { ok: true });
    const seatsOf = () => states.at(-1).seats.map((x) => x?.avatar ?? null);
    assert.deepEqual(seatsOf(), [...icons.slice(0, 7), null], 'seat 8: an unknown operator id is dropped');
    const room = lobby.rooms.get(code);
    lobby.leave(ps[3]);
    assert.equal(room.seats[3], null);
    assert.deepEqual(lobby.moveSeat(ps[7], { seat: 3 }), { ok: true });
    assert.equal('avatar' in states.at(-1).seats[3], false);
    assert.deepEqual(lobby.swapSeats(ps[0], { a: 1, b: 3 }), { ok: true });
    assert.equal(states.at(-1).seats[3].avatar, UNOFFICIAL, 'the swapped seat keeps its icon');
    assert.equal(states.at(-1).seats[1].name, 'P7');
    for (const s of room.seats) if (s) s.ready = true;
    assert.deepEqual(lobby.start(ps[0]), { ok: true });
    const bySeat = Object.fromEntries(Rec.last.seats.map((s) => [s.playerId, s.avatar]));
    assert.equal(bySeat[ps[0].playerId], SPECIAL);
    assert.equal(bySeat[ps[2].playerId], OPERATOR);
    assert.equal(bySeat[ps[7].playerId], null);
  });
});

describe('match', () => {
  test('m.public and m.result carry a human\'s icon; a seat without one and a bot carry none', () => {
    const seats = [
      { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, avatar: SPECIAL },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, avatar: null },
      { seat: 2, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true, avatar: SPECIAL },
    ];
    const h = makeMatch({ mode: 'coop', seats, seed: 7 }).start();
    const pub = h.lastBc('m.public');
    const by = Object.fromEntries(pub.players.map((p) => [p.playerId, p]));
    assert.equal(by.p_0.avatar, SPECIAL);
    assert.equal('avatar' in by.p_1, false);
    assert.equal('avatar' in by.ai_0, false);
    const res = buildResult(h.m, { victory: false, reason: 'test' });
    const rows = Object.fromEntries(res.players.map((p) => [p.playerId, p]));
    assert.equal(rows.p_0.avatar, SPECIAL);
    assert.equal('avatar' in rows.p_1, false);
    h.m.dispose();
  });
});

describe('browser pref (ui/avatars.js)', () => {
  test('the pick is saved under sp.pref.profile.avatar and restored, junk dropped; playerAvatarId', async () => {
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    mem.set('sp.pref.profile.avatar', JSON.stringify(SPECIAL));
    const av = await import('../public/js/ui/avatars.js');
    const { net } = await import('../public/js/net.js');
    assert.equal(av.avatarStore.get()[av.AVATAR_KEY], SPECIAL, 'restored on load');
    assert.equal(net.avatar, SPECIAL, 'the first hello carries it');
    av.setAvatar(UNOFFICIAL);
    assert.equal(mem.get('sp.pref.profile.avatar'), JSON.stringify(UNOFFICIAL));
    assert.equal(net.avatar, UNOFFICIAL);
    av.setAvatar('javascript:alert(1)');
    assert.equal(mem.get('sp.pref.profile.avatar'), JSON.stringify(''));
    assert.equal(net.avatar, null);
    assert.equal(av.parseStoredAvatar(42), '');
    assert.equal(av.playerAvatarId({ isBot: true, avatar: SPECIAL }, { catalog: CATALOG }), null, 'a bot without an operator: the robot');
    assert.equal(av.playerAvatarId({ isBot: true, name: 'AI·华法琳' }, { catalog: CATALOG }), 'char_171_bldsk', 'an AI teammate: its operator');
    assert.equal(av.playerAvatarId({ avatar: OPERATOR }, { catalog: CATALOG }), OPERATOR);
    assert.equal(av.playerAvatarId({}, { self: true, mine: ASSISTANT_AVATAR, assistant: OPERATOR, catalog: CATALOG }), OPERATOR);
    // the Assistant pick is sent as the room card's operator: the pick, else the card's default (by player id)
    const list = [{ charId: OPERATOR, rarity: 4 }, { charId: 'char_1012_skadi2', rarity: 6 }];
    assert.equal(av.sentAvatar(ASSISTANT_AVATAR, { card: OPERATOR, playerId: 'p1', list }), OPERATOR);
    assert.equal(av.sentAvatar(ASSISTANT_AVATAR, { card: '', playerId: 'p1', list }), 'char_1012_skadi2');
    assert.equal(av.sentAvatar(SPECIAL), SPECIAL);
    assert.equal(av.sentAvatar(''), null);
    av.setAvatar(OPERATOR);
    assert.equal(net.avatar, OPERATOR);
    assert.equal(av.playerAvatarId({ avatar: 'nope' }, { catalog: CATALOG }), DEFAULT_AVATAR);
    assert.equal(av.playerAvatarId({ avatar: SPECIAL }, { self: true, mine: UNOFFICIAL, catalog: CATALOG }), UNOFFICIAL);
    const groups = av.pickerGroups(CATALOG, (id) => (id === SPECIAL || id === UNOFFICIAL ? `/a/${id}.webp` : null));
    assert.deepEqual(groups.map((g) => [g.type, g.icons.map((i) => [i.id, i.unofficial])]), [['SPECIAL', [[SPECIAL, false], [UNOFFICIAL, true]]]]);
    assert.deepEqual(av.pickerGroups(CATALOG, () => null), [], 'no art: no picker');
  });
});
