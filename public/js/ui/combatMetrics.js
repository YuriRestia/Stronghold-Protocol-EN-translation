import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, useTicker } from './components.js';
import { UnitThumb } from './gameComponents.js';
import { battleRunner } from '../battle/runner.js';
import { t, tName } from '../../../shared/i18n.js';
import { combatMetricsLayout } from './combatMetricsLayout.js';
import { METRICS, METRIC_GROUP_LABEL, rememberedMetric, rememberMetric, splitsDamage, formatMetric, totalLabel,
  rankByMetric, typeAmounts, typesPresent, statLine } from './combatMetricsModel.js';

/** The metric the bars and numbers show, kept for the page's life (combatMetricsModel.js): [metric, choose]. */
export function useMetric() {
  const [metric, setMetric] = useState(rememberedMetric);
  return [metric, (id) => { rememberMetric(id); setMetric(id); }];
}

/** The selector, one button per metric. `buttonClass(on)`: each meter's own button look. */
export function MetricTabs({ metric, onPick, className, buttonClass }) {
  return html`<div class=${className} role="group" aria-label=${t(METRIC_GROUP_LABEL)}>
    ${METRICS.map((m) => html`<button type="button" key=${m.id} data-metric=${m.id} class=${buttonClass?.(metric === m.id)}
      aria-pressed=${metric === m.id ? 'true' : 'false'} onClick=${() => onPick(m.id)}>${t(m.label)}</button>`)}
  </div>`;
}

/**
 * One row's bar, `share` percent of its track long. `segs`: `{ key, grow, tip?, cls }`, drawn split; none = solid.
 * `.dmg__*` in screens/game.css, the styles of the result chart and the sandbox's meter.
 */
export function MeterBar({ share, segs = [], label }) {
  const width = `width:${share}%`;
  return html`<span class="dmg__track" role=${label ? 'img' : undefined} aria-label=${label || undefined} aria-hidden=${label ? undefined : 'true'}>
    ${!(share > 0) ? null : segs.length
      ? html`<span class="dmg__bar is-stacked" style=${width}>${segs.map((s) => html`<span key=${s.key}
          class=${['dmg__seg', s.cls].filter(Boolean).join(' ')} style=${`flex-grow:${s.grow}`}>${s.tip ? html`<span class="dmg__tip">${s.tip}</span>` : null}</span>`)}</span>`
      : html`<span class="dmg__bar is-solid" style=${width}></span>`}
  </span>`;
}

/** A modeless panel: the battlefield stays visible and keeps playing. Mounted only while open. */
export function CombatMetricsPanel({ myId, onClose, runner = battleRunner }) {
  const [scope, setScope] = useState('battle');
  const [metric, pickMetric] = useMetric();
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useTicker(250);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal, .guide')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const corner = panel?.parentElement;
    const viewport = window.visualViewport;
    const measure = () => {
      if (!panel || !corner) return;
      const rect = corner.getBoundingClientRect();
      const rootStyle = getComputedStyle(document.documentElement);
      const layout = combatMetricsLayout({
        cornerTop: rect.top, cornerBottom: rect.bottom,
        viewportHeight: viewport?.height || window.innerHeight,
        viewportTop: viewport?.offsetTop || 0,
        rem: parseFloat(rootStyle.fontSize) || 40,
        safeTop: parseFloat(rootStyle.getPropertyValue('--sa-t')) || 0,
        safeBottom: parseFloat(rootStyle.getPropertyValue('--sa-b')) || 0,
      });
      panel.style.setProperty('--combat-corner-height', `${rect.height || 44}px`);
      panel.style.setProperty('--combat-available-height', `${layout.availableHeight}px`);
      panel.style.setProperty('--combat-viewport-height', `${layout.viewportSpace}px`);
      panel.style.setProperty('--combat-viewport-top', `${layout.viewportPanelTop}px`);
      panel.dataset.viewportDocked = String(layout.viewportDocked);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (corner) observer?.observe(corner);
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, []);
  const result = (myId ? runner?.combatMetrics({ scope, ownerId: myId }) : null) || { rows: [], damage: 0, healing: 0 };
  const ranked = rankByMetric(result.rows, metric);
  const legend = splitsDamage(metric) ? typesPresent(result.rows) : [];
  return html`<section ref=${panelRef} id="combat-metrics-panel" class="combat-metrics brackets" role="dialog" aria-label=${t('作战统计')}
      onKeyDown=${(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
    <header class="combat-metrics__head">
      <div class="combat-metrics__scopes" role="group" aria-label=${t('统计范围')}>
        ${[['battle', t('当前战斗')], ['match', t('本局累计')], ['last', t('上一场战斗')]].map(([id, label]) => html`<button type="button" key=${id}
          aria-pressed=${scope === id} onClick=${() => setScope(id)}>${label}</button>`)}
      </div>
      <button ref=${closeRef} type="button" class="combat-metrics__close" aria-label=${t('关闭作战统计')} onClick=${onClose}><${Icon} name="close" /></button>
    </header>
    <${MetricTabs} metric=${metric} onPick=${pickMetric} className="combat-metrics__scopes combat-metrics__metrics" />
    <div class="combat-metrics__legend" aria-label=${t('伤害类型图例')}>
      ${legend.map((type) => html`<span key=${type.id} class=${`combat-metrics__type combat-metrics__type--${type.id}`}>${t(type.label)}</span>`)}
      <span class="combat-metrics__total">${totalLabel(metric)} <b>${formatMetric(ranked.total, metric)}</b></span>
    </div>
    <ol class="combat-metrics__list" tabindex="0" aria-label=${t('干员伤害排行')}>
      ${ranked.rows.length ? ranked.rows.map(({ row: r, value, share }) => {
        const types = typeAmounts(r, metric);
        const description = types.map((type) => `${t(type.label)} ${formatMetric(type.amount, metric)}`).join('，');
        return html`<li key=${r.key} class=${value > 0 ? 'combat-metrics__row' : 'combat-metrics__row is-zero'} title=${statLine(r)}>
          <${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${r.defId} ownerId=${r.ownerId}
            rec=${r.picture?.charId ? { ...r.picture, name: r.name } : null} showTier=${false} size="sm" />
          <div class="combat-metrics__unit">
            <div class="combat-metrics__name"><b>${tName(r.name) || r.defId}</b><span class="combat-metrics__value">${formatMetric(value, metric)}</span></div>
            <${MeterBar} share=${share} label=${description} segs=${types.map((type) => ({ key: type.id, grow: type.amount,
              cls: `is-type combat-metrics__segment--${type.id}` }))} />
          </div>
        </li>`;
      }) : html`<li class="combat-metrics__empty">${scope === 'last' ? t('暂无上一场战斗记录') : t('暂无本地战斗记录')}</li>`}
    </ol>
  </section>`;
}
