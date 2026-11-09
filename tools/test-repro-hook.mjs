// tools/test-repro-hook.mjs — (fork) the parts of tools/test-repro.mjs and tools/browser-suite.mjs that run inside
// other processes.
//
//   * the default export: a `node --test` reporter that writes one JSON line per test (its full path of names, pass /
//     fail / skip, the first line of its error, its failure type), so the tools need no TAP parsing;
//   * SP_REPRO_MODE=list (`node --import <this> <file>`): node:test's describe / test are swapped for recorders before the
//     file loads, so the file's tests are listed in file order with the line of their test() call, and nothing runs;
//   * SP_REPRO_MODE=run (through NODE_OPTIONS), active only in a test file's own process (SP_REPRO_FILE names it, or
//     SP_REPRO_SUITE=1 for every browser test file of a suite run; never in a server process a test starts):
//       - timing.jsonl: each test's start and end (ms since the file's process started) and outcome;
//       - puppeteer-core's launch gets the GPU flags of tools/perfbench.mjs gpuArgs() the file did not set itself (none
//         with SP_REPRO_GPU=0), every page the CPU throttle (SP_REPRO_CPU) and a console log tagged with the running test
//         (console.txt); a failed test's pages are screenshotted before they close (shot-*.png, hook.jsonl says whose);
//       - SP_REPRO_BUDGET (a JSON file { "<full test name>": ms }, or { "<test file>": { ... } } in a suite run): test() /
//         it() get that timeout (or their own, when shorter) before the file declares them;
//       - SP_REPRO_COVERAGE=1: per test (and for the file's setup outside tests), the lines of every repository file it
//         ran: the test process by block (node:inspector: the test file, its helpers, an in-process server), the pages'
//         scripts by function and their style sheets by matched rule (CDP), written to coverage.json at exit.
//     Everything goes into SP_REPRO_DIR (per file under it in a suite run).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const env = process.env;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
    if (!rec.ok) { rec.error = errorLine(d.details?.error); rec.failureType = d.details?.error?.failureType ?? null; }
    if (d.details?.duration_ms != null) rec.ms = Math.round(d.details.duration_ms);
    yield `${JSON.stringify(rec)}\n`;
  }
}

// ---- pure helpers (exported for the tests) ----------------------------------------------------------------------------

