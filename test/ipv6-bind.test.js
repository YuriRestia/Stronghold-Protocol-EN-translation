// test/ipv6-bind.test.js — dual-stack listen (accepted as #188, ported from PR #291 without /dev/grant,
// the settings migration, the firewall scripts, or a Dockerfile HOST change).
//
// With HOST unset the server binds '::' (Node leaves ipv6Only off, so one socket answers IPv6 and IPv4).
// That default is the only host retried, and only on EAFNOSUPPORT / EADDRNOTAVAIL / EINVAL. An explicit HOST,
// including 0.0.0.0 and 127.0.0.1, is tried once. The local URL brackets an IPv6 literal. The image stays on
// 0.0.0.0 until an alpine boot of the fallback has actually been run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyAddresses, hostUrl } from '../tools/doctor.mjs';
import { DEFAULT_BIND_HOST, listenAddress, bindCandidates } from '../server/http/config.js';
import { displayHost } from '../server/http/boot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = (p) => readFileSync(join(ROOT, p), 'utf8');

function restoreHost(saved) {
  if (saved === undefined) delete process.env.HOST;
  else process.env.HOST = saved;
}

test('the listen entry points default to ::, and the image stays on IPv4', () => {
  assert.match(doc('server/http/config.js'), /export const DEFAULT_BIND_HOST = '::';/);
  assert.match(doc('server/http/config.js'), /opts\.host \|\| process\.env\.HOST\) \|\| DEFAULT_BIND_HOST/);
  assert.match(doc('server/http/boot.js'), /for \(const u of lanUrls\(srv\.port\)\)/);
  assert.match(doc('scripts/run-server.cmd'), /^\s*set "HOST=::"$/m);
  assert.match(doc('scripts/install-service-windows.ps1'), /\[string\]\$BindHost = '::',/);
  assert.match(doc('scripts/install-service-windows.ps1'), /Select-String -Pattern 'http:\/\/'/);
  assert.doesNotMatch(doc('scripts/install-service-windows.ps1'), /http:\/\/\\d/);
  assert.match(doc('scripts/launch.mjs'), /process\.env\.HOST \|\| '::'/);
  assert.match(doc('tools/doctor.mjs'), /process\.env\.HOST \|\| '::'/);
  assert.match(doc('README.md'), /\| `HOST` \| `::` \|/);
  assert.match(doc('Dockerfile'), /HOST=0\.0\.0\.0/);
  assert.doesNotMatch(doc('Dockerfile'), /HOST=::/);
});

test('listenAddress: the option wins over the environment, the environment over the default', () => {
  const saved = process.env.HOST;
  try {
    delete process.env.HOST;
    assert.deepEqual(listenAddress({}), { port: 3000, host: DEFAULT_BIND_HOST });
    assert.equal(listenAddress({ host: '' }).host, DEFAULT_BIND_HOST, 'an empty host is no host');
    process.env.HOST = '127.0.0.1';
    assert.equal(listenAddress({}).host, '127.0.0.1', 'HOST is kept when it is set');
    assert.equal(listenAddress({ host: '0.0.0.0' }).host, '0.0.0.0', 'the option wins over HOST');
  } finally {
    restoreHost(saved);
  }
  assert.equal(listenAddress({ port: 0 }).port, 0, 'port 0 is a real port (an ephemeral one)');
  assert.equal(listenAddress({ host: '127.0.0.1' }).host, '127.0.0.1');
  assert.throws(() => listenAddress({ port: 70000 }), RangeError);
});

test('bindCandidates: only the default is retried, an explicit host is literal', () => {
  assert.deepEqual(bindCandidates(DEFAULT_BIND_HOST), ['::', '0.0.0.0']);
  assert.deepEqual(bindCandidates('0.0.0.0'), ['0.0.0.0']);
  assert.deepEqual(bindCandidates('127.0.0.1'), ['127.0.0.1']);
  assert.deepEqual(bindCandidates('192.168.1.7'), ['192.168.1.7']);
  assert.deepEqual(bindCandidates('2001:db8::1'), ['2001:db8::1']);
});

test('an IPv6 literal is bracketed in a URL, a wildcard bind reads localhost', () => {
  assert.equal(hostUrl('192.168.1.7', 3000), 'http://192.168.1.7:3000');
  assert.equal(hostUrl('100.64.0.9', 3000), 'http://100.64.0.9:3000');
  assert.equal(hostUrl('240e:3b7:8c4:40f0::1000', 3000), 'http://[240e:3b7:8c4:40f0::1000]:3000');
  assert.equal(hostUrl('fe80::320d:9eff:fe07:e79a', 8080), 'http://[fe80::320d:9eff:fe07:e79a]:8080');
  assert.equal(displayHost('0.0.0.0'), 'localhost');
  assert.equal(displayHost('::'), 'localhost');
  assert.equal(displayHost('::1'), '[::1]');
  assert.equal(displayHost('2001:db8::1'), '[2001:db8::1]');
  assert.equal(displayHost('127.0.0.1'), '127.0.0.1');
});

