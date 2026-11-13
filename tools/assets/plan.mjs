// Builds the asset plan: which files the game needs, where they come from and
// where they go, as a *manifest template* that mirrors data/assets.json.
//
// Template leaves:
//   { alts: [{ rel, urls[], kind, bytes? }, …] }  one file; the first alternative
//        that ends up on disk wins (later alts are fallbacks: other URLs for the
//        same file, or other sounds of the same bank);
//   { model: '<key>' }  a Spine model (skel + atlas + page PNGs) from plan.models;
//   literal(value)  a value emitted as it is (no files: enemies[id] / tokens[id].spineLocal).
// Inputs are the research JSONs (docs/research/03, 05, 07), the official
// audio_data.json and Ark-Models' models_data.json.
//
// Scope (research 07 §1, DESIGN §0): all 138 pool charIds (incl. backup
// operators), the 自选 owned-6★ picks of data/backups.json (`extraOperators`:
// research 07 does not list them — their URLs follow its patterns) and their
// summons, the module type icons of every module the data offers
// (`moduleTypes`), the 20 pool tokens, every enemy that can appear in an
// act2autochess match (07 enemy list ∪ act1autochess wave/boss levels used by
// act2 modes ∪ bosses ∪ their summons ∪ enemy units spawned by operator kits),
// the 23 bonds, 59 shop items, 40 bands,
// default-skill icons, profession icons, autochess UI sprites (the 36 battle
// emotes and the 19 玩法说明 pages included: UI_EXTRAS), BGM and SFX.

import { RAW, joinUrl, safeName, urlBase, urlDir } from './sources.mjs';
import { BOT_OPERATORS } from '../../shared/constants.js';
import { kindOf } from './formats.mjs';
import { pickUnitSfx, pickEnemySfx, pickEnemyCastSfx, assignSkillModeSfx, outfitAudioView, UI_SFX, BATTLE_SFX, resolveSpec, indexVoice, nativeVoiceDirs, linkageOnlyVoice, VOICE_DIRS, VOICE_CUSTOM_DIR, VOICE_BATTLE_SLOTS } from './audio.mjs';
import { literal } from './manifest.mjs';
import { skillAbilitySounds } from './skillSounds.mjs';
import { EMOTE_CATALOG } from '../../shared/constants.js';
import { skillModeOf } from '../../shared/fxModes.js';

/**
 * The voice slots are read from the zh_CN charword table, whose voiceIds are always `CN_*`: the other dubs
 * (`--voice-lang=jp|en|kr`, the JP tree `audio.voiceJp`) share the very same slot numbering and file names, only the
 * dump folder differs.
 */
const VOICE_ID_LANG = 'CN';

/**
 * The second voice tree, `audio.voiceJp`: the Japanese dub (ArknightsAssets2 `voice/`, audio.mjs VOICE_DIRS.jp) of the
 * same slots and lines as `audio.voice`, under `audio/voice/jp/`. The client plays it when the player picks 日本語
 * (settings 语音语言) and falls back to `audio.voice` for a line it lacks (public/js/audio.js voiceLine). The owner's
 * request of 2026-10-08 「全套的日配语音」: the JP dub of every line the game plays, beside the Chinese one.
 */
export const VOICE_JP_LANG = 'jp';

/** Operators whose notes (sim notes.js) carry sounds of their own (the per-note banks of the projectile prefabs). */
const NOTE_SFX_CHARS = new Set(['char_4182_oblvns']);
/**
 * (fork) A kit 'fx' that stands for an official sound no attack event plays: charId → '<fx kind>|<its `skill` tag>' → bank.
 * 塔露拉 S3: ON_PROJECTILE_BORN (max 1) and _HIT (max 2) of its 簇火, and the overload's custom trigger. (fork) S2: the
 * guard's strike back is the skill's hit (ON_ABILITY_HIT, max 1); T2: a footprint is the fire field's custom trigger.
 * (fork) A value may list several banks: each plays, a `{ bank, after }` one `after` seconds later (the official
 * TriggerAudioSignalBehaviour `_preDelay`, a MultiMeleeAttack's `triggerDelta`); the first bank that exists leads.
 */
