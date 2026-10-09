// Community report of 2026-10-06 「独行这种盟约是不能叠层的（顺便排查下还有没有类似的）」 (item 21). PRTS 卫戍协议：盟约 下半/
// PRTS盟约记录, its header: 「下述盟约中部分盟约不会显示叠加层数，但是叠加层数的特质/策略/装备等效果仍然对其生效」 — the four
// bonds.json `noStack` bonds (调和 协防干员 独行 绝技) do take layers (助力, 华法琳 … — not 余's 文火慢炖, the owner's decision
// of 2026-10-08), the game only never shows them. The
// bond strip and its popup hide them since 0.1.4 (PR #66, test/ui/feedback1b-bonds.test.js); the result card still printed
// them (「独行 24」) and ordered its six bonds by them. resultBonds: no number, no rank for a hidden count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { resultBonds } = await import('../../public/js/screens/result.js');
const BONDS = JSON.parse(readFileSync(path.join(ROOT, 'data/bonds.json'), 'utf8'));
const rec = (id) => BONDS[id] ?? null;

test('the four hidden-layer bonds are the data\'s noStack ones', () => {
  assert.deepEqual(Object.keys(BONDS).filter((id) => BONDS[id].noStack).sort(), ['emptyShip', 'maniShip', 'soloShip', 'suntShip']);
});

test('result card bonds: a noStack bond shows no number and does not rank by its hidden layers', () => {
  const out = resultBonds([
    { bondId: 'yanShip', layers: 12, active: true },
    { bondId: 'soloShip', layers: 40, active: true },
    { bondId: 'deputShip', layers: 20, active: true },
    { bondId: 'suntShip', layers: 30, active: false },
    { bondId: 'kjeragShip', layers: 3, active: false },
  ], rec);
  assert.deepEqual(out.map((b) => b.bondId), ['deputShip', 'yanShip', 'kjeragShip', 'soloShip'],
    'layered bonds by layers; active 独行 last; an inactive 绝技 with only hidden layers left out');
  assert.equal(out.find((b) => b.bondId === 'soloShip').hideLayers, true);
  assert.equal(out.find((b) => b.bondId === 'yanShip').hideLayers, undefined);
  assert.equal(out.find((b) => b.bondId === 'yanShip').layers, 12, 'the stacking bonds keep their count');
});
