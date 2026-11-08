// Sandbox board entries (dev, fork; public/dev/sandbox.js): the `units=` URL form and the battle input of an entry. Pure,
// no DOM and no data (test/ui/dev-sandbox-units.test.js).
//
// An entry: { chessId, diy?: { charId, skillIndex, uniEquipId }, row, col, skillIndex, dir, skin, items, module, sp }
//   module  null = the operator's default module | 'none' | a uniEquipId (the match's loadout choice: an elite chess
//           fights with it as PlayerBattleInput moduleId; a 自选 pick carries it as diy.uniEquipId)
//   sp      null = the skill's own starting SP | an integer | 'full' — sandbox-only: the battle input's carryState.sp, the
//           sim's own "start at this SP" input (联防 carry, server/sim/battle/deploy.js → skill.setSpTotal, capped at the
//           skill's maximum). No sim code or default changes.
//   cast    'auto' (null) | 'on' | 'off' — sandbox-only, held by the page after every battle step (sandbox.js skillHold):
//           'on' starts the skill (free) whenever it is not running, 'off' ends it and keeps it from charging
//   infSp   the skill's SP is kept full; infDur: a running skill never runs out (duration / ammo topped up); infHp: the
//           unit's HP is refilled after every step and it does not die (sandbox.js, its kill is skipped)
//
// URL: <chessId>[~<charId>]:<row>,<col>[:<skillIndex>[:<dir>[:<outfitId>]]][!<itemId>[,<itemId>]][|m=<module>][|sp=<n|full>]
//      [|cast=on|off][|isp=1][|idur=1][|ihp=1]

export const DIRS = Object.freeze(['RIGHT', 'LEFT', 'UP', 'DOWN']);
export const EQUIP_SLOTS = 2;
export const SP_FULL = 'full';
/** What "full" sends: more than any skill's SP cap (spCost × charges); skill.setSpTotal caps it. */
export const SP_FULL_VALUE = 10000;

const MODULE_RE = /^(?:none|[A-Za-z0-9_]+)$/;

/** A starting SP from the URL / an input: null (default), a whole number 0 … SP_FULL_VALUE, or 'full'. */
export function parseSp(v) {
  if (v == null || v === '') return null;
  if (v === SP_FULL) return SP_FULL;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(SP_FULL_VALUE, Math.floor(n)) : null;
}

/** The board from the URL (junk dropped; picks, outfits and modules are checked against the data later). */
export function parseUnits(raw) {
  const out = [];
  for (const part of String(raw || '').split(';')) {
    const m = /^([a-z0-9_]+)(?:~([a-z0-9_]+))?:(\d+),(\d+)(?::(\d))?(?::([A-Z]+))?(?::([^:;!|]+))?(?:!([a-z0-9_,]+))?((?:\|[a-z]+=[^|;]*)*)$/.exec(part.trim());
    if (!m) continue;
    const opt = {};
    for (const kv of (m[9] || '').split('|').filter(Boolean)) {
      const i = kv.indexOf('=');
      opt[kv.slice(0, i)] = kv.slice(i + 1);
    }
    const skillIndex = m[5] != null ? +m[5] : 0;
    const module = MODULE_RE.test(opt.m || '') ? opt.m : null;
    out.push({
      chessId: m[1],
      ...(m[2] ? { diy: { charId: m[2], skillIndex, uniEquipId: module && module !== 'none' ? module : null } } : null),
      row: +m[3], col: +m[4], skillIndex, dir: DIRS.includes(m[6]) ? m[6] : 'RIGHT', skin: m[7] || null,
      items: m[8] ? m[8].split(',').filter(Boolean).slice(0, EQUIP_SLOTS) : [],
      module, sp: parseSp(opt.sp), cast: opt.cast === 'on' || opt.cast === 'off' ? opt.cast : null, infSp: opt.isp === '1', infDur: opt.idur === '1', infHp: opt.ihp === '1',
    });
  }
  return out;
}

/** The board as the `units=` value (parseUnits reads it back). */
export const unitsParam = (list) => list.map((u) => `${u.chessId}${u.diy ? `~${u.diy.charId}` : ''}:${u.row},${u.col}:${u.skillIndex}:${u.dir}`
  + `${u.skin ? `:${u.skin}` : ''}${u.items?.length ? `!${u.items.join(',')}` : ''}${u.module ? `|m=${u.module}` : ''}${u.sp != null ? `|sp=${u.sp}` : ''}`
  + `${u.cast ? `|cast=${u.cast}` : ''}${u.infSp ? '|isp=1' : ''}${u.infDur ? '|idur=1' : ''}${u.infHp ? '|ihp=1' : ''}`).join(';');

/**
 * The SP numbers of a skill record (data/chess.json skills[]) for the drawer: its own starting SP, its cost, the most it
 * holds (cost × charges) and whether it is passive (no SP to set).
 */
export function skillSpOf(rec) {
  if (!rec) return { init: null, cost: 0, max: null, passive: true };
  const passive = rec.skillType === 'PASSIVE' || rec.spType === 'ON_DEPLOY' || rec.spType === 8;
  const cost = !passive && Number.isFinite(rec.spCost) ? rec.spCost : 0;
  const charges = Number(rec.maxChargeTime) > 1 ? Number(rec.maxChargeTime) : 1;
  return { init: passive ? null : Number.isFinite(rec.initSp) ? rec.initSp : 0, cost, max: cost ? cost * charges : null, passive };
}

/** The SP number an entry's `sp` sends (null: none, the skill keeps its own). */
export const spValue = (sp) => (sp === SP_FULL ? SP_FULL_VALUE : Number.isInteger(sp) && sp >= 0 ? sp : null);

