// 「协议启动！」 over BATTLE_CHECK (screens/game.js), as the event's pre-game shows it (video 7:43–7:51), drawn with the
// official battleReady/* sprites and settle/common_logo:
//   from black the Rhodes Island ship (battleReady/rhodes, turned ≈ 53°) fills the screen in bright teal and zooms out
//   into the middle; then the contour map (bg_terrain), the two mountains (bg_mountain1 / 2) and the ring (bg_ring) come
//   up behind it, the doctors' cards (01 COMPLETE ✓ + their avatar) open on both sides with lines into the ship, and
//   协议启动！ / STRONGHOLD PROTOCOL / 正在连接… stand under it. A solo run has one card under the ring.
// One 1920×1080 stage in `--u` (1 design px = 0.01 --u, fitted to the viewport). Without the art pack the 0.3.0 banner
// stays (screens/game.js asks bootArtReady); with prefers-reduced-motion the screen shows at once, without the motion.
// Styles: css/screens/protocol-boot.css.
// (fork) One for All (DESIGN §91.9): with `reveal` (m.public.draft.reveal of the room-wide vote) each card shows its
// Doctor's pick in a rapid volley, the lines grow into a slot in the centre of the ship, the slot charges up and the
// winner bursts into it under a gold ALL!, then every losing pick glitches and snaps to the winner (ofaTimeline).
import { html, Icon } from './components.js';
import { PlayerAvatar } from './gameComponents.js';
import { uiUrl, bandIconUrl } from './assetUrls.js';
import { reducedMotion } from './device.js';
import { data } from '../data.js';
import { audio } from '../audio.js';
import { t } from '../../../shared/i18n.js';
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** How long the screen takes to fade once BATTLE_CHECK is over (screens/game.js keeps it mounted meanwhile). */
export const BOOT_LEAVE_MS = 350;

// the pre-game's sprites: this screen's, and the 请选择策略 band's (ui/turnBanner.js) — fetched and judged together
const ART = ['battleReady/rhodes', 'battleReady/bg_terrain', 'battleReady/bg_mountain1', 'battleReady/bg_mountain2', 'battleReady/bg_ring',
  'settle/common_logo', 'battleReady/rhodes_outline', 'roundStartDialog/round_emoji_head'];

/** Whether every sprite has loaded (preloadBootArt): null = not fetched yet, false = missing or still loading. */
let bootArt = null;

/**
 * True once the pre-game sprites are all in: screens/game.js shows the 0.3.0 banner until then, screens/bandDraft.js no
 * 请选择策略 band.
 */
export const bootArtReady = () => bootArt === true;

const waiting = new Set();
/**
 * Calls `fn` once the sprites are in (at once when they already are) and returns the unsubscribe: the band draft's first
 * turn starts before screens/game.js has fetched them. A missing pack never calls it.
 * @param {() => void} fn
 */
export function onBootArt(fn) {
  if (bootArt === true) { fn(); return () => {}; }
  waiting.add(fn);
  return () => { waiting.delete(fn); };
}

/**
 * Fetch the sprites early — as a room is entered (main.js warmGameData, once the art list is in), when the match screen
 * opens (screens/game.js) and when the band draft mounts (screens/bandDraft.js) —, once per page; the first call that
 * finds the art list loaded starts it. A missing pack never turns ready.
 */
export function preloadBootArt() {
  if (bootArt !== null || typeof Image !== 'function') return;
  const assets = data.get('assets');
  if (!assets) return; // the art list is not in yet: a later call starts it
  bootArt = false;
  const urls = ART.map((k) => uiUrl(assets, k));
  if (!urls.every(Boolean)) return;
  let left = urls.length;
  // held until every sprite is in: an Image nothing refers to may be collected mid-load, which cancels its request
  const imgs = [];
  for (const src of urls) {
    const img = new Image();
    imgs.push(img);
    img.onload = () => {
      left -= 1;
      if (left !== 0) return;
      imgs.length = 0;
      bootArt = true;
      for (const fn of [...waiting]) fn();
      waiting.clear();
    };
    img.onerror = () => { left = -1; };
    img.src = src;
  }
}

/**
 * Where the doctors' cards sit on the 1920×1080 stage (design px, measured from the footage): 01 / 03 on the left,
 * 02 / 04 on the right, each with its line from the card's inner edge to a node on the ship; a solo run's one card
 * under the ring. [ASSUMED] the footage shows four doctors only: five or six take a third row (all moved up half a
 * row), and the solo card's place is estimated.
 * @param {number} n players
 * @returns {Array<{ x: number, y: number, side: 'l'|'r'|'c', from?: [number, number], to?: [number, number] }>}
 */
