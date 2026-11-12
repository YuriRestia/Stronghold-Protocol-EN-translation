#!/usr/bin/env node
// scripts/release.mjs — (fork) the PC side of a release in one command, run by the operator in the project folder on
// dev-0.2. It ends with the new generation PREPARED on every server; switching players over stays a separate command.
//
//   node scripts/release.mjs                 the release (asks before anything unusual)
//   node scripts/release.mjs --dry-run       every read-only step against the real servers, then the plan: nothing is
//                                            committed, pushed, uploaded or prepared
//   node scripts/release.mjs --skip-ci       ship without waiting for GitHub's checks
//   node scripts/release.mjs --forget-sudo   delete the remembered sudo password(s) (scripts/release-sudo.mjs)
//   options: --hosts spa,usspa:no-art (default; SP_DEPLOY_HOSTS) · --ci-timeout <minutes> (default 45)
//
// Steps, in order; the first failure stops the release with what to do, and each step prints what it changed:
//   0. checks: on dev-0.2, no uncommitted change to tracked files, nothing on GitHub's dev-0.2 that this PC lacks
//   1. the changelog fragments folded into FORK-CHANGELOG.md (tools/changelog.mjs --write), shown and committed; and
//      the lobby's live update news drafted from them (scripts/release-news.mjs): edited in Notepad, checked, saved in
//      logs/. It goes live only with the news command printed at the end, after you activate. Nothing to fold: goes on.
//   2. dev-0.2 pushed to origin (only dev-0.2: the script pushes nothing else)
//   3. GitHub's checks (CI) on the pushed commit, read with `gh`: waits up to --ci-timeout. Not green: stops, unless
//      you answer y to "ship anyway?" or passed --skip-ci.
//   4. the art on the art server (the first host without :no-art; the US serves no art), file by file against its
//      own list (scripts/release-art.mjs): uploads only what it lacks or has at another size, the 4 shared lists only
//      when their content differs, re-checks and repeats (at most 3 rounds), then the gate: every file of the
//      release's data/assets.json on the server and public/ under 60,000 files. The clip bounds are rebuilt on the PC
//      only when stale and uploaded only when they differ. Replaced lists are backed up first in
//      /root/release-backups/<time>/ on the server. Sizes are printed before each upload; over 1 GB asks first.
//   5. scripts/deploy-regions.mjs prepare on every server: prints the generation id, the private test URLs and the
//      activate command. Never activates.
//
// A server whose sudo asks for a password (the US one): typed once in a hidden PowerShell prompt, stored encrypted for
// your Windows user only (DPAPI), fed to `sudo -S` over ssh's stdin. Never on a command line, in the repo or a log.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { parseHosts, formatHosts, shQuote, statusCommand, prepare } from './deploy-regions.mjs';
import {
  SHARED_LISTS, CLIP_BOUNDS, ASK_ABOVE_BYTES, MAX_PACK_BYTES, PUBLIC_FILE_LIMIT,
  parseFileList, neededArt, artPlan, differingLists, parseSha256, artGate, mb,
} from './release-art.mjs';
import * as sudoStore from './release-sudo.mjs';
import { fragmentFiles } from '../tools/changelog.mjs';
import { bumpNews } from './release-news.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BRANCH = 'dev-0.2';
export const DEFAULT_HOSTS = 'spa,usspa:no-art';
const APP = '/opt/stronghold/app';
const ART_ROUNDS = 3;
const CI_POLL_MS = 30_000;
/** A pushed commit whose CI run has not appeared after this long has none (e.g. Actions off for the fork). */
const CI_APPEAR_MS = 5 * 60_000;
const CAPTURE_MAX = 64 * 1024 * 1024;
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

// ---- pure parts (test/release.test.js) ------------------------------------------------------------------------

/** The command line → options, or { error }. @param {string[]} argv @param {Record<string, string | undefined>} [env] */
export function parseReleaseArgs(argv, env = process.env) {
  const known = new Set(['--dry-run', '--skip-ci', '--forget-sudo', '--hosts', '--ci-timeout', '--root', '--help', '-h']);
  const o = { dryRun: false, skipCi: false, forgetSudo: false, help: false, ciTimeoutMin: 45, root: join(HERE, '..'), hosts: [] };
  let hostsRaw = env.SP_DEPLOY_HOSTS || DEFAULT_HOSTS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!known.has(a)) return { error: `unknown option ${a}` };
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--skip-ci') o.skipCi = true;
    else if (a === '--forget-sudo') o.forgetSudo = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value` };
      if (a === '--hosts') hostsRaw = v;
      else if (a === '--root') o.root = v;
      else {
        const n = Number(v);
        if (!(n > 0 && n <= 180)) return { error: '--ci-timeout needs minutes, 1 to 180' };
        o.ciTimeoutMin = n;
      }
    }
  }
  o.hosts = parseHosts(hostsRaw);
  if (!o.hosts.length) return { error: 'no servers: --hosts spa,usspa:no-art' };
  if (o.hosts.some((h) => !/^[A-Za-z0-9._@-]+$/.test(h.host))) return { error: `not an ssh host name: ${formatHosts(o.hosts)}` };
  return o;
}

/** `git@github.com:o/r.git` / `https://github.com/o/r` → `o/r`, or null. @param {string} url */
export function githubRepo(url) {
  const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url || '').trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

