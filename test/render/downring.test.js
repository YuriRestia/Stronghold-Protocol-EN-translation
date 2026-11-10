// test/render/downring.test.js — user playtest #4 items 8 and 9, client side: render/interp.js carries b.snap `elem`
// (the element gauge a unit shows) and `down` (knocked-out operators waiting to redeploy); render/units.js keeps a
// knocked-out operator on its tile in its held Die pose under a redeploy ring (countdown → "DP" / "!" → redeploy)
// and draws the official element gauge — since user playtest #6 a row under the bars: the element icon and a white bar
// of the remaining 元素值, refilling in the element's colour over a 爆发冷却 (headless fake PIXI, test/render/fakepixi.js). User playtest #5 item 2: an operator entering
// 联防 knocked out ('die' reason FORCED_EXIT) goes straight to the held pose, no burst.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer, normalizeSnapshot, TUPLE } from '../../public/js/render/interp.js';
import { FORCED_EXIT as SIM_FORCED_EXIT } from '../../server/sim/constants.js';

let fake, UnitView, DOWN_STATE, DOWN_LOOK, T, E;
before(async () => {
  fake = installFakePixi();
  E = await import('../../public/js/render/units.js');
  ({ UnitView, DOWN_STATE, DOWN_LOOK } = E);
  T = await import('../../public/js/render/textures.js');
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const tuple = (id, x = 5, y = 10, hp = 1000) => [id, x, y, hp, 1000, 0, 0, 0, 0];

describe('interp: b.snap `elem` and `down`', () => {
  test('`elem` entries are appended to their unit tuple and sampled as el / elFill / elUntil / elDur', () => {
    const s = normalizeSnapshot({ t: 3, units: [tuple(1), tuple(2), tuple(3)], elem: [[1, 'burn', 0.4, 0, 0], [2, 'neural', 1, 12.5, 10], [9, 'burn', 0.5, 0, 0], [3, 'lava', 0.5, 0, 0], 'x'] });
    assert.deepEqual(s.units.get(1).slice(TUPLE.EL), ['burn', 0.4, 0, 0]);
    assert.deepEqual(s.units.get(2).slice(TUPLE.EL), ['neural', 1, 12.5, 10]);
    assert.equal(s.units.get(3).length, 9, 'unknown element dropped');
    assert.equal(s.down, null);
    const buf = new SnapshotBuffer({ delay: 0 });
    buf.push({ t: 1, units: [tuple(1)], elem: [[1, 'apoptosis', 0.2, 0, 0]] }, 0);
    buf.push({ t: 1.1, units: [tuple(1)] }, 0.05);
    const out = buf.sample(1.02);
    assert.equal(out.get(1).el, 'apoptosis');
    assert.equal(out.get(1).elFill, 0.2);
    buf.sample(1.1, out);
    assert.equal(out.get(1).el, null, 'cleared once the gauge is gone');
    assert.equal(out.get(1).elFill, 0);
  });

  test('`down` is kept per snapshot; downAt(time) reads the snapshot shown at that time', () => {
    const buf = new SnapshotBuffer({ delay: 0 });
    buf.push({ t: 1, units: [] }, 0);
    buf.push({ t: 1.1, units: [], down: [[7, 20.5, 18, 0], ['bad'], [8, 'x', -3, 1.7]] }, 0.05);
    buf.push({ t: 1.2, units: [] }, 0.1);
    assert.equal(buf.downAt(1.05), null);
    assert.deepEqual(buf.downAt(1.15), [[7, 20.5, 18, 0], ['bad', 0, 0, 0], [8, 0, 0, 1]]);
    assert.equal(buf.downAt(1.25), null);
  });
});

function view(info = {}) {
  const ctx = fakeViewCtx(fake.P, { cam });
  return new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT', ...info });
}
const frames = (v, n, dt = 1 / 60, gameT = null) => { for (let i = 0; i < n; i++) { if (gameT) v.gameT = gameT(i); v.update(dt, cam(), i * dt); } };

describe('knocked-down operator (UnitView.setDown)', () => {
  test('stays on its tile greyed under a redeploy ring counting down, then "DP", then redeploys', () => {
    const v = view();
    frames(v, 3);
    v.setDown([1, 30, 20, DOWN_STATE.COUNTING], 10);
    assert.equal(v.alive, false, 'knocked down');
    assert.ok(v.down);
    frames(v, 400, 1 / 60, () => 10);   // 6.7 s: a dying view would long be gone
    assert.equal(v.remove, false, 'never removed while down');
    assert.ok(v.alpha > 0.85, `drawn (alpha ${v.alpha})`);
    const r = v._downRing;
    assert.ok(r && r.root.visible, 'ring shown');
    assert.equal(r.label, '20', 'seconds left (game s)');
    assert.equal(r.text.texture, T.downLabel('20', '#ffffff', 1), 'drawn with the shared label texture');
    assert.equal(r.arc.tint, DOWN_LOOK.ring[DOWN_STATE.COUNTING]);
    assert.equal(r.arc.texture, T.ringArc(0), 'nothing elapsed yet');
    v.setDown([1, 30, 20, DOWN_STATE.COUNTING], 25);
    frames(v, 1, 1 / 60, () => 25);
    assert.equal(r.label, '5');
    assert.equal(r.text.texture, T.downLabel('5', '#ffffff', 1));
    assert.equal(r.arc.texture, T.ringArc(0.75), 'three quarters elapsed');
    v.setDown([1, 30, 20, DOWN_STATE.WAIT_DP], 31);
    frames(v, 1, 1 / 60, () => 31);
    assert.equal(r.label, 'DP');
    assert.equal(r.text.texture, T.downLabel('DP', '#ffc600', 1), 'in the ring colour');
    assert.equal(r.arc.tint, DOWN_LOOK.ring[DOWN_STATE.WAIT_DP]);
    assert.equal(r.arc.texture, T.ringArc(1), 'full ring while it waits');
    v.setDown([1, 30, 20, DOWN_STATE.WAIT_TILE], 32);
    frames(v, 1);
    assert.equal(r.label, '!');
    assert.equal(r.text.texture, T.downLabel('!', '#ff4b3e', 1));
    const kids = v.hud.children.length;
    frames(v, 30);
    assert.equal(v.hud.children.length, kids, 'no per-frame allocation');
    v.onDeploy();                        // the redeploy (b.ev 'deploy')
    assert.equal(v.alive, true);
    assert.equal(v.down, null);
    frames(v, 2);
    assert.equal(r.root.visible, false, 'ring gone');
  });

  test('rings showing the same label share one rasterised texture, drawn once (textures.js downLabel)', () => {
    const a = view({ id: 11 }), b = view({ id: 12 });
    frames(a, 2);
    frames(b, 2);
    a.setDown([11, 30, 20, DOWN_STATE.COUNTING], 17.5);
    b.setDown([12, 31, 20, DOWN_STATE.COUNTING], 18.5);   // both 12.5 s left → "13"
    frames(a, 1, 1 / 60, () => 17.5);
    frames(b, 1, 1 / 60, () => 18.5);
    const ra = a._downRing, rb = b._downRing;
    assert.equal(ra.label, '13');
    assert.equal(rb.label, '13');
    assert.equal(ra.text.texture, rb.text.texture, 'one texture for both rings');
    assert.ok(!(ra.text instanceof fake.P.Text), 'the ring holds a plain Sprite, not a Text of its own');
    const t13 = ra.text.texture;
    frames(a, 1, 1 / 60, () => 18.5);
    assert.equal(ra.label, '12');
    assert.notEqual(ra.text.texture, t13, 'a new number, a new texture');
    a.setDown([11, 30, 20, DOWN_STATE.COUNTING], 17.5);
    frames(a, 1, 1 / 60, () => 17.5);
    assert.equal(ra.text.texture, t13, 'a number seen before reuses its texture');
    assert.equal(T.downLabel('13', '#ffffff', 2) === t13, false, 'another resolution, another texture');
  });

  test('the shared labels are redrawn in place once the web fonts land (refreshDownLabels)', () => {
    const tex = T.downLabel('47', '#ffffff', 1);
    const proto = fake.P.Text.prototype, up = proto.updateText;
    const redrawn = [];
    proto.updateText = function (respectDirty) { redrawn.push([this.text, respectDirty]); return up.call(this, respectDirty); };
    try { T.refreshDownLabels(); } finally { proto.updateText = up; }
    assert.ok(redrawn.some(([t, d]) => t === '47' && d === false), 'the cached label re-rasterised (forced)');
    assert.equal(T.downLabel('47', '#ffffff', 1), tex, 'same texture object, so every ring showing it updates');
  });

  test('a view made for a unit already down starts on the held end of the Die clip', () => {
    const v = view();
    v.setDown([1, 30, 20, DOWN_STATE.COUNTING], 12, true);
    assert.equal(v.alive, false);
    assert.ok(v.dieT >= 30);
    frames(v, 2, 1 / 60, () => 12);
    assert.ok(v._downRing.root.visible);
    assert.equal(v._downRing.label, '18');
  });

  test('an operator entering the battle knocked out (联防, reason FORCED_EXIT): the held pose at once, no death burst, then its ring', async () => {
    const { FORCED_EXIT, showsDeathFx } = await import('../../public/js/render/app.js');
    assert.equal(FORCED_EXIT, SIM_FORCED_EXIT, 'the renderer mirrors the sim reason');
    const info = { side: 'ally', kind: 'chess' };
    assert.equal(showsDeathFx(info, false, FORCED_EXIT), false, 'no death particles');
    assert.equal(showsDeathFx(info, false, 'killed'), true, 'a knock-out keeps them');
    const v = view();
    frames(v, 2);
    v.die(true);                          // b.ev ['die', id, 'forcedExit'] (render/app.js handleEvent)
    assert.equal(v.alive, false);
    assert.ok(v.dieT >= 30, 'no fall: the end of the Die clip');
    v.setDown([1, 70, 70, DOWN_STATE.COUNTING], 0.03);   // b.snap down, same frame
    frames(v, 240, 1 / 60, () => 2);
    assert.equal(v.remove, false, 'stays on its tile');
    assert.ok(v._downRing.root.visible);
    assert.equal(v._downRing.label, '68');
    const w = view({ id: 2 });
    frames(w, 2);
    w.die();
    assert.ok(w.dieT < 1, 'an ordinary death still plays the clip from its start');
  });

  test('leaving the `down` list without a redeploy fades the view out; a normal death still fades', () => {
    const v = view();
    v.setDown([1, 30, 20, DOWN_STATE.COUNTING], 10);
    frames(v, 10);
    v.setDown(null, 11);
    frames(v, 60);
    assert.equal(v.remove, true);
    const w = view({ id: 2 });
    frames(w, 2);
    w.die();
    frames(w, 200);
    assert.equal(w.remove, true, 'a summon / enemy death is unchanged');
  });
});

describe('element gauge (the client\'s enemy_ep_slider / char_ep_slider, under the feet)', () => {
  const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, el: null, elFill: 0, elUntil: 0, elDur: 0, ...o });
  // the client's art, stubbed: each sprite at its pixel size (the fill frames are cut from a drawable source)
  const SIZES = { slider_ep_back: 54, slider_ep_back_enemy: 51, slider_ep_color_enemy: 27, slider_ep_fill: 28, slider_ep_fill_back_enemy: 17,
    slider_ep_fill_enemy: 12, sprite_ep_break_hint: 33, sprite_ep_break_spread: 41, sprite_ep_color: 28, sprite_ep_hit_spread: 76,
    sprite_ep_icon: 14, sprite_ep_water_icon: 15, sprite_ep_fire_icon: 14, sprite_ep_dark_icon: 15 };
  let from, n = 0;
  before(() => {
    from = fake.P.Texture.from;
    fake.P.Texture.from = (src) => {
      const w = SIZES[String(src).split('/').pop()];
      return w ? new fake.P.Texture(new fake.P.BaseTexture({ width: w, height: w, source: {} })) : from(src);
    };
  });
  after(() => { fake.P.Texture.from = from; });
  /** A view whose manifest has the art (its own urls: uiArtTexture caches per url). */
  function artView(info = {}) {
    const tag = `/art${++n}/`;
    const ctx = fakeViewCtx(fake.P, { cam, assets: { ui: (k) => tag + k } });
    return new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT', ...info });
  }
  const enemyInfo = { id: 3, side: 'enemy', kind: 'enemy', defId: 'enemy_x', dir: undefined };

  test('under the feet, centred on the unit: the ring sits below the unit\'s position, the HP bar stays over the head', () => {
    for (const v of [artView(), artView(enemyInfo)]) {
      v.sync(sample({ el: 'burn', elFill: 0.25, hp: 500 }), 5);
      frames(v, 1);
      const r = v._elBar;
      assert.ok(r.root.visible);
      const feet = v.screen.y, u = v.screen.s / E.EP_GAUGE.tilePx;   // one prefab unit: 1 / 157.2 tile
      const y = v.isEnemy ? E.EP_GAUGE.enemyY : E.EP_GAUGE.charY;
      assert.ok(Math.abs(r.root.position.y - (feet + y * u)) < 1e-6, `${y} units below the feet`);
      assert.ok(Math.abs(r.root.position.x - (v.hpBg.position.x + v.hpBg.width / 2)) < 1e-6, 'centred under the bars');
      assert.ok(r.root.position.y > v.hpBg.position.y + 20, 'far below the overhead bars');
      assert.ok(Math.abs(r.root.scale.x - u * E.EP_GAUGE.scale) < 1e-9, 'ep_slider\'s scale 1.2');
      v.destroy();
    }
  });

  test('one prefab unit is 1 / tilePx of a tile: the official battle camera\'s middle row on the client\'s 1920-wide HUD canvas', () => {
    for (const side of ['L', 'R']) {
      const c = presetCamera('normal', { width: 1920, height: 1080 }, { side });
      assert.ok(Math.abs(c.project(5, 10.5, 0).s - E.EP_GAUGE.tilePx) < 0.1, side);
    }
    const v = artView(enemyInfo);
    v.sync(sample({ el: 'burn', elFill: 0.5 }), 5);
    frames(v, 1);
    assert.ok(Math.abs(v._elBar.root.scale.x - (v.screen.s / 157.2) * 1.2) < 1e-9, 'no pixel clamp: the ring grows with the tiles');
    v.destroy();
  });

  test('enemies: the client\'s layers in its colours; the white arc is the remaining 元素值', () => {
    const e = artView(enemyInfo);
    e.sync(sample({ el: 'erosion', elFill: 0.4 }), 5);
    frames(e, 1);
    const r = e._elBar;
    assert.equal(r.official, true, 'the client\'s art draws it');
    assert.deepEqual(r.root.children, [r.back, r.color, r.fillBack, r.fill, r.brk, r.hint], 'the prefab\'s order');
    assert.equal(r.color.tint, 0x266ad0, 'WATER\'s enemy colour');
    assert.equal(r.color.texture.width, 27, 'the colour disc at its own 27 px (its rect is 51, the disc centred)');
    assert.equal(r.fill.tint, 0xd5d5d5);
    assert.equal(r.fill.alpha, 1);
    assert.equal(r.left, 0.6);
    assert.equal(r.fill.texture, T.epRadial(`/art${n}/battleUi/slider_ep_fill_enemy`, 0.6), '60 % of the ring, from 12 o\'clock');
    assert.equal(r.fill.scale.x, 1 / T.EP_RADIAL_SCALE, 'the cut frames at their sprite size');
    assert.equal(r.brk.visible, false, 'no burst yet');
    const kids = r.root.children.length;
    frames(e, 30);
    assert.equal(r.root.children.length, kids, 'no per-frame allocation');
    e.sync(sample(), 6);
    frames(e, 1);
    assert.equal(r.root.visible, false, 'hidden once the gauges are empty');
    e.destroy();
  });

  test('an enemy\'s burst: the ring flashes 0.5 s (scale 0.5 → 1.5, fading); the arc refills over the 爆发冷却 at half opacity', () => {
    const e = artView(enemyInfo);
    e.sync(sample({ el: 'apoptosis', elFill: 0.9 }), 10);
    frames(e, 1);
    const r = e._elBar;
    e.sync(sample({ el: 'apoptosis', elFill: 1, elUntil: 25, elDur: 15 }), 10);
    frames(e, 1, 0.1);
    assert.equal(r.brk.visible, true);
    assert.equal(r.brk.tint, 0x1c1c1c, 'DARK\'s burst colour');
    assert.equal(r.brk.scale.x, 0.5);
    assert.equal(r.brk.alpha, 1);
    assert.equal(r.fill.visible, false, 'empty at the burst');
    frames(e, 1, 0.1);
    assert.ok(Math.abs(r.brk.scale.x - 0.7) < 1e-9 && Math.abs(r.hint.alpha - 0.8) < 1e-9, 'growing and fading together');
    frames(e, 5, 0.1);
    assert.equal(r.brk.visible, false, 'over after 0.5 s');
    e.sync(sample({ el: 'apoptosis', elFill: 1, elUntil: 25, elDur: 15 }), 17.5);
    frames(e, 1);
    assert.ok(Math.abs(r.left - 0.5) < 1e-9, 'half refilled halfway through');
    assert.equal(r.fill.alpha, 0.5, 'SetSliderInRecovery: half opacity');
    assert.equal(r.fill.tint, 0xd5d5d5, 'still the white fill, not the element\'s colour');
    e.sync(sample({ el: 'burn', elFill: 0.1 }), 26);
    frames(e, 1);
    assert.equal(r.fill.alpha, 1, 'opaque again after the cooldown');
    assert.equal(r.brk.visible, false, 'a gauge filling again is no burst');
    e.destroy();
  });

  test('operators: the element\'s icon in the ring, a pulse on every hit, a trail that follows each drop, no trail in the refill', () => {
    const op = artView();
    op.sync(sample({ el: 'neural', elFill: 0.2 }), 30);
    frames(op, 1);
    const r = op._elBar;
    assert.deepEqual(r.root.children, [r.hit, r.back, r.color, r.trail, r.fill, r.icon], 'the prefab\'s order');
    assert.equal(r.color.tint, 0x00ffd8, 'SANITY\'s operator colour');
    assert.equal(r.icon.texture.width, 14, 'sprite_ep_icon');
    assert.equal(r.back.alpha, 0.784);
    assert.equal(r.hit.visible, true, 'the first hit pulses');
    frames(op, 30);
    assert.equal(r.hit.visible, false, 'the pulse lasts 0.3 s');
    op.sync(sample({ el: 'neural', elFill: 0.5 }), 31);
    frames(op, 1, 0.05);
    assert.equal(r.hit.visible, true);
    assert.equal(r.hit.tint, 0x00ffd8);
    assert.ok(r.trail.visible && r.trailK > r.left && r.trail.alpha === 0.3, 'the trail still shows the drop');
    frames(op, 60, 0.05);
    assert.equal(r.trail.visible, false, 'and has caught up');
    for (const [el, icon] of [['erosion', 15], ['burn', 14], ['apoptosis', 15]]) {
      op.sync(sample({ el, elFill: 0.6 }), 32);
      frames(op, 1);
      assert.equal(r.icon.texture.width, icon, el);
      assert.equal(r.color.tint, E.EP_GAUGE.el[el].char, el);
    }
    op.sync(sample({ el: 'neural', elFill: 1, elUntil: 40.5, elDur: 10 }), 34);
    frames(op, 1);
    assert.ok(op.elementCooling());
    assert.ok(Math.abs(r.left - 0.35) < 1e-9, `refilled by the cooldown run (${r.left})`);
    assert.equal(r.fill.alpha, 0.5);
    assert.equal(r.trail.visible, false, 'the trail is hidden in the refill');
    op.destroy();
  });

  test('without the art (a fresh install before the download): the element disc and a white arc in the same place', () => {
    const v = view();
    v.sync(sample(), 5);
    frames(v, 2);
    assert.equal(v._elBar, null, 'nothing built without a gauge');
    v.sync(sample({ el: 'burn', elFill: 0.25 }), 5);
    frames(v, 1);
    const r = v._elBar;
    assert.equal(r.official, false);
    assert.equal(r.color.texture, T.hudRings().disc.burn);
    assert.equal(r.fill.texture, T.ringArc(0.75));
    assert.equal(r.icon.visible, false);
    assert.equal(v.elementLeft(), 0.75);
    v.sync(sample({ el: 'burn', elFill: 1, elUntil: 20, elDur: 10 }), 15);
    frames(v, 1);
    assert.equal(r.fill.texture, T.ringArc(0.5));
    assert.equal(r.fill.alpha, 0.5);
    const e = view({ id: 3, side: 'enemy', kind: 'enemy', defId: 'enemy_x', dir: undefined });
    e.sync(sample({ el: 'neural', elFill: 0.5 }), 1);
    frames(e, 1);
    assert.equal(e._elBar.color.texture, T.hudRings().discEnemy.neural);
    v.destroy(); e.destroy();
  });

  test('a burst lock status (爆发冷却) is not repeated in the status row while the element gauge shows it', () => {
    const e = view({ id: 5, side: 'enemy', kind: 'enemy', defId: 'enemy_x', dir: undefined });
    e.onStatus('burnBurst', true);
    e.onStatus('fragile', true);
    assert.deepEqual([...e._iconKeys()], ['burn', 'fragile'], 'no gauge in the feed: the status shows the burst');
    e.sync(sample({ el: 'burn', elFill: 1, elUntil: 20, elDur: 10 }), 12);
    assert.deepEqual([...e._iconKeys()], ['fragile'], 'the element gauge carries the 爆发冷却');
  });

  test('the atlas: one ring frame per step (the redeploy ring), every element disc in both styles', () => {
    const R = T.hudRings();
    assert.equal(R.arcs.length, T.RING_STEPS + 1);
    for (const el of ['neural', 'erosion', 'burn', 'apoptosis', 'necrosis']) { assert.ok(R.disc[el]); assert.ok(R.discEnemy[el]); }
    assert.equal(T.ringArc(0.001), R.arcs[1], 'a sliver never shows as empty');
    assert.equal(T.ringArc(2), R.arcs[T.RING_STEPS]);
  });
});
