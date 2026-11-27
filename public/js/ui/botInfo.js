// (fork, GitHub #87 / #124) The 「AI 方案」 popup: every bot a room's host can give an AI seat, how it plays and, for a
// tactic profile, its tactics (shared/botProfiles.js ROOM_BOTS, BOT_INFO). Opened from a seat card's ⓘ (screens/room.js)
// and from an AI player's row in the match (ui/teamPanel.js).
import { html, Modal } from './components.js';
import { ROOM_BOTS, BOT_INFO, DEFAULT_ROOM_BOT, botScore, spaccScore, strengthMatches } from '../../../shared/botProfiles.js';
import { t } from '../../../shared/i18n.js';

/** One bot's block; `current`: the seat's own bot, marked. */
function BotBlock({ bot, current }) {
  const info = BOT_INFO[bot.id] || { about: [] };
  const sc = botScore(info);
  const sp = spaccScore(info);
  return html`<section class=${`botinfo__bot${current ? ' is-current' : ''}`} data-bot=${bot.id}>
    <h3 class="botinfo__name">${t(bot.label)}${bot.id === DEFAULT_ROOM_BOT ? html` <small>${t('默认')}</small>` : null}
      ${current ? html` <small class="botinfo__here">${t('当前')}</small>` : null}
      ${sc ? html` <span class="botinfo__strength" title=${t('强度：单人与 4 人组队终极难度胜率（%）之和，0–200；± 为 1 个标准差')}>(${sc.score} ± ${sc.sd})</span>` : null}</h3>
    ${sc ? html`<p class="botinfo__scores">${t('单人 {solo}%（{soloN} 局）· 4 人组队 {team}%（{teamN} 局）', { solo: info.strength, soloN: strengthMatches(info).solo, team: info.team, teamN: strengthMatches(info).team })}</p>` : null}
    <p class="botinfo__spacc" data-testid="botinfo-spacc" title=${t('固定风险标签组合（单人与 4 人组队各 8 组）下终极难度的胜率，对已测的组数取平均；越高越好')}>${sp
      ? t('风险标签胜率：平均 {rate}%（已测 {sets} / {of} 组风险标签组合）', { rate: sp.rate, sets: sp.sets, of: sp.of })
      : t('风险标签胜率：尚未测量')}</p>
    <ul class="botinfo__about">${info.about.map((line) => html`<li key=${line}>${t(line)}</li>`)}</ul>
    ${info.tactics?.length ? html`<p class="botinfo__sub">${t('战术（从上到下优先，之后由基础 AI 决定）')}</p>
      <ol class="botinfo__tactics">${info.tactics.map((x) => html`<li key=${x.id}>${t(x.text)}</li>`)}</ol>` : null}
  </section>`;
}

/** @param {{ open: boolean, current?: string | null, onClose: () => void }} props */
export function BotInfoModal({ open, current = null, onClose }) {
  if (!open) return null;
  return html`<${Modal} open=${true} class="botinfo" micro="AI PROFILES" title=${t('AI 方案')} width="min(36rem, 96vw)" onClose=${onClose}>
    <p class="botinfo__intro">${t('创建者可以为每个 AI 队友选择方案。')} ${t('名称后的数字是强度：单人与 4 人组队终极难度的胜率（%）之和（0–200），± 为 1 个标准差。')} ${t('风险标签胜率是在固定风险标签组合下的终极难度胜率，越高越好；只有测量组数相同的方案才能直接比较。')}</p>
    ${ROOM_BOTS.map((b) => html`<${BotBlock} key=${b.id} bot=${b} current=${b.id === current} />`)}
  <//>`;
}
