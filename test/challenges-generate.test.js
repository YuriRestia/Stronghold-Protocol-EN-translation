import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generatePanel, STEP, SLOTS, HALF_WIDTH, ratingOf, MAX_PARTS } from '../public/js/challenges/generate.js';
import { ability, playstyle } from '../public/js/challenges/model.js';
import { BY_ID, check } from '../public/js/challenges/catalog.js';

const prior = JSON.parse(fs.readFileSync(new URL('../public/js/challenges/prior.json', import.meta.url), 'utf8'));
const match = (o = {}) => ({ win: true, difficulty: 4, humans: 1, bots: 0, solo: true, cheats: false, risk: 6, seeded: false, tags: {}, rounds: 15, hiddenCleared: false, durationMin: 40, nobodyOut: true, lpLost: 0, perfectRounds: 5, stats: { kills: 320, gold: 250, leaks: 3, dmgDealt: 5e7, refreshes: 80, merges: 20, itemsEquipped: 40, bossDamage: 3e7, activatedLayers: 2000 }, layers: { yanShip: 320 }, active: ['yanShip'], golden: 0, custom: 0, ...o });
const ratingsOf = (p) => p.cards.map((c) => c.rating);

test('deterministic for the same seed, different for another', () => {
  const a = generatePanel({ prior, seed: 5 }), b = generatePanel({ prior, seed: 5 }), c = generatePanel({ prior, seed: 6 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.cards.map((x) => x.parts), c.cards.map((x) => x.parts));
  assert.equal(a.cards.length, SLOTS);
});

test('every card lands near its target, uses known parts, one outcome, no repeated outcome or key across cards', () => {
  let near = 0, total = 0;
  for (let seed = 1; seed <= 150; seed++) for (const level of [-2, 0, 2]) {
    const p = generatePanel({ prior, level, seed });
    const keys = new Set(), outs = new Set();
    p.cards.forEach((c, i) => {
      const parts = c.parts.map((id) => BY_ID.get(id));
      assert.ok(parts.every(Boolean)); assert.ok(parts.length <= MAX_PARTS);
      assert.equal(parts.filter((x) => x.group === 'outcome').length, 1);
      assert.ok(c.points >= 100 && c.points <= 400 && c.points % 10 === 0, `a challenge pays 100 to 400 in steps of 10, got ${c.points}`);
      assert.ok(Math.abs(ratingOf(parts, prior) - c.rating) < 1e-9);
      if (parts.some((x) => x.kind === 'performance' && x.group !== 'outcome')) assert.ok(['win', 'winHidden'].includes(parts[0].id), 'performance conditions only with a win outcome');
      assert.ok(!outs.has(parts[0].id)); outs.add(parts[0].id);
      for (const x of parts.slice(1)) { assert.ok(!keys.has(x.key), `${x.key} repeated`); keys.add(x.key); }
      total++; if (Math.abs(c.rating - (p.target + (i - 1) * HALF_WIDTH)) <= HALF_WIDTH * 1.5) near++;
    });
  }
  assert.ok(near / total > 0.85, `only ${near}/${total} cards near their target`);
});

test('Easier / Harder move the ratings down / up by about a step', () => {
  const mean = (level) => { let s = 0, n = 0; for (let seed = 1; seed <= 100; seed++) for (const r of ratingsOf(generatePanel({ prior, level, seed }))) { s += r; n++; } return s / n; };
  const [e, m, h] = [mean(-1), mean(0), mean(1)];
  assert.ok(e < m - 0.25 && m < h - 0.25, `${e} ${m} ${h}`);
  assert.ok(Math.abs((h - m) - STEP) < 0.35 && Math.abs((m - e) - STEP) < 0.35);
});

test('frozen cards are kept exactly, through a level change and a reroll', () => {
  const first = generatePanel({ prior, seed: 1 });
  const frozen = [null, first.cards[1], null];
  for (const [seed, level] of [[2, 0], [3, 2], [4, -2]]) {
    const p = generatePanel({ prior, seed, level, frozen });
    assert.equal(p.cards[1].parts.join(), first.cards[1].parts.join()); assert.equal(p.cards[1].frozen, true);
    assert.equal(p.cards[0].frozen, false);
    const keys = p.cards.flatMap((c) => c.parts.slice(1).map((id) => BY_ID.get(id).key));
    assert.equal(new Set(keys).size, keys.length, 'no key repeated next to a frozen card');
  }
});

test('ability: no history = 0, a strong history > 0, a weak one < 0, and it is bounded', () => {
  assert.equal(ability([], prior).theta, 0);
  const strong = Array.from({ length: 30 }, () => match({ stats: { kills: 600, gold: 800, leaks: 0, dmgDealt: 2e8, refreshes: 400, merges: 60, itemsEquipped: 150, bossDamage: 1e8, activatedLayers: 7000 }, layers: { yanShip: 999 }, hiddenCleared: true, perfectRounds: 12, risk: 20 }));
  const weak = Array.from({ length: 30 }, () => match({ win: false, rounds: 6, stats: { kills: 40, gold: 40, leaks: 40, dmgDealt: 1e5, refreshes: 5, merges: 2, itemsEquipped: 3, bossDamage: 0, activatedLayers: 20 }, layers: { yanShip: 20 }, nobodyOut: false, lpLost: 30, perfectRounds: 0 }));
  const s = ability(strong, prior), w = ability(weak, prior);
  assert.ok(s.theta > 0.5 && w.theta < -0.5, `${s.theta} ${w.theta}`);
  assert.ok(Math.abs(s.theta) <= 4 && s.se < 1);
  assert.ok(ability(strong.slice(0, 2), prior).theta < s.theta, 'a few matches move it less (the prior shrinks it)');
});

test('a stronger player gets harder cards (higher ratings) from the same seed', () => {
  const strong = Array.from({ length: 30 }, () => match({ stats: { kills: 600, gold: 800, leaks: 0, dmgDealt: 2e8, refreshes: 400, merges: 60, itemsEquipped: 150, bossDamage: 1e8, activatedLayers: 7000 }, layers: { yanShip: 999 }, hiddenCleared: true, perfectRounds: 12 }));
  const avg = (h) => { let s = 0, n = 0; for (let seed = 1; seed <= 60; seed++) for (const r of ratingsOf(generatePanel({ prior, history: h, seed }))) { s += r; n++; } return s / n; };
  assert.ok(avg(strong) > avg([]) + 0.5);
});

test('novelty: an Alliance the player always uses comes up less than a new one', () => {
  const hist = Array.from({ length: 40 }, () => match({ active: ['yanShip'], layers: { yanShip: 400 } }));
  const ps = playstyle(hist);
  const yan = [...BY_ID.values()].find((c) => c.bond === 'yanShip'), other = [...BY_ID.values()].find((c) => c.bond === 'sargonShip');
  assert.equal(ps.novelty(yan), 1); assert.ok(ps.novelty(other) > 1.5);
  assert.equal(ps.novelty(BY_ID.get('risk>=6')), 1);
  assert.equal(playstyle([]).novelty(other), 1);
  const count = (h, b) => { let n = 0; for (let seed = 1; seed <= 300; seed++) for (const c of generatePanel({ prior, history: h, level: 2, seed }).cards) if (c.parts.some((id) => BY_ID.get(id).bond === b)) n++; return n; };
  const control = Array.from({ length: 40 }, () => match({ active: ['sargonShip'], layers: { sargonShip: 400 } })); // same strength, another Alliance
  assert.ok(count(hist, 'yanShip') < count(control, 'yanShip'), 'Yan comes up less for a Yan player than for a Sargon player');
});

test('a generated card can be checked against a match', () => {
  const p = generatePanel({ prior, seed: 9 });
  for (const c of p.cards) { const v = check(c.parts.map((id) => BY_ID.get(id)), match()); assert.ok(v === true || v === false || v === null); }
});

import { META_CUSTOM, anyCustomId, resolve } from '../public/js/challenges/catalog.js';
import { makeAnyCustom, ANY_CUSTOM_RATING } from '../public/js/challenges/generate.js';

const MODDED = ['char_2012_typhon', 'char_4098_vvana', 'char_112_siege'];
const POOL = [...META_CUSTOM, ...MODDED, 'char_1_a', 'char_2_b', 'char_3_c', 'char_4_d', 'char_5_e'];

test('"field one of A, B, C": built from its id, true if one is on the final board, unknown without the board, never failed on a guess', () => {
  const id = anyCustomId(['char_b', 'char_a', 'char_c']);
  assert.equal(id, 'anyCustom:char_a,char_b,char_c');
  const c = resolve(id);
  assert.ok(c && c.dynamic && c.key === 'lineup:anyCustom');
  assert.equal(resolve(id), c, 'cached');
  assert.equal(c.test({ customIds: ['char_x', 'char_b'] }), true);
  assert.equal(c.test({ customIds: ['char_x'] }), null, 'not seen: unknown (the facts may hold only the final board), never failed');
  assert.equal(c.test({ customIds: null }), null);
  for (const bad of ['anyCustom:', 'anyCustom:char_a', 'anyCustom:b,a', 'anyCustom:char_a;rm,char_b', 'anyCustom:char_b,char_a', 'nonsense']) assert.equal(resolve(bad), null, bad);
});

test('the generator offers it only with a pool, at most once a panel, one with a module and a meta or a second module operator, rated by the placeholder', () => {
  const none = []; let seen = 0;
  for (let seed = 1; seed <= 300; seed++) none.push(...generatePanel({ prior, level: 1, seed }).cards.flatMap((c) => c.parts));
  assert.ok(!none.some((id) => id.startsWith('anyCustom:')), 'no pool, no card');
  for (let seed = 1; seed <= 300; seed++) {
    const p = generatePanel({ prior: { ...prior, customPool: POOL }, level: 1, seed });
    const a = p.cards.flatMap((c) => c.parts).filter((id) => id.startsWith('anyCustom:'));
    assert.ok(a.length <= 1);
    for (const id of a) {
      seen++;
      const ids = id.slice('anyCustom:'.length).split(',');
      assert.equal(ids.length, 3);
      assert.ok(ids.some((x) => MODDED.includes(x)), `${id}: one has a module`);
      assert.ok(ids.some((x) => META_CUSTOM.includes(x)) || ids.filter((x) => MODDED.includes(x)).length >= 2, `${id}: a meta operator or a second module`);
      assert.equal(new Set(ids).size, 3);
      const card = p.cards.find((c) => c.parts.includes(id));
      assert.equal(card.parts[0] === 'win' || card.parts[0] === 'winHidden', true, 'only with a win outcome');
      assert.ok(Math.abs(card.rating - ratingOf(card.parts.map((x) => resolve(x)), prior)) < 1e-9, 'the rating counts the placeholder for it');
    }
  }
  assert.ok(seen > 10, `offered ${seen} times in 300 panels`);
  assert.deepEqual(generatePanel({ prior: { ...prior, customPool: POOL }, seed: 9 }), generatePanel({ prior: { ...prior, customPool: POOL }, seed: 9 }));
  assert.equal(makeAnyCustom(META_CUSTOM, () => 0.5), null, 'a pool without a module operator');
});
