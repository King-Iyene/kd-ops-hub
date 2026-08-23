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
//   - Waits in the normal "installed" state instead of self-skip-waiting —
//     PwaUpdatePrompt.tsx (registerType "prompt") shows a visible "reload
//     to update" banner and only sends SKIP_WAITING once someone actually
//     clicks it, rather than yanking the bundle out from under an open tab
//     with zero warning. A worker that's never explicitly activated still
//     takes over automatically once every tab holding the old one closes —
//     nothing is stuck forever just because a banner got dismissed.
//   - clientsClaim() on activate so once a new worker DOES take over, it
//     controls every open tab immediately rather than only new ones.
//   - Wipes EVERY workbox/runtime cache from old SW versions on activate.
//     This unblocks anyone stuck on the old broken navigation-fallback build
//     (see below) that self-skip-waited and cached index.html.
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

// No self.skipWaiting() here — a freshly installed worker waits until
// PwaUpdatePrompt.tsx's "Reload" button posts SKIP_WAITING (see the
// message listener below), or until every tab holding the old worker
// closes on its own.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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

// Pass-through fetch handler — required for the install prompt criteria.
// Must call respondWith() or Chrome flags it as a no-op handler (visible as
// a console warning on every navigation); fetching from network and handing
// the response straight back behaves identically to no handler at all while
// satisfying that check.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

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
