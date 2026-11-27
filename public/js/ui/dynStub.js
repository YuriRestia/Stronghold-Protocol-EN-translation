// ui/dynStub.js — (fork) a stand-in for the dynamic illustration renderer (render/dynillust/index.js, its mount API in
// docs/design/vfx-format.md §33.19) with exactly that API: ui/dynCards.js falls back to it when the renderer cannot
// load (no WebGL, a script that fails). It knows no key, so every card keeps its 2D art.

const stage = {
  quality: 'full',
  index: () => Promise.resolve({}),
  preload: () => Promise.resolve(),
  release() {},
  mount() {
    const card = { canvas: null, ready: Promise.resolve(false), state: 'failed', start() {}, setFraming() {}, unmount() { card.state = 'unmounted'; } };
    return card;
  },
};

/** The page's stage (the stand-in's: it shows nothing). */
export function getDynIllustStage() { return stage; }

/** No illustration on the stand-in. */
export function dynIllustKey() { return null; }