export function bootLayout(n, { vote = false } = {}) {
  if (n <= 1 && !vote) return [{ x: 703, y: 645, side: 'c' }];
  // (fork) a Grand Alliance's 7–8 Doctors: four rows of 150 [ASSUMED: no footage shows more than four]; One for All's
  // lines end on the centre slot's edges (OFA_SLOT) instead of the ship's nodes
  const NODES = [[939, 497], [1008, 513], [905, 548], [968, 575], [930, 610], [1000, 630], [915, 660], [985, 676]];
  const big = n > 6 || vote;
  return Array.from({ length: Math.min(Math.max(n, 1), 8) }, (_, i) => {
    const right = i % 2 === 1;
    const row = Math.floor(i / 2);
    const y = big ? 250 + row * 150 : 414 + row * 166 - (n > 4 ? 83 : 0);
    const x = right ? 1233 : 172;
    const to = vote ? [right ? OFA_SLOT.x + OFA_SLOT.size : OFA_SLOT.x, OFA_SLOT.y + 23 + row * 45] : NODES[i];
    return { x, y, side: right ? 'r' : 'l', from: [right ? x - 10 : x + 525, y + 63], to };
  });
}

/** (fork) One for All: the centre slot on the ship (design px; the reviewed preview's place, 2026-11-12). */
export const OFA_SLOT = Object.freeze({ x: 868, y: 455, size: 180 });

/** (fork) One for All beats (ms; the reviewed preview and teaser, 2026-11-12). */
export const OFA = Object.freeze({
  PICK0: 1300, // the first pick, once the cards are open (cards: 1.2 s + 40 ms each, 420 ms)
  STEP: 70, // the pick volley, one card after another
  GROW: 300, // the lines grow into the slot (pboot-draw)
  REVEAL: 860, // lines start → the reveal: the match-found cue's high note (the charge-up runs REVEAL - GROW)
  GLITCH: 450, // reveal → the first losing pick glitches
  SWAP: 450, // a pick's glitch → its snap to the winner
  NEXT: 160, // one losing pick after another
  PAD: 200, // last snap → the unified screen
  FLASH: 250, // a snapped pick's white frame
});

/**
 * (fork) One for All: when each beat happens (ms after the screen mounts) for these cards' picks.
 * @param {Array<string|null>} picks each card's pick (null: no vote — a seat that left)
 * @param {string} winner
 */
export function ofaTimeline(picks, winner) {
  const pickAt = picks.map((_, i) => OFA.PICK0 + i * OFA.STEP);
  const grow = OFA.PICK0 + picks.length * OFA.STEP;
  const land = grow + OFA.REVEAL;
  const losers = picks.map((p, i) => (p && p !== winner ? i : -1)).filter((i) => i >= 0);
  const glitchAt = new Map(losers.map((i, k) => [i, land + OFA.GLITCH + k * OFA.NEXT]));
  const swapAt = new Map(losers.map((i) => [i, glitchAt.get(i) + OFA.SWAP]));
  const unify = land + OFA.GLITCH + OFA.SWAP + losers.length * OFA.NEXT + OFA.PAD;
  /** @type {Array<{ at: number, kind: string, i?: number }>} */
  const events = [
    ...picks.flatMap((p, i) => (p ? [{ at: pickAt[i], kind: 'pick', i }] : [])),
    { at: grow, kind: 'grow' }, { at: land, kind: 'land' },
    ...losers.flatMap((i) => [{ at: glitchAt.get(i), kind: 'glitch', i }, { at: swapAt.get(i), kind: 'swap', i }]),
    { at: unify, kind: 'unify' },
  ].sort((a, b) => a.at - b.at);
  return { pickAt, grow, charge: grow + OFA.GROW, land, glitchAt, swapAt, unify, events };
}

/** (fork) One for All: the reveal's sounds (sfx.ui keys). */
export const OFA_SOUNDS = Object.freeze(['joinRoom', 'matchSucceed', 'distort', 'itemMerge']);

/** (fork) One for All: fetch the reveal's sounds ahead (screens/game.js during the vote, and as the reveal mounts). */
export function warmOfaSounds() { audio.warmUi(OFA_SOUNDS); }

/** (fork) One for All: each beat's sound (sfx.ui keys; the reviewed mix: panned by card side, a 6 kHz high cut). */
export function ofaSound(kind, i = 0) {
  const pan = i % 2 === 0 ? -0.55 : 0.55; // left cards even, right cards odd
  if (kind === 'pick') audio.sfx('joinRoom', { volume: 0.5, pan, lowpass: 6000 });
  else if (kind === 'grow') audio.sfx('matchSucceed', { volume: 1 }); // its high note, REVEAL in, is the reveal
  else if (kind === 'glitch') audio.sfx('distort', { volume: 0.38, pan, lowpass: 6000, offset: 0.1, len: 0.42 });
  else if (kind === 'swap') audio.sfx('itemMerge', { volume: 0.36, pan, lowpass: 6000, len: 0.4 });
}

