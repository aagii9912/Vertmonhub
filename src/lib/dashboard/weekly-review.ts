import { z } from 'zod';
import { ubDateStr } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { dateSchema, performanceChange, type MarketingPerformance } from '@/lib/marketing/performance';
import { formatDepartmentKpisText } from '@/lib/marketing/department-kpi';
import { formatOperationsReportText, type OperationsReport } from './operations-report';

export const meetingDateSchema = dateSchema.refine(
    value => new Date(`${value}T00:00:00Z`).getUTCDay() === 3,
    'Хурлын огноо Лхагва гараг байх ёстой.',
);

export const WeeklyUpdateSchema = z.object({
    meetingDate: meetingDateSchema,
    achievements: z.string().trim().max(4000),
    blockers: z.string().trim().max(4000),
    nextSteps: z.string().trim().max(4000),
}).strict().refine(value => !!(value.achievements || value.blockers || value.nextSteps), 'Дор хаяж нэг хэсгийг бөглөнө үү.');

export interface WeeklyUpdate {
    id: string;
    user_id: string;
    author_name: string;
    meeting_date: string;
    achievements: string;
    blockers: string;
    next_steps: string;
    updated_at: string;
}

export interface WeeklyUpdatesData {
    updates: WeeklyUpdate[];
    canViewTeam: boolean;
}

