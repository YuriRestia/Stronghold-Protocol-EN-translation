// test/sim/fx-states.test.js — (fork) b.snap `fxs`: the official lasting effects whose moment the client never sees
// (effect gaps audit 2, item 4). Battle.fxState / Battle.fxProbe / a buff's `fx` → snapshot.js fxStateView, display only:
// the kits that signal them (Horn's overload, Leizi the Thunderbringer's charge rings via content/fxStates.js), the
// rows' life (deployment, `dur`), and that every buff a kit signals is one the client's STATE_BUFFS knows (and back).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { BattleEvents } from '../../server/sim/battle/events.js';
import { SKILL_FX_STATES, TOKEN_FX_STATES, installFxStates } from '../../server/sim/content/fxStates.js';
import { LIBRATOR_FX } from '../../server/sim/professions.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';
import { ENEMY_STATE_KEYS } from '../../public/js/render/vfx/indexGaps.js';

const rowsOf = (snap, id) => (snap.fxs || []).filter((r) => r[0] === id).map((r) => r.slice(1));

describe('Battle.fxState / fxProbe / a buff\'s fx → fxStateView', () => {
  const fake = () => ({ time: 10 });
  const unit = (o = {}) => ({ id: 7, deploySeq: 1, buffs: [], ...o });
  const fxState = (b, ...a) => BattleEvents.prototype.fxState.call(b, ...a);
  const fxProbe = (b, ...a) => BattleEvents.prototype.fxProbe.call(b, ...a);

  test('a state lasts until turned off; src (null for the carrier itself) and look ride along', () => {
    const b = fake(), u = unit();
    fxState(b, u, 'x[a]', true, { src: { id: 3 }, look: 'max' });
    fxState(b, u, 'x[b]', true, { src: u });
    assert.deepEqual(fxStateView(u, 10), [['x[a]', 3, 'max'], ['x[b]', null, null]]);
    fxState(b, u, 'x[a]', false);
    assert.deepEqual(fxStateView(u, 10), [['x[b]', null, null]]);
  });
  test('`dur` ends it by itself; a later deployment of the unit drops it', () => {
    const b = fake(), u = unit();
    fxState(b, u, 'x[t]', true, { dur: 3 });
    assert.equal(fxStateView(u, 12.9).length, 1);
    assert.equal(fxStateView(u, 13), null);
    fxState(b, u, 'x[d]', true);
    u.deploySeq = 2;
    assert.equal(fxStateView(u, 10), null);
  });
  test('a probe is read at the snapshot: false / null none, true no look, else the look; one per buff', () => {
    const b = fake(), u = unit({ n: 0 });
    fxProbe(b, u, 'p', (x) => (x.n > 1 ? x.n : x.n === 1 ? true : null));
    assert.equal(fxStateView(u, 0), null);
    u.n = 1; assert.deepEqual(fxStateView(u, 0), [['p', null, null]]);
    u.n = 2; assert.deepEqual(fxStateView(u, 0), [['p', null, 2]]);
    fxProbe(b, u, 'p', () => false);
    assert.equal(fxStateView(u, 0), null);
  });
  test('a summon wears the skill buffs of its owner while that skill runs, src the owner (TOKEN_FX_STATES)', () => {
    const probes = [];
    const b = { fxProbe: (...a) => { fxProbe(b, ...a); probes.push(a[1]); } };
    const owner = { id: 5, alive: true, skill: { id: 'skchr_ling_1', active: false } };
    const tok = unit({ id: 9, kind: 'token', ownerUnit: owner });
    installFxStates(b, tok);
    assert.deepEqual(probes, TOKEN_FX_STATES.skchr_ling_1);
    assert.equal(fxStateView(tok, 0), null, 'the skill off');
    owner.skill.active = true;
    assert.deepEqual(fxStateView(tok, 0), [['ling_s_1', 5, null], ['ling_s_1[effect]', 5, null]]);
    owner.alive = false;
    assert.equal(fxStateView(tok, 0), null, 'the owner gone');
  });
  test('a buff tagged `fx` shows while it lasts, with its src and look', () => {
    const u = unit({ buffs: [{ fx: 'b[x]', fxSrc: 4, fxLook: 'on' }, { fx: null }] });
    assert.deepEqual(fxStateView(u, 0), [['b[x]', 4, 'on']]);
  });
});

