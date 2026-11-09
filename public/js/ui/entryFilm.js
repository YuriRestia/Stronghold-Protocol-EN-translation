// The 卫戍协议：盟约 entry animation (ui/allianceScene.js) before the title screen, each time it is entered, with the event's
// sound as the recording has it: the entry cue act1autochess_g_ui_load at video 1.686 s, then the lobby music from its
// very start at 2.144 s with audio.js's own 0.8 s fade-in (a cross-correlation of the recording's soundtrack against the
// official files: r 0.988 / 0.998, nothing else is in it). A fresh page may not play sound before a user gesture, so a
// black 点击进入 card waits for the tap that unlocks it (audio.js listens for the same gesture), then the film runs.
// Volumes / mute are the settings' (sfx · bgm channels); the player's own lobby music (audio.setLobbyTrack) plays in
// place of the official track as everywhere else, untouched by the film — a custom track that arrives while the film
// holds the music is handed to audio.js at once. A tap / click / key skips. Whether the film plays is decided once,
// when the title is entered: a phone that is portrait then gets no film, and turning it landscape later does not
// start one. Reduced motion, or a sprite that fails to load, gets no film (the title screen shows at once). (fork) The
// film never runs ahead of its files: their download starts with the page, a 加载中 card covers the wait. Never over
// a room or a match: the route is watched from the card on, and a session restored into a room / a match while the card
// waits or the film runs takes the overlay down at once, silences the cue and hands the music back to that screen.
// main.js calls playEntryFilm at boot and watchTitleReturns for each return to the title.
import { store, selectRoute } from '../store.js';
import { audio, resolveBgm } from '../audio.js';
import { data } from '../data.js';
import { reducedMotion, firstTapPending, fsTrace } from './device.js';
import { mountAllianceIntro, preloadSprites, setCycleOrigin, INTRO_AUDIO, INTRO_SPAN } from './allianceScene.js';
import { t } from '../../../shared/i18n.js';
import { scriptOf } from '../../../shared/i18nPacks.js';

// The cue for a manifest that does not list it: the manifest's own entry (audio.sfx.ui.load) carries the content hash, so
// the worker answers it from a finished download (GitHub #725, §37.99).
const ENTRY_SFX = '/assets/audio/sfx/customse/act1autochess/act1autochess_g_ui_load.mp3';
// the cue against the music as the recording mixes them (cue ×0.28, music ×0.18 of their files), at the default
// volumes (sfx 0.8 → ×0.576, bgm 0.6 → ×0.198 in audio.js _applyVolumes)
const SFX_GAIN = 0.54;
// (fork) the art's own timeout, out of the way (the longest setTimeout): the film waits for its files
const NO_TIMEOUT_MS = 0x7fffffff;
// (fork) [ASSUMED] the bytes are here by now, so this only bounds the decoding (71 s of music takes a phone a while)
const DECODE_WAIT_MS = 8000;
// (fork) [ASSUMED] only after this long of waiting, past the tap, may the player choose to skip the wait (a tap / key)
const WAIT_SKIP_MS = 10000;
// (fork) a second press this soon after the card's tap is the same tap (a double click), not a skip
const DOUBLE_TAP_MS = 500;

const CSS = `
.spa-entry{position:fixed;inset:0;z-index:2147483647;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;
  border:0;outline:0;overflow:hidden;background:#000;cursor:pointer;color:#dfe9ea}
.spa-entry::backdrop{background:transparent}
.spa-entry__gate,.spa-entry__wait{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  font-family:Bender,"Microsoft YaHei","Noto Sans SC",sans-serif;color:#dfe9ea;animation:spa-pulse 1.8s ease-in-out infinite}
.spa-entry__gate b,.spa-entry__wait b{font:700 22px/1 "Microsoft YaHei","Noto Sans SC",sans-serif;letter-spacing:.4em;padding-left:.4em}
.spa-entry__gate i{font-style:normal;font-size:12px;letter-spacing:.5em;color:#47c9a9}
@keyframes spa-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.spa-entry__gate small{font-size:12px;letter-spacing:.2em;color:rgba(220,240,236,.5)}
.spa-entry__gate--phone{gap:14px;animation:none}
.spa-entry__gate--phone::before{content:'';width:44px;height:44px;border:2px solid #47c9a9;border-radius:50%;
  box-shadow:0 0 16px rgba(71,201,169,.55),inset 0 0 10px rgba(71,201,169,.35);animation:spa-ring 1.6s ease-out infinite}
.spa-entry__gate--phone b{font-size:26px;color:#f2f7f6;animation:spa-pulse 1.8s ease-in-out infinite}
.spa-entry__gate--phone em{font-style:normal;font-size:13px;letter-spacing:.25em;color:#47c9a9}
@keyframes spa-ring{0%{transform:scale(.7);opacity:1}100%{transform:scale(1.25);opacity:.15}}
.spa-entry--tap{background:rgba(0,0,0,.78)}
.spa-entry__skip{position:absolute;right:3%;bottom:3.5%;z-index:2;font:12px/1 "Microsoft YaHei","Noto Sans SC",sans-serif;
  letter-spacing:.2em;color:rgba(220,240,236,.45);pointer-events:none;transition:opacity .3s}`;

