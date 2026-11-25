/* FuelTrack Service Worker
 * Strategy: stale-while-revalidate for all same-origin GET requests.
 * Bump VERSION on every deploy to purge old caches.
 */
'use strict';

const VERSION = 'fueltrack-v1.0.1';
const CACHE = VERSION;
const CORE = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('fueltrack-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  if (url.pathname.endsWith('/sw.js')) return; // let the browser manage SW updates

  event.respondWith(staleWhileRevalidate(event));
});

async function staleWhileRevalidate(event) {
  const req = event.request;
  const isNav = req.mode === 'navigate';
  const cache = await caches.open(CACHE);

  let cached = await cache.match(req, { ignoreSearch: isNav });
  if (!cached && isNav) {
    cached = (await cache.match('./')) || (await cache.match('./index.html'));
  }

  const network = fetch(req)
    .then(async (res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
        await cache.put(req, res.clone());
        if (isNav) await cache.put('./', res.clone());
      }
      return res;
    })
    .catch(() => null);

  event.waitUntil(network);

  if (cached) return cached;

  const fresh = await network;
  if (fresh) return fresh;

  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline</title>' +
    '<body style="background:#0f172a;color:#e2e8f0;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
    '<p>FuelTrack is offline and not cached yet. Reconnect once to finish installing.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