describe('the kits signal their moments (b.snap fxs)', () => {
  test('Horn S3: the overload glow from the second half of the skill to its end', () => {
    const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_5_08_a', skillIndex: 2, row: 10, col: 3 }],
      defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } } });
    h.step();
    const u = h.unit(1);
    h.spawn('dummy', { pos: [10, 4] });
    u.skill.activate('test', { free: true });
    h.step();
    assert.ok(u.skill.active, 'S3 starts');
    assert.deepEqual(rowsOf(h.b.snapshot(), u.id), [], 'no overload yet');
    assert.ok(h.runUntil(() => u.mem.overload, 40), 'the overload comes');
    assert.deepEqual(rowsOf(h.b.snapshot(), u.id), [['horn_s_3[overload_start_effect_2]', null, null]]);
    assert.ok(h.runUntil(() => !u.skill.active, 40), 'the skill ends');
    assert.deepEqual(rowsOf(h.b.snapshot(), u.id), []);
    assert.equal(h.b.drainEvents().filter((e) => e[0] === 'fx' && e[1] === 'state').length, 0, 'no event: the snapshot carries it');
    checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
  });
  test('Leizi the Thunderbringer S1: a ring per stored charge (content/fxStates.js)', () => {
    const h = makeBattle({ autoFinish: false, flags: { dpPerSec: 0, dpMax: 999 },
      units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_1043_leizi2', skillIndex: 0 }, elite: true, row: 10, col: 5 }] });
    h.step();
    const u = h.unit(1);
    for (const [n, want] of [[0, []], [1, [[SKILL_FX_STATES.skchr_leizi2_1.buff, null, 1]]], [3, [[SKILL_FX_STATES.skchr_leizi2_1.buff, null, 3]]]]) {
      u.skill.charges = n;
      assert.deepEqual(rowsOf(h.b.snapshot(), u.id), want, `${n} charges`);
    }
  });
});

describe('marks on targets: the kits name the carrier (effect gaps audit 2, item 5)', () => {
  test('Mostima S2: the lock glow on each enemy it stuns, src Mostima, gone with the skill', () => {
    const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: 'chess_char_4_02_a', skillIndex: 1, row: 10, col: 3 }],
      defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } } });
    h.step();
    const u = h.unit(1);
    assert.equal(u.skill.id, 'skchr_mostma_2');
    const e = h.spawn('dummy', { pos: [10, 4] });
    u.skill.activate('test', { free: true });
    h.step(); h.step();
    assert.ok(u.skill.active, 'S2 runs');
    assert.deepEqual(rowsOf(h.b.snapshot(), e.id), [['mostma_s_1', u.id, null]]);
    assert.ok(h.runUntil(() => !u.skill.active, 40), 'the skill ends');
    h.step();
    assert.deepEqual(rowsOf(h.b.snapshot(), e.id), []);
    checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
  });
});

describe('talent and skill states the kits signal (audit #7 phase D)', () => {
  test("Heavyrain S2 (Season 1): zebra_s_2[aura] on her and each ally it hides, src Heavyrain, gone with the skill", async () => {
    const { VERSION_KITS } = await import('../../server/sim/content/kits/index.js');
    const s1 = JSON.parse(readFileSync(new URL('../../data/versions/act1autochess/chess.json', import.meta.url), 'utf8'));
    const h = makeBattle({ autoFinish: false, defs: { chess: { chess_char_2_08_a: (s1.units || s1).chess_char_2_08_a } },
      kits: { chess_char_2_08: VERSION_KITS.char_304_zebra },
      units: [{ uid: 1, chessId: 'chess_char_2_08_a', skillIndex: 1, row: 10, col: 3 }, { uid: 2, chessId: 'chess_char_4_02_a', skillIndex: 0, row: 10, col: 4 }] });
    h.step();
    const u = h.unit(1), ally = h.unit(2);
    u.skill.activate('test', { free: true });
    h.step();
    assert.deepEqual(rowsOf(h.b.snapshot(), u.id), [['zebra_s_2[aura]', null, null]], 'on her (her own: no src)');
    assert.deepEqual(rowsOf(h.b.snapshot(), ally.id), [['zebra_s_2[aura]', u.id, null]], 'on the ally beside her');
    assert.ok(h.runUntil(() => !u.skill.active, 60), 'the skill ends');
    h.step();
    assert.deepEqual([rowsOf(h.b.snapshot(), u.id), rowsOf(h.b.snapshot(), ally.id)], [[], []]);
  });
});

