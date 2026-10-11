import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/index.js';
import { TestClient } from '../helpers/wsClient.js';
import { PHASE, EMOTES } from '../../shared/constants.js';

const ok = async (c, msg) => {
  const r = await c.request(msg);
  assert.equal(r.t, 'ok', JSON.stringify(r));
};

// Exercise the real lobby/session routing after the match has eliminated a leaker. Only the battle outcome is
// supplied directly: these tests target room ownership, not a particular operator composition or wave duration.
for (const leaverSeat of [0, 1]) for (const phase of [PHASE.PREP, PHASE.COMBAT, PHASE.UNITE]) {
  test(`an eliminated ${leaverSeat === 0 ? 'host' : 'guest'} leaving ${phase} cannot evict the survivor`, async (t) => {
    const errors = [], clients = [];
    const srv = await startServer({ port: 0, host: '127.0.0.1', seedFn: () => 123,
      log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } });
    t.after(async () => { await Promise.all(clients.map(c => c.terminate())); await srv.close(); assert.deepEqual(errors, []); });
    for (const name of ['Host', 'Guest']) {
      const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      clients.push(c); const w = await c.hello(name); c.id = w.playerId; c.token = w.token;
    }
    const [host, guest] = clients;
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const state = await host.waitFor('room.state');
    await ok(guest, { t: 'room.join', code: state.code });
    await ok(guest, { t: 'room.ready', ready: true });
    await ok(host, { t: 'room.start' });
    await host.waitFor('m.public', p => p.phase === PHASE.INFO_CHECK);
    const room = srv.lobby.rooms.get(state.code), m = room.match;
    // Stop phase progression without replacing the actual match/lobby/session implementation.
    m.setDeadline(0); m.phase = phase; m.round = 2;
    for (const ps of m.order) ps.lp = 20;
    const leaver = clients[leaverSeat], survivor = clients[1 - leaverSeat];
    const lost = m.players.get(leaver.id); lost.lp = 0; lost.eliminate(2);
    await ok(leaver, { t: 'g.leave' });
    const leftAgain = await leaver.request({ t: 'room.leave' });
    assert.equal(leftAgain.code, 'NOT_IN_ROOM', 'the UI tolerates this only on the departing client');
    const retained = await survivor.waitFor('room.state', r => r.code === state.code && !r.seats.some(s => s?.playerId === leaver.id && s.connected));
    assert.ok(retained.seats.some(s => s?.playerId === survivor.id && s.connected));
    assert.equal(room.seatOf(leaver.id).left, true);
    assert.equal(retained.hostId, survivor.id);
    assert.equal(srv.lobby.registry.byId(survivor.id).roomCode, state.code);
    assert.equal(room.match, m); assert.equal(m.ended, false);
    await ok(survivor, { t: 'g.emote', id: EMOTES[0] });
    assert.equal(survivor.log.some(x => x.t === 'room.closed'), false);
    await survivor.terminate();
    const restored = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`); clients.push(restored);
    const w = await restored.hello('Survivor', survivor.token); assert.equal(w.playerId, survivor.id);
    assert.equal((await restored.waitFor('room.state')).code, state.code);
    await ok(restored, { t: 'g.autoplay', on: false });
  });
}
