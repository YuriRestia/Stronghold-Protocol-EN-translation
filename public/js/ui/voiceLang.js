// 语音语言 per operator (user request, plan of 2026-10-07; on upstream 0.3.0's store since the 2026-10-16 merge). The
// settings row (ui/settings.js, `settings.voiceLang`: CN / JP / EN / KR, EN by default) is the dub of every operator;
// its 本土语言 switch (`settings.voiceNative`) gives every operator with an own-language dub that dub. Changing either
// clears the per-operator picks (ui/settings.js updateSettings). The square buttons of the 干员调配 detail header, the
// 自选 picker and each slot of the 自选 overview set one operator (CN / JP / EN / KR, plus its own-language dub —
// 意大利语, 俄文, 中文-方言 … — when the server has one) and play a line of it (试听). The picks are upstream's
// `settings.voiceOverrides` (charId → cn | jp | en | kr | native; browser-local, never sent to the server), resolved by
// voicePrefs.js voiceLangFor: the pick, the own-language dub, the settings' dub, JP, 中文. The languages an operator has
// come from the manifest (audio.js voiceLangsOf); a saved pick this server lacks shows as a crossed-out square
// (「此服务器没有」) and the operator speaks the fallback.

import { html } from './components.js';
import { loadPref, savePref } from '../store.js';
import { audio, voiceLangsOf, effectiveVoiceLang } from '../audio.js';
import { VOICE_PICKS } from '../voicePrefs.js';
import { useSettings, updateSettings, settingsStore } from './settings.js';
import { data } from '../data.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Button text and full name (msgid, the official voiceLangTypeDict names) of each language. */
const LANG_LABEL = { cn: ['CN', N_('中文-普通话')], jp: ['JP', N_('日文')], en: ['EN', N_('英文')], kr: ['KR', N_('韩文')] };
/** The own-language dubs by official voiceLangType (charword_table.json voiceLangTypeDict, groupType CUSTOM). */
const NATIVE_LABEL = {
  ITA: ['IT', N_('意大利语')], GER: ['DE', N_('德文')], RUS: ['RU', N_('俄文')], FRE: ['FR', N_('法语')],
  SPA: ['ES', N_('西班牙语')], CN_TOPOLECT: [null, N_('中文-方言')],
};
/** The 中文-方言 square's own text (a translated one-glyph msgid, unlike the language codes). */
const TOPOLECT_SQ = N_('方');

/**
 * Before the merge, the picks lived in `sp.pref.voiceLang.byChar`: hand them to settings.voiceOverrides once (only
 * when the settings hold none yet), then drop the old key's picks.
 */
function migrateOldPicks() {
  const old = loadPref('voiceLang', null);
  const byChar = old?.byChar && typeof old.byChar === 'object' ? old.byChar : null;
  if (!byChar || !Object.keys(byChar).length) return;
  if (!Object.keys(settingsStore.get().voiceOverrides || {}).length) updateSettings({ voiceOverrides: byChar });
  savePref('voiceLang', { ...old, byChar: {} });
}
// after the module graph ran: ui/settings.js imports this file (through ui/preload.js) before its store exists
queueMicrotask(() => { try { migrateOldPicks(); } catch { /* a profile it cannot read keeps its settings */ } });

/** The voice preference as voicePrefs.js reads it: { default, native, byChar } from the settings. */
export function voicePrefOf(s) {
  return { default: s.voiceLang, native: s.voiceNative === true, byChar: s.voiceOverrides || {} };
}

/** Preact hook: the current voice preference ({ default, native, byChar }). */
export function useVoiceLang() {
  return voicePrefOf(useSettings());
}

/**
 * One operator speaks `lang`. A pick equal to what the settings already give it drops the override instead, so a
 * later change of the settings still reaches it.
 * @param {any} a manifest `audio`
 * @param {string} charId
 * @param {string} lang
 */
export function setCharVoiceLang(a, charId, lang) {
  if (typeof charId !== 'string' || !VOICE_PICKS.includes(lang)) return;
  const s = settingsStore.get();
  const voiceOverrides = { ...s.voiceOverrides };
  delete voiceOverrides[charId];
  if (effectiveVoiceLang(a, charId, voicePrefOf({ ...s, voiceOverrides })) !== lang) voiceOverrides[charId] = lang;
  updateSettings({ voiceOverrides });
}

/** The square label and full name of language `lang` for `charId` (the own-language dub reads its official type). */
function labelOf(a, charId, lang) {
  if (lang !== 'native') return LANG_LABEL[lang];
  const type = a?.voiceNativeLangType?.[charId];
  const [text, name] = NATIVE_LABEL[type] || [String(type || '★').slice(0, 2), N_('本土语言')];
  return [text ?? t(TOPOLECT_SQ), name];
}

/**
 * The per-operator picker: one square per language the operator has on this server (nothing when it only has the
 * base CN dub, or no voice at all), plus a crossed-out square for a saved pick this server lacks. A click picks the
 * language and plays a line of it.
 * @param {{ charId: string|null|undefined, class?: string, compact?: boolean }} props
 */
export function VoiceLangPicker({ charId, class: cls, compact = false }) {
  const pref = useVoiceLang();
  const a = data.get('assets')?.audio;
  const langs = typeof charId === 'string' ? voiceLangsOf(a, charId) : [];
  if (langs.length < 2) return null;
  const saved = pref.byChar[charId];
  const missing = saved && !langs.includes(saved) ? saved : null;
  const on = effectiveVoiceLang(a, charId, pref);
  return html`<div class=${cx('vl-pick', compact && 'vl-pick--compact', cls)} role="radiogroup" aria-label=${t('干员语音')} data-testid="voice-lang" data-voice-char=${charId}>
    ${langs.map((l) => {
      const [text, name] = labelOf(a, charId, l);
      return html`<button key=${l} type="button" role="radio" class=${cx('vl-pick__sq', l === 'native' && 'vl-pick__sq--native', on === l && 'is-on')}
        aria-checked=${on === l ? 'true' : 'false'} aria-label=${t(name)} title=${t(name)} data-lang=${l}
        onClick=${(e) => { e.stopPropagation(); setCharVoiceLang(a, charId, l); audio.previewVoice(charId, l); }}>${text}</button>`;
    })}
    ${missing ? html`<span class="vl-pick__sq vl-pick__sq--missing" data-lang=${missing} role="img"
      aria-label=${`${t(labelOf(a, charId, missing)[1])}${t('（此服务器没有）')}`} title=${`${t(labelOf(a, charId, missing)[1])}${t('（此服务器没有）')}`}>${labelOf(a, charId, missing)[0] ?? t(TOPOLECT_SQ)}</span>` : null}
  </div>`;
}
