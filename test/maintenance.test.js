// Planned maintenance (server/maintenance.js, scripts/maintenance.mjs, public/js/ui/maintenance.js): the file the
// operator writes, what players are sent, which new matches are refused while closed, and the one-shot idle stop.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { MaintenanceBoard, parseMaintenance } from '../server/maintenance.js';
import { nextState, nextClockTime, probe, stopped } from '../scripts/maintenance.mjs';
import http from 'node:http';
import { formatCountdown, maintenanceText } from '../public/js/ui/maintenance.js';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-maint-')), 'maintenance.json');
const write = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj));

const SCRIPT = fileURLToPath(new URL('../scripts/maintenance.mjs', import.meta.url));

test('parseMaintenance: a time, closed, stop-when-idle, downtime and message; nothing set or malformed is null', () => {
  assert.deepEqual(parseMaintenance({ createdAt: 5, at: 100, closed: true }),
    { createdAt: 5, at: 100, closed: true, stopWhenIdle: false, backIn: null, backAt: null, message: null });
  assert.equal(parseMaintenance({ createdAt: 5, message: '  update 0.2.3  ' }).message, 'update 0.2.3');
  assert.equal(parseMaintenance({ createdAt: 5, closed: true, backIn: 20 }).backIn, 20);
  assert.equal(parseMaintenance({ createdAt: 5, at: null, closed: false, stopWhenIdle: false }), null);
  assert.equal(parseMaintenance({ at: 100 }), null, 'no createdAt');
  assert.equal(parseMaintenance([1]), null);
});

test('board: sends the state to everyone, ignores a file older than the server, clears, and stops once when idle', async () => {
  const file = tmpFile();
  const sent = [];
  const session = { id: 's1', connected: true };
  const registry = { all: () => [session] };
  let matches = 1;
  const lobby = { stats: () => ({ matches }) };
  // net.js sendSession needs a socket: count the frames through a fake one
  session.ws = { readyState: 1, OPEN: 1, send: (raw) => sent.push(JSON.parse(raw)), bufferedAmount: 0 };
  let now = 1000;
  const board = new MaintenanceBoard({ file, registry, lobby, startedAt: 1000, now: () => now });
  let stops = 0;
  board.onStop = () => stops++;

  write(file, { createdAt: 999, at: 5000, closed: true }); // written before the server started
  await board.check();
  assert.equal(board.state(), null);
  assert.equal(board.closed(), false);
  assert.equal(fs.existsSync(file), false, 'a file from before the start is removed');

  now = 1200;
  write(file, { createdAt: 1100, at: 5000, closed: true, pad: 'x' });
  await board.check();
  assert.equal(board.closed(), true);
  assert.deepEqual(board.report(), { at: 5000, closed: true, stopWhenIdle: false, backIn: null, backAt: null, message: null });
  fs.rmSync(file);
  await board.check();
  assert.equal(board.state(), null);
  let frames = sent.filter((m) => m.t === 'sys.maintenance');
  assert.deepEqual({ at: frames.at(-1).at, closed: frames.at(-1).closed, stopping: frames.at(-1).stopping }, { at: null, closed: false, stopping: false }, 'cleared');

  write(file, { createdAt: 1300, closed: true, stopWhenIdle: true, backIn: 20 });
  now = 1400;
  await board.check();
  assert.equal(stops, 0, 'a match is live');
  matches = 0;
  await board.check();
  await board.check();
  assert.equal(stops, 1, 'stops once the last match ends, only once');
  frames = sent.filter((m) => m.t === 'sys.maintenance');
  assert.equal(frames.at(-1).stopping, true, 'players are told before it stops');
  assert.equal(frames.at(-1).backAt, 1400 + 20 * 60000, 'back = stop time + the downtime');
  assert.equal(fs.existsSync(file), false, 'one-shot: the setting is used up');
});