const OK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

/**
 * GitHub's checks on one commit, from `gh run list --json headSha,status,conclusion,workflowName,event,url,createdAt`:
 * the newest push run of each workflow on `sha`. none: no run yet; running: one still going; red: one did not pass;
 * green: every one passed.
 * @param {any[]} runs @param {string} sha
 * @returns {{ state: 'none'|'running'|'red'|'green', runs: any[], failed: string[] }}
 */
export function ciDecision(runs, sha) {
  const newest = new Map();
  for (const r of runs || []) {
    if (r?.headSha !== sha || r.event !== 'push') continue;
    const was = newest.get(r.workflowName);
    if (!was || String(r.createdAt) > String(was.createdAt)) newest.set(r.workflowName, r);
  }
  const mine = [...newest.values()].sort((a, b) => String(a.workflowName).localeCompare(String(b.workflowName)));
  if (!mine.length) return { state: 'none', runs: [], failed: [] };
  if (mine.some((r) => r.status !== 'completed')) return { state: 'running', runs: mine, failed: [] };
  const failed = mine.filter((r) => !OK_CONCLUSIONS.has(r.conclusion)).map((r) => `${r.workflowName} (${r.conclusion})`);
  return { state: failed.length ? 'red' : 'green', runs: mine, failed };
}

/**
 * Ship after the CI step? green ships; --skip-ci ships without looking; anything else ships only on a typed "y".
 * @param {'none'|'running'|'red'|'green'|'timeout'|'skipped'} state @param {{ skipCi?: boolean, override?: boolean }} o
 */
export function ciShips(state, { skipCi = false, override = false } = {}) {
  if (skipCi || state === 'green') return true;
  return override === true;
}

/**
 * The fold step: fold when there are fragments, else say so and go on.
 * @param {string[]} fragments file names in changes/ (README.md excluded)
 */
export function foldPlan(fragments) {
  if (!fragments.length) return { fold: false, say: 'changelog: nothing to fold (no fragments in changes/)' };
  return { fold: true, say: `changelog: ${fragments.length} fragment(s) to fold: ${fragments.join(', ')}` };
}

/**
 * A server command for a host: its leading `sudo` / `sudo -n` becomes `sudo -S -p ''` (password on stdin) for a host
 * with a password, `sudo -n` (never prompts: fails at once) for one without. Inner sudo calls run as root and are left.
 * @param {string} line @param {boolean} withPassword
 */
export function sudoLine(line, withPassword) {
  const m = /^sudo (?:-n )?(?!-)/.exec(line);
  if (!m) return line;
  return `${withPassword ? "sudo -S -p ''" : 'sudo -n'} ${line.slice(m[0].length)}`;
}

/** sed expression (server) and its JS twin: the clip bounds without their `"generated"` time, to compare tables. */
const CLIP_STAMP_SED = 's/"generated":"[^"]*"//';
export const stripClipStamp = (text) => String(text).replace(/"generated":"[^"]*"/, '');

/** The head of data/clip-bounds.json → { generated, count, clips } (empty when unreadable). @param {string} head */
export function clipInfo(head) {
  const g = /"generated":"([^"]+)"/.exec(head), n = /"count":(\d+)/.exec(head), c = /"clips":(\d+)/.exec(head);
  return g ? { generated: g[1], count: Number(n?.[1]), clips: Number(c?.[1]) } : {};
}

/**
 * Upload the PC's clip bounds? same: equal tables (the time they were made aside): no; otherwise yes, the PC is the
 * source (art rules). server-newer only names the case of a table rebuilt on the server, so the release can say so.
 * @param {{ sum?: string, generated?: string }} mine @param {{ sum?: string, generated?: string }} theirs
 */
export function clipVerdict(mine, theirs) {
  if (theirs.sum && theirs.sum === mine.sum) return 'same';
  if (theirs.generated && mine.generated && theirs.generated > mine.generated) return 'server-newer';
  return 'upload';
}

