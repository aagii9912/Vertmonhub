'use client';

import { useEffect } from 'react';

/**
 * Хуудасны гарчгийг нэг удаагийн дарах — Header анхдагчаар навигацийн нэрийг
 * харуулдаг («Өнөөдөр»), гэхдээ ижил зам дээр захирлын самбар «Самбар» гэх
 * мэт өөр нэртэй байж болно. Context нэмэхгүй, window event-ээр.
 */
const EVENT = 'vertmon:page-title';

export function setPageTitle(title: string | null): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<string | null>(EVENT, { detail: title }));
}

export function onPageTitle(handler: (title: string | null) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const fn = (e: Event) => handler((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
}

/** Компонент mount байх зуур гарчгийг дарж, unmount-д буцаана. */
export function usePageTitle(title: string): void {
    useEffect(() => {
        setPageTitle(title);
        return () => setPageTitle(null);
    }, [title]);
}
