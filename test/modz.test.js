// test/modz.test.js — (Fish Edition) Mod Z / W draft (shared/modZ.js, server/sim/content/modZ.js, the `modZ` cheat rule).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { MODZ, modZOf, withModZ } from '../shared/modZ.js';
import { MODZ_INSTALLED, typhonBalance, zuoleDouble } from '../server/sim/content/modZ.js';
import { modZRulePicks, diyRecord, checkDiyPick, hasModZ } from '../shared/diy.js';
import { unitForm } from '../shared/standIn.js';
import { getDefaultSource } from '../server/sim/simdata.js';
import { RULES, isRuleValue, normalizeRules, ruleSet } from '../shared/rules.js';
import { makeBattle, enemyRec, chessRec } from './helpers/battleHarness.js';

const ds = getDefaultSource();
const backups = ds.rawBackups();
const data = { backups, chess: JSON.parse(readFileSync(new URL('../data/chess.json', import.meta.url), 'utf8')) };

test('every Mod Z / W has battle effects, a unique id and an operator in the custom pool', () => {
  assert.deepEqual([...MODZ_INSTALLED].sort(), MODZ.map((m) => m.id).sort());
  assert.equal(new Set(MODZ.map((m) => m.id)).size, MODZ.length);
  for (const m of MODZ) {
    assert.ok(backups.units[m.charId], m.charId);
    assert.equal(modZOf(m.id), m);
  }
  const rule = RULES.find((r) => r.key === 'modZ');
  assert.equal(rule.category, 'cheat');
  assert.deepEqual(rule.options, MODZ.map((m) => m.id), 'one option per module');
  assert.ok(isRuleValue('modZ', ['uniequip_fishz_weedy']) && !isRuleValue('modZ', ['uniequip_002_siege']) && !isRuleValue('modZ', true));
  assert.ok(!isRuleValue('modZ', ['uniequip_fishz_typhon', 'uniequip_fishw_typhon']), 'one module per operator');
  assert.deepEqual(normalizeRules({ modZ: ['uniequip_fishw_typhon', 'uniequip_fishz_typhon'] }).modZ, ['uniequip_fishz_typhon'], 'the first in order is kept');
  assert.deepEqual(normalizeRules({ modZ: ['uniequip_fishz_weedy', 'bogus', 'uniequip_fishz_typhon'] }).modZ, ['uniequip_fishz_typhon', 'uniequip_fishz_weedy']);
  assert.ok(ruleSet('modZ', ['uniequip_fishz_weedy']) && !ruleSet('modZ', []));
});

test('withModZ appends to the elite forms only (forms with modules); the players\' lists never show them', () => {
  for (const m of MODZ) {
    assert.ok(hasModZ(m.charId), `${m.charId}: the "Mod Z available" tag`);
    for (const form of Object.values(backups.units[m.charId].forms)) {
      const out = withModZ(m.charId, form);
      if (!form.modules?.length) { assert.equal(out, form); continue; }
      assert.ok(out.modules.some((x) => x.uniEquipId === m.id && x.fishModZ === m.kind));
      assert.ok(!(form.modules ?? []).some((x) => x.fishModZ), 'the data form is untouched');
    }
  }
  const slot = backups.diy.slots[Object.keys(backups.diy.slots).find((id) => backups.diy.slots[id].tier === 6)];
  const elite = unitForm(backups, 'char_2012_typhon', data.chess[slot.goldenId].status);
  assert.ok(elite.modules.length > 0 && !elite.modules.some((x) => x.fishModZ), 'unitForm (the picker) has no Mod Z / W');
});

test('the lobby rule equips the module: every pick of that operator fields it, others keep theirs', () => {
  const slot = Object.keys(backups.diy.slots).find((id) => backups.diy.slots[id].tier === 6);
  const slot2 = Object.keys(backups.diy.slots).filter((id) => backups.diy.slots[id].tier === 6)[1];
  const hel = { charId: 'char_188_helage', skillIndex: 2, uniEquipId: 'uniequip_002_helage' };
  const siege = { charId: 'char_112_siege', skillIndex: 2, uniEquipId: null };
  const picks = { [slot]: hel, [slot2]: siege };
  assert.equal(modZRulePicks(picks, {}, data), picks, 'no rule: unchanged');
  const on = modZRulePicks(picks, { modZ: ['uniequip_fishz_helage', 'uniequip_fishz_siege'] }, data);
  assert.deepEqual(on[slot], { ...hel, uniEquipId: 'uniequip_fishz_helage' }, 'replaces the chosen module');
  assert.deepEqual(on[slot2], { ...siege, uniEquipId: 'uniequip_fishz_siege' }, 'and "no module" too');
  const only = modZRulePicks(picks, { modZ: ['uniequip_fishz_siege'] }, data);
  assert.equal(only[slot], hel, 'an operator without its module on is untouched');
  const stale = modZRulePicks({ [slot]: { ...hel, uniEquipId: 'uniequip_fishz_helage' } }, {}, data)[slot];
  assert.ok(stale.uniEquipId === null || /^uniequip_\d{3}_/.test(stale.uniEquipId), `a stale Mod Z pick falls back: ${stale.uniEquipId}`);
  assert.ok('ok' in checkDiyPick(slot, on[slot], data), 'the equipped pick is legal');
  const rec = diyRecord(slot, on[slot], { elite: true, data });
  assert.equal(rec.module.id, 'uniequip_fishz_helage');
  assert.ok(rec.module.active && rec.bonds.includes('raidShip'), 'Hellagur Z grants Raid');
  assert.ok(!diyRecord(slot, on[slot], { elite: false, data }).bonds.includes('raidShip'), 'only on the elite');
});

