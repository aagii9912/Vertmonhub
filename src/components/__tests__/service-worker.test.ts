// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * `public/sw.js` зөвхөн web push-д зориулагдсан. Өмнө нь /api/* хариуг зөвхөн
 * URL-ээр (x-shop-id-гүй) Cache Storage-д хадгалж, сүлжээ тасрахад өөр төсөл,
 * өөр бүртгэлийн өгөгдлийг өгч, гарсны дараа ч диск дээр үлдээдэг байв.
 * Worker-ийг хуурамч ServiceWorkerGlobalScope дотор ажиллуулж шалгана.
 */
const SOURCE = readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(existingCaches: string[] = []) {
    const listeners = new Map<string, Listener>();
    const self = {
        location: { origin: 'https://www.vertmon.mn' },
        addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
        skipWaiting: vi.fn(),
        clients: {
            claim: vi.fn(async () => {}),
            matchAll: vi.fn(async () => [] as unknown[]),
            openWindow: vi.fn(),
        },
        registration: { showNotification: vi.fn(async () => {}) },
    };
    const caches = {
        keys: vi.fn(async () => existingCaches),
        delete: vi.fn<(name: string) => Promise<boolean>>(async () => true),
        open: vi.fn(),
        match: vi.fn(),
    };
    vm.runInNewContext(SOURCE, { self, caches, console });
    return { listeners, self, caches };
}

function dispatch(listener: Listener | undefined, event: Record<string, unknown> = {}) {
    let pending: Promise<unknown> = Promise.resolve();
    listener?.({ ...event, waitUntil: (p: Promise<unknown>) => { pending = p; } });
    return pending;
}

describe('public/sw.js', () => {
    it('has no fetch handler, so /api, pages and assets always go to the network', () => {
        const { listeners, caches } = loadWorker();
        expect(listeners.has('fetch')).toBe(false);
        expect(caches.open).not.toHaveBeenCalled();
    });

    it('install activates the new worker without precaching anything', async () => {
        const { listeners, self, caches } = loadWorker();
        await dispatch(listeners.get('install'));
        expect(self.skipWaiting).toHaveBeenCalled();
        expect(caches.open).not.toHaveBeenCalled();
    });

    it('activate deletes every cache earlier versions created, then claims open tabs', async () => {
        const { listeners, self, caches } = loadWorker([
            'vertmonhub-api-v1',
            'vertmonhub-static-v3',
            'vertmonhub-v3',
            'vertmonhub-static-v2',
            'some-other-cache',
        ]);
        await dispatch(listeners.get('activate'));
        expect(caches.delete.mock.calls.map(([name]) => name)).toEqual([
            'vertmonhub-api-v1',
            'vertmonhub-static-v3',
            'vertmonhub-v3',
            'vertmonhub-static-v2',
        ]);
        expect(self.clients.claim).toHaveBeenCalled();
    });

    it('push shows the payload as a notification', async () => {
        const { listeners, self } = loadWorker();
        await dispatch(listeners.get('push'), {
            data: { json: () => ({ title: 'Шинэ лид', body: 'Бат — 99112233' }), text: () => '' },
        });
        expect(self.registration.showNotification).toHaveBeenCalledWith('Шинэ лид', expect.objectContaining({
            body: 'Бат — 99112233',
            icon: '/icon-192.png',
            badge: '/icon-badge-72.png',
            data: { url: '/' },
        }));
    });

    it('notificationclick focuses an open tab and navigates it', async () => {
        const { listeners, self } = loadWorker();
        const tab = { url: 'https://www.vertmon.mn/dashboard', focus: vi.fn(), navigate: vi.fn() };
        self.clients.matchAll.mockResolvedValueOnce([tab]);
        const close = vi.fn();
        await dispatch(listeners.get('notificationclick'), { notification: { close, data: { url: '/dashboard/leads' } } });
        expect(close).toHaveBeenCalled();
        expect(tab.focus).toHaveBeenCalled();
        expect(tab.navigate).toHaveBeenCalledWith('/dashboard/leads');
        expect(self.clients.openWindow).not.toHaveBeenCalled();
    });
});
