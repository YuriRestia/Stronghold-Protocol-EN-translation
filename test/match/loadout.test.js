// Operator loadout (DESIGN §16) — shared checks (shared/protocol.js checkLoadout / loadoutOptions / resolveLoadout),
// the match side (seats[].loadout → PlayerState → PlayerBattleInput units skillIndex / moduleId → BattleSpec, m.private
// `loadout`, Match.setLoadout only during INFO_CHECK, bots on defaults) and the solo timers (user playtest #11: official
// 独立模拟 has no countdown outside combat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { validateC2S, checkLoadout, loadoutOptions, resolveLoadout, isLoadoutEntries, MODULE_NONE, LOADOUT_LIMITS } from '../../shared/protocol.js';
import { buildBattleSpec } from '../../server/sim/spec.js';
import { DATA, makeMatch } from './harness.js';

const chess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const visible = Object.values(DATA.chess).filter((c) => !c.isGolden && c.visible && !c.isHidden && !c.isDiy);
// fixtures from the real data (DESIGN §16 skills[] / modules[])
const INSIDE = 'chess_char_1_01_a'; // 隐现: S1 / S2 (default S2), elite module MAR-X only
const SWIRE = 'chess_char_3_04_a'; // 琳琅诗怀雅: three modules
const multiMod = visible.find((c) => (chess(c.goldenId)?.modules || []).length >= 2);
const hidden = Object.values(DATA.chess).find((c) => !c.isGolden && (c.isHidden || c.visible === false));

function seatsWith(loadout, { bots = 0, botLoadout = null } = {}) {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout }];
  for (let i = 0; i < bots; i++) seats.push({ seat: seats.length, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true, loadout: botLoadout });
  return seats;
}

/** Put a chess piece straight onto a board tile (no pool / legality: the battle input is what is under test). */
function place(m, ps, chessId, row, col) {
  const p = ps.newPiece('chess', chessId);
  ps.board.set(`${row},${col}`, p);
  return p;
}

// ---- shared checks -------------------------------------------------------------------------------------------------

test('data carries the §16 choices every visible chess needs (skills at both statuses, elite modules + none)', () => {
  assert.equal(visible.length, 112);
  for (const c of visible) {
    const g = chess(c.goldenId);
    const o = loadoutOptions(c, g);
    assert.ok(o.skills.length >= 2, `${c.name}: selectable skills`);
    assert.ok(o.skills.includes(o.defaultSkill), `${c.name}: default skill is selectable`);
    assert.equal(o.defaultSkill, c.skill.index, `${c.name}: default = defaultSkillIndex`);
    assert.ok(o.modules.includes(MODULE_NONE) && o.modules.includes(o.defaultModule), `${c.name}: modules`);
  }
  const o = loadoutOptions(chess(INSIDE), chess(chess(INSIDE).goldenId));
  assert.deepEqual(o.skills, [0, 1]);
  assert.equal(o.defaultSkill, 1);
  assert.deepEqual(o.modules, ['uniequip_002_inside', MODULE_NONE]);
  assert.equal(o.defaultModule, 'uniequip_002_inside');
  assert.ok(multiMod, 'a chess with several modules');
});

test('room.loadout structure: map of ≤160 base ids → { skill?, module? }, nothing else', () => {
  const ok = (entries) => validateC2S({ t: 'room.loadout', entries }) === null;
  assert.ok(ok({}));
  assert.ok(ok({ [INSIDE]: { skill: 0 } }));
  assert.ok(ok({ [INSIDE]: { module: 'none' } }));
  assert.ok(ok({ [INSIDE]: { skill: 1, module: 'uniequip_002_inside' } }));
  assert.ok(!ok([]), 'array');
  assert.ok(!ok(null), 'null');
  assert.ok(!ok({ [INSIDE]: {} }), 'empty entry');
  assert.ok(!ok({ [INSIDE]: { skill: 0, extra: 1 } }), 'unknown field');
  assert.ok(!ok({ [INSIDE]: { skill: LOADOUT_LIMITS.skillIndex + 1 } }), 'skill index range');
  assert.ok(!ok({ [INSIDE]: { skill: 0.5 } }), 'non-integer skill');
  assert.ok(!ok({ [INSIDE]: { module: '' } }), 'empty module id');
  assert.ok(!ok({ [INSIDE]: { module: 'a b' } }), 'bad module id');
  assert.ok(!ok({ 'bad id!': { skill: 0 } }), 'bad chess id');
  const many = {};
  for (let i = 0; i <= LOADOUT_LIMITS.entries; i++) many[`c${i}`] = { skill: 0 };
  assert.ok(!ok(many), 'too many entries');
  assert.equal(validateC2S({ t: 'room.loadout' }), 'bad field entries');
  assert.ok(!isLoadoutEntries(Object.create({ [INSIDE]: { skill: 0 } })), 'plain objects only');
});

