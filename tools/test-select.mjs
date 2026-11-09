// tools/test-select.mjs — (fork) which tests a change can affect, for tools/test-repro.mjs --changed. Pure functions:
// no git, no Chrome, no disk (the caller hands in the diff, the sources and the coverage map).
//
// The inputs:
//   * the diff (`git diff -U0`): per file, its hunks (old start / count, new start / count);
//   * the coverage map the repro hook records (tools/test-repro-hook.mjs): per browser test file, per test, the lines of
//     every repository file it ran — the test process's own code (the test file, its helpers, an in-process server) by
//     block, the pages' scripts by function, the pages' style sheets by matched rule — plus what ran outside any test
//     (the file's setup: module loading, before / after hooks);
//   * the test list of a test file (its tests in file order, with the line of each test() call).
//
// The rules (every choice comes back with its reason; nothing is dropped without one):
//   * a test file's own lines inside a test() call → that test (also a test added by the change, which never ran);
//   * any other changed line of a JS file → the tests that ran the old version of that line (an inserted line: the
//     lines around the insertion). A line that ran only during the file's setup (a declaration evaluated at load) → the
//     tests that ran a line using the declared name; a before / after hook or other setup → the whole file;
//   * a changed CSS line inside a rule → the tests whose pages matched that rule; outside a rule (an at-rule, keyframes,
//     a new rule) → the tests whose pages loaded the sheet;
//   * no coverage of a test file yet, or recorded at another version of the changed file, or the file runs code the
//     map cannot see (a separate server process, scripts that do not map to repository files) → the whole file;
//   * a changed file nothing maps (tools, data, package files) → every test file (the caller says so and runs nothing).

import * as acorn from 'acorn';

// ---- diff -------------------------------------------------------------------------------------------------------------

/**
 * Files and hunks of a `git diff -U0 --no-renames` text.
 * @param {string} text
 * @returns {{ file: string, oldFile: string|null, newFile: string|null, hunks: { oldStart: number, oldCount: number, newStart: number, newCount: number }[] }[]}
 */
export function parseDiff(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) { cur = { file: '', oldFile: null, newFile: null, hunks: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if (line.startsWith('--- ')) cur.oldFile = line === '--- /dev/null' ? null : line.slice(4).replace(/^a\//, '').trim();
    else if (line.startsWith('+++ ')) { cur.newFile = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, '').trim(); cur.file = cur.newFile ?? cur.oldFile; }
    else {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (m) cur.hunks.push({ oldStart: +m[1], oldCount: m[2] == null ? 1 : +m[2], newStart: +m[3], newCount: m[4] == null ? 1 : +m[4] });
    }
  }
  for (const f of out) if (!f.file) f.file = f.oldFile ?? f.newFile ?? '';
  return out.filter((f) => f.file);
}

/** The old version's lines a hunk changed; for a pure insertion the two old lines around it. */
export function oldLinesOf(h) {
  if (h.oldCount > 0) return Array.from({ length: h.oldCount }, (_, i) => h.oldStart + i);
  return [h.oldStart, h.oldStart + 1].filter((n) => n >= 1);
}

/** The new version's lines a hunk wrote; for a pure deletion the two new lines around where the old lines were. */
export function newLinesOf(h) {
  if (h.newCount > 0) return Array.from({ length: h.newCount }, (_, i) => h.newStart + i);
  return [h.newStart, h.newStart + 1].filter((n) => n >= 1);
}

/** The old line of an unchanged new line (null when the new line is part of a hunk). */
export function newToOld(hunks, line) {
  let shift = 0;
  for (const h of [...hunks].sort((a, b) => a.newStart - b.newStart)) {
    // git numbers a pure insertion / deletion by the line before it
    const newEnd = h.newCount > 0 ? h.newStart + h.newCount - 1 : h.newStart;
    const oldEnd = h.oldCount > 0 ? h.oldStart + h.oldCount - 1 : h.oldStart;
    if (h.newCount > 0 && line >= h.newStart && line <= newEnd) return null;
    if (line > newEnd) shift = oldEnd - newEnd;
  }
  return line + shift;
}

// ---- line intervals ---------------------------------------------------------------------------------------------------

/** Sorted, merged [from, to] line intervals of a list of line numbers. */
export function toIntervals(lines) {
  const s = [...new Set(lines)].filter(Number.isInteger).sort((a, b) => a - b);
  const out = [];
  for (const n of s) {
    const last = out.at(-1);
    if (last && n <= last[1] + 1) last[1] = n; else out.push([n, n]);
  }
  return out;
}

