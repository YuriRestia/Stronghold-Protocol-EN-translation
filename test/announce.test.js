// test/announce.test.js — scripts/announce.mjs and server/announce.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { parseNotice, NOTICE_MAX_LEN } from '../server/announce.js';
import { S2C } from '../shared/protocol.js';
import { TestClient } from './helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'announce.mjs');
const announce = (file, ...args) => execFileSync(process.execPath, [SCRIPT, '--file', file, ...args], { encoding: 'utf8' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('parseNotice', () => {
  test('accepts a well-formed notice, trims and caps the text', () => {
    const n = parseNotice({ id: 5, text: `  ${'x'.repeat(300)} `, createdAt: 1, until: 2 });
    assert.equal(n.id, 5);
    assert.equal(n.text.length, NOTICE_MAX_LEN);
  });
  test('rejects malformed input', () => {
    for (const bad of [null, [], 'x', { id: 1, text: 'a', createdAt: 1 }, { id: 'a', text: 'a', createdAt: 1, until: 2 },
      { id: 1, text: '   ', createdAt: 1, until: 2 }, { id: 1, text: 3, createdAt: 1, until: 2 }]) {
      assert.equal(parseNotice(bad), null, JSON.stringify(bad));
    }
  });
  test('sys.notice is a documented server → client type', () => {
    assert.ok(S2C.includes('sys.notice'));
  });
});

describe('scripts/announce.mjs', () => {
  let dir;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announce-cli-')); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('writes, shows and clears a notice; ids are unique', () => {
    const file = path.join(dir, 'sub', 'announce.json');
    const out = announce(file, '--minutes', '5', 'Restarting', 'in', '5', 'min');
    assert.match(out, /Notice saved/);
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(a.text, 'Restarting in 5 min');
    assert.equal(a.until - a.createdAt, 5 * 60_000);
    assert.ok(parseNotice(a));
    assert.match(announce(file, '--show'), /Restarting in 5 min/);
    announce(file, 'Again');
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(b.id > a.id, 'a new notice gets a new id');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['announce.json'], 'no temp file left behind');
    assert.match(announce(file, '--clear'), /cleared/);
    assert.equal(fs.existsSync(file), false);
    assert.match(announce(file, '--show'), /No active notice/);
  });

  test('rejects bad input without writing', () => {
    const file = path.join(dir, 'bad.json');
    for (const args of [[], ['--minutes', '0', 'x'], ['--minutes', 'abc', 'x'], ['--minutes', '5000', 'x'], ['y'.repeat(NOTICE_MAX_LEN + 1)]]) {
      const r = spawnSync(process.execPath, [SCRIPT, '--file', file, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 1, args.join(' '));
    }
    assert.equal(fs.existsSync(file), false);
  });
});

describe('server delivery', () => {
  let dir, file, srv;
  const url = () => `ws://127.0.0.1:${srv.port}/ws`;
  const clients = [];
  const connect = async (name) => {
    const c = await TestClient.connect(url());
    clients.push(c);
    await c.hello(name);
    return c;
  };

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'announce-srv-'));
    file = path.join(dir, 'announce.json');
    // a notice left over from before this server started: never delivered
    fs.writeFileSync(file, JSON.stringify({ id: 1, text: 'stale', createdAt: Date.now() - 60_000, until: Date.now() + 600_000 }));
    await sleep(5);
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, noticeFile: file, noticePollMs: 30 });
  });
  after(async () => {
    for (const c of clients) await c.close();
    await srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a notice from before the start is ignored', async () => {
    const a = await connect('A');
    await a.expectNone('sys.notice', () => true, 150);
    assert.equal(srv.notices.active(), null);
  });

  test('a new notice reaches online players and players who join later', async () => {
    const a = await connect('B');
    announce(file, 'Server restarting in 5 min');
    const got = await a.waitFor('sys.notice', () => true, 2000);
    assert.equal(got.text, 'Server restarting in 5 min');
    assert.ok(Number.isFinite(got.id) && got.until > Date.now());
    await a.expectNone('sys.notice', () => true, 150); // not resent on every poll

    const late = await connect('C');
    const lateGot = await late.waitFor('sys.notice', () => true, 1000);
    assert.equal(lateGot.id, got.id);
  });

  test('a cleared notice is not given to new players', async () => {
    announce(file, '--clear');
    await sleep(150);
    assert.equal(srv.notices.active(), null);
    const d = await connect('D');
    await d.expectNone('sys.notice', () => true, 150);
  });

  test('a malformed file is ignored', async () => {
    fs.writeFileSync(file, '{not json');
    await sleep(150);
    assert.equal(srv.notices.active(), null);
  });
});
