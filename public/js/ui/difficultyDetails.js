// Difficulty details: what each difficulty actually changes, side by side. The lobby cards
// only show the official one-line blurbs (`effectDescList`: "·作战环境无比困难"); the real differences live in
// data/config.json `modes[modeId]` — the per-round enemy multipliers `enemyScale` (research 01 A3, a PRTS community table; server/match/gamedata.js
// baseEnemyScale applies as-is), the Leader HP pool (data/bosses.json `bloodPoint[difficulty]`, × players alive in
// co-op), the per-match Alliance bans (`config.bans`), the map pool, the Improv rounds, the Hidden Core and the
// battle time limits. `difficultyTable` is pure (unit-tested); `DifficultyDetailsButton` opens it in a Modal.

import { useState } from '../../vendor/hooks.module.js';
import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, modeIdFor } from '../../../shared/constants.js';
import { html, Button, Modal, DifficultyIcon } from './components.js';
import { data, getConfig, useData } from '../data.js';
import { t } from '../../../shared/i18n.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mul = (v) => (v == null ? '—' : `×${v.toFixed(2)}`);
const big = (v) => v.toLocaleString('en-US');

/** The end of the enemy-multiplier range: the mode's last regular round (14, or 9 in solo 标准), the Leader round included
 * (its escorts and parts take the multipliers; the Leader's own HP pool does not). */
export function lastWaveRound(mode) {
  return Math.max(1, num(mode?.lastRound) ?? 14);
}

/**
 * The comparison table for one room mode.
 * @param {'solo'|'coop'} roomMode
 * @param {{ config: any, bosses: any }} src data/config.json and data/bosses.json
 * @returns {{ rangeEnd: number, columns: string[], rows: Array<{ key: string, label: string, values: string[] }>, perRound: any[] }}
 */
