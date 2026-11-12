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
});

/** The keys a fxs row [buff, src, look] shows by ENEMY_STATE_KEYS, `unit` the giver's index unit key (none: []). */
export function enemyStateKeys(buff, unit, look = null) {
  const s = ENEMY_STATE_KEYS[buff];
  if (!s) return [];
  let v = s.byUnit ? s.byUnit[unit] : s.keys;
  if (v && !Array.isArray(v)) v = look != null ? v.looks?.[look] : null;
  return Array.isArray(v) ? v : [];
}

/** Every key ENEMY_STATE_KEYS and DUO_PROJECTILES can play for index unit `unit` (preloading). */
export function indexGapKeys(unit, idx) {
  const out = [];
  if (!unit) return out;
  for (const s of Object.values(ENEMY_STATE_KEYS)) {
    const v = s.byUnit ? s.byUnit[unit] : s.units?.includes(unit) ? s.keys : null;
    if (Array.isArray(v)) out.push(...v);
    else if (v?.looks) for (const ks of Object.values(v.looks)) out.push(...ks);
  }
  const duo = DUO_PROJECTILES[unit];
  if (duo) out.push(...(idx?.projectiles?.[duo]?.effects || []));
  return out;
}
