import type { OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import { updatePart, type WeeklyContentPlan, type WeeklyUpdate } from './weekly-review';
import type { WeeklySlide } from './weekly-slides';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import type { SocialWeek } from '@/lib/marketing/social-week';
import { CHANNEL_SOURCE_LABELS, type ChannelSource } from '@/lib/marketing/channel-reports';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';

/**
 * Лхагвагийн хурлын бэлтгэл алхам алхмаар: борлуулалт, маркетинг тус бүрийн хийх зүйл, хуудсанд аль
 * хэдийн ачаалсан өгөгдлөөс автоматаар «бэлэн / дутуу» гэж үзнэ. Маркетингийг лид, гэрээгээр үнэлэхгүй —
 * өөрийн контент төлөвлөгөө, сувгийн тайлан, Facebook хуудас (эзэмшигчийн шийдвэр 2026-10-13).
 * Цэвэр функц: хуудас болон тест ашиглана.
 */
export type ChecklistStatus = 'done' | 'todo' | 'warn' | 'check';

export interface ChecklistStep {
    id: string;
    title: string;
    /** Одоогийн байдал эсвэл яг юу хийх. */
    detail: string;
    status: ChecklistStatus;
    href?: string;
    /** Заавал биш (нэмэлт слайд гэх мэт) — явцад тооцохгүй. */
    optional?: boolean;
}

export interface MeetingChecklistInput {
    range: { from: string; to: string };
    sales?: OperationsReport;
    weeklySales?: WeeklySalesReport;
    marketing?: MarketingPerformance;
    contentPlan?: WeeklyContentPlan;
    social?: SocialWeek | null;
    channels?: ChannelReportMatches | null;
    slides?: WeeklySlide[];
    updates?: WeeklyUpdate[];
}

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Сувгийн гараар оруулах экспорт (Facebook хуудас нь холбогдсон бол автоматаар). */
const MANUAL_CHANNELS: ChannelSource[] = ['meta_ads', 'callpro', 'sms'];

export function salesChecklist(input: MeetingChecklistInput): ChecklistStep[] {
    const { range, sales, weeklySales: weekly } = input;
    const steps: ChecklistStep[] = [];

    // 1. ERP-ийн гэрээний экспорт — гэрээ, менежерээр, орсон мөнгө.
    const salesExport = weekly?.sources.sales ?? null;
    const undated = weekly?.sources.undatedContracts ?? 0;
    steps.push(salesExport
        ? { id: 'erp-sales', title: 'ERP-ийн гэрээний экспорт оруулах', href: '/dashboard/reports/erp',
            status: salesExport.date >= range.from ? 'done' : 'warn',
            detail: salesExport.date >= range.from ? `${salesExport.date}-ны экспорт орсон.` : `Сүүлийн экспорт ${salesExport.date} — энэ долоо хоногийнхыг оруулна (орсон мөнгө 2 экспортын зөрүүгээр тооцогдоно).` }
        : undated
            ? { id: 'erp-sales', title: 'ERP-ийн гэрээний экспорт оруулах', href: '/dashboard/reports/erp', status: 'todo',
                detail: `Огноогүй ${undated} гэрээ байна — экспортгүйгээр гэрээ, орсон мөнгө тодорхойгүй.` }
            : { id: 'erp-sales', title: 'Гэрээгээ Hub-д бүртгэх', href: '/dashboard/contracts', status: 'check',
                detail: 'ERP экспорт оруулдаггүй төсөл — энэ долоо хоногийн гэрээ бүр Hub-д бүртгэгдсэнийг шалгана.' });

    // 2. Байрны үлдэгдэл, давхрын зураглал.
    const inventory = weekly?.inventory?.source ?? null;
    steps.push({
        id: 'inventory', title: 'Байрны үлдэгдлийн экспорт шинэчлэх', href: '/dashboard/reports/erp',
        status: !inventory ? 'todo' : inventory.kind === 'erp' && inventory.date >= range.from ? 'done' : 'warn',
        detail: !inventory ? 'Үлдэгдлийн мэдээлэл алга — ERP-ийн бүтээгдэхүүний экспортыг оруулна.'
            : inventory.kind === 'erp' && inventory.date >= range.from ? `${inventory.date}-ны экспорт.`
            : `Одоо ${inventory.date}-ны ${inventory.kind === 'erp' ? 'экспорт' : 'байрны бүртгэл'} харагдана — шинэчилнэ.`,
    });

    // 3. Уулзалт.
    const meetings = sales?.meetings?.completed ?? null;
    steps.push({
        id: 'meetings', title: 'Болсон уулзалтуудыг бүртгэх', href: '/dashboard/viewings',
        status: meetings ? 'done' : 'warn',
        detail: meetings ? `${meetings} уулзалт бүртгэгдсэн.` : 'Энэ долоо хоногт болсон уулзалт бүртгэгдээгүй — уулзалт бүрийг «Болсон» болгоно.',
    });

    // 4. Өдрийн тайлан (дуудлага, чат) — тоо нь хуудсанд ачаалагдаагүй тул шалгах алхам.
    steps.push({ id: 'daily-report', title: 'Өдрийн тайлангаа 7 хоног бөглөх', href: '/dashboard/daily-report', status: 'check',
        detail: 'Дуудлага, чатын тоог өдөр бүр оруулсан эсэхийг шалгана.' });

    // 5. Лидийн дараалал.
    const health = sales?.leads.health;
    const issues = health ? health.ownerless + health.overdue : null;
    steps.push({
        id: 'leads', title: 'Эзэнгүй, хугацаа хэтэрсэн лидийг цэгцлэх', href: '/dashboard/leads?queue=unassigned',
        status: issues === null ? 'check' : issues ? 'warn' : 'done',
        detail: !health ? 'Лидийн мэдээлэл ачаалагдаагүй.' : issues ? `Эзэнгүй ${health.ownerless}, хугацаа хэтэрсэн ${health.overdue} лид.` : 'Эзэнгүй, хэтэрсэн лид алга.',
    });

    // 6. Сарын төлөвлөгөө.
    const target = sales?.monthlyPerformance?.months?.[0]?.target_amount ?? weekly?.month.target ?? null;
    steps.push({
        id: 'plan', title: 'Сарын борлуулалтын төлөвлөгөө оруулах', href: '/admin/sales-targets',
        status: target ? 'done' : 'todo',
        detail: target ? 'Сарын төлөвлөгөө оруулсан.' : 'Сарын гэрээний төлөвлөгөө оруулаагүй — гүйцэтгэлийн хувь гарахгүй.',
    });

    // 7. Менежерүүдийн 7 хоногийн мэдээ.
    const written = (input.updates ?? []).filter(update => updatePart(update) === 'sales').length;
    steps.push({ id: 'updates', title: 'Хийсэн ажил, саадаа бичих', href: '#weekly-update', status: written ? 'done' : 'todo',
        detail: written ? `${written} хүн бичсэн.` : 'Баруун талын «Миний шинэчлэл» хэсэгт хийсэн ажил, саад, дараагийн алхмаа бичнэ.' });

    // 8. Нэмэлт слайд (хүлээлцсэн байдал, яригдаж буй гэрээ).
    const extra = (input.slides ?? []).filter(slide => slide.part === 'sales').length;
    steps.push({ id: 'extra', title: 'Нэмэлт слайд (хүлээлцсэн байдал, яригдаж буй гэрээ)', href: '#weekly-slides-sales', optional: true,
        status: extra ? 'done' : 'check', detail: extra ? `${extra} слайд нэмсэн.` : 'Шаардлагатай бол зураг, тайлбартай слайд нэмнэ.' });
    return steps;
}

export function marketingChecklist(input: MeetingChecklistInput): ChecklistStep[] {
    const { range, contentPlan, social, channels } = input;
    const steps: ChecklistStep[] = [];
    const week = contentPlan?.week;

    // 1. Контент төлөвлөгөө.
    steps.push({
        id: 'content-plan', title: 'Энэ долоо хоногийн контентыг төлөвлөгөөнд оруулах', href: '/marketing/calendar',
        status: week?.planned ? 'done' : 'todo',
        detail: week?.planned ? `${week.planned} контент төлөвлөсөн.` : 'Пост, reel, story бүрийг огноо, хариуцагчтай нь Контент календарьт оруулна.',
    });

    // 2. Төлөв шинэчлэх.
    steps.push({
        id: 'content-status', title: 'Нийтэлсэн контентын төлөвийг шинэчлэх', href: '/marketing/calendar',
        status: !week?.planned ? 'todo' : week.overdue ? 'warn' : 'done',
        detail: !week?.planned ? 'Эхлээд төлөвлөгөөгөө оруулна.' : week.overdue ? `Хоцорсон ${week.overdue} контент — нийтэлсэн бол «Нийтэлсэн», үгүй бол шинэ огноо эсвэл цуцлах.` : `${week.published}/${week.planned} нийтэлсэн${week.pct === null ? '' : ` (${week.pct}%)`}.`,
    });

    // 3. Постер, зураг.
    const published = week?.items.filter(item => item.status === 'published' || item.status === 'ready') ?? [];
    const withoutImage = published.filter(item => !item.image_paths.length).length;
    steps.push({
        id: 'posters', title: 'Нийтэлсэн контентод постер, зураг хавсаргах', href: '/marketing/calendar',
        status: !published.length ? 'todo' : withoutImage ? 'warn' : 'done',
        detail: !published.length ? 'Нийтэлсэн контент алга.' : withoutImage ? `${withoutImage} контент зураггүй — слайдад постергүй гарна.` : 'Бүх нийтэлсэн контент зурагтай.',
    });

    // 4. Facebook хуудас (автомат).
    const fresh = social?.syncedTo ? social.syncedTo >= shift(range.to, -2) : false;
    steps.push({
        id: 'facebook', title: 'Facebook хуудас холбох, синк шалгах', href: '/marketing/social',
        status: !social?.page ? 'todo' : fresh ? 'done' : 'warn',
        detail: !social?.page ? 'Хуудас холбогдоогүй — холбовол үзүүлэлт дэлгэцийн зураггүйгээр слайдад орно.'
            : fresh ? `${social.page.name ?? 'Хуудас'} — ${social.syncedTo} хүртэл синк хийгдсэн.` : `Сүүлийн синк ${social.syncedTo ?? 'хийгдээгүй'} — Сошиал хуудсанд «Шинэчлэх».`,
    });

    // 5. Сувгийн экспорт.
    const missing = channels ? MANUAL_CHANNELS.filter(source => !channels[source]?.report) : MANUAL_CHANNELS;
    steps.push({
        id: 'channels', title: 'Сувгийн экспорт оруулах (Meta Ads, CallPro, SMS)', href: '/marketing/channel-reports',
        status: !missing.length ? 'done' : missing.length < MANUAL_CHANNELS.length ? 'warn' : 'todo',
        detail: !missing.length ? 'Бүх сувгийн экспорт орсон.' : `Оруулаагүй: ${missing.map(source => CHANNEL_SOURCE_LABELS[source]).join(', ')}.`,
    });

    // 6. Зардал.
    const spend = input.marketing?.totals;
    steps.push({ id: 'spend', title: 'Энэ долоо хоногийн зардлаа бүртгэх', href: '/marketing/budget', status: spend?.hasSpend ? 'done' : 'check',
        detail: spend?.hasSpend ? 'Зардал бүртгэсэн.' : 'Зардал бүртгэгдээгүй — зарцуулсан бол Төсөв хэсэгт оруулна.' });

    // 7. Дэлгэцийн зураг, нэмэлт слайд.
    const extra = (input.slides ?? []).filter(slide => slide.part === 'marketing').length;
    steps.push({ id: 'extra', title: 'Дэлгэцийн зураг (Ads Manager, ManyChat, сэжим хуудас)', href: '#weekly-slides-marketing', optional: true,
        status: extra ? 'done' : 'check', detail: extra ? `${extra} слайд нэмсэн.` : 'Hub-д автоматаар ордоггүй сувгийн зургийг Ctrl+V-ээр буулгаж нэмнэ.' });

    // 8. Дараагийн 7 хоног.
    const next = contentPlan?.next;
    steps.push({ id: 'next-week', title: 'Дараагийн 7 хоногийн контентыг төлөвлөх', href: '/marketing/calendar',
        status: next?.planned ? 'done' : 'todo', detail: next?.planned ? `${next.planned} контент төлөвлөсөн.` : 'Хурал дээр танилцуулах дараагийн долоо хоногийн төлөвлөгөө алга.' });

    // 9. Багийн мэдээ.
    const written = (input.updates ?? []).filter(update => updatePart(update) === 'marketing').length;
    steps.push({ id: 'updates', title: 'Хийсэн ажил, саадаа бичих', href: '#weekly-update', status: written ? 'done' : 'todo',
        detail: written ? `${written} хүн бичсэн.` : 'Баруун талын «Миний шинэчлэл» хэсэгт бичнэ.' });
    return steps;
}

/** Заавал алхмаас хэд нь бэлэн. */
export function checklistProgress(steps: ChecklistStep[]): { done: number; total: number } {
    const required = steps.filter(step => !step.optional);
    return { done: required.filter(step => step.status === 'done').length, total: required.length };
}
