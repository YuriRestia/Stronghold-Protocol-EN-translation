// scripts/deploy-regions.mjs — (fork) one command, run on the operator's own PC, for every server of a game with several
// regions (DESIGN §8.7). It only runs the ordinary commands over `ssh`, in the right order; each server asks for its sudo
// password if it needs one. A page's generation must exist on every server, so one id and one commit go everywhere:
//
//   prepare   on every server: pull, start the new generation, wait for its /healthz, list it as prepared. Nobody is
//             sent there: players keep the current generation. Prints the id and the private test URLs
//             (https://<page server>/_build/<gen>/, plus ?region=<id> for each other server): the routers already serve a
//             prepared generation under its own prefix. If any server fails, nothing has changed for players.
//   activate  checks that <gen> is prepared (or already current) and answering on EVERY server, and refuses otherwise
//             without switching any; then makes it current, the page's server (the first host) first.
//   deploy    prepare, then activate at once.
//
//   node scripts/deploy-regions.mjs prepare  --hosts spa,usspa:no-art [--ref origin/dev-0.2]
//   node scripts/deploy-regions.mjs activate <gen> --hosts spa,usspa:no-art
//   node scripts/deploy-regions.mjs deploy   --hosts spa,usspa:no-art [--ref origin/dev-0.2]
//   node scripts/deploy-regions.mjs status   --hosts spa,usspa
//   node scripts/deploy-regions.mjs announce --hosts spa,usspa --minutes 5 "Restart in 5 minutes"
//   node scripts/deploy-regions.mjs news     --hosts spa,usspa news.json      (fork) the lobby's live update news
//   node scripts/deploy-regions.mjs news     --hosts spa,usspa --show | --clear
//
// news: the file is checked here first (shared/news.js; a refused file goes nowhere), then on each server written to a
// temporary file over ssh (stdin: no size limit of the command line) and put live by scripts/news.mjs as the service
// user, which checks it again; the temporary file is removed either way.
//
// A host is an ssh name from ~/.ssh/config, `:no-art` marks a server that serves no art. SP_DEPLOY_HOSTS may hold the list.
// The first host must be the page's server. Node's own modules only.
//
// Why the page's server is activated first: either order lets a new page's socket find its generation (each router
// serves a prepared generation's /_build/<gen>/ prefix), but a page told that its generation retired is sent to `/` on
// the page's server, and `/` must already be the new generation there. The other way round, a page of the old
// generation whose socket is on another server is told "retired", reloads `/`, gets the old generation again and is told
// again, until the page's server switches. The servers link up (cross-server counts and matchmaking) only between
// current generations — a prepared one stays silent (server/generation.js isActive) — so the link starts at activate.
// A prepared generation that is never activated is stopped by reap after PREPARED_MAX_AGE_MS (scripts/generations.mjs).

import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { newGenId, PREPARED_MAX_AGE_MS } from './generations.mjs';
import { readFileSync } from 'node:fs';
import { GEN_ID_RE } from '../shared/gen.js';
import { newsProblems } from '../shared/news.js';

const APP = '/opt/stronghold/app';
const AS_APP = 'sudo -u stronghold';
const DEFAULT_REF = 'origin/dev-0.2';
export const COMMANDS = Object.freeze(['prepare', 'activate', 'deploy', 'status', 'announce', 'news']);

/** `spa,usspa:no-art` → [{ host, noArt }]. @param {string} raw */
export function parseHosts(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [host, flag] = s.split(':');
    return { host, noArt: flag === 'no-art' };
  });
}

/** [{ host, noArt }] → `spa,usspa:no-art` (for the command it prints). @param {{ host: string, noArt?: boolean }[]} hosts */
export const formatHosts = (hosts) => hosts.map((h) => `${h.host}${h.noArt ? ':no-art' : ''}`).join(',');

/** Quote for a POSIX shell. @param {string} s */
export const shQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** The shell line that prepares a generation on one server. @param {{ gen: string, commit: string, noArt?: boolean }} o */
export function prepareCommand({ gen, commit, noArt = false }) {
  const inner = [
    `cd ${APP}`,
    `${AS_APP} git checkout -- data/assets.json`,
    `${AS_APP} git pull --ff-only`,
    `node scripts/generations.mjs deploy --prepare --gen ${gen} --ref ${commit}${noArt ? ' --no-art' : ''}`,
  ].join(' && ');
  return `sudo bash -c ${shQuote(inner)}`;
}

