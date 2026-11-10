// test/render/playtest6_elembar.test.js — user playtest #6 report 11, client side: "干员血条右边的元素损伤条积累速度不对，
// 损伤条远远没扣完但是实际已经爆条受到伤害了". The whole display path in Node (headless fake PIXI, test/render/fakepixi.js):
// a real battle (古米 against real 海嗣) → Battle.snapshot() every tick like the client runner → render/interp.js
// SnapshotBuffer with the local-feed clock → sample() → render/units.js UnitView. Checks:
//   · the white arc drawn is the sim's remaining 元素值 at the render clock (within 1 %, never less than what is left,
//     never empty before the burst), the gauge is the element with the least 元素值 left, and the burst shows as a
//     refill (PRTS 元素 "以白条显示剩余的元素值" / "元素条显示缓慢恢复至上限") at half opacity, as the client's
//     SetSliderInRecovery — never the opaque arc of 元素值 left, which while the burst's stun / damage hits would read as
//     "not used up yet, but it burst";
//   · the render clock trails the sim by ≤ 3 ticks;
//   · the gauge is the unit's own: under its own feet, centred on it (the client's HUD root; render/units.js EP_GAUGE).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer } from '../../public/js/render/interp.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { ELEMENT_ORDER, TICK } from '../../server/sim/constants.js';

let fake, UnitView, EP_GAUGE;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, EP_GAUGE } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const OP = 'chess_char_1_10_a'; // 古米

/** Remaining 元素值 share of the element with the least left (the sim's truth), null without a gauge. */
function simLeft(u) {
  let bv = 0, el = null;
  for (const k of ELEMENT_ORDER) if (u.elem[k] > bv) { bv = u.elem[k]; el = k; }
  return el ? { el, left: 1 - bv / u.gaugeMax } : null;
}

/**
 * Run a real battle and render the operator every tick through the client path; returns the per-frame rows
 * { t, renderT, sim (at the snapshot shown), el, share, lock } and the view.
 */
function renderRun(keys, { mods = {}, seconds = 70 } = {}) {
  const h = makeBattle({ units: [{ chessId: OP, row: 10, col: 5 }], seed: 3, autoFinish: false, timeLimit: 600 });
  h.step();
  const pos = [[10, 5.6], [10, 4.4]];
  keys.forEach((k, i) => h.spawn(k, { pos: pos[i], routeIndex: 0, mods: { speedMul: 0, hpMul: 1000, ...mods } }));
  const u = h.allies()[0];
  const info = h.b.fieldMeta().units.find((x) => x.id === u.id);
  const v = new UnitView(fakeViewCtx(fake.P, { cam }), info);
  // the client runner's local feed (render/app.js setLocalFeed): ~2 frames of delay, the battle's speed
  const buf = new SnapshotBuffer({ delay: 0.034, rate: 2, maxRate: 8 });
  const truth = new Map();      // snapshot time → the sim's gauge then
  const out = new Map();
  const rows = [];
  for (let i = 0; i < seconds / TICK; i++) {
    h.step();
    if (u.alive) u.hp = u.s.maxHp; // keep the operator standing: only its gauge matters
    const snap = h.b.snapshot();
    truth.set(snap.t, { g: simLeft(u), lock: !!u.s.flags.burstLock });
    const now = (i + 1) / 60;    // 60 ticks per real second at 2× (DESIGN §4)
    buf.push({ ...snap, gt: snap.t }, now);
    const rt = buf.update(now);
    buf.sample(rt, out);
    const s = out.get(u.id);
    if (!s) continue;
    v.sync(s, rt);
    v.update(1 / 60, cam(), now);
    const shownT = buf.snaps[Math.max(0, buf._indexAt(rt))].t;
    const r = v._elBar;
    rows.push({
      t: snap.t, renderT: rt, sim: truth.get(shownT), el: r && r.root.visible ? v.el : null,
      share: r && r.root.visible ? (r.fill.visible ? r.left : 0) : null,
      alpha: r ? r.fill.alpha : null, v,
    });
  }
  return { rows, v };
}

function checkRows(rows) {
  let bursts = 0, prevLock = false, lastLeftBefore = null;
  for (const row of rows) {
    assert.ok(row.t - row.renderT <= 3 * TICK + 1e-9, `the render clock trails by ≤ 3 ticks (${row.t} vs ${row.renderT})`);
    const { g, lock } = row.sim;
    if (lock) {
      assert.ok(row.el, 'the 爆发冷却 shows');
      if (!prevLock) { bursts++; assert.ok(row.share < 0.02, `the refill starts empty (${row.share})`); }
      assert.equal(row.alpha, EP_GAUGE.recoverAlpha, `t=${row.t}: the refill is drawn at half opacity, not as 元素值 left`);
    } else if (!g) assert.equal(row.el, null, 'no gauge, no row');
    else {
      assert.equal(row.el, g.el, `t=${row.t}: the icon is the element with the least 元素值 left`);
      assert.equal(row.alpha, 1, `t=${row.t}: 元素值 left is the opaque arc`);
      assert.ok(row.share >= g.left - 1e-9, `t=${row.t}: bar ${row.share} never below the real remainder ${g.left}`);
      assert.ok(row.share - g.left < 0.01 + 1e-9, `t=${row.t}: bar ${row.share} within 1 % of ${g.left}`);
      assert.ok(row.share > 0, `t=${row.t}: never empty before the burst`);
      lastLeftBefore = row.share;
    }
    prevLock = lock;
  }
  return { bursts, lastLeftBefore };
}

test('底海滑动者 on 古米: the white bar drawn is the sim\'s remaining 元素值 every frame; the burst comes off a sliver', () => {
  const { rows } = renderRun(['enemy_1148_dssbr'], { seconds: 62 });
  const { bursts } = checkRows(rows);
  assert.equal(bursts, 1, 'the 神经 burst at ≈ 49 game s');
  const before = rows[rows.findIndex((r) => r.sim.lock) - 1];
  assert.ok(before.share <= 0.05, `the last bar before the burst: ${before.share}`);
  // the refill runs over the 10 s 爆发冷却
  const cool = rows.filter((r) => r.sim.lock);
  const mid = cool[Math.floor(cool.length / 2)];
  assert.ok(Math.abs(mid.share - 0.5) < 0.05, `halfway through the cooldown the bar is half refilled (${mid.share})`);
});

test('掠海漂移体 + 骨海漂流体 on 古米 (绝境 R11 ATK ×1.77): chunky 侵蚀 hits — the bar follows every chunk exactly', () => {
  const { rows } = renderRun(['enemy_2025_syufo', 'enemy_2021_syfish'], { mods: { atkMul: 1.771561 }, seconds: 40 });
  const { bursts } = checkRows(rows);
  assert.ok(bursts >= 1);
});

test('the gauge belongs to its unit: centred under its own feet, below its HP / SP bars', () => {
  const { rows, v } = renderRun(['enemy_1148_dssbr'], { seconds: 12 });
  assert.ok(rows.at(-1).el, 'a gauge shows');
  const r = v._elBar;
  const u = v.screen.s / EP_GAUGE.tilePx;
  assert.ok(Math.abs(r.root.position.x - (v.hpBg.position.x + v.hpBg.width / 2)) < 1e-6, 'centred on the unit');
  assert.ok(Math.abs(r.root.position.y - (v.screen.y + EP_GAUGE.charY * u)) < 1e-6, 'below its feet');
  assert.ok(r.root.position.y > v.spFill.position.y, 'under its bars');
});
