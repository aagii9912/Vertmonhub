import { z } from 'zod';
import { ubDateStr } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { dateSchema, type MarketingPerformance } from '@/lib/marketing/performance';
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

export function formatWeeklyReview(input: {
    shopName: string;
    meetingDate: string;
    sales?: OperationsReport;
    marketing?: MarketingPerformance;
    updates?: WeeklyUpdate[];
    notices: string[];
}): string {
    const range = weeklyReviewRange(input.meetingDate);
    return [
        `${input.shopName} · Лхагва гарагийн хурал · ${input.meetingDate}`,
        `Тайлант хугацаа: ${range.from} – ${range.to} (Улаанбаатар)`,
        ...input.notices,
        '', '1. Борлуулалт',
        input.sales ? formatOperationsReportText(input.sales) : 'Борлуулалтын мэдээлэл энэ тайланд байхгүй.',
        '', '2. Маркетинг',
        ...(input.marketing ? [
            `Шинэ лид: ${input.marketing.totals.leads} · Менежерт шилжсэн: ${input.marketing.totals.sales} · Гэрээтэй лид: ${input.marketing.totals.deals}`,
            `Дууссан ажил: ${input.marketing.totals.activities} · Бүртгэсэн зардал: ${formatMNT(input.marketing.totals.spend)}`,
            ...input.marketing.channels.filter(c => c.leads > 0).map(c => `${c.name}: ${c.leads} лид · ${c.sales} шилжсэн · ${c.deals} гэрээтэй`),
            input.marketing.basis,
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
