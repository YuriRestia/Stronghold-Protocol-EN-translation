#!/usr/bin/env node
// tools/card-art-framing.mjs — where the official full art sits on a wide room card (data/card-art-framing.json).
//
// The user's picks of 2026-11-23: the wide cards show the outfit's full art (the official charart, the same torn edges as
// the animated illustration) where the illustration would draw, and a card with no animated illustration shows its full
// art framed on the operator's face like the animated ones ("pick a good framing to show the operator off").
//
//   l2d[key] = { art, rect }: the full art of an animated illustration registered on the illustration itself. `rect` is
//     the art's box at the card framing without zoom (render/dynillust/framing.js unityToCard), in official card units
//     from the card's centre: u = min(w / 232, h / 458) px per unit, x = w/2 + u·L, y = h/2 + u·T, size u·W × u·H. The
//     card then zooms it about (fx, fy) with the illustration's own value of data/dyn-card-framing.json, so the 2D art
//     and the live illustration come from one framing value (cardArtRect in public/js/ui/dynCards.js).
//   stills[art] = { rect }: a full art with no animated illustration, its face from its official portrait (the portrait
//     found inside the full art: the eyes of the official portraits sit at about a third of their height), framed with
//     the face rule of tools/dyn-cover-framing.mjs (face line, head inside, the smallest zoom that covers the card) at
//     the illustrations' own zoom range — the user's pick of 2026-11-24, "follow the linked arts framing style": a
//     still shows the figure like a registered art does, not a bust close-up.
//
// Registration: plain normalised cross-correlation on small copies (no image library beyond sharp), coarse to fine over
// scale and offset; the score is kept so a poor match shows in the log and the test.
//
// usage:
//   node tools/card-art-framing.mjs --capture <dir> --base http://127.0.0.1:3253 [--pages 1,2]   (GPU Chrome: crew lock)
//     the review page's 4-seat room at framing=card (zoom 1): each live card's box as JPEG + boxes.json
//   node tools/card-art-framing.mjs --register <dir> --stills --out data/card-art-framing.json
//   node tools/card-art-framing.mjs --official <frames.json>   (from tools/local-extract/illust_framing.py; after any
//     --register run, which writes new stills: where the official card puts each still-only art, for the tall cards)
//   node tools/card-art-framing.mjs --reface <frames.json>   (after --official: the faces matched wrongly, searched again)
// Caps: 30 pages, 20 min capture, 200 MB of captures, 25 min matching, log < 200 KB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOAL, TOP_MIN, FACE_MAX, ZOOMS } from './dyn-cover-framing.mjs';
import { HOLDER_SCALE, HOLDER_Y } from '../public/js/render/dynillust/framing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
/** The official card window [src: render/dynillust/framing.js CARD_UI_W, CARD_UI_H]. */
export const UI_W = 232, UI_H = 458;
/** Where the official portraits put the face and the head's top, as fractions of the portrait's height: measured by eye
 * on 8 official portraits, 2026-11-23 (eyes at 0.28–0.33; hair top at 0.05–0.12; ears and horns may go higher). */
export const PORTRAIT_FACE = 0.32, PORTRAIT_TOP = 0.06;
/** The wide card the stills are framed for (the 4-seat room's 16:9; the Grand Alliance's 1.6 crops the sides). */
export const STILL_AR = 16 / 9;
/** Below this score an illustration's match is tried again over a wider scale range; below MIN_SCORE it is left out
 * (the card keeps its portrait). Scores of the matches checked by eye on 2026-11-23: right ones 0.41–0.91 (animation and
 * effects lower them), wrong ones 0.10 (an empty capture) and 0.32 (out of range). */
export const RETRY = 0.55, MIN_SCORE = 0.3;
/** A registration below this keeps the 2D art apart from its illustration by default (Chongyue's E2, 0.41; the next
 * lowest, 0.46–0.54, checked by eye and right). */
export const SEPARATE_BELOW = 0.45;
/** A still's zoom steps: the illustrations' own range (dyn-cover-framing ZOOMS), so a still is framed like the linked
 * arts the user approved (2026-11-24: "follow the linked arts framing style, those were done by me"); past 1.35 a tall
 * full art is a bust close-up (2026-11-23's up-to-2× frames, retired). A still still covers the card — its own torn
 * edges show the card's background. Design values (user OK 2026-11-24). */
export const STILL_ZOOMS = Object.freeze([...ZOOMS]);

