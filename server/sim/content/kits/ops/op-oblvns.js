// server/sim/content/kits/ops/op-oblvns.js — 丰川祥子 (char_4182_oblvns) 自选 operator kit: 6★ 领主 (近卫), the Ave Mujica collab
// operator (owner's decision 2026-10-15: lifted from the collab exclusion; Ave Mujica stays solo — no other member exists
// here, so every "Ave Mujica 成员" effect has her, and other 丰川祥子, as its only members).
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into data/backups.json); PRTS 丰川祥子 (the
// talent / skill 备注: the note state machine, the angles, the off-range rule, Fever); arknights.wiki.gg Fever (the gauge
// is spent whole); buff_template_data oblvns_* / fever_*; the EN client's prefabs, read 2026-10-15 (owner's decision: the
// prefab wins where PRTS differs) — charpack char_4182_oblvns (the modes Default / S2_Atk / S2_AttackSpeed / S2_Fever /
// S2_Fever_Mag / S3 and their RangedMulti / RangedAlways attacks), [uc]skills skchr_oblvns_1/2/3, [uc]projectiles
// projectile_chr_oblvns* (NOTE_KINDS below).
//
// - Trait (领主) "可以进行远程攻击，但此时攻击力降低至80%": every note fired while she blocks no enemy is ranged and ×atk_scale
//   (PRTS 备注: a note fired while blocking keeps 100 % even if it strikes another enemy) — the ratio is cached at launch.
//   LOR-Y stage 2+ (talent 1's module line "技能期间远程攻击不再降低攻击力"): no ×atk_scale while her skill is running —
//   with S2 always (PRTS "携带此技能时，<Y模组>强化后的第一天赋始终将自身视为技能期间").
//   Module LOR-Y "攻击范围内存在2名及以上敌人时攻击速度+12": counted on her INITIAL range (oblvns_e_002_tr, a 0.2 s
//   aura on her own grid; content/traitMods.js leaves it to this kit).
// - T1 颂乐音符: 持续攻击 (ba.permanentatk) — she attacks with or without a target (ai.js `permanentAttack`), except with no
//   enemy in range when the tile ahead of her is not passable at all (PRTS 备注); every attack plays notes
//   (sim/notes.js) that pick their own victims; "每存在一个音符，Ave Mujica成员无视敌人x%的防御力和y%法术抗性（最多叠加至
//   max_cnt层）" — when a member deals damage, its DEF / RES penetration (百分比, additive) grows by the field's live notes
//   × ratio (oblvns_t_1[attr] ON_CALCULATE_DAMAGE / ON_CALCULATE_CACHED_PROJECTILE_DAMAGE: the highest of every
//   丰川祥子's count, capped at max_cnt; the striking note itself counts).
// - T2 毋畏遗忘: Fever + cnt on every damage she outputs to an enemy (oblvns_t_2[fever] ON_OUTPUT_DAMAGE, before the
//   dodge: PRTS "当次伤害被闪避/格挡时仍能增加Fever" — the `hit` hook); "攻击范围内干员攻击速度+attack_speed" (an aura on
//   the operators in her range, herself included: the Talents/2 aura `_includeSelf`); "其他Ave Mujica成员的攻击范围若与
//   自身原本攻击范围重合，则将其视作攻击范围的延伸" — another 丰川祥子 whose base range touches hers lends its base range
//   (Battle.setExtraRange; PRTS 备注 "存在多个丰川祥子的情况下，另一丰川祥子也可以符合这一条件").
// - S1 新月的苏醒 (charges 2): 8 notes, `atk_scale` … `atk_scale_8`, 法术伤害, fired one after another TRIGGER_S1 s apart
//   (0.1 with a target, 0.04 without: the prefab's RangedMulti / RangedAlways `_triggerDelta`), each in its own fan
//   slot (`_sourceDirectionArcAngleRatio` (2k−1)/16 of 2×`angle`: ±13.125°, 3.75° apart). A cast with 1 charge is her
//   manual cast (the engine's automatic operation, owner 2026-10-15) and may start Fever; the game's own full-charge cast
//   (oblvns_s_1[self] → [no_auto_fever] TriggerSkill) never does: the cast made at maxCharges is the auto one.
// - S2 满月的舞会 (toggle): starts in 钢琴 piano (prefab `_defaultModeIndex` 2 = S2_Atk); its one cast per deployment
//   (PRTS 卫戍协议/帮助 §技能操作 状态切换类 — the strict rule, owner 2026-10-15) switches to 风琴 organ — or, the gauge full,
//   starts Fever and keeps piano (oblvns_s_2[switch]); that Fever cast is not the one cast (the skill goes off again,
//   [ASSUMED] owner 2026-10-19). Piano: ATK +attack@atk, physical notes that pass through
//   (passby 0.5 s); organ: ASPD +attack@attack_speed, arts notes, slower. During Fever: a second note of the timbre
//   0.2 s after the first (S2_Fever `_additionalTimes` 1).
// - S3 残月的余响 (25 s): the skill range; each attack fires 2 physical notes 0.1 s apart (tracing the highest-RES enemy)
//   and 2 arts notes 0.05 s apart (the highest-DEF one), each attack@atk_scale × ATK, 法术 / 物理. During Fever: the Ave
//   Mujica members do not retreat from lethal damage (oblvns_s_3[fever_undead], priority −3000: the last saver) and
//   withdraw when Fever (or she) ends.
// - Fever (sim/fever.js): a manual cast at a full gauge spends it; for 20 s every Ave Mujica member keeps casting its
//   skill for free (S1: back to back as each volley ends; S3: running, its timer held — PRTS "处于持续时间中的技能将暂停
//   持续时间直至Fever结束"); a running S1/S3 ends with Fever when Fever started it. S2 never casts during Fever.

import { num, talentBb, traitBb, skillRec, up, installAura, once } from '../shared/tier1.js';
import { feverOf } from '../../../fever.js';
import { sin, cos, atan2 } from '../../../detmath.js';
import { frontOf } from '../../../dir.js';
import { COLS } from '../../../constants.js';
import { ownerTarget } from '../../../notes.js';

const S1 = 'skchr_oblvns_1';
const S2 = 'skchr_oblvns_2';
const S3 = 'skchr_oblvns_3';
const DEG = Math.PI / 180;

/**
 * The notes (sim/notes.js NoteKind), one per projectile prefab: Body `_tickTime` / `_switchToTracingTime`, Selector
 * radius, Striaght (moveType 4 straight, 6 sine: `speed` = the x speed, `speed_scale` = the amplitude), ToTraceTarget
 * `_speed` / `_turnSpeed`÷30, piano's StriaghtFinal + passby.
 */
export const NOTE_KINDS = Object.freeze({
  // projectile_chr_oblvns (an attack with a target) / _talent (without)
  attack: { tick: 0.4, minFree: 0.1, radius: 1, free: { kind: 'straight', speed: 2 }, trace: 2, turn: 5 / 30 },
  attackFree: { tick: 0.4, minFree: 0.1, radius: 1, free: { kind: 'sine', sx: 1.3, amp: 0.3 }, trace: 2, turn: 7 / 30 },
  // projectile_chr_oblvns_s1_1 … _8 (the speed rises 1.7 → 2 at 0.04/s: the prefab's dynamic speed)
  s1: { tick: 0.2, minFree: 0.6, radius: 1, free: { kind: 'straight', speed: 1.7, accel: 0.04, max: 2 }, trace: 2.2, turn: 5 / 30 },
  // projectile_chr_oblvns_s2 / _s2_t (piano): passby 3.0 for passby_delay (0.5) s with the 0.8 collider
  piano: { tick: 0.2, minFree: 0.4, radius: 0.8, free: { kind: 'sine', sx: 1.9, amp: 0.4 }, trace: 3.5, turn: 15 / 30, passby: { speed: 3, time: 0.5, radius: 0.8 } },
  // projectile_chr_oblvns_s2_slow / _s2_slow_t (organ)
  organ: { tick: 0.4, minFree: 0.4, radius: 1, free: { kind: 'sine', sx: 0.7, amp: 0.15 }, trace: 1, turn: 2.5 / 30 },
  // projectile_chr_oblvns_s3_phy / _s3_mag
  s3: { tick: 0.4, minFree: 0.8, radius: 1, free: { kind: 'sine', sx: 0.8, amp: 0.5 }, trace: 1.3, turn: 7.5 / 30 },
});
/** RangedMulti / RangedAlways `_triggerDelta` (s between the notes of one attack). */
const TRIGGER_S1 = { target: 0.1, none: 0.04 };
const TRIGGER_S3 = { phys: { target: 0.1, none: 0.2 }, arts: 0.05 };
const TRIGGER_S2_FEVER = 0.2;
/** Talent 1 "自身朝向左20°至右20°" (talent bb `attack@angle`) — the default when the data lacks it. */
const DEFAULT_SPREAD = 20;
/** oblvns_e_002_tr[trigger]: the LOR-Y aura checks every 0.2 s. */
const EQUIP_IV = 0.2;
/** The talent-2 aura's refresh (the official aura is continuous) [ASSUMED]. */
const AURA_IV = 0.25;
/** oblvns_s_3[fever_undead] priority −3000: after every other saver. */
const UNDEAD_PRIORITY = -3000;
/**
 * A cast's sting cue (display only: the client plays the skill slot's sting, `loop` also its held loop). When, per the
 * client (buff_template_holder PlayAudio / CreateBuff, audio_data banks): S1 every cast — ON_ABILITY_START.skchr_oblvns_1
 * has no gate, Fever recasts included (owner 2026-10-18: the literal rule; the graph's gated `oblvns_s_1_start` names no
 * bank); S2 / S3 below.
 */
const STING = Object.freeze({ sting: 1 });
const STING_LOOP = Object.freeze({ sting: 1, loop: 1 });
/** S2's switch into organ: its sting, and the timbre the model draws from now on (`form`). */
const ORGAN_CUE = Object.freeze({ sting: 1, form: 'organ' });

/** @param {any} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** The unit's facing angle (radians, field x = column, y = row; RIGHT = 0). */
const facing = (u) => { const [dr, dc] = frontOf(0, 0, u.dir); return atan2(dr, dc); };

/**
 * Launch one note of `unit`: `kind` a NOTE_KINDS entry, `angle` its heading (radians), `target` its first trace target
 * or null, `scale` its 攻击倍率, `type` 'phys' | 'arts', `look` the renderer's family. The damage is cached now (PRTS
 * "所有音符强制使用缓存攻击力与攻击倍率"): ATK × scale × the trait's ranged ratio of this moment.
 */
function launch(battle, unit, k, { kind, angle, target = null, scale = 1, type = 'phys', look, prefer = null, isSkill = false, attackId = 0 }) {
  if (!up(unit)) return null;
  const amount = unit.s.atk * scale * unit.s.atkScaleMul * k.rangedMul(unit);
  return battle.notes.add({
    owner: unit, kind, x: unit.x, y: unit.y, dx: cos(angle), dy: sin(angle), target,
    data: { look, type, amount, prefer },
    onHit: (n, e) => {
      battle.dealDamage(unit, e, { amount: n.data.amount, type: n.data.type, isAttack: true, isSkill, attackId, tags: ['note'] });
    },
  });
}

/** The skill-dependent attack: which notes one attack of `unit` plays (ai.js profile `fireNotes`). */
function fireNotes(battle, unit, k, prof, targets, { isSkill, attackId }) {
  // her notes' first target by the notes' own priority (notes.js ownerTarget: blocked → own range → lent range)
  const target = targets.length ? ownerTarget(battle, unit) ?? targets[0] : null;
  const base = facing(unit);
  const spread = (deg) => base + (battle.rng() * 2 - 1) * deg * DEG;
  const mode = prof.noteMode ?? (unit.skill?.id === S2 ? unit.mem.oblvnsTimbre ?? 'piano' : null);
  const at = (delay, fn) => (delay > 0 ? battle.after(delay, () => fn(), { owner: unit }) : fn());
  if (mode === 's1') {
    // 8 notes one by one, each in its own fan slot ((2k − 1)/16 of the 2·angle arc, from the left), 攻击倍率 atk_scale_k
    const arc = 2 * num(k.b1.angle, 15) * DEG;
    const step = target ? TRIGGER_S1.target : TRIGGER_S1.none;
    for (let i = 0; i < 8; i++) {
      const scale = num(k.b1[i === 0 ? 'atk_scale' : `atk_scale_${i + 1}`], 0);
      const angle = base + arc / 2 - arc * ((2 * i + 1) / 16);
      at(i * step, () => launch(battle, unit, k, { kind: NOTE_KINDS.s1, angle, target: target && target.alive ? target : null, scale, type: 'arts', look: `s1_${i + 1}`, isSkill, attackId }));
    }
    return;
  }
  if (mode === 's3') {
    // 2 physical notes on the highest-RES enemy, 2 arts notes on the highest-DEF one (PRTS), attack@atk_scale each —
    // within the notes' priority groups (ownerTarget: the blocked first, then her own range, then the lent one)
    const physT = ownerTarget(battle, unit, 'res'), artsT = ownerTarget(battle, unit, 'def');
    const scale = num(k.b3['attack@atk_scale'], 1);
    const pStep = physT || artsT ? TRIGGER_S3.phys.target : TRIGGER_S3.phys.none;
    for (let i = 0; i < 2; i++) {
      at(i * pStep, () => launch(battle, unit, k, { kind: NOTE_KINDS.s3, angle: spread(k.spread), target: physT && physT.alive ? physT : null, scale, type: 'phys', look: 's3_phy', prefer: 'res', isSkill, attackId }));
      at(i * TRIGGER_S3.arts, () => launch(battle, unit, k, { kind: NOTE_KINDS.s3, angle: spread(k.spread), target: artsT && artsT.alive ? artsT : null, scale, type: 'arts', look: 's3_mag', prefer: 'def', isSkill, attackId }));
    }
    return;
  }
  if (mode === 'piano' || mode === 'organ') {
    const kind = mode === 'piano' ? NOTE_KINDS.piano : NOTE_KINDS.organ;
    const type = mode === 'piano' ? 'phys' : 'arts';
    const look = mode === 'piano' ? 's2' : 's2_slow';
    const n = k.fever.active ? 2 : 1;   // Fever: the timbre's double strike (S2_Fever `_additionalTimes` 1, 0.2 s)
    for (let i = 0; i < n; i++) at(i * TRIGGER_S2_FEVER, () => launch(battle, unit, k, { kind, angle: spread(k.spread), target: target && target.alive ? target : null, type, look, isSkill, attackId }));
    return;
  }
  // a normal attack: one note — straight at the target, or wandering on its sine without one
  launch(battle, unit, k, { kind: target ? NOTE_KINDS.attack : NOTE_KINDS.attackFree, angle: spread(k.spread), target, type: 'phys', look: target ? 'attack' : 'talent', isSkill, attackId });
}
/** The Ave Mujica members of the field (only 丰川祥子 exists here): the gauge's registry (sim/fever.js). */
const members = (battle) => feverOf(battle).members;

/**
 * Battle-wide (once per field): talent 1's penetration on every member's damage, and S3's Fever undying.
 * Penetration: the highest min(notes of a 丰川祥子, her max_cnt) × her ratios among the members on the field
 * (AssignHighestBlackboardValueFromBuffs), added to the instance's DEF / RES ignore (百分比, 直接加算).
 */
function installField(battle) {
  battle.on('hit', (c) => {
    const src = c.source, d = c.dmg;
    if (!src || !c.target || c.target.side !== 'enemy' || (d.type !== 'phys' && d.type !== 'arts')) return;
    const ms = members(battle);
    if (!ms.has(src)) return;
    let def = 0, res = 0;
    for (const m of ms) {
      const p = m.mem.oblvnsPen;
      if (!p || !up(m)) continue;
      const n = Math.min(p.max, battle.notes.countOf(m));
      def = Math.max(def, n * p.def); res = Math.max(res, n * p.res);
    }
    if (def > 0) d.defIgnorePct = (d.defIgnorePct || 0) + def;
    if (res > 0) d.resIgnorePct = (d.resIgnorePct || 0) + res;
  }, { priority: 5 });
  // S3 Fever: a member does not retreat from lethal damage while an S3 丰川祥子 runs her skill in Fever (FeverAura);
  // it withdraws when Fever ends or she leaves (oblvns_s_3[fever_undead] ON_BUFF_FINISH → Withdraw)
  battle.on('fatal', (c) => {
    if (c.prevented) return;
    const g = feverOf(battle);
    if (!g.active || !members(battle).has(c.unit)) return;
    const guard = [...members(battle)].find((m) => up(m) && m.skill?.id === S3 && m.skill.active);
    if (!guard) return;
    c.prevented = true;
    (guard.mem.oblvnsSaved || (guard.mem.oblvnsSaved = new Set())).add(c.unit);
  }, { priority: UNDEAD_PRIORITY });
}

/** The members a guard saved withdraw now (Fever ended, or the guard left). */
function releaseSaved(battle, guard) {
  const saved = guard.mem.oblvnsSaved;
  guard.mem.oblvnsSaved = null;
  for (const u of saved || []) if (u.alive && u.deployed) battle.kill(u, null);
}

/** Talent 2's range extension: another member whose base range touches this one's lends its base range. */
function relinkRanges(battle) {
  const ms = [...members(battle)].filter((m) => up(m) && m.mem.oblvnsLink);
  for (const m of ms) {
    const own = new Set(m.baseRangeKeys || []);
    const extra = [];
    for (const o of ms) {
      if (o === m || !(o.baseRangeKeys || []).some((k) => own.has(k))) continue;
      for (const k of o.baseRangeKeys) if (!own.has(k)) extra.push(k);
    }
    battle.setExtraRange(m, extra.length ? extra : null);
  }
}

export default {
  char_4182_oblvns: (_bb, chess) => {
    const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
    const tb = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s3Grid = skillRec(chess, S3)?.rangeGrid ?? null;
    // LOR-Y stage 2+: talent 1 adds "技能期间远程攻击不再降低攻击力" (the module's talent text)
    const noRangedCutInSkill = /技能期间远程攻击不再降低攻击力/.test(String(chess?.talents?.[0]?.desc ?? ''));
    const k = {
      b1, b2, b3,
      spread: num(t0['attack@angle'], DEFAULT_SPREAD),
      fever: null,
      /** The trait's ranged ×atk_scale at launch: not while she blocks; not in her skill with the LOR-Y line (S2: always). */
      rangedMul(u) {
        if (u.blocking.length) return 1;
        if (noRangedCutInSkill && (u.skill?.id === S2 || u.skill?.active)) return 1;
        return num(tb.atk_scale, 0.8);
      },
    };
    const trait = {
      // 持续攻击: no target, still an attack — unless no enemy is in range and the tile ahead is not passable at all
      permanentAttack(battle, u) {
        const [r, c] = frontOf(u.tileR, u.tileC, u.dir);
        const tile = battle.grid.inRect(r, c) ? battle.grid.tile(r, c) : null;
        return !!tile && tile.pass !== 'NONE';
      },
      fireNotes(battle, u, prof, targets, info) { fireNotes(battle, u, k, prof, targets, info); },
    };
    /** Is a cast of this skill her manual one (may start Fever)? */
    const manualCast = (skill, reason) => reason !== 'fever' && (skill.id !== S1 || skill.charges < skill.maxCharges - 1);
    return {
      trait,
      skills: {
        // the sting cues (skills.js `cue`: the client's skill stings, public/js/audio.js _sting) — see STING below
        [S1]: { kind: 'charges', attack: { noteMode: 's1' }, cue: () => STING },
        [S2]: {
          kind: 'toggle',
          // the switch's sting (oblvns_s_2[switch]: only a real switch plays one; a cast at a full gauge or in Fever
          // switches to the Fever mode silently). The client's toggle plays h1 into organ and h2 back into piano (owner,
          // by ear, 2026-10-18); our S2 switches once (piano → organ, the strict 状态切换类 rule above), so only the organ
          // sting is shipped and h2 (ON_SKILL_START.skchr_oblvns_2.1) never plays — add it if S2 ever toggles back.
          // The cue also names the timbre she is in from this cast on (`form`, display only: render/units.js FORMS draws
          // its official mode's clips, the S2_Atk / S2_AttackSpeed _replaceAnimPairs). A cast that starts Fever keeps it.
          cue: ({ unit }) => (k.fever.full || k.fever.active || unit.mem.oblvnsTimbre === 'organ'
            ? { form: unit.mem.oblvnsTimbre ?? 'piano' } : ORGAN_CUE),
          // the one cast of the deployment: piano → organ — or Fever when the gauge is full (the timbre stays). A cast that
          // starts Fever is not that one cast: the skill goes off again right after (install's skillStart), SP charges
          // and her next cast switches. [ASSUMED] owner 2026-10-19: oblvns_s_2[switch] keeps the timbre on a full-gauge
          // cast and returns to it after Fever; counting it as the toggle left her on piano with no SP for the rest of the
          // deployment (an S3 member's Fever refills the gauge before her first cast, S2 waits out that Fever)
          onStart({ battle, unit }) {
            if (k.fever.full && !k.fever.active) { if (k.fever.tryStart(unit)) unit.mem.oblvnsFeverCast = true; return; }
            setTimbre(battle, unit, unit.mem.oblvnsTimbre === 'organ' ? 'piano' : 'organ');
          },
        },
        [S3]: {
          kind: 'duration',
          targeting: s3Grid ? { rangeGrid: s3Grid } : undefined,
          attack: { noteMode: 's3' },
          // oblvns_s_3[switch_mode]: the [start] sting and the [loop] buff (its ambient loop) are made only when Fever is
          // neither running nor full — a cast that starts Fever, and every S3 Fever casts, has neither
          cue: () => (k.fever.active || k.fever.full ? null : STING_LOOP),
          // during Fever its duration does not run (PRTS: paused until Fever ends)
          onTick({ skill, dt }) { if (k.fever.active) skill.extend(dt); },
        },
      },
      talents: [
        { install(battle, unit) { // 颂乐音符: the penetration rides on the field hook; her notes outlive her (ownerLeft)
          unit.mem.oblvnsPen = { def: num(t0.def_penetrate_ratio), res: num(t0.magic_resist_penetrate_ratio), max: Math.max(0, num(t0.max_cnt, 10)) };
          battle.on('death', (c) => { if (c.unit === unit) battle.notes.ownerLeft(unit); }, { owner: unit });
        } },
        { install(battle, unit) { // 毋畏遗忘: Fever +cnt per damage dealt, the range extension, the ASPD aura
          const gain = num(t1.cnt);
          battle.on('hit', (c) => {
            if (c.source === unit && c.target && c.target.side === 'enemy' && gain > 0) k.fever.add(gain);
          }, { owner: unit, priority: 100 });
          unit.mem.oblvnsLink = num(t1.enable) > 0;
          const relink = () => relinkRanges(battle);
          battle.on('battleStart', relink, { owner: unit });
          battle.on('deploy', (c) => { if (battle.started && members(battle).has(c.unit)) relink(); }, { owner: unit });
          battle.on('death', (c) => { if (members(battle).has(c.unit)) relink(); }, { owner: unit });
          const aspd = num(t1.attack_speed);
          if (aspd > 0) {
            installAura(battle, unit, {
              key: 'talent:oblvns:aspd', value: aspd, interval: AURA_IV, mods: { aspd },
              select: (a) => a.kind === 'op' && up(a) && !!unit.rangeKeySet && unit.rangeKeySet.has(a.tileR * COLS + a.tileC),
            });
          }
        } },
      ],
      install(battle, unit) {
        const g = (k.fever = feverOf(battle));
        g.members.add(unit);
        once(battle, 'oblvns:field', () => installField(battle));
        // LOR-Y: 攻击范围内存在2名及以上敌人时攻击速度+12 — on her initial range, every 0.2 s
        const equip = num(tb.attack_speed);
        if (equip > 0) {
          battle.every(EQUIP_IV, () => {
            const want = up(unit) && battle.enemiesInKeys(unit.baseRangeKeys || [], unit, unit.profile).length >= 2;
            const has = unit.findBuff('module:oblvns:aspd');
            if (want && !has) battle.addBuff(unit, { key: 'module:oblvns:aspd', mods: { aspd: equip }, tags: ['module'] });
            else if (!want && has) battle.removeBuff(unit, 'module:oblvns:aspd');
          }, { owner: unit });
        }
        const sk = unit.skill;
        if (!sk) return;
        if (sk.id === S2) {
          battle.on('deploy', (c) => { if (c.unit === unit) setTimbre(battle, unit, 'piano'); }, { owner: unit });
          setTimbre(battle, unit, 'piano');
        }
        // a manual cast at a full gauge starts Fever (S2 decides in its own onStart)
        battle.on('skillStart', (c) => {
          if (c.unit !== unit) return;
          if (sk.id === S2) {
            // her Fever-starting cast ends at once: it was not the timbre switch (S2 onStart)
            if (unit.mem.oblvnsFeverCast) { unit.mem.oblvnsFeverCast = false; sk.end('fever'); }
            return;
          }
          if (manualCast(c.skill, c.reason)) g.tryStart(unit);
        }, { owner: unit });
        if (sk.id === S1) {
          // the game's own cast at maxCharges (oblvns_s_1[self]): enemy or not, never during Fever's own casting
          battle.on('tick', () => {
            if (!up(unit) || !unit.canAct || unit.s.flags.silence || g.active) return;
            if (sk.charges >= sk.maxCharges && !sk.pending) sk.activate('full');
          }, { owner: unit });
          // Fever: back to back, free; every attack refills the SP (oblvns_s_1[fever] ModifySp ratio 1)
          battle.on('skillEnd', (c) => {
            if (c.unit === unit && g.active && up(unit) && !sk.pending) sk.activate('fever', { free: true });
          }, { owner: unit });
          battle.on('attack', (c) => { if (c.attacker === unit && g.active) sk.addCharge(sk.maxCharges); }, { owner: unit });
        }
        g.listen({
          onStart() {
            if (!up(unit)) return;
            if (sk.id === S1 && !sk.pending) sk.activate('fever', { free: true });
            else if (sk.id === S2) sk.opReadyAt = Math.max(sk.opReadyAt, g.activeUntil);   // no cast during Fever
            else if (sk.id === S3) {
              if (sk.active) unit.mem.oblvnsByFever = false;
              else if (sk.activate('fever', { free: true })) unit.mem.oblvnsByFever = true;
            }
          },
          onEnd() {
            if (sk.id === S3 && unit.mem.oblvnsByFever && sk.active) sk.end('fever');
            unit.mem.oblvnsByFever = false;
            releaseSaved(battle, unit);
          },
        }, unit);
        battle.on('death', (c) => { if (c.unit === unit) releaseSaved(battle, unit); }, { owner: unit });
      },
    };
  },
};

/** S2's timbre: piano ATK +attack@atk, organ ASPD +attack@attack_speed (a buff while she is on the field). */
function setTimbre(battle, unit, t) {
  unit.mem.oblvnsTimbre = t;
  const b2 = unit.mem.oblvnsB2 || (unit.mem.oblvnsB2 = unit.skill?.bb ?? {});
  battle.removeBuff(unit, 'skill:oblvns:timbre');
  const mods = t === 'piano' ? { atkPct: num(b2['attack@atk']) } : { aspd: num(b2['attack@attack_speed']) };
  if (up(unit)) battle.addBuff(unit, { key: 'skill:oblvns:timbre', mods, tags: ['skill'] });
}