/** git's blob id of a text (line endings normalised to LF, as the repository stores them). */
export function blobSha(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  return crypto.createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0`).update(t).digest('hex');
}

/**
 * The lines a V8 coverage of one script ran: its ranges painted outer to inner (a block that did not run inside a
 * function that did is 0), then each line by the majority of its code characters (blanks and a trailing // comment do not
 * count), so `else await sleep(…)` is not "run" because the `else` keyword belongs to the branch that ran.
 * @param {string} text @param {{ startOffset: number, endOffset: number, count: number }[]} ranges
 * @returns {{ used: number[], known: number[] }} known: lines inside any reported range
 */
export function paintLines(text, ranges) {
  const n = text.length;
  const paint = new Uint8Array(n).fill(2);
  for (const r of [...ranges].sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset)) {
    paint.fill(r.count > 0 ? 1 : 0, Math.max(0, r.startOffset), Math.min(n, r.endOffset));
  }
  const used = [];
  const known = [];
  let line = 1;
  let start = 0;
  for (let i = 0; i <= n; i++) {
    if (i < n && text[i] !== '\n') continue;
    const code = text.slice(start, i).replace(/\/\/.*$/, '');
    let one = 0;
    let zero = 0;
    let painted = false;
    for (let j = 0; j < code.length; j++) {
      const v = paint[start + j];
      if (v !== 2) painted = true;
      if (/\s/.test(code[j])) continue;
      if (v === 1) one++; else if (v === 0) zero++;
    }
    if (painted) known.push(line);
    if (one > 0 && one >= zero) used.push(line);
    line++;
    start = i + 1;
  }
  return { used, known };
}

/**
 * The repository file a page loaded from the test server: the URL's path without its query, without a generation prefix
 * (/g/<gen>/), under public/, at the root (/shared/) or under server/ (/sim/, /match/: server/http/static.js). null when
 * none exists (/data.js: a generated stand-in).
 * @param {string} url @param {(rel: string) => boolean} exists
 */
export function repoPathOfUrl(url, exists) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const p = decodeURIComponent(u.pathname).replace(/^\/g\/[^/]+\//, '/').replace(/^\/+/, '');
  if (!p) return null;
  for (const rel of [`public/${p}`, p, `server/${p}`]) if (exists(rel)) return rel;
  return null;
}

// ---- list mode --------------------------------------------------------------------------------------------------------

const normArgs = (a) => {
  let [name, opts, fn] = a;
  if (typeof name === 'function') { fn = name; name = fn.name; opts = {}; } else if (typeof opts === 'function') { fn = opts; opts = {}; }
  if (typeof name === 'object' && name) { opts = name; name = ''; }
  return { name: String(name ?? ''), opts: opts || {}, fn };
};

/** The line of the test file a test() / describe() call is on, from the caller's stack. */
const callLine = (file) => {
  const want = path.resolve(file).toLowerCase();
  for (const l of String(new Error().stack).split('\n').slice(2)) {
    const m = /\((.*):(\d+):\d+\)$/.exec(l) || /at (.*):(\d+):\d+$/.exec(l);
    if (!m) continue;
    let f = m[1];
    if (f.startsWith('file:')) { try { f = fileURLToPath(f); } catch { continue; } }
    if (path.resolve(f).toLowerCase() === want) return Number(m[2]);
  }
  return null;
};

if (env.SP_REPRO_MODE === 'list' && env.SP_REPRO_LIST_OUT) {
  const { createRequire, syncBuiltinESMExports } = await import('node:module');
  const t = createRequire(import.meta.url)('node:test');
  const file = process.argv[1];
  const stack = [];
  const out = [];
  const skipOf = (o) => !!(o && typeof o === 'object' && (o.skip || o.todo));
  const suiteOf = (forced) => (...a) => {
    const { name, opts, fn } = normArgs(a);
    stack.push({ name, skip: forced || skipOf(opts) });
    try { fn?.({}); } catch { /* a suite body that needs a running test: its tests stay unlisted */ } finally { stack.pop(); }
  };
  const leafOf = (forced) => (...a) => {
    const { name, opts } = normArgs(a);
    out.push({ path: [...stack.map((s) => s.name), name], skip: forced || skipOf(opts) || stack.some((s) => s.skip), line: callLine(file) });
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

const TEST_FILE = /(\.test\.js|\.e2e\.mjs)$/;
const relOf = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

function runDir() {
  if (env.SP_REPRO_MODE !== 'run' || !env.NODE_TEST_CONTEXT || !process.argv[1] || !env.SP_REPRO_DIR) return null;
  const me = path.resolve(process.argv[1]);
  if (env.SP_REPRO_FILE) return me.toLowerCase() === path.resolve(env.SP_REPRO_FILE).toLowerCase() ? env.SP_REPRO_DIR : null;
  if (env.SP_REPRO_SUITE === '1' && TEST_FILE.test(me)) return path.join(env.SP_REPRO_DIR, relOf(me).replace(/[\\/]/g, '__'));
  return null;
}

const DIR = runDir();
if (DIR) {
  const ME = path.resolve(process.argv[1]);
  const CPU = Number(env.SP_REPRO_CPU) || 1;
  const COVER = env.SP_REPRO_COVERAGE === '1';
  fs.mkdirSync(DIR, { recursive: true });
  const log = (o) => fs.appendFileSync(path.join(DIR, 'hook.jsonl'), `${JSON.stringify(o)}\n`);
  const SETUP = '(setup)';
  let current = null; // { name, ctx, start } of the running test
  const bucket = () => current?.name ?? SETUP;
  const say = (line) => fs.appendFileSync(path.join(DIR, 'console.txt'), `[${bucket()}] ${line}\n`);

  // -- budget: each test's timeout, set before the file declares its tests
  if (env.SP_REPRO_BUDGET) {
    const all = JSON.parse(fs.readFileSync(env.SP_REPRO_BUDGET, 'utf8'));
    // a suite run's budget file holds every file's tests under the file's path
    const mine = all[relOf(ME)];
    const budget = mine && typeof mine === 'object' ? mine : env.SP_REPRO_SUITE === '1' ? {} : all;
    const { createRequire, syncBuiltinESMExports } = await import('node:module');
    const t = createRequire(import.meta.url)('node:test');
    const names = [];
    const wrapSuite = (real) => Object.assign(function suite(...a) {
      const { name, opts, fn } = normArgs(a);
      const body = typeof fn === 'function' ? function (...x) { names.push(name); try { return fn.apply(this, x); } finally { names.pop(); } } : fn;
      return real.call(this, name, opts, body);
    }, { skip: real.skip, todo: real.todo, only: real.only });
    const wrapTest = (real) => Object.assign(function test(...a) {
      const { name, opts, fn } = normArgs(a);
      const full = [...names, name].join(' > ');
      let o = opts;
      if (Number.isFinite(budget[full])) {
        o = { ...opts, timeout: Math.min(Number.isFinite(opts.timeout) ? opts.timeout : Infinity, budget[full]) };
        log({ budget: full, ms: o.timeout, own: Number.isFinite(opts.timeout) ? opts.timeout : null });
      }
      return real.call(this, name, o, fn);
    }, { skip: real.skip, todo: real.todo, only: real.only });
    Object.assign(t, { test: wrapTest(t.test), it: wrapTest(t.it), describe: wrapSuite(t.describe), suite: wrapSuite(t.suite) });
    syncBuiltinESMExports();
  }

  // -- coverage: per bucket, per repository file, the lines it ran; style sheets / scripts its pages loaded
  /** @type {Map<string, { used: Map<string, Set<number>>, loaded: Set<string> }>} */
  const cov = new Map();
  const known = new Map(); // repository file → Set of lines inside a reported range
  const fileInfo = new Map(); // repository file → { sha, status }
  const unmapped = new Set();
  const textCache = new Map();
  const readRel = (rel) => {
    if (!textCache.has(rel)) { let t = null; try { t = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { /* gone */ } textCache.set(rel, t); }
    return textCache.get(rel);
  };
  const into = (b) => { if (!cov.has(b)) cov.set(b, { used: new Map(), loaded: new Set() }); return cov.get(b); };
  const addLines = (b, rel, lines) => {
    const c = into(b);
    if (!c.used.has(rel)) c.used.set(rel, new Set());
    const s = c.used.get(rel);
    for (const n of lines) s.add(n);
  };
  const noteFile = (rel, status) => {
    if (!fileInfo.has(rel)) fileInfo.set(rel, { sha: blobSha(readRel(rel) ?? ''), status });
    else if (status === 'differs') fileInfo.get(rel).status = 'differs';
  };
  /** One script's coverage (V8 functions) into the bucket, if it maps to a repository file with the same text. */
  const addScript = (b, rel, functions) => {
    const text = readRel(rel);
    if (text == null) return;
    const ranges = functions.flatMap((f) => f.ranges);
    const top = Math.max(0, ...ranges.map((r) => r.endOffset));
    into(b).loaded.add(rel);
    if (top > text.length) { noteFile(rel, 'differs'); return; }
    noteFile(rel, 'ok');
    const { used, known: k } = paintLines(text, ranges);
    addLines(b, rel, used);
    if (!known.has(rel)) known.set(rel, new Set());
    for (const n of k) known.get(rel).add(n);
  };
  const exists = (rel) => readRel(rel) != null;

  let nodeSession = null;
  const nodePost = (m, p) => new Promise((res, rej) => nodeSession.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));
  if (COVER) {
    const inspector = await import('node:inspector');
    nodeSession = new inspector.Session();
    nodeSession.connect();
    await nodePost('Profiler.enable');
    await nodePost('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  }
  const rootLow = ROOT.toLowerCase() + path.sep;
  const takeNode = async (b) => {
    if (!nodeSession) return;
    const { result } = await nodePost('Profiler.takePreciseCoverage');
    for (const s of result) {
      if (!s.url.startsWith('file:')) continue;
      let abs;
      try { abs = fileURLToPath(s.url); } catch { continue; }
      if (!abs.toLowerCase().startsWith(rootLow) || /[\\/]node_modules[\\/]/.test(abs)) continue;
      addScript(b, relOf(abs), s.functions);
    }
  };

  /** Per page: its CDP session (and its workers'), its style sheets, the rules it matched so far. */
  const pages = new Map();
  const startPageCoverage = async (page) => {
    const s = await page.createCDPSession();
    const st = { s, workers: [], sheets: new Map(), rules: new Set() };
    pages.set(page, st);
    s.on('CSS.styleSheetAdded', ({ header }) => st.sheets.set(header.styleSheetId, header));
    await s.send('Profiler.enable');
    await s.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
    await s.send('DOM.enable');
    await s.send('CSS.enable');
    await s.send('CSS.startRuleUsageTracking');
    page.on('workercreated', async (w) => {
      try { await w.client.send('Profiler.enable'); await w.client.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false }); st.workers.push(w.client); } catch { /* a worker gone at once */ }
    });
  };
  const takeScripts = async (client, b) => {
    const { result } = await client.send('Profiler.takePreciseCoverage');
    for (const sc of result) {
      if (!/^https?:/.test(sc.url)) continue;
      const rel = repoPathOfUrl(sc.url, exists);
      if (!rel) { unmapped.add(sc.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')); continue; }
      addScript(b, rel, sc.functions);
    }
  };
  const takePage = async (page, b) => {
    const st = pages.get(page);
    if (!st) return;
    try {
      await takeScripts(st.s, b);
      for (const w of st.workers) await takeScripts(w, b).catch(() => {});
      const { coverage: ruleUsage = [] } = await st.s.send('CSS.takeCoverageDelta');
      for (const r of ruleUsage) if (r.used) st.rules.add(`${r.styleSheetId}\u0000${r.startOffset}\u0000${r.endOffset}`);
      // every rule the page matched so far counts for this bucket: a rule still applied was "used" by this test too
      for (const key of st.rules) {
        const [id, a, z] = key.split('\u0000');
        const h = st.sheets.get(id);
        const rel = h?.sourceURL ? repoPathOfUrl(h.sourceURL, exists) : null;
        if (!rel) continue;
        const text = readRel(rel);
        if (text == null) continue;
        if (Number.isFinite(h.length) && h.length !== text.length) { noteFile(rel, 'differs'); continue; }
        noteFile(rel, 'ok');
        const first = text.slice(0, Number(a)).split('\n').length;
        const last = text.slice(0, Number(z)).split('\n').length;
        addLines(b, rel, Array.from({ length: last - first + 1 }, (_, i) => first + i));
      }
      for (const h of st.sheets.values()) { const rel = h.sourceURL ? repoPathOfUrl(h.sourceURL, exists) : null; if (rel) into(b).loaded.add(rel); }
    } catch (e) { if (!page.isClosed()) log({ coverageError: String(e?.message ?? e) }); }
  };
  const takeAll = async (b) => {
    if (!COVER) return;
    await takeNode(b).catch(() => {});
    for (const p of pages.keys()) if (!p.isClosed()) await takePage(p, b);
  };

  // -- pages: console, throttle, coverage, a failed test's screenshot
  let shotN = 0;
  const open = new Set();
  const ready = new WeakMap();
  const failed = () => !!current?.ctx?.error;
  const shoot = async (page) => {
    if (shotN >= 12 || page.isClosed() || page.url() === 'about:blank') return;
    const file = path.join(DIR, `shot-${++shotN}.png`);
    await Promise.race([page.screenshot({ path: file }), new Promise((r) => setTimeout(r, 8000))]).catch(() => {});
    if (fs.existsSync(file)) log({ shot: file, test: bucket() });
  };
  const setup = (page) => {
    if (!ready.has(page)) {
      ready.set(page, (async () => {
        open.add(page);
        page.once('close', () => open.delete(page));
        page.on('console', (m) => say(`${m.type()}: ${m.text()}`));
        page.on('pageerror', (e) => say(`pageerror: ${e?.message ?? e}`));
        const close = page.close.bind(page);
        page.close = async (...a) => {
          if (failed()) await shoot(page);
          if (COVER) await takePage(page, bucket());
          pages.delete(page);
          return close(...a);
        };
        let throttled = false;
        if (CPU > 1) throttled = await page.emulateCPUThrottling(CPU).then(() => true, (e) => { log({ throttleError: String(e?.message ?? e) }); return false; });
        if (COVER) await startPageCoverage(page).catch((e) => log({ coverageError: String(e?.message ?? e) }));
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
    const close = browser.close.bind(browser);
    browser.close = async (...a) => { for (const p of open) if (COVER && !p.isClosed()) await takePage(p, bucket()); return close(...a); };
    return browser;
  };

  // -- the test boundaries (root hooks: they wrap the file's own beforeEach / afterEach)
  const { beforeEach, afterEach } = await import('node:test');
  const { performance } = await import('node:perf_hooks');
  const timing = (o) => fs.appendFileSync(path.join(DIR, 'timing.jsonl'), `${JSON.stringify(o)}\n`);
  timing({ file: relOf(ME), started: Date.now() - Math.round(performance.now()) });
  beforeEach(async (t) => {
    if (current) return; // a subtest of the running test
    const start = Math.round(performance.now());
    await takeAll(SETUP); // what ran since the last test (hooks, loading) is the file's setup
    current = { name: t.fullName, ctx: t, start };
  });
  afterEach(async (t) => {
    if (current?.name !== t.fullName) return; // a subtest
    if (t.error) for (const p of [...open]) await shoot(p);
    await takeAll(t.fullName);
    timing({ test: t.fullName, start: current.start, end: Math.round(performance.now()), ok: !t.error, failureType: t.error?.failureType ?? null });
    current = null;
  });

  process.on('exit', () => {
    if (!COVER) return;
    const iv = (set) => {
      const s = [...set].sort((a, b) => a - b);
      const out = [];
      for (const n of s) { const l = out.at(-1); if (l && n <= l[1] + 1) l[1] = n; else out.push([n, n]); }
      return out;
    };
    const dump = (c) => ({ used: Object.fromEntries([...c.used].map(([f, s]) => [f, iv(s)])), loaded: [...c.loaded].sort() });
    const tests = {};
    for (const [b, c] of cov) if (b !== SETUP) tests[b] = dump(c);
    fs.writeFileSync(path.join(DIR, 'coverage.json'), JSON.stringify({
      file: relOf(ME), at: new Date().toISOString(), tests, setup: cov.has(SETUP) ? dump(cov.get(SETUP)) : { used: {}, loaded: [] },
      files: Object.fromEntries([...fileInfo].map(([f, i]) => [f, { ...i, known: iv(known.get(f) ?? []) }])), unmapped: [...unmapped].sort(),
    }));
  });
}
