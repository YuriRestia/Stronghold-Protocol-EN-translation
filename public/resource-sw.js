// public/resource-sw.js — the Service Worker of the optional asset preload (Settings ▸ Preload assets;
// shared/resources.js, public/js/resources/). Registered by public/js/resources/index.js once the player starts a
// download (also while it is paused) and unregistered by 'Clear cache', which deletes the saved files.
//
// It answers GET /assets/**, /fonts/** and the extension-less /media/** audio route (→ the stored /assets/audio/….mp3)
// from Cache Storage, and only with a file whose stored hash (its `X-SP-Resource` header) is the one the current manifest
// lists: after a deploy a changed file goes to the network until new bytes are saved. Everything else — code, data, the
// API, WebSocket upgrades, and the preload's own `?v=` downloads — passes straight through.
//
// A file the game fetches that is not saved yet is saved on the way (`capture`): when it is in the manifest, belongs to
// a pack the player picked (the page writes them to `PACKS_PATH`), and its size and SHA-1 match. The page's download
// then skips it (public/js/resources/store.js reads the same header), so nothing is downloaded twice.
//
// A classic worker on purpose (module workers are recent in Firefox), so the path rules below are a copy of
// shared/resources.js `resourceKey` / `mediaKeys`; test/resources.test.js runs both on the same paths.
/* global self, caches */

const CACHE_NAME = 'sp-resources-v1';
/** Synthetic entry the page writes: { packs: [...] }, the packs a capture may save. */
const PACKS_PATH = '/__sp-resource-packs__';
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const VOICE_PACKS = ['cn', 'en', 'jp', 'kr', 'native'];
const MANIFEST_URL = '/data/resource-manifest.json';
const MEDIA_PREFIX = '/media/';
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav'];
/** Re-read the manifest at most this often on a page load (a deploy restarts the server and changes its ETag). */
const RECHECK_MS = 60 * 1000;

function resourceKey(pathname) {
  try { return encodeURI(decodeURI(String(pathname || ''))); } catch { return null; }
}

function mediaKeys(pathname) {
  const p = String(pathname || '');
  if (!p.startsWith(MEDIA_PREFIX)) return [];
  const rest = p.slice(MEDIA_PREFIX.length);
  const segments = rest.split('/');
  if (!rest || segments.some((s) => !s || s.startsWith('.') || s.endsWith('.'))) return [];
  const last = segments[segments.length - 1];
  const given = AUDIO_EXTS.find((e) => last.toLowerCase().endsWith(e)) || '';
  const stem = given ? last.slice(0, -given.length) : last;
  if (!stem) return [];
  const base = `/assets/audio/${[...segments.slice(0, -1), stem].join('/')}`;
  const order = given ? [given, ...AUDIO_EXTS.filter((e) => e !== given)] : AUDIO_EXTS;
  return order.map((ext) => resourceKey(base + ext)).filter(Boolean);
}

