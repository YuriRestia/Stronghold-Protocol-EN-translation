// 语音语言 per operator (user request, plan of 2026-10-07), on top of master's settings 语音语言 (0.2.2). The settings
// row (ui/settings.js, `settings.voiceLang`: CN / JP / EN / KR, EN by default) is the dub of every operator; changing
// it, or its 本土语言 switch (`settings.voiceNative`: every operator with an own-language dub speaks it), clears the
// per-operator picks (setDefaultVoiceLang). The square buttons of the 干员调配 detail header and of the
// 自选 picker set one operator (CN / JP / EN / KR, plus its own-language dub — 意大利语, 俄文, 中文-方言 … — when the
// server has one) and play a line of it (试听). The picks are a client-only preference (`sp.pref.voiceLang` =
// { default, native, byChar }, never synced to the server; `default` and `native` mirror the settings so the preload's voice packs and the
// picker read one store) pushed into the audio manager (audio.setVoicePicks), which plays them through voiceLine.
// The languages an operator has come from the manifest (audio.js voiceLangsOf: the trees `audio.voiceJp` /
// `audio.voiceEn` / `audio.voiceKr` / `audio.voiceNative`); a language it lacks falls back to EN, then JP (unreleased on
// global), then CN.

import { html } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { audio, VOICE_LANGS, VOICE_FALLBACK, voiceLangsOf, effectiveVoiceLang } from '../audio.js';
import { data } from '../data.js';
import { t, N_ } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const CHAR_ID = /^char_[a-z0-9_]+$/i;
const PICKS = [...VOICE_LANGS, 'native'];

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
 * Keep only well-formed fields: a known default, per-operator picks of known languages on charIds.
 * @param {any} v
 * @returns {{ default: string, native: boolean, byChar: Record<string, string> }}
 */
export function sanitizeVoiceLang(v) {
  const def = VOICE_LANGS.includes(v?.default) ? v.default : VOICE_FALLBACK[0];
  const byChar = {};
  if (v?.byChar && typeof v.byChar === 'object') {
    for (const [id, l] of Object.entries(v.byChar)) if (CHAR_ID.test(id) && PICKS.includes(l)) byChar[id] = l;
  }
  return { default: def, native: v?.native === true, byChar };
}

/**
 * The stored picks, with the default the settings hold. Before the picker moved its default into master's settings
 * 语音语言, `sp.pref.voiceLang.default` was the only one: a profile that has it and no settings `voiceLang` yet hands it
 * over once (this module loads before ui/settings.js reads its store — settings.js imports it).
 */
function initialVoiceLang() {
  const saved = loadPref('voiceLang', null);
  let settings = null;
  try { settings = loadPref('settings', null); } catch { /* ignore */ }
  if (!settings || typeof settings !== 'object') settings = null;
  if (VOICE_LANGS.includes(saved?.default) && settings?.voiceLang === undefined) {
    settings = { ...settings, voiceLang: saved.default };
    savePref('settings', settings);
  }
  return sanitizeVoiceLang({ ...saved, default: settings?.voiceLang ?? saved?.default, native: settings?.voiceNative === true });
}

/** Voice language store: { default (mirrors settings 语音语言), native (settings 本土语言), byChar }. */
export const voiceLangStore = createStore(initialVoiceLang());

voiceLangStore.subscribe((s) => {
  const v = sanitizeVoiceLang(s);
  savePref('voiceLang', v);
  audio.setVoicePicks(v.byChar);
});
audio.setVoicePicks(voiceLangStore.get().byChar);

/**
 * Settings 语音语言 or 本土语言 changed (ui/settings.js): every operator speaks `lang` — or, with `native`, its own-language
 * dub when it has one — and the per-operator picks are cleared. The same values again (any other setting changing) keep
 * them.
 * @param {string} lang
 * @param {boolean} [native]
 */
export function setDefaultVoiceLang(lang, native = false) {
  const cur = voiceLangStore.get();
  if (!VOICE_LANGS.includes(lang) || (cur.default === lang && cur.native === native)) return;
  voiceLangStore.set({ default: lang, native, byChar: {} });
}

/**
 * One operator speaks `lang`. A pick equal to what the default already gives it drops the override instead, so a
 * later change of the default still reaches it.
 * @param {any} a manifest `audio`
 * @param {string} charId
 * @param {string} lang
 */
export function setCharVoiceLang(a, charId, lang) {
  if (!CHAR_ID.test(charId) || !PICKS.includes(lang)) return;
  const cur = voiceLangStore.get();
  const byChar = { ...cur.byChar };
  delete byChar[charId];
  if (effectiveVoiceLang(a, charId, { ...cur, byChar }) !== lang) byChar[charId] = lang;
  voiceLangStore.set({ ...cur, byChar });
}

/** Preact hook: the current voice language preference. */
export const useVoiceLang = () => useStore((s) => s, Object.is, voiceLangStore);

/** The square label and full name of language `lang` for `charId` (the own-language dub reads its official type). */
function labelOf(a, charId, lang) {
  if (lang !== 'native') return LANG_LABEL[lang];
  const type = a?.voiceNativeLangType?.[charId];
  const [text, name] = NATIVE_LABEL[type] || [String(type || '★').slice(0, 2), N_('本土语言')];
  return [text ?? t(TOPOLECT_SQ), name];
}

/**
 * The per-operator picker: one square per language the operator has on this server (nothing when it only has the
 * base CN dub, or no voice at all). A click picks the language and plays a line of it.
 * @param {{ charId: string|null|undefined, class?: string }} props
 */
export function VoiceLangPicker({ charId, class: cls }) {
  const pref = useVoiceLang();
  const a = data.get('assets')?.audio;
  const langs = typeof charId === 'string' ? voiceLangsOf(a, charId) : [];
  if (langs.length < 2) return null;
  const on = effectiveVoiceLang(a, charId, pref);
  return html`<div class=${cx('vl-pick', cls)} role="radiogroup" aria-label=${t('干员语音')} data-testid="voice-lang">
    ${langs.map((l) => {
      const [text, name] = labelOf(a, charId, l);
      return html`<button key=${l} type="button" role="radio" class=${cx('vl-pick__sq', l === 'native' && 'vl-pick__sq--native', on === l && 'is-on')}
        aria-checked=${on === l ? 'true' : 'false'} aria-label=${t(name)} title=${t(name)} data-lang=${l}
        onClick=${() => { setCharVoiceLang(a, charId, l); audio.previewVoice(charId, l); }}>${text}</button>`;
    })}
  </div>`;
}
