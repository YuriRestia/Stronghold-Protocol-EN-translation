// render/dynillust/key.js — an operator's outfit → its illustration key in the `dynillust` group of
// data/local-assets.json (docs/design/vfx-format.md §33.19 Mount API, dynIllustKey). Imports nothing: the cards read it
// without loading the renderer (ui/dynCards.js: a wide room card's background, which shows on its 2D art too).

/**
 * The key in a `dynillust` group (data/local-assets.json) of an operator's outfit. Ids compare without case: the index
 * spells 7 Ambience Synesthesia outfits `@ambiencesynesthesia#N` where the outfit data and players' choices have
 * `@ambienceSynesthesia#N` (char_1046_sbell2 #8, mlyss #6, ines #5, logos #6, svrash #4, demkni #7, surtr #6), so
 * a player wearing one never got the illustration [src: Dev 52, 2026-11-23].
 * @param {Record<string, { charId?: string, skinId?: string }>|null|undefined} group
 * @param {string|null|undefined} charId
 * @param {string|null} [skinId] null: the E2 art, the entry whose skinId is `<charId>#2`
 * @returns {string|null}
 */
export function findDynIllustKey(group, charId, skinId = null) {
  if (!group || !charId) return null;
  const cid = String(charId).toLowerCase(), want = String(skinId || `${charId}#2`).toLowerCase();
  for (const [k, e] of Object.entries(group)) {
    if (e && typeof e.charId === 'string' && typeof e.skinId === 'string' && e.charId.toLowerCase() === cid && e.skinId.toLowerCase() === want) return k;
  }
  return null;
}
