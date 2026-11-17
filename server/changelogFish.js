// server/changelogFish.js — (fork, GitHub #158) Fish Edition changelog fragments (changes-fish/README.md).
//
// A pull request never edits the "### Fish Edition" section of CHANGELOG.md / CHANGELOG.en.md: it adds
// changes-fish/<PR>-<what>.md (Chinese) and changes-fish/<PR>-<what>.en.md (English), each holding its `- ` bullets. Two
// pull requests then never touch the same lines. The server shows the fragments in place (server/http/static.js serves
// /CHANGELOG.md and /CHANGELOG.en.md with them folded in), so the release notes stay current; tools/changelog-fish.mjs
// folds them into the files for good before a release.
import fs from 'node:fs';
import path from 'node:path';

/** A fragment's file name: the pull request's number, a slug, `.en` for the English one. */
export const FRAGMENT = /^(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)(\.en)?\.md$/;
/** A fragment is a few bullets; bigger is a mistake (and the server reads them on every changelog request). */
export const MAX_FRAGMENT = 64 * 1024;
const HEADING = '### Fish Edition';

/**
 * The fragments of one language in `dir`, newest pull request first (then by name). A file that isn't a fragment
 * (README.md) is skipped; a fragment that breaks the format is listed in `bad`.
 * @param {string} dir @param {'zh'|'en'} lang
 * @returns {{ fragments: { file: string, pr: number, text: string }[], bad: { file: string, why: string }[] }}
 */
export function readFragments(dir, lang) {
  const fragments = [], bad = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return { fragments, bad }; }
  for (const file of names) {
    const m = FRAGMENT.exec(file);
    if (!m || (lang === 'en') !== !!m[3]) continue;
    let text;
    try {
      const st = fs.statSync(path.join(dir, file));
      if (!st.isFile() || st.size > MAX_FRAGMENT) { bad.push({ file, why: 'not a file, or too big' }); continue; }
      text = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch (e) { bad.push({ file, why: e.message }); continue; }
    const why = checkFragment(text);
    if (why) { bad.push({ file, why }); continue; }
    fragments.push({ file, pr: Number(m[1]), text: text.replace(/\r\n/g, '\n').trim() });
  }
  fragments.sort((a, b) => b.pr - a.pr || a.file.localeCompare(b.file));
  return { fragments, bad };
}

/** Why `text` isn't a fragment (one or more `- ` bullets, continuation lines indented), or null. */
export function checkFragment(text) {
  const lines = String(text).replace(/\r\n/g, '\n').trim().split('\n');
  if (!lines[0] || !lines[0].startsWith('- ')) return 'must start with a "- " bullet';
  for (const l of lines) {
    if (l === '' || l.startsWith('- ') || l.startsWith('  ')) continue;
    return `a line that is neither a bullet nor indented: ${JSON.stringify(l.slice(0, 60))}`;
  }
  return null;
}

/**
 * `changelog` with the fragments' bullets at the top of the first version's "### Fish Edition" list (newest first),
 * or null when that section is missing (the caller then shows the file as it is).
 * @param {string} changelog @param {{ text: string }[]} fragments
 */
export function foldFragments(changelog, fragments) {
  if (!fragments.length) return changelog;
  const lines = changelog.split('\n');
  const first = lines.findIndex((l) => l.startsWith('## '));
  if (first < 0) return null;
  let end = lines.findIndex((l, i) => i > first && l.startsWith('## '));
  if (end < 0) end = lines.length;
  const head = lines.findIndex((l, i) => i > first && i < end && l.trim() === HEADING);
  if (head < 0) return null;
  let next = lines.findIndex((l, i) => i > head && i < end && /^#{2,3} /.test(l));
  if (next < 0) next = end;
  // before the section's first bullet, or after its intro when it has none
  let at = lines.findIndex((l, i) => i > head && i < next && l.startsWith('- '));
  const add = fragments.map((f) => f.text).join('\n').split('\n');
  if (at < 0) {
    at = next;
    while (at > head + 1 && lines[at - 1].trim() === '') at--;
    return [...lines.slice(0, at), '', ...add, ...lines.slice(at)].join('\n');
  }
  return [...lines.slice(0, at), ...add, ...lines.slice(at)].join('\n');
}

/** The served changelog of `lang`: the file with `dir`'s fragments folded in (the file itself when there are none). */
export function changelogWithFragments(changelogText, dir, lang) {
  const { fragments } = readFragments(dir, lang);
  if (!fragments.length) return changelogText;
  return foldFragments(changelogText, fragments) ?? changelogText;
}
