/**
 * Сарын KPI тайлангийн PURE туслахууд — DB-гүй, unit-тестэд шууд ордог.
 * /api/dashboard/kpi-report route татсан мөрүүд дээрээ эдгээрийг ажиллуулж,
 * менежерийн сарын тайланг (лид / уулзалт / гэрээ / борлуулалт / хийсэн ажлууд)
 * автоматаар нэгтгэнэ — гараар «сарын ажлаа дахин санаж бичих» шаардлагагүй.
 */

export interface KpiLeadRow {
    id: string;
    customer_name?: string | null;
    status?: string | null;
    source?: string | null;
    created_at?: string | null;
}

export interface KpiViewingRow {
    id: string;
    scheduled_at?: string | null;
    status?: string | null;
    property_name?: string | null;
    customer_name?: string | null;
}

export interface KpiContractRow {
    id: string;
    contract_number?: string | null;
    customer_name?: string | null;
    total_price?: number | null;
    contract_status?: string | null;
    contract_date?: string | null;
}

export interface KpiTaskRow {
    id: string;
    title: string;
    note?: string | null;
    completed_at?: string | null;
}

/** Өмнөх сарын харьцуулах суурь тоонууд. */
export interface KpiPrev {
    leads: number;
    viewings: number;
    contracts: number;
    revenue: number;
}

export interface KpiSummary {
    newLeads: number;
    viewings: number;
    viewingsDone: number;
    contracts: number;
    revenue: number;
    tasksDone: number;
    deltas: {
        leads: number | null;
        viewings: number | null;
        contracts: number | null;
        revenue: number | null;
    };
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
    new: 'Шинэ',
    contacted: 'Холбогдсон',
    viewing_scheduled: 'Уулзалт товлосон',
    offered: 'Санал тавьсан',
    negotiating: 'Тохиролцож буй',
    closed_won: 'Амжилттай',
    closed_lost: 'Амжилтгүй',
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
    messenger: 'Messenger',
    facebook: 'Facebook',
    instagram: 'Instagram',
    website: 'Вэбсайт',
    referral: 'Зөвлөмж',
    phone: 'Утас',
    facebook_ads: 'Facebook Ads',
    google_ads: 'Google Ads',
    tv: 'ТВ',
    meeting: 'Уулзалт',
    event: 'Өдөрлөг',
    board: 'Самбар',
    other: 'Бусад',
};

export const VIEWING_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Товлогдсон',
    completed: 'Болсон',
    cancelled: 'Цуцлагдсан',
    no_show: 'Ирээгүй',
};

/** Тухайн сарын [эхлэл, дараа сарын эхлэл) цонх (локал цагаар). */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
    return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

/** Өмнөх сар (оны хил давахыг зохицуулна). */
export function prevMonthOf(year: number, month: number): { year: number; month: number } {
    return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Хувийн өөрчлөлт (%). Суурь 0 үед null — «шинэ» гэж үзнэ, ∞ гарахгүй. */
export function pctChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
}

/** Түлхүүрээр тоолох (label map-гүй түүхий утгаар). */
export function countBy<T>(rows: T[], key: (row: T) => string | null | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    for (const row of rows) {
        const k = key(row) || 'other';
        out[k] = (out[k] || 0) + 1;
    }
    return out;
}

export function buildKpiSummary(input: {
    leads: KpiLeadRow[];
    viewings: KpiViewingRow[];
    contractCount: number;
    revenue: number;
    tasksDone: KpiTaskRow[];
    prev: KpiPrev;
}): KpiSummary {
    const viewingsHeld = input.viewings.filter((v) => v.status !== 'cancelled').length;
    return {
        newLeads: input.leads.length,
        viewings: viewingsHeld,
        viewingsDone: input.viewings.filter((v) => v.status === 'completed').length,
        contracts: input.contractCount,
        revenue: input.revenue,
        tasksDone: input.tasksDone.length,
        deltas: {
            leads: pctChange(input.leads.length, input.prev.leads),
            viewings: pctChange(viewingsHeld, input.prev.viewings),
            contracts: pctChange(input.contractCount, input.prev.contracts),
            revenue: pctChange(input.revenue, input.prev.revenue),
        },
    };
}

function fmtMnt(value: number): string {
    return `${Math.round(value).toLocaleString('mn-MN')}₮`;
}

function fmtDelta(delta: number | null): string {
    if (delta === null) return '';
    return delta >= 0 ? ` (өмнөх сараас +${delta}%)` : ` (өмнөх сараас ${delta}%)`;
}

