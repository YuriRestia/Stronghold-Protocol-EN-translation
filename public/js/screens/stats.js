// The local stats viewer (统计数据): this browser's record of the matches the player took part in — see ui/stats.js for
// what is recorded, what counts and how the storage is bounded. A full-screen overlay opened imperatively from the
// title screen / lobby / room (`openStats()`); <StatsHost/> is mounted once by main.js. Ported from PR #323 by
// @2321Robin; reworked for 0.2.2 in the grammar of 干员调配 (top bar with tabs, a note line, a scrolling body).
//
//   总览      – games, wins, win rate, hidden-core reaches / clears, best round, time played; the difficulties; the six
//               评语 (titles) with their counts; what counts and what was left out
//   策略      – per strategy (band): games used / passed (self alive on a winning team) / pass rate
//   战斗累计  – the player's summed combat bookkeeping of the settled matches
//   对局记录  – every stored match, newest first. A settled row re-views that match's settlement screen (the record is
//               inverted into an m.result payload for <ResultView/>); a match given up early is marked 中途退出 and,
//               when it did not count, 不计入统计
// Everything is 本机数据 (localStorage, `sp.pref.stats`) and the page says so, teammates' names included. 导出 / 导入 (a
// JSON file, merged by record id on the way in) moves it between devices; 清空 resets it after a confirm dialog.
// The host renders nothing until opened and the game data files the replay needs load only then (the lobby alone never
// downloads them): the overview reads config / bands / assets only.

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS } from '../../../shared/constants.js';
import { html, Icon, MicroLabel, Spinner, Button, confirmDialog } from '../ui/components.js';
import { useGameData, makeLookups, BandIcon, Img } from '../ui/gameComponents.js';
import { data, useData } from '../data.js';
import { fmtNum } from '../ui/gameLogic.js';
import { titleIconUrl } from '../ui/assetUrls.js';
import { useDocClass } from '../ui/device.js';
import { createStore, useStore, selectRoute } from '../store.js';
import { ResultView } from './result.js';
import { toast, toastError } from '../ui/toasts.js';
import {
  loadStats, saveStats, emptyStats, importStats, exportStats, aggregateStats, countsTowardStats, selfRowOf, roundsOf,
  recordToResult, MAX_RECORDS, FULL_KEEP, IMPORT_MAX_CHARS,
} from '../ui/stats.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Rows of 对局记录 shown at first and added by each 显示更多. */
export const HISTORY_PAGE = 50;

const statsStore = createStore({ open: false, tab: 'overview' });

/** Open the stats viewer (title screen / lobby / room entry points). */
export function openStats() {
  data.load('config');
  data.load('bands');
  data.load('assets');
  statsStore.set({ open: true, tab: 'overview' });
}
export const closeStats = () => statsStore.set({ open: false });

const TABS = [
  { id: 'overview', name: N_('总览'), micro: 'OVERVIEW' },
  { id: 'bands', name: N_('策略'), micro: 'STRATEGIES' },
  { id: 'totals', name: N_('战斗累计'), micro: 'COMBAT TOTALS' },
  { id: 'history', name: N_('对局记录'), micro: 'HISTORY' },
];

const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const dateTime = (ms) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** Time played: minutes up to 99, then hours with one decimal. */
function playedText(ms) {
  const mins = Math.round((ms || 0) / 60000);
  return mins < 100 ? t('{n} 分', { n: fmtNum(mins) }) : t('{n} 小时', { n: (mins / 60).toFixed(1) });
}
const difficultyName = (d) => (DIFFICULTY_NAMES[d] ? t(DIFFICULTY_NAMES[d]) : t('未知'));

/** Save `text` as a download. Silent no-op when the browser refuses downloads. */
function downloadText(filename, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch { /* ignore */ }
}

/** Read a picked file as text (`File.text()`, with a FileReader fallback for older Safari). */
function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error || new Error('read failed'));
    fr.readAsText(file);
  });
}

