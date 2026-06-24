'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardData {
    stats: {
        totalProperties: number;
        totalLeads: number;
        monthlyViewings: number;
        pendingContracts: number;
    };
    recentLeads: any[];
    upcomingViewings: any[];
}

/**
 * Dashboard-ийн өгөгдлийг сервер API (/api/dashboard/stats) -аас татна.
 * Браузерын Supabase client шууд биш — сервер cookie session + service role
 * ашигладаг тул RLS/session-ийн 401 алдаанаас сэргийлнэ.
 */
export function useDashboard(timeFilter: 'today' | 'week' | 'month' = 'today') {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<DashboardData>({
        queryKey: ['dashboard', shopId, timeFilter],
        queryFn: async () => {
            const empty = {
                stats: { totalProperties: 0, totalLeads: 0, monthlyViewings: 0, pendingContracts: 0 },
                recentLeads: [],
                upcomingViewings: [],
            };
            if (!shopId) return empty;

            const res = await fetch(`/api/dashboard/stats?period=${timeFilter}`, {
                headers: { 'x-shop-id': shopId },
            });
            if (!res.ok) throw new Error(`Dashboard stats failed: ${res.status}`);
            const json = await res.json();

            return {
                stats: {
                    totalProperties: json.stats?.totalProperties || 0,
                    totalLeads: json.stats?.totalLeads || 0,
                    monthlyViewings: json.stats?.monthlyViewings || 0,
                    pendingContracts: json.stats?.pendingContracts || 0,
                },
                recentLeads: json.recentLeads || [],
                upcomingViewings: json.upcomingViewings || [],
            };
        },
        enabled: !!shopId,
        staleTime: 30000,
    });
}