/** The commit message of the fold commit (one line). @param {number} n @param {string} date YYYY-MM-DD */
export const foldMessage = (n, date) => `Fold ${n} changelog fragment${n === 1 ? '' : 's'} into FORK-CHANGELOG for the ${date} release`;

// ---- side effects -----------------------------------------------------------------------------------------------

class Stop extends Error {}
const stop = (msg) => { throw new Stop(msg); };
const say = (s) => console.log(s);
const head = (n, title) => say(`\n━━ ${n}. ${title} ━━`);

function git(root, args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: CAPTURE_MAX });
  if (r.status !== 0 && !allowFail) stop(`git ${args.join(' ')} failed: ${String(r.stderr || r.error?.message || '').trim()}`);
  return r.status === 0 ? String(r.stdout).trim() : null;
}

async function ask(question) {
  if (!process.stdin.isTTY) { say(`${question} [no terminal to answer: N]`); return false; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(`${question} y/N `)).trim()); } finally { rl.close(); }
}

/** One typed line (e.g. Enter after editing the news in Notepad). */
async function promptLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(question); } finally { rl.close(); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ssh to one host. capture/stream run one command; a remembered password goes to `sudo -S` on stdin, a host without
 * one gets `sudo -n` (sudoLine). The password is never printed or put on a command line.
 */
function hostRunner(host, password) {
  const pw = password == null ? null : `${password}\n`;
  const line = (l) => sudoLine(l, pw !== null);
  return {
    host,
    hasPassword: pw !== null,
    capture(l, { maxBuffer = CAPTURE_MAX } = {}) {
      const r = spawnSync('ssh', [host, line(l)], { input: pw ?? '', encoding: 'utf8', windowsHide: true, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] });
      return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || r.error?.message || '') };
    },
    stream(l) {
      say(`\n=== ${host} ===`);
      const r = spawnSync('ssh', [host, line(l)], { input: pw ?? '', windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
      if (r.status !== 0) throw new Error(`${host}: the command failed (exit ${r.status ?? r.error?.message})`);
    },
  };
}

/**
 * The runner of each host: probes `sudo -n true`; a host that needs a password gets the remembered one (asked once
 * and stored when there is a terminal), checked with `sudo true` before anything else. null password + no terminal:
 * the host's sudo steps are skipped (dry run) or the release stops.
 */
function runnersFor(hosts, { dryRun }) {
  const out = new Map();
  for (const { host } of hosts) {
    const probe = hostRunner(host, null).capture('sudo true');
    if (probe.status === 255) stop(`${host}: ssh failed: ${probe.stderr.trim()}`);
    if (probe.status === 0) { out.set(host, hostRunner(host, null)); continue; }
    let pw = sudoStore.load(host);
    if (pw == null) {
      if (!process.stdin.isTTY) {
        if (dryRun) { say(`[sudo] ${host} asks for a sudo password and none is remembered; its sudo reads are skipped in this dry run`); out.set(host, null); continue; }
        stop(`${host} asks for a sudo password: run this in a terminal once to type it`);
      }
      pw = sudoStore.askAndRemember(host);
    }
    const r = hostRunner(host, pw);
    const check = r.capture('sudo true');
    if (check.status !== 0) {
      sudoStore.forget(host);
      stop(`${host}: sudo refused the remembered password (${check.stderr.trim() || `exit ${check.status}`}); it is forgotten: run again to type it`);
    }
    say(`[sudo] ${host}: using the remembered sudo password (forget it: node scripts/release.mjs --forget-sudo)`);
    out.set(host, r);
  }
  return out;
}

// -- step 0 ------------------------------------------------------------------------------------------------------

function preflight(o) {
  head(0, 'Checks');
  const branch = git(o.root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== BRANCH) stop(`this checkout is on ${branch}; a release runs on ${BRANCH} (git switch ${BRANCH})`);
  const dirty = git(o.root, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) {
    if (!o.dryRun) stop(`uncommitted changes to tracked files; commit or undo them first:\n${dirty}`);
    say(`  (dry run) uncommitted changes to tracked files; a real release stops here:\n${dirty.split('\n').map((l) => `    ${l}`).join('\n')}`);
  }
  const local = git(o.root, ['rev-parse', 'HEAD']);
  const remoteLine = git(o.root, ['ls-remote', 'origin', `refs/heads/${BRANCH}`]) || '';
  const remote = remoteLine.split(/\s+/)[0] || null;
  if (remote && remote !== local) {
    const known = git(o.root, ['cat-file', '-e', `${remote}^{commit}`], { allowFail: true }) !== null;
    if (!known || git(o.root, ['merge-base', '--is-ancestor', remote, local], { allowFail: true }) === null) {
      stop(`GitHub's ${BRANCH} has commits this PC lacks; pull them first (git pull --ff-only origin ${BRANCH})`);
    }
  }
  const ahead = remote && remote !== local ? Number(git(o.root, ['rev-list', '--count', `${remote}..${local}`])) : 0;
  const repo = githubRepo(git(o.root, ['remote', 'get-url', 'origin']));
  if (!repo) stop('origin is not a GitHub repository');
  say(`  ${BRANCH} here: ${git(o.root, ['log', '-1', '--format=%s', local])}`);
  say(`  GitHub (${repo}): ${remote === local ? 'the same commit' : remote ? `${ahead} commit(s) behind this PC` : `no ${BRANCH} yet`}`);
  return { local, remote, ahead, repo };
}

