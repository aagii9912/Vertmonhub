'use client';

import { useEffect } from 'react';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Web push-ийн service worker бүртгэл. sw.js нь fetch-ийг барьдаггүй, юу ч
 * cache хийхгүй (/api ч, хуудас ч, статик файл ч).
 *
 * Хөгжүүлэлтийн орчинд БҮРТГЭХГҮЙ, бас өмнө бүртгэгдсэнийг цуцална: 2026-10-07-оос
 * өмнөх sw.js статик JS/CSS-ийг cache-ээс өгдөг байсан тул dev браузерт үлдсэн
 * хуучин worker кодын өөрчлөлтийг нууж «хуучин bundle» асуудал үүсгэдэг байв.
 */
export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        if (isDev) {
            navigator.serviceWorker
                .getRegistrations()
                .then((regs) => Promise.all(regs.map((r) => r.unregister())))
                .then((done) => {
                    if (done.length) console.log('[SW] dev: unregistered', done.length);
                })
                .catch(() => {});
            return;
        }

        navigator.serviceWorker.register('/sw.js').catch(() => {
            /* Push байхгүй ч апп бүрэн ажиллана */
        });
    }, []);

    return null;
}
