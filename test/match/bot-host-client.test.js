// test/match/bot-host-client.test.js — (fork) public/js/battle/botHost.js without a browser: the page's side of the bot work,
// with a scripted Worker. The real Worker runs in test/match/bot-worker.e2e.test.js. Run: node --test test/match/bot-host-client.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BOT_DATA_FILES, installBotHost } from '../../public/js/battle/botHost.js';
import { DATA_FILES } from '../../server/data.js';

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

const content = (cs) => Promise.resolve({ content: { cs, files: { config: new ArrayBuffer(1) } }, transfer: [] });

function setup({ loadContent = content, createWorker = null } = {}) {
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
  const host = installBotHost({ net, loadContent, createWorker: make, log: { warn() {} } });
  return { host, net, sent, workers, recv: (t, m) => handlers.get(t)(m), handlers };
}
const battle = (id = 'b.1', spec = { fieldId: 'f' }) => ({ battleId: id, spec });
/** A scripted Worker's boot: its script ran, it took the content, the engine is in. */
const boot = async (w) => { w.say({ t: 'ready' }); await settle(); w.say({ t: 'loaded' }); await settle(); };

test('no socket: nothing is installed, and no frame means no Worker', () => {
  assert.equal(installBotHost({}), null);
  const { workers } = setup();
  assert.equal(workers.length, 0);
});

test('a battle waits for the script, the content and the engine, then runs; its answer goes out as b.botBattleResult', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botBattle', battle());
  assert.equal(workers.length, 1);
  await settle();
  assert.deepEqual(workers[0].posted, [], 'nothing before the Worker says it is ready');
  workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(workers[0].posted.map((m) => m.t), ['content'], 'the job waits for the engine');
  workers[0].say({ t: 'loaded' });
  await settle();
  assert.deepEqual(workers[0].posted.map((m) => m.t), ['content', 'battle']);
  assert.equal(workers[0].posted[1].id, 'b.1');
  assert.equal(host.busy(), 1);
  workers[0].say({ t: 'battle-done', id: 'b.1', result: { time: 3 }, timeline: [[0, 0, 1, null]] });
  assert.deepEqual(sent, [{ t: 'b.botBattleResult', battleId: 'b.1', result: { time: 3 }, timeline: [[0, 0, 1, null]] }]);
  assert.equal(host.busy(), 0);
});

test('one Worker serves every job, and it is given the content once', async () => {
  const { workers, recv } = setup();
  recv('b.botBattle', battle('b.1'));
  recv('b.botBattle', battle('b.2'));
  await boot(workers[0]);
  recv('b.botBattle', battle('b.3'));
  await settle();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].posted.map((m) => m.t), ['content', 'battle', 'battle', 'battle']);
});

test('what this browser cannot run is answered error at once', async () => {
  const noWorker = setup({ createWorker: () => { throw new Error('no Worker here'); } });
  noWorker.recv('b.botBattle', battle('b.2'));
  await settle();
  noWorker.recv('b.botBattle', battle('b.3'));
  assert.deepEqual(noWorker.sent.map((m) => [m.battleId, m.error]), [['b.2', true], ['b.3', true]]);

  const noContent = setup({ loadContent: () => Promise.reject(new Error('no consent')) });
  noContent.recv('b.botBattle', { ...battle('b.4'), cs: 'c'.repeat(64) });
  noContent.workers[0].say({ t: 'ready' });
  await settle();
  assert.deepEqual(noContent.sent, [{ t: 'b.botBattleResult', battleId: 'b.4', error: true }]);
  assert.equal(noContent.workers[0].terminated, true);

  const engine = setup();
  engine.recv('b.botBattle', battle('b.5'));
  engine.workers[0].say({ t: 'ready' });
  await settle();
  engine.workers[0].say({ t: 'load-failed', message: 'SES refused' });
  await settle();
  assert.deepEqual(engine.sent, [{ t: 'b.botBattleResult', battleId: 'b.5', error: true }]);
});

