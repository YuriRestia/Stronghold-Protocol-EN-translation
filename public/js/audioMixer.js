// (fork) The official Arknights MainMixer, rebuilt in Web Audio (owner 2026-10-18: "apply the official mix").
//
// Source: the CN client's sharedassets1.assets, AudioMixerController "MainMixer" (38 groups, 6 snapshots), Default
// snapshot. Every sound bank of excel/audio_data.json names the group it plays on (`customMixerGroup`); the asset plan
// carries it into the manifest (sfx.pools[id].group, sfx.units[id].groups / skillGroups, sfx.groups.ui / .battle), and
// AudioManager connects each sound to `mixer.input(group)` instead of one flat SFX gain.
//
// Kept: the group tree with each group's volume (dB, relative to its parent), the two compressors (FX_Battle_Normal,
// Battle_Skill_Important) and the Duck Volume on FX_Battle_Normal whose sidechain is the Voice group (an operator's
// line pushes the normal battle sounds down). The settings sliders drive the three `~…_VolumeControl` groups.
// Left out: the Lowpass 22000 Hz / dry reverb (no-ops in Default), the Fx_BattlenoUI underwater bus (its sends sit at
// −80 dB outside the Underwater_noUI snapshot), the snapshots (none is used by this mode), Music's Duck Volume (its
// sidechain is the gacha Cards_Pad group only).

/** dB → linear gain. */
export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Group → [parent, volume dB] (Default snapshot). The client has two groups named `~FX_VolumeControl` (one over the UI
 * groups, one over the battle sounds); here they are FX_UI_Control / FX_Battle_Control.
 */
export const MIXER_GROUPS = Object.freeze({
  Master: [null, 0.14],
  FX_UI_Control: ['Master', 0],
  Independent: ['FX_UI_Control', -5.72],
  Independent_2: ['FX_UI_Control', -5.72],
  SFX_UI: ['FX_UI_Control', -3.85],
  UI: ['SFX_UI', 0],
  UI_Cards: ['SFX_UI', 0],
  Cards_Pad: ['UI_Cards', 7.23],
  Cards_NotPad: ['UI_Cards', 0],
  BattleGameSound: ['Master', 0],
  Music_Control: ['BattleGameSound', 0],
  Music: ['Music_Control', -7.67],
  Voice_Control: ['BattleGameSound', 0],
  Voice: ['Voice_Control', -0.33],
  UI_Vox: ['Voice_Control', -6.56],
  FX_Battle_Control: ['BattleGameSound', 0],
  SFX_Battle: ['FX_Battle_Control', -3.28],
  FX_Battle_Normal: ['SFX_Battle', -1.76],
  Battle_P_NAtk: ['FX_Battle_Normal', -4.26],
  Battle_P_NImp: ['FX_Battle_Normal', -4.56],
  Battle_E_NAtk: ['FX_Battle_Normal', -10.87],
  Battle_E_NImp: ['FX_Battle_Normal', -8.84],
  Battle_P_Field: ['FX_Battle_Normal', -6.56],
  FX_Battle_Important: ['SFX_Battle', -3.18],
  Battle_UI_Important: ['FX_Battle_Important', 2.09],
  Battle_Skill_Important: ['FX_Battle_Important', -0.17],
  Battle_UI_Boost: ['FX_Battle_Important', 2.85],
  FX_Battle_Boss: ['SFX_Battle', 0],
  Battle_BE_NImp: ['FX_Battle_Boss', -6.56],
  Battle_BE_NAtk: ['FX_Battle_Boss', -6.13],
  FX_Battle_SAtk: ['SFX_Battle', -0.70],
  Battle_P_SAtk: ['FX_Battle_SAtk', -3.51],
  Battle_P_SImp: ['FX_Battle_SAtk', -5.32],
  Battle_E_SAtk: ['FX_Battle_SAtk', -7.44],
  Battle_E_SImp: ['FX_Battle_SAtk', -6.13],
  FX_Battle_Ambience: ['SFX_Battle', 0],
  Battle_A_Global: ['FX_Battle_Ambience', 0],
});

/**
 * The client's Compressor effects (threshold dB, attack / release ms, make-up 0). [ASSUMED] Unity's Compressor exposes
 * no ratio or knee: ratio 4, hard knee.
 */
