import { z } from 'zod';
import { ubDateStr } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { dateSchema, performanceChange, type MarketingPerformance } from '@/lib/marketing/performance';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, type ContentPlanSummary } from '@/lib/marketing/content-plan';
import { formatOperationsReportText, type OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import { periodContractAmount, periodContractCount } from './contract-dates';

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
    /** Зохиогчийн дүр (user_roles) — маркетингийн гишүүний шинэчлэл маркетингийн слайдад, бусдынх борлуулалтын слайдад. */
    author_role?: string | null;
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

/** Огноог агуулах хурлын долоо хоног (Лхагва–Мягмар). */
export function reviewWeekOf(day: string) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const from = shiftReviewDate(day, -((weekday - 3 + 7) % 7));
    return { from, to: shiftReviewDate(from, 6) };
}

/** [from, to] хугацаатай давхцах хурлын долоо хоногууд (Лхагва–Мягмар), эрт → хожуу. */
export function reviewWeeksBetween(from: string, to: string) {
    const weeks: Array<{ from: string; to: string }> = [];
    for (let week = reviewWeekOf(from); week.from <= to; week = reviewWeekOf(shiftReviewDate(week.to, 1))) weeks.push(week);
    return weeks;
}

export function formatReviewChange(current: number, previous?: number): string {
    if (previous === undefined) return 'Өмнөх хугацааны мэдээлэл байхгүй';
    const delta = current - previous;
    const change = performanceChange(current, previous);
    return `Өмнөх ${previous} · ${delta > 0 ? '+' : ''}${delta}${change === null ? ' · хувь тооцох суурь алга' : ` (${change > 0 ? '+' : ''}${change}%)`}`;
}

/** Маркетингийн гишүүний шинэчлэл маркетингийн тайланд, бусдынх борлуулалтын тайланд. */
export const updatePart = (update: Pick<WeeklyUpdate, 'author_role'>): 'sales' | 'marketing' => update.author_role === 'marketing' ? 'marketing' : 'sales';

export interface WeeklyContentPlan { week: ContentPlanSummary; next: ContentPlanSummary }

/** Хадгалсан саад болон одоогийн ажлын дарааллаас хурлын асуудлыг гаргана (борлуулалт, маркетинг тусдаа). */
export function weeklyDiscussionItems(input: { sales?: OperationsReport; marketing?: MarketingPerformance; contentPlan?: WeeklyContentPlan; updates?: WeeklyUpdate[] }) {
    const items: { title: string; detail: string; href?: string; part: 'sales' | 'marketing' }[] = [];
    const health = input.sales?.leads.health;
    if (health?.ownerless) items.push({ title: `Эзэнгүй ${health.ownerless} лид`, detail: 'Хариуцах менежер, дараагийн алхмыг тогтоох.', href: '/dashboard/leads?queue=unassigned', part: 'sales' });
    if (health?.overdue) items.push({ title: `Хугацаа хэтэрсэн ${health.overdue} лид`, detail: 'Холбоо барих эсвэл уулзалтын дараагийн хугацааг шинэчлэх.', href: '/dashboard/leads?queue=overdue', part: 'sales' });
    const undated = input.sales?.contracts.undatedCount;
    if (undated) items.push({ title: `Огноогүй ${undated} гэрээ`, detail: 'ERP-ийн гэрээний экспортыг оруулж, долоо хоног, сарын гэрээ, орсон мөнгийг тооцуулах. Тэр хүртэл гэрээний тоо тодорхойгүй.', href: '/dashboard/reports/erp', part: 'sales' });
    if (input.marketing?.quality.unknownHandoff) items.push({ title: `Шилжүүлсэн огноогүй ${input.marketing.quality.unknownHandoff} лид`, detail: 'Бодит шилжүүлсэн огноог шалгах; хөрвөлтөд таамгаар оруулахгүй.', part: 'sales' });
    if (input.contentPlan?.week.overdue) items.push({ title: `Хоцорсон ${input.contentPlan.week.overdue} контент`, detail: 'Төлөвлөсөн огноо өнгөрсөн, нийтлээгүй контентын шинэ огноо эсвэл цуцлах шийдвэр.', href: '/marketing/calendar', part: 'marketing' });
    if (input.marketing?.spendQuality.current.missingFx) items.push({ title: `Ханшгүй ${input.marketing.spendQuality.current.missingFx} зардал`, detail: 'Ханшаа нөхөж байж маркетингийн нийт зардал, төсвийн гүйцэтгэлийг үнэлэх.', part: 'marketing' });
    for (const update of input.updates || []) {
        if (update.blockers.trim()) items.push({ title: update.author_name, detail: update.blockers, part: updatePart(update) });
    }
    return items;
}

