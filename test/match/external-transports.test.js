import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { externalConfig } from '../../server/match/externalConfig.js';
import { httpDecision, StdioAI } from '../../server/ai/transport.js';
import { exampleServer } from '../../tools/ai/http.mjs';

const observation = { v: 'sp-ai/1', id: 'test', public: {}, private: { canReady: true }, context: { kind: 'prep' }, results: [] };
async function serve(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
const request = (c, o = observation) => httpDecision(c, o, new AbortController().signal);
const stdioConfig = command => externalConfig({ transport: 'stdio', command, timeoutMs: 1500, backoffMs: 20 });

test('external configuration is explicit, bounded, credential-safe and environment-selectable', () => {
  assert.throws(() => externalConfig(undefined, {}), /TRANSPORT/);
  for (const url of ['file:///tmp/a', 'http://user:secret@localhost', 'bad', 'https://localhost/#secret']) {
    assert.throws(() => externalConfig({ transport: 'http', url }), /URL/);
  }
  for (const field of ['timeoutMs', 'maxIntents', 'maxBytes', 'failureLimit', 'backoffMs']) {
    for (const value of [0, -1, NaN, Infinity, 1e9]) assert.throws(() => externalConfig({ [field]: value }, {}, true), /invalid/);
  }
  for (const command of [null, [], 'node script.js', [''], [1]]) assert.throws(() => stdioConfig(command), /command/);
  assert.throws(() => externalConfig(undefined, { SP_EXTERNAL_AI_COMMAND: 'not json' }), /argv/);
  assert.throws(() => externalConfig({ seats: [4] }, {}, true), /seats/);
  const c = externalConfig(undefined, { SP_EXTERNAL_AI_TRANSPORT: 'http', SP_EXTERNAL_AI_URL: 'https://example.com/ai',
    SP_EXTERNAL_AI_TOKEN: 'secret', SP_EXTERNAL_AI_SEATS: '1,3', SP_EXTERNAL_AI_TIMEOUT_MS: '500' });
  assert.equal(c.timeoutMs, 500); assert.deepEqual(c.seats, [1, 3]); assert.equal(c.token, 'secret');
});

test('HTTP example on ephemeral loopback port returns human intents', async t => {
  const url = await serve(t, exampleServer());
  const result = await request(externalConfig({ transport: 'http', url }));
  assert.deepEqual(result, { v: 'sp-ai/1', id: 'test', intents: [{ t: 'g.ready', ready: true }], done: true });
});

test('HTTP POST JSON, bearer header, redirects refused without forwarding credentials', async t => {
  let visits = 0;
  const destination = await serve(t, http.createServer((_req, res) => { visits++; res.end('{}'); }));
  const url = await serve(t, http.createServer((req, res) => {
    assert.equal(req.method, 'POST'); assert.equal(req.headers.authorization, 'Bearer private-token');
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { assert.deepEqual(JSON.parse(body), observation); res.writeHead(302, { location: destination }).end(); });
  }));
  await assert.rejects(request(externalConfig({ transport: 'http', url }, { SP_EXTERNAL_AI_TOKEN: 'private-token' })));
  assert.equal(visits, 0);
});

for (const mode of ['oversized', 'malformed', 'status', 'stall', 'disconnect']) {
  test(`HTTP bounds and errors: ${mode}`, async t => {
    const url = await serve(t, http.createServer((req, res) => {
      if (mode === 'oversized') res.end('x'.repeat(2048));
      if (mode === 'malformed') res.end('{');
      if (mode === 'status') res.writeHead(500).end();
      if (mode === 'disconnect') req.socket.destroy();
    }));
    await assert.rejects(request(externalConfig({ transport: 'http', url, timeoutMs: 40, maxBytes: 1024 })));
  });
}