const mq = (q) => { try { return !!globalThis.matchMedia(q).matches; } catch { return false; } };
/** A phone / tablet: a coarse (touch) pointer and no mouse. */
const touchDevice = () => (mq('(pointer: coarse)') || mq('(any-pointer: coarse)')) && !mq('(any-pointer: fine)');
/** Phones play the opening in landscape (in portrait the game shows its rotate hint; a 16:9 film would be a strip). */
function phoneReady() {
  return globalThis.innerWidth > globalThis.innerHeight;
}

/** The film's sound files as the settings can hear them: the cue, and the lobby music unless silent or the player's own. */
function filmSounds() {
  const manifest = data.get('assets');
  const listed = manifest?.audio?.sfx?.ui?.load;
  const cue = typeof listed === 'string' && listed ? listed : ENTRY_SFX;
  const track = audio.bgmSilent || audio.lobbyTrack ? null : resolveBgm(manifest, 'lobby');
  return { cue: audio.volumes?.muted || audio.volumes?.sfx <= 0 ? null : cue, music: [track?.intro, track?.loop].filter(Boolean) };
}

/** Download the sounds in `urls` ahead of the gesture; settles when each is in or has failed. Never rejects. */
const fetchSounds = (urls) => Promise.all(urls.map((url) => audio.prefetch(url, { priority: 'high' })));

/**
 * (fork) What the opening needs NOW, started at once and before any tap (owner 2026-11-07: on a first visit the film ran
 * with no sound, or not at all, because its art and sound were still downloading): the art and the sound. It takes as
 * long as it takes: the film waits. True when the film can play; false only when a sprite failed (a host without the art).
 * A sound that failed outright does not hold the film back: a host may have no audio.
 * @returns {Promise<boolean>}
 */
async function loadFilm() {
  try { await data.load('assets'); } catch { return false; }
  const { cue, music } = filmSounds();
  const [art] = await Promise.all([preloadSprites(undefined, NO_TIMEOUT_MS), fetchSounds([cue, ...music].filter(Boolean))]);
  return art === true;
}

/** No film this time: the title's music is still what the page needs now, ready for the first gesture. */
async function loadTitleSound() {
  try { await data.load('assets'); } catch { return; }
  await fetchSounds(filmSounds().music);
}

/** Decode the sound (already downloaded: loadFilm) once the context runs; null when nothing can be heard now. */
async function prepareSound() {
  const ctx = audio.ctx;
  if (!ctx || ctx.state !== 'running' || audio.volumes?.muted) return null;
  const { cue, music } = filmSounds();
  const wait = (p) => Promise.race([Promise.resolve(p).catch(() => null), new Promise((r) => setTimeout(() => r(null), DECODE_WAIT_MS))]);
  const [sfx] = await Promise.all([wait(cue ? audio._buffer(cue) : null), ...music.map((url) => wait(audio._buffer(url)))]);
  return { sfx };
}
/**
 * Hold the screen's music for the opening: the playing track fades out and every playBgm meanwhile is only remembered;
 * the release starts the remembered (else the last) track from its top — audio.js's own start, fade-in included.
 * Null when the music is silent or the player's own lobby music is set (audio.setLobbyTrack → audio.lobbyTrack): that
 * one keeps playing on — no fade, playBgm left alone. A lobbyTrack that arrives while the hold is up is not waited
 * out: the next playBgm drops the placeholder at once and calls the real playBgm (no further fade-out).
 * @param {any} [a] the audio manager (tests pass a stand-in)
 * @returns {(() => void) | null} the release
 */