export const activateCommand = (gen) => `sudo bash -c ${shQuote(`cd ${APP} && node scripts/generations.mjs activate ${gen}`)}`;
/** No sudo: it only reads generations.json and the generation's /healthz, and its output is read back over ssh. */
export const checkCommand = (gen) => `cd ${APP} && node scripts/generations.mjs check ${shQuote(gen)}`;
/**
 * The same check through `sudo -n` (never prompts: no password → fails at once), for a server whose /opt/stronghold
 * the login user cannot enter (drwxr-x--- stronghold).
 */
export const sudoCheckCommand = (gen) => `sudo -n bash -c ${shQuote(checkCommand(gen))}`;
export const statusCommand = () => `sudo bash -c ${shQuote(`cd ${APP} && node scripts/generations.mjs status`)}`;
export const announceCommand = (minutes, text) => `sudo bash -c ${shQuote(`cd ${APP} && ${AS_APP} node scripts/announce.mjs --minutes ${Number(minutes)} ${shQuote(text)}`)}`;

/** (fork) A server's temporary copy of the news file (the login user's /tmp; root reads it for the service user). */
export const newsUploadCommand = () => 'f=$(mktemp /tmp/sp-news-XXXXXX.json) && cat > "$f" && echo "$f"';
/** @param {'set' | 'show' | 'clear'} action @param {string} [tmp] the upload's path (set) */
export function newsCommand(action, tmp) {
  if (action !== 'set') return `sudo bash -c ${shQuote(`cd ${APP} && ${AS_APP} node scripts/news.mjs ${action}`)}`;
  if (!/^\/tmp\/sp-news-[A-Za-z0-9]+\.json$/.test(String(tmp))) throw new Error(`not a news upload path: ${tmp}`);
  return `sudo bash -c ${shQuote(`cd ${APP} && ${AS_APP} node scripts/news.mjs set - < ${tmp}`)}; s=$?; rm -f ${tmp}; exit $s`;
}

/** The argument after a flag. */
const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

/**
 * The command line, checked: `{ error }` (null for a bare call: print the usage) or the parsed command.
 * @param {string[]} argv @param {Record<string, string | undefined>} [env]
 */
export function parseArgs(argv, env = process.env) {
  const [cmd, ...args] = argv;
  if (!COMMANDS.includes(cmd)) return { error: cmd ? `unknown command "${cmd}"` : null };
  if (args.includes('--hosts') && !(flag(args, '--hosts') || '').trim()) return { error: '--hosts needs a list, e.g. --hosts spa,usspa:no-art' };
  const hosts = parseHosts(flag(args, '--hosts') || env.SP_DEPLOY_HOSTS);
  if (!hosts.length) return { error: 'no servers: pass --hosts spa,usspa:no-art (or set SP_DEPLOY_HOSTS)' };
  if (hosts.some((h) => !/^[A-Za-z0-9._@-]+$/.test(h.host))) return { error: `not an ssh host name: ${formatHosts(hosts)}` };
  const o = { cmd, hosts };
  if (cmd === 'activate') {
    const gen = args[0];
    if (!gen || gen.startsWith('--')) return { error: 'activate needs the generation id that prepare printed: activate <gen> --hosts …' };
    if (!GEN_ID_RE.test(gen)) return { error: `"${gen}" is not a generation id` };
    o.gen = gen;
  }
  if (cmd === 'prepare' || cmd === 'deploy') {
    const ref = flag(args, '--ref');
    if (args.includes('--ref') && (!ref || ref.startsWith('--'))) return { error: '--ref needs a git ref, e.g. --ref origin/dev-0.2' };
    o.ref = ref || DEFAULT_REF;
  }
  if (cmd === 'announce') {
    const minutes = Number(flag(args, '--minutes') ?? 5);
    const text = args[args.length - 1];
    const before = args[args.length - 2];
    if (!(minutes >= 0)) return { error: '--minutes needs a number' };
    if (!text || text.startsWith('--') || before === '--hosts' || before === '--minutes') return { error: 'announce needs the text last, in quotes' };
    o.minutes = minutes;
    o.text = text;
  }
  if (cmd === 'news') {
    const show = args.includes('--show');
    const clear = args.includes('--clear');
    const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--hosts');
    if ([show, clear, !!file].filter(Boolean).length !== 1) return { error: 'news needs one of: a news file, --show, --clear' };
    o.action = show ? 'show' : clear ? 'clear' : 'set';
    if (file) o.file = file;
  }
  return o;
}

