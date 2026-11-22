// ui/dynStub.js — (fork) a stand-in for the dynamic illustration renderer (render/dynillust/index.js, its mount API in
// docs/design/vfx-format.md §33.19) with exactly that API: the screens (ui/dynCards.js) run on it until the renderer is
// installed (setDynModule). It finds the keys the real one would (data/local-assets.json group `dynillust`) and draws
// nothing: every Card's `ready` is false, so every card keeps its 2D art.

import { data } from '../data.js';

/**
 * The dynillust key of an operator's illustration, or null when this server has none: the outfit's (`skinId`), else the
 * E2 art's (`<charId>#2`) — [unverified] until the contract says what null means (Dev 49, open).
 * @param {string} charId @param {string|null} skinId
 */
export function dynIllustKey(charId, skinId) {
  const group = data.get('local')?.groups?.dynillust;
  if (!group || typeof group !== 'object' || typeof charId !== 'string') return null;
  const want = typeof skinId === 'string' && skinId ? skinId : `${charId}#2`;
  for (const [key, e] of Object.entries(group)) if (e && e.charId === charId && e.skinId === want) return key;
  return null;
}

/** @param {{ parent: HTMLElement, quality: 'full'|'half' }} o */
export function createDynIllustStage(o) {
  void o;
  return {
    preload: () => Promise.resolve(),
    mount(el, key) {
      void el; void key;
      const card = { ready: Promise.resolve(false), state: 'failed', start() {}, unmount() { card.state = 'unmounted'; } };
      return card;
    },
    destroy() {},
  };
}
