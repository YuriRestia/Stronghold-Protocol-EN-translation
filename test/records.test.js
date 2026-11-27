// test/records.test.js — (fork, GitHub #32) opt-in match records around the match: SP_RECORDS (server/records.js
// recordsDirFrom), the files (RecordStore: one gzipped JSON per match in a folder per day, the app version and the date,
// no time), the lobby (opts.record only when records are on, the record written and kept out of room.lastSummary), the
// match host relay (wireOptions, the 'record' message before 'end') and tools/records.mjs (reading, tables, --verify).
// The record itself: test/match/records.test.js.
// Run: node --test test/records.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { RecordStore, recordsDirFrom, RECORDS_DEFAULT_DIR } from '../server/records.js';
import { readRecords, summarize, tables, verify } from '../tools/records.mjs';
import { wireOptions, MatchProxy } from '../server/match/host/proxy.js';
import { validHostMessage } from '../server/match/host/ipc.js';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';
import { hasGeneratedData } from '../server/sim/simdata.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-records-'));
const files = (dir) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p)); } }; if (fs.existsSync(dir)) walk(dir); return out; };

test('SP_RECORDS: off unless set; 1/on = logs/records; anything else names the folder', () => {
  // platform paths (Windows: a drive letter and backslashes)
  const root = path.resolve(os.tmpdir(), 'sp-install');
  for (const v of [undefined, '', '  ', '0', 'off', 'OFF', 'false', 'no']) assert.equal(recordsDirFrom(v, root), null, String(v));
  for (const v of ['1', 'on', 'true', 'yes']) assert.equal(recordsDirFrom(v, root), path.join(root, RECORDS_DEFAULT_DIR), v);
  assert.equal(recordsDirFrom('data-out', root), path.join(root, 'data-out'));
  const elsewhere = path.resolve(os.tmpdir(), 'sp-records-elsewhere');
  assert.equal(recordsDirFrom(elsewhere, root), elsewhere, 'an absolute path is kept');
});

test('RecordStore: one gzipped JSON per match in a folder per day, with the app version and the date only', async (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new RecordStore({ dir, now: () => Date.parse('2026-10-21T13:45:00Z'), app: '9.9.9' });
  const a = await store.write({ v: 1, seats: [] });
  const b = await store.write({ v: 1, seats: [] });
  assert.notEqual(a, b);
  assert.deepEqual(files(dir).map((f) => path.dirname(f)), ['2026-10-21', '2026-10-21']);
  assert.ok(files(dir).every((f) => /^[0-9a-f]{12}\.json\.gz$/.test(path.basename(f))));
  const rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(a)).toString('utf8'));
  assert.deepEqual(rec, { app: '9.9.9', date: '2026-10-21', v: 1, seats: [] });
  assert.equal(JSON.stringify(rec).includes('13:45'), false, 'no time of day');
  // nor in the file times (an archive of the folder keeps them): the day's midnight UTC
  assert.equal(fs.statSync(a).mtimeMs, Date.parse('2026-10-21T00:00:00Z'));
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.dirname(a)).mtimeMs, Date.parse('2026-10-21T00:00:00Z'), 'the day folder too');
  // a folder it cannot create: logged, resolved null, never thrown
  const errors = [];
  const blocked = path.join(dir, 'file');
  fs.writeFileSync(blocked, 'x');
  assert.equal(await new RecordStore({ dir: blocked, log: { error: (...x) => errors.push(x) } }).write({ v: 1, seats: [] }), null);
  assert.equal(errors.length, 1);
});

test('match host: the flag is forwarded only when on; the record travels before the end and joins its summary', () => {
  assert.equal('record' in wireOptions({ roomCode: 'ABCD', mode: 'solo' }), false);
  assert.equal('record' in wireOptions({ roomCode: 'ABCD', record: false }), false);
  assert.equal(wireOptions({ roomCode: 'ABCD', record: true }).record, true);
  const rec = { v: 1, seats: [{ seat: 's0', human: true }] };
  assert.equal(validHostMessage({ type: 'record', matchId: 'm1', record: rec }), true);
  assert.equal(validHostMessage({ type: 'record', matchId: 'm1', record: [] }), false);
  const ends = [];
  const p = new MatchProxy({ host: { post() {} }, matchId: 'm1', opts: { send() {}, broadcast() {}, onEnd: (s) => ends.push(s) } });
  p.deliver({ type: 'record', matchId: 'm1', record: rec });
  p.deliver({ type: 'end', matchId: 'm1', summary: { victory: true } });
  assert.deepEqual(ends, [{ victory: true, record: rec }]);
  const q = new MatchProxy({ host: { post() {} }, matchId: 'm2', opts: { send() {}, broadcast() {}, onEnd: (s) => ends.push(s) } });
  q.deliver({ type: 'end', matchId: 'm2', summary: { victory: false } });
  assert.deepEqual(ends[1], { victory: false }, 'an unrecorded match: the summary as it came');
});

