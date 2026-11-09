// (fork) The Operator Loadout's voice rule (public/js/ui/loadoutVoice.js): 选中干员 once per visit, rotating when re-armed;
// an outfit change with its own voice set always speaks, any other is an interaction; silent edits re-arm. Driven with a fake audio manager —
// the click tables of Dev 5's proposal (side-session notes, loadout-voice-proposal.md §4) and the outfit cases.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createLoadoutVoice } from '../../public/js/ui/loadoutVoice.js';

/** A fake manager: `sets[id][slot]` = the slot's line count; every voice() call is logged as 'id slot#i'. */
function fakeAudio(sets) {
  const said = [];
  return {
    said,
    voiceCount: (charId, slot, key) => sets[key || charId]?.[slot] || 0,
    voice(charId, slot, o) {
      assert.equal(o.takeover, true, 'the newest line cuts the one on air off');
      said.push(`${o.voiceKey || charId} ${slot}#${o.line}`);
      return true;
    },
  };
}
const OPS = {
  skadi: { select: 2, place: 2, skill1: 1, skill2: 1, skill3: 1 },
  exu: { select: 2, place: 2, skill1: 1 },
  mly: { select: 2, place: 2 },
  'skadi#red': { select: 2, place: 2, skill1: 1 },     // an outfit with its own voice set
  'mly#half': { skill1: 1, start: 1 },                 // an own set without 选中干员 / 部署 lines
};
const rec = (charId) => ({ charId });

/** The clicks: open / outfit, a skill or module pick (the deck's keys, or a Custom Squad pick's), any other edit. */
const VERBS = {
  open: (v, id) => v.open(rec(id)),
  outfit: (v, id) => v.outfit(rec(id)),
  skill: (v, id) => v.touch(rec(id), { skill: 1 }),
  module: (v, id) => v.touch(rec(id), { module: 'uniequip_x' }),
  diySkill: (v, id) => v.touch(rec(id), { skillIndex: 2 }),
  diyModule: (v, id) => v.touch(rec(id), { uniEquipId: null }),
  touch: (v, id) => v.touch(rec(id), { potential: 3 }),     // a potential / level edit
};
/** Run a click sequence: [verb, charId]; returns what each click said (null = silent). */
function run(v, a, clicks) {
  return clicks.map(([verb, id]) => {
    const n = a.said.length;
    VERBS[verb](v, id);
    return a.said.length > n ? a.said.slice(n).join(', ') : null;
  });
}

describe('Operator Loadout voice: once per visit, rotating (B+A)', () => {
  test('the proposal\'s click table: the first touch speaks, the same operator stays quiet, another one re-arms it', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [
      ['open', 'skadi'],   // 1. Skadi's card
      ['skill', 'skadi'],  // 2. skill → S3
      ['module', 'skadi'], // 3. module → X
      ['open', 'skadi'],   // 4. close, open again
      ['open', 'exu'],     // 5. Exusiai's card (Skadi re-armed)
      ['skill', 'exu'],    // 6. skill → S2
      ['open', 'skadi'],   // 7. Skadi's card: her next line, not the last one
      ['skill', 'skadi'],  // 8. skill → S1
      ['open', 'exu'],     // 9. Exusiai again: her second line
      ['open', 'skadi'],   // 10. Skadi: back to her first
    ]), ['skadi select#0', null, null, null, 'exu select#0', null, 'skadi select#1', null, 'exu select#1', 'skadi select#0']);
  });

  test('a silent edit of another operator (potential, level) re-arms it', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [['open', 'skadi'], ['touch', 'exu'], ['open', 'skadi'], ['open', 'skadi']]),
      ['skadi select#0', null, 'skadi select#1', null]);
  });

  test("the first skill or module change of a visit counts as opening the operator (the user's call of 2026-11-09)", () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [
      ['skill', 'skadi'],     // Skadi: a card-face skill first → her select line
      ['module', 'skadi'],    // then a module → silent
      ['open', 'skadi'],      // and her card → silent (the same visit)
      ['module', 'exu'],      // Exusiai: a module first → her select line
      ['skill', 'exu'],       // silent
      ['skill', 'skadi'],     // Skadi re-armed: her other line
      ['diySkill', 'mly'],    // a Custom Squad pick's skill
      ['diyModule', 'mly'],   // silent
      ['diyModule', 'exu'],   // a Custom Squad pick's module, Exusiai re-armed
    ]), ['skadi select#0', null, null, 'exu select#0', null, 'skadi select#1', 'mly select#0', null, 'exu select#1']);
  });

  test('never the same line twice in a row for one operator, also with a single-line pool around it', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    const out = [];
    for (let i = 0; i < 6; i++) out.push(...run(v, a, [['open', 'mly'], ['open', 'exu']]));
    const mly = out.filter((x) => x?.startsWith('mly'));
    assert.equal(mly.length, 6);
    for (let i = 1; i < mly.length; i++) assert.notEqual(mly[i], mly[i - 1], `visit ${i + 1}`);
  });

  test('an operator without voice stays silent, but touching it re-arms the one before', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [['open', 'skadi'], ['open', 'char_600_cpione'], ['open', 'skadi']]),
      ['skadi select#0', null, 'skadi select#1']);
  });

  test('a fresh Operator Loadout (reset) lets the same operator speak again', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    run(v, a, [['open', 'skadi']]);
    v.reset();
    assert.deepEqual(run(v, a, [['open', 'skadi']]), ['skadi select#1']);
  });

  test('a card opened on an outfit with its own voice set says that set\'s 选中干员', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, (id) => (id === 'skadi' ? 'skadi#red' : null));
    assert.deepEqual(run(v, a, [['open', 'skadi']]), ['skadi#red select#0']);
  });
});

