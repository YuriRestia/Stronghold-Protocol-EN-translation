// Player report D1 (community, after 0.1.0): "干员信仰搅拌机原版装备源石溶剂的装备带来的自动扣血会触发3技能的释放，这样配合
// 莫斯提马能自动叠层". Official (PRTS 卫戍协议：盟约 下半/PRTS盟约记录, 源石溶剂): the item's "每秒流失60点生命值" is corrected to
// "受到60真实伤害" (修正 原因 6, "并非流失"), 备注 "造成无来源真实持续环境伤害" — a damage instance, not a 生命流失 (PRTS
// 作战机制: a 流失 skips every damage event — 反伤, 受击回复 …). So the drain is a "受到伤害" for the 重装 技能策略 (PRTS
// 卫戍协议/帮助 "受到伤害时释放技能"), and 信仰搅拌机 S3's counter (PRTS 备注 "反击受到任何伤害后均可触发，无需目标，视为普通
// 攻击") fires on every drain tick, spending a bullet even with no enemy in range — next to 莫斯提马 (特质 "自身周围4格的干员
// 每消耗6发弹药，使已激活的【拉特兰】层数+1/+2") that is 拉特兰 layers with no enemy involved.
// The same `periodic_damage` template drives 狂暴宿主组长 (PRTS "自身每秒受到500无来源真实伤害"), and 孽罪奇美拉's pollution aura
// on operators is "受到…真实持续伤害" (PRTS) — both damage too. Operator 生命流失 (华法琳, 史尔特尔, 号角 …) stays a 流失.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { makeMatch, give, giveItem, DATA } from '../match/harness.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { spawnYanyou } from '../../server/sim/content/tokens.js';

