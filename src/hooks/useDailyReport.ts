'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import type { DailyReport, DailyReportChange, DailyReportConfig, DailyReportConflict, DailyRosterEntry } from '@/lib/dashboard/daily-report';

export interface DailyReportViewerInfo {
    personal: boolean;
    onboarding: boolean;
    /** Багийн тэмдэглэл, баталгаажуулалт (тооны эрхийг editable шийднэ). */
    canEditTeam: boolean;
    /** Тоог нь засаж болох менежерүүд (баганын нэр): ээлжийн менежерт төслийн бүх идэвхтэй менежер. */
    editable: string[];
    /** Төсөлдөө бүртгэлтэй менежерийн өөрийн багана (багийн харагдацад null). */
    own: string | null;
    /** Админ: уулзалтыг аль менежерт тооцохыг солих эрх. */
    canReassign: boolean;
    /** Уулзалт бүртгэж/шилжүүлж болох менежерүүд (төслийн идэвхтэй, бүртгэлтэй; хуучин хариунд байхгүй байж болно). */
    meetingManagers?: string[];
}

export interface DailyReportResponse {
    date: string;
    /** Мужийн дуусах өдөр (нэг өдөрт `date`). */
    to?: string;
    today: string;
    /** Хувийн горимтой боловч бүртгэлд холбогдоогүй (onboarding) бол null. */
    report: DailyReport | null;
    config: DailyReportConfig | null;
    configSaved?: boolean;
    configInvalid?: boolean;
    /** Багийн харагдацад (загвар засахад) — менежерт хоосон. */
    roster: DailyRosterEntry[];
    viewer: DailyReportViewerInfo;
}

/** PUT /api/dashboard/daily-report-ийн 409: энэ хооронд өөр хүн өөрчилсөн нүд, тэмдэглэл. */
export interface DailyReportConflictResponse {
    error: string;
    conflicts?: DailyReportConflict[];
}

export interface DailyReportHistoryResponse {
    date: string;
    changes: DailyReportChange[];
}

/**
 * «Өдрийн тайлан» (/api/dashboard/daily-report). `to` өгвөл [date, to] мужийн нэгтгэл (зөвхөн унших).
 * Хадгалсны дараа `invalidateQueries({ queryKey: ['daily-report'] })`.
 */
export function useDailyReport(date: string, to: string = date) {
    const url = to === date ? `/api/dashboard/daily-report?date=${date}` : `/api/dashboard/daily-report?date=${date}&to=${to}`;
    return useDashboardQuery<DailyReportResponse>(['daily-report', date, to], url, { keepPreviousData: true, staleTime: 15_000 });
}

/** Тухайн өдрийн өөрчлөлтийн түүх (нээсэн үед л уншина). Хадгалсны дараа `['daily-report-history']`-г шинэчилнэ. */
export function useDailyReportHistory(date: string, enabled: boolean) {
    return useDashboardQuery<DailyReportHistoryResponse>(['daily-report-history', date], `/api/dashboard/daily-report/history?date=${date}`, { enabled });
}

/** Тайлангаас уулзалт бүртгэсэн/тэмдэглэсний дараа: тайлан, түүх, уулзалт, лид, KPI-г шинэчилнэ. */
export async function invalidateDailyMeetingQueries(queryClient: QueryClient) {
    for (const key of ['viewings', 'leads', 'nav-counts', 'my-stats', 'manager-activity', 'sales-kpi', 'director', 'operations-report']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
    }
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['daily-report'] }),
        queryClient.invalidateQueries({ queryKey: ['daily-report-history'] }),
    ]);
}
