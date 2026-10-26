// 「轮到你选」 (ui/turnPopup.js, css/screens/game-panels.css .sptp): the official effectChoose sprites it draws, the
// wiring in screens/game.js (the shared draft's own turn and a solo draft as it opens — the maintainer's decision of
// 2026-10-22 —, with the 轮到你 sound, once the art is in, never with reduced motion; after the round plate and the 机变阶段
// banner, at most TURN_CUE_PLATE_WAIT_MS / TURN_CUE_WAIT_MS after each mounts — §35.18's leftover) and the stylesheet's rules. In a browser: test/ui/turn-popup.e2e.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const P = await import('../../public/js/ui/turnPopup.js');

test('the official effectChoose sprites, all in the asset list; no drawn stand-ins; not ready without them', () => {
  const ui = JSON.parse(read('data/assets.json')).ui;
  const js = read('public/js/ui/turnPopup.js');
  const keys = js.match(/const ART = \[([^\]]+)\]/)[1].match(/'([A-Za-z_0-9/]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(keys.sort(), ['effectChoose/bg_circle', 'effectChoose/bottom', 'effectChoose/plus', 'effectChoose/square_1', 'effectChoose/square_2']);
  for (const k of keys) assert.ok(k in ui, k);
  for (const m of js.matchAll(/k="([^"]+)"/g)) assert.ok(keys.includes(m[1]), m[1]);
  assert.doesNotMatch(js, /<svg/, 'no drawn mark');
  assert.equal(P.turnPopupArtReady(), false, 'in Node (no Image) it never turns ready');
  assert.equal(P.TURN_POPUP_MS, 1200);
});