describe('Operator Loadout voice: outfit changes', () => {
  test('an outfit without its own voice, or the default look, is an ordinary interaction: Exusiai, 3 changes, 1 line', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [
      ['outfit', 'exu'],   // the first interaction of the visit: her select line
      ['outfit', 'exu'],   // silent
      ['outfit', 'exu'],   // silent (back to the default look)
      ['open', 'exu'],     // still the same visit: silent
      ['open', 'skadi'],   // another operator re-arms her
      ['outfit', 'exu'],   // the first interaction again: her other line
    ]), ['exu select#0', null, null, null, 'skadi select#0', 'exu select#1']);
  });

  test('Mudrock: to an outfit with its own voice speaks in it, also inside a visit; back to the default look is silent', () => {
    let worn = null;
    const a = fakeAudio({ ...OPS, mud: { select: 2, place: 2 }, 'mud#1': { select: 2, place: 2 } });
    const v = createLoadoutVoice(a, (id) => (id === 'mud' ? worn : null));
    const out = [];
    out.push(...run(v, a, [['open', 'mud']]));
    worn = 'mud#1'; out.push(...run(v, a, [['outfit', 'mud']]));   // Silent Night (own set)
    out.push(...run(v, a, [['outfit', 'mud']]));                    // Rubble (the same own set)
    worn = null; out.push(...run(v, a, [['outfit', 'mud']]));       // the default look: an interaction inside the visit
    assert.deepEqual(out, ['mud select#0', 'mud#1 select#0', 'mud#1 select#1', null]);
  });

  test('an own-voice outfit as the first interaction arms the visit: opening the card next is silent', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, (id) => (id === 'skadi' ? 'skadi#red' : null));
    assert.deepEqual(run(v, a, [['outfit', 'skadi'], ['open', 'skadi'], ['skill', 'skadi'], ['outfit', 'skadi']]),
      ['skadi#red select#0', null, null, 'skadi#red select#1']);
  });

  test('an own set without 选中干员 / 部署 lines: at least a line of that set (the user\'s call of 2026-11-09)', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, (id) => (id === 'mly' ? 'mly#half' : null));
    assert.deepEqual(run(v, a, [['outfit', 'mly'], ['outfit', 'mly']]), ['mly#half start#0', 'mly#half skill1#0']);
  });

  test('an outfit change touches its operator: it re-arms the one before, and opening it next is silent', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [['open', 'skadi'], ['outfit', 'exu'], ['open', 'exu'], ['open', 'skadi']]),
      ['skadi select#0', 'exu select#0', null, 'skadi select#1']);
  });

  test('an operator with no lines at all: an outfit change stays silent', () => {
    const a = fakeAudio(OPS);
    const v = createLoadoutVoice(a, () => null);
    assert.deepEqual(run(v, a, [['outfit', 'char_600_cpione']]), [null]);
  });
});
