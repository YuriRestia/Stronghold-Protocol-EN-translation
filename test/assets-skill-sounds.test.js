// (fork) Every skill's own ability sounds (tools/assets/skillSounds.mjs, effect-gaps audit 2 fix #1): the files decide the
// role — p_atk_ a swing, p_imp_ an impact, anything else a cast at the skill's start — for every operator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankRole, skillAbilitySounds } from '../tools/assets/skillSounds.mjs';

function fakeAudio(banks, loops = []) {
  const table = new Map(Object.entries(banks).map(([k, v]) => [k, v]));
  return {
    bank: (name) => table.get(name) || [],
    loopOf: (paths) => loops.some((name) => table.get(name) === paths),
    namesWith: (prefix) => [...table.keys()].filter((n) => n.trim().startsWith(prefix)).sort(),
  };
}

test('bankRole: the first file names the role', () => {
  assert.equal(bankRole(['player/p_atk/p_atk_hcnsrfr_d.mp3']), 'attack');
  assert.equal(bankRole(['player/p_imp/p_imp_blunt_h.mp3']), 'hit');
  assert.equal(bankRole(['player/p_skill/p_skill_swordrain.mp3']), 'cast');
  assert.equal(bankRole(['battle/b_char/b_char_atkboost.mp3']), 'cast');
  assert.equal(bankRole([]), 'cast');
  // an `_n` file is a normal attack's: never a skill's swing / impact (古米 S1 p_atk_heal_n)
  assert.equal(bankRole(['player/p_atk/p_atk_heal_n.mp3']), 'normal');
  assert.equal(bankRole(['player/p_imp/p_imp_lightsword_n.mp3']), 'normal');
});

test('a cast with no ON_SKILL_START of its own is the sting (德克萨斯 S2 剑雨)', () => {
  const audio = fakeAudio({ 'battle.ON_ABILITY_START.skchr_texas_2': ['player/p_skill/p_skill_swordrain.mp3'] });
  const r = skillAbilitySounds(audio, 'skchr_texas_2');
  assert.deepEqual(r.sting, ['player/p_skill/p_skill_swordrain.mp3']);
  assert.equal(r.on.length, 0);
});

test('a cast beside an ON_SKILL_START plays at the start too (泥岩 S3), a same-file one does not double', () => {
  const audio = fakeAudio({
    'battle.ON_ABILITY_START.skchr_mudrok_3': ['player/p_skill/p_skill_rocksleep.mp3'],
    'battle.ON_ABILITY_START.skchr_x_1': ['battle/b_char/b_char_atkboost.mp3'],
  });
  const r = skillAbilitySounds(audio, 'skchr_mudrok_3', { sting: ['battle/b_char/b_char_atkboost.mp3'] });
  assert.equal(r.sting, null);
  assert.deepEqual(r.on.map((e) => e.paths[0]), ['player/p_skill/p_skill_rocksleep.mp3']);
  const same = skillAbilitySounds(audio, 'skchr_x_1', { sting: ['battle/b_char/b_char_atkboost.mp3'] });
  assert.equal(same.on.length, 0);
});

test('a strike skill: swing and impact while it runs (烛煌 S1, 陈 S1)', () => {
  const audio = fakeAudio({
    'battle.ON_ABILITY_START.skchr_blaze2_1': ['player/p_atk/p_atk_hcnsrfr_d.mp3'],
    'battle.ON_ABILITY_HIT.skchr_blaze2_1': ['player/p_imp/p_imp_hcnsrfr_d.mp3'],
  });
  const r = skillAbilitySounds(audio, 'skchr_blaze2_1');
  assert.deepEqual(r.attack, ['player/p_atk/p_atk_hcnsrfr_d.mp3']);
  assert.deepEqual(r.hit, ['player/p_imp/p_imp_hcnsrfr_d.mp3']);
  assert.equal(r.sting, null);
});