test('battle smoke: every Mod Z / W fights 60 s without a handler error', () => {
  const DEFS = { enemies: { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 9000, atk: 300, def: 200, res: 20, speed: 0.4 }) } };
  for (const m of MODZ) {
    const h = makeBattle({ seed: 3, defs: DEFS, autoFinish: false, timeLimit: 60, hooks: [],
      units: [{ diy: { slot: 6, charId: m.charId, skillIndex: 2, uniEquipId: m.id }, elite: true, row: 9, col: 4, dir: 'RIGHT' }],
      enemies: [{ key: 'enemy_walk', time: 1, count: 20, interval: 1.5 }] });
    assert.equal(h.b.allyUnits[0].def.raw.module?.id, m.id);
    h.run(60);
    assert.deepEqual(h.b.errors.map((e) => `${e.label}: ${e.message}`), [], m.id);
  }
});

test('Saileach Z: block 0, Invisible, allied redeploy timers +50 %', () => {
  const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 60, hooks: [],
    units: [{ diy: { slot: 6, charId: 'char_479_sleach', skillIndex: 0, uniEquipId: 'uniequip_fishz_sleach' }, elite: true, row: 9, col: 4, dir: 'RIGHT' },
      { diy: { slot: 6, charId: 'char_293_thorns', skillIndex: 0, uniEquipId: null }, elite: true, row: 9, col: 5, dir: 'RIGHT' }] });
  h.step();
  const [s, t] = h.b.allyUnits.filter((a) => a.kind === 'op');
  assert.equal(s.s.blockCnt, 0);
  assert.equal(s.s.flags.stealth, true);
  h.b.retreat(t);
  const left = t.respawnAt - h.b.time;
  h.run(4);
  assert.ok(Math.abs((t.respawnAt - h.b.time) - (left - 6)) < 0.2, `${t.respawnAt - h.b.time} vs ${left - 6}`);
});

test('in a match: the lobby rule equips Mod Z on a player\'s pick, without it the pick stays as chosen', async () => {
  const { makeMatch } = await import('./match/harness.js');
  const slot = Object.keys(backups.diy.slots).find((id) => backups.diy.slots[id].tier === 6);
  const pick = { charId: 'char_188_helage', skillIndex: 2, uniEquipId: 'uniequip_002_helage' };
  for (const [modZ, want] of [[['uniequip_fishz_helage'], 'uniequip_fishz_helage'], [[], 'uniequip_002_helage']]) {
    const h = makeMatch({ mode: 'solo', seed: 21, lobbyRules: { modZ } }).start();
    h.toPrep(1);
    const p0 = h.ps('p_0');
    assert.equal(p0.setDiy({ [slot]: pick }), true);
    assert.equal(p0.diy[slot].uniEquipId, want);
    const golden = backups.diy.slots[slot].goldenId;
    assert.equal(p0.gd.chess(golden)?.module?.id ?? null, want, 'the elite record carries it');
  }
});

test('Typhon Z balances ATK % and ASPD both ways (ASPD share at most +500); Zuo Le Z doubles buffed ATK', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  let r = typhonBalance({ atk: 1500, aspd: 100, baseAtk: 1000, baseAspd: 100 });   // +50 % ATK → +25 % / +25
  assert.ok(near(r.atk, 1250) && near(r.aspd, 125), JSON.stringify(r));
  r = typhonBalance({ atk: 1000, aspd: 200, baseAtk: 1000, baseAspd: 100 });         // +100 ASPD → +50 % / +50
  assert.ok(near(r.atk, 1500) && near(r.aspd, 150), JSON.stringify(r));
  r = typhonBalance({ atk: 13000, aspd: 100, baseAtk: 1000, baseAspd: 100 });        // +1200 % → ASPD +500, ATK +700 %
  assert.ok(near(r.atk, 8000) && near(r.aspd, 600), JSON.stringify(r));
  r = zuoleDouble({ atk: 1300, aspd: 100, baseAtk: 1000 });
  assert.equal(r.atk, 1600);
  assert.equal(zuoleDouble({ atk: 800, aspd: 100, baseAtk: 1000 }).atk, 800, 'a debuff is not doubled');
});

test('Typhon Z in battle: ATK and ASPD bonuses end up equal', () => {
  const h = makeBattle({ seed: 3, autoFinish: false, timeLimit: 30, hooks: [],
    units: [{ diy: { slot: 6, charId: 'char_2012_typhon', skillIndex: 0, uniEquipId: 'uniequip_fishz_typhon' }, elite: true, row: 9, col: 4, dir: 'RIGHT' }] });
  h.step();
  const u = h.b.allyUnits[0];
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 0.6 } });
  h.run(12);
  const atkPct = (u.s.atk / (u.base.atk * (u.cultMul?.atk ?? 1)) - 1) * 100;
  assert.ok(Math.abs(atkPct - (u.s.aspd - u.base.aspd)) < 0.5, `ATK +${atkPct} %, ASPD +${u.s.aspd - u.base.aspd}`);
  assert.ok(Math.abs(atkPct - 80) < 0.5, `+60 % ATK and +100 ASPD → +80 / +80 (got ${atkPct})`);
});

