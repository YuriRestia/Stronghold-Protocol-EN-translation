// test/match/iso-plus.test.js — the Damazti Isomorph+ cheat (shared/rules.js isoPlus, shared/ruleData.js ISO_PLUS;
// GitHub #134): worn with the Isomorph, more items that sound like an Alliance's make the holder its member. The pair is
// a `morphBondId`, not a `giveBondId`, so the item is still no bond item of its own (shop bias, Victoria Mod C, bots).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { ruleDataPatch, ISO_PLUS, isoPlusBond } from '../../shared/ruleData.js';
import { pieceBonds } from '../../server/match/bondsMeta.js';
import { unitBonds } from '../../server/sim/content/support/index.js';

const ISO = ISO_PLUS.morphIds[0];
const STEAM = 'chess_item_6_05_e_a';   // Steam Heart → Victoria
const ACCEL = 'chess_item_4_03_e_b';   // Miniature Accelerator → Agile (++ only)

test('the patch: + pairs, ++ adds its own, the Isomorph\'s name gets the mark; off changes nothing', () => {
  const h = makeMatch({ mode: 'solo', seed: 3 });
  try {
    const plus = ruleDataPatch(h.m.data, { isoPlus: 'plus' });
    assert.equal(plus.items[STEAM].morphBondId, 'victoriaShip');
    assert.equal(plus.items[STEAM].giveBondId ?? null, null, 'not a bond item of its own');
    assert.equal(plus.items[ACCEL], undefined);
    assert.match(plus.items[ISO].name, /[^+]\+$/);
    const pp = ruleDataPatch(h.m.data, { isoPlus: 'plusplus' });
    assert.equal(pp.items[ACCEL].morphBondId, 'skillfulShip');
    assert.match(pp.items[ISO].name, /\+\+$/);
    assert.deepEqual(Object.keys(ruleDataPatch(h.m.data, { isoPlus: 'off' }).items), []);
    for (const base of Object.keys({ ...ISO_PLUS.plus, ...ISO_PLUS.plusplus })) assert.ok(h.m.gd.item(`${base}_a`), base);
  } finally { h.m.dispose(); }
});

test('a match: the Isomorph + Steam Heart make a Victoria member; either alone, or without the rule, does not', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { isoPlus: 'plus' } });
  const plain = makeMatch({ mode: 'solo', seed: 3 });
  try {
    const id = Object.values(h.m.data.chess).find((r) => Array.isArray(r.bonds) && !r.bonds.includes('victoriaShip')).id;
    const piece = (items) => ({ kind: 'chess', id, items: items.map((i) => ({ id: i })) });
    assert.ok(pieceBonds(h.m.gd, piece([ISO, STEAM]), h.m.rules).includes('victoriaShip'));
    assert.ok(!pieceBonds(h.m.gd, piece([STEAM]), h.m.rules).includes('victoriaShip'));
    assert.ok(!pieceBonds(h.m.gd, piece([ISO, ACCEL]), h.m.rules).includes('skillfulShip'), '++ only');
    assert.ok(!pieceBonds(plain.m.gd, piece([ISO, STEAM]), plain.m.rules).includes('victoriaShip'));
  } finally { h.m.dispose(); plain.m.dispose(); }
});

test('a battle (unpatched records) pairs from the rule', () => {
  assert.equal(isoPlusBond(STEAM, 'plus'), 'victoriaShip');
  assert.equal(isoPlusBond(ACCEL, 'plus'), null);
  assert.equal(isoPlusBond(ACCEL, 'plusplus'), 'skillfulShip');
  assert.equal(isoPlusBond(STEAM, 'off'), null);
  const unit = (iso) => ({ kind: 'op', def: { bonds: [] }, items: [ISO, STEAM], player: iso ? { isoPlus: iso } : {} });
  assert.deepEqual([...unitBonds(unit('plus'))], ['victoriaShip']);
  assert.deepEqual([...unitBonds(unit(null))], []);
});