describe('lobby while closed for maintenance', () => {
  let srv;
  let file;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    return c;
  };
  const refused = async (c, msg) => {
    const r = await c.request(msg);
    assert.equal(r.t, 'error', `${msg.t}: ${JSON.stringify(r)}`);
    assert.equal(r.code, ERR.MAINTENANCE, msg.t);
  };
  const waitFor = async (pred) => {
    for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(pred());
  };

  before(async () => {
    file = tmpFile();
    const log = { info() {}, warn() {}, debug() {}, error() {} };
    srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: StubMatch, noticeFile: null, maintenanceFile: file, maintenancePollMs: 20 });
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
  });
  after(async () => { await srv?.close(); });

  test('create, start, solo matchmaking and Find Teammates are refused; players get the countdown; reopening allows them', async () => {
    const host = await player('Host');
    assert.equal((await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok', 'created before closing');

    write(file, { createdAt: Date.now(), at: Date.now() + 600000, closed: true });
    await waitFor(() => srv.maintenance.closed());
    const notice = await host.waitFor('sys.maintenance', (m) => m.closed === true);
    assert.ok(notice.at > Date.now() && Number.isFinite(notice.serverNow));

    const late = await player('Late');
    await late.waitFor('sys.maintenance', (m) => m.closed === true); // a new session gets it on hello
    await refused(late, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await refused(late, { t: 'queue.join', difficulty: 'NORMAL' });
    await refused(host, { t: 'room.search', on: true });
    await refused(host, { t: 'room.start' });
    const health = await (await fetch(`http://127.0.0.1:${srv.port}/healthz`)).json();
    assert.equal(health.maintenance.closed, true);

    write(file, { createdAt: Date.now(), at: null, closed: false, stopWhenIdle: false, reopened: true });
    await waitFor(() => !srv.maintenance.closed());
    assert.equal((await host.request({ t: 'room.start' })).t, 'ok');
  });
});

test('script: options add to the current state; --in / --at, --close / --open, --stop-when-idle / --keep-running', () => {
  const now = new Date(2026, 9, 11, 20, 0, 0).getTime();
  const a = nextState(null, { in: '15', close: true }, now);
  assert.deepEqual(a, { createdAt: now, at: now + 15 * 60000, closed: true, stopWhenIdle: false, backIn: null, backAt: null, message: null });
  const c = nextState(a, { 'back-in': '20', message: 'Update 0.2.3' }, now);
  assert.deepEqual([c.backIn, c.backAt, c.message, c.at], [20, null, 'Update 0.2.3', a.at]);
  const d = nextState(c, { 'back-at': '21:45', message: '' }, now);
  assert.deepEqual([d.backIn, d.backAt, d.message], [null, new Date(2026, 9, 11, 21, 45).getTime(), null]);
  assert.throws(() => nextState(null, { 'back-in': '5', 'back-at': '21:00' }, now));
  const b = nextState(a, { 'stop-when-idle': true }, now + 1000);
  assert.equal(b.at, a.at, 'the countdown is kept');
  assert.equal(b.closed, true);
  assert.equal(b.stopWhenIdle, true);
  assert.equal(nextState({ at: null, closed: true }, { open: true }, now), null, 'nothing left: the file is removed');
  assert.equal(nextClockTime('21:30', now), new Date(2026, 9, 11, 21, 30).getTime());
  assert.equal(nextClockTime('19:00', now), new Date(2026, 9, 12, 19, 0).getTime(), 'past: tomorrow');
  assert.equal(nextClockTime('25:00', now), null);
  assert.throws(() => nextState(null, { in: '5', at: '21:00' }, now));
  assert.throws(() => nextState(null, { in: '0' }, now));
});

test('bar text: a live countdown on the server clock, "now" once reached, and the closed note', () => {
  assert.equal(formatCountdown(9 * 60000 + 41500), '9:42');
  assert.equal(formatCountdown(3600000 + 65000), '1:01:05');
  assert.equal(formatCountdown(-5), '0:00');
  assert.match(maintenanceText({ at: 10000, closed: false }, 0), /0:10/);
  assert.notEqual(maintenanceText({ at: 10000, closed: false }, 20000), maintenanceText({ at: 10000, closed: false }, 0));
  assert.ok(maintenanceText({ at: null, closed: true }, 0).includes(' · '));
  assert.equal(maintenanceText(null, 0), null);
  const idle = maintenanceText({ at: null, closed: true, stopWhenIdle: true, backIn: 20 }, 0);
  assert.ok(idle.split(' · ').length === 3, idle);
  const back = new Date(2026, 9, 12, 21, 45).getTime();
  assert.match(maintenanceText({ stopping: true, backAt: back }, 0), /(21|9):45/, "the player's own clock format");
  assert.match(maintenanceText({ at: null, closed: false, message: 'Update 0.2.3' }, 0), /Update 0\.2\.3/);
});

/** Run scripts/maintenance.mjs; resolves to { code, out }. */
function runScript(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    // a hang fails the test instead of the CI job
    const timer = setTimeout(() => { out += '\n[killed after 30 s]'; child.kill(); }, 30000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('--wait: refuses without a server (nothing written), and returns 0 only once the server has stopped', async () => {
  const file = tmpFile();
  const none = await runScript(['--file', file, '--port', '1', '--close', '--stop-when-idle', '--wait']);
  assert.equal(none.code, 1, none.out);
  assert.equal(fs.existsSync(file), false, 'a wrong port leaves nothing behind');
  const noStop = await runScript(['--file', file, '--port', '1', '--close', '--wait']);
  assert.equal(noStop.code, 1, '--wait needs --stop-when-idle');

  const log = { info() {}, warn() {}, debug() {}, error() {} };
  const srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: StubMatch, noticeFile: null, maintenanceFile: file, maintenancePollMs: 50 });
  let stoppedAt = 0;
  srv.maintenance.onStop = () => { stoppedAt = Date.now(); void srv.close(); }; // runMain does the same with the SIGTERM path
  const r = await runScript(['--file', file, '--port', String(srv.port), '--close', '--stop-when-idle', '--back-in', '20', '--wait']);
  assert.equal(r.code, 0, r.out);
  assert.ok(stoppedAt > 0, 'the server stopped itself');
  assert.match(r.out, /Server stopped\./);
  assert.equal(fs.existsSync(file), false, 'used up');
});

test('--wait: a server that stops before the first wait probe counts as stopped (no race with an idle server)', async () => {
  const file = tmpFile();
  // answers the check made before the file is written, then is gone: an idle server that picked the file up at once
  const once = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: 1, app: 'test', uptimeSec: 5, matches: 0 }));
    once.close();
    once.closeAllConnections();
  });
  await new Promise((resolve) => once.listen(0, '127.0.0.1', resolve));
  const r = await runScript(['--file', file, '--port', String(once.address().port), '--close', '--stop-when-idle', '--wait']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Server stopped\./);
});

