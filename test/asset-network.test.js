import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { MirrorPolicy, selectDownloadSource } from '../tools/assets/network.mjs';
import { downloadUrls, githubProxyUrl, githubSourceUrl, normalizeProxyPrefix } from '../tools/assets/sources.mjs';
import { Downloader } from '../tools/assets/downloader.mjs';
import { cachedJson, loadIndexes } from '../tools/assets/cache.mjs';
import { resolveTemplate } from '../tools/assets/manifest.mjs';
import { processModels } from '../tools/assets/spine.mjs';

const RAW = 'https://raw.githubusercontent.com/o/r/main/a.json';
const PROXY = 'https://gh-proxy.com/' + RAW;
const CDN = 'https://cdn.jsdelivr.net/gh/o/r@main/a.json';
const quiet = () => {};

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'sp-network-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('default, manual source and offline mode perform no public IP lookup', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { assert.fail('unexpected network request'); });
  assert.equal(await selectDownloadSource({ log: quiet }), 'direct');
  for (const mode of ['direct', 'mirror']) assert.equal(await selectDownloadSource({ mode, log: quiet }), mode);
  assert.equal(await selectDownloadSource({ offline: true }), 'direct');
  await assert.rejects(selectDownloadSource({ mode: 'invalid' }), /unknown asset source/);
  await assert.rejects(selectDownloadSource({ mode: 'auto' }), /unknown asset source/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('mirror startup log names its proxy and states the validation scope', async () => {
  const logs = [];
  assert.equal(await selectDownloadSource({ mode: 'mirror', proxyPrefix: 'https://mirror.example/p/', log: (msg) => logs.push(msg) }), 'mirror');
  assert.match(logs[0], /https:\/\/mirror\.example\/p\//);
  assert.match(logs[0], /仅校验格式和大小/);
});

test('URL order, voice support, custom prefix, and no double prefix', () => {
  assert.deepEqual(downloadUrls(RAW, { source: 'mirror' }), [PROXY, RAW, CDN]);
  assert.deepEqual(downloadUrls(RAW), [RAW, CDN]);
  assert.deepEqual(downloadUrls(RAW, { source: 'direct', proxyPrefix: 'https://custom.example/' }), [RAW, CDN]);
  const voice = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/x.mp3';
  assert.deepEqual(downloadUrls(voice, { source: 'mirror' }), ['https://gh-proxy.com/' + voice, voice]);
  assert.deepEqual(downloadUrls(PROXY, { source: 'mirror' }), [PROXY, RAW, CDN]);
  assert.deepEqual(downloadUrls(PROXY), [RAW, CDN]);
  assert.deepEqual(downloadUrls('https://old-proxy.example/prefix/' + RAW, { source: 'mirror', proxyPrefix: '' }), [RAW, CDN]);
  assert.deepEqual(downloadUrls(PROXY, { source: 'mirror', proxyPrefix: 'https://new-proxy.example/' }), ['https://new-proxy.example/' + RAW, RAW, CDN]);
  assert.equal(githubSourceUrl('https://old-proxy.example/' + PROXY), RAW);
  assert.equal(githubSourceUrl(RAW + '/https://example.com/path'), RAW + '/https://example.com/path');
  for (const url of ['https://example.com/a', 'https://github.com.evil.example/a', 'https://user:secret@github.com/a']) {
    assert.equal(githubProxyUrl(url), null);
  }
  assert.equal(githubProxyUrl(RAW, 'https://mirror.example/prefix'), 'https://mirror.example/prefix/' + RAW);
  assert.equal(normalizeProxyPrefix(), 'https://gh-proxy.com/');
  for (const proxyPrefix of ['', '   ']) {
    assert.equal(normalizeProxyPrefix(proxyPrefix), '');
    assert.equal(githubProxyUrl(RAW, proxyPrefix), null);
    assert.deepEqual(downloadUrls(RAW, { source: 'mirror', proxyPrefix }), [RAW, CDN]);
  }
  for (const prefix of ['http://mirror.example/', 'https://mirror.example/?q=x', 'https://user:secret@mirror.example/']) {
    assert.throws(() => normalizeProxyPrefix(prefix), /HTTPS URL/);
  }
});

test('downloader uses proxy, validates payload, falls back, and skips existing files', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', retries: 1, backoffMs: 0, log: quiet,
    fetchImpl: async (url) => {
      calls.push(url);
      return url === PROXY ? new Response('<html>bad gateway</html>') : Response.json({ ok: true });
    } });
  const job = { rel: 'a.json', urls: [RAW], kind: 'json' };
  assert.equal((await dl.run([job])).get(job.rel).url, RAW);
  assert.deepEqual(calls, [PROXY, RAW]);
  assert.equal((await dl.run([job])).get(job.rel).status, 'skip');
  assert.equal(calls.length, 2);
});

