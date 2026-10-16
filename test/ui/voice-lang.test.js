// 语音语言 per operator (public/js/ui/voiceLang.js) on upstream's store since the 0.3.0 merge: settings.voiceOverrides
// set by the square picker, cleared when 语音语言 or 本土语言 changes (ui/settings.js updateSettings), and what the audio
// manager receives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicePrefOf, setCharVoiceLang } from '../../public/js/ui/voiceLang.js';
import { settingsStore, updateSettings } from '../../public/js/ui/settings.js';
import { audio, effectiveVoiceLang } from '../../public/js/audio.js';

const am = { voice: { char_1_a: { select: '/assets/audio/voice/cn/char_1_a/cn_1.mp3' }, char_2_b: { select: '/assets/audio/voice/cn/char_2_b/cn_1.mp3' } },
  voiceJp: { char_1_a: { select: 'j' }, char_2_b: { select: 'j' } }, voiceEn: { char_1_a: { select: 'e' } }, voiceKr: { char_1_a: { select: 'k' } },
  voiceNative: { char_1_a: { select: 'n' } }, voiceNativeLangType: { char_1_a: 'ITA' } };
const overrides = () => settingsStore.get().voiceOverrides;

test('changing 语音语言 clears the picks; a pick equal to what the settings give is no override', () => {
  updateSettings({ voiceLang: 'cn', voiceNative: false });
  setCharVoiceLang(am, 'char_1_a', 'native');
  setCharVoiceLang(am, 'char_2_b', 'jp');
  assert.deepEqual(overrides(), { char_1_a: 'native', char_2_b: 'jp' });
  assert.deepEqual(audio.voiceOverrides, overrides(), 'the audio manager follows the picks');
  setCharVoiceLang(am, 'char_2_b', 'cn');
  assert.deepEqual(overrides(), { char_1_a: 'native' }, 'back to what the settings give ⇒ the override goes');
  updateSettings({ voiceLang: 'en' });
  assert.deepEqual(overrides(), {}, 'another 语音语言 clears every pick');
  setCharVoiceLang(am, 'char_2_b', 'jp');
  assert.deepEqual(overrides(), {}, 'char_2_b has no EN dub: under EN it already speaks JP');
  setCharVoiceLang(am, 'char_1_a', 'cn');
  assert.deepEqual(overrides(), { char_1_a: 'cn' }, 'char_1_a has EN: CN is a real override');
  updateSettings({ muted: false });
  assert.deepEqual(overrides(), { char_1_a: 'cn' }, 'another setting changing keeps the picks');
  updateSettings({ voiceLang: 'cn' });
});

test('settings 本土语言: every operator with an own-language dub speaks it, the others the default; toggling clears the picks', () => {
  updateSettings({ voiceLang: 'en', voiceNative: false });
  setCharVoiceLang(am, 'char_2_b', 'cn');
  updateSettings({ voiceNative: true });
  assert.deepEqual(overrides(), {}, 'switching it on clears the picks');
  const pref = voicePrefOf(settingsStore.get());
  assert.equal(effectiveVoiceLang(am, 'char_1_a', pref), 'native', 'char_1_a has an ITA dub');
  assert.equal(effectiveVoiceLang(am, 'char_2_b', pref), 'jp', 'char_2_b has none: the default, then its JP fallback');
  setCharVoiceLang(am, 'char_1_a', 'kr');
  assert.equal(effectiveVoiceLang(am, 'char_1_a', voicePrefOf(settingsStore.get())), 'kr', 'a per-operator pick still wins');
  setCharVoiceLang(am, 'char_1_a', 'native');
  assert.deepEqual(overrides(), {}, 'native is what the switch already gives: no override');
  updateSettings({ voiceNative: false });
  assert.equal(effectiveVoiceLang(am, 'char_1_a', voicePrefOf(settingsStore.get())), 'en', 'off: back to the voice language');
  updateSettings({ voiceLang: 'cn' });
});
