// (fork) The official cast → hit order for operators (attack jank, option C, the user's pick of 2026-11-10;
// crew-docs/attack-jank/option-c.md): when an operator's cooldown is over and it has a target, the sim starts a cast
// (['atkCast', id, windUp, targetId], server/sim/ai.js startAllyCast) and lands the attack at the clip's strike frame,
// windUp = hit × clamp(interval / clip, 0.1, 2.5) later (allyCastWindup — the client's AbstractAnimatedAbility
// UpdatePlaybackSpeed); a stun, 缴械 or its targets gone cut it (['atkCancel', id]). The renderer plays the clip from
// its first frame at the cast (render/app/windup.js windCasts → UnitView.castAttack → SpineActor.castAttack).
//
//   node --test test/render/attack-cast-event.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec } from '../helpers/battleHarness.js';
import { createWindUpLookahead } from '../../public/js/render/app/windup.js';
import { allyCastWindup } from '../../server/sim/ai.js';
import { ALLY_ANIM_SCALE_MIN, ALLY_ANIM_SCALE_MAX } from '../../server/sim/constants.js';
import { EV } from '../../shared/protocol.js';
import { isCosmeticEvent } from '../../public/js/render/interp.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const dummy = enemyRec({ key: 'd', hp: 1e7, speed: 0 });
// a guard with no attack clip in its data: the old rule, its attack lands as its cooldown ends
const plain = chessRec({ id: 'plain', skill: null, stats: { bat: 1, atk: 10 } });

/** One operator beside standing enemies: [cast time, wind-up, target], hit times, cancel times. */
function fight({ chessId = 'chess_char_5_07_a', enemies = [{ key: 'd', pos: [10, 4] }], secs = 6, each = null } = {}) {
  const h = makeBattle({ defs: { enemies: { d: dummy }, chess: { plain } }, units: [{ chessId, row: 10, col: 3 }], enemies,
    timeLimit: 30, seed: 7 });
  const u = h.b.allyUnits[0];
  const casts = [], hits = [], cancels = [];
  let seen = 0;
  for (let i = 0; i < secs * 30; i++) {
    h.step();
    h.eventsOf('-');
    for (const e of h.events.slice(seen)) {
      if (e[1] !== u.id) continue;
      if (e[0] === 'atkCast') casts.push([+h.b.time.toFixed(3), e[2], e[3]]);
      if (e[0] === 'atk') hits.push(+h.b.time.toFixed(3));
      if (e[0] === 'atkCancel') cancels.push(+h.b.time.toFixed(3));
    }
    seen = h.events.length;
    if (each) each(h, u, i);
  }
  return { h, u, casts, hits, cancels };
}

test('the official clip scale: the wind-up is the strike frame × clamp(interval / clip, 0.1, 2.5)', () => {
  assert.deepEqual([ALLY_ANIM_SCALE_MIN, ALLY_ANIM_SCALE_MAX], [0.1, 2.5]);
  const u = (dur, hit, interval) => ({ def: { attackAnim: { dur, hit } }, s: { interval } });
  assert.ok(Math.abs(allyCastWindup(u(1.3, 0.4, 1.25)) - 0.4 * 1.25 / 1.3) < 1e-12, 'Surtr: the clip squeezed to his interval');
  assert.ok(Math.abs(allyCastWindup(u(1, 0.5, 2.85)) - 0.5 * 2.5) < 1e-12, 'a slow attack: the clip at most 2.5× longer');
  assert.ok(Math.abs(allyCastWindup(u(2, 1.9, 0.1)) - 0.1) < 1e-12, 'a very fast one: at least ×0.1, never past its interval');
  assert.equal(allyCastWindup({ def: {}, s: { interval: 1 } }), 0, 'no clip known: no wind-up');
  assert.equal(EV.ATK_CAST, 'atkCast');
  assert.equal(EV.ATK_CANCEL, 'atkCancel');
  assert.ok(isCosmeticEvent(['atkCast', 1, 0.4, 2]) && isCosmeticEvent(['atkCancel', 1]));
});

