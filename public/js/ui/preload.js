// Settings ▸ Preload assets: the row in the settings modal (PreloadRow) and the manager it opens (PreloadHost, mounted
// once in main.js above every screen). Visuals and music are always part of a preload; the voice packs are a checklist
// ticked from the voice language settings (ui/voiceLang.js) until the player edits it. The download itself runs in
// resources/index.js and keeps going after the manager is closed.

import { useEffect } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, Modal, ProgressBar, confirmDialog } from './components.js';
import { createStore, useStore } from '../store.js';
import { GIcon } from './gameComponents.js';
import { useVoiceLang } from './voiceLang.js';
import { BASE_PACKS, VOICE_PACKS, formatBytes } from '../../../shared/resources.js';
import { preloadPref, preloadState, tickedVoicePacks, voicePacksOf, missingBytes, inspectPreload, inspectPreloadLight, startPreload, pausePreload,
  clearPreload, setVoicePack, followVoiceSettings, removeVoicePacks } from '../resources/index.js';
import { t, N_ } from '../../../shared/i18n.js';

const ui = createStore({ open: false });
export const openPreload = () => ui.set({ open: true });
const closePreload = () => ui.set({ open: false });

/** UI texts (msgids). */
const TX = {
  title: N_('预载资源'), // en: "Preload Assets"
  manage: N_('管理'), // en: "Manage"
  downloading: N_('下载中 {pct}%'), // en: "Downloading {pct}%"
  allSaved: N_('全部已保存'), // en: "All saved"
  notStarted: N_('未下载'), // en: "Not downloaded"
  pausedRow: N_('已暂停'), // en: "Paused"
  savedRow: N_('已保存 {size}'), // en: "{size} saved"
  intro: N_('把游戏资源保存到浏览器，避免游戏过程中断。关闭此窗口后，下载会在后台继续。'), // en: "Save the game assets to your browser to prevent gameplay interruptions. Downloads continue in the background after you close this window."
  visual: N_('画面资源'), // en: "Visuals"
  visualHint: N_('地图、干员与敌人、Spine 模型、界面与字体'), // en: "Maps, operators and enemies, Spine models, UI and fonts"
  required: N_('必需'), // en: "Required"
  audio: N_('音乐与音效'), // en: "Music & Sound Effects"
  audioHint: N_('背景音乐、音效与玩法说明图片'), // en: "Background music, sound effects and guide images"
  included: N_('已包含'), // en: "Included"
  voicePacks: N_('语音包'), // en: "Voice Packs"
  follow: N_('跟随语音设置'), // en: "Match Voice Settings"
  voiceTag: N_('语音设置'), // en: "Voice settings"
  sum: N_('已保存 {saved} · 还需下载 {need}'), // en: "{saved} saved · {need} to download"
  noRoom: N_('存储空间不足：需要 {need}，浏览器缓存可用 {free}。隐私标签页的存储上限可能更低。'), // en: "Not enough storage: needs {need}, {free} browser cache available. Private tabs may be given a lower storage limit."
  worker: N_('预载服务未启用，资源仍会下载，但暂时不能从本机读取：{0}'), // en: "The preload service couldn't start. Assets still download, but can't be read from this device yet: {0}"
  safari: N_('Safari 会清除 7 天未访问网站的数据；把游戏添加到主屏幕可以避免。'), // en: "Safari deletes a site's data after 7 days without a visit. Adding the game to your Home Screen avoids this."
  removeVoice: N_('删除未勾选的语音'), // en: "Remove Unticked Voices"
  clear: N_('清理缓存'), // en: "Clear Cache"
  clearTitle: N_('清理缓存？'), // en: "Clear cache?"
  clearOk: N_('清理'), // en: "Clear"
  clearText: N_('将删除本机保存的全部游戏资源（{size}），之后资源改为从网络加载。可以随时重新下载。'), // en: "Deletes every game asset saved on this device ({size}). Assets then load from the network again; you can download them again any time."
  startAnyway: N_('仍然开始'), // en: "Start Anyway"
  resume: N_('继续下载'), // en: "Resume"
  start: N_('开始预载'), // en: "Start Preload"
  cardIntro: N_('把资源下载到本机。预载完成后，游戏过程中不再需要下载资源。'), // en: "Download assets to this device. After preload is complete, assets no longer need to be downloaded during gameplay."
  cardBusy: N_('正在下载。你可以直接开始游戏，已下载的资源会立即使用。'), // en: "Download in progress. You can start playing now; any downloaded assets will be used."
  cardPaused: N_('已暂停。已下载的资源可以直接使用。'), // en: "Paused. Downloaded assets are ready to be used."
  cardDone: N_('预载完成。资源已保存在本机，游戏过程中无需下载。'), // en: "Preload complete. Assets are saved on this device and won't be downloaded during gameplay."
  cardMore: N_('可下载更多'), // en: "Download More"
  options: N_('预载设置'), // en: "Preload Settings"
  resumeShort: N_('继续'), // en: "Resume"
};