test('checkLoadout: strict semantic check against the data; defaults dropped; normalised { skill, module }', () => {
  const get = chess;
  assert.deepEqual(checkLoadout({}, get), { ok: true, loadout: {} });
  // a non-default skill; the module is completed with the default
  assert.deepEqual(checkLoadout({ [INSIDE]: { skill: 0 } }, get), { ok: true, loadout: { [INSIDE]: { skill: 0, module: 'uniequip_002_inside' } } });
  // the default skill + default module ⇒ nothing stored
  assert.deepEqual(checkLoadout({ [INSIDE]: { skill: 1 } }, get), { ok: true, loadout: {} });
  assert.deepEqual(checkLoadout({ [INSIDE]: { module: 'none' } }, get), { ok: true, loadout: { [INSIDE]: { skill: 1, module: 'none' } } });
  const sg = chess(chess(SWIRE).goldenId);
  const alt = sg.modules.find((x) => !x.isDefault).uniEquipId;
  assert.deepEqual(checkLoadout({ [SWIRE]: { module: alt } }, get).loadout[SWIRE].module, alt);
  // illegal: S3 of a chess with two skills, a module of another character, golden / unknown / hidden ids
  const bad = (entries, code = ERR.BAD_TARGET) => {
    const r = checkLoadout(entries, get);
    assert.equal(r.error, code, JSON.stringify(entries));
    assert.equal(typeof r.detail, 'string');
  };
  bad({ [INSIDE]: { skill: 2 } });
  bad({ [INSIDE]: { module: alt } });
  bad({ [INSIDE]: { module: 'uniequip_999_nobody' } });
  bad({ [chess(INSIDE).goldenId]: { skill: 0 } });
  bad({ chess_char_9_99_a: { skill: 0 } });
  if (hidden) bad({ [hidden.chessId]: { skill: 0 } });
  // one bad entry rejects the whole loadout
  bad({ [SWIRE]: { module: alt }, [INSIDE]: { skill: 5 } });
  bad([], ERR.BAD_MSG);
  // a chess without an elite record has no module choice
  const solo = { ...chess(INSIDE), goldenId: null };
  const noGolden = (id) => (id === INSIDE ? solo : chess(id));
  assert.equal(checkLoadout({ [INSIDE]: { module: 'none' } }, noGolden).error, ERR.BAD_TARGET);
  assert.deepEqual(checkLoadout({ [INSIDE]: { skill: 0 } }, noGolden), { ok: true, loadout: { [INSIDE]: { skill: 0, module: null } } });
});

test('resolveLoadout: normal chess → moduleId null; elite → the chosen module / none; others → defaults', () => {
  const lo = checkLoadout({ [INSIDE]: { skill: 0, module: 'none' } }, chess).loadout;
  const n = chess(INSIDE);
  const g = chess(n.goldenId);
  assert.deepEqual(resolveLoadout(lo, n, chess), { skillIndex: 0, moduleId: null });
  assert.deepEqual(resolveLoadout(lo, g, chess), { skillIndex: 0, moduleId: 'none' });
  assert.deepEqual(resolveLoadout(null, g, chess), { skillIndex: 1, moduleId: 'uniequip_002_inside' });
  const other = chess(SWIRE);
  assert.deepEqual(resolveLoadout(lo, other, chess), { skillIndex: other.skill.index, moduleId: null });
  // a stale entry (not selectable any more) falls back to the defaults, never throws
  assert.deepEqual(resolveLoadout({ [INSIDE]: { skill: 7, module: 'gone' } }, g, chess), { skillIndex: 1, moduleId: 'uniequip_002_inside' });
});

