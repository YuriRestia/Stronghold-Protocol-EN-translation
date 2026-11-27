// (fork, GitHub #132) The shared deck popup: how many copies of each operator are still in the deck all players buy
// from (server/match/match/intents.js deck: g.deck → m.deck). Grouped by class, then tier, then name; asked again on
// opening and whenever the round changes while it is open, so it is at most a round old (a teammate's buys and sales
// during the same prep show on the next request).
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Modal } from './components.js';
import { OperatorImage } from './gameComponents.js';
import { PROF_ORDER, PROF_NAME } from './loadoutModel.js';
import { data } from '../data.js';
import { net } from '../net.js';
import { t } from '../../../shared/i18n.js';

/**
 * The m.deck answer as class groups: [{ prof, ops: [{ id, chess, left, cap }] }], class order PROF_ORDER (others after),
 * each by tier then name. Operators without a record are left out.
 * @param {Array<[string, number, number]>} ops
 * @param {(id: string) => any} getChess
 */
export function deckGroups(ops, getChess) {
  const by = new Map();
  for (const row of Array.isArray(ops) ? ops : []) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
    const chess = getChess(row[0]);
    if (!chess) continue;
    const prof = chess.profession || '';
    if (!by.has(prof)) by.set(prof, []);
    by.get(prof).push({ id: row[0], chess, left: Math.max(0, Number(row[1]) || 0), cap: Math.max(0, Number(row[2]) || 0) });
  }
  const rank = (p) => { const i = PROF_ORDER.indexOf(p); return i < 0 ? PROF_ORDER.length : i; };
  return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([prof, list]) => ({ prof, ops: list.sort((a, b) => (a.chess.tier ?? 0) - (b.chess.tier ?? 0) || String(a.chess.name).localeCompare(String(b.chess.name))) }));
}

/** @param {{ open: boolean, round: number | null, onClose: () => void }} props */
export function DeckModal({ open, round, onClose }) {
  const [deck, setDeck] = useState(null);
  const seq = useRef(0);
  useEffect(() => net.on('m.deck', (msg) => {
    if (msg && msg.seq === seq.current && Array.isArray(msg.ops)) setDeck({ round: msg.round, ops: msg.ops });
  }), []);
  useEffect(() => {
    if (!open) return;
    seq.current = (seq.current % 1e9) + 1;
    try { Promise.resolve(net.request('g.deck', { seq: seq.current })).catch(() => {}); } catch { /* offline */ }
  }, [open, round]);
  if (!open) return null;
  const groups = deck ? deckGroups(deck.ops, (id) => data.lookup('chess', id)) : null;
  return html`<${Modal} open=${true} class="deck" micro="SHARED DECK" title=${t('共享牌库')} width="min(44rem, 96vw)" onClose=${onClose}>
    <p class="deck__intro">${t('所有博士共用一副牌库：每位干员还剩几张（剩余 / 总数）。每回合更新；队友本回合的购买与出售在下次打开时显示。')}</p>
    ${groups == null ? html`<p class="deck__wait">${t('正在读取…')}</p>` : groups.map((g) => html`<section key=${g.prof} class="deck__group">
      <h3 class="deck__prof">${PROF_NAME[g.prof] ? t(PROF_NAME[g.prof]) : g.prof}</h3>
      <ul class="deck__ops">${g.ops.map((o) => html`<li key=${o.id} class=${`deck__op deck__op--t${o.chess.tier ?? 1}${o.left === 0 ? ' is-out' : ''}`}
          data-op=${o.id} title=${`${o.chess.name} · ${t('{left} / {cap} 张', { left: o.left, cap: o.cap })}`}>
        <${OperatorImage} chess=${o.chess} class="deck__art" />
        <span class="deck__name">${o.chess.name}</span>
        <b class="deck__n num">${o.left}<small>/${o.cap}</small></b>
      </li>`)}</ul>
    </section>`)}
  <//>`;
}