test('Zuo Le Z: one more skill charge; Viviana Z: the RES shred stays after she falls', () => {
  const DEFS = { enemies: { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 90000, atk: 0, def: 0, res: 20, speed: 0.1 }) } };
  const h = makeBattle({ seed: 3, defs: DEFS, autoFinish: false, timeLimit: 60, hooks: [],
    units: [{ diy: { slot: 6, charId: 'char_4121_zuole', skillIndex: 2, uniEquipId: 'uniequip_fishz_zuole' }, elite: true, row: 9, col: 4, dir: 'RIGHT' },
      { diy: { slot: 6, charId: 'char_4098_vvana', skillIndex: 2, uniEquipId: 'uniequip_fishz_vvana' }, elite: true, row: 9, col: 6, dir: 'RIGHT' }],
    enemies: [{ key: 'enemy_walk', time: 1, count: 3, interval: 1 }] });
  h.step();
  const [z, v] = h.b.allyUnits.filter((a) => a.kind === 'op');
  const base = makeBattle({ seed: 3, autoFinish: false, timeLimit: 5, hooks: [],
    units: [{ diy: { slot: 6, charId: 'char_4121_zuole', skillIndex: 2, uniEquipId: null }, elite: true, row: 9, col: 4, dir: 'RIGHT' }] });
  base.step();
  assert.equal(z.skill.maxCharges, base.b.allyUnits[0].skill.maxCharges + 1);
  h.run(3);
  const e = h.b.aliveEnemies()[0];
  assert.ok(e, 'an enemy on the field');
  h.b.dealElementDamage({ source: v, target: e, element: 'burn', amount: 99999 });
  assert.equal(e.findBuff('fishModZ:vvanaRes')?.mods?.resFlat, -2);
  assert.equal(e.findBuff('fishModZ:vvanaRes')?.mods?.defFlat, -200, 'and DEF -200 (v2)');
  h.b.retreat(v, { dying: true });
  assert.equal(e.findBuff('fishModZ:vvanaRes')?.mods?.resFlat, -2, 'kept after she falls');
  assert.equal(e.findBuff('fishModZ:vvanaRes')?.mods?.defFlat, -200);
  h.run(20);
  assert.deepEqual(h.b.errors.map((x) => `${x.label}: ${x.message}`), []);
});

test('Fiammetta Z: S2 fires one shell per ammo and ends; S3 shells spend ammo (the ammoUsed hook)', () => {
  for (const [skillIndex, ammo] of [[1, 4], [2, 200]]) {
    const h = makeBattle({ seed: 5, autoFinish: false, timeLimit: 60, hooks: [],
      units: [{ diy: { slot: 6, charId: 'char_300_phenxi', skillIndex, uniEquipId: 'uniequip_fishz_phenxi' }, elite: true, row: 9, col: 4, dir: 'RIGHT' },
        { diy: { slot: 5, charId: 'char_416_zumama', skillIndex: 0, uniEquipId: null }, elite: false, row: 9, col: 5, dir: 'RIGHT' }],
      enemies: [{ key: 'enemy_1045_hammer', time: 1, count: 8, interval: 4 }] });
    const u = h.b.allyUnits.find((a) => (a.def.charId ?? a.def.raw?.charId) === 'char_300_phenxi');
    let used = 0;
    h.b.on('ammoUsed', (c) => { if (c.unit === u) used++; });
    h.step();
    u.skill.gainSp(999, 'init', true);
    h.run(12);
    assert.equal(u.skill.kind, 'ammo');
    if (ammo === 3) assert.ok(used === 3 && !u.skill.active, `S2: ${used} shells, active ${u.skill.active}`);
    else assert.ok(used >= 2 && u.skill.ammoLeft === ammo - used, `S3: ${used} used, ${u.skill.ammoLeft} left`);
  }
});

// ---- behaviour of each module (2026-11-17, before main: "any mod Zs that Claude can't confirm to be working as
// intended should be disabled") ---------------------------------------------------------------------------------------

const WALKERS = { enemies: { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 9000, atk: 300, def: 200, res: 20, speed: 0.4 }),
  enemy_weak: enemyRec({ key: 'enemy_weak', hp: 600, atk: 0, def: 0, res: 0, speed: 0.3 }),
  enemy_tank: enemyRec({ key: 'enemy_tank', hp: 900000, atk: 0, def: 0, res: 0, speed: 0.4 }) } };
const op = (charId, uniEquipId, skillIndex = 2, row = 9, col = 4) => ({ diy: { slot: 6, charId, skillIndex, uniEquipId }, elite: true, row, col, dir: 'RIGHT' });
/** A battle with `units`, `enemies`, and recorders of element damage, damage, statuses and SP gains. */
function rig(units, enemies = [], timeLimit = 90, extra = {}) {
  const h = makeBattle({ seed: 3, defs: WALKERS, autoFinish: false, timeLimit, hooks: [], units, enemies, ...extra });
  const rec = { element: [], damage: [], status: [], sp: [] };
  const b = h.b;
  // recorders pass every argument on (the engine's calls have more than the first)
  const de = b.dealElementDamage.bind(b); b.dealElementDamage = (o, ...a) => { rec.element.push(o); return de(o, ...a); };
  const dd = b.dealDamage.bind(b); b.dealDamage = (o, ...a) => { rec.damage.push(o); return dd(o, ...a); };
  const as = b.applyStatus.bind(b); b.applyStatus = (t, s, o, ...a) => { rec.status.push({ t, s, o }); return as(t, s, o, ...a); };
  b.on('spGain', (c) => rec.sp.push({ unit: c.unit, reason: c.reason, amount: c.amount }));
  h.step();
  return { h, b, rec, ops: b.allyUnits.filter((a) => a.kind === 'op') };
}
const noErrors = (b) => assert.deepEqual(b.errors.map((e) => `${e.label}: ${e.message}`), []);