// ---- match side ------------------------------------------------------------------------------------------------------------

test('seats[].loadout → PlayerState (re-checked, frozen), m.private.loadout, battle input skillIndex / moduleId; bots on defaults', () => {
  const sg = chess(chess(SWIRE).goldenId);
  const alt = sg.modules.find((x) => !x.isDefault).uniEquipId;
  const loadout = checkLoadout({ [INSIDE]: { skill: 0, module: 'none' }, [SWIRE]: { skill: 0, module: alt } }, chess).loadout;
  const h = makeMatch({ mode: 'coop', seats: seatsWith(loadout, { bots: 1, botLoadout: loadout }), seed: 3 }).start();
  const m = h.m;
  const ps = h.ps('p_0');
  const bot = h.ps('ai_0');
  assert.deepEqual(ps.loadout, loadout);
  assert.ok(Object.isFrozen(ps.loadout) && Object.isFrozen(ps.loadout[INSIDE]));
  assert.deepEqual(bot.loadout, {}, 'bots fight with the defaults');
  h.flushAll();
  assert.deepEqual(h.lastTo('p_0', 'm.private').loadout, loadout, 'm.private exposes the effective loadout');

  h.toPrep(1);
  for (const p of [...ps.board.values()]) ps.returnCopies(p);
  ps.board.clear();
  place(m, ps, INSIDE, 9, 3); // normal: S1, no module
  place(m, ps, chess(INSIDE).goldenId, 10, 3); // elite: S1, module none
  place(m, ps, sg.chessId, 11, 3); // elite: S1, the alternative module
  const plain = visible.find((c) => c.chessId !== INSIDE && c.chessId !== SWIRE);
  place(m, ps, plain.goldenId, 12, 3); // not in the loadout: defaults
  const units = ps.battleInput().units;
  const by = (id) => units.find((u) => u.chessId === id);
  assert.equal(by(INSIDE).skillIndex, 0);
  assert.equal(by(INSIDE).moduleId, null, 'normal chess have no module');
  assert.deepEqual([by(chess(INSIDE).goldenId).skillIndex, by(chess(INSIDE).goldenId).moduleId], [0, 'none']);
  assert.deepEqual([by(sg.chessId).skillIndex, by(sg.chessId).moduleId], [0, alt]);
  const pg = chess(plain.goldenId);
  assert.deepEqual([by(plain.goldenId).skillIndex, by(plain.goldenId).moduleId], [pg.skill.index, (pg.modules.find((x) => x.isDefault) || {}).uniEquipId || 'none']);
  // the BattleSpec keeps them (JSON round trip; the normal chess's null module is dropped = default)
  const spec = buildBattleSpec(m._normalOpts(ps));
  const su = spec.players[0].units;
  assert.equal(su.find((u) => u.chessId === INSIDE).skillIndex, 0);
  assert.ok(!('moduleId' in su.find((u) => u.chessId === INSIDE)));
  assert.equal(su.find((u) => u.chessId === sg.chessId).moduleId, alt);
  // the bot's own board uses the defaults even for the same chess
  bot.board.clear();
  place(m, bot, chess(INSIDE).goldenId, 10, 3);
  const bu = bot.battleInput().units[0];
  assert.deepEqual([bu.skillIndex, bu.moduleId], [1, 'uniequip_002_inside']);
  m.dispose();
});

