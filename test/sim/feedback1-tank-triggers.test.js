// 重装 (TANK) skill triggers, the official row. The live client's TANK class row is `[ON_TAKE_DAMAGE, SKILL_RANGE_ENEMY]`: a
// MANUAL 重装 skill casts at a hit OR as soon as an enemy stands on its skill range (data/chess.json `trigger`: rule
// TAKE_DAMAGE, `also` the further rule, `official` the client's types). Our SKILL_RANGE_ENEMY is SKILL_RANGE on the skill's
// own rangeGrid (e.g. 深巡 S2's x-3), SEARCH (an enemy in the initial attack range) when the skill has no rangeGrid.
// Before the official triggers (0.1.1 community feedback, GitHub issue #4, PR #12) six skills were the owner's DEFAULT
// deviation; that deviation is gone — the official list casts them with an enemy in range without it: 深巡 S2 行动能力剥夺,
// 雷蛇 S2 反击电弧, 号角 S2 暴风号令 and S3 终极防线, 灰毫 S1 攻击力强化·γ型 and S2 专注轰击 (SIX_RANGE_CASTERS below).
// One deviation is kept (the owner's decision after GitHub issue #32 item 1, DESIGN §22.10): 余 S2 厚礼上宾 casts with an
// enemy on its own 技能范围 x-1 alone — SKILL_RANGE, customRangeGrid its range, no TAKE_DAMAGE (`trigger.deviation`).
//
// The battle check is real: the chess records of data/chess.json with their kits, the stage 战场#01(下半)
// (act2autochess_m01), a real enemy (萨卡兹枯朽前锋, melee, 0.8 tiles/s) walking the lane from the gate (9,10) to the
// objective; the operator stands on (9,5) facing the gate with its skill fully charged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { bodyInRange } from '../../server/sim/body.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';

