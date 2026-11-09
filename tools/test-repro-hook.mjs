// tools/test-repro-hook.mjs — (fork) the parts of tools/test-repro.mjs that run inside other processes.
//
//   * the default export: a `node --test` reporter that writes one JSON line per test (its full path of names, pass /
//     fail / skip, the first line of its error), so the repro tool needs no TAP parsing;
//   * SP_REPRO_MODE=list (`node --import <this> <file>`): node:test's describe / test are swapped for recorders before the
//     file loads, so the file's tests are listed in file order and nothing runs (no hook, no server, no Chrome);
//   * SP_REPRO_MODE=run (through NODE_OPTIONS, active only in the test file's own process): puppeteer-core's launch gets
//     the GPU flags of tools/perfbench.mjs gpuArgs() the file did not set itself (none with SP_REPRO_GPU=0), every page gets the CPU throttle
//     (SP_REPRO_CPU) and a console log, and the target test's pages are screenshotted before they close; the shots are
//     kept only when the target failed. Everything goes into SP_REPRO_DIR (hook.jsonl, console.txt, shot-N.png).

import fs from 'node:fs';
import path from 'node:path';

const env = process.env;

// ---- reporter ---------------------------------------------------------------------------------------------------------

/** First line of a test failure's own error (node wraps it in ERR_TEST_FAILURE with the error as `cause`). */
export function errorLine(err) {
  const e = err?.cause ?? err;
  const msg = String(e?.message ?? e ?? '').split('\n').find((l) => l.trim()) ?? '';
  return msg.trim().slice(0, 200);
}

export default async function* reproReporter(source) {
  const names = [];
  for await (const ev of source) {
    const d = ev.data;
    if (ev.type === 'test:start') { names.length = d.nesting; names.push(d.name); continue; }
    if (ev.type !== 'test:pass' && ev.type !== 'test:fail') continue;
    if (d.details?.type === 'suite') continue;
    const rec = { path: [...names.slice(0, d.nesting), d.name], ok: ev.type === 'test:pass', skip: !!(d.skip || d.todo) };
    if (!rec.ok) rec.error = errorLine(d.details?.error);
    if (d.details?.duration_ms != null) rec.ms = Math.round(d.details.duration_ms);
    yield `${JSON.stringify(rec)}\n`;
  }
}

// ---- list mode --------------------------------------------------------------------------------------------------------

if (env.SP_REPRO_MODE === 'list' && env.SP_REPRO_LIST_OUT) {
  const { createRequire, syncBuiltinESMExports } = await import('node:module');
  const t = createRequire(import.meta.url)('node:test');
  const stack = [];
  const out = [];
  const skipOf = (o) => !!(o && typeof o === 'object' && (o.skip || o.todo));
  const norm = (a) => {
    let [name, opts, fn] = a;
    if (typeof name === 'function') { fn = name; name = fn.name; opts = {}; } else if (typeof opts === 'function') { fn = opts; opts = {}; }
    if (typeof name === 'object' && name) { opts = name; name = ''; }
    return { name: String(name ?? ''), opts: opts || {}, fn };
  };
  const suiteOf = (forced) => (...a) => {
    const { name, opts, fn } = norm(a);
    stack.push({ name, skip: forced || skipOf(opts) });
    try { fn?.({}); } catch { /* a suite body that needs a running test: its tests stay unlisted */ } finally { stack.pop(); }
  };
  const leafOf = (forced) => (...a) => {
    const { name, opts } = norm(a);
    out.push({ path: [...stack.map((s) => s.name), name], skip: forced || skipOf(opts) || stack.some((s) => s.skip) });
  };
  const withVariants = (make) => Object.assign(make(false), { skip: make(true), todo: make(true), only: make(false) });
  const suite = withVariants(suiteOf);
  const leaf = withVariants(leafOf);
  const noop = () => {};
  Object.assign(t, { describe: suite, suite, test: leaf, it: leaf, before: noop, after: noop, beforeEach: noop, afterEach: noop });
  t.test.describe = suite;
  syncBuiltinESMExports();
  process.on('exit', () => fs.writeFileSync(env.SP_REPRO_LIST_OUT, JSON.stringify(out)));
}

// ---- run mode ---------------------------------------------------------------------------------------------------------

const isTargetProcess = () => env.SP_REPRO_MODE === 'run' && !!env.NODE_TEST_CONTEXT && !!env.SP_REPRO_FILE && !!process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === path.resolve(env.SP_REPRO_FILE).toLowerCase();

if (isTargetProcess()) {
  const DIR = env.SP_REPRO_DIR;
  const TARGET = env.SP_REPRO_TARGET;
  const CPU = Number(env.SP_REPRO_CPU) || 1;
  fs.mkdirSync(DIR, { recursive: true });
  const log = (o) => fs.appendFileSync(path.join(DIR, 'hook.jsonl'), `${JSON.stringify(o)}\n`);
  const running = [];
  const inTarget = () => running.includes(TARGET);
  const tag = () => `[${running.at(-1) ?? '-'}]`;
  const say = (line) => fs.appendFileSync(path.join(DIR, 'console.txt'), `${tag()} ${line}\n`);
  let shots = [];
  const open = new Set();
  const ready = new WeakMap();

  const shoot = async (page) => {
    if (shots.length >= 6 || page.isClosed() || page.url() === 'about:blank') return;
    const file = path.join(DIR, `shot-${shots.length + 1}.png`);
    shots.push(file);
    await Promise.race([page.screenshot({ path: file }), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
  };

  const setup = (page) => {
    if (!ready.has(page)) {
      ready.set(page, (async () => {
        open.add(page);
        page.once('close', () => open.delete(page));
        page.on('console', (m) => say(`${m.type()}: ${m.text()}`));
        page.on('pageerror', (e) => say(`pageerror: ${e?.message ?? e}`));
        const close = page.close.bind(page);
        page.close = async (...a) => { if (inTarget()) await shoot(page); return close(...a); };
        let throttled = false;
        if (CPU > 1) throttled = await page.emulateCPUThrottling(CPU).then(() => true, (e) => { log({ throttleError: String(e?.message ?? e) }); return false; });
        log({ page: true, throttled });
      })());
    }
    return ready.get(page);
  };

  const { gpuFlagsToAdd } = await import('./test-repro.mjs');
  const { gpuArgs } = await import('./perfbench.mjs');
  const puppeteer = (await import('puppeteer-core')).default;
  const launch = puppeteer.launch.bind(puppeteer);
  puppeteer.launch = async (opts = {}) => {
    const own = Array.isArray(opts.args) ? opts.args : [];
    const added = env.SP_REPRO_GPU === '0' ? [] : gpuFlagsToAdd(own, gpuArgs());
    const browser = await launch({ ...opts, args: [...own, ...added] });
    log({ launch: true, added });
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...a) => { const p = await newPage(...a); await setup(p); return p; };
    browser.on('targetcreated', async (t) => { if (t.type() === 'page') { const p = await t.page().catch(() => null); if (p) await setup(p); } });
    for (const p of await browser.pages()) await setup(p);
    return browser;
  };

  const { beforeEach, afterEach } = await import('node:test');
  beforeEach((t) => { running.push(t.fullName); if (t.fullName === TARGET) shots = []; });
  afterEach(async (t) => {
    if (t.fullName === TARGET) {
      for (const p of [...open]) await shoot(p);
      if (t.passed) for (const f of shots) fs.rmSync(f, { force: true });
      else log({ shots: shots.filter((f) => fs.existsSync(f)) });
    }
    running.pop();
  });
}
