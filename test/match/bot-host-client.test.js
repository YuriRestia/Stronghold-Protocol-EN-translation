// test/match/bot-host-client.test.js — (fork) public/js/battle/botHost.js without a browser: the page's side of the bot work,
// with a scripted Worker. The real Worker runs in test/match/bot-worker.e2e.test.js. Run: node --test test/match/bot-host-client.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { installBotHost } from '../../public/js/battle/botHost.js';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup({ sim = { raw: { x: 1 } }, createWorker = null } = {}) {
  const handlers = new Map();
  const sent = [];
  const workers = [];
  const net = {
    on(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); },
    send(type, fields) { sent.push({ t: type, ...fields }); return true; },
  };
  const make = createWorker || (() => {
    const w = { posted: [], terminated: false, onmessage: null, onerror: null, postMessage(m) { w.posted.push(m); }, terminate() { w.terminated = true; },
      say(m) { w.onmessage({ data: m }); } };
    workers.push(w);
    return w;
  });
  const host = installBotHost({ net, runner: { ensureSim: () => (sim ? Promise.resolve(sim) : Promise.reject(new Error('no data'))) }, createWorker: make, log: { warn() {} } });
  return { host, net, sent, workers, recv: (t, m) => handlers.get(t)(m), handlers };
}
const battle = (id = 'b.1', spec = { fieldId: 'f' }) => ({ battleId: id, spec });

test('no socket: nothing is installed, and no frame means no Worker', () => {
  assert.equal(installBotHost({}), null);
  const { workers } = setup();
  assert.equal(workers.length, 0);
});

test('a battle waits for the script, then the data, then runs; its answer goes out as b.botBattleResult', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botBattle', battle());
  assert.equal(workers.length, 1);
  await settle();
  assert.deepEqual(workers[0].posted, [], 'nothing before the Worker says it is ready');
  workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(workers[0].posted.map((m) => m.t), ['data', 'battle']);
  assert.equal(workers[0].posted[1].id, 'b.1');
  assert.equal(host.busy(), 1);
  workers[0].say({ t: 'battle-done', id: 'b.1', result: { time: 3 }, timeline: [[0, 0, 1, null]] });
  assert.deepEqual(sent, [{ t: 'b.botBattleResult', battleId: 'b.1', result: { time: 3 }, timeline: [[0, 0, 1, null]] }]);
  assert.equal(host.busy(), 0);
});

test('one Worker serves every job, and it is given the data once', async () => {
  const { workers, recv } = setup();
  recv('b.botBattle', battle('b.1'));
  recv('b.botBattle', battle('b.2'));
  workers[0].say({ t: 'ready' });
  await settle();
  recv('b.botBattle', battle('b.3'));
  await settle();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].posted.map((m) => m.t), ['data', 'battle', 'battle', 'battle']);
});

test('what this browser cannot run is answered error at once', async () => {
  const cs = setup();
  cs.recv('b.botBattle', battle('b.1', { cs: 'abc' }));
  assert.deepEqual(cs.sent, [{ t: 'b.botBattleResult', battleId: 'b.1', error: true }]);
  assert.equal(cs.workers.length, 0);

  const noWorker = setup({ createWorker: () => { throw new Error('no Worker here'); } });
  noWorker.recv('b.botBattle', battle('b.2'));
  await settle();
  noWorker.recv('b.botBattle', battle('b.3'));
  assert.deepEqual(noWorker.sent.map((m) => [m.battleId, m.error]), [['b.2', true], ['b.3', true]]);

  const noData = setup({ sim: null });
  noData.recv('b.botBattle', battle('b.4'));
  noData.workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(noData.sent, [{ t: 'b.botBattleResult', battleId: 'b.4', error: true }]);
  assert.equal(noData.workers[0].terminated, true);

  const plugin = setup({ sim: { raw: {}, cs: 'abc' } });
  plugin.recv('b.botBattle', battle('b.5'));
  plugin.workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(plugin.sent, [{ t: 'b.botBattleResult', battleId: 'b.5', error: true }], 'plugin data is piece 11');
});

