// (fork, 2026-11-13) scripts/deploy-regions.mjs prepareCommand: the server's checkout moves to the exact release commit
// with fetch + reset --hard (a normal release and a force-pushed branch alike), refuses before any change when a tracked
// file other than data/assets.json has local changes, and never cleans. The generated line runs here for real in
// scratch git repositories, with the server's sudo, path and generations.mjs swapped for local stand-ins.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { prepareCommand, PREPARE_LOCAL_CHANGES } from '../scripts/deploy-regions.mjs';

const unquote = (cmd) => {
  const head = "sudo bash -c '";
  assert.ok(cmd.startsWith(head) && cmd.endsWith("'"), cmd);
  return cmd.slice(head.length, -1).replace(/'\\''/g, "'");
};

test('the line: status check first, then fetch and reset to the commit; no pull, no clean, hex ids only', () => {
  const inner = unquote(prepareCommand({ gen: 'g1', commit: 'c0ffee' }));
  const at = (s) => { const i = inner.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('git status --porcelain --untracked-files=no') < at('git checkout -- data/assets.json'));
  assert.ok(at('git checkout -- data/assets.json') < at('git fetch --quiet origin'));
  assert.ok(at('git fetch --quiet origin') < at('git reset --quiet --hard c0ffee'));
  assert.ok(at('git reset --quiet --hard c0ffee') < at('deploy --prepare --gen g1 --ref c0ffee'));
  assert.doesNotMatch(inner, /git pull|git clean/);
  assert.match(inner, /^cd \/opt\/stronghold\/app && /);
  assert.match(prepareCommand({ gen: 'g1', commit: 'c0ffee', noArt: true }), /--no-art'$/);
  for (const bad of ['origin/dev-0.2', 'abc; rm -rf /', '', 'C0FFEE']) assert.throws(() => prepareCommand({ gen: 'g1', commit: bad }), /not a commit id/);
});

// Git Bash on Windows, found beside the git in use (never WSL's bash.exe from System32); plain bash elsewhere.
const gitBash = () => {
  let exec;
  try { exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(); } catch { return undefined; }
  const root = resolve(exec, '../../..');
  return [join(root, 'bin/bash.exe'), join(root, 'usr/bin/bash.exe'), 'C:/Program Files/Git/bin/bash.exe'].find((p) => existsSync(p));
};
const BASH = process.platform === 'win32' ? gitBash() : 'bash';

describe('the line run in a scratch checkout', { skip: !BASH && 'no Git Bash' }, () => {
  let dir, origin, app;
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (cwd, file, text, msg) => { writeFileSync(join(cwd, file), text); g(cwd, 'add', '-A'); g(cwd, 'commit', '-q', '-m', msg); return g(cwd, 'rev-parse', 'HEAD'); };
  /** Run prepare in `app` (the server's checkout) for `sha`: no sudo, no real generations.mjs. */
  const prepare = (sha) => {
    const inner = unquote(prepareCommand({ gen: 'g1', commit: sha }))
      .replace('cd /opt/stronghold/app', `cd '${app.replace(/\\/g, '/')}'`)
      .replaceAll('sudo -u stronghold ', '')
      .replace(/node scripts\/generations\.mjs deploy .*$/, 'echo PREPARED');
    const r = spawnSync(BASH, ['-c', inner], { encoding: 'utf8', windowsHide: true });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };
  let a, b;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-prepare-'));
    const work = join(dir, 'work');
    mkdirSync(work); mkdirSync(join(work, 'data'));
    g(work, 'init', '-q', '-b', 'dev-0.2');
    g(work, 'config', 'user.email', 'test@example.invalid'); g(work, 'config', 'user.name', 'test'); g(work, 'config', 'core.autocrlf', 'false');
    writeFileSync(join(work, '.gitignore'), 'public/assets/\nclip-bounds.json\n');
    writeFileSync(join(work, 'data/assets.json'), '{"v":1}\n');
    a = commit(work, 'game.js', 'one\n', 'A');
    origin = join(dir, 'origin.git');
    g(dir, 'clone', '-q', '--bare', work, origin);
    app = join(dir, 'app');
    g(dir, 'clone', '-q', '-c', 'core.autocrlf=false', origin, app);
    // the server's own, untracked and ignored, files
    mkdirSync(join(app, 'public/assets'), { recursive: true });
    writeFileSync(join(app, 'public/assets/art.png'), 'art');
    writeFileSync(join(app, 'clip-bounds.json'), '{}');
    writeFileSync(join(app, 'notes.txt'), 'untracked');
    b = commit(work, 'game.js', 'two\n', 'B');
    g(work, 'push', '-q', origin, 'dev-0.2');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const kept = () => {
    assert.equal(readFileSync(join(app, 'public/assets/art.png'), 'utf8'), 'art', 'ignored art stays');
    assert.equal(readFileSync(join(app, 'clip-bounds.json'), 'utf8'), '{}', 'ignored clip-bounds.json stays');
    assert.equal(readFileSync(join(app, 'notes.txt'), 'utf8'), 'untracked', 'untracked files stay (no clean)');
  };

  test('a local change to a tracked file refuses before anything changes', () => {
    writeFileSync(join(app, 'game.js'), 'hand edit\n');
    writeFileSync(join(app, 'data/assets.json'), '{"v":"server"}\n');
    const r = prepare(b);
    assert.equal(r.code, PREPARE_LOCAL_CHANGES, r.out);
    assert.match(r.out, /prepare refused: tracked files in .* have local changes/);
    assert.match(r.out, / M game\.js/);
    assert.doesNotMatch(r.out, /data\/assets\.json|PREPARED/);
    assert.equal(g(app, 'rev-parse', 'HEAD'), a, 'no reset');
    assert.equal(readFileSync(join(app, 'game.js'), 'utf8'), 'hand edit\n', 'the edit is untouched');
    assert.equal(readFileSync(join(app, 'data/assets.json'), 'utf8'), '{"v":"server"}\n', 'nothing changed at all');
    g(app, 'checkout', '--', 'game.js');
  });

  test('a normal release: the server is an ancestor; only data/assets.json was changed', () => {
    const r = prepare(b);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /PREPARED/);
    assert.equal(g(app, 'rev-parse', 'HEAD'), b);
    assert.equal(readFileSync(join(app, 'data/assets.json'), 'utf8'), '{"v":1}\n');
    kept();
  });

  test('a force-pushed branch: the server\'s commit is no ancestor of the release', () => {
    const work2 = join(dir, 'work2');
    g(dir, 'clone', '-q', '-c', 'core.autocrlf=false', origin, work2);
    g(work2, 'config', 'user.email', 'test@example.invalid'); g(work2, 'config', 'user.name', 'test'); g(work2, 'config', 'core.autocrlf', 'false');
    g(work2, 'reset', '-q', '--hard', a);
    const replaced = commit(work2, 'game.js', 'two, replaced\n', 'B replaced');
    g(work2, 'push', '-q', '--force', 'origin', 'dev-0.2');
    const r = prepare(replaced);
    assert.equal(r.code, 0, r.out);
    assert.equal(g(app, 'rev-parse', 'HEAD'), replaced);
    assert.equal(readFileSync(join(app, 'game.js'), 'utf8'), 'two, replaced\n');
    kept();
  });

  test('a commit the origin does not have fails before the reset', () => {
    const r = prepare('0123456789abcdef0123456789abcdef01234567');
    assert.notEqual(r.code, 0);
    assert.doesNotMatch(r.out, /PREPARED/);
  });
});
