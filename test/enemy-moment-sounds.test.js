// test/enemy-moment-sounds.test.js — (fork, enemy sound audit job 3) enemy moment sounds: the generator's tables
// (tools/assets/plan.mjs ENEMY_FX_SOUND_BANKS / ENEMY_KEY_SOUND_BANKS / ENEMY_MODE_ATTACK_BANKS → sfx.units[id].fxSounds /
// keySounds / attacks by mode) in the shipped manifest, and the client playing them (public/js/audio.js _fxSound →
// _enemyMoment, a cast's moment, fxKey, the 'mode' fx): knock-outs and stand-ups, held loops, Mudrock's tiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioManager } from '../public/js/audio.js';

const A = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
const U = A.audio.sfx.units;
const file = (u) => String(u).split('/').pop();

test('the manifest: moment sounds of the revives, Zaaro\'s held loop, the effect-key sounds and Mudrock\'s tiers', () => {
  const z = U.enemy_1535_wlfmster.fxSounds;
  assert.equal(file(z['telegraph|reborn'].url), 'e_skill_wlfmsterdie.mp3');
  assert.equal(file(z['telegraph|reborn'].loop), 'e_skill_wlfmsterdieloop.mp3');
  assert.equal(file(z['revive|reborn'].url), 'e_skill_wlfmsterreborn.mp3');
  assert.equal(z['revive|reborn'].endLoop, true);
  for (const id of ['enemy_1288_duskls', 'enemy_1288_duskls_2', 'enemy_1292_duskld']) {
    assert.equal(file(U[id].fxSounds['ember|husk'].url), 'e_skill_skeletonreborn.mp3', id);
    assert.equal(file(U[id].fxSounds['revive|revived'].url), 'e_atk_reborn_n.mp3', id);
  }
  assert.equal(file(U.enemy_9012_acloon.fxSounds['yanyouFlame|'].loop), 'e_atk_frlgblcklp.mp3');
  assert.equal(file(U.enemy_10138_xdsnow.keySounds.enemy_xdsnow_die_01.url), 'e_imp_ltlswal.mp3');
  assert.deepEqual(Object.keys(U.enemy_1511_mdrock.attacks).sort(), ['4', '5']);
  assert.equal(file(U.enemy_1511_mdrock.attacks[5]), 'e_skill_hugeaxe_cast.mp3');
  assert.equal(file(U.enemy_1511_mdrock.hits[4]), 'e_imp_bigaxe_d.mp3');
  // every entry plays something: a sound, a loop or a loop's end
  for (const [id, u] of Object.entries(U)) {
    for (const [k, e] of Object.entries(u.fxSounds || {})) if (id.startsWith('enemy_')) assert.ok(e.url || e.loop || e.endLoop, `${id} ${k}`);
  }
});

