// scripts/generations.mjs — zero-downtime deploys behind scripts/router.mjs (one server process per "generation").
// Linux + systemd, run as root on the server (git / npm / setup run as SP_USER). Layout under SP_HOME (/opt/stronghold):
//
//   app/                    the control checkout: `git pull` here, then `deploy`. The router runs from here. Its
//                           gitignored heavy parts (public/assets, public/fonts, .cache, logs, data/local-assets.json)
//                           are shared with every release by symlink.
//   releases/<gen>/         one git worktree per generation (node_modules hard-linked from the previous one when the
//                           lockfile did not change)
//   gens/<gen>.env          PORT / SP_GEN / SP_GEN_FILE for the systemd template unit stronghold@<gen>
//   generations.json        the router's table { current, gens: { [gen]: { port, release, startedAt, retiringSince?, idleSince? } } }
//
//   node scripts/generations.mjs deploy [--ref <git ref>]   start a new generation of app/ (default HEAD), wait for its
//                                                          /healthz, make it current — the old one retires
//   node scripts/generations.mjs reap                       stop retired generations that are done (the 1-minute timer)
//   node scripts/generations.mjs rollback                   a NEW generation of the newest older release's commit
//   node scripts/generations.mjs status                     the table and each generation's /healthz
//
// A retiring generation stops when no human match is left and no socket is open, after IDLE_GRACE_MS without a human
// match (settlement screens), when it no longer answers, or MAX_AGE_MS after it retired — whichever comes first.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { GEN_ID_RE } from '../shared/gen.js';

export const PORT_RANGE = Object.freeze([3101, 3109]);
export const MAX_AGE_MS = 60 * 60 * 1000;
export const IDLE_GRACE_MS = 10 * 60 * 1000;
export const KEEP_RELEASES = 2;
export const HEALTH_WAIT_MS = 180_000;
/** gitignored parts of app/ every release links to (absent ones are skipped) */
export const SHARED_LINKS = Object.freeze(['public/assets', 'public/fonts', '.cache', 'logs', 'data/local-assets.json']);

// ---- pure decisions (test/generations.test.js) ------------------------------------------------------------------

