// (fork) Changelog fragments (changes/README.md): every fragment is well-formed, and tools/changelog.mjs folds them
// into FORK-CHANGELOG.md in date order without touching the rest.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFragment, foldFragments, fragmentFiles, CHANGES_DIR, CHANGELOG, main, PRE_RULE_UNMEASURED, operatorOnly } from '../tools/changelog.mjs';

test('every fragment in changes/ is well-formed', () => {
  const bad = fragmentFiles().flatMap((f) => parseFragment(f, readFileSync(join(CHANGES_DIR, f), 'utf8')).errors);
  assert.deepEqual(bad, []);
});

test('a bad fragment is named with what is wrong', () => {
  const errs = (name, text) => parseFragment(name, text).errors.join(' | ');
  assert.match(errs('Bad_Name.md', '## 2026-11-11\n\n### A\n\n- b\n'), /lowercase words/);
  assert.match(errs('x.md', '### A\n\n- b\n'), /first line must be "## YYYY-MM-DD"/);
  assert.match(errs('x.md', '## 2026-02-30\n\n### A\n\n- b\n'), /a real date/);
  assert.match(errs('x.md', '## 2026-11-11\n\n- b\n'), /bullet before the first|needs at least one/);
  assert.match(errs('x.md', '## 2026-11-11\n\n### A\n\ntext only\n'), /no "- " bullet/);
  assert.match(errs('x.md', '## 2026-11-11\n\n### A\n\n- b\n\n## 2026-11-12\n'), /only one "## date" line/);
  assert.match(errs('x.md', '## 2026-11-11\r\n\r\n### A\r\n\r\n- b\r\n'), /CR line ends/);
  const ok = parseFragment('ok-name.md', '\n## 2026-11-11\n\n### A\n\n- b\n  more\n  - nested\n\n### C\n\n- d\n\nKind: player\n\nServer cost: none (docs only)\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.date, '2026-11-11');
  assert.equal(ok.body, '### A\n\n- b\n  more\n  - nested\n\n### C\n\n- d', 'a "none" Server cost stays out of the changelog');
  assert.equal(ok.cost.kind, 'none');
});

// The SERVER COST rule (changes/README.md "Server cost"): every fragment ends with "Server cost:" — none, or the numbers.
const README_EXAMPLE = (() => {
  const t = readFileSync(join(CHANGES_DIR, 'README.md'), 'utf8');
  const m = /```markdown\n(Server cost:\n[\s\S]*?)```/.exec(t);
  return m ? m[1] : '';
})();

test('Server cost: missing, none, the README example\'s numbers, and what a numbers block lacks', () => {
  const head = '## 2026-11-11\n\n### A\n\n- b\n';
  assert.match(parseFragment('x.md', head).errors.join(' | '), /no "Server cost:" line/);
  assert.equal(parseFragment('x.md', head + '\nKind: player\n\nServer cost: none\n').cost.kind, 'none');
  assert.ok(README_EXAMPLE.length > 100, 'changes/README.md carries the numbers example');
  const full = parseFragment('x.md', head + '\nKind: player\n\n' + README_EXAMPLE);
  assert.deepEqual(full.errors, []);
  assert.equal(full.cost.kind, 'numbers');
  assert.equal(full.body, '### A\n\n- b', 'a numbers block stays in the fragment: never folded into the public changelog');
  const errs = parseFragment('x.md', head + '\nKind: player\n\nServer cost:\n\n- About 2 Mbit/s per room, typical.\n').errors.join(' | ');
  for (const want of [/never Mbit\/s/, /missing "typical" and "worst" case/, /missing per player/, /missing 300 players/, /missing bandwidth in MB\/s/,
    /missing bandwidth in GB\/day/, /missing server CPU/, /missing memory in MB/, /missing disk in MB\/day/, /missing bot budget in ms\/round/,
    /missing a "Cap:" line/, /missing "measured" or "estimated"/]) assert.match(errs, want);
  assert.match(parseFragment('x.md', head + '\nKind: player\n\nServer cost: none\nKind: player\n\nServer cost: none\n').errors.join(' | '), /more than one "Server cost:" line/);
});

// (fork, 2026-11-13) The public changelog is for players: every fragment says its kind, only "player" ones fold.
test('Kind: missing or unknown is an error that asks for it; player and internal parse', () => {
  const head = '## 2026-11-13\n\n### A\n\n- b\n\n';
  assert.match(parseFragment('x.md', head + 'Server cost: none\n').errors.join(' | '), /no "Kind:" line\. Add "Kind: player"[\s\S]*When unsure: internal/);
  assert.match(parseFragment('x.md', head + 'Kind: tooling\n\nServer cost: none\n').errors.join(' | '), /"Kind:" must be one line, "Kind: player" or "Kind: internal"/);
  assert.match(parseFragment('x.md', head + 'Kind: player\nKind: internal\n\nServer cost: none\n').errors.join(' | '), /more than one "Kind:" line/);
  for (const kind of ['player', 'internal']) {
    for (const tail of [`Kind: ${kind}\n\nServer cost: none\n`, `Server cost: none\n\nKind: ${kind}\n`]) {
      const f = parseFragment('x.md', head + tail);
      assert.deepEqual(f.errors, [], tail);
      assert.equal(f.kind, kind);
      assert.equal(f.cost.kind, 'none', 'the Server cost block ends where Kind starts');
      assert.equal(f.body, '### A\n\n- b');
    }
  }
});

// (fork, 2026-11-13) The public changelog never carries the operator's own deployment (OPERATOR_ONLY).
describe('operator-only content', () => {
  const head = '## 2026-11-13\n\n### A\n\n- b\n';

  test('the Operator notes block is never folded, in either order with Server cost', () => {
    const notes = 'Operator notes:\n\n- Deploy: ssh spa, then sudo systemctl restart stronghold@x; peer.env is untouched.\n';
    for (const tail of [`\nKind: player\n\nServer cost: none\n\n${notes}`, `\n${notes}\nKind: player\n\nServer cost: none\n`]) {
      const f = parseFragment('x.md', head + tail);
      assert.deepEqual(f.errors, []);
      assert.equal(f.body, '### A\n\n- b');
      assert.match(f.notes, /^Operator notes:/);
      assert.equal(f.cost.kind, 'none', 'the Server cost block ends where the notes start');
    }
    assert.match(parseFragment('x.md', `${head}\nKind: player\n\nServer cost: none\n\n${notes}\n${notes}`).errors.join(' | '), /more than one "Operator notes:" line/);
  });

  test('each kind of operator-only line in a section is refused with what it is', () => {
    const cases = [
      ['the site at play.example.net', /a domain name/],
      ['moved to 203.0.113.7', /an IP address/],
      ['run it on usspa first', /a server alias/],
      ['players on the Singapore server', /a server region name/],
      ['then `sudo systemctl restart`', /a server command/],
      ['edit /etc/stronghold/peer.env', /a server path/],
      ['the secret in peer.env', /a secrets file/],
      ['our OVH box', /a hosting provider/],
      ['about 0.3 MB/s for 300 players', /a traffic or disk rate/],
      ['1.6 GB a day', /a traffic or disk rate/],
    ];
    for (const [line, want] of cases) {
      const errs = parseFragment('x.md', `## 2026-11-13\n\n### A\n\n- ${line}\n\nKind: player\n\nServer cost: none\n`).errors.join(' | ');
      assert.match(errs, want, line);
      assert.match(errs, /move it under "Operator notes:"/);
    }
  });

  test('public references, versions and game words pass', () => {
    for (const line of [
      'thanks to @sganggs ([#912](https://github.com/sganggs/Stronghold-Protocol/pull/912))',
      'names from [arknights.wiki.gg](https://arknights.wiki.gg/wiki/Operator/List)',
      'Lobby banner Update 0.2.4.1', 'a 4 MB pack', 'SilverAsh the Reignfrost', 'deploy tiles', 'a spacious Spartan room',
      'files under `docs/` and `public/assets`', 'the US English voice', 'the `SP_REGIONS` setting',
    ]) assert.deepEqual(operatorOnly(line), [], line);
  });

  test('FORK-CHANGELOG.md holds none of it', () => {
    assert.deepEqual(operatorOnly(readFileSync(CHANGELOG, 'utf8')).map((h) => `${h.line}: ${h.label}: ${h.text}`), []);
  });
});

test('"unmeasured (pre-rule)" is accepted only from the fragments named in PRE_RULE_UNMEASURED', () => {
  const text = '## 2026-11-11\n\n### A\n\n- b\n\nKind: player\n\nServer cost: unmeasured (pre-rule)\n';
  assert.ok(PRE_RULE_UNMEASURED.length > 0);
  assert.equal(parseFragment(PRE_RULE_UNMEASURED[0], text).cost.kind, 'pre-rule');
  assert.match(parseFragment('new-change.md', text).errors.join(' | '), /only for the fragments listed/);
});

const LOG = '# Fork changelog\n\nIntro.\n\n## 2026-11-11\n\n### Old today\n\n- x\n\n## 2026-11-09\n\n### Older\n\n- y\n';

test('fragments go to the top of their date, newest first; a new date gets its own section in date order', () => {
  const out = foldFragments(LOG, [
    { name: 'a.md', date: '2026-11-11', body: '### First added\n\n- a', order: 1 },
    { name: 'b.md', date: '2026-11-11', body: '### Added later\n\n- b', order: 2 },
    { name: 'c.md', date: '2026-11-10', body: '### Between\n\n- c', order: 3 },
    { name: 'd.md', date: '2026-11-12', body: '### Newest day\n\n- d', order: 0 },
  ]);
  assert.equal(out, '# Fork changelog\n\nIntro.\n\n## 2026-11-12\n\n### Newest day\n\n- d\n\n## 2026-11-11\n\n### Added later\n\n- b\n\n'
    + '### First added\n\n- a\n\n### Old today\n\n- x\n\n## 2026-11-10\n\n### Between\n\n- c\n\n## 2026-11-09\n\n### Older\n\n- y\n');
});

test('with no fragments FORK-CHANGELOG.md comes back byte for byte', () => {
  const t = readFileSync(new URL('../FORK-CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(foldFragments(t, []), t);
  assert.equal(foldFragments(LOG, []), LOG);
});

// The command (tools/changelog.mjs main): only --write folds and deletes, on dev-0.2 with changes/ committed; --help,
// an unknown option and --dry-run touch nothing (a `--help` once folded and deleted every fragment).
const TOOL = fileURLToPath(new URL('../tools/changelog.mjs', import.meta.url));
const listing = (dir) => readdirSync(dir).sort().map((f) => `${f}:${readFileSync(join(dir, f), 'utf8').length}`);

test('--help and an unknown option print the usage and exit 1 without touching changes/ or FORK-CHANGELOG.md', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const before = [listing(join(root, 'changes')), readFileSync(join(root, 'FORK-CHANGELOG.md'), 'utf8')];
  for (const args of [['--help'], ['-h'], ['--bogus'], ['--dry-run', '--write'], ['write']]) {
    const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 << 20 });
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stdout, /^Usage: node tools\/changelog\.mjs/m, args.join(' '));
    if (args[0] !== '--help' && args[0] !== '-h') assert.match(r.stdout, /unknown option|not several/, args.join(' '));
  }
  assert.deepEqual([listing(join(root, 'changes')), readFileSync(join(root, 'FORK-CHANGELOG.md'), 'utf8')], before);
});

