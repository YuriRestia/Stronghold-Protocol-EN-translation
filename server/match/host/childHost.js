// P3b: defence in depth around SES. Node 22 permissions are NOT a malicious-code security boundary and do not
// restrict network. Deploy with OS/container isolation (DESIGN §32.11, DEPLOY.md).
import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INSTALL_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export function scriptMode(env = process.env) { return env.SP_PLUGIN_SCRIPTS === 'sandbox' ? 'sandbox' : 'off'; }

export function forkSandbox(entry, { memoryMb = 768 } = {}) {
  return fork(entry, [], { ...sandboxProcessOptions(memoryMb), serialization: 'json', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
}

/**
 * (fork) The folders a sandboxed child may read: its install tree, plus node_modules' real folder when node_modules is a
 * link out of it (a git worktree's junction to the main checkout). Node loads a package from its real path, so `ses` and
 * `acorn` were outside the allowed tree there (ERR_ACCESS_DENIED): every sandboxed plugin failed in a worktree only.
 * The packages read are the same ones a plain install exposes; nothing else is added.
 */
export function sandboxReadPaths(root = INSTALL_ROOT) {
  const paths = [root];
  try {
    const real = fs.realpathSync(path.join(root, 'node_modules'));
    const rel = path.relative(fs.realpathSync(root), real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) paths.push(real);
  } catch { /* no node_modules: nothing more to allow */ }
  return paths;
}

/** Shared by match hosts and the disposable sandbox registration probe. */
export function sandboxProcessOptions(memoryMb = 768) {
  // [ASSUMED] The child needs only its install tree; no fs-write/child/worker/addon permission, no inherited NODE_OPTIONS.
  const matchEnv = {};
  for (const key of ['SP_VERIFY', 'SP_COMBAT', 'SP_BOT_EMOTES', 'SP_CHAT']) if (process.env[key] !== undefined) matchEnv[key] = process.env[key];
  return {
    cwd: INSTALL_ROOT,
    windowsHide: true,
    execArgv: ['--permission', ...sandboxReadPaths().map((p) => `--allow-fs-read=${p}`), `--max-old-space-size=${Math.max(64, Math.floor(memoryMb))}`],
    env: { NODE_ENV: 'production', SP_PLUGIN_SCRIPTS: 'sandbox', ...matchEnv },
  };
}

/** IPC is JSON, including source/data bytes: Buffer's JSON shape is never implicitly trusted. */
export function sandboxInit(init) {
  // Production descriptors already contain strings; never copy arbitrary source byte arrays here.
  return { ...init, files: Object.fromEntries(Object.entries(init.files).map(([key, bytes]) => [key, Array.from(bytes)])) };
}
