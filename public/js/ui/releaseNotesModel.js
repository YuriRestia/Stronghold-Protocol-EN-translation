// #603: the shipped CHANGELOG is the source; unreleased/future sections are never shown for an older binary.

/** (fork) The changelog a language reads: the Chinese original for Chinese, its English translation for the rest. */
export const changelogPath = (lang) => (/^zh/.test(String(lang)) ? '/CHANGELOG.md' : '/CHANGELOG.en.md');

export function releaseSections(markdown, version) {
  const sections = [];
  let current;
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^```/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^## (\d+\.\d+\.\d+(?:-\d+)?)(?:-dev)? — (.+)$/);
    if (heading) {
      current = { version: heading[1], title: line.slice(3), body: '' };
      sections.push(current);
    } else if (current) current.body += `${line}\n`;
  }
  const index = sections.findIndex((s) => s.version === version.replace(/-dev$/, ''));
  return index < 0 ? [] : sections.slice(index);
}

// (fork) This fork's servers run main, which is ahead of the last release: the panel also shows the unreleased section
// above the running version (its "Fish Edition" lines and what main already has), without its "In development"
// subsection, which is not on the server.
const UNRELEASED = /— (?:未发布|Unreleased)\s*$/;
const DEV_ONLY = /^### (?:开发中|In development)/;

/** (fork) releaseSections, plus any unreleased sections newer than the running version, first. */
export function forkReleaseSections(markdown, version) {
  const shipped = releaseSections(markdown, version);
  const newest = markdown.match(/^## (\d+\.\d+\.\d+(?:-\d+)?)(?:-dev)? — /m)?.[1];
  if (!shipped.length || !newest) return shipped;
  const all = releaseSections(markdown, newest);
  const ahead = all.slice(0, all.length - shipped.length).filter((s) => UNRELEASED.test(s.title));
  return [...ahead.map((s) => ({ ...s, body: withoutDevOnly(s.body) })), ...shipped];
}

function withoutDevOnly(body) {
  let skip = false;
  return body.split('\n').filter((line) => {
    if (/^### /.test(line)) skip = DEV_ONLY.test(line);
    return !skip;
  }).join('\n');
}

// Only links to http(s), or repository documents resolved against GitHub; no raw HTML is ever rendered.
export function releaseLink(raw) {
  if (/^(?:https?:\/\/|(?:docs\/|README\.md|CHANGELOG\.md|NOTICE\.md))/.test(raw)) {
    try { return new URL(raw, 'https://github.com/sganggs/Stronghold-Protocol/blob/master/').href; } catch { /* text only */ }
  }
  return null;
}
