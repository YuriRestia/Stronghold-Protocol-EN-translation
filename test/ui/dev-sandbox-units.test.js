// (fork) The dev sandbox's board entries (public/dev/sandbox-units.js): the `units=` URL round trip with the module and
// the starting SP, old links still reading, and the battle input an entry becomes (moduleId only for an elite, the
// starting SP through the sim's own carryState input).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits, unitsParam, battleUnit, parseSp, spValue, skillSpOf, cardPlace, sandboxZoom, leftOutReason, matchUnitsByOperator, holdSkill, SP_FULL, SP_FULL_VALUE } from '../../public/dev/sandbox-units.js';

const round = (raw) => unitsParam(parseUnits(raw));

test('dev sandbox units: module and starting SP survive the URL round trip', () => {
  const raw = 'chess_char_2_18_b:12,5:1:LEFT:char_431_ashlok@epoque#28!chess_item_6_09_e_a|m=uniequip_002_ashlok|sp=12;chess_char_3_11_a:11,4:0:RIGHT|sp=full';
  const units = parseUnits(raw);
  assert.equal(units.length, 2);
  assert.equal(units[0].module, 'uniequip_002_ashlok');
  assert.equal(units[0].sp, 12);
  assert.equal(units[0].skin, 'char_431_ashlok@epoque#28');
  assert.deepEqual(units[0].items, ['chess_item_6_09_e_a']);
  assert.equal(units[1].module, null);
  assert.equal(units[1].sp, SP_FULL);
  assert.equal(round(raw), raw);
  // through URLSearchParams too (the page writes it with history.replaceState)
  const q = new URLSearchParams({ units: unitsParam(units) });
  assert.equal(round(new URLSearchParams(q.toString()).get('units')), raw);
});

test('dev sandbox units: "none", a 自选 pick\'s module, old links and junk', () => {
  const [none] = parseUnits('chess_char_2_18_b:12,5:0:RIGHT|m=none');
  assert.equal(none.module, 'none');
  assert.equal(round('chess_char_2_18_b:12,5:0:RIGHT|m=none'), 'chess_char_2_18_b:12,5:0:RIGHT|m=none');
  const [diy] = parseUnits('chess_char_6_diy1_b~char_4134_cetsyr:10,3:2:UP|m=uniequip_002_cetsyr');
  assert.deepEqual(diy.diy, { charId: 'char_4134_cetsyr', skillIndex: 2, uniEquipId: 'uniequip_002_cetsyr' });
  assert.equal(parseUnits('chess_char_6_diy1_b~char_4134_cetsyr:10,3:2:UP|m=none')[0].diy.uniEquipId, null);
  // a link from before modules / SP: same entries, nothing added when written back
  const old = 'chess_char_1_02_a:9,3:1:RIGHT:char_199_yak@summer#1;chess_char_2_05_a:10,4:0:RIGHT!chess_item_6_09_e_a,chess_item_1_02_e_a';
  assert.equal(round(old), old);
  assert.ok(parseUnits(old).every((u) => u.module === null && u.sp === null));
  // junk options are dropped, the entry kept
  const [j] = parseUnits('chess_char_1_02_a:9,3:0:RIGHT|m=bad-id!|sp=-4');
  assert.deepEqual([j.module, j.sp], [null, null]);
  assert.equal(unitsParam([j]), 'chess_char_1_02_a:9,3:0:RIGHT');
  const [k] = parseUnits('chess_char_1_02_a:9,3:0:RIGHT|sp=abc|x=1');
  assert.equal(k.sp, null);
  assert.equal(k.module, null);
});

test('dev sandbox units: starting SP values', () => {
  assert.equal(parseSp(''), null);
  assert.equal(parseSp(null), null);
  assert.equal(parseSp('full'), SP_FULL);
  assert.equal(parseSp('7.9'), 7);
  assert.equal(parseSp('99999'), SP_FULL_VALUE);
  assert.equal(parseSp('-1'), null);
  assert.equal(spValue(SP_FULL), SP_FULL_VALUE);
  assert.equal(spValue(0), 0);
  assert.equal(spValue(null), null);
  assert.deepEqual(skillSpOf({ spType: 'INCREASE_WITH_TIME', spCost: 30, initSp: 10, maxChargeTime: 3 }), { init: 10, cost: 30, max: 90, passive: false });
  assert.deepEqual(skillSpOf({ skillType: 'PASSIVE', spType: 8, spCost: 0 }), { init: null, cost: 0, max: null, passive: true });
});