test('probe: tells our server, another program, nothing listening and a hang apart; only the first two mean "stopped"', async () => {
  const listen = (handler) => new Promise((resolve) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => resolve(s)); });
  const other = await listen((req, res) => { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>Not found</h1>'); });
  const hang = await listen(() => { /* never answers */ });
  try {
    const o = await probe(other.address().port, ['127.0.0.1'], 500);
    assert.equal(o.ours, null);
    assert.equal(o.tries[0].kind, 'other');
    assert.equal(stopped(o), true, 'another program on the port: ours is not there');
    const gone = await listen(() => {});
    const freePort = gone.address().port;
    await new Promise((r) => gone.close(r));
    const free = await probe(freePort, ['127.0.0.1'], 500);
    assert.equal(free.tries[0].kind, 'refused');
    assert.equal(stopped(free), true);
    const h = await probe(hang.address().port, ['127.0.0.1'], 300);
    assert.equal(h.tries[0].kind, 'timeout');
    assert.equal(stopped(h), false, 'a slow answer is not a stop: --wait keeps waiting');
  } finally {
    hang.closeAllConnections?.();
    await Promise.all([other, hang].map((s) => new Promise((r) => s.close(r))));
  }
  const log = { info() {}, warn() {}, debug() {}, error() {} };
  const srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: StubMatch, noticeFile: null, maintenanceFile: null });
  try {
    const ours = await probe(srv.port, ['::1', '127.0.0.1'], 1000);
    assert.ok(ours.ours && ours.host === '127.0.0.1', 'falls through to the address that answers');
  } finally { await srv.close(); }
});


test('Ctrl+C guard: asks first only in a terminal with live matches; the second press within 10 s stops', async () => {
  const { interruptGuard, INTERRUPT_CONFIRM_MS } = await import('../server/http/boot.js');
  let now = 0;
  let live = 2;
  const g = interruptGuard({ interactive: true, liveMatches: () => live, now: () => now });
  assert.match(g(), /2 match\(es\) in progress/);
  now += 3000;
  assert.equal(g(), null, 'confirmed: stop');
  now += INTERRUPT_CONFIRM_MS + 1;
  assert.ok(g(), 'a later press asks again');
  live = 0;
  now += INTERRUPT_CONFIRM_MS + 1;
  assert.equal(g(), null, 'no match live: stop at once');
  const service = interruptGuard({ interactive: false, liveMatches: () => 3 });
  assert.equal(service(), null, 'not a terminal (systemd, NSSM, Docker): stop at once');
  const broken = interruptGuard({ interactive: true, liveMatches: () => { throw new Error('x'); } });
  assert.equal(broken(), null, 'when the count fails, do not block the stop');
});
