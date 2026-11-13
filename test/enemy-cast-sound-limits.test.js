// test/enemy-cast-sound-limits.test.js — (fork, enemy cast sounds: official limits) an enemy skill-cast part plays every
// time it comes, held only by its bank's own cap (audio_data soundFXBanks maxSoundAllowed / popOldest: the official
// SoundFXBank keeps its playing atoms and no time between plays), and a file's official `delay` holds it back on the
// audio clock (public/js/audio.js _castPart / _playBank / _admitBank). No remake gap of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioManager } from '../public/js/audio.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function fakeWindow() {
  const listeners = new Map();
  class Param { constructor() { this.value = 1; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { connect() {} disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Src extends Node { constructor() { super(); this.playbackRate = new Param(); } start() {} stop() {} }
  const t0 = now();
  class Ctx {
    constructor() { this.state = 'running'; this.destination = new Node(); }
    get currentTime() { return now() - t0; }   // a running audio clock
    createGain() { return new Gain(); }
    createBufferSource() { return new Src(); }
    decodeAudioData(ab, ok) { ok({ duration: 1, numberOfChannels: 2 }); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  return { win: { AudioContext: Ctx, document: { hidden: false, addEventListener() {} }, addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener() {} }, fire: (t) => listeners.get(t)?.() };
}

const URL_CAST = '/assets/audio/sfx/enemy/e_atk/cast.mp3';
const URL_ONE = '/assets/audio/sfx/enemy/e_atk/one.mp3';
const URL_LATE = '/assets/audio/sfx/enemy/e_atk/late.mp3';

async function rig() {
  const fw = fakeWindow();
  const pools = {
    // the shape of 137 of the 141 enemy cast banks (CN audio_data): 2 at once, the oldest giving way
    two: { id: 'two', maxSoundAllowed: 2, popOldest: true, sounds: { 'enemy/e_atk/cast.mp3': { minPitch: 1, maxPitch: 1, delay: 0 } } },
    // max 1 without popOldest: the new one is dropped while one plays
    one: { id: 'one', maxSoundAllowed: 1, popOldest: false, sounds: { 'enemy/e_atk/one.mp3': { minPitch: 1, maxPitch: 1, delay: 0 } } },
    // a file with an official delay (as acdums_audio[passion][delay]: 0.7 s; 0.06 s here)
    late: { id: 'late', maxSoundAllowed: 1, popOldest: true, sounds: { 'enemy/e_atk/late.mp3': { minPitch: 1, maxPitch: 1, delay: 0.06 } } },
  };
  const units = {
    enemy_c: { casts: { 0: { pk: 'Boom', start: [{ url: URL_CAST, pool: 'two' }] }, 1: { pk: 'Solo', start: [{ url: URL_ONE, pool: 'one' }] } } },
    enemy_l: { fxSounds: { 'sound|late': { url: URL_LATE, pool: 'late' } } },
  };
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: {}, pools, units } } };
  const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
  a.install();
  fw.fire('pointerdown');
  await wait(10);
  const crowd = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, kind: 'enemy', side: 'enemy', defId: 'enemy_c', spine: 'enemy_c' }));
  a.setFieldUnits([...crowd, { id: 200, kind: 'enemy', side: 'enemy', defId: 'enemy_l', spine: 'enemy_l' }]);
  await wait(10);
  const requested = [];
  const buffer = a._buffer.bind(a);
  a._buffer = (url) => { requested.push(String(url).split('/').pop()); return buffer(url); };
  return { a, requested };
}

test('a crowd of 10 casting together: every cast plays, the bank\'s own cap holds (2, the oldest giving way)', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const { a, requested } = await rig();
    a.handleBattleEvents(Array.from({ length: 10 }, (_, i) => ['cast', 100 + i, 0]));
    await wait(20);
    assert.equal(requested.filter((u) => u === 'cast.mp3').length, 10, 'no gap: each of the 10 casts plays');
    assert.equal(a.stingVoices.get('two')?.length, 2, 'two copies ring, the 8 older ones were cut (popOldest)');
    // the same crowd's other skill: a max-1 bank without popOldest keeps the first and drops the rest
    a.handleBattleEvents(Array.from({ length: 10 }, (_, i) => ['cast', 100 + i, 1]));
    await wait(20);
    assert.equal(a.stingVoices.get('one')?.length, 1, 'max 1, no popOldest: the first plays, the other 9 are dropped');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('a file\'s official delay holds it back on the audio clock before it takes its bank\'s place', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const { a } = await rig();
    a.handleBattleEvents([['fx', 'sound', 5, 5, { id: 200, kind: 'late' }]]);
    await wait(25);
    assert.equal(a.stingVoices.get('late')?.length ?? 0, 0, 'still waiting its 0.06 s');
    await wait(80);
    assert.equal(a.stingVoices.get('late')?.length, 1, 'then it plays');
    // a field change drops a delay still in flight
    a.handleBattleEvents([['fx', 'sound', 5, 5, { id: 200, kind: 'late' }]]);
    a.setFieldUnits([]);
    a.stingVoices.clear();
    await wait(100);
    assert.equal(a.stingVoices.get('late')?.length ?? 0, 0, 'the old field\'s delayed sound never starts');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('no remake gap of its own in the enemy cast path', () => {
  const src = readFileSync(new URL('../public/js/audio.js', import.meta.url), 'utf8');
  assert.ok(!/CAST_PART_GAP_MS|castPartAt/.test(src), 'CAST_PART_GAP_MS is gone');
});