// -- step 1 ------------------------------------------------------------------------------------------------------

async function foldChangelog(o, runners) {
  head(1, 'Changelog and update news');
  const files = fragmentFiles(join(o.root, 'changes'));
  const plan = foldPlan(files);
  say(`  ${plan.say}`);
  if (plan.fold) {
    const check = spawnSync(process.execPath, ['tools/changelog.mjs', '--check'], { cwd: o.root, encoding: 'utf8', windowsHide: true });
    if (check.status !== 0) stop(`a fragment is not valid; fix it first:\n${String(check.stdout || '') + String(check.stderr || '')}`);
  }
  // the news is drafted from the fragments before they are folded away
  const news = await bumpNews({ root: o.root, fragments: files, dryRun: o.dryRun, live: files.length ? liveNews(o, runners) : null, ask, prompt: promptLine });
  if (!plan.fold) return { folded: 0, news };
  if (o.dryRun) { say('  (dry run) would run: node tools/changelog.mjs --write, then commit FORK-CHANGELOG.md and changes/'); return { folded: 0, news }; }
  const w = spawnSync(process.execPath, ['tools/changelog.mjs', '--write'], { cwd: o.root, encoding: 'utf8', windowsHide: true });
  say(String(w.stdout || '').trim());
  if (w.status !== 0) stop(`tools/changelog.mjs --write failed:\n${String(w.stderr || '')}`);
  git(o.root, ['add', '--', 'FORK-CHANGELOG.md', 'changes']);
  git(o.root, ['commit', '-q', '-m', foldMessage(files.length, new Date().toISOString().slice(0, 10))]);
  say(git(o.root, ['show', '--stat', '--format=  committed: %s', 'HEAD']));
  return { folded: files.length, news };
}

/**
 * The live news now on the first server we can read (its logs/news.json), parsed JSON or null (none, unreadable, or
 * no sudo for it in a dry run). Every server holds the same file (deploy-regions.mjs news puts it on all of them).
 */
function liveNews(o, runners) {
  const r = o.hosts.map((h) => runners.get(h.host)).find(Boolean);
  if (!r) { say('  news: no server readable (sudo password), drafting without the live news'); return null; }
  const got = r.capture(`sudo bash -c ${shQuote(`cd ${APP} && [ -f logs/news.json ] && head -c 65536 logs/news.json; true`)}`);
  if (got.status !== 0 || !got.stdout.trim()) return null;
  try { return JSON.parse(got.stdout); } catch { say(`  news: ${r.host}'s logs/news.json is not JSON; drafting without it`); return null; }
}

// -- step 2 ------------------------------------------------------------------------------------------------------