/** Status messages of resources/index.js, by key ({0} = its `detail`). */
const MESSAGES = {
  checking: N_('正在检查已保存的资源…'), // en: "Checking saved assets…"
  paused: N_('已暂停：已下载的文件照常使用，可以随时继续。'), // en: "Paused. Files downloaded so far are already in use; resume any time."
  done: N_('所选资源已全部保存在本机。'), // en: "All selected assets are saved on this device."
  someFailed: N_('{0} 个文件下载失败，下次开始时会重试。'), // en: "{0} files failed to download and will be retried next time."
  otherTab: N_('另一个标签页正在下载…回到此页时会继续。'), // en: "Another tab is downloading… This tab continues when you come back to it."
  quota: N_('浏览器存储空间已满：已保存的文件会保留。'), // en: "Browser storage is full. Saved files are kept."
  failed: N_('预载失败：{0}'), // en: "Preload failed: {0}"
  manifestFailed: N_('无法读取资源清单：{0}'), // en: "Couldn't load the asset list: {0}"
  needsHttps: N_('预载需要 HTTPS 连接。'), // en: "Preloading needs an HTTPS connection."
  noSupport: N_('当前浏览器不支持预载资源。'), // en: "This browser doesn't support preloading."
  cleared: N_('已清理所有保存的资源。'), // en: "All saved assets were cleared."
};

/** The voice packs' names (existing msgids of ui/voiceLang.js). */
const VOICE_NAMES = { cn: N_('中文-普通话'), en: N_('英文'), jp: N_('日文'), kr: N_('韩文'), native: N_('本土语言') };

const busy = (st) => st.phase === 'download' || st.phase === 'checking';

/** [done, total] bytes of `packs`. */
function bytesOf(st, packs) {
  let done = 0;
  let total = 0;
  for (const p of packs) { done += st.packs?.[p]?.doneBytes || 0; total += st.packs?.[p]?.bytes || 0; }
  return [done, total];
}

/** Whether the private-browsing heuristics apply: Apple's engine (the 7-day wipe note). */
const isSafari = () => /Apple/.test(globalThis.navigator?.vendor || '') && !/CriOS|FxiOS|EdgiOS/.test(globalThis.navigator?.userAgent || '');

function rowStatus(st, pref, voice) {
  const [done, total] = bytesOf(st, [...BASE_PACKS, ...voice]);
  if (busy(st)) return total ? t(TX.downloading, { pct: Math.floor((done / total) * 100) }) : t(TX.downloading, { pct: 0 });
  if (st.packs && total && done >= total) return t(TX.allSaved);
  if (!pref.started) return t(TX.notStarted);
  if (pref.paused) return t(TX.pausedRow);
  return t(TX.savedRow, { size: formatBytes(st.savedBytes) });
}

/** The settings modal's row. */
export function PreloadRow() {
  const st = useStore((s) => s, Object.is, preloadState);
  const pref = useStore((s) => s, Object.is, preloadPref);
  useVoiceLang();
  return html`<div class="set-row">
    <span class="set-row__label">${t(TX.title)}<${MicroLabel}>PRELOAD<//></span>
    <span class="set-preload__state">${rowStatus(st, pref, tickedVoicePacks())}</span>
    <${Button} variant="secondary" size="sm" icon="expand" onClick=${openPreload}>${t(TX.manage)}<//>
  </div>`;
}

