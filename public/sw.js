// KDOps Driver — service worker.
// Cache-first for the /driver page shell so the app loads on a flaky/offline
// connection. Supabase API calls are intentionally NOT cached — pending data
// must always come from the network.

const CACHE_NAME = 'kdops-driver-shell-v1';

// Shell resources to pre-cache on install. The Vite build emits hashed JS/CSS
// filenames so we can't pin those at build time; instead we cache them on the
// fly during the first /driver navigation (see fetch handler below).
const SHELL_URLS = ['/driver', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Best-effort — install must succeed even if a URL is unreachable.
      }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch Supabase or other cross-origin API calls.
  if (url.origin !== self.location.origin) return;
  if (url.hostname.endsWith('supabase.co')) return;

  // Navigation requests → serve cached /driver shell when offline.
  if (request.mode === 'navigate' && url.pathname.startsWith('/driver')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/driver', clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/driver').then((m) => m || Response.error())),
    );
    return;
  }

  // Static shell assets (Vite-emitted JS/CSS, icons, manifest, fonts) →
  // cache-first. On a cache miss, fetch and stash for next time.
  const isShellAsset =
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/favicon.ico';

  if (isShellAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});
