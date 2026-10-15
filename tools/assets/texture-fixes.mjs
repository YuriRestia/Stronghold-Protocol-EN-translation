// (fork) Art fixes painted into downloaded Spine atlas pages, re-applied by every fetch-assets run (processModels).
//
// RIM_FIXES: an eyelid patch (a skin mesh with a hole for the eye, squashed by the blink) whose dark outer rim drew as
// a pair of glasses in our renderer. The rim is painted skin-coloured; the line around the eye hole (the pixels within
// `keep` of it) stays as drawn. Regions are found by name in the model's atlas, so a repacked atlas is still fixed.
// A fixed page has no rim pixel left: a second run finds nothing to paint and leaves the file alone.

/** Model key (tools/assets/plan.mjs) → the regions to fix. `keep`: px around the eye hole left as drawn. */
export const RIM_FIXES = Object.freeze({
  // 铃兰 Suzuran's default model (user playtest 2026-10-14)
  'op:char_358_lisa:front': Object.freeze({ regions: ['F_Face_Default_h', 'F_Face_Default_i'], keep: 2 }),
});

/** A rim pixel: drawn, and dark (mean RGB below `dark`) or partly transparent (alpha below `soft`). */
const RIM = Object.freeze({ dark: 150, soft: 250, skin: 200 });

/**
 * The rectangles (page pixels) of named regions in a Spine 3.8 atlas text, by page name. Rotated regions swap their
 * size in the page.
 * @param {string} text @param {string[]} names
 * @returns {Map<string, Array<{ name: string, x: number, y: number, w: number, h: number }>>}
 */
export function regionRects(text, names) {
  const want = new Set(names);
  const out = new Map();
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let page = null;
  let region = null;
  const close = () => {
    if (!region || !region.xy || !region.size) return;
    const [x, y] = region.xy, [w, h] = region.size;
    const rot = region.rotate === 'true' || region.rotate === '90';
    if (!out.has(page)) out.set(page, []);
    out.get(page).push({ name: region.name, x, y, w: rot ? h : w, h: rot ? w : h });
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { close(); region = null; page = null; continue; }
    const colon = t.indexOf(':');
    if (colon === -1) {
      close();
      if (page === null) { page = t; region = null; } else region = want.has(t) ? { name: t } : null;
      continue;
    }
    if (!region) continue;
    const k = t.slice(0, colon).trim(), v = t.slice(colon + 1).trim();
    if (k === 'xy' || k === 'size') region[k] = v.split(',').map((n) => parseInt(n, 10));
    else if (k === 'rotate') region.rotate = v;
  }
  close();
  return out;
}
/**
 * Paint the outer rim of one region of an RGBA page skin-coloured, in place. The eye hole is the transparent area no
 * transparent path from the region's border reaches; the skin colour is the mean of the region's light opaque pixels.
 * @param {Uint8Array} data RGBA pixels @param {number} width page width
 * @param {{ x: number, y: number, w: number, h: number }} r @param {number} keep
 * @returns {number} pixels painted (0: nothing to fix — already fixed, or no hole / no skin to paint with)
 */
export function paintRim(data, width, r, keep) {
  const { w, h } = r;
  const at = (x, y) => ((r.y + y) * width + r.x + x) * 4;
  const mean = (p) => (data[p] + data[p + 1] + data[p + 2]) / 3;
  const clear = (x, y) => data[at(x, y) + 3] < 8;
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || outside[y * w + x] || !clear(x, y)) continue;
    outside[y * w + x] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  const nearHole = new Uint8Array(w * h);
  let holes = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!clear(x, y) || outside[y * w + x]) continue;
    holes++;
    for (let dy = -keep; dy <= keep; dy++) for (let dx = -keep; dx <= keep; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) nearHole[ny * w + nx] = 1;
    }
  }
  if (!holes) return 0;
  const skin = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    if (data[p + 3] >= RIM.soft && mean(p) > RIM.skin) { skin[0] += data[p]; skin[1] += data[p + 1]; skin[2] += data[p + 2]; n++; }
  }
  if (!n) return 0;
  let painted = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y);
    if (data[p + 3] === 0 || nearHole[y * w + x]) continue;
    if (data[p + 3] >= RIM.soft && mean(p) >= RIM.dark) continue;
    // already skin-coloured (a fixed page): not a rim pixel
    if (Math.abs(data[p] - skin[0] / n) < 3 && Math.abs(data[p + 1] - skin[1] / n) < 3 && Math.abs(data[p + 2] - skin[2] / n) < 3) continue;
    for (let c = 0; c < 3; c++) data[p + c] = Math.round(skin[c] / n);
    painted++;
  }
  return painted;
}

let sharpLoad = null;
/** sharp, or null when the optional dependency is not installed (loaded once). */
async function loadSharp() {
  sharpLoad ??= import('sharp').then((m) => m.default || m, () => null);
  return sharpLoad;
}

/**
 * Apply a model's RIM_FIXES to its pages on disk. Each page is rewritten only when a pixel was painted.
 * @param {string} key model key @param {string} atlasText the model's (normalized) atlas
 * @param {(page: string) => string} pagePath absolute path of a page image
 * @param {{ writable?: (page: string) => boolean, readFile, writeFile, rename }} io
 * @returns {Promise<{ painted: number, pages: string[], problem: string|null }>}
 */
export async function applyRimFixes(key, atlasText, pagePath, { writable = () => true, readFile, writeFile, rename }) {
  const fix = RIM_FIXES[key];
  const none = { painted: 0, pages: [], problem: null };
  if (!fix) return none;
  const rects = regionRects(atlasText, fix.regions);
  const found = [...rects.values()].flat().map((r) => r.name);
  const lost = fix.regions.filter((n) => !found.includes(n));
  if (lost.length) return { ...none, problem: `${key}: texture fix regions not in atlas (${lost.join(', ')})` };
  const sharp = await loadSharp();
  if (!sharp) return { ...none, problem: `${key}: texture fix skipped (sharp not installed)` };
  let painted = 0;
  const pages = [];
  for (const [page, list] of rects) {
    const abs = pagePath(page);
    const { data, info } = await sharp(await readFile(abs)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (const r of list) n += paintRim(data, info.width, r, fix.keep);
    if (!n) continue;
    if (!writable(page)) return { painted, pages, problem: `${key}: texture fix needed on ${page}, left as it is (an existing file)` };
    await writeFile(abs + '.tmp', await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer());
    await rename(abs + '.tmp', abs);
    painted += n;
    pages.push(page);
  }
  return { painted, pages, problem: null };
}
