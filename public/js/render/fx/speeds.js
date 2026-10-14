// public/js/render/fx/speeds.js — sim projectile speeds (one module-level table) and the flight-time lookup.

import { PROJ } from '../style.js';
import { genUrl } from '../../gen.js';

/**
 * The sim's projectile speeds (server/sim/constants.js PROJECTILE_SPEEDS — pure data, served read-only at
 * /sim/constants.js with the rest of the client-side sim, DESIGN §14): a shot's visual flight ends when the sim lands it,
 * i.e. with its damage number. Loaded once in a browser (the game already has the module from its battle runner);
 * until it arrives — and in Node, where '/sim/' is no module path — style.js PROJ speeds (a copy the unit tests keep
 * equal to the sim's) stand in.
 */
let simSpeeds = null;

/**
 * Use the sim's speeds (tiles per game second): `table` = PROJECTILE_SPEEDS by kind, `boomerangReturn` =
 * BOOMERANG_RETURN_SPEED (the sim's visual kind of a boomerang flying back); null = style.js PROJ only.
 */
export function setSimProjectileSpeeds(table, boomerangReturn = null) {
  if (!table || typeof table !== 'object') { simSpeeds = null; return; }
  simSpeeds = Object.assign({}, table);
  if (Number(boomerangReturn) > 0) simSpeeds.boomerangReturn = Number(boomerangReturn);
}

if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
  import(genUrl('/sim/constants.js')).then((m) => { if (m?.PROJECTILE_SPEEDS) setSimProjectileSpeeds(m.PROJECTILE_SPEEDS, m.BOOMERANG_RETURN_SPEED); }, () => {});
}

/**
 * Tiles per game second of a projectile kind ('boomerangReturn': a boomerang's way back): the sim's value, else
 * style.js PROJ (`speed`; the boomerang's `back`), else 15 for a boomerang (the sim's outbound speed) / 12.
 */
export function projSpeed(kind) {
  const v = simSpeeds ? Number(simSpeeds[kind]) : NaN;
  if (v > 0) return v;
  if (kind === 'boomerangReturn') return PROJ.boomerang?.back > 0 ? PROJ.boomerang.back : projSpeed('boomerang');
  const f = PROJ[kind]?.speed;
  return f > 0 ? f : kind === 'boomerang' ? 15 : 12;
}
