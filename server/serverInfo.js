// server/serverInfo.js — (fork) public/server-info.json (gitignored): the branch and commit this checkout is on and
// its latest changes, for the title screen's version line, "What's new" and "About this server" (public/js/ui/about.js).
// A static file, read by the browser only when the title screen opens.
//
// Written at every start (server/index.js, before listening) and by `node scripts/server-info.mjs` (systemd
// ExecStartPre on the VPS; by hand after a `git pull` without a restart). Never fails the start: without git (a release
// zip) it writes nothing, keeps any file already there, and the panels show "unknown".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** How many of the latest commits "What's new" lists (first parent only: on main, one line per merged pull request). */
export const CHANGES_MAX = 20;

/**
 * The branch, commit, commit date and latest changes of the git checkout at `root`. Throws without git or a repository.
 * A shallow clone lists only the commits it has.
 * @param {string} root
 * @param {{ env?: Record<string, string | undefined>, max?: number }} [opts]
 * @returns {{ branch: string, commit: string, date: string, changes: { commit: string, date: string, subject: string }[] }}
 */
export function collectServerInfo(root, { env = process.env, max = CHANGES_MAX } = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const head = git('rev-parse', '--abbrev-ref', 'HEAD');
  const log = git('log', '--first-parent', `-n${max}`, '--format=%H%x09%cI%x09%s');
  return {
    // a generation's release worktree is detached ("HEAD"): its branch comes from SP_BRANCH, which
    // scripts/generations.mjs deploy writes to the generation's env file
    branch: head === 'HEAD' && env.SP_BRANCH ? env.SP_BRANCH : head,
    commit: git('rev-parse', 'HEAD'),
    date: git('log', '-1', '--format=%cI'),
    changes: log ? log.split('\n').map((line) => {
      const [commit, date, ...subject] = line.split('\t');
      return { commit, date, subject: subject.join('\t') };
    }) : [],
  };
}

/**
 * Writes `<root>/public/server-info.json`; logs one line, and only warns when git is missing.
 * @param {string} root
 * @param {{ env?: Record<string, string | undefined>, log?: (s: string) => void }} [opts]
 * @returns {boolean} whether the file was written
 */
export function writeServerInfo(root, { env = process.env, log = console.log } = {}) {
  const out = path.join(root, 'public', 'server-info.json');
  try {
    const info = collectServerInfo(root, { env });
    fs.writeFileSync(out, `${JSON.stringify(info, null, 2)}\n`);
    log(`[server-info] ${info.branch} @ ${info.commit.slice(0, 7)} → ${path.relative(root, out)}`);
    return true;
  } catch (e) {
    console.warn(`[server-info] skipped (${e?.message || e})`);
    return false;
  }
}
