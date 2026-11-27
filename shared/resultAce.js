// shared/resultAce.js — the ace of a final lineup: the result card's art in its 「阵容最强干员」 form (the setting
// 结算卡片立绘, ui/dynCards.js resultCardArt). Shared so the server can name it in m.public `ending` (server/match/results.js
// endingAces) before m.result, and the page picks the same unit from m.result (screens/settle.js).

/**
 * The ace of a lineup: the highest tier, elite first, the earliest on the board; a token never. null when none.
 * @param {any[]} lineup m.result players[].lineup (board order)
 */
export function aceOf(lineup) {
  // typed: the forEach callback assigns it, which tsc does not follow (it would stay `null`, then `never`)
  /** @type {{ u: any, s: number } | null} */
  let best = null;
  (Array.isArray(lineup) ? lineup : []).forEach((u) => {
    if (!u || u.kind === 'token') return;
    const s = (Number(u.tier) || 0) * 2 + (u.golden ? 1 : 0);
    if (!best || s > best.s) best = { u, s };
  });
  return best ? best.u : null;
}
