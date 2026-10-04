'use client';

import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import type { ActivityGroup, ManagerActivityReport } from '@/lib/sales/activity';

export type ManagerActivityResponse = ManagerActivityReport & {
    /** Сервер хувийн горимоор (зөвхөн өөрийн мөр) хариулсан эсэх. */
    personal: boolean;
    /** Хувийн горимтой боловч менежерийн бүртгэлд холбогдоогүй. */
    onboarding: boolean;
    canEdit: boolean;
};

/**
 * Менежерийн идэвх (/api/dashboard/reports/manager-activity). Хадгалсны дараа
 * `invalidateQueries({ queryKey: ['manager-activity'] })`.
 */
export function useManagerActivity(
    params: { from: string; to: string; group: ActivityGroup; manager?: string | null },
    options: { enabled?: boolean } = {},
) {
    const search = new URLSearchParams({ from: params.from, to: params.to, group: params.group });
    if (params.manager) search.set('manager', params.manager);
    return useDashboardQuery<ManagerActivityResponse>(
        ['manager-activity', params.from, params.to, params.group, params.manager ?? null],
        options.enabled === false ? null : `/api/dashboard/reports/manager-activity?${search.toString()}`,
        { keepPreviousData: true, staleTime: 30_000 },
    );
}
