// (fork) One for All's reveal holds the battlefield build until its picks resolve (public/js/ui/fieldBuildHold.js): the
// build's ~1.7 s main-thread task otherwise held the reveal's beat clock, and the glitch / snap sounds played together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELD_HOLD_MAX_MS, holdFieldBuild, releaseFieldBuild, fieldBuildHeldFor, fieldBuildReady } from '../../public/js/ui/fieldBuildHold.js';
import { ofaTimeline } from '../../public/js/ui/protocolBoot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('field build hold: none by default, so a normal match builds its field at once', async () => {
  releaseFieldBuild();
  assert.equal(fieldBuildHeldFor(), 0);
  const t0 = performance.now();
  await fieldBuildReady();
  assert.ok(performance.now() - t0 < 50);
});

test('field build hold: waits out the hold, is capped, and a release ends it early', async () => {
  holdFieldBuild(120);
  const t0 = performance.now();
  await fieldBuildReady();
  const waited = performance.now() - t0;
  assert.ok(waited >= 110, `waited ${waited} ms`);
  holdFieldBuild(60_000);
  assert.ok(fieldBuildHeldFor() <= FIELD_HOLD_MAX_MS, 'capped');
  setTimeout(releaseFieldBuild, 30);
  const t1 = performance.now();
  await fieldBuildReady();
  assert.ok(performance.now() - t1 < 1000, 'the release is seen within a check');
  releaseFieldBuild();
});

test('field build hold: an aborted mount stops waiting', async () => {
  holdFieldBuild(2000);
  const c = new AbortController();
  setTimeout(() => c.abort(), 20);
  await assert.rejects(fieldBuildReady(c.signal));
  releaseFieldBuild();
});

test('field build hold: the 8-seat reveal resolves inside the cap and leaves BATTLE_CHECK time to build', () => {
  // the worst case: 8 picks, 7 of them losing
  const tl = ofaTimeline(['w', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], 'w');
  assert.ok(tl.unify <= FIELD_HOLD_MAX_MS, `unify ${tl.unify}`);
  assert.ok(7500 - FIELD_HOLD_MAX_MS >= 2500, 'at least 2.5 s of BATTLE_CHECK left for the build');
});

test('field build hold: the mount waits before createFieldView (outside its timeout); only the reveal sets it', () => {
  const host = read('public/js/ui/fieldHost.js');
  const wait = host.indexOf('await fieldBuildReady(controller.signal)');
  const build = host.indexOf('mod.createFieldView(host');
  assert.ok(wait > 0 && build > wait, 'the hold is awaited before the build starts');
  assert.ok(host.indexOf("import('../render/app.js')") < wait, 'the engine import is not held');
  const boot = read('public/js/ui/protocolBoot.js');
  assert.match(boot, /if \(vote && !reducedMotion\(\)\) holdFieldBuild\(tlRef\.current\.unify\)/);
  assert.match(boot, /useEffect\(\(\) => \(vote \? releaseFieldBuild : undefined\), \[vote\]\)/);
  for (const f of ['public/js/screens/game.js', 'public/js/screens/bandDraft.js', 'public/js/render/app.js']) {
    assert.ok(!read(f).includes('holdFieldBuild'), `${f} sets no hold`);
  }
});