function PackRow({ st, pack, name, hint, tag, checked, disabled, onChange }) {
  const p = st.packs?.[pack];
  const done = p?.doneBytes || 0;
  const total = p?.bytes || 0;
  return html`<li class=${`preload-pack${checked ? ' is-on' : ''}`}>
    <label class="preload-pack__head">
      <input type="checkbox" checked=${checked} disabled=${disabled} onChange=${(e) => onChange?.(e.currentTarget.checked)} />
      <span class="preload-pack__name">${name}${hint ? html`<small>${hint}</small>` : null}</span>
      ${tag ? html`<${MicroLabel}>${tag}<//>` : null}
      <span class="preload-pack__size num">${p ? `${formatBytes(done)} / ${formatBytes(total)}` : '—'}</span>
    </label>
    ${p && total ? html`<${ProgressBar} value=${done} max=${total} size="sm" tone=${checked ? 'mint' : 'amber'} />` : null}
  </li>`;
}

/** Start / Pause / Resume / Start Anyway, as the state allows (the modal's and the title card's main button). */
function ActionButton({ st, pref, need, size = 'md', block = false }) {
  if (busy(st)) return html`<${Button} variant="secondary" size=${size} block=${block} icon="pause" onClick=${pausePreload}>${t('暂停')}<//>`;
  if (st.message === 'noRoom') {
    return html`<${Button} variant="primary" size=${size} block=${block} icon="play" onClick=${() => startPreload({ force: true })}>${t(TX.startAnyway)}<//>`;
  }
  return html`<${Button} variant="primary" size=${size} block=${block} icon="play"
    disabled=${!!st.unsupported || (!!st.packs && need === 0 && pref.started)}
    onClick=${() => startPreload()}>${pref.started && st.savedBytes ? t(TX.resume) : t(TX.start)}<//>`;
}

/**
 * The title screen's small card in the bottom-right corner (the login panel keeps the focus). Three states:
 *  - not started: one line on what a preload does, and Start Preload, which opens the manager to pick the packs (the
 *    manager's own start button starts the download; the manager stays open and shows its progress);
 *  - started, not complete: a progress bar with downloaded / total, Pause or Resume, and a gear for the manager;
 *  - complete (also on every later visit): a "preload complete" line, Download More (opens the manager: more voice packs)
 *    and the gear. A deploy that changes files puts it back in the second state until they are fetched.
 * A noRoom / quota / failure message shows under it. Hidden where the browser cannot preload.
 */
export function PreloadCard({ class: cls }) {
  const st = useStore((s) => s, Object.is, preloadState);
  const pref = useStore((s) => s, Object.is, preloadPref);
  useVoiceLang();
  useEffect(() => { void inspectPreloadLight(); }, []);
  if (st.unsupported) return null;
  const voice = tickedVoicePacks();
  const [done, total] = bytesOf(st, [...BASE_PACKS, ...voice]);
  const need = missingBytes(st.packs, voice);
  const complete = pref.started && !!st.packs && total > 0 && need === 0 && !busy(st);
  const msg = st.message === 'noRoom'
    ? t(TX.noRoom, { need: formatBytes(need), free: formatBytes(st.storage?.free ?? 0) })
    : st.phase === 'error' || st.phase === 'foreign' || st.message === 'someFailed'
      ? (MESSAGES[st.message] ? t(MESSAGES[st.message], { 0: st.message === 'someFailed' ? st.failed : st.detail }) : '') : '';
  const gear = html`<button type="button" class="title-preload__gear fsbtn tapx" title=${t(TX.options)} aria-label=${t(TX.options)}
    onClick=${openPreload}><${GIcon} name="gear" /></button>`;
  let body;
  if (!pref.started) {
    body = html`<p class="title-preload__intro">${t(TX.cardIntro)}</p>
      <${Button} variant="primary" size="sm" block=${true} icon="play" class="title-preload__go" onClick=${openPreload}>${t(TX.start)}<//>`;
  } else if (complete) {
    body = html`<p class="title-preload__intro is-done"><${Icon} name="check" />${t(TX.cardDone)}</p>
      <div class="title-preload__row">
        <${Button} variant="secondary" size="sm" block=${true} icon="plus" onClick=${openPreload}>${t(TX.cardMore)}<//>
        ${gear}
      </div>`;
  } else {
    const paused = !busy(st);
    body = html`<p class="title-preload__intro">${t(paused ? TX.cardPaused : TX.cardBusy)}</p>
      <div class="title-preload__row">
        <div class="title-preload__bar">
          <${ProgressBar} value=${done} max=${Math.max(1, total)} size="sm" tone=${paused ? 'amber' : 'mint'} />
          <span class="num">${formatBytes(done)} / ${formatBytes(total)}</span>
        </div>
        <button type="button" class="title-preload__gear fsbtn tapx" title=${t(paused ? TX.resumeShort : '暂停')}
          aria-label=${t(paused ? TX.resumeShort : '暂停')} onClick=${() => (paused ? startPreload() : pausePreload())}>
          <${Icon} name=${paused ? 'play' : 'pause'} /></button>
        ${gear}
      </div>`;
  }
  return html`<section class=${`title-preload${complete ? ' is-done' : ''}${cls ? ` ${cls}` : ''}`} aria-labelledby="title-preload-h">
    <h2 id="title-preload-h">${t(TX.title)}</h2>
    ${body}
    ${msg ? html`<p class="title-preload__msg" role="status" aria-live="polite">${msg}</p>` : null}
  </section>`;
}

