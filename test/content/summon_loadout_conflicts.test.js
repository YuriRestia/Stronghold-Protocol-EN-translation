// test/content/summon_loadout_conflicts.test.js — summoner kits read their summon's stats / blackboards for the OWNER's
// loadout (DESIGN §16, docs/SIM.md §6 `battle.tokenDef(tokenId, ownerUnit)`), also when two players of one shared field
// (联防) run the same summoner with different skills / modules. The per-battle data view resolves an id-only
// `battle.data.getToken(id, chessId)` with the FIRST player's loadout of that chess (`loadoutConflicts`), so a kit
// reading it gave the second player the first one's variant. The real tokens.json variants of these summons differ
// between loadouts only in fields the kits do not read, so each test patches the field its kit reads (a copy of the
// real record) and runs both seat orders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { DataSource, getDefaultSource, hasGeneratedData } from '../../server/sim/simdata.js';

const skip = !hasGeneratedData() && 'no generated data (run node tools/build-data.mjs)';
const base = getDefaultSource();

const DEF = {}, NONE = { moduleId: 'none' };
const ORDERS = (x, y) => [[x, y], [y, x]];
const mk = (playerId, seat, colOffset, units) => ({ playerId, seat, side: 'L', colOffset, units, bonds: {}, playerEffects: [] });
const dummy = (key) => enemyRec({ key, hp: 1e7, speed: 0, def: 0, res: 0, atk: 0 });
const approx = (a, b, msg = '') => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${msg} ${a} ≈ ${b}`);

/** `{ [tokenId]: copy of the real record }` with `patch(variant)` applied to chess `owner`'s variant. */
function patchedToken(tokenId, owner, patch) {
  const rec = structuredClone(base.rawToken(tokenId));
  patch(rec.variants[owner]);
  return { [tokenId]: rec };
}
/** The token def the patched data gives a summon of `chessId` with loadout `lo` (the expectation). */
const want = (tokens, tokenId, chessId, lo) => new DataSource({ chess: {}, enemies: {}, tokens, stages: {}, waves: {} }, base).getToken(tokenId, chessId, lo);

/**
 * A 联防 field: p1 (left half) and p2 (right half, +8 columns) each field `chessId` (uid 1) with loadouts lo[0] / lo[1]
 * (plus `extra` units). Returns the harness and both summoners after the first tick.
 */
function duel({ chessId, lo, tokens, row = 10, col = 4, extra = [], enemies = {}, spawns = [] }) {
  const units = (l) => [{ uid: 1, chessId, row, col, dir: 'RIGHT', ...l }, ...extra.map((e, i) => ({ uid: i + 2, dir: 'RIGHT', ...e }))];
  const h = makeBattle({
    kind: 'unite', seed: 7, timeLimit: 120, defs: { tokens, enemies }, enemies: spawns, hooks: ['damaged', 'deploy'], captureNoisy: true,
    players: [mk('p1', 0, 0, units(lo[0])), mk('p2', 1, 8, units(lo[1]))],
  });
  h.step();
  const own = (pid) => h.b.allyUnits.find((u) => u.kind === 'op' && u.player.playerId === pid && u.uid === 1);
  const ops = [own('p1'), own('p2')];
  assert.ok(ops.every((u) => u && u.alive && u.deployed), 'both summoners deployed');
  assert.ok(h.b.data.loadoutConflicts.includes(chessId), 'an id-only lookup would give p2 p1\'s loadout');
  return { h, ops };
}
const summons = (h, owner, tokenId) => h.b.allyUnits.filter((u) => u.kind === 'token' && u.ownerUnit === owner && u.defId === tokenId);
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };

/** Cast each summoner's skill once; returns the summon each one placed. */
function castAndCollect(h, ops, tokenId) {
  for (const u of ops) assert.ok(u.skill.activate('test', { free: true }), `${u.player.playerId} cast`);
  h.step();
  return ops.map((u) => {
    const s = summons(h, u, tokenId);
    assert.equal(s.length, 1, `${u.player.playerId} summoned one`);
    return s[0];
  });
}

/** Lifetime check: at `short` + 0.5 s only the summon of the owner whose loadout gives `short` is gone. */
function assertLifetimes(h, sums, lives) {
  const short = Math.min(...lives), long = Math.max(...lives);
  assert.ok(long - short > 1, 'the loadouts give different lifetimes');
  h.run(short + 0.5);
  sums.forEach((s, i) => assert.equal(s.alive, lives[i] > short + 0.5, `summon ${i + 1} (${lives[i]} s) at ${short + 0.5} s`));
  h.run(long - short);
  sums.forEach((s, i) => assert.equal(s.alive, false, `summon ${i + 1} expired`));
}

// ---------------------------------------------------------------------------------------------------------------

test('赫默: the medical drone lives its owner\'s withdraw duration (module variant), whichever seat plays which module', { skip }, () => {
  const HEMO = 'chess_char_2_02_b', DRONE = 'token_10000_silent_healrb';
  // LONGER than the default: the drone's own token kit (tokens.js) also withdraws it after its variant's time, so only a
  // spawn duration shorter than the owner's variant shows the kit reading another loadout
  const tokens = patchedToken(DRONE, HEMO, (v) => { v.byModule.none.skill = { ...v.skill, duration: 16 }; });
  // the withdraw skill (自我销毁) is not part of the normalised token def: the kit reads the owner's raw variant
  const life = (lo) => (lo === NONE ? 16 : base.rawToken(DRONE).variants[HEMO].skill.duration);
  assert.equal(life(DEF), 10);
  for (const lo of ORDERS(DEF, NONE)) {
    // the drone is a hand piece the player places; it deploys once with the board (SKILL_SUMMON_START_DEPLOY), then
    // S2 brings it back onto its tile (user playtest #6) — both lifetimes are checked on the start deploy and on a cast
    const { h, ops } = duel({ chessId: HEMO, lo, tokens, extra: [{ kind: 'token', tokenId: DRONE, ownerUid: 1, row: 11, col: 4 }] });
    const start = ops.map((u) => summons(h, u, DRONE)[0]);
    assert.ok(start.every((d) => d && d.alive), 'both start deploys');
    assertLifetimes(h, start, lo.map(life));
    // S2 casts by itself the tick its SP is full (22 s), injured ally or not — client skill skchr_silent_2: no `_trigger`,
    // `_allowNoTarget` 1 (community report of 2026-10-06, DESIGN §25.16; until then it waited for an injured ally and this
    // test cast it by hand): past the token's redeploy time, so each drone comes back with its owner's cast
    assert.ok(ops.every((u) => u.skill.activations === 0), 'no cast before the SP is full');
    assert.ok(h.runUntil(() => ops.every((u) => u.skill.activations === 1), 10), 'both cast at full SP');
    const drones = ops.map((u) => summons(h, u, DRONE)[0]);
    assert.ok(drones.every((d) => d.alive), 'both drones back on the field');
    assertLifetimes(h, drones, lo.map(life));
    done(h);
  }
});

test('风丸: the 纸偶 substitute takes the ATK / DEF of its owner\'s module variant of the shadow token', { skip }, () => {
  const KAZ = 'chess_char_2_11_b', SHADOW = 'token_10022_kazema_shadow';
  const tokens = patchedToken(SHADOW, KAZ, (v) => { v.byModule.none.stats = { ...v.byModule.none.stats, atk: 1234, def: 567 }; });
  assert.notEqual(want(tokens, SHADOW, KAZ, DEF).stats.atk, want(tokens, SHADOW, KAZ, NONE).stats.atk);
  for (const lo of ORDERS(DEF, NONE)) {
    const { h, ops } = duel({ chessId: KAZ, lo, tokens });
    for (const u of ops) h.b.dealDamage(null, u, { type: 'true', amount: 1e7 });
    h.step();
    ops.forEach((u, i) => {
      const ts = want(tokens, SHADOW, KAZ, lo[i]).stats;
      assert.ok(u.alive && u.findBuff('trait:substitute'), `${u.player.playerId} substituted`);
      const doll = u.findBuff('kazema:doll');
      assert.ok(doll, `${u.player.playerId} 纸偶 stats`);
      assert.equal(u.base.atk + doll.mods.atkFlat, ts.atk, `${u.player.playerId} ATK of its own variant`);
      assert.equal(u.base.def + doll.mods.defFlat, ts.def, `${u.player.playerId} DEF of its own variant`);
    });
    done(h);
  }
});

test('琳琅诗怀雅: a 香槟炸弹 arms after its owner\'s module variant of duration_switch', { skip }, () => {
  const SWIRE = 'chess_char_3_04_b', TRAP = 'token_10031_swire2_gdtrap', M3 = { moduleId: 'uniequip_003_swire2' };
  // module 003 (patched): armed at once ⇒ its bombs always hit twice; the default arms after 3 s ⇒ a fresh bomb hits once
  const tokens = patchedToken(TRAP, SWIRE, (v) => { v.byModule[M3.moduleId].skill = { ...v.skill, bb: { ...v.skill.bb, duration_switch: 0 } }; });
  assert.equal(want(tokens, TRAP, SWIRE, DEF).skill.bb.duration_switch, 3);
  assert.equal(want(tokens, TRAP, SWIRE, M3).skill.bb.duration_switch, 0);
  for (const lo of ORDERS(DEF, M3)) {
    const { h, ops } = duel({
      chessId: SWIRE, lo, tokens, row: 9, col: 5, enemies: { enemy_d: dummy('enemy_d') },
      spawns: [{ key: 'enemy_d', pos: [9, 5] }, { key: 'enemy_d', pos: [9, 13] }],
    });
    // each threw its deployment coin's bomb in duel's first step (S2 needs no enemy); no other coin before the 3 s payment,
    // so every trap hit below is that bomb's
    for (const u of ops) { u.mem.coins = 0; u.player.dp = 99; }
    // the moment a bomb stands, an enemy steps on it (the bomb is a tick old)
    const bombs = [null, null];
    for (let i = 0; i < 30 * 10 && bombs.some((x) => !x); i++) {
      h.step();
      ops.forEach((u, k) => {
        if (bombs[k]) return;
        const t = summons(h, u, TRAP).find((x) => x.alive);
        if (t) { bombs[k] = t; h.spawn('enemy_d', { def: dummy('enemy_d'), pos: [t.tileR, t.tileC] }); }
      });
    }
    assert.ok(bombs.every(Boolean), 'both placed a bomb');
    h.run(0.5);
    ops.forEach((u, k) => {
      assert.equal(bombs[k].alive, false, `${u.player.playerId} bomb went off`);
      const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('trap'));
      assert.equal(hits.length, lo[k] === M3 ? 2 : 1, `${u.player.playerId} (${lo[k] === M3 ? 'module 003' : 'default'}) hits`);
    });
    done(h);
  }
});

test('巫恋: the 诅咒娃娃 lasts its owner\'s module variant of the token skill duration', { skip }, () => {
  const VOD = 'chess_char_3_15_b', DOLL = 'token_10006_vodfox_doll';
  const tokens = patchedToken(DOLL, VOD, (v) => { v.byModule.none.skill = { ...v.skill, duration: 5 }; });
  const life = (lo) => want(tokens, DOLL, VOD, lo).skill.duration;
  assert.deepEqual([life(DEF), life(NONE)], [15, 5]);
  for (const lo of ORDERS(DEF, NONE)) {
    const { h, ops } = duel({ chessId: VOD, lo, tokens, extra: [{ kind: 'token', tokenId: DOLL, ownerUid: 1, row: 11, col: 4 }] });
    const dolls = castAndCollect(h, ops, DOLL);
    assertLifetimes(h, dolls, lo.map(life));
    done(h);
  }
});

test('蜜蜡: the 守卫尖碑 stands its owner\'s module variant of the token talent duration', { skip }, () => {
  const BEE = 'chess_char_4_05_b', OBELISK = 'token_10011_beewax_oblisk';
  const tokens = patchedToken(OBELISK, BEE, (v) => { v.byModule.none.talents[0].bb.duration = 6; });
  const life = (lo) => want(tokens, OBELISK, BEE, lo).talents[0].bb.duration;
  assert.deepEqual([life(DEF), life(NONE)], [20, 6]);
  for (const lo of ORDERS(DEF, NONE)) {
    const { h, ops } = duel({ chessId: BEE, lo, tokens });
    const obs = castAndCollect(h, ops, OBELISK);
    assertLifetimes(h, obs, lo.map(life));
    done(h);
  }
});

test('凯瑟琳: device shield cap and deploy limit follow the owner\'s module variant of the device token', { skip }, () => {
  const CATHY = 'chess_char_4_11_b', CATSLD = 'token_10041_cathy_catsld';
  const tokens = patchedToken(CATSLD, CATHY, (v) => {
    v.byModule.none.talents[0].bb.max_shield_ratio = 0.5;
    v.byModule.none.stats = { ...v.byModule.none.stats, deployLimit: 1 };
  });
  const cap = (lo) => want(tokens, CATSLD, CATHY, lo).talents[0].bb.max_shield_ratio;
  const limit = (lo) => (lo === NONE ? 1 : base.rawToken(CATSLD).variants[CATHY].stats.deployLimit);
  assert.deepEqual([cap(DEF), cap(NONE), limit(DEF)], [0.22, 0.5, 2]);   // 0.22: the device talent at 凯瑟琳's full potential
  for (const lo of ORDERS(DEF, NONE)) {
    // two placed devices each (hand pieces, user playtest #6), facing her and one more operator: the default limit (2)
    // keeps both, the patched one (1) withdraws the first deployed
    const dev = (row, col) => ({ kind: 'token', tokenId: CATSLD, ownerUid: 1, row, col });
    const { h, ops } = duel({ chessId: CATHY, lo, tokens, extra: [{ chessId: 'chess_char_1_02_a', row: 11, col: 4 }, dev(10, 3), dev(11, 3)] });
    h.run(0.5);
    ops.forEach((u, i) => {
      const devs = summons(h, u, CATSLD).filter((d) => d.alive);
      assert.equal(devs.length, limit(lo[i]), `${u.player.playerId} devices (deploy limit)`);
      for (const d of devs) {
        const t = d.mem.target;
        assert.ok(t && t.kind === 'op' && t.ownerId === u.ownerId, `${u.player.playerId} device points at its operator`);
        approx(t.findBuff('cathy:shield')?.shield ?? 0, u.s.maxHp * cap(lo[i]), `${u.player.playerId} shield`);
      }
    });
    done(h);
  }
});

test('凛御银灰: the 风雪之眼 cost the kit splits the waiting area with follows the owner\'s skill variant', { skip }, () => {
  // each skill names its own eye (skill overrideTokenKey: S2 eagle2, S3 eagle3); the S3 owner's variant of eagle3 is
  // patched, so a lookup with the S2 (default) owner's loadout — p1's in the first order — gives the unpatched cost
  const SVASH = 'chess_char_5_14_b', S3 = { skillIndex: 2 };
  const EYE = (lo) => (lo === S3 ? 'token_10057_svash2_eagle3' : 'token_10057_svash2_eagle2');
  const tokens = patchedToken(EYE(S3), SVASH, (v) => { v.bySkill[2].stats = { ...v.stats, cost: 9 }; });
  const cost = (lo) => want(tokens, EYE(lo), SVASH, lo).stats.cost;
  assert.deepEqual([cost(DEF), cost(S3), want(tokens, EYE(S3), SVASH, DEF).stats.cost], [14, 9, 19]);
  for (const lo of ORDERS(DEF, S3)) {
    const { h, ops } = duel({ chessId: SVASH, lo, tokens });
    ops.forEach((u, i) => assert.equal(u.mem.eyeCost, cost(lo[i]), `${u.player.playerId} eye cost`));
    done(h);
  }
});
