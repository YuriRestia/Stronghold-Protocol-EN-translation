// ui/combatSummary.js — (fork) the result screen's match chart: the local player's operators over the whole match, read
// from upstream's 作战统计 records (battle/runner.js combatRounds → battle/metrics.js combineRounds). A selector picks the
// metric (伤害 / DPS / 治疗 / HPS, ui/combatMetricsModel.js) the bars and the row's one number show; a damage metric's bar
// splits either by round (one segment per round fought) or by damage type (物理 / 法术 / 真实 / 元素). This client only:
// nothing goes over the network and a reload starts empty. Rows: screens/game.css .dmg__*, the type colours:
// .combat-metrics__segment--*.

import { useMemo, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { useGameData, UnitThumb } from './gameComponents.js';
import { diyRecordFor, cardStandIn } from './gameLogic.js';
import { data } from '../data.js';
import { battleRunner } from '../battle/runner.js';
import { t } from '../../../shared/i18n.js';
import { MetricTabs, MeterBar, useMetric } from './combatMetrics.js';
import { splitsDamage, formatMetric, totalLabel, rankByMetric, typeAmounts, typesPresent, statLine } from './combatMetricsModel.js';

// msgids: 伤害统计 // en: "Damage Stats" · 总伤害 // en: "Total Damage" · 按回合 // en: "By Round" · 按类型 // en: "By Type"
//         总治疗 // en: "Total Healing"

const cx = (...p) => p.flat().filter(Boolean).join(' ');
/** A bar's operator: its card record (a 自选 pick's operator, a 补位 stand-in) and name. */
function rowUnit(row, gd) {
  if (row.kind === 'token') { const tk = gd.token(row.defId); return { id: row.defId, rec: null, name: tk?.name || row.name || row.defId }; }
  const id = row.diyFor || row.defId;
  const chess = gd.chess(id);
  const dr = row.diy && chess ? diyRecordFor(chess, row.diy, { chess: data.get('chess'), backups: data.get('backups') }) : null;
  const si = !dr && chess ? cardStandIn(chess, { unit: row, backups: gd.backups }) : null;
  const rec = dr || si;
  return { id, rec, name: rec?.name || chess?.name || row.name || id };
}

/** One bar's segments: `{ key, grow, tip, cls }` per round, or per damage type with any damage; healing metrics: none. */
function segments(row, by, metric) {
  if (!splitsDamage(metric)) return [];
  if (by === 'type') {
    return typeAmounts(row, metric).map((ty) => ({ key: ty.id, grow: ty.amount,
      tip: `${t(ty.label)}: ${formatMetric(ty.amount, metric)}`, cls: `combat-metrics__segment--${ty.id} is-type` }));
  }
  return (row.parts || []).map((p, i) => ({ key: p.round, grow: p.damage,
    tip: `${t('第 {n} 回合', { n: p.round })}: ${formatMetric(p[metric], metric)}`, cls: i % 2 ? 'is-alt' : null }));
}

/**
 * The bars, largest first, two columns ranked down the first then the second (`--dmg-rows`).
 * @param {{ ranked: { row: any, value: number, share: number }[], by: 'round'|'type', metric: string }} props
 */
function SummaryBars({ ranked, by, metric }) {
  const gd = useGameData();
  const cols = ranked.length > 1 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(ranked.length / cols));
  return html`<ol class=${cx('dmg__list', cols > 1 && 'is-cols')} style=${cols > 1 ? `--dmg-rows:${perCol}` : undefined}>
    ${ranked.map(({ row: r, value, share }) => {
      const u = rowUnit(r, gd);
      const segs = segments(r, by, metric);
      return html`<li key=${r.key} class=${cx('dmg__row', !(value > 0) && 'is-zero')} title=${statLine(r)}>
        <${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${u.id} size="xs" rec=${u.rec} showTier=${false} />
        <span class="dmg__main">
          <span class="dmg__line"><span class="dmg__name">${u.name}</span><b class="dmg__num num">${formatMetric(value, metric)}</b></span>
          <${MeterBar} share=${share} segs=${segs} label=${segs.map((s) => s.tip).join(', ')} />
        </span>
      </li>`;
    })}
  </ol>`;
}

/**
 * The result screen's match chart (screens/result.js), null when this client recorded nothing for `myId`.
 * `metrics`: a combineRounds result to draw instead of the runner's (the dev mock).
 * @param {{ myId: string|null, metrics?: any, runner?: any }} props
 */
export function CombatSummary({ myId, metrics = null, runner = battleRunner }) {
  const [by, setBy] = useState('round');
  const [metric, pickMetric] = useMetric();
  // read once per mount: the match is over, its records no longer change
  const m = useMemo(() => metrics || (myId && runner?.combatRounds ? runner.combatRounds({ ownerId: myId }) : null), [myId, metrics]);
  const rows = (m?.rows || []).filter((r) => r.damage > 0 || r.healing > 0);
  if (!rows.length) return null;
  const ranked = rankByMetric(rows, metric);
  return html`<section class="dmg dmg--summary" aria-label=${t('伤害统计')} data-testid="combat-summary">
    <header class="dmg__head">
      <b>${t('伤害统计')}</b>
      <${MetricTabs} metric=${metric} onPick=${pickMetric} className="dmg__modes dmg__modes--metric" buttonClass=${(on) => cx('dmg__mode', on && 'is-on')} />
      ${splitsDamage(metric) ? html`<div class="dmg__modes" role="group" aria-label=${t('伤害统计')}>
        ${[['round', t('按回合')], ['type', t('按类型')]].map(([id, label]) => html`<button type="button" key=${id}
          class=${cx('dmg__mode', by === id && 'is-on')} aria-pressed=${by === id ? 'true' : 'false'} onClick=${() => setBy(id)}>${label}</button>`)}
      </div>` : null}
    </header>
    ${by === 'type' && splitsDamage(metric) ? html`<div class="combat-metrics__legend dmg__legend">
      ${typesPresent(rows).map((ty) => html`<span key=${ty.id} class=${`combat-metrics__type combat-metrics__type--${ty.id}`}>${t(ty.label)}</span>`)}
    </div>` : null}
    <${SummaryBars} ranked=${ranked.rows} by=${by} metric=${metric} />
    <div class="dmg__total"><span>${totalLabel(metric)} <b class="num">${formatMetric(ranked.total, metric)}</b></span></div>
  </section>`;
}
