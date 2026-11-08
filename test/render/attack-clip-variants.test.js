// (fork) An attack's clip follows the official pick that also picks its effects: render/vfx/wiring.js ATTACK_CLIPS +
// FxWiring.attackClip, render/spine.js SpineActor._attackClip, render/app/windup.js. The operators and their sources are
// listed at ATTACK_CLIPS; the wiring's own cases on a fake index are in test/render/vfx-areas.test.js.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { installFakePixi } from './fakepixi.js';
import { ATTACK_CLIPS, seedOf } from '../../public/js/render/vfx/wiring.js';

const assets = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8'));
const indexUrl = new URL('../../public/assets/local/fx/index.json', import.meta.url);

let SpineActor, restore;
before(async () => {
  restore = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => { if (typeof restore === 'function') restore(); });

function actor(id, slot) {
  const entry = assets.chars[id].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(slot);
  return a;
}

describe('ATTACK_CLIPS against the data', () => {
  test('every clip of the table is on the operator\'s default model', () => {
    for (const [id, row] of Object.entries(ATTACK_CLIPS)) {
      const clips = assets.chars[id]?.spine?.front?.animations;
      assert.ok(clips, `${id} has a model`);
      for (const n of row.clips) assert.ok(n in clips, `${id} ${n}`);
    }
  });

  test('every outfit of the table\'s operators has those clips', () => {
    for (const [oid, o] of Object.entries(assets.outfits.chars)) {
      const row = ATTACK_CLIPS[oid.split('@')[0]];
      const clips = o.spine?.front?.animations;
      if (!row || !clips) continue;
      for (const n of row.clips) assert.ok(n in clips, `${oid} ${n}`);
    }
  });

  test('with the local index: every ability and emitter clip of the table\'s operators resolves into its clips', { skip: !existsSync(indexUrl) }, () => {
    const idx = JSON.parse(readFileSync(indexUrl, 'utf8'));
    const leaves = (x) => (Array.isArray(x?.abilities) && x.abilities.length ? x.abilities.filter(Boolean).flatMap(leaves) : [x]);
    for (const [id, row] of Object.entries(ATTACK_CLIPS)) {
      let picks = 0;
      for (const m of idx.units[id]?.modes || []) {
        for (const a of [m.attack, m.combat]) {
          if (!a) continue;
          const groups = a.select && /^(?:random|loop|sequential)$/.test(a.select.method);
          for (const x of leaves(a)) {
            const ems = (x.emitters || []).filter((e) => e?.replaceAnims?.length);
            const keys = ems.length ? ems.flatMap((e) => e.replaceAnims) : groups ? [x.animKey || String(x.node).split('/').pop()] : [];
            for (const k of keys) {
              picks++;
              const clip = row.map?.[m.name]?.[k] ?? row.map?.['*']?.[k] ?? k;
              assert.ok(row.clips.includes(clip), `${id} ${m.name}: ${k} → ${clip}`);
            }
          }
        }
      }
      assert.ok(picks > 0, `${id} picks between clips`);
    }
  });
});

describe('SpineActor: the picked clip in place of the role\'s loop', () => {
  test('the attack role: the pick replaces its loop and keeps its Begin / End; a clip the model lacks is ignored', () => {
    const a = actor('char_1045_svash2', 0);
    assert.equal(a._attackClip().loop, 'Attack_A');
    a.attackVariant = 'Attack_B';
    assert.deepEqual([a._attackClip().begin, a._attackClip().loop, a._attackClip().end], ['Attack_Begin', 'Attack_B', 'Attack_End']);
    a.attackVariant = 'Attack_Z';
    assert.equal(a._attackClip(), a.roles.attack);
  });

  test('a skill role: its idle and its End stay the skill\'s under the pick', () => {
    const a = actor('char_1046_sbell2', 2);
    a.setSkill(true);
    const sk = a.roles.skill;
    assert.equal(a._attackBase(), sk);
    const idle = a._skillIdle();
    assert.equal(idle, 'Skill_3_Idle');
    a.attackVariant = 'Skill_3_Attack_B';
    assert.equal(a._attackClip().loop, 'Skill_3_Attack_B');
    assert.equal(a._attackBase(), sk, 'the role itself, not a copy');
    assert.equal(a._skillIdle(), idle, 'the pose between its attacks');
    assert.ok(a._isSkillLoop('Skill_3_Attack_B'), 'the skill\'s End follows it');
    assert.ok(a._isSkillLoop(sk.loop));
    assert.ok(!a._isSkillLoop('Skill_3_Attack_C'));
    a.attackVariant = null;
    a._attackClip();
    assert.ok(!a._isSkillLoop('Skill_3_Attack_B'), 'no pick now: the last one no longer counts');
  });

  test('a lord\'s twin swap leaves the pick alone', () => {
    const a = actor('char_4082_qiubai', 0);
    a.shot = 'ranged';
    assert.equal(a._shot('Combat_A'), 'Combat_B', 'the swap, without a pick');
    a.attackVariant = 'Combat_A';
    assert.equal(a._shot('Combat_A'), 'Combat_A');
  });
});

describe('an instant skill that replaces the coming attack (Vina Victoria S1)', () => {
  test('the wind-up swings the skill clip and the strike keeps it: no restart from frame 0', () => {
    const a = actor('char_1019_siege2', 0);
    assert.equal(a._skillOnceClip(), 'Skill_1');
    a.skillAhead = true;
    assert.equal(a.windUp(1.3, 0.2), true);
    assert.equal(a.current, 'Skill_1', 'wound up on the skill clip');
    const track = a.spine.state.tracks[0];
    assert.equal(!!track.loop, false, 'played once: a loop wraps to frame 0 and swings again after the strike');
    a.update(0.2);
    a.setSkill(true);
    assert.equal(a.mode, 'attack', 'the swing goes on');
    a.attack(1.3);
    assert.equal(a.spine.state.tracks[0], track, 'the same track: no second play');
    assert.equal(a.skillAhead, false);
    a.setSkill(false);
    assert.equal(a.current, 'Skill_1', 'the clip plays out after the skill switched off');
    a.update(1.5);
    assert.equal(a.mode, 'base');
    assert.equal(a.skillEndPending, false);
    assert.equal(a.skillClipOnce, false);
  });

  test('SP full: the swing starts from frame 0 one wind-up before the predicted strike, then meets its real attack', () => {
    const a = actor('char_1019_siege2', 0);
    a.attack(1.267);
    assert.equal(a.skillSwingLead(), null, 'no word from the view yet');
    a.skillNext = true;
    assert.ok(Math.abs(a.skillSwingLead() - 1.267) < 1e-9, 'the last strike plus the interval');
    a.update(1.267 - 0.633);
    a.skillAhead = true;
    assert.equal(a.windUp(1.267, a.skillSwingLead()), true);
    assert.equal(a.current, 'Skill_1');
    assert.ok(a.spine.state.tracks[0].trackTime < 0.05, 'from frame 0: the leap plays whole');
    a.skillSwung = true;
    assert.equal(a.skillSwingLead(), null, 'once per charge');
    a.update(0.5);
    assert.equal(a.windUp(1.267, 0.2), false, 'the real attack retimes it, no second start');
    assert.equal(a.current, 'Skill_1');
    a.setSkill(true);
    a.attack(1.267);
    assert.equal(a.current, 'Skill_1', 'the strike keeps it');
    assert.equal(a.skillSwung, false);
  });

  test('the first attack: timed by when an enemy it can hit reaches its range', () => {
    const a = actor('char_1019_siege2', 0);
    a.skillNext = true;
    assert.equal(a.skillSwingLead(undefined), null, 'no last strike and no range data: nothing to time it by');
    assert.equal(a.skillSwingLead(null), null, 'no enemy coming');
    assert.equal(a.skillSwingLead(0.4), 0.4, 'ready from the start: the enemy\'s arrival');
    a.attack(1.267);
    a.skillNext = true;
    a.update(0.3);
    assert.ok(Math.abs(a.skillSwingLead(0) - 0.967) < 1e-9, 'an enemy there already: the cooldown');
    assert.ok(Math.abs(a.skillSwingLead(2) - 2) < 1e-9, 'the later of the two');
  });

  test('a predicted swing whose attack does not come holds before the blow, then gives up until the next strike', () => {
    const a = actor('char_1019_siege2', 0);
    a.skillNext = true;
    a.skillAhead = true;
    assert.equal(a.windUp(1.267, 0.5), true);
    a.skillSwung = true;
    const e = a.spine.state.tracks[0];
    e.trackTime = 0.6;   // the test track does not advance by itself: just before the blow (0.633)
    a.update(1 / 30);
    assert.equal(a.current, 'Skill_1');
    assert.equal(e.timeScale, 0, 'held');
    assert.ok(e.trackTime < 0.633, 'before the blow');
    for (let i = 0; i < 40; i++) a.update(1 / 30);
    assert.equal(a.mode, 'base', 'gave up');
    assert.equal(a.skillSwingLead(0), null, 'no new prediction until a strike');
    a.attack(1.267);
    a.skillNext = true;
    assert.notEqual(a.skillSwingLead(0), null);
  });

  test('without the look-ahead\'s word, or for a skill with its own Begin, the attack role winds up', () => {
    const a = actor('char_1019_siege2', 0);
    assert.equal(a._attackClip().loop, 'Attack_1');
    const b = actor('char_1019_siege2', 2);
    b.skillAhead = true;
    assert.equal(b._skillOnceClip(), null);
    assert.equal(b._attackClip().loop, 'Attack_1');
  });
});

describe('seedOf', () => {
  test('a pick of two does not repeat for long: its runs average about two attacks', () => {
    let runs = 0, picks = 0;
    for (let id = 1; id <= 40; id++) {
      let last = -1;
      for (let n = 0; n < 60; n++) {
        const p = seedOf(id, n) % 2;
        picks++;
        if (p !== last) runs++;
        last = p;
      }
    }
    assert.ok(picks / runs < 2.5, `mean run ${picks / runs}`);
  });
});

describe('the wind-up asks once per attack', () => {
  const fakeView = (wound) => ({ actor: { wound, attackVariant: 'Attack_A' }, windUp: () => false });
  const run = async (v) => {
    const { createWindUpLookahead } = await import('../../public/js/render/app/windup.js');
    const asked = [];
    const la = createWindUpLookahead({ views: new Map([[1, v]]), woundUp: new WeakSet(), castStart: () => {},
      attackClip: () => { asked.push(1); return 'Attack_B'; } });
    la.run({ forEachUpcoming: (a, b, f) => f(['atk', 1, 2, 'none'], a + 0.1) }, 0);
    return asked.length;
  };

  test('an attack still wound up keeps its clip: the next one, one attack count behind, does not overwrite it', async () => {
    const v = fakeView(true);
    assert.equal(await run(v), 0);
    assert.equal(v.actor.attackVariant, 'Attack_A');
  });

  test('otherwise the coming attack sets it', async () => {
    const v = fakeView(false);
    assert.equal(await run(v), 1);
    assert.equal(v.actor.attackVariant, 'Attack_B');
  });
});

describe('when an enemy reaches a range (windup.js entryLead)', () => {
  const snap = (t, list) => ({ t, units: new Map(list.map((u) => [u[0], u])) });
  test('her tiles facing right, the sim\'s 0.1 collider, a flyer skipped for a unit that cannot hit air', async () => {
    const { rangeTiles, colliderOn, entryLead } = await import('../../public/js/render/app/windup.js');
    const tiles = rangeTiles([[0, 0], [0, 1]], 9, 7, 'RIGHT');
    assert.deepEqual([...tiles].sort(), ['9,7', '9,8']);
    assert.deepEqual([...rangeTiles([[0, 1]], 9, 7, 'UP')], ['10,7'], 'server/sim/dir.js rotateOffset: UP is row + 1');
    assert.ok(colliderOn(tiles, 8.55, 9), 'the collider reaches over the edge');
    assert.ok(!colliderOn(tiles, 8.65, 9));
    // an enemy walking left at 1 tile / game s from x 9.6: on the tiles once x < 8.6, 1 s on
    const snaps = [snap(0, [[5, 9.8, 9, 100, 100, 0, 0, 0]]), snap(0.2, [[5, 9.6, 9, 100, 100, 0, 0, 0]])];
    const lead = entryLead(snaps, 0.2, [5], tiles, 1.5);
    assert.ok(Math.abs(lead - 1) < 0.05, `lead ${lead}`);
    assert.equal(entryLead(snaps, 0.2, [5], tiles, 0.5), null, 'beyond the horizon');
    const fly = [snap(0, [[5, 8.2, 9, 100, 100, 0, 0, 512]]), snap(0.2, [[5, 8.2, 9, 100, 100, 0, 0, 512]])];
    assert.equal(entryLead(fly, 0.2, [5], tiles, 1.5, 512), null, 'a flyer: no target');
    assert.equal(entryLead(fly, 0.2, [5], tiles, 1.5, 0), 0, 'one that hits air: there already');
  });
});
