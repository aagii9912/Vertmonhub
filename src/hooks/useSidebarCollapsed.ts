'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'vertmonhub_sidebar_collapsed';
const EXPANDED = '16rem';
const COLLAPSED = '4rem';

/**
 * Sidebar-ийг icon-rail болгож хумих төлөв.
 *
 * Цорын ганц эх сурвалж нь `--sidebar-w` CSS хувьсагч (globals.css-д тодорхойлсон):
 * үүнийг <html>-д шууд тааруулснаар Sidebar-ийн өргөн (`w-[var(--sidebar-w)]`) ба
 * AppShell-ийн зүүн зай (`md:ml-[var(--sidebar-w)]`) хоёр зэрэг автоматаар хариу үзүүлнэ.
 * Төлөвийг localStorage-д хадгална (SSR/нууц горимд аюулгүй).
 */
function applyWidth(collapsed: boolean) {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? COLLAPSED : EXPANDED);
}

export function useSidebarCollapsed() {
    const [collapsed, setCollapsed] = useState(false);

    // Mount үед хадгалсан төлөвийг сэргээнэ.
    useEffect(() => {
        let initial = false;
        try {
            initial = localStorage.getItem(KEY) === '1';
        } catch {
            /* нууц горим — алгасна */
        }
        setCollapsed(initial);
        applyWidth(initial);
        // Гарахад rail-ийн өргөнийг анхдагч руу буцаана (бусад shell-д нөлөөлөхгүйн тулд).
        return () => applyWidth(false);
    }, []);

    const toggle = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            applyWidth(next);
            try {
                localStorage.setItem(KEY, next ? '1' : '0');
            } catch {
                /* алгасна */
            }
            return next;
        });
    }, []);

    return { collapsed, toggle };
}