test('proxy provenance is recognized as the primary asset, not a fallback asset', async (t) => {
  const dir = await fixture(t);
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', log: quiet,
    fetchImpl: async () => Response.json({ ok: true }) });
  const job = { rel: 'a.json', urls: [RAW], kind: 'json' };
  assert.equal((await dl.run([job])).get(job.rel).url, PROXY);
  for (const source of [PROXY, 'https://old-proxy.example/prefix/' + RAW]) {
    const resolved = resolveTemplate({ icon: { alts: [job] } }, { root: dir, spine: new Map(), sourceOf: () => source });
    assert.deepEqual(resolved.fallbacks, [], 'disabling/changing the proxy does not change default proxy provenance');
    assert.equal(resolved.value.icon, '/assets/a.json');
  }
});

test('Spine pages from old proxy ledger entries respect direct and explicitly disabled mirror mode', async (t) => {
  const base = 'https://raw.githubusercontent.com/o/r/main/';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
  for (const prefix of ['https://gh-proxy.com/', 'https://old-proxy.example/prefix/']) {
    for (const opts of [{ source: 'direct' }, { source: 'mirror', proxyPrefix: '' }]) {
      const dir = await fixture(t);
      const atlas = 'extra.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n';
      await writeFile(join(dir, 'model.atlas'), atlas);
      const calls = [];
      const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), log: quiet, ...opts,
        fetchImpl: async (url) => {
          calls.push(url);
          return url === base + 'extra.png' ? new Response(png) : new Response('', { status: 404 });
        } });
      dl.ledger.files['model.atlas'] = { url: prefix + base + 'model.atlas', bytes: Buffer.byteLength(atlas) };
      const model = { key: 'model', dir: '', baseUrl: base, pngs: [],
        skel: { rel: 'model.skel', urls: [base + 'model.skel'], kind: 'skel' },
        atlas: { rel: 'model.atlas', urls: [base + 'model.atlas'], kind: 'atlas' } };
      await processModels(new Map([['model', model]]), { root: dir, dl, cachePath: join(dir, 'spine.json'), log: quiet });
      assert.ok(calls.includes(base + 'extra.png'));
      assert.ok(calls.every((url) => url.startsWith(base) || url.startsWith('https://cdn.jsdelivr.net/')));
      assert.equal(dl.ledger.files['extra.png'].url, base + 'extra.png');
    }
  }
});

test('all three indexes use the selected proxy and cached/offline reads make no request', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const opts = { source: 'mirror', log: quiet, fetchImpl: async (url) => { calls.push(url); return Response.json({ index: true }); } };
  const result = await loadIndexes(dir, opts);
  assert.deepEqual(result, { audioData: { index: true }, modelsData: { index: true }, charword: { index: true } });
  assert.equal(calls.length, 3);
  assert.ok(calls.some((url) => url.endsWith('/charword_table.json')));
  assert.ok(calls.every((url) => url.startsWith('https://gh-proxy.com/https://raw.githubusercontent.com/')));
  await loadIndexes(dir, { ...opts, offline: true, refresh: true });
  assert.equal(calls.length, 3);
  assert.deepEqual(JSON.parse(await readFile(join(dir, '.cache', 'ark-models', 'models_data.json'), 'utf8')), { index: true });
});