test('screens/game.js: the disc on the shared draft\'s own turn and in solo (the maintainer, 2026-10-22), with the 轮到你 sound, once the art is in, never with reduced motion', () => {
  const g = read('public/js/screens/game.js');
  // (solo: the draft is the player's from its start — the same test as the timer ticks' myPick)
  assert.match(g, /const spMine = !!sp && \(solo \|\| sp\.turnPid === myId\) && !sp\.pickOf\.has\(myId\);/);
  assert.match(g, /const myPick = sp && \(solo \|\| sp\.turnPid === myId\) && !sp\.pickOf\.has\(myId\);/);
  assert.doesNotMatch(g, /!!sp && !solo/, 'no co-op-only disc');
  const tp = read('public/js/ui/turnPopup.js');
  assert.doesNotMatch(tp, /a shared draft only/);
  assert.match(tp, /\[ASSUMED\] for solo/);
  assert.match(g, /useEffect\(\(\) => \{ preloadTurnPopupArt\(\); \}, \[\]\);/);
  // the turn makes the cue due (a pick or the turn moving on drops it); it plays — the sound, and the disc once the art is
  // in and motion is allowed — when no phase banner / plate is up, or at the latest TURN_CUE_PLATE_WAIT_MS after the round
  // plate and TURN_CUE_WAIT_MS after the banner it held back: the wait is keyed on the overlay on screen (the plate, then
  // the banner, each restarts it), never timed from the turn alone (§35.18's leftover, the ROUND_START → SP_DRAFT race)
  assert.match(g, /useEffect\(\(\) => \{ if \(spMine\) setTurnDue\(\(n\) => n \+ 1\); else setTurnDue\(0\); \}, \[spMine\]\);/);
  assert.match(g, /const overlayKey = hasOffers \? '' : roundPop \? `r:\$\{roundPop\.key\}` : banner \? `b:\$\{banner\.key\}` : '';/);
  assert.doesNotMatch(g, /phaseOverlay/, 'no on / off flag: a plate giving way to a banner restarts the wait');
  assert.match(g, /const play = \(\) => \{\n\s+setTurnDue\(0\);\n\s+audio\.sfx\('yourTurn'\);\n\s+if \(turnPopupArtReady\(\) && !reducedMotion\(\)\) setTurnPop\(\(n\) => n \+ 1\);\n\s+\};/);
  assert.match(g, /if \(!overlayKey\) \{ play\(\); return undefined; \}\n\s+const id = setTimeout\(play, overlayKey\.startsWith\('r:'\) \? TURN_CUE_PLATE_WAIT_MS : TURN_CUE_WAIT_MS\);\n\s+return \(\) => clearTimeout\(id\);\n\s+\}, \[turnDue, overlayKey\]\);/);
  // the two overlays it waits for, as rendered: the plate holds the banner back (the banner mounts as the plate goes)
  assert.match(g, /\$\{roundPop && !hasOffers && [^\n]*<\$\{RoundPopup\} key=\$\{roundPop\.key\}/);
  assert.match(g, /\$\{!hasOffers && banner && !banner\.plate && !roundPop \? html`<\$\{PhaseBanner\} key=\$\{banner\.key\}/);
  assert.doesNotMatch(g, /if \(!spMine\) return;\n\s+audio\.sfx\('yourTurn'\)/, 'no cue at the moment the turn comes, under the banner');
  assert.match(g, /<\$\{TurnPopup\} key=\$\{turnPop\} onDone=\$\{\(\) => setTurnPop\(0\)\} \/>/);
});

test('the wait is bounded: it covers the 机变阶段 banner (1.5 s + its 0.26 s close), the whole cue ≤ 3 s; the round plate before it (1.7 s + 0.28 s)', () => {
  const g = read('public/js/screens/game.js');
  const c = read('public/js/ui/components.js');
  const banner = Number(g.match(/<\$\{PhaseBanner\}[^>]*duration=\$\{banner\.duration \|\| (\d+)\}/)[1]);
  const close = Number(c.match(/setTimeout\(\(\) => \{ setGone\(true\); onDone\?\.\(\); \}, duration \+ (\d+)\)/)[1]);
  assert.deepEqual([banner, close], [1500, 260]);
  // the SP_DRAFT banner keeps the default length (phases.js gives it no duration of its own)
  assert.match(read('public/js/ui/gameLogic/phases.js'), /case PHASE\.SP_DRAFT: return \{ title: t\('机变阶段'\), micro: 'CONTINGENCY', tone: 'gold', sub: t\('依次选择机变'\) \};/);
  assert.ok(P.TURN_CUE_WAIT_MS >= banner + close, `${P.TURN_CUE_WAIT_MS} ms covers the banner`);
  assert.ok(P.TURN_CUE_WAIT_MS + P.TURN_POPUP_MS <= 3000, 'banner, then disc, all within 3 s');
  // the round plate still up from ROUND_START (the server's ROUND_START is 2 s, the plate 1.7 s + its 0.28 s leave):
  // its own bound covers it, so a turn that comes under a late plate waits for it, then for the banner
  const mp = read('public/js/ui/matchPopups.js');
  const plate = Number(mp.match(/export const ROUND_POPUP_MS = (\d+);/)[1]);
  const leave = Number(mp.match(/const LEAVE_MS = (\d+);/)[1]);
  assert.match(mp, /export function RoundPopup\([^)]*\) \{\n\s+const leaving = useTimedLeave\(ROUND_POPUP_MS, onDone\);/);
  assert.ok(P.TURN_CUE_PLATE_WAIT_MS >= plate + leave, `${P.TURN_CUE_PLATE_WAIT_MS} ms covers the round plate (${plate} + ${leave})`);
  assert.ok(P.TURN_CUE_PLATE_WAIT_MS + P.TURN_CUE_WAIT_MS + P.TURN_POPUP_MS <= 5000, 'plate, banner, then disc, all within 5 s');
  assert.match(read('public/js/ui/turnPopup.js'), /\[ASSUMED\][^\n]*\n[^\n]*order plate → banner → disc and the wait's bounds/);
});

test('the stylesheet: every keyframe it uses is defined, no clicks caught, reduced motion hides it, the project\'s rules', () => {
  const css = read('public/css/screens/game-panels.css');
  const block = css.slice(css.indexOf('.sptp {'), css.indexOf('.sptp { display: none; }') + 30);
  const used = new Set([...block.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1].trim().split(/\s+/)[0]));
  assert.ok(used.size >= 4, [...used].join(','));
  for (const n of used) assert.match(block, new RegExp(`@keyframes ${n} \\{`), n);
  assert.match(block, /\.sptp \{[^}]*pointer-events: none;/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\.sptp \{ display: none; \}/);
  assert.doesNotMatch(block, /!important|:has\(|--t\s*:/);
});