test('client-side combat: the b.start spec of the owner carries the loadout of its board', () => {
  const loadout = checkLoadout({ [INSIDE]: { skill: 0, module: 'none' } }, chess).loadout;
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats: seatsWith(loadout), seed: 9, clientCombat: true, clients: false }).start();
  const m = h.m;
  h.toPrep(1);
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values()]) ps.returnCopies(p);
  ps.board.clear();
  place(m, ps, chess(INSIDE).goldenId, 10, 3);
  ps.resolveTemp();
  assert.deepEqual(m.handle('p_0', { t: 'g.ready', ready: true }), { ok: true });
  h.run(() => m.phase === PHASE.COMBAT);
  const start = h.lastTo('p_0', 'b.start');
  assert.ok(start && start.spec, 'b.start sent');
  const u = start.spec.players[0].units.find((x) => x.chessId === chess(INSIDE).goldenId);
  assert.deepEqual([u.skillIndex, u.moduleId], [0, 'none']);
  m.dispose();
});

test('Match.setLoadout: accepted during INFO_CHECK only; re-checked; bots / strangers refused', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 4 }).start();
  const m = h.m;
  const ps = h.ps('p_0');
  assert.deepEqual(ps.loadout, {});
  const lo = checkLoadout({ [INSIDE]: { skill: 0 } }, chess).loadout;
  assert.deepEqual(m.setLoadout('p_0', lo), { ok: true });
  assert.deepEqual(ps.loadout, lo);
  h.flushAll();
  assert.deepEqual(h.lastTo('p_0', 'm.private').loadout, lo);
  assert.equal(m.setLoadout('p_0', { [INSIDE]: { skill: 9 } }).error, ERR.BAD_TARGET, 'illegal for the data');
  assert.deepEqual(ps.loadout, lo, 'unchanged after a refusal');
  assert.equal(m.setLoadout('ai_0', lo).error, ERR.NOT_IN_ROOM);
  assert.equal(m.setLoadout('nobody', lo).error, ERR.NOT_IN_ROOM);
  for (const id of ['p_0', 'p_1']) m.handle(id, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  const r = m.setLoadout('p_0', {});
  assert.equal(r.error, ERR.WRONG_PHASE, 'locked after INFO_CHECK');
  assert.deepEqual(ps.loadout, lo);
  m.dispose();
});

test('an illegal seat loadout (stale data) falls back to the defaults with a warning', () => {
  const h = makeMatch({ mode: 'solo', seats: seatsWith({ [INSIDE]: { skill: 6, module: null } }), seed: 2 });
  assert.deepEqual(h.ps('p_0').loadout, {});
  assert.ok(h.logs.warn.some((w) => /loadout/.test(w)));
  h.m.dispose();
});

// ---- solo timers (#11) ---------------------------------------------------------------------------------------------------

test('solo: no deadline outside combat (INFO_CHECK, strategy draft, 机变, prep and the fixed transitions); combat timed', () => {
  // scripted battles (no leaks: the seat survives to the 机变 rounds), paced in virtual time (combat deadlines are real)
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 12, fake: true, instant: false }).start();
  const m = h.m;
  const seen = new Map(); // phase → [deadline…]
  const note = (pub) => { if (!seen.has(pub.phase)) seen.set(pub.phase, []); seen.get(pub.phase).push(pub.deadline); };
  h.onBroadcast.push((msg) => { if (msg.t === 'm.public') note(msg); });
  for (const msg of h.bc) if (msg.t === 'm.public') note(msg);
  // INFO_CHECK waits for the player (no 25 s guard in solo)
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.equal(m.deadline, 0);
  h.sched.advance(10 * 60_000);
  assert.equal(m.phase, PHASE.INFO_CHECK, 'solo briefing is untimed');
  m.handle('p_0', { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.equal(m.deadline, 0);
  h.sched.advance(5 * 60_000);
  assert.equal(m.phase, PHASE.BAND_DRAFT, 'solo strategy draft is untimed');
  assert.ok(h.drive(() => m.phase === PHASE.PREP && m.round === 2), 'reached PREP R2');
  h.sched.advance(60 * 60_000);
  assert.equal(m.phase, PHASE.PREP, 'solo prep is untimed');
  assert.equal(m.round, 2);
  // on past the first 机变 round
  const spRounds = m.gd.spRounds();
  const lastR = (spRounds.find((r) => r > 1) || 3) + 1;
  assert.ok(h.drive(() => m.phase === PHASE.PREP && m.round === lastR), `reached PREP R${lastR}`);
  h.flushAll();
  for (const ph of [PHASE.INFO_CHECK, PHASE.BAND_DRAFT, PHASE.BATTLE_CHECK, PHASE.ROUND_START, PHASE.PREP, PHASE.SETTLE]) {
    assert.ok(seen.has(ph), `saw ${ph}`);
    assert.ok(seen.get(ph).every((d) => d === 0), `${ph}: no deadline in solo (${seen.get(ph)})`);
  }
  if (spRounds.some((r) => r < lastR)) {
    assert.ok(seen.has(PHASE.SP_DRAFT), 'saw 机变');
    assert.ok(seen.get(PHASE.SP_DRAFT).every((d) => d === 0), '机变 untimed in solo');
  }
  assert.ok(seen.get(PHASE.COMBAT).some((d) => d > 0), 'combat keeps its time limit');
  m.dispose();
});

