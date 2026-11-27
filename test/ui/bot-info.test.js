// test/ui/bot-info.test.js — GitHub #87 / #124: the 「AI 方案」 popup (public/js/ui/botInfo.js; shared/botProfiles.js
// BOT_INFO) describes every room bot, a tactic profile lists its own tactics, and the match view names an AI player's bot
// (server/match/match/views.js; ui/teamPanel.js botTitle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_BOTS, BOT_INFO, SPACC_SETS, SPACC_WEIGHT, spaccScore, botScore, botScoreSuffix, strengthMatches, STRENGTH_MATCHES } from '../../shared/botProfiles.js';
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

test('the SPA-CC score (#124 level 3): 50 points per set × its win rate over the sets a bot is measured on, with the coverage', () => {
  assert.equal(spaccScore({}), null);
  assert.equal(spaccScore({ spacc: { solo: { H5: [0, 0] } } }), null, 'no matches: nothing');
  assert.equal(spaccScore({ spacc: { solo: { NOPE: [5, 10] } } }), null, 'an unknown set does not count');
  const s = spaccScore({ spacc: { solo: { H5: [500, 1000], H10: [250, 1000] }, team: { CB2: [100, 100] } } });
  assert.deepEqual([s.points, s.sets, s.of, s.max, s.matches], [Math.round(50 * 0.5 + 50 * 0.25 + 50), 3, 16, 150, 2100]);
  assert.ok(s.sd >= 0 && s.sd < 10);
  assert.equal(s.rate, Math.round((100 * (0.5 + 0.25 + 1)) / 3), 'the mean win rate over the measured sets (what the popup shows)');
  assert.equal(SPACC_SETS.solo.length + SPACC_SETS.team.length, 16);
  assert.equal(SPACC_WEIGHT * 16, 800);
  // what is posted on #124 (2026-11-18): legacy 272/176/178/171 of 1000 and evobot 294/199/222/203 on H5/H10/F9/C3
  assert.equal(spaccScore(BOT_INFO.legacy).points, Math.round(50 * (0.272 + 0.176 + 0.178 + 0.171)));
  assert.equal(spaccScore(BOT_INFO.evobot).points, Math.round(50 * (0.294 + 0.199 + 0.222 + 0.203)));
  assert.ok(spaccScore(BOT_INFO.evobot).points > spaccScore(BOT_INFO.legacy).points, 'evobot is ahead on all four sets');
  assert.deepEqual(spaccScore(BOT_INFO['fish-level']), spaccScore(BOT_INFO.legacy), 'the level curve plays legacy\'s games on Ultimate');
  assert.equal(spaccScore(BOT_INFO.adaptive), null, 'not measured yet');
  for (const b of ROOM_BOTS) for (const mode of ['solo', 'team']) for (const [id, r] of Object.entries(BOT_INFO[b.id].spacc?.[mode] ?? {})) assert.ok(SPACC_SETS[mode].includes(id) && r[0] <= r[1], `${b.id} ${mode} ${id}`);
});
