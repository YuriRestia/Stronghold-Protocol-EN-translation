// waves.js: per-match setup (official type schedule + picks), per-action replacement, scaling, bounties, 联防 routing,
// boss templates, preview. The official-number fixtures live in waves-official.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../../server/match/gamedata.js';
import {
  setupMatchWaves, buildNormalWave, buildBossWave, bountySpawns, withBounties, buildUniteWave, previewOf, roundPick, gateOf,
  isFlyKey,
} from '../../server/match/waves.js';
import { createRng } from '../../server/sim/rng.js';
import { DATA } from './harness.js';

const TS = DATA.factions.templateSlots;
const PLACEHOLDERS = new Set([TS.N, TS.E, TS.S, TS.NF, TS.EF, TS.SF]);
const fly = (k) => DATA.enemies[k].isFlyEnemy;

test('match setup: stage allowed by the mode, 3 distinct random factions, weighted boss, hidden boss only with a hidden round', () => {
  for (const modeId of ['mode_single_funny', 'mode_multi_funny', 'mode_multi_normal', 'mode_single_hard', 'mode_multi_abyss']) {
    const gd = new GameData(DATA, modeId);
    const bosses = new Set();
    for (let seed = 1; seed <= 30; seed++) {
      const s = setupMatchWaves(gd, createRng(seed));
      assert.ok(gd.mode.stages.includes(s.stageId), `${modeId} stage ${s.stageId}`);
      assert.ok(DATA.stages[s.stageId].active && DATA.stages[s.stageId].weight > 0);
      assert.equal(new Set(s.factions).size, 3);
      for (const f of s.factions) assert.ok(DATA.factions.types[f].involveRandom, f);
      assert.ok(gd.mode.bossWeights[s.bossId] > 0);
      bosses.add(s.bossId);
      if (gd.hiddenRound) assert.ok(['boss_8', 'boss_9', 'boss_10'].includes(s.hiddenBossId));
      else assert.equal(s.hiddenBossId, null);
    }
    assert.ok(bosses.size >= 3, 'bosses vary with the seed');
  }
  const a = setupMatchWaves(new GameData(DATA, 'mode_multi_hard'), createRng(5));
  const b = setupMatchWaves(new GameData(DATA, 'mode_multi_hard'), createRng(5));
  assert.deepEqual(a, b, 'deterministic');
});

test('type schedule: each chosen type owns exactly 3 of the 15 round slots, SPECIAL the other 6, shuffled; the order stays hidden', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const firstSlot = new Map();
  for (let seed = 1; seed <= 60; seed++) {
    const s = setupMatchWaves(gd, createRng(seed));
    assert.equal(s.typeSlots.length, 15);
    const count = (t) => s.typeSlots.filter((x) => x === t).length;
    for (const f of s.factions) assert.equal(count(f), 3, `seed ${seed}: ${f}`);
    assert.equal(count('SPECIAL'), 6);
    firstSlot.set(s.typeSlots[0], (firstSlot.get(s.typeSlots[0]) || 0) + 1);
    // the schedule rides on the factions array without leaking into the public view
    assert.deepEqual(s.factions.schedule.typeSlots, s.typeSlots);
    assert.equal(JSON.stringify(s.factions), JSON.stringify([...s.factions]));
    assert.deepEqual(Object.keys(s.factions), ['0', '1', '2']);
    // picks: one per round, of the round's type and half; the special key is allowed in the mode
    for (let r = 1; r <= 15; r++) {
      const p = s.picks[r];
      assert.ok(p, `seed ${seed} R${r}`);
      assert.equal(p.type, s.typeSlots[r - 1]);
      assert.equal(p.firstHalf, r <= 7);
      const e = DATA.factions.entries[p.key];
      assert.equal(e.type, p.type);
      assert.equal(e.firstHalf, r <= 7);
      assert.ok(!gd.inactiveEnemies.has(p.key), `R${r}: banned special ${p.key}`);
      assert.ok(e.N.some((x) => x.key === p.normal) && e.E.some((x) => x.key === p.elite));
      assert.equal(p.fly, e.fly);
      assert.equal(roundPick(gd, createRng(1), s.factions, r), p, 'the factions array resolves the same pick');
      assert.equal(roundPick(gd, createRng(1), s, r), p, 'so does the setup object');
    }
  }
  assert.ok(firstSlot.size >= 3, 'R1 type varies (shuffled slots)');
  // the extra schedule draws do not shift what the caller draws next from the setup rng (bans stay seed-stable)
  const r1 = createRng(9); setupMatchWaves(gd, r1);
  const r2 = createRng(9);
  const stageIds = gd.mode.stages.filter((id) => gd.stage(id) && gd.stage(id).active !== false && gd.stage(id).weight > 0);
  r2(); // stage
  r2.shuffle(Object.values(DATA.factions.types).filter((t) => t.involveRandom).map((t) => t.type));
  r2(); // boss
  if (gd.hiddenRound) r2();
  assert.ok(stageIds.length > 0);
  assert.equal(r1(), r2());
});

