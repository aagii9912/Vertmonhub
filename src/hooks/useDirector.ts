'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import type { DirectorPayload } from '@/lib/dashboard/director';

export type { DirectorPayload } from '@/lib/dashboard/director';

/**
 * Захирлын самбар — нэг дуудлага, 30с cache, сар солиход өмнөх өгөгдөл хэвээр
 * харагдана (placeholderData) — spinner-гүй шилжилт.
 */
export function useDirector(year: number, month: number) {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<DirectorPayload>({
        queryKey: ['director', shopId, year, month],
        queryFn: () => dashboardJson<DirectorPayload>(`/api/dashboard/director?year=${year}&month=${month}`),
        enabled: !!shopId,
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}