/** `stronghold-stats-20261008-2130.json` */
function exportFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `stronghold-stats-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}

/** One labelled number card. */
function StatCard({ label, micro, value, tone }) {
  return html`<div class=${cx('st-card', tone && `st-card--${tone}`)}>
    <${MicroLabel} tone=${tone === 'gold' ? 'gold' : 'mint'}>${micro}<//>
    <b class="st-card__num num">${value}</b>
    <span class="st-card__label">${label}</span>
  </div>`;
}

function Section({ title, micro, children, class: cls }) {
  return html`<section class=${cx('st-sec', cls)}>
    <h3 class="st-sec__h"><span>${title}</span><${MicroLabel}>${micro}<//></h3>
    ${children}
  </section>`;
}

/** 总览: cards, the per-difficulty table, the six titles, and the line about what counts. */
function Overview({ agg, gd }) {
  const rows = DIFFICULTIES.filter((d) => agg.byDifficulty[d]).concat(Object.keys(agg.byDifficulty).filter((d) => !DIFFICULTIES.includes(d)));
  const titles = (Array.isArray(gd.config?.titles) ? gd.config.titles : []).map((x) => ({ ...x, count: agg.titles[x.id]?.count || 0 }));
  return html`<${Section} title=${t('总览')} micro="OVERVIEW">
    <div class="st-cards">
      <${StatCard} micro="GAMES" value=${fmtNum(agg.count)} label=${t('总局数')} />
      <${StatCard} micro="WINS" value=${fmtNum(agg.wins)} label=${t('胜场')} tone="mint" />
      <${StatCard} micro="WIN RATE" value=${pct(agg.wins, agg.count)} label=${t('胜率')} tone="gold" />
      <${StatCard} micro="HIDDEN CORE" value=${fmtNum(agg.hidden.reached)} label=${t('到达隐秘核心')} />
      <${StatCard} micro="HIDDEN CLEAR" value=${fmtNum(agg.hidden.cleared)} label=${t('通关隐秘核心')} />
      <${StatCard} micro="BEST ROUND" value=${fmtNum(agg.rounds.max)} label=${t('最远回合')} />
      <${StatCard} micro="TIME PLAYED" value=${playedText(agg.duration.totalMs)} label=${t('累计时长')} />
    </div>
    <p class="st-split"><span>${t('单人')} <b class="num">${fmtNum(agg.byMode.solo)}</b></span><span>${t('同盟')} <b class="num">${fmtNum(agg.byMode.coop)}</b></span></p>
    ${rows.length ? html`<div class="st-tablewrap"><table class="st-table">
      <thead><tr><th>${t('难度')}</th><th class="num">${t('局数')}</th><th class="num">${t('胜场')}</th><th class="num">${t('胜率')}</th><th class="num">${t('隐秘核心通关')}</th></tr></thead>
      <tbody>
        ${rows.map((d) => {
          const v = agg.byDifficulty[d];
          return html`<tr key=${d}>
            <td class="st-diff" style=${`--d-color:${DIFFICULTY_COLORS[d] || 'var(--text-lo)'}`}>${difficultyName(d)}</td>
            <td class="num">${fmtNum(v.games)}</td>
            <td class="num">${fmtNum(v.wins)}</td>
            <td class="num">${pct(v.wins, v.games)}</td>
            <td class="num">${fmtNum(v.hiddenCleared)}</td>
          </tr>`;
        })}
      </tbody>
    </table></div>` : null}
    ${titles.length ? html`<h4 class="st-sub">${t('称号')}</h4>
      <div class="st-titles">
        ${titles.map((x) => html`<div key=${x.id} class=${cx('st-title', !x.count && 'is-none')} title=${x.text || ''}>
          <${Img} src=${titleIconUrl(gd.m, x.picId)} class="st-title__icon" fallback=${html`<${Icon} name="crown" />`} />
          <div class="st-title__text"><span>${x.name}</span><b class="num">${fmtNum(x.count)}</b></div>
        </div>`)}
      </div>` : null}
    <p class="st-rule"><${Icon} name="info" />${t('计入统计：打到结算的对局，以及中途退出前至少清完 1 个回合的对局；更早退出的对局只留在对局记录里。')}${agg.excluded
      ? html` <b>${t('另有 {n} 局未计入统计', { n: agg.excluded })}</b>` : null}</p>
  <//>`;
}

