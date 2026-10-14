// (fork) What blocks the main thread: the event loop's lateness (server/http/loopStats.js), the server-side simulation
// meter (server/match/simMeter.js) and their `loop` / `sim` objects on GET /healthz?traffic=1; the combat-start log
// line (match/combat.js); SP_BOT_REHEARSAL (Match.js parseBotRehearsal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MinuteWindow, createSimMeter, simMeter, SIM_KINDS } from '../server/match/simMeter.js';
import { createLoopStats } from '../server/http/loopStats.js';
import { parseBotRehearsal } from '../server/match/Match.js';
import { startServer } from '../server/index.js';
import { PHASE } from '../shared/constants.js';
import { makeMatch } from './match/harness.js';

function get(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('MinuteWindow: the current bucket fills, the previous minute is kept once, a gap leaves it empty', () => {
  let t = 1000;
  const w = new MinuteWindow(() => ({ n: 0 }), { now: () => t, windowMs: 60_000 });
  w.add((b) => { b.n += 1; });
  assert.deepEqual(w.snapshot(), { windowSec: 60, last: null, now: { sec: 0, n: 1 } });
  t += 59_000;
  w.add((b) => { b.n += 1; });
  assert.equal(w.snapshot().now.n, 2);
  t += 2_000; // 61 s after the start: the first window closes, 1 s into the next
  assert.deepEqual(w.snapshot(), { windowSec: 60, last: { sec: 60, n: 2 }, now: { sec: 1, n: 0 } });
  t += 150_000; // two whole windows with nothing: `last` is an empty one
  assert.deepEqual(w.snapshot().last, { sec: 60, n: 0 });
});

test('simMeter: milliseconds, slices and the longest slice per kind and in total; unknown kinds and NaN ignored', () => {
  let t = 0;
  const m = createSimMeter({ now: () => t });
  m.add('headless', 8.4); m.add('headless', 30.2); m.add('rehearsal', 5); m.add('nope', 100); m.add('boss', NaN);
  const s = m.snapshot();
  assert.equal(s.last, null);
  assert.deepEqual(s.now.headless, { ms: 39, slices: 2, maxSliceMs: 30 });
  assert.deepEqual(s.now.rehearsal, { ms: 5, slices: 1, maxSliceMs: 5 });
  assert.deepEqual(s.now.boss, { ms: 0, slices: 0, maxSliceMs: 0 });
  assert.equal(s.now.ms, 44); assert.equal(s.now.slices, 3); assert.equal(s.now.maxSliceMs, 30);
  // bursts: slices that follow each other with < BURST_GAP_MS between count as one; a gap starts a new one
  let t2 = 0;
  const m2 = createSimMeter({ now: () => t2 });
  t2 = 8; m2.add('headless', 8); t2 = 17; m2.add('headless', 8); t2 = 26; m2.add('rehearsal', 8); // back to back
  t2 = 100; m2.add('headless', 5); // 66 ms of nothing in between: a new burst
  const b = m2.snapshot().now;
  assert.equal(b.maxBurstSlices, 3); assert.equal(b.maxBurstMs, 24);
  for (const k of SIM_KINDS) assert.ok(k in s.now, k);
});

test('the server-side simulation reports to the process meter: bot fields (headless) and the layout rehearsal', () => {
  const before = simMeter.snapshot().now;
  const h = makeMatch({ humans: 1, bots: 2, clientCombat: true, botRehearsal: 1 });
  h.start();
  h.toPrep(2); // through the bots' first prep (rehearsal) and R1 combat (their fields run headless on the server)
  const after = simMeter.snapshot().now;
  assert.ok(after.headless.slices > before.headless.slices, 'bot fields were stepped through HeadlessJob.run');
  assert.ok(after.rehearsal.slices > before.rehearsal.slices, 'a rehearsal ran');
  assert.ok(after.headless.ms > before.headless.ms);
  assert.ok(after.prep.slices > before.prep.slices, 'bot prep decisions were stepped');
});

test('combat start is logged with the field count and how many the server runs', () => {
  const lines = [];
  const h = makeMatch({ humans: 1, bots: 1, clientCombat: true });
  h.m.log = { ...h.m.log, info: (...a) => lines.push(a.map(String).join(' ')) };
  h.start();
  assert.ok(h.drive(() => h.m.phase === PHASE.COMBAT), `phase ${h.m.phase}`);
  assert.ok(lines.some((l) => /\[match TEST\] R1 combat: 2 field\(s\), 1 server-run$/.test(l)), lines.join('\n'));
});

test('loopStats: a synchronous block shows as a stall and in the delay histogram; stop() clears the timers', async () => {
  const stats = createLoopStats({ tickMs: 10 });
  try {
    await new Promise((r) => setTimeout(r, 40));
    const t0 = performance.now();
    while (performance.now() - t0 < 120) { /* block the loop */ }
    await new Promise((r) => setTimeout(r, 40));
    const s = stats.snapshot();
    assert.equal(s.windowSec, 60);
    assert.equal(s.stalls.last, null);
    assert.ok(s.stalls.now.ge100 >= 1, JSON.stringify(s.stalls));
    assert.ok(s.stalls.now.worstMs >= 100, JSON.stringify(s.stalls));
    assert.ok(s.delay.now.maxMs >= 50, JSON.stringify(s.delay));
    assert.ok(s.delay.now.samples > 0);
  } finally {
    stats.stop();
  }
});

test('/healthz?traffic=1 carries `loop` and `sim` for a loopback client; the plain report does not', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, warmResources: false, noticeFile: null, assetIndex: false });
  try {
    const plain = JSON.parse((await get(srv.port, '/healthz')).body);
    assert.equal(plain.ok, true);
    assert.ok(!('loop' in plain) && !('sim' in plain), 'plain /healthz has no loop / sim');
    const full = JSON.parse((await get(srv.port, '/healthz?traffic=1')).body);
    assert.ok(full.loop && full.loop.delay && full.loop.stalls, 'loop');
    assert.deepEqual(Object.keys(full.loop.stalls.now).sort(), ['ge100', 'ge1000', 'ge250', 'ge50', 'sec', 'worstMs']);
    assert.ok(full.sim && typeof full.sim.now.ms === 'number', 'sim');
    for (const k of SIM_KINDS) assert.ok(full.sim.now[k], k);
    assert.ok('maxBurstMs' in full.sim.now && 'maxBurstSlices' in full.sim.now);
    // a public visitor behind a proxy on this machine gets the plain report (the same gate as the traffic counters)
    const pub = JSON.parse((await get(srv.port, '/healthz?traffic=1', { 'x-forwarded-for': '203.0.113.9' })).body);
    assert.ok(!('loop' in pub) && !('sim' in pub) && !('traffic' in pub), 'nothing extra for a public client');
  } finally {
    await srv.close();
  }
});

test('SP_BOT_REHEARSAL: an integer 0…8, anything else leaves the default', () => {
  assert.equal(parseBotRehearsal('0'), 0);
  assert.equal(parseBotRehearsal(' 2 '), 2);
  assert.equal(parseBotRehearsal('8'), 8);
  assert.equal(parseBotRehearsal('9'), undefined);
  assert.equal(parseBotRehearsal('-1'), undefined);
  assert.equal(parseBotRehearsal('1.5'), undefined);
  assert.equal(parseBotRehearsal(''), undefined);
  assert.equal(parseBotRehearsal(undefined), undefined);
  assert.equal(parseBotRehearsal('three'), undefined);
});
