#!/usr/bin/env node
// tools/dyn-cover-framing.mjs — the wide room cards' framing per animated illustration (data/dyn-card-framing.json).
//
// The user's pick of 2026-11-23: the card framing (the official end-of-match card's, render/dynillust/framing.js) zoomed
// to cover the wide card, framed on the operator's face ("faces cut off by the framing, that's just bad photography").
// For each illustration of the server's index, on the review page's 4-seat room (public/dev/dyn-review.html, 16:9 cards,
// a 2319 × 1356 window, the renderer on the main thread so its skeletons can be read):
//   1. the face and the head's top, from the illustration's own rig, through the card's own framing map: the operator's
//      bones (named after it, char_391_rosmon → "rosmon", when the rig names them so; cats, toys and background figures
//      left out) — eyes / mouth / nose / brows / face, else the ears, else the head, else the top of the hair (median);
//      the head's top = the highest head / hair / ear / horn / hat bone within 22 % of the card height of the face;
//   2. for each zoom of ZOOMS, the card framing zoomed about the point that puts the face on its line — kept where it is
//      while between BAND, else moved into it, and low enough (up to 0.45) that the whole head fits under TOP_MIN —, and
//      the share of the card the scene leaves uncovered (the art box painted magenta, counted in a screenshot);
//   3. the pick: the smallest zoom that covers the card (≤ GOAL %) with the head inside, else the one covering most.
// The values are design choices (the user's "card zoom" with a face rule), not official data: GOAL, TOP_MIN, BAND, the
// zoom steps and the cap 1.35 (where faces still kept their head in the 4K stills of 2026-11-23).
//
// usage:
//   node tools/dyn-cover-framing.mjs --base http://127.0.0.1:3253 --measure <out.json> [--pages 1,2] [--profile <dir>]
//     (a running server with the illustrations; GPU Chrome: run it under the crew lock; about 14 min for 98)
//   node tools/dyn-cover-framing.mjs --table <measure.json> [--out data/dyn-card-framing.json]
//     (writes the table from a measurement: { cards: { key: { zoom, fx, fy } } })
// Caps: 30 pages, 25 min, measurement file < 1 MB, log < 200 KB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const ZOOMS = [1, 1.1, 1.2, 1.35];
export const GOAL = 0.5, TOP_MIN = 0.02, BAND = [0.22, 0.38], FACE_MAX = 0.45;

/** The framing at zoom z for a face at (x, y) with the head's top at `top` (card fractions): null when z is 1 and the
 * face must move. Zooming about F keeps F put: the face lands on yt = F + z · (y − F). */
export function planFraming(face, z) {
  if (!face) return { zoom: z, fx: 0.5, fy: 0.25, faceY: null, top: null };
  const fitHead = z * (face.y - face.top) + TOP_MIN + 0.01;
  const yt = Math.min(FACE_MAX, Math.max(BAND[0], Math.min(BAND[1], face.y), fitHead));
  if (z === 1) return Math.abs(yt - face.y) < 0.005 ? { zoom: 1, fx: face.x, fy: face.y, faceY: face.y, top: face.top } : null;
  const fy = (yt - z * face.y) / (1 - z);
  return { zoom: z, fx: face.x, fy, faceY: yt, top: fy + z * (face.top - fy) };
}
/** The pick among measured tries: the smallest zoom covering the card with the head inside, else the best covering. */
export function pickFraming(tries) {
  const ok = Object.values(tries).filter((t) => t.top == null || t.top >= TOP_MIN);
  return ok.find((t) => t.uncovered <= GOAL) || ok.sort((a, b) => a.uncovered - b.uncovered || a.zoom - b.zoom)[0] || null;
}
/**
 * The illustrations the user keeps at the plain card framing, no zoom (the user, 2026-11-23: "These operators outfit
 * looks fine by default, no zooming needed": Nian E2, Surtr summer, Rosmontis Become Anew and An Airy Dream, Skadi alter
 * E2, Ch'en alter's two outfits, Pramanix alter's outfit, Kal'tsit alter E2, Mon3tr, Haruka, Talulah E2, Mizuki,
 * Tragodia, Hoshiguma alter's outfit and E2, Ling E2, Chongyue's two outfits, Pepe E2, Młynar W Dali, Lin's two outfits).
 */
export const PLAIN = Object.freeze([
  'char_2014_nian_2', 'char_350_surtr_summer#9', 'char_391_rosmon_epoque#17', 'char_391_rosmon_sale#16', 'char_1012_skadi2_2',
  'char_1013_chen2_boc#6', 'char_1013_chen2_summer#20', 'char_1046_sbell2_ambiencesynesthesia#8', 'char_1052_kalts2_2',
  'char_4179_monstr_boc#11', 'char_4202_haruka_iteration#6', 'char_4247_oxi_2', 'char_437_mizuki_sale#7',
  'char_1042_phatm2_sightseer#4', 'char_1044_hsgma2_whirlwind#11', 'char_1044_hsgma2_2', 'char_2023_ling_2',
  'char_2024_chyue_cfa#1', 'char_2024_chyue_nian#10', 'char_4058_pepe_2', 'char_4064_mlynar_epoque#28',
  'char_4080_lin_nian#10', 'char_4080_lin_summer#19',
]);
/** The table written to data/dyn-card-framing.json from a measurement; PLAIN keys at zoom 1 (the plain card framing);
 * `edits` (the review page's export, dyn-card-framing-edits.json): the user's hand framings, its `edited` cards, win. */
