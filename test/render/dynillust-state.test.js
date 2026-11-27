// test/render/dynillust-state.test.js — the official card's dynamic-illustration behaviour (render/dynillust): the
// framing map, the card state machine (UICharacterDynIllust) and the instance (DynIllust), with fake skeleton / effect
// adapters and a fake clock. Every expected value comes from the CN client (notes: dev50-l2d-o1-o3-findings.md).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { unityToCard, unityToHome, cardFraming, framingMap, cardViewProj, pickAdjust, ADJUST } from '../../public/js/render/dynillust/framing.js';
import { CardIllustState, STATE, ACTION, SP_IDLE_TIME, rangeInt, roundHalfEven, uniformSPActionTime } from '../../public/js/render/dynillust/state.js';
import { DynIllustInstance, idleResyncEligible, IDLE_RESYNC_S } from '../../public/js/render/dynillust/instance.js';

/** A fake Spine track-0 player: SetAnimation resets trackTime; step(dt) advances and fires loop completions. */
function fakeSkel(anims) {
  const tracks = new Map(), listeners = [];
  return {
    animationNames: Object.keys(anims),
    findAnimation: (n) => (anims[n] != null ? { name: n, duration: anims[n] } : null),
    setAnimation(track, name, loop) {
      const e = { trackIndex: track, loop, trackTime: 0, animation: { name, duration: anims[name] } };
      tracks.set(track, e);
      return e;
    },
    current: (t) => tracks.get(t) || null,
    onComplete: (cb) => listeners.push(cb),
    step(dt) {
      for (const e of tracks.values()) {
        const d = e.animation.duration, before = e.trackTime;
        e.trackTime += dt;
        if (d > 0 && Math.floor(e.trackTime / d) > Math.floor(before / d)) for (const cb of listeners) cb(e);
      }
    },
  };
}
function fakeFx() {
  const on = new Map(), log = [];
  return { on, log, setActive: (n, v) => on.set(n, v), forceDelayEnd: (n) => log.push(['end', n]), trigger: (t) => log.push(['trigger', t]) };
}
function rig(anims, data = {}) {
  let t = 0;
  const skel = fakeSkel(anims), fx = fakeFx();
  const inst = new DynIllustInstance({ skel, fx, data, now: () => t });
  return { skel, fx, inst, advance(dt) { t += dt; skel.step(dt); inst.update(); inst.lateUpdate(); }, get t() { return t; } };
}

describe('framing.js unityToHome (the official home screen framing)', () => {
  // Dev 57's worked examples at 1920 × 1080 [src: notes dev57-home-framing.md §5 (worked.cjs); the framing values from
  // Dev 49's illust.json]: DEFAULT offset and size, HOME_PAGE present but not used
  const kaltsit = { cameraSize: 11, adjust: [[7.15, -64.999, 2200.09, 2200.09], null, [97.62, -217.58, 3148, 3148]] };
  const ling = { cameraSize: 11, adjust: [[38.5, -73, 2300, 2300], null, [64, -25, 1800, 1800]] };
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  // §5 gives scale to 3 decimals and x0 / y0 to 2, from unrounded intermediates: half the last digit, plus the rounding
  // of the note's own constants (with HOME_VH / CX / CY as given, Kal'tsit's y0 is 699.66495 for §5's 699.67)
  const S = 6e-4, P = 6e-3;
  test('Kal\'tsit "Remnant" (char_003_kalts_boc#6): scale 133.353, x0 677.57, y0 699.67', () => {
    const m = unityToHome(kaltsit, 1920, 1080);
    near(m.scale, 133.353, S, 'scale'); near(m.x0, 677.57, P, 'x0'); near(m.y0, 699.67, P, 'y0');
    assert.equal(m.w, 1920); assert.equal(m.h, 1080);
  });
  test('Ling "A Gallant Dream" (char_2023_ling_nian#12): scale 139.409, x0 719.38, y0 710.33', () => {
    const m = unityToHome(ling, 1920, 1080);
    near(m.scale, 139.409, S, 'scale'); near(m.x0, 719.38, P, 'x0'); near(m.y0, 710.33, P, 'y0');
  });
  test('2560 × 1440 scales with the height (§5: Kal\'tsit 177.804, 903.43, 932.89)', () => {
    const m = unityToHome(kaltsit, 2560, 1440);
    near(m.scale, 177.804, S, 'scale'); near(m.x0, 903.43, P, 'x0'); near(m.y0, 932.89, P, 'y0');
  });
  test('centre \'illust\': the same zoom and height, the view\'s offset at the window centre', () => {
    const home = unityToHome(ling, 1920, 1080), mid = unityToHome(ling, 1920, 1080, { centre: 'illust' });
    assert.equal(mid.scale, home.scale);
    assert.equal(mid.y0, home.y0);
    near(mid.x0, 960, 1e-9, 'x0');
  });
});

