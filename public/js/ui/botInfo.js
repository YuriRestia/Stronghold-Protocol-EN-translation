// (fork, GitHub #87 / #124) The 「AI 方案」 popup: every bot a room's host can give an AI seat, how it plays and, for a
// tactic profile, its tactics (shared/botProfiles.js ROOM_BOTS, BOT_INFO). Opened from a seat card's ⓘ (screens/room.js)
// and from an AI player's row in the match (ui/teamPanel.js).
import { html, Modal } from './components.js';
import { ROOM_BOTS, BOT_INFO, DEFAULT_ROOM_BOT } from '../../../shared/botProfiles.js';
import { t } from '../../../shared/i18n.js';

/** One bot's block; `current`: the seat's own bot, marked. */
function BotBlock({ bot, current }) {
  const info = BOT_INFO[bot.id] || { about: [] };
  return html`<section class=${`botinfo__bot${current ? ' is-current' : ''}`} data-bot=${bot.id}>
    <h3 class="botinfo__name">${t(bot.label)}${bot.id === DEFAULT_ROOM_BOT ? html` <small>${t('默认')}</small>` : null}
      ${current ? html` <small class="botinfo__here">${t('当前')}</small>` : null}
      ${Number.isFinite(info.strength) ? html` <span class="botinfo__strength" title=${t('强度：单人终极难度的胜率（%），80 局测试')}>(${info.strength}${Number.isFinite(info.team) ? html` · <span title=${t('4 名此 AI 组队时终极难度的胜率（%），40 局测试')}>${info.team}</span>` : null})</span>` : null}</h3>
    <ul class="botinfo__about">${info.about.map((line) => html`<li key=${line}>${t(line)}</li>`)}</ul>
    ${info.tactics?.length ? html`<p class="botinfo__sub">${t('战术（从上到下优先，之后由基础 AI 决定）')}</p>
      <ol class="botinfo__tactics">${info.tactics.map((x) => html`<li key=${x.id}><code>${x.id}</code> ${t(x.text)}</li>`)}</ol>` : null}
  </section>`;
}

/** @param {{ open: boolean, current?: string | null, onClose: () => void }} props */
export function BotInfoModal({ open, current = null, onClose }) {
  if (!open) return null;
  return html`<${Modal} open=${true} class="botinfo" micro="AI PROFILES" title=${t('AI 方案')} width="min(36rem, 96vw)" onClose=${onClose}>
    <p class="botinfo__intro">${t('创建者可以为每个 AI 队友选择方案。')} ${t('名称后的数字是强度：单人终极难度的胜率（%）。')} ${t('第二个数字：4 名此 AI 组队时的胜率（%）。')}</p>
    ${ROOM_BOTS.map((b) => html`<${BotBlock} key=${b.id} bot=${b} current=${b.id === current} />`)}
  <//>`;
}
