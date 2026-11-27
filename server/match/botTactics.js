// (fork) Tactics and profiles: one bot seat's play as an ordered list of tactics on top of legacy
// (fish-edition/ai-players.md "Standard terms for the new bot"). A profile registers as an ordinary bot strategy
// (docs/BOT_STRATEGIES.md), so `SP_BOT_STRATEGY`, `SP_BOT_STRATEGY_SEATS`, `botbench --bot` and replays take it as is.
//
// - A **tactic** declares typed, bounded parameters and handlers for some **decision points**.
// - A **profile** is an ordered list of tactics, each with its parameter values. legacy is always the last one.
// - At a decision point the profile asks its tactics in order. A handler returns PASS to pass; anything else is the
//   point's result, and the tactics below it (legacy included) are not asked. A handler may also call
//   `ctx.next(...)` — the rest of the chain, legacy last — and act before or after it.
// - A point no tactic of the profile handles runs legacy's own function: a profile of tactics that handle nothing
//   plays exactly like legacy, with legacy's RNG draws.
//
// The decision points are the registry's hooks and the named prep actions of server/match/botPrep.js, so each prep
// pass asks them in legacy's order and as often as legacy does (that order bounds the actions per prep). Each point
// belongs to one slot of RFC sganggs #816 (draft / economy / placement), so a profile can be read as that RFC's
// per-slot choice if upstream builds it.
import { defineBotStrategy, LEGACY_BOT } from './botStrategyContract.js';
import { createBotPrepSteps, LEGACY_PREP_ACTIONS, LEGACY_TUNABLES, legacyPrepPreamble, withLegacyTunables } from './bot.js';

/** A handler's "not me": the next tactic down is asked. */
export const PASS = Symbol('tactic.pass');

/**
 * slot: RFC #816's; hook: a registry hook (else a prep action); gen: the handler is a generator function (the action
 * is a step generator: hand it on with `yield* ctx.next()` and return its result — arrangeSteps returns the job).
 */
export const DECISION_POINTS = Object.freeze({
  pickBand: Object.freeze({ slot: 'draft', hook: true }),
  pickCard: Object.freeze({ slot: 'draft', hook: true }),
  bountyKillChance: Object.freeze({ slot: 'draft', hook: true }),
  takeOffers: Object.freeze({ slot: 'draft' }),
  sellJunk: Object.freeze({ slot: 'economy' }),
  buyLoopSteps: Object.freeze({ slot: 'economy', gen: true }),
  levelUp: Object.freeze({ slot: 'economy' }),
  spendDown: Object.freeze({ slot: 'economy' }),
  maybeFreeze: Object.freeze({ slot: 'economy' }),
  equipItems: Object.freeze({ slot: 'economy' }),
  arrangeSteps: Object.freeze({ slot: 'placement', gen: true }),
});

const ID = /^[a-z][a-z0-9-]*$/;
const isGenFn = (f) => typeof f === 'function' && f.constructor?.name === 'GeneratorFunction';

/** One declared parameter: its value checked against the declaration, else the default. */
function checkParam(tid, name, spec, value) {
  const v = value === undefined ? spec.default : value;
  const bad = (why) => new TypeError(`Tactic ${tid}: param ${name} ${why}, got ${JSON.stringify(v)}`);
  if (spec.type === 'int' || spec.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v) || (spec.type === 'int' && !Number.isInteger(v))) throw bad(`must be ${spec.type === 'int' ? 'an integer' : 'a number'}`);
    if (v < spec.min || v > spec.max) throw bad(`must be within ${spec.min}..${spec.max}`);
  } else if (spec.type === 'bool') {
    if (typeof v !== 'boolean') throw bad('must be true or false');
  } else if (!spec.choices.includes(v)) throw bad(`must be one of ${spec.choices.join(', ')}`);
  return v;
}

function checkSpec(tid, name, spec) {
  const bad = (why) => new TypeError(`Tactic ${tid}: param ${name}: ${why}`);
  if (!spec || typeof spec !== 'object') throw bad('a declaration object is required');
  if (spec.type === 'int' || spec.type === 'number') {
    if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max) || spec.min > spec.max) throw bad('min ≤ max required');
  } else if (spec.type === 'choice') {
    if (!Array.isArray(spec.choices) || !spec.choices.length) throw bad('choices required');
  } else if (spec.type !== 'bool') throw bad('type must be int, number, bool or choice');
  checkParam(tid, name, spec, spec.default);
  return Object.freeze({ ...spec, ...(spec.choices ? { choices: Object.freeze([...spec.choices]) } : {}) });
}

