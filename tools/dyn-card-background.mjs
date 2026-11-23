#!/usr/bin/env node
// tools/dyn-card-background.mjs — the official home background behind each animated illustration on a co-op room's wide
// card (the 4-seat and the Grand Alliance room): data/dyn-card-background.json, read by ui/dynCards.js IllustArt `fill`.
//
// The user's picks of 2026-11-23 (the matching pictures of all 98, then their changes: Mon3tr → Clear Sky, Virtuosa's
// Diversity Oneness → Nighttime, Hoshiguma's Tempest → Other Side, her Elite 2 art → Celebration). A wide card is wider
// than the official card the illustrations are drawn for, so a scene can end inside it; the official home screen shows
// an illustration over the player's chosen home background (display_meta_table homeBackgroundData), so a wide card
// shows one of those behind it, matched by the outfit's theme, else the operator's faction. No official pairing exists:
// every pick is a design choice the user approved.
//
// The backgrounds themselves are the client's: arts/ui/homebackground/wrapper/<bgId>.ab, extracted by
// tools/local-extract/homebg.py (with --only dynillust or --only homebg) as homebg/<bgId>.webp, listed in the
// `homebg` group of data/local-assets.json.
//
// usage:
//   node tools/dyn-card-background.mjs            writes data/dyn-card-background.json
//   node tools/dyn-card-background.mjs --check    exits 1 when the file differs from the table, or the table names a
//                                                 key the server's illustration index lacks / lacks one it has
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = path.join(ROOT, 'data', 'dyn-card-background.json');

/** Each background's name as the EN client shows it [src: official display_meta_table homeBackgroundData.homeBgDataList bgName]. */
export const NAMES = Object.freeze({
  bg_anniversary_1: 'Celebration', bg_avemujica_1: 'Spotlight', bg_elitelounge_1: 'Resolve', bg_hunter_1: null,
  bg_iberia_1: 'Mystic Sea', bg_kalts_1: 'Footprints', bg_kazimierz_1: 'Business', bg_laterano_1: 'Clear Sky',
  bg_main_victoria_1: 'Cloudy', bg_recalrune_1: 'Covert Contract', bg_redvelvet_1: null, bg_rhine_1: 'Arboretum',
  bg_rhodes_day: 'Vision', bg_rhodes_flower_1: 'Flowerbed', bg_rhodes_night: 'Nighttime', bg_rogue_2: 'Other Side',
  bg_rogue_3: 'Genesis', bg_rogue_4: 'Ideas Taken Form', bg_sandboxv2_1: 'Vast Sands', bg_siesta_1: 'Vacation',
  bg_sui_1: 'Green Buds', bg_ursus_1: 'Winter', bg_volcano_1: 'Springbay', bg_yan_1: 'Peaks',
});

