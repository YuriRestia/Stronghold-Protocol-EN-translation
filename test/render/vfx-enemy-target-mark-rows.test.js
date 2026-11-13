// (fork) Enemy VFX audit, S rows: the official rows the sim's target marks name, in the extracted fx index — OpFor:
// Quagmire's parasite and Degenbrecher's SP-clear mark (talent target rows through STATE_BUFFS). Skipped unextracted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stateEntries } from '../../public/js/render/vfx/skills.js';
import { talentBindings } from '../../public/js/render/vfx/talents.js';

const FX = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../public/assets/local/fx/index.json', import.meta.url), 'utf8')); } catch { return null; } })();
const skip = !FX && 'no extracted fx index';

/** The rows `unit`'s talent bindings give a b.snap fxs row of `buff` (TalentFx.targetRows' filter). */
function talentRows(unit, buff) {
  const rows = [];
  for (const b of talentBindings(FX, unit)) {
    for (const e of ['state', 'targets', 'start', 'loop', 'unmapped'].flatMap((k) => b.plan?.[k] || [])) if (e.buff === buff) rows.push(e);
  }
  return stateEntries(rows, buff, null).map((e) => e.key);
}

test("OpFor: Quagmire's 'enemy_acelem[to_parasitic]' row plays its parasite glow", { skip }, () => {
  assert.deepEqual(talentRows('enemy_9007_acelem', 'enemy_acelem[to_parasitic]'), ['enemy_acelem_buff']);
});

test("Degenbrecher's 'enemy_blkswb_s[effect]' row plays its second-form SP-clear mark", { skip }, () => {
  assert.deepEqual(talentRows('enemy_1525_blkswb', 'enemy_blkswb_s[effect]'), ['enemy_blkswb_skill_03_start_02']);
});