test('index proxy miss falls back to raw', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  assert.deepEqual(await cachedJson({ cacheFile: join(dir, 'index.json'), url: RAW, source: 'mirror', log: quiet,
    fetchImpl: async (url) => { calls.push(url); return url === PROXY ? new Response('', { status: 404 }) : Response.json({ ok: true }); } }), { ok: true });
  assert.deepEqual(calls, [PROXY, RAW]);
});

test('direct retries that recover do not print a failure hint or contact the prefix proxy', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const logs = [];
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), retries: 1, backoffMs: 0,
    log: (msg) => logs.push(msg), fetchImpl: async (url) => {
      calls.push(url);
      return url.startsWith('https://raw.githubusercontent.com/') ? new Response('', { status: 503 }) : Response.json({ ok: true });
    } });
  await dl.run([1, 2].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => url.startsWith('https://raw.githubusercontent.com/') || url.startsWith('https://cdn.jsdelivr.net/')));
  assert.equal(logs.filter((msg) => msg.includes('--asset-source=mirror')).length, 0);
});

test('default index retries that fall back successfully do not print a failure hint', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const logs = [];
  const result = await cachedJson({ cacheFile: join(dir, 'index.json'), url: RAW, backoffMs: 0,
    log: (msg) => logs.push(msg), fetchImpl: async (url) => {
      calls.push(url);
      return url === RAW ? new Response('', { status: 503 }) : Response.json({ ok: true });
    } });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [RAW, RAW, RAW, CDN]);
  assert.equal(logs.filter((msg) => msg.includes('--asset-source=mirror')).length, 0);
});

test('empty proxy setting disables every downloader and index proxy request in mirror mode', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const opts = { source: 'mirror', proxyPrefix: '', log: quiet, fetchImpl: async (url) => { calls.push(url); return Response.json({ ok: true }); } };
  await loadIndexes(dir, opts);
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), ...opts });
  await dl.run([{ rel: 'a.json', urls: [RAW], kind: 'json' }]);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((url) => url.startsWith('https://raw.githubusercontent.com/')));
});

test('one circuit spans indexes, assets and fonts and stops after three failed proxy attempts', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const log = [];
  const mirrorPolicy = new MirrorPolicy({ source: 'mirror', log: (msg) => log.push(msg) });
  const opts = { source: 'mirror', mirrorPolicy, log: quiet, fetchImpl: async (url) => {
    calls.push(url);
    return url.startsWith('https://gh-proxy.com/') ? new Response('', { status: 503 }) : Response.json({ ok: true });
  } };
  await loadIndexes(dir, opts); // three consecutive proxy failures across the indexes
  assert.equal(mirrorPolicy.disabled, true);
  const dl = new Downloader({ root: join(dir, 'assets'), ledgerPath: join(dir, 'ledger.json'), concurrency: 1, ...opts });
  await dl.run([1, 2, 3].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  const fonts = new Downloader({ root: join(dir, 'fonts'), ledgerPath: join(dir, 'fonts-ledger.json'), ...opts });
  await fonts.run([{ rel: 'font.json', urls: [RAW + '/font'], kind: 'json' }]);
  assert.equal(calls.filter((url) => url.startsWith('https://gh-proxy.com/')).length, 3, 'no retries on the proxy, no later proxy requests');
  assert.equal(dl.totals.ok, 3);
  assert.equal(fonts.totals.ok, 1);
  assert.equal(log.length, 1, 'one circuit-open warning for the shared invocation');
});

