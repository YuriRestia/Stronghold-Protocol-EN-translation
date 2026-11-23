// (fork, 2026-11-13) scripts/ssh-sudo.mjs — the remembered sudo password over ssh, shared by release.mjs and
// deploy-regions.mjs — and deploy-regions' use of it. No real ssh: spawn and the password store are fakes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sudoLine, hostRunner, sudoRunners } from '../scripts/ssh-sudo.mjs';
import { main, runnerIo, statusCommand, newsUploadCommand } from '../scripts/deploy-regions.mjs';
import { sudoLine as releaseSudoLine } from '../scripts/release.mjs';

const RIGHT = 'right pw';

/** A fake ssh: `sg` needs no password; `us` takes RIGHT on stdin. Records every call. */
function fakeSpawn(calls = []) {
  const spawn = (cmd, args, opts) => {
    assert.equal(cmd, 'ssh');
    const [host, line] = args;
    calls.push({ host, line, input: opts.input });
    if (host === 'down') return { status: 255, stdout: '', stderr: 'ssh: connect to host down: Connection refused' };
    if (line === 'sudo -n true') return host === 'sg' ? { status: 0, stdout: '', stderr: '' } : { status: 1, stdout: '', stderr: 'sudo: a password is required' };
    if (line.startsWith("sudo -S -p '' ")) {
      return opts.input?.startsWith(`${RIGHT}\n`) ? { status: 0, stdout: 'ok', stderr: '' } : { status: 1, stdout: '', stderr: 'Sorry, try again.' };
    }
    return { status: 0, stdout: 'plain', stderr: '' };
  };
  return { spawn, calls };
}

/** A fake store: `stored` is what load() returns; askAndRemember() hands out `typed` in order. */
function fakeStore({ stored = null, typed = [] } = {}) {
  const log = [];
  const store = {
    load: (h) => { log.push(`load ${h}`); return stored; },
    askAndRemember: (h) => { log.push(`ask ${h}`); stored = typed.shift(); return stored; },
    forget: (h) => { log.push(`forget ${h ?? '*'}`); stored = null; return h ? [`sudo-${h}.dpapi`] : ['sudo-us.dpapi']; },
  };
  return { store, log };
}

const quiet = { say: () => {} };

describe('hostRunner', () => {
  test('the password goes to stdin only for a sudo line, never into the command line', () => {
    const { spawn, calls } = fakeSpawn();
    const r = hostRunner('us', RIGHT, { spawn, ...quiet });
    assert.equal(r.capture(statusCommand()).status, 0);
    r.stream(statusCommand());
    r.capture(newsUploadCommand(), { input: '{"news":1}' });
    assert.equal(calls[0].input, `${RIGHT}\n`);
    assert.equal(calls[1].input, `${RIGHT}\n`);
    assert.equal(calls[2].input, '{"news":1}', 'an upload without sudo never carries the password');
    for (const c of calls) assert.ok(!c.line.includes(RIGHT), c.line);
    assert.match(calls[0].line, /^sudo -S -p '' bash -c /);
  });

  test('a host without a password never prompts', () => {
    const { spawn, calls } = fakeSpawn();
    hostRunner('sg', null, { spawn, ...quiet }).capture(statusCommand());
    assert.match(calls[0].line, /^sudo -n bash -c /);
    assert.equal(calls[0].input, '');
  });

  test('release.mjs uses the same sudoLine', () => assert.equal(releaseSudoLine, sudoLine));
});