test('Rosa Z: kills of marked enemies during her skill refund 17 SP each when it ends', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_197_poca', 'uniequip_fishz_poca')], [{ key: 'enemy_weak', time: 1, count: 30, interval: 1 }]);
  h.run(90);
  const refunds = rec.sp.filter((s) => s.unit === u && s.reason === 'module');
  assert.ok(refunds.length > 0, 'at least one refund');
  for (const r of refunds) assert.equal(r.amount % 17, 0, `${r.amount} is a multiple of 17`);
  noErrors(b);
});

test('Eunectes Z: 3×3 range, DEF follows her ATK gain, S2 / S3 lure but S1 does not', () => {
  for (const [skillIndex, lures] of [[0, false], [1, true], [2, true]]) {   // her S1 is passive: it never starts
    const { h, b, rec, ops: [u] } = rig([op('char_416_zumama', 'uniequip_fishz_zumama', skillIndex)], [{ key: 'enemy_walk', time: 0.5, count: 12, interval: 1 }]);
    assert.equal(u.rangeGrid.length, 9);
    h.b.addBuff(u, { key: 'test:atk', mods: { atkFlat: 400 } });
    h.run(1);
    assert.equal(u.findBuff('fishModZ:zumama')?.mods?.defFlat, Math.round(u.s.atk - u.base.atk));
    let started = false;
    b.on('skillStart', (c) => { if (c.unit === u) started = true; });
    if (skillIndex === 0) h.run(60); else { h.runUntil(() => started, 80); h.step(); assert.ok(started, `S${skillIndex + 1} started`); }
    assert.equal(rec.status.some((x) => x.s === 'attract' && x.o?.source === u), lures, `S${skillIndex + 1} lure`);
    noErrors(b);
  }
});

test('Hellagur Z: per attack HP +50 (80 at most), per deployment one Waxing, Corrosion of 1 % ATK per Waxing', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_188_helage', 'uniequip_fishz_helage', 0)], [{ key: 'enemy_tank', time: 0, count: 1 }]);
  h.run(30);
  const p = u.persist.fishModZ;
  assert.ok(p.stacks > 0 && p.stacks <= 80, `stacks ${p.stacks}`);
  assert.equal(p.wax, 1, 'the first deployment counts');
  assert.equal(u.findBuff('fishModZ:helage').mods.hpFlat, 50 * p.stacks);
  assert.ok(rec.element.some((x) => x.source === u && x.element === 'erosion'), 'Corrosion with one Waxing');
  noErrors(b);
});

test('Hellagur Z: Waxing\'s ASPD is Tenacity: none at full HP, in full at 70 % HP lost; with his talent the highest counts', () => {
  const { h, b, ops: [u] } = rig([op('char_188_helage', 'uniequip_fishz_helage', 0)]);
  h.run(0.5);
  assert.equal(u.persist.fishModZ.wax, 1);
  assert.ok(!u.findBuff('fishModZ:helage:tenacity'), 'full HP: no Tenacity');
  u.hp = u.s.maxHp * 0.3; h.run(0.2);
  const talent = u.findBuff('talent:helage:berserk')?.data?.v ?? 0;
  assert.ok(talent > 20, `his talent's Tenacity ${talent}`);
  assert.ok(!u.findBuff('fishModZ:helage:tenacity'), 'one Waxing (+20) is below his talent: the highest counts, nothing added');
  u.persist.fishModZ.wax = 10; h.run(0.2);
  const add = u.findBuff('fishModZ:helage:tenacity').mods.aspd, t2 = u.findBuff('talent:helage:berserk').data.v;
  assert.ok(Math.abs(add + t2 - 2 * t2) < 0.5, `10 Waxing: twice his talent's +100 in all, i.e. +200 at 70 % lost (talent ${t2} + ${add})`);
  noErrors(b);
});

test('Phantom Z (v2): Victoria, Raid and Resilient; Raid treats his skill as ready; +3 stacks to his active Alliances per deployment, 10 times', () => {
  const m = modZOf('uniequip_fishz_phatom');
  assert.deepEqual([...m.bonds], ['victoriaShip', 'raidShip', 'indomShip']);
  assert.equal(m.isoFree, true);
  const al = (layers = 0) => ({ count: 3, active: true, tier: 1, layers });
  const bonds = { victoriaShip: al(), raidShip: al(), indomShip: al(), kjeragShip: al() };
  const { b, ops: [u] } = rig([op('char_250_phatom', 'uniequip_fishz_phatom', 0)], [], 20, { bonds, flags: { layerGainsEnabled: true } });
  assert.equal(u.fishRaidReady, true);
  const L = () => b.getPlayer(u.ownerId).bonds;
  assert.equal(L().raidShip.layers, 3, 'the first deployment counts');
  assert.equal(L().kjeragShip.layers, 0, 'only his own Alliances');
  for (let i = 0; i < 14; i++) b.emit('deploy', { unit: u });
  assert.equal(L().raidShip.layers, 30, '10 deployments at most');
  noErrors(b);
});