/**
 * The entry as a PlayerBattleInput unit. `golden`: the chess is an elite (only an elite fights with a module; a normal
 * form keeps its choice for when it is switched to elite).
 */
export function battleUnit(u, uid, { golden = false } = {}) {
  const out = { uid, kind: 'chess', chessId: u.chessId, row: u.row, col: u.col, dir: u.dir, items: [...(u.items || [])] };
  if (u.diy) out.diy = { ...u.diy };
  else {
    out.skillIndex = u.skillIndex;
    if (golden && u.module) out.moduleId = u.module;
  }
  const sp = spValue(u.sp);
  if (sp != null) out.carryState = { sp };
  return out;
}

/** Where the unit card sits: beside its piece (right of it, else left), its top near the piece, inside the window. Pure. */
export function cardPlace(g, w, h, vw, vh, pad = 10) {
  if (!g) return { left: vw - w - pad, top: pad };
  const gap = (g.s > 0 ? g.s : 60) * 1.15;
  let left = g.x + gap;
  if (left + w > vw - pad) left = g.x - gap - w;
  left = Math.max(pad, Math.min(vw - w - pad, left));
  const top = Math.max(pad, Math.min(vh - h - pad, g.y - Math.min(h / 2, 120)));
  return { left: Math.round(left), top: Math.round(top) };
}

/** The sandbox cards' zoom (--sb-zoom in sandbox.html): 1 up to 1650 px wide, then growing with the window, at most 1.15. */
export const sandboxZoom = (w) => Math.min(1.15, Math.max(1, Math.round((w / 1650) * 20) / 20));

/**
 * Why a unit of the link is left out of the board (null: it is placed). The sandbox runs one game version's data: an
 * operator of another season (Season 1's Arene, char_271_spikes, in a Season 2 Custom Squad slot) has no record here.
 * @param {any} u the parsed entry
 * @param {{ chess: any, rec: any, tier?: number|null, allowed: boolean, name?: string }} c the slot / chess record, the
 *   record it would fight as, the slot's tier, whether its tile takes it, its name
 */
export function leftOutReason(u, { chess, rec, tier = null, allowed, name = '' }) {
  const id = u.diy ? u.diy.charId : u.chessId;
  const who = `${name ? `${name} (${id})` : id}${u.diy ? ' in a Custom Squad slot' : ''}`;
  if (!chess) return `${who}: not in this game version's data`;
  if (!rec) return u.diy ? `${who}: not in this game version's ${tier ? `tier ${tier} ` : ''}Custom Squad pool` : `${who}: no record in this game version`;
  if (!allowed) return `${who}: can't be deployed on row ${u.row}, col ${u.col} of this map`;
  return null;
}

/**
 * The board in another game version: each unit's operator (charId) and form (normal / elite) found in that version's
 * chess list, under its piece id there (piece ids are per version). `recOf(u)` = the unit's record here, null for one
 * kept as it is (a Custom Squad pick: its slot is checked by the version itself). Returns the units it has and the
 * ones it does not.
 * @param {any[]} units @param {any[]} list the version's chess records @param {(u: any) => any} recOf
 * @returns {{ kept: any[], gone: any[] }}
 */
export function matchUnitsByOperator(units, list, recOf) {
  const kept = [];
  const gone = [];
  for (const u of units) {
    const rec = recOf(u);
    if (!rec) { kept.push(u); continue; }
    const hit = list.find((r) => r && r.charId === rec.charId && !!r.isGolden === !!rec.isGolden && !r.isDiy);
    if (hit) kept.push({ ...u, chessId: hit.chessId });
    else gone.push(u);
  }
  return { kept, gone };
}

/**
 * Hold a unit's skill the way the sandbox asks (after every battle step; page-only — the sim is not changed): `cast`
 * 'on' starts it (free) whenever it is not running, 'off' ends it and empties its SP; `infSp` keeps the SP full while it
 * is not running; `infDur` keeps a running skill from running out. `sk` = the sim's Skill (server/sim/skills.js).
 * Returns what it did (for the tests): a list of 'start' / 'end' / 'sp' / 'dur'.
 */
export function holdSkill(sk, { cast = null, infSp = false, infDur = false } = {}) {
  const did = [];
  if (!sk || sk.noSkill || sk.kind === 'passive') return did;
  const u = sk.unit;
  if (u && (!u.alive || !u.deployed)) return did;
  if (cast === 'off') {
    if (sk.active && sk.isTimed) { sk.end('sandbox'); did.push('end'); }
    if (sk.sp > 0 || sk.charges > 0) { sk.sp = 0; sk.charges = 0; did.push('sp'); }
    return did;
  }
  if (infSp && !(sk.active && sk.isTimed) && sk.charges < sk.maxCharges) { sk.setSpTotal(SP_FULL_VALUE); did.push('sp'); }
  if (cast === 'on' && !sk.active && sk.activate('sandbox', { free: true })) did.push('start');
  if (infDur && sk.active) {
    if (sk.kind === 'duration' && sk.duration > 0 && sk.timeLeft < sk.duration) { sk.timeLeft = sk.duration; did.push('dur'); }
    if (sk.kind === 'ammo') {
      if (sk.ammoMax > 0 && sk.ammoLeft < sk.ammoMax) { sk.ammoLeft = sk.ammoMax; did.push('dur'); }
      if (Number.isFinite(sk.timeLeft) && sk.duration > 0 && sk.timeLeft < sk.duration) { sk.timeLeft = sk.duration; if (!did.includes('dur')) did.push('dur'); }
    }
  }
  return did;
}