const ds = getDefaultSource();
const SOLVENT = 'chess_item_1_05_e_a', SOLVENT_B = 'chess_item_1_05_e_b';
const MIXER = 'chess_char_4_01_a', MOSTIMA = 'chess_char_4_02_a', INSIDE = 'chess_char_1_01_a', YAK = 'chess_char_1_02_a';
const gold = (id) => id.replace(/_a$/, '_b');
const DRAIN = DATA.items[SOLVENT].params.damage; // 60
const isMixer = (u) => !!u && u.defId.startsWith('chess_char_4_01_');
const approx = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg} ${a} ≈ ${b}`);
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e8, atk: 0, speed: 0, ...o });
const hpLoss = (c) => !!(c.dmg && (c.dmg.tags || []).includes('hpLoss'));

/**
 * The real match path: a solo NORMAL match at PREP R3, 信仰搅拌机 (default S3) carrying 源石溶剂 with 莫斯提马 on the tile
 * above (her 周围4格) and 隐现 as the third 拉特兰 (3 distinct ⇒ 拉特兰 active), the BattleSpec of that board
 * (Match._normalOpts → buildBattleSpec → createBattleFromSpec — what the server and the browser run). `noEnemies`: the
 * wave's spawns are dropped and the field runs to its time limit, so whatever happens comes from the drain alone.
 */
function realBattle({ elite = false, noEnemies = false, item = SOLVENT } = {}) {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 5 }).start();
  const m = h.m;
  h.toPrep(3);
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values()]) ps.returnCopies(p);
  ps.board.clear();
  const mixId = elite ? gold(MIXER) : MIXER, mosId = elite ? gold(MOSTIMA) : MOSTIMA;
  const mix = give(m, ps, mixId, 'board', [9, 4]);
  give(m, ps, mosId, 'board', [10, 4]);
  give(m, ps, INSIDE, 'board', [11, 4]);
  const it = giveItem(m, ps, item);
  assert.deepEqual(ps.equip(it.uid, mix.uid), { ok: true });
  ps.recompute();
  const spec = buildBattleSpec(m._normalOpts(ps));
  assert.ok(spec.players[0].units.find((u) => u.chessId === mixId).items.includes(item), 'the BattleSpec carries the item');
  if (noEnemies) { spec.spawns = []; spec.timeLimit = 150; }
  const b = createBattleFromSpec(spec, m.ds);
  if (noEnemies) b.autoFinish = false;
  const rec = { casts: [], ammo: [], enemyHits: [], layers: [], counters: 0 };
  b.on('skillStart', ({ unit, reason }) => { if (isMixer(unit)) rec.casts.push({ t: b.time, reason, enemies: b.enemies.filter((e) => e.alive).length }); });
  b.on('ammoUsed', ({ unit }) => { if (isMixer(unit)) rec.ammo.push({ t: b.time, enemies: b.enemies.filter((e) => e.alive).length }); });
  b.on('damaged', (c) => { if (isMixer(c.target) && c.source && c.source.side === 'enemy') rec.enemyHits.push(b.time); });
  b.on('layerGain', (c) => { if (c.bondId === 'lateranoShip') rec.layers.push({ t: b.time, n: c.n }); });
  return { h, m, ps, b, rec, mixId, mosId };
}

test('D1 real path, drain alone: 信仰搅拌机 S3 fires on a 源石溶剂 tick (重装 "受到伤害时") and spends its bullets on target-less counters; 莫斯提马 turns them into 拉特兰 layers', () => {
  for (const elite of [false, true]) {
    const { m, b, rec, mixId, mosId } = realBattle({ elite, noEnemies: true });
    const u = b.allyUnits.find(isMixer);
    const sk = ds.getChess(mixId).skill;
    assert.equal(sk.id, 'skchr_rmixer_3', 'S3 is her default loadout');
    const res = b.runToEnd(400);
    assert.equal(b.errorCount, 0, JSON.stringify(b.errors));
    assert.equal(b.enemies.length, 0, 'no enemy ever entered the field');
    // the cast: the first drain tick once the SP (initSp → spCost at 1/s) is full — not "never" (v0.1.0: the 流失 skipped
    // the 重装 trigger, she drained to death with a full SP bar)
    assert.ok(rec.casts.length >= 1, `${mixId}: S3 cast from the drain alone`);
    const first = rec.casts[0];
    assert.equal(first.reason, 'TAKE_DAMAGE');
    const ready = sk.spCost - sk.initSp;
    assert.ok(first.t >= ready - 1e-6 && first.t <= ready + 1 + 1e-6, `${mixId}: cast at the first tick after ${ready} s (${first.t})`);
    // counters with nobody in range: one bullet per drain tick, every one with no enemy on the field
    assert.ok(rec.ammo.length >= 6, `${mixId}: bullets spent (${rec.ammo.length})`);
    assert.ok(rec.ammo.every((a) => a.enemies === 0));
    const gaps = rec.ammo.slice(1).map((a, i) => a.t - rec.ammo[i].t);
    assert.ok(gaps.every((g) => g > 1 - 1e-6), `${mixId}: at most one counter per drain tick`);
    // 莫斯提马's 特质 (garrison_22): +bond_add_count 拉特兰 per 6 bullets of the operators on her 4 tiles
    const gar = DATA.garrisons[DATA.chess[mosId].garrisonIds[0]].bb;
    const expected = Math.floor(rec.ammo.length / gar.consume_count) * gar.bond_add_count;
    assert.ok(expected >= gar.bond_add_count);
    assert.equal(res.perPlayer.p_0.layerGains.lateranoShip, expected, `${mixId}: ${rec.ammo.length} bullets → ${expected} layers`);
    assert.ok(u.stats.attacks >= rec.ammo.length, 'each counter counts as an attack (视为普通攻击)');
    checkInvariants(b);
    m.dispose?.();
  }
});

test('D1 real path, the round-3 wave: the drain casts S3 before any enemy touched her; the counters and 莫斯提马 add 拉特兰 layers', () => {
  const { m, b, rec } = realBattle();
  const res = b.runToEnd(400);
  assert.equal(b.errorCount, 0, JSON.stringify(b.errors));
  assert.ok(rec.casts.length >= 1, 'S3 cast');
  const firstHit = rec.enemyHits.length ? rec.enemyHits[0] : Infinity;
  assert.ok(rec.casts[0].t < firstHit, `the first cast (${rec.casts[0].t}) came before any enemy hit her (${firstHit})`);
  assert.equal(rec.casts[0].reason, 'TAKE_DAMAGE');
  assert.ok(rec.ammo.length >= 6, `bullets spent (${rec.ammo.length})`);
  assert.ok((res.perPlayer.p_0.layerGains.lateranoShip ?? 0) >= 1, JSON.stringify(res.perPlayer.p_0.layerGains));
  m.dispose?.();
});

test('源石溶剂 drain = 无来源 true damage each second (not 流失): hooks see no source, the carrier keeps the credit; shields absorb it, 脆弱 scales it', () => {
  for (const item of [SOLVENT, SOLVENT_B]) {
    const h = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, items: [item], skillIndex: 1 }], timeLimit: 60, hooks: ['hit', 'damaged', 'kill'], captureNoisy: true });
    h.step();
    const u = h.unit(YAK);
    u.skill.sp = 0; // keep 角峰's own skill out of the way
    const hp0 = u.hp;
    h.run(1.02);
    const ticks = h.hooksOf('damaged').filter((c) => c.target === u);
    assert.equal(ticks.length, 1, `${item}: one tick per second`);
    const c = ticks[0];
    assert.equal(c.source, null, 'no source (无来源)');
    assert.equal(c.credit, u, 'the carrier keeps the credit');
    assert.equal(c.type, 'true');
    assert.ok(!hpLoss(c), 'a damage instance, not a 流失');
    assert.ok(h.hooksOf('hit').some((x) => x.target === u && x.source === null), "the 'hit' hook runs (伤判 effects apply)");
    approx(hp0 - u.hp, DRAIN, 1e-9, `${item}: −${DRAIN}`);
    // a shield takes the tick
    h.b.addBuff(u, { key: 'test:shield', shield: 1000 });
    const hp1 = u.hp;
    h.run(1);
    approx(u.hp, hp1, 1e-9, 'absorbed by the shield');
    approx(u.findBuff('test:shield').shield, 1000 - DRAIN, 1e-9);
    h.b.removeBuff(u, 'test:shield');
    // 脆弱 (受到的物理、法术、真实伤害提升) scales it
    h.b.applyStatus(u, 'fragile', { duration: 30, value: 0.5 });
    const hp2 = u.hp;
    h.run(1);
    approx(hp2 - u.hp, DRAIN * 1.5, 1e-9, 'fragile ×1.5');
    // lethal: the carrier's own kill (credit untouched)
    u.hp = 10;
    h.run(1);
    assert.ok(!u.alive);
    const k = h.hooksOf('kill').find((x) => x.victim === u);
    assert.ok(k && k.killer === u, 'killed by the drain: credited to the carrier');
    checkInvariants(h.b);
  }
});

test('the drain feeds 受击回复 SP and the 重装 TAKE_DAMAGE trigger with no enemy around; a 流失 (Battle.loseHp) feeds neither', () => {
  // 信仰搅拌机 S1 铳骑主考官: 受击回复 (+1 per hit taken)
  const h = makeBattle({ units: [{ chessId: MIXER, row: 10, col: 4, items: [SOLVENT], skillIndex: 0 }], timeLimit: 60, hooks: ['spGain'], captureNoisy: true });
  h.step();
  const u = h.unit(MIXER);
  assert.equal(u.skill.spType, 'hurt');
  const sp0 = u.skill.sp;
  h.run(3.02);
  approx(u.skill.sp - sp0, 3, 1e-9, 'three drain ticks → +3 SP');
  h.b.loseHp(u, 50);
  approx(u.skill.sp - sp0, 3, 1e-9, 'a 流失 gives no 受击回复 SP');
  // 角峰 S1 (MANUAL, 重装 ⇒ TAKE_DAMAGE): ready, no enemy — the drain casts it; a 流失 does not
  for (const drain of [true, false]) {
    const g = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, items: drain ? [SOLVENT] : [], skillIndex: 0 }], timeLimit: 60, hooks: ['skillStart'] });
    g.step();
    const y = g.unit(YAK);
    assert.equal(y.skill.rule, 'TAKE_DAMAGE');
    y.skill.gainSp(1000);
    if (!drain) g.b.every(1, () => { if (y.alive) g.b.loseHp(y, DRAIN); });
    g.run(1.5);
    const cast = g.hooksOf('skillStart').filter((c) => c.unit === y);
    if (drain) assert.equal(cast.length && cast[0].reason, 'TAKE_DAMAGE', 'the drain is a 受到伤害');
    else assert.equal(cast.length, 0, '生命流失 skips the 重装 trigger');
  }
});

test('信仰搅拌机 S3 counter: any damage (an attack, a sourceless zone tick) counters, with no target it still spends a bullet; 流失, element 损伤, stun and the min interval do not', () => {
  for (const id of [MIXER, gold(MIXER)]) {
    const bb = ds.getChess(id).skill.bb;
    const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 4 }], timeLimit: 120, hooks: ['ammoUsed', 'attack', 'damaged'], captureNoisy: true });
    h.step();
    const u = h.unit(id);
    assert.ok(u.skill.activate('test', { free: true }));
    const left0 = u.skill.ammoLeft;
    const used = () => h.hooksOf('ammoUsed').filter((c) => c.unit === u).length;
    const zone = (amount = 10) => h.b.dealDamage(null, u, { amount, type: 'true', canDodge: false, tags: ['zone'] });
    // no enemy anywhere: a sourceless tick still counters (无需目标) — one bullet, no attack hook
    zone();
    assert.equal(used(), 1, `${id}: target-less counter spends a bullet`);
    assert.equal(u.skill.ammoLeft, left0 - 1);
    // within the min interval (actual interval × ratio): nothing
    zone();
    assert.equal(used(), 1, 'min interval');
    const gap = u.s.interval * bb.base_attack_time;
    h.run(gap + 0.05);
    // 流失 and element 损伤 never counter
    h.b.loseHp(u, 10);
    h.b.dealDamage(null, u, { amount: 10, type: 'element', element: 'burn' });
    assert.equal(used(), 1, '流失 / element 损伤: no counter');
    // stunned: no counter
    h.b.applyStatus(u, 'stun', { duration: 0.5 });
    zone();
    assert.equal(used(), 1, 'stunned: no counter');
    h.run(0.6);
    // with an enemy in range: the counter hits it (a real attack) and spends a bullet
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.step();
    zone();
    assert.equal(used(), 2);
    h.run(0.5); // (her shot is a projectile)
    const atk = h.hooksOf('attack').filter((c) => c.attacker === u);
    assert.equal(atk.length, 1, 'one counter attack');
    assert.deepEqual(atk[0].targets, [e]);
    assert.ok(h.hooksOf('damaged').some((c) => c.source === u && c.target === e && c.dmg.isAttack), 'the counter hit the enemy');
    assert.equal(h.b.errorCount, 0, JSON.stringify(h.b.errors));
    checkInvariants(h.b);
  }
});

test('狂暴宿主组长 (periodic_damage, PRTS "自身每秒受到500无来源真实伤害"): sourceless true damage per second, scaled by 脆弱', () => {
  const key = 'enemy_1062_rager_2';
  const h = makeBattle({ units: [], timeLimit: 60, hooks: ['damaged'], captureNoisy: true, autoFinish: false });
  h.step();
  const e = h.spawn(key, { pos: [10, 8] });
  h.b.applyStatus(e, 'stun', { duration: 30 });
  h.run(2.05);
  const ticks = h.hooksOf('damaged').filter((c) => c.target === e);
  assert.ok(ticks.length >= 2, `ticks ${ticks.length}`);
  for (const c of ticks) { assert.equal(c.source, null); assert.equal(c.type, 'true'); assert.ok(!hpLoss(c), 'damage, not 流失'); }
  const per = ticks[0].amount;
  assert.ok(per > 0);
  h.b.applyStatus(e, 'fragile', { duration: 30, value: 0.3 });
  const n = ticks.length;
  h.run(1);
  const t2 = h.hooksOf('damaged').filter((c) => c.target === e).slice(n);
  assert.ok(t2.length >= 1);
  approx(t2[0].amount, per * 1.3, 1e-9, '脆弱 scales it');
});

test('孽罪奇美拉 pollution aura on operators is 真实持续伤害 (not 流失): 受击回复 SP and the 重装 trigger respond to it', () => {
  // act1 m04: the chimera switches to 污染模式 on its infection tiles (10,6) / (11,6); stunned, it never attacks
  const h = makeBattle({
    stageId: 'act1autochess_m04', units: [{ chessId: YAK, row: 10, col: 5, skillIndex: 0 }, { chessId: MIXER, row: 10, col: 7, skillIndex: 0 }],
    timeLimit: 60, hooks: ['damaged', 'skillStart'], captureNoisy: true, autoFinish: false,
  });
  h.step();
  const y = h.unit(YAK), mx = h.unit(MIXER);
  const e = h.spawn('enemy_1425_lrcmra', { pos: [10, 6] });
  h.b.applyStatus(e, 'stun', { duration: 60 });
  y.skill.gainSp(1000);
  const sp0 = mx.skill.sp;
  h.run(3);
  const aura = h.hooksOf('damaged').filter((c) => c.target === y && c.credit === e);
  assert.ok(aura.length >= 1, 'aura ticks on 角峰');
  for (const c of aura) { assert.equal(c.type, 'true'); assert.ok(!hpLoss(c), 'damage, not 流失'); }
  assert.ok(h.hooksOf('skillStart').some((c) => c.unit === y && c.reason === 'TAKE_DAMAGE'), '角峰 S1 cast from the aura');
  assert.ok(mx.skill.sp > sp0, '受击回复 SP from the aura');
  assert.equal(h.b.errorCount, 0, JSON.stringify(h.b.errors));
});

test('audit — 雷蛇 战术防御 (PRTS "仅伤害量不为0且能够触发受击回复的伤害"): the drain gives him and a neighbour SP; a 流失 or a shielded tick does not', () => {
  const LISKAM = 'chess_char_1_20_a';
  const h = makeBattle({ units: [{ chessId: LISKAM, row: 10, col: 4, items: [SOLVENT] }, { chessId: YAK, row: 10, col: 5, skillIndex: 1 }], timeLimit: 60, hooks: ['spGain'], captureNoisy: true });
  h.step();
  const u = h.unit(LISKAM), y = h.unit(YAK);
  const gains = (who, reason) => h.hooksOf('spGain').filter((c) => c.unit === who && c.reason === reason).reduce((s, c) => s + c.amount, 0);
  const tsp = ds.getChess(LISKAM).talents[0].bb.sp;
  h.run(2.02);
  approx(gains(u, 'hurt'), 2, 1e-9, 'two ticks: 受击回复');
  approx(gains(u, 'talent'), 2 * tsp, 1e-9, 'two ticks: 战术防御 on himself');
  approx(gains(y, 'talent'), 2 * tsp, 1e-9, 'the neighbour (the only one on his 4 tiles) +1 per tick');
  h.b.loseHp(u, 10);
  approx(gains(u, 'talent') + gains(u, 'hurt'), 2 + 2 * tsp, 1e-9, 'a 流失: nothing');
  h.b.addBuff(u, { key: 'test:shield', shield: 1000 });
  h.run(1);
  approx(gains(u, 'hurt'), 3, 1e-9, 'a tick the shield took still gives 受击回复');
  approx(gains(u, 'talent'), 2 * tsp, 1e-9, '…but no 战术防御 ("伤害量不为0")');
});

test('audit — 蒂比 紧急赶场通知 (PRTS 修正 "受到伤害前触发"): a drain tick sets the skill off; a true-damage tick is not dodged', () => {
  const TIPPI = 'chess_char_2_13_a';
  const h = makeBattle({ units: [{ chessId: TIPPI, row: 10, col: 4, items: [SOLVENT] }], timeLimit: 60, hooks: ['skillStart'] });
  h.step();
  const u = h.unit(TIPPI);
  u.skill.gainSp(1000);
  h.run(1.02);
  const c = h.hooksOf('skillStart').filter((x) => x.unit === u);
  assert.equal(c.length, 1, 'the drain tick popped S2');
  assert.equal(c[0].reason, 'TAKE_DAMAGE');
  approx(u.s.maxHp - u.hp, DRAIN, 1e-9, 'a true-damage tick is not dodged (物理或法术 only)');
});

test('audit — "受到伤害时" content counts the drain and never a 流失: 乌尔比安 本性的坚守, 伪装服, 远牙 未受伤害, 坚守 thorn chances', () => {
  const ULPIAN = 'chess_char_5_05_a', FARTOOTH = 'chess_char_4_20_a', DISGUISE = 'chess_item_4_04_e_a';
  // 乌尔比安: heals on each drain tick, not on a 流失
  {
    const h = makeBattle({ units: [{ chessId: ULPIAN, row: 10, col: 4 }], timeLimit: 60, hooks: ['heal'], captureNoisy: true });
    h.step();
    const u = h.unit(ULPIAN);
    u.hp = u.s.maxHp * 0.9;
    h.b.loseHp(u, 100);
    assert.equal(h.hooksOf('heal').filter((c) => c.target === u).length, 0, 'a 流失 is not 受到伤害');
    h.b.dealDamage(null, u, { amount: 100, type: 'true', canDodge: false });
    assert.equal(h.hooksOf('heal').filter((c) => c.target === u).length, 1, 'real damage heals');
  }
  // 伪装服: a 流失 does not use it up; the first drain tick does
  {
    const h = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, skillIndex: 1, items: [DISGUISE] }], timeLimit: 60, hooks: [] });
    h.step();
    const u = h.unit(YAK);
    h.b.loseHp(u, 100);
    assert.ok(!u.s.flags.stealth, 'no 隐匿 from a 流失');
    h.b.dealDamage(null, u, { amount: 100, type: 'true', canDodge: false });
    assert.ok(u.s.flags.stealth, '隐匿 after the first damage');
  }
  // 远牙 "最近10秒内未受伤害时，攻击力+15%": a 流失 keeps the bonus, a drain tick resets the timer
  {
    const h = makeBattle({ units: [{ chessId: FARTOOTH, row: 11, col: 4 }], timeLimit: 60, hooks: [] });
    h.step();
    const u = h.unit(FARTOOTH);
    h.run(10.5);
    assert.ok(u.findBuff('fartth:focus'), 'bonus after 10 s');
    h.b.loseHp(u, 50);
    h.run(0.3);
    assert.ok(u.findBuff('fartth:focus'), 'a 流失 does not reset it');
    h.b.dealDamage(null, u, { amount: 50, type: 'true', canDodge: false });
    h.run(0.3);
    assert.ok(!u.findBuff('fartth:focus'), 'damage resets it');
  }
  // 坚守 thorns (3 members): a 流失 leaves the 0.2 s chance; 无来源 damage uses it up and hits nobody (PRTS 备注)
  {
    const stead = DATA.bonds.steadShip;
    const members = ['chess_char_1_02_a', 'chess_char_1_10_a', 'chess_char_2_08_a'];
    for (const m of members) assert.ok(stead.members.includes(m), m);
    const h = makeBattle({
      defs: { enemies: { enemy_dummy: dummy({ atk: 10, bat: 1 }) } },
      units: members.map((id, i) => ({ chessId: id, row: 10, col: 3 + i, skillIndex: 0 })),
      bonds: { steadShip: { count: 3, active: true, tier: 2, layers: 0 } },
      timeLimit: 60, hooks: [],
    });
    h.step();
    const u = h.unit(members[0]);
    h.b.loseHp(u, 10);
    assert.equal(u.mem['bond:steadShip:cd'], undefined, 'a 流失 used no thorn chance');
    h.b.dealDamage(null, u, { amount: 10, type: 'true', canDodge: false });
    approx(u.mem['bond:steadShip:cd'], h.b.time, 1e-9, '无来源 damage used it');
  }
});

// ---------------------------------------------------------------------------------------------------------------
// review follow-ups: 敌人类我方单位, the enemy-side BUFF damage, self-damage stats, the chimera aura numbers

test('源石溶剂 also drains every 敌人类我方单位 on the field (炎佑): one 无来源 60 true-damage tick per second however many carriers; none once no carrier is on the field', () => {
  // PRTS 盟约记录 源石溶剂 备注: "携带后，全场范围内的所有敌人类我方单位也会获得此装备的“每秒受到60真实伤害”效果（该效果的付与为
  // 我方阵营索敌，可对空，无视目标可选性）"; one effect per unit (PRTS 作战机制 "同名buff的默认叠加策略buff只能表现出一个")
  for (const carriers of [1, 2]) {
    const units = [{ chessId: YAK, row: 10, col: 4, items: [SOLVENT], skillIndex: 1 }];
    if (carriers > 1) units.push({ chessId: INSIDE, row: 11, col: 4, items: [SOLVENT_B] });
    const h = makeBattle({ units, timeLimit: 60, hooks: ['damaged'], captureNoisy: true, autoFinish: false });
    h.step();
    const [y] = spawnYanyou(h.b, 'p1', { atk: 400, hp: 5000 });
    assert.ok(y && y.deployed && y.s.flags.isolated, '炎佑 on the field (孤立: "无视目标可选性")');
    const hp0 = y.hp;
    h.run(3.02);
    const ticks = h.hooksOf('damaged').filter((c) => c.target === y);
    assert.equal(ticks.length, 3, `${carriers} carrier(s): one tick per second`);
    for (const c of ticks) {
      assert.equal(c.source, null, '无来源');
      assert.equal(c.credit, null, 'nobody is credited with damage to an ally');
      assert.equal(c.type, 'true');
      assert.ok(!hpLoss(c), 'damage, not 流失');
    }
    approx(hp0 - y.hp, 3 * DRAIN, 1e-9);
    // no carrier left on the field: no more ticks
    for (const u of h.b.allyUnits.filter((a) => a.kind === 'op')) h.b.kill(u, null);
    const n = ticks.length;
    h.run(2.02);
    assert.equal(h.hooksOf('damaged').filter((c) => c.target === y).length, n, 'the effect ends with its carriers');
    assert.equal(h.b.errorCount, 0, JSON.stringify(h.b.errors));
  }
  // the 9-炎 炎佑 (受到的伤害 ×0.1) takes a tenth of it: a damage instance, damage-taken modifiers apply
  const h = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, items: [SOLVENT], skillIndex: 1 }], timeLimit: 60, hooks: [], autoFinish: false });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 400, hp: 5000, dmgTakenMul: 0.1 });
  const hp0 = y.hp;
  h.run(1.02);
  approx(hp0 - y.hp, DRAIN * 0.1, 1e-9);
});

test('a co-op field: a carrier drains the partner\'s 炎佑 too ("全场范围内…我方单位")', () => {
  const h = makeBattle({
    kind: 'boss', autoFinish: false, timeLimit: 60, hooks: ['damaged'], captureNoisy: true,
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: YAK, row: 12, col: 3, items: [SOLVENT], skillIndex: 1 }], bonds: {} },
      { playerId: 'p2', seat: 1, side: 'R', colOffset: 0, units: [], bonds: {} },
    ],
  });
  h.step();
  const [y] = spawnYanyou(h.b, 'p2', { atk: 400, hp: 5000 });
  assert.ok(y && y.ownerId === 'p2');
  h.run(2.02);
  assert.equal(h.hooksOf('damaged').filter((c) => c.target === y).length, 2);
});

test('self / friendly damage is not damage dealt: the 源石溶剂 carrier\'s own drain counts as taken, never as its dmg or the player\'s damageDealt; the kill stays its own', () => {
  const h = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, items: [SOLVENT], skillIndex: 1 }], timeLimit: 60, hooks: ['kill'], autoFinish: false });
  h.step();
  const u = h.unit(YAK);
  u.skill.sp = 0;
  const [y] = spawnYanyou(h.b, 'p1', { atk: 400, hp: 5000 });
  h.run(3.02);
  approx(u.stats.taken, 3 * DRAIN, 1e-9, 'taken');
  assert.equal(u.stats.dmg, 0, 'its own drain is not damage it dealt');
  approx(y.stats.taken, 3 * DRAIN, 1e-9);
  // an operator's own 流失 (Battle.loseHp with itself as the source) likewise
  h.b.loseHp(u, 100, { source: u });
  assert.equal(u.stats.dmg, 0);
  h.b.forceEnd?.('test');
  const r = h.b.result();
  assert.equal(r.perPlayer.p1.damageDealt, 0, 'the results screen 造成伤害');
  const st = r.perPlayer.p1.unitStats.find((s) => s.defId === YAK);
  assert.equal(st.dmg, 0);
  // the carrier finished off by its own drain is still its own kill (kill credit untouched)
  const g = makeBattle({ units: [{ chessId: YAK, row: 10, col: 4, items: [SOLVENT], skillIndex: 1 }], timeLimit: 60, hooks: ['kill'], autoFinish: false });
  g.step();
  const v = g.unit(YAK);
  v.skill.sp = 0;
  v.hp = 10;
  g.run(1.02);
  assert.ok(!v.alive);
  assert.equal(g.hooksOf('kill').find((c) => c.victim === v)?.killer, v);
});

test('enemy-side BUFF damage (PRTS 伤害分类 "深水区/涨潮水蚀", "弧光锋卫失衡状态下的自残伤害") is damage, not 流失: 码头水手 drowning, 弧光锋卫 失衡 bleed', () => {
  // 码头水手 天赋 (PRTS): "水蚀状态下或处于清澈水域时，每秒受到1000点无来源真实伤害"
  for (const key of ['enemy_1160_hvyslr', 'enemy_1160_hvyslr_2']) {
    const h = makeBattle({ units: [], flat: { rows: { 11: '##hddddrrrfrrrrrrrf##' } }, timeLimit: 60, hooks: ['damaged'], captureNoisy: true, autoFinish: false });
    h.step();
    const e = h.spawn(key, { pos: [11, 4], routeIndex: 0, mods: { speedMul: 0 } });
    // (the deep-water tiles' own terrain tick — devices.js, already damage — is left out: tag 'drown' only)
    const drown = () => h.hooksOf('damaged').filter((c) => c.target === e && (c.dmg.tags || []).includes('drown'));
    h.run(1);
    assert.ok(drown().length >= 1);
    for (const c of drown()) { assert.equal(c.source, null); assert.equal(c.type, 'true'); assert.ok(!hpLoss(c), `${key}: drowning is damage`); }
    const per = DATA.enemies[key].talents.bb['Drown.damage'];
    const sum = (l) => l.reduce((s, c) => s + c.amount, 0);
    approx(sum(drown()), per, 0.02, 'Drown.damage per second');
    h.b.applyStatus(e, 'fragile', { duration: 30, value: 0.5 });
    const n = drown().length;
    h.run(1);
    approx(sum(drown().slice(n)), per * 1.5, 0.02, '脆弱 scales it');
  }
  // 弧光锋卫 天赋 (PRTS 修正 "失衡移动时持续受到真实伤害"; "处于失衡状态时，每0.066s受到400点无来源真实持续伤害")
  const h = makeBattle({ units: [], timeLimit: 60, hooks: ['damaged'], captureNoisy: true, autoFinish: false });
  h.step();
  const j = h.spawn('enemy_1328_cbjedi', { pos: [10, 7], routeIndex: 0, mods: { speedMul: 0 } });
  h.step(2);
  const hp0 = j.hp;
  h.b.push(j, 3, { from: { x: j.x - 1, y: j.y } });                  // its 失衡 state (the bleed runs while it lasts)
  h.run(0.2);
  const bleed = h.hooksOf('damaged').filter((c) => c.target === j);
  assert.ok(bleed.length >= 1 && hp0 > j.hp, 'bled');
  for (const c of bleed) { assert.equal(c.source, null); assert.equal(c.type, 'true'); assert.ok(!hpLoss(c), '失衡 bleed is damage'); }
});

test('孽罪奇美拉 污染模式 (PRTS "自身半径1.2范围内的所有单位…每0.5秒受到50真实持续伤害（同类效果取最高）"): radius 1.2, a tick every 0.5 s, never stacked by two chimeras', () => {
  const run = (chimeras, dx = 0) => {
    const h = makeBattle({
      stageId: 'act1autochess_m04', units: [{ chessId: INSIDE, row: 10, col: 5 }],
      timeLimit: 60, hooks: ['damaged'], captureNoisy: true, autoFinish: false,
    });
    h.step();
    const u = h.unit(INSIDE);
    const es = chimeras.map((pos) => { const e = h.spawn('enemy_1425_lrcmra', { pos }); h.b.applyStatus(e, 'stun', { duration: 60 }); e.x += dx; return e; });
    h.run(0.3); // both activated on their infection tile
    assert.ok(es.every((e) => e.mem.ab.atkType === 'arts'), 'activated (污染模式)');
    const t0 = h.b.time;
    h.run(2);
    return h.hooksOf('damaged').filter((c) => c.target === u && es.includes(c.credit) && c.t > t0 + 1e-9);
  };
  const aura = DATA.enemies.enemy_1425_lrcmra.talents.bb['OrigAura.damage'];
  // one chimera beside her: 4 ticks in 2 s, 0.5 s apart
  const one = run([[10, 6]]);
  assert.equal(one.length, 4, `ticks every 0.5 s (${one.map((c) => c.t.toFixed(2))})`);
  for (let i = 1; i < one.length; i++) approx(one[i].t - one[i - 1].t, 0.5, 1e-6);
  for (const c of one) approx(c.amount, aura, 1e-9);
  // two chimeras in reach (both on the infection tile beside her): still one tick per 0.5 s (同类效果取最高)
  assert.equal(run([[10, 6], [10, 6]]).length, 4, 'not stacked');
  // 1.15 tiles away (inside 1.2, outside the old radius 1)
  assert.equal(run([[10, 6]], 0.15).length, 4, 'radius 1.2');
});