test('Shining Z (v2): everyone starts Immortal (ready); a lethal hit makes it active for 8 s, and nothing grants a second one', () => {
  const { h, b, ops: [s, t] } = rig([op('char_147_shining', 'uniequip_fishz_shining', 0), op('char_293_thorns', null, 0, 9, 5)]);
  assert.ok(t.findBuff('fishModZ:immortalReady'), 'granted at the start of the battle');
  assert.ok(s.findBuff('fishModZ:immortalReady'), 'she too');
  b.dealDamage({ source: null, target: t, amount: t.hp * 50, type: 'true', calculation: 'precomputed' });
  assert.ok(t.alive && t.hp >= 1, `alive at ${t.hp}`);
  assert.ok(t.findBuff('fishModZ:immortal'), 'active');
  assert.ok(!t.findBuff('fishModZ:immortalReady'), 'ready is used up');
  b.dealDamage({ source: null, target: t, amount: t.hp * 50, type: 'true', calculation: 'precomputed' });
  assert.ok(t.alive, 'a second lethal hit during the 8 s is stopped too');
  noErrors(b);
});

test('Shining Z (v2): she heals an ally at full HP to grant Immortal again, allies without it first', () => {
  const { h, b, ops: [s, t] } = rig([op('char_147_shining', 'uniequip_fishz_shining', 0), op('char_293_thorns', null, 0, 9, 5)]);
  b.removeBuff(t, 'fishModZ:immortalReady');
  assert.ok(t.hp >= t.s.maxHp - 1e-6, 'Thorns is at full HP');
  const order = b.injuredAlliesInKeys(s.rangeKeys, s).map((a) => a.id);
  assert.equal(order[0], t.id, 'the ally without Immortality comes first');
  h.runUntil(() => !!t.findBuff('fishModZ:immortalReady'), 20);
  assert.ok(t.findBuff('fishModZ:immortalReady'), 'granted by a heal to a full-HP ally');
  noErrors(b);
});

test('Siege Z: DP she earns ×2; DP above 90 is drained into SP for her player\'s operators', () => {
  const { h, b, rec, ops: [s, t] } = rig([op('char_112_siege', 'uniequip_fishz_siege', 0), op('char_293_thorns', null, 0, 9, 5)]);
  assert.equal(s.fishDpMul, 2);
  b.addDp(s.ownerId, 99 - b.getPlayer(s.ownerId).dp);
  if (t.skill) t.skill.sp = 0;
  h.run(1);
  assert.ok(b.getPlayer(s.ownerId).dp < 91, `DP ${b.getPlayer(s.ownerId).dp}`);   // whole DP are drained
  assert.ok(rec.sp.some((x) => x.unit === t && x.reason === 'module' && x.amount >= 8), 'Thorns got the drained DP as SP');
  noErrors(b);
});

test('Thorns Z: range +1 (+1 more in his skill), poison 3× as often, 20 % ATK Arts and 5 % ATK Nervous per hit', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_293_thorns', 'uniequip_fishz_thorns', 0)], [{ key: 'enemy_tank', time: 0, count: 1 }]);
  assert.equal(u.fishPoisonTickMul, 3);
  assert.equal(u.findBuff('fishModZ:thorns').mods.rangeExtend, 1);
  h.run(20);
  assert.ok(rec.element.some((x) => x.source === u && x.element === 'neural'), 'Nervous Impairment');
  assert.ok(rec.damage.some((x) => x.source === u && x.type === 'arts'), 'the Arts addition');
  noErrors(b);
});

test('Weedy Z: enemies weigh 2 less while she is on the field; her damage becomes Corrosion outside a burst', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_400_weedy', 'uniequip_fishz_weedy', 0)], [{ key: 'enemy_tank', time: 0, count: 1 }]);
  h.run(40);
  const e = b.aliveEnemies()[0];
  assert.equal(e.findBuff('fishModZ:weedyMass')?.mods?.massFlat, -2);
  assert.ok(rec.element.some((x) => x.source === u && x.element === 'erosion'), 'Corrosion');
  noErrors(b);
});

test('Viviana Z: Glimmering Touch explodes 7 s after it marks an enemy in a Kazimierz operator\'s range', () => {
  const { h, b, rec, ops: [v] } = rig([op('char_4098_vvana', 'uniequip_fishz_vvana', 0)], [{ key: 'enemy_tank', time: 0, count: 1 }]);
  assert.ok(diyRecord(6, { charId: 'char_4098_vvana', skillIndex: 0, uniEquipId: 'uniequip_fishz_vvana' }, { elite: true, data })?.bonds?.includes('kazimierzShip') ?? true);
  const fxs = []; const fx0 = b.fx.bind(b); b.fx = (k, p, ...r) => { fxs.push({ k, p }); return fx0(k, p, ...r); };
  h.run(30);
  const warn = fxs.find((e) => e.p?.skill === 'fishVvana' && e.p.tiles);
  assert.ok(warn, 'the warning names its tiles (GitHub #175)');
  assert.equal(warn.p.tiles.length, 13, 'a diamond of 13 tiles');
  assert.ok(warn.p.tiles.every(([r, c]) => Math.abs(r - warn.p.y) + Math.abs(c - warn.p.x) <= 2), 'every tile within 2 of the centre');
  const hits = rec.damage.filter((x) => x.source === v && x.tags?.includes('fishVvana'));
  assert.ok(hits.length > 0, 'an explosion');
  assert.ok(rec.element.some((x) => x.source === v && x.element === 'burn' && x.tags?.includes('fishVvana')));
  noErrors(b);
});

