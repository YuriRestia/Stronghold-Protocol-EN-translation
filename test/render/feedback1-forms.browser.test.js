// test/render/feedback1-forms.browser.test.js — player reports after 0.1.0 (#5, #8) in headless Chrome: the real sim runs
// in the page (the client runner's loadBrowserSim) and feeds the render demo's field view on 战场#01 (render/app.js fx
// 'phase' / `form` → render/units.js setForm / FORMS):
//   #5 转译基底·α walks on its A_* clips, takes 4 physical hits without losing HP, plays its 2 s A_Die_B change and goes on
//      as 寻仇者 (B_*), dying on B_Die — it used to die in its first form, on B_Die ("加载变身动画然后就没了");
//   #8 a 深池逐火战士 knocked out in front of 百炼嘉维尔 plays 'Die' (its 1 s 重生), stands there as the 隐匿 ember on
//      Idle_2 (blocked, so its blocker beats it) and dies on Die_2 — it used to stay an untargetable ember forever;
//   a view built mid-battle — the real `view.enterBattle(b.fieldMeta())` after a silent catch-up, as for a teammate's
//      field watched later, 联防 observers or a reconnect — starts in the current forms (UnitInfo `form` → render/app.js
//      renderInfo): it used to draw the warrior / the A model again (the look of report #5) and 掠海漂移体 hovering;
//   the real client runner (battle/runner.js createBattleRunner) feeding the view the way screens/game.js does, with
//      blocking 1 s long tasks (every frame a catch-up, and the render clock jumps past its 1.5 game s stale-event
//      window) across the change of a 转译基底·α that walks into 百炼嘉维尔's block: the view turns 幽灵 (C_*) — the
//      catch-up filter, and then render/interp.js's stale-event drop, used to lose the form fx, so it stayed on A_Move
//      and died on B_Die. Whether a stall lands where a queued form fx falls out of the 1.5 game s window depends on the
//      page's frame timing, so this is the real-page check; the deterministic one is test/match/feedback1-runner-forms
//      (the runner feeding the render engine's buffer through a 1.2 s stall).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/feedback1-forms.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshots → test/e2e/out/feedback1-*.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBattleSpec } from '../../server/sim/spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';
/** The view plays the feed a little behind the sim (its interpolation buffer): game seconds allowed after an event. */
const LAG = 0.4;

/** 百炼嘉维尔 facing the lower gate on (9,8) (`row`, `col`: elsewhere); one enemy walking the lower lane (9,10) → (9,2). */
const spec = (enemyKey, id, row = 9, col = 8) => buildBattleSpec({
  battleId: `e2e.${id}`, fieldId: 'n:P1', kind: 'normal', seed: 5, modeId: 'mode_multi_hard', round: 3, stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_4_23_b', row, col, dir: 'RIGHT' }], bonds: {}, playerEffects: [] }],
  spawns: [{ time: 0, enemyKey, routeIndex: 0, count: 1, mods: { hpMul: 1, atkMul: 0.01 } }],
  routes: [{ motion: 'WALK', start: [9, 10], end: [9, 2], checkpoints: [] }], flags: {},
});

/**
 * Run `spec` in the page for `secs` game seconds; `act(b, e, ally)` runs every tick (the test's own interventions).
 * Returns samples { t, clip, form, alive, hp, stealth, blocked } of the enemy's view every 6 ticks.
 */