const CHESS = JSON.parse(fs.readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const ds = getDefaultSource();

/** [normal chess id, skill id] — both records (normal + elite) of each chess; the six skills of the old DEFAULT deviation. */
const SIX_RANGE_CASTERS = [
  ['chess_char_1_04_a', 'skchr_udflow_2'],   // 深巡 S2 行动能力剥夺 (has a rangeGrid x-3: the further rule is SKILL_RANGE)
  ['chess_char_1_20_a', 'skchr_liskam_2'],   // 雷蛇 S2 反击电弧
  ['chess_char_5_08_a', 'skchr_horn_2'],     // 号角 S2 暴风号令
  ['chess_char_5_08_a', 'skchr_horn_3'],     // 号角 S3 终极防线
  ['chess_char_2_18_a', 'skcom_atk_up[3]'],  // 灰毫 S1 攻击力强化·γ型
  ['chess_char_2_18_a', 'skchr_ashlok_2'],   // 灰毫 S2 专注轰击
];
/** The official TANK class row (CN season 3): cast at a hit, or with an enemy on the skill range. */
const TANK_OFFICIAL = ['ON_TAKE_DAMAGE', 'SKILL_RANGE_ENEMY'];
/** 余 S2 厚礼上宾: SKILL_RANGE on its own x-1 alone (DESIGN §22.10), the kept deviation. */
const SKILL_RANGE_DEVIATED = [['chess_char_6_03_a', 'skchr_yu_2']];
const both = (normalId) => [normalId, CHESS[normalId].goldenId];
const isDeviated = (c, skillId) => SKILL_RANGE_DEVIATED.some(([id, s]) => id === c.baseId && s === skillId);
/** The data's trigger of a TANK row: TAKE_DAMAGE + the SKILL_RANGE_ENEMY rule (SKILL_RANGE on the skill's own grid, else SEARCH). */
const tankTrigger = (s) => ({
  rule: 'TAKE_DAMAGE', customRangeGrid: null, rawRule: 'ON_TAKE_DAMAGE', official: TANK_OFFICIAL,
  also: [s.rangeGrid?.length ? { rule: 'SKILL_RANGE', customRangeGrid: s.rangeGrid } : { rule: 'SEARCH', customRangeGrid: null }],
});
const ENEMY = 'enemy_1422_lrsldr';

/**
 * One real battle: `chessId` with skill `skillId` on (9,5) facing RIGHT, SP full; one 萨卡兹枯朽前锋 on the lane from
 * `spawnAt` s. Returns the first cast (time, reason, whether an enemy stood on the unit's initial range / on the grid of
 * the rule that cast, whether the unit blocked it) and the time the unit first took damage (any `damaged` event: what
 * TAKE_DAMAGE listens to).
 */
function firstCast(chessId, skillId, { spawnAt = 0, seconds = 40 } = {}) {
  const index = CHESS[chessId].skills.find((s) => s.skillId === skillId).index;
  const h = makeBattle({
    stageId: 'act2autochess_m01', seed: 3, timeLimit: 120, autoFinish: false,
    units: [{ chessId, row: 9, col: 5, dir: 'RIGHT', skillIndex: index, carryState: { sp: 999 } }],
    enemies: [{ key: ENEMY, route: 0, time: spawnAt }],
  });
  const u = h.unit(chessId);
  assert.equal(u.skill.id, skillId, `${chessId} runs ${skillId}`);
  const out = { rules: u.skill.rules, cast: null, reason: null, enemyInRange: false, enemyInSkillRange: false, blocking: false, hurt: null };
  h.b.on('damaged', (ctx) => { if (ctx.target === u && out.hurt == null) out.hurt = h.b.time; }, { priority: 1000 });
  h.b.on('skillStart', (ctx) => {
    if (ctx.unit !== u || out.cast != null) return;
    out.cast = h.b.time;
    out.reason = ctx.reason;
    const keys = new Set(u.baseRangeKeys || u.rangeKeys);
    // by the 0.1 collider, the engine's range test since 0.3.0
    out.enemyInRange = h.b.enemies.some((e) => e.alive && e.deployed && bodyInRange(e, keys));
    // the grid of the rule that cast: the skill's own first rule, or the list's further rule of that name
    const grid = ctx.reason === u.skill.rule ? u.skill.triggerGrid : u.skill.alsoRules.find((e) => e.rule === ctx.reason)?.grid;
    const sk = grid ? new Set(absoluteRangeKeys(grid, u.tileR, u.tileC, u.dir, 0)) : null;
    out.enemyInSkillRange = !!sk && h.b.enemies.some((e) => e.alive && e.deployed && bodyInRange(e, sk));
    out.blocking = u.blocking.length > 0;
  }, { priority: 1000 });
  h.runUntil(() => out.cast != null && out.hurt != null, seconds);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  return out;
}

test('data: every MANUAL 重装 skill carries the official row [ON_TAKE_DAMAGE, SKILL_RANGE_ENEMY] (TAKE_DAMAGE + SKILL_RANGE on its x-grid / SEARCH), 余 S2 is SKILL_RANGE on its x-1 alone; normal and elite record', () => {
  let n = 0;
  for (const [normalId, skillId] of SIX_RANGE_CASTERS) {
    for (const id of both(normalId)) {
      const s = CHESS[id].skills.find((x) => x.skillId === skillId);
      assert.ok(s, `${id} ${skillId}`);
      assert.equal(CHESS[id].profession, 'TANK');
      // the old DEFAULT deviation is gone: the official list, not a DEFAULT / ACTIVE_RANGE rule
      assert.deepEqual(s.trigger, tankTrigger(s), `${id} ${skillId}`);
      assert.equal(s.trigger.deviation, undefined, `${id} ${skillId}: no deviation`);
      // the sim's loadout def carries the list
      const trig = ds.getChess(id, { skillIndex: s.index }).skill.trigger;
      assert.equal(trig.rule, 'TAKE_DAMAGE', `${id} ${skillId} loadout def`);
      assert.deepEqual(trig.also, [{ rule: s.trigger.also[0].rule, grid: s.trigger.also[0].customRangeGrid }], `${id} ${skillId} loadout def: the further rule`);
      n++;
    }
  }
  assert.equal(n, 12);
  // 深巡 S2 行动能力剥夺: the SKILL_RANGE_ENEMY rule is SKILL_RANGE on its own x-3 (no longer ACTIVE_RANGE on a 3-2)
  for (const id of both('chess_char_1_04_a')) {
    const s = CHESS[id].skills.find((x) => x.skillId === 'skchr_udflow_2');
    assert.deepEqual(s.trigger.also, [{ rule: 'SKILL_RANGE', customRangeGrid: [[0, 0], [0, 1], [0, 2], [0, 3]] }], `${id} 深巡 S2`);
  }
  for (const [normalId, skillId] of SKILL_RANGE_DEVIATED) {
    for (const id of both(normalId)) {
      const s = CHESS[id].skills.find((x) => x.skillId === skillId);
      assert.equal(CHESS[id].profession, 'TANK');
      assert.ok(s.rangeGrid?.length, `${id} ${skillId}: a 技能范围 of its own`);
      assert.deepEqual(s.trigger, { rule: 'SKILL_RANGE', customRangeGrid: s.rangeGrid, rawRule: 'ON_TAKE_DAMAGE', official: TANK_OFFICIAL, deviation: 'SKILL_RANGE' }, `${id} ${skillId}`);
      const def = ds.getChess(id, { skillIndex: s.index });
      assert.equal(def.skill.trigger.rule, 'SKILL_RANGE', `${id} ${skillId} loadout def`);
      assert.deepEqual(def.skill.trigger.grid, s.rangeGrid, `${id} ${skillId}: the trigger grid is its x-1`);
      assert.equal(def.skill.trigger.also, undefined, `${id} ${skillId}: no TAKE_DAMAGE beside it`);
    }
  }
  // every other MANUAL 重装 skill (深巡 S1 and the generic skcom_atk_up[3] among them) has the same official row
  let rows = 0;
  for (const c of Object.values(CHESS)) {
    if (c.profession !== 'TANK' || c.isDiy) continue;
    for (const s of c.skills || []) {
      if (s.skillType !== 'MANUAL' || isDeviated(c, s.skillId) || s.trigger.rule === 'CUSTOM_RANGE') continue;
      assert.deepEqual(s.trigger, tankTrigger(s), `${c.chessId} ${s.skillId}`);
      rows++;
    }
  }
  assert.ok(rows >= 56, `${rows} 重装 MANUAL records carry the official row`);
  // skcom_atk_up[3] is shared: another class's carrier keeps its own class row (not the 重装 one)
  const others = Object.values(CHESS).filter((c) => c.baseId !== 'chess_char_2_18_a' && c.skills?.some((s) => s.skillId === 'skcom_atk_up[3]'));
  assert.ok(others.length >= 10, 'skcom_atk_up[3] is shared');
  for (const c of others) {
    const t = c.skills.find((s) => s.skillId === 'skcom_atk_up[3]').trigger;
    assert.ok(c.profession !== 'TANK' && t.rule !== 'TAKE_DAMAGE', `${c.chessId} ${c.profession} keeps its own class row: ${JSON.stringify(t)}`);
  }
});

test('the kits set no trigger of their own on any of these 重装 skills (the official list reads from the data; PR #12 line of 雷蛇 and 瑕光 S3 DEFAULT are gone)', async () => {
  const { KITS } = await import('../../server/sim/content/index.js');
  for (const [normalId, skillId] of [...SIX_RANGE_CASTERS, ...SKILL_RANGE_DEVIATED, ['chess_char_3_12_a', 'skchr_blemsh_3']]) {
    for (const id of both(normalId)) {
      const rec = CHESS[id];
      const s = rec.skills.find((x) => x.skillId === skillId);
      const def = ds.getChess(id, { skillIndex: s.index });
      const kit = KITS[rec.baseId]?.(def.skill.bb, def.raw, def);
      const spec = s.isDefault ? kit?.skill : kit?.skills?.[skillId];
      const specRule = typeof spec?.trigger === 'string' ? spec.trigger : spec?.trigger?.rule;
      assert.equal(specRule, undefined, `${id} ${skillId}: kit sets no trigger (data ${s.trigger.rule})`);
    }
  }
});

test('real battle: the six former DEFAULT casters now cast with an enemy in range before anything hits the operator, by the official list SKILL_RANGE_ENEMY rule (normal + elite; 深巡 S2 on its x-3)', () => {
  for (const [normalId, skillId] of SIX_RANGE_CASTERS) {
    for (const id of both(normalId)) {
      const r = firstCast(id, skillId, { spawnAt: 3 });
      const where = `${id} ${skillId}: ${JSON.stringify(r)}`;
      const further = skillId === 'skchr_udflow_2' ? 'SKILL_RANGE' : 'SEARCH';
      assert.deepEqual(r.rules, ['TAKE_DAMAGE', further], where);
      assert.ok(r.cast != null, `never cast — ${where}`);
      assert.ok(r.cast >= 3, `no cast before an enemy is on the field — ${where}`);
      assert.equal(r.reason, further, where);
      if (further === 'SKILL_RANGE') assert.ok(r.enemyInSkillRange, `an enemy on the x-3 at the cast — ${where}`);
      else assert.ok(r.enemyInRange, `an enemy on its initial range at the cast — ${where}`);
      assert.ok(r.hurt == null || r.hurt > r.cast, `cast before the first hit — ${where}`);
    }
  }
});

test('real battle: 余 S2 casts once the walker steps onto its x-1, before anything hits him (normal + elite)', () => {
  for (const [normalId, skillId] of SKILL_RANGE_DEVIATED) {
    for (const id of both(normalId)) {
      const r = firstCast(id, skillId, { spawnAt: 3 });
      const where = `${id} ${skillId}: ${JSON.stringify(r)}`;
      assert.deepEqual(r.rules, ['SKILL_RANGE'], where);
      assert.ok(r.cast != null && r.cast >= 3, `cast once an enemy is on the field — ${where}`);
      assert.equal(r.reason, 'SKILL_RANGE', where);
      // (skillStart comes after the cast's own teleport: the walker already stands on his tile then, but he has not
      // blocked anyone yet — it was pulled in from x-1, it did not walk in)
      assert.ok(r.enemyInSkillRange && !r.blocking, `an enemy on x-1, pulled in rather than walked in — ${where}`);
      assert.ok(r.hurt == null || r.hurt > r.cast, `cast before the first hit — ${where}`);
    }
  }
});

test('real battle: every MANUAL 重装 skill casts at the first hit OR with an enemy on its skill range, whichever comes first (official row [ON_TAKE_DAMAGE, SKILL_RANGE_ENEMY])', () => {
  let n = 0;
  for (const c of Object.values(CHESS)) {
    if (c.profession !== 'TANK' || c.isDiy) continue;
    for (const s of c.skills) {
      if (s.skillType !== 'MANUAL' || s.trigger.rule !== 'TAKE_DAMAGE') continue;
      const r = firstCast(c.chessId, s.skillId);
      const where = `${c.chessId} ${c.name} ${s.skillId}: ${JSON.stringify(r)}`;
      assert.deepEqual(r.rules, ['TAKE_DAMAGE', s.trigger.also[0].rule], where);
      assert.ok(r.cast != null, `cast — ${where}`);
      // the cast is by the first hit (TAKE_DAMAGE) or by an enemy on the further rule's range, never later than the hit
      assert.ok(r.reason === 'TAKE_DAMAGE' || r.reason === s.trigger.also[0].rule, where);
      if (r.reason === 'TAKE_DAMAGE') assert.equal(r.cast, r.hurt, `cast by the first hit — ${where}`);
      else {
        assert.ok(r.hurt == null || r.cast <= r.hurt, `cast before (or at) the first hit — ${where}`);
        // SEARCH: an enemy on the initial range, or the one the unit blocks (its block radius is off the range tiles)
        assert.ok(r.reason === 'SEARCH' ? r.enemyInRange || r.blocking : r.enemyInSkillRange, `an enemy on the range at the cast — ${where}`);
      }
      n++;
    }
  }
  assert.ok(n >= 56, `${n} TAKE_DAMAGE records checked`);
  // 深巡 S1 侵袭破坏应对 (no rangeGrid: the SEARCH rule): casts with the walker in her range, not only after the hit
  const udflowS1 = firstCast('chess_char_1_04_a', 'skchr_udflow_1', { spawnAt: 3 });
  assert.equal(udflowS1.reason, 'SEARCH', JSON.stringify(udflowS1));
  assert.ok((udflowS1.enemyInRange || udflowS1.blocking) && (udflowS1.hurt == null || udflowS1.cast <= udflowS1.hurt), JSON.stringify(udflowS1));
});
