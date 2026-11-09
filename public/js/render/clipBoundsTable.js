// public/js/render/clipBoundsTable.js — (fork) the precomputed impostor clip bounds (data/clip-bounds.json, made by
// tools/assets/clip-bounds.mjs after the art is fetched or extracted): loaded once per page, as soon as the battle
// renderer starts (render/app.js createFieldView), at low fetch priority (the browser sends what the screen needs now
// first; ~95 KB compressed), from its content-hashed /data/h/ URL when the page knows the hash (dataUrls.js).
// spine.js seedClipBounds then starts every matching model measured, and fills the ones already waiting. Not a
// loadLater load: a crowd that arrives with the renderer (a battle shown at once, the render demo's stress scene) never
// lets the screen settle, and waiting for it left the crowd measuring for 10-20 s before the table came (2026-11-09).
// No file, an older or newer format, a fetch that fails: nothing changes, the clips are measured in the browser as before.

import { dataUrl } from '../dataUrls.js';
import { seedClipBounds } from './spine.js';

export const CLIP_BOUNDS_NAME = 'clip-bounds.json';

let pending = null;

/**
 * Load and use the table, once.
 * @param {{ fetchFn?: typeof fetch, later?: (task: () => any) => any, url?: string }} [o] `later`: (tests) when to run
 *   the load (default: now)
 * @returns {Promise<number>} clips seeded into models already waiting (-1: no table used)
 */
export function loadClipBoundsTable({ fetchFn = globalThis.fetch, later = (task) => task(), url } = {}) {
  if (pending) return pending;
  // not a page (Node tests building a field view): nothing to fetch from, unless a test gives the URL
  if (!url && typeof globalThis.location?.origin !== 'string') return Promise.resolve(-1);
  pending = new Promise((resolve) => {
    const task = async () => {
      let n = -1;
      try {
        if (typeof fetchFn === 'function') {
          const res = await fetchFn(url || dataUrl(CLIP_BOUNDS_NAME), { priority: 'low' });
          if (res && res.ok) n = seedClipBounds(await res.json());
        }
      } catch { /* no table: measured at runtime */ }
      resolve(n);
    };
    try { later(task); } catch { task(); }
  });
  return pending;
}

/** (tests) Forget the load, so the next call loads again. */
export function resetClipBoundsTable() { pending = null; }
