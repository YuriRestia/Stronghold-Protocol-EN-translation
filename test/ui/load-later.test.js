// test/ui/load-later.test.js — (fork) what the game needs now loads first (public/js/loadLater.js): a later load waits
// for the loads registered with needNow and for the <img>s in view, runs one at a time in order, and never waits forever.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
const images = [];
globalThis.document = { images };
const img = (complete, top = 10, height = 50) => ({
  complete, getBoundingClientRect: () => ({ width: 50, height, top, left: 10, bottom: top + height, right: 60 }),
});

const { loadLater, needNow, screenSettled } = await import('../../public/js/loadLater.js');

/** A later load that has not been reached yet would hold the next test's up: wait for this one's turn to pass. */
const settled = async (flag) => { for (let i = 0; i < 80 && !flag(); i++) await sleep(50); };

beforeEach(() => { images.length = 0; });

test('a later load waits for a load the screen needs now, then runs', async () => {
  let finish;
  const model = needNow(new Promise((r) => { finish = r; }));
  assert.equal(screenSettled(), false);
  let ran = false;
  loadLater(() => { ran = true; });
  await sleep(1200);
  assert.equal(ran, false, 'still waiting while the model loads');
  finish();
  await model;
  await settled(() => ran);
  assert.equal(ran, true);
  assert.equal(screenSettled(), true);
});

test('a load that fails frees the screen too', async () => {
  const model = needNow(Promise.reject(new Error('404')));
  await model.catch(() => {});
  await sleep(0);
  assert.equal(screenSettled(), true);
});

test('needNow hands back what it was given, and ignores what is not a load', async () => {
  const p = Promise.resolve(1);
  assert.equal(needNow(p), p);
  assert.equal(needNow(null), null);
  assert.equal(needNow(7), 7);
  await p;
  await sleep(0);
  assert.equal(screenSettled(), true);
});

test('an image in view holds later loads; one finished or out of view does not', () => {
  images.push(img(true));
  assert.equal(screenSettled(), true, 'finished');
  images.push(img(false, 5000));
  assert.equal(screenSettled(), true, 'a lazy image below the fold never loads until scrolled to');
  images.push(img(false, 10, 0));
  assert.equal(screenSettled(), true, 'not laid out');
  images.push(img(false));
  assert.equal(screenSettled(), false, 'in view and loading');
});

test('later loads run one at a time, in order, and a failing one does not stop the rest', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const order = [];
    let finishFirst;
    loadLater(() => new Promise((r) => { order.push('first'); finishFirst = r; }));
    loadLater(() => { order.push('second'); throw new Error('boom'); });
    let done = false;
    loadLater(() => { order.push('third'); done = true; });
    await settled(() => order.length > 0);
    await sleep(900);
    assert.deepEqual(order, ['first'], 'the next waits for the one running');
    finishFirst();
    await settled(() => done);
    assert.deepEqual(order, ['first', 'second', 'third']);
  } finally { console.warn = warn; }
});

test('the callers: art for a later round waits and asks for low priority; the battle waits for its effects itself', () => {
  const game = read('public/js/screens/game.js');
  assert.match(game, /loadLater\(preloadBossPlateArt\)/);
  assert.match(game, /loadLater\(preloadDownedArt\)/);
  assert.match(read('public/js/ui/bossPlates.js'), /img\.fetchPriority = 'low'/);
  assert.match(read('public/js/ui/downedPlate.js'), /img\.fetchPriority = 'low'/);
  const app = read('public/js/render/app.js');
  assert.match(app, /loadLater\(\(\) => \(destroyed \? null : wiring\.ready\(\)\)\)/);
  assert.match(read('public/js/render/vfx/wiring.js'), /async begin\(views\) \{\n\s+if \(!this\.ofx\.active\) return 0;\n\s+await this\.ready\(\);/);
  assert.match(read('public/js/render/units.js'), /needNow\(a\.spine\.acquire\(/);
  assert.match(read('public/js/audio.js'), /await needNow\(Promise\.all\(\[track\.intro/);
  const host = read('public/js/ui/fieldHost.js');
  assert.match(host, /needNow\(import\('\.\.\/render\/app\.js'\)\)/);
  assert.match(host, /const pending = needNow\(/);
  assert.match(read('public/js/main.js'), /loadLater\(\(\) => import\('\.\/render\/app\.js'\)/);
  const runner = read('public/js/battle/runner.js');
  assert.match(runner, /\['LOBBY', 'INFO_CHECK', 'BAND_DRAFT', 'BATTLE_CHECK'\]\.includes\(phase\) && \(!simP \|\| simCs !== wantSim\) && simWarmQueued !== wantSim/);
  assert.match(runner, /sim = await ensureSim\(e\.spec\.cs\)/, 'a battle that starts first loads the simulation itself');
});