/** The `[check] {json}` line of `generations.mjs check`, or null (no such line: older code there, or no answer). @param {string} stdout */
export function parseCheck(stdout) {
  const line = String(stdout || '').split(/\r?\n/).find((l) => l.startsWith('[check] '));
  if (!line) return null;
  try { return JSON.parse(line.slice('[check] '.length)); } catch { return null; }
}

/**
 * Why `gen` must not be activated yet: one line per server that is not ready, and a mismatch of builds. Empty: go.
 * @param {string} gen @param {{ host: string, check: any }[]} results
 */
export function checkProblems(gen, results) {
  const out = [];
  for (const { host, check } of results) {
    if (!check) out.push(`${host}: no answer from "generations.mjs check" (is ${gen} prepared there, with this code?)`);
    else if (!check.ok) out.push(`${host}: ${check.reason || check.state}`);
  }
  const builds = new Set(results.map((r) => r.check?.build).filter(Boolean));
  if (builds.size > 1) out.push(`the servers run different builds of ${gen}: ${[...builds].join(', ')}`);
  return out;
}

/**
 * The private test URLs of a prepared generation: the page from the first region's host, then the same page using every
 * other region's server. Empty when the servers report no regions.
 * @param {string} gen @param {{ list?: { id: string, host: string }[] } | null | undefined} regions
 */
export function testUrls(gen, regions) {
  const list = regions?.list || [];
  if (!list.length) return [];
  const page = `https://${list[0].host}/_build/${gen}/`;
  return [page, ...list.slice(1).map((r) => `${page}?region=${encodeURIComponent(r.id)}`)];
}

