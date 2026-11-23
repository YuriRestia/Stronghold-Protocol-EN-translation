// test/ui/bot-info.test.js — GitHub #87 / #124: the 「AI 方案」 popup (public/js/ui/botInfo.js; shared/botProfiles.js
// BOT_INFO) describes every room bot, a tactic profile lists its own tactics, and the match view names an AI player's bot
// (server/match/match/views.js; ui/teamPanel.js botTitle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_BOTS, BOT_INFO, botScore, botScoreSuffix, strengthMatches, STRENGTH_MATCHES } from '../../shared/botProfiles.js';
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

test('the strength score (Fish on #151): solo + team of 4, 0–200, ± 1 standard deviation of the two win rates', () => {
  assert.deepEqual(botScore({ strength: 44, team: 78 }), { score: 122, sd: 9 });
  assert.deepEqual(botScore({ strength: 38, team: 65 }), { score: 103, sd: 9 });
  assert.deepEqual(botScore({ strength: 0, team: 23 }), { score: 23, sd: 7 });
  assert.equal(botScore({ strength: 44 }), null, 'no team number: no score');
  assert.deepEqual(botScore({ strength: 42, team: 71, n: { solo: 380, team: 340 } }), { score: 113, sd: 4 }, 'a bot\'s own match counts narrow its ±');
  assert.equal(strengthMatches({}), STRENGTH_MATCHES);
  for (const b of ROOM_BOTS) {
    const sc = botScore(BOT_INFO[b.id]);
    assert.ok(sc && sc.score >= 0 && sc.score <= 200 && sc.sd >= 0, b.id);
  }
});

test('the room\'s bot selector shows each bot\'s strength score next to its name (GitHub #172)', () => {
  for (const b of ROOM_BOTS) {
    const sc = botScore(BOT_INFO[b.id]);
    assert.equal(botScoreSuffix(b.id), sc ? ` (${sc.score})` : '', b.id);
  }
  assert.equal(botScoreSuffix('legacy'), ` (${botScore(BOT_INFO.legacy).score})`);
  assert.equal(botScoreSuffix('no-such-bot'), '');
  const room = readFileSync(new URL('../../public/js/screens/room.js', import.meta.url), 'utf8');
  assert.match(room, /\$\{t\(b\.label\)\}\$\{botScoreSuffix\(b\.id\)\}/, 'the option carries the suffix');
});
