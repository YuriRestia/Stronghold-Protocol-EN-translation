// test/render/oblvns-notes.test.js — 丰川祥子 on the client: render/interp.js carries b.snap `notes` (notesAt, lerped
// between snapshots) and `fever` (sample().fever); render/fx/notes.js draws each note in its owner's look (the outfit
// 旋律的主人 ⇒ blue, else pink), its trail and its hit burst; render/units.js shows the Fever gauge note (headless fake
// PIXI, test/render/fakepixi.js).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer, normalizeSnapshot } from '../../public/js/render/interp.js';
import { TRAIL_LAYERS, TRAIL_S1_W, GLYPH_S1_SCALE, gradAt } from '../../public/js/render/fx/noteTrails.js';
import { bodyZ, SHOT_HEIGHT } from '../../public/js/render/fx/camera.js';

let fake, NoteLayer, noteLookOf, NOTE_LOOKS, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ NoteLayer, noteLookOf, NOTE_LOOKS } = await import('../../public/js/render/fx/notes.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const tuple = (id, x = 5, y = 10) => [id, x, y, 1000, 1000, 0, 0, 0, 0];

describe('interp: b.snap `notes` and `fever`', () => {
  test('normalizeSnapshot keeps well-formed notes and fever rows (fever only for listed units)', () => {
    const s = normalizeSnapshot({ t: 1, units: [tuple(1)], notes: [[7, 1, 6, 10, 1, 0, 's1_3', 1, 4], ['bad'], [8, 1, NaN, 1], [9, 1, 6, 10, 1, 0, 'attack', 0]], fever: [[1, 0.5, 0], [9, 1, 1]] });
    assert.deepEqual([...s.notes.keys()], [7, 9]);
    assert.deepEqual(s.notes.get(7), [7, 1, 6, 10, 1, 0, 's1_3', 1, 4]);
    assert.equal(s.notes.get(9)[8], null, 'no target: null');
    assert.deepEqual([...s.fever.entries()], [[1, [0.5, 0]]]);
  });

  test('notesAt lerps a note present in both snapshots; a new note shows where it is; sample().fever', () => {
    const b = new SnapshotBuffer({ delay: 0 });
    b.push({ t: 1, units: [tuple(1)], notes: [[7, 1, 6, 10, 1, 0, 'attack', 0]], fever: [[1, 0.2, 0]] }, 0);
    b.push({ t: 2, units: [tuple(1)], notes: [[7, 1, 8, 10, 1, 0, 'attack', 1], [8, 1, 5, 10, 1, 0, 'talent', 0]], fever: [[1, 0.4, 0]] }, 0);
    const at = b.notesAt(1.5);
    assert.equal(at.length, 1, 'the older snapshot lists one note');
    assert.equal(at[0].x, 7);
    assert.equal(at[0].state, 1, 'the newer state');
    assert.equal(b.notesAt(2).length, 2);
    assert.deepEqual(b.sample(1.5).get(1).fever, [0.2, 0]);
  });
});

describe('render/fx/notes.js', () => {
  const ctxWith = (views, P) => ({ P, layer: new P.Container(), cam, view: (id) => views.get(id) || null, fxTex: {}, localUrl: () => null });

  test('the look follows the owner\'s outfit: 旋律的主人 ⇒ avemujica (blue), else default (pink)', () => {
    assert.equal(noteLookOf({ info: { model: 'char_4182_oblvns_avemujica#1' } }), 'avemujica');
    assert.equal(noteLookOf({ info: { model: null } }), 'default');
    assert.equal(noteLookOf(null), 'default');
    assert.notEqual(NOTE_LOOKS.default.glow, NOTE_LOOKS.avemujica.glow);
  });

  test('a note is drawn while listed, fades once dropped, and the layer can be cleared; a hit burst comes and goes', () => {
    const P = globalThis.PIXI;
    const views = new Map([[1, { info: { model: 'char_4182_oblvns_avemujica#1' } }], [2, { info: {} }]]);
    const L = new NoteLayer(ctxWith(views, P));
    L.sync([{ id: 7, owner: 1, x: 6, y: 10, hx: 1, hy: 0, look: 's1_2', state: 0 }, { id: 8, owner: 2, x: 6, y: 11, hx: 1, hy: 0, look: 'attack', state: 0 }], 0.016, 1);
    assert.equal(L.notes.size, 2);
    assert.equal(L.notes.get(7).look, 'avemujica');
    assert.equal(L.notes.get(8).look, 'default');
    for (let f = 2; f < 6; f++) L.sync([{ id: 7, owner: 1, x: 6 + f * 0.1, y: 10, hx: 1, hy: 0, look: 's1_2', state: 1 }], 0.016, f);
    assert.ok(L.notes.get(7).pts.length > 1, 'the trail grows');
    for (let f = 6; f < 40; f++) L.sync([], 0.016, f);
    assert.equal(L.notes.size, 0, 'dropped notes fade out');
    L.hit({ id: 7, owner: 1, look: 's2' }, 6, 10);
    assert.equal(L.hits.length, 1);
    for (let f = 0; f < 40; f++) L.sync([], 0.016, 100 + f);
    assert.equal(L.hits.length, 0);
    L.sync([{ id: 9, owner: 1, x: 6, y: 10, hx: 1, hy: 0, look: 'attack', state: 0 }], 0.016, 200);
    L.clear();
    assert.equal(L.notes.size, 0);
    L.destroy();
  });

  test('official effects on: a note is the official prefab only (nothing of ours built); off: ours is the fallback', () => {
    const P = globalThis.PIXI;
    const views = new Map([[1, { info: {} }]]);
    let on = true;
    const flights = [], hits = [];
    const official = {
      active: () => on,
      flight: (owner, look, at) => { const h = { look, at, stopped: false, stop() { this.stopped = true; } }; flights.push(h); return h; },
      hit: (owner, look) => { hits.push(look); return true; },
    };
    const ctx = { ...ctxWith(views, P), official };
    const L = new NoteLayer(ctx);
    const kids = () => L.root.children.length;
    const note = (id, x) => ({ id, owner: 1, x, y: 10, hx: 1, hy: 0, look: 'attack', state: 0 });
    L.sync([note(7, 6)], 0.016, 1);
    assert.equal(flights.length, 1, 'the official prefab draws it');
    assert.equal(kids(), 0, 'no sprite, trail or glow of ours');
    assert.equal(L.notes.get(7).head, undefined);
    L.sync([note(7, 6.5)], 0.016, 2);
    assert.equal(flights[0].at().x, 6.5, 'the prefab follows the note');
    L.hit({ id: 7, owner: 1, look: 'attack' }, 6.5, 10);
    assert.deepEqual(hits, ['attack'], 'the official hit');
    assert.equal(L.hits.length, 0, 'no burst of ours');
    L.sync([], 0.016, 3);
    assert.ok(flights[0].stopped && L.notes.size === 0, 'gone from the snapshot: stopped at once');
    // 官方特效 switched off: a note in flight goes on as ours, a new one is ours
    L.sync([note(8, 6)], 0.016, 4);
    on = false;
    L.sync([note(8, 6.2), note(9, 6)], 0.016, 5);
    assert.ok(flights[1].stopped, 'the official prefab stops');
    assert.ok(L.notes.get(8).head && L.notes.get(9).head, 'both drawn by this layer');
    assert.ok(kids() > 0);
    L.hit({ id: 9, owner: 1, look: 'attack' }, 6, 10);
    assert.equal(L.hits.length, 1, 'our burst');
    // the sandbox comparison: always ours
    on = true;
    L.setMode('ours');
    L.sync([note(10, 6)], 0.016, 6);
    assert.equal(flights.length, 2);
    assert.ok(L.notes.get(10).head);
    L.destroy();
  });

  test("height: born at her launch height, a locked note reaches its enemy's body, the hit bursts there, a free note eases back", () => {
    const P = globalThis.PIXI;
    const sak = { x: 5, y: 10, info: {}, _headTiles: 1.2 }, foe = { x: 9, y: 10, info: {}, _headTiles: 3 };
    const L = new NoteLayer(ctxWith(new Map([[1, sak], [2, foe]]), P));
    const zl = bodyZ(cam(), sak, SHOT_HEIGHT.launch), za = bodyZ(cam(), foe, SHOT_HEIGHT.aim);
    assert.ok(za > zl + 0.1, "the tall enemy's body is above her launch height");
    const at = (x, tgt, f) => L.sync([{ id: 7, owner: 1, x, y: 10, hx: 1, hy: 0, look: 'attack', state: tgt ? 1 : 0, tgt }], 0.016, f);
    at(5, null, 1);
    assert.ok(Math.abs(L.notes.get(7).z - zl) < 1e-9, 'born at her launch height');
    at(5, 2, 2);
    at(7, 2, 3);
    const mid = L.notes.get(7).z;
    assert.ok(mid > zl && mid < za, 'half way there, half way up');
    at(9, 2, 4);
    assert.ok(Math.abs(L.notes.get(7).z - za) < 1e-9, 'at the enemy: its body height');
    assert.ok(L.notes.get(7).pts.every((q) => Number.isFinite(q[3])), 'trail points carry their height');
    L.hit({ id: 7, owner: 1, look: 'attack', tgt: 2 }, 9, 10);
    assert.ok(Math.abs(L.hits[0].z - za) < 1e-9, 'the burst at the struck body');
    for (let f = 5; f < 200; f++) at(9, null, f);
    assert.ok(Math.abs(L.notes.get(7).z - zl) < 1e-3, 'free again: back to her launch height');
    L.destroy();
  });

  test("a boss's HitPoint (ctx.hitPoint, where its official hit spawns): the note bends into it in step with the distance closed, bursts there, and drifts back to its sim path once free", () => {
    const P = globalThis.PIXI;
    const sak = { x: 5, y: 10, info: {}, _headTiles: 1.2 }, boss = { x: 9, y: 10, info: {}, _headTiles: 3, isBoss: true };
    const HP = { x: 8.4, y: 10.6, z: 1.7 };
    const L = new NoteLayer({ ...ctxWith(new Map([[1, sak], [2, boss]]), P), hitPoint: () => HP });
    const at = (x, tgt, f) => L.sync([{ id: 7, owner: 1, x, y: 10, hx: 1, hy: 0, look: 'attack', state: tgt ? 1 : 0, tgt }], 0.016, f);
    at(5, 2, 1);
    const r = L.notes.get(7);
    assert.ok(Math.abs(r.x - 5) < 1e-9 && Math.abs(r.y - 10) < 1e-9, 'launched on its sim path');
    at(7, 2, 2);
    assert.ok(Math.abs(r.x - (7 - 0.3)) < 1e-9 && Math.abs(r.y - 10.3) < 1e-9, 'half way there, half the HitPoint offset');
    at(9, 2, 3);
    assert.ok(Math.abs(r.x - HP.x) < 1e-9 && Math.abs(r.y - HP.y) < 1e-9 && Math.abs(r.z - HP.z) < 1e-9, 'at the boss: its HitPoint');
    assert.deepEqual(r.pts.at(-1).slice(0, 2), [r.x, r.y], 'the trail follows the drawn note');
    L.hit({ id: 7, owner: 1, look: 'attack', tgt: 2 }, 9, 10);
    const h = L.hits[0];
    assert.deepEqual([h.x, h.y, h.z], [HP.x, HP.y, HP.z], 'the burst at the HitPoint');
    for (let f = 4; f < 200; f++) at(9, null, f);
    assert.ok(Math.abs(r.x - 9) < 1e-3 && Math.abs(r.y - 10) < 1e-3, 'free again: back on its sim path');
    L.destroy();
  });

  test('a normal enemy keeps its body centre even when its model has a HitPoint (only bosses aim there)', () => {
    const P = globalThis.PIXI;
    const sak = { x: 5, y: 10, info: {}, _headTiles: 1.2 }, foe = { x: 9, y: 10, info: {}, _headTiles: 3 };
    const L = new NoteLayer({ ...ctxWith(new Map([[1, sak], [2, foe]]), P), hitPoint: () => ({ x: 8.4, y: 10.6, z: 1.7 }) });
    const za = bodyZ(cam(), foe, SHOT_HEIGHT.aim);
    const at = (x, f) => L.sync([{ id: 7, owner: 1, x, y: 10, hx: 1, hy: 0, look: 'attack', state: 1, tgt: 2 }], 0.016, f);
    at(5, 1); at(7, 2); at(9, 3);
    const r = L.notes.get(7);
    assert.ok(Math.abs(r.x - 9) < 1e-9 && Math.abs(r.y - 10) < 1e-9 && Math.abs(r.z - za) < 1e-9, 'on its sim path, at its body height');
    L.hit({ id: 7, owner: 1, look: 'attack', tgt: 2 }, 9, 10);
    assert.deepEqual([L.hits[0].x, L.hits[0].y], [9, 10]);
    assert.ok(Math.abs(L.hits[0].z - za) < 1e-9, 'the burst at its body');
    L.destroy();
  });

  test('trail and glow ring per family (owner 2026-10-16): attack both, talent ring only, S1 trail only, piano both, organ trail only, S3 phys = piano / arts = organ', () => {
    const P = globalThis.PIXI;
    const L = new NoteLayer(ctxWith(new Map([[1, { info: {} }]]), P));
    const want = { attack: [true, true], talent: [false, true], s1_4: [true, false], s2: [true, true], s2_slow: [true, false], s3_phy: [true, true], s3_mag: [true, false] };
    L.sync(Object.keys(want).map((look, i) => ({ id: 20 + i, owner: 1, x: 6, y: 10, hx: 1, hy: 0, look, state: 0 })), 0.016, 1);
    Object.entries(want).forEach(([look, [trail, ring]], i) => {
      const r = L.notes.get(20 + i);
      assert.equal(r.hasTrail, trail, `${look}: trail`);
      assert.equal(!!r.ring, ring, `${look}: ring`);
    });
    L.destroy();
  });
});

describe('render/units.js: the Fever gauge', () => {
  test('a member with a `fever` row shows the note glyph, its fill mask the gauge\'s share; none without the row', () => {
    const P = globalThis.PIXI;
    const ctx = fakeViewCtx(P);
    const v = new UnitView(ctx, { id: 1, kind: 'op', side: 'ally', defId: 'chess_char_6_diy1_a', spine: 'char_4182_oblvns', x: 5, y: 10, maxHp: 1000 });
    const s = { id: 1, x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 10, flags: 0, anim: 0, vx: 0, vy: 0, fever: [0.5, 0] };
    v.sync(s, 0);
    v.update(0.016, cam(), 0.016);
    const r = v._feverHud;
    assert.ok(r && r.root.visible, 'the gauge shows');
    // the mask covers the lower half of the glyph's ink, from its foot up (in the fill's own space)
    const ih = r.ink.y1 - r.ink.y0;
    assert.ok(Math.abs(r.mask.height - (ih * 0.5 + 0.5)) < 1e-6, 'filled to its share');
    assert.ok(Math.abs(r.mask.y + r.mask.height - 0.5 - r.ink.y1) < 1e-6, 'from the foot of the note');
    assert.equal(r.mask.parent, r.fill, 'the mask moves with the fill glyph');
    assert.equal(r.glow.visible, false, 'not ready yet');
    v.sync({ ...s, fever: [1, 0] }, 0);
    v.update(0.016, cam(), 0.032);
    assert.equal(r.glow.visible, true, 'full: ready');
    v.sync({ ...s, fever: null }, 0);
    v.update(0.016, cam(), 0.048);
    assert.equal(r.root.visible, false);
  });
});

describe('render/fx/noteTrails.js: the official trail layers', () => {
  test('every family has its layers in both looks; the default look\'s band is the family\'s red / magenta under white-to-pink strands, not one white core', () => {
    for (const L of ['default', 'avemujica']) for (const f of ['attack', 's1', 's2', 's2_slow', 's3_phy', 's3_mag']) {
      const ls = TRAIL_LAYERS[L][f];
      assert.ok(ls.length >= 3, `${L} ${f}`);
      for (const l of ls) assert.ok(l.w > 0 && l.time > 0 && l.col.length && l.a.length, `${L} ${f} ${l.tex}`);
    }
    const band = TRAIL_LAYERS.default.attack[0];
    assert.equal(band.add, false);
    assert.equal(gradAt(band.col, 1, true), 0xff0000, 'the attack band ends pure red');
    // the strands: white at the head, pink a little behind it
    const strand = TRAIL_LAYERS.default.s1.find((l) => l.tex === 'oblvns_trail_01');
    assert.equal(gradAt(strand.col, 0, true), 0xffffff);
    assert.equal(gradAt(strand.col, 0.6, true), 0xff47a4);
  });

  test('S1: the k-th note\'s trail and glyph shrink with its damage (the client prefabs _01 … _08)', () => {
    assert.equal(TRAIL_S1_W.length, 8);
    for (let k = 1; k < 8; k++) assert.ok(TRAIL_S1_W[k] < TRAIL_S1_W[k - 1]);
    for (const L of ['default', 'avemujica']) for (let k = 1; k < 8; k++) assert.ok(GLYPH_S1_SCALE[L][k] < GLYPH_S1_SCALE[L][k - 1], `${L} ${k}`);
    const P = globalThis.PIXI;
    const L = new NoteLayer({ P, layer: new P.Container(), cam, view: () => ({ info: {} }), fxTex: {}, localUrl: () => null });
    L.sync([1, 8].map((k) => ({ id: k, owner: 1, x: 6, y: 10, hx: 1, hy: 0, look: `s1_${k}`, state: 0 })), 0.016, 1);
    assert.ok(L.notes.get(8).size < L.notes.get(1).size * 0.3, 'the last note is far smaller');
    assert.ok(L.notes.get(8).layers[0].w < L.notes.get(1).layers[0].w * 0.3, 'and its trail narrower');
    L.destroy();
  });
});
