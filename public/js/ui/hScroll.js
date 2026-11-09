// (fork) One horizontal scroller for rows that can outgrow their box: the result screen's player cards in Grand
// Alliance (screens/settle.js TeamPage) — and the in-battle bond strip's scroller (ui/bondStrip.js BondScroller) is the
// same behaviour, meant to move onto this hook rather than keep its own copy.
//   * useHScroll(ref): which ends are hidden (`edges`), whether the row overflows (`over`), and `step(±1)` (75% of the
//     box, as BondScroller does). The mouse wheel scrolls the row sideways, a mouse drags it (a drag swallows the click it
//     ends on), a touch swipes it natively, ← / → step it (on the box when focused, or anywhere on the page with
//     `pageKeys`, outside text fields), and `reveal` (a selector) puts that child in the middle on open — and keeps it
//     there through every resize (a phone going fullscreen or turning, a window resized) until the player scrolls the
//     row themselves (wheel, drag, swipe, keys, ‹ ›).
//   * HScroll: the box (`.hscroll`) with edge fades (`.has-left` / `.has-right`) and ‹ › buttons, shown only while the
//     row overflows (a row that fits looks exactly as without the scroller); no native scrollbar. The screen's own CSS
//     places and sizes it; components.css holds the shared look.
import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** Which ends of `el` hide content, and whether it overflows at all (1px slack for rounding). */
export function scrollEdges(el) {
  if (!el) return { left: false, right: false, over: false };
  const max = el.scrollWidth - el.clientWidth;
  return { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1, over: max > 1 };
}

/** The scrollLeft that puts `child` in the middle of `el` (clamped to the row). */
export function centreOf(el, child) {
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const want = child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2;
  return Math.max(0, Math.min(max, Math.round(want)));
}

/**
 * @param {{ current: HTMLElement | null }} ref the scrolling box
 * @param {{ deps?: any[], reveal?: string | null, pageKeys?: boolean }} [opts]
 */
export function useHScroll(ref, { deps = [], reveal = null, pageKeys = false } = {}) {
  const [edges, setEdges] = useState({ left: false, right: false, over: false });
  // the player moved the row: `reveal` stops re-centring
  const moved = useRef(false);
  const centre = () => {
    const el = ref.current;
    const child = !moved.current && reveal && el ? el.querySelector(reveal) : null;
    if (child) el.scrollLeft = centreOf(el, child);
  };
  // where a ‹ › / key step is gliding to: a quick second step continues from there, not from mid-glide
  const aim = useRef(null);
  const step = (dir) => {
    moved.current = true;
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const from = aim.current ?? el.scrollLeft;
    aim.current = Math.max(0, Math.min(max, from + dir * Math.max(80, el.clientWidth * 0.75)));
    el.scrollTo({ left: aim.current, behavior: 'smooth' });
  };
  // open on the `reveal` child (before the first paint, so the row does not jump)
  useLayoutEffect(centre, [ref, reveal]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      if (aim.current !== null && Math.abs(el.scrollLeft - aim.current) < 1) aim.current = null;
      const next = scrollEdges(el);
      setEdges((old) => (old.left === next.left && old.right === next.right && old.over === next.over ? old : next));
    };
    // measured a frame after the observer fires: no "ResizeObserver loop" warnings while the row's children resize
    let frame = null;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; centre(); update(); });
    }) : null;
    ro?.observe(el);
    for (const child of el.children) ro?.observe(child);
    // the wheel: an up/down turn moves the row sideways while it can still move that way
    const wheel = (e) => {
      if (e.ctrlKey || !scrollEdges(el).over) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const max = el.scrollWidth - el.clientWidth;
      if (!d || (d < 0 && el.scrollLeft <= 0) || (d > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      moved.current = true;
      aim.current = null;
      el.scrollLeft += e.deltaMode === 1 ? d * 40 : d;
    };
    // a mouse drag (touch scrolls natively); the screen-to-box scale covers a scaled stage (settle.js --k)
    let drag = null;
    const down = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !scrollEdges(el).over) return;
      const scale = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
      drag = { x: e.clientX, left: el.scrollLeft, scale, moved: false, id: e.pointerId };
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = (e.clientX - drag.x) / drag.scale;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) { drag.moved = true; moved.current = true; aim.current = null; el.classList.add('is-dragging'); try { el.setPointerCapture(e.pointerId); } catch { /* gone */ } }
      el.scrollLeft = drag.left - dx;
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      el.classList.remove('is-dragging');
      if (moved) {
        // the click this drag ends on is not a click on a card
        const eat = (c) => { c.stopPropagation(); c.preventDefault(); };
        el.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 0);
      }
    };
    const key = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      if (e.currentTarget !== el && (TYPING.test(e.target?.tagName || '') || e.target?.isContentEditable)) return;
      if (!scrollEdges(el).over) return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    // a finger on the row: the browser scrolls it natively from here
    const touch = () => { moved.current = true; aim.current = null; };
    const keyHost = pageKeys ? globalThis : el;
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    el.addEventListener('touchstart', touch, { passive: true });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    keyHost.addEventListener('keydown', key);
    centre();
    update();
    return () => {
      ro?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('touchstart', touch);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      keyHost.removeEventListener('keydown', key);
    };
  }, [ref, pageKeys, ...deps]);
  return { edges, step };
}

/**
 * The scroller box: `children` is the row (laid out by the screen's CSS inside `.hscroll__view`).
 * @param {{ class?: string, viewClass?: string, label?: string, prevLabel: string, nextLabel: string, reveal?: string,
 *   pageKeys?: boolean, deps?: any[], children?: any }} props
 */
export function HScroll({ class: cls = '', viewClass = '', label = '', prevLabel, nextLabel, reveal = null, pageKeys = false, deps = [], children }) {
  const view = useRef(null);
  const { edges, step } = useHScroll(view, { deps, reveal, pageKeys });
  return html`<div class=${cx('hscroll', cls, edges.over && 'is-over', edges.left && 'has-left', edges.right && 'has-right')}>
    <div ref=${view} class=${cx('hscroll__view', viewClass)} tabindex=${edges.over ? 0 : -1} role=${edges.over ? 'region' : null}
      aria-label=${edges.over && label ? label : null}>${children}</div>
    ${edges.over ? html`<button type="button" class="hscroll__arrow hscroll__arrow--prev" disabled=${!edges.left} aria-label=${prevLabel} title=${prevLabel}
        onClick=${() => step(-1)}>‹</button>
      <button type="button" class="hscroll__arrow hscroll__arrow--next" disabled=${!edges.right} aria-label=${nextLabel} title=${nextLabel}
        onClick=${() => step(1)}>›</button>` : null}
  </div>`;
}