/** 策略: per-band used / passed / pass rate, most used first (the user's headline ask). */
function Bands({ agg, gd }) {
  const rows = Object.entries(agg.bands).sort((a, b) => (b[1].games - a[1].games) || (b[1].wins - a[1].wins));
  return html`<${Section} title=${t('策略')} micro="STRATEGIES">
    ${rows.length ? html`<div class="st-tablewrap"><table class="st-table">
      <thead><tr><th>${t('策略')}</th><th class="num">${t('使用局数')}</th><th class="num">${t('通过局数')}</th><th class="num">${t('通过率')}</th></tr></thead>
      <tbody>
        ${rows.map(([bandId, v]) => {
          const band = gd.band(bandId);
          const rate = v.games > 0 ? Math.round((v.wins / v.games) * 100) : 0;
          return html`<tr key=${bandId}>
            <td><span class="st-band">${band ? html`<${BandIcon} bandId=${band.bandId} size="xs" />${band.name}` : bandId}</span></td>
            <td class="num">${fmtNum(v.games)}</td>
            <td class="num">${fmtNum(v.wins)}</td>
            <td class="num st-rate"><span class="st-bar" aria-hidden="true"><i style=${`width:${rate}%`}></i></span><b>${pct(v.wins, v.games)}</b></td>
          </tr>`;
        })}
      </tbody>
    </table></div>` : html`<p class="st-empty">${t('还没有记录 —— 完成一局对局后，这里会开始积累。')}</p>`}
  <//>`;
}

const SUM_ROWS = [
  ['kills', N_('击倒敌人')], ['bossDamage', N_('领袖伤害')], ['dmgDealt', N_('造成伤害')], ['activatedLayers', N_('盟约层数')],
  ['merges', N_('晋升次数')], ['itemsEquipped', N_('配发装备')], ['gold', N_('消耗资金')], ['perfectRounds', N_('完美作战')],
  ['refreshes', N_('刷新次数')], ['leaks', N_('未击倒')], ['lpLost', N_('损失生命')],
];

/** 战斗累计: the self player's sums over the settled matches. */
function CombatSums({ agg }) {
  const rows = SUM_ROWS.filter(([k]) => Number.isFinite(agg.sums[k]));
  return html`<${Section} title=${t('战斗累计')} micro="COMBAT TOTALS">
    ${rows.length ? html`<div class="st-sums">
      ${rows.map(([k, label]) => html`<div key=${k} class="st-sum"><span>${t(label)}</span><b class="num">${fmtNum(agg.sums[k])}</b></div>`)}
    </div>` : html`<p class="st-empty">${t('还没有记录 —— 完成一局对局后，这里会开始积累。')}</p>`}
  <//>`;
}

/** One 对局记录 row: what it was, who won, whether it counted and whether the settlement can be re-viewed. */
function HistoryRow({ rec, gd, onOpen }) {
  const self = selfRowOf(rec);
  const quit = rec.end === 'quit';
  const counted = countsTowardStats(rec);
  const won = self ? !!self.victory : !!rec.victory;
  const band = self?.bandId ? gd.band(self.bandId) : null;
  const rounds = roundsOf(rec);
  const known = Number.isFinite(self?.roundsPassed) || Number.isFinite(rec.roundsPassed);
  const view = !quit && !rec.compact; // a quit has nothing settled; a compacted record no rows left
  const open = () => onOpen(rec);
  return html`<tr class=${cx(quit ? 'is-quit' : won ? 'is-win' : 'is-lose', !counted && 'is-excluded', view && 'is-clickable')}
      title=${view ? t('点击查看该局结算') : !counted ? t('没有清完第一个回合就退出，不计入统计') : quit ? t('中途退出的对局没有结算可看') : t('较早的对局只保留汇总，不能回看结算')}
      tabIndex=${view ? 0 : undefined}
      onClick=${view ? open : undefined} onKeyDown=${view ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}>
    <td class="st-t">${dateTime(rec.t)}</td>
    <td>${difficultyName(rec.difficulty)}</td>
    <td>${rec.roomMode === 'solo' ? t('单人') : rec.roomMode === 'coop' ? t('同盟') : '—'}</td>
    <td><span class="st-band">${band ? html`<${BandIcon} bandId=${band.bandId} size="xs" />${band.name}` : self?.bandId || '—'}</span></td>
    <td class="st-res">${quit ? html`<span class="t-quit">${t('中途退出')}</span>` : html`<span class=${won ? 't-win' : 't-lose'}>${won ? t('胜') : t('负')}</span>`}
      ${!counted ? html`<em class="st-chip">${t('不计入统计')}</em>` : null}</td>
    <td class="num">${known ? fmtNum(rounds) : '—'}</td>
    <td class="st-go" aria-hidden="true">${view ? html`<${Icon} name="chevronRight" />` : null}</td>
  </tr>`;
}