test('Surtr casts as his cooldown ends and the attack lands one wind-up later — the first attack of the fight too', () => {
  const { u, casts, hits } = fight();
  const wind = Math.ceil(allyCastWindup(u) * 30 - 1e-6) / 30;
  assert.ok(casts.length >= 4, `${casts}`);
  assert.equal(casts[0][0], 0.033, 'the first cast: the first tick with the target in range');
  assert.equal(hits[0], +(0.033 + wind).toFixed(3), 'its hit a wind-up later, not on the same tick');
  for (let i = 0; i < hits.length; i++) {
    assert.ok(Math.abs(hits[i] - casts[i][0] - casts[i][1]) < 1e-6, `hit ${i} lands on the announced tick`);
    assert.ok(Math.abs(casts[i][1] - wind) < 1e-9);
  }
  // (times printed to 3 decimals: within a millisecond)
  for (let i = 1; i < casts.length; i++) assert.ok(Math.abs(casts[i][0] - casts[i - 1][0] - Math.ceil(u.s.interval * 30 - 1e-6) / 30) < 2e-3, 'one cast per interval');
});

test('a unit with no attack clip in its data keeps the old rule (no cast, the attack at the end of the cooldown)', () => {
  const { casts, hits } = fight({ chessId: 'plain' });
  assert.equal(casts.length, 0);
  assert.equal(hits[0], 0.033);
});

test('a stun during the wind-up cuts the cast: no hit, ["atkCancel"], the cooldown freed', () => {
  let stunnedAt = null;
  const { casts, hits, cancels, u } = fight({ secs: 3, each: (h, unit, i) => {
    if (i === 3) { h.b.applyStatus(unit, 'stun', { duration: 0.2 }); stunnedAt = h.b.time; }
  } });
  assert.ok(cancels.length >= 1 && cancels[0] >= stunnedAt, `${cancels}`);
  assert.ok(!hits.some((t) => t <= cancels[0]), 'the cut cast never hit');
  assert.ok(casts.length >= 2 && casts[1][0] > cancels[0] && casts[1][0] - cancels[0] < 0.4, 'a new cast once the stun is over, not a whole interval later');
  assert.ok(u.stats.attacks >= 1);
});

test('the target dies during the wind-up: the hit takes another enemy in range; with none left the cast is cut', () => {
  const kill = (h, unit, i) => { if (i === 3 && unit.cast) h.b.kill(unit.cast.targets[0], null); };
  const two = fight({ secs: 1, enemies: [{ key: 'd', pos: [10, 4] }, { key: 'd', pos: [10, 4] }], each: kill });
  assert.ok(two.hits.length >= 1 && two.cancels.length === 0, `${two.hits} / ${two.cancels}`);
  // (a second enemy out of his reach keeps the battle going past the kill)
  const one = fight({ secs: 1, enemies: [{ key: 'd', pos: [10, 4] }, { key: 'd', pos: [10, 9] }], each: kill });
  assert.equal(one.hits.length, 0);
  assert.equal(one.cancels.length, 1);
});

test('a skill that starts during the wind-up: the hit picks its targets again with the skill attack', () => {
  // Surtr's S3 strikes every enemy of its range; the cast under way locked one (no skill yet)
  const h = makeBattle({ defs: { enemies: { d: dummy } }, units: [{ chessId: 'chess_char_5_07_a', row: 10, col: 3 }],
    enemies: [{ key: 'd', pos: [10, 4] }, { key: 'd', pos: [10, 4] }, { key: 'd', pos: [10, 5] }], timeLimit: 30, seed: 7,
    hooks: ['damaged'], captureNoisy: true });
  const u = h.b.allyUnits[0];
  let locked = null;
  for (let i = 0; i < 120; i++) {
    h.step();
    if (!locked && i > 30 && u.cast) {
      locked = u.cast.targets.length;
      u.skill.gainSp(999);
      u.skill.activate('manual');
      assert.ok(u.skill.active && u.cast, 'the skill runs, the cast goes on');
    }
  }
  assert.equal(locked, 1);
  const per = new Map();
  for (const c of h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack)) per.set(c.dmg.attackId, (per.get(c.dmg.attackId) ?? 0) + 1);
  assert.deepEqual([...per.values()].slice(0, 3), [1, 3, 3], 'the cast locked before the skill hits all three');
});

