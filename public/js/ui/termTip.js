// Status keyword glossary popup: a tap (or Enter / Space) on a keyword in an official description — the `<$ba.stun>晕眩</>`
// term spans RichText draws with `data-term` (ui/gameComponents.js) — opens its official definition from data/terms.json
// (gamedata_const termDescriptionDict, tools/build-data.mjs buildTerms; translated like every data file). Definitions can
// mention other keywords, which open in the same popup. One document-level listener in the capture phase, so the tap
// does not also select, buy or close whatever card the keyword sits in. Closes on Esc (before the screen behind sees it),
// a tap elsewhere, scroll or resize.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { RichText } from './gameComponents.js';
import { data, useData } from '../data.js';

const GAP = 6;

/** Where to put a popup of size w×h next to rect `r` inside a vw×vh viewport: below when it fits, else above. */
export function placeTip(r, w, h, vw, vh) {
  const left = Math.max(GAP, Math.min(r.left, vw - w - GAP));
  const below = r.bottom + GAP;
  const top = below + h <= vh - GAP ? below : Math.max(GAP, r.top - GAP - h);
  return { left, top };
}

/** Mount once near the root (main.js App). */
export function TermTipHost() {
  useData('terms');
  const [tip, setTip] = useState(null); // { id, rect }
  const openRef = useRef(false); // read by the key listener synchronously (Esc must not reach the screen behind)
  openRef.current = !!tip;
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const open = (el) => {
      const r = el.getBoundingClientRect();
      setPos(null);
      setTip({ id: el.dataset.term, rect: { left: r.left, top: r.top, bottom: r.bottom } });
    };
    const termOf = (e) => (e.target instanceof Element ? e.target.closest('[data-term]') : null);
    const onClick = (e) => {
      const el = termOf(e);
      if (el && data.lookup('terms', el.dataset.term)) {
        e.preventDefault();
        e.stopPropagation();
        open(el);
      } else if (!(e.target instanceof Element && e.target.closest('.term-tip'))) {
        setTip(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (openRef.current) { e.preventDefault(); e.stopImmediatePropagation(); openRef.current = false; setTip(null); }
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = termOf(e);
      if (el && data.lookup('terms', el.dataset.term)) { e.preventDefault(); e.stopPropagation(); open(el); }
    };
    const close = () => setTip(null);
    document.addEventListener('click', onClick, true);
    // window capture, registered at app start: before the screens' own window-capture Esc handlers (loadout.js)
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  // measure, then place inside the viewport
  useEffect(() => {
    const box = boxRef.current;
    if (!tip || !box) return;
    setPos(placeTip(tip.rect, box.offsetWidth, box.offsetHeight, window.innerWidth, window.innerHeight));
  }, [tip]);

  const term = tip ? data.lookup('terms', tip.id) : null;
  if (!term) return null;
  const style = pos ? `left:${pos.left}px;top:${pos.top}px` : 'left:0;top:0;visibility:hidden';
  return html`<div ref=${boxRef} class="term-tip" role="tooltip" style=${style}>
    <div class="term-tip__name">${term.name}</div>
    <${RichText} text=${term.desc} class="term-tip__desc" />
  </div>`;
}
