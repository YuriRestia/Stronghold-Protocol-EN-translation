// (fork) The impostor cut-offs this fork fixed stay fixed under upstream's measured boxes (GitHub #542, UnitView._impBox):
// Ashlock's cannon when firing and Sankta Miksaparato's skill (4f9b9ce4), Gummy's Summer outfit holding her easel, and
// the melee / ranged twins of the 重炮手 / 领主 models (SpineActor.shot — Horn, Ashlock, Thorns, SilverAsh), clips no
// role names that the box must measure as well. Every clip the unit plays is posed at 30 Hz with the model's own
// Spine runtime and must lie inside the box, unless the box leaves it to a direct draw (`over`). Runs only when
// public/assets has the skeletons (git-ignored).

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ASSETS = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

/** id → { dir, file, entry, fortress, lord } */
const MODELS = {
  ashlock: { id: 'char_431_ashlok', fortress: true },
  horn: { id: 'char_4039_horn', fortress: true },
  thorns: { id: 'char_293_thorns', lord: true },
  silverash: { id: 'char_172_svrash', lord: true },
  miksaparato: { id: 'char_4194_rmixer' },
  gummySummer: { id: 'char_196_sunbr_summer_1', outfit: 'char_196_sunbr@summer#1' },
};
/** (fork) Models whose pose fell between two even samples of the clip measurement (spine.js clipTimes posts key times
 *  too): a pose past both the measured and the extents box before. Key → the clip that left it. */
const KEYED = {
  'char_188_helage': 'Skill', 'char_4226_veen': 'Skill_1_Attack', 'char_2015_dusk': 'Skill3_Attack',
  'char_4065_judge': 'Skill_1_Attack', 'char_4145_ulpia': 'Skill_1_Begin', 'char_1043_leizi2': 'Skill_3_Loop',
  'char_1016_agoat2@epoque#34': 'Skill_3_Loop', 'char_1023_ghost2@boc#6': 'Idle_B', 'char_188_helage@boc#2': 'Skill',
  'char_2015_dusk@nian#7': 'Skill3_Attack', 'char_391_rosmon@epoque#17': 'Attack_A',
  'char_4027_heyak@ambienceSynesthesia#4': 'Skill_3_Loop', 'char_4064_mlynar@iteration#3': 'Skill_3_Loop',
  'char_430_fartth@whirlwind#5': 'Attack_Loop', 'char_491_humus@marthe#10': 'Skill_2_Loop',
};
for (const key of Object.keys(KEYED)) {
  const [charId] = key.split('@');
  const e = key.includes('@') ? ASSETS.outfits?.chars?.[key]?.spine?.front : ASSETS.chars[key]?.spine?.front;
  const file = e?.skel ? decodeURIComponent(e.skel) : '';
  MODELS[key] = { id: path.basename(file, '.skel'), outfit: key.includes('@') ? key : null, charId, clip: KEYED[key] };
}
MODELS.ines = { id: 'char_4087_ines' };
MODELS.inesBoc = { id: 'char_4087_ines_boc_8', outfit: 'char_4087_ines@boc#8' };
for (const m of Object.values(MODELS)) {
  m.entry = m.outfit ? ASSETS.outfits?.chars?.[m.outfit]?.spine?.front : ASSETS.chars[m.id]?.spine?.front;
  m.dir = m.entry?.skel ? path.dirname(path.join(ROOT, 'public', decodeURIComponent(m.entry.skel)))
    : path.join(ROOT, 'public', 'assets', m.outfit ? 'outfit/spine' : 'spine/op', m.id, 'front');
}
const have = (m) => !!m.entry && existsSync(path.join(m.dir, `${m.id}.skel`)) && existsSync(path.join(m.dir, `${m.id}.atlas`));

let spine, units, rt, base, core;
before(async () => {
  class HeadlessCanvas { constructor() { this.width = 16; this.height = 16; } getContext(kind) { return kind === '2d' ? { fillStyle: '', fillRect() {}, clearRect() {}, drawImage() {} } : null; } }
  globalThis.HTMLCanvasElement ??= HeadlessCanvas;
  globalThis.document ??= { createElement: () => new HeadlessCanvas() };
  rt = require('@pixi-spine/runtime-3.8');
  base = require('@pixi-spine/base');
  core = require('@pixi/core');
  globalThis.PIXI = { spine: { Spine: rt.Spine } };
  spine = await import('../../public/js/render/spine.js');
  units = await import('../../public/js/render/units.js');
});

