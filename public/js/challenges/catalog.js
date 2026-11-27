// The challenge catalog: every OUTCOME and every CONDITION a challenge can be made of (fish-edition/untracked/
// challenge-system-draft.md §3), as plain data plus a pure `test(facts)` per instance (facts.js). No texts here: the panel
// words them (with i18n); this file only says what exists, what it checks and what may be combined.
//
// An instance is one condition at one parameter, e.g. `risk>=6` or `bond:yanShip>=300`. `test` returns true / false, or
// null when the facts do not hold what it needs ("unknown": a challenge with an unknown condition is never completed by
// that match and is never counted as failed either).
// `kind`: 'setting' = something the player chooses before the match (difficulty, players, rules), 'performance' = something
// the match has to produce (stacks, funds, kills). The ratings prior treats them differently (tools/challenge-prior.mjs).
// `group` + `key`: what may not be combined (conflicts below). `needsPrior: false` = no source for a rating yet, so the
// generator must not offer it (the boss fight's duration is recorded since #192 P6 (result.bossSeconds) but there are no matches yet to rate it from; match length is not in the server records).

import { RULES } from '../../../shared/rules.js';

const R = RULES.filter((r) => r.category === 'risk').map((r) => [r.key, (r.risk?.length ?? 1) - 1]);
/** Alliance ids whose layers a match shows and counts (data/bonds.json: not `noStack`). */
export const STACK_BONDS = ['yanShip', 'sargonShip', 'victoriaShip', 'kjeragShip', 'lateranoShip', 'egirShip', 'siracusaShip', 'kazimierzShip',
  'preciShip', 'swiftShip', 'skillfulShip', 'arcaneShip', 'steadShip', 'deputShip', 'visiShip', 'miraShip', 'investShip', 'raidShip', 'indomShip'];
/** The stack ladder: layers stop at 999 in an official match (a 1000 target cannot be met without cheats). */
export const LAYER_LADDER = [100, 200, 300, 500, 800];
export const STAT_LADDERS = {
  dmgDealt: [1e6, 5e6, 2e7, 5e7, 1e8], kills: [100, 200, 300, 400, 500], gold: [100, 200, 300, 500, 800], refreshes: [20, 50, 100, 200],
  merges: [10, 20, 40], itemsEquipped: [10, 25, 50, 100], bossDamage: [1e6, 1e7, 3e7, 6e7], activatedLayers: [500, 1500, 3000, 6000],
};
const LEAK_LADDER = [0, 5, 15];

const ge = (v, n) => (v == null ? null : v >= n);
const inst = (id, group, kind, param, test, extra = {}) => ({ id, group, key: extra.key ?? group, kind, param, test, needsPrior: true, ...extra });

/** Outcomes (exactly one per challenge). */
export const OUTCOMES = [
  inst('win', 'outcome', 'performance', null, (f) => f.win, { key: 'outcome' }),
  inst('winHidden', 'outcome', 'performance', null, (f) => f.win && f.hiddenCleared, { key: 'outcome' }),
  ...[10, 12, 14].map((n) => inst(`rounds>=${n}`, 'outcome', 'performance', n, (f) => f.rounds >= n, { key: 'outcome' })),
];

/** Every condition instance. */
export const CONDITIONS = [
  ...[2, 3, 4].map((n) => inst(`difficulty>=${n}`, 'difficulty', 'setting', n, (f) => (f.difficulty ? f.difficulty >= n : null))),
  inst('solo', 'players', 'setting', null, (f) => f.solo, { key: 'players' }),
  ...[2, 3, 4].map((n) => inst(`humans>=${n}`, 'players', 'setting', n, (f) => f.humans >= n)),
  inst('noCheats', 'cheats', 'setting', null, (f) => !f.cheats),
  ...[2, 4, 6, 8, 10, 12, 15].map((n) => inst(`risk>=${n}`, 'risk', 'setting', n, (f) => f.risk >= n)),
  ...R.flatMap(([k, max]) => Array.from({ length: max }, (_, i) => i + 1).map((lv) => inst(`tag:${k}>=${lv}`, 'tag', 'setting', lv, (f) => (f.tags?.[k] ?? 0) >= lv, { key: `tag:${k}` }))),
  inst('nobodyOut', 'safety', 'performance', null, (f) => f.nobodyOut, { key: 'nobodyOut' }),
  inst('noLpLost', 'safety', 'performance', null, (f) => (f.lpLost == null ? null : f.lpLost === 0), { key: 'noLpLost' }),
  ...[3, 6, 10].map((n) => inst(`perfectRounds>=${n}`, 'safety', 'performance', n, (f) => ge(f.perfectRounds, n), { key: 'perfectRounds' })),
  ...STACK_BONDS.flatMap((b) => LAYER_LADDER.map((n) => inst(`bond:${b}>=${n}`, 'bond', 'performance', n, (f) => (f.layers ? (f.layers[b] ?? 0) >= n : null), { key: `bond:${b}`, bond: b }))),
  ...STACK_BONDS.map((b) => inst(`bondActive:${b}`, 'bond', 'performance', null, (f) => (f.active ? f.active.includes(b) : null), { key: `bond:${b}`, bond: b })),
  ...[3, 5, 7, 9].map((n) => inst(`bondsActive>=${n}`, 'bondCount', 'performance', n, (f) => (f.active ? f.active.length >= n : null))),
  ...Object.entries(STAT_LADDERS).flatMap(([s, ladder]) => ladder.map((n) => inst(`${s}>=${n}`, 'stat', 'performance', n, (f) => ge(f.stats?.[s], n), { key: `stat:${s}` }))),
  ...LEAK_LADDER.map((n) => inst(`leaks<=${n}`, 'stat', 'performance', n, (f) => (f.stats?.leaks == null ? null : f.stats.leaks <= n), { key: 'stat:leaks' })),
  ...[2, 4, 6].map((n) => inst(`golden>=${n}`, 'lineup', 'performance', n, (f) => ge(f.golden, n), { key: 'lineup:golden' })),
  inst('custom>=1', 'lineup', 'performance', 1, (f) => ge(f.custom, 1), { key: 'lineup:custom' }),
  // no source for a rating yet (needsPrior false): kept so the catalog is the whole list of what is planned
  ...[20, 30, 45, 60].map((n) => inst(`minutes<=${n}`, 'time', 'performance', n, (f) => (f.durationMin == null ? null : f.durationMin <= n), { key: 'minutes', needsPrior: false })),
  ...[30, 60, 120].map((n) => inst(`bossSeconds<=${n}`, 'time', 'performance', n, (f) => (f.bossSeconds == null ? null : f.bossSeconds <= n), { key: 'bossSeconds', needsPrior: false })),
];

