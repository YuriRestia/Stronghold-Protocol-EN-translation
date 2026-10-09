// server/sim/content/kits/shared/summoner.js — the 召唤师 (summoner) branch in 卫戍: the summon deck the 自选 kits of 麦哲伦
// (ops/op-mgllan.js), 令 (ops/op-ling.js) and 电弧 (ops/op-radian.js) share — the holding (持有), the return of a placed piece
// that left the field, recalls (回收), the summons vanishing with their owner, and the skills that cast on an enemy in a
// summon's area (summonTriggerArea: the owner's larger-range rule, 2026-10-06). Kit contract and rules: ../README.md.
//
// Sources: the client's battle data (charpack char_248_mgllan / char_2023_ling / char_4195_radian: Talents/1
// charge_token[born] — RechargeToken `cnt` at every deployment of the owner; CommonAbilities die_to_kill_token — KillTokens
// when the owner leaves; the SUM-Y equips mgllan_equip_2_* / ling_equip_1_*: trigger_charge_token — RechargeToken the
// trait's `cnt` once, on the undeployed card (`_attachPassiveBuffsOnDummy`); the token decks: deckStack / deployLimit of
// the token records, which carry the tokens' hidden talent max_deck_stack_cnt / max_deploy_count — tools/build-data.mjs
// tokenTalentDeckBonus); PRTS 分支特性信息 召唤师
// ("干员离场后，附属的召唤物随之消失"); PRTS 卫戍协议/帮助 §作战阶段 (placed summons: "所有手动部署的召唤物，无视所属干员的持有
// 状态，不消耗持有数量，作战开始时立即部署一次", "若战场区初始部署有召唤物，若召唤物在战斗期间退场，将在满足条件后立即原地再部署1个").
//
// The deck (`summonDeck`):
// - holding: `start` on the undeployed card (SUM-Y's +3), then +`charge` at each deployment of the owner, at most `cap`
//   (the token deck: 5, +3 with SUM-Y); a skill's "获得1个召唤物" and a recall add 1 (deck.gain / deck.recall);
// - the battle start deploys every placed piece for free without touching the holding (the engine's initial deployment);
// - a piece that leaves the field — knocked out, recalled, absorbed, withdrawn with its owner — comes back on its own tile
//   once "满足条件": its owner on the field [ASSUMED: as in the base game, a summon is deployed only while its owner
//   stands], its redeploy time (the token's respawnTime) passed since it left, one held (used up), fewer than
//   `maxDeployed` of the owner's pieces standing ("最多同时部署3个") and its DP cost paid [ASSUMED: "满足条件" = what a manual
//   deployment needs; the pieces of 夜莺 / 鸿雪 / 凯尔希 pay too];
// - the owner leaving (knocked out or withdrawn) takes its standing pieces off the field with it (KillTokens — withdrawn
//   here, no knock-down: 'retreat' [ASSUMED]); they wait for its next deployment like any piece that left.
// `onLeave(piece, kind, ctx)` tells the kit why a piece left: 'killed', 'recall', 'absorb' (令's 弦惊 merge), 'owner' (with
// its owner), else the engine's removal reason.

import { num, up } from './tier1.js';
import { atPotential } from '../../../../../shared/potential.js';

/** Seconds between two tries of a piece waiting to come back (its owner off the field, timer, holding, DP, tile). */
export const DECK_RETRY = 0.25;

/**
 * Keep buff `key` with `mods` on `u` while `want` (replaced when the mods change, removed when not wanted) — the owner's
 * timed skills acting on its summons, held every tick so a summon deployed during the skill takes them too.
 */
export function holdBuff(battle, u, key, want, mods, extra = null) {
  const has = u.findBuff(key);
  if (!want) { if (has) battle.removeBuff(u, key); return; }
  const cur = has?.mods ?? {};
  if (has && Object.keys(mods).length === Object.keys(cur).length && Object.keys(mods).every((k) => cur[k] === mods[k])) return;
  battle.addBuff(u, { key, mods, tags: ['skill'], ...extra });
}

/**
 * The owner's larger-range rule through summons (the owner's decision of 2026-10-06; ACTIVE_RANGE, server/sim/skills.js:
 * "a skill whose effect reaches farther than the operator's own range casts when an enemy is inside the larger area"):
 * when `owner`'s picked skill is `skillId`, it also casts while an enemy is inside the area it acts through around one of
 * the owner's summons standing on the field — on top of its data rule (DEFAULT: an enemy in the owner's own range, about
 * to attack). A content trigger range (SkillRuntime.addTriggerRange), checked every tick: `area(piece)` gives that
 * summon's area as `{ keys, profile }` (absolute tile keys; the enemy profile the effect selects by — `canHitFly` false
 * when it cannot reach air units) or null. Used by 麦哲伦 S1 (her drones' ranges), 令 S3 (each summon's x-5) and 电弧 S2 /
 * S3 (赛柯's / 桑特拉's ranges). Returns the unregister fn, or null when the skill is another one.
 * @param {object} battle
 * @param {object} owner the summoner unit (its deck: owner.mem.summonDeck)
 * @param {string} skillId
 * @param {(piece: object) => ({ keys: number[], profile?: object } | null)} area
 */
export function summonTriggerArea(battle, owner, skillId, area) {
  const sk = owner?.skill;
  if (!sk || sk.id !== skillId) return null;
  return sk.addTriggerRange(() => {
    const deck = owner.mem.summonDeck;
    if (!deck || !up(owner) || battle.finished) return [];
    const out = [];
    for (const t of deck.standing()) {
      const a = area(t);
      if (a && Array.isArray(a.keys) && a.keys.length) out.push(a);
    }
    return out;
  });
}

