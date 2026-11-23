// render/vfx/indexGaps.js — (fork, 2026-11-13) official effect data the fx index (public/assets/local/fx/index.json,
// tools/local-extract/fx.py) does not carry yet, read from the CN client's prefabs and code by hand, until the indexer
// reads these fields and the index is rebuilt (it is not in git: it ships with the art). Each table names the client
// field it stands in for, so the indexer's version can replace it entry for entry.

/**
 * DuoRangedAttack `_duoProjectileKey`, by enemy key: the client's DuoRangedAttack.CreateProjectile flies it at every
 * odd-numbered target of one attack (m_targetCount & 1: the second of two), the attack's own projectileKey at the others
 * [ASSUMED: from the attack's usual mount; `_duoMountPointType` is not read].
 */
export const DUO_PROJECTILES = Object.freeze({
  enemy_10018_sgrobh: 'projectile_enemy_sgrobh_2',   // 'Unicycle Toy': its second harpoon (link enemy_sgrobh_attack_02)
});

const MSF = ['1196_msfyin', '1198_msfshu', '1200_msfjin', '1202_msfzhi', '1204_msfhu', '1208_msfji', '1210_msfden'];

/**
 * (fork) The lasting effects of b.snap `fxs` rows whose official effect sits in a field the indexer does not read, so no
 * plan entry carries their buff (render/vfx/skillfx.js _states falls back to these after the plan, the enemy plans and
 * TalentFx.targetRows). By the row's buff: `keys` for every giver (`units`: the enemies that give it, for preloading),
 * or `byUnit` — by the giver's index unit key (the row's src, else the carrier) — keys, or `{ looks }` by the row's look.
 */
export const ENEMY_STATE_KEYS = Object.freeze({
  // PropLikeEnemy._basicEffects: PropLikeEnemy.OnBorn → BattleController.CreateEffects(_basicEffects, this, this): the
  // prop's idle loop from its birth while it stands (sim times.js kitTimes: fxProbe 'msf_basic')
  msf_basic: Object.freeze({
    byUnit: Object.freeze(Object.fromEntries(MSF.flatMap((m) => {
      const n = m.split('_')[1];
      return [[`enemy_${m}`, [`enemy_${n}_idle_01`]], [`enemy_${m}_2`, [`enemy_${n}_idle_02`]]];
    }))),
  }),
  // the Combat MeleeAttack's `_activeBuffs[0]`: buff enemy_nhstlk_t[bleeding] with `overrideEffectKey`
  // enemy_nhstlk_attack_buff_01 on the bleeding target (sim archetypes.js bleed: the 'ab:bleed' buff's `fx`)
  'enemy_nhstlk_t[bleeding]': Object.freeze({ keys: ['enemy_nhstlk_attack_buff_01'], units: ['enemy_1270_nhstlk', 'enemy_1270_nhstlk_2'] }),
  // DurbusAbility._UpdatePassengerEffect: `_passengerEffects[count - 1]` on the bus itself, switched as the count changes
  // (`_noPassengerEffect` at 0: none) (sim passengers.js passengerBus: fxProbe 'durbus_passengers', look = the count)
  durbus_passengers: Object.freeze({
    byUnit: Object.freeze({ enemy_1302_ymtro_2: Object.freeze({ looks: Object.freeze({ 1: ['enemy_ymtro_buff_01'], 2: ['enemy_ymtro_buff_02'], 3: ['enemy_ymtro_buff_03'], 4: ['enemy_ymtro_buff_04'] }) }) }),
  }),
  // (fork) 予愿安洁莉娜 S2's sweep (op-aglna2.js glide): buff aglna2_s_2[enemy]'s `overrideEffectKey` — the 浮空 it gives
  // shows aglna2_levitate_01_emit in place of the generic status look (`replaces`: that status's loop stops while the
  // row lasts; its 缚地's override is the generic common_root_01 already)
  'aglna2_s_2[enemy]': Object.freeze({
    byUnit: Object.freeze({ char_1015_aglna2: Object.freeze({ looks: Object.freeze({ levitate: ['aglna2_levitate_01_emit'] }) }) }),
    replaces: Object.freeze({ levitate: 'levitate' }),
  }),
});

/** The sim status whose generic look a fxs row [buff, src, look] replaces (ENEMY_STATE_KEYS `replaces`), else null. */
export function replacedStatus(buff, look) {
  return (look != null && ENEMY_STATE_KEYS[buff]?.replaces?.[look]) || null;
}

const VTLIONK_TRAP_DIE = Object.freeze(['enemy_vtlionk_skill_02_trap_die_01', 'enemy_vtlionk_skill_02_trap_die_02', 'enemy_vtlionk_skill_02_trap_die_03']);
const VTLIONK_STORE = Object.freeze({ keys: VTLIONK_TRAP_DIE, by: 'enemy_9032_aclionk', skills: Object.freeze(['store', 'storea']) });

/**
 * (fork) Tools 2: a unit's death effect that the official client plays from another unit's skill, so the dying unit's
 * own record has no `deadEffect` (render/vfx/wiring.js death: in its place, never on top of the generic one). By the dying
 * unit's index unit key: `keys`, played only when an enemy of key `by` cast one of `skills` (prefab keys) in the same
 * frame — the cause; any other death keeps the generic effect.
 *   Alistair, Final Flame of the Empire (enemy_9032_aclionk) 'store' / 'storeA' (【莫非王土】): AnimatedActionToTargetAbility
 *   puts buff enemy_vtlionk_s2 on the equipment it animates, whose ON_BUFF_START CreateEffect plays trap_die_01–03 on it.
 *   Our sim (bosses.js kitLion animate) removes the piece in that cast's tick (castSlot, then b.kill). The pieces are
 *   invulnerable and untargetable (kitEquip), but OpFor: BlackCloud's grab can still take one (fly.js isPrey: a NORMAL
 *   flyer), hence the cast check.
 */
export const DEAD_EFFECTS = Object.freeze({
  enemy_10028_vtswd: VTLIONK_STORE,   // Unequipped Blade
  enemy_10029_vtshld: VTLIONK_STORE,  // Protective Vest
  enemy_10030_vtwand: VTLIONK_STORE,  // Assault Arts Unit
});

/** The keys a fxs row [buff, src, look] shows by ENEMY_STATE_KEYS, `unit` the giver's index unit key (none: []). */
export function enemyStateKeys(buff, unit, look = null) {
  const s = ENEMY_STATE_KEYS[buff];
  if (!s) return [];
  let v = s.byUnit ? s.byUnit[unit] : s.keys;
  if (v && !Array.isArray(v)) v = look != null ? v.looks?.[look] : null;
  return Array.isArray(v) ? v : [];
}

/** Every key ENEMY_STATE_KEYS, DEAD_EFFECTS and DUO_PROJECTILES can play for index unit `unit` (preloading). */
export function indexGapKeys(unit, idx) {
  const out = [];
  if (!unit) return out;
  for (const s of Object.values(ENEMY_STATE_KEYS)) {
    const v = s.byUnit ? s.byUnit[unit] : s.units?.includes(unit) ? s.keys : null;
    if (Array.isArray(v)) out.push(...v);
    else if (v?.looks) for (const ks of Object.values(v.looks)) out.push(...ks);
  }
  if (DEAD_EFFECTS[unit]) out.push(...DEAD_EFFECTS[unit].keys);
  const duo = DUO_PROJECTILES[unit];
  if (duo) out.push(...(idx?.projectiles?.[duo]?.effects || []));
  return out;
}
