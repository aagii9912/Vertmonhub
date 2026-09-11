import { ubStartOfDay } from '@/lib/utils/date';

/**
 * Захирлын самбарын цэвэр тооцооллууд (DB-гүй, unit-test хийгдэнэ).
 *
 * Дөрвөн блок: борлуулалт vs зорилт, менежерийн leaderboard,
 * эх үүсвэрийн funnel, авлага + үлдэгдэл байр.
 */

/* ------------------------------------------------------------------ */
/* Funnel — эх үүсвэр бүрээр лид → уулзалт → гэрээ                      */
/* ------------------------------------------------------------------ */

export interface FunnelLead {
    id: string;
    source: string | null;
}

export interface FunnelRow {
    source: string;
    leads: number;
    viewings: number;
    contracts: number;
    /** гэрээ / лид, % (нэг орны нарийвчлал) */
    conversionPct: number;
}

export interface FunnelResult {
    rows: FunnelRow[];
    totals: { leads: number; viewings: number; contracts: number };
}

/**
 * viewingLeadIds / contractLeadIds — тухайн хугацаанд уулзалт/гэрээ болсон
 * лидийн id (давхардаж болно; ЛИД тус бүр нэг л удаа тоологдоно).
 */
export function buildFunnel(
    leads: FunnelLead[],
    viewingLeadIds: Iterable<string>,
    contractLeadIds: Iterable<string>,
    limit = 6,
): FunnelResult {
    const sourceOf = new Map<string, string>();
    const counts = new Map<string, FunnelRow>();

    for (const l of leads) {
        const src = l.source || 'other';
        sourceOf.set(l.id, src);
        const row = counts.get(src) ?? { source: src, leads: 0, viewings: 0, contracts: 0, conversionPct: 0 };
        row.leads += 1;
        counts.set(src, row);
    }

    for (const id of new Set(viewingLeadIds)) {
        const src = sourceOf.get(id);
        if (!src) continue;
        counts.get(src)!.viewings += 1;
    }
    for (const id of new Set(contractLeadIds)) {
        const src = sourceOf.get(id);
        if (!src) continue;
        counts.get(src)!.contracts += 1;
    }

    const rows = [...counts.values()]
        .map((r) => ({ ...r, conversionPct: r.leads > 0 ? Math.round((r.contracts / r.leads) * 1000) / 10 : 0 }))
        .sort((a, b) => b.leads - a.leads || b.contracts - a.contracts || a.source.localeCompare(b.source));

    const totals = rows.reduce(
        (t, r) => ({ leads: t.leads + r.leads, viewings: t.viewings + r.viewings, contracts: t.contracts + r.contracts }),
        { leads: 0, viewings: 0, contracts: 0 },
    );

    // Хязгаараас хэтэрсэн жижиг эх үүсвэрүүдийг «Бусад» болгон нэгтгэнэ.
    if (rows.length > limit) {
        const head = rows.slice(0, limit - 1);
        const tail = rows.slice(limit - 1);
        const other = tail.reduce(
            (o, r) => ({ ...o, leads: o.leads + r.leads, viewings: o.viewings + r.viewings, contracts: o.contracts + r.contracts }),
            { source: 'other', leads: 0, viewings: 0, contracts: 0, conversionPct: 0 },
        );
        other.conversionPct = other.leads > 0 ? Math.round((other.contracts / other.leads) * 1000) / 10 : 0;
        return { rows: [...head, other], totals };
    }

    return { rows, totals };
}

/* ------------------------------------------------------------------ */
/* Leaderboard — менежер бүрийн сарын гүйцэтгэл                        */
/* ------------------------------------------------------------------ */

export interface LeaderboardInput {
    /** Идэвхтэй менежерүүдийн канон нэр (roster). Хоосон бол өгөгдлөөс гарна. */
    rosterNames: string[];
    contracts: { sales_manager: string | null; total_price: number | null; contract_status?: string | null }[];
    viewings: { sales_manager_name: string | null }[];
    leads: { sales_manager_name: string | null }[];
    /** Багийн тухайн сарын зорилт (₮). Менежер бүрт тэнцүү хуваана. */
    teamTargetMonth: number;
}

export interface LeaderboardRow {
    rank: number;
    name: string;
    contracts: number;
    sales: number;
    viewings: number;
    leads: number;
    /** Хувийн зорилт = багийн зорилт / идэвхтэй менежерийн тоо */
    target: number;
    targetPct: number;
}

export function buildLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
    const names = new Set<string>(input.rosterNames.filter(Boolean));
    if (!names.size) {
        for (const c of input.contracts) if (c.sales_manager) names.add(c.sales_manager);
        for (const v of input.viewings) if (v.sales_manager_name) names.add(v.sales_manager_name);
        for (const l of input.leads) if (l.sales_manager_name) names.add(l.sales_manager_name);
    }

    const rows = new Map<string, LeaderboardRow>();
    const ensure = (name: string) => {
        let r = rows.get(name);
        if (!r) {
            r = { rank: 0, name, contracts: 0, sales: 0, viewings: 0, leads: 0, target: 0, targetPct: 0 };
            rows.set(name, r);
        }
        return r;
    };
    for (const n of names) ensure(n);

    for (const c of input.contracts) {
        if (!c.sales_manager || !names.has(c.sales_manager)) continue;
        if (c.contract_status === 'cancelled') continue;
        const r = ensure(c.sales_manager);
        r.contracts += 1;
        r.sales += Number(c.total_price) || 0;
    }
    for (const v of input.viewings) {
        if (v.sales_manager_name && names.has(v.sales_manager_name)) ensure(v.sales_manager_name).viewings += 1;
    }
    for (const l of input.leads) {
        if (l.sales_manager_name && names.has(l.sales_manager_name)) ensure(l.sales_manager_name).leads += 1;
    }

    const perHead = names.size > 0 ? input.teamTargetMonth / names.size : 0;
    const list = [...rows.values()].map((r) => ({
        ...r,
        target: Math.round(perHead),
        targetPct: perHead > 0 ? Math.round((r.sales / perHead) * 100) : 0,
    }));

    list.sort((a, b) => b.sales - a.sales || b.contracts - a.contracts || b.viewings - a.viewings || a.name.localeCompare(b.name));
    list.forEach((r, i) => (r.rank = i + 1));
    return list;
}

