// server/http/botModules.js — (fork) which server/match files a browser may load: exactly the modules the host's bot Worker
// imports (server/match/botWorkerEnv.js and what it reaches), served under /match/ (docs/host-browser-bots.md). The list is
// computed from the imports, so an upstream change to the bot's imports needs no edit here; a file that needs Node is refused
// at the walk, so it can never reach a browser by accident. server/sim and shared have mounts of their own, and server/data.js
// has its stand-in at /data.js, so only server/match files are collected.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_DIR = path.resolve(HERE, '..');
const MATCH_DIR = path.join(SERVER_DIR, 'match');
const ROOT_MODULE = path.join(MATCH_DIR, 'botWorkerEnv.js');

// Top-level statements start in the first column, and comments here never do. Stripping comments first is not safe: a glob such
// as `a/*` inside a line comment would open a "block comment" that swallows real imports.
const IMPORT_RE = /^(?:import\b|export\s*(?:\*|\{))[^;'"]*?from\s+['"]([^'"]+)['"]|^import\s+['"]([^'"]+)['"]/gm;

/**
 * The server/match files the Worker reaches.
 * @param {string} [root] the module to start from (tests)
 * @param {{ serverDir?: string }} [opts] the server folder (tests: a fixture tree)
 * @returns {Map<string, string>} URL path below /match/ ('bot.js', 'match/infra.js') → the file
 * @throws when a reached module imports anything but relative paths, or a server file outside server/match that has no mount
 *   of its own: (fork, live bug 2026-11-12) such a file used to be skipped here and then answered 404 in the browser, which
 *   failed the Worker's whole module graph, so no AI seat played at all (PlayerState.js → ../chatLimit.js)
 */
export function botModuleFiles(root = ROOT_MODULE, { serverDir = SERVER_DIR } = {}) {
  const matchDir = path.join(serverDir, 'match');
  // what the browser gets from elsewhere (static.js): server/sim and shared have mounts, server/data.js a stand-in at /data.js
  const mounted = (file) => file === path.join(serverDir, 'data.js') || [path.join(serverDir, 'sim'), path.resolve(serverDir, '..', 'shared')]
    .some((dir) => file.startsWith(dir + path.sep));
  const seen = new Set();
  const out = new Map();
  const walk = (file, from) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.startsWith(matchDir + path.sep)) {
      if (from && !mounted(file)) {
        throw new Error(`${path.relative(serverDir, from)} imports ${path.relative(serverDir, file)}: the browser Worker cannot load it (only server/match, server/sim, shared and server/data.js are served)`);
      }
      return;
    }
    out.set(path.relative(matchDir, file).split(path.sep).join('/'), file);
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2];
      if (!spec.startsWith('.')) throw new Error(`${path.relative(serverDir, file)} imports ${spec}: it cannot run in a browser Worker`);
      walk(path.resolve(path.dirname(file), spec), file);
    }
  };
  walk(root, null);
  return out;
}