describe('framing.js zoom about a point (framing { mode, centre, zoom, fx, fy })', () => {
  const f = { cameraSize: 11, adjust: [[38.5, -73, 2300, 2300]] };
  const px = (m, X, Y) => [m.x0 + m.scale * X, m.y0 - m.scale * Y];
  test('zoom 1 is today\'s framing, card and home', () => {
    assert.deepEqual(framingMap(f, 300, 592, cardFraming({ mode: 'card', zoom: 1 })), unityToCard(f, 300, 592));
    assert.deepEqual(framingMap(f, 1920, 1080, cardFraming('home', 'illust')), unityToHome(f, 1920, 1080, { centre: 'illust' }));
    assert.deepEqual(framingMap(f, 300, 592, cardFraming(undefined)), unityToCard(f, 300, 592));
  });
  for (const mode of ['card', 'home']) {
    test(`${mode}: a 1.35× zoom about (0.5, 0.25) keeps that point and scales the rest away from it`, () => {
      const w = 245, h = 594;
      const base = framingMap(f, w, h, cardFraming({ mode }));
      const z = framingMap(f, w, h, cardFraming({ mode, zoom: 1.35, fx: 0.5, fy: 0.25 }));
      assert.ok(Math.abs(z.scale - base.scale * 1.35) < 1e-9);
      // the Unity point that sits at the focus before the zoom sits there after it
      const fx = 0.5 * w, fy = 0.25 * h;
      const X = (fx - base.x0) / base.scale, Y = (base.y0 - fy) / base.scale;
      const [ax, ay] = px(z, X, Y);
      assert.ok(Math.abs(ax - fx) < 1e-9 && Math.abs(ay - fy) < 1e-9, `${ax}, ${ay}`);
      // any other point moves 1.35× as far from the focus
      const [bx0, by0] = px(base, X + 1, Y - 2), [bx1, by1] = px(z, X + 1, Y - 2);
      assert.ok(Math.abs((bx1 - fx) - 1.35 * (bx0 - fx)) < 1e-9 && Math.abs((by1 - fy) - 1.35 * (by0 - fy)) < 1e-9);
      assert.equal(z.w, w); assert.equal(z.h, h);   // the canvas keeps its size
    });
  }
  test('the option forms: a string, an object, focus [fx, fy]; each framing its own id', () => {
    assert.deepEqual(cardFraming('home', 'illust'), { mode: 'home', centre: 'illust', zoom: 1, fx: 0.5, fy: 0.5, id: 'home-illust' });
    assert.deepEqual(cardFraming({ mode: 'home', centre: 'illust', zoom: 1.2, focus: [0.5, 0.25] }), { mode: 'home', centre: 'illust', zoom: 1.2, fx: 0.5, fy: 0.25, id: 'home-illust-z1.2@0.5,0.25' });
    assert.equal(cardFraming({ zoom: 1.35, fx: 0.5, fy: 0.25 }).id, 'card-z1.35@0.5,0.25');
    assert.equal(cardFraming().id, 'card');
  });
});

