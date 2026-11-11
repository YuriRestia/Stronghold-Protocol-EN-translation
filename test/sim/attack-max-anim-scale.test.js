// (fork) Each attack ability's own clip-scale cap, `_maxAnimScale` (AbstractAnimatedAbility.UpdatePlaybackSpeed: animScale =
// attack time / clip length, at least 0.1, at most `_maxAnimScale` when it is ≥ 0), read from the client into
// docs/research/15-attack-anim-scale.json (tools/local-extract/anim_scale.py) and from there into `attackAnim.maxScale`
// (tools/build-data.mjs): the sim's attack wind-up (ai.js allyCastWindup) and the effects' speed (render/spine.js
// abilitySpeed) follow it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allyCastWindup } from '../../server/sim/ai.js';
import { normalizeChess } from '../../server/sim/simdata.js';
import { ALLY_ANIM_SCALE_MAX } from '../../server/sim/constants.js';

const DATA = new URL('../../data/', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, DATA), 'utf8'));
const unit = (attackAnim, interval) => ({ def: { attackAnim }, s: { interval } });

describe('allyCastWindup and `_maxAnimScale`', () => {
  // Mostima's clip: 1.733 s, strike 0.7 s; interval 2.9 s → interval / clip = 1.67
  const clip = { clip: 'Attack', dur: 1.733, hit: 0.7 };

  test('a cap of 1: a slow attacker swings at the clip\'s own speed, the hit lands at the strike frame', () => {
    assert.equal(allyCastWindup(unit({ ...clip, maxScale: 1 }, 2.9)), 0.7);
  });

  test('−1 (no cap): the clip stretches to the whole interval ratio', () => {
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: -1 }, 2.9)) - 0.7 * (2.9 / 1.733)) < 1e-9);
    // past 2.5× too (the old blanket cap no longer applies): interval 5 s → 2.885×
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: -1 }, 5)) - 0.7 * (5 / 1.733)) < 1e-9);
  });

  test('a cap of 2 / 1.1: at most that', () => {
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: 2 }, 5)) - 1.4) < 1e-9);
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: 1.1 }, 2.9)) - 0.77) < 1e-9);
  });

  test('a fast attacker is unchanged by the cap (it only limits slowing down); the 0.1 floor stays', () => {
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: 1 }, 0.866)) - 0.7 * (0.866 / 1.733)) < 1e-9);
    assert.ok(Math.abs(allyCastWindup(unit({ ...clip, maxScale: 1 }, 0.1)) - 0.07) < 1e-9, 'interval 0.1 s: scale floor 0.1 → 0.07 s');
  });

  test('no cap in the data: the old ALLY_ANIM_SCALE_MAX', () => {
    assert.ok(Math.abs(allyCastWindup(unit(clip, 5)) - 0.7 * ALLY_ANIM_SCALE_MAX) < 1e-9);
  });
});

describe('the data carries the client\'s caps', () => {
  test('docs/research/15-attack-anim-scale.json: every chess operator with an attack clip has its abilities', () => {
    const table = JSON.parse(fs.readFileSync(new URL('../../docs/research/15-attack-anim-scale.json', import.meta.url), 'utf8'));
    const chess = read('chess.json');
    const missing = [...new Set(Object.values(chess).filter((c) => c.attackAnim).map((c) => c.charId))].filter((id) => !table[id]);
    assert.deepEqual(missing, []);
  });

  test('attackAnim.maxScale by charId (EN gamedata names): Mostima 1, Exusiai 2, Swire 1.1, Archetto none (−1)', () => {
    const chess = read('chess.json');
    const of = (id) => Object.values(chess).find((c) => c.charId === id && !c.isGolden)?.attackAnim?.maxScale;
    assert.equal(of('char_213_mostma'), 1);
    assert.equal(of('char_103_angel'), 2);
    assert.equal(of('char_308_swire'), 1.1);
    assert.equal(of('char_332_archet'), -1);
  });

  test('normalizeChess keeps it (and −1)', () => {
    const chess = read('chess.json');
    const mos = Object.values(chess).find((c) => c.charId === 'char_213_mostma' && !c.isGolden);
    assert.equal(normalizeChess(mos).attackAnim.maxScale, 1);
    const arc = Object.values(chess).find((c) => c.charId === 'char_332_archet' && !c.isGolden);
    assert.equal(normalizeChess(arc).attackAnim.maxScale, -1);
  });
});
