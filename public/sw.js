/**
 * Vertmon Hub — Service Worker for PWA Offline Support
 * 
 * Caching strategy:
 * - Static assets: Cache First
 * - API calls: Network First (fallback to cache)
 * - Images: Cache First with expiration
 */

const CACHE_NAME = 'vertmonhub-v2';
const STATIC_CACHE = 'vertmonhub-static-v2';
const API_CACHE = 'vertmonhub-api-v1';

const STATIC_URLS = [
    '/',
    '/dashboard',
    '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_URLS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            )
        )
    );
    self.clients.claim();
});

// Fetch — routing strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip external requests
    if (url.origin !== self.location.origin) return;

    // API requests — Network First
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // Static assets (JS, CSS, fonts) — Cache First
    if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    // Images — Cache First with 7-day expiration
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }

    // HTML pages — Network First (get latest)
    event.respondWith(networkFirst(request, STATIC_CACHE));
});

// Push notifications
self.addEventListener('push', (event) => {
    // ЗАСВАР (2026-08-22): icon зам `/icons/...` байсан ч public/icons/ фолдер
    // огт байхгүй (жинхэнэ файлууд `/icon-192.png`, `/icon-512.png`) тул
    // мэдэгдлийн зураг үргэлж 404 болдог байв.
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
            icon: data.icon || '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [100, 50, 100],
            // ЗАСВАР: өмнө нь `{ url: '/' }` гэж ХАТУУ бичигдсэн байсан тул
            // илгээгчийн (task-reminders, channel-expiry, ai-digest cron-ууд)
            // зааж өгсөн хаяг хаягдаж, мэдэгдэл дарахад ҮРГЭЛЖ нүүр хуудас
            // нээгддэг байв — сануулга дээр дарж холбогдох ажил руу очих боломжгүй.
            data: { url: data.url || '/dashboard' },
        })
    );
});

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/dashboard';
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

// ============================================
// CACHING STRATEGIES
// ============================================

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503 });
    }
}