test('dev sandbox units: the battle input — moduleId for an elite only, SP as carryState, a 自选 pick as its diy', () => {
  const [u] = parseUnits('chess_char_2_18_b:12,5:1:LEFT|m=uniequip_002_ashlok|sp=full');
  assert.deepEqual(battleUnit(u, 7, { golden: true }), {
    uid: 7, kind: 'chess', chessId: 'chess_char_2_18_b', row: 12, col: 5, dir: 'LEFT', items: [], skillIndex: 1,
    moduleId: 'uniequip_002_ashlok', carryState: { sp: SP_FULL_VALUE },
  });
  // a normal form keeps its module choice for the elite but fights without one
  assert.equal('moduleId' in battleUnit(u, 7, { golden: false }), false);
  // defaults: no loadout or carry fields at all (the sim's own defaults, as before)
  const [d] = parseUnits('chess_char_1_02_a:9,3:0:RIGHT');
  assert.deepEqual(battleUnit(d, 1, { golden: false }), { uid: 1, kind: 'chess', chessId: 'chess_char_1_02_a', row: 9, col: 3, dir: 'RIGHT', items: [], skillIndex: 0 });
  const [p] = parseUnits('chess_char_6_diy1_b~char_4134_cetsyr:10,3:2:UP|m=uniequip_002_cetsyr|sp=5');
  const b = battleUnit(p, 2, { golden: true });
  assert.deepEqual(b.diy, { charId: 'char_4134_cetsyr', skillIndex: 2, uniEquipId: 'uniequip_002_cetsyr' });
  assert.equal(b.skillIndex, undefined);
  assert.equal(b.moduleId, undefined);
  assert.deepEqual(b.carryState, { sp: 5 });
});

test('dev sandbox units: the unit card sits beside its piece, flips left at the right edge, stays inside the window', () => {
  const g = { x: 600, y: 400, s: 60 };
  assert.deepEqual(cardPlace(g, 360, 500, 1600, 900), { left: 669, top: 280 });
  assert.deepEqual(cardPlace({ ...g, x: 1400 }, 360, 500, 1600, 900), { left: 971, top: 280 }, 'no room on the right: on the left');
  assert.equal(cardPlace({ ...g, y: 880 }, 360, 500, 1600, 900).top, 390, 'kept above the bottom edge');
  assert.equal(cardPlace({ ...g, y: 20 }, 360, 500, 1600, 900).top, 10, 'kept below the top edge');
  assert.deepEqual(cardPlace(null, 360, 500, 1600, 900), { left: 1230, top: 10 }, 'no tile on screen: top right');
});

test('dev sandbox units: the cards grow a little on wide windows (1 to 1.15)', () => {
  assert.equal(sandboxZoom(1024), 1);
  assert.equal(sandboxZoom(1600), 1);
  assert.equal(sandboxZoom(1920), 1.15);
  assert.equal(sandboxZoom(3840), 1.15);
});

