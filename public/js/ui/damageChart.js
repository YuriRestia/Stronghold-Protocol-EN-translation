// ui/damageChart.js — the damage chart (IDEAS.md "Damage charts"): the corner's chart button next to 交流 opens the
// local player's damage per operator — live in combat, the last round's in prep — and the result screen lists the
// whole match, each bar split into its rounds. The numbers: ui/damageLog.js (gameLogic/damage.js groups them).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { useGameData, UnitThumb } from './gameComponents.js';
import { fmtNum, diyRecordFor, cardStandIn } from './gameLogic.js';
import { rowsTotal, historyRounds, totalDamage } from './gameLogic/damage.js';
import { data } from '../data.js';
import { damageLog } from './damageLog.js';
import { t } from '../../../shared/i18n.js';

// msgids: 伤害统计 // en: "Damage Stats" · 总伤害 // en: "Total Damage" · 上一回合 // en: "Last Round"
//         暂无伤害数据 // en: "No damage data yet" · 全部回合 // en: "All Rounds"

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const EMPTY = { round: null, history: {} };

/** The damage log's state, re-rendered on every change. */
export function useDamageLog(log = damageLog) {
  const [s, setS] = useState(() => (log ? log.get() : EMPTY));
  useEffect(() => (log ? log.subscribe(setS) : undefined), [log]);
  return s;
}

/** A bar's operator: its card record (a 自选 pick's operator, a 补位 stand-in) and name. */
function rowUnit(row, gd) {
  if (row.kind === 'token') { const tk = gd.token(row.defId); return { rec: null, name: tk?.name || row.defId }; }
  const chess = gd.chess(row.defId);
  const dr = row.diy && chess ? diyRecordFor(chess, row.diy, { chess: data.get('chess'), backups: data.get('backups') }) : null;
  const si = !dr && chess ? cardStandIn(chess, { unit: row, backups: gd.backups }) : null;
  const rec = dr || si;
  return { rec, name: rec?.name || chess?.name || row.defId };
}

/**
 * The bars, most damage first: `rows` of one round, or the match's rows with `parts` (one segment per round).
 * @param {{ rows: any[], stacked?: boolean }} props
 */
export function DamageBars({ rows, stacked = false }) {
  const gd = useGameData();
  const max = rows.reduce((m, r) => Math.max(m, r.dmg), 0);
  return html`<ol class="dmg__list">
    ${rows.map((r) => {
      const u = rowUnit(r, gd);
      const w = max > 0 ? (r.dmg / max) * 100 : 0;
      return html`<li key=${r.key} class="dmg__row">
        <${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${r.defId} size="xs" rec=${u.rec} showTier=${false} />
        <span class="dmg__name" title=${u.name}>${u.name}</span>
        <span class="dmg__track" aria-hidden="true">
          ${stacked && r.parts?.length
            ? html`<span class="dmg__bar is-stacked" style=${`width:${w}%`}>${r.parts.map((p, i) => html`<span key=${p.round}
                class=${cx('dmg__seg', i % 2 && 'is-alt')} style=${`flex-grow:${p.dmg}`} title=${`${t('第 {n} 回合', { n: p.round })}: ${fmtNum(p.dmg)}`}></span>`)}</span>`
            : html`<span class="dmg__bar" style=${`width:${w}%`}></span>`}
        </span>
        <b class="dmg__num num">${fmtNum(r.dmg)}</b>
      </li>`;
    })}
  </ol>`;
}

const Total = ({ rows }) => html`<div class="dmg__total"><span>${t('总伤害')}</span><b class="num">${fmtNum(rowsTotal(rows))}</b></div>`;

/**
 * 伤害统计 button + panel (screens/game.js corner): the round being fought (live), else the last round fought.
 * @param {{ open: boolean, onToggle: (open: boolean) => void }} props
 */
export function DamageButton({ open, onToggle }) {
  const log = useDamageLog();
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!(e.target instanceof Element) || !e.target.closest('.dmgbtn')) onToggle(false); };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  const live = log.round != null;
  const rounds = historyRounds(log.history);
  const round = live ? log.round : rounds.length ? rounds[rounds.length - 1] : null;
  const rows = round != null ? log.history[round] || [] : [];
  return html`<div class="dmgbtn">
    <button type="button" class=${cx('gm__gear', 'dmgbtn__btn', open && 'is-on')} aria-label=${t('伤害统计')} title=${t('伤害统计')}
      aria-expanded=${open ? 'true' : 'false'} aria-haspopup="dialog" onClick=${() => onToggle(!open)}><${Icon} name="chart" /></button>
    ${open ? html`<div class="dmg dmgbtn__panel" role="dialog" aria-label=${t('伤害统计')}>
      <header class="dmg__head">
        <b>${t('伤害统计')}</b>
        ${round != null ? html`<span class=${cx('dmg__tag', live && 'is-live')}>${live ? t('第 {n} 回合', { n: round }) + ' · ' + t('实时') : t('上一回合') + ' · ' + t('第 {n} 回合', { n: round })}</span>` : null}
      </header>
      ${rows.length ? html`<${DamageBars} rows=${rows} /><${Total} rows=${rows} />` : html`<p class="dmg__empty">${t('暂无伤害数据')}</p>`}
    </div>` : null}
  </div>`;
}

/** The result screen's match chart: every round of the log, one segment per round on each bar; null when empty. */
export function DamageSummary({ history }) {
  const rows = totalDamage(history);
  if (!rows.length) return null;
  return html`<section class="dmg dmg--summary" aria-label=${t('伤害统计')}>
    <header class="dmg__head"><b>${t('伤害统计')}</b><span class="dmg__tag">${t('全部回合')}</span></header>
    <${DamageBars} rows=${rows} stacked=${true} />
    <${Total} rows=${rows} />
  </section>`;
}
