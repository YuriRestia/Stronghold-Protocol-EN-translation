// GitHub #139: the room's rules button glows until this browser has opened the rules dialog once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { RULES_SEEN_PREF } = await import('../../public/js/ui/lobbyRules.js');

test('the pref, the button\'s class and the glow (with a still version for reduced motion)', () => {
  assert.equal(RULES_SEEN_PREF, 'lobby.rulesSeen');
  const src = fs.readFileSync(new URL('../../public/js/ui/lobbyRules.js', import.meta.url), 'utf8');
  assert.match(src, /class=\$\{cx\('rules-open', !seen && 'is-new'\)\}/);
  assert.match(src, /if \(!seen\) \{ setSeen\(true\); savePref\(RULES_SEEN_PREF, true\); \}/);
  const css = fs.readFileSync(new URL('../../public/css/screens/room.css', import.meta.url), 'utf8');
  assert.match(css, /\.rules-open\.is-new \{ animation: rules-new-glow/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.rules-open\.is-new \{ animation: none;/);
});