test('a room\'s content: the frame names the set, the Worker gets that set, and another set means another Worker', async () => {
  const asked = [];
  const { workers, recv } = setup({ loadContent: (cs) => { asked.push(cs); return content(cs); } });
  recv('b.botBattle', { ...battle('b.1'), cs: 'c'.repeat(64) });
  await boot(workers[0]);
  assert.deepEqual(asked, ['c'.repeat(64)]);
  assert.equal(workers[0].posted[0].content.cs, 'c'.repeat(64));
  recv('b.botBattle', { ...battle('b.2'), cs: 'c'.repeat(64) });
  assert.equal(workers.length, 1);
  recv('b.botBattle', battle('b.3'));
  assert.equal(workers.length, 2, 'the official data is another set');
  assert.equal(workers[0].terminated, true);
});

test('a live boss field reports through a human battle\'s frames, naming the room\'s content', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botBattle', { ...battle('b.1'), cs: 'c'.repeat(64), live: { elapsed: 2, speed: 2 } });
  await boot(workers[0]);
  assert.deepEqual(workers[0].posted.at(-1), { t: 'live', id: 'b.1', spec: { fieldId: 'f' }, elapsed: 2, speed: 2 });
  workers[0].say({ t: 'live-progress', id: 'b.1', msg: { battleId: 'b.1', gt: 1 } });
  assert.deepEqual(sent.at(-1), { t: 'b.progress', battleId: 'b.1', gt: 1 });
  recv('b.pool', { hp: 5, acked: { f: 1 } });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'pool', hp: 5, acked: { f: 1 } });
  recv('b.end', { battleId: 'other', reason: 'forced' });
  assert.deepEqual(workers[0].posted.at(-1).t, 'pool');
  recv('b.end', { battleId: 'b.1', reason: 'forced' });
  await settle();
  assert.deepEqual(workers[0].posted.at(-1), { t: 'end', id: 'b.1', reason: 'forced' });
  workers[0].say({ t: 'live-done', id: 'b.1', msg: { battleId: 'b.1', gt: 2 }, result: { time: 2 } });
  assert.deepEqual(sent.slice(-2), [{ t: 'b.progress', battleId: 'b.1', gt: 2 }, { t: 'b.result', battleId: 'b.1', result: { time: 2 }, cs: 'c'.repeat(64) }]);
  assert.equal(host.busy(), 0);
  recv('b.botBattle', { ...battle('b.2'), cs: 'c'.repeat(64), live: { elapsed: 0, speed: 1 } });
  await settle();
  recv('b.end', { battleId: 'b.2', reason: 'takeover' });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'cancel', id: 'b.2' });
});

test('a job that fails, or a Worker that dies, is answered error', async () => {
  const { sent, workers, recv } = setup();
  recv('b.botBattle', battle('b.1'));
  recv('b.botBattle', battle('b.2'));
  await boot(workers[0]);
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
  await boot(workers[0]);
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
  await boot(workers[0]);
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
  await boot(workers[0]);
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

test('the live frames of a bot seat\'s prep: receipt at once, plan, ack, hurry, final', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botTask', { taskId: 't.1', world: { seat: 1 }, budgetMs: 500 });
  assert.deepEqual(sent, [{ t: 'b.botReceived', taskId: 't.1' }], 'before the Worker has even started');
  await boot(workers[0]);
  assert.deepEqual(workers[0].posted.at(-1), { t: 'task', id: 't.1', world: { seat: 1 }, budgetMs: 500 });
  workers[0].say({ t: 'batch', id: 't.1', batch: 'plan', moves: [{ t: 'g.refresh' }], ms: 3 });
  assert.deepEqual(sent.at(-1), { t: 'b.botMoves', taskId: 't.1', batch: 'plan', moves: [{ t: 'g.refresh' }] });
  recv('b.botAck', { taskId: 't.1' });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'ack', id: 't.1', stale: false });
  recv('b.botHurry', { taskId: 't.1' });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'hurry', id: 't.1' });
  workers[0].say({ t: 'batch', id: 't.1', batch: 'final', moves: [], memo: { _botX: 1 }, ms: 3, finished: false });
  assert.deepEqual(sent.at(-1), { t: 'b.botMoves', taskId: 't.1', batch: 'final', moves: [], memo: { _botX: 1 } });
  assert.equal(host.busy(), 0);
});

