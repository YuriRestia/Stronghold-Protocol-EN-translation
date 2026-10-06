// GitHub #184 (second half): 活性源石 was drawn as two different materials — the 2D atlas cell was a beveled brick with
// random crystal clusters, the 3D board's quad a world-space crust with pulsing veins — so the same tile read as two
// different floors. These are the couplings that keep it ONE material: the palette of `render/style.js ORIGINIUM`, the
// concrete slab it lies on, and no per-tile frame (which made a field of 活性源石 look like separate patches).
// The pixels themselves are checked in test/render/originium-cell.e2e.test.js (it needs a real canvas).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const style = read('public/js/render/style.js');
const textures = read('public/js/render/textures.js');
const materials = read('public/js/render/board3d/materials.js');
const tiles = read('public/js/render/tiles.js');

/** The source of one exported function of a module (its JSDoc through the closing brace at column 0). */
function fnSource(src, name) {
  const at = src.indexOf(`export function ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  const end = src.indexOf('\n}\n', at);
  return src.slice(src.lastIndexOf('/**', at), end + 2);
}

test('活性源石: one palette for both boards, and the canvas converts the working space', () => {
  assert.match(style, /export const ORIGINIUM = Object\.freeze\(\{/, 'the palette lives in style.js');
  for (const k of ['base', 'crust', 'vein', 'spec']) assert.match(style, new RegExp(`${k}: Object\\.freeze\\(\\[`), k);
  assert.match(style, /export function linearToSrgb255/, 'the sRGB conversion the canvas needs');
  // the 2D drawer takes its colours from the palette (no private copy) and converts them for the canvas
  assert.match(textures, /import \{[^}]*ORIGINIUM[^}]*\} from '\.\/style\.js'/);
  assert.match(textures, /ORIGINIUM\.vein/);
  assert.match(textures, /linearToSrgb255\(/, 'the canvas stores sRGB, the palette is the shaders\' linear space');
  // so does the 3D shader, through the vec3 helper
  assert.match(materials, /import \{ ORIGINIUM \} from '\.\.\/style\.js'/);
  assert.match(materials, /const V3 = \(c\) => `vec3\(/);
  for (const k of ['base', 'crust', 'vein', 'spec']) assert.match(materials, new RegExp(`V3\\(ORIGINIUM\\.${k}\\)`), k);
  // the identical recipe (the shader's own thresholds, mirrored in the drawer's smoothstep calls)
  assert.match(materials, /smoothstep\(0\.38, 0\.62, n \* 0\.7 \+ n2 \* 0\.45\)/);
  assert.match(textures, /smoothstep\(0\.38, 0\.62, n1 \* 0\.7 \+ n2 \* 0\.45\)/);
  assert.match(materials, /smoothstep\(0\.86, 0\.98, 1\.0 - abs\(n2 \* 2\.0 - 1\.0\)\)/);
  assert.match(textures, /smoothstep\(0\.86, 0\.98, 1 - Math\.abs\(n2 \* 2 - 1\)\)/);
});

test('活性源石: the 2D tile lies on the same concrete the 3D board lays its crust on', () => {
  // board3d/atlas.js `concrete` and textures.js DEFAULT_ART_LAYERS.infection must name the same atlas rect: with the
  // board art installed the 2D tile is composed exactly like the 3D one (official slab + our crust).
  const atlas = read('public/js/render/board3d/atlas.js');
  const m2 = atlas.match(/concrete: S\('D', \[([\d, ]+)\]\)/);
  const m1 = textures.match(/infection: Object\.freeze\(\[Object\.freeze\(\{ src: 'D', rect: \[([\d, ]+)\] \}\)/);
  assert.ok(m1 && m2, 'both define the slab');
  assert.equal(m1[1].replace(/\s/g, ''), m2[1].replace(/\s/g, ''), 'the same concrete cell');
});

test('活性源石: neither board fades the tile out at its own border', () => {
  // the 3D crust used to be multiplied by a per-tile `edge` fade (min(vUv, 1 − vUv)), which left a transparent band
  // between neighbouring tiles; the drawer must reach the cell's edges the same way. Its siblings (mire / water) keep
  // their own fade — this is about 活性源石 only.
  const inf = fnSource(materials, 'infectionMaterial');
  assert.ok(!/min\(e\.x, e\.y\)|float edge/.test(inf), 'no per-tile edge fade in the infection shader');
  assert.match(inf, /float a = clamp\(crust \* 0\.72 \+ vein, 0\.0, 1\.0\)/);
  const mire = fnSource(materials, 'mireMaterial');
  assert.match(mire, /float edge = smoothstep/, 'the mire keeps its own fade');
  // the 2D cell has no frame either: no bevelTile in the drawer's two variants
  const draw = textures.slice(textures.indexOf('  infection(ctx, x, y, s, r) {'), textures.indexOf('  cliff(ctx, x, y, s) {'));
  assert.ok(!/bevelTile/.test(draw), 'the old beveled brick is gone');
  assert.match(draw, /floorBase\(ctx, x, y, s, r\); originiumOverlay\(ctx, x, y, s, false\);/);
  assert.match(draw, /infection2\(ctx, x, y, s, r\) \{ floorBase\(ctx, x, y, s, r\); originiumOverlay\(ctx, x, y, s, true\); \}/);
});

test('活性源石: two variants are registered, picked by tile, and the pulse uses the shared tint', () => {
  assert.match(textures, /'deepsea', 'infection', 'infection2', 'cliff'/);
  assert.match(textures, /originium2\(ctx, x, y, s\) \{ originiumOverlay\(ctx, x, y, s, true\); \}/, 'the proc layer for the art path');
  assert.match(textures, /infection2: Object\.freeze\(\[Object\.freeze\(\{ src: 'D', rect: \[256, 512, 256, 256\] \}\), Object\.freeze\(\{ proc: 'originium2' \}\)\]\)/);
  assert.match(tiles, /case 'infection': return h < 4 \? 'infection' : 'infection2';/);
  assert.match(tiles, /add\('infect', 'glow', P\.BLEND_MODES\.ADD, ORIGINIUM\.glow, 1\)/);
});