export function holdBgm(a = audio) {
  if (!a.ctx || a.bgmSilent || a.lobbyTrack || Object.prototype.hasOwnProperty.call(a, 'playBgm')) return null;
  let asked;
  let passed = false;
  const placeholder = (key) => {
    // the player's own file loaded after the hold (installLobbyMedia is async): hand this call to audio.js now
    if (a.lobbyTrack) {
      if (a.playBgm === placeholder) delete a.playBgm;
      passed = true;
      try { a.playBgm(key); } catch { /* ignore */ }
      return;
    }
    asked = key;
  };
  a.playBgm = placeholder;
  try { ++a.bgmToken; a._fadeOutBgm(null, 0.4); } catch { /* ignore */ }
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (a.playBgm === placeholder) delete a.playBgm;
    if (passed) return; // already started from its top; releasing must not start it again
    try { a.playBgm(asked !== undefined ? asked : a.lastBgmKey ?? 'lobby'); } catch { /* ignore */ }
  };
}

let playing = false;

/**
 * (fork) Keep a modal dialog of the film above the fullscreen page. Going fullscreen puts the page into the top layer
 * after the dialog that is already there, and on an Android phone the page then covers it: the film ran unseen while
 * its sound played (owner's phone, Brave / Chrome 149, 2026-11-09; desktop Chrome keeps the dialog on top, so no test
 * browser shows it). A dialog shown again goes back on top: on each fullscreenchange into fullscreen it is closed and
 * shown again (nothing listens to its close). The ?fsdebug=1 readout notes whether it is on top afterwards.
 * @param {HTMLDialogElement} el
 * @returns {() => void} stop
 */
function keepAboveFullscreen(el) {
  const doc = globalThis.document;
  const raise = () => {
    if (!el.open || !(doc.fullscreenElement || doc.webkitFullscreenElement)) return;
    try { el.close(); el.showModal(); } catch { return; }
    requestAnimationFrame(() => {
      const at = doc.elementFromPoint?.(innerWidth / 2, innerHeight / 2);
      fsTrace.note(`film shown again over the fullscreen page: on top ${!!(at && el.contains(at))}`);
    });
  };
  doc.addEventListener?.('fullscreenchange', raise);
  doc.addEventListener?.('webkitfullscreenchange', raise);
  return () => {
    doc.removeEventListener?.('fullscreenchange', raise);
    doc.removeEventListener?.('webkitfullscreenchange', raise);
  };
}

/**
 * The 点击进入 card's content. `phone`: (fork) a phone waiting for its first tap — a mint tap ring above the prompt and
 * what the tap does under it (fullscreen, landscape); `loading`: the files are still coming, said at the bottom.
 */
function showTapPrompt(card, loading, phone = firstTapPending()) {
  card.innerHTML = '<b></b><i>TAP TO START</i>';
  card.firstChild.textContent = t('点击进入');
  // the Latin line is a decoration under a CJK prompt; a Latin translation already says it
  if (scriptOf(t('点击进入')) === 'alphabetic') card.lastChild.remove();
  card.classList?.toggle?.('spa-entry__gate--phone', !!phone);
  if (phone) {
    const what = document.createElement('em');
    what.textContent = t('全屏 · 横屏'); // en: "Full screen · landscape"
    card.append(what);
  }
  if (loading) {
    const note = document.createElement('small');
    note.textContent = t('加载中');
    card.append(note);
  }
}

/**
 * (fork) No film this time (seen in this tab session, reduced motion …), but a phone that waits for its first tap: the
 * same 点击进入 card over the screen, so the player knows a tap is wanted. That tap enters fullscreen and turns the
 * screen (ui/device.js, on the document); the card goes with its click.
 */