test('Zuo Le Z (v2): SP from other sources ×2; every hit adds 5 % ATK Burn and 10 % ATK Arts (no Corrosion, whatever the DEF)', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_4121_zuole', 'uniequip_fishz_zuole', 0)], [{ key: 'enemy_walk', time: 0, count: 1 }]);
  u.skill.sp = 0; u.skill.charges = 0;
  const before = u.skill.spTotal;
  u.skill.gainSp(1, 'test');
  assert.equal(u.skill.spTotal - before, 2, 'doubled');
  assert.deepEqual([...modZOf('uniequip_fishz_zuole').bonds], ['swiftShip']);
  h.run(40);   // melee: the walker reaches him at ~25 s
  assert.ok(rec.element.some((x) => x.source === u && x.element === 'burn'), 'Burn on a 200-DEF enemy');
  assert.ok(!rec.element.some((x) => x.source === u && x.element === 'erosion'), 'no Corrosion any more');
  assert.ok(rec.damage.some((x) => x.source === u && x.type === 'arts' && x.tags?.includes('fishZuole')), 'Arts too');
  noErrors(b);
});

test('Typhon W: hits inflict Cold; a hit on a Frozen enemy shatters those within 1 tile (Freeze off, Stun 4 s, +40 % physical taken)', () => {
  const { h, b, rec, ops: [u] } = rig([op('char_2012_typhon', 'uniequip_fishw_typhon', 0)], [{ key: 'enemy_tank', time: 0, count: 1 }]);
  h.runUntil(() => rec.status.some((x) => x.s === 'cold' && x.o?.source === u), 40);
  const cold = rec.status.find((x) => x.s === 'cold' && x.o?.source === u);
  assert.ok(cold && cold.o.duration === 3, 'Cold for 3 s');
  const e = cold.t;
  b.applyStatus(e, 'freeze', { duration: 10, source: null });
  assert.ok(e.findBuff('freeze'), 'frozen');
  h.runUntil(() => !!e.findBuff('fishModZ:shatter'), 20);
  assert.ok(!e.findBuff('freeze'), 'Freeze removed');
  assert.equal(e.findBuff('fishModZ:shatter').mods.physTakenMul, 1.4);
  assert.ok(rec.status.some((x) => x.t === e && x.s === 'stun' && x.o?.duration === 4), 'Stun 4 s');
  noErrors(b);
});

test('Siege Z and Saileach Z: the DP they generate counts twice (addDp with them as the source)', () => {
  for (const [charId, mod] of [['char_112_siege', 'uniequip_fishz_siege'], ['char_479_sleach', 'uniequip_fishz_sleach']]) {
    const { b, ops: [u] } = rig([op(charId, mod, 0)]);
    const pid = u.ownerId;
    b.addDp(pid, -b.getPlayer(pid).dp);
    b.addDp(pid, 5, u);
    assert.equal(b.getPlayer(pid).dp, 10, charId);
    b.addDp(pid, 5);
    assert.equal(b.getPlayer(pid).dp, 15, `${charId}: other DP is not doubled`);
  }
});

test('Siege Z: while she is up her player can hold more than 99 DP, so gains between drains are not wasted (#176)', () => {
  const { h, b, ops: [s] } = rig([op('char_112_siege', 'uniequip_fishz_siege', 0)]);
  const ps = b.getPlayer(s.ownerId);
  h.run(0.6);
  assert.equal(ps.fishDpMax, 999);
  b.addDp(s.ownerId, 200 - ps.dp);
  assert.ok(ps.dp > 120, `DP ${ps.dp} kept past 99 until the next drain`);
  h.run(1);   // the next drain takes the excess over 90 (her own skill then earns some back from the SP: her DP gain is doubled)
  assert.ok(ps.dp < 140, `drained from 200 to ${ps.dp}`);
  noErrors(b);
});

test('Typhon Z and Thorns Z (v2): the first time the skill ends in a battle they are at max SP at once; only that time', () => {
  for (const [charId, id] of [['char_2012_typhon', 'uniequip_fishz_typhon'], ['char_293_thorns', 'uniequip_fishz_thorns']]) {
    const { h, b, ops: [u] } = rig([op(charId, id, 1)], [{ key: 'enemy_weak', time: 1, count: 80, interval: 1 }], 200);
    const ends = [];
    b.on('skillEnd', (c) => { if (c.unit === u) ends.push({ sp: u.skill.sp, cost: u.skill.spCost }); }, { priority: -100 });
    u.skill.sp = u.skill.spCost;
    h.runUntil(() => ends.length >= 2, 160);
    assert.ok(ends.length >= 1, `${charId}: the skill ended`);
    assert.ok(ends[0].sp >= ends[0].cost - 1e-6, `${charId}: max SP right after the first end (${ends[0].sp} / ${ends[0].cost})`);
    if (ends.length >= 2) assert.ok(ends[1].sp < ends[1].cost - 1e-6, `${charId}: not again at the second end`);
    noErrors(b);
  }
});

test('Eunectes Z (v2): each enemy that dies in her range gives +3 stacks to her active Alliances, 20 times at most', () => {
  const al = () => ({ count: 3, active: true, tier: 1, layers: 0 });
  const bonds = { steadShip: al(), kjeragShip: al() };
  const { h, b, ops: [u] } = rig([op('char_416_zumama', 'uniequip_fishz_zumama', 0, 9, 5)], [{ key: 'enemy_weak', time: 1, count: 60, interval: 0.5 }], 80, { bonds, flags: { layerGainsEnabled: true } });
  assert.deepEqual([...modZOf('uniequip_fishz_zumama').bonds], ['steadShip']);
  h.run(70);
  const L = b.getPlayer(u.ownerId).bonds;
  assert.ok(L.steadShip.layers > 0 && L.steadShip.layers % 3 === 0, `Durable ${L.steadShip.layers}`);
  assert.ok(L.steadShip.layers <= 60, 'at most 20 x 3');
  assert.equal(L.kjeragShip.layers, 0, 'only her own Alliances');
  noErrors(b);
});