test('normal waves: one pick per round, per-action counts 1–5, the other movement class skipped, literal keys kept, official scaling', () => {
  for (const modeId of ['mode_multi_normal', 'mode_multi_funny', 'mode_single_abyss']) {
    const gd = new GameData(DATA, modeId);
    for (let seed = 1; seed <= 8; seed++) {
      const setup = setupMatchWaves(gd, createRng(seed));
      for (let r = 1; r < gd.bossRound; r++) {
        const w = buildNormalWave(gd, createRng(seed + 100), setup.factions, r);
        const tpl = DATA.waves[w.templateId];
        const pick = setup.picks[r];
        assert.equal(w.pick, pick);
        assert.equal(w.templateId, gd.roundCfg(r).template);
        assert.equal(w.timeLimit, gd.combatTimeLimit(r));
        assert.deepEqual(gd.enemyScale(r), gd.baseEnemyScale(r), 'no custom multiplier');
        const scale = gd.enemyScale(r);
        const allowed = new Set([pick.key, pick.normal, pick.elite]);
        for (const s of w.spawns) {
          const a = tpl.spawns[s.actionIndex];
          assert.ok(a && !a.action, `R${r}: action ${s.actionIndex}`);
          assert.equal(s.time, a.time);
          assert.equal(s.routeIndex, a.routeIndex);
          if (PLACEHOLDERS.has(a.key)) {
            assert.ok(allowed.has(s.enemyKey), `${modeId} R${r}: ${s.enemyKey} not from the pick`);
            assert.equal(fly(s.enemyKey), pick.fly, 'one movement class per round');
            assert.ok(s.count >= 1 && s.count <= 5, 'clamp 1–5 per action');
            if (s.count > 1) assert.ok(Math.abs(s.interval - Math.max(a.count * a.interval / s.count, 0.05 * a.count * a.interval)) < 1e-9, 'same window');
          } else {
            assert.equal(s.enemyKey, a.key, 'literal key kept');
            assert.equal(s.count, a.count);
          }
          assert.equal(s.mods.hpMul, scale.hpMul);
          assert.equal(s.mods.atkMul, scale.atkMul);
          assert.equal(s.mods.speedMul, scale.speedMul);
          assert.ok(['N', 'E', 'S', 'NF', 'EF', 'SF', 'T', 'TF'].includes(s.mods.slot));
          assert.equal(s.preview.gate, gateOf(tpl.routes[s.routeIndex].start));
        }
        // every placeholder action of the pick's class is present, every other one skipped
        for (const [i, a] of tpl.spawns.entries()) {
          if (a.action || !PLACEHOLDERS.has(a.key)) continue;
          const sameClass = DATA.factions.generation.placeholders[a.key].fly === pick.fly;
          assert.equal(w.spawns.some((s) => s.actionIndex === i), sameClass, `R${r} action ${i} (${a.slot})`);
          assert.equal(w.actions.find((x) => x.index === i).valid, sameClass);
        }
        assert.equal(w.entries[pick.fly ? 'fly' : 'ground'].key, pick.key);
        assert.equal(w.entries[pick.fly ? 'ground' : 'fly'], null);
      }
    }
  }
});

