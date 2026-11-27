import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioManager } from '../../public/js/audio.js';
import { audioEarly, keepEarly } from '../../public/js/screens/game/early.js';

function harness() {
  const sources = [];
  const a = new AudioManager({ getManifest: () => ({ audio: { sfx: { ui: { bondUp: '/bond.mp3' } } } }) });
  a.ctx = {
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const s = { started: false, stopped: false, connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(s); return s;
    },
  };
  a.sfxGain = {};
  a._buffer = async () => ({ duration: 1 });
  return { a, sources };
}
const flush = () => new Promise(resolve => queueMicrotask(resolve));

test('a real layer gain plays once regardless of amount; invalid gains are silent', async () => {
  const { a, sources } = harness();
  for (const n of [0, -1, NaN, Infinity, '1']) a.layerGain('sargonShip', n);
  a.layerGain(null, 1); a.layerGain('', 1);
  await flush(); assert.equal(sources.length, 0);
  a.layerGain('sargonShip', 5); await flush();
  assert.equal(sources.length, 1); assert.equal(sources[0].started, true);
  a.stopBondCue();
});

test('each new layer cue immediately replaces the playing cue, with no cooldown', async () => {
  const { a, sources } = harness();
  a.layerGain('sargonShip', 1); await flush();
  a.handleBattleEvents([['layer', 'p_1', 'sargonShip', 2]]); await flush();
  assert.equal(sources.length, 2); assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].started, true); assert.equal(sources[1].stopped, false);
  sources[0].onended(); assert.equal(a.bondCueNode.src, sources[1], 'late cleanup must not clear the replacement');
  a.stopBondCue(); assert.equal(sources[1].stopped, true);
});

test('only the newest request can start after asynchronous decoding', async () => {
  const { a, sources } = harness(), resolves = [];
  a._buffer = () => new Promise(resolve => resolves.push(resolve));
  a.layerGain('kjeragShip', 1); a.layerGain('defend', 2);
  resolves[1]({ duration: 1 }); await flush();
  resolves[0]({ duration: 1 }); await flush();
  assert.equal(sources.length, 1); assert.equal(sources[0].started, true);
  a.stopBondCue();
});

test('field entry, stopping and muting cancel a cue that is still decoding', async () => {
  for (const cancel of [a => a.setFieldUnits([]), a => a.stopBondCue(), a => a.setVolumes({ muted: true }), a => a.setVolumes({ sfx: 0 })]) {
    const { a, sources } = harness(); let resolve;
    a._buffer = () => new Promise(r => { resolve = r; });
    a.layerGain('sargonShip', 1); cancel(a); resolve({ duration: 1 }); await flush();
    assert.equal(sources.length, 0);
  }
});

test('locked/muted audio and missing assets never queue old layer sounds', async () => {
  const { a, sources } = harness(), ctx = a.ctx;
  a.ctx = null; a.layerGain('sargonShip', 1); a.ctx = ctx;
  a.setVolumes({ muted: true }); a.layerGain('sargonShip', 1); a.setVolumes({ muted: false });
  a._buffer = async () => null; a.layerGain('sargonShip', 1); await flush();
  a._buffer = async () => { throw new Error('missing'); }; a.layerGain('sargonShip', 1); await flush();
  assert.equal(sources.length, 0); assert.equal(a.bondCueNode, null);
});

test('returning to prep cancels old battle audio but preserves a new prep gain received before the phase view', async () => {
  const { a, sources } = harness(); let resolve;
  a._buffer = () => new Promise(r => { resolve = r; });
  a.handleBattleEvents([['layer', 'p_0', 'sargonShip', 1]]);
  a.stopFieldSounds();
  a.stopBondCue('battle'); resolve({ duration: 1 }); await flush();
  assert.equal(sources.length, 0);
  a.layerGain('sargonShip', 1);
  a.stopFieldSounds();
  a.stopBondCue('battle'); resolve({ duration: 1 }); await flush();
  assert.equal(sources.length, 1); assert.equal(sources[0].started, true);
  a.stopBondCue();
});

test('battle layer tuples use the same exclusive channel; late field replay has no layer cue', async () => {
  const { a, sources } = harness();
  const events = [['layer', 'p_0', 'sargonShip', 1], ['layer', 'p_1', 'kjeragShip', 2]];
  a.handleBattleEvents(events); await flush(); assert.equal(sources.length, 1);
  a.stopBondCue();
  assert.equal(events.some(keepEarly), false);
  a.handleBattleEvents(audioEarly(events)); await flush(); assert.equal(sources.length, 1);
});

test('a prep update that adds layers and activates a bond plays one cue, not a cut-off restart', async () => {
  const { a, sources } = harness();
  a.layerGain('sargonShip', 2);
  await flush();
  // screens/game.js: the active-bond count rose in the same update — it keeps the layer cue
  if (!a.bondCueRecent('prep')) a.sfx('bondUp', { volume: 0.7, scope: 'prep' });
  await flush();
  assert.equal(sources.length, 1, 'one source');
  assert.equal(sources[0].stopped, false, 'the layer cue is not cut off');
  // an activation with no layer cue of its own still sounds
  const b = harness();
  if (!b.a.bondCueRecent('prep')) b.a.sfx('bondUp', { volume: 0.7, scope: 'prep' });
  await flush();
  assert.equal(b.sources.length, 1);
});

test('爱国者 (fork): the revive\'s knock-out, its end and the spear impact play his animation-event sounds; others stay silent', () => {
  const events = { reborn_1: '/s/kneel.mp3', reborn_3: '/s/rise.mp3', spear_1: '/s/spear.mp3' };
  const a = new AudioManager({ win: null, getManifest: () => ({ audio: { sfx: { units: { enemy_1506_patrt: { events } } } } }) });
  a.ctx = {};
  const played = [];
  a._playUnitUrl = (url) => { played.push(url); };
  a.handleBattleEvents([
    ['spawn', { id: 7, spine: 'enemy_1506_patrt', side: 'enemy', kind: 'enemy' }],
    ['spawn', { id: 8, spine: 'enemy_1535_wlfmster', side: 'enemy', kind: 'enemy' }],
    ['fx', 'telegraph', 1, 1, { id: 7, form: 'reborn', kind: 'reborn', dur: 60 }],
    ['fx', 'revive', 1, 1, { id: 7, form: 'form2' }],
    ['fx', 'patriotSpear', 2, 2, { from: 7, to: 3 }],
    ['fx', 'telegraph', 1, 1, { id: 8, form: 'reborn', kind: 'reborn', dur: 40 }],
  ]);
  assert.deepEqual(played, ['/s/kneel.mp3', '/s/rise.mp3', '/s/spear.mp3'], 'his three; 扎罗 has none in the manifest');
});
