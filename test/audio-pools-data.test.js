// #680: generated audio metadata only; official files are read optionally from the local cache, never fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { bankPool, indexAudio } from '../tools/assets/audio.mjs';
import { buildPlan } from '../tools/assets/plan.mjs';
import { resolveTemplate, collectLeaves } from '../tools/assets/manifest.mjs';

const manifest = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
const official = new URL('../.cache/gamedata/excel/audio_data.json', import.meta.url);
const sound = (asset, extra = {}) => ({ asset: `Audio/Sound_Beta_2/Player/${asset}`, minPitch: 0.8, maxPitch: 1.2, delay: 0, ...extra });

test('bank indexing preserves per-file parameters and canonical pool identity through aliases', () => {
  const bank = { name: 'first', maxSoundAllowed: 3, popOldest: true, sounds: [sound('a'), sound('b', { minPitch: 1, maxPitch: 1, delay: 0.1 })] };
  const idx = indexAudio({ soundFXBanks: [bank, { ...bank, name: 'second', maxSoundAllowed: 1, popOldest: false }], bankAlias: { alias: 'first' } });
  assert.deepEqual(idx.poolOf(idx.bank('alias')), bankPool(bank));
  assert.equal(idx.poolOf(idx.bank('alias')).id, 'first');
  assert.equal(idx.poolOf(idx.bank('second')).maxSoundAllowed, 1);
  assert.equal(idx.poolOf(idx.bank('second')).popOldest, false);
  assert.deepEqual(idx.poolOf(idx.bank('first')).sounds['player/b.mp3'], { minPitch: 1, maxPitch: 1, delay: 0.1 });
});

test('the asset plan emits ordinary and mode pool references and literal metadata without extra downloads', () => {
  const names = ['battle.ON_ABILITY_START.char_999_example.attack', 'battle.ON_ABILITY_START.char_999_example.attack.3', 'battle.ON_ABILITY_HIT.char_999_example.attack.3'];
  const raw = { soundFXBanks: names.map((name, i) => ({ name, maxSoundAllowed: i + 1, popOldest: i !== 1, sounds: [sound(i === 0 ? 'test_n' : `mode${i}_s`, { delay: i / 10 })] })) };
  const { template } = buildPlan({ assets07: { operators: { char_999_example: { skills: [{ index: 2, skillId: 'skchr_example_3' }] } } }, ops03: {}, enemies05: {}, maps05: {}, modelsData: {}, audio: indexAudio(raw) });
  const sfx = template.audio.sfx;
  const u = sfx.units.char_999_example;
  assert.deepEqual(u.pools, { attack: names[0] });
  assert.deepEqual(u.attackPools, { 2: names[1] });
  assert.deepEqual(u.hitPools, { 2: names[2] });
  assert.equal(collectLeaves(sfx.pools).length, 0);
  const resolved = resolveTemplate(sfx.pools, { root: '.', spine: new Map() }).value;
  assert.deepEqual(resolved[names[1]], { maxSoundAllowed: 2, popOldest: false, sounds: { 'player/mode1_s.mp3': { minPitch: 0.8, maxPitch: 1.2, delay: 0.1 } } });
});