/** Контент төлөвлөгөөний текст (хурлын тайлан, AI). */
export function formatContentPlanText(plan: WeeklyContentPlan): string[] {
    const line = (item: ContentPlanSummary['items'][number]) => `  ${item.scheduled_date.slice(5)} ${CONTENT_TYPE_LABEL[item.type] ?? item.type} · ${item.title} — ${CONTENT_STATUS_LABEL[item.status] ?? item.status}${item.assigned_to ? ` (${item.assigned_to})` : ''}`;
    const { week, next } = plan;
    return [
        week.planned || week.cancelled
            ? `Контент: төлөвлөсөн ${week.planned} · нийтэлсэн ${week.published}${week.pct === null ? '' : ` (${week.pct}%)`} · хийгдэж буй/бэлэн ${week.inProgress} · хоцорсон ${week.overdue}${week.cancelled ? ` · цуцалсан ${week.cancelled}` : ''}`
            : 'Контент: энэ долоо хоногт төлөвлөсөн контент алга.',
        ...week.items.map(line),
        `Дараагийн 7 хоногийн төлөвлөгөө: ${next.planned} контент`,
        ...next.items.map(line),
    ];
}

export function formatWeeklyReview(input: {
    shopName: string;
    meetingDate: string;
    sales?: OperationsReport;
    previousSales?: OperationsReport;
    weeklySales?: WeeklySalesReport;
    marketing?: MarketingPerformance;
    contentPlan?: WeeklyContentPlan;
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
            input.sales.contracts.undatedCount
                ? `Байгуулсан гэрээ: ${periodContractCount(input.sales.contracts.count, input.sales.contracts.undatedCount)} (огноогүй ${input.sales.contracts.undatedCount} гэрээ ороогүй)`
                : `Байгуулсан гэрээ: ${formatReviewChange(input.sales.contracts.count, input.previousSales?.contracts.count)}`,
            ...(input.sales.meetings ? [`Болсон уулзалт: ${formatReviewChange(input.sales.meetings.completed, input.previousSales?.meetings?.completed)}`] : []),
            ...(input.previousSales ? [`Өмнөх гэрээний бүртгэлтэй дүн: ${formatMNT(input.previousSales.contracts.value)}${input.previousSales.contracts.missingAmounts ? ' · дүн дутуу' : ''}`] : []),
        ] : []),
        ...(input.weeklySales ? formatWeeklySalesText(input.weeklySales) : []),
        // Лидийн эх сурвалж, хөрвөлт нь борлуулалтын үзүүлэлт — маркетингийн албаны ажлын хэмжүүр биш.
        ...(input.marketing ? [
            '', 'Лидийн эх сурвалж, хөрвөлт',
            `Шинэ лид: ${input.marketing.totals.leads} · Менежерт шилжсэн: ${input.marketing.totals.sales} · Гэрээтэй лид: ${input.marketing.totals.deals}`,
            `Шинэ лид: ${formatReviewChange(input.marketing.totals.leads, input.marketing.previous.leads)}`,
            `Менежерт шилжсэн: ${formatReviewChange(input.marketing.totals.sales, input.marketing.previous.sales)}`,
            `Гэрээтэй лид: ${formatReviewChange(input.marketing.totals.deals, input.marketing.previous.deals)}`,
            `Шилжилт: ${percent(input.marketing.totals.salesPct)} (өмнөх ${percent(input.marketing.previous.salesPct)}) · Гэрээлэлт: ${percent(input.marketing.totals.dealPct)} (өмнөх ${percent(input.marketing.previous.dealPct)})`,
            `Нэг лидийн өртөг: ${money(input.marketing.totals.costPerLead)} · Нэг шилжсэн лидийн өртөг: ${money(input.marketing.totals.costPerSale)} · Нэг гэрээтэй лидийн өртөг: ${money(input.marketing.totals.costPerDeal)}`,
            `Өмнөх нэг лид: ${money(input.marketing.previous.costPerLead)} · Өмнөх нэг шилжсэн лид: ${money(input.marketing.previous.costPerSale)} · Өмнөх нэг гэрээтэй лид: ${money(input.marketing.previous.costPerDeal)}`,
            ...input.marketing.channels.filter(c => c.leads > 0 || c.hasSpend || !c.spendComplete).map(c => `${c.name}: ${c.leads} лид · ${c.sales} шилжсэн · ${c.deals} гэрээтэй · зардал ${c.hasSpend || !c.spendComplete ? money(c.spend) : 'бүртгээгүй'} · нэг лид ${money(c.costPerLead)}${c.spendComplete ? '' : ' · ханш дутуу'}`),
            'Өртөг = тухайн хугацааны бүртгэсэн зардал / лидийн тоо. Ханш дутуу, зардал эсвэл тооцох суурь алга бол өртөг тооцоогүй.',
            input.marketing.basis,
            `Огноогүй ${input.marketing.quality.unknownHandoff} шилжүүлэлтийг тооцоогүй.`,
        ] : []),
        '', '2. Маркетинг — контент төлөвлөгөө ба гүйцэтгэл',
        ...(input.contentPlan ? formatContentPlanText(input.contentPlan) : ['Контент төлөвлөгөөний мэдээлэл энэ тайланд байхгүй.']),
        ...(input.marketing ? [
            `Дууссан кампанит ажил: ${formatReviewChange(input.marketing.totals.campaigns, input.marketing.previous.campaigns)}`,
            `Дууссан контент: ${formatReviewChange(input.marketing.totals.content, input.marketing.previous.content)}`,
            `Бүртгэсэн зардал: ${input.marketing.totals.hasSpend || !input.marketing.totals.spendComplete ? formatMNT(input.marketing.totals.spend) : 'бүртгээгүй'}`,
            `Ханшгүй ${input.marketing.spendQuality.current.missingFx} зардал нийтэд ороогүй.`,
        ] : []),
        '', '3. Ажлын явц, хэлэлцэх зүйл',
        ...(input.updates?.length ? input.updates.flatMap(update => [
            `${update.author_name} · ${update.updated_at}`,
            `Хийсэн ажил: ${update.achievements || 'Тэмдэглээгүй'}`,
            `Саад, шийдэх зүйл: ${update.blockers || 'Тэмдэглээгүй'}`,
            `Дараагийн алхам: ${update.next_steps || 'Тэмдэглээгүй'}`, '',
        ]) : [input.updates ? 'Хадгалсан ажлын шинэчлэл алга.' : 'Ажлын шинэчлэлийн мэдээлэл түр боломжгүй.']),
    ].join('\n');
}

