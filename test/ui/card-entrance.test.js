// (fork) ui/cardEntrance.js: the official result-card entrance — the clip auto_chess_settle_game_player_item_show
// evaluated as Unity does (Hermite between keys, clamped outside), the stagger and the card's states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANIM_DELAY_S, CARD_BG, CLIP_LENGTH_S, SHOW_CLIP, evalCurve, sampleShow, domState, layerState } from '../../public/js/ui/cardEntrance.js';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('the official timings: 0.083 s per card, the clip ends at its last key (1.31667 s)', () => {
  assert.equal(ANIM_DELAY_S, 0.083);
  const last = Math.max(...SHOW_CLIP.flatMap(([, , keys]) => keys.map((k) => k[0])));
  near(CLIP_LENGTH_S, last);
  assert.equal(SHOW_CLIP.length, 25, 'every float curve of the clip');
});

test('a curve passes through its keys, clamps outside them, and follows the Hermite tangents between', () => {
  const keys = [[0, 0, 0, 0], [1, 1, 0, 0]];
  near(evalCurve(keys, -1), 0); near(evalCurve(keys, 2), 1);
  near(evalCurve(keys, 0.5), 0.5, 1e-9); // flat tangents: smoothstep, 0.5 at the middle
  near(evalCurve(keys, 0.25), 0.15625, 1e-9);
  for (const [, , ks] of SHOW_CLIP) for (const [t, v] of ks) near(evalCurve(ks, t), v);
  // a sloped key: the beam's descent keeps its tangent (−4210.91 / s at 0.05 s)
  const beam = SHOW_CLIP.find(([p, a]) => p.endsWith('line_trans') && a === 'm_AnchoredPosition.y')[2];
  const h = 1e-5;
  assert.ok(Math.abs((evalCurve(beam, 0.05 + h) - evalCurve(beam, 0.05)) / h - -4210.91) < 1);
});

test('the card at the start and at the end: hidden and raised, then in place with its rounds shown', () => {
  const a = domState(sampleShow(0));
  near(a.alpha, 0); near(a.round, 0);
  near(a.root, 59.1 + 39); near(a.card, -236.1 + 190.4);
  const z = domState(sampleShow(CLIP_LENGTH_S));
  near(z.alpha, 1); near(z.round, 1); near(z.root, 0); near(z.card, 0);
});

test('the mattes\' last frame: the beam gone, the hanger line full, the washes at their final colours', () => {
  const s = sampleShow(CLIP_LENGTH_S);
  const beam = layerState({ id: 'group_char_matte/group_complete/line_trans', pos: [2.9, 90.1], size: [2, 1000], color: [0.919, 1, 0.981, 0] }, s);
  near(beam.color[3], 0); near(beam.pos[1], 240); near(beam.size[0], 2);
  near(layerState({ id: 'group_char_matte/group_complete/line_up', pos: [3, 240], size: [4, 112], color: [1, 1, 1, 1] }, s).fill, 1);
  const wash = layerState({ id: 'group_char_matte/group_complete/char_color', pos: [0, -35.07], size: [234, 563.34], color: [1, 0, 0.956, 1] }, s);
  near(wash.color[0], 0.642097); near(wash.color[1], 0.8); near(wash.color[2], 0); near(wash.color[3], 1);
  const tiles = layerState({ id: 'x', alpha: 'group_char_matte/group_complete/char_color/tile_line', pos: [0, 0], size: [1, 1], color: [1, 1, 1, 0.035] }, s);
  near(tiles.color[3], 0, 1e-9);
});

test('the card background: the prefab\'s card_bg, 300 × 528 at (0, −13), sliced 75 / 43 / 78 / 212 (left / bottom / right / top)', () => {
  assert.deepEqual(CARD_BG.pos, [0, -13]);
  assert.deepEqual(CARD_BG.size, [300, 528]);
  assert.deepEqual(CARD_BG.border, { left: 75, bottom: 43, right: 78, top: 212 });
  // the slices fit the 159 × 264 sprite
  assert.ok(CARD_BG.border.left + CARD_BG.border.right < 159 && CARD_BG.border.top + CARD_BG.border.bottom < 264);
});
