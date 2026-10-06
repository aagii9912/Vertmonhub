import { ubMonthKey } from '@/lib/utils/date';
import type { TimelineMonthKey } from './timeline';

/**
 * Маркетинг ROI хуудасны «Лидийн эх үүсвэр», «Эх үүсвэрийн шинжилгээ», «Сар бүрийн лийд»-ийн нэгтгэл.
 * Огноо сонголтоос үл хамааран харах эрхтэй БҮХ лидээр (сервер `fetchAllRows`) — өмнө нь хөтөч
 * сүүлд үүссэн 1000 лидээр тооцож, их лидтэй төсөлд нийт, конверс, шилдэг суваг тасардаг байсан.
 *   - won    — `closed_won`; lost — `closed_lost`; бусад нь идэвхтэй
 *   - monthly — `months`-ийн Улаанбаатарын сар бүрийн үүссэн лид (эрт → хожуу, лидгүй сар 0)
 */
export interface LeadSourceLead { source: string | null; status: string | null; created_at: string | null }
export interface LeadSourceCounts { total: number; won: number; lost: number; active: number; conversionRate: number }
export interface LeadSourceRow extends LeadSourceCounts { source: string }
/** `type` (interface биш) — чартын `Record<string, string | number>[]`-д шууд дамжина. */
export type LeadSourceMonth = { month: string; label: string; count: number };
export interface LeadSourceStats {
    totals: LeadSourceCounts;
    /** Лидийн тоогоор буурахаар (тэнцвэл эх үүсвэрийн нэрээр). */
    sources: LeadSourceRow[];
    /** Хамгийн өндөр конверстой суваг (тэнцвэл олон лидтэй нь); лидгүй бол null. */
    bestSource: string | null;
    monthly: LeadSourceMonth[];
}

const rate = (won: number, total: number) => (total > 0 ? Math.round((won / total) * 100) : 0);
const empty = () => ({ total: 0, won: 0, lost: 0, active: 0 });

export function buildLeadSourceStats(leads: readonly LeadSourceLead[], months: readonly TimelineMonthKey[]): LeadSourceStats {
    const totals = empty();
    const bySource = new Map<string, ReturnType<typeof empty>>();
    const monthly = new Map(months.map(m => [m.key, { month: m.key, label: m.label, count: 0 }]));
    for (const lead of leads) {
        const source = lead.source || 'other';
        const bucket = bySource.get(source) ?? empty();
        bySource.set(source, bucket);
        const field = lead.status === 'closed_won' ? 'won' : lead.status === 'closed_lost' ? 'lost' : 'active';
        for (const counts of [totals, bucket]) {
            counts.total++;
            counts[field]++;
        }
        const month = monthly.get(ubMonthKey(lead.created_at) ?? '');
        if (month) month.count++;
    }
    const sources = [...bySource]
        .map(([source, counts]) => ({ source, ...counts, conversionRate: rate(counts.won, counts.total) }))
        .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
    const best = sources.reduce<LeadSourceRow | null>((top, s) => (!top || s.conversionRate > top.conversionRate ? s : top), null);
    return {
        totals: { ...totals, conversionRate: rate(totals.won, totals.total) },
        sources,
        bestSource: best?.source ?? null,
        monthly: [...monthly.values()],
    };
}