/** A rect in card px (x, y, w, h) of a w × h card → official card units from the card's centre. */
export function toUnits(r, w, h) {
  const u = Math.min(w / UI_W, h / UI_H);
  return [(r.x - w / 2) / u, (r.y - h / 2) / u, r.w / u, r.h / u].map((v) => +v.toFixed(2));
}
/** The reverse: a rect in card units → px of a w × h card, then zoomed by `zoom` about (fx·w, fy·h). */
export function fromUnits(rect, w, h, zoom = 1, fx = 0.5, fy = 0.5) {
  const u = Math.min(w / UI_W, h / UI_H);
  const x = w / 2 + u * rect[0], y = h / 2 + u * rect[1], rw = u * rect[2], rh = u * rect[3];
  const cx = fx * w, cy = fy * h;
  return { x: cx + (x - cx) * zoom, y: cy + (y - cy) * zoom, w: rw * zoom, h: rh * zoom };
}

// ---- matching ------------------------------------------------------------------------------------------------------
/** An image as two planes (luma and magenta-ness, 0..1) over magenta, plus its alpha (0..1). */
async function planes(sharp, src, w, h, { fit = 'fill' } = {}) {
  // `src` a file or an image decoded once (decode()): a WebP decoded again per scale cost most of the time
  const img = src && src.raw ? sharp(src.data, { raw: src.raw }) : sharp(src);
  const { data } = await img.resize(w, h, { fit, kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = w * h, Y = new Float32Array(n), M = new Float32Array(n), A = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = data[4 * i + 3] / 255;
    const r = (data[4 * i] * a + 255 * (1 - a)) / 255, g = (data[4 * i + 1] * a) / 255, b = (data[4 * i + 2] * a + 255 * (1 - a)) / 255;
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b; M[i] = (r + b) / 2 - g; A[i] = a;
  }
  return { w, h, Y, M, A };
}
/** Pad an image's planes with magenta by (px, py) on each side. */
function pad(im, px, py) {
  const w = im.w + 2 * px, h = im.h + 2 * py, n = w * h;
  const Y = new Float32Array(n).fill(0.299 + 0.114), M = new Float32Array(n).fill(1), A = new Float32Array(n);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const s = y * im.w + x, d = (y + py) * w + x + px;
    Y[d] = im.Y[s]; M[d] = im.M[s]; A[d] = im.A[s];
  }
  return { w, h, Y, M, A };
}
/** Masked NCC of template `t` (mask: its alpha > 0.5, or all) at every offset of `im` in [x0..x1] × [y0..y1]. */
function nccSearch(t, im, { masked = false, x0 = 0, y0 = 0, x1 = im.w - t.w, y1 = im.h - t.h, step = 1 } = {}) {
  const idx = [];
  for (let i = 0; i < t.w * t.h; i++) if (!masked || t.A[i] > 0.5) idx.push(i);
  const n = idx.length;
  if (n < 16) return null;
  const tx = new Int32Array(n), ty = new Int32Array(n), TY = new Float32Array(n), TM = new Float32Array(n);
  let sY = 0, sM = 0;
  idx.forEach((i, k) => { tx[k] = i % t.w; ty[k] = (i / t.w) | 0; TY[k] = t.Y[i]; TM[k] = t.M[i]; sY += t.Y[i]; sM += t.M[i]; });
  let vT = 0;
  for (let k = 0; k < n; k++) { TY[k] -= sY / n; TM[k] -= sM / n; vT += TY[k] * TY[k] + TM[k] * TM[k]; }
  let best = { score: -2, x: 0, y: 0 };
  const at = (ox, oy) => {
    let c = 0, a = 0, b = 0, a2 = 0, b2 = 0;
    for (let k = 0; k < n; k++) {
      const p = (oy + ty[k]) * im.w + ox + tx[k];
      const y = im.Y[p], m = im.M[p];
      c += TY[k] * y + TM[k] * m; a += y; b += m; a2 += y * y; b2 += m * m;
    }
    const vI = a2 - a * a / n + b2 - b * b / n;
    const s = vI > 1e-6 ? c / Math.sqrt(vT * vI) : -1;
    if (s > best.score) best = { score: s, x: ox, y: oy };
  };
  const xa = Math.max(0, x0), xb = Math.min(x1, im.w - t.w), ya = Math.max(0, y0), yb = Math.min(y1, im.h - t.h);
  for (let oy = ya; oy <= yb; oy += step) for (let ox = xa; ox <= xb; ox += step) at(ox, oy);
  // a strided search: the best offset's neighbours too
  if (step > 1) {
    const { x: bx, y: by } = best;
    for (let oy = Math.max(ya, by - step + 1); oy <= Math.min(yb, by + step - 1); oy++) {
      for (let ox = Math.max(xa, bx - step + 1); ox <= Math.min(xb, bx + step - 1); ox++) at(ox, oy);
    }
  }
  return best;
}
/**
 * Find `tplSrc` (a picture of part of the art) inside `artSrc`: the art's box in template px { x, y, w, h } and the
 * score. `range` = [min, max] of the art's width in template widths; `hang` = how far the template may hang out of the
 * art (fraction of its size); `masked`: compare only where the template is opaque.
 */