test('recording events changes nothing: the same battle with and without them', () => {
  const run = (recordEvents) => {
    const h = makeBattle({ defs: { enemies: { d: dummy } }, units: [{ chessId: 'chess_char_5_07_a', row: 10, col: 3 }], enemies: [{ key: 'd', pos: [10, 4] }],
      timeLimit: 30, seed: 7, recordEvents });
    h.run(8);
    const u = h.b.allyUnits[0];
    return [u.stats.attacks, Math.round(u.stats.dmg), h.b.rng.state()];
  };
  assert.deepEqual(run(true), run(false));
});

// ---- the renderer: windCasts ------------------------------------------------------------------------------------

function harness() {
  const queue = [];
  const interp = { snaps: [], forEachUpcoming(from, to, cb) { for (const [t, e] of queue) if (t > from && t <= to) cb(e, t); } };
  const calls = [];
  const actor = { wound: false, windSkip: 0, windCastLeft: 0 };
  const view = {
    alive: true, actor,
    windUp(lead) { calls.push(['windUp', +lead.toFixed(3)]); return false; },
    castAttack(windUp, elapsed, kind, target) { calls.push(['cast', +windUp.toFixed(3), +elapsed.toFixed(3), kind, target?.id ?? null]); actor.wound = true; return true; },
    cancelWindUp() { calls.push(['cancel']); actor.wound = false; },
  };
  const foe = { id: 9, alive: true };
  const views = new Map([[1, view], [9, foe]]);
  const effects = [];
  const look = createWindUpLookahead({ views, woundUp: new WeakSet(), castStart: (v, t, kind) => effects.push([kind, t?.id ?? null]) });
  return { queue, interp, calls, effects, look, actor };
}

test('a cast plays the clip from its first frame when it is rendered, toward its target, with its cast effects', () => {
  const H = harness();
  H.queue.push([1.0, ['atkCast', 1, 0.4, 9]]);
  H.look.run(H.interp, 0.97);
  assert.deepEqual(H.calls, [], 'not before the cast start');
  H.look.run(H.interp, 1.0);
  assert.deepEqual(H.calls, [['cast', 0.4, 0, 'none', 9]]);
  assert.deepEqual(H.effects, [['none', 9]]);
  // its hit: no second wind-up from the look-ahead
  H.queue.push([1.4, ['atk', 1, 9, 'arrow']]);
  H.look.run(H.interp, 1.2);
  assert.equal(H.calls.length, 1);
  // the next cast takes the last attack's kind
  H.actor.wound = false;
  H.queue.push([2.25, ['atkCast', 1, 0.4, 9]]);
  H.look.run(H.interp, 2.22);   // seen ahead in the buffer
  H.look.run(H.interp, 2.27);
  assert.deepEqual(H.calls.at(-1), ['cast', 0.4, 0.02, 'arrow', 9], 'rendered 0.02 s late: that far into the clip');
});

test('a hit in sight before its cast start is rendered (the 0.2 s local look-ahead) winds nothing up: the cast plays it', () => {
  const H = harness();
  H.queue.push([1.0, ['atkCast', 1, 0.15, 9]], [1.15, ['atk', 1, 9, 'arrow']]);
  H.look.run(H.interp, 0.9);
  assert.deepEqual(H.calls, [], 'no early wind-up from the hit');
  H.look.run(H.interp, 1.0);
  assert.deepEqual(H.calls, [['cast', 0.15, 0, 'arrow', 9]], 'from frame 0 at the cast start, with the kind of its own hit');
  H.look.run(H.interp, 1.1);
  assert.equal(H.calls.length, 1);
});