test('plain factions array (tools): the round type is drawn from the schedule marginal; ABYSS speed; ACLOON never spawns', () => {
  const gd = new GameData(DATA, 'mode_multi_abyss');
  const seen = new Set();
  for (let seed = 1; seed <= 80; seed++) seen.add(buildNormalWave(gd, createRng(seed), ['FLY', 'DOT', 'TIMES'], 5).pick.type);
  assert.deepEqual([...seen].sort(), ['DOT', 'FLY', 'SPECIAL', 'TIMES']);
  assert.equal(gd.enemyScale(2).speedMul, 1);
  assert.ok(Math.abs(gd.enemyScale(3).speedMul - 1.15) < 1e-9);
  for (const id of Object.keys(DATA.waves)) {
    const t = DATA.waves[id];
    if (t.kind !== 'normal') continue;
    const r = t.usedBy[0]?.round;
    if (!r) continue;
    const w = buildNormalWave(gd, createRng(2), ['FLY', 'DOT', 'TIMES'], r);
    assert.ok(!w.spawns.some((s) => s.enemyKey === 'enemy_9012_acloon'));
  }
});

test('boss templates: leaders never scaled, pairs use the multi template, singles _s; escorts follow the round pick (E or EF only)', () => {
  const gd = new GameData(DATA, 'mode_multi_abyss');
  for (let seed = 1; seed <= 6; seed++) {
    const setup = setupMatchWaves(gd, createRng(seed));
    const pick = setup.picks[14];
    for (const bossId of Object.keys(gd.mode.bossWeights)) {
      const pair = buildBossWave(gd, createRng(1), setup.factions, 14, { bossId, solo: false });
      const single = buildBossWave(gd, createRng(1), setup.factions, 14, { bossId, solo: true });
      assert.ok(!/_s$/.test(pair.templateId) && /_s$/.test(single.templateId), `${bossId}: ${pair.templateId} / ${single.templateId}`);
      for (const w of [pair, single]) {
        assert.equal(w.pick, pick);
        const boss = w.spawns.filter((s) => s.tag === 'boss');
        assert.ok(boss.length >= 1);
        for (const s of boss) { assert.equal(s.mods.hpMul, undefined); assert.equal(s.preview.boss, true); }
        assert.equal(w.timeLimit, Infinity);
        const tpl = DATA.waves[w.templateId];
        for (const s of w.spawns) {
          assert.ok(DATA.enemies[s.enemyKey], s.enemyKey);
          const a = tpl.spawns[s.actionIndex];
          if (a.slot === 'E' || a.slot === 'EF') {
            assert.equal(s.enemyKey, pick.elite);
            assert.equal(a.slot === 'EF', pick.fly, 'only the escorts of the pick\'s class');
          }
        }
      }
    }
  }
  const sgd = new GameData(DATA, 'mode_single_funny');
  const setup = setupMatchWaves(sgd, createRng(3));
  const w = buildBossWave(sgd, createRng(3), setup.factions, 9, { bossId: 'boss_5', solo: true });
  assert.equal(w.templateId, 'act2autochess_h07_05_s');
  assert.equal(w.pick, setup.picks[9], 'solo 标准: the leader round uses slot 9');
});