/** Whether any of `lines` falls in the intervals. */
export function hitsAny(intervals, lines) {
  if (!intervals?.length) return false;
  return lines.some((n) => intervals.some(([a, b]) => n >= a && n <= b));
}

// ---- JS outline -------------------------------------------------------------------------------------------------------

const TEST_FNS = new Set(['test', 'it']);
const HOOK_FNS = new Set(['before', 'after', 'beforeEach', 'afterEach']);

const calleeName = (c) => (c?.type === 'Identifier' ? c.name : c?.type === 'MemberExpression' && c.object?.type === 'Identifier' ? c.object.name : null);

function walk(node, visit, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parents.at(-1) ?? null, parents) === false) return;
  parents.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, visit, parents); } else if (v && typeof v.type === 'string') walk(v, visit, parents);
  }
  parents.pop();
}

const SUITE_FNS = new Set(['describe', 'suite']);
const isFn = (n) => /Function/.test(n?.type ?? '');
/** Whether a declaration is shared (module level, or in a describe() body), not a local of some function. */
const shared = (parents) => parents.every((p, i) => !isFn(p) || (parents[i - 1]?.type === 'CallExpression' && SUITE_FNS.has(calleeName(parents[i - 1].callee))));

/**
 * The parts of a JS file the selection needs: its test() / it() calls, its before / after hooks, its shared named
 * declarations (module level or in a describe() body: helpers and constants, never a function's locals), and every
 * identifier use (name, line).
 * @param {string} source
 * @returns {{ tests: { start: number, end: number }[], hooks: { start: number, end: number }[], decls: { name: string, start: number, end: number }[], refs: { name: string, line: number }[] } | null} null when it does not parse
 */
export function jsOutline(source) {
  let ast;
  try { ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true }); } catch { return null; }
  const tests = [];
  const hooks = [];
  const decls = [];
  const refs = [];
  const span = (n) => ({ start: n.loc.start.line, end: n.loc.end.line });
  walk(ast, (n, parent, parents) => {
    if (n.type === 'CallExpression') {
      const name = calleeName(n.callee);
      if (TEST_FNS.has(name)) tests.push(span(n));
      else if (HOOK_FNS.has(name)) hooks.push(span(n));
    }
    if (n.type === 'FunctionDeclaration' && n.id && shared(parents)) decls.push({ name: n.id.name, ...span(n) });
    else if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && shared(parents)) decls.push({ name: n.id.name, ...span(n) });
    if (n.type === 'Identifier') {
      const declaring = (parent?.type === 'VariableDeclarator' && parent.id === n) || (isFn(parent) && parent.id === n)
        || (parent?.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) || (parent?.type === 'MemberExpression' && parent.property === n && !parent.computed);
      if (!declaring) refs.push({ name: n.name, line: n.loc.start.line });
    }
    return true;
  });
  // a declaration inside a test's own body belongs to that test
  const inTest = (line) => tests.some((t) => line >= t.start && line <= t.end);
  return { tests, hooks, decls: decls.filter((d) => !inTest(d.start)), refs };
}

