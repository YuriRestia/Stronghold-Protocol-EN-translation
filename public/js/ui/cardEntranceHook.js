// The result card's entrance on the page (screens/settle.js TeamCard): the hook that plays ui/cardEntrance.js's clip and
// draws its mattes. Kept apart from cardEntrance.js, which imports nothing of the page (no DOM, no data, no hooks), so the
// room cards' dissolve Worker (ui/dissolveWorker.js) can load the same drawing code.
import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { data } from '../data.js';
import { reducedMotion } from './device.js';
import { ANIM_DELAY_S, CLIP_LENGTH_S, CARD_BG, OVERLAY, STRIP_TOP, sampleShow, domState, entranceSprites, glInit, loadEntrance, drawMattes } from './cardEntrance.js';

/**
 * Play the entrance on a result card (screens/settle.js TeamCard): once, from the moment the card mounts, after
 * `index × ANIM_DELAY_S`. Drives the card's CSS variables (--ce-a its opacity, --ce-root / --ce-card the illustration's
 * and the name card's offsets in px, --ce-round the rounds group's opacity) and draws the mattes into the card's two
 * `.tcard__ce` canvases. Under reduced motion the card shows the clip's last frame at once. Returns false — and the card
 * keeps its own look — when the manifest lacks a sprite or the page has no WebGL2. With `gate` (a promise: the result
 * page's entrance gate, ui/dynCards.js makeEntranceGate) the card holds the clip's first frame (unseen: alpha 0) until
 * it resolves — its illustration live, failed or given up — and plays from then, so the one-shot entrance plays with the
 * illustration (the user, 2026-11-23: "it should wait for the l2d to be ready instead of rushing ahead with the static
 * art").
 * @param {{ current: HTMLElement|null }} ref the card
 * @param {{ index: number, kind: 'complete'|'normal', gate?: Promise<any>|null }} o
 */
export function useCardEntrance(ref, { index, kind, gate = null }) {
  const [urls] = useState(() => {
    const u = entranceSprites(data.get('assets'));
    try { return u && glInit() ? u : null; } catch (err) { console.warn('[cardEntrance] WebGL2', err); return null; }
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!urls || !el) return undefined;
    const [base, add] = el.querySelectorAll('.tcard__ce');
    const head = el.querySelector('.tcard__head');
    const bg = el.querySelector('.tcard__cardbg');
    if (bg) { bg.style.borderImageSource = `url("${urls.card_bg}")`; bg.style.borderImageSlice = `${CARD_BG.border.top} ${CARD_BG.border.right} ${CARD_BG.border.bottom} ${CARD_BG.border.left} fill`; }
    let t0 = performance.now() + Math.max(0, index) * ANIM_DELAY_S * 1000;
    let raf = 0, ready = false, now = 0, live = true;
    const apply = (t) => {
      now = t;
      const w = el.getBoundingClientRect().width;
      if (!(w > 0)) return;
      const scale = w / (OVERLAY.right - OVERLAY.left);
      const d = domState(sampleShow(t));
      el.style.setProperty('--ce-a', String(d.alpha));
      el.style.setProperty('--ce-root', `${(-d.root * scale).toFixed(2)}px`);
      el.style.setProperty('--ce-card', `${(-d.card * scale).toFixed(2)}px`);
      el.style.setProperty('--ce-round', String(d.round));
      const top = (head ? head.offsetTop : 0) - (OVERLAY.top - STRIP_TOP) * scale;
      for (const c of [base, add]) { c.style.top = `${top}px`; c.style.height = `${(OVERLAY.top - OVERLAY.bottom) * scale}px`; }
      if (bg) {
        const [bx, by] = CARD_BG.pos, [bw, bh] = CARD_BG.size, b = CARD_BG.border;
        Object.assign(bg.style, { left: `${(bx - bw / 2 - OVERLAY.left) * scale}px`, top: `${top + (OVERLAY.top - (by + bh / 2)) * scale}px`,
          width: `${bw * scale}px`, height: `${bh * scale}px`, borderWidth: `${b.top * scale}px ${b.right * scale}px ${b.bottom * scale}px ${b.left * scale}px` });
      }
      if (ready) drawMattes({ base, add }, kind, t, scale * (globalThis.devicePixelRatio || 1), urls);
    };
    const tick = () => {
      if (!live) return;
      const t = (performance.now() - t0) / 1000;
      apply(Math.max(0, t));
      if (t < CLIP_LENGTH_S) raf = requestAnimationFrame(tick);
    };
    if (reducedMotion()) apply(CLIP_LENGTH_S);
    else if (gate) {
      // held on the first frame until the page's illustrations are ready, then the row's stagger from that moment
      apply(0);
      Promise.resolve(gate).then(() => {
        if (!live) return;
        t0 = performance.now() + Math.max(0, index) * ANIM_DELAY_S * 1000;
        tick();
      });
    } else tick();
    loadEntrance(urls).then(() => { if (live) { ready = true; apply(now); } }, (err) => console.warn('[cardEntrance] sprites', err));
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => apply(now)) : null;
    ro?.observe(el);
    return () => { live = false; cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [urls, kind]);
  return !!urls;
}
