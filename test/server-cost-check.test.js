// (fork) tools/server-cost-check.mjs — the SERVER COST rule's merge check (changes/README.md "Server cost"): a branch
// touching server, network or bot code needs a fragment whose "Server cost:" block has the numbers.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { touchReasons, parseDiff, verdict, check, main, isCommentOrBlank } from '../tools/server-cost-check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NUMBERS = /```markdown\n(Server cost:\n[\s\S]*?)```/.exec(readFileSync(join(ROOT, 'changes/README.md'), 'utf8'))[1];

test('what counts as server-touching', () => {
  const r = (file, added, removed = []) => touchReasons(file, { added, removed });
  assert.deepEqual(r('server/lobby.js', ['  this.x = 1;']), ['server code']);
  assert.deepEqual(r('server/lobby.js', ['  // a comment', '', '   * doc line'], ['// old comment']), [], 'comment-only changes are not');
  assert.deepEqual(r('server/sim/ai.js', [], ['  return 1;']), ['server code'], 'a removed code line counts');
  assert.ok(r('shared/protocol.js', ['// only a comment']).includes('the wire protocol (shared/protocol*)'));
  assert.ok(r('public/js/battle/botWorker.js', ['// x']).includes('the host-browser bot budget'));
  assert.match(r('public/js/net.js', ['  ws.send(JSON.stringify(m));']).join(), /WebSocket/);
  assert.match(r('shared/room.js', ['  room.broadcastState(s);']).join(), /WebSocket/);
  assert.match(r('scripts/x.mjs', ['setInterval(tick, 1000);']).join(), /setInterval/);
  assert.match(r('scripts/x.mjs', ['fs.appendFileSync(log, line);']).join(), /writes files/);
  assert.deepEqual(r('public/js/net.js', ['  // ws.send(x) is done elsewhere']), [], 'a commented-out send is no send');
  assert.deepEqual(r('public/js/render/app.js', ['  draw();']), []);
  assert.deepEqual(r('test/server.test.js', ['ws.send(1)']), [], 'tests are not shipped');
  assert.deepEqual(r('docs/SIM.md', ['setInterval(']), []);
  assert.ok(isCommentOrBlank('   ') && isCommentOrBlank(' # py') && !isCommentOrBlank('x // y'));
});

