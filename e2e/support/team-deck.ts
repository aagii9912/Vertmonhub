import { buildPlanPerformance } from '../../src/lib/sales/plan-performance';
import { emptyMonthlySales } from '../../src/lib/sales/monthly';
import { activityBuckets, ACTIVITY_METRICS, type ActivityMetric, type SalesActivityReport } from '../../src/lib/dashboard/sales-activity';
import { meetingDetailWeeks, type MeetingDetailsReport } from '../../src/lib/dashboard/meeting-details';
import type { NegotiationsReport } from '../../src/lib/dashboard/negotiations';
import { weeklyReviewRange } from '../../src/lib/dashboard/weekly-review';

/**
 * «Борлуулалт (албаны загвар)» илтгэлийн хуурамч эх сурвалж (workday.spec.ts): төлөвлөгөөний биелэлт (санхүүгийн эрхгүй —
 * мөнгөн урсгалгүй), тоон мэдээлэл, уулзалтын дэлгэрэнгүй, ярилцаж буй гэрээ, илтгэлийн брэнд.
 */
export function teamDeckFixtures(meetingDate: string, shopId: string) {
    const range = weeklyReviewRange(meetingDate);
    const year = Number(range.to.slice(0, 4));
    const month = Number(range.to.slice(5, 7));
    const months = emptyMonthlySales();
    months[month - 1] = {
        ...months[month - 1], target_amount: 5_352_996_000, contract_count_target: 14,
        block_amounts: {
            b1: { target_amount: 2_807_220_000, manual_contract_actual_amount: 1_128_031_000 },
            b2: { target_amount: 2_245_776_000, manual_contract_actual_amount: 2_195_395_000 },
            parking: { target_amount: 300_000_000, manual_contract_actual_amount: 86_600_000 },
        },
    };
    const plan = {
        ...buildPlanPerformance({ year, now: new Date(`${range.to}T12:00:00+08:00`), months, planYears: [year], contracts: [], receipts: null, latestImportDate: null }),
        shopName: 'Vertmon · Туршилтын өгөгдөл', cashHidden: true,
    };
    const empty = () => Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, null])) as Record<ActivityMetric, number | null>;
    const flags = () => Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, false])) as Record<ActivityMetric, boolean>;
    const buckets = activityBuckets(range.to);
    const activity: SalesActivityReport & { projectName: string } = {
        meetingDate, range, projectName: 'Vertmon · Туршилтын өгөгдөл',
        buckets: buckets.map((bucket, index) => ({
            ...bucket, partial: flags(), confirmedDays: 0, knownDays: index < 3 ? 0 : 7, days: 7,
            values: index < 3 ? empty() : { hotline: 40 + index, managerLine: 60 + index, newMeetings: 10 + index, repeatMeetings: 2, chats: index === 3 ? null : 45 },
        })),
        month: { month: range.to.slice(0, 7), from: `${range.to.slice(0, 7)}-01`, to: range.to, metrics: {
            hotline: { actual: 145, plan: 550, planToDate: 348, pct: 42, partial: false },
            managerLine: { actual: 142, plan: 300, planToDate: 190, pct: 75, partial: false },
            newMeetings: { actual: 24, plan: 110, planToDate: 70, pct: 34, partial: false },
            repeatMeetings: { actual: 4, plan: 30, planToDate: 19, pct: 21, partial: false },
            chats: { actual: 109, plan: 85, planToDate: 54, pct: 202, partial: false },
        } },
        lines: { hotline: '7786 Оператор', managerLine: '3374', chats: ['Пэйж FB', 'Хувь чат'] },
        dataSince: '2026-09-01', notes: [],
    };
    const meetings: MeetingDetailsReport & { meetingDate: string } = {
        meetingDate, range,
        weeks: meetingDetailWeeks(meetingDate).map((week, index) => ({
            ...week, total: 5 + index, withoutInterest: 1,
            byModel: [{ key: 'B1|E7', label: 'Б1 E7 · 89.73 м² · 3 өрөө', count: 2 + index }, { key: 'B2|A', label: 'Б2 A · 57.87 м² · 2 өрөө', count: 2 }],
        })),
        referral: { rows: [{ label: 'Ойрхон амьдардаг', count: 5 }, { label: 'Сошиал медиа', count: 3 }], unknown: 1, total: 9, available: true },
        notes: [],
    };
    const negotiations: NegotiationsReport = {
        asOf: range.to,
        rows: [{ leadId: 'lead-n1', status: 'negotiating', manager: 'Номин.Менежер', block: 'Б2', rooms: 2, floor: 12, area: 57.87, condition: '10-30%',
            pricePerSqm: 5_400_000, total: 312_498_000, advance: 93_749_400, conditionNote: null, referral: 'Инстаграм', viewedAt: range.from, priceReason: null }],
        totals: { count: 1, area: { sum: 57.87, known: 57.87, partial: false }, total: { sum: 312_498_000, known: 312_498_000, partial: false }, advance: { sum: 93_749_400, known: 93_749_400, partial: false } },
        pricing: { version: 2, source: 'Үнийн жагсаалт' }, notes: [],
    };
    const brandingPath = (n: number) => `branding/${shopId}/00000000-0000-4000-8000-00000000030${n}.png`;
    const branding = {
        branding: { displayName: 'ТУРШИЛТ', footerText: 'ВЕРТМОН ПРОПЕРТИС', coverImagePath: brandingPath(1), logoPath: brandingPath(2), updatedAt: `${range.from}T03:00:00Z` },
        available: true,
    };
    return { plan, activity, meetings, negotiations, branding, brandingPaths: [brandingPath(1), brandingPath(2)] };
}
