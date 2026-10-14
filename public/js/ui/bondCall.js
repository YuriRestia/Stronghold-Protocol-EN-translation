// The briefing's 核心盟约 call (remake feature; server/match/bondCall.js): a player taps a core bond disc to tell the
// teammates which strategy it is going for (g.bondCall). m.public.players[].bondCall is synced to every seat; the disc
// shows a round P1–P4 marker at its top-left, a red marker without text when two or more players called the same bond,
// and the bond's tooltip names them; the strategy draft's order rows show each call (BondCallChip). Hookless helpers,
// rendered by ui/matchInfo.js MatchBondRow and screens/bandDraft.js.
// Styles: css/screens/briefing.css (.brief-call), css/screens/draft.css (.dorder__call).

import { html } from './components.js';
import { sortedPlayers } from './gameLogic.js';
import { Img } from './gameComponents.js';
import { bondIconUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** "P1 name": the player's seat label. */
export const seatLabel = (p) => `P${(p?.seat ?? 0) + 1}${p?.name ? ` ${p.name}` : ''}`;

/**
 * bondId → the players that called it, by seat.
 * @param {any} pub m.public
 * @returns {Map<string, any[]>}
 */
export function bondCallsOf(pub) {
  const out = new Map();
  for (const p of sortedPlayers(pub)) {
    if (typeof p.bondCall !== 'string') continue;
    if (!out.has(p.bondCall)) out.set(p.bondCall, []);
    out.get(p.bondCall).push(p);
  }
  return out;
}

/**
 * The tooltip line under the bond's own tip: who is going for it, or the conflict.
 * @param {any[]} callers
 */
export function bondCallTip(callers) {
  if (!callers?.length) return '';
  const players = callers.map(seatLabel);
  return callers.length > 1
    ? t('冲突：{players} 选择了同一盟约', { players }) // en: "Conflict: {players} picked the same alliance"
    : t('{players} 打算走此盟约', { players }); // en: "{players} is going for this alliance"
}

/**
 * The marker at the disc's top-left: P1–P4, or red with no text on a conflict.
 * @param {{ callers: any[], myId?: string|null }} props
 */
export function BondCallMark({ callers, myId = null }) {
  if (!callers?.length) return null;
  const conflict = callers.length > 1;
  const mine = !conflict && callers[0].playerId === myId;
  return html`<span class=${cx('brief-call num', conflict && 'is-conflict', mine && 'is-mine')} data-testid="bond-call" aria-hidden="true">
    ${conflict ? '' : `P${(callers[0].seat ?? 0) + 1}`}</span>`;
}

/**
 * The strategy draft's order row (screens/bandDraft.js): the core bond the player called in the briefing — icon + name.
 * @param {{ bondId?: string|null }} props
 */
export function BondCallChip({ bondId }) {
  const bond = typeof bondId === 'string' ? data.lookup('bonds', bondId) : null;
  if (!bond) return null;
  // t('打算走此盟约') en: "Alliance called in the briefing"
  return html`<span class="dorder__call" data-testid="bond-call-chip" title=${t('打算走此盟约')}>
    <${Img} src=${bondIconUrl(data.get('assets'), bondId)} class="dorder__call-icon" /><span>${bond.name}</span></span>`;
}
