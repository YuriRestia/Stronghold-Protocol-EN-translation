// 语音语言 preference (public/js/ui/voiceLang.js): the persisted { default, byChar }, the settings batch set and the
// per-operator picks, and what the audio manager receives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVoiceLang, voiceLangStore, setDefaultVoiceLang, setCharVoiceLang } from '../../public/js/ui/voiceLang.js';
import { audio, effectiveVoiceLang } from '../../public/js/audio.js';

const am = { voice: { char_a: { select: '/assets/audio/voice/cn/char_a/cn_1.mp3' }, char_b: { select: '/assets/audio/voice/cn/char_b/cn_1.mp3' } },
  voiceJp: { char_a: { select: 'j' }, char_b: { select: 'j' } }, voiceEn: { char_a: { select: 'e' } }, voiceKr: { char_a: { select: 'k' } },
  voiceNative: { char_a: { select: 'n' } }, voiceNativeLangType: { char_a: 'ITA' } };

test('sanitize: unknown languages, malformed charIds and junk are dropped', () => {
  assert.deepEqual(sanitizeVoiceLang(null), { default: 'cn', native: false, byChar: {} }, '中文 by default');
  assert.deepEqual(sanitizeVoiceLang({ default: 'native', byChar: { char_a: 'native', char_b: 'xx', 'bad id': 'jp', char_c: 'kr' } }),
    { default: 'cn', native: false, byChar: { char_a: 'native', char_c: 'kr' } }, 'native is a per-operator pick only, never the default');
});

test('settings batch set clears the picks; a pick equal to the default is no override', () => {
  setDefaultVoiceLang('cn');
  setCharVoiceLang(am, 'char_a', 'native');
  setCharVoiceLang(am, 'char_b', 'jp');
  assert.deepEqual(voiceLangStore.get().byChar, { char_a: 'native', char_b: 'jp' });
  assert.deepEqual(audio.voicePicks, voiceLangStore.get().byChar, 'the audio manager follows the picks');
  setCharVoiceLang(am, 'char_b', 'cn');
  assert.deepEqual(voiceLangStore.get().byChar, { char_a: 'native' }, 'back to what the default gives ⇒ the override goes');
  setDefaultVoiceLang('en');
  assert.deepEqual(voiceLangStore.get(), { default: 'en', native: false, byChar: {} }, 'the batch set clears every pick');
  setCharVoiceLang(am, 'char_b', 'cn');
  assert.deepEqual(voiceLangStore.get().byChar, {}, 'char_b has no EN dub: under an EN default it already speaks 中文');
  setCharVoiceLang(am, 'char_a', 'cn');
  assert.deepEqual(voiceLangStore.get().byChar, { char_a: 'cn' }, 'char_a has EN: CN is a real override');
  setDefaultVoiceLang('xx');
  assert.equal(voiceLangStore.get().default, 'en', 'an unknown default is ignored');
  setDefaultVoiceLang('cn');
});

test('settings 本土语言: every operator with an own-language dub speaks it, the others the default; toggling clears the picks', () => {
  setDefaultVoiceLang('en', false);
  setCharVoiceLang(am, 'char_b', 'cn');
  setDefaultVoiceLang('en', true);
  assert.deepEqual(voiceLangStore.get(), { default: 'en', native: true, byChar: {} }, 'switching it on clears the picks');
  const pref = voiceLangStore.get();
  assert.equal(effectiveVoiceLang(am, 'char_a', pref), 'native', 'char_a has an ITA dub');
  assert.equal(effectiveVoiceLang(am, 'char_b', pref), 'cn', 'char_b has none: the default, then 中文');
  setCharVoiceLang(am, 'char_a', 'kr');
  assert.equal(effectiveVoiceLang(am, 'char_a', voiceLangStore.get()), 'kr', 'a per-operator pick still wins');
  setCharVoiceLang(am, 'char_a', 'native');
  assert.deepEqual(voiceLangStore.get().byChar, {}, 'native is what the switch already gives: no override');
  setDefaultVoiceLang('en', false);
  assert.equal(effectiveVoiceLang(am, 'char_a', voiceLangStore.get()), 'en', 'off: back to the voice language');
  setDefaultVoiceLang('cn');
});
