// sw.js — DisasterWatch Service Worker for Offline Map Tile Caching
'use strict';

const STATIC_CACHE = 'dw-static-v2';
const TILE_CACHE = 'dw-tiles-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/style.css',
  '/utils.js',
  '/ml-model.js',
  '/app.js',
  '/map-component.js',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png'
];

// Offline Fallback Tile (256x256 SVG)
const OFFLINE_TILE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#101721" stroke="#1d2633" stroke-width="1"/>
  <path d="M0 64 H256 M0 128 H256 M0 192 H256 M64 0 V256 M128 0 V256 M192 0 V256" stroke="#162230" stroke-width="1" stroke-dasharray="2 4"/>
  <circle cx="128" cy="120" r="14" fill="none" stroke="#ff3b3b" stroke-width="1.5" opacity="0.4"/>
  <text x="128" y="152" fill="#607286" font-size="11" font-family="monospace" text-anchor="middle">OFFLINE TILE</text>
</svg>`.trim();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== STATIC_CACHE && k !== TILE_CACHE).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com') ||
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('opentopomap.org') ||
    url.pathname.includes('/tile/') ||
    /\/\d+\/\d+\/\d+(\.png|\.jpg|\.jpeg)?/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Handle Map Tile Requests
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) {
          // If online, update in background (stale-while-revalidate)
          if (navigator.onLine) {
            fetch(req).then((fresh) => {
              if (fresh && fresh.ok) cache.put(req, fresh);
            }).catch(() => {});
          }
          return cached;
        }

        // Not in cache, try network
        try {
          const res = await fetch(req, { mode: 'cors' });
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
            return res;
          }
          throw new Error('Tile network error');
        } catch (err) {
          // Network failed and not in cache -> Return graceful fallback tile
          return new Response(OFFLINE_TILE_SVG, {
            status: 200,
            headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' }
          });
        }
      })
    );
    return;
  }

  // 2. Ignore non-GET requests or backend API requests
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // 3. Static Assets: Network-first with cache fallback
  event.respondWith(
    fetch(req).then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(req).then((cached) => {
        if (cached) return cached;
        if (req.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Batch tile downloader for offline area
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'CACHE_TILES_BATCH') {
    const urls = event.data.urls || [];
    const cache = await caches.open(TILE_CACHE);
    let completed = 0;
    const total = urls.length;

    for (const tileUrl of urls) {
      try {
        const existing = await cache.match(tileUrl);
        if (!existing) {
          const res = await fetch(tileUrl, { mode: 'cors' });
          if (res && (res.ok || res.type === 'opaque')) {
            await cache.put(tileUrl, res);
          }
        }
      } catch (_) {}
      completed++;

      if (completed % 5 === 0 || completed === total) {
        event.source.postMessage({
          type: 'CACHE_PROGRESS',
          completed,
          total,
          percent: Math.round((completed / total) * 100)
        });
      }
    }
  }
});
