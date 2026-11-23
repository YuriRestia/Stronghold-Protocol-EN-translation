// (fork) render/dynillust/progress.js: the stage's downloads counted as they arrive, for the room's stall check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newNet, countingFetch } from '../../public/js/render/dynillust/progress.js';

// a response whose body arrives one chunk per pull() of the test
function slowResponse(chunks) {
  let i = 0, wake = null;
  const gate = () => new Promise((r) => { wake = r; });
  const body = new ReadableStream({
    async pull(c) {
      await gate();
      if (i < chunks.length) c.enqueue(new Uint8Array(chunks[i++])); else c.close();
    },
  });
  return { res: new Response(body, { status: 200 }), next: () => wake?.() };
}
const turn = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('a body is counted chunk by chunk and stays open until it is read to the end', async () => {
  const net = newNet();
  const src = slowResponse([3, 5]);
  const f = countingFetch(async () => src.res, net);
  const res = await f('/a');
  assert.equal(net.open, 1, 'headers in, body still coming');
  assert.equal(net.moves, 1, 'the headers count as progress');
  const read = res.arrayBuffer();
  await turn(); src.next(); await turn();
  assert.equal(net.received, 3);
  assert.equal(net.moves, 2);
  src.next(); await turn();
  assert.equal(net.received, 8);
  src.next(); await turn();
  assert.equal((await read).byteLength, 8, 'the reader gets the same bytes');
  assert.equal(net.open, 0, 'read to the end: closed');
});

test('a response that is not ok, a failed fetch and a cancelled body never stay open', async () => {
  const net = newNet();
  const notOk = countingFetch(async () => new Response('nope', { status: 404 }), net);
  const r = await notOk('/missing');
  assert.equal(r.status, 404);
  assert.equal(net.open, 0, 'thrown on unread by the loaders: not open');
  const broken = countingFetch(async () => { throw new Error('offline'); }, net);
  await assert.rejects(broken('/x'), /offline/);
  assert.equal(net.open, 0);
  const src = slowResponse([4]);
  const res = await countingFetch(async () => src.res, net)('/y');
  assert.equal(net.open, 1);
  await res.body.cancel();
  assert.equal(net.open, 0, 'cancelled: closed');
});