const FX_SOUND_BANKS = Object.freeze({
  // (fork) 莫斯提马 S2 (chess_char_4_02-mostma.js): each second's strike (fx 'timeLock' on her) and its impact on each
  // stunned enemy ('timeLockHit', src her) — the skill's own ability ON / HIT banks (the HIT bank's official name starts
  // with a space)
  char_213_mostma: Object.freeze({
    'timeLock|': 'battle.ON_ABILITY_ON.skchr_mostma_2',
    'timeLockHit|': ' battle.ON_ABILITY_HIT.skchr_mostma_2',
  }),
  // (fork) 蕾缪安 (chess_char_6_01-lemuen.js; '#<skill index>': only while that skill is equipped): S2's aim (fx 'lock')
  // and its shot ('crit') are her mode-2 attack.2.1 — START the charge, ON the shot —; S3's locks are attack.4's START;
  // each shell ('bombardShell') the buff lemuen_s3_audio_triggered [ASSUMED: one per shell], its landing ('bombard') the
  // shell projectile's REACH; the Wanted mark ('wanted', src: the Lemuen it counts for) her talent buff
  // char_lemuen_range_aim's show
  char_4193_lemuen: Object.freeze({
    'lock|#1': 'battle.ON_ABILITY_START.char_4193_lemuen.attack.2.1',
    'crit|#1': 'battle.ON_ABILITY_ON.char_4193_lemuen.attack.2.1',
    'lock|#2': 'battle.ON_ABILITY_START.char_4193_lemuen.attack.4',
    'bombardShell|': 'battle.ON_BUFF_START.lemuen_s3_audio_triggered',
    'bombard|': 'battle.ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack',
    'wanted|': 'battle.ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim',
  }),
  char_4247_oxi: Object.freeze({
    'blast|oxi:retaliate': 'battle.ON_ABILITY_HIT.skchr_oxi_2',
    'zone|oxi:footprint': 'battle.ON_CUSTOM_TRIGGER.oxi_fire_field_create',
    'heatwave|oxi:heatwave': 'battle.ON_PROJECTILE_BORN.projectile_chr_oxi_s_3_heatwave',
    'blast|oxi:heatwave': 'battle.ON_PROJECTILE_HIT.projectile_chr_oxi_s_3_heatwave',
    'overload|': 'battle.ON_CUSTOM_TRIGGER.oxi_s_3_overload',
  }),
  // (fork) periodic tick hits (sim battle.tickFx → fx 'tick' { skill }): the PlayAudio of the official buff's trigger, or its
  // own audio buff's trigger (锡人 S1's tinman_s_1[audio] [ASSUMED: one per tick, as S2's in its damage trigger])
  char_450_necras: Object.freeze({ 'tick|necras:s2': 'battle.ON_CUSTOM_TRIGGER.necras_skill_dot' }),
  char_4151_tinman: Object.freeze({
    'tick|tinman:s1': 'battle.ON_BUFF_TRIGGER.tinman_s_1[audio]',
    'tick|tinman:s2': 'battle.ON_CUSTOM_TRIGGER.tinman_s_2[audio]',
  }),
  char_1039_thorn2: Object.freeze({ 'tick|thorn2:s2': 'battle.ON_CUSTOM_TRIGGER.thorn2_s2_projectile_hit' }),
  // 酒神 S2: her 本能的召唤's ticks run after it left; the fx names her as `src` (summons have no fxSounds table of their own)
  char_1042_phatm2: Object.freeze({ 'tick|phatm2:s2': 'battle.ON_CUSTOM_TRIGGER.phatm2_s2_boom_damage' }),
  char_1044_hsgma2: Object.freeze({ 'tick|hsgma2:s2': 'battle.ON_CUSTOM_TRIGGER.shield_hit' }),
  char_4056_titi: Object.freeze({ 'tick|titi:s3': 'battle.ON_CUSTOM_TRIGGER.titi_s_3[awake]' }),
  char_4202_haruka: Object.freeze({ 'tick|haruka:t1': 'battle.ON_CUSTOM_TRIGGER.haruka_shield_break_ally' }),
  char_249_mlyss: Object.freeze({ 'tick|mlyss:s3': 'battle.ON_BUFF_TRIGGER.mlyss_s_3[melee_audio]' }),
  // (fork) 焰影苇草 S3 (chess_char_6_08-reed2.js): the blast of an enemy that dies with her S3 灼痕 ('scorchBurst') is
  // projectile_chr_reed2_aoe_effect's REACH (p_aoe_fireexplo_h); her outfits have no sounds of their own
  char_1020_reed2: Object.freeze({
    'scorchBurst|': 'battle.ON_PROJECTILE_REACH.projectile_chr_reed2_aoe_effect',
  }),
  // (fork) 澄闪 (op-gdglow.js; '#<skill index>': that skill's drones): each drone's hit ('drone') is the skill's funnel
  // projectile HIT, a drone's self-destruct (T1 'explode') the funnel boom's STOP (S1 / S2 share s12), the launch
  // ('drones') S2's / S3's ability START (p_skill_sparklightboost / _boost1) [ASSUMED: the ability starts with the
  // launch]. Her Sanrio outfit's twins play for it
  char_377_gdglow: Object.freeze({
    'drone|#0': 'battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s1',
    'drone|#1': 'battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s2',
    'drone|#2': 'battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s3',
    'explode|gdglow:blast#0': 'battle.ON_PROJECTILE_STOP.projectile_chr_gdglow_funnel_s12_boom',
    'explode|gdglow:blast#1': 'battle.ON_PROJECTILE_STOP.projectile_chr_gdglow_funnel_s12_boom',
    'explode|gdglow:blast#2': 'battle.ON_PROJECTILE_STOP.projectile_chr_gdglow_funnel_s3_boom',
    'drones|#1': 'battle.ON_ABILITY_START.skchr_gdglow_2',
    'drones|#2': 'battle.ON_ABILITY_START.skchr_gdglow_3',
    // each drone launch ('droneLock', a new lock): S1 / S2's attack fires her own projectile with it (projectile_chr_gdglow_s1 /
    // _s2: the client's MultiFunnelRemoteAttack re-sends her attack once a funnel is gone), and the funnel projectile's
    // TriggerAudioSignalBehaviour plays its signal 0.6 s after its birth (_preDelay 0.6; S3's attack has no projectile)
    'droneLock|#0': Object.freeze(['battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_s1',
      Object.freeze({ bank: 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_gdglow_funnel_s1', after: 0.6 })]),
    'droneLock|#1': Object.freeze(['battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_s2',
      Object.freeze({ bank: 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_gdglow_funnel_s2', after: 0.6 })]),
    'droneLock|#2': Object.freeze([Object.freeze({ bank: 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_gdglow_funnel_s3', after: 0.6 })]),
  }),
  // (fork) 艾雅法拉 S2 (op-amgoat.js 'explosion' on the ignited impact): her S2 projectile's REACH — only her Sanrio outfit
  // has that bank (p_imp_firemag_h), so the default look stays silent there [ASSUMED: beside the attack's own impact]
  char_180_amgoat: Object.freeze({
    'explosion|': 'battle.ON_PROJECTILE_REACH.projectile_amgoat_s2',
  }),
  // (fork) 圣约送葬人 (chess_char_5_01-excu2.js): T1's extra attack ('extraAttack') is the client's ProbReplaceNextAtkTalent —
  // a MultiMeleeAttack (additionalTimes 1, triggerDelta 0.1): its ability T.1's start, then the multi-attack buff's shot
  // 0.1 s later (its S3 twin while S3 is equipped [ASSUMED: the client's S3 mode]); S3's final verdict ('aoe' excu2) is the
  // S3_End mode's attack, attack.4 (its start, then its hit [ASSUMED: 0.1 s apart])
  char_1032_excu2: Object.freeze({
    'extraAttack|': Object.freeze(['battle.ON_ABILITY_START.char_1032_excu2.T.1',
      Object.freeze({ bank: 'battle.ON_BUFF_START.excu2_multi_attack[audio]', after: 0.1 })]),
    'extraAttack|#2': Object.freeze(['battle.ON_ABILITY_START.char_1032_excu2.T.1',
      Object.freeze({ bank: 'battle.ON_BUFF_START.excu2_multi_attack[s3][audio]', after: 0.1 })]),
    'aoe|excu2': Object.freeze(['battle.ON_ABILITY_START.char_1032_excu2.attack.4',
      Object.freeze({ bank: 'battle.ON_ABILITY_HIT.char_1032_excu2.attack.4', after: 0.1 })]),
  }),
  // (fork) 烛煌 (chess_char_5_03-blaze2.js): T2 绝处重燃 — knocked down ('downed': the reborn buff's start) and standing up
  // ('revive': its custom trigger reborn_finish); T1 熔点引爆 — a burn burst she answers ('meltdown', src: her; the custom
  // trigger fire_ep_break). Her outfits have no sounds of their own.
  char_1040_blaze2: Object.freeze({
    'downed|': 'battle.ON_BUFF_START.reborn_start',
    'revive|': 'battle.ON_CUSTOM_TRIGGER.reborn_finish',
    'meltdown|': 'battle.ON_CUSTOM_TRIGGER.fire_ep_break',
  }),
});

/**
 * (fork, enemy sound audit job 3) An enemy's official moment sounds no attack or skill cast plays: enemy id → '<sim fx
 * kind>|<its kind / form>' → bank(s), as FX_SOUND_BANKS (public/js/audio.js _fxSound). 'cast|<skill pk, lower case>'
 * rings with that skill's cast, 'skill|on' when its skill turns on (its loop then ends with the skill); 'sound|…' and
 * 'mode' are display-only fx the sim sends for these moments alone. An entry may be { play, loop, endLoop }: `loop` a
 * held loop bank (one per unit; it stops at its unit's death, its skill's end or an entry with `endLoop`). A spine-event
 * bank (ON_SPINE_EVENT_TRIGGER) rings `after` game s: its OnPlayAudio event's time in the official skeleton's clip that
 * our client plays at that moment (public/assets/spine/enemy/<id>/<id>.skel, read with the client's @pixi-spine runtime)
 * — from the clip's start for a form change or a plain cast, from its OnAttack for an attack-turn cast (render/units.js
 * _turnCast: that clip plays from its strike frame, which is the cast). Only official values: no bank here without one.
 */
const ENEMY_FX_SOUND_BANKS = Object.freeze({
  // Dublinn Flamechasers: the ember's birth (T.Born) and its return to a warrior (CN buff template
  // enemy_duskl*_revive_listener ON_BUFF_TRIGGER: SwitchToRebornState + the default max HP back)
  enemy_1288_duskls: { 'ember|husk': 'battle.ON_ABILITY_START.enemy_1288_duskls.T.Born', 'revive|revived': 'battle.ON_BUFF_TRIGGER.enemy_duskls_revive' },
  enemy_1288_duskls_2: { 'ember|husk': 'battle.ON_ABILITY_START.enemy_1288_duskls_2.T.Born', 'revive|revived': 'battle.ON_BUFF_TRIGGER.enemy_duskls_revive' },
  enemy_1292_duskld: { 'ember|husk': 'battle.ON_ABILITY_START.enemy_1292_duskld.T.Born', 'revive|revived': 'battle.ON_BUFF_TRIGGER.enemy_duskld_revive' },
  // its Cannon (an attack-turn cast, ENEMY_ATTACK_SKILL_CLIP 10 s = clip Skill): Skill's nine OnPlayAudio 'emit' at
  // 4.033 … 6.7 s, from its OnAttack at 4.033 s (its normal attack's emit: ENEMY_ATTACK_ALSO_BANKS)
  enemy_1273_stmgun_2: {
    'cast|cannon': [4.033, 4.367, 4.7, 5.033, 5.367, 5.7, 6.033, 6.367, 6.7]
      .map((t) => ({ bank: 'battle.ON_SPINE_EVENT_TRIGGER.enemy_1273_stmgun_2.emit', after: Math.round((t - 4.033) * 1000) / 1000 })),
  },
  // knock-outs (reborn: fx 'telegraph' kind 'reborn', which plays the form's change clip — render/units.js FORMS) and
  // stand-ups (fx 'revive' kind 'reborn')
  enemy_1512_mcmstr: { 'telegraph|reborn': 'battle.ON_BUFF_START.mcmstr_t_state_1[reborn]' },
  // its knock-out clip C1_Die: OnPlayAudio stone_gather at 2.367 s, sword_in at 2.733 s, reborn_bomb at 3.333 s
  enemy_1516_jakill: {
    'telegraph|reborn': [
      { bank: 'battle.ON_SPINE_EVENT_TRIGGER.enemy_1516_jakill.stone_gather', after: 2.367 },
      { bank: 'battle.ON_SPINE_EVENT_TRIGGER.enemy_1516_jakill.sword_in', after: 2.733 },
      { bank: 'battle.ON_SPINE_EVENT_TRIGGER.enemy_1516_jakill.reborn_bomb', after: 3.333 },
    ],
  },
  // its knock-out clip Revive_01: OnPlayAudio xi_reborn at 0 s
  enemy_1517_xi: { 'telegraph|reborn': 'battle.ON_SPINE_EVENT_TRIGGER.enemy_1517_xi.xi_reborn' },
  enemy_1525_blkswb: {
    'telegraph|reborn': 'battle.ON_ABILITY_START.enemy_1525_blkswb.T.Reborn',
    'explode|clearSp': 'battle.ON_ABILITY_START.enemy_1525_blkswb.T.ClearSp',
  },
  // Zaaro: T.Reborn starts at the knock-out with its held loop (enemy_wlfmster_reborn_start); its check point is the
  // stand-up (the fx index's Reborn talent: an EmptyAnimatedAbility whose end-role effects are enemy_wlfmster_a_revive_3*)
  enemy_1535_wlfmster: {
    'telegraph|reborn': { play: 'battle.ON_ABILITY_START.enemy_1535_wlfmster.T.Reborn', loop: 'battle.ON_BUFF_START.enemy_wlfmster_reborn_start' },
    'revive|reborn': { play: 'battle.ON_ABILITY_CHECK_POINT.enemy_1535_wlfmster.T.Reborn', endLoop: true },
  },
  // the take-off buff balloon_s's ON_BUFF_FINISH is the landing (fx index: enemy_balloon_land_01_* on it)
  enemy_2004_balloon: { 'sound|land': 'battle.ON_BUFF_START.balloon_s[land]' },
  enemy_2010_csdcr: { 'telegraph|songOfWar': 'battle.ON_BUFF_START.csdcr_skill[audio]' },
  enemy_9008_acbunn: { 'sound|cute': 'battle.ON_BUFF_START.enemy_acbunn[cute]', 'sound|horror': 'battle.ON_BUFF_START.enemy_acbunn[horror]' },
  // 炎佑 (an ally built from this record): Skill_2's ON loop while its skill is on
  enemy_9012_acloon: { 'skill|on': { loop: 'battle.ON_ABILITY_ON.enemy_9012_acloon.Skill_2' } },
  // the blades shot down (CN buff template acstm*_s_1[special_stun]: STUNNED)
  enemy_9014_acstma: { 'phase|shotDown': 'battle.ON_BUFF_START.acstma_s_1[special_stun]' },
  enemy_9015_acstmb: { 'phase|shotDown': 'battle.ON_BUFF_START.acstmb_s_1[special_stun]' },
  // OpFor: Gun S3's chain hit
  enemy_9017_achunt: { 'link|faithLink': 'battle.ON_CUSTOM_TRIGGER.achunt_line_damage.chain_hit' },
  enemy_9017_achunt_2: { 'link|faithLink': 'battle.ON_CUSTOM_TRIGGER.achunt_line_damage.chain_hit' },
  // every NORMAL physical hit on its shield (CN buff template actrpa_t_1 ON_TAKE_DAMAGE)
  enemy_9018_actrpa: { 'sound|shieldHit': 'battle.ON_CUSTOM_TRIGGER.actrpa_t_1.shield_hit' },
  // Echoes: the form switches; each form's ensemble — gold is Passion (it reads ep_damage_ratio_passion) — with its
  // [delay] twin (that bank's own delay 0.7 s, audio_data); the pulse on damage taken (fx index: ability AOE, triggered by
  // acdums_t_3 ON_TAKE_DAMAGE)
  enemy_9023_acdums: {
    'phase|echo_gold': 'battle.ON_CUSTOM_TRIGGER.enemy_9023_acdums.switch_a',
    'phase|echo_dark': 'battle.ON_CUSTOM_TRIGGER.enemy_9023_acdums.switch_b',
    'explode|ensembleGold': ['battle.ON_CUSTOM_TRIGGER.acdums_audio[passion]', 'battle.ON_CUSTOM_TRIGGER.acdums_audio[passion][delay]'],
    'explode|ensembleDark': ['battle.ON_CUSTOM_TRIGGER.acdums_audio[depassion]', 'battle.ON_CUSTOM_TRIGGER.acdums_audio[depassion][delay]'],
    'explode|echoPulse': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[aoe]',
  },
  // Alistair: the golden shield and the advance (fx index: talent advance, buff enemy_vtlionk_advance)
  enemy_9032_aclionk: {
    'vest|': 'battle.ON_CUSTOM_TRIGGER.enemy_vtlionk_skill_shld',
    'phase|lionAdvance': 'battle.ON_CUSTOM_TRIGGER.enemy_vtlionk_advance',
  },
  enemy_9033_acdeer: { 'telegraph|samiDoom': 'battle.ON_CUSTOM_TRIGGER.enemy_smdeer_doom[audio]' },
  // its barrage mark (fx index: skill appear, enemy_vtsk_skill_01_marker_01 / _range_01) and its multicombat (a plain
  // cast; clip Skill_2: OnPlayAudio zan_hold at 2 s)
  enemy_10027_vtsk: {
    'telegraph|barrage': 'battle.ON_CUSTOM_TRIGGER.enemy_vtsk_skillRange',
    'cast|multicombat': [{ bank: 'battle.ON_SPINE_EVENT_TRIGGER.enemy_10027_vtsk.zan_hold', after: 2 }],
  },
  // taking off (fx index: parrot_a[fly] ON_BUFF_ENABLE → enemy_parrot_takeoff)
  enemy_10045_parrot: { 'phase|float': 'battle.ON_CUSTOM_TRIGGER.parrot_fly' },
});

/**
 * (fork, enemy sound audit job 3) Sounds an enemy's normal attack plays besides its swing: a spine event at its Attack
 * clip's OnAttack (the strike the client's 'atk' marks), appended to `attackNext`. 伦蒂尼姆城防自行炮 (elite): Attack's
 * OnPlayAudio 'emit' at 0.033 s = its OnAttack at 0.033 s.
 */
const ENEMY_ATTACK_ALSO_BANKS = Object.freeze({
  enemy_1273_stmgun_2: ['battle.ON_SPINE_EVENT_TRIGGER.enemy_1273_stmgun_2.emit'],
});

/**
 * (fork, enemy sound audit job 3) Official sounds that ring when one of an enemy's effects starts (OfficialFx.onSpawn →
 * public/js/audio.js fxKey): enemy id → effect key → bank. Effects off: none.
 */
const ENEMY_KEY_SOUND_BANKS = Object.freeze({
  enemy_9017_achunt: { enemy_achunt_skill_1_hit: 'battle.ON_BUFF_START.achunt_s_1[damage].hit_target' },
  enemy_9017_achunt_2: { enemy_achunt_skill_1_hit: 'battle.ON_BUFF_START.achunt_s_1[damage].hit_target' },
  enemy_10138_xdsnow: { enemy_xdsnow_die_01: 'battle.ON_CUSTOM_TRIGGER.enemy_xdsnow_die_01' },
});

/**
 * (fork, enemy sound audit job 3) An enemy's attack modes with sounds of their own: enemy id → mode index (the sim's fx
 * 'mode' n) → its swing / impact event keys in its own banks. 泥岩巨像's Tier 4 / Tier 5 (attack.4 / attack.5); Tier 1-3
 * keep the plain attack's banks (no attack.1-3 banks).
 */
const ENEMY_MODE_ATTACK_BANKS = Object.freeze({
  enemy_1511_mdrock: {
    4: { attack: ['ON_ABILITY_START.attack.4', 'ON_ABILITY_ON.attack.4'], hit: ['ON_ABILITY_HIT.attack.4'] },
    5: { attack: ['ON_ABILITY_START.attack.5', 'ON_ABILITY_ON.attack.5'], hit: ['ON_ABILITY_HIT.attack.5'] },
  },
});
/**
 * (fork) Element burst (爆发) sounds, by `<sim element>.<side>` (side as public/js/render/vfx/wiring.js burstSide: 'enemy'
 * = an enemy unit, 'char' = an operator / summon) → the banks the burst plays at once, each on its own pool (public/js/
 * audio.js _burstSound). Read from the CN client (2026-11-11): the ep_break_<el>_<char|enemy> buff templates
 * (buff_template_holder.ab) name an `audioSignal` on the buff they create, and audio_data.json holds that signal's banks.
 * Only the operator side carries one, except DARK (apoptosis), whose enemy side signals the same bank; the enemy side of
 * FIRE / SANITY / WATER plays its effect only, so it stays silent. FIRE's signal also has an ON_BUFF_SHOW_EFFECT bank
 * [ASSUMED: it fires as the buff shows buff_burn, the same moment]. FIRE = burn, SANITY = neural, WATER = erosion,
 * DARK = apoptosis.
 */
const BURST_SOUND_BANKS = Object.freeze({
  'burn.char': Object.freeze(['battle.ON_BUFF_START.ep_break_fire_audio', 'battle.ON_BUFF_SHOW_EFFECT.ep_break_fire_audio']),
  'neural.char': Object.freeze(['battle.ON_BUFF_START.ep_break_sanity_audio']),
  'erosion.char': Object.freeze(['battle.ON_BUFF_START.ep_break_water_audio']),
  'apoptosis.char': Object.freeze(['battle.ON_BUFF_START.ep_break_dark_audio']),
  'apoptosis.enemy': Object.freeze(['battle.ON_BUFF_START.ep_break_dark_audio']),
});
/**
 * (fork) An operator's normal attack / impact bank the generic pick misses (pickUnitSfx): 莫斯提马's impact is her
 * attack's ON_ABILITY_ON (p_imp_timewand_n; her swing is its START).
 */
const UNIT_SOUND_BANKS = Object.freeze({
  char_213_mostma: Object.freeze({ hit: 'battle.ON_ABILITY_ON.char_213_mostma.attack' }),
  // (fork) 艾雅法拉's projectile is projectile_amgoat (no `chr_`): its REACH is her impact (p_imp_firemag_n)
  char_180_amgoat: Object.freeze({ hit: 'battle.ON_PROJECTILE_REACH.projectile_amgoat' }),

  // (fork) 水月: her swing is the attack's START (p_atk_tentacle_n), its impact the ON (p_imp_tentacle_n)
  char_437_mizuki: Object.freeze({ hit: 'battle.ON_ABILITY_ON.char_437_mizuki.attack' }),
});
/**
 * (fork) A skill's own swing / impact by skill index where the mode pick misses it (assignSkillModeSfx): a bank name, or
 * null — no impact at all while the skill runs (`quietHits`); an `attack` null drops the skill's own swing (the normal one
 * plays). 蕾缪安 S1 / S2: their projectiles' hits; S2's normal
 * shots are attack.2.2 (attack.2.1 is the aimed shot: FX_SOUND_BANKS). 莫斯提马 S3: the ripple's mode has its swing only.
 */
const SKILL_MODE_BANKS = Object.freeze({
  char_4193_lemuen: Object.freeze({
    0: Object.freeze({ hit: 'battle.ON_PROJECTILE_HIT.projectile_chr_lemuen_s1' }),
    1: Object.freeze({ attack: 'battle.ON_ABILITY_START.char_4193_lemuen.attack.2.2', hit: 'battle.ON_PROJECTILE_HIT.projectile_chr_lemuen_s2' }),
  }),
  char_213_mostma: Object.freeze({ 2: Object.freeze({ hit: null }) }),
  // (fork) 艾雅法拉 S3: its projectile's own REACH (the default plays her normal impact file; her Sanrio outfit p_imp_firemag_s)
  // S2 (a ReplacementSkill: the ignited shot is the skill's own RangedAttack): its swing and its projectile's hit
  char_180_amgoat: Object.freeze({
    1: Object.freeze({ attack: 'battle.ON_ABILITY_START.skchr_amgoat_2', hit: 'battle.ON_PROJECTILE_HIT.projectile_amgoat_s2' }),
    2: Object.freeze({ hit: 'battle.ON_PROJECTILE_REACH.projectile_amgoat_s3' }),
  }),
  // (fork) 圣约送葬人 S2 (`attackAlso`: sounds after the swing, as FX_SOUND_BANKS lists): his Sanrio outfit's S2 attack also
  // has an ON_ABILITY_ON bank (its shot, p_atk_shotgunx_h) [ASSUMED: 0.15 s after the swing]; the default look has none
  char_1032_excu2: Object.freeze({
    1: Object.freeze({ attackAlso: Object.freeze([Object.freeze({ bank: 'battle.ON_ABILITY_ON.char_1032_excu2.attack.2', after: 0.15 })]) }),
  }),
  // (fork) 烛煌 S2 / S3: each mode's bolt lands with its own projectile's impact (p_imp_hcnsrfr_h / _s), not her normal one
  char_1040_blaze2: Object.freeze({
    1: Object.freeze({ hit: 'battle.ON_PROJECTILE_HIT.projectile_chr_blaze2_s2' }),
    2: Object.freeze({ hit: 'battle.ON_PROJECTILE_HIT.projectile_chr_blaze2_s3' }),
  }),
  // (fork) 水月 S1: a charge is the skill's own MeleeAttack (ReplacementSkill), its impact the ability's ON (p_imp_tentacle_d).
  // S2 / S3 (modes 2 / 3): the mode's ON bank (p_imp_tentacle_h / _s) is the impact in place of her normal one; the mode has
  // no START bank, so she swings with her normal p_atk_tentacle_n (attack: null drops the mode pick's swing slot)
  char_437_mizuki: Object.freeze({
    0: Object.freeze({ hit: 'battle.ON_ABILITY_ON.skchr_mizuki_1' }),
    1: Object.freeze({ attack: null, hit: 'battle.ON_ABILITY_ON.char_437_mizuki.attack.2' }),
    2: Object.freeze({ attack: null, hit: 'battle.ON_ABILITY_ON.char_437_mizuki.attack.3' }),
  }),
});
/**
 * (fork) Sounds at a skill's start beside its ON_SKILL_START sting (`skillOn`, by index; `hold`: cut when the skill
 * ends — the official ctrl bank ON_SKILL_FINISH stops it; a one-shot that fades out on its own, 5.4 s, never looped) and at its end (`skillOff`). 莫斯提马 S2's time lock
 * (p_skill_blacktimewand_layer) and S3's activation (p_skill_whitetimewand); 蕾缪安's ammo skills close with
 * ON_SKILL_SPECIAL_POINT (b_char_boostclose) when the last bullet is spent.
 */
const SKILL_ON_BANKS = Object.freeze({
  char_213_mostma: Object.freeze({
    1: Object.freeze({ bank: 'battle.ON_ABILITY_START.skchr_mostma_2', hold: true }),
    2: Object.freeze({ bank: 'battle.ON_ABILITY_START.skchr_mostma_3' }),
  }),  // (fork) 烛煌 S3: its activation (p_skill_hcnsrfrsr, the skill ability's start)
  char_1040_blaze2: Object.freeze({ 2: Object.freeze({ bank: 'battle.ON_ABILITY_START.skchr_blaze2_3' }) }),
});
const SKILL_OFF_BANKS = Object.freeze({
  char_4193_lemuen: Object.freeze({
    0: 'battle.ON_SKILL_SPECIAL_POINT.skchr_lemuen_1', 1: 'battle.ON_SKILL_SPECIAL_POINT.skchr_lemuen_2', 2: 'battle.ON_SKILL_SPECIAL_POINT.skchr_lemuen_3',
  }),  // (fork) 烛煌 S3 (ammo): its last bolt closes the skill (b_char_boostclose) and its ability ends at the same moment
  // (ON_ABILITY_END p_skill_hcnsrfrfld): a list — every bank plays (the manifest's `more`)
  char_1040_blaze2: Object.freeze({ 2: Object.freeze(['battle.ON_SKILL_SPECIAL_POINT.skchr_blaze2_3', 'battle.ON_ABILITY_END.skchr_blaze2_3']) }),
});
/**
 * [look key (kits/ops/op-oblvns.js), projectile suffix, custom hit trigger or null]: an attack with a target
 * (projectile_chr_oblvns — no born bank: the attack swing plays), without (_talent), S2 piano (_s2 / _s2_t), organ
 * (_s2_slow / _s2_slow_t), S3 (_s3_phy / _s3_mag), S1 (its hit is ON_CUSTOM_TRIGGER …_s1_hit; the volley's swing is the skill's).
 */
const NOTE_SFX_LOOKS = Object.freeze([
  ['attack', '', null], ['talent', '_talent', null], ['s2', '_s2_t', null], ['s2_slow', '_s2_slow_t', null],
  ['s3_phy', '_s3_phy', null], ['s3_mag', '_s3_mag', null], ['s1', '_s1', '_s1_hit'],
]);
/**
 * 丰川祥子's skill stings: skillId → [sting bank, held loop bank or null] (audio_data soundFXBanks, the PlayAudio / CreateBuff
 * nodes of buff_template_holder). S1: ON_ABILITY_START (d1/d2/d3, weights 40/30/30, max 2 popOldest). S2: the switch
 * into organ only — ON_SKILL_START.skchr_oblvns_2.2 = h1 (owner, by ear, 2026-10-18); .1 = h2, the switch back into
 * piano, which our one-switch S2 never makes (op-oblvns.js). S3: ON_CUSTOM_TRIGGER …[start] (s1/s2, 50/50) and the
 * oblvns_s_3[loop] buff's own loop (p_atk_…slnt_lp, stopped with a 0.2 s fade: soundFXCtrlBanks ON_SKILL_FINISH).
 */
const STING_BANKS = Object.freeze({
  skchr_oblvns_1: ['battle.ON_ABILITY_START.skchr_oblvns_1', null],
  skchr_oblvns_2: ['battle.ON_SKILL_START.skchr_oblvns_2.2', null],
  skchr_oblvns_3: ['battle.ON_CUSTOM_TRIGGER.skchr_oblvns_3[start]', 'battle.ON_BUFF_START.oblvns_s_3[loop]'],
});

/**
 * The extra dub trees beside `audio.voiceJp` (`optionalVoice`, on by default in fetch-assets.mjs): the EN and KR
 * dubs (`voice_en/`, `voice_kr/`) and each operator's own-language dub (`voice_custom/<wordkey>/`, audio.mjs
 * nativeVoiceDirs) — the same slots and file names, under `audio/voice/<en|kr|native/<dir>>/`. public/js/audio.js
 * VOICE_TREES plays them; tools/package.mjs FULL_ZIP_OPTIONAL_VOICE decides whether the full zip ships them
 * (default: yes, so the 0.3.0 full zip includes them).
 */
export const VOICE_OPTIONAL_TREES = Object.freeze({ voiceEn: 'en', voiceKr: 'kr', voiceNative: 'native' });

/**
 * Enemies whose Spine no community dump carries: the web model is another enemy's (research 07 §5.6). Their official
 * models come from the local client only (tools/local-extract ENEMY_SPINES): `localEnemySpines` adds them as the
 * optional `spineLocal` overlay, which the client draws when data/local-assets.json lists its files (user feedback
 * after 0.1.0, D3: 灼热源石虫 / 炽焰源石虫 were drawn as the plain 源石虫 everywhere).
 *
 * Why no dump carries them: isHarryh/Ark-Models *indexes* `1305_mhslim` / `1305_mhslim_2` but with an EMPTY
 * `assetList` — registered, never uploaded — so `arkModel()` returns nothing for them and the alias chain below falls
 * back to `enemy_1007_slime`: a different enemy rather than a variant of it, which is why the renderer tints it
 * (render/units.js ALIAS_TINT). The *mobile* build does ship their own model
 * (`enemy_spine/<enemyId>/<enemyId>.{skel,atlas,png}`), but the only public mirror of that build is a community wiki,
 * not a GitHub dump, so downloading from it would add a source the project deliberately does not use (docs/ASSETS.md
 * "Enemy aliases"). The tinted alias therefore stays the web model until a GitHub dump carries these two.
 */
export const ENEMY_SPINE_ALIAS = Object.freeze({
  enemy_1305_mhslim: 'enemy_1007_slime',
  enemy_1305_mhslim_2: 'enemy_1007_slime',
});

/** Loading illustrations referenced by act2autochess modeDataDict (non-training). */
const LOADING_USED = new Set(['loading_ac_core', 'loading_ac_prototype', 'loading_ac_hard', 'loading_ac_abyss']);

const PROFESSIONS = ['caster', 'medic', 'pioneer', 'sniper', 'special', 'support', 'tank', 'warrior'];

/**
 * The 19 official 玩法说明 (tutorial) pages, in the reading order of public/js/ui/guide.js GUIDE_CHAPTERS (a test keeps
 * the two identical): 基础规则 home 1–9, 调度手册 shop 1–6, 进阶图鉴 handbook 1–4.
 */
export const GUIDE_PAGES = Object.freeze([
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `autochess_home_${i}`),
  ...[1, 2, 3, 4, 5, 6].map((i) => `autochess_shop_${i}`),
  ...[1, 2, 3, 4].map((i) => `autochess_handbook_${i}`),
]);

/**
 * Extra UI sprites (not in 07-assets.json groups): [group, key, path under ArknightsAssets2 cn assets/dyn].
 * The last two blocks are art that used to come from the local client only (tools/local-extract, DESIGN §13) and that
 * the mirror carries too (GitHub issue #42: a server without the client showed default emote icons): the 36 battle
 * emotes (shared/constants.js EMOTE_CATALOG; the bundle ui/emoticon/theme/[uc]<themeId>.ab → its icon/<picId>.png) and
 * the 19 玩法说明 pages (arts/guidebookpages/[pack]autochess.ab, 1024² like the local copies: displayed at 16:9). Their
 * manifest keys are the data/local-assets.json group and name — ui['emoticon/<dir>/<picId>'], ui['guide/<key>'] — so
 * the client looks both up by the same names (public/js/data.js artUrls: the local file first, then this copy).
 */
export const UI_EXTRAS = (() => {
  const L = [];
  const mc = 'ui/autochess/[uc]autochessouter/modechoice/auto_chess_mode_choice_state/';
  for (const m of ['normal', 'hard', 'abyss', 'funny']) L.push(['modeChoice', `${m}_rhodes_island`, `${mc}${m}_rhodes_island.png`]);
  const br = 'ui/autochess/[uc]autochessouter/battleready/auto_chess_battle_ready_state/';
  for (const k of ['bg_mountain1', 'bg_mountain2', 'bg_terrain', 'bg_ring', 'rhodes', 'rhodes_white', 'rhodes_outline']) L.push(['battleReady', k, `${br}${k}.png`]);
  const bn = 'arts/ui/[uc]battlecommon/ui_battle_new/';
  for (const k of ['btn_speed_1x', 'btn_speed_2x', 'btn_pause', 'slider_hp_back', 'slider_hp_fill', 'attack_range_attack', 'attack_range_stand']) L.push(['battleUi', k, `${bn}${k}.png`]);
  L.push(['battleUi', 'boss_avatar_bg', `${bn}enemybossinfo/sprite_enemy_boss_avatar_bg.png`]);
  L.push(['battleUi', 'skill_ready', 'arts/ui/[uc]battlecommon/ui_battle/sprite_skill_ready.png']);
  // (fork) the auto-skill mark over the head: its ring and disc (render/units.js CHARGE_MARK, stored skill charges)
  for (const k of ['sprite_auto', 'sprite_circle']) L.push(['battleUi', k, `${bn}${k}.png`]);
  // (fork) the element gauge at the feet (render/units.js EP_GAUGE): the client's enemy_ep_slider / char_ep_slider sprites
  for (const k of ['slider_ep_back', 'slider_ep_back_enemy', 'slider_ep_color_enemy', 'slider_ep_fill', 'slider_ep_fill_back_enemy',
    'slider_ep_fill_enemy', 'sprite_ep_break_hint', 'sprite_ep_break_spread', 'sprite_ep_color', 'sprite_ep_hit_spread', 'sprite_ep_icon',
    'sprite_ep_water_icon', 'sprite_ep_fire_icon', 'sprite_ep_dark_icon']) L.push(['battleUi', k, `${bn}${k}.png`]);
  L.push(['skillIcon', 'empty', 'arts/ui/[uc]charcommon/skills/empty_skill.png']);
  L.push(['skillIcon', 'empty_large', 'arts/ui/[uc]charcommon/skills/empty_skill_large.png']);
  L.push(['entry', 'season_logo_settle', 'activity/[uc]act2autochess/arts/seasonlogo/season_logo_settle_game.png']);
  const ec = 'ui/autochess/[uc]autochessbattle/effectchoose/';
  for (const k of ['bg_circle', 'bg_grad', 'bottom', 'deco_glow_top', 'plus', 'square_1', 'square_2', 'square_fill_1', 'square_fill_2', 'tip_glow', 'tip_wait', 'title']) {
    L.push(['effectChoose', k, `${ec}autochess_battle_effect_choose_panel/${k}.png`]);
  }
  for (const k of ['bg_normal', 'bg_selected', 'btn_bg', 'btn_icon', 'select_frame', 'select_glow']) L.push(['effectChoose', `card_${k}`, `${ec}card_small_item/${k}.png`]);
  for (const k of ['head_bg', 'head_outline']) L.push(['effectChoose', `avatar_${k}`, `${ec}card_avatar_item/${k}.png`]);
  const er = 'ui/autochess/[uc]autochessbattle/equipreplace/equip_replace_dialog/equip_replace_';
  for (const k of ['bg', 'arrow_head', 'arrow_line', 'avatart_bg', 'avatart_frame', 'close', 'replace_icon', 'opiton_bg']) L.push(['equipReplace', k, `${er}${k}.png`]);
  const bd = 'ui/autochess/[uc]autochessbattle/hud/dialog/autochess_hud_bond_detail_dialog/';
  for (const k of ['active_icon', 'active_stack_bg', 'arrow', 'detail_bg', 'matte_circle', 'title_char_icon']) L.push(['bondDetail', k, `${bd}${k}.png`]);
  const pr = 'ui/autochess/[uc]autochessbattle/prepready/';
  for (const k of ['cancel_bg', 'cancel_icon', 'player_bg', 'player_frame', 'player_ready', 'ready_bg', 'ready_frame', 'ready_icon']) L.push(['prepReady', k, `${pr}panel_prep_ready/${k}.png`]);
  L.push(['prepReady', 'countdown_arrow', `${pr}countdown_arrow.png`]);
  const si = 'ui/autochess/[uc]autochessouter/stageinfo/auto_chess_stage_info_state/';
  for (const k of ['img_title_mode_abyss', 'img_title_mode_funny', 'img_title_mode_hard', 'img_title_mode_normal', 'btn_confirm', 'btn_confirmed']) L.push(['stageInfo', k, `${si}${k}.png`]);
  for (const e of EMOTE_CATALOG) L.push([`emoticon/${e.dir}`, e.picId, `ui/emoticon/theme/[uc]${e.themeId}/icon/${e.picId}.png`]);
  for (const k of GUIDE_PAGES) L.push(['guide', k, `arts/guidebookpages/[pack]autochess/${k}.png`]);
  return Object.freeze(L.map((x) => Object.freeze(x)));
})();

/** Renames of research 07 `arts` groups to manifest UI groups. */
const ARTS_GROUPS = Object.freeze({
  rarityStars: 'rarity', rarityStarsYellow: 'rarityYellow', eliteIcon: 'elite', eliteIconLarge: 'eliteLarge',
  campLogo: 'campLogo', loadingIllust: 'loading', battleCommon: 'battle', act2Entry: 'entry', itemRarityBg: 'itemRarity',
});

// ---------------------------------------------------------------------------
// helpers

/**
 * One download alternative.
 * @param {string} rel path under public/assets
 * @param {string|string[]} urls
 * @param {number} [bytes] expected size
 */
function alt(rel, urls, bytes) {
  const a = { rel, urls: [].concat(urls).filter((u) => typeof u === 'string' && u), kind: kindOf(rel) };
  if (Number.isInteger(bytes) && bytes > 0) a.bytes = bytes;
  return a;
}

/** A leaf with the given alternatives (null alternatives are dropped). */
function leaf(...alts) {
  const list = alts.flat().filter((a) => a && a.urls && a.urls.length);
  return list.length ? { alts: list } : null;
}

/**
 * One operator voice line: charword voiceAsset ('char_263_skadi/CN_023') → `audio/voice/<lang>/<charId>/cn_023.mp3`.
 * An outfit's own voice set (fork, docs/OUTFITS.md) has its wordKey as folder ('char_4064_mlynar_epoque#28/CN_001'): the
 * dump's folder keeps the '#' (URL-encoded), the local one is safeName'd ('…_epoque_28').
 */
function voiceAlt(asset, lang) {
  const [charId, voiceId] = String(asset).split('/');
  if (!charId || !voiceId || !/^[a-z0-9_]+(?:#\d+)?$/i.test(charId) || !/^[a-z]{2}_\d+$/i.test(voiceId)) return null;
  const name = `${voiceId.toLowerCase()}.mp3`;
  return alt(`audio/voice/${lang}/${safeName(charId)}/${name}`, joinUrl(RAW.aa2voice, `${VOICE_DIRS[lang]}/${charId}/${name}`));
}

/** The same line from an operator's own-language dub (audio.mjs nativeVoiceDirs) → `audio/voice/native/<dir>/cn_023.mp3`. */
function nativeVoiceAlt(asset, dir) {
  const voiceId = String(asset).split('/')[1];
  if (!dir || !/^[a-z0-9_]+$/.test(dir) || !voiceId || !/^[a-z]{2}_\d+$/i.test(voiceId)) return null;
  const file = `${dir}/${voiceId.toLowerCase()}.mp3`;
  return alt(`audio/voice/native/${file}`, joinUrl(RAW.aa2voice, `${VOICE_CUSTOM_DIR}/${file}`));
}

/**
 * Full artwork (yuanyan `skin/<portraitId>b.png`, ~3 MB) → `outfit/art/<name>.webp`, converted at download time
 * (downloader.mjs convertImage: ≤ 1024 px, ~150 KB). `ids` = candidate portrait ids, best first (one file).
 */
function artAlt(name, ids) {
  const urls = ids.map((id) => joinUrl(RAW.yuanyan, `skin/${id}b.png`));
  return { ...alt(`outfit/art/${safeName(name)}.webp`, urls), from: 'png' };
}

/**
 * The manifest's `outfits` (fork, docs/OUTFITS.md): `chars[skinId]` = { avatar, portrait, art, spine: { front, back? } }
 * of each outfit of data/outfits.json, `tokens[tokenSkinId]` = { avatar, spine } of each summon look an outfit gives,
 * `defaults[charId]` = { art } — the roster operator's own artwork (E2, else E1), what the picker's 默认 card shows.
 * Files under `outfit/` (shared/resources.js: the optional `outfits` preload pack). A model's layout comes from
 * data/outfits.json (`layout`): only a model known to have a Back folder plans one, so a front-only outfit costs no
 * 404 per run (the client draws its Front model facing away too); a 'single' model (`Spine/`) is front and back alike.
 */
function planOutfits({ outfits, outfitChars, chars, skillIdxOf, fexliModel, notes }) {
  const out = { chars: {}, tokens: {}, defaults: {} };
  if (!outfits || typeof outfits !== 'object') return out;
  const enc = encodeURIComponent;
  const fexliRec = (owner, model, folders) => {
    const dir = model.replace(/#/g, '_');
    const bases = folders.map((f) => `${RAW.fexli}spine/${enc(owner)}/${enc(dir)}/${f}/${enc(dir)}`);
    return { skel: bases.map((b) => b + '.skel'), atlas: bases.map((b) => b + '.atlas'), png: bases.map((b) => b + '.png') };
  };
  for (const r of Object.values(outfits)) {
    if (!r || typeof r.id !== 'string' || typeof r.charId !== 'string' || typeof r.model !== 'string') continue;
    if (!chars[r.charId]) { notes.push(`outfit ${r.id}: ${r.charId} is not planned, skipped`); continue; }
    const name = safeName(r.id);
    const idx = skillIdxOf.get(r.charId) || [0];
    const dir = `outfit/spine/${name}/`;
    const layout = r.layout;
    const front = fexliModel(`op:${r.charId}:${name}:front`, 'op', `${dir}front/`,
      fexliRec(r.charId, r.model, layout === 'single' ? ['Spine'] : layout ? ['Front'] : ['Front', 'Spine']), idx);
    const back = layout === 'fb' ? fexliModel(`op:${r.charId}:${name}:back`, 'op', `${dir}back/`, fexliRec(r.charId, r.model, ['Back']), idx) : null;
    out.chars[r.id] = {
      avatar: leaf(alt(`outfit/avatar/${safeName(r.avatar)}.png`, joinUrl(RAW.yuanyan, `avatar/${r.avatar}.png`))),
      portrait: leaf(alt(`outfit/portrait/${safeName(r.portrait)}.png`, joinUrl(RAW.yuanyan, `portrait/${r.portrait}.png`))),
      art: leaf(artAlt(r.portrait, [r.portrait])),
      spine: { ...(front ? { front } : {}), ...(back ? { back } : {}) },
    };
    for (const [tokenId, skin] of Object.entries(r.tokens || {})) {
      if (out.tokens[skin] || typeof skin !== 'string') continue;
      const tName = safeName(skin);
      out.tokens[skin] = {
        token: literal(tokenId),
        avatar: leaf(alt(`outfit/avatar/${tName}.png`, joinUrl(RAW.yuanyan, `avatar/${skin}.png`))),
        spine: fexliModel(`token:${tokenId}:${tName}`, 'token', `outfit/spine/${tName}/`, fexliRec(tokenId, skin, ['Spine', 'Front']), [0]),
      };
    }
  }
  for (const id of [...new Set(outfitChars || [])].sort()) {
    if (chars[id]) out.defaults[id] = { art: leaf(artAlt(`${id}_default`, [`${id}_2`, `${id}_1`])) };
  }
  return out;
}

/** Sound path under sound_beta_2 → alternative under public/assets/audio/<sub>. */
function soundAlt(path, sub = 'sfx') {
  const rel = `audio/${sub}/` + path.split('/').map(safeName).join('/');
  return alt(rel, joinUrl(RAW.aa2voice, path));
}

function soundLeaf(paths, sub = 'sfx', max = 4) {
  return leaf((paths || []).slice(0, max).map((p) => soundAlt(p, sub)));
}

/**
 * A unit's SFX roles (pickUnitSfx) → { roles: { attack?, hit?, die?, born? } sound leaves, mix: { [role]: { p?, vol? } }
 * | null } — the official play chance / volume of each role's bank (audio.mjs bankMix; community report #30: 猎狗's
 * attack bank is 80 % silence). The caller stores `mix` last in the unit's entry (sfx.units[id].mix).
 * Attack/hit roles also retain canonical pool references (#680); the parameters live once in sfx.pools.
 */
function unitSounds(audio, sfx, poolRef, leafOf = soundLeaf) {
  const roles = {};
  let mix = null;
  const pools = {};
  const groups = {};
  for (const r of ['attack', 'hit', 'die', 'born']) {
    if (!sfx[r]) continue;
    roles[r] = leafOf(sfx[r]);
    const m = typeof audio.mixOf === 'function' ? audio.mixOf(sfx[r]) : null;
    if (m) (mix || (mix = {}))[r] = m;
    if (r === 'attack' || r === 'hit') {
      const id = poolRef(sfx[r]);
      if (id) pools[r] = id;
    } else {
      // (fork) die / born have no pool reference: their bank's mixer group on its own (attack / hit: in the pool)
      const g = audio.groupOf?.(sfx[r]);
      if (g) groups[r] = g;
    }
  }
  if (Object.keys(pools).length) roles.pools = pools;
  if (Object.keys(groups).length) roles.groups = groups;
  return { roles, mix };
}

/**
 * (fork, enemy sound audit chunk 2) An enemy's skill-cast sounds → sfx.units[id].casts: { [slot]: { pk, start?: [{ url,
 * pool? }], hit?: { url, pool? }, keys?: string[] } } (docs/ASSETS.md). `start` rings at the sim's ['cast', id, slot];
 * `hit` when one of `keys` (the effects of that skill's impact) spawns, or on the impact of an attack-turn cast.
 */
function enemyCastSounds(audio, banks, slots, poolRef) {
  if (!Array.isArray(slots) || !slots.length) return null;
  const part = (paths) => { const e = { url: soundLeaf(paths, 'sfx', 1) }; const p = poolRef(paths); if (p) e.pool = p; return e; };
  const out = {};
  for (const s of slots) {
    const got = pickEnemyCastSfx(banks, audio.bank, s, audio.loopOf);
    if (!got) continue;
    const e = { pk: s.pk };
    if (got.start.length) e.start = got.start.map(part);
    if (got.hit) {
      e.hit = part(got.hit);
      const f = got.hitFrom;
      const pj = f?.projectile ? s.proj?.[f.projectile] : null;
      const keys = f?.ev === 'ON_ABILITY_HIT' ? s.hitKeys : f?.ev === 'ON_PROJECTILE_HIT' ? pj?.hit : pj?.reach?.length ? pj.reach : pj?.hit;
      if (keys?.length) e.keys = [...keys].sort();
    }
    out[String(s.slot)] = e;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * (fork, enemy sound audit job 3) An enemy's moment sounds onto its sfx entry `u` (docs/ASSETS.md): `fxSounds`
 * (ENEMY_FX_SOUND_BANKS: { url, pool?, after?, also?: [{ url, pool?, after? }], loop?, loopPool?, endLoop? }; `after` in
 * game s), `keySounds` (ENEMY_KEY_SOUND_BANKS: effect key → { url, pool? }), its normal attack's extra sounds appended to
 * `attackNext` (ENEMY_ATTACK_ALSO_BANKS) and the attack modes' `attacks` / `hits` (+ pools) by mode index
 * (ENEMY_MODE_ATTACK_BANKS). A bank missing from the sound index is a note, never a guess.
 */
function enemyMomentSounds(u, id, audio, banks, poolRef, notes) {
  const part = (s) => {
    const name = typeof s === 'string' ? s : s?.bank;
    const paths = typeof name === 'string' ? audio.bank(name) : null;
    if (!paths?.length) { if (name) notes.push(`${id}: moment bank missing: ${name}`); return null; }
    const e = { url: soundLeaf(paths, 'sfx', 1) };
    const p = poolRef(paths);
    if (p) e.pool = p;
    if (s?.after > 0) e.after = s.after;
    return e;
  };
  const fx = {};
  for (const [key, raw] of Object.entries(ENEMY_FX_SOUND_BANKS[id] || {})) {
    const spec = raw && typeof raw === 'object' && !Array.isArray(raw) && !raw.bank ? raw : { play: raw };
    const [lead, ...also] = [].concat(spec.play || []).map(part).filter(Boolean);
    const e = lead ? { ...lead } : {};
    if (also.length) e.also = also;
    const loop = spec.loop ? part(spec.loop) : null;
    if (loop) { e.loop = loop.url; if (loop.pool) e.loopPool = loop.pool; }
    if (spec.endLoop) e.endLoop = true;
    if (e.url || e.loop || e.endLoop) fx[key] = e;
  }
  if (Object.keys(fx).length) u.fxSounds = fx;
  const keys = {};
  for (const [k, name] of Object.entries(ENEMY_KEY_SOUND_BANKS[id] || {})) { const e = part(name); if (e) keys[k] = e; }
  if (Object.keys(keys).length) u.keySounds = keys;
  for (const [mode, roles] of Object.entries(ENEMY_MODE_ATTACK_BANKS[id] || {})) {
    for (const [role, evs] of Object.entries(roles)) {
      const paths = evs.map((ev) => banks?.get(ev)).find((p) => p?.length);
      if (!paths) { notes.push(`${id}: mode ${mode} ${role} bank missing: ${evs.join(' / ')}`); continue; }
      const t = role === 'attack' ? 'attacks' : 'hits';
      (u[t] ||= {})[mode] = soundLeaf(paths);
      const p = poolRef(paths);
      if (p) (u[role === 'attack' ? 'attackPools' : 'hitPools'] ||= {})[mode] = p;
    }
  }
}

/** (fork, enemy sound audit job 3) ENEMY_ATTACK_ALSO_BANKS onto `u.attackNext` (played with each normal attack). */
function enemyAttackAlso(u, id, audio, poolRef, notes) {
  for (const name of ENEMY_ATTACK_ALSO_BANKS[id] || []) {
    const paths = audio.bank(name);
    if (!paths?.length) { notes.push(`${id}: attack bank missing: ${name}`); continue; }
    const e = { url: soundLeaf(paths, 'sfx', 1) };
    const p = poolRef(paths);
    if (p) e.pool = p;
    (u.attackNext ||= []).push(e);
  }
}

/** Expected bytes for a 07 {url, bytes} record when it matches `url`. */
function bytesOf(rec, url) {
  return rec && typeof rec === 'object' && rec.url === url && Number.isInteger(rec.bytes) ? rec.bytes : undefined;
}

/** Local file stem for a skeleton URL or file name ('…/char_102_texas.skel' → 'char_102_texas'). */
function skelStem(urlOrName) {
  return safeName(urlBase(urlOrName).replace(/\.skel$/i, ''));
}

/** Collect every enemy key referenced under a wave/branch structure. */
function walkKeys(node, add) {
  if (Array.isArray(node)) { for (const x of node) walkKeys(x, add); return; }
  if (node && typeof node === 'object') {
    if (typeof node.key === 'string') add(node.key);
    for (const v of Object.values(node)) walkKeys(v, add);
  }
}

/**
 * A research-07-shaped operator record of a character research 07 does not list (the 自选 owned-6★ picks): every URL
 * from the patterns of 07-assets.json `meta.patterns` — avatar / portrait (E0–E1 and E2), the default-skin battle Spine
 * Front / Back, the skill icons, the sub-profession icon. No expected byte counts (the downloader validates the files);
 * a file the mirrors lack is a miss the client falls back from (the E2 art to the E0–E1 one, a missing Back to Front).
 * @param {string} id charId
 * @param {{ subProfessionId?: string|null, nationId?: string|null, skills?: Array<{ index: number, skillId: string, iconId?: string|null }> }} x
 */
export function patternOperator(id, x = {}) {
  const sp = (side) => {
    const b = `${RAW.fexli}spine/${id}/${id}/${side}/${id}`;
    return { skel: `${b}.skel`, atlas: `${b}.atlas`, png: `${b}.png` };
  };
  return {
    name: x.name ?? null, subProfessionId: x.subProfessionId ?? null, nationId: x.nationId ?? null, chess: [],
    avatar: { e0e1: { url: `${RAW.yuanyan}avatar/${id}.png` }, e2: { url: `${RAW.yuanyan}avatar/${id}_2.png` } },
    portrait: { e0e1: { url: `${RAW.yuanyan}portrait/${id}_1.png` }, e2: { url: `${RAW.yuanyan}portrait/${id}_2.png` } },
    skills: (x.skills || []).map((s) => ({
      index: s.index, skillId: s.skillId, iconId: s.iconId || s.skillId,
      icon: { url: `${RAW.yuanyan}skill/skill_icon_${encodeURIComponent(s.iconId || s.skillId)}.png` },
    })),
    battleSpine: { front: sp('Front'), back: sp('Back'), note: null },
    subProfessionIcon: x.subProfessionId ? joinUrl(RAW.aa2, `arts/ui/subprofessionicon/sub_${x.subProfessionId}_icon.png`) : null,
  };
}

// ---------------------------------------------------------------------------
// id sets

/**
 * Per-charId skill indices used by the pool (0-based; primary first).
 * @param {any} ops03 docs/research/03-operators.json
 * @returns {Map<string, number[]>}
 */
/**
 * (fork, enemy sound audit chunk 2) Per enemy of `enemies` (data skills[] order: the slot of the sim's ['cast', id, slot]),
 * what audio.mjs pickEnemyCastSfx needs (the skill's prefabKey and ability nodes, its projectiles) and the effect keys of
 * the skill's own impact in the local fx index: `hitKeys` (the skill plan's `hit` role) and per projectile its onHit /
 * onReached keys — minus any key the enemy's normal attack also spawns. The client plays the impact sound when one of
 * them spawns (audio.js fxKey). Without an fx index: the prefabKey as the only node, and no keys.
 * @param {any} index parsed fx index (or null)
 * @param {Record<string, any>} enemies enemy records by id (data/enemies.json)
 * @returns {Map<string, {slot:number, pk:string, nodes:string[], projectiles:string[], hitKeys:string[],
 *   proj: Record<string, {hit:string[], reach:string[]}>}[]>}
 */
export function enemyCastsFromIndex(index, enemies) {
  const out = new Map();
  const units = index?.units || {};
  const prefabs = index?.prefabs || {};
  const lc = (s) => String(s).toLowerCase();
  const resolve = (id) => {
    let u = units[id];
    const seen = new Set();
    while (u?.aliasOf && typeof u.aliasOf === 'string' && !seen.has(u.aliasOf)) { seen.add(u.aliasOf); u = units[u.aliasOf]; }
    return u || null;
  };
  const strings = (v, acc = new Set()) => {
    if (typeof v === 'string') { if (Object.hasOwn(prefabs, lc(v))) acc.add(lc(v)); } else if (Array.isArray(v)) for (const x of v) strings(x, acc);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, acc);
    return acc;
  };
  const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x) => typeof x === 'string').map(lc);
  for (const [id, rec] of Object.entries(enemies || {})) {
    const skills = Array.isArray(rec?.skills) ? rec.skills : [];
    if (!skills.length) continue;
    const u = resolve(id);
    // the normal attack's own effect keys: a skill impact key the attack also spawns would ring on every attack
    const attackKeys = strings(u?.modes || []);
    const slots = [];
    skills.forEach((s, slot) => {
      if (!s || s.prefabKey == null) return;
      const pk = String(s.prefabKey);
      const sk = u?.skills?.[lc(pk)] || null;
      const abilities = Array.isArray(sk?.abilities) ? sk.abilities : [];
      const projectiles = [...new Set([...list(sk?.projectiles), ...abilities.flatMap((a) => [...list(a?.projectileKey), ...list(a?.extraProjectileKeys)])])];
      const free = (keys) => keys.filter((k) => !attackKeys.has(k));
      const proj = {};
      for (const p of projectiles) {
        const d = index?.projectiles?.[p];
        if (d) proj[p] = { hit: free(list(d.onHit)), reach: free(list(d.onReached)) };
      }
      slots.push({ slot, pk, nodes: [pk, ...abilities.map((a) => a?.node).filter((n) => typeof n === 'string')], projectiles,
        hitKeys: free(list(sk?.roles?.hit)), proj });
    });
    if (slots.length) out.set(id, slots);
  }
  return out;
}

/**
 * Compact mode list for {@link assignSkillModeSfx}, from a local fx index (`public/assets/local/fx/index.json`,
 * not committed). `skills[id].mode` is the mode index the skill switches to. An `aliasOf` unit uses the target's modes.
 * Operators the index does not list are absent, and the plan keeps the filename-letter fallback for them.
 * @param {any} index parsed fx index
 * @returns {Map<string, {modes:{name:string}[], skillMode:Map<string, number|null>}>}
 */
export function charModesFromIndex(index) {
  const units = index?.units;
  const map = new Map();
  if (!units || typeof units !== 'object') return map;
  const resolve = (id, seen = new Set()) => {
    let u = units[id];
    while (u?.aliasOf && typeof u.aliasOf === 'string' && !seen.has(u.aliasOf)) {
      seen.add(u.aliasOf);
      u = units[u.aliasOf];
    }
    return u || null;
  };
  for (const id of Object.keys(units)) {
    if (!/^char_/.test(id)) continue;
    const u = resolve(id);
    if (!Array.isArray(u?.modes)) continue;
    const skillMode = new Map();
    for (const sid of Object.keys(u.skills || {})) {
      skillMode.set(sid, skillModeOf(u, sid));   // (fork) a name-guessed mode loses to the data's (shared/fxModes.js)
    }
    map.set(id, {
      modes: u.modes.map((m) => ({ name: typeof m?.name === 'string' ? m.name : '' })),
      skillMode,
    });
  }
  return map;
}

export function skillIndicesByChar(ops03) {
  const primary = new Map();
  const all = new Map();
  const add = (id, idx, isPrimary) => {
    if (typeof id !== 'string' || !Number.isInteger(idx) || idx < 0) return;
    if (!all.has(id)) all.set(id, new Set());
    all.get(id).add(idx);
    if (isPrimary && !primary.has(id)) primary.set(id, idx);
  };
  const chess = Array.isArray(ops03?.chess) ? ops03.chess : [];
  for (const c of chess) if (c.charId) add(c.charId, c.defaultSkillIndex, !c.isGolden);
  for (const c of chess) if (c.backup?.charId) add(c.backup.charId, c.backup.skillIndex, true);
  const out = new Map();
  for (const [id, set] of all) {
    const p = primary.has(id) ? primary.get(id) : Math.min(...set);
    out.set(id, [p, ...[...set].filter((i) => i !== p).sort((a, b) => a - b)]);
  }
  return out;
}

/**
 * Every enemy id that can appear in an act2autochess match.
 * @param {{ assets07:any, enemies05:any, maps05:any, ops03?:any }} r
 *   ops03 (optional): enemy units spawned by operator kits (e.g. 隐德来希's S3 summons
 *   `enemy_5601_entlec` 心烛 via a talent blackboard `take_extra_enemy_key`)
 * @returns {string[]} sorted ids
 */
export function collectEnemyIds({ assets07, enemies05, maps05, ops03 }) {
  const known = (id) => !!(enemies05?.enemies?.[id] || assets07?.enemies?.[id]);
  const set = new Set(Object.keys(assets07?.enemies || {}));
  const add = (k) => { if (typeof k === 'string' && /^enemy_\d+_[a-z0-9_]+$/i.test(k)) set.add(k); };
  for (const c of Array.isArray(ops03?.chess) ? ops03.chess : []) {
    const kit = JSON.stringify([c?.skill ?? null, c?.talents ?? null, c?.tokens ?? null]);
    for (const m of kit.match(/enemy_\d+_[a-z0-9_]+/gi) || []) add(m);
  }
  for (const lv of Object.values(maps05?.roundLevels || {})) {
    const usedBy = Array.isArray(lv?.usedBy) ? lv.usedBy : [];
    if (usedBy.length && usedBy.every((u) => String(u).startsWith('mode_training'))) continue; // tutorial is out of scope
    for (const ref of lv?.enemyDbRefs || []) add(Array.isArray(ref) ? ref[0] : ref);
    walkKeys(lv?.waves, add);
    walkKeys(lv?.branches, add);
  }
  for (const b of Object.values(enemies05?.bosses || {})) { add(b?.enemyId); for (const s of b?.spawns || []) add(s); }
  // Closure over summons: randomEnemyAttribute spawns + `enemy_key` blackboard references.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...set]) {
      const e = enemies05?.enemies?.[id];
      if (!e) continue;
      const refs = new Set(e.ac?.rand?.spawns || []);
      for (const m of JSON.stringify([e.skills ?? null, e.talent ?? null]).match(/enemy_\d+_[a-z0-9_]+/gi) || []) refs.add(m);
      for (const r of refs) if (!set.has(r) && known(r)) { set.add(r); changed = true; }
    }
  }
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// plan

/**
 * Build the asset plan.
 * @param {object} p
 * @param {any} p.assets07 docs/research/07-assets.json
 * @param {any} p.ops03 docs/research/03-operators.json
 * @param {any} p.enemies05 docs/research/05-enemies.json
 * @param {any} p.maps05 docs/research/05-maps.json
 * @param {ReturnType<import('./audio.mjs').indexAudio>} p.audio indexed audio_data.json
 * @param {any} p.modelsData Ark-Models models_data.json
 * @param {any} [p.charword] parsed excel/charword_table.json — the operators' official voice slots (voice, voiceJp)
 * @param {string} [p.voiceLang] voice dump of `audio.voice` (the 中文 setting): cn (default) | jp | en | kr — `audio.voiceJp`
 *   is the JP dub (`voice/`) whatever it is
 * @param {boolean} [p.voiceJp] plan the JP tree `audio.voiceJp` (default true)
 * @param {boolean} [p.optionalVoice] also plan the EN / KR / own-language trees (VOICE_OPTIONAL_TREES: `audio.voiceEn` /
 *   `audio.voiceKr` / `audio.voiceNative`, plus `audio.voiceNativeLangType`); default false so a plan that only asks
 *   for the two 0.2.2 trees stays those two. fetch-assets passes true unless `--no-optional-voice`.
 * @param {Iterable<string>|null} [p.voiceSlots] which voice slots to plan: VOICE_BATTLE_SLOTS (default) plans only the
 *   lines a battle can play, null plans every slot of audio.mjs VOICE_SLOTS (`--voice-all`). The prep-only slots
 *   (干员报到 / 编入队伍 / 任命队长) are never requested by the client and cost 360 files / 19.3 MB of downloads.
 * @param {string[]} [p.extraEnemyIds] more enemy ids that can spawn (e.g. keys of data/enemies.json)
 * @param {string[]} [p.extraTokenIds] more token ids (e.g. token_* keys of data/tokens.json)
 * @param {Record<string,string>} [p.extraHandbook] enemyId → handbook/model id (e.g. from data/bosses.json)
 * @param {Record<string, import('./spine.mjs').LocalSpineMeta>} [p.localEnemySpines] metadata of the enemy models the
 *   local client has (the committed tools/assets/local-enemy-spines.json, never the disk): each planned enemy listed
 *   gets `spineLocal` = { group: 'spine/enemy/<id>', ...meta } beside its web `spine`
 * @param {Record<string, import('./spine.mjs').LocalSpineMeta>} [p.localTokenSpines] the same for the token (summon)
 *   models (tools/assets/local-token-spines.json): each planned token listed gets `spineLocal` = { group:
 *   'spine/token/<id>', ...meta } beside its web `spine`, if any (most have none: the client drew the avatar)
 * @param {Record<string, any>} [p.extraOperators] charId → { subProfessionId, nationId, skills: [{ index, skillId, iconId }] }
 *   of characters research 07 does not list (the 自选 owned-6★ picks, data/backups.json `units`): planned like the pool
 *   operators from patternOperator
 * @param {string[]} [p.moduleTypes] module type icon ids (`typeIcon`, e.g. 'sol-x') → manifest `modules[typeIcon]`, the
 *   official type icon (arts/ui/uniequiptype) the 干员调配 / 自选 module tiles draw when the local-client art lacks it
 * @param {Record<string, any>|null} [p.outfits] data/outfits.json (fork, docs/OUTFITS.md) → manifest `outfits`: each
 *   outfit's avatar, portrait, artwork (WebP) and battle model, its summons' looks, every roster operator's default
 *   artwork, and the outfits' own voice sets in the voice trees (keyed by their word key)
 * @param {string[]} [p.outfitChars] the roster's charIds (data/chess.json): whose default artwork the outfit picker shows
 * @param {Array<{name:string,rel:string,urls:string[],kind:string}>} [p.statsTemplate] official statistics UI assets
 * @param {Map<string, {modes:{name:string}[], skillMode:Map<string, number|null>}>|null} [p.charModes]
 *   from {@link charModesFromIndex} (the local fx index). Absent: skill attack slots stay on the filename letter.
 * @param {ReturnType<typeof enemyCastsFromIndex>|null} [p.enemyCasts] (fork) enemy skill slots → sfx.units[id].casts
 * @returns {{ template: any, models: Map<string, any>, notes: string[] }}
 */
export function buildPlan({ assets07, ops03, enemies05, maps05, audio, modelsData, charword = null, voiceLang = 'cn',
  voiceJp = true, voiceSlots = VOICE_BATTLE_SLOTS, optionalVoice = false,
  extraEnemyIds = [], extraTokenIds = [], extraHandbook = {}, localEnemySpines = {}, localTokenSpines = {}, extraOperators = {},
  moduleTypes = [], outfits = null, outfitChars = [], statsTemplate = [], charModes = null, enemyCasts = null, extraBands = {}, extraItems = {}, extraBonds = {} }) {
  const notes = [];
  /** @type {Map<string, any>} */
  const models = new Map();
  const skillIdx = skillIndicesByChar(ops03);

  // --- Spine model helpers -------------------------------------------------
  const addModel = (key, def) => { if (!models.has(key)) models.set(key, { key, ...def }); return { model: key }; };
  const fexliModel = (key, kind, dir, rec, skillIndices) => {
    // rec: 07 { skel:{url,bytes}|url|url[], atlas, png } — arrays are candidate folders (same order for all three)
    const us = (x) => (Array.isArray(x) ? x : [typeof x === 'string' ? x : x?.url]).filter((v) => typeof v === 'string' && v);
    const b = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x.bytes : undefined);
    if (!us(rec?.skel).length || !us(rec?.atlas).length || !us(rec?.png).length) return null;
    const stem = skelStem(us(rec.skel)[0]);
    return addModel(key, {
      kind, dir, pma: false, skillIndices,
      baseUrl: urlDir(us(rec.atlas)[0]),
      skel: alt(`${dir}${stem}.skel`, us(rec.skel), b(rec.skel)),
      // pixi-spine finds the atlas by swapping the .skel extension: keep the same stem.
      atlas: { ...alt(`${dir}${stem}.atlas`, us(rec.atlas), b(rec.atlas)), mutable: true },
      pngs: [alt(dir + safeName(urlBase(us(rec.png)[0])), us(rec.png), b(rec.png))],
    });
  };

  // --- operators -----------------------------------------------------------
  const chars = {};
  const skills = {};
  const skillsById = {};
  const unitsSfx = {};
  const sfxPools = {};
  const poolRef = (paths) => {
    const pool = audio.poolOf?.(paths);
    if (!pool) return null;
    const { id, ...params } = pool;
    // (fork) each file under the path the client plays it from (soundAlt: safeName'd, an outfit's '#2' → '_2'), the key
    // public/js/audio.js reads its pitch / delay by
    if (params.sounds) params.sounds = Object.fromEntries(Object.entries(params.sounds).map(([p, s]) => [p.split('/').map(safeName).join('/'), s]));
    sfxPools[id] = literal(params);
    return id;
  };
  // the operators behind the AI seats' names that the mode's roster does not have (阿米娅, 杜宾): their pictures only, for
  // the room's seat cards. No model, voice or sounds: they never fight
  const pictureOnly = Object.values(BOT_OPERATORS);
  const known = assets07?.operators || {};
  const extraOps = {};
  for (const [id, x] of Object.entries(extraOperators || {})) if (/^char_\d+_[a-z0-9]+$/i.test(id) && !known[id]) extraOps[id] = patternOperator(id, x);
  const operators = { ...known, ...extraOps };
  for (const id of pictureOnly) {
    if (operators[id]) continue;
    const p = patternOperator(id);
    chars[id] = {
      avatar: leaf(alt(`char/avatar/${id}.png`, p.avatar.e0e1.url)),
      portrait: leaf(alt(`char/portrait/${id}_1.png`, p.portrait.e0e1.url)),
    };
  }
  const charIds = Object.keys(operators).sort();
  const skillIdxOf = new Map(); // charId → the skill indices its models resolve (an outfit's model resolves the same)
  // (fork) one operator's chars / skills / sfx.units entries. Run once per operator, then again per outfit with its own
  // sound banks (below) through audio.mjs outfitAudioView: the same picks, each official bank swapped for the outfit's
  const operatorEntry = (id, audio, soundLeaf, poolRef, unitsSfx, notes) => {
    const o = operators[id];
    // DESIGN §16 operator loadouts: any skill of the character can be equipped — the icons, skill SFX and Spine skill
    // clips of every skill index (the pool's primary index first, as before)
    const idx0 = skillIdx.get(id) || [0];
    const idx = [...idx0, ...(o.skills || []).map((k) => k.index).filter((i) => Number.isInteger(i) && i >= 0 && !idx0.includes(i)).sort((a, b) => a - b)];
    skillIdxOf.set(id, idx);
    const c = {};
    c.avatar = leaf(alt(`char/avatar/${id}.png`, o.avatar?.e0e1?.url, o.avatar?.e0e1?.bytes));
    if (o.avatar?.e2?.url) c.avatarE2 = leaf(alt(`char/avatar/${id}_2.png`, o.avatar.e2.url, o.avatar.e2.bytes));
    c.portrait = leaf(alt(`char/portrait/${id}_1.png`, o.portrait?.e0e1?.url, o.portrait?.e0e1?.bytes));
    if (o.portrait?.e2?.url) c.portraitE2 = leaf(alt(`char/portrait/${id}_2.png`, o.portrait.e2.url, o.portrait.e2.bytes));
    c.spine = {};
    const front = fexliModel(`op:${id}:front`, 'op', `spine/op/${id}/front/`, o.battleSpine?.front, idx);
    if (front) c.spine.front = front; else notes.push(`${id}: no Front battle Spine in research data`);
    const back = fexliModel(`op:${id}:back`, 'op', `spine/op/${id}/back/`, o.battleSpine?.back, idx);
    if (back) c.spine.back = back;
    chars[id] = c;
    // skill icons (+ skill SFX) of every skill index; normal-mode attack / impact sounds only (a ranged operator's own
    // projectile banks projectile_chr_<name> as fallbacks — user playtest #4 item 6, audio.mjs pickUnitSfx)
    const short = id.replace(/^char_\d+_/, '');
    const sfx = pickUnitSfx(audio.unitBanks.get(id), { operator: true, projectile: {
      born: audio.bank(`battle.ON_PROJECTILE_BORN.projectile_chr_${short}`), hit: audio.bank(`battle.ON_PROJECTILE_HIT.projectile_chr_${short}`) } });
    for (const [r, name] of Object.entries(UNIT_SOUND_BANKS[id] || {})) { const p = audio.bank(name); if (p.length) sfx[r] = p; }
    const { roles: u, mix } = unitSounds(audio, sfx, poolRef, soundLeaf);
    const skillSfx = {};
    // Per-skill ATTACK / IMPACT sound (audio.mjs assignSkillModeSfx): a skill mode has its own swing and its own hit
    // sound, and neither may play as the unit's normal attack / impact (银灰, 纯烬艾雅法拉). An operator whose every
    // attack belongs to a skill mode has no normal bank at all (司霆惊蛰 — 解放者, she only attacks while a skill runs).
    // With the local fx index, the bank's mode index is the operator's own mode and the skill's `mode` says which one
    // runs (#679: 玛恩纳's S3 swing is `attack.3`, not the `_s` letter). Without the index the activation sound's
    // letter, or else d/h/s for slots 1/2/3, stays ([ASSUMED], DESIGN §28.17). The client plays the slot while that
    // skill is active (public/js/audio.js unit()).
    const cm = charModes?.get(id) ?? null;
    const skillRows = [];
    for (const i of idx) {
      const s = (o.skills || []).find((k) => k.index === i);
      if (!s) continue;
      const start = s.skillId ? audio.skillBanks.get(s.skillId)?.get('ON_SKILL_START') : null;
      const linked = cm && s.skillId ? cm.skillMode.get(s.skillId) : undefined;
      skillRows.push({
        index: i, skillId: s.skillId ?? null,
        mode: Number.isInteger(linked) ? linked : null,
        start: start?.[0] ?? null,
      });
    }
    const assigned = assignSkillModeSfx(audio.unitBanks.get(id), skillRows, cm?.modes ?? null, cm?.skillMode ?? null);
    const quietHits = [];
    for (const [i, roles] of Object.entries(SKILL_MODE_BANKS[id] || {})) {
      for (const [role, name] of Object.entries(roles)) {
        if (role !== 'attack' && role !== 'hit') continue; // attackAlso: below
        const table = role === 'attack' ? assigned.attacks : assigned.hits;
        if (name === null) { delete table[i]; if (role === 'hit') quietHits.push(Number(i)); continue; }
        const p = audio.bank(name);
        if (p.length) table[i] = p;
      }
    }
    const attacks = {};
    const hits = {};
    const attackMix = {}, hitMix = {};
    const attackPools = {}, hitPools = {};
    const skillGroups = {};
    // (fork) files a per-operator table below already plays: the general skill banks never take them twice
    const tableFiles = new Set();
    for (const t of [FX_SOUND_BANKS[id], SKILL_ON_BANKS[id], SKILL_OFF_BANKS[id], SKILL_MODE_BANKS[id], UNIT_SOUND_BANKS[id]]) {
      for (const v of Object.values(t || {})) {
        for (const e of [v].flat().flatMap((x) => (x && typeof x === 'object' && !x.bank ? Object.values(x) : [x])).flat()) {
          const name = typeof e === 'string' ? e : e?.bank;
          const p = name ? audio.bank(name) : null;
          if (p?.length) tableFiles.add(p[0]);
        }
      }
    }
    // … and the unit's normal swing / impact (煌's S1 ability repeats p_atk_chainsaw_n): not a skill sound of its own
    for (const r of ['attack', 'hit']) if (sfx[r]?.length) tableFiles.add(sfx[r][0]);
    const ownOn = {}, ownOff = {};
    for (const i of idx) {
      const s = (o.skills || []).find((k) => k.index === i);
      if (!s) { notes.push(`${id}: skill index ${i} missing in research data`); continue; }
      const iconId = s.iconId || s.skillId;
      if (s.icon?.url && !skills[iconId]) skills[iconId] = leaf(alt(`skill/${safeName(iconId)}.png`, s.icon.url, s.icon.bytes));
      if (s.skillId) skillsById[s.skillId] = iconId;
      // (fork) the skill's own ability banks, for every operator (skillSounds.mjs: the files say swing / impact / cast)
      let ss = audio.skillBanks.get(s.skillId)?.get('ON_SKILL_START');
      const own = skillAbilitySounds(audio, s.skillId, { sting: ss, skip: tableFiles });
      if (!ss?.length && own.sting) ss = own.sting;
      if (own.attack && !assigned.attacks[String(i)]) assigned.attacks[String(i)] = own.attack;
      if (own.hit && !assigned.hits[String(i)] && !quietHits.includes(i)) assigned.hits[String(i)] = own.hit;
      if (own.on.length) ownOn[String(i)] = own.on;
      if (own.off.length) ownOff[String(i)] = own.off.map((paths) => ({ paths }));
      if (ss?.length) {
        skillSfx[String(i)] = soundLeaf(ss);
        const g = audio.groupOf?.(ss);
        if (g) skillGroups[String(i)] = g;
      }
      const ak = assigned.attacks[String(i)];
      if (ak) {
        attacks[String(i)] = soundLeaf(ak);
        const m = audio.mixOf?.(ak);
        if (m) attackMix[String(i)] = m;
        const pool = poolRef(ak);
        if (pool) attackPools[String(i)] = pool;
      }
      const hk = assigned.hits[String(i)];
      if (hk) {
        hits[String(i)] = soundLeaf(hk);
        const m = audio.mixOf?.(hk);
        if (m) hitMix[String(i)] = m;
        const pool = poolRef(hk);
        if (pool) hitPools[String(i)] = pool;
      }
    }
    const primarySkill = skillSfx[String(idx[0])];
    if (primarySkill) u.skill = primarySkill;
    // (fork) by index for every operator with a choice of skills: the map's absent index is a skill with no cast sound
    // (public/js/audio.js unit()), and a lone bank on any skill but the primary reaches the client at all
    if (Object.keys(skillSfx).length && idx.length > 1) u.skills = skillSfx;
    // (fork) each skill sound's mixer group (public/js/audioMixer.js): `skill`'s in groups.skill, by index like `skills`
    if (primarySkill && skillGroups[String(idx[0])]) u.groups = { ...(u.groups || {}), skill: skillGroups[String(idx[0])] };
    if (u.skills && Object.keys(skillGroups).length) u.skillGroups = skillGroups;
    if (Object.keys(attacks).length) u.attacks = attacks;
    // (fork) several banks of one moment (FX_SOUND_BANKS, SKILL_MODE_BANKS attackAlso): [{ url, pool?, after? }] of those
    // that exist, each on its bank's pool
    const soundParts = (spec) => {
      const parts = [];
      for (const s of [].concat(spec || [])) {
        const name = typeof s === 'string' ? s : s?.bank;
        const paths = name ? audio.bank(name) : null;
        if (!paths?.length) continue;
        const e = { url: soundLeaf(paths, 'sfx', 1) };
        const p = poolRef(paths);
        if (p) e.pool = p;
        if (s.after > 0) e.after = s.after;
        parts.push(e);
      }
      return parts;
    };
    const attackAlso = {};
    for (const [i, roles] of Object.entries(SKILL_MODE_BANKS[id] || {})) {
      const parts = soundParts(roles.attackAlso);
      if (parts.length) attackAlso[i] = parts;
    }
    if (Object.keys(attackAlso).length) u.attackAlso = attackAlso;
    // (fork) a mode impact that only replays the normal one carries no entry (#679: 艾雅法拉's S3 projectile plays her
    // normal impact file); an outfit's twin of it can differ, and then it stays (her Sanrio outfit's p_imp_firemag_s)
    for (const i of Object.keys(hits)) {
      if (u.hit && JSON.stringify(hits[i]) === JSON.stringify(u.hit)) { delete hits[i]; delete hitMix[i]; delete hitPools[i]; }
    }
    // …and so does a mode swing that replays the normal one (艾雅法拉's S2 swing; her Sanrio outfit's p_atk_firemag_h stays)
    for (const i of Object.keys(attacks)) {
      if (u.attack && JSON.stringify(attacks[i]) === JSON.stringify(u.attack)) { delete attacks[i]; delete attackMix[i]; delete attackPools[i]; }
    }
    if (Object.keys(hits).length) u.hits = hits;
    if (Object.keys(attackMix).length) u.attackMix = attackMix;
    if (Object.keys(hitMix).length) u.hitMix = hitMix;
    if (Object.keys(attackPools).length) u.attackPools = attackPools;
    if (Object.keys(hitPools).length) u.hitPools = hitPools;
    if (mix) u.mix = mix;
    // (fork) the kit fx's own sounds (public/js/audio.js _fxSound), each on its bank's official pool
    if (FX_SOUND_BANKS[id]) {
      const fxSounds = {};
      for (const [key, spec] of Object.entries(FX_SOUND_BANKS[id])) {
        const [lead, ...also] = soundParts(spec);
        if (lead) fxSounds[key] = also.length ? { ...lead, also } : lead;
      }
      if (Object.keys(fxSounds).length) u.fxSounds = fxSounds;
    }
    if (quietHits.length) u.quietHits = literal(quietHits);
    // (fork) an entry may list several banks (all play at that edge): the first is the entry, the others its `more`
    const edge = (table) => {
      const out = {};
      for (const [i, e0] of Object.entries(table || {})) {
        const list = [];
        for (const e of Array.isArray(e0) ? e0 : [e0]) {
          const paths = e.paths || audio.bank(typeof e === 'string' ? e : e.bank);
          if (!paths?.length) continue;
          const one = { url: soundLeaf(paths, 'sfx', 1) };
          const p = poolRef(paths);
          if (p) one.pool = p;
          if (e.hold) one.hold = true;
          if (e.loop) one.loop = true;
          list.push(one);
        }
        if (!list.length) continue;
        out[i] = list.length > 1 ? { ...list[0], more: list.slice(1) } : list[0];
      }
      return Object.keys(out).length ? out : null;
    };
    // (fork) a per-operator entry wins for its skill index; the skill's own ability banks fill every other one
    const on = edge({ ...ownOn, ...SKILL_ON_BANKS[id] }), off = edge({ ...ownOff, ...SKILL_OFF_BANKS[id] });
    if (on) u.skillOn = on;
    if (off) u.skillOff = off;
    // 丰川祥子's notes (sim notes.js, ['fx', 'note', …, { look, on }]): each note type's own born / hit bank
    // (battle.ON_PROJECTILE_BORN / _HIT.projectile_chr_<short>[_<type>], ON_CUSTOM_TRIGGER for S1's hit), by the look key
    // her kit gives the notes — the client plays them per note on the bank's pool (public/js/audio.js _noteSound)
    if (NOTE_SFX_CHARS.has(id)) {
      // the pool references (#680) follow the swapped banks below; the generic picks' own pools are dropped FIRST: one
      // of them (projectile_chr_<short>'s hit) is also the plain note's hit bank, re-registered by the loop
      for (const p of [...Object.values(u.pools || {}), ...Object.values(u.attackPools || {}), ...Object.values(u.hitPools || {})]) delete sfxPools[p];
      const notesSfx = {};
      for (const [look, pid, hitBank] of NOTE_SFX_LOOKS) {
        const born = audio.bank(`battle.ON_PROJECTILE_BORN.projectile_chr_${short}${pid}`);
        const hit = audio.bank(hitBank ? `battle.ON_CUSTOM_TRIGGER.projectile_chr_${short}${hitBank}` : `battle.ON_PROJECTILE_HIT.projectile_chr_${short}${pid}`);
        const e = {};
        // each with its bank's official pool (every one: max 2, popOldest, pitch 0.8–1.2)
        if (born?.length) { e.born = soundLeaf(born, 'sfx', 1); const p = poolRef(born); if (p) e.bornPool = p; }
        if (hit?.length) { e.hit = soundLeaf(hit, 'sfx', 1); const p = poolRef(hit); if (p) e.hitPool = p; }
        if (Object.keys(e).length) notesSfx[look] = e;
      }
      if (Object.keys(notesSfx).length) u.notes = notesSfx;
      // the notes own every impact (each type its bank above): no generic `hit` / `hits` on top of them. Her swing is
      // ON_ABILITY_ON.<char>.attack.0.1 (p_atk_…nt_h); the generic pick lands on attack.4.1's ON_ABILITY_START
      // (p_atk_…slnt), which only the S3 volley plays
      const swing = audio.bank(`battle.ON_ABILITY_ON.${id}.attack.0.1`);
      const s3Swing = audio.bank(`battle.ON_ABILITY_START.${id}.attack.4.1`);
      delete u.hit; delete u.hits; delete u.hitMix; delete u.hitPools;
      if (u.mix) { delete u.mix.hit; delete u.mix.attack; }
      delete u.attackMix; delete u.attackPools;
      const pools = {};
      if (swing?.length) { u.attack = soundLeaf(swing); const p = poolRef(swing); if (p) pools.attack = p; }
      if (Object.keys(pools).length) u.pools = pools; else delete u.pools;
      if (s3Swing?.length) {
        u.attacks = { 2: soundLeaf(s3Swing) };
        const p = poolRef(s3Swing);
        if (p) u.attackPools = { 2: p };
      } else delete u.attacks;
      // her skill stings (public/js/audio.js _sting; the sim's cast cue `['skill', id, 1, { sting, loop? }]` says when):
      // by skill index, every file of the bank with its official draw weight, the bank's pool, S3's held loop
      const stings = {};
      for (const [skillId, [bankName, loopBank]] of Object.entries(STING_BANKS)) {
        const i = (o.skills || []).find((k) => k.skillId === skillId)?.index;
        const paths = audio.bank(bankName);
        if (!Number.isInteger(i) || !paths.length) continue;
        const w = audio.weightsOf?.(paths) || [];
        const e = { clips: paths.map((p, j) => ({ url: soundLeaf([p], 'sfx', 1), w: w[j] ?? 1 })) };
        const pool = poolRef(paths);
        if (pool) e.pool = pool;
        const loop = loopBank ? audio.bank(loopBank) : [];
        if (loop.length) {
          e.loop = soundLeaf(loop, 'sfx', 1);
          const g = audio.groupOf?.(loop);
          if (g) e.loopGroup = g;
        }
        stings[i] = e;
      }
      if (Object.keys(stings).length) u.stings = stings;
    }
    if (Object.keys(u).length) unitsSfx[id] = u;
  };
  for (const id of charIds) operatorEntry(id, audio, soundLeaf, poolRef, unitsSfx, notes);
  // (fork, docs/OUTFITS.md) an outfit with its own official sound banks (audio_data `…_sanrio#2` twins of the operator's
  // banks: Goldenglow's, Executor's and Eyjafjalla's Sanrio outfits) gets its own whole sfx entry, `sfx.outfits[skinId]`,
  // when it differs from the operator's. The client plays it for a unit wearing that outfit (public/js/audio.js unitSfx)
  const outfitSfx = {};
  for (const rec of Object.values(outfits && typeof outfits === 'object' ? outfits : {})) {
    const skinId = rec?.id, id = rec?.charId;
    const token = typeof skinId === 'string' ? skinId.split('@')[1] : null;
    if (!operators[id] || !unitsSfx[id] || !token) continue;
    const view = outfitAudioView(audio, id, token);
    if (!view) continue;
    const own = {};
    operatorEntry(id, view.audio, (paths, ...r) => soundLeaf(view.tr(paths), ...r), (paths) => poolRef(view.tr(paths)), own, []);
    if (own[id] && JSON.stringify(own[id]) !== JSON.stringify(unitsSfx[id])) outfitSfx[skinId] = own[id];
  }

  // --- tokens --------------------------------------------------------------
  const chessById = new Map((ops03?.chess || []).map((c) => [c.chessId, c]));
  const tokens = {};
  const tokenIds = new Set(Object.keys(assets07?.tokens || {}));
  for (const id of extraTokenIds) if (typeof id === 'string' && /^token_\d+_[a-z0-9_]+$/i.test(id)) tokenIds.add(id);
  for (const id of [...tokenIds].sort()) {
    // Tokens unknown to research 07: default avatar/Spine locations (misses are tolerated).
    const t = assets07?.tokens?.[id] ?? {
      avatar: { url: `${RAW.yuanyan}avatar/${id}.png` },
      battleSpineDefault: null,
      battleSpineSkinVariantsOnly: [id],
    };
    const usedBy = ops03?.tokensUsedByPool?.[id]?.usedByChess || [];
    const ownerChess = usedBy.map((cid) => chessById.get(cid)).find(Boolean);
    const entry = { owner: ownerChess?.charId || ownerChess?.backup?.charId || null };
    entry.avatar = t.avatar?.url ? leaf(alt(`token/avatar/${id}.png`, t.avatar.url, t.avatar.bytes)) : null;
    let model = null;
    if (t.battleSpineDefault) {
      model = fexliModel(`token:${id}`, 'token', `spine/token/${id}/`, t.battleSpineDefault, [0]);
    } else if (Array.isArray(t.battleSpineSkinVariantsOnly) && t.battleSpineSkinVariantsOnly.length) {
      // Skin-variant models live in a `Spine/` folder, or `Front/` for directional ones.
      const v = t.battleSpineSkinVariantsOnly[0];
      const bases = ['Spine', 'Front'].map((f) => `${RAW.fexli}spine/${encodeURIComponent(id)}/${encodeURIComponent(v)}/${f}/${encodeURIComponent(v)}`);
      model = fexliModel(`token:${id}`, 'token', `spine/token/${id}/`, {
        skel: bases.map((b) => b + '.skel'), atlas: bases.map((b) => b + '.atlas'), png: bases.map((b) => b + '.png'),
      }, [0]);
      if (model) entry.spineVariant = v;
    }
    entry.spine = model;
    // the official model from the local client, drawn instead of the avatar (or of `spine`) when extracted (optional)
    const loc = localTokenSpines && Object.hasOwn(localTokenSpines, id) ? localTokenSpines[id] : null;
    if (loc && typeof loc === 'object') {
      entry.spineLocal = literal({ group: `spine/token/${id}`, ...loc });
      notes.push(`${id}: official Spine from the local client when extracted (spineLocal)`);
    }
    tokens[id] = entry;
    const { roles: u, mix } = unitSounds(audio, pickUnitSfx(audio.unitBanks.get(id)), poolRef);
    if (mix) u.mix = mix;
    if (Object.keys(u).length) unitsSfx[id] = u;
  }

  // --- outfits (fork, docs/OUTFITS.md) -------------------------------------
  const outfitsTree = planOutfits({ outfits, outfitChars, chars, skillIdxOf, fexliModel, notes });

  // --- enemies -------------------------------------------------------------
  const handbookOf = new Map();
  for (const b of Object.values(enemies05?.bosses || {})) if (b?.enemyId && b.handbookId && b.handbookId !== b.enemyId) handbookOf.set(b.enemyId, b.handbookId);
  for (const [eid, hb] of Object.entries(extraHandbook || {})) if (typeof hb === 'string' && hb !== eid && !handbookOf.has(eid)) handbookOf.set(eid, hb);
  const mdData = modelsData?.data || {};
  const enemyDir = modelsData?.storageDirectory?.Enemy || 'models_enemies';
  const pick = (v) => (Array.isArray(v) ? (v.find((x) => typeof x === 'string' && !x.includes('$')) ?? v[0]) : v);
  const arkModel = (eid) => {
    const key = eid.replace(/^enemy_/, '');
    const al = mdData[key]?.assetList;
    const skel = pick(al?.['.skel']); const atlas = pick(al?.['.atlas']); const png = pick(al?.['.png']);
    if (![skel, atlas, png].every((x) => typeof x === 'string' && x)) return null;
    const base = `${RAW.arkModels}${enemyDir}/${encodeURIComponent(key)}/`;
    const rec07 = assets07?.enemies?.[eid]?.battleSpine;
    const dir = `spine/enemy/${eid}/`;
    const stem = skelStem(skel);
    const mk = (file, r, rel) => alt(rel ?? dir + safeName(file), base + encodeURIComponent(file), bytesOf(r, base + encodeURIComponent(file)));
    return addModel(`enemy:${eid}`, {
      kind: 'enemy', dir, pma: true, skillIndices: [0], baseUrl: base,
      skel: mk(skel, rec07?.skel, `${dir}${stem}.skel`),
      atlas: { ...mk(atlas, rec07?.atlas, `${dir}${stem}.atlas`), mutable: true },
      pngs: [mk(png, rec07?.png)],
    });
  };
  const baseIdOf = (eid) => { const m = /^(enemy_\d+_[a-z0-9]+?)_\d+$/i.exec(eid); return m ? m[1] : null; };
  const enemyIdSet = new Set(collectEnemyIds({ assets07, enemies05, maps05, ops03 }));
  for (const id of extraEnemyIds) if (typeof id === 'string' && /^enemy_\d+_[a-z0-9_]+$/i.test(id)) enemyIdSet.add(id);
  // Boss handbook ids (their own icon/model ids) are addressable too.
  for (const hb of handbookOf.values()) if (/^enemy_\d+_[a-z0-9_]+$/i.test(hb)) enemyIdSet.add(hb);
  const enemyIds = [...enemyIdSet].sort();
  const enemies = {};
  for (const id of enemyIds) {
    const e = {};
    const icon07 = assets07?.enemies?.[id]?.icon;
    const iconAlts = [alt(`enemy/icon/${id}.png`, `${RAW.yuanyan}enemy/${id}.png`, bytesOf(icon07, `${RAW.yuanyan}enemy/${id}.png`))];
    for (const other of [handbookOf.get(id), baseIdOf(id)]) if (other) iconAlts.push(alt(`enemy/icon/${id}.png`, `${RAW.yuanyan}enemy/${other}.png`));
    e.icon = leaf(iconAlts);
    // Spine: own model, else alias chain (research 07 §5.6).
    let spine = arkModel(id);
    if (!spine) {
      const seen = new Set([id]);
      const queue = [ENEMY_SPINE_ALIAS[id], baseIdOf(id), handbookOf.get(id)].filter(Boolean);
      while (!spine && queue.length) {
        const cand = queue.shift();
        if (seen.has(cand)) continue;
        seen.add(cand);
        spine = arkModel(cand);
        if (spine) e.spineAliasOf = cand;
        else queue.push(...[ENEMY_SPINE_ALIAS[cand], baseIdOf(cand), handbookOf.get(cand)].filter(Boolean));
      }
      if (!spine) notes.push(`${id}: no enemy Spine upstream (client draws the icon, if any, or a glyph)`);
      else notes.push(`${id}: Spine aliased to ${e.spineAliasOf}`);
    }
    e.spine = spine;
    // the official model from the local client, drawn instead of `spine` when the extraction is installed (optional)
    const loc = localEnemySpines && Object.hasOwn(localEnemySpines, id) ? localEnemySpines[id] : null;
    if (loc && typeof loc === 'object') {
      e.spineLocal = literal({ group: `spine/enemy/${id}`, ...loc });
      notes.push(`${id}: official Spine from the local client when extracted (spineLocal)`);
    }
    enemies[id] = e;
    let banks = audio.unitBanks.get(id);
    let bankOwner = id;
    for (const other of [handbookOf.get(id), e.spineAliasOf, baseIdOf(id)]) {
      if (banks?.size) break;
      if (other) { banks = audio.unitBanks.get(other); bankOwner = other; }
    }
    // (fork) the enemy picker (audio.mjs pickEnemySfx): its shot's impact, the fire after the wind-up (`attackNext`) and
    // a melee set beside the ranged one (`melee`, public/js/audio.js unit())
    const short = bankOwner.replace(/^enemy_\d+_/, '').replace(/_\d+$/, '');
    const picked = pickEnemySfx(banks, audio.bank, short);
    const { roles: u, mix } = unitSounds(audio, picked, poolRef);
    if (mix) u.mix = mix;
    const casts = enemyCastSounds(audio, banks, enemyCasts?.get(id), poolRef);
    if (casts) u.casts = casts;
    enemyMomentSounds(u, id, audio, banks, poolRef, notes);
    const nextParts = (list) => (list || []).map((paths) => {
      const part = { url: soundLeaf(paths, 'sfx', 1) };
      const p = poolRef(paths);
      if (p) part.pool = p;
      return part;
    });
    if (picked.next?.length) u.attackNext = nextParts(picked.next);
    enemyAttackAlso(u, id, audio, poolRef, notes);
    if (picked.melee) {
      const { roles: m, mix: mm } = unitSounds(audio, picked.melee, poolRef);
      if (picked.melee.next?.length) m.attackNext = nextParts(picked.melee.next);
      if (mm) m.mix = mm;
      if (Object.keys(m).length) u.melee = m;
    }
    if (Object.keys(u).length) unitsSfx[id] = u;
  }

  // --- bonds / items / bands -------------------------------------------------
  const bonds = {};
  for (const [bondId, b] of Object.entries(assets07?.bonds || {})) {
    bonds[bondId] = leaf(alt(`bond/${bondId}.png`, b.icon?.url, b.icon?.bytes), b.fallbackCampLogo ? alt(`bond/${bondId}.png`, b.fallbackCampLogo) : null);
  }
  const items = {};
  for (const [trapId, it] of Object.entries(assets07?.items || {})) items[trapId] = leaf(alt(`item/${trapId}.png`, it.icon?.url, it.icon?.bytes));
  for (const [id, b] of Object.entries(extraBonds)) if (!bonds[id] && b.iconId) {
    bonds[id] = leaf(alt(`bond/${id}.png`, joinUrl(RAW.aa2, `ui/autochess/[uc]autochesscommon/arts/bondicon/${b.iconId.toLowerCase()}.png`)));
  }
  for (const id of Object.keys(extraItems)) if (!items[id]) {
    items[id] = leaf(alt(`item/${id}.png`, joinUrl(RAW.aa2, `ui/autochess/[uc]autochesscommon/arts/shopitemicon/${id}.png`)));
  }
  const bands = {};
  for (const [bandId, b] of Object.entries(assets07?.bands || {})) bands[bandId] = leaf(alt(`band/${bandId}.png`, b.icon?.url, b.icon?.bytes));
  for (const [bandId, b] of Object.entries(extraBands)) if (!bands[bandId] && b.iconId) {
    bands[bandId] = leaf(alt(`band/${bandId}.png`, joinUrl(RAW.aa2, `ui/autochess/[uc]autochesscommon/arts/bandicon/${b.iconId}.png`)));
  }

  // --- professions ----------------------------------------------------------
  const prof = { icon: {}, large: {}, battlecard: {}, sub: {} };
  for (const p of PROFESSIONS) {
    const i = assets07?.arts?.professionIcon?.[p];
    if (i) prof.icon[p] = leaf(alt(`prof/icon_${p}.png`, i));
    const l = assets07?.arts?.professionIconLargeWhite?.[p];
    if (l) prof.large[p] = leaf(alt(`prof/large_${p}.png`, l));
  }
  for (const p of [...PROFESSIONS, 'token']) {
    prof.battlecard[p] = leaf(alt(`prof/battlecard_${p}.png`, joinUrl(RAW.aa2, `arts/ui/[uc]battlecommon/ui_battle_new/battlecard/icon_profession_${p}.png`)));
  }
  for (const o of Object.values(operators)) {
    const sub = o.subProfessionId;
    if (typeof sub === 'string' && sub && !prof.sub[sub] && o.subProfessionIcon) prof.sub[sub] = leaf(alt(`prof/sub/${safeName(sub)}.png`, o.subProfessionIcon));
  }

  // --- UI ------------------------------------------------------------------
  const ui = {};
  const addUi = (group, key, url) => {
    const k = safeName(key);
    const name = `${group}/${k}`;
    if (!ui[name] && url) ui[name] = leaf(alt(`ui/${group}/${k}.png`, url));
  };
  for (const [group, entries] of Object.entries(assets07?.autochessUi || {})) {
    for (const [key, url] of Object.entries(entries || {})) addUi(group, key, url);
  }
  const nations = new Set(Object.values(operators).map((o) => o.nationId).filter(Boolean));
  const logos = new Set(['logo_rhodes', ...[...nations].map((n) => `logo_${n}`)]);
  for (const b of Object.values(assets07?.bonds || {})) if (b.fallbackCampLogo) logos.add(urlBase(b.fallbackCampLogo).replace(/\.png$/i, ''));
  for (const [src, group] of Object.entries(ARTS_GROUPS)) {
    for (const [key, url] of Object.entries(assets07?.arts?.[src] || {})) {
      if (src === 'campLogo' && !logos.has(key)) continue;
      if (src === 'loadingIllust' && !LOADING_USED.has(key)) continue;
      addUi(group, key, url);
    }
  }
  for (const [group, key, path] of UI_EXTRAS) addUi(group, key, joinUrl(RAW.aa2, path));
  for (const { name, ...job } of statsTemplate) ui[`statistics/${name}`] = { alts: [job] };

  // --- audio ----------------------------------------------------------------
  const bgmLeaf = (bankName) => {
    const b = audio.bgm(bankName);
    if (!b?.loop) { notes.push(`BGM bank ${bankName} not found`); return null; }
    const out = { loop: soundLeaf([b.loop], 'bgm', 1) };
    if (b.intro) out.intro = soundLeaf([b.intro], 'bgm', 1);
    return out;
  };
  // BGM files are flattened to audio/bgm/<basename>.
  const flatBgm = (node) => {
    if (!node) return node;
    for (const k of Object.keys(node)) {
      const l = node[k];
      if (l?.alts) for (const a of l.alts) a.rel = 'audio/bgm/' + safeName(a.rel.split('/').pop());
    }
    return node;
  };
  // 联防 BGM: the official 联防 levels (`escaped_single` / `escaped_multi`) declare `bgmEvent = corrosion` — a
  // 卡西米尔 act13d5d0 battle track — so the rescue phase does NOT reuse the 作战's track. Kept out of `bgm` when the
  // bank is missing (the client then falls back to `bgm.combat`; public/js/audio.js resolveBgm), so the manifest stays
  // valid for an older audio_data.
  const unite = flatBgm(bgmLeaf('battle.ON_GAME_READY.corrosion'));
  // 开战 BGM: the two official battle tracks of the mode's own 卡西米尔 act (music_act13side_1 骑士之日 /
  // music_act13side_2 无畏者, 塞壬唱片). The client does not draw them: the round decides (audio.js combatTrackFor —
  // 无畏者 for rounds 1–7, 骑士之日 from round 8 on), so index 0 must stay `bat_kazimierz2_1` and index 1
  // `bat_kazimierz2_2` (test/ui/audio.test.js pins both the order and the round table).
  // Kept out of `bgm` below when the index has neither bank, so the manifest stays valid for an older audio_data.
  const combatAlts = ['battle.ON_GAME_READY.bat_kazimierz2_1', 'battle.ON_GAME_READY.bat_kazimierz2_2']
    .map((n) => flatBgm(bgmLeaf(n))).filter(Boolean);
  // Fever (Ave Mujica, 丰川祥子): the VOCAL KiLLKiSS (`battle.ON_CUSTOM_TRIGGER.fever_full`; the game plays the
  // instrumental fever_mid first — the owner's choice, 2026-10-15), played once over the round's track (audio.js
  // feverStart). Its loop slot is the official empty one: only the intro is kept.
  const feverTrack = audio.bgm('battle.ON_CUSTOM_TRIGGER.fever_full');
  const fever = feverTrack?.intro ? { intro: soundLeaf([feverTrack.intro], 'bgm', 1), loop: soundLeaf([feverTrack.intro], 'bgm', 1) } : null;
  const bgm = {
    lobby: flatBgm(bgmLeaf('sys.ON_ACTIVITY_LOADED.act2autochess')),
    prep: flatBgm(bgmLeaf('battle.ON_GAME_READY.act1autochess_shop')),
    combat: flatBgm(bgmLeaf('battle.ON_GAME_READY.act1autochess_shop')),
    boss: flatBgm(bgmLeaf('battle.ON_GAME_READY.rglk1phantomcastle')),
    ...(combatAlts.length ? { combatAlts } : {}),
    ...(unite ? { unite } : {}),
    ...(fever ? { fever: flatBgm(fever) } : {}),
  };
  const bossBgm = {};
  for (const lv of Object.values(maps05?.roundLevels || {})) {
    if (typeof lv?.bgm !== 'string') continue;
    for (const u of lv.usedBy || []) {
      const m = /\(boss:(boss_\d+)\)/.exec(String(u));
      if (m && !bossBgm[m[1]] && !String(u).startsWith('mode_training')) bossBgm[m[1]] = flatBgm(bgmLeaf(`battle.ON_GAME_READY.${lv.bgm}`));
    }
  }
  // (fork) each UI / battle sound's official mixer group (sfx.groups.ui / .battle): its bank's, or the spec's own
  // `group` for a fixed path (the bank the client plays that file from)
  const sfxGroups = { ui: {}, battle: {} };
  const specGroup = (spec) => spec?.group ?? (spec?.bank ? audio.groupOf?.(audio.bank(spec.bank)) ?? null : null);
  const sfxUi = {};
  for (const [name, spec] of Object.entries(UI_SFX)) {
    const l = soundLeaf(resolveSpec(spec, audio.bank));
    if (l) sfxUi[name] = l; else notes.push(`UI SFX ${name}: no sound`);
    const g = specGroup(spec);
    if (l && g) sfxGroups.ui[name] = g;
  }
  const sfxBattle = {};
  for (const [name, spec] of Object.entries(BATTLE_SFX)) {
    const l = soundLeaf(resolveSpec(spec, audio.bank));
    if (l) sfxBattle[name] = l; else notes.push(`battle SFX ${name}: no sound`);
    const g = specGroup(spec);
    if (l && g) sfxGroups.battle[name] = g;
  }
  // (fork) element burst sounds (BURST_SOUND_BANKS), each bank's first file on its official pool
  const sfxBurst = {};
  for (const [key, banks] of Object.entries(BURST_SOUND_BANKS)) {
    const list = [];
    for (const name of banks) {
      const paths = audio.bank(name);
      if (!paths?.length) { notes.push(`burst SFX ${key}: no sound for ${name}`); continue; }
      const e = { url: soundLeaf(paths, 'sfx', 1) };
      const p = poolRef(paths);
      if (p) e.pool = p;
      const vol = audio.mixOf?.(paths)?.vol;  // the bank's volume when not 1 (ep_break_dark_audio: 0.8)
      if (vol != null) e.vol = vol;
      list.push(e);
    }
    if (list.length) sfxBurst[key] = list;
  }

  // --- module type icons ----------------------------------------------------
  const modules = {};
  for (const t of [...new Set(moduleTypes || [])].filter((x) => typeof x === 'string' && /^[a-z0-9-]+$/i.test(x)).sort()) {
    // the client's file name, else its lower-case form (the type id of a few modules is mixed case: WAH-Y → wah-y.png).
    // One lower-case file per type: the official data spells one DEC X module 'dec-X' (uniequip_003_aglina) and the
    // others 'dec-x'; two paths that differ only in case are one file on Windows / macOS (and in a release zip built or
    // extracted there), so a case-sensitive server would miss one of them.
    modules[t] = leaf(alt(`module/${safeName(t).toLowerCase()}.png`, [...new Set([t, t.toLowerCase()])].map((n) => joinUrl(RAW.aa2, `arts/ui/uniequiptype/${n}.png`))));
  }

  // --- 干员战斗语音 (excel/charword_table.json → audio.voice, audio.voiceJp) ---------------------------------
  // The official lines of every operator the mode can field, for the slots the client can actually play: 行动出发 start /
  // 行动开始 faceEnemy / 选中干员 select / 部署 place / 作战中1-4 skillN / 结算 result* (charword `placeType`,
  // audio.mjs VOICE_BATTLE_SLOTS). A slot with several lines stays an array — the client draws one at random
  // (public/js/audio.js voice). Operators without official battle voice keep no entry at all: the 17 预备干员
  // (char_60x_c*, char_617_sharp2) and the mode's own 盟约·辅助干员 (char_616_pithst).
  // The three prep-only slots (干员报到 gacha / 编入队伍 squad / 任命队长 squadFirst) are NOT planned by default: the
  // client never requests them, and downloading them adds 360 files / 19.3 MB to every `npm run assets` — pass --voice-all for
  // the complete official set (`voiceSlots: null`, reviewer note on the voice PR).
  // `audio.voiceJp` (VOICE_JP_LANG): the same slots and lines in the Japanese dub, a second tree beside the Chinese one
  // (the owner's request of 2026-10-08) — same file names, `audio/voice/jp/`.
  // (fork, docs/OUTFITS.md) + each outfit's own voice set, under its word key (data/outfits.json `voice`)
  const outfitVoices = new Set(Object.values(outfits || {}).filter((r) => typeof r?.voice === 'string' && operators[r.charId]).map((r) => r.voice));
  const voiceSlotsByChar = indexVoice(charword, VOICE_ID_LANG, voiceSlots, outfitVoices);
  // `dir` (VOICE_OPTIONAL_TREES native): the operator's own-language folder, or nothing when it has no such dub
  // A collab operator whose only dub is LINKAGE (丰川祥子 …, audio.mjs linkageOnlyVoice) has no `voice_cn/` lines: the
  // Chinese tree takes her Japanese ones, as the official client plays them under the 中文 setting (owner, 2026-10-15).
  const linkageOnly = linkageOnlyVoice(charword);
  const voiceTree = (lang, dirOf = null) => {
    const tree = {};
    for (const [charId, slots] of voiceSlotsByChar) {
      // only the operators this game can field (the pool charIds and the 自选 picks) and their outfits. `chars` also holds the
      // picture-only operators behind AI seats' names (BOT_OPERATORS, 阿米娅 / 杜宾): they never fight, so no voice
      if (!operators[charId] && !outfitVoices.has(charId)) continue;
      const dir = dirOf ? dirOf(charId) : null;
      if (dirOf && !dir) continue;
      const lineLang = lang === 'cn' && linkageOnly.has(charId) ? VOICE_JP_LANG : lang;
      const v = {};
      for (const [slot, assets] of Object.entries(slots)) {
        // one leaf per line (部署1 / 部署2 …): an array stays an array so the client can draw one — chaining them as
        // alternatives of a single leaf would keep only the first line that landed on disk.
        const lines = assets.map((a) => leaf(dir ? nativeVoiceAlt(a, dir) : voiceAlt(a, lineLang))).filter(Boolean);
        if (!lines.length) continue;
        v[slot] = lines.length === 1 ? lines[0] : lines;
      }
      if (Object.keys(v).length) tree[charId] = v;
    }
    return tree;
  };
  const voice = voiceTree(voiceLang);
  if (!Object.keys(voice).length) notes.push('battle voice: charword_table.json has no slots (index missing?)');

  // English, Korean and each operator's own-language dub (VOICE_OPTIONAL_TREES; public/js/audio.js VOICE_TREES):
  // `audio.voiceEn` / `audio.voiceKr` / `audio.voiceNative`, the same slots and file names. A line missing upstream
  // stays missing (the client plays the Chinese one), never filled from another dub. `audio.voiceNativeLangType`
  // names each own-language dub's official voiceLangType (ITA / RUS / …) for operators this game fields who also
  // have a line in the primary `voice` tree.
  const nativeDirs = optionalVoice ? nativeVoiceDirs(charword) : new Map();
  const optionalTrees = {};
  if (optionalVoice) {
    for (const [key, lang] of Object.entries(VOICE_OPTIONAL_TREES)) {
      optionalTrees[key] = lang === 'native' ? voiceTree(lang, (id) => nativeDirs.get(id)?.dir) : voiceTree(lang);
    }
    const types = {};
    for (const [charId, n] of nativeDirs) if (chars[charId] && voice[charId]) types[charId] = n.type;
    optionalTrees.voiceNativeLangType = literal(types);
  }

  const template = {
    chars, enemies, tokens, bonds, items, bands, skills, skillsById, modules, ui, prof, outfits: outfitsTree,
    audio: {
      bgm,
      bossBgm: Object.fromEntries(Object.entries(bossBgm).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))),
      voice,
      ...(voiceJp ? { voiceJp: voiceTree(VOICE_JP_LANG) } : {}),
      ...optionalTrees,
      sfx: { ui: sfxUi, battle: sfxBattle, units: unitsSfx, ...(Object.keys(outfitSfx).length ? { outfits: outfitSfx } : {}), ...(Object.keys(sfxBurst).length ? { burst: sfxBurst } : {}), pools: sfxPools, groups: literal(sfxGroups) },
    },
  };
  return { template, models, notes };
}