async function runInPage(page, port, s, enemyKey, secs, actSrc) {
  await page.goto(`http://127.0.0.1:${port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
  await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
  return page.evaluate(async (spec, key, secs, actSrc) => {
    const act = new Function('b', 'e', 'ally', 'state', actSrc);
    const { loadBrowserSim } = await import('/js/battle/runner.js');
    const { data } = await import('/js/data.js');
    const { spec: S, ds } = await loadBrowserSim();
    const b = S.createBattleFromSpec(spec, ds, { quiet: true });
    const v = window.__demo.view;
    v.setStage(data.lookup('stages', spec.stageId));
    b.step();
    const meta = b.fieldMeta();
    v.enterBattle(meta);
    v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
    v.setLocalFeed({ on: true, speed: 2 });
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const out = [];
    const state = {};
    let e = null;
    for (let i = 0; i < 30 * secs; i++) {
      if (!b.finished) b.step();                  // (the view goes on after the end: the death clip)
      const t = Math.max(b.time, (i + 1) / 30);
      e = e ?? b.units.find((x) => x.side === 'enemy' && x.defId === key) ?? null;
      const ally = b.allyUnits[0];
      if (e) act(b, e, ally, state);
      if (i % 3 === 2) {
        const ev = b.drainEvents();
        if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
        v.pushSnapshot(b.snapshot());
        await raf();
        if (i === 30 * 2) await new Promise((r) => setTimeout(r, 2500));   // the Spine models load
        const view = e && v.debug.views.get(e.id);
        if (e && i % 6 === 5) out.push({ t: +t.toFixed(2), clip: view?.actor?.current ?? null, form: view?.form ?? null, spine: !!view?.spineReady, alive: e.alive, hp: e.hp, max: e.s.maxHp, stealth: !!e.s.flags.stealth, blocked: !!e.blockedBy });
      }
    }
    return { out, state };
  }, s, enemyKey, secs, actSrc);
}

/**
 * The late view: `spec` runs silently in the page (events drained and dropped, like the client runner's catch-up) while
 * `setupSrc(b, ally)` changes the enemies' forms; at `atSecs` the field view enters the battle from `b.fieldMeta()` and
 * follows the feed. Returns { [name]: { clip, form, alive } } of the views of the enemies `setupSrc` returns by name.
 */
async function lateViewInPage(page, port, s, atSecs, setupSrc) {
  await page.goto(`http://127.0.0.1:${port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
  await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
  return page.evaluate(async (spec, atSecs, setupSrc) => {
    const setup = new Function('b', 'ally', setupSrc);
    const { loadBrowserSim } = await import('/js/battle/runner.js');
    const { data } = await import('/js/data.js');
    const { spec: S, ds } = await loadBrowserSim();
    const b = S.createBattleFromSpec(spec, ds, { quiet: true });
    const v = window.__demo.view;
    v.setStage(data.lookup('stages', spec.stageId));
    b.step();
    const named = setup(b, b.allyUnits[0]);
    while (b.time < atSecs) { b.step(); b.drainEvents(); }
    const meta = b.fieldMeta();
    v.enterBattle(meta);
    v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
    v.setLocalFeed({ on: true, speed: 2 });
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const read = () => Object.fromEntries(Object.entries(named).map(([k, u]) => {
      const view = v.debug.views.get(u.id);
      return [k, { clip: view?.actor?.current ?? null, form: view?.form ?? null, spine: !!view?.spineReady, alive: u.alive, simForm: u.form }];
    }));
    for (let i = 0; i < 30; i++) {
      b.step();
      if (i % 3 === 2) {
        const ev = b.drainEvents();
        if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
        v.pushSnapshot(b.snapshot());
        await raf();
      }
      if (i === 15) await new Promise((r) => setTimeout(r, 2500));   // the Spine models load
    }
    return read();
  }, s, atSecs, setupSrc);
}

/**
 * The real client runner in the page (fake socket / store, its default sim loader and clock) feeds the demo's view like
 * screens/game.js (field → enterBattle, snap → pushSnapshot, ev → pushEvents); every frame follows a blocking `jankMs`
 * real ms long task, for `secs` real s. Returns samples { t, simForm, form, clip, spine, alive } of the 转译基底·α's view and the
 * runner's catch-up count.
 */
async function runnerInPage(page, port, s, jankMs, secs, calmSecs = 0) {
  await page.goto(`http://127.0.0.1:${port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
  await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
  return page.evaluate(async (spec, jankMs, secs, calmSecs) => {
    const { createBattleRunner } = await import('/js/battle/runner.js');
    const { data } = await import('/js/data.js');
    const v = window.__demo.view;
    v.setStage(data.lookup('stages', spec.stageId));
    const handlers = new Map();
    const net = {
      on(t, fn) { if (!handlers.has(t)) handlers.set(t, new Set()); handlers.get(t).add(fn); return () => handlers.get(t).delete(fn); },
      send() { return true; }, request() { return Promise.resolve({ t: 'ok' }); },
    };
    const queue = [];
    const runner = createBattleRunner({ net, store: { patch() {} }, doc: { hidden: false, addEventListener() {} }, raf: (fn) => { queue.push(fn); return queue.length; }, caf() {} });
    runner.on('field', (f) => { v.enterBattle(f); v.setCamera('normal', { rect: f.rect, side: 'L', instant: true }); v.setLocalFeed({ on: true, speed: f.speed }); });
    runner.on('snap', (x) => v.pushSnapshot(x));
    runner.on('ev', (m) => v.pushEvents(m));
    for (const fn of handlers.get('b.start') || []) fn({ t: 'b.start', battleId: spec.battleId, fieldId: spec.fieldId, kind: 'normal', spec, authoritative: false, watch: true, speed: 2, elapsed: 0 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 100 && !runner._entries.size; i++) await sleep(50);
    const e = [...runner._entries.values()][0];
    const out = [];
    const end = performance.now() + secs * 1000;
    const calmFrom = end;
    const calmEnd = end + calmSecs * 1000;
    while (performance.now() < calmEnd) {
      // a blocking long task (the main thread stalls: the render engine's own ticker stalls too, so its clock jumps
      // jankMs × 2 game s at once — past the 1.5 game s stale-event window), one free frame for the renderer, then the
      // runner's catch-up frame. After `secs` the stalls stop and the frames come smoothly for `calmSecs` (the clips
      // catch up: PIXI caps a frame's delta).
      const calm = performance.now() >= calmFrom;
      if (!calm) {
        const until = performance.now() + jankMs;
        while (performance.now() < until) { /* stall */ }
      }
      await sleep(calm ? 33 : 16);
      for (const fn of queue.splice(0)) fn(performance.now());
      const tr = e.battle.units.find((u) => u.defId === 'enemy_10081_mpplai');
      const view = tr && v.debug.views.get(tr.id);
      if (tr) out.push({ t: +e.battle.time.toFixed(2), simForm: tr.form, form: view?.form ?? null, clip: view?.actor?.current ?? null, spine: !!view?.spineReady, alive: tr.alive, calm });
    }
    const catchups = runner.stats().catchups;
    runner.dispose();
    return { out, catchups };
  }, s, jankMs, secs, calmSecs);
}

describe('player reports after 0.1.0: the models follow the knock-out forms (headless Chrome, real sim)', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  async function page() {
    const p = await browser.newPage(); await p.evaluateOnNewDocument(() => { try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ } }); // (fork) the checks read Chinese msgids
    const problems = [];
    p.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    p.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    p.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    await p.setViewport({ width: 1280, height: 720 });
    return { p, problems };
  }

  test('#5 转译基底·α: A_* while 4 physical hits do nothing, A_Die_B, then 寻仇者 B_*; it dies on B_Die', async () => {
    const { p, problems } = await page();
    try {
      // the operator stands off its lane (no block); at 3 s: 4 physical hits from it (the 4th starts the change); at 9 s:
      // knocked out for good
      const log = await runInPage(p, srv.port, spec('enemy_10081_mpplai', 'translator', 11, 4), 'enemy_10081_mpplai', 12, `
        if (!state.hit && b.time >= 3) { state.hit = b.time; state.hp = e.hp; for (let i = 0; i < 4; i++) b.dealDamage(ally, e, { amount: 1e6, type: 'phys' }); state.after = e.hp; }
        if (!state.kill && b.time >= 9 && e.alive) { state.kill = b.time; b.kill(e, ally); }
      `);
      await p.screenshot({ path: path.join(OUT, 'feedback1-translator.png') });
      const { out, state } = log;
      assert.equal(state.after, state.hp, 'the 4 hits took no HP');
      const pre = out.filter((x) => x.spine && x.t < state.hit);
      assert.ok(pre.length > 0 && pre.every((x) => /^A_/.test(x.clip)), `first form: A_* (${[...new Set(pre.map((x) => x.clip))]})`);
      const change = out.filter((x) => x.t > state.hit + 2 * LAG && x.t < state.hit + 1.8);   // (a loaded machine: the view lags more)
      assert.ok(change.length > 0 && change.every((x) => x.clip === 'A_Die_B' && x.alive), `the change clip (${[...new Set(change.map((x) => x.clip))]})`);
      const form = out.filter((x) => x.t > state.hit + 2 + LAG && x.t < state.kill);
      assert.ok(form.length > 0 && form.every((x) => /^B_/.test(x.clip) && x.form === 'translator_fuchou'), `寻仇者 clips (${[...new Set(form.map((x) => x.clip))]})`);
      const dead = out.filter((x) => x.t > state.kill + LAG);
      assert.ok(dead.length > 0 && dead.every((x) => !x.alive && x.clip === 'B_Die'), `dies on B_Die (${[...new Set(dead.map((x) => x.clip))]})`);
      assert.deepEqual(problems, []);
    } finally {
      await p.close();
    }
  });

  test('#8 深池逐火战士 knocked out in front of 百炼嘉维尔: Die (重生), the 隐匿 ember on Idle_2, beaten, Die_2', async () => {
    const { p, problems } = await page();
    try {
      const log = await runInPage(p, srv.port, spec('enemy_1288_duskls', 'ember'), 'enemy_1288_duskls', 16, `
        if (!state.ko && e.blockedBy && b.time >= 6) { state.ko = b.time; b.kill(e, ally); }
        if (state.ko && !state.dead && !e.alive) state.dead = b.time;
      `);
      await p.screenshot({ path: path.join(OUT, 'feedback1-ember.png') });
      const { out, state } = log;
      assert.ok(state.ko, 'blocked and knocked out');
      const pre = out.filter((x) => x.spine && x.t < state.ko);
      assert.ok(pre.length > 0 && pre.every((x) => !/_2$/.test(x.clip)), `the warrior's clips (${[...new Set(pre.map((x) => x.clip))]})`);
      const reb = out.filter((x) => x.t > state.ko + LAG && x.t < state.ko + 0.9);
      assert.ok(reb.length > 0 && reb.every((x) => x.clip === 'Die' && x.alive), `重生: 'Die' (${[...new Set(reb.map((x) => x.clip))]})`);
      assert.ok(state.dead > state.ko + 1, `the blocker beats the ember (dead at ${state.dead})`);
      const ember = out.filter((x) => x.t > state.ko + 1 + LAG && x.t < state.dead);
      assert.ok(ember.length > 0 && ember.every((x) => x.clip === 'Idle_2' && x.stealth && x.max === 5), `the 隐匿 ember on Idle_2 (${[...new Set(ember.map((x) => x.clip))]})`);
      assert.ok(ember.some((x) => x.hp < 5), 'its hit counter runs down');
      const dead = out.filter((x) => x.t > state.dead + LAG);
      assert.ok(dead.length > 0 && dead.every((x) => x.clip === 'Die_2'), `dies on Die_2 (${[...new Set(dead.map((x) => x.clip))]})`);
      assert.deepEqual(problems, []);
    } finally {
      await p.close();
    }
  });

  test('a view built mid-battle (enterBattle(fieldMeta) after a silent catch-up) starts in the current forms: 特战术师 D_*, 幽灵 C_*, the ember Idle_2 / Move_2, 掠海漂移体 *_02', async () => {
    const { p, problems } = await page();
    try {
      const got = await lateViewInPage(p, srv.port, spec('enemy_1007_slime', 'late', 9, 8), 7.5, `
        ally.base.atk = 0; ally.markDirty();                              // 百炼嘉维尔 only blocks
        const still = { mods: { speedMul: 0 } };
        const shushi = b.spawnEnemy('enemy_10081_mpplai', { pos: [11, 9], ...still });
        const youling = b.spawnEnemy('enemy_10081_mpplai', { pos: [9, 8.4], ...still });   // blocked ⇒ 幽灵
        const ember = b.spawnEnemy('enemy_1288_duskls', { pos: [12, 9], ...still });
        const drift = b.spawnEnemy('enemy_2025_syufo', { pos: [11, 6], ...still });
        for (let i = 0; i < 4; i++) b.dealDamage(ally, shushi, { amount: 1, type: 'arts' });
        b.kill(ember, ally);
        b.applyStatus(drift, 'stun', { duration: 1, source: ally });
        return { shushi, youling, ember, drift };
      `);
      await p.screenshot({ path: path.join(OUT, 'feedback1-lateview.png') });
      assert.deepEqual(Object.fromEntries(Object.entries(got).map(([k, x]) => [k, x.simForm])),
        { shushi: 'translator_shushi', youling: 'translator_youling', ember: 'husk', drift: 'crawl' }, 'the sim\'s forms');
      for (const [k, x] of Object.entries(got)) assert.ok(x.spine && x.alive && x.form === x.simForm, `${k}: a live Spine view in the sim's form (${JSON.stringify(x)})`);
      assert.match(got.shushi.clip, /^D_/, `特战术师 (${got.shushi.clip})`);
      assert.match(got.youling.clip, /^C_/, `幽灵 (${got.youling.clip})`);
      assert.match(got.ember.clip, /^(Idle|Move)_2$/, `the ember (${got.ember.clip})`);
      assert.match(got.drift.clip, /_02$/, `crawling (${got.drift.clip})`);
      assert.deepEqual(problems, []);
    } finally {
      await p.close();
    }
  });
  test('the real client runner with blocking 1 s long tasks (every frame a catch-up, the render clock jumps 2 game s): 转译基底·α blocked by 百炼嘉维尔 turns 幽灵 in the view (C_*), never back to A_Move / B_Die', async () => {
    const { p, problems } = await page();
    try {
      const { out, catchups } = await runnerInPage(p, srv.port, spec('enemy_10081_mpplai', 'runner', 9, 7), 1000, 9, 3);
      await p.screenshot({ path: path.join(OUT, 'feedback1-runner.png') });
      assert.ok(catchups >= 5, `catch-up frames (${catchups})`);
      const changed = out.find((x) => x.simForm === 'translator_youling');
      assert.ok(changed, `the sim's 转译基底·α turned 幽灵 (${JSON.stringify(out.slice(-3))})`);
      const after = out.filter((x) => x.spine && x.t > changed.t + 2 + LAG && x.alive);
      assert.ok(after.length > 0, 'samples after the change');
      // through the stalls the view is in the 幽灵 form (its 2 s change clip may still play: PIXI caps a frame's delta,
      // so a clip advances 0.1 s per stalled frame) — never the first form's walk again
      assert.ok(after.every((x) => x.form === 'translator_youling' && /^(C_|A_Die_C)/.test(x.clip)), `幽灵's clips (${[...new Set(after.map((x) => `${x.form}:${x.clip}`))]})`);
      const calm = after.filter((x) => x.calm);
      assert.ok(calm.length > 0 && /^C_/.test(calm[calm.length - 1].clip), `smooth frames again: 幽灵's own clips (${[...new Set(calm.map((x) => x.clip))]})`);
      assert.ok(!out.some((x) => x.spine && /^B_/.test(x.clip)), 'never the 寻仇者\'s clips (B_Die was the look of report #5)');
      assert.deepEqual(problems, []);
    } finally {
      await p.close();
    }
  });
});
