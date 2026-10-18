// (fork) The official MainMixer (public/js/audioMixer.js): its tree and levels, the routing of every sound to its bank's
// group (manifest), the sliders on the control groups and the voice duck on FX_Battle_Normal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AudioMixer, MIXER_GROUPS, MIXER_COMPRESSORS, dbToGain, duckReduction, VOICE_DUCK, MONO_3D_DB, spatialGain, SONG_DUCK, songGain } from '../../public/js/audioMixer.js';
import { bankPool } from '../../tools/assets/audio.mjs';
import { AudioManager } from '../../public/js/audio.js';

const manifest = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));

function fakeCtx() {
  const nodes = [];
  class Param { constructor(v = 1) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { constructor(kind) { this.kind = kind; this.to = []; nodes.push(this); } connect(n) { this.to.push(n); } disconnect() { this.to = []; } }
  return {
    nodes, currentTime: 0, state: 'running', destination: new Node('dest'),
    createGain() { const n = new Node('gain'); n.gain = new Param(); return n; },
    createDynamicsCompressor() { const n = new Node('comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0); return n; },
    createAnalyser() { const n = new Node('analyser'); n.fftSize = 1024; n.getFloatTimeDomainData = (b) => b.fill(n.level ?? 0); return n; },
    createBufferSource() { const n = new Node('src'); n.playbackRate = new Param(); n.start = () => {}; n.stop = () => {}; return n; },
  };
}

/** Sum of the gains (dB) from `node` to the destination along the first connection of each node. */
function pathDb(node, dest) {
  let db = 0, n = node;
  for (let i = 0; i < 50 && n !== dest; i++) {
    if (n.kind === 'gain') db += 20 * Math.log10(n.gain.value);
    n = n.to[0];
  }
  assert.equal(n, dest, 'reaches the destination');
  return db;
}

test('the tree: every parent before its children, the official Default levels on the paths', () => {
  const seen = new Set();
  for (const [name, [parent]] of Object.entries(MIXER_GROUPS)) { if (parent) assert.ok(seen.has(parent), name); seen.add(name); }
  const ctx = fakeCtx();
  const m = new AudioMixer(ctx, ctx.destination);
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.02, `${a} ≈ ${b}`);
  // path totals of the extracted mixer (memory: official-audio-mixer), master +0.14 included
  near(pathDb(m.input('Music'), ctx.destination), 0.14 - 7.67);
  near(pathDb(m.input('Voice'), ctx.destination), 0.14 - 0.33);
  near(pathDb(m.input('Battle_P_NImp'), ctx.destination), 0.14 - 3.28 - 1.76 - 4.56);
  near(pathDb(m.input('Battle_UI_Boost'), ctx.destination), 0.14 - 3.28 - 3.18 + 2.85);
  near(pathDb(m.input('Battle_P_SAtk'), ctx.destination), 0.14 - 3.28 - 0.70 - 3.51);
  near(pathDb(m.input('UI'), ctx.destination), 0.14 - 3.85);
  // the compressors sit on their groups with the client's thresholds
  for (const [g, c] of Object.entries(MIXER_COMPRESSORS)) {
    const comp = m.groups.get(g).comp;
    assert.equal(comp.kind, 'comp', g);
    assert.equal(comp.threshold.value, c.threshold);
  }
  // an unknown / missing group falls back (battle: FX_Battle_Normal)
  assert.equal(m.input('Nope'), m.input('FX_Battle_Normal'));
  assert.equal(m.input(null, 'UI'), m.input('UI'));
});

test('the voice duck: a line louder than −16.5 dB pushes the normal battle sounds down; none = no reduction', () => {
  assert.equal(duckReduction(-Infinity), 0);
  assert.equal(duckReduction(-30), 0);
  assert.ok(duckReduction(-16.5) > 0, 'inside the soft knee');
  const r = duckReduction(-6);
  assert.ok(Math.abs(r - 10.5 * (1 - 1 / VOICE_DUCK.ratio) * VOICE_DUCK.mix) < 1e-9);
  const ctx = fakeCtx();
  const m = new AudioMixer(ctx, ctx.destination);
  m.analyser.level = 0.5; // ≈ −6 dB RMS
  m.voiceStart(); m._duckTick();
  assert.ok(Math.abs(m.groups.get('FX_Battle_Normal').duck.gain.value - dbToGain(-duckReduction(20 * Math.log10(0.5)))) < 1e-6);
  m.voiceEnd(); m._duckTick();
  assert.equal(m.groups.get('FX_Battle_Normal').duck.gain.value, 1, 'back up once no line plays');
  assert.equal(m.duckTimer, null, 'stops polling');
  m.dispose();
});

test('every group the manifest names exists in the tree; 丰川祥子\'s banks on their official groups', () => {
  const s = manifest.audio.sfx;
  const names = new Set([...Object.values(s.pools).map((p) => p.group), ...Object.values(s.groups.ui), ...Object.values(s.groups.battle)]);
  for (const u of Object.values(s.units)) for (const g of [...Object.values(u.groups || {}), ...Object.values(u.skillGroups || {})]) names.add(g);
  for (const g of names) if (g) assert.ok(MIXER_GROUPS[g], g);
  const u = s.units.char_4182_oblvns;
  assert.equal(s.pools[u.notes.attack.hitPool].group, 'Battle_P_NImp');
  assert.equal(s.pools[u.notes.talent.bornPool].group, 'Battle_P_NAtk');
  assert.equal(s.pools[u.notes.s3_phy.hitPool].group, 'Battle_P_SImp');
  assert.equal(s.pools[u.stings[0].pool].group, 'Battle_P_SAtk');
  assert.equal(s.pools[u.stings[1].pool].group, 'Battle_UI_Boost');
  assert.equal(s.pools[u.stings[2].pool].group, 'Battle_UI_Boost');
  assert.equal(u.stings[2].loopGroup, 'Battle_P_SAtk');
  assert.equal(s.groups.battle.deploy, 'Battle_UI_Important');
  assert.equal(s.groups.battle.enemyHit, 'Battle_E_NImp');
});

test('AudioManager: the sliders drive the control groups; a sound connects to its bank\'s group', async () => {
  const ctx = fakeCtx();
  const win = { AudioContext: function () { return ctx; }, document: { hidden: false, addEventListener() {} }, addEventListener() {}, removeEventListener() {} };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  ctx.decodeAudioData = (ab, ok) => ok({ duration: 0.5 });
  ctx.resume = () => Promise.resolve();
  try {
    const a = new AudioManager({ win, getManifest: () => manifest, random: () => 0.5 });
    a._unlock();
    a.setVolumes({ bgm: 0.5, sfx: 0.5, voice: 1 });
    assert.equal(a.mixer.groups.get('Music_Control').in.gain.value, 0.25);
    assert.equal(a.mixer.groups.get('FX_Battle_Control').in.gain.value, 0.25);
    assert.equal(a.mixer.groups.get('FX_UI_Control').in.gain.value, 0.25);
    assert.equal(a.mixer.groups.get('Voice_Control').in.gain.value, 1);
    const u = manifest.audio.sfx.units.char_4182_oblvns;
    a.setFieldUnits([{ id: 1, side: 'ally', kind: 'op', spine: 'char_4182_oblvns', defId: 'char_4182_oblvns', skillIndex: 0 }]);
    a.handleBattleEvents([['fx', 'note', 0, 0, { owner: 1, look: 'attack', on: 'hit' }]]);
    a.sfx('buy');
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    const into = (g) => ctx.nodes.filter((n) => n.kind === 'gain' && n.to.includes(a.mixer.input(g)));
    assert.equal(into('Battle_P_NImp').length, 1, 'her note hit on Battle_P_NImp');
    assert.equal(into('Battle_UI_Important').length, 1, 'the buy cue on its bank\'s Battle_UI_Important');
    assert.ok(typeof u.notes.attack.hit === 'string');
    a.mixer.dispose();
  } finally { globalThis.fetch = origFetch; }
});

test('a mono clip of a 3D bank plays MONO_3D_DB lower; stereo clips and 2D banks keep their level', () => {
  assert.equal(MONO_3D_DB, -3);
  assert.equal(spatialGain(true, 1), dbToGain(-3));
  assert.equal(spatialGain(true, 2), 1);
  assert.equal(spatialGain(false, 1), 1);
  assert.equal(spatialGain(undefined, 1), 1);
  const s = (is2D) => ({ asset: 'Audio/Sound_Beta_2/Player/p_atk/x', is2D, minPitch: 1, maxPitch: 1, delay: 0 });
  assert.equal(bankPool({ name: 'a', sounds: [s(false)] }).spatial, true);
  assert.equal(bankPool({ name: 'b', sounds: [s(true)] }).spatial, undefined);
  // the manifest carries the flag: Sakiko's notes are 3D, her S3 start sting (is2D) is not
  const P = manifest.audio.sfx.pools;
  assert.equal(P['battle.ON_PROJECTILE_HIT.projectile_chr_oblvns'].spatial, true);
  assert.equal(P['battle.ON_ABILITY_ON.char_4182_oblvns.attack.0.1'].spatial, true);
  assert.equal(P['battle.ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]'].spatial, undefined);
});

test('the song duck (fork): the battle groups step back while a song plays, the song and the alerts keep their level', () => {
  const ctx = fakeCtx();
  const m = new AudioMixer(ctx, ctx.destination);
  const hit = m.input('Battle_P_NImp'), sAtk = m.input('Battle_P_SAtk'), boost = m.input('Battle_UI_Boost'), music = m.input('Music');
  const before = [hit, sAtk, boost, music].map((n) => pathDb(n, ctx.destination));
  m.songStart(); m.songStart();
  const during = [hit, sAtk, boost, music].map((n) => pathDb(n, ctx.destination));
  assert.ok(Math.abs(during[0] - before[0] - SONG_DUCK.db) < 1e-9, 'normal hits down');
  assert.ok(Math.abs(during[1] - before[1] - SONG_DUCK.db) < 1e-9, 'skill attacks down');
  assert.equal(during[2], before[2], 'stings (Battle_UI_Boost) keep their level');
  assert.equal(during[3], before[3], 'music keeps its level');
  m.songEnd();
  assert.ok(Math.abs(pathDb(hit, ctx.destination) - during[0]) < 1e-9, 'held while another song plays');
  m.songEnd(); m.songEnd();
  assert.ok(Math.abs(pathDb(hit, ctx.destination) - before[0]) < 1e-9, 'back once the last one ends');
  // a song on a ducked group (魔王 S3 on Battle_P_SAtk) bypasses the duck at the same level
  const song = m.songInput('Battle_P_SAtk');
  assert.ok(Math.abs(pathDb(song, ctx.destination) - before[1]) < 1e-9, 'same level as its group');
  m.songStart();
  assert.ok(Math.abs(pathDb(song, ctx.destination) - before[1]) < 1e-9, 'never ducks itself');
  assert.equal(m.songInput('Independent'), m.input('Independent'), 'a group outside the duck: its own input');
  // the split: −3 dB on the battle, +3 dB on the song = the song 6 dB over the battle
  assert.equal(SONG_DUCK.db, -3); assert.equal(SONG_DUCK.boost, 3);
  assert.ok(Math.abs(20 * Math.log10(songGain()) - 3) < 1e-9);
  m.dispose();
});