test('Siege W: DP above 90 becomes Marvel stacks, 3 DP each, at most 50 a round; DP limit 999 while she is up', () => {
  const bonds = { miraShip: { count: 3, active: true, tier: 1, layers: 0 } };
  const { h, b, ops: [s] } = rig([op('char_112_siege', 'uniequip_fishw_siege', 0)], [], 30, { bonds, flags: { layerGainsEnabled: true } });
  assert.equal(modZOf('uniequip_fishw_siege').kind, 'W');
  const ps = b.getPlayer(s.ownerId);
  h.run(0.6);
  assert.equal(ps.fishDpMax, 999);
  b.addDp(s.ownerId, 400 - ps.dp);
  h.run(0.6);
  assert.equal(ps.bonds.miraShip.layers, 50 - 50 + Math.min(50, ps.bonds.miraShip.layers), 'sanity');
  assert.ok(ps.bonds.miraShip.layers > 0 && ps.bonds.miraShip.layers <= 50, `Marvel ${ps.bonds.miraShip.layers}`);
  h.run(10);
  assert.equal(ps.bonds.miraShip.layers, 50, 'the 50-stack cap per round');
  noErrors(b);
});

test('Saileach W: after each cast, if [Aid] is active every active Alliance gains +2 stacks, +4 with 3 or more different [Aid] Operators', () => {
  const al = () => ({ count: 3, active: true, tier: 1, layers: 0 });
  const bonds = { deputShip: al(), kjeragShip: al(), yanShip: al() };
  const { b, ops: [s] } = rig([op('char_479_sleach', 'uniequip_fishw_sleach', 0)], [], 20, { bonds, flags: { layerGainsEnabled: true } });
  assert.deepEqual([...modZOf('uniequip_fishw_sleach').bonds], ['deputShip']);
  const L = () => b.getPlayer(s.ownerId).bonds;
  b.emit('skillStart', { unit: s, skill: s.skill });
  assert.deepEqual([L().deputShip.layers, L().kjeragShip.layers, L().yanShip.layers], [2, 2, 2], 'one Aid Operator: +2');
  noErrors(b);
  // three different Aid Operators on the field: +4
  const defs = { ...WALKERS, chess: { aid_a: chessRec({ id: 'aid_a', bonds: ['deputShip'] }), aid_b: chessRec({ id: 'aid_b', bonds: ['deputShip'] }) } };
  const x = rig([op('char_479_sleach', 'uniequip_fishw_sleach', 0), { chessId: 'aid_a', row: 10, col: 5, dir: 'RIGHT' }, { chessId: 'aid_b', row: 11, col: 5, dir: 'RIGHT' }], [], 20, { defs, bonds: { ...bonds, deputShip: al() }, flags: { layerGainsEnabled: true } });
  const s2 = x.ops.find((o) => o.def?.raw?.module?.id === 'uniequip_fishw_sleach');
  x.b.emit('skillStart', { unit: s2, skill: s2.skill });
  assert.equal(x.b.getPlayer(s2.ownerId).bonds.kjeragShip.layers, 4, 'three Aid Operators: +4');
  noErrors(x.b);
});

test('Fiammetta Z (v2): 24 / 4 / 200 ammo, ASPD +100 in a skill, a reload when an adjacent Laterano Operator finishes a skill', () => {
  for (const [si, ammo] of [[0, 24], [1, 4], [2, 200]]) {
    const { ops: [f] } = rig([op('char_300_phenxi', 'uniequip_fishz_phenxi', si)]);
    assert.equal(f.skill.ammo, ammo, `S${si + 1}`);
  }
  const defs = { ...WALKERS, chess: { lat_n: chessRec({ id: 'lat_n', bonds: ['lateranoShip'] }) } };
  const at = (col) => rig([op('char_300_phenxi', 'uniequip_fishz_phenxi', 0, 9, 4), { chessId: 'lat_n', row: 9, col, dir: 'RIGHT' }], [{ key: 'enemy_tank', time: 1, count: 1 }], 60, { defs });
  const near = at(5);
  const [f, n] = near.ops.sort((x, y) => (x.def?.id === 'lat_n') - (y.def?.id === 'lat_n'));
  near.h.runUntil(() => f.skill.active, 40);
  assert.ok(f.skill.active, 'her skill is active');
  assert.ok(f.s.aspd >= f.base.aspd + 99, `ASPD +100 (${f.s.aspd} / ${f.base.aspd})`);
  f.skill.ammoLeft = 3;
  near.b.emit('skillEnd', { unit: n, skill: n.skill });
  assert.equal(f.skill.ammoLeft, f.skill.ammo, 'adjacent (4 tiles) Laterano Operator: reloaded to max');
  const far = at(6);
  const [f2, n2] = far.ops.sort((x, y) => (x.def?.id === 'lat_n') - (y.def?.id === 'lat_n'));
  far.h.runUntil(() => f2.skill.active, 40);
  f2.skill.ammoLeft = 3;
  far.b.emit('skillEnd', { unit: n2, skill: n2.skill });
  assert.equal(f2.skill.ammoLeft, 3, 'two tiles away: no reload');
  noErrors(near.b);
});