export async function register(sharp, tplSrc, artSrc, { range = [0.3, 4], hang = 0.5, masked = false, coarse = 48 } = {}) {
  const decode = async (f) => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, raw: { width: info.width, height: info.height, channels: 4 } }; };
  const tpl = await decode(tplSrc), art = await decode(artSrc);
  const TW = tpl.raw.width, TH = tpl.raw.height, AW = art.raw.width, AH = art.raw.height;
  // the coarse level's sizes come from a 400-px copy (cheaper to resize 27 times)
  const small = AW > 400 ? await decode(await sharp(art.data, { raw: art.raw }).resize(400).png().toBuffer()) : art;
  tplSrc = tpl; artSrc = art;
  const level = async (tw, scales, around) => {
    const th = Math.max(8, Math.round(tw * TH / TW));
    const t = await planes(sharp, tplSrc, tw, th);
    let best = null, tResize = 0, tNcc = 0;
    for (const s of scales) {
      const aw = Math.max(4, Math.round(s * tw)), ah = Math.max(4, Math.round(aw * AH / AW));
      const px = Math.ceil(hang * tw), py = Math.ceil(hang * th);
      const t0 = performance.now();
      const im = pad(await planes(sharp, aw <= 300 ? small : artSrc, aw, ah), px, py);
      tResize += performance.now() - t0;
      // the template's offset in the padded art; `around` limits it near a previous level's answer
      let lim = {};
      if (around) {
        const k = tw / around.tw;
        const cx = px - Math.round(around.x * k), cy = py - Math.round(around.y * k);
        lim = { x0: cx - 4, x1: cx + 4, y0: cy - 4, y1: cy + 4 };
      }
      const t1 = performance.now();
      const r = nccSearch(t, im, { masked, step: around ? 1 : 2, ...lim });
      tNcc += performance.now() - t1;
      if (r && (!best || r.score > best.score)) best = { score: r.score, s, x: px - r.x, y: py - r.y, tw };
    }
    if (process.env.CAF_TIME) console.log(`level ${tw}: ${scales.length} scales, resize ${tResize.toFixed(0)} ms, ncc ${tNcc.toFixed(0)} ms`);
    return best;
  };
  const geo = (a, b, step) => { const out = []; for (let v = a; v <= b * 1.0001; v *= step) out.push(v); return out; };
  // coarse: every scale; then finer around the best (x, y: the art's origin in template px of that level)
  let b = await level(coarse, geo(range[0], range[1], 1.05), null);
  if (!b) return null;
  for (const [want, span, step] of [[coarse * 3, 0.05, 1.01], [coarse * 9, 0.015, 1.004]]) {
    // never finer than either picture itself (an upscaled art adds time, not detail)
    const tw = Math.min(want, TW, Math.floor(AW / (b.s * (1 + span))));
    if (tw <= b.tw) continue;
    const nb = await level(tw, geo(b.s * (1 - span), b.s * (1 + span), step), b);
    if (nb) b = nb;
  }
  const k = TW / b.tw;
  return { score: +b.score.toFixed(3), x: b.x * k, y: b.y * k, w: b.s * b.tw * k, h: b.s * b.tw * k * AH / AW };
}

// ---- stills: the face rule on a full art ----------------------------------------------------------------------------
/**
 * The framing of a still full art on a card of aspect `ar` (height 1): its width the card's times z, the head's top
 * `TOP_MIN` (+1 %) from the card's top — the linked arts' placement, whose heads sit at 0.03 of the card (median of the
 * 98 registrations, 2026-11-24), the face below it and never past `FACE_MAX` — the art kept over the card's sides;
 * `alpha` (the art's alpha plane, aw × ah) measures what is left uncovered. face / top in art fractions. Returns the
 * pick { zoom, rect (card px of a 1-high card), faceY, top, uncovered }.
 */
export function stillFraming(face, alpha, ar = STILL_AR, zooms = STILL_ZOOMS) {
  const tries = [];
  for (const z of zooms) {
    const w = ar * z, h = w * alpha.h / alpha.w;
    const fyArt = face.y * h, topArt = face.top * h;
    const yt = Math.min(FACE_MAX, (fyArt - topArt) + TOP_MIN + 0.01);
    // an upside-down operator (`focus`: the portrait's area, its centre): that area in the card's middle
    let y = face.focus ? 0.5 - face.focus[1] * h : yt - fyArt;
    // the art's bottom stays at or below the card's bottom when it can
    if (y + h < 1) y = Math.min(0, 1 - h);
    // the face centred, the art kept over both sides
    let x = ar / 2 - (face.focus ? face.focus[0] : face.x) * w;
    x = Math.min(0, Math.max(ar - w, x));
    const top = y + topArt;
    // uncovered: the card's pixels where the art is transparent or absent (a 64-high grid)
    const GH = 64, GW = Math.round(GH * ar);
    let open = 0;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const u = ((i + 0.5) / GH - x) / w, v = ((j + 0.5) / GH - y) / h;
      const a = u >= 0 && u < 1 && v >= 0 && v < 1 ? alpha.A[Math.min(alpha.h - 1, (v * alpha.h) | 0) * alpha.w + Math.min(alpha.w - 1, (u * alpha.w) | 0)] : 0;
      if (a < 0.5) open++;
    }
    tries.push({ zoom: z, rect: { x, y, w, h }, faceY: +(y + fyArt).toFixed(4), top: +top.toFixed(4), uncovered: +(100 * open / (GW * GH)).toFixed(2) });
  }
  const ok = tries.filter((t) => t.top >= TOP_MIN);
  return ok.find((t) => t.uncovered <= GOAL) || ok.sort((a, b) => a.uncovered - b.uncovered || a.zoom - b.zoom)[0] || tries[0];
}