test('successful and not-found proxy responses reset the failure streak, opened circuit stays off', async (t) => {
  const dir = await fixture(t);
  const statuses = [503, 503, 200, 503, 404, 503, 503, 503];
  let proxyCalls = 0;
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', concurrency: 1, log: quiet,
    fetchImpl: async (url) => {
      if (!url.startsWith('https://gh-proxy.com/')) return Response.json({ ok: true });
      const status = statuses[proxyCalls++] ?? 200;
      return status === 200 ? Response.json({ ok: true }) : new Response('', { status });
    } });
  await dl.run(Array.from({ length: 10 }, (_, i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  assert.equal(proxyCalls, 8);
  assert.equal(dl.totals.ok, 10);
});

test('invalid payloads trip the same circuit as HTTP failures', async (t) => {
  const dir = await fixture(t);
  let proxyCalls = 0;
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', concurrency: 1, log: quiet,
    fetchImpl: async (url) => {
      if (!url.startsWith('https://gh-proxy.com/')) return Response.json({ ok: true });
      proxyCalls++;
      return new Response('<html>upstream error</html>');
    } });
  await dl.run([1, 2, 3, 4].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  assert.equal(proxyCalls, 3);
  assert.equal(dl.totals.ok, 4);
});

test('slow proxy requests use a short deadline, abort, and fall back without repeated waits', async (t) => {
  const dir = await fixture(t);
  let proxyCalls = 0;
  const mirrorPolicy = new MirrorPolicy({ source: 'mirror', timeoutMs: 10, failureLimit: 2, log: quiet });
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', mirrorPolicy, concurrency: 1, log: quiet,
    fetchImpl: async (url, { signal }) => {
      if (!url.startsWith('https://gh-proxy.com/')) return Response.json({ ok: true });
      proxyCalls++;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    } });
  const keepAlive = setInterval(quiet, 1000);
  const started = Date.now();
  try { await dl.run([1, 2, 3].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' }))); }
  finally { clearInterval(keepAlive); }
  assert.equal(proxyCalls, 2);
  assert.equal(dl.totals.ok, 3);
  assert.ok(Date.now() - started < 3000, 'uses the mirror deadline, not 120 seconds times three');
});

test('opening the circuit aborts concurrent proxy work and later jobs go direct', async (t) => {
  const dir = await fixture(t);
  let proxyCalls = 0;
  let aborted = 0;
  const mirrorPolicy = new MirrorPolicy({ source: 'mirror', failureLimit: 1, log: quiet });
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), source: 'mirror', mirrorPolicy, concurrency: 3, log: quiet,
    fetchImpl: async (url, { signal }) => {
      if (!url.startsWith('https://gh-proxy.com/')) return Response.json({ ok: true });
      proxyCalls++;
      if (proxyCalls === 3) return new Response('', { status: 503 });
      return new Promise((_, reject) => signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true }));
    } });
  await dl.run([1, 2, 3, 4, 5].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  assert.equal(proxyCalls, 3);
  assert.equal(aborted, 2);
  assert.equal(dl.totals.ok, 5);
});

test('the mirror body idle deadline covers stalled response bodies for indexes and files', async (t) => {
  const dir = await fixture(t);
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"ok":'); // Headers arrive, but the body never finishes.
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  let proxyCalls = 0;
  const mirrorPolicy = new MirrorPolicy({ source: 'mirror', timeoutMs: 100, failureLimit: 2, log: quiet });
  const opts = { mirrorPolicy, log: quiet, fetchImpl: async (url, options) => {
    if (!url.startsWith('https://gh-proxy.com/')) return Response.json({ ok: true });
    proxyCalls++;
    return fetch(`http://127.0.0.1:${server.address().port}`, options);
  } };
  const started = Date.now();
  assert.deepEqual(await cachedJson({ cacheFile: join(dir, 'index.json'), url: RAW, ...opts }), { ok: true });
  const dl = new Downloader({ root: dir, ledgerPath: join(dir, 'ledger.json'), concurrency: 1, ...opts });
  await dl.run([1, 2].map((i) => ({ rel: `${i}.json`, urls: [RAW + i], kind: 'json' })));
  assert.equal(proxyCalls, 2);
  assert.equal(dl.totals.ok, 2);
  assert.ok(Date.now() - started < 4000, 'stalled body reads time out instead of waiting indefinitely');
});

