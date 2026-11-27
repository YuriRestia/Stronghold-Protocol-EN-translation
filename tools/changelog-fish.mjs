#!/usr/bin/env node
// (fork, GitHub #158) Fish Edition changelog fragments (changes-fish/README.md, server/changelogFish.js).
//
//   npm run changelog:fish                 check every fragment, and that each has its other language (exit 1 if not)
//   npm run changelog:fish -- --dry-run    print both changelogs' Fish Edition sections with the fragments folded in
//   npm run changelog:fish -- --write      fold them into CHANGELOG.md / CHANGELOG.en.md and delete them (before a
//                                          release; refuses with uncommitted changes to those files)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFragments, foldFragments, FRAGMENT } from '../server/changelogFish.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'changes-fish');
const FILES = { zh: path.join(ROOT, 'CHANGELOG.md'), en: path.join(ROOT, 'CHANGELOG.en.md') };

/** Problems with the fragments in `dir`: bad files, and a fragment without its other language. */
export function problems(dir = DIR) {
  const out = [];
  const got = {};
  for (const lang of ['zh', 'en']) {
    const { fragments, bad } = readFragments(dir, lang);
    for (const b of bad) out.push(`${b.file}: ${b.why}`);
    got[lang] = new Set(fragments.map((f) => f.file.replace(/\.en\.md$/, '.md')));
  }
  for (const f of got.zh) if (!got.en.has(f)) out.push(`${f}: no English ${f.replace(/\.md$/, '.en.md')}`);
  for (const f of got.en) if (!got.zh.has(f)) out.push(`${f.replace(/\.md$/, '.en.md')}: no Chinese ${f}`);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* none */ }
  for (const n of names) if (n !== 'README.md' && !FRAGMENT.test(n)) out.push(`${n}: not <PR>-<what>.md / <PR>-<what>.en.md`);
  return out;
}

/** Both changelogs with the fragments folded in: { zh, en } texts, or throws when a file lacks its Fish Edition section. */
export function folded(dir = DIR, files = FILES) {
  const out = {};
  for (const lang of ['zh', 'en']) {
    const text = fs.readFileSync(files[lang], 'utf8');
    const f = foldFragments(text, readFragments(dir, lang).fragments);
    if (f === null) throw new Error(`${path.basename(files[lang])}: no "### Fish Edition" section in its first version`);
    out[lang] = f;
  }
  return out;
}

function main(argv) {
  const arg = argv[0] ?? '';
  if (!['', '--dry-run', '--write'].includes(arg) || argv.length > 1) {
    console.error('usage: node tools/changelog-fish.mjs [--dry-run | --write]');
    return 1;
  }
  const bad = problems();
  if (bad.length) { for (const b of bad) console.error(`changes-fish/${b}`); return 1; }
  const n = readFragments(DIR, 'zh').fragments.length;
  if (arg === '') { console.log(`${n} fragment pair(s), all fine`); return 0; }
  const out = folded();
  if (arg === '--dry-run') {
    for (const lang of ['zh', 'en']) console.log(out[lang].split('\n').slice(0, 40).join('\n'), '\n…\n');
    return 0;
  }
  const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'CHANGELOG.md', 'CHANGELOG.en.md'], { encoding: 'utf8' }).trim();
  if (dirty) { console.error('CHANGELOG.md / CHANGELOG.en.md have uncommitted changes: commit or stash them first'); return 1; }
  for (const lang of ['zh', 'en']) fs.writeFileSync(FILES[lang], out[lang]);
  for (const lang of ['zh', 'en']) for (const f of readFragments(DIR, lang).fragments) fs.unlinkSync(path.join(DIR, f.file));
  console.log(`folded ${n} fragment pair(s) into CHANGELOG.md and CHANGELOG.en.md`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