test('co-op 终极: supplyHpMul = the 补给线 / 补给线II share of hp (hp ÷ it = the 攻坚装备 stacks 1.2^kAtk); wave and bounty mods carry it (PR #272)', () => {
  const gd = new GameData(DATA, 'mode_multi_abyss');
  for (const [r, row] of Object.entries(gd.mode.enemyScale)) {
    const sc = gd.enemyScale(Number(r));
    assert.ok(Math.abs(sc.hpMul / (sc.supplyHpMul ?? 1) - 1.2 ** row.kAtk) < 1e-5, `R${r}: ${sc.hpMul} / ${sc.supplyHpMul}`);
  }
  assert.equal(gd.enemyScale(4).supplyHpMul, undefined);
  assert.equal(gd.enemyScale(5).supplyHpMul, 1.2);    // 补给线II
  assert.equal(gd.enemyScale(6).supplyHpMul, 1.08);   // 补给线
  for (const id of ['mode_single_funny', 'mode_single_abyss', 'mode_multi_hard']) {
    const g = new GameData(DATA, id);
    for (const r of Object.keys(g.mode.enemyScale)) assert.equal(g.enemyScale(Number(r)).supplyHpMul, undefined, `${id} R${r}`);
  }
  const key = 'enemy_1200_msfjin';
  const picks = [];
  picks[6] = { round: 6, type: 'TIMES', key, normal: key, elite: key, fly: false, firstHalf: true };
  const wave = buildNormalWave(gd, createRng(1), { picks }, 6);
  const tokens = wave.spawns.filter((s) => s.enemyKey === key);
  assert.ok(tokens.length > 0);
  for (const s of tokens) assert.deepEqual([s.mods.hpMul, s.mods.supplyHpMul], [gd.enemyScale(6).hpMul, 1.08]);
  const [b] = bountySpawns(gd, 6, wave, [{ id: 'jin', card: { enemyKey: key, count: 1 } }], 'p1');
  assert.deepEqual([b.mods.hpMul, b.mods.supplyHpMul], [gd.enemyScale(6).hpMul, 1.08]);
});

test('bounty spawns: joined to the template\'s first normal action of the enemy\'s class, spread over its window; no solo ×0.7', () => {
  const gd = new GameData(DATA, 'mode_multi_hard');
  const picks = [];
  picks[5] = { round: 5, type: 'DOT', key: 'enemy_1270_nhstlk', normal: 'enemy_1271_nhsbr', elite: 'enemy_1271_nhsbr_2', fly: false, firstHalf: true };
  const pickKeys = DATA.factions.entries.enemy_1270_nhstlk;
  picks[5].normal = pickKeys.N[0].key; picks[5].elite = pickKeys.E[0].key;
  const w = buildNormalWave(gd, createRng(1), { picks }, 5);
  const kill = DATA.choices.cards.bounty.find((c) => c.payout === 'kill' && DATA.enemies[c.enemyKey] && !isFlyKey(gd, c.enemyKey));
  const perf = DATA.choices.cards.bounty.find((c) => c.payout === 'perfect' && DATA.enemies[c.enemyKey] && !isFlyKey(gd, c.enemyKey));
  const specs = bountySpawns(gd, 5, w, [{ id: 'b1', card: kill }, { id: 'b2', card: perf }], 'p1');
  assert.equal(specs.length, 2);
  assert.deepEqual(specs[0].bounty, { coins: kill.coin, ownerPlayerId: 'p1' });
  assert.equal(specs[0].count, kill.count);
  assert.equal(specs[0].tag, 'bounty');
  assert.equal(specs[0].mods.bountyId, 'b1');
  assert.equal(specs[1].bounty, undefined);
  // host = the first lrsldr action of act1autochess_05; the 2 bounty units are INSERTED among its own units
  // (client _InsertSpActionToNormal: unit i at floor((i+1)·len/(n+1)), len growing) and the list spread over the window
  const tpl = DATA.waves[w.templateId];
  const hostIdx = tpl.spawns.findIndex((s) => s.key === TS.N);
  const host = tpl.spawns[hostIdx];
  const own = w.spawns.find((s) => s.actionIndex === hostIdx).count;
  const total = own + kill.count + perf.count;
  const step = Math.max(host.count * host.interval / total, 0.05 * host.count * host.interval);
  const list = new Array(own).fill('own');
  list.splice(Math.floor((1 * list.length) / 3), 0, 'kill');
  list.splice(Math.floor((2 * list.length) / 3), 0, 'perf');
  assert.equal(specs[0].routeIndex, host.routeIndex);
  assert.ok(Math.abs(specs[0].time - (host.time + list.indexOf('kill') * step)) < 1e-9, 'kill bounty inserted among the own units');
  assert.ok(Math.abs(specs[1].time - (host.time + list.indexOf('perf') * step)) < 1e-9);
  assert.ok(specs[0].time < host.time + (total - 1) * step, 'not appended after the own units');
  assert.equal(specs[0].preview.gate, 'lower');
  // withBounties re-times the host action's own units around the inserted bounty units (one spec per run)
  const all = withBounties(gd, 5, w, [{ id: 'b1', card: kill }, { id: 'b2', card: perf }], 'p1');
  const hostSpecs = all.filter((s) => s.actionIndex === hostIdx && s.tag !== 'bounty');
  assert.equal(hostSpecs.reduce((n, s) => n + s.count, 0), own);
  const ownTimes = [];
  for (const s of hostSpecs) for (let i = 0; i < s.count; i++) ownTimes.push(s.time + i * s.interval);
  const wantOwn = list.map((v, j) => (v === 'own' ? host.time + j * step : null)).filter((t) => t !== null);
  assert.deepEqual(ownTimes.map((t) => t.toFixed(6)), wantOwn.map((t) => t.toFixed(6)));
  assert.equal(all.reduce((n, s) => n + s.count, 0), w.spawns.reduce((n, s) => n + s.count, 0) + 2, 'Σ units = wave + bounties');
  assert.notEqual(w.spawns.find((s) => s.actionIndex === hostIdx).interval, hostSpecs[0].interval, 'the shared wave is not mutated');
  // no bounty-specific multiplier in solo (the 70 % base is already in enemyScale)
  const sgd = new GameData(DATA, 'mode_single_hard');
  const solo = bountySpawns(sgd, 5, w, [{ id: 'b2', card: perf }], 'p1', { solo: true });
  assert.equal(solo[0].mods.hpMul, sgd.enemyScale(5).hpMul);
  assert.equal(solo[0].mods.defMul, undefined);
  // a flyer joins the first yokai action
  const flyCard = { ...kill, enemyKey: 'enemy_1005_yokai_2', count: 2 };
  const fs = bountySpawns(gd, 5, w, [{ id: 'b3', card: flyCard }], 'p1');
  assert.equal(fs[0].routeIndex, tpl.spawns.find((s) => s.key === TS.NF).routeIndex);
  assert.equal(w.routes[fs[0].routeIndex].motion, 'FLY');
});

