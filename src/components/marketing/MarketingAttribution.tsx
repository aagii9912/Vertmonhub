'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttributionFromUrl } from '@/lib/marketing/attribution';

/**
 * Зочдын fbclid/utm_* параметрийг барьж cookie-д хадгална (форм илгээлтэд хавсаргахад).
 * Root layout-д суурилуулна. UI рендэр хийхгүй.
 */
export function MarketingAttribution() {
    const pathname = usePathname();

    useEffect(() => {
        captureAttributionFromUrl();
    }, [pathname]);

    return null;
}