export function difficultyTable(roomMode, { config, bosses }) {
  const modes = DIFFICULTIES.map((d) => config?.modes?.[modeIdFor(roomMode, d)] || null);
  // the range ends at the mode's last regular round; the label names the common one (14), a shorter mode its own
  const rangeEnd = Math.max(...modes.map((m) => (m ? lastWaveRound(m) : 0)));
  const range = (m, k) => {
    const end = lastWaveRound(m);
    const text = `${mul(scale(m, 1, k))} → ${mul(scale(m, end, k))}`;
    return end === rangeEnd ? text : t('{range}（至第 {n} 回合）', { range: text, n: end });
  };
  const scale = (m, r, k) => num(m?.enemyScale?.[String(r)]?.[k]);
  const rows = [];
  const row = (key, label, fn) => rows.push({ key, label, values: modes.map((m, i) => (m ? fn(m, DIFFICULTIES[i]) : '—')) });

  row('rounds', t('回合数'), (m) => (num(m.hiddenRound) ? t('{n} + 隐秘核心', { n: m.lastRound }) : String(m.lastRound ?? '—')));
  row('hp', t('敌人生命倍率（第 1 → {n} 回合）', { n: rangeEnd }), (m) => range(m, 'hp'));
  row('atk', t('敌人攻击倍率（第 1 → {n} 回合）', { n: rangeEnd }), (m) => range(m, 'atk'));
  row('speed', t('敌人移动速度'), (m) => {
    const entries = Object.entries(m.enemyScale || {}).map(([r, e]) => [Number(r), num(e?.speed) ?? 1]).sort((a, b) => a[0] - b[0]);
    const first = entries.find(([, s]) => s !== 1);
    return first ? t('{x}（第 {r} 回合起）', { x: mul(first[1]), r: first[0] }) : mul(1);
  });
  // Leaders: each match draws one from the mode's weighted pool, each with its own official HP per difficulty (no common
  // multiplier); the range here, every Leader in `leaders` below
  const hpRange = (weights, d) => {
    const hp = Object.keys(weights || {}).map((id) => num(bosses?.[id]?.bloodPoint?.[d])).filter((v) => v != null);
    if (!hp.length) return '—';
    const lo = Math.min(...hp), hi = Math.max(...hp);
    return `${lo === hi ? big(lo) : `${big(lo)}–${big(hi)}`} *`;
  };
  row('leader', t('最终攻势领袖生命'), (m, d) => hpRange(m.bossWeights, d));
  row('hiddenLeader', t('隐秘核心领袖生命'), (m, d) => (num(m.hiddenRound) ? hpRange(m.hiddenBossWeights, d) : '—'));
  row('bans', t('每局禁用盟约'), (m, d) => {
    const b = config?.bans?.[d] || {};
    const fixed = Array.isArray(m.inactiveBondIds) ? m.inactiveBondIds.length : 0;
    const parts = [b.core ? t('{n} 核心', { n: b.core }) : null, b.addon ? t('{n} 附加', { n: b.addon }) : null].filter(Boolean);
    const random = parts.length ? t('随机 {list}', { list: parts.join(' + ') }) : t('无');
    return fixed ? t('固定 {n} 个 + {rest}', { n: fixed, rest: random }) : random;
  });
  row('maps', t('地图池大小'), (m) => String(Array.isArray(m.stages) ? m.stages.length : '—'));
  row('improv', t('机变回合'), (m) => (Array.isArray(m.spRounds) && m.spRounds.length ? m.spRounds.join(', ') : t('无')));
  row('hidden', t('进入隐秘核心'), (m) => {
    if (!num(m.hiddenRound)) return '—';
    const need = config?.hiddenCore?.[roomMode === 'solo' ? 'single' : 'multi'];
    return need != null ? `${t('层数 > {n}', { n: need })} †` : '✓';
  });
  row('time', t('作战时限（秒）'), (m) => {
    const v = Object.values(m.combatTimeLimit || {}).map(num).filter((x) => x != null);
    return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : '—';
  });
  // every round, like the community charts of the official table: rounds 1…last (+ the Hidden Core when any mode has one)
  const last = Math.max(...modes.map((m) => num(m?.lastRound) ?? 0));
  const hidden = Math.max(...modes.map((m) => num(m?.hiddenRound) ?? 0));
  const perRound = [];
  for (let r = 1; r <= Math.max(last, hidden); r++) {
    const has = (m) => m && r <= (r === hidden ? hidden : num(m.lastRound) ?? 0) && (r !== hidden || num(m.hiddenRound));
    perRound.push({
      round: r, hidden: r === hidden && r > last,
      hp: modes.map((m) => (has(m) ? mul(scale(m, r, 'hp')) : '—')),
      atk: modes.map((m) => (has(m) ? mul(scale(m, r, 'atk')) : '—')),
    });
  }
  // every Leader of the pools (the draw weights are the same on every difficulty of a mode: the first mode's), by pool
  const leaders = [];
  const ref = modes.find((m) => num(m?.hiddenRound)) || modes.find(Boolean);
  for (const [hidden, weights] of [[false, ref?.bossWeights], [true, ref?.hiddenBossWeights]]) {
    const total = Object.values(weights || {}).reduce((a, w) => a + (num(w) ?? 0), 0);
    for (const [id, w] of Object.entries(weights || {})) {
      const b = bosses?.[id];
      leaders.push({
        id, hidden, name: b?.name || id,
        chance: total ? `${Math.round(((num(w) ?? 0) / total) * 100)}%` : '—',
        hp: DIFFICULTIES.map((d, i) => {
          const m = modes[i];
          const inPool = m && (hidden ? num(m.hiddenRound) && m.hiddenBossWeights?.[id] != null : m.bossWeights?.[id] != null);
          const v = num(b?.bloodPoint?.[d]);
          return inPool && v != null ? big(v) : '—';
        }),
      });
    }
  }
  return { rangeEnd, columns: [...DIFFICULTIES], rows, perRound, leaders };
}

/** Solo / co-op switch of the dialog: the two modes have separate official tables (research 01 A3). */
function ModeSwitch({ mode, onPick }) {
  const opts = [['solo', t('独立模拟')], ['coop', t('同盟模拟')]];
  return html`<div class="dpick diff-details__mode" role="radiogroup" aria-label=${t('显示哪种模式的数值')}>
    ${opts.map(([k, label]) => html`<button key=${k} type="button" role="radio" aria-checked=${mode === k ? 'true' : 'false'}
      class=${`dpick__opt${mode === k ? ' is-active' : ''}`} onClick=${() => onPick(k)}>${label}</button>`)}
  </div>`;
}

