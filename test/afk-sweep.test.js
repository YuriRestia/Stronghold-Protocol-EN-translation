// GitHub #193: while the server is closed for maintenance, a human silent on a choice screen is removed, and a match whose
// humans are all silent is ended — so one dangling or AFK match cannot hold up the restart window.
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';
import { PHASE } from '../shared/constants.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-afk-')), 'maintenance.json');
const write = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj));
const log = { info() {}, warn() {}, debug() {}, error() {} };

// a stub match whose silent humans the test sets
const report = { humans: null };
class SilentMatch extends StubMatch {
  maybeFinish() { /* the stub's briefing timer must not end it: only the sweep may */ }
  afkReport() { return report.humans ? { phase: 'PREP', humans: report.humans.map((h) => ({ ...h })) } : null; }
}

describe('Lobby.sweepAfk (closed for maintenance)', () => {
  const servers = [];
  const open = new Set();
  const boot = async (opts = {}) => {
    const file = tmpFile();
    const srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: SilentMatch, noticeFile: null, maintenanceFile: file, maintenancePollMs: 20, ...opts });
    servers.push(srv);
    return { srv, file };
  };
  const player = async (srv, name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  const solo = async (srv) => {
    const c = await player(srv, 'Solo');
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    return c;
  };
  const close = async (srv, file) => { write(file, { createdAt: Date.now(), closed: true }); for (let i = 0; i < 100 && !srv.maintenance.closed(); i++) await new Promise((r) => setTimeout(r, 20)); assert.ok(srv.maintenance.closed()); };
  afterEach(async () => { report.humans = null; await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await Promise.all(servers.map((s) => s.close())); });

  test('a human silent for 120 s is removed with room.closed {afk}; one silent for less is not; an open server removes nobody', async () => {
    const { srv, file } = await boot();
    const c = await solo(srv);
    report.humans = [{ playerId: c.id, idleMs: 130_000 }];
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.lobby.stats().matches, 1, 'open: nobody is removed');
    report.humans = null;
    await close(srv, file);
    report.humans = [{ playerId: c.id, idleMs: 119_000 }];
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.lobby.stats().matches, 1, '119 s is not enough');
    report.humans = [{ playerId: c.id, idleMs: 121_000 }];
    const closed = await c.waitFor('room.closed');
    assert.equal(closed.reason, 'afk');
    assert.equal(srv.lobby.stats().matches, 0, 'the match is gone: the restart can go ahead');
  });

  test('every human silent for 150 s ends the match even when the kick is off; a match not on a choice screen is left alone', async () => {
    const { srv, file } = await boot({ afkKickMs: 0 });
    const c = await solo(srv);
    await close(srv, file);
    report.humans = null; // a battle: nothing to report
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.lobby.stats().matches, 1);
    report.humans = [{ playerId: c.id, idleMs: 149_000 }];
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(srv.lobby.stats().matches, 1, '149 s: still running');
    report.humans = [{ playerId: c.id, idleMs: 151_000 }];
    assert.equal((await c.waitFor('room.closed')).reason, 'afk');
    assert.equal(srv.lobby.stats().matches, 0);
  });
});

describe('Match.afkReport', () => {
  test('only on a choice screen; the clock is the later of the last game action and the screen coming up; passive intents and 托管 do not count', () => {
    const h = makeMatch({ mode: 'coop', humans: 2 }).start();
    try {
      const m = h.m;
      assert.equal(m.phase, PHASE.INFO_CHECK);
      const r0 = m.afkReport();
      assert.deepEqual(r0.humans.map((x) => x.playerId), ['p_0', 'p_1']);
      h.sched.advance?.(60_000);
      h.m.sched.now();
      const idle = () => Object.fromEntries(m.afkReport().humans.map((x) => [x.playerId, x.idleMs]));
      const t0 = m.sched.now();
      m.handle('p_0', { t: 'g.watch', fieldId: 'x' });
      m.handle('p_0', { t: 'g.infoReady' });
      assert.ok(m.players.get('p_0').lastActionAt >= t0, 'a game action stamps the seat');
      assert.equal(m.players.get('p_1').lastActionAt ?? 0, 0, 'the other seat did nothing');
      const i = idle();
      assert.ok(i.p_0 <= i.p_1, 'the active one is less idle');
      m.players.get('p_1').autoplay = true;
      assert.deepEqual(m.afkReport().humans.map((x) => x.playerId), ['p_0'], 'a seat on AI 托管 is played by the bot: not listed');
      m.phase = PHASE.COMBAT;
      assert.equal(m.afkReport(), null, 'a battle runs by itself');
    } finally { h.dispose?.(); }
  });
});