/** The innermost span of a list containing a line. */
const innermost = (list, line) => list.filter((x) => line >= x.start && line <= x.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? null;

// ---- CSS rules --------------------------------------------------------------------------------------------------------

/**
 * Line spans of a style sheet's style rules (selector to closing brace, inside @media / @supports too); @keyframes,
 * @font-face and other at-rule bodies are 'other' (rule usage does not cover them).
 * @param {string} text
 * @returns {{ start: number, end: number, kind: 'style'|'other' }[]}
 */
export function cssRules(text) {
  const out = [];
  const stack = [];
  let line = 1;
  let headStart = null;
  let head = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (let j = i; j < stop; j++) if (text[j] === '\n') line++;
      i = stop - 1;
      continue;
    }
    if (ch === '\n') { line++; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch;
      for (i++; i < text.length && text[i] !== q; i++) { if (text[i] === '\\') i++; else if (text[i] === '\n') line++; }
      continue;
    }
    if (ch === '{') {
      const sel = head.trim();
      const outerOther = stack.some((s) => s.kind === 'other');
      const group = /^@(media|supports|layer|container|document)\b/.test(sel);
      const kind = outerOther ? 'other' : group ? 'group' : sel.startsWith('@') ? 'other' : 'style';
      stack.push({ start: headStart ?? line, kind });
      head = ''; headStart = null;
      continue;
    }
    if (ch === '}') {
      const s = stack.pop();
      if (s && s.kind !== 'group') out.push({ start: s.start, end: line, kind: s.kind });
      head = ''; headStart = null;
      continue;
    }
    if (ch === ';' && !stack.some((s) => s.kind === 'style' || s.kind === 'other')) { head = ''; headStart = null; continue; }
    if (!/\s/.test(ch) && headStart == null) headStart = line;
    head += ch;
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---- selection --------------------------------------------------------------------------------------------------------

/**
 * @typedef {{ used: Record<string, [number, number][]>, loaded?: string[], sha?: Record<string, string> }} TestCov  per
 *   repository file: the lines a test ran (JS) or the rules its pages matched (CSS); `loaded`: style sheets / scripts its
 *   pages loaded; `sha`: the git blob id of each of those files when it was recorded
 * @typedef {{ tests: Record<string, TestCov>, setup?: TestCov, unmapped?: string[], differs?: string[],
 *   separateServer?: boolean }} FileCoverage  the coverage map of one test file (tools/test-repro.mjs mergeCoverage)
 */

const isJs = (f) => /\.(m?js|cjs)$/.test(f);
const isCss = (f) => /\.css$/.test(f);
const isTestFile = (f) => /^(test|plugins)\/.*(\.test\.js|\.e2e\.mjs)$/.test(f);
/** Files whose changes the coverage map can place: the app (browser and server), shared code and test code. */
export const MAPPED = (f) => /^(public\/(js|css|dev)\/|server\/|shared\/|test\/|plugins\/)/.test(f) && (isJs(f) || isCss(f));

/**
 * The tests of one test file a change can affect.
 * @param {{
 *   testFile: string,
 *   tests: { path: string[], line?: number|null }[],
 *   coverage: FileCoverage|null,
 *   changes: { file: string, hunks: object[], oldSha?: string|null, oldText?: string|null, newText?: string|null }[],
 * }} o
 * @returns {{ all: boolean, tests: Map<string, string[]>, reasons: string[] }} tests: full name → why
 */
export function selectInFile({ testFile, tests, coverage, changes }) {
  const picked = new Map();
  const reasons = [];
  let all = false;
  const full = (p) => p.join(' > ');
  const add = (name, why) => { if (!picked.has(name)) picked.set(name, []); if (!picked.get(name).includes(why)) picked.get(name).push(why); };
  const whole = (why) => { all = true; if (!reasons.includes(why)) reasons.push(why); };
  const allCov = coverage ? Object.entries(coverage.tests || {}) : [];

  for (const ch of changes) {
    const f = ch.file;
    const own = f === testFile;
    if (!own && !coverage) continue; // no record of what this file ran: the caller lists it as unknown
    if (!own && coverage && !MAPPED(f)) continue;
    const runsIt = own || allCov.some(([, c]) => c.used?.[f]?.length || c.loaded?.includes(f)) || !!coverage?.setup?.used?.[f]?.length || !!coverage?.setup?.loaded?.includes(f);
    // server code a separate server process ran is invisible to the map
    if (!own && coverage?.separateServer && /^(server|shared)\//.test(f)) { whole(`${f}: this file starts a separate server process, whose code has no per-test coverage`); continue; }
    if (!own && coverage?.unmapped?.length && /^(server|shared)\//.test(f)) { whole(`${f}: its pages ran scripts that map to no repository file (${coverage.unmapped.slice(0, 2).join(', ')}…), which may include it`); continue; }
    if (!runsIt) continue;
    if (coverage?.differs?.includes(f)) { whole(`${f}: the browser was served a different text than the file on disk, so its lines cannot be mapped`); continue; }
    // a test recorded at another version of the file: its lines do not match the diff's old side, so it is picked as is
    const stale = (c) => !!(ch.oldSha && c.sha?.[f] && c.sha[f] !== ch.oldSha);
    const covTests = [];
    for (const [name, c] of allCov) {
      if (stale(c)) { if (c.used?.[f]?.length || c.loaded?.includes(f)) add(name, `${f}: recorded at another version of it (${c.sha[f].slice(0, 8)}; the change starts from ${ch.oldSha.slice(0, 8)})`); } else covTests.push([name, c]);
    }
    if (coverage?.setup && stale(coverage.setup) && coverage.setup.used?.[f]?.length) { whole(`${f}: the file's setup was recorded at another version of it`); continue; }

    if (isCss(f)) {
      const rules = cssRules(ch.oldText ?? '');
      for (const h of ch.hunks) {
        const lines = oldLinesOf(h);
        const inRule = h.oldCount > 0
          ? lines.map((n) => innermost(rules, n)).filter(Boolean)
          : (() => { const a = innermost(rules, lines[0]); const b = innermost(rules, lines[1] ?? lines[0]); return a && a === b ? [a] : []; })();
        const styleOnly = inRule.length && inRule.every((r) => r.kind === 'style') && lines.every((n) => h.oldCount === 0 || innermost(rules, n));
        for (const [name, c] of covTests) {
          if (styleOnly) { if (hitsAny(c.used?.[f], lines)) add(name, `${f}: matched the changed rule (line ${lines[0]})`); } else if (c.loaded?.includes(f) || c.used?.[f]?.length) add(name, `${f}: loaded the sheet (the change at line ${lines[0]} is outside a style rule)`);
        }
      }
      continue;
    }

    if (!isJs(f)) continue;
    const outNew = own || ch.newText ? jsOutline(ch.newText ?? '') : null;
    if (own && !outNew) { whole(`${f}: does not parse`); continue; }
    for (const h of ch.hunks) {
      const newLines = newLinesOf(h);
      // a test file's own lines in test() calls: those tests, by the line of their call (a loop's tests share one call)
      if (own) {
        const inTests = newLines.map((n) => innermost(outNew.tests, n)).filter(Boolean);
        if (inTests.length === newLines.length) {
          for (const call of inTests) for (const t of tests) if (t.line != null && t.line >= call.start && t.line <= call.end) add(full(t.path), `${f}:${newLines[0]} is inside its test()`);
          continue;
        }
        if (newLines.some((n) => innermost(outNew.hooks, n))) { whole(`${f}:${newLines[0]}: a before / after hook changed (shared setup)`); continue; }
      }
      if (!coverage) {
        // a test file never recorded: by name only (the declarations the change touches, and the tests using them)
        const names = new Set(newLines.map((n) => innermost(outNew.decls, n)?.name).filter(Boolean));
        if (!names.size) { whole(`${f}:${newLines[0]}: outside any test or named helper, and no coverage recorded yet`); continue; }
        for (const t of usersOf(outNew, names)) for (const tt of tests) if (tt.line != null && tt.line >= t.start && tt.line <= t.end) add(full(tt.path), `${f}: uses ${[...names].join(', ')} (by name: no coverage recorded yet)`);
        continue;
      }
      const old = oldLinesOf(h);
      let hit = false;
      for (const [name, c] of covTests) if (hitsAny(c.used?.[f], old)) { add(name, `${f}: ran the changed line(s) ${old[0]}${old.length > 1 ? `-${old.at(-1)}` : ''}`); hit = true; }
      const inSetup = hitsAny(coverage.setup?.used?.[f], old);
      // a declaration (re)written by the change: the tests that ran a line using its name
      const declNames = outNew ? new Set(newLines.map((n) => innermost(outNew.decls, n)).filter((d) => d && newLines.includes(d.start)).map((d) => d.name)) : new Set();
      if (inSetup || declNames.size) {
        const names = declNames.size ? declNames : new Set(newLines.map((n) => innermost(outNew?.decls ?? [], n)?.name).filter(Boolean));
        if (!names.size) { whole(`${f}:${newLines[0]}: changed code that runs while the file sets up (outside any test)`); continue; }
        for (const r of (outNew?.refs ?? []).filter((x) => names.has(x.name) && !newLines.includes(x.line))) {
          if (own) for (const call of outNew.tests.filter((t) => r.line >= t.start && r.line <= t.end)) for (const tt of tests) if (tt.line != null && tt.line >= call.start && tt.line <= call.end) add(full(tt.path), `${f}: its test uses ${r.name}`);
          const o = newToOld(ch.hunks, r.line);
          if (o == null) continue;
          for (const [name, c] of covTests) if (hitsAny(c.used?.[f], [o])) add(name, `${f}: ran line ${o}, which uses ${r.name}`);
        }
        hit = true;
      }
      if (!hit && !own) reasons.push(`${f}:${old[0]}: no recorded test of this file ran the changed lines`);
      if (!hit && own) reasons.push(`${f}:${newLines[0]}: no recorded test ran the changed lines`);
    }
  }
  return { all, tests: picked, reasons };
}

/** The test() calls that use any of `names`, directly or through other declarations (by name, transitively). */
function usersOf(outline, names) {
  const set = new Set(names);
  for (let grew = true; grew;) {
    grew = false;
    for (const d of outline.decls) {
      if (set.has(d.name)) continue;
      if (outline.refs.some((r) => set.has(r.name) && r.line >= d.start && r.line <= d.end)) { set.add(d.name); grew = true; }
    }
  }
  return outline.tests.filter((t) => outline.refs.some((r) => set.has(r.name) && r.line >= t.start && r.line <= t.end));
}

export { isTestFile, isJs, isCss };
