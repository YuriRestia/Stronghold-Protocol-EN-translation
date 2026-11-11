// (fork) Every skill's own ability sounds (effect-gaps audit 2, fix #1): the official banks
// battle.ON_ABILITY_START / _ON / _HIT / _END.<skillId> and ON_SKILL_FINISH.<skillId> of each skill, for every operator.
// Before, the plan took them only for operators listed by hand (烛煌 S1, 塔露拉 S1 / S2), so 72 skills on 66 operators
// played no sound of their own (德克萨斯 S2 剑雨, 伊芙利特 S2, 陈 S1, 泥岩 S2 …) and 122 more missed some.
//
// What a bank is for comes from its own sound file, the way the client's banks are named:
//   p_atk_*  a swing  → the skill's attack sound while it runs (`attacks[i]`; 烛煌 S1 p_atk_hcnsrfr_d)
//   p_imp_*  a strike → the skill's impact while it runs (`hits[i]`; 陈 S1 p_imp_blunt_h, 泥岩 S2 p_imp_bighammer_h)
//     — but never an `_n` file: by the client's names that is a normal attack's sound (p_atk_heal_n, p_imp_lightsword_n),
//     and a skill slot holds the skill's own (feedback6 / #679)
//   anything else (p_skill_*, b_char_*, p_aoe_* …) a cast → at the skill's start: the sting when the skill has no
//     ON_SKILL_START of its own (德克萨斯 S2 p_skill_swordrain), else beside it (`skillOn`; 泥岩 S3 p_skill_rocksleep);
//     a looping bank holds until the skill ends (伊芙利特 S3 p_aoe_flamethrower_loop); _END / ON_SKILL_FINISH at its end.
// [ASSUMED] a cast-type HIT (伊芙利特 S2 p_skill_flameexplo_3) plays at the cast with the start: the sim's instant casts
// deal their damage at activation, with no attack event to hang an impact on.
// A skill that has no cast sound from those (no ON_SKILL_START, no cast bank of its own) takes its sub-abilities' banks
// (ON_ABILITY_START.skchr_texas2_3.2 p_skill_reticentsword_s, …_blemsh_2.1), each only into a role still empty: the
// first cast is the sting. [ASSUMED] at the skill's start — a sub-ability fires inside the skill, and when is the kit's
// business; they never add a `skillOn`, so a skill with its own sounds keeps exactly those.
// Other triggers (ON_CUSTOM_TRIGGER, ON_ABILITY_CHECK_POINT, ON_ABILITY_ATTACK_FINISH) need a kit event and stay with the
// per-operator tables in plan.mjs.

const EVENTS = Object.freeze(['ON_ABILITY_START', 'ON_ABILITY_ON', 'ON_ABILITY_HIT', 'ON_ABILITY_END', 'ON_SKILL_FINISH']);

/** A bank's role from its first file's name: 'attack' (p_atk_), 'hit' (p_imp_), 'normal' (either, an `_n` file) or 'cast'. */
export function bankRole(paths) {
  const name = String(paths?.[0] ?? '').split('/').pop().toLowerCase();
  if (/^p_(atk|imp)_.*_n\.mp3$/.test(name)) return 'normal';
  if (name.startsWith('p_atk_')) return 'attack';
  if (name.startsWith('p_imp_')) return 'hit';
  return 'cast';
}

/**
 * One skill's own ability sounds.
 * @param {{ bank: (name:string)=>string[], loopOf?: (paths:string[])=>boolean }} audio indexAudio() result
 * @param {string} skillId
 * @param {{ sting?: string[]|null, skip?: Set<string> }} [opts] `sting`: the skill's ON_SKILL_START files (null: none);
 *   `skip`: files a per-operator table already plays (FX_SOUND_BANKS …), never taken twice
 * @returns {{ sting: string[]|null, attack: string[]|null, hit: string[]|null,
 *   on: { paths: string[], hold?: boolean, loop?: boolean }[], off: string[][] }}
 */
export function skillAbilitySounds(audio, skillId, { sting = null, skip = new Set() } = {}) {
  const out = { sting: null, attack: null, hit: null, on: [], off: [] };
  if (!skillId) return out;
  const seen = new Set([...(skip || []), ...(sting?.length ? [sting[0]] : [])]);
  // (an official bank name may carry a stray leading space: ' battle.ON_ABILITY_HIT.skchr_mostma_2')
  const find = (name) => { const p = audio.bank(name); return p?.length ? p : audio.bank(` ${name}`); };
  for (const ev of EVENTS) {
    const paths = find(`battle.${ev}.${skillId}`);
    if (!paths?.length || seen.has(paths[0])) continue;
    seen.add(paths[0]);
    const role = bankRole(paths);
    if (ev === 'ON_ABILITY_END' || ev === 'ON_SKILL_FINISH') { out.off.push(paths); continue; }
    if (role === 'attack' && !out.attack) { out.attack = paths; continue; }
    if (role === 'hit' && !out.hit) { out.hit = paths; continue; }
    if (role !== 'cast') continue;
    if (!sting?.length && !out.sting && !audio.loopOf?.(paths)) { out.sting = paths; continue; }
    // a looping bank leads (the client holds an edge's first entry only), the one-shots follow it
    if (audio.loopOf?.(paths)) out.on.unshift({ paths, hold: true, loop: true });
    else out.on.push({ paths });
  }
  if (!sting?.length && !out.sting && audio.namesWith) {
    for (const ev of ['ON_ABILITY_START', 'ON_ABILITY_ON', 'ON_ABILITY_HIT']) {
      for (const name of audio.namesWith(`battle.${ev}.${skillId}.`)) {
        const paths = audio.bank(name);
        if (!paths?.length || seen.has(paths[0])) continue;
        const role = bankRole(paths);
        if (role === 'cast' && !out.sting && !audio.loopOf?.(paths)) out.sting = paths;
        else if (role === 'attack' && !out.attack) out.attack = paths;
        else if (role === 'hit' && !out.hit) out.hit = paths;
        else continue;
        seen.add(paths[0]);
      }
    }
  }
  return out;
}