test('mirror header timeout does not cap a steadily streaming index or asset body', async (t) => {
  const dir = await fixture(t);
  const payload = Buffer.from('{"streamed":true}');
  const delayedResponse = () => {
    let offset = 0;
    let timer;
    return new Response(new ReadableStream({
      start(controller) {
        timer = setInterval(() => {
          if (offset >= payload.length) {
            clearInterval(timer);
            controller.close();
            return;
          }
          controller.enqueue(payload.subarray(offset, ++offset));
        }, 20);
      },
      cancel() { clearInterval(timer); },
    }), { headers: { 'content-type': 'application/json', 'content-length': String(payload.length) } });
  };
  const mirrorPolicy = new MirrorPolicy({ source: 'mirror', timeoutMs: 100, log: quiet });
  const opts = { mirrorPolicy, log: quiet, fetchImpl: async (url) => url.startsWith('https://gh-proxy.com/') ? delayedResponse() : Response.json({ direct: true }) };
  const started = Date.now();
  assert.deepEqual(await cachedJson({ cacheFile: join(dir, 'index.json'), url: RAW, ...opts }), { streamed: true });
  const dl = new Downloader({ root: join(dir, 'assets'), ledgerPath: join(dir, 'ledger.json'), ...opts });
  const result = await dl.run([{ rel: 'slow.json', urls: [RAW], kind: 'json' }]);
  assert.equal(result.get('slow.json').status, 'ok');
  assert.ok(Date.now() - started > 100, 'the body takes longer than the header deadline while making progress');
});

test('CLI source defaults to direct and retains the 0.1.1 shrink/local-spine flags', async () => {
  const { parseArgs } = await import('../tools/fetch-assets.mjs');
  const old = process.env.SP_ASSET_SOURCE;
  try {
    delete process.env.SP_ASSET_SOURCE;
    assert.equal(parseArgs([]).source, 'direct');
    process.env.SP_ASSET_SOURCE = 'mirror';
    assert.equal(parseArgs([]).source, 'mirror');
    assert.equal(parseArgs([]).voiceLang, 'cn');
    assert.equal(parseArgs([]).voiceAll, false);
    const opts = parseArgs(['--asset-source=direct', '--allow-shrink', '--local-spines', '--voice-lang=jp', '--voice-all']);
    assert.equal(opts.source, 'direct');
    assert.equal(opts.allowShrink, true);
    assert.equal(opts.localSpines, true);
    assert.equal(opts.voiceLang, 'jp');
    assert.equal(opts.voiceAll, true);
  } finally {
    if (old === undefined) delete process.env.SP_ASSET_SOURCE;
    else process.env.SP_ASSET_SOURCE = old;
  }
});

test('SP_GITHUB_PROXY is parsed only for online mirror mode', async () => {
  const { resolveProxyPrefix } = await import('../tools/fetch-assets.mjs');
  assert.equal(resolveProxyPrefix('direct', false, 'not-an-https-url'), '');
  assert.equal(resolveProxyPrefix('mirror', true, 'not-an-https-url'), '');
  assert.equal(resolveProxyPrefix('mirror', false, ''), '');
  assert.throws(() => resolveProxyPrefix('mirror', false, 'not-an-https-url'), /Invalid URL/);
});

test('setup and asset CLI document and validate source options before doing work', () => {
  for (const script of ['tools/setup.mjs', 'tools/fetch-assets.mjs']) {
    const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--asset-source/);
    assert.match(help.stdout, /SP_GITHUB_PROXY/);
    const invalid = spawnSync(process.execPath, [script, '--asset-source=invalid'], { encoding: 'utf8' });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /unknown asset source/);
  }
});