/**
 * A field of a summon's token record at its owner's form, module and potential (data/backups.json `tokens[id].variants[<charId>@
 * <status>]`, `byModule[uniEquipId]`; shared/potential.js atPotential): the stats the normalised def drops (`deployLimit`,
 * `deckStack`).
 * @param {object} battle
 * @param {object} owner the summoner unit
 * @param {string} tokenId
 * @param {string} key a `stats` field
 */
export function tokenStat(battle, owner, tokenId, key) {
  const raw = battle.data?.rawToken?.(tokenId) ?? null;
  const v = atPotential(raw?.variants?.[owner?.def?.tokenOwner] ?? null, owner?.def?.loadout?.potential);
  const mod = owner?.def?.loadout?.diy?.uniEquipId ?? owner?.def?.loadout?.moduleId ?? null;
  const st = (mod && v?.byModule?.[mod]?.stats) || v?.stats || raw?.stats || null;
  return st && Number.isFinite(st[key]) ? st[key] : (Number.isFinite(raw?.[key]) ? raw[key] : null);
}

/**
 * Install the summon deck of `owner` (see the header) and hand its placed pieces their kit.
 * @param {object} battle
 * @param {object} owner the summoner unit
 * @param {{ tokenIds: Iterable<string>, charge: number, start?: number, cap: number, maxDeployed?: number,
 *   kit?: ((piece: object) => object) | null, onLeave?: ((piece: object, kind: string, ctx: object) => void) | null }} opts
 * @returns {object} the deck: { held, cap, charge, maxDeployed, pieces(), standing(), gain(n), recall(t), withdraw(t, kind) }
 */
export function summonDeck(battle, owner, { tokenIds, charge, start = 0, cap, maxDeployed = Infinity, kit = null, onLeave = null }) {
  const ids = new Set(tokenIds);
  const c = Math.max(0, Math.floor(num(cap, 0)));
  const deck = {
    held: Math.min(c, Math.max(0, Math.floor(num(start, 0)))),
    cap: c,
    charge: Math.max(0, Math.floor(num(charge, 0))),
    maxDeployed: num(maxDeployed, Infinity) > 0 ? num(maxDeployed, Infinity) : Infinity,
    /** Every placed piece of the owner (on the field or waiting). */
    pieces: () => battle.allyUnits.filter((t) => t.kind === 'token' && t.ownerUnit === owner && ids.has(t.defId)),
    /** The pieces on the field. */
    standing: () => deck.pieces().filter(up),
    /** "获得N个召唤物": +n held, at most the cap. */
    gain(n = 1) { deck.held = Math.min(deck.cap, deck.held + Math.max(0, Math.floor(num(n, 0)))); },
    /** Take a standing piece off the field for `kind` (it comes back like any piece that left). */
    withdraw(t, kind) {
      if (!up(t)) return false;
      t.mem.deckLeave = kind;
      battle.retreat(t, { reason: 'retreat' });
      return true;
    },
    /** 回收: the piece goes back to the holding (+1) and leaves the field (its redeploy timer runs: `_switchToDeadState`). */
    recall(t) {
      if (!up(t)) return false;
      deck.gain(1);
      battle.fx('disappear', { x: t.x, y: t.y, id: t.id });
      return deck.withdraw(t, 'recall');
    },
  };
  owner.mem.summonDeck = deck;

  /** The piece comes back on its tile once the conditions are met (see the header); one waiting loop per leave. */
  const waitAndReturn = (t) => {
    const seq = (t.mem.deckSeq = (t.mem.deckSeq ?? 0) + 1);
    battle.every(DECK_RETRY, (b, sched) => {
      if (t.mem.deckSeq !== seq || t.alive || t.removed || b.finished) { sched.cancel(); return; }
      if (!up(owner) || b.time + 1e-9 < t.mem.deckReadyAt || deck.held < 1) return;
      if (deck.standing().length >= deck.maxDeployed) return;
      if (b.redeploy(t, { free: false })) {
        deck.held = Math.max(0, deck.held - 1);
        sched.cancel();
      }
    }, { owner: t });
  };

  for (const t of deck.pieces()) {
    if (t.alive || t.deployed) continue;
    if (kit) {
      if (t.kit) battle.offOwner(t);   // a piece set up before its owner: drop its generic kit's hooks
      battle._setupUnit(t, kit(t));
    }
    // a piece that left stays its tile's piece (`removed` false: Battle.redeploy accepts it, its hooks are kept)
    battle.on('death', (ctx) => {
      if (ctx.unit !== t || battle.finished) return;
      const kind = t.mem.deckLeave ?? (ctx.reason === 'killed' ? 'killed' : ctx.reason);
      t.mem.deckLeave = null;
      t.removed = false;
      t.mem.deckReadyAt = battle.time + Math.max(0, num(t.base.respawnTime));
      if (onLeave) battle._safe(() => onLeave(t, kind, ctx), 'summonDeck.onLeave', t);
      waitAndReturn(t);
    }, { owner: t, priority: -10 });
  }

  // charge_token[born]: +charge at every deployment of the owner (the battle start's included)
  battle.on('deploy', (ctx) => { if (ctx.unit === owner) deck.gain(deck.charge); }, { owner, priority: 100 });
  // die_to_kill_token: "干员离场后，附属的召唤物随之消失"
  battle.on('death', (ctx) => {
    if (ctx.unit !== owner) return;
    for (const t of deck.standing()) deck.withdraw(t, 'owner');
  }, { owner, priority: 50 });
  return deck;
}
