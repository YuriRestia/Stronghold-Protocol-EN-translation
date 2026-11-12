#!/usr/bin/env node
// tools/golden-moved.mjs — (fork) the helper of .github/workflows/golden-refresh.yml: which golden versions to refresh,
// and afterwards which scenarios moved, with only the changed golden files copied out for the artifact.
//
// Usage:
//   node tools/golden-moved.mjs --versions <all | id,id>       print the version ids to refresh, one per line
//                                                              (checked against shared/versions.js VERSIONS)
//   node tools/golden-moved.mjs --compare <before> <after> [--out <dir>]
//        compare two copies of test/golden (root = the default version, <slug>/ = a historical one) scenario by
//        scenario (a scenario's `about` / `fast` notes are not compared). Prints a Markdown summary; with --out, copies
//        each changed file to <out>/test/golden/... and writes <out>/golden-refresh-summary.md. Exit 0 either way.
//
// Reads only <family>.json files at most one folder deep: no git, no network. test/golden/README.md "Refreshing on
// GitHub" is the Dev's side.
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VERSIONS, DEFAULT_VERSION } from '../shared/versions.js';

/** The longest id list printed per row (the full lists stay in the files' diff). */
const MAX_IDS = 25;

/**
 * The version ids a `versions` input names: 'all' (or empty) is every official version, the default first.
 * @param {unknown} input
 * @returns {string[]}
 */
export function resolveVersions(input) {
  const text = String(input ?? '').trim();
  if (!text || text === 'all') return VERSIONS.map((v) => v.id);
  const known = new Set(VERSIONS.map((v) => v.id));
  // commas from the button's input; spaces / new lines from the workflow's resolved list (steps.inputs.outputs.versions)
  const ids = [...new Set(text.split(/[\s,]+/).filter(Boolean))];
  const bad = ids.filter((id) => !known.has(id));
  if (bad.length) throw new Error(`unknown version id(s): ${bad.join(', ')} (known: ${[...known].join(', ')})`);
  return ids;
}

/**
 * The families a `families` input names: 'all' (or empty) is null (the tool's own list); otherwise a checked comma list.
 * @param {unknown} input
 * @returns {string|null}
 */
export function resolveFamilies(input) {
  const text = String(input ?? '').trim();
  if (!text || text === 'all') return null;
  if (!/^[a-z]+(,[a-z]+)*$/.test(text)) throw new Error(`families must be "all" or a comma list of lowercase names, got "${text}"`);
  return text;
}

/** A golden document's scenarios without their notes: id → JSON text. */
function scenarioTexts(doc) {
  const out = new Map();
  for (const [id, d] of Object.entries((doc && doc.scenarios) || {})) {
    const { about, fast, ...rest } = d || {};
    out.set(id, JSON.stringify(rest));
  }
  return out;
}

/**
 * The scenarios that moved between two golden documents (null: the file did not exist).
 * @param {any} before
 * @param {any} after
 * @returns {{ moved: string[], added: string[], removed: string[] }}
 */