function showTapCard() {
  if (!firstTapPending() || document.querySelector?.('.spa-entry')) return;
  if (!document.getElementById('spa-entry-style')) {
    const st = document.createElement('style');
    st.id = 'spa-entry-style';
    st.textContent = CSS;
    document.head.append(st);
  }
  const el = document.createElement('dialog');
  el.className = 'spa-entry spa-entry--tap';
  el.setAttribute('aria-label', t('点击进入'));
  const card = document.createElement('div');
  card.className = 'spa-entry__gate';
  showTapPrompt(card, false);
  el.append(card);
  let unraise = () => {};
  const close = () => {
    unraise();
    removeEventListener('keydown', close, true);
    try { el.close(); } catch { /* ignore */ }
    el.remove();
  };
  // its click, not its pointerdown: the tap's pointerup / touchend must still find the card in the page
  el.addEventListener('click', (e) => { e.preventDefault(); close(); });
  el.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  addEventListener('keydown', close, true);
  document.body.append(el);
  try { el.showModal(); } catch { el.setAttribute('open', ''); }
  unraise = keepAboveFullscreen(el);
}

/**
 * @param {() => boolean} allowed  false once the film must go (a room / a match, the caller's skip)
 * @param {(host: HTMLElement) => { render: (t: number) => void, grain: () => void, destroy: () => void }} mount
 * @param {Promise<boolean>} load  loadFilm's answer
 */
