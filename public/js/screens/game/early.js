// public/js/screens/game/early.js — which events are replayed when a field is entered late.

import { fxForm } from '../../../../shared/protocol.js';

export const STATE_EV = new Set(['spawn', 'die', 'deploy', 'status', 'skill']);

/** Event tuples replayed when a field is entered late: the state-bearing kinds and the fx that change an enemy's model
 *  form (shared/protocol.js fxForm — the field meta's UnitInfo `form` predates them). */
export const keepEarly = (e) => Array.isArray(e) && (STATE_EV.has(e[0]) || fxForm(e) !== undefined);

/**
 * What the SOUND gets of that replay: the 'spawn' tuples alone, which teach the audio who is on the field. The buffered
 * list is every spawn, die, deploy, status and skill since the field's m.field — up to 1500 of them, while the view was not
 * showing it — so handing it to the audio would play the old deaths, deploy lines and skill cues all at once on entering
 * (GitHub PR #292 by @LimitlessHPPK handed over the whole list; its hold of a cast that arrives before its unit,
 * audio.js `pendingSkill`, is what the live path needs, and `onEv` already forwards the full list).
 */
export const audioEarly = (early) => (Array.isArray(early) ? early.filter((e) => Array.isArray(e) && e[0] === 'spawn') : []);
