'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export interface DashboardMode {
    mode: 'personal' | 'org';
    /** Серверээс тодорхойлсон канон менежерийн нэр (attribution-д мөн ашиглана). */
    managerName: string | null;
    isManager: boolean;
    canViewTeam: boolean;
}

const FALLBACK: DashboardMode = {
    mode: 'org',
    managerName: null,
    isManager: false,
    canViewTeam: false,
};

/**
 * Дашбоардын горим (personal | org) — сервер шийднэ (/api/dashboard/mode).
 * Алдаа гарвал org горим руу fallback — самбар хэзээ ч блоклогдохгүй.
 */
export function useDashboardMode() {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<DashboardMode>({
        queryKey: ['dashboard-mode', shopId],
        queryFn: async () => {
            if (!shopId) return FALLBACK;
            try {
                const res = await fetch('/api/dashboard/mode', {
                    headers: { 'x-shop-id': shopId },
                });
                if (!res.ok) return FALLBACK;
                return await res.json();
            } catch {
                return FALLBACK;
            }
        },
        enabled: !!shopId,
        staleTime: 60000,
    });
}