function run(allowed, mount, load) {
  if (playing || !allowed()) return;
  playing = true;
  if (!document.getElementById('spa-entry-style')) {
    const st = document.createElement('style');
    st.id = 'spa-entry-style';
    st.textContent = CSS;
    document.head.append(st);
  }
  // a modal <dialog>: the top layer, so it also covers the fullscreen prompt (fullscreen-guide.js, a modal dialog too)
  const el = document.createElement('dialog');
  el.className = 'spa-entry';
  el.setAttribute('aria-label', t('卫戍协议') + ' · ' + t('盟约'));
  el.innerHTML = '<span class="spa-entry__skip"></span>';
  el.firstChild.textContent = t('点击跳过');
  // (fork) a phone that waits for its first tap (ui/device.js installFirstTapFullscreen: that tap enters fullscreen and
  // turns the screen landscape) is asked for it even when its sound could already play
  const needTap = firstTapPending();
  const locked = !(audio.ctx && audio.ctx.state === 'running') || needTap;
  const skipLabel = el.querySelector('.spa-entry__skip');
  skipLabel.style.opacity = '0';
  // (fork) the card goes up at once: 加载中 until the art and sound are here (a tap is taken already), then 点击进入.
  // Sound already unlocked: no tap to ask for, so only 加载中, and the film follows by itself.
  const card = document.createElement('div');
  const showLoading = () => {
    card.innerHTML = '<b></b>';
    card.firstChild.textContent = t('加载中'); // en: "Loading"
  };
  card.className = locked ? 'spa-entry__gate' : 'spa-entry__wait';
  // (fork) a phone is asked to tap from the first frame, the files still loading underneath (the tap is taken already)
  if (locked && needTap) showTapPrompt(card, true);
  else showLoading();
  el.append(card);
  let gate = Promise.resolve(), gateKey = null, tapped = !locked, tappedAt = -Infinity;
  let scene = null, raf = 0, release = null, bgmTimer = 0, waitTimer = 0, done = false, src = null;
  if (locked) {
    gate = new Promise((resolve) => {
      const go = () => {
        removeEventListener('keydown', go, true);
        tapped = true;
        tappedAt = performance.now();
        card.className = 'spa-entry__wait';
        showLoading();
        // audio.js asks for the screen's music on this same gesture (its capture listener ran first): held, so nothing
        // plays while the film gets ready; the film's own moment brings it in from its top
        release = holdBgm();
        waitTimer = setTimeout(allowSkip, WAIT_SKIP_MS);
        // audio.js creates / resumes the context on this same gesture; give it a moment to start running
        const until = performance.now() + 600;
        const wait = () => (audio.ctx?.state === 'running' || performance.now() > until ? resolve() : setTimeout(wait, 30));
        setTimeout(wait, 0);
      };
      gateKey = go;
      el.addEventListener('pointerdown', go, { once: true });
      addEventListener('keydown', go, true);
    });
  } else release = holdBgm();
  document.body.append(el);
  try { el.showModal(); } catch { el.setAttribute('open', ''); }
  const unraise = keepAboveFullscreen(el);

  const cleanup = () => {
    unraise();
    cancelAnimationFrame(raf);
    try { scene?.destroy(); } catch { /* ignore */ }
    try { el.close(); } catch { /* ignore */ }
    el.remove();
    playing = false;
  };
  /** 'end' (the film ran out), 'skip' (a tap / key) or 'leave' (the route left the title / lobby) */
  const finish = (how) => {
    if (done) return;
    done = true;
    unwatch();
    clearTimeout(bgmTimer);
    clearTimeout(waitTimer);
    removeEventListener('keydown', onKey, true);
    if (gateKey) removeEventListener('keydown', gateKey, true);
    if (how === 'leave') {
      // a restored room / match: nothing of the film may sit over it or be heard in it.
      // stop() throws InvalidStateError when its time is before the scheduled start, which used to skip the
      // disconnect in the same try and let the cue play inside the match. Disconnect first; stop on its own,
      // at a time that is not before that start.
      const cue = src;
      try { cue?.gain.disconnect(); } catch { /* ignore */ }
      try {
        if (cue?.node) {
          const now = audio.ctx?.currentTime ?? cue.when ?? 0;
          cue.node.stop(cue.when == null ? now : Math.max(now, cue.when));
        }
      } catch { /* ignore */ }
      release?.(); // the music goes back to audio.js, which plays the new screen's track
      cleanup();
      return;
    }
    release?.();
    if (how === 'skip') {
      // a skip: the cue stops with the picture (the music starts now, from its top); a cue not started yet is cut off
      // like the leave's (a fade-out stop before its start time would throw and let it play)
      const cue = src, now = audio.ctx?.currentTime ?? 0;
      if (cue?.node && cue.when != null && now < cue.when) {
        try { cue.gain.disconnect(); } catch { /* ignore */ }
        try { cue.node.stop(cue.when); } catch { /* ignore */ }
      } else {
        try { cue?.gain.gain.setTargetAtTime(0, now, 0.08); cue?.node.stop(now + 0.5); } catch { /* ignore */ }
      }
      el.style.transition = 'opacity .3s ease';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      setTimeout(cleanup, 320);
    } else cleanup();
  };
  // the player's own skip: a reload does not ask again. Not the card's own tap, though (a double click).
  const onKey = () => {
    if (performance.now() - tappedAt < DOUBLE_TAP_MS) return;
    markFilmPlayed();
    finish('skip');
  };
  el.addEventListener('cancel', (e) => { e.preventDefault(); if (tapped) onKey(); }); // Esc skips like any other key
  // skipping is armed once the film runs (the gate's own tap must not skip it), or when a very slow link has kept the
  // player waiting a long while: the film is never dropped for them, but they are not locked behind a black screen
  let skippable = false;
  function allowSkip() {
    if (skippable || done) return;
    skippable = true;
    skipLabel.style.opacity = '';
    el.addEventListener('pointerdown', onKey);
    addEventListener('keydown', onKey, true);
  }
  if (!locked) waitTimer = setTimeout(allowSkip, WAIT_SKIP_MS);
  // the route, from the card on: a session restored into a room / a match takes the film down at once
  const unwatch = store.subscribe(() => { if (!done && !allowed()) finish('leave'); });

  // a sprite that 404'd is not a film: take the cover down instead of playing blank frames
  load.then((ok) => {
    if (!ok) { finish('end'); return; }
    if (done || tapped) return;
    showTapPrompt(card, false);
  });
  const fonts = document.fonts?.load
    ? Promise.race([Promise.all(['300 40px Bender', '400 40px Bender'].map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 1200))])
    : null;
  Promise.all([gate, load, fonts]).then(async ([, ok]) => {
    if (done || !ok) return;
    const sound = await prepareSound();
    if (done) return;
    if (!allowed()) { finish('leave'); return; }
    clearTimeout(waitTimer);
    card.remove();
    allowSkip();
    skipLabel.style.opacity = '';
    try { scene = mount(el); } catch (err) { console.warn('[intro] could not start', err); finish('end'); return; }
    markFilmPlayed(); // only now: a page closed on the card plays it on the next load, with the files in the cache
    const { from, fadeAt, to } = INTRO_SPAN;
    const lead = 0.04;
    const t0 = performance.now() + lead * 1000; // video second `from` is on screen at t0
    setCycleOrigin(t0 + (3.12 - from) * 1000); // the backdrop under the opening shows the same moment of the cycle
    if (sound && audio.ctx?.state === 'running') {
      const ctx = audio.ctx;
      if (sound.sfx && audio.sfxGain) {
        try {
          const node = ctx.createBufferSource(), gain = ctx.createGain();
          node.buffer = sound.sfx; gain.gain.value = SFX_GAIN;
          node.connect(gain); gain.connect(audio.sfxGain);
          const when = ctx.currentTime + lead + (INTRO_AUDIO.sfxAt - from);
          node.start(when);
          src = { node, gain, when };
        } catch { /* ignore */ }
      }
      release ??= holdBgm();
    }
    // audio.js starts a track 50 ms after it is asked for
    if (release) bgmTimer = setTimeout(() => release?.(), Math.max(0, (lead + INTRO_AUDIO.bgmAt - from - 0.05) * 1000));
    const frame = () => {
      if (done) return;
      const T = from + (performance.now() - t0) / 1000;
      if (T >= to) { finish('end'); return; }
      if (T < 3.2) scene.grain();
      scene.render(Math.max(from, T));
      const fade = Math.min(1, Math.max(0, (T - fadeAt) / (to - fadeAt)));
      el.style.opacity = (1 - fade).toFixed(3);
      if (fade > 0) { el.style.pointerEvents = 'none'; skipLabel.style.opacity = '0'; }
      raf = requestAnimationFrame(frame);
    };
    scene.render(from);
    raf = requestAnimationFrame(frame);
  });
}

