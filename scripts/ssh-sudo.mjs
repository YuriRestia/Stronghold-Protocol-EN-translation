// scripts/ssh-sudo.mjs — (fork) ssh to a server with its remembered sudo password, shared by scripts/release.mjs and
// scripts/deploy-regions.mjs. The password is stored by scripts/release-sudo.mjs (Windows DPAPI, per Windows user).
//
// How a command runs: a host whose `sudo -n true` works gets every leading `sudo` as `sudo -n` (never prompts). A host
// that asks for a password gets `sudo -S -p ''`, and the password goes to ssh's stdin, which sudo reads: never on a
// command line, in a log or in an environment variable. A wrong remembered password is reported, forgotten, and asked
// again once (in a terminal); a second refusal stops.
import { spawnSync } from 'node:child_process';
import * as defaultStore from './release-sudo.mjs';

/** Output kept from one captured command. */
export const CAPTURE_MAX = 64 * 1024 * 1024;
/** Where the user forgets a remembered password. */
export const FORGET_HINT = 'node scripts/deploy-regions.mjs --forget-sudo (or release.mjs --forget-sudo)';

/**
 * A leading `sudo` (or `sudo -n`) becomes `sudo -S -p ''` (password on stdin, no prompt text) or `sudo -n` (never
 * prompts). Other sudo options (`sudo -u …`) and lines without a leading sudo are unchanged.
 * @param {string} line @param {boolean} withPassword
 */
export function sudoLine(line, withPassword) {
  const m = /^sudo (?:-n )?(?!-)/.exec(line);
  if (!m) return line;
  return `${withPassword ? "sudo -S -p ''" : 'sudo -n'} ${line.slice(m[0].length)}`;
}

/**
 * ssh to one host. capture() returns { status, stdout, stderr }; stream() shows the output and throws on failure.
 * @param {string} host @param {string|null} password null: the host needs none
 * @param {{ spawn?: typeof spawnSync, say?: (s: string) => void }} [io] spawn: swapped in tests
 */
export function hostRunner(host, password, { spawn = spawnSync, say = (s) => console.log(s) } = {}) {
  const pw = password == null ? null : `${password}\n`;
  // the password goes to stdin only for a line that starts with the `sudo -S` it feeds: a line without a leading sudo
  // (an upload through stdin, say) never sees it
  const prep = (l, input = '') => {
    const cmd = sudoLine(l, pw !== null);
    return { cmd, stdin: (pw !== null && cmd.startsWith("sudo -S -p '' ") ? pw : '') + input };
  };
  return {
    host,
    hasPassword: pw !== null,
    /** @param {string} l @param {{ maxBuffer?: number, input?: string }} [o] input: more stdin after the password */
    capture(l, { maxBuffer = CAPTURE_MAX, input } = {}) {
      const { cmd, stdin } = prep(l, input);
      const r = spawn('ssh', [host, cmd], { input: stdin, encoding: 'utf8', windowsHide: true, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] });
      return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || r.error?.message || '') };
    },
    stream(l) {
      say(`\n=== ${host} ===`);
      const { cmd, stdin } = prep(l);
      const r = spawn('ssh', [host, cmd], { input: stdin, windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
      if (r.status !== 0) throw new Error(`${host}: the command failed (exit ${r.status ?? r.error?.message})`);
    },
  };
}

/**
 * The runner of each host, sudo checked before any real command. A host that needs a password gets the remembered
 * one, else (in a terminal) it is typed once and remembered; `sudo true` checks it; a refused one is forgotten and asked
 * again once. Without a terminal and without a remembered password: null for that host when `allowMissing` (a dry
 * run's reads are skipped), else a stop.
 * @param {{ host: string }[]} hosts
 * @param {{ allowMissing?: boolean, interactive?: boolean, store?: { load: (h: string) => string|null, askAndRemember: (h: string) => string, forget: (h?: string) => string[] },
 *   spawn?: typeof spawnSync, say?: (s: string) => void, stop?: (msg: string) => never }} [o]
 * @returns {Map<string, ReturnType<typeof hostRunner> | null>}
 */
export function sudoRunners(hosts, o = {}) {
  const {
    allowMissing = false, interactive = !!process.stdin.isTTY, store = defaultStore, spawn = spawnSync,
    say = (s) => console.log(s), stop = (msg) => { throw new Error(msg); },
  } = o;
  const io = { spawn, say };
  const out = new Map();
  for (const { host } of hosts) {
    if (out.has(host)) continue;
    const probe = hostRunner(host, null, io).capture('sudo true');
    if (probe.status === 255) stop(`${host}: ssh failed: ${probe.stderr.trim()}`);
    if (probe.status === 0) { out.set(host, hostRunner(host, null, io)); continue; }
    let pw = store.load(host);
    let typed = false;
    if (pw == null) {
      if (!interactive) {
        if (allowMissing) { say(`[sudo] ${host} asks for a sudo password and none is remembered; its sudo reads are skipped`); out.set(host, null); continue; }
        stop(`${host} asks for a sudo password: run this in a terminal once to type it (it is then remembered)`);
      }
      pw = store.askAndRemember(host);
      typed = true;
    }
    for (let attempt = 1; ; attempt++) {
      const r = hostRunner(host, pw, io);
      const check = r.capture('sudo true');
      if (check.status === 0) {
        say(`[sudo] ${host}: using the ${typed ? 'password just typed (remembered for next time)' : 'remembered sudo password'} (forget it: ${FORGET_HINT})`);
        out.set(host, r);
        break;
      }
      store.forget(host);
      const why = check.stderr.trim() || `exit ${check.status}`;
      if (attempt >= 2 || !interactive) stop(`${host}: sudo refused the ${typed ? 'typed' : 'remembered'} password (${why}); it is forgotten: run again to type it`);
      say(`[sudo] ${host}: sudo refused the ${typed ? 'typed' : 'remembered'} password (${why}); it is forgotten. Type it again:`);
      pw = store.askAndRemember(host);
      typed = true;
    }
  }
  return out;
}
