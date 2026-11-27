import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL, BY_ID, compatible, check, resolve, anyCustomId } from '../public/js/challenges/catalog.js';
import { factsFromClientRecord } from '../public/js/challenges/facts.js';

const prior = JSON.parse(fs.readFileSync(new URL('../public/js/challenges/prior.json', import.meta.url), 'utf8'));
const facts = (o = {}) => ({ win: true, difficulty: 4, humans: 1, bots: 0, solo: true, cheats: false, risk: 8, seeded: false, tags: { ccBoss: 2 }, rounds: 15, hiddenCleared: false, durationMin: 40, nobodyOut: true, lpLost: 0, perfectRounds: 5, stats: { kills: 320, gold: 250, leaks: 3 }, layers: { yanShip: 320 }, active: ['yanShip'], golden: 0, custom: 0, ...o });

test('ids are unique and every instance is rated unless it says it has no source', () => {
  assert.equal(new Set(ALL.map((c) => c.id)).size, ALL.length);
  for (const c of ALL) if (c.needsPrior && prior.ratings[c.id] == null) assert.ok(['golden', 'custom'].some((k) => c.id.startsWith(k)), `no rating for ${c.id}`);
});

test('conditions check the facts, and unknown is not failed', () => {
  const f = facts();
  assert.equal(BY_ID.get('risk>=6').test(f), true);
  assert.equal(BY_ID.get('risk>=10').test(f), false);
  assert.equal(BY_ID.get('bond:yanShip>=300').test(f), true);
  assert.equal(BY_ID.get('bond:yanShip>=500').test(f), false);
  assert.equal(BY_ID.get('tag:ccBoss>=2').test(f), true);
  assert.equal(BY_ID.get('leaks<=5').test(f), true);
  assert.equal(check([BY_ID.get('win'), BY_ID.get('noLpLost')], facts({ lpLost: null })), null);
  assert.equal(check([BY_ID.get('win'), BY_ID.get('risk>=15')], f), false);
  assert.equal(BY_ID.get('bossSeconds<=60').test(f), null, 'not recorded: unknown, never failed');
  assert.equal(BY_ID.get('bossSeconds<=60').test({ ...f, bossSeconds: 45.5 }), true);
  assert.equal(BY_ID.get('bossSeconds<=30').test({ ...f, bossSeconds: 45.5 }), false);
});

test('compatibility', () => {
  const win = BY_ID.get('win');
  assert.equal(compatible([win], BY_ID.get('bond:yanShip>=300')), true);
  assert.equal(compatible([win, BY_ID.get('bond:yanShip>=300')], BY_ID.get('bond:yanShip>=500')), false);
  assert.equal(compatible([win, BY_ID.get('solo')], BY_ID.get('humans>=2')), false);
  assert.equal(compatible([win, BY_ID.get('risk>=6')], BY_ID.get('tag:ccBoss>=1')), false);
  assert.equal(compatible([win], BY_ID.get('risk>=6')), true);
});

test('facts from a client record; a quit record has none', () => {
  const rec = { end: 'settled', selfId: 'p1', difficulty: 'ABYSS', roomMode: 'solo', roundsPassed: 15, hiddenCleared: false, durationMs: 1800000, rules: null,
    players: [{ playerId: 'p1', victory: true, alive: true, roundsPassed: 15, bandId: 'b', stats: { kills: 300, gold: 200, lpLost: 0 }, bonds: [{ bondId: 'yanShip', layers: 310, active: true }], lineup: [{ golden: true }] }] };
  const f = factsFromClientRecord(rec);
  assert.equal(f.win, true); assert.equal(f.difficulty, 4); assert.equal(f.solo, true); assert.equal(f.layers.yanShip, 310); assert.equal(f.durationMin, 30); assert.equal(f.golden, 1);
  assert.equal(factsFromClientRecord({ ...rec, end: 'quit' }), null);
});

import { normalizeRecord } from '../public/js/ui/stats.js';

test('#192 any-custom: the facts hold the custom operators fielded at ANY point (server customSeen) plus the final board', () => {
  const base = { v: 1, t: 1, id: 'x', end: 'settled', victory: true, selfId: 'p1', roundsPassed: 15, players: [{ playerId: 'p1', victory: true, roundsPassed: 15, stats: {},
    lineup: [{ id: 'chess_char_5_diy1_a', diy: { charId: 'char_a', skillIndex: 0 } }], customSeen: ['char_4132_ascln', 'char_a', 'bad id'] }] };
  const rec = normalizeRecord(base);
  assert.deepEqual(rec.players[0].customSeen, ['char_4132_ascln', 'char_a'], 'only charId-shaped strings are kept');
  assert.deepEqual(factsFromClientRecord(rec).customIds.sort(), ['char_4132_ascln', 'char_a']);
  const c = resolve(anyCustomId(['char_4132_ascln', 'char_y', 'char_z']));
  assert.equal(c.test(factsFromClientRecord(rec)), true, 'Ascalon farmed stacks and left before the boss: it still counts');
  const old = normalizeRecord({ ...base, players: [{ ...base.players[0], customSeen: undefined, lineup: [] }] });
  assert.equal(factsFromClientRecord(old).customIds, null, 'no lineup and no customSeen: unknown');
});