export function shiftReviewDate(date: string, days: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Лхагва гарагт өнөөдрийн хурлыг, бусад өдөр дараагийн хурлыг нээнэ. */
export function nextMeetingDate(now = new Date()): string {
    const today = ubDateStr(now);
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return shiftReviewDate(today, (3 - weekday + 7) % 7);
}

/** Өмнөх Лхагвагаас Мягмар дуустал, хоёр захын өдрийг оруулна. */
export function weeklyReviewRange(meetingDate: string) {
    return { from: shiftReviewDate(meetingDate, -7), to: shiftReviewDate(meetingDate, -1) };
}

/** Хамгийн сүүлд бүрэн дууссан хурлын долоо хоног (Лхагва–Мягмар, УБ): Лхагва гарагт өчигдөр дууссан долоо хоног. */
export function lastCompletedReviewRange(now = new Date()) {
    const next = nextMeetingDate(now);
    return weeklyReviewRange(next === ubDateStr(now) ? next : shiftReviewDate(next, -7));
}

export function formatReviewChange(current: number, previous?: number): string {
    if (previous === undefined) return 'Өмнөх хугацааны мэдээлэл байхгүй';
    const delta = current - previous;
    const change = performanceChange(current, previous);
    return `Өмнөх ${previous} · ${delta > 0 ? '+' : ''}${delta}${change === null ? ' · хувь тооцох суурь алга' : ` (${change > 0 ? '+' : ''}${change}%)`}`;
}

/** Хадгалсан саад болон одоогийн ажлын дарааллаас хурлын асуудлыг гаргана. */
export function weeklyDiscussionItems(input: { sales?: OperationsReport; marketing?: MarketingPerformance; updates?: WeeklyUpdate[] }) {
    const items: { title: string; detail: string; href?: string }[] = [];
    const health = input.sales?.leads.health;
    if (health?.ownerless) items.push({ title: `Эзэнгүй ${health.ownerless} лид`, detail: 'Хариуцах менежер, дараагийн алхмыг тогтоох.', href: '/dashboard/leads?queue=unassigned' });
    if (health?.overdue) items.push({ title: `Хугацаа хэтэрсэн ${health.overdue} лид`, detail: 'Холбоо барих эсвэл уулзалтын дараагийн хугацааг шинэчлэх.', href: '/dashboard/leads?queue=overdue' });
    if (input.marketing?.spendQuality.current.missingFx) items.push({ title: `Ханшгүй ${input.marketing.spendQuality.current.missingFx} зардал`, detail: 'Ханшаа нөхөж байж нийт зардал, нэг лидийн өртгийг үнэлэх.' });
    if (input.marketing?.quality.unknownHandoff) items.push({ title: `Шилжүүлсэн огноогүй ${input.marketing.quality.unknownHandoff} лид`, detail: 'Бодит шилжүүлсэн огноог шалгах; хөрвөлтөд таамгаар оруулахгүй.' });
    for (const update of input.updates || []) {
        if (update.blockers.trim()) items.push({ title: update.author_name, detail: update.blockers });
    }
    return items;
}

export function formatWeeklyReview(input: {
    shopName: string;
    meetingDate: string;
    sales?: OperationsReport;
    previousSales?: OperationsReport;
    marketing?: MarketingPerformance;
    updates?: WeeklyUpdate[];
    notices: string[];
}): string {
    const range = weeklyReviewRange(input.meetingDate);
    const priorRange = weeklyReviewRange(shiftReviewDate(input.meetingDate, -7));
    const discussions = weeklyDiscussionItems(input);
    const money = (value: number | null) => value === null ? 'тооцох боломжгүй' : formatMNT(value);
    const percent = (value: number | null) => value === null ? 'тооцох суурь алга' : `${value}%`;
    return [
        `${input.shopName} · Лхагва гарагийн хурал · ${input.meetingDate}`,
        `Тайлант хугацаа: ${range.from} – ${range.to} (Улаанбаатар)`,
        ...input.notices,
        `Харьцуулах хугацаа: ${priorRange.from} – ${priorRange.to}`,
        '', 'Хурлаар шийдэх',
        ...(discussions.length ? discussions.map(item => `• ${item.title}: ${item.detail}`) : ['Хадгалсан мэдээллээс хэлэлцэх асуудал илрээгүй.']),
        '', '1. Борлуулалт',
        input.sales ? formatOperationsReportText(input.sales) : 'Борлуулалтын мэдээлэл энэ тайланд байхгүй.',
        ...(input.sales ? [
            `Шинэ лид: ${formatReviewChange(input.sales.leads.newCount, input.previousSales?.leads.newCount)}`,
            `Байгуулсан гэрээ: ${formatReviewChange(input.sales.contracts.count, input.previousSales?.contracts.count)}`,
            ...(input.sales.meetings ? [`Болсон уулзалт: ${formatReviewChange(input.sales.meetings.completed, input.previousSales?.meetings?.completed)}`] : []),
            ...(input.previousSales ? [`Өмнөх гэрээний бүртгэлтэй дүн: ${formatMNT(input.previousSales.contracts.value)}${input.previousSales.contracts.missingAmounts ? ' · дүн дутуу' : ''}`] : []),
        ] : []),
        '', '2. Маркетинг',
        ...(input.marketing ? [
            `Шинэ лид: ${input.marketing.totals.leads} · Менежерт шилжсэн: ${input.marketing.totals.sales} · Гэрээтэй лид: ${input.marketing.totals.deals}`,
            `Дууссан ажил: ${input.marketing.totals.activities} · Бүртгэсэн зардал: ${input.marketing.totals.hasSpend || !input.marketing.totals.spendComplete ? formatMNT(input.marketing.totals.spend) : 'бүртгээгүй'}`,
            `Дууссан кампанит ажил: ${formatReviewChange(input.marketing.totals.campaigns, input.marketing.previous.campaigns)}`,
            `Дууссан контент: ${formatReviewChange(input.marketing.totals.content, input.marketing.previous.content)}`,
            `Шинэ лид: ${formatReviewChange(input.marketing.totals.leads, input.marketing.previous.leads)}`,
            `Менежерт шилжсэн: ${formatReviewChange(input.marketing.totals.sales, input.marketing.previous.sales)}`,
            `Гэрээтэй лид: ${formatReviewChange(input.marketing.totals.deals, input.marketing.previous.deals)}`,
            `Дууссан ажил: ${formatReviewChange(input.marketing.totals.activities, input.marketing.previous.activities)}`,
            `Шилжилт: ${percent(input.marketing.totals.salesPct)} (өмнөх ${percent(input.marketing.previous.salesPct)}) · Гэрээлэлт: ${percent(input.marketing.totals.dealPct)} (өмнөх ${percent(input.marketing.previous.dealPct)})`,
            `Нэг лидийн өртөг: ${money(input.marketing.totals.costPerLead)} · Нэг шилжсэн лидийн өртөг: ${money(input.marketing.totals.costPerSale)} · Нэг гэрээтэй лидийн өртөг: ${money(input.marketing.totals.costPerDeal)}`,
            `Өмнөх нэг лид: ${money(input.marketing.previous.costPerLead)} · Өмнөх нэг шилжсэн лид: ${money(input.marketing.previous.costPerSale)} · Өмнөх нэг гэрээтэй лид: ${money(input.marketing.previous.costPerDeal)}`,
            ...input.marketing.channels.filter(c => c.leads > 0 || c.hasSpend || !c.spendComplete).map(c => `${c.name}: ${c.leads} лид · ${c.sales} шилжсэн · ${c.deals} гэрээтэй · зардал ${c.hasSpend || !c.spendComplete ? money(c.spend) : 'бүртгээгүй'} · нэг лид ${money(c.costPerLead)}${c.spendComplete ? '' : ' · ханш дутуу'}`),
            'Өртөг = тухайн хугацааны бүртгэсэн зардал / лидийн тоо. Ханш дутуу, зардал эсвэл тооцох суурь алга бол өртөг тооцоогүй.',
            input.marketing.basis,
            '', formatDepartmentKpisText(input.marketing),
            `Ханшгүй ${input.marketing.spendQuality.current.missingFx} зардал нийтэд ороогүй. Огноогүй ${input.marketing.quality.unknownHandoff} шилжүүлэлтийг тооцоогүй.`,
        ] : ['Маркетингийн мэдээлэл энэ тайланд байхгүй.']),
        '', '3. Ажлын явц, хэлэлцэх зүйл',
        ...(input.updates?.length ? input.updates.flatMap(update => [
            `${update.author_name} · ${update.updated_at}`,
            `Хийсэн ажил: ${update.achievements || 'Тэмдэглээгүй'}`,
            `Саад, шийдэх зүйл: ${update.blockers || 'Тэмдэглээгүй'}`,
            `Дараагийн алхам: ${update.next_steps || 'Тэмдэглээгүй'}`, '',
        ]) : [input.updates ? 'Хадгалсан ажлын шинэчлэл алга.' : 'Ажлын шинэчлэлийн мэдээлэл түр боломжгүй.']),
    ].join('\n');
}