function fmtDay(date: string | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * Тайланг цэвэр текст болгоно — хэрэглэгч сарын KPI тайлангаа
 * имэйл/чат/Excel-дээ шууд хуулж тавихад зориулав.
 */
export function formatKpiReportText(input: {
    managerName: string;
    shopName?: string | null;
    year: number;
    month: number;
    summary: KpiSummary;
    leadsByStatus: Record<string, number>;
    leadsBySource: Record<string, number>;
    viewingsByStatus: Record<string, number>;
    contracts: KpiContractRow[];
    tasksDone: KpiTaskRow[];
    target?: { teamTarget: number; teamActual: number; myShare: number | null } | null;
}): string {
    const { summary } = input;
    const lines: string[] = [];

    lines.push(`САРЫН KPI ТАЙЛАН — ${input.year} оны ${input.month}-р сар`);
    lines.push(`Менежер: ${input.managerName}${input.shopName ? ` · ${input.shopName}` : ''}`);
    lines.push('');
    lines.push('НЭГДСЭН ҮЗҮҮЛЭЛТ');
    lines.push(`• Шинэ лид: ${summary.newLeads}${fmtDelta(summary.deltas.leads)}`);
    lines.push(`• Уулзалт: ${summary.viewings}${fmtDelta(summary.deltas.viewings)} (болсон: ${summary.viewingsDone})`);
    lines.push(`• Байгуулсан гэрээ: ${summary.contracts}${fmtDelta(summary.deltas.contracts)}`);
    lines.push(`• Борлуулалт: ${fmtMnt(summary.revenue)}${fmtDelta(summary.deltas.revenue)}`);
    lines.push(`• Дуусгасан ажил: ${summary.tasksDone}`);

    if (input.target && input.target.teamTarget > 0) {
        const pct = input.target.teamActual > 0
            ? Math.round((input.target.teamActual / input.target.teamTarget) * 100)
            : 0;
        lines.push('');
        lines.push('ЗОРИЛТ');
        lines.push(`• Багийн сарын зорилт: ${fmtMnt(input.target.teamTarget)} · Гүйцэтгэл: ${fmtMnt(input.target.teamActual)} (${pct}%)`);
        if (input.target.myShare !== null) {
            lines.push(`• Багийн гүйцэтгэлд миний хувь: ${input.target.myShare}%`);
        }
    }

    const statusEntries = Object.entries(input.leadsByStatus);
    if (statusEntries.length > 0) {
        lines.push('');
        lines.push('ЛИДИЙН ЗАДАРГАА (төлөвөөр)');
        for (const [status, count] of statusEntries) {
            lines.push(`• ${LEAD_STATUS_LABELS[status] || status}: ${count}`);
        }
    }

    const sourceEntries = Object.entries(input.leadsBySource);
    if (sourceEntries.length > 0) {
        lines.push('');
        lines.push('ЛИДИЙН ЭХ ҮҮСВЭР');
        for (const [source, count] of sourceEntries) {
            lines.push(`• ${LEAD_SOURCE_LABELS[source] || source}: ${count}`);
        }
    }

    const viewingEntries = Object.entries(input.viewingsByStatus);
    if (viewingEntries.length > 0) {
        lines.push('');
        lines.push('УУЛЗАЛТУУД');
        for (const [status, count] of viewingEntries) {
            lines.push(`• ${VIEWING_STATUS_LABELS[status] || status}: ${count}`);
        }
    }

    if (input.contracts.length > 0) {
        lines.push('');
        lines.push('БАЙГУУЛСАН ГЭРЭЭНҮҮД');
        for (const c of input.contracts) {
            const parts = [
                c.contract_number ? `№${c.contract_number}` : null,
                c.customer_name || null,
                c.total_price ? fmtMnt(Number(c.total_price)) : null,
                c.contract_date ? fmtDay(c.contract_date) : null,
            ].filter(Boolean);
            lines.push(`• ${parts.join(' · ')}`);
        }
    }

    if (input.tasksDone.length > 0) {
        lines.push('');
        lines.push('ХИЙСЭН АЖЛУУД');
        for (const t of input.tasksDone) {
            lines.push(`• ${t.completed_at ? `[${fmtDay(t.completed_at)}] ` : ''}${t.title}`);
        }
    }

    lines.push('');
    lines.push('— Vertmon Hub автоматаар нэгтгэв');
    return lines.join('\n');
}