/** Хурлын текстэд орох гэрээ, мөнгөн орлого, үлдэгдлийн товч. */
export function formatWeeklySalesText(report: WeeklySalesReport): string[] {
    const money = (value: number) => formatMNT(value);
    return [
        '', 'Гэрээ, үлдэгдэл',
        `Эх сурвалж: ${report.sources.contracts === 'erp' && report.sources.sales ? `ERP «${report.sources.sales.source}» ${report.sources.sales.date}` : report.sources.contracts === 'crm' ? 'CRM-ийн гэрээ' : 'гэрээний мэдээлэл алга'}`,
        report.sources.undatedContracts
            ? `Энэ долоо хоног: ${periodContractCount(report.week.count, report.sources.undatedContracts)} гэрээ · ${periodContractAmount(report.week.total, report.week.count, report.sources.undatedContracts, money)} (огноогүй ${report.sources.undatedContracts} гэрээ ороогүй)`
            : `Энэ долоо хоног: ${report.week.count} гэрээ · ${money(report.week.total)} (өмнөх ${report.previousWeek.count} · ${money(report.previousWeek.total)})`,
        ...report.week.byKind.map(kind => `  ${kind.label}: ${kind.count} · ${money(kind.total)}`),
        `${report.month.month} сар: ${periodContractCount(report.month.count, report.sources.undatedContracts)} гэрээ · ${periodContractAmount(report.month.total, report.month.count, report.sources.undatedContracts, money)}${report.month.target ? ` / төлөвлөгөө ${money(report.month.target)} (${report.month.attainmentPct === null ? '—' : `${report.month.attainmentPct}%${report.sources.undatedContracts ? '+' : ''}`})` : ' · сарын төлөвлөгөө тохируулаагүй'}`,
        report.cash ? `Мөнгөн орлого (ERP ${report.cash.from} → ${report.cash.to}): ${money(report.cash.delta)}` : 'Мөнгөн орлого: хоёр долоо хоногийн ERP экспорт хэрэгтэй',
        ...(report.receivables ? [`Төлбөрийн хоцролт: ${money(report.receivables.overdue)} · ${report.receivables.overdueContracts} гэрээ · нийт үлдэгдэл ${money(report.receivables.balance)}`] : []),
        ...report.byManager.map(row => `  ${row.manager}: 7 хоногт ${row.weekCount} (${money(row.weekTotal)}), сард ${row.monthCount} (${money(row.monthTotal)})${row.cash !== null ? `, мөнгө ${money(row.cash)}` : ''}`),
        ...(report.inventory ? report.inventory.floorMaps.map(map => `${map.block} блок орон сууц: гэрээтэй ${map.totals.sold}, худалдаанд ${map.totals.available}, бусад ${map.totals.other}, бартер ${map.totals.barter}`) : []),
        ...report.notes,
    ];
}