// ---- capture (browser) -----------------------------------------------------------------------------------------------
async function capture() {
  const BASE = arg('--base'), DIR = arg('--capture'), PAGES = arg('--pages');
  if (!BASE || !DIR) throw new Error('--base and --capture are needed');
  const { default: puppeteer } = await import('puppeteer-core');
  const { gpuArgs } = await import('./perfbench.mjs');
  fs.mkdirSync(DIR, { recursive: true });
  const T0 = Date.now(), LIMIT = 20 * 60e3, BYTES = 200e6;
  let bytes = 0;
  const boxes = {};
  // --zoom Z: the card framing zoomed out by Z about the card centre, so the whole illustration is in view (a tight crop
  // matched Chongyue's E2 art at 5.6× its size, score 0.41; zoomed out to 0.35, 0.96, 2026-11-23)
  const ZOOM = Number(arg('--zoom')) || 1;
  const url = (pg) => `${BASE}/dev/dyn-review.html?screen=room&page=${pg}&shot=1&lang=en&device=pc&tier=full&framing=card${ZOOM !== 1 ? `&zoomall=${ZOOM}` : ''}`;
  let browser = null;
  try {
    const list = PAGES ? PAGES.split(',').map(Number) : Array.from({ length: 30 }, (_, i) => i + 1);
    for (const pg of list) {
      if (Date.now() - T0 > LIMIT) { console.log('time cap'); break; }
      if (browser) await browser.close();
      browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', args: [...gpuArgs(), '--mute-audio', '--window-size=2319,1356'], defaultViewport: { width: 2319, height: 1356, deviceScaleFactor: 1 } });
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => { globalThis.__dynMainThread = true; });
      await page.goto(url(pg), { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => {
        const a = [...document.querySelectorAll('.rseat:not(.rseat--empty) .dyn-art')];
        return a.length > 0 && a.every((e) => e.dataset.dyn === 'live' || e.dataset.dyn === 'failed' || e.dataset.dyn === 'off');
      }, { timeout: 60000, polling: 300 }).catch(() => null);
      // the group's show (the 2D art dissolving away) is over a few seconds after
      await new Promise((r) => { setTimeout(r, 4500); });
      const info = await page.evaluate(() => { const r = window.__review.state(); return { page: r.page, n: r.pages.length, keys: r.pages[r.page].map((e) => e.key) }; });
      if (info.page !== pg - 1) break;
      await page.evaluate(() => { const s = document.createElement('style'); s.textContent = '.rs-seats--wide .rseat__art { background: #ff00ff !important; } .rs-seats--wide .dyn-art__still { visibility: hidden !important; }'; document.head.append(s); });
      await new Promise((r) => { setTimeout(r, 400); });
      const arts = await page.$$('.rseat:not(.rseat--empty) .dyn-art');
      for (let i = 0; i < arts.length && i < info.keys.length; i++) {
        const st = await arts[i].evaluate((e) => e.dataset.dyn);
        const live = await arts[i].$('.dyn-art__live');
        if (st !== 'live' || !live) continue;
        const b = await live.boundingBox();
        // captureBeyondViewport false: a clipped capture beyond the viewport smeared random cards (Dev 50, 2026-11-23)
        const buf = await page.screenshot({ clip: { x: b.x, y: b.y, width: b.width, height: b.height }, captureBeyondViewport: false, type: 'jpeg', quality: 92 });
        bytes += buf.length;
        if (bytes > BYTES) throw new Error('capture size cap');
        const key = info.keys[i];
        fs.writeFileSync(path.join(DIR, `${key.replace(/#/g, '~')}.jpg`), buf);
        boxes[key] = { w: b.width, h: b.height, zoom: ZOOM };
      }
      fs.writeFileSync(path.join(DIR, 'boxes.json'), JSON.stringify(boxes));
      console.log(`page ${pg}/${info.n}: ${info.keys.join(' ')}`);
      if (pg >= info.n) break;
    }
  } finally { if (browser) await browser.close(); }
  console.log(`${Object.keys(boxes).length} cards in ${Math.round((Date.now() - T0) / 1000)} s`);
}

