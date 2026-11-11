// (fork) Effects follow their ability's playback speed, as the client does (GameAssembly of 2026-09-13, disassembled):
// Effect._PlayInternal / _LimitedPlaybackSpeed caps the speed at `_limitedPlaybackSpeed` / Time.timeScale (−1 = no cap) and
// waits `_delayToPlay` / speed; with `_usePlaybackSpeed` ParticleEffect.UpdatePlaybackSpeed runs the systems, clips and
// FxDelay nodes at that speed. The attack's speed is its clip's (AbstractAnimatedAbility.UpdatePlaybackSpeed:
// 1 / clamp(interval / clip length, 0.1, 2.5)).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compileEffect, Effect } from '../../public/js/render/vfx/effect.js';
import { OfficialFx } from '../../public/js/render/vfx/system.js';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { SpineActor, ABILITY_MAX_ANIM_SCALE } from '../../public/js/render/spine.js';

const MAT = {
  name: 'm', shader: 'Torappu/Particles/Additive', passes: [{ blend: ['SrcAlpha', 'One', 'Zero', 'OneMinusSrcAlpha'], blendOp: 'Add', zTest: 'Disabled', zWrite: false, cull: 'Off', colorMask: 15 }],
  queue: 'Transparent', keywords: [], floats: { _MainTexChannel: 0 }, colors: { _TintColor: [1, 1, 1, 1] }, textures: { _MainTex: { tex: 't', st: [1, 1, 0, 0] } },
};
const psNode = (id, parent, o = {}) => ({
  id, name: `ps${id}`, parent, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1],
  particleSystem: { lengthInSec: 0.5, looping: false, prewarm: false, startDelay: 0, playOnAwake: true, simulationSpeed: 1, moveWithTransform: 0, scalingMode: 1,
    InitialModule: { startLifetime: o.life ?? 0.3, startSpeed: 0, startSize: 1, startColor: [1, 1, 1, 1], maxNumParticles: 100 },
    EmissionModule: { rateOverTime: 0, m_Bursts: [{ time: 0, countCurve: 2, cycleCount: 1, repeatInterval: 0.01, probability: 1 }] } },
  particleSystemRenderer: { m_Enabled: true, renderMode: 'billboard', renderAlignment: 'view', materials: [0, null], m_SortingOrder: 0 },
  behaviours: o.behaviours || [],
});
function desc(nodes, extra = {}) {
  for (const n of nodes) if (n.parent != null) nodes[n.parent].children.push(n.id);
  return { format: 'fx-prefab', version: 1, key: 'test', nodes, materials: [MAT], clips: [], textures: ['t'], meshes: [], refs: [], stats: {}, ...extra };
}
const root = (behaviours = []) => ({ id: 0, name: 'root', parent: null, children: [], active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], behaviours });
const pe = (fields) => ({ class: 'ParticleEffect', enabled: true, fields: { _delayToPlay: 0, _delayToFinish: 0, _maxLifetime: -1, _isLoop: 0, _rotateType: 0, _spawnLocation: 2, _inactiveOnFinish: [], ...fields } });
const delayed = (d) => [{ class: 'FxDelay', enabled: true, fields: { _delayTime: d } }];
function runUntil(fx, seconds, dt = 1 / 60) { for (let t = 0; t < seconds - 1e-9 && !fx.done; t += dt) fx.update(dt); return fx; }