export function movedScenarios(before, after) {
  const a = scenarioTexts(before), b = scenarioTexts(after);
  const moved = [], added = [], removed = [];
  for (const [id, text] of b) {
    if (!a.has(id)) added.push(id);
    else if (a.get(id) !== text) moved.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  return { moved, added, removed };
}

/** The golden JSON files of a test/golden copy, relative paths ('bonds.json', 'act1autochess/roster.json'). */
export function goldenFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.json')) out.push(e.name);
    else if (e.isDirectory()) {
      for (const f of readdirSync(join(dir, e.name), { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.json')) out.push(`${e.name}/${f.name}`);
      }
    }
  }
  return out.sort();
}

const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const parse = (text) => { try { return text == null ? null : JSON.parse(text); } catch { return null; } };

/**
 * Every golden file whose bytes changed between the two copies, with its moved scenarios.
 * @param {string} beforeDir
 * @param {string} afterDir
 * @returns {Array<{ file: string, version: string, family: string, moved: string[], added: string[], removed: string[] }>}
 */
export function compareDirs(beforeDir, afterDir) {
  const slugToId = new Map(VERSIONS.filter((v) => v.dir).map((v) => [v.dir.split('/').filter(Boolean).pop(), v.id]));
  const rows = [];
  for (const file of [...new Set([...goldenFiles(beforeDir), ...goldenFiles(afterDir)])].sort()) {
    const ta = readText(join(beforeDir, file)), tb = readText(join(afterDir, file));
    if (ta === tb) continue;
    const parts = file.split('/');
    const version = parts.length > 1 ? (slugToId.get(parts[0]) ?? parts[0]) : DEFAULT_VERSION;
    const family = parts[parts.length - 1].replace(/\.json$/, '');
    rows.push({ file, version, family, ...movedScenarios(parse(ta), parse(tb)) });
  }
  return rows;
}

const idList = (list) => (list.length
  ? list.slice(0, MAX_IDS).map((s) => `\`${s}\``).join(', ') + (list.length > MAX_IDS ? `, … (${list.length - MAX_IDS} more)` : '')
  : '—');

/**
 * The summary in Markdown (the job summary and the artifact's golden-refresh-summary.md).
 * @param {ReturnType<typeof compareDirs>} rows
 * @param {{ ref?: string, versions?: string[] }} [opts]
 */
export function markdownSummary(rows, { ref = '', versions = [] } = {}) {
  const head = `# Golden refresh${ref ? ` of ${ref}` : ''}\n\n${versions.length ? `Versions: ${versions.join(', ')}\n\n` : ''}`;
  if (!rows.length) return `${head}No golden file changed: every scenario matches the committed files.\n`;
  const lines = [
    `${rows.length} golden file(s) changed. Unzip the artifact at the repository root, delete golden-refresh-summary.md, `
      + 'review the diff and commit the files with the change that moved them (test/golden/README.md).',
    '',
    '| File | Version | Family | Moved | Added | Removed | Moved scenarios |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`test/golden/${r.file}\` | ${r.version} | ${r.family} | ${r.moved.length} | ${r.added.length} | ${r.removed.length} | ${idList(r.moved)} |`),
  ];
  const extra = rows.filter((r) => r.added.length || r.removed.length);
  if (extra.length) {
    lines.push('', '| File | Added scenarios | Removed scenarios |', '|---|---|---|');
    for (const r of extra) lines.push(`| \`test/golden/${r.file}\` | ${idList(r.added)} | ${idList(r.removed)} |`);
  }
  return `${head}${lines.join('\n')}\n`;
}

/**
 * Copy the changed files to <out>/test/golden/… and write the summary beside them.
 * @returns {number} the files copied (a removed file has nothing to hand over)
 */
export function collect(rows, afterDir, out, summary) {
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const r of rows) {
    const src = join(afterDir, r.file);
    if (!existsSync(src)) continue;
    const dst = join(out, 'test', 'golden', r.file);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    n++;
  }
  writeFileSync(join(out, 'golden-refresh-summary.md'), summary);
  return n;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const after = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  try {
    if (argv.includes('--versions')) {
      process.stdout.write(`${resolveVersions(after('--versions')).join('\n')}\n`);
    } else if (argv.includes('--families')) {
      process.stdout.write(`${resolveFamilies(after('--families')) ?? ''}\n`);
    } else if (argv.includes('--compare')) {
      const i = argv.indexOf('--compare');
      const [before, now] = [argv[i + 1], argv[i + 2]];
      if (!before || !now || before.startsWith('--') || now.startsWith('--')) throw new Error('--compare needs <before> <after>');
      const rows = compareDirs(before, now);
      const summary = markdownSummary(rows, { ref: process.env.GOLDEN_REF || '', versions: resolveVersions(process.env.GOLDEN_VERSIONS) });
      process.stdout.write(summary);
      const out = after('--out');
      if (out) console.error(`golden-moved: ${collect(rows, now, out, summary)} changed file(s) copied to ${out}`);
    } else {
      console.error('usage: node tools/golden-moved.mjs --versions <all|id,id> | --families <all|a,b> | --compare <before> <after> [--out <dir>]');
      process.exit(2);
    }
  } catch (err) {
    console.error(`golden-moved: ${err.message}`);
    process.exit(1);
  }
}
