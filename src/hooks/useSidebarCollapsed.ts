'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** layout.tsx-ийн эхний script энэ түлхүүрийг уншиж, будахаас өмнө data-sidebar тавина. */
const KEY = 'vertmonhub_sidebar_collapsed';

function readCollapsed(): boolean {
    return document.documentElement.getAttribute('data-sidebar') === 'collapsed';
}

function subscribe(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sidebar'] });
    return () => observer.disconnect();
}

/**
 * Sidebar-ийг icon-rail (64px) болгож хумих төлөв.
 *
 * Цорын ганц эх сурвалж нь <html data-sidebar="collapsed"> — globals.css үүнээс
 * `--sidebar-w`-г (232px / 64px) тооцож, Sidebar-ийн өргөн ба AppShell-ийн зүүн зай
 * хоёр зэрэг хариу үзүүлнэ. Сонголт localStorage-д хадгалагдаж, дараагийн ачааллын
 * эхний будалтад үйлчилнэ (дэлгэсэн → хумисан анивчихгүй).
 */
export function useSidebarCollapsed() {
    const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

    const toggle = useCallback(() => {
        const next = !readCollapsed();
        if (next) document.documentElement.setAttribute('data-sidebar', 'collapsed');
        else document.documentElement.removeAttribute('data-sidebar');
        try {
            localStorage.setItem(KEY, next ? '1' : '0');
        } catch {
            /* нууц горим — энэ хуудсанд л үйлчилнэ */
        }
    }, []);

    return { collapsed, toggle };
}