function skeletonData(m) {
  const atlas = new base.TextureAtlas(readFileSync(path.join(m.dir, `${m.id}.atlas`), 'utf8'), (line, cb) => cb(new core.BaseTexture(null, { width: 1024, height: 1024 })));
  return new rt.SkeletonBinary(new rt.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(readFileSync(path.join(m.dir, `${m.id}.skel`))));
}

/** A real actor and the box its battle view builds (UnitView._impBox on a stand-in view), once its clips are measured. */
function unit(m) {
  const a = new spine.SpineActor(skeletonData(m), m.entry);
  const view = Object.assign(Object.create(units.UnitView.prototype), {
    actor: a, lodIdle: false, fortress: !!m.fortress, lord: !!m.lord, info: { spine: m.charId || m.id, defId: m.charId || m.id },
  });
  let box = view._impBox();
  for (let frames = 0; !box && frames < 100000; frames++) { spine.stepClipBounds(50); box = view._impBox(); }
  assert.ok(box, 'the box is measured');
  return { a, view, box };
}

const V = new Float32Array(1 << 15);
/** The skeleton's drawn geometry now (slots drawn at alpha 0 skipped), [x0, y0, x1, y1]. */
function drawn(skel) {
  const r = [Infinity, Infinity, -Infinity, -Infinity];
  for (const slot of skel.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !slot.bone.active || slot.color.a * att.color.a <= 0.004) continue;
    let n = 0;
    if (att instanceof rt.RegionAttachment) {
      if (!att.offsetDone) { att.updateOffset(); att.offsetDone = true; }
      att.computeWorldVertices(slot.bone, V, 0, 2);
      n = 8;
    } else if (att instanceof rt.MeshAttachment) {
      n = att.worldVerticesLength;
      att.computeWorldVertices(slot, 0, n, V, 0, 2);
    }
    for (let k = 0; k < n; k += 2) { r[0] = Math.min(r[0], V[k]); r[2] = Math.max(r[2], V[k]); r[1] = Math.min(r[1], V[k + 1]); r[3] = Math.max(r[3], V[k + 1]); }
  }
  return r;
}
function drawnAt(a, clip, t) {
  const sp = a.spine;
  sp.state.clearTracks();
  sp.skeleton.setToSetupPose();
  const e = sp.state.setAnimation(0, clip, false);
  e.mixDuration = 0;
  sp.update(t);
  return drawn(sp.skeleton);
}
const rectOf = (b) => [b.x0, b.y0, b.x0 + b.w, b.y0 + b.h];
/** How far `p` reaches past `r` (≤ 0: inside). */
const past = (r, p) => Math.max(r[0] - p[0], p[2] - r[2], r[1] - p[1], p[3] - r[3]);

/** The worst pose of `clips` (default: every clip the view plays) against the box, `over` clips skipped. */
function worstPose(a, view, box, clips = [...view._clipNames().keys()]) {
  const r = rectOf(box);
  let worst = -Infinity, at = '';
  for (const name of clips) {
    if (box.over.has(name)) continue;
    const d = a.dur(name);
    for (let k = 0; k <= Math.ceil(d * 30); k++) {
      const time = Math.min(d, k / 30);
      const e = past(r, drawnAt(a, name, time));
      if (e > worst) { worst = e; at = `${name} ${time.toFixed(2)} s`; }
    }
  }
  return { worst, at };
}

const skipOf = (...ms) => !ms.every(have) && 'the skeletons are not in public/assets (npm run assets)';

