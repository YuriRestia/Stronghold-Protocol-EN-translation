// test/content/feedback5-we2-summon-hand.test.js — 0.2.0 WE2 #21: the hand count of every 自选 summoner's placeable summon
// is its deploy limit (PRTS 卫戍协议/帮助 §战斗部署 "根据召唤物部署数量上限（非初始持有量），发送等量召唤物至手牌区"), and the
// data's deploy limit / holding carry the tokens' own talent additions (tools/build-data.mjs tokenTalentDeckBonus: the
// hidden "TOKEN数" talent max_deploy_count / max_deck_stack_cnt on top of the attribute frame). Official counts: the owners'
// talents (麦哲伦 / 令 / 电弧 "最多同时部署3个", SUM-Y stage 2+ "最多同时部署4个", 白铁 / 娜斯提 "最多可部署2个", 望 "可以使用6枚
// 棋子" — 7 at full potential (望's 潜能 3 「第一天赋效果增强」, the owner's decision of 2026-10-07) —, TRP-X +1), PRTS 幻影 备注 "最大可部署数量为3" (夜莺).
// #24: a summon no owner shows (displayTokenDict: the variants' `display` source) is its skill's own object, never a hand
// card — 予愿安洁莉娜 S3's “一会儿见！” (PRTS 予愿安洁莉娜 S3 备注: the skill deploys it at her initial tile).
// Run: node --test test/content/feedback5-we2-summon-hand.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { diyGameData } from '../../server/match/player/diy.js';
import { diyRecord, diySlot } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const DATA = { chess: CHESS, backups: BACKUPS };
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const STAGE = { 5: 1, 6: 3 };
const statusOf = (tier, elite) => (elite ? `2/60/7/${STAGE[tier]}` : '2/1/4/0');

/** The official hand count of `charId`'s summon under a module at its stage (null module = none). */
function official(charId, mod, stage) {
  switch (charId) {
    case 'char_248_mgllan': return mod === 'uniequip_003_mgllan' && stage >= 2 ? 4 : 3;   // SUM-Y stage 2+: 最多同时部署4个
    case 'char_2023_ling': return mod === 'uniequip_002_ling' && stage >= 2 ? 4 : 3;      // SUM-Y stage 2+
    case 'char_4195_radian': return 3;
    case 'char_4072_ironmn': return 2;
    case 'char_4212_nasti': return 2;
    case 'char_179_cgbird': return 3;                                                      // PRTS 幻影 备注
    case 'char_2027_wang': return mod === 'uniequip_002_wang' ? 8 : 7;                     // 7 at full potential, TRP-X +1
    case 'char_4048_doroth': return 9;                                                     // 10 / 13, the hand's 9 cap
    default: return 1;
  }
}

const gd = new GameData(getData({ log: { warn() {}, error() {}, info() {} } }), 'mode_multi_hard');

