// ui/gameLogic/settings.js — settings defaults and sanitising. Re-exported from ../gameLogic.js.

import { clamp, isObj } from './shared.js';
import { DEFAULT_HOTKEYS, sanitizeHotkeys } from './shortcuts.js';


// ---- settings ------------------------------------------------------------------------------------------------------

/**
 * The operator voice dubs (settings 语音语言): 'cn' 中文 (`audio.voice`), 'jp' 日本語 (`audio.voiceJp`), and the
 * per-operator picker's 'en' English / 'kr' 한국어 (`audio.voiceEn` / `audio.voiceKr`, ui/voiceLang.js) — each falling back to the
 * Chinese line it lacks (public/js/audio.js voiceLine). Not tied to the interface language. The fork's default is
 * English (an operator not on the global server yet speaks JP, audio.js VOICE_FALLBACK).
 */
export const VOICE_LANGS = Object.freeze(['cn', 'jp', 'en', 'kr']);

/** keys: the in-match shortcuts' key map (ui/gameLogic/shortcuts.js; settings → 快捷键). voiceLang: VOICE_LANGS. */
export const DEFAULT_SETTINGS = Object.freeze({ bgm: 0.6, sfx: 0.8, voice: 0.8, voiceLang: 'en', muted: false, damageNumbers: true, quality: 'high', keys: DEFAULT_HOTKEYS });
const QUALITIES = ['high', 'medium', 'low'];

/**
 * Sanitize persisted settings.
 * @param {any} raw
 * @returns {{ bgm: number, sfx: number, voice: number, voiceLang: 'cn'|'jp'|'en'|'kr', muted: boolean, damageNumbers: boolean, quality: 'high'|'medium'|'low',
 *   keys: Record<'refresh'|'freeze'|'levelUp'|'retreat'|'sell'|'ready', string> }}
 */
export function sanitizeSettings(raw) {
  const r = isObj(raw) ? raw : {};
  const vol = (v, d) => (Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, 0, 1) : d);
  return {
    bgm: vol(r.bgm, DEFAULT_SETTINGS.bgm),
    sfx: vol(r.sfx, DEFAULT_SETTINGS.sfx),
    voice: vol(r.voice, DEFAULT_SETTINGS.voice),
    voiceLang: VOICE_LANGS.includes(r.voiceLang) ? r.voiceLang : DEFAULT_SETTINGS.voiceLang,
    muted: typeof r.muted === 'boolean' ? r.muted : DEFAULT_SETTINGS.muted,
    damageNumbers: typeof r.damageNumbers === 'boolean' ? r.damageNumbers : DEFAULT_SETTINGS.damageNumbers,
    quality: QUALITIES.includes(r.quality) ? r.quality : DEFAULT_SETTINGS.quality,
    keys: sanitizeHotkeys(r.keys),
  };
}