describe('impostor boxes of the models this fork fixed (render/units.js _impBox)', () => {
  test('Ashlock: the cannon (Attack01) and the shield bash twin (Attack02) are measured and inside the box', { skip: skipOf(MODELS.ashlock) }, () => {
    const { a, view, box } = unit(MODELS.ashlock);
    const clips = view._clipNames();
    assert.ok(clips.has('Attack01') && clips.has('Attack02'), `the melee twin is one of the box's clips (${[...clips.keys()]})`);
    assert.ok(!box.over.has('Attack01') && !box.over.has('Attack02'), 'both attacks play as an impostor');
    const { worst, at } = worstPose(a, view, box, ['Attack01', 'Attack02']);
    assert.ok(worst <= 0, `${at} is ${worst.toFixed(1)} units past the box`);
    assert.ok(rectOf(box)[2] >= ASSETS.chars.char_431_ashlok.spine.front.extents.Attack01[2], 'the box reaches the cannon\'s firing reach');
  });

  test('Horn: the cannon twins (Attack_B, Skill_3_B_Loop) are measured and inside the box', { skip: skipOf(MODELS.horn) }, () => {
    const { a, view, box } = unit(MODELS.horn);
    const clips = view._clipNames();
    const twins = ['Attack_B', 'Skill_3_B_Loop'].filter((n) => a.has(n));
    assert.ok(twins.length, 'the model has its _B twins');
    for (const n of twins) assert.ok(clips.has(n), `${n} is one of the box's clips`);
    const { worst, at } = worstPose(a, view, box, twins);
    assert.ok(worst <= 0, `${at} is ${worst.toFixed(1)} units past the box`);
  });

  test('Thorns (Attack_2) and SilverAsh (Combat): the lords\' other attack is measured and inside the box', { skip: skipOf(MODELS.thorns, MODELS.silverash) }, () => {
    for (const [m, twin] of [[MODELS.thorns, 'Attack_2'], [MODELS.silverash, 'Combat']]) {
      const { a, view, box } = unit(m);
      assert.ok(view._clipNames().has(twin), `${m.id}: ${twin} is one of the box's clips`);
      const { worst, at } = worstPose(a, view, box, [twin]);
      assert.ok(worst <= 0, `${m.id}: ${at} is ${worst.toFixed(1)} units past the box`);
    }
  });

  test('a unit that is neither 重炮手 nor 领主 does not measure twins', { skip: skipOf(MODELS.ashlock) }, () => {
    const m = { ...MODELS.ashlock, fortress: false };
    const view = Object.assign(Object.create(units.UnitView.prototype), {
      actor: new spine.SpineActor(skeletonData(m), m.entry), lodIdle: false, info: { spine: m.id, defId: m.id },
    });
    assert.ok(!view._clipNames().has('Attack02'));
  });

  const named = ['ashlock', 'horn', 'thorns', 'silverash', 'miksaparato', 'gummySummer'].map((k) => MODELS[k]);
  test('every model above: every clip it plays, at 30 Hz, inside the box unless left to a direct draw', { skip: skipOf(...named) }, (t) => {
    for (const m of named) {
      const { a, view, box } = unit(m);
      const { worst, at } = worstPose(a, view, box);
      t.diagnostic(`${m.id}: closest to the edge ${(-worst).toFixed(1)} units inside (${at}); over: ${[...box.over].join(', ') || '—'}`);
      assert.ok(worst <= 0, `${m.id}: ${at} is ${worst.toFixed(1)} units past the box`);
    }
  });

  test('Gummy\'s Summer outfit: the easel (a sprite attachment) is inside the idle box', { skip: skipOf(MODELS.gummySummer) }, () => {
    const { a, box } = unit(MODELS.gummySummer);
    const idle = drawnAt(a, 'Idle', 0);
    assert.ok(idle[0] <= -195, `the easel reaches x ${idle[0].toFixed(0)}`);
    assert.ok(past(rectOf(box), idle) <= 0, 'inside the box');
  });
});