test('联防 wave: walkers on the escaped lrsldr action, flyers on yokai, tokens on gopro_2/lazerd; per-owner offsets, window spread', () => {
  const gd = new GameData(DATA, 'mode_multi_normal');
  const leaked = [];
  for (let i = 0; i < 12; i++) leaked.push({ enemyKey: 'enemy_1422_lrsldr', mods: { hpMul: 1.2, slot: 'N' }, sourcePlayerId: 'a' });
  leaked.push({ enemyKey: 'enemy_1427_lrnazg', mods: { slot: 'E' }, sourcePlayerId: 'c' });
  for (let i = 0; i < 3; i++) leaked.push({ enemyKey: 'enemy_1005_yokai', mods: { slot: 'NF' }, sourcePlayerId: 'b', bounty: { coins: 2, ownerPlayerId: 'b' } });
  leaked.push({ enemyKey: 'enemy_1007_slime', mods: null, sourcePlayerId: 'b' });
  leaked.push({ enemyKey: 'enemy_1269_nhfly', mods: null, sourcePlayerId: 'b' }); // 枯朽之种: summoned only ⇒ token
  const one = buildUniteWave(gd, leaked, 1, 60);
  const two = buildUniteWave(gd, leaked, 2, 60);
  assert.equal(one.templateId, 'act1autochess_escaped_single');
  assert.equal(two.templateId, 'act1autochess_escaped_multi');
  for (const w of [one, two]) {
    const tpl = DATA.waves[w.templateId];
    const act = (k) => tpl.spawns.find((s) => s.key === k);
    assert.equal(w.spawns.length, 18);
    assert.equal(w.spawns.filter((s) => s.sourcePlayerId === 'a').length, 12);
    for (const s of w.spawns) {
      const tokenOnly = DATA.enemies[s.enemyKey].tokenOnly;
      const f = DATA.enemies[s.enemyKey].isFlyEnemy;
      const want = act(tokenOnly ? (f ? TS.TF : TS.T) : (f ? TS.NF : TS.N));
      assert.equal(s.routeIndex, want.routeIndex, `${s.enemyKey}: on the ${want.key} action`);
      assert.equal(w.routes[s.routeIndex].motion === 'FLY', f);
    }
    // the elite 灵幛 walks with the normal walkers (the class is ignored)
    const n = act(TS.N);
    const walkers = w.spawns.filter((s) => s.routeIndex === n.routeIndex);
    assert.equal(walkers.length, 12 + 1 + 1);
    const a = walkers.filter((s) => s.sourcePlayerId === 'a');
    const step = Math.max(n.count * n.interval / 12, 0.05 * n.count * n.interval);
    assert.equal(a[0].time, n.time);
    assert.ok(Math.abs(a[11].time - (n.time + 11 * step)) < 1e-9, 'owner a spread over the action window');
    const c = walkers.find((s) => s.sourcePlayerId === 'c');
    assert.equal(c.time, n.time + 0.5, 'second owner offset 0.5 s');
    assert.ok(w.spawns.some((s) => s.bounty && s.bounty.coins === 2), 'kill bounties keep paying');
  }
});

