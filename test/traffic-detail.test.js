// (fork) The dev traffic meter (server/http/trafficDetail.js, tools/traffic-report.mjs; SERVER COST rule): messages and
// bytes per type, per room and per second; off — and nothing wrapped — unless SP_TRAFFIC_METER=1 on a dev server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrafficDetail, trafficMeterEnabled, messageType, summarize, MAX_TYPES, MAX_SECONDS } from '../server/http/trafficDetail.js';
import { LLM_RELEASE_MARKER } from '../server/match/llmRelease.js';
import { parseArgs, formatSummary } from '../tools/traffic-report.mjs';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

test('on only with SP_TRAFFIC_METER=1, and never in production, a generation deploy or a packaged release', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-traffic-meter-'));
  try {
    assert.equal(trafficMeterEnabled({}, dir), false);
    assert.equal(trafficMeterEnabled({ SP_TRAFFIC_METER: '1' }, dir), true);
    assert.equal(trafficMeterEnabled({ SP_TRAFFIC_METER: 'yes' }, dir), false);
    assert.equal(trafficMeterEnabled({ SP_TRAFFIC_METER: '1', NODE_ENV: 'production' }, dir), false);
    assert.equal(trafficMeterEnabled({ SP_TRAFFIC_METER: '1', SP_GEN: 'g12' }, dir), false);
    mkdirSync(join(dir, 'server'), { recursive: true });
    writeFileSync(join(dir, LLM_RELEASE_MARKER), 'release\n');
    assert.equal(trafficMeterEnabled({ SP_TRAFFIC_METER: '1' }, dir), false, 'a release tree carries the marker');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('message types: the JSON `t`, binary frames, and "?" for anything else', () => {
  assert.equal(messageType('{"t":"STATE","x":1}'), 'STATE');
  assert.equal(messageType(Buffer.from('{"t":"hello","name":"a"}')), 'hello');
  assert.equal(messageType('{"rid":3,"t":"buy"}'), 'buy', 'parsed when t is not first');
  assert.equal(messageType(Buffer.from([0, 1, 2])), 'binary');
  assert.equal(messageType('not json'), '?');
});

/** A socket stand-in: send() records, emit('message') receives, emit('close') closes. */
function fakeSocket() {
  const ws = new EventEmitter();
  ws.sent = [];
  ws.send = function (data) { this.sent.push(data); };
  return ws;
}

test('counts per type, per room and per second; the peak second; reset', () => {
  let now = 1_000_000;
  const rooms = new Map();
  const d = createTrafficDetail({ now: () => now, roomOf: (ws) => rooms.get(ws) ?? null });
  const a = fakeSocket(), b = fakeSocket();
  d.attach(a); d.attach(b);
  rooms.set(a, 'ROOM1'); rooms.set(b, 'ROOM1');
  a.send('{"t":"STATE","v":"xxxx"}');
  b.send('{"t":"STATE","v":"xxxx"}');
  a.emit('message', Buffer.from('{"t":"buy","id":1}'));
  assert.equal(a.sent.length, 1, 'the real send still runs');
  now += 1000;
  rooms.delete(b);
  b.send('{"t":"lobby"}');
  const s = d.snapshot();
  assert.equal(s.total.outN, 3);
  assert.equal(s.total.inN, 1);
  assert.equal(s.types.STATE.outN, 2);
  assert.equal(s.types.STATE.outBytes, 2 * Buffer.byteLength('{"t":"STATE","v":"xxxx"}'));
  assert.equal(s.types.buy.inN, 1);
  assert.deepEqual(Object.keys(s.types)[0], 'STATE', 'sorted by bytes');
  assert.equal(s.rooms.ROOM1.outN, 2);
  assert.equal(s.rooms.ROOM1.sockets, 2);
  assert.equal(s.rooms['(lobby)'].outN, 1);
  assert.equal(s.activeSeconds, 2);
  assert.equal(s.socketSeconds, 4, 'two open sockets in each of the two seconds');
  assert.equal(s.peak.outBytes, 2 * Buffer.byteLength('{"t":"STATE","v":"xxxx"}'));
  a.emit('close');
  assert.equal(d.snapshot().open, 1);
  d.reset();
  assert.equal(d.snapshot().total.outN, 0);
});

test('bounded: types past MAX_TYPES count under "(other)", only the last MAX_SECONDS seconds are kept', () => {
  let now = 0;
  const d = createTrafficDetail({ now: () => now });
  const ws = fakeSocket();
  d.attach(ws);
  for (let i = 0; i < MAX_TYPES + 50; i++) ws.send(`{"t":"k${i}"}`);
  const s = d.snapshot();
  assert.equal(Object.keys(s.types).length, MAX_TYPES + 1);
  assert.equal(s.types['(other)'].outN, 50);
  for (let i = 0; i < MAX_SECONDS + 100; i++) { now += 1000; ws.send('{"t":"k0"}'); }
  assert.equal(d.snapshot().activeSeconds, MAX_SECONDS);
  assert.ok(d.snapshot().perSecond.length <= 120);
});

test('summary: MB/s and GB/day per player and for 300 players', () => {
  // 10 s with traffic, 2 players open each second, 1 MB out and 0.1 MB in each second
  const s = { seconds: 10, activeSeconds: 10, socketSeconds: 20, open: 2, total: { outN: 100, outBytes: 10e6, inN: 50, inBytes: 1e6 },
    types: { STATE: { outN: 100, outBytes: 10e6, inN: 0, inBytes: 0 }, buy: { outN: 0, outBytes: 0, inN: 50, inBytes: 1e6 } },
    peak: { t: 1, outBytes: 2e6, inBytes: 0.1e6, open: 2 } };
  const sum = summarize(s, 300);
  assert.equal(sum.measured.outMBps, 1);
  assert.equal(sum.perPlayer.outMBps, 0.5);
  assert.equal(sum.perPlayer.outGBday, 43.2);
  assert.equal(sum.players300.outMBps, 150);
  assert.equal(sum.players300.outGBday, 12960);
  assert.equal(sum.players300.peakOutMBps, 300);
  assert.equal(sum.types[0].t, 'STATE');
  const text = formatSummary(sum, 300);
  assert.match(text, /\| 300 players, average MB\/s \(GB\/day\) \| 150 \(12960\) \|/);
  assert.doesNotMatch(text, /Mbit/);
  assert.deepEqual(parseArgs(['--players', '40', '--json'], { PORT: '4000' }), { url: 'http://127.0.0.1:4000', players: 40, reset: false, json: true });
  assert.ok('error' in parseArgs(['--nope']));
});

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, agent: false }, (res) => {
      let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

test('on a server: off by default (nothing in /healthz), on with trafficMeter: types from a real hello, reset by ?trafficReset=1', async () => {
  const off = await startServer({ port: 0, host: '127.0.0.1', quiet: true, trafficMeter: false });
  try {
    assert.equal(off.trafficDetail, null);
    assert.equal((await get(off.port, '/healthz?traffic=1')).trafficDetail, undefined);
  } finally { await off.close(); }
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, trafficMeter: true });
  try {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    await c.hello('流量计');
    const d = (await get(srv.port, '/healthz?traffic=1')).trafficDetail;
    assert.ok(d.total.inN >= 1 && d.total.outN >= 1, JSON.stringify(d.total));
    assert.ok(d.types.hello?.inN >= 1, Object.keys(d.types).join());
    assert.ok(d.rooms['(lobby)'], 'not in a room yet');
    await c.close();
    const r = (await get(srv.port, '/healthz?traffic=1&trafficReset=1')).trafficDetail;
    assert.equal(r.total.inN, 0);
  } finally { await srv.close(); }
});