function ssh(host, line) {
  console.log(`\n=== ${host} ===`);
  const r = spawnSync('ssh', ['-t', host, line], { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw new Error(`${host}: the command failed (exit ${r.status ?? r.error?.message})`);
}

/** Run `check <gen>` on every server and read its line back. */
/**
 * `generations.mjs check` on one server: without sudo first, then through `sudo -n` when that gave no `[check]` line
 * (e.g. Permission denied on /opt/stronghold). The first try's errors are shown only when the fallback fails too.
 * @param {string} host @param {string} gen
 * @param {(host: string, cmd: string) => { stdout?: string, stderr?: string }} run one ssh call, output captured
 * @returns {{ check: any, stderr: string }}
 */
export function checkOnHost(host, gen, run) {
  const first = run(host, checkCommand(gen));
  const check = parseCheck(first.stdout);
  if (check) return { check, stderr: '' };
  const second = run(host, sudoCheckCommand(gen));
  const viaSudo = parseCheck(second.stdout);
  if (viaSudo) return { check: viaSudo, stderr: '' };
  return { check: null, stderr: [first.stderr, second.stderr].map((e) => String(e || '').trim()).filter(Boolean).join('\n') };
}

const sshCapture = (host, cmd) => spawnSync('ssh', [host, cmd], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true });

function checkAll(hosts, gen) {
  return hosts.map(({ host }) => {
    const { check, stderr } = checkOnHost(host, gen, sshCapture);
    if (stderr) console.error(`[${host}] ${stderr.replace(/\n/g, `\n[${host}] `)}`);
    return { host, check };
  });
}

function prepare(o) {
  const commit = execFileSync('git', ['rev-parse', '--verify', `${o.ref}^{commit}`], { encoding: 'utf8', windowsHide: true }).trim();
  const gen = newGenId();
  console.log(`[prepare] generation ${gen}, commit ${commit.slice(0, 10)} (${o.ref}) on ${o.hosts.map((h) => h.host).join(', ')}`);
  for (const h of o.hosts) ssh(h.host, prepareCommand({ gen, commit, noArt: h.noArt }));
  const results = checkAll(o.hosts, gen);
  const problems = checkProblems(gen, results);
  if (problems.length) throw new Error(`prepared, but not ready everywhere:\n  ${problems.join('\n  ')}`);
  console.log(`\n[prepare] ${gen} is prepared on every server (build ${results[0].check.build}). Players are not sent there.`);
  const urls = testUrls(gen, results[0].check.regions);
  if (urls.length) { console.log('  Private test:'); for (const u of urls) console.log(`    ${u}`); }
  else console.log(`  Private test: https://<your site>/_build/${gen}/`);
  console.log(`  Then: node scripts/deploy-regions.mjs activate ${gen} --hosts ${formatHosts(o.hosts)}`);
  console.log(`  Not activated within ${PREPARED_MAX_AGE_MS / 3600_000} h of its start, it is stopped as abandoned (reap).`);
  return gen;
}

/** (fork) The live update news on every server: checked here, then uploaded and put live one server after another. */
function news(o) {
  if (o.action !== 'set') { for (const h of o.hosts) ssh(h.host, newsCommand(o.action)); return; }
  let text;
  try { text = readFileSync(o.file, 'utf8').replace(/^\uFEFF/, ''); } catch (e) { throw new Error(`cannot read ${o.file}: ${e.code || e.message}`, { cause: e }); }
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`${o.file} is not valid JSON: ${e.message}`, { cause: e }); }
  const problems = newsProblems(raw);
  if (problems.length) throw new Error(`${o.file} was refused, nothing was sent:\n  ${problems.join('\n  ')}`);
  for (const h of o.hosts) {
    console.log(`\n=== ${h.host} ===`);
    const up = spawnSync('ssh', [h.host, newsUploadCommand()], { input: text, encoding: 'utf8', windowsHide: true });
    const tmp = String(up.stdout || '').trim().split(/\r?\n/).pop();
    if (up.status !== 0 || !tmp) throw new Error(`${h.host}: the upload failed (${String(up.stderr || '').trim() || `exit ${up.status}`})`);
    ssh(h.host, newsCommand('set', tmp));
  }
}

function activate(o, gen) {
  const problems = checkProblems(gen, checkAll(o.hosts, gen));
  if (problems.length) throw new Error(`refusing to activate ${gen}; no server was switched:\n  ${problems.join('\n  ')}`);
  console.log(`[activate] ${gen} is ready on every server; switching players over, ${o.hosts[0].host} first`);
  for (const h of o.hosts) ssh(h.host, activateCommand(gen));
  console.log(`\n[activate] ${gen} is current everywhere.`);
}

function main(argv) {
  const o = parseArgs(argv);
  if (o.error !== undefined) {
    if (o.error) console.error(`[deploy] ${o.error}`);
    console.log('usage: node scripts/deploy-regions.mjs prepare|deploy --hosts spa,usspa:no-art [--ref <git ref>]\n'
      + '       node scripts/deploy-regions.mjs activate <gen> --hosts spa,usspa:no-art\n'
      + '       node scripts/deploy-regions.mjs status --hosts spa,usspa\n'
      + '       node scripts/deploy-regions.mjs announce --hosts spa,usspa [--minutes 5] "text"\n'
      + '       node scripts/deploy-regions.mjs news --hosts spa,usspa <news.json> | --show | --clear');
    process.exit(o.error === null ? 0 : 1);
  }
  if (o.cmd === 'status') { for (const h of o.hosts) ssh(h.host, statusCommand()); return; }
  if (o.cmd === 'announce') { for (const h of o.hosts) ssh(h.host, announceCommand(o.minutes, o.text)); return; }
  if (o.cmd === 'news') { news(o); return; }
  if (o.cmd === 'prepare') { prepare(o); return; }
  if (o.cmd === 'activate') { activate(o, o.gen); return; }
  activate(o, prepare(o));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) {
    console.error(`\n[deploy] stopped: ${e.message || e}`);
    console.error('A server that was not switched keeps its old generation. Fix the cause and run the same command again.');
    process.exit(1);
  }
}
