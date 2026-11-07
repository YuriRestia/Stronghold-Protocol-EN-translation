// scripts/deploy-regions.mjs — (fork) one command, run on the operator's own PC, for every server of a game with several
// regions (DESIGN §8.7). It only runs the ordinary commands over `ssh`, in the right order; each server asks for its sudo
// password if it needs one. A page's generation must exist on every server, so one id and one commit go everywhere:
//
//   1. prepare  on every server: pull, start the new generation, wait for its /healthz. Nobody is sent there yet; if any
//               server fails, the deploy stops here and nothing has changed for players (reap clears what was prepared).
//   2. activate the page's server first (the first host), then the others, so a new page's socket always finds its generation.
//
//   node scripts/deploy-regions.mjs deploy   --hosts spa,usspa:no-art [--ref origin/dev-0.2]
//   node scripts/deploy-regions.mjs status   --hosts spa,usspa
//   node scripts/deploy-regions.mjs announce --hosts spa,usspa --minutes 5 "Restart in 5 minutes"
//
// A host is an ssh name from ~/.ssh/config, `:no-art` marks a server that serves no art. SP_DEPLOY_HOSTS may hold the list.
// The first host must be the page's server. Node's own modules only.

import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { newGenId } from './generations.mjs';

const APP = '/opt/stronghold/app';
const AS_APP = 'sudo -u stronghold';

/** `spa,usspa:no-art` → [{ host, noArt }]. @param {string} raw */
export function parseHosts(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [host, flag] = s.split(':');
    return { host, noArt: flag === 'no-art' };
  });
}

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
export const statusCommand = () => `sudo bash -c ${shQuote(`cd ${APP} && node scripts/generations.mjs status`)}`;
export const announceCommand = (minutes, text) => `sudo bash -c ${shQuote(`cd ${APP} && ${AS_APP} node scripts/announce.mjs --minutes ${Number(minutes)} ${shQuote(text)}`)}`;

/** The arguments after a flag. */
const flag = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function ssh(host, line) {
  console.log(`\n=== ${host} ===`);
  const r = spawnSync('ssh', ['-t', host, line], { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw new Error(`${host}: the command failed (exit ${r.status ?? r.error?.message})`);
}

function main(argv) {
  const [cmd, ...args] = argv;
  const hosts = parseHosts(flag(args, '--hosts') || process.env.SP_DEPLOY_HOSTS);
  if (!['deploy', 'status', 'announce'].includes(cmd) || !hosts.length) {
    console.log('usage: node scripts/deploy-regions.mjs deploy|status|announce --hosts spa,usspa:no-art [--ref <git ref>] [--minutes N "text"]');
    process.exit(cmd ? 1 : 0);
  }
  if (cmd === 'status') { for (const h of hosts) ssh(h.host, statusCommand()); return; }
  if (cmd === 'announce') {
    const minutes = flag(args, '--minutes') ?? 5;
    const text = args[args.length - 1];
    for (const h of hosts) ssh(h.host, announceCommand(minutes, text));
    return;
  }
  const ref = flag(args, '--ref') || 'origin/dev-0.2';
  const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8', windowsHide: true }).trim();
  const gen = newGenId();
  console.log(`[deploy] generation ${gen}, commit ${commit.slice(0, 10)} (${ref}) on ${hosts.map((h) => h.host).join(', ')}`);
  for (const h of hosts) ssh(h.host, prepareCommand({ gen, commit, noArt: h.noArt }));
  console.log('\n[deploy] every server is ready; switching players over');
  for (const h of hosts) ssh(h.host, activateCommand(gen));
  console.log(`\n[deploy] ${gen} is current everywhere.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) {
    console.error(`\n[deploy] stopped: ${e.message || e}`);
    console.error('A server that was not switched keeps its old generation. Fix the cause and run the same command again.');
    process.exit(1);
  }
}
