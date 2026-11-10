// (fork) A sandboxed child (match host, script probe, studio trial) may read its install tree, and node_modules' real
// folder when node_modules links out of it — a git worktree's junction to the main checkout. Without that, Node loaded
// `ses` and `acorn` from outside the allowed tree and every sandboxed plugin failed with ERR_ACCESS_DENIED in a worktree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sandboxReadPaths, sandboxProcessOptions, INSTALL_ROOT } from '../../server/match/host/childHost.js';

function tmp(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-sandbox-read-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the install tree alone when node_modules is a plain folder in it, or missing', (t) => {
  const dir = tmp(t);
  const root = path.join(dir, 'install');
  fs.mkdirSync(root);
  assert.deepEqual(sandboxReadPaths(root), [root], 'no node_modules');
  fs.mkdirSync(path.join(root, 'node_modules'));
  assert.deepEqual(sandboxReadPaths(root), [root], 'node_modules inside the tree');
});

test('node_modules linked out of the tree (a worktree junction): its real folder is allowed too, nothing else', (t) => {
  const dir = tmp(t);
  const root = path.join(dir, 'worktree');
  const shared = path.join(dir, 'main', 'node_modules');
  fs.mkdirSync(root);
  fs.mkdirSync(shared, { recursive: true });
  fs.symlinkSync(shared, path.join(root, 'node_modules'), 'junction');
  assert.deepEqual(sandboxReadPaths(root), [root, fs.realpathSync(shared)]);
});

test('the sandbox flags read exactly those folders, each in its own --allow-fs-read', () => {
  const reads = sandboxProcessOptions(128).execArgv.filter((a) => a.startsWith('--allow-fs-read='));
  assert.deepEqual(reads, sandboxReadPaths(INSTALL_ROOT).map((p) => `--allow-fs-read=${p}`));
  assert.equal(reads[0], `--allow-fs-read=${INSTALL_ROOT}`);
});
