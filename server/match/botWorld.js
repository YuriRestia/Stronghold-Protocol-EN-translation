// server/match/botWorld.js — (fork) the snapshot a bot seat's prep is played from (docs/host-browser-bots.md Part B4):
// JSON that restores the match and every seat in the host's browser (server/match/shadowMatch.js). Every own field of a
// seat travels unless it is listed in NEVER_SEAT, so a field an upstream change adds is carried without an edit here. The
// match's fields are a list, because most of them are transport; test/match/bot-world.test.js reports a field the bot
// reads that is not on it.
//
// Runs in Node and in a browser Worker: no Node APIs.

/** Seat fields rebuilt on the other side: back references and caches (`_botRangeRecs` is 110 KB late in a match). */
const NEVER_SEAT = new Set(['m', 'gd', '_deployMap', '_botRangeRecs']);

/** The match's fields a bot or a handler reads (taken from a live trace; the strict shadow test reports a missing one). */
export const MATCH_FIELDS = Object.freeze(['roomCode', 'mode', 'difficulty', 'modeId', 'seed', 'isSolo', 'loneHuman', 'round', 'phase',
  'stageId', 'version', 'cs', 'vs', 'requireCs', 'rules', 'diyKitted', 'factions', 'bossId', 'hiddenBossId', 'disabledBonds',
  'staticInactiveBonds', 'bannedChess', 'wave', 'bossWaves', 'bossPairs', 'bossPairsRound', 'lastResults', 'draft', 'sp',
  'unitePlan', 'hiddenLayerSum', 'hiddenReached', 'teamLp', 'battleContent', 'battlePrefix', 'timerScale', 'gameSpeed',
  'clientCombat', 'aiPicksLast', 'offers', 'hostId', 'deadline', 'startedAt', 'roomScale', 'oneForAll']);

/** A value that cannot cross as data (a function, a class instance the codec does not know). */
export class BotWorldError extends Error {}

/** @param {any} v @param {string} at where it sits, for the error */
export function encode(v, at = '') {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v === undefined) return { $u: 1 };
  if (typeof v === 'number') {
    if (Number.isFinite(v) && !Object.is(v, -0)) return v;
    return { $n: Number.isNaN(v) ? 'nan' : Object.is(v, -0) ? '-0' : v > 0 ? 'inf' : '-inf' };
  }
  if (Array.isArray(v)) return v.map((x, i) => encode(x, `${at}[${i}]`));
  if (v instanceof Map) return { $m: [...v].map(([k, x], i) => [encode(k, `${at}.key${i}`), encode(x, `${at}.${String(k)}`)]) };
  if (v instanceof Set) return { $s: [...v].map((x, i) => encode(x, `${at}[${i}]`)) };
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) {
      const out = {};
      for (const k of Object.keys(v)) out[k] = encode(v[k], `${at}.${k}`);
      return out;
    }
    if (typeof v.toBotWorld === 'function') return { $c: encode(v.toBotWorld(), at) };
    if (v.entries instanceof Map) return { $e: encode(v.entries, `${at}.entries`) }; // DiyStock: only its entries
  }
  throw new BotWorldError(`cannot send ${at || 'value'}: ${typeof v === 'object' ? v.constructor?.name : typeof v}`);
}

const SPECIAL = { nan: NaN, '-0': -0, inf: Infinity, '-inf': -Infinity };

/** @param {any} v @param {{ stock?: () => any }} [make] builds the class instances the codec carries */
export function decode(v, make = {}) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decode(x, make));
  if (v.$u === 1) return undefined;
  if (v.$n !== undefined) return SPECIAL[v.$n];
  if (v.$m) return new Map(v.$m.map(([k, x]) => [decode(k, make), decode(x, make)]));
  if (v.$s) return new Set(v.$s.map((x) => decode(x, make)));
  if (v.$e) {
    const stock = make.stock ? make.stock() : { entries: null };
    stock.entries = decode(v.$e, make);
    return stock;
  }
  const out = {};
  for (const k of Object.keys(v)) out[k] = decode(v[k], make);
  return out;
}

/** One seat's fields. */
export function encodeSeat(ps) {
  const out = {};
  for (const k of Object.keys(ps)) if (!NEVER_SEAT.has(k)) out[k] = encode(ps[k], `seat.${k}`);
  return out;
}

/**
 * What the bot remembers between preps: its `_bot*` fields and the two others it writes to the seat. The executor returns
 * these with the final batch; the server stores them without reading them and sends them with the next snapshot.
 */
function isMemoField(k) {
  return (k.startsWith('_bot') && !NEVER_SEAT.has(k) && k !== '_botPrepToken') || k === '_advisorBought' || k === 'botStrategyState';
}

export function encodeMemo(ps) {
  const out = {};
  for (const k of Object.keys(ps)) if (isMemoField(k)) out[k] = encode(ps[k], `memo.${k}`);
  return out;
}

/** Store a returned memo on the real seat (only memo fields: an answer can never write anything else). */
export function applyMemo(ps, memo) {
  if (!memo || typeof memo !== 'object') return;
  for (const k of Object.keys(memo)) if (isMemoField(k)) ps[k] = decode(memo[k]);
}

/**
 * The snapshot of `ps`'s prep.
 * @param {any} m the match @param {any} ps the seat @param {any} task MatchBotTasks.newBotTask
 */
export function buildWorld(m, ps, task) {
  const match = {};
  for (const k of MATCH_FIELDS) if (m[k] !== undefined) match[k] = encode(m[k], `match.${k}`);
  return {
    v: 1,
    seat: ps.seat,
    task: { id: task.id, attempt: task.attempt, seeds: task.seeds, uidBase: task.uidBase, count: m.botTaskLayouts },
    now: m.sched.now(),
    soloUnlimited: m.opts?.soloUnlimited === true,
    strategies: Object.fromEntries(m.order.map((p) => [p.seat, m.botFor(p).id])),
    match,
    pool: [...m.pool.entries].map(([id, e]) => [id, e.cap, e.left, e.tier]),
    itemDebt: [...m.itemPool.debt],
    seats: m.order.map(encodeSeat),
  };
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv(str) {
  let h = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), FNV_PRIME);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pieceKey = (p) => (p ? `${p.uid}:${p.id}:${(p.items || []).map(pieceKey).join('+')}` : '-');

/**
 * A short hash of what a move can reveal to the seat: funds, shop, offers and pieces. The two sides compare it to tell a
 * move that applied as the copy computed from one the world changed underneath.
 */
export function seatHash(ps) {
  const board = [...ps.board].map(([k, p]) => `${k}=${pieceKey(p)}`).sort();
  return fnv(JSON.stringify([ps.funds, ps.shop, ps.offers, ps.hand.map(pieceKey), ps.temp.map(pieceKey), board]));
}