/** Copy of shared/resources.js packOf. */
function packOf(path) {
  const p = String(path || '');
  const voice = /^\/assets\/audio\/voice\/([a-z]+)\//.exec(p);
  if (voice) return VOICE_PACKS.includes(voice[1]) ? voice[1] : 'audio';
  if (p.startsWith('/assets/audio/')) return 'audio';
  if (/^\/assets\/(?:local\/)?ui\/guide\//.test(p) || p.startsWith('/assets/local/guide/')) return 'audio';
  return 'visual';
}

function isResourcePath(p) {
  return p.startsWith('/assets/') || p.startsWith('/fonts/') || p.startsWith(MEDIA_PREFIX);
}

/** A 206 slice of a cached full response (a 200 is valid for any range, but Safari's media elements want 206). */
async function rangeResponse(response, range) {
  const data = await response.arrayBuffer();
  const length = data.byteLength;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || '').trim());
  let start = NaN;
  let end = NaN;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : Math.max(0, length - Number(m[2]));
    end = m[1] && m[2] ? Math.min(length - 1, Number(m[2])) : length - 1;
  }
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  if (!(start >= 0 && start <= end && start < length)) {
    headers.set('Content-Range', `bytes */${length}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}

/**
 * The current manifest as path → [size, hash], or null while it cannot be read (offline: the saved files are trusted
 * then, and nothing is captured). Re-read at most once a RECHECK_MS, on page loads and when the page says so.
 */
let manifest = null;
let checkedAt = 0;

async function loadManifest(scope) {
  try {
    const res = await scope.fetch(MANIFEST_URL, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) return new Map((await res.json()).files.map((e) => [e[0], [e[1], e[2]]]));
  } catch { /* offline */ }
  return null;
}

function currentManifest(scope, force = false) {
  const now = scope.__now ? scope.__now() : Date.now();
  if (force || !manifest || now - checkedAt > RECHECK_MS) {
    checkedAt = now;
    const next = loadManifest(scope);
    // keep answering with the previous list while a recheck runs
    if (!manifest || force) manifest = next;
    else next.then((m) => { if (m) manifest = Promise.resolve(m); });
  }
  return manifest;
}

/** The cache keys a request may be: its own path, or the audio files a /media/… path resolves to. */
function keysOf(url) {
  return url.pathname.startsWith(MEDIA_PREFIX) ? mediaKeys(url.pathname) : [resourceKey(url.pathname)].filter(Boolean);
}

/** The cached reply for `request`, or null (→ network). */
async function answer(scope, request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== scope.location.origin || url.search || !isResourcePath(url.pathname)) return null;
  const keys = keysOf(url);
  if (!keys.length) return null;
  const list = await currentManifest(scope);
  const cache = await scope.caches.open(CACHE_NAME);
  for (const key of keys) {
    if (list && !list.has(key)) continue;
    const hit = await cache.match(url.origin + key);
    if (!hit) continue;
    // only bytes of the current revision (a stale file goes to the network, and is replaced on the way)
    if (list && hit.headers.get('X-SP-Resource') !== list.get(key)[1]) continue;
    const range = request.headers.get('Range');
    return range ? rangeResponse(hit, range).catch(() => hit) : hit;
  }
  return null;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** Captures run one at a time, after the game got its response (they never delay it). */
let captureQueue = Promise.resolve();

/** The packs the player picked (written by the page), or null when unknown (→ nothing is captured). */
async function pickedPacks(cache, origin) {
  try {
    const res = await cache.match(origin + PACKS_PATH);
    const doc = res ? await res.json() : null;
    return Array.isArray(doc?.packs) ? new Set(doc.packs) : null;
  } catch { return null; }
}

/**
 * Save a network response the game just received, when it is a file of the manifest in a picked pack, a full 200, and
 * its bytes match the manifest's size and hash. Resolves to the saved path or null.
 * @param {Request} request @param {Response} response a clone the game does not read
 */
async function capture(scope, request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque' || request.headers.get('Range')) return null;
  const url = new URL(request.url);
  const list = await currentManifest(scope);
  if (!list) return null;
  const key = keysOf(url).find((k) => list.has(k));
  if (!key) return null;
  const [size, hash] = list.get(key);
  if (size > MAX_FILE_BYTES) return null;
  const declared = Number(response.headers.get('Content-Length'));
  if (!response.headers.get('Content-Encoding') && Number.isFinite(declared) && declared > 0 && declared !== size) return null;
  const cache = await scope.caches.open(CACHE_NAME);
  const packs = await pickedPacks(cache, url.origin);
  if (!packs || !packs.has(packOf(key))) return null;
  const old = await cache.match(url.origin + key);
  if (old && old.headers.get('X-SP-Resource') === hash) return null; // saved meanwhile
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== size || hex(await scope.crypto.subtle.digest('SHA-1', bytes)).slice(0, 12) !== hash) return null;
  await cache.put(url.origin + key, new Response(bytes, { status: 200, headers: {
    'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Length': String(size), 'X-SP-Resource': hash } }));
  return key;
}

/** Answer from the cache, else the network — and save that response when it qualifies. */
async function respond(scope, event) {
  const request = event.request;
  const hit = await answer(scope, request).catch(() => null);
  if (hit) return hit;
  const res = await scope.fetch(request);
  if (res.ok && res.status === 200) {
    const copy = res.clone();
    captureQueue = captureQueue.then(() => capture(scope, request, copy)).catch(() => null);
    event.waitUntil?.(captureQueue);
  }
  return res;
}

self.spResources = { resourceKey, mediaKeys, packOf, rangeResponse, answer, capture, respond, reset: () => { manifest = null; checkedAt = 0; } };

self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
// the page says the saved files changed (a download flushed its index, the cache was cleared)
self.addEventListener('message', (event) => { if (event.data === 'sp-resources-changed') currentManifest(self, true); });

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.mode === 'navigate') { currentManifest(self); return; }
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (request.method !== 'GET' || url.search || !isResourcePath(url.pathname)) return;
  event.respondWith(respond(self, event).catch(() => fetch(request)));
});