describe('widenByExtents: the measured box grown to the build-time extents', () => {
  const names = new Map([['Idle', false], ['Attack', false], ['Start', true]]);
  const box = { x0: -200, y0: -400, w: 400, h: 440, over: new Set(['Start']) };
  test('grows to the kept clips\' extents (padded), never past an `over` clip, never smaller', () => {
    const ext = { Idle: [-150, -350, 150, 20], Attack: [-150, -350, 300, 20], Start: [-150, -3000, 150, 20] };
    const b = units.widenByExtents(box, ext, names);
    const pad = 24 + 0.04 * 450;
    assert.equal(b.x0 + b.w, 300 + pad, 'the attack\'s reach');
    assert.equal(b.x0, -200, 'the measured side kept');
    assert.equal(b.y0, -400, 'the deploy drop stays a direct draw');
    assert.equal(b.over, box.over);
    assert.equal(box.w, 400, 'the input untouched');
  });
  test('nothing to add: the same box', () => {
    assert.equal(units.widenByExtents(box, { Idle: [-100, -300, 100, 0] }, names), box);
    assert.equal(units.widenByExtents(box, undefined, names), box);
    assert.equal(units.widenByExtents(box, { Idle: [NaN, 0, 0, 0] }, names), box);
  });
});

describe('poses between two even samples: the clip measurement posts key times too (spine.js clipTimes)', () => {
  const keyed = Object.keys(KEYED).map((k) => MODELS[k]);
  test('every clip of the 15 models a roster sweep found past both boxes, at 30 Hz, inside the box now', { skip: skipOf(...keyed) }, (t) => {
    for (const m of keyed) {
      const { a, view, box } = unit(m);
      const { worst, at } = worstPose(a, view, box);
      t.diagnostic(`${m.outfit || m.id}: closest to the edge ${(-worst).toFixed(1)} units inside (${at})`);
      assert.ok(worst <= 0, `${m.outfit || m.id}: ${at} is ${worst.toFixed(1)} units past the box`);
    }
  });
});

describe('a crossfade draws nothing far from both of its clips (SpineActor._mixGuard)', () => {
  /** A real actor, its clips measured, driven like a battle unit: attacks every `iv` s without a wind-up, `frames` at 60 fps. */
  function drive(m, iv, frames, onFrame) {
    const a = new spine.SpineActor(skeletonData(m), m.entry);
    const names = [...new Set(Object.keys(m.entry.animations || {}))];
    while (a.clipBounds(names) === null) spine.stepClipBounds(1000);
    a.update(1.3);
    let t = 0, next = 0.3;
    for (let f = 0; f < frames; f++) {
      if (t >= next) { a.attack(iv); next += iv; }
      a.update(1 / 60); t += 1 / 60;
      onFrame(a, t);
    }
    return a;
  }
  /** The visible slots drawn past `x` (or above `y` from below: `dy`), as [slot, alpha]. */
  function drawnPast(a, { x = Infinity, y = Infinity }) {
    const out = [];
    for (const sl of a.spine.skeleton.drawOrder) {
      const att = sl.getAttachment();
      if (!att || !sl.bone.active || !a.spine.slotContainers[sl.data.index].visible) continue;
      const al = sl.color.a * att.color.a;
      if (al <= 0.004) continue;
      let n = 8;
      if (att instanceof rt.RegionAttachment) { att.updateOffset(); att.computeWorldVertices(sl.bone, V, 0, 2); }
      else if (att instanceof rt.MeshAttachment) { n = att.worldVerticesLength; att.computeWorldVertices(sl, 0, n, V, 0, 2); }
      else continue;
      for (let k = 0; k < n; k += 2) if (V[k] > x || V[k + 1] > y) { out.push([sl.data.name, al]); break; }
    }
    return out;
  }

  test('伊内丝 Ines: her slashes (A1–A4, parked ~1600 units to her right at alpha 0) never show away from her blade', { skip: skipOf(MODELS.ines) }, () => {
    let seen = 0, mixing = 0;
    for (const iv of [0.6, 0.9, 1.25, 1.6]) {
      drive(MODELS.ines, iv, 60 * 5, (a) => {
        if (a.spine.state.tracks[0]?.mixingFrom) mixing++;
        const far = drawnPast(a, { x: 420 });
        if (far.length) seen++;
        assert.deepEqual(far, [], `nothing drawn past x 420 (her measured clips reach ${Math.round(MODELS.ines.entry.extents.Attack[2])})`);
      });
    }
    assert.ok(mixing > 0 && seen === 0, 'crossfades happened, none drew a slash away from her');
  });

  test('伊内丝\'s \'boc\' outfit: the crossfade back to idle no longer slides her body up from 900 units below her', { skip: skipOf(MODELS.inesBoc) }, () => {
    drive(MODELS.inesBoc, 0.7, 60 * 3, (a, t) => {
      const far = drawnPast(a, { y: 200 });
      assert.deepEqual(far, [], `at ${t.toFixed(2)} s nothing drawn below y 200 (her clips reach ${Math.round(MODELS.inesBoc.entry.extents.Idle[3])})`);
    });
  });

  test('伊内丝\'s \'boc\' outfit: her attack swaps to a second body rig; no crossfade blends that rig in from its parked pose (the "dash in from the left")', { skip: skipOf(MODELS.inesBoc) }, () => {
    const ref = new rt.Skeleton(skeletonData(MODELS.inesBoc));
    for (const iv of [0.7, 1, 1.4]) {
      drive(MODELS.inesBoc, iv, 60 * 4, (a, t) => {
        const tr = a.spine.state.tracks[0];
        if (!tr) return;
        ref.setToSetupPose();
        tr.animation.apply(ref, tr.getAnimationTime(), tr.getAnimationTime(), false, null, 1, 0, 0);
        ref.updateWorldTransform();
        for (const sl of a.spine.skeleton.drawOrder) {
          const att = sl.getAttachment();
          if (!att || !sl.bone.active || !a.spine.slotContainers[sl.data.index].visible || sl.color.a * att.color.a <= 0.004) continue;
          const b = ref.bones[sl.bone.data.index];
          const off = Math.hypot(b.worldX - sl.bone.worldX, b.worldY - sl.bone.worldY);
          assert.ok(off < 200, `${t.toFixed(2)} s ${tr.animation.name}: ${sl.data.name} drawn ${Math.round(off)} units from its own pose`);
        }
      });
    }
  });

  test('a crossfade inside both clips keeps every slot and its blend', { skip: skipOf(MODELS.ashlock) }, () => {
    let mixed = 0;
    drive(MODELS.ashlock, 1.3, 60 * 4, (a) => {
      const tr = a.spine.state.tracks[0];
      if (!tr?.mixingFrom) return;
      mixed++;
      for (const sl of a.spine.skeleton.drawOrder) {
        if (sl.getAttachment()) assert.ok(a.spine.slotContainers[sl.data.index].visible, `${sl.data.name} stays drawn`);
      }
    });
    assert.ok(mixed > 0, 'his attacks crossfade');
  });
});

