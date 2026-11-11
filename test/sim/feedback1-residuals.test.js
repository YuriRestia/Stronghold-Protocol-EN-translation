// Residual fixes after the independent QA of `feedback1` (player feedback after 0.1.0, DESIGN §21.19), real data in the
// real sim:
// - 余 S2 厚礼上宾 never teleports a 自缚 unit: PRTS 余 S2 备注 "处于消失状态的/持有自缚的单位不视为可达目标" — 守墓石像's
//   转换模式 is 自缚 (its PRTS 天赋), so the statue stays where it stands (no push or pull moves it either, §21.9).
// - 信仰搅拌机 S2 八臂电锯侠: PRTS 备注 "弹药量不足时仍可抵挡致命伤害，此时将消耗所有剩余弹药并退出技能状态" and
//   "自身持有不死时此效果不会生效" (it used to let the lethal hit through with fewer than 30 bullets [ASSUMED]).
// The 重生 + same-hit status case (妮芙 S2's fear on the hit that makes an ember) is in feedback1-transform.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants, castNow } from '../helpers/battleHarness.js';
import { getData } from '../../server/data.js';
import { holdsUndying } from '../../server/sim/content/items/battle.js';

const DATA = getData({ log: { warn() {}, error() {}, info() {} } });

test('余 S2: a 守墓石像 in its statue form (自缚) stays put; in its ground form it is teleported onto 余\'s tile', () => {
  for (const statue of [true, false]) {
    const h = makeBattle({
      stageId: 'flat', autoFinish: false, timeLimit: 120,
      units: [{ chessId: 'chess_char_6_03_a', row: 10, col: 5, dir: 'RIGHT', skillIndex: 1 }],
      enemies: [
        { key: 'enemy_1172_dugago', time: 0, pos: [11, 6], route: { motion: 'WALK', start: [11, 6], end: [11, 6], steps: [{ t: 'wait', s: 99999 }] } },
        // a walker 余 blocks: S2 (her default trigger) fires once she is blocking
        { key: 'enemy_1000_gopro', time: 2, route: { motion: 'WALK', start: [10, 9], end: [10, 2], checkpoints: [] } },
      ],
    });
    h.step(1);
    const st = h.b.enemies.find((e) => e.defId === 'enemy_1172_dugago');
    const yu = h.unit('chess_char_6_03_a');
    if (statue) {
      h.b.dealDamage(yu, st, { amount: 1e7, type: 'true', tags: ['test'] });
      assert.ok(st.alive && st.findBuff('ab:stone'), 'knocked out once: the statue form');
      assert.ok(st.s.flags.selfBound && st.s.flags.noMove, '自缚');
    } else assert.ok(!st.s.flags.selfBound, 'the ground form is not 自缚');
    h.step(1);
    let cast = null;
    h.b.on('skillStart', (c) => { if (c.unit === yu && cast == null) cast = h.b.time; });
    h.b.on('tick', () => { if (cast == null && yu.skill && !yu.skill.active) yu.skill.sp = yu.skill.spCost; st.hp = st.s.maxHp; });
    const x0 = st.x, y0 = st.y;
    assert.ok(h.runUntil(() => cast != null, 12), 'S2 fires');
    h.step(3);
    const moved = Math.hypot(st.x - x0, st.y - y0);
    if (statue) assert.ok(moved < 1e-9, `the statue stays (moved ${moved.toFixed(2)})`);
    else assert.ok(Math.abs(st.x - yu.tileC) < 1e-9 && Math.abs(st.y - yu.tileR) < 1e-9, `teleported onto 余 (at ${st.x}, ${st.y})`);
    assert.equal(h.b.errorCount, 0);
    checkInvariants(h.b);
  }
});