test('a job that fails, or a Worker that dies, is answered error', async () => {
  const { sent, workers, recv } = setup();
  recv('b.botBattle', battle('b.1'));
  recv('b.botBattle', battle('b.2'));
  workers[0].say({ t: 'ready' });
  await settle();
  workers[0].say({ t: 'failed', id: 'b.1', message: 'boom' });
  assert.deepEqual(sent.map((m) => m.battleId), ['b.1']);
  workers[0].onerror({ message: 'dead' });
  assert.deepEqual(sent.map((m) => [m.battleId, m.error]), [['b.1', true], ['b.2', true]]);
  assert.equal(workers[0].terminated, true);
  recv('b.botBattle', battle('b.3'));
  assert.equal(sent.at(-1).battleId, 'b.3', 'that browser is not asked to build another');
  assert.equal(workers.length, 1);
});

test('a cancel drops the job: told to the Worker, and a late answer is not sent', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botBattle', battle('b.1'));
  workers[0].say({ t: 'ready' });
  await settle();
  recv('b.botBattleCancel', { battleId: 'b.1' });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'cancel', id: 'b.1' });
  assert.equal(host.busy(), 0);
  workers[0].say({ t: 'battle-done', id: 'b.1', result: {}, timeline: [] });
  assert.deepEqual(sent, []);
  recv('b.botBattleCancel', { battleId: 'other' });
  assert.equal(workers[0].posted.filter((m) => m.t === 'cancel').length, 1);
});

test('the socket going down or the match ending stops the Worker; the next job builds a new one', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botBattle', battle('b.1'));
  workers[0].say({ t: 'ready' });
  await settle();
  recv('status', { status: 'reconnecting' });
  assert.equal(workers[0].terminated, true);
  assert.equal(host.busy(), 0);
  workers[0].say({ t: 'battle-done', id: 'b.1', result: {}, timeline: [] });
  assert.deepEqual(sent, []);
  recv('status', { status: 'online' });
  recv('b.botBattle', battle('b.2'));
  assert.equal(workers.length, 2);
  host.clear();
  assert.equal(workers[1].terminated, true);
});

test('a bot seat\'s prep: plan, ack, final; stale stops it', async () => {
  const { workers, host } = setup();
  const batches = [];
  host.task('t.1', { seat: 1 }, { budgetMs: 100, onBatch: (b) => batches.push(b.batch), onFail: assert.fail });
  workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(workers[0].posted.at(-1), { t: 'task', id: 't.1', world: { seat: 1 }, budgetMs: 100 });
  workers[0].say({ t: 'batch', id: 't.1', batch: 'plan', moves: [] });
  assert.equal(host.busy(), 1);
  host.ack('t.1');
  assert.deepEqual(workers[0].posted.at(-1), { t: 'ack', id: 't.1', stale: false });
  workers[0].say({ t: 'batch', id: 't.1', batch: 'final', moves: [], memo: {} });
  assert.deepEqual(batches, ['plan', 'final']);
  assert.equal(host.busy(), 0);

  const failed = [];
  host.task('t.2', {}, { onBatch: assert.fail, onFail: (why) => failed.push(why) });
  await settle();
  workers[0].say({ t: 'failed', id: 't.2', message: 'boom' });
  assert.deepEqual(failed, ['boom']);
  host.task('t.3', {}, { onBatch() {}, onFail: assert.fail });
  await settle();
  host.ack('t.3', { stale: true });
  assert.equal(host.busy(), 0);
});

test('no screen can draw these frames: only botHost.js in the page\'s code knows them, and it does not import the store', () => {
  const root = path.resolve(import.meta.dirname, '../../public/js');
  const knowing = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (e.name.endsWith('.js') && /b\.botBattle|b\.botTask|botMoves/.test(fs.readFileSync(file, 'utf8'))) knowing.push(path.relative(root, file).split(path.sep).join('/'));
    }
  };
  walk(root);
  assert.deepEqual(knowing, ['battle/botHost.js']);
  const imports = [...fs.readFileSync(path.join(root, 'battle/botHost.js'), 'utf8').matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./runner.js', '../gen.js']);
});