export function framingTable(measure, edits = null) {
  const t = framingTableFrom(measure);
  for (const [k, e] of Object.entries(edits?.cards || {})) {
    if (!e?.edited || !(e.zoom > 0) || !Number.isFinite(e.fx) || !Number.isFinite(e.fy)) continue;
    t.cards[k] = { zoom: +e.zoom.toFixed(4), fx: +e.fx.toFixed(4), fy: +e.fy.toFixed(4), by: 'user' };
  }
  if (edits) t._source += ` The cards marked by: user are the user's own framings (review page export of ${edits.exported || 'unknown date'}).`;
  return t;
}
function framingTableFrom(measure) {
  const cards = {};
  const plain = new Set(PLAIN);
  for (const r of [...measure.rows].sort((a, b) => a.key.localeCompare(b.key))) {
    // kept plain; the measured face framing stays as `face` (the review page's Zoomed switch)
    if (plain.has(r.key)) {
      cards[r.key] = { zoom: 1, fx: 0.5, fy: 0.5, ...(r.pick ? { face: { zoom: r.pick.zoom, fx: +r.pick.fx.toFixed(4), fy: +r.pick.fy.toFixed(4) } } : {}) };
      continue;
    }
    if (!r.pick) continue;
    cards[r.key] = { zoom: r.pick.zoom, fx: +r.pick.fx.toFixed(4), fy: +r.pick.fy.toFixed(4) };
  }
  return {
    _source: 'tools/dyn-cover-framing.mjs: generated, do not edit by hand. Each illustration\'s face and head from its own '
      + 'rig, the card framing (framing.js) zoomed about (fx, fy) of the card, its coverage measured on the review page.',
    cards,
  };
}