test('a looping bank holds until the skill ends and leads its edge (伊芙利特 S3); the end banks close it', () => {
  const audio = fakeAudio({
    'battle.ON_ABILITY_START.skchr_ifrit_3': ['battle/b_char/b_char_atkboost.mp3'],
    'battle.ON_ABILITY_ON.skchr_ifrit_3': ['player/p_aoe/p_aoe_flamethrower_loop.mp3'],
    'battle.ON_ABILITY_END.skchr_ifrit_3': ['player/p_skill/p_skill_end.mp3'],
  }, ['battle.ON_ABILITY_ON.skchr_ifrit_3']);
  const r = skillAbilitySounds(audio, 'skchr_ifrit_3');
  assert.deepEqual(r.sting, ['battle/b_char/b_char_atkboost.mp3']);
  assert.deepEqual(r.on, [{ paths: ['player/p_aoe/p_aoe_flamethrower_loop.mp3'], hold: true, loop: true }]);
  assert.deepEqual(r.off, [['player/p_skill/p_skill_end.mp3']]);
});

test('a stray leading space in the official bank name still finds it; skipped files stay with their table', () => {
  const audio = fakeAudio({
    ' battle.ON_ABILITY_HIT.skchr_mostma_2': ['player/p_imp/p_imp_blacktimewand_s.mp3'],
    'battle.ON_ABILITY_ON.skchr_mostma_2': ['player/p_skill/p_skill_blacktimewand_shot.mp3'],
  });
  const r = skillAbilitySounds(audio, 'skchr_mostma_2');
  assert.deepEqual(r.hit, ['player/p_imp/p_imp_blacktimewand_s.mp3']);
  const s = skillAbilitySounds(audio, 'skchr_mostma_2', { skip: new Set(['player/p_imp/p_imp_blacktimewand_s.mp3', 'player/p_skill/p_skill_blacktimewand_shot.mp3']) });
  assert.equal(s.hit, null);
  assert.equal(s.on.length, 0);
});

test('a skill with no cast sound of its own takes its sub-abilities into empty roles only (缄默德克萨斯 S3)', () => {
  const audio = fakeAudio({
    'battle.ON_ABILITY_START.skchr_texas2_3.2': ['player/p_skill/p_skill_reticentsword_s.mp3'],
    'battle.ON_ABILITY_START.skchr_horn_1.2.1': ['player/p_atk/p_atk_blackcannoncast_d.mp3'],
    'battle.ON_ABILITY_START.skchr_blemsh_2.1': ['player/p_skill/p_skill_glowboost.mp3'],
  });
  assert.deepEqual(skillAbilitySounds(audio, 'skchr_texas2_3').sting, ['player/p_skill/p_skill_reticentsword_s.mp3']);
  assert.deepEqual(skillAbilitySounds(audio, 'skchr_horn_1').attack, ['player/p_atk/p_atk_blackcannoncast_d.mp3']);
  // an ON_SKILL_START of its own: the sub-ability adds nothing
  const r = skillAbilitySounds(audio, 'skchr_blemsh_2', { sting: ['battle/b_char/b_char_atkboost.mp3'] });
  assert.equal(r.sting, null);
  assert.equal(r.on.length, 0);
});

test('the manifest carries the skills that were silent (data/assets.json)', () => {
  const units = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8')).audio.sfx.units;
  const urls = (leaf) => JSON.stringify(leaf ?? null);
  // 德克萨斯 S2 剑雨: its cast is the sting of skill index 1
  assert.match(urls(units.char_102_texas?.skills?.['1']), /p_skill_swordrain/);
  // 泥岩 S2: its strike's impact; S3: p_skill_rocksleep beside the sting
  assert.match(urls(units.char_311_mudrok?.hits?.['1']), /p_imp_bighammer_h/);
  assert.match(urls(units.char_311_mudrok?.skillOn?.['2']), /p_skill_rocksleep/);
  // kept: 烛煌 S1's own swing and impact, S3's start and two end banks; 莫斯提马 S2's held time lock
  assert.match(urls(units.char_1040_blaze2?.attacks?.['0']), /p_atk_hcnsrfr_d/);
  assert.match(urls(units.char_1040_blaze2?.hits?.['0']), /p_imp_hcnsrfr_d/);
  assert.match(urls(units.char_1040_blaze2?.skillOn?.['2']), /p_skill_hcnsrfrsr/);
  assert.equal(units.char_1040_blaze2?.skillOff?.['2']?.more?.length, 1);
  assert.equal(units.char_213_mostma?.skillOn?.['1']?.hold, true);
  assert.match(urls(units.char_213_mostma?.skillOn?.['1']), /p_skill_blacktimewand_layer/);
});
