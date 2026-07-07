'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export type MyStatsPeriod = 'today' | 'week' | 'month';

export interface PeriodStat {
    target: number;
    actual: number;
}

export interface MyStatsTarget {
    year: number;
    month: number;
    quarter: number;
    periods: { month: PeriodStat; quarter: PeriodStat; year: PeriodStat };
    mine: { month: number; quarter: number; year: number };
}

export interface MyStatsTask {
    type: 'followup' | 'viewing';
    id: string;
    title: string;
    subtitle: string;
    dueAt: string;
    overdue: boolean;
    href: string;
}

export interface MyStatsViewing {
    id: string;
    scheduled_at: string;
    status: string | null;
    property_name: string | null;
    customer_name: string | null;
}

export interface MyStatsLead {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    status: string;
    source?: string | null;
    created_at: string;
    next_followup_at?: string | null;
    budget_max?: number | null;
}

export interface MyStatsData {
    manager: { name: string | null; isSelf: boolean; inRoster: boolean; hasAccount: boolean };
    onboarding: boolean;
    period: MyStatsPeriod;
    kpis: {
        activeLeads: number;
        newLeads: number;
        leadsByStatus: Record<string, number>;
        viewingsToday: number;
        viewingsThisWeek: number;
        activeContracts: number;
        overdueContracts: number;
        salesThisMonth: number;
        salesThisYear: number;
        contractCountThisYear: number;
    };
    target: MyStatsTarget | null;
    tasks: MyStatsTask[];
    recentLeads: MyStatsLead[];
    upcomingViewings: MyStatsViewing[];
    revenueTrend: number[];
}

/**
 * «Миний самбар»-ын өгөгдөл (/api/dashboard/my-stats) — нэг дуудалтаар.
 * managerName өгвөл (админы drill-in) тухайн менежерийн самбарыг татна.
 */
export function useMyStats(period: MyStatsPeriod = 'today', managerName?: string | null) {
    const { shop } = useAuth();
    const shopId = shop?.id;

    return useQuery<MyStatsData>({
        queryKey: ['my-stats', shopId, period, managerName ?? 'self'],
        queryFn: async () => {
            const params = new URLSearchParams({ period });
            if (managerName) params.set('manager', managerName);
            const res = await fetch(`/api/dashboard/my-stats?${params.toString()}`, {
                headers: { 'x-shop-id': shopId! },
            });
            if (!res.ok) throw new Error(`My stats failed: ${res.status}`);
            return res.json();
        },
        enabled: !!shopId,
        staleTime: 30000,
    });
}
