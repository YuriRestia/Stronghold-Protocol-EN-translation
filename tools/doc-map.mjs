// tools/doc-map.mjs — (fork) docs/doc-map.json: which doc sections to read before editing a code area.
// AGENTS.md "Read first" points here; test/doc-map.test.js keeps every doc, heading and path real. The crew's doc-gate
// hook (outside the repo) reads the same JSON with its own copy of these few rules.
//   node tools/doc-map.mjs <path>...   prints the sections (doc, heading, line range) mapped to each path
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DOC_MAP = 'docs/doc-map.json';

/** A repo glob as a RegExp: `**` any depth (also none), `*` within one folder, `?` one character. */
export function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function loadDocMap(root) {
  return JSON.parse(readFileSync(join(root, DOC_MAP), 'utf8'));
}

/** The map's entries whose globs match a repo-relative path (forward slashes). */
export function entriesFor(map, rel) {
  return map.entries.filter((e) => e.paths.some((g) => globRe(g).test(rel)));
}

/** 1-based line range of a heading's section: the heading line up to the line before the next heading of the same or a
 *  higher level (or the end of the file). Lines inside fenced code blocks are not headings. null when absent. */
export function sectionRange(text, heading) {
  const lines = text.split(/\r?\n/);
  let fence = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{1,6}) /.exec(l);
    if (!m) continue;
    if (start < 0) {
      if (l.trimEnd() === heading.trimEnd()) { start = i; level = m[1].length; }
    } else if (m[1].length <= level) return { start: start + 1, end: i };
  }
  return start < 0 ? null : { start: start + 1, end: lines.length };
}

/** Every section required for a path, deduplicated: [{doc, heading, start, end, ids}] (start/end null if missing). */
export function requiredSections(root, rel, map = loadDocMap(root)) {
  const out = new Map();
  for (const e of entriesFor(map, rel)) {
    for (const r of e.read) {
      let text = null;
      try { text = readFileSync(join(root, r.doc), 'utf8'); } catch { /* reported as missing */ }
      for (const h of r.headings) {
        const key = `${r.doc}\n${h}`;
        if (out.has(key)) { out.get(key).ids.push(e.id); continue; }
        const range = text == null ? null : sectionRange(text, h);
        out.set(key, { doc: r.doc, heading: h, start: range?.start ?? null, end: range?.end ?? null, ids: [e.id] });
      }
    }
  }
  return [...out.values()];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const map = loadDocMap(root);
  for (const p of process.argv.slice(2)) {
    const rel = p.replace(/\\/g, '/').replace(/^\.\//, '');
    const secs = requiredSections(root, rel, map);
    console.log(`${rel}: ${secs.length ? '' : 'no mapped docs'}`);
    for (const s of secs) console.log(`  ${s.doc}:${s.start}-${s.end}  ${s.heading}  (${s.ids.join(', ')})`);
  }
}
