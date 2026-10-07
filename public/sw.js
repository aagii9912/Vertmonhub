/**
 * Vertmon Hub — Service Worker for web push.
 *
 * The worker exists only for push notifications (usePushNotifications) and
 * deliberately has NO fetch handler: every request — /api, pages, RSC
 * payloads, /_next/static assets — goes straight to the network.
 *
 * Earlier versions cached responses: /api/* network-first keyed by URL alone
 * (x-shop-id was ignored, so another project's or account's data could be
 * served offline and stayed on disk after sign-out), JS/CSS cache-first
 * (stale UI in dev, where chunk URLs are not content-hashed) and HTML
 * network-first. Without cached API data an offline shell can only show
 * errors, and the browser HTTP cache already keeps hashed /_next/static
 * assets (public, max-age=31536000, immutable), so none of it is kept.
 */

// Every cache an earlier version created starts with this prefix
// (vertmonhub-v3, vertmonhub-static-v3, vertmonhub-api-v1, …).
const LEGACY_CACHE_PREFIX = 'vertmonhub-';

self.addEventListener('install', () => {
    self.skipWaiting();
});

// Activate — delete every cache earlier versions left behind, then take over
// open tabs so the old worker stops answering their requests from cache.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith(LEGACY_CACHE_PREFIX)).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// Push notifications
self.addEventListener('push', (event) => {
    let data = { title: 'Vertmon Hub', body: 'Шинэ мэдэгдэл', icon: '/icon-192.png' };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch {
            data.body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: '/icon-badge-72.png',
            vibrate: [100, 50, 100],
            data: { url: '/' },
        })
    );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
            const existing = clients.find(c => c.url.includes(self.location.origin));
            if (existing) {
                existing.focus();
                existing.navigate(url);
            } else {
                self.clients.openWindow(url);
            }
        })
    );
});