test('classifyAddresses: IPv6 kinds, and one entry per /64', () => {
  const v6 = (name, ...addresses) => [name, addresses.map((address) => ({ family: 'IPv6', address, internal: false }))];
  const list = classifyAddresses(Object.fromEntries([
    v6('以太网', 'fe80::1', '240e:3b7:8c4:40f0:bb2b:c23f:a265:a95d', '240e:3b7:8c4:40f0:7c4a:8d15:f95:fc16', 'fd00::5'),
    v6('vEthernet (Default Switch)', '2001:db8::1', '2002:c0a8:101::1'),
    v6('Tailscale', 'fd7a:115c:a1e0::1'),
    ['Loopback Pseudo-Interface 1', [{ family: 'IPv6', address: '::1', internal: true }]],
  ]));
  const kindOf = (address) => list.find((a) => a.address === address)?.kind;
  assert.equal(kindOf('240e:3b7:8c4:40f0:bb2b:c23f:a265:a95d'), 'public');
  assert.equal(kindOf('fe80::1'), 'linklocal');
  assert.equal(kindOf('fd00::5'), 'lan');
  assert.equal(kindOf('fd7a:115c:a1e0::1'), 'vpn');
  assert.equal(kindOf('2001:db8::1'), 'virtual');
  assert.equal(kindOf('2002:c0a8:101::1'), 'virtual');
  assert.equal(list.filter((a) => a.kind === 'public').length, 1, 'the two addresses of one /64 collapse into one');
  assert.ok(!list.some((a) => a.address === '::1'), 'loopback is internal');
});

test('lanUrls lists IPv4 first, brackets IPv6, and drops link-local', async () => {
  const { lanUrls } = await import('../server/index.js');
  const urls = lanUrls(3000);
  for (const u of urls) assert.match(u, /^http:\/\/(\[[0-9a-fA-F:]+\]|\d{1,3}(?:\.\d{1,3}){3}):3000$/, u);
  assert.ok(!urls.some((u) => u.includes('[fe80:')), 'no link-local URLs');
  const firstV6 = urls.findIndex((u) => u.includes('['));
  if (firstV6 > 0) assert.ok(urls.slice(0, firstV6).every((u) => !u.includes('[')), 'IPv4 comes before IPv6');
});

test('the default bind is one dual-stack socket, and an explicit host is not rewritten', async (t) => {
  const hasV6 = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(0, '::', () => probe.close(() => resolve(true)));
  });
  if (!hasV6) { t.skip('this host has no IPv6'); return; }

  const saved = process.env.HOST;
  delete process.env.HOST;
  const { startServer } = await import('../server/index.js');
  const get = (srv, host) => new Promise((resolve) => {
    const req = http.get({ host, port: srv.port, path: '/healthz' }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', (e) => resolve(e.code || 0));
  });
  const dual = await startServer({ port: 0, quiet: true });
  try {
    assert.equal(dual.host, '::');
    assert.equal(dual.server.address().family, 'IPv6');
    assert.match(dual.url, /^http:\/\/localhost:\d+$/);
    assert.equal(await get(dual, '::1'), 200);
    assert.equal(await get(dual, '127.0.0.1'), 200);
  } finally {
    await dual.close();
  }

  const loop = await startServer({ port: 0, host: '::1', quiet: true });
  try {
    assert.equal(loop.host, '::1');
    assert.match(loop.url, /^http:\/\/\[::1\]:\d+$/);
    assert.equal(await get(loop, '::1'), 200);
  } finally {
    await loop.close();
  }

  const v4 = await startServer({ port: 0, host: '0.0.0.0', quiet: true });
  try {
    assert.equal(v4.host, '0.0.0.0');
    assert.match(v4.url, /^http:\/\/localhost:\d+$/);
    assert.equal(await get(v4, '127.0.0.1'), 200);
    assert.notEqual(await get(v4, '::1'), 200, 'HOST=0.0.0.0 stays IPv4 only');
  } finally {
    await v4.close();
    restoreHost(saved);
  }
});

test('when :: cannot be bound, the default falls back to 0.0.0.0; EADDRINUSE does not', async () => {
  const proto = http.Server.prototype;
  const orig = proto.listen;
  const saved = process.env.HOST;
  delete process.env.HOST;
  const { startServer } = await import('../server/index.js');

  const stub = (failCode) => {
    const tried = [];
    proto.listen = function (port, host, ...rest) {
      tried.push(host);
      if (host === '::') {
        const err = Object.assign(new Error(failCode), { code: failCode });
        process.nextTick(() => this.emit('error', err));
        return this;
      }
      return orig.call(this, port, host, ...rest);
    };
    return tried;
  };

  try {
    const tried = stub('EAFNOSUPPORT');
    const srv = await startServer({ port: 0, quiet: true });
    try {
      assert.deepEqual(tried, ['::', '0.0.0.0']);
      assert.equal(srv.host, '0.0.0.0');
      assert.match(srv.url, /^http:\/\/localhost:\d+$/);
      assert.equal(srv.server.address().family, 'IPv4');
    } finally {
      await srv.close();
    }

    const refused = stub('EADDRINUSE');
    await assert.rejects(() => startServer({ port: 0, quiet: true }), (e) => e && e.code === 'EADDRINUSE');
    assert.deepEqual(refused, ['::'], 'a port conflict is not an IPv6-missing error');

    const explicit = [];
    proto.listen = function (port, host, ...rest) {
      explicit.push(host);
      const err = Object.assign(new Error('EAFNOSUPPORT'), { code: 'EAFNOSUPPORT' });
      process.nextTick(() => this.emit('error', err));
      return this;
    };
    await assert.rejects(
      () => startServer({ port: 0, host: '::1', quiet: true }),
      (e) => e && e.code === 'EAFNOSUPPORT',
    );
    assert.deepEqual(explicit, ['::1'], 'an explicit host is not retried');
  } finally {
    proto.listen = orig;
    restoreHost(saved);
  }
});