test('dev sandbox units: a unit the link names but the game version cannot place is reported, not dropped silently', () => {
  // Season 1's Arene (char_271_spikes) in a Season 2 Custom Squad slot: the slot exists, the pick does not
  const [arene] = parseUnits('chess_char_5_diy1_a~char_271_spikes:9,3:0:RIGHT:char_271_spikes@winter%232');
  assert.equal(arene.diy.charId, 'char_271_spikes');
  assert.match(leftOutReason(arene, { chess: { tier: 5 }, rec: null, tier: 5, allowed: false }), /char_271_spikes.*not in this game version's tier 5 Custom Squad pool/);
  const [gone] = parseUnits('chess_char_9_99_a:9,3:0:RIGHT');
  assert.match(leftOutReason(gone, { chess: null, rec: null, allowed: false }), /chess_char_9_99_a.*not in this game version's data/);
  const [melee] = parseUnits('chess_char_1_02_a:10,4:0:RIGHT');
  assert.match(leftOutReason(melee, { chess: {}, rec: {}, allowed: false, name: 'Matterhorn' }), /^Matterhorn \(chess_char_1_02_a\): can't be deployed on row 10, col 4/);
  assert.equal(leftOutReason(melee, { chess: {}, rec: {}, allowed: true }), null);
});

test('dev sandbox units: a season switch keeps the operators, not the piece ids (chess_char_2_15_b is Arene in Season 1, Akkord in Season 2)', () => {
  const s1 = { chess_char_2_15_b: { chessId: 'chess_char_2_15_b', charId: 'char_271_spikes', isGolden: true }, chess_char_1_02_a: { chessId: 'chess_char_1_02_a', charId: 'char_199_yak', isGolden: false } };
  const s2 = [{ chessId: 'chess_char_2_15_b', charId: 'char_4051_akkord', isGolden: true }, { chessId: 'chess_char_1_07_a', charId: 'char_199_yak', isGolden: false },
    { chessId: 'chess_char_1_07_b', charId: 'char_199_yak', isGolden: true }];
  const units = parseUnits('chess_char_2_15_b:9,3:0:RIGHT;chess_char_1_02_a:10,3:1:LEFT|sp=5;chess_char_6_diy1_a~char_4134_cetsyr:11,3:2:UP');
  const { kept, gone } = matchUnitsByOperator(units, s2, (u) => (u.diy ? null : s1[u.chessId]));
  assert.deepEqual(gone.map((u) => u.chessId), ['chess_char_2_15_b'], 'Arene is not in Season 2: left out, never Akkord');
  assert.equal(unitsParam(kept), 'chess_char_1_07_a:10,3:1:LEFT|sp=5;chess_char_6_diy1_a~char_4134_cetsyr:11,3:2:UP', 'the same operator and form under its id there; a Custom Squad pick as it is');
});

test('dev sandbox units: the skill hold (forced on / off, infinite SP, infinite duration) and its link fields', () => {
  const raw = 'chess_char_4_02_b:11,4:2:RIGHT|cast=on|isp=1|idur=1;chess_char_3_05_b:9,3:0:RIGHT|cast=off';
  const [a, b] = parseUnits(raw);
  assert.deepEqual([a.cast, a.infSp, a.infDur, b.cast, b.infSp, b.infDur], ['on', true, true, 'off', false, false]);
  assert.equal(unitsParam([a, b]), raw);
  assert.equal(parseUnits('chess_char_1_02_a:9,3:0:RIGHT|cast=maybe')[0].cast, null, 'junk is Auto');
  // a stand-in for server/sim/skills.js Skill: what holdSkill reads and calls
  const skill = (o = {}) => ({ kind: 'duration', duration: 24, timeLeft: 0, active: false, charges: 0, maxCharges: 1, sp: 0, spCost: 110,
    noSkill: false, unit: { alive: true, deployed: true }, get isTimed() { return this.kind !== 'passive'; },
    activate(reason, { free }) { if (!free) return false; this.active = true; this.timeLeft = this.duration; return true; },
    end() { this.active = false; this.timeLeft = 0; }, setSpTotal(n) { this.charges = this.maxCharges; this.sp = Math.min(n, this.spCost); }, ...o });
  const on = skill();
  assert.deepEqual(holdSkill(on, { cast: 'on' }), ['start'], 'forced on: started for free');
  on.timeLeft = 3;
  assert.deepEqual(holdSkill(on, { cast: 'on', infDur: true }), ['dur'], 'infinite duration: topped up while it runs');
  assert.equal(on.timeLeft, 24);
  const off = skill({ active: true, timeLeft: 10, sp: 50, charges: 1 });
  assert.deepEqual(holdSkill(off, { cast: 'off', infSp: true }), ['end', 'sp'], 'off wins: ended, SP emptied');
  assert.deepEqual([off.active, off.sp, off.charges], [false, 0, 0]);
  const sp = skill();
  assert.deepEqual(holdSkill(sp, { infSp: true }), ['sp'], 'infinite SP: charged while it does not run');
  assert.deepEqual(holdSkill(sp, { infSp: true }), [], 'already full: nothing');
  const ammo = skill({ kind: 'ammo', active: true, ammoLeft: 1, ammoMax: 8, timeLeft: Infinity });
  assert.deepEqual(holdSkill(ammo, { infDur: true }), ['dur']);
  assert.equal(ammo.ammoLeft, 8, 'an ammo skill gets its ammo back');
  assert.deepEqual(holdSkill(skill({ kind: 'passive' }), { cast: 'on' }), [], 'a passive skill is left alone');
  assert.deepEqual(holdSkill(skill({ unit: { alive: false, deployed: true } }), { cast: 'on' }), [], 'nor a dead unit');
});

test('dev sandbox units: infinite HP rides in the link (|ihp=1)', () => {
  const raw = 'chess_char_4_02_b:11,4:2:RIGHT|cast=on|ihp=1';
  const [u] = parseUnits(raw);
  assert.equal(u.infHp, true);
  assert.equal(unitsParam([u]), raw);
  assert.equal(parseUnits('chess_char_4_02_b:11,4:2:RIGHT')[0].infHp, false);
});