/** 对局记录: every stored match, newest first, HISTORY_PAGE rows at a time. */
function History({ records, gd, onOpen }) {
  const [shown, setShown] = useState(HISTORY_PAGE);
  const rows = records.slice(0, shown);
  return html`<${Section} title=${t('对局记录')} micro=${`HISTORY · ${records.length}`}>
    ${rows.length ? html`<div class="st-tablewrap"><table class="st-table st-table--history">
      <thead><tr><th>${t('时间')}</th><th>${t('难度')}</th><th>${t('模式')}</th><th>${t('策略')}</th><th>${t('结果')}</th><th class="num">${t('回合')}</th><th aria-hidden="true"></th></tr></thead>
      <tbody>${rows.map((r) => html`<${HistoryRow} key=${r.id} rec=${r} gd=${gd} onOpen=${onOpen} />`)}</tbody>
    </table></div>
    ${records.length > shown ? html`<div class="st-more"><${Button} size="sm" variant="secondary" onClick=${() => setShown(shown + HISTORY_PAGE)}>${t('显示更多（还有 {n} 局）', { n: records.length - shown })}<//></div>` : null}
    <p class="st-hint">${t('点击一行，回看该局结算；中途退出的对局只留记录。')} ${t('最多保留最近 {max} 局，只有最新的 {full} 局能回看结算。', { max: MAX_RECORDS, full: FULL_KEEP })}</p>`
      : html`<p class="st-empty">${t('还没有记录 —— 完成一局对局后，这里会开始积累。')}</p>`}
  <//>`;
}

/** A stored match re-viewed as its settlement screen: the full game data is loaded now (the lobby alone never loads it). */
function Replay({ rec, onBack }) {
  const gd = useGameData();
  const res = useMemo(() => recordToResult(rec), [rec]);
  if (!gd.ready) return html`<div class="st-loading"><${Spinner} size="md" /></div>`;
  return html`<${ResultView} res=${res} pub=${null} myId=${rec.selfId} backLabel=${t('返回统计')} onBack=${onBack} quiet=${true} />`;
}