/** "Difficulty details" button + dialog for the lobby (roomMode: the mode shown first; the dialog can switch). */
export function DifficultyDetailsButton({ roomMode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('coop');
  useData('config', 'bosses');
  const config = getConfig();
  const bosses = open ? data.get('bosses') : null;
  const table = open && config ? difficultyTable(mode, { config, bosses }) : null;
  const show = () => { setMode(roomMode === 'solo' ? 'solo' : 'coop'); setOpen(true); };
  return html`<${Button} variant="ghost" size="sm" icon="info" class="diff-details-btn" onClick=${show}>${t('难度详情')}<//>
    <${Modal} open=${open} onClose=${() => setOpen(false)} title=${t('难度详情')} micro="DIFFICULTY" width="12rem" class="diff-details"
      actions=${html`<${Button} variant="secondary" onClick=${() => setOpen(false)}>${t('关闭')}<//>`}>
      <${ModeSwitch} mode=${mode} onPick=${setMode} />
      ${table ? html`<div class="diff-details__scroll"><table class="diff-details__table">
        <thead><tr><th></th>${table.columns.map((d) => html`<th key=${d} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}>
          <${DifficultyIcon} difficulty=${d} />${t(DIFFICULTY_NAMES[d].replace('模拟', ''))}</th>`)}</tr></thead>
        <tbody>${table.rows.map((r) => html`<tr key=${r.key}><th scope="row">${r.label}</th>${r.values.map((v, i) => html`<td key=${i} class="num">${v}</td>`)}</tr>`)}</tbody>
      </table></div>
      <p class="set-hint">* ${mode === 'solo'
        ? t('每局随机抽取一名领袖，各领袖的生命见下方「各领袖、各难度的领袖生命」。敌人生命倍率对领袖不生效。')
        : t('每局随机抽取一名领袖，各领袖的生命见下方「各领袖、各难度的领袖生命」。领袖的总生命为该数值 × 开战时存活的博士人数；敌人生命倍率对领袖不生效。')}</p>
      <p class="set-hint">† ${mode === 'solo'
        ? t('你所有已激活盟约的层数之和，在第 14 回合休整期结束时计算；还需要赢下第 14 回合，并且剩余目标生命值大于 1。')
        : t('所有仍在场的博士的已激活盟约层数之和，在第 14 回合休整期结束时计算；还需要赢下第 14 回合，并且全队剩余目标生命值大于 1。')}</p>
      <details class="diff-details__rounds">
        <summary>${t('各回合、各难度的敌人生命与攻击')}</summary>
        <div class="diff-details__pair">
          ${['hp', 'atk'].map((stat) => html`<div key=${stat} class="diff-details__scroll"><table class="diff-details__table diff-details__table--rounds">
            <thead><tr><th>${stat === 'hp' ? t('生命') : t('攻击')}</th>${table.columns.map((d) => html`<th key=${d} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}>${t(DIFFICULTY_NAMES[d].replace('模拟', ''))}</th>`)}</tr></thead>
            <tbody>${table.perRound.map((r) => html`<tr key=${r.round}><th scope="row">${r.hidden ? t('隐秘核心') : t('第 {n} 回合', { n: r.round })}</th>${r[stat].map((v, i) => html`<td key=${i} class="num">${v}</td>`)}</tr>`)}</tbody>
          </table></div>`)}
        </div>
      </details>
      <details class="diff-details__rounds">
        <summary>${t('各领袖、各难度的领袖生命')}</summary>
        <div class="diff-details__scroll"><table class="diff-details__table diff-details__table--rounds">
          <thead><tr><th>${t('领袖')}</th><th>${t('出现概率')}</th>${table.columns.map((d) => html`<th key=${d} style=${`--d-color:${DIFFICULTY_COLORS[d]}`}>${t(DIFFICULTY_NAMES[d].replace('模拟', ''))}</th>`)}</tr></thead>
          <tbody>${['final', 'hidden'].map((pool) => {
            const list = table.leaders.filter((l) => l.hidden === (pool === 'hidden'));
            return list.length ? html`<tr key=${pool} class="diff-details__group"><th colspan=${2 + table.columns.length}>${pool === 'hidden' ? t('隐秘核心') : t('最终攻势')}</th></tr>
              ${list.map((l) => html`<tr key=${l.id}><th scope="row">${l.name}</th><td class="num">${l.chance}</td>${l.hp.map((v, i) => html`<td key=${i} class="num">${v}</td>`)}</tr>`)}` : null;
          })}</tbody>
        </table></div>
      </details>
      <p class="set-hint">${t('这些都是对局中实际使用的数值。敌人倍率来自 PRTS 社区整理的逐回合表（官方数据表中没有），其余取自官方数据表。')}</p>` : html`<p class="set-hint">${t('正在加载…')}</p>`}
    <//>`;
}