/* ------------------------------------------------------------------ */
/* Авлага — хугацаа хэтэрсэн төлбөр                                    */
/* ------------------------------------------------------------------ */

export interface ScheduleRow {
    contract_id: string;
    due_date: string;
    amount: number | null;
    paid_amount: number | null;
    status: string | null;
}

export interface OverdueItem {
    contractId: string;
    customer: string;
    contractNumber: string | null;
    amount: number;
    daysOverdue: number;
}

export interface OverdueResult {
    count: number;
    total: number;
    items: OverdueItem[];
}

/**
 * Хугацаа нь өнгөрсөн (due_date < өнөөдөр) бөгөөд бүрэн төлөгдөөгүй мөрүүд.
 * Гэрээ бүрээр нэгтгэж, хамгийн их дүнтэйгээс нь эрэмбэлнэ.
 */
export function buildOverdue(
    schedules: ScheduleRow[],
    contractInfo: Map<string, { customer: string | null; contractNumber: string | null }>,
    today: Date,
    limit = 5,
): OverdueResult {
    const dayStart = ubStartOfDay(today); // УБ-ийн шөнө дунд (сервер UTC)

    const byContract = new Map<string, { amount: number; oldestDue: Date }>();
    for (const s of schedules) {
        if (s.status === 'paid' || s.status === 'cancelled') continue;
        const due = parseLocalDate(s.due_date);
        if (Number.isNaN(due.getTime()) || due >= dayStart) continue;
        const remaining = (Number(s.amount) || 0) - (Number(s.paid_amount) || 0);
        if (remaining <= 0) continue;
        const cur = byContract.get(s.contract_id);
        if (!cur) byContract.set(s.contract_id, { amount: remaining, oldestDue: due });
        else {
            cur.amount += remaining;
            if (due < cur.oldestDue) cur.oldestDue = due;
        }
    }

    const items: OverdueItem[] = [...byContract.entries()].map(([contractId, v]) => {
        const info = contractInfo.get(contractId);
        return {
            contractId,
            customer: info?.customer || 'Нэргүй',
            contractNumber: info?.contractNumber ?? null,
            amount: Math.round(v.amount),
            daysOverdue: Math.max(1, Math.floor((dayStart.getTime() - v.oldestDue.getTime()) / 86_400_000)),
        };
    });
    items.sort((a, b) => b.amount - a.amount || b.daysOverdue - a.daysOverdue);

    return {
        count: items.length,
        total: Math.round(items.reduce((t, i) => t + i.amount, 0)),
        items: items.slice(0, limit),
    };
}

/**
 * Postgres DATE («2026-08-27») нь цагийн бүсгүй өдөр — `new Date('2026-08-27')`
 * үүнийг UTC шөнө дунд гэж уншаад UTC+8-д нэг өдөр хойшлуулдаг. Локал өдрөөр задална.
 */
export function parseLocalDate(value: string): Date {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(value);
}

/* ------------------------------------------------------------------ */
/* Байрны төрлөөр (2 өрөө · 3 өрөө …)                                  */
/* ------------------------------------------------------------------ */

export function countByUnitType(rows: { unit_type: string | null }[]): { type: string; count: number }[] {
    const m = new Map<string, number>();
    for (const r of rows) {
        const t = (r.unit_type || '').trim() || 'Бусад';
        m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/* ------------------------------------------------------------------ */
/* API payload — /api/dashboard/director                               */
/* ------------------------------------------------------------------ */

export interface BlockRemaining {
    phase: string | null;
    block: string;
    total: number;
    available: number;
    sold: number;
    pending: number;
}

export interface DirectorPayload {
    /** Сонгосон сар */
    year: number;
    month: number; // 1–12
    sales: {
        actual: number;
        target: number;
        attainmentPct: number;
        /** Өмнөх сартай харьцуулсан % (өмнөх 0 бол null) */
        momDeltaPct: number | null;
        units: number;
        unitsByType: { type: string; count: number }[];
        /** [12] тухайн жилийн сар бүрийн бодит / зорилт (₮) */
        trendActual: number[];
        trendTarget: number[];
        yearActual: number;
        yearTarget: number;
    };
    leaderboard: LeaderboardRow[];
    funnel: FunnelResult;
    receivables: OverdueResult & {
        /** Идэвхтэй гэрээнүүдийн нийт үлдэгдэл (₮) */
        outstandingTotal: number;
    };
    inventory: {
        total: number;
        available: number;
        sold: number;
        pending: number;
        blocks: BlockRemaining[];
    };
    /** Аль хэсэг нь өгөгдөлгүй (миграци хийгдээгүй г.м) — UI сул төлөв харуулна */
    missing: string[];
}

/** Сарын % (хязгааргүй — 110% байж болно), зорилтгүй бол 0. */
export function attainmentPct(actual: number, target: number): number {
    return target > 0 ? Math.round((actual / target) * 100) : 0;
}

/** Өмнөх сартай харьцуулсан өөрчлөлт, %. Өмнөх 0 бол null (харуулахгүй). */
export function momDeltaPct(current: number, previous: number): number | null {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
}
