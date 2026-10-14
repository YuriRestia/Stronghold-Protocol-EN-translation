// Writes public/server-info.json (gitignored): the branch and commit this checkout is on, for the title screen's
// "About this server" panel (public/js/ui/about.js). Static file, read only when a player opens the panel.
//
//   node scripts/server-info.mjs
//
// On the VPS it runs before every start (systemd `ExecStartPre=-/usr/bin/node scripts/server-info.mjs`); after a
// `git pull` without a restart, run it by hand: cd /opt/stronghold/app && sudo -u stronghold node scripts/server-info.mjs
// Never fails the start: without git it writes nothing and the panel shows "unknown".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'server-info.json');

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  const info = {
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    commit: git('rev-parse', 'HEAD'),
    date: git('log', '-1', '--format=%cI'),
  };
  fs.writeFileSync(OUT, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[server-info] ${info.branch} @ ${info.commit.slice(0, 7)} → ${path.relative(ROOT, OUT)}`);
} catch (e) {
  console.warn(`[server-info] skipped (${e?.message || e})`);
}