test('every 自选 summoner: the hand count of each placeable summon in every form, skill and module is the official one', () => {
  const owners = new Map();   // charId → placeable token ids it makes
  for (const [tid, t] of Object.entries(BACKUPS.tokens)) {
    if (t.kind !== 'summon' || t.placeable !== true) continue;
    for (const key of Object.keys(t.variants)) {
      const cid = key.split('@')[0];
      if (!owners.has(cid)) owners.set(cid, new Set());
      owners.get(cid).add(tid);
    }
  }
  assert.ok(['char_248_mgllan', 'char_2023_ling', 'char_4195_radian', 'char_4072_ironmn', 'char_179_cgbird', 'char_2027_wang'].every((c) => owners.has(c)));
  let checked = 0;
  for (const [charId] of owners) {
    if (!BACKUPS.diy.ownedPool.includes(charId)) continue;
    for (const tier of [5, 6]) {
      for (const elite of [false, true]) {
        const form = BACKUPS.units[charId].forms[statusOf(tier, elite)];
        for (const mod of elite ? [null, ...(form.modules ?? []).map((m) => m.uniEquipId)] : [null]) {
          for (const s of form.skills) {
            const pick = { charId, skillIndex: s.index, uniEquipId: mod };
            const slot = diySlot(SLOT[tier], DATA);
            const id = elite ? slot.goldenId : slot.baseId;
            const rec = diyRecord(SLOT[tier], pick, { elite, data: DATA });
            assert.ok(rec, `${charId} T${tier} ${elite ? 'elite' : 'normal'} ${mod} S${s.index + 1}`);
            const view = diyGameData(gd, new Map([[id, rec]]));
            for (const { tokenId, count } of view.placeableTokens(id, { skillIndex: s.index, moduleId: mod })) {
              assert.equal(count, official(charId, mod, elite ? STAGE[tier] : 0), `${charId} T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'} S${s.index + 1}: ${tokenId}`);
              checked++;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 200, `${checked} hand counts checked`);
});

test('the data: deploy limit / holding = the attribute frame + the token talents\' max_deploy_count / max_deck_stack_cnt (a module token part of the same talent replaces it)', () => {
  const v = (tid, owner) => BACKUPS.tokens[tid].variants[owner];
  // 麦哲伦: 1 + 2 standing, 0 + 5 held; SUM-Y +3 held, stage 3 its token part max_deploy_count 3 ⇒ 4
  const d1 = 'token_10005_mgllan_drone1';
  assert.deepEqual([v(d1, 'char_248_mgllan@2/1/4/0').stats.deployLimit, v(d1, 'char_248_mgllan@2/1/4/0').stats.deckStack], [3, 5]);
  assert.deepEqual([v(d1, 'char_248_mgllan@2/60/7/1').byModule.uniequip_003_mgllan.stats.deployLimit, v(d1, 'char_248_mgllan@2/60/7/1').byModule.uniequip_003_mgllan.stats.deckStack], [3, 8]);
  assert.deepEqual([v(d1, 'char_248_mgllan@2/60/7/3').byModule.uniequip_003_mgllan.stats.deployLimit, v(d1, 'char_248_mgllan@2/60/7/3').byModule.uniequip_003_mgllan.stats.deckStack], [4, 8]);
  // 夜莺's 幻影: its visible talent's max_deploy_count 2 (RIN-Y stage 3 restates the same talent: not counted twice)
  const ph = 'token_10003_cgbird_bird';
  assert.equal(v(ph, 'char_179_cgbird@2/1/4/0').stats.deployLimit, 3);
  assert.equal(v(ph, 'char_179_cgbird@2/60/7/3').byModule.uniequip_003_cgbird.stats.deployLimit, 3);
  // 望's 棋子: the rank-2 talent (+1) is a potential talent (望's 潜能 3) — at full potential 6 + 1 = 7, holding 7 + 1 = 8
  assert.deepEqual([v('token_10064_wang_stone1', 'char_2027_wang@2/1/4/0').stats.deployLimit, v('token_10064_wang_stone1', 'char_2027_wang@2/1/4/0').stats.deckStack], [7, 8]);
  // the chess summons of tokens.json have no such talent: 凯瑟琳's 爬行号 2 of 3, everyone else 1
  const tokens = load('tokens');
  assert.equal(tokens.token_10041_cathy_catsld.variants.chess_char_4_11_a.stats.deployLimit, 2);
  assert.equal(tokens.token_10000_silent_healrb.variants.chess_char_2_02_a.stats.deployLimit, 1);
});

test('#24 a summon no owner shows is never a hand card: 予愿安洁莉娜 S3\'s “一会儿见！” is not placeable, every placeable summon is displayed', () => {
  const MARKER = 'token_10071_aglna2_agairp';
  const AGLNA2 = 'char_1015_aglna2';
  assert.equal(BACKUPS.tokens[MARKER].placeable, false);
  const shows = (v) => (v.sources ?? []).includes('display') || Object.values(v.bySkill ?? {}).some((a) => (a.sources ?? []).includes('display'));
  for (const t of [...Object.values(load('tokens')), ...Object.values(BACKUPS.tokens)]) {
    if (t.kind !== 'summon') continue;
    if (t.placeable) assert.ok(Object.values(t.variants).some(shows), `${t.tokenId} ${t.name}: placeable and displayed`);
    else if (!Object.values(t.variants).some(shows)) assert.ok(t.displayType === 'HIDDEN' || t.tokenId === MARKER, `${t.tokenId} ${t.name}: undisplayed ⇒ HIDDEN (or the marker)`);
  }
  for (const tier of [5, 6]) {
    for (const elite of [false, true]) {
      const slot = diySlot(SLOT[tier], DATA);
      const id = elite ? slot.goldenId : slot.baseId;
      for (const skillIndex of [0, 1, 2]) {
        const rec = diyRecord(SLOT[tier], { charId: AGLNA2, skillIndex, uniEquipId: null }, { elite, data: DATA });
        const view = diyGameData(gd, new Map([[id, rec]]));
        assert.deepEqual(view.placeableTokens(id, { skillIndex, moduleId: null }), [], `T${tier} ${elite ? 'elite' : 'normal'} S${skillIndex + 1}: no hand piece`);
      }
    }
  }
});