describe('the build-time extents stay the fallback (no runtime to measure with)', () => {
  test('a runtime that cannot be posed: the box comes from SpineActor.extents and grows with the clips played', () => {
    const ext = { Idle: [-200, -450, 360, 60], Attack01: [-230, -456, 412, 60] };
    let seen = ext.Idle;
    const actor = { entry: { anims: { idle: 'Idle' } }, has: () => true, clipBounds: () => false, extents: () => seen, spine: { getLocalBounds: () => null } };
    const view = Object.assign(Object.create(units.UnitView.prototype), { actor, lodIdle: true, info: { spine: 'x', defId: 'x' } });
    const b1 = view._impBox();
    assert.ok(b1.src === ext.Idle && b1.over.size === 0 && b1.x0 + b1.w > 360);
    assert.equal(view._impBox(), b1, 'unchanged extents: the same box');
    seen = [-230, -456, 412, 60];
    const b2 = view._impBox();
    assert.notEqual(b2, b1);
    assert.ok(b2.x0 + b2.w > 412, 'the attack\'s reach is in the box');
  });

  test('the sandbox\'s old box (legacyImpostorBox) and back', () => {
    let legacy = true;
    const actor = { entry: { anims: { idle: 'Idle' } }, has: () => true, clipBounds: () => false, extents: () => [-200, -450, 360, 60], spine: { getLocalBounds: () => null } };
    const view = Object.assign(Object.create(units.UnitView.prototype), { actor, lodIdle: true, info: { spine: 'x', defId: 'x' }, ctx: { legacyImpostorBox: () => legacy } });
    assert.equal(view._impBox().legacy, true);
    legacy = false;
    assert.ok(view._impBox().src, 'the extents box again');
  });
});
