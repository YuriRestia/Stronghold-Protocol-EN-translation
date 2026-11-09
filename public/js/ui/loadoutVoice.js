// (fork) The Operator Loadout's voice lines, one rule for the deck (screens/loadout.js) and the Custom Squad picker
// (screens/diy.js) — the user's call of 2026-11-09 (Dev 5's proposal, "once per visit, rotating"):
// - Opening an operator (its card, a Custom Squad slot or a picker card) says a 选中干员 line the first time only: more
//   interactions with the same operator stay silent until another operator is touched, which re-arms it. Each re-armed
//   visit takes the next line, never the one that operator said last (the official home screen's rule: HomeIllustView
//   → DataConvertUtil.LoadRandomCharData drops the last line before its pick).
// - Changing the outfit always speaks, also inside a visit — to hear the new look's voice: an outfit with its own voice
//   set says one of that set's 选中干员 / 部署 lines (a set without them: any line it has), any other look one of the
//   operator's own 选中干员 / 部署 lines; rotating over that pool, never the last line.
// - A skill or module change counts as opening the operator (the user's call of 2026-11-09: "the first skill
//   change/module change should also be treated as selecting the operator"): as the first touch of a visit it says the
//   选中干员 line and arms the visit; inside a visit it is silent. Any other edit (potential, level …) is silent and only
//   touches its operator (re-arming the previous one).
// - The newest line cuts the one on air off (AudioManager.voice `takeover`); the voice language and volume settings
//   apply as everywhere. No 编入队伍 / 任命队长 lines (the user's call: not downloaded either).
import { audio, outfitVoiceKey } from '../audio.js';

/** The edit keys that pick a skill or a module: the deck's choice (skill / module) and a Custom Squad pick's. */
const PICK_KEYS = ['skill', 'module', 'skillIndex', 'uniEquipId'];

/** The slots an outfit change draws from, in rotation order; then any line a voice set of its own has. */
const OUTFIT_SLOTS = ['select', 'place'];
const OTHER_SLOTS = ['start', 'faceEnemy', 'skill1', 'skill2', 'skill3', 'skill4', 'resultThree', 'resultFour', 'resultTwo', 'resultLose'];

/**
 * The rule over an audio manager (`voice(charId, slot, { voiceKey, line, takeover })`, `voiceCount(charId, slot,
 * voiceKey)`) and an outfit voice lookup (`charId => key | null`). Pure apart from those two: the tests drive it with fakes.
 */
export function createLoadoutVoice(am, voiceKeyOf = (charId) => outfitVoiceKey({ charId })) {
  let last = null;              // the operator touched last (a charId)
  const ops = new Map();        // charId → { pos: { select, outfit }, line: the id of the line it said last }
  const stateOf = (id) => { let s = ops.get(id); if (!s) { s = { pos: { select: 0, outfit: 0 }, line: null }; ops.set(id, s); } return s; };
  const lines = (charId, key, slot) => Array.from({ length: am.voiceCount(charId, slot, key) || 0 }, (_, i) => ({ key, slot, i }));
  const lineId = (c) => `${c.key || ''}|${c.slot}|${c.i}`;
  /** Say the pool's next line (not the operator's last one when the pool has another). */
  function say(charId, voiceId, kind, pool) {
    if (!pool.length) return false;
    const s = stateOf(charId);
    let k = s.pos[kind] % pool.length;
    if (pool.length > 1 && lineId(pool[k]) === s.line) k = (k + 1) % pool.length;
    const c = pool[k];
    s.pos[kind] = k + 1;
    s.line = lineId(c);
    return am.voice(voiceId, c.slot, { voiceKey: c.key, line: c.i, takeover: true }) === true;
  }
  /** Whether `charId` was not the operator touched last (and make it so). */
  function touch(charId) {
    if (typeof charId !== 'string' || !charId) return false;
    const fresh = charId !== last;
    last = charId;
    return fresh;
  }
  const ids = (rec) => {
    const charId = rec?.charId || rec?.assets?.voice || null;
    return { charId, voiceId: rec?.assets?.voice || charId };
  };
  return {
    /** An operator opened (a card, a Custom Squad slot, a picker card): its 选中干员 line, once per visit. */
    open(rec) {
      const { charId, voiceId } = ids(rec);
      if (!touch(charId)) return false;
      const key = voiceKeyOf(voiceId);
      const own = key ? lines(voiceId, key, 'select') : [];
      return say(charId, voiceId, 'select', own.length ? own : lines(voiceId, null, 'select'));
    },
    /** `rec`'s outfit just changed (call after the change, so the new look's voice set is in effect): always speaks. */
    outfit(rec) {
      const { charId, voiceId } = ids(rec);
      if (!charId) return false;
      touch(charId);
      const key = voiceKeyOf(voiceId);
      let pool = key ? OUTFIT_SLOTS.flatMap((slot) => lines(voiceId, key, slot)) : [];
      if (key && !pool.length) pool = OTHER_SLOTS.flatMap((slot) => lines(voiceId, key, slot));
      if (!pool.length) pool = OUTFIT_SLOTS.flatMap((slot) => lines(voiceId, null, slot));
      return say(charId, voiceId, 'outfit', pool);
    },
    /**
     * An edit of an operator: a skill or module pick (`patch` has a PICK_KEYS key) is an open (its 选中干员 line once per
     * visit); any other edit (potential, level …) is silent, but it is the operator touched now.
     */
    touch(rec, patch = null) {
      if (patch && PICK_KEYS.some((k) => Object.prototype.hasOwnProperty.call(patch, k))) return this.open(rec);
      touch(ids(rec).charId);
      return false;
    },
    /** Forget the visit (a fresh Operator Loadout): the next operator opened speaks. */
    reset() { last = null; },
  };
}

const shared = createLoadoutVoice(audio);
/** 选中干员 on opening an operator, once per visit (see the header). */
export const speakSelect = (rec) => shared.open(rec);
/** The new outfit's voice (see the header). */
export const speakOutfit = (rec) => shared.outfit(rec);
/** An edit of an operator: a skill / module pick speaks as an open, any other is silent (see the header). */
export const touchOperator = (rec, patch = null) => shared.touch(rec, patch);
/** A fresh Operator Loadout screen. */
export const resetLoadoutVoice = () => shared.reset();