test('信仰搅拌机 S2: a lethal hit with fewer than 30 bullets left is still blocked — every bullet goes and the skill ends; with 30 or more it costs 30', () => {
  const id = 'chess_char_4_01_a';
  const cost = DATA.chess[id].skills[1].bb.ammo_cost;
  assert.equal(cost, 30, 'the data cost');
  for (const [left, after] of [[12, 0], [40, 40 - cost], [cost, 0]]) {
    const h = makeBattle({
      defs: { enemies: { e_hit: enemyRec({ key: 'e_hit', hp: 1e8, atk: 0, speed: 0 }) } },
      units: [{ chessId: id, row: 9, col: 5, skillIndex: 1 }], enemies: [{ key: 'e_hit', pos: [9, 8] }],
      timeLimit: 60, autoFinish: false,
    });
    h.step(2);
    const u = h.unit(id);
    const foe = h.b.enemies[0];
    assert.equal(u.skill.id, 'skchr_rmixer_2');
    assert.ok(castNow(u, 'test', { free: true }), 'S2 on');
    u.skill.ammoLeft = left;
    const hp = u.hp;
    h.b.dealDamage(foe, u, { amount: u.s.maxHp * 10, type: 'true', tags: ['test'] });
    assert.ok(u.alive, `${left} bullets: the lethal hit is blocked`);
    assert.ok(Math.abs(u.hp - hp) < 1e-6, 'HP back to its value before the hit');
    assert.equal(u.skill.ammoLeft, after, `${left} bullets → ${after}`);
    assert.equal(u.skill.active, after > 0, after > 0 ? 'the skill goes on' : 'out of bullets: the skill ends');
    assert.equal(h.b.errorCount, 0);
  }
});

test('信仰搅拌机 S2 steps aside while she holds 不死 (坚固维式重锤\'s window): the hammer takes the lethal hit, no bullet spent', () => {
  const id = 'chess_char_4_01_a';
  const h = makeBattle({
    defs: { enemies: { e_hit: enemyRec({ key: 'e_hit', hp: 1e8, atk: 0, speed: 0 }) } },
    units: [{ chessId: id, row: 9, col: 5, skillIndex: 1, items: ['chess_item_3_09_e_a'] }], enemies: [{ key: 'e_hit', pos: [9, 8] }],
    timeLimit: 60, autoFinish: false,
  });
  h.step(2);
  const u = h.unit(id);
  const foe = h.b.enemies[0];
  const lethal = () => h.b.dealDamage(foe, u, { amount: u.s.maxHp * 10, type: 'true', tags: ['test'] });
  lethal();                                            // before the skill: the hammer's lock starts (8 s of 不死)
  assert.ok(u.alive && holdsUndying(h.b, u), 'the hammer holds her');
  assert.ok(castNow(u, 'test', { free: true }), 'S2 on');
  const ammo = u.skill.ammoLeft;
  lethal();
  assert.ok(u.alive, 'still standing (不死)');
  assert.equal(u.skill.ammoLeft, ammo, 'no bullet spent while she holds 不死');
  h.run(8.2);                                          // the window is over: S2 guards again
  assert.ok(u.skill.active);
  lethal();
  assert.ok(u.alive, 'S2 blocks it');
  assert.equal(u.skill.ammoLeft, ammo - 30);
  assert.equal(h.b.errorCount, 0);
});

test('信仰搅拌机 S2 guards again in a new deployment although the old 不死 window has not run out (holdsUndying is per deployment)', () => {
  const id = 'chess_char_4_01_a';
  const h = makeBattle({
    defs: { enemies: { e_hit: enemyRec({ key: 'e_hit', hp: 1e8, atk: 0, speed: 0 }) } },
    units: [{ chessId: id, row: 9, col: 5, skillIndex: 1, items: ['chess_item_3_09_e_a'] }], enemies: [{ key: 'e_hit', pos: [9, 8] }],
    timeLimit: 60, autoFinish: false,
  });
  h.step(2);
  const u = h.unit(id);
  const foe = h.b.enemies[0];
  const lethal = () => h.b.dealDamage(foe, u, { amount: u.s.maxHp * 10, type: 'true', tags: ['test'] });
  lethal();
  assert.ok(holdsUndying(h.b, u), 'the hammer\'s window runs');
  h.run(1);
  h.b.retreat(u, { reason: 'raid' });                 // a 突袭-style retreat + redeploy 3 s into the window
  assert.ok(h.b.redeploy(u, { free: true, tile: [9, 6] }), 'redeployed');
  assert.ok(!holdsUndying(h.b, u), 'the window ended with its deployment');
  assert.ok(castNow(u, 'test', { free: true }), 'S2 on');
  const ammo = u.skill.ammoLeft;
  lethal();
  assert.ok(u.alive, 'S2 blocks it');
  assert.equal(u.skill.ammoLeft, ammo - 30, 'she holds no 不死 in this deployment: S2 spends its bullets');
  assert.equal(h.b.errorCount, 0);
});
