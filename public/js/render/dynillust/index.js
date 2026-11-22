// render/dynillust/index.js — the mount API of the animated operator illustrations (docs/design/vfx-format.md §33.19
// Mount API). The screens (result, room, Grand Alliance) call only this:
//
//   dynIllustKey(charId, skinId | null) → key | null    (null skinId: the E2 art, `<charId>#2`)
//   const stage = getDynIllustStage()                    one per page: one WebGL context, offscreen
//   stage.quality = 'full' | 'half'                      from the D7 setting, before preload
//   await stage.preload(keys)                            D10: everything ready (or failed) before the cards show
//   const card = stage.mount(key, { onState })           card.canvas goes into the card's art layer, under overlays
//   card.ready → Promise<boolean>; card.start(); card.state; card.unmount()
//   stage.release(keep = [])                             the match starts: free what no card shows
//
// dynIllustKey reads the `dynillust` group of data/local-assets.json, which the stage loads on first use: it returns
// null until then (and for an operator / outfit without an official illustration); `await stage.index()` first.

import { assets } from '../../assets.js';
import { DynIllustStage } from './renderer.js';

let stage = null;

/** The page's stage (made on first use). */
export function getDynIllustStage() {
  if (!stage || stage.destroyed) {
    stage = new DynIllustStage({ manifest: () => assets.local() });
    stage.index();
  }
  return stage;
}

/** The illustration key of an operator's outfit (null skinId: the E2 art), or null without one / before the index. */
export function dynIllustKey(charId, skinId = null) {
  const g = getDynIllustStage()._group;
  if (!g || !charId) return null;
  const want = skinId || `${charId}#2`;
  for (const [k, e] of Object.entries(g)) if (e && e.charId === charId && e.skinId === want) return k;
  return null;
}

export { DynIllustStage } from './renderer.js';
