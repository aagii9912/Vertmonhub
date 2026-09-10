'use client';

import { useEffect } from 'react';

const isDev = process.env.NODE_ENV === 'development';

/**
 * PWA service worker бүртгэл.
 *
 * Хөгжүүлэлтийн орчинд БҮРТГЭХГҮЙ, бас өмнө бүртгэгдсэнийг цуцална: sw.js
 * статик JS/CSS-ийг cache-ээс өгдөг тул dev дээр кодын өөрчлөлт харагдахгүй
 * «хуучин bundle» асуудал давтан гарч байсан (2026-09-10 redesign-ийн үед ч).
 * Production дээр chunk URL нь content-hash-тай тул аюулгүй.
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
            /* PWA байхгүй ч апп бүрэн ажиллана */
        });
    }, []);

    return null;
}