describe('framing.js (official card framing)', () => {
  // Lappland the Decadenza E2: camera 10.3, DEFAULT offset (35.4, −19.5) size 2038 [src: official DynIllust]
  const f = { cameraSize: 10.3, adjust: [[35.4, -19.5, 2038, 2038], [-8.7, -89, 1505, 1505]] };
  test('a 232 px card is the official card at u = 1', () => {
    const m = unityToCard(f, 232, 458);
    const k = 2038 / (2 * 10.3);
    assert.ok(Math.abs(m.scale - 0.73 * k) < 1e-9);
    assert.ok(Math.abs(m.x0 - (116 + 0.73 * 35.4)) < 1e-9);
    // the holder anchor is the window centre, 458 / 2 [src: official [uc]autochessouter.ab group_char, root]
    assert.ok(Math.abs(m.y0 - (229 - (-39 + 0.73 * -19.5))) < 1e-9);
  });
  test('the map scales with the card size', () => {
    const a = unityToCard(f, 232, 458), b = unityToCard(f, 464, 916);
    assert.ok(Math.abs(b.scale - 2 * a.scale) < 1e-9 && Math.abs(b.x0 - 2 * a.x0) < 1e-9 && Math.abs(b.y0 - 2 * a.y0) < 1e-9);
  });
  test('a short card (Grand Alliance at 1546 × 905: 280 × 256) contains the whole official window, centred', () => {
    // [src: notes dev49-l2d-review-findings.md §4]
    const m = unityToCard(f, 280, 256), u = 256 / 458, a = unityToCard(f, 232, 458);
    assert.ok(Math.abs(m.scale - u * a.scale) < 1e-9);
    assert.ok(Math.abs(m.y0 - u * a.y0) < 1e-9);
    assert.ok(Math.abs(m.x0 - (140 + u * (a.x0 - 116))) < 1e-9);
  });
  test('a tall card (Grand Alliance at 3840 × 2160: 245 × 594) fits by width, the official window centred vertically', () => {
    const m = unityToCard(f, 245, 594), u = 245 / 232, a = unityToCard(f, 232, 458);
    assert.ok(Math.abs(m.scale - u * a.scale) < 1e-9);
    assert.ok(Math.abs(m.y0 - ((594 - 458 * u) / 2 + u * a.y0)) < 1e-9);
  });
  test('a card wider than the official window fits it by height, centred: the same vertical range', () => {
    // the Grand Alliance card ≈ 0.65 wide [src: notes dev49-l2d-review-findings.md §1]
    const a = unityToCard(f, 232, 458), b = unityToCard(f, 298, 458);
    assert.ok(Math.abs(b.scale - a.scale) < 1e-9 && Math.abs(b.y0 - a.y0) < 1e-9);
    assert.ok(Math.abs(b.x0 - (a.x0 + (298 - 232) / 2)) < 1e-9);
  });
  test('a disabled or missing adjust leaves the view as created: offset 0, 2048 px', () => {
    assert.equal(pickAdjust(f, ADJUST.DEFAULT).size, 2038);
    assert.deepEqual(pickAdjust(f, ADJUST.HOME_PAGE), { ox: 0, oy: 0, size: 2048 });
    const off = -3.40282e+38; // DynIllustAdjust.DisabledValue (Nearl the Radiant Knight's epoque#17 DEFAULT)
    assert.deepEqual(pickAdjust({ adjust: [[off, off, off, off]] }, ADJUST.DEFAULT), { ox: 0, oy: 0, size: 2048 });
  });
  test('the view-projection puts a Unity point where the map says', () => {
    const m = unityToCard(f, 200, 400), vp = cardViewProj(m, 50, 10, 1000, 500);
    const X = -0.18, Y = -4; // Lappland's root
    const cx = vp[0] * X + vp[12], cy = vp[5] * Y + vp[13];
    const px = (cx + 1) / 2 * 1000, py = (1 - cy) / 2 * 500;
    // the matrix is a Float32Array: within a thousandth of a pixel
    assert.ok(Math.abs(px - (50 + m.x0 + m.scale * X)) < 1e-3);
    assert.ok(Math.abs(py - (10 + m.y0 - m.scale * Y)) < 1e-3);
  });
});