export const ALL = [...OUTCOMES, ...CONDITIONS];
export const BY_ID = new Map(ALL.map((c) => [c.id, c]));

/**
 * The "meta" custom (自选) operators (Fish, 2026-11-26: roughly the ones left unbuffed and the popular picks). A "field one of A, B or C"
 * card always holds at least one of them, so the condition is easy to meet. Talulah is char_4247_oxi, Tragodia char_1042_phatm2.
 */
export const META_CUSTOM = Object.freeze(['char_1050_chen3', 'char_4182_oblvns', 'char_4231_clemnt', 'char_4247_oxi', 'char_1035_wisdel', 'char_377_gdglow',
  'char_4133_logos', 'char_1042_phatm2', 'char_4202_haruka', 'char_1015_aglna2', 'char_2027_wang', 'char_4132_ascln']);
const ANY_PREFIX = 'anyCustom:';
/** The id of the "one of these custom operators was fielded at some point of the match" condition (ids sorted: one id per set). True or unknown, never false: the facts may hold only the final board. */
export const anyCustomId = (charIds) => ANY_PREFIX + [...charIds].sort().join(',');
const dynamic = new Map();
/** An instance by id: the fixed ones of the list, or one "field one of …" condition built from its id (null for anything else). */
export function resolve(id) {
  const c = BY_ID.get(id);
  if (c || typeof id !== 'string' || !id.startsWith(ANY_PREFIX)) return c ?? null;
  if (dynamic.has(id)) return dynamic.get(id);
  const ids = id.slice(ANY_PREFIX.length).split(',').filter((x) => /^char_[0-9a-z_]+$/.test(x));
  const inst = ids.length >= 2 && ids.length <= 4 && anyCustomId(ids) === id
    ? { id, group: 'lineup', key: 'lineup:anyCustom', kind: 'performance', param: ids, needsPrior: false, dynamic: true,
      test: (f) => (Array.isArray(f.customIds) && ids.some((x) => f.customIds.includes(x)) ? true : null) }
    : null;
  dynamic.set(id, inst);
  return inst;
}

/** Per-group limits on how many conditions of that group one challenge may hold. */
const GROUP_MAX = { tag: 2, bond: 2, stat: 2, safety: 2, lineup: 2 };

/**
 * May `b` join a challenge that already holds `held` (a list of instances)? Never two of the same key (two stat targets
 * on the same stat, two stacks of one Alliance), never a contradiction (Solo + several humans), at most GROUP_MAX per group,
 * "Rounds >= N" outcomes never with a hidden-core outcome.
 */
export function compatible(held, b) {
  for (const a of held) {
    if (a.id === b.id || a.key === b.key) return false;
  }
  if (b.id === 'solo' && held.some((a) => a.key === 'players')) return false;
  if (b.key === 'players' && held.some((a) => a.id === 'solo')) return false;
  if (b.id === 'noCheats' && held.some((a) => a.group === 'cheats')) return false;
  if (b.group in GROUP_MAX && held.filter((a) => a.group === b.group).length >= GROUP_MAX[b.group]) return false;
  // a Risk total and a single tag of the same size say nearly the same thing: one of them, not both
  if (b.group === 'risk' && held.some((a) => a.group === 'tag')) return false;
  if (b.group === 'tag' && held.some((a) => a.group === 'risk')) return false;
  return true;
}

/** Does the match satisfy the whole challenge? true / false, or null when any part is unknown (and none failed). */
export function check(parts, facts) {
  let unknown = false;
  for (const p of parts) {
    const v = p.test(facts);
    if (v === false) return false;
    if (v == null) unknown = true;
  }
  return unknown ? null : true;
}
