// (fork) server/serverInfo.js: public/server-info.json's branch, commit and latest changes (GitHub #98 / #99), from a
// throwaway git repository.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectServerInfo, writeServerInfo } from '../server/serverInfo.js';

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-server-info-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git('init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(dir, 'public'));
  return { dir, git };
}

test('the branch, commit and the latest first-parent commits, newest first', (t) => {
  const { dir, git } = repo(t);
  git('commit', '-q', '--allow-empty', '-m', 'first');
  git('checkout', '-q', '-b', 'side');
  git('commit', '-q', '--allow-empty', '-m', 'on the side');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--no-ff', '-m', 'Merge side (#7)', 'side');
  git('commit', '-q', '--allow-empty', '-m', 'tabs\tstay');
  const info = collectServerInfo(dir, { env: {} });
  assert.equal(info.branch, 'main');
  assert.equal(info.commit, git('rev-parse', 'HEAD'));
  assert.equal(info.date, git('log', '-1', '--format=%cI'));
  assert.deepEqual(info.changes.map((c) => c.subject), ['tabs\tstay', 'Merge side (#7)', 'first']);
  assert.equal(info.changes[1].commit, git('rev-parse', 'HEAD~1'));
  assert.equal(collectServerInfo(dir, { env: {}, max: 2 }).changes.length, 2);
});

test('a detached checkout takes its branch from SP_BRANCH', (t) => {
  const { dir, git } = repo(t);
  git('commit', '-q', '--allow-empty', '-m', 'one');
  git('checkout', '-q', '--detach');
  assert.equal(collectServerInfo(dir, { env: {} }).branch, 'HEAD');
  assert.equal(collectServerInfo(dir, { env: { SP_BRANCH: 'main' } }).branch, 'main');
});

test('writes public/server-info.json; without a repository it writes nothing and does not throw', (t) => {
  const { dir, git } = repo(t);
  git('commit', '-q', '--allow-empty', '-m', 'one');
  assert.equal(writeServerInfo(dir, { env: {}, log: () => {} }), true);
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'public', 'server-info.json'), 'utf8'));
  assert.equal(out.changes[0].subject, 'one');

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-server-info-none-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  fs.mkdirSync(path.join(bare, 'public'));
  const warn = t.mock.method(console, 'warn', () => {});
  assert.equal(writeServerInfo(bare, { env: {}, log: () => {} }), false);
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(fs.existsSync(path.join(bare, 'public', 'server-info.json')), false);
});
