// (fork) test/helpers/matrix.js: the layout-fit browser tests' sample covers every value and every pair, adds the corners,
// stays the same from run to run, and SP_FULL_MATRIX=1 gives the whole product.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matrix, groupBy, picked, label } from './helpers/matrix.js';

const LANGS = ['zh', 'zh-TW', 'en', 'ja', 'ko'];
const SIZES = ['sm', 'md', 'lg', 'xl'];
const SCREENS = [[640, 360], [667, 375], [740, 360], [844, 390], [1920, 1080], [1280, 720]];
const quiet = { log: () => {} };
const key = (c) => Object.values(c).map(label).join('/');

test('pairwise: every value pair of two dimensions is checked together, in far fewer combinations', () => {
  const dims = { lang: LANGS, ts: SIZES, screen: SCREENS };
  const got = matrix('t', dims, quiet);
  const ks = Object.keys(dims);
  for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) {
    for (const x of dims[ks[a]]) for (const y of dims[ks[b]]) {
      assert.ok(got.some((c) => c[ks[a]] === x && c[ks[b]] === y), `${ks[a]}=${label(x)} with ${ks[b]}=${label(y)}`);
    }
  }
  assert.ok(got.length >= 30 && got.length <= 40, `${got.length} of 120`);
  assert.equal(new Set(got.map(key)).size, got.length, 'no combination twice');
});

test('corners bring in every combination that matches them; product order, first dimension outermost', () => {
  const got = matrix('t', { lang: LANGS, ts: SIZES, screen: SCREENS }, { ...quiet, corners: [{ ts: 'xl', screen: [640, 360] }, { lang: 'en', ts: 'xl' }] });
  for (const lang of LANGS) assert.ok(got.some((c) => c.lang === lang && c.ts === 'xl' && label(c.screen) === '640×360'), lang);
  for (const s of SCREENS) assert.ok(got.some((c) => c.lang === 'en' && c.ts === 'xl' && c.screen === s), label(s));
  const idx = (c) => (LANGS.indexOf(c.lang) * SIZES.length + SIZES.indexOf(c.ts)) * SCREENS.length + SCREENS.indexOf(c.screen);
  assert.deepEqual(got.map(idx), got.map(idx).sort((a, b) => a - b));
  assert.throws(() => matrix('t', { lang: LANGS }, { ...quiet, corners: [{ ts: 'xl' }] }), /unknown dimension/);
  assert.throws(() => matrix('t', { lang: LANGS }, { ...quiet, corners: [{ lang: 'fr' }] }), /not one of its values/);
});

test('the same name and seed give the same sample; another name or seed another one; full gives the whole product', () => {
  const dims = { lang: LANGS, ts: SIZES, screen: SCREENS };
  const a = matrix('room-fit phones', dims, quiet).map(key);
  assert.deepEqual(matrix('room-fit phones', dims, quiet).map(key), a);
  assert.notDeepEqual(matrix('room-fit desktops', dims, quiet).map(key), a);
  assert.notDeepEqual(matrix('room-fit phones', dims, { ...quiet, seed: 2 }).map(key), a);
  const all = matrix('room-fit phones', dims, { ...quiet, full: true });
  assert.equal(all.length, 120);
  assert.equal(new Set(all.map(key)).size, 120);
});

test('strength 1 (two dimensions): every value at least once; the log names each combination', () => {
  const lines = [];
  const got = matrix('devices', { dev: ['a', 'b', 'c', 'd', 'e'], page: ['p', 'q', 'r', 's', 't', 'u'] }, { strength: 1, corners: [{ page: 'p' }], log: (l) => lines.push(l) });
  for (const d of ['a', 'b', 'c', 'd', 'e']) assert.ok(got.some((c) => c.dev === d && c.page === 'p'), d);
  for (const p of ['p', 'q', 'r', 's', 't', 'u']) assert.ok(got.some((c) => c.page === p), p);
  assert.ok(got.length < 30);
  assert.equal(lines.length, 1);
  assert.match(lines[0], new RegExp(`^matrix devices: ${got.length} of 30 \\(each value sample \\+ 1 corner, seed 1; SP_FULL_MATRIX=1 runs all\\): a/p, `));
});

test('picked: a partial combination matched by label', () => {
  const got = [{ lang: 'zh', screen: [640, 360] }, { lang: 'en', screen: [1920, 1080] }];
  assert.equal(picked(got, { lang: 'zh', screen: [640, 360] }), true);
  assert.equal(picked(got, { lang: 'zh', screen: [1920, 1080] }), false);
  assert.equal(picked(got, { lang: 'en' }), true);
});

test('groupBy: consecutive rows sharing the keys, in order', () => {
  const rows = [{ l: 'zh', t: 'sm', w: 1 }, { l: 'zh', t: 'sm', w: 2 }, { l: 'zh', t: 'xl', w: 1 }, { l: 'en', t: 'xl', w: 3 }];
  assert.deepEqual(groupBy(rows, 'l').map((g) => [g.l, g.rows.length]), [['zh', 3], ['en', 1]]);
  assert.deepEqual(groupBy(rows, 'l', 't').map((g) => [g.l, g.t, g.rows.map((r) => r.w)]), [['zh', 'sm', [1, 2]], ['zh', 'xl', [1]], ['en', 'xl', [3]]]);
});