export const MIXER_COMPRESSORS = Object.freeze({
  FX_Battle_Normal: { threshold: -10.1, attack: 0.05, release: 0.05 },
  Battle_Skill_Important: { threshold: -1.1, attack: 0.017, release: 0.043 },
});
const COMP_RATIO = 4;

/**
 * A mono clip of a 3D bank (audio_data `is2D: false`; manifest pools[id].spatial) plays this much lower (dB). The client
 * plays those banks with spatialBlend 1 (UnityAudioPlayback._UpdateSoundProperties); its distance rolloff is negligible
 * (linear 1–500 from a listener at the camera), but Unity pans a 3D source between the speakers. [ASSUMED] constant-power
 * pan of a centred source, −3 dB per channel (the pan law sits in Unity's native engine, not in the game code); Web Audio
 * plays a mono buffer at full level on both. Stereo clips and 2D banks keep their level.
 */
export const MONO_3D_DB = -3;
/** The gain for a buffer of `channels` channels on a bank with `spatial` set (MONO_3D_DB). */
export const spatialGain = (spatial, channels) => (spatial && channels === 1 ? dbToGain(MONO_3D_DB) : 1);

/**
 * (fork, owner 2026-10-18 — a deliberate deviation, NOT in the client) While a song plays (the Fever song, a bard
 * skill's singing: AudioManager SONG_SKILLS) the song carries over the battle: these groups go down by `db` (attack /
 * release s) and the song itself plays `boost` dB louder (AudioManager songGain), split so neither moves far (owner:
 * a 6 dB duck alone made the battle drop too much). Other music, alerts, stings, UI and voices keep their level.
 */
export const SONG_DUCK = Object.freeze({ db: -3, boost: 3, attack: 0.3, release: 1, groups: Object.freeze(['FX_Battle_Normal', 'FX_Battle_SAtk', 'FX_Battle_Boss']) });
/** The song's own gain (SONG_DUCK.boost). */
export const songGain = () => dbToGain(SONG_DUCK.boost);

/** FX_Battle_Normal's Duck Volume, sidechain = the Voice group (thr dB, ratio, attack / release s, knee dB, sc mix). */
export const VOICE_DUCK = Object.freeze({ threshold: -16.5, ratio: 2.58, attack: 0.1, release: 0.3, knee: 10, mix: 0.81 });
const DUCK_POLL_MS = 30;

/**
 * Gain reduction (dB, ≥ 0) of a soft-knee downward compressor for an input `level` (dB). [ASSUMED] Unity's sidechain
 * mix blends the detector between the sidechain and the group's own signal; here it scales the reduction.
 */
export function duckReduction(level, d = VOICE_DUCK) {
  const over = level - d.threshold, k = d.knee / 2, slope = 1 - 1 / d.ratio;
  let r = 0;
  if (over >= k) r = over * slope;
  else if (over > -k) r = ((over + k) ** 2 / (2 * d.knee)) * slope;
  return Math.max(0, r * d.mix);
}

/** Groups the sliders drive: settings key → control group. */
export const CONTROL_GROUPS = Object.freeze({ bgm: ['Music_Control'], voice: ['Voice_Control'], sfx: ['FX_Battle_Control', 'FX_UI_Control'] });

export class AudioMixer {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   */
  constructor(ctx, destination) {
    this.ctx = ctx;
    /** @type {Map<string, { in: GainNode, out: AudioNode, duck?: GainNode, comp?: DynamicsCompressorNode, song?: GainNode }>} */
    this.groups = new Map();
    this.voices = 0;
    this.songs = 0;
    this.duckTimer = null;
    this.duckDb = 0;
    // parents first: MIXER_GROUPS lists every parent before its children
    for (const [name, [parent, db]] of Object.entries(MIXER_GROUPS)) {
      const g = ctx.createGain();
      g.gain.value = dbToGain(db);
      let out = g;
      const node = { in: g, out: g };
      if (name === 'FX_Battle_Normal') {
        node.duck = ctx.createGain();
        out.connect(node.duck); out = node.duck;
      }
      const c = MIXER_COMPRESSORS[name];
      if (c && typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = c.threshold; comp.knee.value = 0; comp.ratio.value = COMP_RATIO;
        comp.attack.value = c.attack; comp.release.value = c.release;
        out.connect(comp); out = comp;
        node.comp = comp;
      }
      if (SONG_DUCK.groups.includes(name)) {
        node.song = ctx.createGain();
        out.connect(node.song); out = node.song;
      }
      node.out = out;
      out.connect(parent ? this.groups.get(parent).in : destination);
      this.groups.set(name, node);
    }
    // the Voice group's level, read while a line plays (the duck's sidechain)
    this.analyser = typeof ctx.createAnalyser === 'function' ? ctx.createAnalyser() : null;
    if (this.analyser) {
      this.analyser.fftSize = 1024;
      this.groups.get('Voice').out.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
    }
  }

