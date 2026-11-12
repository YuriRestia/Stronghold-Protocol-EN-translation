// scripts/release-news.mjs — (fork) step 1 of scripts/release.mjs: the lobby's update news bumped for the release,
// drafted from the changelog fragments it ships.
//
// Wording rules (the user's, memory "update news"; shown when the draft opens):
//   - player-facing changes only: no backend-only lines (server links, CI, tests, tooling, bandwidth or downloads)
//   - no "Many fixes" line, no minor fixes; the game's own terms ("High Ground", operator names as in the EN game)
//   - a new id each release (the version bump pattern: 0.3.4-2 → 0.3.4-3), so the banner shows again to everyone
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Headings that are not for players (the draft leaves them out; the user can put any back). */
export const BACKEND_ONLY = /\b(CI|golden|tests?|checks?|workflow|GitHub|servers?|peer|deploy|tooling|bandwidth|downloads?|loop check|sim)\b/i;

/** The next id in the version bump pattern: `0.3.4-2` → `0.3.4-3`, `0.3.4` → `0.3.4-1`. @param {string} id */
export function nextNewsId(id) {
  const m = /^(.*?)-(\d+)$/.exec(String(id));
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${id}-1`;
}

/**
 * The draft's lines from the fragments: one per `### ` heading, backend-only headings set aside with the reason.
 * @param {{ name: string, text: string }[]} fragments
 * @returns {{ points: string[], skipped: { line: string, name: string }[] }}
 */
export function draftNewsLines(fragments) {
  const points = [], skipped = [];
  for (const { name, text } of fragments) {
    for (const m of String(text).matchAll(/^### (.+?)\s*$/gm)) {
      const line = m[1].trim();
      if (BACKEND_ONLY.test(line)) skipped.push({ line, name });
      else if (!points.includes(line)) points.push(line);
    }
  }
  return { points, skipped };
}

/** Read the fragments of changes/. @param {string} root @param {string[]} files */
export const readFragments = (root, files) => files.map((name) => ({ name, text: readFileSync(join(root, 'changes', name), 'utf8') }));

/**
 * Step 1's news part. NOT BUILT YET: waits for the lead's choice between a committed news file (every language, drafted
 * in English) and the msgid banner (id and title only).
 * @param {{ root: string, fragments: string[], dryRun: boolean, ask: (q: string) => Promise<boolean> }} o
 */
export function bumpNews(o) {
  const { points, skipped } = draftNewsLines(readFragments(o.root, o.fragments));
  console.log(`  news draft from the fragments: ${points.length} line(s); left out as backend-only: ${skipped.length}`);
  for (const p of points) console.log(`    + ${p}`);
  for (const s of skipped) console.log(`    - ${s.line}  (${s.name})`);
  return { say: `draft of ${points.length} line(s)` };
}