describe('the sim and the client name the same buffs', () => {
  const kits = new URL('../../server/sim/content/kits/ops/', import.meta.url);
  // (fork) and the enemies' kits (content/enemies/*.js: OpFor: BlackCloud's grab and ammo glow; the enemy VFX audit's S
  // rows) and the bosses' (content/bosses.js: 'Armor Cleaver' / 'Armor Crusher' shot down), and the tokens' (content/tokens.js:
  // Yan's Protection's channel)
  const ekits = new URL('../../server/sim/content/enemies/', import.meta.url);
  const src = [...readdirSync(kits).map((f) => readFileSync(new URL(f, kits), 'utf8')),
    ...readdirSync(ekits).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, ekits), 'utf8')),
    readFileSync(new URL('../../server/sim/content/bosses.js', import.meta.url), 'utf8')].join('\n');
  // every literal buff key a kit hands fxState / fxProbe (or ?.() for a light battle) / a buff's fx, or a const holding one (…_FX = '…')
  const named = new Set([...src.matchAll(/(?:fxState|fxProbe)(?:\?\.)?\([^,]+,\s*'([^']+)'|fx:\s*'([^']+)'|_FX\s*=\s*'([^']+)'|\b(?:s1|s2|s3):\s*'(tocka_[^']+)'/g)]
    .map((m) => m[1] || m[2] || m[3] || m[4]));
  // (the tokens: only their …_FX consts — their `fx:` keys are kit fx kinds, not buffs)
  for (const m of readFileSync(new URL('../../server/sim/content/tokens.js', import.meta.url), 'utf8').matchAll(/_FX\s*=\s*'([^']+)'/g)) named.add(m[1]);
  // … or a const list of them (…_FX = Object.freeze(['…', …]))
  for (const m of src.matchAll(/_FX\s*=\s*Object\.freeze\(\[(.*?)\]\)/g)) for (const k of m[1].matchAll(/'([^']+)'/g)) named.add(k[1]);
  for (const s of Object.values(SKILL_FX_STATES)) for (const e of [].concat(s)) named.add(e.buff);
  for (const list of Object.values(TOKEN_FX_STATES)) for (const b of list) named.add(b);
  for (const b of Object.values(LIBRATOR_FX)) named.add(b);
  // (fork) or in the index-gap fallback (render/vfx/indexGaps.js ENEMY_STATE_KEYS: the props' idle loops, Rotchaser's bleed …)
  test('each signalled buff is in STATE_BUFFS or ENEMY_STATE_KEYS', () => {
    for (const b of named) assert.ok(STATE_BUFFS[b] || ENEMY_STATE_KEYS[b], `${b}: signalled by the sim, unknown to the client`);
  });
  test('each ENEMY_STATE_KEYS buff is signalled by the sim', () => {
    for (const b of Object.keys(ENEMY_STATE_KEYS)) assert.ok(named.has(b), `${b}: in ENEMY_STATE_KEYS, signalled by no kit`);
  });
  test('each STATE_BUFFS buff is signalled by the sim', () => {
    for (const b of Object.keys(STATE_BUFFS)) assert.ok(named.has(b), `${b}: in STATE_BUFFS, signalled by no kit`);
  });
});
