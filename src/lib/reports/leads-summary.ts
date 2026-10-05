/**
 * Лидийн тайлангийн нэгтгэл (GET /api/dashboard/reports/leads-summary).
 *
 * Өмнө нь хуудас хамгийн сүүлийн 1,000 лидийг browser-т татаж нэгтгэдэг байсан тул их
 * өгөгдөлд тоо чимээгүй дутдаг байв. Одоо сервер хугацааны БҮХ лидийг (fetchAllRows)
 * төслийн хүрээгээр (applyLeadScope) уншиж, энд зөвхөн тоолно. Мөнгөн дүн тооцохгүй:
 * лидийн төсөв (budget_min/max) нь гэрээний үнэ биш.
 */
import { z } from 'zod';
import { ACTIVE_STATUSES, LEAD_STATUSES } from '@/lib/leads/labels';
import { OperationsRangeSchema } from '@/lib/dashboard/operations-report';
import { ubDateStr, ubDayRange, ubStartOfDay } from '@/lib/utils/date';

export const LEADS_REPORT_PERIODS = ['today', 'week', 'month', 'quarter', 'year'] as const;
export type LeadsReportPeriod = (typeof LEADS_REPORT_PERIODS)[number];

/** Өнөөдрийг оруулаад сүүлийн N өдөр (УБ). Урт нь /api/dashboard/leads-ийн period-той ижил. */
const PERIOD_DAYS: Record<LeadsReportPeriod, number> = { today: 1, week: 7, month: 30, quarter: 90, year: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

/** Лид бүртгэгдсэн (created_at) Улаанбаатарын өдрүүд, хоёр тал оролцоно. */
export interface LeadsReportRange {
    period: LeadsReportPeriod | null;
    from: string;
    to: string;
}

export type LeadsReportRangeResult = { ok: true; range: LeadsReportRange } | { ok: false; error: string };

const RANGE_ERROR = 'Эхлэх, дуусах огноог (YYYY-MM-DD) зөв сонгоно уу. Хугацаа 367 өдрөөс урт байж болохгүй.';

/** `from`/`to` өгвөл тэр хугацаа (≤ 367 өдөр), үгүй бол `period` (анхдагч `month`). */
export function resolveLeadsReportRange(
    input: { period?: string | null; from?: string | null; to?: string | null },
    now: Date = new Date(),
): LeadsReportRangeResult {
    if (input.from || input.to) {
        const parsed = OperationsRangeSchema.safeParse({ from: input.from ?? undefined, to: input.to ?? undefined });
        return parsed.success ? { ok: true, range: { period: null, ...parsed.data } } : { ok: false, error: RANGE_ERROR };
    }
    const period = z.enum(LEADS_REPORT_PERIODS).safeParse(input.period || 'month');
    if (!period.success) return { ok: false, error: 'Хугацааны сонголт буруу байна' };
    const today = ubStartOfDay(now);
    return {
        ok: true,
        range: {
            period: period.data,
            from: ubDateStr(new Date(today.getTime() - (PERIOD_DAYS[period.data] - 1) * DAY_MS)),
            to: ubDateStr(today),
        },
    };
}

/** created_at-ийн шүүлтүүр: [from-ийн УБ шөнө дунд, to-гийн дараагийн УБ шөнө дунд). */
export function leadsReportInstants(range: Pick<LeadsReportRange, 'from' | 'to'>): { start: string; end: string } {
    return {
        start: ubDayRange(new Date(`${range.from}T00:00:00+08:00`)).start.toISOString(),
        end: ubDayRange(new Date(`${range.to}T00:00:00+08:00`)).end.toISOString(),
    };
}

export interface LeadsSummaryLead {
    status: string | null;
    source: string | null;
    project_id: string | null;
    sales_manager_name: string | null;
}

export interface LeadsSummaryProject {
    id: string;
    name: string;
}

export interface LeadsSummary {
    total: number;
    /** Хугацаанд бүртгэгдсэн лидийн одоогийн төлөв. Хөрвүүлэлт = won / total. */
    conversion: {
        won: number;
        lost: number;
        /** Хаагдаагүй (ACTIVE_STATUSES). */
        open: number;
        /** Хаагдаагүйгээс «Шинэ»-ээс цааш явсан (холбогдсон … хэлэлцэж байна). */
        inProgress: number;
    };
    /** LEAD_STATUSES-ийн дарааллаар (0-ийг оруулна); толь бичигт байхгүй утга төгсгөлд. */
    byStatus: { status: string; count: number }[];
    bySource: { source: string; count: number; won: number }[];
    /** Бодит төсөл (project_id); төсөлгүй лид `projectId: null` мөрөнд, төгсгөлд. */
    byProject: { projectId: string | null; name: string | null; count: number; won: number }[];
    /** Хариуцагч менежер (sales_manager_name); хариуцагчгүй нь `manager: null`, төгсгөлд. */
    byManager: { manager: string | null; count: number; won: number }[];
}

/** API-ийн хариу: нэгтгэл + шийдсэн хугацаа (UI шошголоно). */
export type LeadsSummaryReport = LeadsSummary & { range: LeadsReportRange };

interface Tally { count: number; won: number }

function tally<K>(map: Map<K, Tally>, key: K, won: boolean) {
    const row = map.get(key) ?? { count: 0, won: 0 };
    row.count++;
    if (won) row.won++;
    map.set(key, row);
}

/** Цэвэр нэгтгэл — хүрээ, огноогоор аль хэдийн шүүсэн лидүүдийг тоолно. */
export function buildLeadsSummary(leads: LeadsSummaryLead[], projects: LeadsSummaryProject[]): LeadsSummary {
    const statuses = new Map<string, number>(LEAD_STATUSES.map(status => [status, 0]));
    const sources = new Map<string, Tally>();
    const byProject = new Map<string | null, Tally>();
    const byManager = new Map<string | null, Tally>();
    const projectNames = new Map(projects.map(project => [project.id, project.name]));
    const active = new Set<string>(ACTIVE_STATUSES);
    let open = 0;
    let newCount = 0;

    for (const lead of leads) {
        const status = lead.status ?? '';
        const won = status === 'closed_won';
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
        if (active.has(status)) open++;
        if (status === 'new') newCount++;
        tally(sources, lead.source || 'other', won);
        tally(byProject, lead.project_id || null, won);
        tally(byManager, lead.sales_manager_name?.trim() || null, won);
    }

    return {
        total: leads.length,
        conversion: {
            won: statuses.get('closed_won') ?? 0,
            lost: statuses.get('closed_lost') ?? 0,
            open,
            inProgress: open - newCount,
        },
        // Map нь LEAD_STATUSES-ийн дарааллыг хадгална; толь бичигт байхгүй утга гарвал төгсгөлд.
        byStatus: [...statuses].map(([status, count]) => ({ status, count })),
        bySource: ranked(sources).map(([source, row]) => ({ source, ...row })),
        byProject: ranked(byProject, id => (id ? projectNames.get(id) ?? '' : ''))
            .map(([projectId, row]) => ({ projectId, name: projectId ? projectNames.get(projectId) ?? null : null, ...row })),
        byManager: ranked(byManager).map(([manager, row]) => ({ manager, ...row })),
    };
}

/** Олноос цөөн рүү, тэнцвэл нэрээр; null түлхүүр (төсөлгүй, хариуцагчгүй) хамгийн сүүлд. */
function ranked<K extends string | null>(map: Map<K, Tally>, label: (key: K) => string = key => key ?? '') {
    return [...map].sort(([a, x], [b, y]) =>
        Number(a === null) - Number(b === null) || y.count - x.count || label(a).localeCompare(label(b), 'mn'));
}