/** StubMatch that ends at once with a record, and keeps the options it was given. */
const started = [];
class RecordedStub extends StubMatch {
  constructor(opts) { super(opts); this._opts = opts; started.push(opts); }
  start() { super.start(); setImmediate(() => this._opts.onEnd({ victory: false, roundsPassed: 0, record: { v: 1, mode: 'solo', seats: [{ seat: 's0', human: true }] } })); }
}

async function playSolo(srv) {
  const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
  try {
    await c.hello('Solo Player');
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
    const n = started.length;
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    for (let i = 0; i < 200 && !(started.length > n && [...srv.lobby.rooms.values()].every((r) => !r.match)); i++) await new Promise((r) => setTimeout(r, 10));
    return started[n];
  } finally { await c.terminate().catch(() => {}); }
}

describe('lobby: records on and off', () => {
  const dir = tmp();
  const quiet = { info() {}, warn() {}, debug() {}, error() {} };
  let on, off;
  before(async () => {
    on = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: RecordedStub, recordsDir: dir });
    off = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: RecordedStub });
  });
  after(async () => { await on?.close(); await off?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  test('on: the match is asked to record; its record is written and kept out of the room summary', async () => {
    const opts = await playSolo(on);
    assert.equal(opts.record, true);
    for (let i = 0; i < 100 && !files(dir).length; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(files(dir).length, 1);
    const rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, files(dir)[0]))).toString('utf8'));
    assert.equal(rec.mode, 'solo');
    assert.equal(typeof rec.app, 'string');
    for (const room of on.lobby.rooms.values()) assert.equal(room.lastSummary && 'record' in room.lastSummary, false);
  });

  test('off: the match is not asked to record and nothing is written', async () => {
    const before = files(dir).length;
    const opts = await playSolo(off);
    assert.equal('record' in opts, false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(files(dir).length, before);
  });
});

test('tools/records.mjs: reads a folder (bad files reported), prints the tables, replays the normal battles', { skip: !hasGeneratedData() }, async (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const seats = [
    { seat: 0, playerId: 'p_00000000aa', name: 'H', isBot: false, connected: true },
    { seat: 1, playerId: 'ai_000000bb', name: 'B', isBot: true, connected: true },
  ];
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', seats, seed: 5, record: true, clientCombat: true, captureFrames: false, lobbyRules: { extraFunds: true } });
  h.autoHumans();
  h.m.start();
  h.run(() => h.ended != null, { maxSteps: 5e7 });
  await new RecordStore({ dir, app: '1.0.0' }).write(h.ended.record);
  fs.mkdirSync(path.join(dir, 'other'));
  fs.writeFileSync(path.join(dir, 'other', 'broken.json'), '{');
  // a match everyone left before the first battle: read, but not a result
  await new RecordStore({ dir, app: '1.0.0' }).write({ v: 1, mode: 'solo', difficulty: 'FUNNY', seats: [{ seat: 's0', human: true }], result: { victory: false, reason: 'abandoned', roundsPassed: 0 }, rounds: [], actions: [], battles: [] });
  const { records, bad } = readRecords([dir]);
  assert.equal(records.length, 2);
  assert.equal(bad.length, 1);
  const s = summarize(records);
  assert.deepEqual([s.matches, s.unplayed], [1, 1]);
  assert.equal(s.byMode[0].key, 'coop:FUNNY (2 seats, 1 human)');
  assert.deepEqual(s.bySeat.map((g) => g.key), ['coop:FUNNY · AI', 'coop:FUNNY · human']);
  assert.deepEqual(s.byRule.map((g) => g.key), ['extraFunds']);
  assert.deepEqual(s.byRisk.map((g) => g.key), ['Risk 0, with cheats']);
  assert.equal(s.byRound.length, 0, 'a human under AI 托管 makes no human actions');
  const md = tables(s);
  assert.match(md, /\| coop:FUNNY \(2 seats, 1 human\) \| 1 \|/);
  assert.match(md, /^1 match records \(1 more left out: ended before the first battle\)/);
  const v = await verify(records);
  assert.ok(v.same >= 5, `replayed (${v.same})`);
  assert.deepEqual(v.differ, []);
  // a changed digest: a real mismatch for a record of this version, a maybe for one of another version
  const bent = records.map((r) => ({ ...r, battles: r.battles.map((b, i) => (i === 0 ? { ...b, digest: 'x' } : b)) }));
  const here = await verify(bent, { app: records[0].app });
  assert.equal(here.differ.length, 1);
  assert.deepEqual(here.maybe, []);
  const older = await verify(bent, { app: '999.0.0' });
  assert.deepEqual(older.differ, []);
  assert.equal(older.maybe.length, 1, 'another version: replayed, its difference a maybe');
  assert.equal(older.same, here.same, 'and its other battles still checked');
});
