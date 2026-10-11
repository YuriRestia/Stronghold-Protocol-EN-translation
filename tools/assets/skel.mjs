// Spine 3.8 binary skeleton (.skel) inspection in Node, using the same parser
// the client ships (@pixi-spine/runtime-3.8, a dependency of pixi-spine).
//
// We only need metadata: animation names + durations, event names, the times
// of `OnAttack` events per animation (hit timing, research 07 §5.4) and the
// skeleton bounds. Attachments are created without textures, so no atlas or
// canvas is needed; attachment paths are checked against the atlas region names
// to detect mismatched downloads.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(root, 'package.json'));

let runtime = null;
/**
 * Lazily load @pixi-spine/runtime-3.8.
 * @returns {any} the runtime module
 * @throws when pixi-spine is not installed (run `npm install`)
 */
function loadRuntime() {
  if (runtime) return runtime;
  runtime = require('@pixi-spine/runtime-3.8');
  return runtime;
}

/**
 * True when the Spine parser can be loaded.
 * @returns {boolean}
 */
export function skelParserAvailable() {
  try { loadRuntime(); return true; } catch { return false; }
}

function makeLoader(r, regions, missing) {
  const check = (path) => { if (regions && !regions.has(path)) missing.add(path); };
  return {
    newRegionAttachment(skin, name, path) { check(path); return new r.RegionAttachment(name); },
    newMeshAttachment(skin, name, path) { check(path); return new r.MeshAttachment(name); },
    newBoundingBoxAttachment(skin, name) { return new r.BoundingBoxAttachment(name); },
    newPathAttachment(skin, name) { return new r.PathAttachment(name); },
    newPointAttachment(skin, name) { return new r.PointAttachment(name); },
    newClippingAttachment(skin, name) { return new r.ClippingAttachment(name); },
  };
}

const round3 = (x) => Math.round(Number(x) * 1000) / 1000;

/**
 * @typedef {{ version: string, animations: string[], durations: Record<string, number>,
 *   events: string[], hits: Record<string, number[]>, bounds: {x:number,y:number,width:number,height:number}|null,
 *   missingRegions: string[] }} SkelInfo
 */

/**
 * Parse a Spine 3.8 binary skeleton.
 * @param {Uint8Array} bytes .skel file contents
 * @param {Set<string>} [atlasRegions] region names of the matching atlas (optional, for validation)
 * @returns {SkelInfo}
 * @throws on malformed data
 */
export function parseSkel(bytes, atlasRegions) {
  const r = loadRuntime();
  const missing = new Set();
  const bin = new r.SkeletonBinary(makeLoader(r, atlasRegions, missing));
  const data = bin.readSkeletonData(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const animations = data.animations.map((a) => a.name);
  const durations = {};
  const hits = {};
  for (const a of data.animations) {
    durations[a.name] = round3(a.duration);
    for (const t of a.timelines) {
      if (!t || !Array.isArray(t.events)) continue;
      for (const e of t.events) {
        const nm = e?.data?.name;
        if (typeof nm === 'string' && /^onattack$/i.test(nm)) {
          (hits[a.name] ||= []).push(round3(e.time));
        }
      }
    }
    if (hits[a.name]) hits[a.name].sort((x, y) => x - y);
  }
  const w = Number(data.width); const h = Number(data.height);
  const bounds = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? { x: round3(data.x), y: round3(data.y), width: round3(w), height: round3(h) }
    : null;
  return {
    version: String(data.version ?? ''),
    animations,
    durations,
    events: data.events.map((e) => e.name),
    hits,
    bounds,
    missingRegions: [...missing].sort(),
  };
}

const EXTENT_STEP = 1 / 20, EXTENT_MAX = 48; // sample spacing (s) and cap per clip

/**
 * Per-clip extents of a Spine 3.8 skeleton: the union of its bounds over each animation, sampled every EXTENT_STEP s.
 * Region attachments need their atlas sizes, so this parses again with the real atlas (the page images are not read).
 * Invisible attachments (faded-out effects) are skipped: they draw nothing.
 * @param {Uint8Array} bytes .skel file contents
 * @param {string} atlasText the matching .atlas
 * @returns {Record<string, [number, number, number, number]>|null} clip → [x0, y0, x1, y1] (skeleton units, y down
 *   as drawn by pixi-spine); null when the skeleton cannot be posed with this atlas
 */
export function clipExtents(bytes, atlasText) {
  const r = loadRuntime();
  const B = require('@pixi-spine/base');
  let data;
  try {
    const atlas = new B.TextureAtlas(atlasText, (_line, cb) => cb({ width: 4096, height: 4096, valid: true, resource: {} }));
    data = new r.SkeletonBinary(new r.AtlasAttachmentLoader(atlas)).readSkeletonData(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch { return null; }
  const sk = new r.Skeleton(data);
  const off = new B.Vector2(), size = new B.Vector2(), tmp = [];
  const out = {};
  for (const a of data.animations) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const n = Math.min(EXTENT_MAX, Math.max(1, Math.ceil(a.duration / EXTENT_STEP)));
    for (let i = 0; i <= n; i++) {
      sk.setToSetupPose();
      a.apply(sk, 0, (a.duration * i) / n, false, null, 1, B.MixBlend.setup, B.MixDirection.mixIn);
      sk.updateWorldTransform();
      for (const s of sk.slots) {
        const at = s.attachment;
        if (at && s.color.a * (at.color ? at.color.a : 1) < 0.02) s.attachment = null;
      }
      sk.getBounds(off, size, tmp);
      if (!Number.isFinite(off.x) || !Number.isFinite(off.y) || !(size.x > 0) || !(size.y > 0)) continue;
      x0 = Math.min(x0, off.x); y0 = Math.min(y0, off.y); x1 = Math.max(x1, off.x + size.x); y1 = Math.max(y1, off.y + size.y);
    }
    if (Number.isFinite(x0)) out[a.name] = [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
  }
  return out;
}
