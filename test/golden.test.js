// Golden results (test/golden/README.md, tools/golden.mjs): recompute the deterministic scenario corpus and compare
// every digest with test/golden/*.json — battles (every chess record × skill × module, every bond, the leader and 联防
// fields) and bot-only matches. A behaviour-preserving refactor must leave every digest unchanged; a failure names the
// scenario, the field and old → new. Default: the fast subset (scenarios marked "fast": true in the golden files);
// GOLDEN_FULL=1 checks the whole corpus. GOLDEN_JOBS=N sets the worker threads (default and (fork) cap: 4).
// After an intended gameplay change: `npm run golden:update`, review the diff, commit the files with the change.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { FAMILY_NAMES, scenariosOf, computeDigests, loadGolden, storedDigests, compareFamily, formatDiffs, goldenJobs } from '../tools/golden.mjs';

const FULL = process.env.GOLDEN_FULL === '1';
const JOBS = goldenJobs(process.env.GOLDEN_JOBS);

let digests = null;
// ≈ 7 s (fast) / 20 s (full) with 4 worker threads here; the timeout only stops a hang (a step that never returns)
before(async () => {
  digests = await computeDigests(FAMILY_NAMES, { select: (sc) => FULL || sc.fast, jobs: JOBS });
}, { timeout: 15 * 60_000 });

test('a changed digest value is reported with its scenario, field and old → new', () => {
  const stored = storedDigests(loadGolden('roster'));
  const [id, dg] = Object.entries(stored)[0];
  const changed = structuredClone(dg);
  const row = changed.units[0];
  row[10] += 1; // dmg
  changed.hooks[2] += 1; // tick
  changed.enemies[Object.keys(changed.enemies)[0]][1] += 1; // killed
  const diffs = compareFamily(stored, { [id]: changed });
  assert.equal(diffs.length, 1);
  const text = formatDiffs('roster', diffs);
  assert.match(text, new RegExp(`${id}:`));
  assert.match(text, new RegExp(`\\.units\\[${row[0]}#${row[1]}:${row[3]}\\]\\.dmg: ${row[10] - 1} → ${row[10]}`));
  assert.match(text, /\.hooks\.tick: \d+ → \d+/);
  assert.match(text, /\.enemies\.enemy_\w+\.killed: \d+ → \d+/);
});

test('golden files list exactly the corpus scenarios (regenerate with npm run golden:update after a corpus change)', () => {
  for (const f of FAMILY_NAMES) {
    const doc = loadGolden(f);
    assert.ok(doc, `test/golden/${f}.json is missing: run npm run golden:update`);
    assert.deepEqual(Object.keys(doc.scenarios), scenariosOf(f).map((sc) => sc.id), `test/golden/${f}.json scenario list`);
    for (const sc of scenariosOf(f)) assert.equal(doc.scenarios[sc.id].fast, sc.fast, `${sc.id}: fast flag`);
  }
});

// a stored digest that records engine errors means the corpus was regenerated over a crash (0.2.0: a merge dropped an
// import a kit's tick handler used, and `npm run golden:update` stored 9288 swallowed errors as "the expected result")
test('no stored scenario records engine errors (errors.count is 0 everywhere)', () => {
  for (const f of FAMILY_NAMES) {
    for (const [id, dg] of Object.entries(storedDigests(loadGolden(f)))) {
      if (!dg || typeof dg !== 'object' || !dg.errors) continue;
      // battles: { count, kinds }; matches: { engine, logged, sim, dispatcher }
      const e = dg.errors;
      const n = typeof e.count === 'number' ? e.count : Object.values(e).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      assert.equal(n, 0, `${f} ${id}: ${n} engine error(s) ${JSON.stringify(e)} — fix the crash, then regenerate`);
    }
  }
});

for (const f of FAMILY_NAMES) {
  test(`golden ${f}: ${FULL ? 'every scenario' : 'the fast subset (GOLDEN_FULL=1 for all)'} reproduces its stored digest`, () => {
    const computed = digests[f];
    assert.ok(Object.keys(computed).length > 0, `no ${f} scenario computed`);
    const diffs = compareFamily(storedDigests(loadGolden(f)), computed);
    assert.equal(diffs.length, 0, `${formatDiffs(f, diffs)}\n(an intended gameplay change: npm run golden:update and review the diff — test/golden/README.md)`);
  });
}