test('every generated attack/hit reference resolves to a valid pool and its selected sound parameters', () => {
  const { units, pools } = manifest.audio.sfx;
  let refs = 0;
  for (const [id, u] of Object.entries(units)) {
    for (const [urls, ids] of [[{ attack: u.attack, hit: u.hit }, u.pools], [u.attacks, u.attackPools], [u.hits, u.hitPools]]) {
      for (const [role, url] of Object.entries(urls || {})) {
        if (!url) continue;
        const p = pools[ids?.[role]];
        assert.ok(p, `${id}.${role}`);
        assert.ok(Number.isInteger(p.maxSoundAllowed) && p.maxSoundAllowed >= 0);
        assert.equal(typeof p.popOldest, 'boolean');
        const s = p.sounds[url.replace('/assets/audio/sfx/', '')];
        assert.ok(s, `${id}.${role}: selected file belongs to this bank`);
        assert.ok(s.minPitch > 0 && s.maxPitch >= s.minPitch && s.delay >= 0);
        refs++;
      }
    }
  }
  // 0.3.1 release fetch-assets: 952 (+ 琳琅诗怀雅 S3, 刻俄柏, 风丸 attacks and 松果's hit); 0.3.2 (#848, DESIGN §35.38): + the 26
  // plain mode-bank slots on 19 operators, and 弑君者 / 莱伊 / 望 / 灰毫's normal attack from their mode-0 banks
  // The four-version art union adds nine references to installed sounds and 46 official pool records.
  // (fork) + 2 references for 丰川祥子 (char_4182_oblvns): her swing and S3 volley pools (tools/assets/plan.mjs
  // NOTE_SFX_CHARS); + 17 pools: those two, her S1 / S2 / S3 sting banks (plan.mjs STING_BANKS) and her note born / hit
  // banks (plan.mjs NOTE_SFX_LOOKS: 5 born + 7 hit; attack and S1 have no born bank)
  // (fork) + 37 references: the manifest built on a local fx index that lists all 230 operators gives the older-season
  // operators their slots and files (the 5 pool-only attack sounds among them)
  // (fork) + 3 pools: 塔露拉 S3's launch, impact and overload banks (tools/assets/plan.mjs FX_SOUND_BANKS)
  // (fork) + 2 references, + 4 pools: 塔露拉 S1's own swing and impact (plan.mjs SKILL_ABILITY_SOUNDS) and the pools of
  // those two, her S2 strike back's impact and her T2 footprint (FX_SOUND_BANKS)
  // (fork) + 2 references, + 16 pools: 莫斯提马's impact (+1; plan.mjs UNIT_SOUND_BANKS) and 蕾缪安's S1 / S2 impacts (+2;
  // SKILL_MODE_BANKS), minus 莫斯提马's S2 slot (−1: its mode is her S3's, shared/fxModes.js); the 16 pools are the official
  // banks those two operators' new sounds play on (impacts, S2 attack.2.2, FX_SOUND_BANKS, SKILL_ON_BANKS, SKILL_OFF_BANKS)
  // (fork) + 1 pool: 焰影苇草 S3's blast on a defeated enemy (FX_SOUND_BANKS: projectile_chr_reed2_aoe_effect's REACH,
  // p_aoe_fireexplo_h; an fx sound is no attack / hit reference)
  // (fork) + 4 references, + 6 pools: 烛煌's S1 swing and impact (SKILL_ABILITY_SOUNDS), her S2 / S3 bolt impacts
  // (SKILL_MODE_BANKS: projectile_chr_blaze2_s2 / _s3's ON_PROJECTILE_HIT), and the pools of those four, her S3
  // activation (SKILL_ON_BANKS) and its closing (SKILL_OFF_BANKS)
  assert.equal(refs, 1048);
  assert.equal(Object.keys(pools).length, 1074);
  const p = pools[units.char_4064_mlynar.attackPools[2]];
  assert.equal(p.sounds['player/p_imp/p_imp_loyalsword_h.mp3'].delay, 0.1);
});

test('all exported pools match the cached official bank limits, pitches and delays', { skip: !existsSync(official) }, () => {
  const raw = JSON.parse(readFileSync(official, 'utf8'));
  const banks = new Map(raw.soundFXBanks.map(b => [b.name, b]));
  for (const [id, pool] of Object.entries(manifest.audio.sfx.pools)) {
    const bank = banks.get(id);
    assert.ok(bank, id);
    assert.equal(pool.maxSoundAllowed, bank.maxSoundAllowed, id);
    assert.equal(pool.popOldest, bank.popOldest, id);
    for (const [path, s] of Object.entries(pool.sounds)) {
      const original = bank.sounds.find(v => v.asset?.toLowerCase().replace('audio/sound_beta_2/', '') + '.mp3' === path);
      assert.ok(original, `${id}: ${path}`);
      assert.deepEqual(s, { minPitch: original.minPitch, maxPitch: original.maxPitch, delay: original.delay }, id);
    }
  }
});
