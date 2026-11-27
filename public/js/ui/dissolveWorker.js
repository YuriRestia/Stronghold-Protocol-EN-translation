// The room cards' dissolve drawn off the page's thread (ui/dynCards.js dissolveWorker): the same WebGL2 shader, mask and
// tile pass as on the page (ui/cardEntrance.js), in this Worker's own context, into each card's dissolve and wash
// canvases (handed over with transferControlToOffscreen). On the page, the context's creation, the shader's status
// queries, the shared canvas's first allocation and each picture's upload waited on the GPU process while the cards
// loaded: 180–409 ms, 71 ms, 138–160 ms and 47–72 ms a card of main-thread frames [src: work/dev-55 ss-1440-3.json,
// ss-1440-5.json, ss-1440-7.json, 2026-11-23]. Here they cost the page nothing; the page only posts each frame's numbers.
//
// Messages in: init { maskUrl, glow } → ready { ok, err }; card { id, dis, wash } (OffscreenCanvas each);
// prep { id, url, gm, bg, fill?, filter, key } → prepared { id, ok, key }; frame { items }; end { id }; washEnd { id };
// drop { id } (picture and tiles freed, canvases kept); forget { id }.
import { glReady, loadDissolveMask, dissolvePicture, freeDissolvePicture, batchDissolve, batchBloom, flushBatch, reserveTiles, drawDissolve, paintBackgroundStyle, paintCover } from './cardEntrance.js';

const cards = new Map(); // id → { dis, wash, pic }
let mask = null;

/** After the next frame of this Worker (its canvases' drawing committed), or a 16 ms timer where Workers have no rAF. */
const nextFrame = () => new Promise((r) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => r()); else setTimeout(r, 16); });

async function init({ maskUrl }) {
  if (typeof OffscreenCanvas !== 'function') throw new Error('no OffscreenCanvas');
  if (!(await glReady())) throw new Error('no WebGL2');
  mask = await loadDissolveMask(maskUrl);
  // never ready without a test draw: an opaque red picture dissolved at 0 must come out opaque red
  const src = new OffscreenCanvas(4, 4), sg = src.getContext('2d');
  sg.fillStyle = '#ff0000'; sg.fillRect(0, 0, 4, 4);
  const pic = dissolvePicture(src, mask), out = new OffscreenCanvas(4, 4);
  const drawn = !!pic && drawDissolve(out, pic, 0, 4, 4);
  freeDissolvePicture(pic);
  const px = drawn ? out.getContext('2d').getImageData(1, 1, 1, 1).data : null;
  if (!px || px[3] < 200 || px[0] < 200) throw new Error(`test draw ${px ? Array.from(px).join(',') : 'failed'}`);
}

async function prep({ id, url, gm, bg, fill, filter, key }) {
  const c = cards.get(id);
  if (!c || !mask) return { ok: false, key };
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) return { ok: false, key };
  // (fork) a wide room card's home background (ui/dynCards.js FILL): in the picture under the 2D art, as on the card
  let fillBmp = null;
  if (fill?.url) {
    const fr = await fetch(fill.url, { cache: 'force-cache' });
    if (!fr.ok) return { ok: false, key };
    fillBmp = await createImageBitmap(await fr.blob());
  }
  const { x, y, w, h } = gm.crop;
  const bmp = await createImageBitmap(await r.blob(), Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)),
    { resizeWidth: Math.max(1, Math.round(gm.dw)), resizeHeight: Math.max(1, Math.round(gm.dh)), resizeQuality: 'high' });
  // the art box as it shows: its background, then the 2D art at its place (and its filter)
  const cv = new OffscreenCanvas(gm.W, gm.H), g = cv.getContext('2d');
  paintBackgroundStyle(g, bg, gm.W, gm.H);
  if (fillBmp) { paintCover(g, fillBmp, gm.W, gm.H, fill.px, fill.py); fillBmp.close(); }
  if (filter && filter !== 'none') g.filter = filter;
  g.drawImage(bmp, gm.dx, gm.dy, gm.dw, gm.dh);
  bmp.close();
  c.pic = dissolvePicture(cv, mask, c.pic);
  // the tiles reserved and the first frame drawn now; the wash sized (empty) now too, not at the show
  reserveTiles(id, gm.W, gm.H);
  const ok = !!c.pic && drawDissolve(c.dis, c.pic, 0, gm.W, gm.H);
  if (c.wash.width !== gm.W || c.wash.height !== gm.H) { c.wash.width = gm.W; c.wash.height = gm.H; }
  await nextFrame();
  return { ok, key };
}

function frame(items) {
  for (const it of items) {
    const c = cards.get(it.id);
    if (!c) continue;
    if (it.kind === 'dissolve') { if (c.pic) batchDissolve(c.dis, c.pic, it.drive, it.W, it.H, it.dim); } else batchBloom(c.wash, it.k, it.glow, it.band, it.W, it.H);
  }
  flushBatch();
}

function free(c) { freeDissolvePicture(c.pic); c.pic = null; }

self.onmessage = (ev) => {
  const m = ev.data || {};
  try {
    if (m.type === 'init') init(m).then(() => self.postMessage({ type: 'ready', ok: true }), (err) => self.postMessage({ type: 'ready', ok: false, err: String(err?.message || err) }));
    else if (m.type === 'card') cards.set(m.id, { dis: m.dis, wash: m.wash, pic: null });
    else if (m.type === 'prep') prep(m).then((r) => self.postMessage({ type: 'prepared', id: m.id, ...r }), (err) => self.postMessage({ type: 'prepared', id: m.id, ok: false, key: m.key, err: String(err?.message || err) }));
    else if (m.type === 'frame') frame(m.items || []);
    else if (m.type === 'end') { const c = cards.get(m.id); if (c) { c.dis.width = 1; c.dis.height = 1; free(c); } }
    else if (m.type === 'washEnd') { const c = cards.get(m.id); if (c) { c.wash.width = 1; c.wash.height = 1; } }
    else if (m.type === 'drop' || m.type === 'forget') {
      const c = cards.get(m.id);
      if (c) { free(c); c.dis.width = 1; c.dis.height = 1; c.wash.width = 1; c.wash.height = 1; }
      reserveTiles(m.id);
      if (m.type === 'forget') cards.delete(m.id);
    }
  } catch (err) { console.warn('[dissolveWorker]', err); if (m.type === 'prep') self.postMessage({ type: 'prepared', id: m.id, ok: false, key: m.key }); }
};