test('stdio example is long-lived, multiplexes IDs and terminates on close', async t => {
  const c = new StdioAI(stdioConfig([process.execPath, 'tools/ai/stdio.mjs']));
  t.after(() => c.close());
  const replies = await Promise.all(['a', 'b'].map(id => c.request({ ...observation, id }, new AbortController().signal)));
  assert.deepEqual(replies.map(r => r.id), ['a', 'b']);
  const child = c.child;
  const later = await c.request(observation, new AbortController().signal);
  assert.equal(c.child, child); assert.equal(later.intents[0].t, 'g.ready');
  const exited = once(child, 'exit'); c.close(); await exited;
  assert.equal(c.pending.size, 0); assert.equal(c.child, null);
});

for (const script of ['process.exit(1)', 'process.stdin.on("data",()=>process.stdout.write("broken\\n"))',
  'process.stdin.on("data",()=>process.stdout.write("x".repeat(70000)))', 'process.stdin.resume()']) {
  test(`stdio failure, bounded wait and backoff: ${script.slice(0, 24)}`, async t => {
    const c = new StdioAI({ ...stdioConfig([process.execPath, '-e', script]), timeoutMs: 100 });
    t.after(() => c.close());
    await assert.rejects(c.request(observation, new AbortController().signal));
    assert.equal(c.child, null);
    await assert.rejects(c.request(observation, new AbortController().signal), /backoff/);
    await delay(25);
    c.config.command = [process.execPath, 'tools/ai/stdio.mjs'];
    c.config.timeoutMs = 1500;
    assert.equal((await c.request(observation, new AbortController().signal)).done, true);
  });
}

// §35.62: replies after `delay` ms, in any order; the child stays up between requests.
const ECHO = 'let b="";process.stdin.on("data",d=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const o=JSON.parse(b.slice(0,i));b=b.slice(i+1);'
  + 'setTimeout(()=>process.stdout.write(JSON.stringify({id:o.id,done:true})+"\\n"),o.delay||0)}})';

test('stdio abort cancels only that request; its late reply is ignored and the child keeps serving', async t => {
  const c = new StdioAI(stdioConfig([process.execPath, '-e', ECHO]));
  t.after(() => c.close());
  const a = new AbortController();
  const slow = c.request({ ...observation, id: 'slow', delay: 150 }, a.signal);
  const other = c.request({ ...observation, id: 'other', delay: 300 }, new AbortController().signal);
  const child = c.child;
  a.abort();
  await assert.rejects(slow);
  assert.equal(c.child, child);
  assert.equal((await other).id, 'other');
  assert.equal(c.child, child, 'the late reply for the cancelled id did not count as a protocol error');
  assert.equal(c.abandoned.size, 0);
  assert.equal((await c.request({ ...observation, id: 'next' }, new AbortController().signal)).id, 'next');
});

test('stdio timeout cancels a slow request while the child answers others, and kills a silent child', async t => {
  const c = new StdioAI({ ...stdioConfig([process.execPath, '-e', ECHO]), timeoutMs: 200 });
  t.after(() => c.close());
  const child = c.child ?? (c.start(), c.child);
  const slow = c.request({ ...observation, id: 'slow', delay: 400 }, new AbortController().signal);
  const quick = c.request({ ...observation, id: 'quick', delay: 20 }, new AbortController().signal);
  assert.equal((await quick).id, 'quick');
  await assert.rejects(slow);
  assert.equal(c.child, child);
  const silent = new StdioAI({ ...stdioConfig([process.execPath, '-e', 'process.stdin.resume()']), timeoutMs: 100 });
  t.after(() => silent.close());
  await assert.rejects(silent.request(observation, new AbortController().signal));
  assert.equal(silent.child, null);
});

test('stdio reply with an ID that was never sent is a protocol error', async t => {
  const c = new StdioAI(stdioConfig([process.execPath, '-e', 'process.stdin.once("data",()=>process.stdout.write(JSON.stringify({id:"zzz"})+"\\n"))']));
  t.after(() => c.close());
  await assert.rejects(c.request(observation, new AbortController().signal));
  assert.equal(c.child, null);
});