describe('state.js helpers', () => {
  test('Random.Range(int, int) excludes max: INIT 3..8, RESUME 10..23', () => {
    assert.equal(rangeInt(3, 9, () => 0), 3);
    assert.equal(rangeInt(3, 9, () => 0.999999), 8);
    assert.equal(rangeInt(10, 24, () => 0.999999), 23);
    assert.equal(rangeInt(9, 3, () => 0), 3); // RandomUtil.Range swaps
  });
  test('Math.Round is half to even', () => {
    assert.deepEqual([0.5, 1.5, 2.5, 2.4, 2.6].map(roundHalfEven), [0, 2, 2, 2, 3]);
  });
  test('_UniformSPActionTime shifts INIT by the idle time so far, unless it reaches max', () => {
    assert.deepEqual(uniformSPActionTime([3, 9], { playingAction: ACTION.IDLE, playingTime: 4.4 }), [7, 13]);
    assert.deepEqual(uniformSPActionTime([3, 9], { playingAction: ACTION.IDLE, playingTime: 9.2 }), [3, 9]);
    assert.deepEqual(uniformSPActionTime([3, 9], { playingAction: ACTION.SPECIAL_IDLE, playingTime: 4 }), [3, 9]);
  });
  test('the official ranges', () => {
    assert.deepEqual([...SP_IDLE_TIME.INIT], [3, 9]);
    assert.deepEqual([...SP_IDLE_TIME.RESUME], [10, 24]);
  });
});

describe('instance.js (DynIllust)', () => {
  test('enable plays looping Idle at once; no Start', () => {
    const r = rig({ Idle: 4, Special: 3, Start: 2 });
    r.inst.enable();
    assert.equal(r.inst.playingAction, ACTION.IDLE);
    assert.equal(r.skel.current(0).animation.name, 'Idle');
    assert.equal(r.skel.current(0).loop, true);
    assert.ok(r.inst.started);
  });
  test('Special plays once (duration × loop) and returns to looping Idle', () => {
    const r = rig({ Idle: 4, Special: 3 });
    r.inst.enable();
    assert.ok(r.inst.changeAction(ACTION.SPECIAL_IDLE, 1));
    assert.equal(r.skel.current(0).loop, false);
    r.advance(2.9);
    assert.equal(r.inst.playingAction, ACTION.SPECIAL_IDLE);
    r.advance(0.2);
    assert.equal(r.inst.playingAction, ACTION.IDLE);
    assert.equal(r.skel.current(0).loop, true);
  });
  test('a missing animation keeps the previous action', () => {
    const r = rig({ Idle: 4 });
    r.inst.enable();
    assert.equal(r.inst.changeAction(ACTION.SPECIAL_IDLE, 1), false);
    assert.equal(r.inst.playingAction, ACTION.IDLE);
    assert.equal(r.inst.action, ACTION.IDLE);
  });
  test('action particles: own action on, the others forced to their end and off; triggers per action', () => {
    const r = rig({ Idle: 4, Special: 3, Interact: 2 }, { particles: [{ action: 1, node: 7 }, { action: 3, node: 9 }] });
    assert.equal(r.fx.on.get(7), false); // Awake
    r.inst.enable();
    assert.equal(r.fx.on.get(7), false);
    r.inst.changeAction(ACTION.SPECIAL_IDLE, 1);
    assert.equal(r.fx.on.get(7), true);
    assert.equal(r.fx.on.get(9), false);
    assert.ok(r.fx.log.some(([k, n]) => k === 'end' && n === 9));
    assert.deepEqual(r.fx.log.filter(([k]) => k === 'trigger').map(([, t]) => t), ['OnIdle', 'OnSpecial']);
  });
  test('without _fixFxDelay no FxDelay is forced', () => {
    const r = rig({ Idle: 4, Special: 3 }, { fixFxDelay: false, particles: [{ action: 1, node: 7 }] });
    r.inst.enable();
    r.inst.changeAction(ACTION.SPECIAL_IDLE, 1);
    r.inst.changeAction(ACTION.IDLE, -1);
    assert.ok(!r.fx.log.some(([k]) => k === 'end'));
  });
  test('extra tracks loop on track max(2, index) and skip the action names', () => {
    const r = rig({ Idle: 4, Blink: 1, Special: 3 }, { extraTracks: [{ track: 0, name: 'Blink' }, { track: 3, name: 'Special' }] });
    r.inst.enable();
    assert.equal(r.skel.current(2).animation.name, 'Blink');
    assert.equal(r.skel.current(2).loop, true);
    assert.equal(r.skel.current(3), null);
  });
  test('idle re-sync: only Idle/Start skeletons, at an Idle loop end after 90 s of Idle', () => {
    assert.equal(idleResyncEligible(['Idle', 'Start']), true);
    assert.equal(idleResyncEligible(['Idle', 'Special']), false);
    assert.equal(idleResyncEligible(['Start']), false);
    const r = rig({ Idle: 4 });
    r.inst.enable();
    const first = r.skel.current(0);
    for (let i = 0; i < 22; i++) r.advance(4); // 88 s: loops completed, no re-sync yet
    assert.equal(r.skel.current(0), first);
    r.advance(4);                              // 92 s, at a loop end
    assert.notEqual(r.skel.current(0), first);
    assert.ok(r.skel.current(0).trackTime < 1e-9);
    assert.equal(IDLE_RESYNC_S, 90);
  });
  test('a skeleton with Special never re-syncs', () => {
    const r = rig({ Idle: 4, Special: 3 });
    r.inst.enable();
    const first = r.skel.current(0);
    for (let i = 0; i < 30; i++) r.advance(4);
    assert.equal(r.skel.current(0), first);
  });
  test('_animTimeFixed returns to Idle when a one-shot track reaches its duration', () => {
    const r = rig({ Idle: 4, Special: 3 }, { animTimeFixed: true });
    r.inst.enable();
    r.inst.changeAction(ACTION.SPECIAL_IDLE, 2); // playEnd at 6 s; the track ends at 3 s
    r.advance(3);
    assert.equal(r.inst.playingAction, ACTION.IDLE);
  });
});

