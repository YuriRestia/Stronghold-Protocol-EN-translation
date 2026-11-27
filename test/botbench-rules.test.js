import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// botbench --rules must reach the match as its lobby rules (the SPA-CC tags and cheats). Since the Yuri 0.3.1 sync the
// Match keeps upstream's room switches (opts.rules) apart from the lobby rules (opts.lobbyRules), and passing only
// `rules` silently ran every tag sweep without its tag.
const root = new URL('../', import.meta.url);
const run = (...extra) => {
  const args = ['tools/botbench.mjs', '--configs', 'solo:NORMAL', '--seeds', '1', '--jobs', '1', '--quiet', '--json', '-', ...extra];
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(child.status === 0 || child.status === 1, true, child.stderr);
  return JSON.parse(child.stdout)[0];
};

test('botbench --rules applies SPA-CC tags (Lockout 1 changes the outcome of a won NORMAL seed)', () => {
  const plain = run(), tagged = run('--rules', 'ccLockout=1');
  assert.equal(plain.victory, true, 'the untagged seed is a win');
  assert.notDeepEqual([tagged.victory, tagged.roundsPassed, tagged.lpLeft], [plain.victory, plain.roundsPassed, plain.lpLeft]);
});