async function measure() {
  const BASE = arg('--base'), OUT = arg('--measure'), PAGES = arg('--pages');
  if (!BASE || !OUT) throw new Error('--base and --measure are needed');
  const { default: puppeteer } = await import('puppeteer-core');
  const { gpuArgs } = await import('./perfbench.mjs');
  const { default: sharp } = await import('sharp');
  const T0 = Date.now(), LIMIT = 25 * 60e3;
  const rows = [];
  const LOG = OUT.replace(/\.json$/, '') + '.log';
  let logged = 0;
  fs.writeFileSync(LOG, '');
  const log = (s) => { const t = `${s}\n`; if (logged + t.length > 200e3) return; logged += t.length; fs.appendFileSync(LOG, t); console.log(s); };
  const save = (done) => { const out = JSON.stringify({ zooms: ZOOMS, goal: GOAL, topMin: TOP_MIN, band: BAND, done, rows }); if (out.length < 1e6) fs.writeFileSync(OUT, out); };
  // a fresh browser per page: a long session of main-thread GL stages lost its skeletons after some pages (2026-11-23)
  let browser = null, page = null;
  const open = async () => {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', userDataDir: arg('--profile') || undefined,
      args: [...gpuArgs(), '--mute-audio', '--window-size=2319,1356'], defaultViewport: { width: 2319, height: 1356, deviceScaleFactor: 1 } });
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { globalThis.__dynMainThread = true; });
  };
  const url = (pg, fr) => `${BASE}/dev/dyn-review.html?screen=room&page=${pg}&shot=1&lang=en&device=pc&tier=full&framing=card${fr ? `&fr=${encodeURIComponent(fr)}` : ''}`;
  const settled = () => page.waitForFunction(async () => {
    const R = await import('/js/render/dynillust/index.js'); const st = R.getDynIllustStage();
    const cards = [...st.cards];
    return cards.length > 0 && cards.every((c) => c.state === 'failed' || (c.state === 'live' && c.slot && c.slot.skel?.spine));
  }, { timeout: 60000, polling: 300 }).then(() => true, () => false);
  const uncovered = async () => {
    // the group's show (the 2D cover dissolving away) is over a few seconds after the stage reports live
    await page.waitForFunction(() => [...document.querySelectorAll('.rseat:not(.rseat--empty) .dyn-art')].every((e) => e.dataset.dyn === 'live' || e.dataset.dyn === 'failed'), { timeout: 30000, polling: 250 }).catch(() => null);
    await new Promise((r) => { setTimeout(r, 4500); });
    await page.evaluate(() => { const s = document.createElement('style'); s.textContent = '.rs-seats--wide .rseat__art { background: #ff00ff !important; }'; document.head.append(s); });
    await new Promise((r) => { setTimeout(r, 400); });
    const out = [];
    for (const a of await page.$$('.rseat:not(.rseat--empty) .rseat__art')) {
      const b = await a.boundingBox();
      const buf = await page.screenshot({ clip: { x: b.x + 3, y: b.y + 3, width: b.width - 6, height: b.height - 6 }, type: 'png' });
      const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let m = 0; for (let p = 0; p < data.length; p += 3) if (data[p] > 190 && data[p + 1] < 80 && data[p + 2] > 190) m++;
      out.push(+(100 * m / (info.width * info.height)).toFixed(2));
    }
    return out;
  };
  try {
    const list = PAGES ? PAGES.split(',').map(Number) : Array.from({ length: 30 }, (_, i) => i + 1);
    for (const pg of list) {
      if (Date.now() - T0 > LIMIT) break;
      if (browser) await browser.close();
      await open();
      await page.goto(url(pg), { waitUntil: 'load', timeout: 60000 });
      const okLoad = await settled();
      const info = await page.evaluate(async () => {
        const r = window.__review.state();
        const R = await import('/js/render/dynillust/index.js'); const st = R.getDynIllustStage();
        const want = r.pages[r.page].map((e) => e.key);
        for (let i = 0; i < 60; i++) {
          const have = new Set([...st.slots.values()].filter((s) => s?.skel?.spine).map((s) => s.key));
          if (want.every((k) => have.has(k))) break;
          await new Promise((res) => { setTimeout(res, 250); });
        }
        const face = {};
        const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
        for (const s of st.slots.values()) {
          const sp = s?.skel?.spine; if (!sp) continue;
          const at = (b) => [(sp.x + sp.scale.x * b.worldX) / s.w, (sp.y + sp.scale.y * b.worldY) / s.h];
          const token = (s.key.split('_')[2] || '').replace(/\d+$/, '').toLowerCase();
          const all = sp.skeleton.bones.filter((b) => !/(^|_)(cat|toy|bg|pet|doll|bird|fish)/i.test(b.data.name));
          const own = token.length >= 3 ? all.filter((b) => b.data.name.toLowerCase().includes(token)) : [];
          const pool = own.length >= 8 ? own : all;
          const pick = (re) => pool.filter((b) => re.test(b.data.name)).map(at);
          let pts = pick(/face|eye|mouth|nose|brow/i);
          if (!pts.length) pts = pick(/(^|_)ear|ear(_|$)/i);
          if (!pts.length) pts = pick(/head/i);
          if (!pts.length) { const h = pick(/hair|bang|ahoge/i).sort((p, q) => p[1] - q[1]); pts = h.slice(0, Math.max(1, h.length >> 2)); }
          if (!pts.length) { face[s.key] = null; continue; }
          const fx = med(pts.map((p) => p[0])), fy = med(pts.map((p) => p[1]));
          const rr = 0.22 * s.h;
          const near = pick(/head|face|hair|bang|ahoge|ear|horn|hat|crown/i).filter(([x, y]) => Math.hypot((x - fx) * s.w, (y - fy) * s.h) <= rr);
          face[s.key] = { from: own.length >= 8 ? token : 'all', n: pts.length, x: fx, y: fy, top: near.length ? Math.min(...near.map((p) => p[1])) : fy - 0.1 };
        }
        return { page: r.page, n: r.pages.length, keys: r.pages[r.page].map((e) => e.key), names: r.names, face };
      });
      if (info.page !== pg - 1) break;
      const res = info.keys.map((key, i) => ({ key, name: info.names[i], face: info.face[key] || null, tries: {} }));
      for (const z of ZOOMS) {
        const plans = res.map((r) => planFraming(r.face, z));
        if (plans.every((p) => !p)) continue;
        const fr = res.map((r, i) => (plans[i] ? `${r.key}~${z}~${plans[i].fx.toFixed(4)}~${plans[i].fy.toFixed(4)}` : null)).filter(Boolean).join('|');
        if (z !== 1) { await page.goto(url(pg, fr), { waitUntil: 'load', timeout: 60000 }); await settled(); }
        const u = await uncovered();
        res.forEach((r, i) => { if (plans[i]) r.tries[z] = { ...plans[i], uncovered: u[i] }; });
      }
      for (const r of res) r.pick = pickFraming(r.tries);
      rows.push(...res.map((r) => ({ ...r, page: pg, okLoad })));
      save(false);
      log(`page ${pg}/${info.n}: ${res.map((r) => `${r.key} face ${r.face ? r.face.y.toFixed(2) : '-'} → z${r.pick?.zoom} ${r.pick?.uncovered}%`).join(' | ')}`.slice(0, 600));
      if (pg >= info.n) break;
    }
  } finally { if (browser) await browser.close(); }
  save(true);
  log(`rows ${rows.length} in ${Math.round((Date.now() - T0) / 1000)} s`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (arg('--table')) {
    const out = arg('--out', path.join(ROOT, 'data/dyn-card-framing.json'));
    // --edits <dyn-card-framing-edits.json>: the user's hand framings from the review page
    const edits = arg('--edits') ? JSON.parse(fs.readFileSync(arg('--edits'), 'utf8')) : null;
    const t = framingTable(JSON.parse(fs.readFileSync(arg('--table'), 'utf8')), edits);
    fs.writeFileSync(out, `${JSON.stringify(t, null, 1)}\n`);
    console.log(`${Object.keys(t.cards).length} illustrations → ${path.relative(ROOT, out)}`);
  } else await measure();
}
