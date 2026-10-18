// ui/combatSummary.js — (fork) the result screen's match chart: the local player's operators over the whole match, read
// from upstream's 作战统计 records (battle/runner.js combatRounds → battle/metrics.js combineRounds). Each bar splits
// either by round (one segment per round fought) or by damage type (物理 / 法术 / 真实 / 元素); the row's numbers add
// healing and DPS / HPS. This client only: nothing goes over the network and a reload starts empty. Rows:
// screens/game.css .dmg__* (the corner panel's former look), the type colours: .combat-metrics__segment--*.

import { useMemo, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { useGameData, UnitThumb } from './gameComponents.js';
import { fmtNum, diyRecordFor, cardStandIn } from './gameLogic.js';
import { data } from '../data.js';
import { battleRunner } from '../battle/runner.js';
import { t, N_ } from '../../../shared/i18n.js';

// msgids: 伤害统计 // en: "Damage Stats" · 总伤害 // en: "Total Damage" · 全部回合 // en: "All Rounds"
//         按回合 // en: "By Round" · 按类型 // en: "By Type" · 总治疗 // en: "Total Healing"

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const TYPES = Object.freeze([
  { id: 'phys', label: N_('物理') }, { id: 'arts', label: N_('法术') },
  { id: 'true', label: N_('真实') }, { id: 'elemental', label: N_('元素') },
]);
const rate = (n) => (n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

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

/** One bar's segments: `{ key, grow, tip, cls }` per round, or per damage type with any damage. */
function segments(row, by) {
  if (by === 'type') {
    return TYPES.filter((ty) => row.types?.[ty.id] > 0).map((ty) => ({ key: ty.id, grow: row.types[ty.id],
      tip: `${t(ty.label)}: ${fmtNum(row.types[ty.id])}`, cls: `combat-metrics__segment--${ty.id} is-type` }));
  }
  return (row.parts || []).map((p, i) => ({ key: p.round, grow: p.damage,
    tip: `${t('第 {n} 回合', { n: p.round })}: ${fmtNum(p.damage)}`, cls: i % 2 ? 'is-alt' : null }));
}

/**
 * The bars, most damage first, two columns ranked down the first then the second (`--dmg-rows`).
 * @param {{ rows: any[], by: 'round'|'type' }} props
 */
function SummaryBars({ rows, by }) {
  const gd = useGameData();
  const max = rows.reduce((m, r) => Math.max(m, r.damage), 0);
  const cols = rows.length > 1 ? 2 : 1;
  const perCol = Math.max(1, Math.ceil(rows.length / cols));
  return html`<ol class=${cx('dmg__list', cols > 1 && 'is-cols')} style=${cols > 1 ? `--dmg-rows:${perCol}` : undefined}>
    ${rows.map((r) => {
      const u = rowUnit(r, gd);
      const w = max > 0 ? (r.damage / max) * 100 : 0;
      const segs = segments(r, by);
      const extra = [`DPS ${rate(r.dps)}`, r.healing > 0 ? `${t('治疗')} ${fmtNum(r.healing)} · HPS ${rate(r.hps)}` : null].filter(Boolean).join(' · ');
      return html`<li key=${r.key} class="dmg__row" title=${extra}>
        <${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${u.id} size="xs" rec=${u.rec} showTier=${false} />
        <span class="dmg__name" title=${u.name}>${u.name}</span>
        <span class="dmg__track" role=${segs.length ? 'img' : undefined} aria-label=${segs.length ? segs.map((s) => s.tip).join(', ') : undefined} aria-hidden=${segs.length ? undefined : 'true'}>
          ${segs.length
            ? html`<span class="dmg__bar is-stacked" style=${`width:${w}%`}>${segs.map((s) => html`<span key=${s.key}
                class=${cx('dmg__seg', s.cls)} style=${`flex-grow:${s.grow}`}><span class="dmg__tip">${s.tip}</span></span>`)}</span>`
            : html`<span class="dmg__bar" style=${`width:${w}%`}></span>`}
        </span>
        <span class="dmg__nums">
          <b class="dmg__num num">${fmtNum(r.damage)}</b>
          <small class="dmg__sub num">${extra}</small>
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
  // read once per mount: the match is over, its records no longer change
  const m = useMemo(() => metrics || (myId && runner?.combatRounds ? runner.combatRounds({ ownerId: myId }) : null), [myId, metrics]);
  const rows = (m?.rows || []).filter((r) => r.damage > 0 || r.healing > 0);
  if (!rows.length) return null;
  return html`<section class="dmg dmg--summary" aria-label=${t('伤害统计')} data-testid="combat-summary">
    <header class="dmg__head">
      <b>${t('伤害统计')}</b>
      <div class="dmg__modes" role="group" aria-label=${t('伤害统计')}>
        ${[['round', t('按回合')], ['type', t('按类型')]].map(([id, label]) => html`<button type="button" key=${id}
          class=${cx('dmg__mode', by === id && 'is-on')} aria-pressed=${by === id ? 'true' : 'false'} onClick=${() => setBy(id)}>${label}</button>`)}
      </div>
      <span class="dmg__tag">${t('全部回合')}</span>
    </header>
    ${by === 'type' ? html`<div class="combat-metrics__legend dmg__legend">
      ${TYPES.map((ty) => html`<span key=${ty.id} class=${`combat-metrics__type combat-metrics__type--${ty.id}`}>${t(ty.label)}</span>`)}
    </div>` : null}
    <${SummaryBars} rows=${rows} by=${by} />
    <div class="dmg__total">
      <span>${t('总伤害')} <b class="num">${fmtNum(m.damage)}</b></span>
      ${m.healing > 0 ? html`<span>${t('总治疗')} <b class="num">${fmtNum(m.healing)}</b></span>` : null}
    </div>
  </section>`;
}