describe('Effect.setPlayback (Effect._PlayInternal)', () => {
  test('reads `_usePlaybackSpeed` / `_limitedPlaybackSpeed` from the prefab (none: off, −1)', () => {
    const on = compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: 2 })]), psNode(1, 0)]));
    assert.equal(on.usePlaybackSpeed, true);
    assert.equal(on.limitedPlaybackSpeed, 2);
    const off = compileEffect(desc([root([pe({})]), psNode(1, 0)]));
    assert.equal(off.usePlaybackSpeed, false);
    assert.equal(off.limitedPlaybackSpeed, -1);
  });

  test('with `_usePlaybackSpeed` its FxDelay nodes wait delay / speed', () => {
    // Mostima's S3 wave: FxDelay 0.8 s on the root, `_usePlaybackSpeed` 1, cap 2
    const def = compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: 2 })]), psNode(1, 0, { behaviours: delayed(0.8) })]));
    const fast = new Effect(def, { seed: 1 }).setPlayback(2, 1);
    assert.equal(fast.speed, 2);
    runUntil(fast, 0.38);
    assert.equal(fast.hier[1], 0, 'not before 0.4 s');
    runUntil(fast, 0.04);
    assert.equal(fast.hier[1], 1, 'at 0.8 / 2 = 0.4 s');
    const plain = new Effect(def, { seed: 1 });
    runUntil(plain, 0.5);
    assert.equal(plain.hier[1], 0, 'at 1× it still waits 0.8 s');
  });

  test('the cap: `_limitedPlaybackSpeed` / battle speed; −1 = none', () => {
    const capped = compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: 2 })]), psNode(1, 0)]));
    assert.equal(new Effect(capped, { seed: 1 }).setPlayback(3, 1).speed, 2, 'capped at 2');
    assert.equal(new Effect(capped, { seed: 1 }).setPlayback(3, 2).speed, 1, 'at 2× battle speed the cap is 2 / 2 = 1 of the battle clock');
    assert.equal(new Effect(capped, { seed: 1 }).setPlayback(0.5, 2).speed, 0.5, 'a slow attack is not raised');
    const free = compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: -1 })]), psNode(1, 0)]));
    assert.equal(new Effect(free, { seed: 1 }).setPlayback(3, 2).speed, 3);
  });

  test('without `_usePlaybackSpeed` only `_delayToPlay` follows the speed; the content runs at 1×', () => {
    const def = compileEffect(desc([root([pe({ _delayToPlay: 0.4, _limitedPlaybackSpeed: -1 })]), psNode(1, 0, { behaviours: delayed(0.2) })]));
    const fx = new Effect(def, { seed: 1 }).setPlayback(2, 1);
    assert.equal(fx.speed, 1);
    runUntil(fx, 0.18);
    assert.equal(fx.started, false, 'the play delay is 0.4 / 2 = 0.2 s');
    runUntil(fx, 0.04);
    assert.equal(fx.started, true);
    runUntil(fx, 0.15);
    assert.equal(fx.hier[1], 0, 'its FxDelay still waits its full 0.2 s');
    runUntil(fx, 0.06);
    assert.equal(fx.hier[1], 1);
  });

  test('with `_usePlaybackSpeed` the play delay is delay / speed too, and particles age at that speed', () => {
    const def = compileEffect(desc([root([pe({ _delayToPlay: 0.4, _usePlaybackSpeed: 1, _limitedPlaybackSpeed: -1 })]), psNode(1, 0, { life: 0.6 })]));
    const fx = new Effect(def, { seed: 1 }).setPlayback(2, 1);
    runUntil(fx, 0.18);
    assert.equal(fx.started, false);
    runUntil(fx, 0.04);
    assert.equal(fx.sys[1].count, 2);
    runUntil(fx, 0.32);
    assert.equal(fx.sys[1].count, 0, 'a 0.6 s particle is gone after 0.3 battle s at 2×');
  });

  test('the cap (ttl) and the `_delayToFinish` linger stay on the battle clock', () => {
    const def = compileEffect(desc([root([pe({ _delayToFinish: 0.4, _usePlaybackSpeed: 1, _limitedPlaybackSpeed: -1 })]), psNode(1, 0)]));
    const fx = new Effect(def, { seed: 1 }).setPlayback(2, 1);
    runUntil(fx, 0.27);
    assert.equal(fx.state, 'linger', 'the 0.5 s system ends after 0.25 battle s');
    runUntil(fx, 0.3);
    assert.equal(fx.done, false, 'the linger is 0.4 battle s, not 0.2');
    runUntil(fx, 0.1);
    assert.ok(fx.done);
    const capped = new Effect(compileEffect(desc([root([pe({ _isLoop: 1, _usePlaybackSpeed: 1, _limitedPlaybackSpeed: -1 })]), psNode(1, 0)])), { seed: 1 }).setPlayback(4, 1);
    capped.ttl = 0.5;
    runUntil(capped, 0.3);
    assert.equal(capped.state, 'play', 'its ttl counts battle s (0.3 < 0.5), not content s (1.2)');
  });

  test('reset (a pooled effect) plays at 1× again', () => {
    const def = compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: -1 })]), psNode(1, 0)]));
    const fx = new Effect(def, { seed: 1 }).setPlayback(3, 1);
    runUntil(fx, 0.1);
    fx.reset(2);
    assert.equal(fx.speed, 1);
    assert.equal(fx.age, 0);
  });
});

