'use client';

import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import type { DailyReport, DailyReportConfig, DailyRosterEntry } from '@/lib/dashboard/daily-report';

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
    viewer: {
        personal: boolean;
        onboarding: boolean;
        /** Багийн тэмдэглэл, баталгаажуулалт (тооны эрхийг editable шийднэ). */
        canEditTeam: boolean;
        /** Тоог нь засаж болох менежерүүд (баганын нэр). */
        editable: string[];
    };
}

/**
 * «Өдрийн тайлан» (/api/dashboard/daily-report). `to` өгвөл [date, to] мужийн нэгтгэл (зөвхөн унших).
 * Хадгалсны дараа `invalidateQueries({ queryKey: ['daily-report'] })`.
 */
export function useDailyReport(date: string, to: string = date) {
    const url = to === date ? `/api/dashboard/daily-report?date=${date}` : `/api/dashboard/daily-report?date=${date}&to=${to}`;
    return useDashboardQuery<DailyReportResponse>(['daily-report', date, to], url, { keepPreviousData: true, staleTime: 15_000 });
}
