'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

/** layout.tsx-ийн эхний script энэ түлхүүрийг уншиж, будахаас өмнө data-theme тавина. */
const STORAGE_KEY = 'vh-theme';

function readTheme(): Theme {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function subscribe(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
}

/**
 * Тема: «Шөнө» (бараан) нь үндсэн, цайвар нь хэрэглэгчийн сонголт.
 * Сонголт localStorage-д хадгалагдаж, дараагийн ачааллын эхний будалтад үйлчилнэ.
 */
export function useTheme() {
    const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'dark');

    const setTheme = useCallback((next: Theme) => {
        document.documentElement.setAttribute('data-theme', next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Private mode: the choice lasts for this page only.
        }
    }, []);

    const toggle = useCallback(() => setTheme(readTheme() === 'dark' ? 'light' : 'dark'), [setTheme]);

    return { theme, setTheme, toggle };
}