describe('in a checkout', () => {
  let dir;
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const run = (args, branch) => { const lines = []; let printed = ''; const code = main(args, { root: dir, log: (x) => lines.push(x), out: (x) => { printed += x; }, ...(branch ? { branch } : {}) }); return { code, lines: lines.join('\n'), printed }; };
  const frag = '## 2026-11-11\n\n### New thing\n\n- It works.\n\nKind: player\n\nServer cost: none\n';
  const INTERNAL = '## 2026-11-11\n\n### Release tool\n\n- One command for the release.\n\nKind: internal\n\nServer cost: none (tooling only)\n';
  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'sp-changelog-'));
    g('init', '-q', '-b', 'dev-0.2');
    g('config', 'user.email', 'test@example.invalid'); g('config', 'user.name', 'test'); g('config', 'core.autocrlf', 'false');
    mkdirSync(join(dir, 'changes'));
    writeFileSync(join(dir, 'changes/README.md'), '# format\n');
    writeFileSync(join(dir, 'changes/new-thing.md'), frag);
    writeFileSync(join(dir, 'changes/release-tool.md'), INTERNAL);
    writeFileSync(join(dir, 'FORK-CHANGELOG.md'), LOG);
    g('add', '-A'); g('commit', '-q', '-m', 'base');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const untouched = () => { assert.equal(readFileSync(join(dir, 'changes/new-thing.md'), 'utf8'), frag); assert.equal(readFileSync(join(dir, 'FORK-CHANGELOG.md'), 'utf8'), LOG); };

  test('no option checks; --dry-run prints the folded changelog; neither writes', () => {
    const c = run([]);
    assert.equal(c.code, 0);
    assert.match(c.lines, /2 fragment\(s\) OK/);
    const d = run(['--dry-run']);
    assert.equal(d.code, 0);
    assert.match(d.printed, /## 2026-11-11\n\n### New thing\n\n- It works\.\n\n### Old today/);
    assert.doesNotMatch(d.printed, /Release tool/, 'an internal fragment is never folded');
    untouched();
  });

  test('--write refuses on another branch and with uncommitted changes/ or FORK-CHANGELOG.md', () => {
    const other = run(['--write'], 'main');
    assert.equal(other.code, 1);
    assert.match(other.lines, /runs on main only \(this checkout is on dev-0\.2\)/);
    untouched();
    writeFileSync(join(dir, 'changes/second.md'), frag.replace('New thing', 'Second'));
    const dirty = run(['--write']);
    assert.equal(dirty.code, 1);
    assert.match(dirty.lines, /uncommitted changes[\s\S]*changes\/second\.md/);
    untouched();
    rmSync(join(dir, 'changes/second.md'));
  });

  test('--write on dev-0.2 with everything committed folds the fragments in and deletes them', () => {
    const w = run(['--write']);
    assert.equal(w.code, 0, w.lines);
    assert.deepEqual(readdirSync(join(dir, 'changes')), ['README.md'], 'player and internal fragments are both deleted');
    const log = readFileSync(join(dir, 'FORK-CHANGELOG.md'), 'utf8');
    assert.match(log, /## 2026-11-11\n\n### New thing\n\n- It works\.\n\n### Old today/);
    assert.doesNotMatch(log, /Release tool/);
    assert.match(w.lines, /deleted 1 internal fragment\(s\) without folding: release-tool\.md/);
  });
});