// ---- the table ------------------------------------------------------------------------------------------------------
/** The full art of an animated illustration's key (data/dyn-card-framing.json keys): its outfit's art, else (`…_2`, the
 * Elite 2 illustration) the operator's default art. */
export function artOfKey(assets, key) {
  const lower = new Map(Object.entries(assets.outfits.chars).map(([id, r]) => [id.replace('@', '_').toLowerCase(), r]));
  const rec = lower.get(key.toLowerCase());
  if (rec) return rec.art || null;
  const m = /^(.*)_2$/.exec(key);
  return m ? assets.outfits.defaults[m[1]]?.art || null : null;
}

async function build() {
  const { default: sharp } = await import('sharp');
  const DIR = arg('--register'), OUT = arg('--out', path.join(ROOT, 'data/card-art-framing.json'));
  const T0 = Date.now(), LIMIT = 25 * 60e3;
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
  const file = (u) => path.join(ROOT, 'public', u.replace(/^\//, ''));
  const LOG = path.join(DIR, 'register.log');
  let logged = 0;
  fs.writeFileSync(LOG, '');
  const log = (s) => { const t = `${s}\n`; if (logged + t.length <= 200e3) { logged += t.length; fs.appendFileSync(LOG, t); } console.log(s); };
  const base = (u) => path.basename(u);
  // the static art has its own framing (the user, 2026-11-23: "This is literally why i demanded a separate setting for
  // static and live2d", after Chongyue's E2 art placed on its tight illustration showed a corner of his coat): every full
  // art, an illustration's too, is framed on its face (`stills`, which the cards use); `registered` keeps each
  // illustration's full art as found on the illustration, for reference only
  const out = { _source: 'tools/card-art-framing.mjs: generated, do not edit by hand. stills: every full art framed on the face '
    + 'of its official portrait (card units from the centre, u = min(w/232, h/458)); registered: each animated illustration\'s '
    + 'full art as found on the illustration at the card framing (reference, not shown).', registered: {}, stills: {} };
  const only = arg('--only');
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  // --keep-registered: the registrations already written (no capture needed)
  if (has('--keep-registered')) out.registered = prev.registered || prev.l2d || {};
  // animated illustrations: the full art found in the zoom-1 capture
  const boxes = !has('--keep-registered') && fs.existsSync(path.join(DIR, 'boxes.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'boxes.json'), 'utf8')) : {};
  for (const [key, box] of Object.entries(boxes)) {
    if (only && !key.includes(only)) continue;
    if (Date.now() - T0 > LIMIT) { log('time cap'); break; }
    const art = artOfKey(assets, key);
    if (!art || !fs.existsSync(file(art))) { log(`${key}: no full art`); continue; }
    // the art's width in capture widths scales with the capture's zoom (zoom 1: 0.3–4, Chongyue's E2 about 2 at 0.35)
    const cz = box.zoom > 0 ? box.zoom : 1;
    let r = await register(sharp, path.join(DIR, `${key.replace(/#/g, '~')}.jpg`), file(art), { range: [0.3 * Math.min(1, cz), 4 * cz], hang: 0.6 });
    // a poor match: the illustration may be framed tighter than that: wider
    if (!r || r.score < RETRY) {
      const w = await register(sharp, path.join(DIR, `${key.replace(/#/g, '~')}.jpg`), file(art), { range: [0.3 * Math.min(1, cz), 8 * cz], hang: 0.6 });
      if (w && (!r || w.score > r.score)) r = w;
    }
    if (!r || r.score < MIN_SCORE) { log(`${key}: no match${r ? ` (score ${r.score})` : ''}`); continue; }
    // the capture is the card's box at deviceScaleFactor 1: template px = card px
    const sx = box.w / (await sharp(path.join(DIR, `${key.replace(/#/g, '~')}.jpg`)).metadata()).width;
    // a zoomed capture (--zoom): back to the plain card framing, x1 = c + (x − c) / z about the card centre
    const z = box.zoom > 0 ? box.zoom : 1, cx = box.w / 2, cy = box.h / 2;
    const px = { x: cx + (r.x * sx - cx) / z, y: cy + (r.y * sx - cy) / z, w: (r.w * sx) / z, h: (r.h * sx) / z };
    out.registered[key] = { art: base(art), rect: toUnits(px, box.w, box.h), score: r.score };
    log(`${key}: ${base(art)} score ${r.score} rect ${out.registered[key].rect.join(' ')}`);
  }
  // --keep-stills: the stills already written are kept; with --stills only the missing ones are framed
  if (has('--keep-stills')) out.stills = { ...(prev.stills || {}) };
  // stills: every full art (an illustration's too), its face from its portrait
  if (has('--stills')) {
    const list = [];
    for (const [id, rec] of Object.entries(assets.outfits.chars)) if (rec.art && rec.portrait) list.push({ art: rec.art, portraits: [rec.portrait], id });
    for (const [cid, rec] of Object.entries(assets.outfits.defaults)) {
      if (!rec.art) continue;
      const p = [2, 1].map((e) => `/assets/char/portrait/${cid}_${e}.png`).filter((u) => fs.existsSync(file(u)));
      if (p.length) list.push({ art: rec.art, portraits: p, id: cid });
    }
    for (const it of list) {
      if (only && !it.id.includes(only)) continue;
      if (Date.now() - T0 > LIMIT) { log('time cap'); break; }
      if (out.stills[base(it.art)] || !fs.existsSync(file(it.art))) continue;
      let best = null;
      for (const p of it.portraits) {
        // the art's width in portrait widths: the official portrait is a 1:1 crop of the 2048-px charart, our art that
        // art trimmed and scaled to 1024 at most (a portrait about 84 px wide in it, 2026-11-23)
        const r = await register(sharp, file(p), file(it.art), { range: [4.5, 16], hang: 0.15, masked: true, coarse: 16 });
        if (r && (!best || r.score > best.r.score)) best = { r, p };
      }
      if (!best) { log(`${it.id}: no match`); continue; }
      const am = await sharp(file(it.art)).metadata();
      const pm = await sharp(file(best.p)).metadata();
      // the portrait's box in art fractions → the face and the head's top
      const k = am.width / best.r.w;
      const px = -best.r.x * k, py = -best.r.y * k, pw = pm.width * k, ph = pm.height * k;
      const face = { x: (px + pw / 2) / am.width, y: (py + PORTRAIT_FACE * ph) / am.height, top: (py + PORTRAIT_TOP * ph) / am.height };
      const aw = 128, ah = Math.max(8, Math.round(aw * am.height / am.width));
      const alpha = await planes(sharp, file(it.art), aw, ah);
      const pick = stillFraming(face, alpha);
      const H = 458, W = H * STILL_AR;
      out.stills[base(it.art)] = { rect: toUnits({ x: pick.rect.x * H, y: pick.rect.y * H, w: pick.rect.w * H, h: pick.rect.h * H }, W, H), score: best.r.score, zoom: pick.zoom, uncovered: pick.uncovered,
        face: [face.x, face.y, face.top].map((v) => +v.toFixed(4)) };
      log(`${it.id}: ${base(it.art)} via ${base(best.p)} score ${best.r.score} face ${face.x.toFixed(2)},${face.y.toFixed(2)} z${pick.zoom} ${pick.uncovered}%`);
    }
  }
  // the illustrations whose 2D art keeps its own placement (unlinked): a registration too poor to trust (Chongyue's E2
  // at 0.41, his coat's corner), plus the user's exported choices (--separate <dyn-card-framing-edits.json>: `separate`)
  const sepFile = arg('--separate');
  const userSep = sepFile && fs.existsSync(sepFile) ? JSON.parse(fs.readFileSync(sepFile, 'utf8')).separate || null : null;
  out.separate = Array.isArray(userSep) ? [...userSep].sort()
    : Object.entries(out.registered).filter(([, e]) => e.score < SEPARATE_BELOW).map(([k]) => k).sort();
  // --still-edits <dyn-card-framing-edits.json>: the user's move / zoom on a 2D art's own placement (`stills` of the
  // review page's export), kept as `adjust` (zoom about (fx, fy) of the card) and applied by the cards
  if (arg('--still-edits')) {
    const se = JSON.parse(fs.readFileSync(arg('--still-edits'), 'utf8')).stills || {};
    for (const [art, f] of Object.entries(se)) {
      if (!out.stills[art] || !(f?.zoom > 0)) continue;
      out.stills[art].adjust = { zoom: +f.zoom.toFixed(4), fx: +f.fx.toFixed(4), fy: +f.fy.toFixed(4) };
    }
  }
  const txt = `${JSON.stringify(out, null, 1)}\n`;
  if (txt.length > 400e3) throw new Error('table size cap');
  fs.writeFileSync(OUT, txt);
  log(`${Object.keys(out.registered).length} registered, ${Object.keys(out.stills).length} stills in ${Math.round((Date.now() - T0) / 1000)} s → ${path.relative(ROOT, OUT)}`);
}

/** --reframe: the stills of a written table framed again from their stored faces (no matching; a zoom-step change). */
async function reframe() {
  const { default: sharp } = await import('sharp');
  const OUT = arg('--out', path.join(ROOT, 'data/card-art-framing.json'));
  const t = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const H = 458, W = H * STILL_AR;
  let n = 0;
  for (const [art, e] of Object.entries(t.stills || {})) {
    if (!Array.isArray(e.face)) continue;
    const f = path.join(ROOT, 'public/assets/outfit/art', art);
    if (!fs.existsSync(f)) continue;
    const am = await sharp(f).metadata();
    const alpha = await planes(sharp, f, 128, Math.max(8, Math.round(128 * am.height / am.width)));
    const pick = stillFraming({ x: e.face[0], y: e.face[1], top: e.face[2], ...(e.focus ? { focus: e.focus } : {}) }, alpha);
    Object.assign(e, { rect: toUnits({ x: pick.rect.x * H, y: pick.rect.y * H, w: pick.rect.w * H, h: pick.rect.h * H }, W, H), zoom: pick.zoom, uncovered: pick.uncovered });
    n++;
  }
  fs.writeFileSync(OUT, `${JSON.stringify(t, null, 1)}\n`);
  console.log(`${n} stills framed again → ${path.relative(ROOT, OUT)}`);
}

/**
 * Where the official card puts a still art: the client's prefab of it (position and size in the illustration holder, y up)
 * through the holder's own offset and scale (render/dynillust/framing.js, the animated illustrations' values), and the part
 * of the official canvas our file holds (`box`, canvas fractions). The art's box in card units from the window's centre.
 */
export function officialRect(f) {
  const x0 = HOLDER_SCALE * (f.x - f.w / 2), y0 = -HOLDER_Y - HOLDER_SCALE * (f.y + f.h / 2);
  const [l, t, r, b] = f.box;
  return [x0 + HOLDER_SCALE * f.w * l, y0 + HOLDER_SCALE * f.h * t, HOLDER_SCALE * f.w * (r - l), HOLDER_SCALE * f.h * (b - t)].map((v) => +v.toFixed(2));
}

/** The size of a portrait in the official canvas, UI units of height: 194–416 on the 481 matches scored at least 0.8. */
export const PORTRAIT_UI = Object.freeze([190, 430]);
/** A face match below REFACE_BELOW, or of another size, is searched again; a new one counts from REFACE_MIN and only when
 * better (the new matches at 0.54–0.63 checked by eye, 2026-11-25; the one at 0.38, a chibi's, was wrong). */
export const REFACE_BELOW = 0.6, REFACE_MIN = 0.5;
/** Past this a match is good enough to stop turning the portrait. */
const REFACE_GOOD = 0.8;
/** The face and the head's top (art px) of a portrait `ph` px high lying at centre (cx, cy), turned `rot`° clockwise. */
export function turnedFace(cx, cy, ph, rot = 0) {
  const a = (rot * Math.PI) / 180, r = (0.5 - PORTRAIT_FACE) * ph;
  const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
  return { x, y, top: y - (PORTRAIT_FACE - PORTRAIT_TOP) * ph };
}

/**
 * --reface <frames.json> (tools/local-extract/illust_framing.py): the still-only arts whose face was matched poorly or at a
 * size no portrait has (a leg, a bag, a pet: 2026-11-24) are matched again inside the official card's window, at the
 * official portraits' size, turned in 15° steps when the straight one is not found (an operator drawn falling or leaning),
 * and framed again. An art of an animated illustration is left alone.
 */
async function reface() {
  const { default: sharp } = await import('sharp');
  const OUT = arg('--out', path.join(ROOT, 'data/card-art-framing.json'));
  const t = JSON.parse(fs.readFileSync(OUT, 'utf8')), frames = JSON.parse(fs.readFileSync(arg('--reface'), 'utf8'));
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).outfits;
  const linked = new Set(Object.values(t.registered || {}).map((e) => e.art));
  const pub = (u) => path.join(ROOT, 'public', u.replace(/^\//, ''));
  const portraits = new Map();
  for (const r of Object.values(assets.chars)) if (r.art && r.portrait) portraits.set(path.basename(r.art), [r.portrait]);
  for (const [cid, r] of Object.entries(assets.defaults)) if (r.art) portraits.set(path.basename(r.art), [2, 1].map((e) => `/assets/char/portrait/${cid}_${e}.png`));
  const T0 = Date.now();
  const H = 458, W = H * STILL_AR;
  for (const [art, e] of Object.entries(t.stills)) {
    const f = frames[art], file = pub(`/assets/outfit/art/${art}`);
    if (linked.has(art) || !f || !e.official || !fs.existsSync(file)) continue;
    const ui = ((e.face[1] - e.face[2]) / (PORTRAIT_FACE - PORTRAIT_TOP)) * (f.box[3] - f.box[1]) * f.h;
    if (e.score >= REFACE_BELOW && ui >= PORTRAIT_UI[0] && ui <= PORTRAIT_UI[1]) continue;
    if (Date.now() - T0 > 12 * 60e3) throw new Error('time cap, nothing written');
    const m = await sharp(file).metadata(), [L, T, OW] = e.official, k = m.width / OW; // art px per card unit
    // the card's window with 60 units of room (to 300 down: no face of the good matches sits lower)
    const x0 = Math.max(0, Math.round((-176 - L) * k)), y0 = Math.max(0, Math.round((-289 - T) * k));
    const x1 = Math.min(m.width, Math.round((176 - L) * k)), y1 = Math.min(m.height, Math.round((71 - T) * k));
    const crop = await sharp(file).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
    let best = null;
    for (const u of portraits.get(art) || []) {
      if (!fs.existsSync(pub(u))) continue;
      const pm = await sharp(pub(u)).metadata();
      for (let rot = 0; rot < 360 && !(best && best.r.score >= REFACE_GOOD); rot += 15) {
        const tpl = rot ? await sharp(pub(u)).ensureAlpha().rotate(rot, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : pub(u);
        const rm = await sharp(tpl).metadata();
        // the crop's width in template widths, for a portrait of PORTRAIT_UI height
        const at = (v) => (x1 - x0) / (v * HOLDER_SCALE * k * (rm.width / pm.height));
        const r = await register(sharp, tpl, crop, { range: [at(PORTRAIT_UI[1]), at(PORTRAIT_UI[0])], hang: 0.25, masked: true, coarse: 32 });
        if (r && (!best || r.score > best.r.score)) best = { r, rm, pm, rot };
      }
    }
    if (!best || best.r.score < REFACE_MIN || best.r.score <= e.score) { console.log(`${art}: kept (${e.score}, best ${best?.r.score})`); continue; }
    const q = (x1 - x0) / best.r.w;
    const cx = x0 + (best.rm.width / 2 - best.r.x) * q, cy = y0 + (best.rm.height / 2 - best.r.y) * q;
    const p = turnedFace(cx, cy, best.pm.height * q, best.rot);
    // drawn upside down on purpose: the body is above the head, so the card frames the portrait's whole area (the user,
    // 2026-11-25, on Leonhardt: "his art is upside down, which is artist intention. and it should be framed around that area")
    const focus = best.rot > 90 && best.rot < 270 ? [+(cx / m.width).toFixed(4), +(cy / m.height).toFixed(4)] : null;
    // rounded as stored, so --reframe gives the same box
    const face = { x: +(p.x / m.width).toFixed(4), y: +(p.y / m.height).toFixed(4), top: +(p.top / m.height).toFixed(4) };
    const alpha = await planes(sharp, file, 128, Math.max(8, Math.round((128 * m.height) / m.width)));
    const pick = stillFraming(focus ? { ...face, focus } : face, alpha);
    console.log(`${art}: ${e.score} → ${best.r.score}${best.rot ? ` turned ${best.rot}°` : ''} z${pick.zoom}`);
    Object.assign(e, { rect: toUnits({ x: pick.rect.x * H, y: pick.rect.y * H, w: pick.rect.w * H, h: pick.rect.h * H }, W, H), score: best.r.score, zoom: pick.zoom, uncovered: pick.uncovered,
      face: [face.x, face.y, face.top], ...(focus ? { focus } : {}) });
  }
  const txt = `${JSON.stringify(t, null, 1)}\n`;
  if (txt.length > 400e3) throw new Error('table size cap');
  fs.writeFileSync(OUT, txt);
  console.log(`done in ${Math.round((Date.now() - T0) / 1000)} s`);
}

/** --official <frames.json> (tools/local-extract/illust_framing.py): stills[art].official from the client's prefabs; an
 * art of an animated illustration gets none (it keeps its registered box). */
function official() {
  const OUT = arg('--out', path.join(ROOT, 'data/card-art-framing.json'));
  const t = JSON.parse(fs.readFileSync(OUT, 'utf8')), frames = JSON.parse(fs.readFileSync(arg('--official'), 'utf8'));
  const linked = new Set(Object.values(t.registered || {}).map((e) => e.art));
  let n = 0;
  const none = [];
  for (const [art, e] of Object.entries(t.stills || {})) {
    delete e.official;
    if (linked.has(art)) continue;
    if (!frames[art]) { none.push(art); continue; }
    e.official = officialRect(frames[art]);
    n++;
  }
  const txt = `${JSON.stringify(t, null, 1)}\n`;
  if (txt.length > 400e3) throw new Error('table size cap');
  fs.writeFileSync(OUT, txt);
  console.log(`${n} official, ${none.length} without (room framing), ${linked.size} linked left as they are → ${path.relative(ROOT, OUT)}`);
  if (none.length) console.log(none.join(' '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (arg('--official')) official();
  else if (arg('--reface')) await reface();
  else if (has('--reframe')) await reframe();
  else if (arg('--capture')) await capture();
  else if (arg('--register')) await build();
  else console.log('usage: --capture <dir> --base <url> | --register <dir> [--stills] [--out file]');
}