describe('the speed reaches the effect', () => {
  const wave = () => compileEffect(desc([root([pe({ _usePlaybackSpeed: 1, _limitedPlaybackSpeed: 2 })]), psNode(1, 0, { behaviours: delayed(0.8) })], { key: 'wave' }));
  const sys = (rate) => {
    const defs = new Map([['wave', wave()]]);
    const lib = { available: true, defs, has: (k) => defs.has(k), def: (k) => defs.get(k) || null, load: async (k) => defs.get(k) || null };
    return new OfficialFx({ P: { Container: class {} }, renderer: null, cam: () => null, lib, tier: 'full', rate: () => rate });
  };

  test('FxHandle applies opts.speed with the battle speed, before the lead (which counts in the effect\'s own time)', () => {
    assert.equal(sys(1).spawn('wave', { pos: [0, 0, 0] }, { speed: 3 }).effect.speed, 2);
    assert.equal(sys(2).spawn('wave', { pos: [0, 0, 0] }, { speed: 3 }).effect.speed, 1);
    assert.equal(sys(1).spawn('wave', { pos: [0, 0, 0] }, {}).effect.speed, 1, 'no ability: 1×');
    const led = sys(1).spawn('wave', { pos: [0, 0, 0] }, { speed: 2, lead: 0.3 }).effect;
    assert.ok(Math.abs(led.delayLead - 0.6) < 1e-9, '0.3 battle s of cast = 0.6 s of a 2× effect');
  });

  test('SpineActor.abilitySpeed: 1 / clamp(interval / clip, 0.1, _maxAnimScale) of the attack clip, else the skill attack clip', () => {
    const actor = (o) => ({ _attackBase: () => (o.clip ? { loop: o.clip } : null), _shot: (n) => n, dur: () => o.dur, skillOn: !!o.skill, skillAttackMode: () => (o.skill ? { animKey: o.skill } : null) });
    const sp = (o, iv) => SpineActor.prototype.abilitySpeed.call(actor(o), iv);
    assert.equal(sp({ clip: 'Attack', dur: 1 }, 0.5), 2);
    assert.equal(ABILITY_MAX_ANIM_SCALE, 1);
    assert.equal(sp({ clip: 'Attack', dur: 1 }, 4), 1, 'a slow attack: the clip is not stretched past `_maxAnimScale` 1, its effects stay 1×');
    assert.equal(sp({ clip: 'Attack', dur: 1 }, 0.05), 10, 'a very fast one: the scale floor 0.1');
    assert.equal(sp({ skill: 'Skill_3_Loop', dur: 1.2 }, 0.6), 2, 'a skill whose loop has no strike: its attack clip');
    assert.equal(sp({ dur: 1 }, 0.5), 1, 'no clip known');
    assert.equal(sp({ clip: 'Attack', dur: 1 }, NaN), 1, 'no interval');
    const spm = (o, iv, m) => SpineActor.prototype.abilitySpeed.call(actor(o), iv, m);
    assert.equal(spm({ clip: 'Attack', dur: 1 }, 4, 2), 0.5, 'the unit\'s own `_maxAnimScale` 2: slowed to 1 / 2');
    assert.equal(spm({ clip: 'Attack', dur: 1 }, 4, -1), 0.25, '−1: no cap');
    assert.equal(spm({ clip: 'Attack', dur: 1 }, 0.5, 1), 2, 'a cap never limits a fast attack');
  });

  test('FxWiring.abilitySpeed asks the actor with the unit\'s attack interval and its data cap; 1 without one', () => {
    const w = Object.create(FxWiring.prototype);
    w.opts = { record: (info) => (info.defId === 'x' ? { attackAnim: { maxScale: -1 } } : null) };
    let got = null;
    assert.equal(w.abilitySpeed({ atkInterval: 0.5, info: { defId: 'x' }, actor: { abilitySpeed: (iv, m) => { got = m; return 1 / iv; } } }), 2);
    assert.equal(got, -1, 'the record\'s attackAnim.maxScale');
    assert.equal(w.abilitySpeed({ atkInterval: 0.5 }), 1);
    assert.equal(w.abilitySpeed(null), 1);
  });
});