test('Fiammetta Z (v2): the Laterano ATK effect (+4 % per ammo, up to +200 %) is x2 for every member while she is on the field, x3 at 500+ stacks', () => {
  const lat = (extra = {}) => chessRec({ id: 'lat', bonds: ['lateranoShip'], stats: { atk: 1000, maxHp: 99999 }, ...extra });
  const defs = { ...WALKERS, chess: { lat_a: lat({ id: 'lat_a' }), lat_b: lat({ id: 'lat_b' }), lat_c: lat({ id: 'lat_c' }), lat_d: lat({ id: 'lat_d' }), lat_e: lat({ id: 'lat_e' }) } };
  const run = (withFia, layers) => {
    const units = [{ chessId: 'lat_a', row: 10, col: 4, dir: 'RIGHT' }, { chessId: 'lat_b', row: 11, col: 4, dir: 'RIGHT' }, { chessId: 'lat_c', row: 10, col: 6, dir: 'RIGHT' }, { chessId: 'lat_d', row: 11, col: 6, dir: 'RIGHT' }, { chessId: 'lat_e', row: 9, col: 6, dir: 'RIGHT' },
      op('char_300_phenxi', withFia ? 'uniequip_fishz_phenxi' : null, 0, 9, 8)];
    const x = rig(units, [], 20, { defs, bonds: { lateranoShip: { count: 6, active: true, tier: 2, layers } }, flags: { layerGainsEnabled: true } });
    const a = x.ops.find((o) => o.defId === 'lat_a' || o.def?.id === 'lat_a');
    const base = a.s.atk;
    for (let i = 0; i < 20; i++) x.b.emit('ammoUsed', { unit: a, left: 1, skill: a.skill });
    x.b.step?.();
    x.h.run(0.2);
    return { gain: a.s.atk / base - 1, x };
  };
  const plain = run(false, 0), fia = run(true, 0), big = run(true, 600);
  assert.ok(plain.gain > 0.5, `the base effect works in this rig (+${(plain.gain * 100).toFixed(0)} %)`);
  assert.ok(Math.abs(fia.gain / plain.gain - 2) < 0.05, `x2 with her: ${fia.gain} vs ${plain.gain}`);
  assert.ok(Math.abs(big.gain / plain.gain - 3) < 0.05, `x3 at 500+ stacks: ${big.gain} vs ${plain.gain}`);
  noErrors(fia.x.b);
});

test('Weedy W: SP requirement -30 %; each cast gives enemies on the field a Slippery stack (5 at most, weight -1 each); true damage only at a red box', () => {
  const base = rig([op('char_400_weedy', null, 2)], [{ key: 'enemy_tank', time: 0, count: 1 }], 20);
  const { h, b, rec, ops: [u] } = rig([op('char_400_weedy', 'uniequip_fishw_weedy', 2)], [{ key: 'enemy_tank', time: 0, count: 1 }], 60);
  assert.deepEqual([...modZOf('uniequip_fishw_weedy').bonds], ['swiftShip']);
  assert.equal(u.skill.spCost, Math.floor(base.ops[0].skill.baseSpCost * 0.7), 'SP requirement -30 %');
  const e = b.aliveEnemies()[0];
  assert.ok(e, 'an enemy on the field');
  const start = b.routes[0].start;
  const slip = () => rec.damage.filter((x) => Array.isArray(x.tags) && x.tags.includes('fishSlippery'));
  for (let i = 0; i < 7; i++) b.emit('skillStart', { unit: u, skill: u.skill });
  assert.equal(e.findBuff('fishModZ:slippery').data.k, 5, '5 stacks at most');
  assert.equal(e.findBuff('fishModZ:slippery').mods.massFlat, -5, 'weight -1 per stack');
  h.run(1);
  assert.ok(slip().length >= 1 && slip().every((x) => x.type === 'true' && x.amount === 16000), `16000 true damage while it stands on its spawn (${slip().map((x) => x.amount)})`);
  h.run(25);   // it has walked away from every red box (0.2 tiles per second here)
  const n = slip().length;
  h.run(3);
  assert.equal(slip().length, n, 'no more true damage away from every red box');
  noErrors(b);
});

test('Typhon W (v2): the first 30 fallen enemies come back once on their own route: +100 % HP, -70 % ATK, no LP, not passed on, no bounty', () => {
  const { h, b, ops: [u] } = rig([op('char_2012_typhon', 'uniequip_fishw_typhon', 0)], [{ key: 'enemy_weak', time: 1, count: 50, interval: 0.4 }], 80);
  h.run(60);
  const back = b.enemies.filter((e) => e.fishRevived);
  assert.ok(back.length > 0 && back.length <= 30, `revived ${back.length}`);
  const e = back[0];
  assert.equal(e.base.maxHp, 2 * 600, '+100 % max HP');
  assert.ok(Math.abs(e.base.atk - 0) < 1e-9, '-70 % of an ATK 0 enemy is 0');
  assert.equal(e.counted, false, 'counts for nothing (no LP when it leaks)');
  assert.equal(e.uniteRuntime, true, 'not passed on to the unite phase');
  assert.equal(e.lpr, 0);
  assert.equal(e.bounty ?? null, null, 'no bounty');
  assert.equal(b.enemies.filter((x) => x.fishRevived && x.defId !== 'enemy_weak').length, 0, 'the same kind of enemy');
  noErrors(b);
});