test('a cast the sim cut drops to rest when the cut is rendered', () => {
  const H = harness();
  H.queue.push([1.0, ['atkCast', 1, 0.4, 9]], [1.2, ['atkCancel', 1]]);
  H.look.run(H.interp, 0.99);
  H.look.run(H.interp, 1.0);
  H.look.run(H.interp, 1.1);
  assert.ok(!H.calls.some((c) => c[0] === 'cancel'));
  H.look.run(H.interp, 1.2);
  assert.deepEqual(H.calls.at(-1), ['cancel']);
});

// ---- the actor: castAttack -----------------------------------------------------------------------------------------

let fake, UnitView;
before(async () => { fake = installFakePixi(); ({ UnitView } = await import('../../public/js/render/units.js')); });
after(() => fake.restore());

async function view() {
  const entry = {
    skel: '/s/front.skel', atlas: '/s/front.atlas',
    anims: { idle: 'Idle', attack: { loop: 'Attack' }, move: { loop: 'Move' }, die: 'Die' },
    animations: { Idle: 2, Attack: 1, Move: 1, Die: 0.9 }, hits: { Attack: [0.467] },
  };
  const assets = { picture: () => null, image: async () => null, hasBack: () => false, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: [{ name: 'Idle' }, { name: 'Attack' }, { name: 'Move' }, { name: 'Die' }] }), release() {} } };
  const cam = () => presetCamera('prep', { width: 1280, height: 720 });
  const v = new UnitView(fakeViewCtx(fake.P, { assets, cam }), { id: 1, side: 'ally', kind: 'op', defId: 'x', x: 5, y: 10, maxHp: 100 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(v.spineReady && v.actor);
  return v;
}

test('castAttack starts the clip at frame 0, its strike frame on the hit; the hit keeps it; a cut drops it to rest', async () => {
  const v = await view();
  assert.equal(v.castAttack(0.934, 0, 'none', null), true);
  const a = v.actor, e = a.spine.state.tracks[0];
  assert.equal(a.mode, 'attack');
  assert.equal(e.animation.name, 'Attack');
  assert.ok(Math.abs(e.trackTime) < 1e-9, 'from the first frame');
  assert.ok(Math.abs(e.timeScale - 0.467 / 0.934) < 1e-9, 'at hit / windUp: ×0.5');
  a.update(0.934);
  a.attack(1.868);
  assert.equal(a.mode, 'attack');
  assert.ok(Math.abs(a.spine.state.tracks[0].timeScale - 0.5) < 1e-9, 'the hit keeps the cast speed');
  assert.equal(a.windCast, false);
  assert.equal(v.castAttack(0.934, 0.1, 'none', null), true, 'the next cast');
  assert.ok(Math.abs(a.spine.state.tracks[0].trackTime - 0.05) < 1e-9, 'rendered 0.1 s late: 0.05 s into the clip');
  assert.equal(a.cancelWindUp(), true);
  a.update(1 / 60);
  assert.equal(a.mode, 'base');
});

test('the next cast close ahead keeps the last swing looping (no rest pose between two casts); a resting unit stays at rest', async () => {
  const H = harness();
  const holds = [];
  H.actor.holdCast = (sec) => holds.push(sec);
  H.queue.push([2.0, ['atkCast', 1, 0.4, 9]]);
  H.look.run(H.interp, 1.6);
  assert.equal(holds.length, 0, '0.4 s ahead: not yet');
  H.look.run(H.interp, 1.75);
  assert.equal(holds.length, 1, 'within 0.3 s of the cast: hold');
  H.look.run(H.interp, 2.0);
  assert.equal(holds.length, 1, 'cast rendered: no more hold');
  // the actor: only a swing still playing past its hit is held
  const v = await view();
  const a = v.actor;
  assert.equal(v.castAttack(0.934, 0, 'none', null), true);
  a.update(0.934);
  a.attack(1.868);
  const until = a.attackUntil;
  a.holdCast(until - a.clock + 0.5);
  assert.ok(a.attackUntil > until, 'held past its end');
  a.update(a.attackUntil - a.clock + 0.01);
  a.update(1 / 60);
  assert.equal(a.mode, 'base', 'back to rest after the hold');
  a.holdCast(1);
  a.update(1 / 60);
  assert.equal(a.mode, 'base', 'a resting unit is not revived');
});