test('preview: one entry per action with gate / time / class flags, bounty and boss entries flagged, parts omitted; Σ count kept', () => {
  const p = previewOf([
    { enemyKey: 'a', count: 2, time: 5, preview: { gate: 'upper', fly: false, elite: false } },
    { enemyKey: 'a', count: 1, time: 3, preview: { gate: 'lower', fly: false, elite: false } },
    { enemyKey: 'b', count: 1, time: 4, tag: 'bounty', preview: { gate: 'lower', fly: true, elite: true } },
    { enemyKey: 'c', count: 1, time: 0, tag: 'boss', preview: { gate: 'lower', boss: true } },
    { enemyKey: 'd', count: 1, tag: 'part' },
  ]);
  assert.deepEqual(p, [
    { enemyKey: 'c', count: 1, gate: 'lower', t: 0, fly: false, elite: true, boss: true, source: 'wave', tag: 'boss' },
    { enemyKey: 'a', count: 1, gate: 'lower', t: 3, fly: false, elite: false, boss: false, source: 'wave', tag: null },
    { enemyKey: 'b', count: 1, gate: 'lower', t: 4, fly: true, elite: true, boss: false, source: 'bounty', tag: 'bounty' },
    { enemyKey: 'a', count: 2, gate: 'upper', t: 5, fly: false, elite: false, boss: false, source: 'wave', tag: null },
  ]);
  // a real round: the preview Σ equals the spawned enemies, gates follow the action routes
  const gd = new GameData(DATA, 'mode_multi_normal');
  const setup = setupMatchWaves(gd, createRng(11));
  const w = buildNormalWave(gd, createRng(11), setup.factions, 12);
  const pv = previewOf(w.spawns);
  assert.equal(pv.length, w.spawns.length);
  assert.equal(pv.reduce((n, e) => n + e.count, 0), w.spawns.reduce((n, s) => n + s.count, 0));
  assert.ok(pv.some((e) => e.gate === 'upper') && pv.some((e) => e.gate === 'lower'), 'R12 uses both gates');
  for (let i = 1; i < pv.length; i++) assert.ok(pv[i].t >= pv[i - 1].t, 'sorted by spawn time');
  for (const r of [1, 2, 3]) assert.ok(previewOf(buildNormalWave(gd, createRng(1), setup.factions, r).spawns).every((e) => e.gate === 'lower'), `R${r}: lower gate only`);
});
