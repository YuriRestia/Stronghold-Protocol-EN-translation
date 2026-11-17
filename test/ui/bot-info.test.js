// test/ui/bot-info.test.js — GitHub #87 / #124: the 「AI 方案」 popup (public/js/ui/botInfo.js; shared/botProfiles.js
// BOT_INFO) describes every room bot, a tactic profile lists its own tactics, and the match view names an AI player's bot
// (server/match/match/views.js; ui/teamPanel.js botTitle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_BOTS, BOT_INFO } from '../../shared/botProfiles.js';
import { TACTICS } from '../../server/match/botStrategies.js';
import { makeMatch } from '../match/harness.js';

test('every room bot has a description, and only room bots', () => {
  assert.deepEqual(Object.keys(BOT_INFO).sort(), ROOM_BOTS.map((b) => b.id).sort());
  for (const b of ROOM_BOTS) assert.ok(BOT_INFO[b.id].about.length > 0, b.id);
});

test('a tactic profile lists the tactics it is made of, in order', () => {
  const src = readFileSync(new URL('../../server/match/botTacticsBasic.js', import.meta.url), 'utf8');
  const constId = (name) => src.match(new RegExp(`const ${name} = defineTactic\\(\\{\\s*id: '([^']+)'`))?.[1];
  for (const [id, info] of Object.entries(BOT_INFO)) {
    const m = src.match(new RegExp(`defineProfile\\(\\{ id: '${id}', tactics: \\[(.*?)\\] \\}\\)`));
    if (!m) { assert.equal(info.tactics, undefined, `${id} is no tactic profile`); continue; }
    const ids = [...m[1].matchAll(/(?:tactic: )?\b([A-Z][A-Z0-9_]+)\b/g)].map((x) => constId(x[1])).filter(Boolean);
    assert.deepEqual(info.tactics.map((x) => x.id), ids, id);
    for (const x of info.tactics) assert.ok(Object.hasOwn(TACTICS, x.id), x.id);
  }
});

test('the match view names an AI player\'s bot; a human has none', () => {
  const h = makeMatch({ mode: 'coop', seed: 2, humans: 1, bots: 1 });
  try {
    const players = h.m.publicView().players;
    assert.ok(Array.isArray(players));
    for (const p of players) {
      if (p.isBot) assert.equal(typeof p.bot, 'string');
      else assert.equal(p.bot, undefined);
    }
  } finally { h.m.dispose(); }
});

test('every room bot has a strength (GitHub #124: Ultimate solo win rate × 100)', () => {
  for (const b of ROOM_BOTS) {
    const s = BOT_INFO[b.id]?.strength;
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 100, `${b.id}: ${s}`);
    const team = BOT_INFO[b.id]?.team;
    assert.ok(Number.isInteger(team) && team >= 0 && team <= 100, `${b.id} team: ${team}`);
  }
});
