// (fork) An operator card's name, fitted like the official client's MultilineBestFit (Il2Cpp dump: a Text that wraps,
// then steps its font size down — a binary search, `_binary` — until the text fits its box, down to `_minSize`):
// the name breaks only at its spaces, into at most `maxLines` lines, and shrinks until its widest word fits the box's
// width and the lines fit their count (the user's call of 2026-11-09: "Matterhor/n", "Underflo/w" split at 特大 on a
// 640×360 phone; EN names run to "Skadi the Corrupting Heart", single words to "Lightningbearer", ja ones to
// "ヴィーナ・ヴィクトリア"). The words are drawn unbreakable (screens/loadoutDeck.js DeckOpCard), so a hyphen, a dot or
// a "·" never breaks a name either. Measured on a canvas (no layout read per name), applied as `--nfit` on the name.
import { useEffect, useLayoutEffect } from '../../vendor/hooks.module.js';

const MIN_SCALE = 0.4; // a floor far under any real name's need (the widest EN word at 特大 on a phone: ~0.62)

/** How many lines `widths` (the words, at scale 1) take at `width` with `space` between them; Infinity if one word is wider. */
export function lineCount(widths, space, width) {
  let lines = 0, cur = -1;
  for (const w of widths) {
    if (w > width) return Infinity;
    if (cur >= 0 && cur + space + w <= width) cur += space + w;
    else { lines += 1; cur = w; }
  }
  return lines;
}

/** The largest scale ≤ 1 at which the words fit `width` in `maxLines` lines (all linear in the font size). */
export function fitScale(widths, space, width, maxLines = 2) {
  if (!widths.length || !(width > 0)) return 1;
  if (lineCount(widths, space, width) <= maxLines) return 1;
  let lo = MIN_SCALE, hi = 1;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (lineCount(widths, space, width / mid) <= maxLines) lo = mid; else hi = mid; }
  return Math.floor(lo * 100) / 100;
}

/** A name's words: split at its spaces only. */
export const nameWords = (name) => String(name || '').split(/\s+/).filter(Boolean);

const CJK = /[⺀-鿿가-힯豈-﫿＀-￯]/;
let ctx = null;
const cache = new Map();
// the drawn word's width over the canvas's, per script (a CJK face's bold is drawn wider than the canvas measures it:
// 维娜·维多利亚 ran past its card at 特大 in Chinese), learnt from the words on screen, never below 1
const ratio = { latin: 1, cjk: 1 };
const canvasWidth = (font, text) => { ctx ||= document.createElement('canvas').getContext('2d'); ctx.font = font; return ctx.measureText(text).width; };
function scaleFor(name, font, width) {
  const key = `${font}|${width}|${ratio.latin}|${ratio.cjk}|${name}`;
  let s = cache.get(key);
  if (s != null) return s;
  const widths = nameWords(name).map((w) => canvasWidth(font, w) * (CJK.test(w) ? ratio.cjk : ratio.latin));
  s = fitScale(widths, canvasWidth(font, ' ') * ratio.latin, width * 0.98 - 1); // a margin for the drawn text's rounding
  if (cache.size > 4000) cache.clear();
  cache.set(key, s);
  return s;
}

/** Fits every `.lo-op__name` under `root`: one layout read (a drawn card's name box), the rest on a canvas. */
export function fitNames(root) {
  if (!root || typeof document === 'undefined') return;
  const names = root.querySelectorAll('.lo-op__name');
  if (!names.length) return;
  const probe = [...names].find((n) => n.getClientRects().length);
  if (!probe) return;
  const box = probe.parentElement.clientWidth; // the name's box: .lo-op__meta (the card's width under the portrait and column)
  const cs = getComputedStyle(probe);
  const base = parseFloat(cs.fontSize) / (parseFloat(probe.style.getPropertyValue('--nfit')) || 1);
  const font = `${cs.fontStyle} ${cs.fontWeight} ${base}px ${cs.fontFamily}`;
  // calibrate on the words of the cards in view (laid out already: a card off screen skips its contents' layout)
  const view = root.getBoundingClientRect();
  for (const n of names) {
    const card = n.closest('.lo-op');
    const b = card?.getBoundingClientRect();
    if (!b || b.right < view.left || b.left > view.right) continue;
    const scale = parseFloat(n.style.getPropertyValue('--nfit')) || 1;
    for (const w of n.querySelectorAll('.lo-op__w')) {
      const drawn = w.getBoundingClientRect().width / scale, est = canvasWidth(font, w.textContent);
      if (drawn > 0 && est > 0) { const k = CJK.test(w.textContent) ? 'cjk' : 'latin'; ratio[k] = Math.max(ratio[k], Math.ceil((drawn / est) * 100) / 100); }
    }
  }
  for (const n of names) {
    const s = scaleFor(n.textContent, font, box);
    const v = s < 1 ? String(s) : '';
    if (n.style.getPropertyValue('--nfit') !== v) { if (v) n.style.setProperty('--nfit', v); else n.style.removeProperty('--nfit'); }
  }
}

/** Keeps a deck's names fitted: after each of its draws, on a resize, a scroll's end, a late font, a text-size or language change. */
export function useNameFit(rootRef) {
  useLayoutEffect(() => { fitNames(rootRef.current); });
  useEffect(() => {
    const run = () => fitNames(rootRef.current);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    if (ro && rootRef.current) ro.observe(rootRef.current);
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(run) : null;
    if (mo) for (const el of [document.documentElement, document.body]) mo.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'lang', 'data-text-size'] });
    document.fonts?.addEventListener?.('loadingdone', run);
    const root = rootRef.current; // a scroll brings new cards into view: their words calibrate the rest
    root?.addEventListener('scrollend', run);
    return () => { ro?.disconnect(); mo?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', run); root?.removeEventListener('scrollend', run); };
  }, []);
}