test('parseDiff: changed lines per file, a deleted file under its old name', () => {
  const d = parseDiff(['diff --git a/server/a.js b/server/a.js', '--- a/server/a.js', '+++ b/server/a.js', '@@ -1 +1 @@', '-old', '+new',
    'diff --git a/server/gone.js b/server/gone.js', '--- a/server/gone.js', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye'].join('\n'));
  assert.deepEqual(d.get('server/a.js'), { added: ['new'], removed: ['old'] });
  assert.deepEqual(d.get('server/gone.js'), { added: [], removed: ['bye'] });
});

test('verdict: server code needs a fragment with the numbers; a malformed fragment always fails', () => {
  const t = [{ file: 'server/a.js', reasons: ['server code'] }];
  assert.equal(verdict([], []).ok, true);
  assert.match(verdict(t, []).problems.join(), /no changes\/\*\.md fragment/);
  assert.match(verdict(t, [{ file: 'changes/a.md', cost: 'none', problems: [] }]).problems.join(), /no fragment's "Server cost:" has the numbers/);
  assert.equal(verdict(t, [{ file: 'changes/a.md', cost: 'numbers', problems: [] }, { file: 'changes/b.md', cost: 'none', problems: [] }]).ok, true);
  assert.equal(verdict([], [{ file: 'changes/a.md', cost: 'missing', problems: ['a.md: no "Server cost:" line'] }]).ok, false);
});

describe('the CLI on a scratch repository', () => {
  let dir;
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const put = (file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
  const frag = (cost) => `## 2026-11-11\n\n### A change\n\n- What it does.\n\nKind: internal\n\n${cost}`;
  const run = (args) => { let out = ''; const code = main(args, { root: dir, out: (s) => { out += s; } }); return { code, out }; };
  /** A branch off dev-0.2 with these files, committed. */
  const branch = (name, files) => { g('checkout', '-q', '-b', name, 'dev-0.2'); for (const [f, t] of Object.entries(files)) put(f, t); g('add', '-A'); g('commit', '-q', '-m', name); };
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-server-cost-'));
    g('init', '-q', '-b', 'dev-0.2');
    g('config', 'user.email', 'test@example.invalid'); g('config', 'user.name', 'test'); g('config', 'core.autocrlf', 'false');
    put('server/lobby.js', '// the lobby\nexport const x = 1;\n');
    put('public/js/net.js', 'export function go() {}\n');
    put('changes/README.md', '# format\n');
    put('docs/a.md', 'doc\n');
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    branch('docs-only', { 'docs/a.md': 'doc 2\n', 'changes/docs-only.md': frag('Server cost: none\n') });
    branch('server-none', { 'server/lobby.js': '// the lobby\nexport const x = 2;\n', 'changes/server-none.md': frag('Server cost: none\n') });
    branch('server-comment', { 'server/lobby.js': '// the lobby, reworded\nexport const x = 1;\n', 'changes/server-comment.md': frag('Server cost: none\n') });
    branch('server-numbers', { 'server/lobby.js': '// the lobby\nexport const x = 3;\n', 'changes/server-numbers.md': frag(NUMBERS) });
    branch('page-send', { 'public/js/net.js': 'export function go(ws) { ws.send("x"); }\n', 'changes/page-send.md': frag('Server cost: none\n') });
    branch('no-fragment', { 'server/lobby.js': '// the lobby\nexport const x = 4;\n' });
    branch('bad-fragment', { 'docs/a.md': 'doc 3\n', 'changes/bad-fragment.md': frag('') });
    g('checkout', '-q', 'dev-0.2');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('exit 0 when nothing server-touching changed, or only comments, or the fragment has the numbers', () => {
    for (const b of ['docs-only', 'server-comment', 'server-numbers']) {
      const r = run(['dev-0.2', b]);
      assert.equal(r.code, 0, `${b}: ${r.out}`);
      assert.match(r.out, /^server-cost: OK/m, b);
    }
  });

  test('exit 1 with the file and the reason when server or network code changed without numbers', () => {
    const none = run(['dev-0.2', 'server-none']);
    assert.equal(none.code, 1);
    assert.match(none.out, /^server-cost: server\/lobby\.js: server code$/m);
    assert.match(none.out, /no fragment's "Server cost:" has the numbers \(changes\/server-none\.md: none\)/);
    assert.match(none.out, /^server-cost: FAIL/m);
    assert.match(run(['dev-0.2', 'page-send']).out, /public\/js\/net\.js: sends over the WebSocket/);
    assert.equal(run(['dev-0.2', 'page-send']).code, 1);
    assert.match(run(['dev-0.2', 'no-fragment']).out, /no changes\/\*\.md fragment in the range/);
    const bad = run(['dev-0.2', 'bad-fragment']);
    assert.equal(bad.code, 1, 'a fragment without a Server cost line fails even without server changes');
    assert.match(bad.out, /bad-fragment\.md: no "Server cost:" line/);
  });

  test('--json, --worktree, and exit 2 on a bad revision or option', () => {
    const j = run(['dev-0.2', 'server-none', '--json']);
    assert.equal(j.code, 1);
    const o = JSON.parse(j.out);
    assert.equal(o.ok, false);
    assert.deepEqual(o.touched, [{ file: 'server/lobby.js', reasons: ['server code'] }]);
    assert.deepEqual(o.fragments.map((f) => [f.file, f.cost]), [['changes/server-none.md', 'none']]);
    assert.match(o.head, /^[0-9a-f]{40}$/);
    g('checkout', '-q', 'docs-only');
    try {
      assert.equal(run(['--worktree']).code, 0);
      put('server/new.js', 'export const y = 1;\n');
      const w = run(['--worktree']);
      assert.equal(w.code, 1, 'an untracked server file counts');
      assert.match(w.out, /server\/new\.js: server code/);
    } finally { rmSync(join(dir, 'server/new.js'), { force: true }); g('checkout', '-q', 'dev-0.2'); }
    assert.equal(run(['no-such-branch']).code, 2);
    assert.equal(run(['--bogus']).code, 2);
    assert.equal(run(['a', 'b', 'c']).code, 2);
    assert.match(run(['--help']).out, /^Usage: node tools\/server-cost-check\.mjs/);
  });
});

test('this checkout passes the check against dev-0.2', (t) => {
  let has = true;
  try { execFileSync('git', ['rev-parse', '--verify', '--quiet', 'dev-0.2^{commit}'], { cwd: ROOT, stdio: 'ignore' }); } catch { has = false; }
  if (!has) { t.skip('no dev-0.2 branch in this clone'); return; }
  const r = check({ root: ROOT });
  assert.ok(r.ok, `npm run server-cost: ${r.problems.join(' | ')}`);
});
