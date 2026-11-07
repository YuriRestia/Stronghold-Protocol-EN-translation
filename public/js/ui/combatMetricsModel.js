// ui/combatMetricsModel.js — (fork) what the two damage meters share, with no DOM (test/ui/combat-metrics-model.test.js):
// the in-match panel (ui/combatMetrics.js) and the result screen's chart (ui/combatSummary.js) both draw one metric at a
// time — the bars and the row's one number — picked on a selector, the top value filling its bar. The rows come from
// battle/metrics.js (combineCombat / combineRounds), whose fields are named after the metrics.

import { t, N_ } from '../../../shared/i18n.js';
import { fmtNum } from './gameLogic/format.js';

export const TYPES = Object.freeze([
  { id: 'phys', label: N_('物理') }, { id: 'arts', label: N_('法术') },
  { id: 'true', label: N_('真实') }, { id: 'elemental', label: N_('元素') },
]);

export const METRICS = Object.freeze([
  { id: 'damage', label: N_('伤害'), total: N_('总伤害') },
  { id: 'dps', label: 'DPS', total: 'DPS' },
  { id: 'healing', label: N_('治疗'), total: N_('总治疗') },
  { id: 'hps', label: 'HPS', total: 'HPS' },
]);

export const METRIC_GROUP_LABEL = N_('统计项目'); // en: "Statistic"

const metricOf = (id) => METRICS.find((m) => m.id === id) || METRICS[0];
const valueOf = (row, id) => row?.[id] || 0;

/** The selector's choice lives as long as the page: reopening the panel, or reaching the result screen, keeps it. */
let remembered = METRICS[0].id;
export const rememberedMetric = () => remembered;
export function rememberMetric(id) { remembered = metricOf(id).id; }

/** The damage metrics split their bars (damage type, round); the healing ones have one colour. */
export const splitsDamage = (id) => id === 'damage' || id === 'dps';

/** A metric's number: counts compact (fmtNum), rates with one decimal. */
export function formatMetric(value, id) {
  return id === 'dps' || id === 'hps' ? (value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 }) : fmtNum(value || 0);
}

export const totalLabel = (id) => t(metricOf(id).total);

/**
 * The rows, largest value of the metric first, each with its value and bar length: `share` is percent of the top value.
 * Ties fall back to damage, healing, then key, so a row with nothing to show keeps its place between updates.
 * @returns {{ rows: { row: any, value: number, share: number }[], total: number }}
 */
export function rankByMetric(rows, id) {
  const sorted = [...(rows || [])].sort((a, b) => valueOf(b, id) - valueOf(a, id) || valueOf(b, 'damage') - valueOf(a, 'damage')
    || valueOf(b, 'healing') - valueOf(a, 'healing') || String(a.key).localeCompare(String(b.key)));
  const top = sorted.length ? valueOf(sorted[0], id) : 0;
  return {
    rows: sorted.map((row) => ({ row, value: valueOf(row, id), share: top > 0 ? (valueOf(row, id) / top) * 100 : 0 })),
    total: sorted.reduce((n, row) => n + valueOf(row, id), 0),
  };
}

/** One row's amount per damage type in the metric's unit, types it has none of left out (healing metrics: none). */
export function typeAmounts(row, id) {
  if (!splitsDamage(id)) return [];
  const per = id === 'dps' ? (row.seconds > 0 ? 1 / row.seconds : 0) : 1;
  return TYPES.filter((ty) => row.types?.[ty.id] > 0).map((ty) => ({ ...ty, amount: row.types[ty.id] * per }));
}

/** The damage types any of the rows has, for a legend without colours nothing on screen uses. */
export const typesPresent = (rows) => TYPES.filter((ty) => (rows || []).some((r) => r.types?.[ty.id] > 0));

/** All four numbers on one line: the row's hover text, the other metrics a glance at the selector leaves out. */
export function statLine(row) {
  return METRICS.map((m) => `${t(m.label)} ${formatMetric(valueOf(row, m.id), m.id)}`).join(' · ');
}