/** UTC yymmdd-hhmmss. @param {Date} [d] */
export function newGenId(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** The lowest free port of PORT_RANGE, or null. @param {{ gens?: Record<string, { port: number }> } | null} table */
export function allocPort(table, range = PORT_RANGE) {
  const used = new Set(Object.values(table?.gens || {}).map((g) => g.port));
  for (let p = range[0]; p <= range[1]; p++) if (!used.has(p)) return p;
  return null;
}

/** The table once `gen` is current; every other generation is retiring from `now` on (unless it already was). */
export function withNewGen(table, gen, port, now, release) {
  const gens = {};
  for (const [id, g] of Object.entries(table?.gens || {})) gens[id] = { ...g, retiringSince: g.retiringSince ?? now };
  gens[gen] = { port, release, startedAt: now };
  return { current: gen, gens };
}

/**
 * Which retiring generations to stop now.
 * @param {{ current: string, gens: Record<string, any> }} table
 * @param {Record<string, { humanMatches?: number, sockets?: number } | null>} health each generation's /healthz (null: no answer)
 * @returns {{ stop: string[], table: { current: string, gens: Record<string, any> } }}
 */
export function reapPlan(table, health, now, { maxAgeMs = MAX_AGE_MS, idleGraceMs = IDLE_GRACE_MS } = {}) {
  const stop = [];
  const gens = {};
  for (const [id, g0] of Object.entries(table.gens)) {
    const g = { ...g0 };
    if (id === table.current) { gens[id] = g; continue; }
    const h = health[id];
    const since = g.retiringSince ?? now;
    const humans = Number(h?.humanMatches) || 0;
    if (humans === 0) g.idleSince = g.idleSince ?? now; else delete g.idleSince;
    const done = !h || now - since >= maxAgeMs || (humans === 0 && (Number(h.sockets) || 0) === 0)
      || (humans === 0 && now - g.idleSince >= idleGraceMs);
    if (done) stop.push(id); else gens[id] = g;
  }
  return { stop, table: { current: table.current, gens } };
}

/** Release dirs to delete: those not in the table beyond the KEEP newest. @param {string[]} names @param {{ gens: object }} table */
export function releasesToPrune(names, table, keep = KEEP_RELEASES) {
  const idle = names.filter((n) => GEN_ID_RE.test(n) && !Object.hasOwn(table?.gens || {}, n)).sort().reverse();
  return idle.slice(keep);
}

// ---- side effects (server only) ---------------------------------------------------------------------------------

const HOME = process.env.SP_HOME || '/opt/stronghold';
const APP = process.env.SP_APP || path.join(HOME, 'app');
const TABLE = process.env.SP_GEN_FILE || path.join(HOME, 'generations.json');
const RELEASES = path.join(HOME, 'releases');
const ENVS = path.join(HOME, 'gens');
const USER = process.env.SP_USER || 'stronghold';
const LOCK = `${TABLE}.lock`;

const isRoot = () => typeof process.getuid === 'function' && process.getuid() === 0;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
/** as SP_USER when root (git, npm, setup must not leave root-owned files in a release) */
const asUser = (cmd, args, opts = {}) => (isRoot() ? run('runuser', ['-u', USER, '--', cmd, ...args], opts) : run(cmd, args, opts));
/** a command's stdout — as SP_USER when root too: git refuses a repository owned by another user ("dubious ownership") */
const out = (cmd, args, opts = {}) => execFileSync(isRoot() ? 'runuser' : cmd, isRoot() ? ['-u', USER, '--', cmd, ...args] : args,
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();

function readTable() {
  try { return JSON.parse(fs.readFileSync(TABLE, 'utf8')); } catch { return null; }
}
function writeTable(t) {
  const tmp = `${TABLE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(t, null, 2)}\n`);
  fs.renameSync(tmp, TABLE); // atomic: the router and the generations never read half a file
}
function withLock(fn) {
  try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); } catch {
    const age = Date.now() - (fs.statSync(LOCK, { throwIfNoEntry: false })?.mtimeMs ?? 0);
    if (age < 15 * 60 * 1000) throw new Error(`another deploy / reap holds ${LOCK} (delete it if none is running)`);
    fs.writeFileSync(LOCK, String(process.pid));
  }
  return Promise.resolve().then(fn).finally(() => fs.rmSync(LOCK, { force: true }));
}
async function health(port, timeoutMs = 3000) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deploy(ref = 'HEAD') {
  if (!isRoot()) throw new Error('run as root: sudo node scripts/generations.mjs deploy');
  const table = readTable();
  const gen = newGenId();
  const port = allocPort(table);
  if (port == null) throw new Error(`no free port in ${PORT_RANGE.join('–')}: run reap first`);
  const rel = path.join(RELEASES, gen);
  fs.mkdirSync(RELEASES, { recursive: true });
  fs.mkdirSync(ENVS, { recursive: true });
  run('chown', [`${USER}:${USER}`, RELEASES]);
  const commit = out('git', ['-C', APP, 'rev-parse', '--verify', `${ref}^{commit}`]);
  console.log(`[deploy] ${gen}: ${commit.slice(0, 10)} on port ${port}`);
  asUser('git', ['-C', APP, 'worktree', 'add', '--detach', rel, commit]);
  for (const link of SHARED_LINKS) {
    const src = path.join(APP, link);
    if (!fs.existsSync(src)) continue;
    fs.rmSync(path.join(rel, link), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(path.join(rel, link)), { recursive: true });
    fs.symlinkSync(src, path.join(rel, link));
  }
  const prev = table?.gens?.[table.current]?.release;
  const sameLock = prev && fs.existsSync(path.join(prev, 'node_modules'))
    && fs.readFileSync(path.join(prev, 'package-lock.json'), 'utf8') === fs.readFileSync(path.join(rel, 'package-lock.json'), 'utf8');
  if (sameLock) asUser('cp', ['-al', path.join(prev, 'node_modules'), path.join(rel, 'node_modules')]);
  else asUser('npm', ['ci', '--omit=dev'], { cwd: rel });
  asUser('node', ['tools/setup.mjs', '--no-local', '--quiet'], { cwd: rel });
  fs.writeFileSync(path.join(ENVS, `${gen}.env`), `PORT=${port}\nHOST=127.0.0.1\nSP_GEN=${gen}\nSP_GEN_FILE=${TABLE}\n`);
  run('systemctl', ['enable', '--now', `stronghold@${gen}`]);
  const until = Date.now() + HEALTH_WAIT_MS;
  let h = null;
  while (Date.now() < until && !(h && h.gen === gen)) { await sleep(2000); h = await health(port); }
  if (!(h && h.gen === gen)) {
    run('systemctl', ['disable', '--now', `stronghold@${gen}`]);
    throw new Error(`${gen} did not answer /healthz in ${HEALTH_WAIT_MS / 1000} s — nothing changed for players. See: journalctl -u stronghold@${gen} -n 50`);
  }
  await withLock(() => {
    const cur = readTable();
    writeTable(withNewGen(cur, gen, port, Date.now(), rel));
    if (cur?.current) run('systemctl', ['disable', `stronghold@${cur.current}`]); // keeps running; only `gen` comes back after a reboot
  });
  console.log(`[deploy] ${gen} is current (build ${h.build}). Older generations retire; reap stops them when done.`);
}

