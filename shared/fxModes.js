// shared/fxModes.js — (fork) which attack mode of an operator's client prefab a skill switches to, read from the local
// fx index (public/assets/local/fx/index.json, tools/local-extract/fx.py): the effects layer (public/js/render/vfx/
// skills.js skillPlan) and the sound plan (tools/assets/plan.mjs charModesFromIndex) both ask here.
//
// The index records a skill's `mode` from the client data (`modeBy: 'data'`), else guesses it from a mode named after the
// skill's number (`modeBy: 'name'`: S2's mode "S2"). The guess loses to the data: 莫斯提马's prefab has the modes Default
// and "S2", and the data gives "S2" to her S3 (Key of Chronology, the ripple) — S2 (Lock of Shattered Time) took it
// by name too, so her S2 attacks drew and sounded like S3's ripple. 水月's S1 / S2 are the same case.

/**
 * The mode index skill `sid` of index unit `unit` switches to, or null (it keeps the unit's default attack).
 * @param {any} unit an index unit ({ skills: { [sid]: { mode, modeBy } } })
 * @param {string} sid
 * @returns {number|null}
 */
export function skillModeOf(unit, sid) {
  const skills = unit && typeof unit.skills === 'object' && unit.skills ? unit.skills : {};
  const sk = skills[sid];
  if (!sk || !Number.isInteger(sk.mode)) return null;
  if (sk.modeBy === 'name') {
    for (const [other, s] of Object.entries(skills)) {
      if (other !== sid && s && s.mode === sk.mode && s.modeBy === 'data') return null;
    }
  }
  return sk.mode;
}