function fakeWindow() {
  const listeners = new Map();
  class Param { constructor() { this.value = 1; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { connect() {} disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Src extends Node { constructor() { super(); this.playbackRate = new Param(); } start() {} stop() {} }
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
    createGain() { return new Gain(); }
    createBufferSource() { return new Src(); }
    decodeAudioData(ab, ok) { ok({ duration: 1 }); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  return { win: { AudioContext: Ctx, document: { hidden: false, addEventListener() {} }, addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener() {} }, fire: (t) => listeners.get(t)?.() };
}

test('the client: moments play on their pools, a held loop starts / ends / times out, a cast\'s moment, an effect key, the tier mode', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const pool = { maxSoundAllowed: 4, popOldest: true, sounds: {} };
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: {}, pools: { p: pool },
    units: {
      enemy_w: { attack: '/s/atk.mp3', fxSounds: {
        'telegraph|reborn': { url: '/s/die.mp3', pool: 'p', loop: '/s/dieloop.mp3' },
        'revive|reborn': { url: '/s/reborn.mp3', pool: 'p', endLoop: true },
        'cast|cannon': { url: '/s/emit.mp3', pool: 'p' },
        'explode|clearSp': { url: '/s/clear.mp3', pool: 'p', also: [{ url: '/s/clear2.mp3', pool: 'p' }] },
      }, casts: { 0: { pk: 'Cannon', start: [{ url: '/s/caststart.mp3', pool: 'p' }] } }, keySounds: { enemy_w_hit: { url: '/s/keyhit.mp3', pool: 'p' } } },
      enemy_m: { attack: '/s/plain.mp3', attacks: { 4: '/s/tier4.mp3' } },
      enemy_y: { fxSounds: { 'yanyouFlame|': { loop: '/s/flame.mp3', hold: 0.05 } } },
    } } } };
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    a.setFieldUnits([{ id: 1, kind: 'enemy', side: 'enemy', defId: 'enemy_w', spine: 'enemy_w' },
      { id: 2, kind: 'enemy', side: 'enemy', defId: 'enemy_m', spine: 'enemy_m' },
      { id: 3, kind: 'token', side: 'ally', defId: 'enemy_y', spine: 'enemy_y' }]);
    const requested = [];
    const buffer = a._buffer.bind(a);
    a._buffer = (url) => { requested.push(file(url)); return buffer(url); };
    const run = async (ev) => { requested.length = 0; a.castPartAt.clear(); a.handleBattleEvents(ev); await new Promise((r) => setTimeout(r, 10)); return [...requested]; };

    assert.deepEqual(await run([['fx', 'telegraph', 5, 5, { id: 1, kind: 'reborn', form: 'reborn' }]]), ['die.mp3', 'dieloop.mp3'], 'the knock-out and its loop');
    assert.ok(a.stingLoops.has(1), 'the loop holds');
    assert.deepEqual(await run([['fx', 'revive', 5, 5, { id: 1, kind: 'reborn', form: 'form2' }]]), ['reborn.mp3'], 'the stand-up');
    assert.ok(!a.stingLoops.has(1), 'the stand-up ends the loop');
    assert.deepEqual(await run([['fx', 'telegraph', 5, 5, { id: 1, kind: 'reborn' }], ['die', 1]]).then(() => a.stingLoops.has(1)), false, 'death ends it too');
    assert.deepEqual(await run([['cast', 1, 0]]), ['caststart.mp3', 'emit.mp3'], "the cast's start and its moment ('cast|<pk>')");
    assert.deepEqual(await run([['fx', 'explode', 5, 5, { id: 1, kind: 'clearSp' }]]), ['clear.mp3', 'clear2.mp3'], 'several banks of one moment');
    assert.deepEqual(await run([['fx', 'explode', 5, 5, { id: 1, kind: 'other' }]]), [], 'no entry: silent');
    requested.length = 0; a.castPartAt.clear();
    a.fxKey('enemy_w_hit');
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(requested, ['keyhit.mp3'], "an effect key's own sound");

    // Mudrock: a 'mode' with sounds of its own makes its attacks that mode's; one without keeps the plain ones
    a.handleBattleEvents([['fx', 'mode', 5, 5, { id: 2, n: 4 }]]);
    assert.equal(a.units.get(2).heldAttack, 4);
    a.handleBattleEvents([['fx', 'mode', 5, 5, { id: 2, n: 3 }]]);
    assert.equal(a.units.get(2).heldAttack, null);

    // an ally built from an enemy record (炎佑): its flame ticks hold the loop; it stops `hold` s after the last one
    await run([['fx', 'yanyouFlame', 5, 5, { id: 3, target: 1, dur: 1 }]]);
    assert.ok(a.stingLoops.has(3), 'the flame loop runs');
    await run([['fx', 'yanyouFlame', 5, 5, { id: 3, target: 1, dur: 1 }]]);
    assert.ok(a.stingLoops.has(3), 'still running: one loop, refreshed');
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(!a.stingLoops.has(3), 'it stops after its hold');
  } finally {
    globalThis.fetch = origFetch;
  }
});