/** background → the illustration keys (data/local-assets.json `dynillust`) shown over it: the user's picks of 2026-11-23. */
export const PICKS = Object.freeze({
  bg_anniversary_1: ['char_1044_hsgma2_2'],
  bg_avemujica_1: ['char_1046_sbell2_ambiencesynesthesia#8', 'char_172_svrash_ambiencesynesthesia#4', 'char_2014_nian_cfa#1',
    'char_2024_chyue_cfa#1', 'char_202_demkni_ambiencesynesthesia#7', 'char_249_mlyss_ambiencesynesthesia#6',
    'char_350_surtr_ambiencesynesthesia#6', 'char_4087_ines_ambiencesynesthesia#5', 'char_4098_vvana_epoque#59',
    'char_4133_logos_ambiencesynesthesia#6'],
  bg_elitelounge_1: ['char_391_rosmon_2', 'char_391_rosmon_epoque#17', 'char_391_rosmon_sale#16'],
  bg_hunter_1: ['char_4202_haruka_iteration#6'],
  bg_iberia_1: ['char_1012_skadi2_2', 'char_1012_skadi2_boc#4', 'char_1012_skadi2_iteration#2', 'char_1023_ghost2_2', 'char_1023_ghost2_boc#6'],
  bg_kalts_1: ['char_003_kalts_boc#6', 'char_003_kalts_sale#14', 'char_1052_kalts2_2'],
  bg_kazimierz_1: ['char_1014_nearl2_2', 'char_1014_nearl2_epoque#17', 'char_4064_mlynar_epoque#28'],
  bg_laterano_1: ['char_1032_excu2_sale#12', 'char_1041_angel2_2', 'char_1041_angel2_iteration#6', 'char_245_cello_2',
    'char_332_archet_sale#14', 'char_4179_monstr_boc#11'],
  bg_main_victoria_1: ['char_1019_siege2_epoque#50', 'char_1020_reed2_epoque#30', 'char_1042_phatm2_sightseer#4', 'char_250_phatom_sale#4'],
  bg_recalrune_1: ['char_1028_texas2_2', 'char_1028_texas2_epoque#36', 'char_1028_texas2_iteration#1', 'char_1038_whitw2_2', 'char_1038_whitw2_sale#15'],
  bg_redvelvet_1: ['char_322_lmlee_witch#3'],
  bg_rhine_1: ['char_249_mlyss_2', 'char_249_mlyss_boc#8'],
  bg_rhodes_day: ['char_1016_agoat2_epoque#57'],
  bg_rhodes_flower_1: ['char_1015_aglna2_2', 'char_1016_agoat2_epoque#34'],
  bg_rhodes_night: ['char_245_cello_sale#12', 'char_4132_ascln_iteration#4'],
  bg_rogue_2: ['char_1044_hsgma2_whirlwind#11', 'char_179_cgbird_sightseer#1', 'char_4058_pepe_sightseer#2'],
  bg_rogue_3: ['char_1045_svash2_2', 'char_1045_svash2_sale#20', 'char_4116_blkkgt_witch#5'],
  bg_rogue_4: ['char_1035_wisdel_2', 'char_1035_wisdel_sale#14', 'char_113_cqbw_2', 'char_113_cqbw_epoque#7', 'char_4087_ines_boc#8'],
  bg_sandboxv2_1: ['char_1026_gvial2_2', 'char_4058_pepe_2', 'char_472_pasngr_epoque#17'],
  bg_siesta_1: ['char_1013_chen2_2', 'char_1013_chen2_summer#20', 'char_1020_reed2_summer#17', 'char_1026_gvial2_summer#12',
    'char_1039_thorn2_marthe#9', 'char_350_surtr_summer#9', 'char_377_gdglow_summer#12', 'char_4080_lin_summer#19',
    'char_437_mizuki_sale#7', 'char_450_necras_summer#20'],
  bg_sui_1: ['char_2014_nian_2', 'char_2014_nian_nian#4', 'char_2015_dusk_2', 'char_2015_dusk_nian#12', 'char_2015_dusk_nian#7',
    'char_2023_ling_2', 'char_2023_ling_nian#12', 'char_2023_ling_nian#9', 'char_2024_chyue_2', 'char_2024_chyue_nian#10',
    'char_2025_shu_2', 'char_2025_shu_nian#11', 'char_2025_shu_nlc#1', 'char_2026_yu_2', 'char_2026_yu_nian#12', 'char_2027_wang_2'],
  bg_ursus_1: ['char_4010_etlchi_winter#5', 'char_4055_bgsnow_wild#7', 'char_4134_cetsyr_epoque#50', 'char_4247_oxi_2'],
  bg_volcano_1: ['char_1016_agoat2_2'],
  bg_yan_1: ['char_1013_chen2_boc#6', 'char_2023_ling_ncg#1', 'char_4080_lin_nian#10', 'char_4121_zuole_nian#11'],
});

/** The file's content: { _source, backgrounds: { bgId: name|null }, cards: { key: bgId } }, keys sorted. */
export function backgroundTable(picks = PICKS) {
  const cards = {};
  for (const [bg, keys] of Object.entries(picks)) {
    if (!(bg in NAMES)) throw new Error(`no name for ${bg}`);
    for (const k of keys) {
      if (cards[k]) throw new Error(`${k} picked twice (${cards[k]}, ${bg})`);
      cards[k] = bg;
    }
  }
  const used = [...new Set(Object.values(cards))].sort();
  return {
    _source: 'tools/dyn-card-background.mjs: generated, do not edit by hand. The official home background behind each '
      + 'animated illustration on a co-op room\'s wide card: the user\'s picks of 2026-11-23.',
    backgrounds: Object.fromEntries(used.map((b) => [b, NAMES[b]])),
    cards: Object.fromEntries(Object.keys(cards).sort().map((k) => [k, cards[k]])),
  };
}

/** The keys of the server's illustration index (data/local-assets.json `dynillust`), or null without the file. */
function indexKeys() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'local-assets.json'), 'utf8'));
    return j?.groups?.dynillust ? Object.keys(j.groups.dynillust) : null;
  } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const table = backgroundTable();
  const text = `${JSON.stringify(table, null, 1)}\n`;
  const idx = indexKeys();
  const missing = idx ? idx.filter((k) => !table.cards[k]) : [];
  const unknown = idx ? Object.keys(table.cards).filter((k) => !idx.includes(k)) : [];
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    const bad = now !== text || missing.length || unknown.length;
    if (now !== text) console.log('data/dyn-card-background.json differs from the table: run node tools/dyn-card-background.mjs');
    if (missing.length) console.log(`no background for: ${missing.join(', ')}`);
    if (unknown.length) console.log(`not in the illustration index: ${unknown.join(', ')}`);
    if (!idx) console.log('(no data/local-assets.json illustration index here: keys not checked)');
    process.exit(bad ? 1 : 0);
  }
  fs.writeFileSync(OUT, text);
  console.log(`${Object.keys(table.cards).length} illustrations, ${Object.keys(table.backgrounds).length} backgrounds → data/dyn-card-background.json`
    + (missing.length ? `; no background for ${missing.join(', ')}` : '') + (unknown.length ? `; not in the index: ${unknown.join(', ')}` : ''));
}
