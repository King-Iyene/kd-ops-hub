/// <reference lib="webworker" />
//
// Custom service worker for KD Ops PWA — extends the workbox-generated
// service worker with two things vite-plugin-pwa does not give us:
//   1. push event handler — shows OS notifications when the server fires.
//   2. notificationclick handler — opens or focuses the app when tapped.
//
// vite-plugin-pwa is configured (vite.config.ts → strategies: 'injectManifest')
// to merge this file with workbox's precache + runtime cache logic before
// emitting the final dist/sw.js.

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// ── Precache the app shell + static assets ────────────────────────────────
// __WB_MANIFEST is replaced at build time with the list of files to precache.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback — any route returns index.html so React Router
// can take over. Skip API/auth/function calls so they always go to network.
registerRoute(
  new NavigationRoute(
    async () => (await caches.match('/index.html')) ?? fetch('/index.html'),
    { denylist: [/^\/api\//, /^\/functions\//, /^\/auth\//, /^\/rest\//] },
  ),
);

// Google Fonts — long cache, refresh quietly.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

// Supabase — never cache. Financial data must always come from the network.
registerRoute(
  ({ url }) => /supabase\.co\/(rest|functions|auth|storage)\//.test(url.href),
  new NetworkOnly(),
);

// ── Push notifications ─────────────────────────────────────────────────────
// Payload shape from supabase/functions/send-push:
//   { title, body, url, icon, badge, tag }

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
    // Show on-screen even if the app is in the foreground.
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
        // If a KD Ops window is already open, focus it and navigate.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            (client as WindowClient).focus();
            (client as WindowClient).navigate(target).catch(() => undefined);
            return;
          }
        }
        // Otherwise open a fresh window.
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      }),
  );
});

// Allow new SW versions to take control immediately on next reload.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
