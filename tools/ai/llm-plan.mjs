// §35.11. [ASSUMED] Local repair policy for this example only. Server validPlan and human validators stay strict.
import { validPlan } from '../../server/match/aiPlan.js';
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
export const shortText = (s, max = 360) => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
// §35.62 [ASSUMED]: a level hold is accepted only at or above the slow community curve (3-5-7-9: L3 by R5, L4 by R7,
// L5 by R9; handoff/round51 RESEARCH §3.2, BV19UXZBJExQ reply). Below it the price drop of one round (1 fund) never
// pays for a round of lower-tier rolls. A candidate's own shopHold (二本叙 holds L2) is exempt. §35.63: L2 by R4, not
// R3 (the model read an R3 floor as an order to level and skipped third copies: board value at R3 10.4 against legacy's
// 15.1; legacy levels at R4, when the price is 2), and L6 by R11 (R8-R13 one-fund holds; bots with L5 at R9 and L6 at
// R11 dealt about 40 % more Final Assault damage).
export const holdFloor = round => round >= 11 ? 6 : round >= 9 ? 5 : round >= 7 ? 4 : round >= 5 ? 3 : round >= 4 ? 2 : 1;

export function repairPlan(input, pack, digest, choices, { holds = [] } = {}) {
  if (!object(input)) throw new Error('plan');
  const repairs = [], plan = {};
  const drop = (path, value, reason = 'unknown ID or invalid value') => repairs.push({ path, value: shortText(String(value), 128), reason });
  const fields = ['bonds', 'buy', 'keep', 'sell', 'economy', 'items', 'placements', 'choice'];
  if (Object.keys(input).length && !Object.keys(input).some(k => fields.includes(k))) throw new Error('plan');
  const cleanKeys = (x, allowed, path) => { for (const k of Object.keys(x)) if (!allowed.includes(k)) drop(`${path}${k}`, x[k], 'unknown field'); };
  cleanKeys(input, fields, '');
  const pieces = [...(digest.board || []), ...(digest.bench || []), ...(digest.overflow || []), ...(digest.shop || []).filter(Boolean)];
  const ops = new Set([...pack.operators.map(p => p.id), ...pieces.filter(p => p.kind === 'chess').map(p => p.id)]);
  const items = new Set(pack.items.map(p => p.id)), bonds = new Set(pack.bonds.map(p => p.id));
  // Shop rows cover plugin items absent from the static pack. Chess ids are not item buys.
  const buyableItems = new Set(items);
  for (const s of [...(digest.shop || []), ...(digest.rewards || [])].filter(Boolean)) {
    if (s.kind === 'item' || items.has(s.id) || (s.kind !== 'chess' && !ops.has(s.id) && s.id)) buyableItems.add(s.id);
  }
  const num = (value, min, max, path) => {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(n)) { drop(path, value); return undefined; }
    const fixed = Math.max(min, Math.min(max, Math.trunc(n)));
    if (fixed !== value) drop(path, value, `clamped to ${fixed}`);
    return fixed;
  };
  const list = (value, path, cap, map) => {
    if (!Array.isArray(value)) throw new Error('plan');
    const out = [];
    for (const v of value) {
      const item = map(v);
      if (item === undefined) { drop(path, v?.id ?? v); continue; }
      if (out.length >= cap || out.some(x => JSON.stringify(x) === JSON.stringify(item))) { drop(path, v?.id ?? v, 'list cap or duplicate'); continue; }
      out.push(item);
    }
    return out;
  };
  const ids = (value, known, path) => list(value, path, 32, v => known.has(v) ? v : undefined);
  // Item IDs written into the operator buy list go to items.buy (they were dropped before and never bought).
  const misplaced = Array.isArray(input.buy) ? input.buy.filter(v => !ops.has(v) && buyableItems.has(v)) : [];
  for (const key of ['buy', 'keep', 'sell']) if (input[key] !== undefined) {
    plan[key] = ids(key === 'buy' ? input[key].filter(v => !misplaced.includes(v)) : input[key], ops, key);
  }
  if (input.bonds !== undefined) {
    const seen = new Set();
    plan.bonds = list(input.bonds, 'bonds', 8, b => {
      if (!object(b) || !bonds.has(b.id) || seen.has(b.id)) return;
      cleanKeys(b, ['id', 'priority'], 'bonds.');
      const priority = num(b.priority, 1, 5, 'bonds.priority');
      if (priority === undefined) return;
      seen.add(b.id); return { id: b.id, priority };
    });
  }
  if (input.economy !== undefined) {
    if (!object(input.economy)) throw new Error('plan');
    plan.economy = {};
    cleanKeys(input.economy, ['saveForInterest', 'reserve', 'level', 'holdLevel', 'why', 'maxRefreshes', 'refreshAbove', 'freezeSearch'], 'economy.');
    for (const [k, max] of Object.entries({ reserve: 100, level: 6, maxRefreshes: 16, refreshAbove: 100 })) {
      if (input.economy[k] === undefined) continue;
      const value = num(input.economy[k], 0, max, `economy.${k}`);
      if (value !== undefined) plan.economy[k] = value;
    }
    if (typeof input.economy.saveForInterest === 'boolean') plan.economy.saveForInterest = input.economy.saveForInterest;
    else if (input.economy.saveForInterest !== undefined) drop('economy.saveForInterest', input.economy.saveForInterest);
    const why = shortText(input.economy.why);
    if (why) plan.economy.why = why;
    // The level held is the higher of the current level and economy.level (legacy first levels up to economy.level).
    const now = digest.economy?.level, floor = holdFloor(digest.round || 1);
    const level = Number.isInteger(now) ? Math.max(now, plan.economy.level ?? 0) : undefined;
    const belowCurve = input.economy.holdLevel === true && Number.isInteger(level) && level < floor && !holds.includes(level);
    if (typeof input.economy.holdLevel === 'boolean' && !belowCurve && (!input.economy.holdLevel || (why && plan.economy.level >= 1)))
      plan.economy.holdLevel = input.economy.holdLevel;
    else if (belowCurve) drop('economy.holdLevel', true, `held level ${level} is below the R${digest.round} floor L${floor}`);
    else if (input.economy.holdLevel !== undefined) drop('economy.holdLevel', input.economy.holdLevel, 'hold requires level >= 1 and economy.why');
    if (typeof input.economy.freezeSearch === 'boolean') plan.economy.freezeSearch = input.economy.freezeSearch;
    else if (input.economy.freezeSearch !== undefined) drop('economy.freezeSearch', input.economy.freezeSearch);
  }
  if (input.items !== undefined || misplaced.length) {
    if (input.items !== undefined && !object(input.items)) throw new Error('plan');
    const given = input.items || {};
    plan.items = {}; cleanKeys(given, ['keep', 'equip', 'buy'], 'items.');
    if (given.keep !== undefined) plan.items.keep = ids(given.keep, items, 'items.keep');
    if (given.buy !== undefined && !Array.isArray(given.buy)) throw new Error('plan');
    for (const v of misplaced) drop('buy', v, 'item id moved to items.buy');
    if (given.buy !== undefined || misplaced.length) plan.items.buy = list([...(given.buy || []), ...misplaced], 'items.buy', 8, v => buyableItems.has(v) ? v : undefined);
    if (given.equip !== undefined) plan.items.equip = list(given.equip, 'items.equip', 16, e => {
      if (!object(e) || !items.has(e.id) || !ops.has(e.target)) return;
      cleanKeys(e, ['id', 'target'], 'items.equip.'); return { id: e.id, target: e.target };
    });
  }
  if (input.placements !== undefined) plan.placements = list(input.placements, 'placements', 16, p => {
    if (!object(p) || !ops.has(p.id)) return;
    cleanKeys(p, ['id', 'row', 'col', 'dir'], 'placements.');
    const row = num(p.row, 0, 12, 'placements.row'), col = num(p.col, 0, 10, 'placements.col');
    if (row === undefined || col === undefined) return;
    const dir = typeof p.dir === 'string' ? p.dir.toUpperCase() : undefined;
    if (p.dir !== undefined && dir !== p.dir) drop('placements.dir', p.dir, `normalized to ${dir}`);
    const validDir = ['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(dir);
    if (p.dir !== undefined && !validDir) drop('placements.dir', p.dir);
    return { id: p.id, row, col, ...(validDir ? { dir } : {}) };
  });
  if (input.choice !== undefined) {
    if (choices.some(c => c.id === input.choice)) plan.choice = input.choice;
    else drop('choice', input.choice);
  }
  if (!validPlan(plan)) throw new Error('plan');
  return { plan, repairs };
}
