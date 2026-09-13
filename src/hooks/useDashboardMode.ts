'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';

export interface DashboardMode {
    mode: 'personal' | 'org';
    /** Серверээс тодорхойлсон канон менежерийн нэр (attribution-д мөн ашиглана). */
    managerName: string | null;
    isManager: boolean;
    canViewTeam: boolean;
}

/** Самбарын горимыг сервер шийднэ; алдааг UI дээр дахин оролдох төлөвөөр харуулна. */
export function useDashboardMode() {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<DashboardMode>({
        queryKey: ['dashboard-mode', shopId],
        queryFn: () => dashboardJson<DashboardMode>('/api/dashboard/mode'),
        enabled: !!shopId,
        staleTime: 60000,
    });
}