/** The manager modal (mounted once in main.js). */
export function PreloadHost() {
  const { open } = useStore((s) => s, Object.is, ui);
  const st = useStore((s) => s, Object.is, preloadState);
  const pref = useStore((s) => s, Object.is, preloadPref);
  const voicePref = useVoiceLang();
  useEffect(() => { if (open) void inspectPreload(); }, [open]);
  if (!open) return null;
  const voice = tickedVoicePacks();
  const working = busy(st);
  const need = missingBytes(st.packs, voice);
  const [saved] = bytesOf(st, [...BASE_PACKS, ...VOICE_PACKS]);
  const [done, total] = bytesOf(st, [...BASE_PACKS, ...voice]);
  const staleVoice = VOICE_PACKS.filter((p) => !voice.includes(p) && (st.packs?.[p]?.doneFiles || 0) > 0);
  const msg = st.message === 'noRoom'
    ? t(TX.noRoom, { need: formatBytes(need), free: formatBytes(st.storage?.free ?? 0) })
    : MESSAGES[st.message] ? t(MESSAGES[st.message], { 0: st.message === 'someFailed' ? st.failed : st.detail }) : '';
  const clear = async () => {
    const ok = await confirmDialog({ title: t(TX.clearTitle), danger: true, okText: t(TX.clearOk),
      text: t(TX.clearText, { size: formatBytes(saved) }) });
    if (ok) await clearPreload();
  };
  const action = html`<${ActionButton} st=${st} pref=${pref} need=${need} />`;
  return html`<${Modal} open=${open} onClose=${closePreload} title=${t(TX.title)} micro="PRELOAD" width="7.4rem" class="preload-modal"
    actions=${html`${action}<${Button} variant="secondary" onClick=${closePreload}>${t('关闭')}<//>`}>
    <div class="preload">
      <p class="set-hint">${t(TX.intro)}</p>
      <ul class="preload__packs">
        <${PackRow} st=${st} pack="visual" name=${t(TX.visual)} hint=${t(TX.visualHint)} tag=${t(TX.required)} checked disabled />
        <${PackRow} st=${st} pack="audio" name=${t(TX.audio)} hint=${t(TX.audioHint)} tag=${t(TX.included)} checked disabled />
      </ul>
      <div class="preload__voice-head">
        <span class="set-row__label">${t(TX.voicePacks)}</span>
        ${pref.voice ? html`<${Button} variant="ghost" size="sm" icon="refresh" disabled=${working}
          onClick=${followVoiceSettings}>${t(TX.follow)}<//>` : null}
      </div>
      <ul class="preload__packs">
        ${VOICE_PACKS.map((p) => html`<${PackRow} key=${p} st=${st} pack=${p} name=${t(VOICE_NAMES[p])}
          tag=${voicePacksOf(voicePref).includes(p) ? t(TX.voiceTag) : ''} checked=${voice.includes(p)} disabled=${working}
          onChange=${(on) => setVoicePack(p, on)} />`)}
      </ul>
      <p class="preload__sum num">${t(TX.sum, { saved: formatBytes(saved), need: formatBytes(need) })}</p>
      ${msg ? html`<p class=${`preload__msg${st.phase === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">${msg}</p>` : null}
      ${st.worker ? html`<p class="preload__msg is-error">${t(TX.worker, { 0: st.worker })}</p>` : null}
      ${isSafari() ? html`<p class="set-hint">${t(TX.safari)}</p>` : null}
      <div class="preload__tools">
        <${ProgressBar} class="preload__bar" value=${done} max=${Math.max(1, total)} size="sm" tone=${working || need === 0 ? 'mint' : 'amber'} />
        ${staleVoice.length ? html`<${Button} variant="ghost" size="sm" disabled=${working}
          onClick=${() => removeVoicePacks(staleVoice)}>${t(TX.removeVoice)}<//>` : null}
        <${Button} variant="danger" size="sm" disabled=${!saved} onClick=${clear}>${t(TX.clear)}<//>
      </div>
    </div>
  <//>`;
}