test('co-op keeps its guards: INFO_CHECK 45 s, prep timer, transition deadlines', () => {
  // two humans: a single human is untimed like solo (Match.soloUntimed, user playtest #4 item 3)
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 12 }).start();
  const m = h.m;
  const pub = h.lastBc('m.public');
  assert.equal(pub.phase, PHASE.INFO_CHECK);
  assert.equal(pub.deadline - pub.serverNow, 45000);
  h.toPrep(1);
  assert.ok(m.deadline > 0, 'co-op prep is timed');
  m.dispose();
});

// ---- review fixes -----------------------------------------------------------------------------------------------------------

test('a skill summon is a hand card only with that skill (user playtest #6): 赫默 on S2 gets her 医疗探机, on S1 none', async () => {
  const { give } = await import('./harness.js');
  const SILENCE = 'chess_char_2_02_a';
  const DRONE = 'token_10000_silent_healrb';
  assert.equal(chess(SILENCE).skills.find((s) => s.overrideTokenKey === DRONE)?.isDefault, true, 'fixture: the drone is the default S2 summon');
  // the drone is placed by hand (PRTS 卫戍协议/帮助 "可手动部署的附属召唤物…加入手牌区"); in battle it takes its tile when S2
  // fires (test/content/playtest6_summons.test.js) — only S2 (index 1, the default) makes it
  const tokensIn = (ps, id = DRONE) => [...ps.hand, ...ps.temp, ...ps.board.values()].filter((p) => p && p.kind === 'token' && p.id === id);
  assert.equal(DATA.tokens[DRONE].placeable, true, 'tokens.json: a manually deployable summon');
  for (const skill of [null, 0, 1]) {
    const want = skill === 0 ? 0 : 1;
    const lo = skill == null ? null : checkLoadout({ [SILENCE]: { skill } }, chess).loadout;
    const h = makeMatch({ mode: 'solo', seats: seatsWith(lo), seed: 5 }).start();
    h.toPrep(1);
    const ps = h.ps('p_0');
    for (const p of [...ps.board.values()]) ps.returnCopies(p);
    ps.board.clear();
    ps.hand.fill(null);
    give(h.m, ps, SILENCE, 'board', [9, 3]);
    assert.equal(tokensIn(ps).length, want, `normal 赫默, skill ${skill ?? 'default'}`);
    ps.board.clear();
    ps.hand.fill(null);
    give(h.m, ps, chess(SILENCE).goldenId, 'board', [9, 4]);
    assert.equal(tokensIn(ps).length, want, `elite 赫默, skill ${skill ?? 'default'}`);
    // a talent summon still is a hand card: 伺夜 → 狼群
    ps.board.clear();
    ps.hand.fill(null);
    give(h.m, ps, 'chess_char_3_19_a', 'board', [9, 5]);
    assert.equal(tokensIn(ps, 'token_10028_vigil_wolf').length, 1, '伺夜 sends its 狼群 to the hand');
    h.m.dispose();
  }
});
