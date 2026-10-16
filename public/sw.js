// Classic service worker for art a player imported on this origin — and (fork) the asset preload's (public/resource-sw.js,
// loaded below): an origin has one worker at scope '/', so both features live in this one. An imported file answers
// first; anything else the preload has saved is answered by its rules; the rest goes to the network.
// Keep these three lines in sync with public/js/assetCache.js (that module documents why this file is not a module).
const IMPORTED_ASSET_CACHE = 'sp-imported-assets-v1';
const IMPORTED_ASSET_CACHE_PREFIX = 'sp-imported-assets-';
const IMPORTED_ASSET_PATH = /^\/(?:assets|fonts|media)\/~[0-9a-f]{16}\//;

// (fork) the preload's rules (resource-sw.js handleFetch); its own listeners stay off
self.spCombinedWorker = true;
importScripts('/resource-sw.js');

/** An imported file's URL on this origin (IMPORTED_ASSET_PATH). */
function importedPath(href) {
  let url;
  try { url = new URL(href); } catch { return false; }
  return url.origin === self.location.origin && IMPORTED_ASSET_PATH.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(IMPORTED_ASSET_CACHE_PREFIX) && name !== IMPORTED_ASSET_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

// (fork) the page says the preload's saved files changed (a download flushed its index, the cache was cleared)
self.addEventListener('message', (event) => { if (event.data === 'sp-resources-changed') self.spResources?.changed(); });

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // (fork) not an imported file's URL: the preload's rules (they leave alone what is not theirs)
  if (request.method !== 'GET' || request.headers.has('range') || !importedPath(request.url)) {
    self.spResources?.handleFetch(event);
    return;
  }
  const url = new URL(request.url);
  event.respondWith((async () => {
    const cache = await caches.open(IMPORTED_ASSET_CACHE);
    // The exact key: an import stores each URL without a query, so the path is the key. `ignoreSearch` would make
    // Chrome scan every entry — about 4 s per request once a whole pack (some 43,000 entries) is imported.
    const hit = await cache.match(url.origin + url.pathname);
    if (hit) return hit;
    // (fork) not imported: the preload may have it saved (its rules answer from its own cache, else the network)
    if (self.spResources && !url.search && self.spResources.isResourcePath(url.pathname)) {
      return self.spResources.respond(self, { request, waitUntil: (p) => event.waitUntil(p) }).catch(() => fetch(request));
    }
    // Do not cache the network response. The browser's own HTTP cache still applies to this fetch.
    return fetch(request);
  })());
});
