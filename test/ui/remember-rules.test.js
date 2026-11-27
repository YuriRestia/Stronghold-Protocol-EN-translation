// GitHub #143: a host's new room starts with the last used lobby rules (this browser's `sp.pref.lobby.rules`), and the
// rules dialog can clear them all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES } from '../../shared/rules.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { RULES_PREF, rememberedRules, rulesToRestore, restoreAction, CLEARED_RULES } = await import('../../public/js/ui/lobbyRules.js');
const KEY = `sp.pref.${RULES_PREF}`;

test('the remembered rules are checked: unknown keys and bad values from an older version are dropped', () => {
  mem.clear();
  assert.equal(rememberedRules(), null);
  mem.set(KEY, JSON.stringify({ extraFunds: true, ccLastLine: 1, notARule: 5, doubleLp: 'yes' }));
  const r = rememberedRules();
  assert.equal(r.extraFunds, true);
  assert.equal(r.ccLastLine, 1);
  assert.equal(r.doubleLp, DEFAULT_RULES.doubleLp);
  assert.equal('notARule' in r, false);
  assert.deepEqual(rulesToRestore(r), { extraFunds: true, ccLastLine: 1 }, 'only what differs from the original game');
  assert.deepEqual(rulesToRestore(null), {});
});

test('a host\'s new plain room gets them once; a searching room, a guest, a room with rules of its own don\'t', () => {
  const remembered = { ...DEFAULT_RULES, extraFunds: true };
  const seen = new Set();
  const room = { code: 'AAAA', rules: { ...DEFAULT_RULES } };
  assert.deepEqual(restoreAction(room, true, remembered, seen), { apply: { extraFunds: true }, save: false }, 'applied, and the default state is not saved over them');
  assert.deepEqual(restoreAction({ ...room, rules: { ...DEFAULT_RULES, extraFunds: true } }, true, remembered, seen), { apply: null, save: true }, 'once per room; from then on each change is saved');
  assert.deepEqual(restoreAction({ code: 'BBBB', rules: { ...DEFAULT_RULES } }, false, remembered, seen), { apply: null, save: false }, 'a guest never applies');
  assert.deepEqual(restoreAction({ code: 'CCCC', rules: { ...DEFAULT_RULES }, searching: true }, true, remembered, seen).apply, null, 'searching plays the original game');
  assert.deepEqual(restoreAction({ code: 'DDDD', rules: { ...DEFAULT_RULES, doubleLp: true } }, true, remembered, seen), { apply: null, save: true }, 'a room that already has rules keeps them');
  assert.deepEqual(restoreAction({ code: 'EEEE', rules: { ...DEFAULT_RULES } }, true, null, seen), { apply: null, save: true }, 'nothing remembered: nothing to apply');
});

test('"clear all" sets every rule back to the original game', () => {
  assert.deepEqual({ ...CLEARED_RULES }, { ...DEFAULT_RULES });
});
