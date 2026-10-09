// 语音语言 preference (public/js/ui/voiceLang.js): the persisted { default, byChar }, the settings batch set and the
// per-operator picks, and what the audio manager receives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVoiceLang, voiceLangStore, setDefaultVoiceLang, setCharVoiceLang } from '../../public/js/ui/voiceLang.js';
import { audio } from '../../public/js/audio.js';

const am = { voice: { char_a: { select: '/assets/audio/voice/cn/char_a/cn_1.mp3' }, char_b: { select: '/assets/audio/voice/cn/char_b/cn_1.mp3' } },
  voiceJp: { char_a: { select: 'j' }, char_b: { select: 'j' } }, voiceEn: { char_a: { select: 'e' } }, voiceKr: { char_a: { select: 'k' } },
  voiceNative: { char_a: { select: 'n' } }, voiceNativeLangType: { char_a: 'ITA' } };

test('sanitize: unknown languages, malformed charIds and junk are dropped', () => {
  assert.deepEqual(sanitizeVoiceLang(null), { default: 'en', byChar: {} }, 'EN by default');
  assert.deepEqual(sanitizeVoiceLang({ default: 'native', byChar: { char_a: 'native', char_b: 'xx', 'bad id': 'jp', char_c: 'kr' } }),
    { default: 'en', byChar: { char_a: 'native', char_c: 'kr' } }, 'native is a per-operator pick only, never the default');
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
  assert.deepEqual(voiceLangStore.get(), { default: 'en', byChar: {} }, 'the batch set clears every pick');
  setCharVoiceLang(am, 'char_b', 'jp');
  assert.deepEqual(voiceLangStore.get().byChar, {}, 'char_b has no EN dub: under an EN default it already speaks JP');
  setCharVoiceLang(am, 'char_a', 'cn');
  assert.deepEqual(voiceLangStore.get().byChar, { char_a: 'cn' }, 'char_a has EN: CN is a real override');
  setDefaultVoiceLang('xx');
  assert.equal(voiceLangStore.get().default, 'en', 'an unknown default is ignored');
  setDefaultVoiceLang('cn');
});