  /** The input node of `group`, else of `fallback` (a bank with no group, or a group this tree lacks). */
  input(group, fallback = 'FX_Battle_Normal') {
    return (this.groups.get(group) || this.groups.get(fallback) || this.groups.get('Master')).in;
  }

  /** The slider gain node(s) of a settings channel (CONTROL_GROUPS). */
  controls(kind) {
    return (CONTROL_GROUPS[kind] || []).map((n) => this.groups.get(n).in);
  }

  /** A voice line started / ended: the duck follows the Voice group's level while any plays. */
  voiceStart() {
    this.voices += 1;
    if (!this.analyser || this.duckTimer) return;
    this.duckTimer = setInterval(() => this._duckTick(), DUCK_POLL_MS);
  }

  voiceEnd() {
    this.voices = Math.max(0, this.voices - 1);
  }

  _duckTick() {
    const duck = this.groups.get('FX_Battle_Normal').duck;
    let level = -Infinity;
    if (this.voices > 0) {
      this.analyser.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (const v of this.buf) s += v * v;
      level = 10 * Math.log10(s / this.buf.length || 1e-12);
    }
    const red = duckReduction(level);
    const t = this.ctx.currentTime;
    duck.gain.setTargetAtTime(dbToGain(-red), t, red > this.duckDb ? VOICE_DUCK.attack / 3 : VOICE_DUCK.release / 3);
    this.duckDb = red;
    // nothing playing and back at full level: stop polling
    if (this.voices === 0 && red === 0) { clearInterval(this.duckTimer); this.duckTimer = null; }
  }

  /**
   * Where a song plays when its bank names `group`: the group's own input, unless the group sits under a SONG_DUCK group
   * (魔王 S3's song is on Battle_P_SAtk): then a node with the same levels down to that group, fed past its duck into
   * its parent, so the song never ducks itself (and skips that group's compressor, if it has one).
   */
  songInput(group, fallback = 'FX_Battle_Normal') {
    const name = this.groups.has(group) ? group : fallback;
    let db = 0;
    for (let n = name; n; n = MIXER_GROUPS[n][0]) {
      db += MIXER_GROUPS[n][1];
      if (!SONG_DUCK.groups.includes(n)) continue;
      this.songBypass ??= new Map();
      let g = this.songBypass.get(name);
      if (!g) {
        g = this.ctx.createGain();
        g.gain.value = dbToGain(db);
        g.connect(this.groups.get(MIXER_GROUPS[n][0]).in);
        this.songBypass.set(name, g);
      }
      return g;
    }
    return this.input(name, fallback);
  }

  /** A song started / ended (SONG_DUCK): the battle groups stay down while any plays. */
  songStart() {
    this.songs += 1;
    if (this.songs === 1) this._songRamp(true);
  }

  songEnd() {
    if (this.songs === 0) return;
    this.songs -= 1;
    if (this.songs === 0) this._songRamp(false);
  }

  _songRamp(down) {
    const t = this.ctx.currentTime;
    for (const name of SONG_DUCK.groups) {
      const p = this.groups.get(name)?.song?.gain;
      if (!p) continue;
      p.cancelScheduledValues(t);
      p.setTargetAtTime(down ? dbToGain(SONG_DUCK.db) : 1, t, (down ? SONG_DUCK.attack : SONG_DUCK.release) / 3);
    }
  }

  dispose() {
    clearInterval(this.duckTimer);
    this.duckTimer = null;
  }
}