/** The overlay, rendered while open (its data hooks run only then). */
function StatsScreen({ tab }) {
  const ready = useData('config', 'bands', 'assets');
  const gd = useMemo(() => makeLookups(ready), [ready, data.locale()]);
  const [stats, setStats] = useState(() => loadStats());
  const [replay, setReplay] = useState(null);
  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const replayRef = useRef(null);
  replayRef.current = replay;
  const inMatch = useStore((s) => selectRoute(s) === 'game');
  useDocClass('sp-stats-open');

  // a match starting (the host pressed 开始) takes the player to its briefing: the overlay must not sit on top of it
  useEffect(() => { if (inMatch) closeStats(); }, [inMatch]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal')) return; // a confirm dialog on top takes the Esc
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (replayRef.current) setReplay(null); else closeStats();
    };
    window.addEventListener('keydown', onKey, true);
    const timer = setTimeout(() => boxRef.current?.focus?.(), 30);
    return () => { window.removeEventListener('keydown', onKey, true); clearTimeout(timer); };
  }, []);

  const agg = useMemo(() => aggregateStats(stats.records), [stats]);
  const reload = () => setStats(loadStats());

  const doExport = () => {
    try {
      const payload = exportStats(stats);
      downloadText(exportFilename(), JSON.stringify(payload));
      toast(t('已导出 {n} 条对局记录', { n: payload.records.length }), 'success');
    } catch (err) {
      toastError(err);
    }
  };
  const doFile = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // allow re-picking the same file
    if (!file) return;
    if (file.size > IMPORT_MAX_CHARS) { toast(t('文件过大，无法导入'), 'error'); return; }
    try {
      const raw = JSON.parse(await readFileText(file));
      const { stats: merged, added, skipped, dropped } = importStats(raw, loadStats());
      if (added && !saveStats(merged)) { toast(t('无法写入本机存储，可能已满'), 'error'); return; }
      reload();
      const tail = (skipped ? t('（跳过重复 {skipped} 条）', { skipped }) : '') + (dropped ? t('（{n} 条无法读取）', { n: dropped }) : '');
      toast(added ? t('已导入 {added} 条记录{tail}', { added, tail }) : t('没有新记录（全部与现有数据重复）'), 'success');
    } catch (err) {
      toast(err?.code === 'stats-newer-version' ? t('导入失败：这份文件由更新版本的客户端导出，请先升级客户端') : t('导入失败：不是有效的统计导出文件'), 'error');
    }
  };
  const doClear = async () => {
    const ok = await confirmDialog({
      title: t('清空统计数据'), micro: 'CLEAR STATISTICS', danger: true, okText: t('清空'),
      text: t('将删除本机保存的 {n} 条对局记录，无法恢复。', { n: stats.records.length }),
    });
    if (!ok) return;
    if (!saveStats(emptyStats())) { try { globalThis.localStorage?.removeItem('sp.pref.stats'); } catch { /* ignore */ } }
    reload();
    toast(t('已清空本机统计数据'), 'success');
  };

  if (replay) return html`<div class="st st--replay" ref=${boxRef} tabindex="-1" role="dialog" aria-modal="true" aria-label=${t('统计数据')}>
    <${Replay} rec=${replay} onBack=${() => setReplay(null)} />
  </div>`;

  const tabInfo = TABS.find((x) => x.id === tab) || TABS[0];
  const empty = !stats.records.length;
  return html`<div class="st" role="dialog" aria-modal="true" aria-label=${t('统计数据')} tabindex="-1" ref=${boxRef}>
    <div class="st__bg" aria-hidden="true"></div>
    <header class="st-top">
      <div class="st-top__left">
        <${Button} variant="ghost" size="md" icon="chevronLeft" class="st-back" onClick=${closeStats} aria-label=${t('返回')} title=${t('返回 (Esc)')}>${t('返回')}<//>
      </div>
      <div class="st-top__center">
        <${MicroLabel} tone="mint">STATISTICS // ${tabInfo.micro}<//>
        <div class="st-tabs" role="tablist" aria-label=${t('统计数据')}>
          ${TABS.map((x) => html`<button key=${x.id} type="button" role="tab" aria-selected=${x.id === tab ? 'true' : 'false'} data-tab=${x.id}
            class=${cx('st-tab', x.id === tab && 'is-on')} onClick=${() => statsStore.set({ tab: x.id })}>${t(x.name)}</button>`)}
        </div>
      </div>
      <div class="st-top__right">
        <${Button} variant="ghost" size="sm" data-testid="stats-export" disabled=${empty || stats.newer} onClick=${doExport} title=${t('导出为文件（可在别的设备上导入）')}>${t('导出')}<//>
        <${Button} variant="ghost" size="sm" data-testid="stats-import" disabled=${stats.newer} onClick=${() => fileRef.current?.click()} title=${t('从导出的文件导入（与现有记录合并）')}>${t('导入')}<//>
        <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${doFile} />
        <${Button} variant="secondary" size="sm" data-testid="stats-clear" disabled=${empty || stats.newer} onClick=${doClear} title=${t('清空本机的统计数据')}>${t('清空')}<//>
      </div>
    </header>
    <p class="st-note"><${Icon} name="info" />${t('本机数据：只保存在这个浏览器里，不会上传到服务器；同盟对局里队友的代号也会存在本机（导出文件里也有）。')}</p>
    ${stats.damaged ? html`<p class="st-note is-warn"><${Icon} name="warn" />${t('本机保存的统计数据无法读取，已另存为备份，从现在起重新记录。')}</p>` : null}
    ${stats.dropped ? html`<p class="st-note is-warn"><${Icon} name="warn" />${t('有 {n} 条记录已损坏，已忽略。', { n: stats.dropped })}</p>` : null}
    <main class="st-body" data-tab=${tab}>
      ${!ready ? html`<div class="st-loading"><${Spinner} size="md" /></div>`
        : stats.newer ? html`<p class="st-empty">${t('检测到更新版本的统计数据，请先升级客户端再查看，以免覆盖数据。')}</p>`
          : empty ? html`<p class="st-empty">${t('还没有记录 —— 完成一局对局后，这里会开始积累。')}</p>`
            : tab === 'bands' ? html`<${Bands} agg=${agg} gd=${gd} />`
              : tab === 'totals' ? html`<${CombatSums} agg=${agg} />`
                : tab === 'history' ? html`<${History} records=${stats.records} gd=${gd} onOpen=${setReplay} />`
                  : html`<${Overview} agg=${agg} gd=${gd} />`}
    </main>
  </div>`;
}

/** Global stats viewer host — mounted once by main.js; renders nothing (and loads nothing) until opened. */
export function StatsHost() {
  const { open, tab } = useStore((s) => s, Object.is, statsStore);
  if (!open) return null;
  return html`<${StatsScreen} tab=${tab} />`;
}

