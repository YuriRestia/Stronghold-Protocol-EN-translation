// tools/assets/outfit-fx-check.mjs (fork, docs/OUTFITS.md "Adding outfits"): an outfit whose own official effects
// (fx twins `<key>_<outfit>#N`) the client has but the local fx index lacks is reported, and so is one whose client
// effect bundle changed since the extractor's container cache was written (hot update first).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { skinVariant, charCode, outfitFxGaps, clientRoots, describeGaps } from '../tools/assets/outfit-fx-check.mjs';

describe('outfit-fx-check', () => {
  test('skinVariant matches fx.py skin_variant; charCode is the effect bundle name', () => {
    assert.deepEqual(skinVariant('halo2_skill_03_start_01_striker#4'), ['halo2_skill_03_start_01', 'striker#4']);
    assert.deepEqual(skinVariant('amgoat_skill_03_buff_sanrio#2_l'), ['amgoat_skill_03_buff_l', 'sanrio#2']);
    assert.equal(skinVariant('common_hit_01'), null);
    assert.equal(charCode('char_1047_halo2'), 'halo2');
    assert.equal(charCode('char_4182_oblvns'), 'oblvns');
  });

  test('twins of indexed effects the index lacks are missing; an extracted outfit and foreign twins are not', () => {
    const outfits = { 'char_1047_halo2@striker#4': { charId: 'char_1047_halo2' }, 'char_248_mgllan@kitchen#1': { charId: 'char_248_mgllan' } };
    const index = { prefabs: { halo2_skill_03_start_01: {}, halo2_attack_01_hit: {}, mgllan_attack_01_hit: {}, 'mgllan_attack_01_hit_kitchen#1': {} } };
    const cache = {
      'battle/prefabs/effects/halo2.ab': { size: 1, mtime: 1, prefabs: ['halo2_skill_03_start_01', 'halo2_skill_03_start_01_striker#4',
        'halo2_attack_01_hit', 'halo2_unused_striker#4', 'halo2_attack_01_hit_other#1'] },
      'battle/prefabs/effects/mgllan.ab': { size: 1, mtime: 1, prefabs: ['mgllan_attack_01_hit', 'mgllan_attack_01_hit_kitchen#1'] },
    };
    const rows = outfitFxGaps({ outfits, index, cache });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { skinId: 'char_1047_halo2@striker#4', charId: 'char_1047_halo2', bundle: 'battle/prefabs/effects/halo2.ab',
      twins: 1, missing: ['halo2_skill_03_start_01_striker#4'], stale: false }, 'a twin of an effect we never extracted is not asked for');
    assert.match(describeGaps({ client: 'x', rows }).join('\n'), /1 outfits may lack.*--fx-skins --fx-add-only[\s\S]*1 of 1 effect twins missing/);
  });

  test('a client bundle that differs from the cache (hot update first) is stale; describeGaps caps the list', () => {
    const d = mkdtempSync(join(tmpdir(), 'outfit-fx-check-'));
    try {
      const ab = join(d, 'Arknights', 'Arknights_Data', 'StreamingAssets', 'AB', 'Windows');
      const hot = join(d, 'Arknights', 'Arknights_Data', 'PersistentData', 'Bundles');
      for (const r of [ab, hot]) mkdirSync(join(r, 'battle/prefabs/effects'), { recursive: true });
      writeFileSync(join(ab, 'battle/prefabs/effects/halo2.ab'), 'old');
      writeFileSync(join(hot, 'battle/prefabs/effects/halo2.ab'), 'newer');
      writeFileSync(join(ab, 'battle/prefabs/effects/mgllan.ab'), 'same');
      const roots = clientRoots(join(d, 'Arknights'));
      assert.deepEqual(roots, [hot, ab]);
      assert.deepEqual(clientRoots(ab), [hot, ab], 'the AB root finds its hot-update root too');
      const st = (p) => ({ size: statSync(p).size, mtime: Math.floor(statSync(p).mtimeMs / 1000) });
      const cache = {
        'battle/prefabs/effects/halo2.ab': { ...st(join(ab, 'battle/prefabs/effects/halo2.ab')), prefabs: [] },
        'battle/prefabs/effects/mgllan.ab': { ...st(join(ab, 'battle/prefabs/effects/mgllan.ab')), prefabs: [] },
      };
      const outfits = { 'char_1047_halo2@striker#4': { charId: 'char_1047_halo2' }, 'char_248_mgllan@epoque#60': { charId: 'char_248_mgllan' } };
      const rows = outfitFxGaps({ outfits, index: { prefabs: {} }, cache, roots });
      assert.deepEqual(rows.map((r) => [r.skinId, r.stale]), [['char_1047_halo2@striker#4', true]], 'the hot update differs; the unchanged bundle is fine');
      const many = { client: null, rows: Array.from({ length: 5 }, (_, i) => ({ ...rows[0], skinId: `s${i}` })) };
      const lines = describeGaps(many, 2);
      assert.equal(lines.filter((l) => /changed since/.test(l)).length, 2);
      assert.match(lines.join('\n'), /… 3 more[\s\S]*no local CN client found/);
    } finally { rmSync(d, { recursive: true, force: true }); }
  });

  test('no local fx index: nothing to check', () => {
    assert.match(describeGaps(null)[0], /no local fx index/);
  });
});
