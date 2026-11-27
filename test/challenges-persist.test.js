import { test } from 'node:test';
import assert from 'node:assert/strict';

// a minimal localStorage for the module's pref helpers (they read globalThis.localStorage and guard every access)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
const { loadChallenges, saveChallenges, localHistory, PREF_KEY } = await import('../public/js/challenges/persist.js');
const { saveStats, emptyStats, normalizeRecord } = await import('../public/js/ui/stats.js');
const { ensure } = await import('../public/js/challenges/state.js');
import fs from 'node:fs';
const prior = JSON.parse(fs.readFileSync(new URL('../public/js/challenges/prior.json', import.meta.url), 'utf8'));

test('state round-trips through localStorage and a damaged value gives a fresh default', () => {
  const s = ensure(loadChallenges(), [], prior);
  saveChallenges(s);
  assert.ok(mem.has(`sp.pref.${PREF_KEY}`));
  assert.deepEqual(loadChallenges(), s);
  mem.set(`sp.pref.${PREF_KEY}`, '{not json');
  assert.equal(loadChallenges().open.every((c) => c === null), true);
});

test('localHistory reads the finished matches of this browser, oldest first, and skips a match left early', () => {
  const rec = (t, o = {}) => normalizeRecord({ t, end: 'settled', victory: true, difficulty: 'ABYSS', roundsPassed: 15, roomMode: 'solo', selfId: 'p1', players: [{ playerId: 'p1', victory: true, roundsPassed: 15, stats: {} }], ...o });
  const quit = normalizeRecord({ t: 5, end: 'quit', roundsPassed: 3, selfId: 'p1', players: [{ playerId: 'p1', roundsPassed: 3 }] });
  saveStats({ ...emptyStats(), records: [rec(300, { victory: false, players: [{ playerId: 'p1', victory: false, roundsPassed: 6, stats: {} }] }), quit, rec(100)].filter(Boolean) });
  const h = localHistory();
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((f) => f.win), [true, false], 'oldest first (t = 100, then 300)');
});
