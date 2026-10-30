// sw.js — DisasterWatch Service Worker for Offline Map Tile & Asset Caching
'use strict';

const STATIC_CACHE = 'dw-static-v3';
const TILE_CACHE = 'dw-tiles-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/css/tokens.css',
  '/css/style.css',
  '/src/icons.js',
  '/src/state.js',
  '/src/utils.js',
  '/src/components/MapView.js',
  '/src/components/LayerPanel.js',
  '/src/components/TimelineBar.js',
  '/src/components/ControlsBar.js',
  '/src/components/EventDetailPanel.js',
  '/src/components/StatusBar.js',
  '/src/components/SettingsModal.js',
  '/src/app.js',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png'
];

// Offline Fallback Tile (256x256 SVG)
const OFFLINE_TILE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#0B0E14" stroke="#1D2633" stroke-width="1"/>
  <path d="M0 64 H256 M0 128 H256 M0 192 H256 M64 0 V256 M128 0 V256 M192 0 V256" stroke="#141B24" stroke-width="1" stroke-dasharray="2 4"/>
  <circle cx="128" cy="120" r="14" fill="none" stroke="#3B82F6" stroke-width="1.5" opacity="0.4"/>
  <text x="128" y="152" fill="#607286" font-size="11" font-family="monospace" text-anchor="middle">OFFLINE TILE</text>
</svg>`.trim();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Precache notice:', err);
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
          if (navigator.onLine) {
            fetch(req).then((fresh) => {
              if (fresh && fresh.ok) cache.put(req, fresh);
            }).catch(() => {});
          }
          return cached;
        }

        try {
          const res = await fetch(req, { mode: 'cors' });
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
            return res;
          }
          throw new Error('Tile network error');
        } catch (err) {
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