describe('state.js (UICharacterDynIllust)', () => {
  function card(anims, rngVals) {
    const r = rig(anims);
    let i = 0;
    const st = new CardIllustState({ rng: () => rngVals[Math.min(i++, rngVals.length - 1)] });
    r.inst.enable();
    st.activate();
    return { r, st, step(dt) { st.tick(r.inst); r.advance(dt); } };
  }
  test('JUST_ACTIVATED → IDLE with an INIT timer of 3..8 s', () => {
    const c = card({ Idle: 4, Special: 3 }, [0]);
    c.step(0);
    assert.equal(c.st.state, STATE.IDLE);
    assert.deepEqual([c.st.timer.min, c.st.timer.max, c.st.timer.target], [3, 9, 3]);
  });
  test('the special idle fires at the target, plays once, then waits a RESUME 10..23 s', () => {
    const c = card({ Idle: 4, Special: 3 }, [0, 0.999999]); // INIT 3 s, RESUME 23 s
    c.step(0);
    for (let k = 0; k < 29; k++) c.step(0.1);
    assert.equal(c.r.inst.playingAction, ACTION.IDLE);    // 2.9 s
    c.step(0.1); c.step(0.1); c.step(0);
    assert.equal(c.r.inst.playingAction, ACTION.SPECIAL_IDLE);
    assert.deepEqual([c.st.timer.min, c.st.timer.max, c.st.timer.target], [10, 24, 23]);
    for (let k = 0; k < 31; k++) c.step(0.1);              // the 3 s Special ends
    assert.equal(c.r.inst.playingAction, ACTION.IDLE);
    for (let k = 0; k < 200; k++) c.step(0.1);             // 20 s of Idle: not yet
    assert.equal(c.r.inst.playingAction, ACTION.IDLE);
    for (let k = 0; k < 40; k++) c.step(0.1);              // past 23 s of Idle
    assert.equal(c.r.inst.playingAction, ACTION.SPECIAL_IDLE);
  });
  test('two cards whose timers fire in the same frame start their special idles a frame apart (mayStartSpecial)', () => {
    let frame = 0, taken = -1;
    const turn = () => { if (taken === frame) return false; taken = frame; return true; };
    const mk = () => { const r = rig({ Idle: 4, Special: 3 }); const st = new CardIllustState({ rng: () => 0, mayStartSpecial: turn }); r.inst.enable(); st.activate(); return { r, st }; };
    const a = mk(), b = mk();
    const step = (dt) => { frame++; for (const c of [a, b]) { c.st.tick(c.r.inst); c.r.advance(dt); } };
    step(0);
    for (let k = 0; k < 30; k++) step(0.1);                // 3 s: both INIT targets (3 s) reached
    step(0);
    assert.equal(a.r.inst.playingAction, ACTION.SPECIAL_IDLE);
    assert.equal(b.r.inst.playingAction, ACTION.IDLE);     // its turn is the next frame
    step(0);
    assert.equal(b.r.inst.playingAction, ACTION.SPECIAL_IDLE);
  });
  test('four cards firing together: none starts its special idle more than two frames late', () => {
    let frame = 0, taken = -1;
    const turn = () => { if (taken === frame) return false; taken = frame; return true; };
    const cs = Array.from({ length: 4 }, () => { const r = rig({ Idle: 4, Special: 3 }); const st = new CardIllustState({ rng: () => 0, mayStartSpecial: turn }); r.inst.enable(); st.activate(); return { r, st, at: -1 }; });
    const step = (dt) => { frame++; for (const c of cs) { c.st.tick(c.r.inst); c.r.advance(dt); if (c.at < 0 && c.r.inst.playingAction === ACTION.SPECIAL_IDLE) c.at = frame; } };
    step(0);
    for (let k = 0; k < 30; k++) step(0.1);                // 3 s: every INIT target reached
    const fired = frame + 1;
    for (let k = 0; k < 4; k++) step(0);
    assert.deepEqual(cs.map((c) => c.at - fired), [0, 1, 2, 2], 'one a frame, then the rest at the two-frame limit');
  });
  test('an instance already deep in Idle shifts the INIT range', () => {
    const r = rig({ Idle: 40, Special: 3 });
    r.inst.enable();
    r.advance(5.5);                                        // shared instance: 5.5 s of Idle already
    const st = new CardIllustState({ rng: () => 0 });
    st.activate(); st.tick(r.inst);
    assert.deepEqual([st.timer.min, st.timer.max, st.timer.target], [9, 15, 9]); // round(5.5) = 6
  });
  test('deactivated or not started: nothing happens', () => {
    const r = rig({ Idle: 4, Special: 3 });
    const st = new CardIllustState({ rng: () => 0 });
    st.activate(); st.tick(r.inst);                        // not enabled → not started
    assert.equal(st.state, STATE.JUST_ACTIVATED);
    r.inst.enable(); st.deactivate(); st.tick(r.inst);
    assert.equal(st.state, STATE.DEACTIVATED);
  });
  test('PlayStart only from IDLE / INTERACTION; back to IDLE with RESUME when Start ends', () => {
    const c = card({ Idle: 4, Special: 3, Start: 2 }, [0, 0]);
    c.st.playStart(c.r.inst);
    assert.equal(c.r.inst.playingAction, ACTION.IDLE);      // still JUST_ACTIVATED: refused
    c.step(0);
    c.st.playStart(c.r.inst);
    assert.equal(c.st.state, STATE.START);
    assert.equal(c.r.inst.playingAction, ACTION.START);
    for (let k = 0; k < 21; k++) c.step(0.1);
    c.step(0);
    assert.equal(c.st.state, STATE.IDLE);
    assert.deepEqual([c.st.timer.min, c.st.timer.max], [10, 24]);
  });
  test('autoIdleSpecialDisable stops the timer from firing', () => {
    const r = rig({ Idle: 4, Special: 3 });
    r.inst.enable();
    const st = new CardIllustState({ rng: () => 0, autoIdleSpecialDisable: true });
    st.activate(); st.tick(r.inst);
    for (let k = 0; k < 300; k++) { st.tick(r.inst); r.advance(0.1); }
    assert.equal(r.inst.playingAction, ACTION.IDLE);
  });
});