/**
 * `tunables(params)`: optional, the values of legacy's tunables (bot.js LEGACY_TUNABLES) this tactic's parameters
 * set. A profile with any such tactic plays every hook with them (see defineProfile).
 * @param {{ id: string, describe?: string, params?: Record<string, object>,
 *   at: Partial<Record<keyof typeof DECISION_POINTS, Function>>, tunables?: (params: object) => object }} def
 */
export function defineTactic(def) {
  if (!def || typeof def !== 'object') throw new TypeError('Tactic: object required');
  const { id, describe = '', params = {}, at, tunables = null } = def;
  if (typeof id !== 'string' || !ID.test(id) || id === 'legacy') throw new TypeError(`Tactic: bad id ${JSON.stringify(id)}`);
  for (const key of Object.keys(def)) if (!['id', 'describe', 'params', 'at', 'tunables'].includes(key)) throw new TypeError(`Tactic ${id}: unknown field ${key}`);
  if (!at || typeof at !== 'object' || !Object.keys(at).length) throw new TypeError(`Tactic ${id}: at least one decision point`);
  for (const [point, fn] of Object.entries(at)) {
    const dp = DECISION_POINTS[point];
    if (!dp) throw new TypeError(`Tactic ${id}: unknown decision point ${point}`);
    if (dp.gen ? !isGenFn(fn) : typeof fn !== 'function' || isGenFn(fn)) {
      throw new TypeError(`Tactic ${id}: ${point} needs a ${dp.gen ? 'generator ' : ''}function`);
    }
  }
  if (tunables !== null && typeof tunables !== 'function') throw new TypeError(`Tactic ${id}: tunables must be a function`);
  const specs = {};
  for (const [name, spec] of Object.entries(params)) specs[name] = checkSpec(id, name, spec);
  const tactic = Object.freeze({ id, describe, params: Object.freeze(specs), at: Object.freeze({ ...at }), tunables });
  if (tunables) tunablesOf(tactic, resolveParams(tactic)); // the defaults must map to known tunables
  return tactic;
}

/** A tactic's parameter values: the given ones checked, the rest defaulted. */
export function resolveParams(tactic, given = {}) {
  for (const name of Object.keys(given)) if (!Object.hasOwn(tactic.params, name)) throw new TypeError(`Tactic ${tactic.id}: unknown param ${name}`);
  const out = {};
  for (const [name, spec] of Object.entries(tactic.params)) out[name] = checkParam(tactic.id, name, spec, given[name]);
  return Object.freeze(out);
}

/** A tactic's tunables for these parameter values, checked against bot.js LEGACY_TUNABLES. */
function tunablesOf(tactic, params) {
  const t = tactic.tunables(params);
  if (!t || typeof t !== 'object') throw new TypeError(`Tactic ${tactic.id}: tunables() must return an object`);
  for (const k of Object.keys(t)) if (!Object.hasOwn(LEGACY_TUNABLES, k)) throw new TypeError(`Tactic ${tactic.id}: unknown legacy tunable ${k}`);
  return t;
}

/** `fn` (a hook) run with the tunables `t`: around each call, and for a generator around each of its steps. */
function scoped(t, fn) {
  if (!isGenFn(fn)) return (...a) => withLegacyTunables(t, () => fn(...a));
  return function* (...a) {
    const it = withLegacyTunables(t, () => fn(...a));
    let r = withLegacyTunables(t, () => it.next());
    // loop-cap: one pass per step of the wrapped generator, which bounds its own steps
    while (!r.done) {
      const v = yield r.value;
      r = withLegacyTunables(t, () => it.next(v));
    }
    return r.value;
  };
}

// Per-seat state of each profile entry: a tactic definition is shared and frozen, the player is per match.
const STATE = new WeakMap();
function stateOf(ps, entry) {
  let byEntry = STATE.get(ps);
  if (!byEntry) STATE.set(ps, (byEntry = new Map()));
  let s = byEntry.get(entry);
  if (!s) byEntry.set(entry, (s = {}));
  return s;
}

/** The chain of one decision point, legacy's function `bottom` last; `bottom` itself when no tactic handles it. */
function chainOf(entries, point, bottom) {
  const hs = entries.filter((e) => e.tactic.at[point]);
  if (!hs.length) return bottom;
  const ctx = (i, m, ps, args, next) => ({ match: m, player: ps, args, params: hs[i].params, state: () => stateOf(ps, hs[i]), next });
  if (DECISION_POINTS[point].gen) {
    const run = function* (i, m, ps, args) {
      if (i === hs.length) return yield* bottom(m, ps, ...args);
      const r = yield* hs[i].tactic.at[point](ctx(i, m, ps, args, (...a) => run(i + 1, m, ps, a.length ? a : args)));
      return r === PASS ? yield* run(i + 1, m, ps, args) : r;
    };
    return function* (m, ps, ...args) { return yield* run(0, m, ps, args); };
  }
  const run = (i, m, ps, args) => {
    if (i === hs.length) return bottom(m, ps, ...args);
    const r = hs[i].tactic.at[point](ctx(i, m, ps, args, (...a) => run(i + 1, m, ps, a.length ? a : args)));
    return r === PASS ? run(i + 1, m, ps, args) : r;
  };
  return (m, ps, ...args) => run(0, m, ps, args);
}

