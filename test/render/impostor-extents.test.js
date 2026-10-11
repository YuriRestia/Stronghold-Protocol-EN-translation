// Impostor boxes from per-clip extents (render/spine.js SpineActor.extents, tools/assets/skel.mjs clipExtents): a box
// built from the first rendered pose cut later poses off at its edge (Ashlock's cannon when firing, Sankta
// Miksaparato's skill). The model check runs only when public/assets has Ashlock's skeleton (git-ignored).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpineActor } from '../../public/js/render/spine.js';
import { clipExtents, skelParserAvailable } from '../../tools/assets/skel.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A stand-in actor: the manifest extents, its roles and the clips on its tracks. */
function fakeActor(extents, tracks = []) {
  const a = Object.create(SpineActor.prototype);
  a.entry = { extents };
  a.roles = { idle: 'Idle', deploy: 'Start', skill: null };
  a.names = new Set(Object.keys(extents || {}));
  a.skillOn = false;
  a.mode = 'base';
  a.spine = { state: { tracks } };
  return a;
}
const track = (name, from = null) => ({ animation: { name }, mixingFrom: from });

const EXT = {
  Idle: [-200, -450, 360, 60],
  Attack: [-230, -456, 412, 60],
  Skill: [-347, -1668, 460, 139],
  Start: [-190, -2331, 369, 64],
};

test('the box starts at the idle clip and grows with the clips played', () => {
  const a = fakeActor(EXT);
  const idle = a.extents();
  assert.deepEqual(idle, EXT.Idle);
  assert.equal(a.extents(), idle, 'unchanged box keeps its identity (units.js rebuilds on a new one)');
  a.spine.state.tracks = [track('Attack')];
  assert.deepEqual(a.extents(), [-230, -456, 412, 60]);
  a.spine.state.tracks = [track('Idle', track('Skill'))]; // mixing out of the skill still counts
  assert.deepEqual(a.extents(), [-347, -1668, 460, 139]);
  a.spine.state.tracks = [track('Idle')];
  assert.deepEqual(a.extents(), [-347, -1668, 460, 139], 'never shrinks');
});

test('the deploy clip counts only while it plays', () => {
  const a = fakeActor(EXT, [track('Start')]);
  a.mode = 'deploy';
  assert.deepEqual(a.extents(), [-200, -2331, 369, 64]);
  a.mode = 'base';
  a.spine.state.tracks = [track('Idle')];
  assert.deepEqual(a.extents(), EXT.Idle);
});

test('no extents (an older manifest): null, the caller keeps its fallback', () => {
  assert.equal(fakeActor(undefined).extents(), null);
});

test('the manifest carries Ashlock\'s firing reach', () => {
  const m = JSON.parse(readFileSync(join(root, 'data', 'assets.json'), 'utf8'));
  const e = m.chars?.char_431_ashlok?.spine?.front?.extents;
  assert.ok(e && e.Attack01 && e.Idle, 'per-clip extents');
  assert.ok(e.Attack01[2] > e.Idle[2], 'the attack reaches past the idle pose');
});

const skel = join(root, 'public/assets/spine/op/char_431_ashlok/front/char_431_ashlok');
test('clipExtents samples every clip of a model', { skip: !existsSync(skel + '.skel') || !skelParserAvailable() }, () => {
  const e = clipExtents(readFileSync(skel + '.skel'), readFileSync(skel + '.atlas', 'utf8'));
  assert.ok(e && Object.keys(e).length >= 10);
  for (const b of Object.values(e)) assert.ok(b[2] > b[0] && b[3] > b[1]);
  assert.ok(e.Start[1] < e.Idle[1] - 1000, 'the deploy drop starts far above');
});
