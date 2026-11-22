#!/usr/bin/env node
// (fork) The English names of the animated illustrations for the review page (public/dev/dyn-review.html): writes
// public/dev/dyn-review-names.json, `{ skinId: { op, outfit, cnOnly } }`, for every illustration of a dynillust manifest.
// Names come from the official EN game data by id (the crew rule: names by charId / skinId, never typed by hand):
//   op      .cache/gamedata-en/excel/character_table.json [charId].name
//   outfit  .cache/gamedata-en/excel/skin_table.json charSkins[skinId].displaySkin.skinName; the E2 art ('<charId>#2')
//           'Elite 2 art'
//   an outfit the EN client does not have yet (CN only): its brand's EN name (skin_table brandList[brand].brandName, the
//           brand being the skinId's tag, `@<brand>#<n>`) and its number, 'CN only' — e.g. 'EPOQUE #57' — or the tag
//           itself when the EN data has no such brand.
//   an operator the EN client does not have yet: the CN data's English name (.cache/gamedata/excel/character_table.json
//           [charId].appellation, e.g. 'Angelina the Mellow Wish'), 'CN only'.
// usage: node tools/dyn-review-names.mjs [<local-assets.json with the dynillust group>] (default data/local-assets.json)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = process.argv[2] || path.join(ROOT, 'data/local-assets.json');
const EN = path.join(ROOT, '.cache/gamedata-en/excel');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const group = read(manifest).groups?.dynillust;
if (!group || typeof group !== 'object') { console.error(`no dynillust group in ${manifest}`); process.exit(1); }
const chars = read(path.join(EN, 'character_table.json'));
// an operator the EN client does not have yet: the CN data's own English name (character_table appellation), 'CN only'
const cnChars = read(path.join(ROOT, '.cache/gamedata/excel/character_table.json'));
const skins = read(path.join(EN, 'skin_table.json'));
const brands = skins.brandList || {};
const brandName = (tag) => {
  const hit = Object.values(brands).find((b) => b && typeof b.brandId === 'string' && b.brandId.toLowerCase() === tag.toLowerCase());
  return hit?.brandName || tag;
};

const out = {};
let cnOnly = 0;
for (const e of Object.values(group)) {
  if (!e || typeof e.skinId !== 'string' || typeof e.charId !== 'string') continue;
  let cn = false;
  let op = chars[e.charId]?.name;
  if (!op) { op = `${cnChars[e.charId]?.appellation || e.charId} (CN only)`; cn = true; cnOnly++; }
  let outfit;
  if (e.skinId === `${e.charId}#2`) outfit = 'Elite 2 art';
  else {
    const name = skins.charSkins?.[e.skinId]?.displaySkin?.skinName;
    if (name) outfit = name;
    else {
      const m = e.skinId.match(/@([^#]+)#(\d+)$/);
      outfit = m ? `${brandName(m[1])} #${m[2]}` : e.skinId;
      if (!cn) { cn = true; cnOnly++; }
    }
  }
  out[e.skinId] = { op, outfit, ...(cn ? { cnOnly: true } : {}) };
}
const file = path.join(ROOT, 'public/dev/dyn-review-names.json');
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`dyn-review-names: ${Object.keys(sorted).length} illustrations (${cnOnly} CN only) → ${path.relative(ROOT, file)}`);