async function reap() {
  await withLock(async () => {
    const table = readTable();
    if (!table) return;
    const hs = {};
    for (const [id, g] of Object.entries(table.gens)) if (id !== table.current) hs[id] = await health(g.port);
    const plan = reapPlan(table, hs, Date.now());
    writeTable(plan.table); // first: the router stops sending anything to them
    for (const id of plan.stop) {
      console.log(`[reap] stopping ${id} (${hs[id] ? `${hs[id].humanMatches} human match(es), ${hs[id].sockets} socket(s)` : 'no answer'})`);
      try { run('systemctl', ['disable', '--now', `stronghold@${id}`]); } catch { /* already gone */ }
      fs.rmSync(path.join(ENVS, `${id}.env`), { force: true });
    }
    const names = fs.existsSync(RELEASES) ? fs.readdirSync(RELEASES) : [];
    for (const name of releasesToPrune(names, plan.table)) {
      console.log(`[reap] removing release ${name}`);
      try { asUser('git', ['-C', APP, 'worktree', 'remove', '--force', path.join(RELEASES, name)]); } catch {
        fs.rmSync(path.join(RELEASES, name), { recursive: true, force: true });
      }
    }
    try { asUser('git', ['-C', APP, 'worktree', 'prune']); } catch { /* ignore */ }
  });
}

async function rollback() {
  const table = readTable();
  if (!table) throw new Error('no generations.json yet');
  const names = fs.readdirSync(RELEASES).filter((n) => GEN_ID_RE.test(n) && n < table.current).sort().reverse();
  const commits = names.map((n) => { try { return out('git', ['-C', path.join(RELEASES, n), 'rev-parse', 'HEAD']); } catch { return null; } });
  const curCommit = out('git', ['-C', table.gens[table.current].release, 'rev-parse', 'HEAD']);
  const target = commits.find((c) => c && c !== curCommit);
  if (!target) throw new Error('no older release with a different commit is kept');
  console.log(`[rollback] new generation of ${target.slice(0, 10)}`);
  await deploy(target);
}

async function status() {
  const table = readTable();
  if (!table) { console.log(`no ${TABLE} yet`); return; }
  for (const [id, g] of Object.entries(table.gens)) {
    const h = await health(g.port);
    const state = id === table.current ? 'CURRENT' : `retiring ${Math.round((Date.now() - g.retiringSince) / 60000)} min`;
    console.log(`${id}  port ${g.port}  ${state.padEnd(16)}  ${h ? `build ${h.build}, ${h.humanMatches} human match(es), ${h.sockets} socket(s), ${h.rooms} room(s)` : 'NO ANSWER'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const refAt = rest.indexOf('--ref');
  const jobs = { deploy: () => deploy(refAt >= 0 ? rest[refAt + 1] : 'HEAD'), reap, rollback, status };
  if (!jobs[cmd]) {
    console.log('usage: node scripts/generations.mjs deploy [--ref <git ref>] | reap | rollback | status');
    process.exit(cmd ? 1 : 0);
  }
  jobs[cmd]().catch((e) => { console.error(`[${cmd}] ${e.message || e}`); process.exit(1); });
}