/** (fork) One for All: ms since mount, every frame until the unified screen (at once with reduced motion), firing each beat's sound. */
function useOfaClock(tl, on) {
  const [now, setNow] = useState(() => (on && reducedMotion() ? tl.unify : 0));
  const fired = useRef(0);
  useEffect(() => {
    if (!on || reducedMotion()) return undefined;
    const t0 = performance.now();
    let raf = 0, timer = 0;
    const tick = () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = 0;
      const ms = performance.now() - t0;
      while (fired.current < tl.events.length && tl.events[fired.current].at <= ms) { // loop-cap: the timeline's events
        const ev = tl.events[fired.current++];
        if (ev.kind !== 'land' && ev.kind !== 'unify') ofaSound(ev.kind, ev.i);
      }
      setNow(ms);
      if (ms < tl.unify + 100) { raf = requestAnimationFrame(tick); timer = setTimeout(tick, 120); } // a hidden tab pauses frames
    };
    tick();
    return () => { if (raf) cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [tl, on]);
  return now;
}

/** (fork) A box on the 1920×1080 stage (design px). */
const ofaBox = (x, y, w, h = 0) => `left:calc(${x} * var(--px));top:calc(${y} * var(--px));width:calc(${w} * var(--px))${h ? `;height:calc(${h} * var(--px))` : ''}`;

/** (fork) One for All: a strategy's portrait (with the glitch's sliced copies) and name. */
function OfaArt({ id, name = null }) {
  const src = bandIconUrl(data.get('assets'), id);
  return html`<span class="ofa-pick__art">${src ? html`<img src=${src} alt="" draggable="false" /><img class="g1" src=${src} alt="" /><img class="g2" src=${src} alt="" />` : null}</span>${name != null ? html`<b>${name}</b>` : null}`;
}

/** An official sprite as a positioned image (no lazy loading: the screen lasts about 2.3 s). */
function Art({ k, class: cls, mask = false }) {
  const src = uiUrl(data.get('assets'), k);
  if (!src) return null;
  return mask
    ? html`<i class=${cls} style=${`--src:url("${src}")`}></i>`
    : html`<img class=${cls} src=${src} alt="" draggable="false" />`;
}

/**
 * 「协议启动！」. `leaving` fades it out. (fork) `reveal`: One for All's vote (m.public.draft.reveal), shown on the cards.
 * @param {{ players: any[], myId: any, leaving?: boolean, reveal?: { picks: Record<string,string>, random: string[], counts: Record<string,number>, winner: string }|null }} props
 */
export function ProtocolBoot({ players, myId, leaving = false, reveal = null }) {
  const vote = !!(reveal && typeof reveal.winner === 'string');
  const list = (Array.isArray(players) ? players : []).slice(0, 8);
  const spots = bootLayout(list.length, { vote });
  const picks = list.map((p) => (vote && typeof reveal.picks?.[p.playerId] === 'string' ? reveal.picks[p.playerId] : null));
  const tlRef = useRef(null);
  if (!tlRef.current || tlRef.current.winner !== (vote ? reveal.winner : null)) tlRef.current = { ...ofaTimeline(vote ? picks : [], vote ? reveal.winner : ''), winner: vote ? reveal.winner : null };
  const tl = tlRef.current;
  useEffect(() => { if (vote) warmOfaSounds(); }, [vote]);
  const now = useOfaClock(tl, vote);
  const bands = data.get('bands') || {};
  const nameOf = (id) => bands[id]?.name || id;
  const at = (ms) => vote && now >= ms;
  const landed = at(tl.land);
  const random = new Set(vote && Array.isArray(reveal.random) ? reveal.random : []);
  /** a card's pick: hidden until its beat, then counted, glitched and snapped to the winner */
  const chip = (i, id, pid) => {
    const g = tl.glitchAt.get(i);
    const sw = tl.swapAt.get(i);
    const snapped = sw != null && at(sw);
    const shown = snapped ? reveal.winner : id;
    const n = snapped || at(tl.unify) ? picks.filter(Boolean).length : reveal.counts?.[id] ?? 0;
    return html`<span class=${cx('ofa-pick', !at(tl.pickAt[i]) && 'is-wait', random.has(pid) && !snapped && 'is-random',
        landed && (shown === reveal.winner ? 'is-win' : 'is-lose'), g != null && at(g) && !snapped && 'is-glitch', snapped && now < sw + OFA.FLASH && 'is-flash')}
        data-band=${shown} data-testid="ofa-pick">
      <${OfaArt} id=${shown} name=${nameOf(shown)} />
      ${random.has(pid) && !snapped ? html`<span class="ofa-rand">${t('未投票 · 随机')}</span>` /* en: "NO VOTE · RANDOM" */ : null}
      ${landed ? html`<span class="ofa-count num">×${n}</span>` : null}
    </span>`;
  };
  return html`<div class=${cx('pboot', list.length <= 1 && !vote && 'pboot--solo', vote && 'pboot--ofa', leaving && 'is-leaving')} role="status" aria-live="polite" aria-label=${t('协议启动！')}
      data-testid="protocol-boot">
    <div class="pboot__stage">
      <div class="pboot__scene" aria-hidden="true">
        <${Art} k="battleReady/bg_mountain1" class="pboot__mtn pboot__mtn--1" />
        <${Art} k="battleReady/bg_mountain2" class="pboot__mtn pboot__mtn--2" />
        <${Art} k="battleReady/bg_terrain" class="pboot__terrain" mask=${true} />
        <${Art} k="battleReady/bg_ring" class="pboot__ring" />
        <${Art} k="settle/common_logo" class="pboot__logo" mask=${true} />
        ${[[117, 393], [117, 732], [1800, 393], [1800, 732]].map(([x, y]) => html`<i key=${`${x}-${y}`} class="pboot__cross"
          style=${`--x:${x};--y:${y}`}></i>`)}
      </div>
      <div class="pboot__ship" aria-hidden="true"><${Art} k="battleReady/rhodes" class="pboot__shipimg" /><${Art} k="battleReady/rhodes" class="pboot__shipimg pboot__shipimg--hot" /></div>
      <svg class=${cx('pboot__lines', at(tl.grow) && 'ofa-grow')} viewBox="0 0 1920 1080" aria-hidden="true">
        ${spots.filter((s) => s.from).map((s, i) => html`<g key=${i} style=${`--i:${i}`}>
          <line x1=${s.from[0]} y1=${s.from[1]} x2=${s.to[0]} y2=${s.to[1]} pathLength="1" />
          <rect x=${s.to[0] - 9} y=${s.to[1] - 9} width="18" height="18" class="pboot__node" />
          <rect x=${s.from[0] - 11} y=${s.from[1] - 11} width="22" height="22" class="pboot__anchor" />
        </g>`)}
      </svg>
      ${list.map((p, i) => {
        const s = spots[i];
        return html`<div key=${p.playerId ?? i} class=${cx('pboot__card', `pboot__card--${s.side}`, p.playerId === myId && 'is-self')}
            style=${`--x:${s.x};--y:${s.y};--i:${i}`}>
          <span class="pboot__txt">
            <b class="pboot__num num">${String(i + 1).padStart(2, '0')}</b>
            <span class="pboot__done">COMPLETE</span>
            <i class="pboot__check"><${Icon} name="check" /></i>
          </span>
          <span class="pboot__face"><${PlayerAvatar} player=${vote ? { ...p, bandId: null } : p} self=${p.playerId === myId} /></span>
          ${picks[i] ? chip(i, picks[i], p.playerId) : null}
        </div>`;
      })}
      ${vote ? html`<div class=${cx('ofa-core__label', landed && 'is-all')} style=${ofaBox(OFA_SLOT.x - 160, OFA_SLOT.y - 52, OFA_SLOT.size + 320)}
          data-testid="ofa-all">${landed ? t('全员！') /* en: "ALL!" */ : null}</div>
        <div class=${cx('ofa-core', at(tl.charge) && !landed && 'is-charge', landed && 'is-land', at(tl.unify) && 'is-unified')}
            style=${`${ofaBox(OFA_SLOT.x, OFA_SLOT.y, OFA_SLOT.size, OFA_SLOT.size)};--charge:${OFA.REVEAL - OFA.GROW}ms`} data-testid="ofa-slot">
          ${landed ? html`<${OfaArt} id=${reveal.winner} />` : html`<i class="ofa-core__q">?</i>`}
        </div>
        <div class="ofa-core__name" style=${ofaBox(OFA_SLOT.x - 160, OFA_SLOT.y + OFA_SLOT.size + 10, OFA_SLOT.size + 320)}>${landed
          ? html`${nameOf(reveal.winner)}${at(tl.unify) ? null : html`<small class="num">×${reveal.counts?.[reveal.winner] ?? 0}</small>`}` : null}</div>` : null}
      <h2 class="pboot__title">${t('协议启动！')}</h2>
      <span class="pboot__sub">STRONGHOLD PROTOCOL</span>
      <span class="pboot__conn">${t('正在连接')}<i class="pboot__dots"></i></span>
    </div>
    <div class="pboot__veil" aria-hidden="true"></div>
  </div>`;
}
