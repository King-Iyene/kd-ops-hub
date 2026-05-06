/// <reference lib="webworker" />
//
// Minimal service worker for KD Ops PWA.
//
// Why minimal:
//   The previous version did navigation routing + Google Fonts caching +
//   navigation fallback. Two things broke: (1) Google Fonts caching is
//   blocked by our CSP `connect-src` (fonts go via stylesheet, not fetch);
//   (2) the navigation fallback served stale index.html after a deploy,
//   which referenced JS bundles that were 404 — and Vercel's catch-all
//   served index.html for them too, so the browser saw HTML where it
//   expected modules → blank screen.
//
// What this version does:
//   - skipWaiting + clientsClaim on install/activate so a new deploy
//     replaces the old SW immediately. No more stale chunks.
//   - Wipes EVERY workbox/runtime cache from old SW versions on activate.
//     This unblocks anyone stuck on the broken navigation-fallback build.
//   - Push event handler — shows the OS notification.
//   - notificationclick handler — focuses or opens the app.
//   - Empty fetch handler — required so the SW counts as "installable"
//     for the PWA install prompt. Browser handles all caching natively.

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST?: unknown };

// vite-plugin-pwa requires the SW to reference __WB_MANIFEST so it knows
// where to inject the precache manifest at build time. We deliberately do
// NOT precache anything (see file header for why) but still reference the
// global so the build doesn't fail.
void self.__WB_MANIFEST;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Wipe every cache the previous SW left behind. Clean slate.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Empty fetch handler — required for the install prompt criteria. Lets the
// browser do its normal thing for every request.
self.addEventListener('fetch', () => undefined);

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string; url?: string; icon?: string; badge?: string; tag?: string } = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'KD Ops', body: event.data.text() || 'You have a new notification' };
  }

  const title = data.title || 'KD Ops';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data?.url as string) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            (client as WindowClient).focus();
            (client as WindowClient).navigate(target).catch(() => undefined);
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      }),
  );
});
