// ui/gameLogic/damage.js — the damage chart's numbers (ui/damageChart.js): one bar per operator of the local player,
// copies of the same operator (and its elite form) adding to one bar, a summon's damage counted for its summoner.
//
//   DamageUnit (battle/runner.js damageUnits): { kind: 'op'|'token', defId, dmg, diy?, standInFor?, by? }
//     `by` = the summoner's identity { kind, defId, diy?, standInFor? } of a token placed or summoned by an operator.
//   DamageRow: { key, kind, defId, diy, standInFor, dmg }
//   History: { [round]: DamageRow[] } — the rows of each round fought.

import { isObj } from './shared.js';

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

/** The chess id of a chess's base form (`_b` = its elite copy). */
export const baseChessId = (id) => (typeof id === 'string' ? id.replace(/_b$/, '_a') : id);

/**
 * The bar a unit's damage goes to: an operator by its base chess (a 自选 slot by its pick too: two DIY slots holding
 * different operators are two bars), a token without a summoner by its own id.
 * @param {{ kind?: string, defId?: string, diy?: any }} who
 */
export function damageKey(who) {
  if (!isObj(who) || typeof who.defId !== 'string') return null;
  if (who.kind === 'token') return `token:${who.defId}`;
  const pick = isObj(who.diy) && typeof who.diy.charId === 'string' ? `|${who.diy.charId}` : '';
  return `${baseChessId(who.defId)}${pick}`;
}

/**
 * Group a battle's damage units into bars, most damage first (ties: the key, so the order is stable).
 * @param {any[]} units DamageUnit[]
 * @returns {Array<{ key: string, kind: string, defId: string, diy: any, standInFor: string|null, dmg: number }>}
 */
export function groupDamage(units) {
  const rows = new Map();
  for (const u of Array.isArray(units) ? units : []) {
    if (!isObj(u)) continue;
    const who = isObj(u.by) && damageKey(u.by) ? u.by : u;
    const key = damageKey(who);
    if (!key) continue;
    let row = rows.get(key);
    if (!row) {
      row = { key, kind: who.kind === 'token' ? 'token' : 'op', defId: who.defId, diy: isObj(who.diy) ? { ...who.diy } : null,
        standInFor: typeof who.standInFor === 'string' && who.standInFor ? who.standInFor : null, dmg: 0 };
      rows.set(key, row);
    }
    // the bar draws the elite form when any copy is elite
    if (row.kind === 'op' && who.defId !== row.defId && /_b$/.test(who.defId)) row.defId = who.defId;
    row.dmg += num(u.dmg);
  }
  return sortRows([...rows.values()]);
}

const sortRows = (rows) => rows.sort((a, b) => b.dmg - a.dmg || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/** The sum of a list of rows. */
export const rowsTotal = (rows) => (Array.isArray(rows) ? rows.reduce((s, r) => s + num(r?.dmg), 0) : 0);

/** The rounds of a history in order. @param {Record<string, any[]>} history */
export const historyRounds = (history) => Object.keys(isObj(history) ? history : {}).map(Number)
  .filter((r) => Number.isInteger(r)).sort((a, b) => a - b);

/**
 * The match chart: one bar per operator over every round, each bar split into its rounds (`parts`, round order,
 * rounds it dealt no damage in left out), most damage first.
 * @param {Record<string, any[]>} history
 * @returns {Array<{ key: string, kind: string, defId: string, diy: any, standInFor: string|null, dmg: number,
 *   parts: Array<{ round: number, dmg: number }> }>}
 */
export function totalDamage(history) {
  const rows = new Map();
  for (const round of historyRounds(history)) {
    for (const r of history[round] || []) {
      if (!isObj(r) || typeof r.key !== 'string') continue;
      let row = rows.get(r.key);
      if (!row) { row = { ...r, dmg: 0, parts: [] }; rows.set(r.key, row); }
      if (r.kind === 'op' && r.defId !== row.defId && /_b$/.test(r.defId)) row.defId = r.defId;
      const d = num(r.dmg);
      row.dmg += d;
      if (d > 0) row.parts.push({ round, dmg: d });
    }
  }
  return sortRows([...rows.values()]);
}

/** Two row lists show the same bars (the log only notifies its listeners on a change). */
export function sameRows(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((r, i) => r.key === b[i].key && r.dmg === b[i].dmg && r.defId === b[i].defId);
}
