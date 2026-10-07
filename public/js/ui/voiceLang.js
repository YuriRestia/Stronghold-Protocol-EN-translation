// 语音语言 (user request, plan of 2026-10-07): which dub each operator speaks in battle. A client-only preference
// (`sp.pref.voiceLang` = { default, byChar }, never synced to the server) pushed into the audio manager on every
// change. The settings row sets the default for everyone and clears the per-operator picks; the square buttons of
// the 干员调配 detail header and of the 自选 picker set one operator (CN / JP / EN / KR, plus its own-language dub —
// 意大利语, 俄文, 中文-方言 … — when the server has one) and play a line of it (试听).
// The languages an operator has come from the manifest (audio.js voiceLangsOf); a pick it lacks falls back to CN.

import { html } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { audio, VOICE_LANGS, voiceLangsOf, effectiveVoiceLang } from '../audio.js';
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
 * @returns {{ default: string, byChar: Record<string, string> }}
 */
export function sanitizeVoiceLang(v) {
  const def = VOICE_LANGS.includes(v?.default) ? v.default : 'cn';
  const byChar = {};
  if (v?.byChar && typeof v.byChar === 'object') {
    for (const [id, l] of Object.entries(v.byChar)) if (CHAR_ID.test(id) && PICKS.includes(l)) byChar[id] = l;
  }
  return { default: def, byChar };
}

/** Voice language store: { default, byChar }. */
export const voiceLangStore = createStore(sanitizeVoiceLang(loadPref('voiceLang', null)));

voiceLangStore.subscribe((s) => {
  const v = sanitizeVoiceLang(s);
  savePref('voiceLang', v);
  audio.setVoiceLang(v);
});
audio.setVoiceLang(voiceLangStore.get());

/** Settings: every operator speaks `lang` (the per-operator picks are cleared). */
export function setDefaultVoiceLang(lang) {
  if (!VOICE_LANGS.includes(lang)) return;
  voiceLangStore.set({ default: lang, byChar: {} });
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
  if (effectiveVoiceLang(a, charId, { default: cur.default, byChar }) !== lang) byChar[charId] = lang;
  voiceLangStore.set({ ...cur, byChar });
}

/** Preact hook: the current voice language preference. */
export const useVoiceLang = () => useStore((s) => s, Object.is, voiceLangStore);

/** The square label and full name of language `lang` for `charId` (the own-language dub reads its official type). */
function labelOf(a, charId, lang) {
  if (lang !== 'native') return LANG_LABEL[lang];
  const type = a?.voiceNative?.[charId]?.type;
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

/** Settings row: the default language of every operator (CN / JP / EN / KR). */
export function VoiceLangDefault() {
  const pref = useVoiceLang();
  return html`<div class="set-seg" role="radiogroup" aria-label=${t('语音语言')} data-testid="voice-lang-default">
    ${VOICE_LANGS.map((l) => html`<button key=${l} type="button" role="radio" aria-checked=${pref.default === l ? 'true' : 'false'}
      class=${pref.default === l ? 'is-on' : ''} title=${t(LANG_LABEL[l][1])} onClick=${() => setDefaultVoiceLang(l)}>${LANG_LABEL[l][0]}</button>`)}
  </div>`;
}