// (fork) A page load that lands in the lobby (a returning player, a refresh, a deploy's reload) plays it once per browser
// tab session, so it does not ask for the tap again and again. The login screen plays it every time (owner 2026-11-07).
// sessionStorage: private mode without it plays on every page load, as upstream does.
const FILM_PLAYED_KEY = 'sp.entryFilm.played';
// browser test suites whose flows are not about the film set this (test/helpers/releaseNotes.js)
const FILM_OFF_KEY = 'sp.entryFilm.off';
const sessionFlag = (key) => { try { return globalThis.sessionStorage?.getItem(key) === '1'; } catch { return false; } };
const filmPlayed = () => sessionFlag(FILM_PLAYED_KEY);
const markFilmPlayed = () => { try { globalThis.sessionStorage?.setItem(FILM_PLAYED_KEY, '1'); } catch { /* private mode */ } };

/**
 * (fork) Play the film each time the route comes back to the login screen (the lobby's way back to the title).
 * @param {{ skip?: () => boolean, mount?: typeof mountAllianceIntro }} [opts] as playEntryFilm's
 * @returns {() => void} stop watching
 */
export function watchTitleReturns(opts = {}) {
  return store.subscribe((s, prev) => {
    if (selectRoute(s) !== 'title' || selectRoute(prev) === 'title') return;
    playEntryFilm(opts).catch((err) => console.warn('[app] entry film unavailable', err));
  });
}

/**
 * Play the film before the login screen, every time it is entered (fork), and once per tab session when a page load lands
 * in the lobby instead; never over a room or a match, never under reduced motion, and never unless every sprite actually
 * loads. A phone that is portrait when this is called does not play it later, after a rotation.
 * (fork) The cover goes up at once and the film waits for its files, however long they take: what the opening needs is
 * loaded first, and the promise this returns says when it is in, so main.js starts everything else only then.
 * @param {{ skip?: () => boolean, mount?: typeof mountAllianceIntro }} [opts]  skip() → true when it must not (or no
 *   longer) play; mount: the scene (tests pass a stand-in)
 * @returns {Promise<void>} settled once what the opening needs has loaded (at once in a restored room / match)
 */
export async function playEntryFilm(opts = {}) {
  const { skip = () => false, mount = mountAllianceIntro } = opts;
  const allowed = () => { const r = selectRoute(store.get()); return r !== 'room' && r !== 'game' && !skip(); };
  if (!allowed()) return;
  const seen = filmPlayed() && selectRoute(store.get()) !== 'title';
  // no film on this path (decided as the screen is entered — a later rotation does not get a second look)
  // (fork) a portrait phone that waits for its first tap still gets the film: that tap turns the screen landscape
  const portraitSkip = touchDevice() && !phoneReady() && !firstTapPending();
  if (sessionFlag(FILM_OFF_KEY) || seen || reducedMotion() || portraitSkip) {
    if (!sessionFlag(FILM_OFF_KEY)) showTapCard();
    await loadTitleSound();
    return;
  }
  const load = loadFilm();
  run(allowed, mount, load);
  await load;
}