test('a prep that fails, goes stale or is cancelled', async () => {
  const { sent, workers, recv, host } = setup();
  recv('b.botTask', { taskId: 't.1', world: {} });
  await boot(workers[0]);
  workers[0].say({ t: 'failed', id: 't.1', message: 'boom' });
  assert.deepEqual(sent.at(-1), { t: 'b.botMoves', taskId: 't.1', error: true });
  recv('b.botTask', { taskId: 't.2', world: {} });
  await settle();
  workers[0].say({ t: 'batch', id: 't.2', batch: 'plan', moves: [] });
  recv('b.botAck', { taskId: 't.2', stale: true });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'ack', id: 't.2', stale: true });
  assert.equal(host.busy(), 0);
  recv('b.botTask', { taskId: 't.3', world: {} });
  await settle();
  recv('b.botCancel', { taskId: 't.3' });
  assert.deepEqual(workers[0].posted.at(-1), { t: 'cancel', id: 't.3' });
  const count = sent.length;
  workers[0].say({ t: 'batch', id: 't.3', batch: 'plan', moves: [] });
  assert.equal(sent.length, count, 'a cancelled task stays quiet');
});

test('a hidden tab says so instead of taking work, and says when it is back', () => {
  const listeners = new Map();
  const doc = { hidden: true, addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener(t) { listeners.delete(t); } };
  const handlers = new Map();
  const sent = [];
  let created = 0;
  const host = installBotHost({ net: { on(t, fn) { handlers.set(t, fn); return () => handlers.delete(t); }, send(t, f) { sent.push({ t, ...f }); return true; } },
    loadContent: content, createWorker: () => { created++; return { postMessage() {}, terminate() {} }; }, log: { warn() {} }, doc });
  listeners.get('visibilitychange')();
  assert.deepEqual(sent, [], 'no bot work asked yet: the server does not need to hear of it');
  handlers.get('b.botTask')({ taskId: 't.1', world: {} });
  assert.deepEqual(sent, [{ t: 'b.botReceived', taskId: 't.1' }, { t: 'b.botHidden', hidden: true }]);
  handlers.get('b.botBattle')({ battleId: 'b.1', spec: {} });
  assert.equal(sent.length, 2, 'said once');
  assert.equal(created, 0);
  doc.hidden = false;
  listeners.get('visibilitychange')();
  assert.deepEqual(sent.at(-1), { t: 'b.botHidden', hidden: false });
  doc.hidden = true;
  listeners.get('visibilitychange')();
  assert.deepEqual(sent.at(-1), { t: 'b.botHidden', hidden: true });
  host.clear();
  doc.hidden = false;
  const n = sent.length;
  listeners.get('visibilitychange')();
  assert.equal(sent.length, n, 'the match is over');
  host.dispose();
  assert.equal(listeners.size, 0);
});

test('b.botWarm starts the Worker when the page has time, and only once', async () => {
  const { workers, recv } = setup();
  recv('b.botWarm', {});
  assert.equal(workers.length, 0, 'not during the frame');
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(workers.length, 1);
  recv('b.botBattle', battle('b.1'));
  assert.equal(workers.length, 1);
});

test('the data the Worker is given is what the match reads: server/data.js DATA_FILES but the art manifest', () => {
  assert.deepEqual([...BOT_DATA_FILES].sort(), DATA_FILES.filter((f) => f !== 'assets').sort());
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
  assert.deepEqual(imports, ['../content.js', '../gen.js', './simLoader.js']);
});