describe('sudoRunners', () => {
  const run = (hosts, o) => sudoRunners(hosts.map((host) => ({ host })), { ...quiet, ...o });

  test('a host that needs no password: no store access', () => {
    const { spawn } = fakeSpawn();
    const { store, log } = fakeStore();
    const m = run(['sg'], { spawn, store, interactive: false });
    assert.equal(m.get('sg').hasPassword, false);
    assert.deepEqual(log, []);
  });

  test('the remembered password is checked and used; nothing is asked', () => {
    const { spawn, calls } = fakeSpawn();
    const { store, log } = fakeStore({ stored: RIGHT });
    const m = run(['us', 'sg'], { spawn, store, interactive: false });
    assert.equal(m.get('us').hasPassword, true);
    assert.equal(m.get('sg').hasPassword, false);
    assert.deepEqual(log, ['load us']);
    assert.ok(calls.some((c) => c.host === 'us' && c.line === "sudo -S -p '' true"));
  });

  test('a wrong remembered password: said, forgotten, asked again once', () => {
    const { spawn } = fakeSpawn();
    const { store, log } = fakeStore({ stored: 'old', typed: [RIGHT] });
    const said = [];
    const m = run(['us'], { spawn, store, interactive: true, say: (s) => said.push(s) });
    assert.equal(m.get('us').hasPassword, true);
    assert.deepEqual(log, ['load us', 'forget us', 'ask us']);
    assert.match(said.join('\n'), /sudo refused the remembered password \(Sorry, try again\.\); it is forgotten\. Type it again/);
  });

  test('a second refusal stops, and the password stays forgotten', () => {
    const { spawn } = fakeSpawn();
    const { store, log } = fakeStore({ stored: 'old', typed: ['also wrong'] });
    assert.throws(() => run(['us'], { spawn, store, interactive: true }), /us: sudo refused the typed password .*it is forgotten: run again to type it/);
    assert.deepEqual(log, ['load us', 'forget us', 'ask us', 'forget us']);
  });

  test('a wrong remembered password without a terminal stops at once', () => {
    const { spawn } = fakeSpawn();
    const { store, log } = fakeStore({ stored: 'old' });
    assert.throws(() => run(['us'], { spawn, store, interactive: false }), /sudo refused the remembered password/);
    assert.deepEqual(log, ['load us', 'forget us']);
  });

  test('none remembered: asked once in a terminal; without one a stop, or a skipped host when allowed', () => {
    const { spawn } = fakeSpawn();
    let f = fakeStore({ typed: [RIGHT] });
    assert.equal(run(['us'], { spawn, store: f.store, interactive: true }).get('us').hasPassword, true);
    assert.deepEqual(f.log, ['load us', 'ask us']);
    f = fakeStore();
    assert.throws(() => run(['us'], { spawn, store: f.store, interactive: false }), /us asks for a sudo password: run this in a terminal once/);
    assert.equal(run(['us'], { spawn, store: fakeStore().store, interactive: false, allowMissing: true }).get('us'), null);
  });

  test('an ssh failure stops before any password is loaded', () => {
    const { spawn } = fakeSpawn();
    const { store, log } = fakeStore({ stored: RIGHT });
    assert.throws(() => run(['down'], { spawn, store }), /down: ssh failed: ssh: connect to host down/);
    assert.deepEqual(log, []);
  });
});

describe('deploy-regions main', () => {
  /** Fake runners that record what each host was sent. */
  const fakeRunners = () => {
    const sent = [];
    const runner = (host) => ({
      host,
      stream: (l) => sent.push(`${host} stream ${l}`),
      capture: (l, o) => { sent.push(`${host} capture ${l}${o?.input ? ' <input>' : ''}`); return { status: 0, stdout: '/tmp/sp-news-abc123.json\n', stderr: '' }; },
    });
    return { sent, runnersFor: (hosts) => new Map(hosts.map((h) => [h.host, runner(h.host)])) };
  };
  const silenced = (fn) => {
    const { log, error } = console;
    console.log = () => {}; console.error = () => {};
    try { return fn(); } finally { console.log = log; console.error = error; }
  };

  test('--forget-sudo deletes the remembered passwords and contacts no server', () => {
    const { store, log } = fakeStore({ stored: RIGHT });
    let used = false;
    const code = silenced(() => main(['--forget-sudo'], { store, runnersFor: () => { used = true; return new Map(); } }));
    assert.equal(code, 0);
    assert.deepEqual(log, ['forget *']);
    assert.equal(used, false);
  });

  test('status goes through each host\'s runner, so a remembered password is used', () => {
    const { sent, runnersFor } = fakeRunners();
    assert.equal(silenced(() => main(['status', '--hosts', 'sg,us'], { runnersFor })), 0);
    assert.deepEqual(sent, [`sg stream ${statusCommand()}`, `us stream ${statusCommand()}`]);
  });

  test('a bad command line contacts no server', () => {
    let used = false;
    assert.equal(silenced(() => main(['nope', '--hosts', 'sg'], { runnersFor: () => { used = true; return new Map(); } })), 1);
    assert.equal(used, false);
  });

  test('runnerIo refuses a host without a runner', () => {
    assert.throws(() => runnerIo(new Map([['us', null]])).ssh('us', 'x'), /us: no ssh runner/);
  });
});