// by id: the registry re-defines each strategy (createBotRegistry), so the object it serves is not this one
const PROFILES = new Map();

/**
 * A profile as a registry strategy. `tactics`: tactic definitions or `{ tactic, params }`, top first; legacy is
 * appended, never listed. The same tactic may appear twice with different parameters.
 * @param {{ id: string, tactics: Array<ReturnType<typeof defineTactic> | { tactic: ReturnType<typeof defineTactic>, params?: object }> }} def
 */
export function defineProfile({ id, tactics = [] } = {}) {
  if (typeof id !== 'string' || !ID.test(id)) throw new TypeError(`Profile: bad id ${JSON.stringify(id)}`);
  if (!Array.isArray(tactics)) throw new TypeError(`Profile ${id}: tactics must be an array`);
  const entries = tactics.map((t, i) => {
    const tactic = t && t.tactic ? t.tactic : t;
    if (!tactic || typeof tactic.id !== 'string' || !tactic.at || !Object.isFrozen(tactic)) throw new TypeError(`Profile ${id}: entry ${i} is not a defined tactic`);
    return Object.freeze({ tactic, params: resolveParams(tactic, t.tactic ? t.params : undefined) });
  });
  const hooks = {};
  for (const hook of ['pickBand', 'pickCard', 'bountyKillChance']) {
    const fn = chainOf(entries, hook, LEGACY_BOT[hook]);
    if (fn !== LEGACY_BOT[hook]) hooks[hook] = fn;
  }
  const actions = {};
  for (const [point, dp] of Object.entries(DECISION_POINTS)) {
    if (dp.hook) continue;
    const fn = chainOf(entries, point, LEGACY_PREP_ACTIONS[point]);
    if (fn !== LEGACY_PREP_ACTIONS[point]) actions[point] = fn;
  }
  // legacy's tunables set by the profile's tactics (the topmost tactic wins a key two of them set)
  const tunables = {};
  for (const e of [...entries].reverse()) if (e.tactic.tunables) Object.assign(tunables, tunablesOf(e.tactic, e.params));
  const tuned = Object.keys(tunables).length ? Object.freeze(tunables) : null;
  // no prep point taken: legacy's own prep hooks, not a rebuilt copy (a tuned profile rebuilds them: the refresh cap
  // is read when the steps are made)
  if (Object.keys(actions).length || tuned) {
    const steps = withLegacyTunables(tuned, () => createBotPrepSteps(actions));
    // the legacy prep's own preamble first (bot.js botPrepBeginSteps), so a profile differs from legacy only where its
    // tactics act
    hooks.prepBegin = function* prepBegin(m, ps, options = {}) { legacyPrepPreamble(m, ps); return yield* steps.prepBegin(m, ps, options); };
    hooks.prepEnd = steps.prepEnd;
  }
  if (tuned) {
    for (const hook of ['pickBand', 'pickCard', 'bountyKillChance']) hooks[hook] = scoped(tuned, hooks[hook] ?? LEGACY_BOT[hook]);
    hooks.prepBegin = scoped(tuned, hooks.prepBegin);
    hooks.prepEnd = scoped(tuned, hooks.prepEnd);
  }
  const strategy = defineBotStrategy({ id, ...hooks });
  const slots = { draft: [], economy: [], placement: [] };
  for (const e of entries) {
    for (const point of Object.keys(e.tactic.at)) {
      const list = slots[DECISION_POINTS[point].slot];
      if (!list.includes(e.tactic.id)) list.push(e.tactic.id);
    }
  }
  PROFILES.set(id, Object.freeze({
    tunables: tuned,
    tactics: Object.freeze(entries.map((e) => Object.freeze({ tactic: e.tactic.id, params: e.params }))),
    slots: Object.freeze({ draft: Object.freeze(slots.draft), economy: Object.freeze(slots.economy), placement: Object.freeze(slots.placement) }),
  }));
  return strategy;
}

/**
 * A strategy's profile: `tactics` ([{ tactic, params }…], top first, without legacy) and `slots` (each RFC #816 slot's
 * tactic ids, draft / economy / placement); null for a strategy that is not a profile. By id: the last profile
 * defined with that id.
 */
export function profileOf(strategy) {
  return PROFILES.get(typeof strategy === 'string' ? strategy : strategy?.id) ?? null;
}
