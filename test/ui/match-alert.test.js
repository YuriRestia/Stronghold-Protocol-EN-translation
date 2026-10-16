// test/ui/match-alert.test.js — (fork) 设置「匹配提示音」: the official match-found sound plays as the briefing
// (INFO_CHECK) opens — solo queue, room start or matchmaking alike (main.js) — on by default. The context is suspended
// in a hidden tab, so the sound goes through an <audio> element (audio.js alert).
// Run: node --test test/ui/match-alert.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../public/js/ui/gameLogic.js';
import { AudioManager } from '../../public/js/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const LABEL = '匹配提示音';
const HINT = '进入作战简报时播放提示音，页面在后台也能听到。';

test('matchAlert is stored with the other settings: on by default and for a profile saved before it, junk on', () => {
  assert.equal(DEFAULT_SETTINGS.matchAlert, true);
  assert.equal(sanitizeSettings(null).matchAlert, true);
  assert.equal(sanitizeSettings({ bgm: 0.4 }).matchAlert, true, 'a profile saved before it');
  assert.equal(sanitizeSettings({ matchAlert: false }).matchAlert, false);
  for (const bad of ['false', 0, null, {}]) assert.equal(sanitizeSettings({ matchAlert: bad }).matchAlert, true, JSON.stringify(bad));
});

test('the settings dialog has the toggle and its hint, in every language pack', () => {
  const src = read('public/js/ui/settings.js');
  assert.ok(src.includes(`<\${Toggle} label=\${t('${LABEL}')} micro="MATCH FOUND SOUND" value=\${s.matchAlert}`));
  assert.ok(src.includes(`t('${HINT}')`));
  for (const lang of ['en', 'ja', 'ko', 'zh-TW']) {
    const pack = JSON.parse(read(`public/i18n/${lang}.json`));
    for (const id of [LABEL, HINT]) assert.ok(typeof pack[id] === 'string' && pack[id].length > 0, `${lang}: ${id}`);
  }
});

test('it plays once as the phase turns to the briefing, with the setting on, whatever started the match', () => {
  const src = read('public/js/main.js');
  for (const bit of ["if (s.match?.public?.phase === PHASE.INFO_CHECK && prev?.match?.public?.phase !== PHASE.INFO_CHECK",
    "&& settingsStore.get().matchAlert) audio.alert('matchSucceed');"]) assert.ok(src.includes(bit), bit);
  assert.ok(!read('public/js/ui/soloQueue.js').includes('audio.alert'), 'not tied to Solo Matchmaking');
});

/** A window whose Audio records each element it makes. */
function fakeWin() {
  const made = [];
  class Audio {
    constructor(src) { this.src = src; this.volume = 1; this.plays = 0; this.listeners = {}; made.push(this); }
    addEventListener(ev, fn) { this.listeners[ev] = fn; }
    play() { this.plays++; return Promise.resolve(); }
  }
  return { win: { Audio }, made };
}

test('audio.alert: the sfx.ui sound through an <audio> element (no context needed), /media/ first; mute and volume 0 stay silent', () => {
  const { win, made } = fakeWin();
  const manifest = { audio: { sfx: { ui: { matchSucceed: '/assets/audio/sfx/customse/act1autochess/act1autochess_g_ui_match_succeed.mp3' } } } };
  const a = new AudioManager({ win, getManifest: () => manifest });
  a.setVolumes({ sfx: 0.5, muted: false });
  a.alert('matchSucceed');
  assert.equal(made.length, 1);
  assert.equal(made[0].plays, 1);
  assert.equal(made[0].volume, 0.5);
  assert.ok(!made[0].src.endsWith('.mp3'), `the extension-less /media/ route: ${made[0].src}`);
  made[0].listeners.error();
  assert.equal(made[0].src, manifest.audio.sfx.ui.matchSucceed, 'a host without /media/: the original URL');
  assert.equal(made[0].plays, 2);

  a.alert('nope');
  a.setVolumes({ muted: true });
  a.alert('matchSucceed');
  a.setVolumes({ muted: false, sfx: 0 });
  a.alert('matchSucceed');
  assert.equal(made.length, 1, 'unknown name, muted, SFX at 0: nothing');
});
