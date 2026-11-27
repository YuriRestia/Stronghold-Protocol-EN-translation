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
import { DynIllustHost, workersSupported } from './host.js';
import { findDynIllustKey } from './key.js';

let stage = null;

/**
 * The page's stage (made on first use): the cards are drawn in Workers (host.js, the same API) where the browser can,
 * else on the main thread. `globalThis.__dynMainThread` forces the main thread (checks that compare the two).
 */
export function getDynIllustStage() {
  if (!stage || stage.destroyed) {
    const opts = { manifest: () => assets.local() };
    stage = workersSupported() && !globalThis.__dynMainThread ? new DynIllustHost(opts) : new DynIllustStage(opts);
    stage.index();
  }
  return stage;
}

/** The illustration key of an operator's outfit (null skinId: the E2 art), or null without one / before the index. */
export function dynIllustKey(charId, skinId = null) {
  return findDynIllustKey(getDynIllustStage()._group, charId, skinId);
}

// the lookup itself imports nothing (key.js), so the cards can use it without loading the renderer
export { findDynIllustKey };

export { DynIllustStage } from './renderer.js';
export { DynIllustHost, workersSupported } from './host.js';