function push(o, pre) {
  head(2, `Push ${BRANCH}`);
  const local = git(o.root, ['rev-parse', 'HEAD']);
  const ahead = pre.remote ? Number(git(o.root, ['rev-list', '--count', `${pre.remote}..${local}`])) : null;
  if (pre.remote === local) { say('  GitHub already has this commit: nothing to push'); return local; }
  if (o.dryRun) { say(`  (dry run) would push ${ahead ?? 'every'} commit(s): git push origin ${BRANCH}`); return local; }
  // only dev-0.2, by its full name on both sides
  const r = spawnSync('git', ['push', 'origin', `refs/heads/${BRANCH}:refs/heads/${BRANCH}`], { cwd: o.root, stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) stop(`git push failed (exit ${r.status})`);
  say(`  pushed ${ahead ?? ''} commit(s)`);
  return local;
}

// -- step 3 ------------------------------------------------------------------------------------------------------

function ghRuns(repo) {
  const r = spawnSync('gh', ['run', 'list', '-R', repo, '--branch', BRANCH, '-L', '40', '--json', 'headSha,status,conclusion,workflowName,event,url,createdAt'],
    { encoding: 'utf8', windowsHide: true, maxBuffer: CAPTURE_MAX });
  if (r.error) stop(`gh is not installed or not on PATH (${r.error.message}); install GitHub CLI, or ship with --skip-ci`);
  if (r.status !== 0) return { error: String(r.stderr || '').trim() || `exit ${r.status}` };
  try { return { runs: JSON.parse(r.stdout) }; } catch { return { error: 'gh printed no JSON' }; }
}

const showCi = (d) => d.runs.map((r) => `    ${r.workflowName}: ${r.status === 'completed' ? r.conclusion : r.status}  ${r.url}`).join('\n');

async function ciStep(o, pre, sha) {
  head(3, "GitHub's checks (CI)");
  if (o.skipCi) { say('  skipped (--skip-ci)'); return 'skipped'; }
  if (o.dryRun) {
    const pushed = pre.remote === sha;
    const target = pushed ? sha : pre.remote;
    if (!target) { say('  (dry run) nothing on GitHub yet; the push starts the first run'); return 'none'; }
    const got = ghRuns(pre.repo);
    if (got.error) { say(`  (dry run) gh could not read the runs: ${got.error}`); return 'none'; }
    const d = ciDecision(got.runs, target);
    say(`  ${pushed ? 'this commit' : `GitHub's current ${BRANCH} (the push would start a new run for this one)`}: ${d.state}`);
    if (d.runs.length) say(showCi(d));
    say(`  a real release waits up to ${o.ciTimeoutMin} min, then stops unless you answer y (or pass --skip-ci)`);
    return d.state;
  }
  const t0 = Date.now(), until = t0 + o.ciTimeoutMin * 60_000;
  let last = '', d = { state: 'none', runs: [], failed: [] }, state;
  say(`  waiting for the runs of this commit, at most ${o.ciTimeoutMin} min (Ctrl+C stops the release; nothing is prepared yet)`);
  for (;;) {
    const got = ghRuns(pre.repo);
    if (got.error) say(`  gh: ${got.error} (trying again)`);
    else d = ciDecision(got.runs, sha);
    const min = Math.floor((Date.now() - t0) / 60_000);
    const line = `${d.state}${d.runs.length ? `: ${d.runs.map((r) => `${r.workflowName} ${r.status === 'completed' ? r.conclusion : r.status}`).join(', ')}` : ''}`;
    if (line !== last) { say(`  [${min} min] ${line}`); last = line; }
    if (d.state === 'green' || d.state === 'red') { state = d.state; break; }
    if (d.state === 'none' && Date.now() - t0 > CI_APPEAR_MS) { state = 'none'; break; }
    if (Date.now() > until) { state = 'timeout'; break; }
    await sleep(CI_POLL_MS);
  }
  if (d.runs.length) say(showCi(d));
  if (state === 'green') { say(`  CI green after ${Math.round((Date.now() - t0) / 60_000)} min`); return state; }
  const why = state === 'red' ? `CI failed: ${d.failed.join(', ')}` : state === 'none' ? `no CI run appeared within ${CI_APPEAR_MS / 60_000} min` : `CI not finished after ${o.ciTimeoutMin} min`;
  say(`  ${why}`);
  if (!ciShips(state, { override: await ask('  Ship anyway (override CI)?') })) stop(`${why}. Nothing was prepared. Fix and run again, or answer y / pass --skip-ci to ship anyway.`);
  say('  shipping anyway: CI overridden by you');
  return state;
}

// -- step 4 ------------------------------------------------------------------------------------------------------

function walkFiles(root, rel, out = []) {
  let ents;
  try { ents = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = `${rel}/${e.name}`;
    if (e.isDirectory()) walkFiles(root, p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}

function sha256(file) {
  try { return createHash('sha256').update(readFileSync(file)).digest('hex'); } catch { return undefined; }
}

function serverState(r) {
  const list = r.capture(`sudo bash -c ${shQuote(`cd ${APP} && find public/assets public/fonts -type f -printf '%p\\t%s\\n'`)}`);
  if (list.status !== 0) stop(`${r.host}: cannot list the art: ${list.stderr.trim()}`);
  const files = [...SHARED_LISTS, CLIP_BOUNDS];
  const sums = r.capture(`sudo bash -c ${shQuote(`cd ${APP} && sha256sum ${files.join(' ')} 2>/dev/null; true`)}`);
  const count = r.capture(`sudo bash -c ${shQuote(`cd ${APP} && find public -type f | wc -l`)}`);
  const df = r.capture(`df -B1 --output=avail "$HOME" ${APP} | tail -n +2`);
  const [homeFree, appFree] = df.stdout.trim().split(/\s+/).map(Number);
  const clip = r.capture(`sudo bash -c ${shQuote(`cd ${APP} && [ -f ${CLIP_BOUNDS} ] && head -c 400 ${CLIP_BOUNDS} && echo && sed ${shQuote(CLIP_STAMP_SED)} ${CLIP_BOUNDS} | sha256sum; true`)}`);
  const [clipHead = '', clipSum = ''] = clip.stdout.split('\n');
  return {
    files: parseFileList(list.stdout), sums: parseSha256(sums.stdout), publicFiles: Number(count.stdout.trim()), homeFree, appFree,
    clip: { ...clipInfo(clipHead), sum: clipSum.split(/\s+/)[0] || undefined },
  };
}

function folderSummary(files, pc) {
  const by = new Map();
  for (const f of files) {
    const k = f.split('/').slice(0, f.startsWith('public/assets/') ? 4 : 2).join('/');
    const e = by.get(k) || { n: 0, bytes: 0 };
    e.n++; e.bytes += pc.get(f) ?? 0; by.set(k, e);
  }
  return [...by].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12).map(([k, e]) => `    ${String(e.n).padStart(6)}  ${mb(e.bytes).padStart(9)}  ${k}`).join('\n');
}

/**
 * Stream `files` (paths relative to root) as one tar into a new file in the login user's home on the art server,
 * capped; returns the server path. Nothing is written on the PC.
 */
function sendTar(r, root, files, expectBytes) {
  const cap = Math.ceil(expectBytes + files.length * 2048 + 16 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    const recv = `umask 077; f=$(mktemp "$HOME/sp-release-XXXXXX.tar") || exit 1; head -c ${cap + 1} > "$f"; echo "$f $(wc -c < "$f")"`;
    const ssh = spawn('ssh', [r.host, recv], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    const tar = spawn(TAR, ['-cf', '-', '-T', '-'], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
    let sent = 0, out = '', failed = null;
    const fail = (m) => { if (!failed) { failed = m; tar.kill(); ssh.stdin.destroy(); } };
    tar.stdin.end(`${files.join('\n')}\n`);
    tar.stdout.on('data', (c) => { sent += c.length; if (sent > cap) fail(`the pack passed its cap of ${mb(cap)}`); });
    tar.stdout.pipe(ssh.stdin);
    ssh.stdout.on('data', (c) => { if (out.length < 4096) out += c; });
    let left = 2, tarCode = null;
    const done = () => {
      if (--left) return;
      const [path, size] = out.trim().split(/\s+/);
      if (!failed && tarCode !== 0) failed = `tar failed (exit ${tarCode})`;
      if (!failed && (!/^\/[A-Za-z0-9/._-]+\/sp-release-[A-Za-z0-9]+\.tar$/.test(path || '') || Number(size) !== sent)) failed = `the server received ${size} of ${sent} bytes`;
      if (failed) {
        if (/^\/[A-Za-z0-9/._-]+\/sp-release-[A-Za-z0-9]+\.tar$/.test(path || '')) r.capture(`rm -f ${shQuote(path)}`);
        reject(new Stop(`upload to ${r.host} failed: ${failed}; the partial file was removed`));
      } else resolve({ path, sent });
    };
    tar.on('error', (e) => fail(`tar: ${e.message}`));
    ssh.on('error', (e) => fail(`ssh: ${e.message}`));
    tar.on('close', (code) => { tarCode = code; done(); });
    ssh.on('close', () => done());
  });
}

/** On the server, as root: back up the files of `replace` that exist, unpack the tar as the game's user, delete it. */
function unpackCommand(tarPath, replace, stamp) {
  const backup = `/root/release-backups/${stamp}`;
  const save = replace.length
    ? `mkdir -p ${backup} && for p in ${replace.map(shQuote).join(' ')}; do if [ -f "$p" ]; then cp -p --parents "$p" ${backup}/; fi; done && echo "backups: ${backup}" && `
    : '';
  return `sudo bash -c ${shQuote(`trap ${shQuote(`rm -f ${tarPath}`)} EXIT; cd ${APP} && ${save}sudo -u stronghold tar -xf - -C ${APP} < ${tarPath}`)}`;
}

async function artStep(o, runners) {
  head(4, 'Art');
  const artHost = o.hosts.find((h) => !h.noArt);
  if (!artHost) { say('  every server is :no-art: nothing to do'); return null; }
  const r = runners.get(artHost.host);
  if (!r) { say(`  (dry run) skipped: ${artHost.host}'s sudo password is needed to read its art`); return null; }
  const sha = git(o.root, ['rev-parse', 'HEAD']);
  const manifestText = git(o.root, ['show', `${sha}:data/assets.json`]);
  const manifest = JSON.parse(manifestText);
  const local = walkFiles(o.root, 'public/assets/local');
  const needed = neededArt(manifest, local);
  const pc = new Map();
  for (const f of needed) { try { pc.set(f, statSync(join(o.root, f)).size); } catch { /* the PC lacks it */ } }
  for (const f of SHARED_LISTS) { try { pc.set(f, statSync(join(o.root, f)).size); } catch { stop(`missing on the PC: ${f}`); } }
  const pcSums = Object.fromEntries([...SHARED_LISTS].map((f) => [f, sha256(join(o.root, f))]));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
  say(`  ${artHost.host} is the art server; this release needs ${needed.size} files there`);

  let srv, plan;
  for (let round = 1; ; round++) {
    srv = serverState(r);
    plan = artPlan({ needed, pc, server: srv.files, listsDiffer: differingLists(pcSums, srv.sums) });
    say(`  round ${round}: the server has ${srv.files.size} art files; to upload: ${plan.upload.length} files, ${mb(plan.bytes)}`);
    if (round === 1 && plan.kept.length) say(`  kept on purpose (the server's copy is the right one): ${plan.kept.length} files (release-art.mjs KEEP_SERVER_COPY)`);
    if (plan.nowhere.length) stop(`MISSING ON BOTH PC AND SERVER: ${plan.nowhere.length} files (first: ${plan.nowhere.slice(0, 5).join(', ')}). Fetch or extract them on the PC first.`);
    if (!plan.upload.length) break;
    if (round > ART_ROUNDS) stop(`after ${ART_ROUNDS} uploads the server still differs in ${plan.upload.length} files (first: ${plan.upload.slice(0, 5).join(', ')})`);
    say(folderSummary(plan.upload, pc));
    const lists = plan.upload.filter((f) => SHARED_LISTS.includes(f));
    if (lists.length) say(`  shared lists replaced (backed up first): ${lists.join(', ')}`);
    if (o.dryRun) { say('  (dry run) nothing uploaded'); break; }
    const odd = plan.upload.filter((f) => /[^\x20-\x7e]/.test(f));
    if (odd.length) stop(`Windows' tar cannot be trusted with these file names (not plain ASCII): ${odd.slice(0, 5).join(', ')}`);
    if (plan.bytes > MAX_PACK_BYTES) stop(`the pack is ${mb(plan.bytes)}, over the ${mb(MAX_PACK_BYTES)} cap: the list is wrong, not the release`);
    if (plan.bytes > ASK_ABOVE_BYTES && !(await ask(`  The pack is ${mb(plan.bytes)} (over 1 GB). Upload it?`))) stop('upload declined');
    if (!(srv.homeFree > plan.bytes * 1.2 + 1e9 && srv.appFree > plan.bytes * 1.2 + 1e9)) stop(`not enough free space on ${r.host} for ${mb(plan.bytes)} (home ${mb(srv.homeFree)}, app ${mb(srv.appFree)} free)`);
    const up = await sendTar(r, o.root, plan.upload, plan.bytes);
    say(`  sent ${mb(up.sent)}`);
    r.stream(unpackCommand(up.path, lists, stamp));
  }

  const gate = artGate(manifest, srv.files, srv.publicFiles);
  say(`  gate: missing ${gate.missing.length}, public/ files ${gate.publicFiles} (limit ${PUBLIC_FILE_LIMIT})`);
  if (!gate.ok && !o.dryRun) stop(`the art gate failed; prepare would download art and rebuild the clip bounds on the live server:\n  ${gate.problems.join('\n  ')}`);
  if (!gate.ok) say(`  (dry run) a real release would stop here unless the upload above fixes it:\n    ${gate.problems.join('\n    ')}`);

  await clipBoundsStep(o, r, srv, stamp);
  return { gate, plan };
}

async function clipBoundsStep(o, r, srv, stamp) {
  const { checkClipBounds } = await import(pathToFileURL(join(o.root, 'tools', 'doctor.mjs')).href);
  let st = checkClipBounds(o.root);
  say(`  clip bounds on the PC: ${st.state}`);
  if (st.state === 'warn') {
    if (o.dryRun) say('  (dry run) stale: a release runs npm run clip-bounds here (several minutes of CPU) before comparing');
    else {
      say('  stale: npm run clip-bounds (several minutes)');
      const b = spawnSync(process.execPath, ['tools/assets/clip-bounds.mjs'], { cwd: o.root, stdio: 'inherit', windowsHide: true });
      if (b.status !== 0) stop('npm run clip-bounds failed');
      st = checkClipBounds(o.root);
      if (st.state !== 'ok') stop(`the clip bounds are still ${st.state} after the rebuild`);
    }
  }
  const file = join(o.root, CLIP_BOUNDS);
  if (!existsSync(file)) { say('  no clip bounds on the PC: nothing to upload'); return; }
  const text = readFileSync(file, 'utf8');
  const mine = { ...clipInfo(text.slice(0, 400)), sum: createHash('sha256').update(stripClipStamp(text)).digest('hex') };
  const theirs = srv.clip;
  const desc = (c) => (c.generated ? `${c.count} skeletons, ${c.clips} clips, made ${c.generated}` : 'none');
  say(`  clip bounds: PC ${desc(mine)}; server ${desc(theirs)}`);
  const verdict = clipVerdict(mine, theirs);
  if (verdict === 'same') { say('  the same table (only the time it was made differs, if at all): nothing to upload'); return; }
  // art rules: the clip bounds are made on the PC; a newer server table was rebuilt there (prepare's ensureAssets)
  if (verdict === 'server-newer') say("  the server's table differs and was made after the PC's (rebuilt on the server): the PC's replaces it, the PC is the source");
  const size = statSync(file).size;
  if (o.dryRun) { say(`  (dry run) would upload ${CLIP_BOUNDS} (${mb(size)}), the server's copy backed up first`); return; }
  const up = await sendTar(r, o.root, [CLIP_BOUNDS], size);
  r.stream(unpackCommand(up.path, [CLIP_BOUNDS], stamp));
  say(`  uploaded ${CLIP_BOUNDS} (${mb(size)})`);
}

// -- step 5 ------------------------------------------------------------------------------------------------------

function prepareStep(o, runners, sha) {
  head(5, 'Prepare on every server');
  if (o.dryRun) {
    for (const h of o.hosts) {
      const r = runners.get(h.host);
      if (r) r.stream(statusCommand()); else say(`\n=== ${h.host} ===\n  (dry run) status skipped: no sudo password remembered`);
    }
    say(`\n  (dry run) would run: node scripts/deploy-regions.mjs prepare --hosts ${formatHosts(o.hosts)} --ref ${sha.slice(0, 10)}`);
    say('  it prints the generation id, the private test URLs and the activate command; it never activates');
    return null;
  }
  const io = {
    ssh: (host, line) => runners.get(host).stream(line),
    capture: (host, line) => runners.get(host).capture(line),
  };
  return prepare({ hosts: o.hosts, ref: sha }, io);
}

export async function main(argv) {
  const o = parseReleaseArgs(argv);
  if (o.error || o.help) {
    if (o.error) console.error(`[release] ${o.error}`);
    say('usage: node scripts/release.mjs [--dry-run] [--skip-ci] [--hosts spa,usspa:no-art] [--ci-timeout <min>]\n'
      + '       node scripts/release.mjs --forget-sudo');
    return o.error ? 1 : 0;
  }
  if (o.forgetSudo) {
    const gone = sudoStore.forget();
    say(gone.length ? `[sudo] forgotten: ${gone.join(', ')}` : '[sudo] no remembered password');
    return 0;
  }
  process.chdir(o.root); // prepare (deploy-regions.mjs) resolves the commit in the working directory
  say(`[release] ${o.dryRun ? 'DRY RUN: reads only; nothing is committed, pushed, uploaded or prepared' : 'release'} · servers ${formatHosts(o.hosts)}`);
  const pre = preflight(o);
  const runners = runnersFor(o.hosts, o);
  const folded = await foldChangelog(o, runners);
  const sha = push(o, pre);
  const ci = await ciStep(o, pre, sha);
  const art = await artStep(o, runners);
  const gen = prepareStep(o, runners, sha);
  say(`\n[release] ${o.dryRun ? 'dry run done: nothing changed' : `done: ${gen} is prepared on every server; activate stays your command`}`);
  if (folded.news?.file) {
    say(`  Update news: after you activate, put it live on every server (players on the old version would read it too early before):`);
    say(`    node scripts/deploy-regions.mjs news --hosts ${o.hosts.map((h) => h.host).join(',')} ${folded.news.file}`);
  }
  say(`  changelog: ${folded.folded ? `${folded.folded} fragment(s) folded` : 'nothing folded'} · news: ${folded.news?.say || '-'} · CI: ${ci} · art: ${art ? `${art.plan.upload.length} file(s) ${o.dryRun ? 'to upload' : 'uploaded'}, gate missing ${art.gate.missing.length}` : 'skipped'}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    console.error(`\n[release] stopped: ${e instanceof Stop ? e.message : e?.stack || e}`);
    console.error('Players are not affected: nothing is activated. Fix the cause and run the same command again.');
    process.exitCode = 1;
  });
}
