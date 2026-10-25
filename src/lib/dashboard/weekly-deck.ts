import type PptxGenJS from 'pptxgenjs';
import type { OperationsReport } from './operations-report';
import { floorTone, type FloorCell, type FloorTone, type WeeklySalesReport } from './weekly-sales';
import { arialWidth } from './arial-metrics';
import type { WeeklyContentPlan, WeeklyUpdate } from './weekly-review';
import { formatReviewChange, updatePart } from './weekly-review';
import { knownPeriodAmount, periodContractAmount, periodContractCount, undatedContractsHint, undatedContractsShort } from './contract-dates';
import { WEEKLY_SLIDE_PART_LABEL, WEEKLY_SLIDE_SECTION_LABEL, type WeeklySlide } from './weekly-slides';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import { planValueText, type PlanResolvedValue } from '@/lib/sales/plan-performance';
import type { BudgetOverview } from '@/lib/marketing/budget';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import { CHANNEL_SOURCE_LABELS, CHANNEL_SOURCES, channelKeyMetrics, channelMetric, type ChannelSource } from '@/lib/marketing/channel-reports';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, contentPlatformLabel, type ContentItem, type ContentPlanSummary } from '@/lib/marketing/content-plan';
import type { SocialWeek, SocialWeekMetric } from '@/lib/marketing/social-week';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { ubDateStr } from '@/lib/utils/date';

/**
 * Лхагва гарагийн хурлын тайланг PowerPoint (.pptx) болгоно — хурлыг слайдаар явуулдаг тул.
 * Борлуулалт, маркетинг хоёр тусдаа файл: маркетингийн алба контент бүтээж, өөрийн төлөвлөгөөгөөр
 * ажилладаг тул маркетингийн слайд лид, гэрээгээр биш контент төлөвлөгөөний гүйцэтгэл, нийтэлсэн
 * контент (постертой), Facebook хуудасны органик үзүүлэлт, сувгийн үзүүлэлт, төсөв, дараагийн 7 хоногийн
 * төлөвлөгөөгөөр бүрдэнэ.
 * Лидийн эх сурвалж, хөрвөлт борлуулалтын слайдад орно.
 * Цэвэр функц: өгөгдөл (хуудасны ачаалсан, эрхээр шүүгдсэн тайлангууд) + зураг → слайдууд.
 * Хөтөч (lib/dashboard/weekly-deck-export.ts) болон тест хоёулаа ашиглана.
 *
 * Дүрэм нь хуудастай ижил: хоосон дүнг 0 гэж бичихгүй («—»), гэрээний дүн, мөнгөн орлого,
 * зардлыг холихгүй, эх сурвалж ба хязгаарлалтыг слайдын тэмдэглэлд (notes) бичнэ.
 */
export interface DeckImage { data: string; width: number; height: number }

export type WeeklyDeckKind = 'sales' | 'marketing';
/** Татах файлын төрөл: борлуулалт, маркетинг ба борлуулалтын албаны загвар (`team-deck.ts`, W2). */
export type WeeklyDeckFileKind = WeeklyDeckKind | 'sales-team';
export const WEEKLY_DECK_LABEL: Record<WeeklyDeckFileKind, string> = { sales: 'Борлуулалт', marketing: 'Маркетинг', 'sales-team': 'Борлуулалт (албаны загвар)' };

export interface WeeklyDeckInput {
    kind: WeeklyDeckKind;
    projectName: string;
    meetingDate: string;
    range: { from: string; to: string };
    previousRange: { from: string; to: string };
    /** «2026.10.13 14:05» — хэзээ бэлтгэсэн. */
    generatedAt: string;
    discussion: { title: string; detail: string; part?: WeeklyDeckKind }[];
    notices: string[];
    sales?: OperationsReport;
    previousSales?: OperationsReport;
    /** Тухайн сарын бүтэн хугацааны тайлан — сарын төлөвлөгөө, гүйцэтгэл (удирдлагын оруулсан). */
    monthSales?: OperationsReport;
    weeklySales?: WeeklySalesReport;
    marketing?: MarketingPerformance;
    budget?: { year: number; month: number; overview: BudgetOverview } | null;
    channels?: ChannelReportMatches | null;
    /** Маркетингийн контент төлөвлөгөө: тайлант долоо хоног ба дараагийн 7 хоног. */
    contentPlan?: WeeklyContentPlan;
    /** Facebook хуудасны хадгалсан органик үзүүлэлт ба тухайн долоо хоногийн постууд. */
    social?: SocialWeek | null;
    slides: WeeklySlide[];
    /** Зургийн зам (слайд, контент) → `image/jpeg;base64,...` ба хэмжээ. Ачаалж чадаагүй зураг байхгүй байж болно. */
    images: Record<string, DeckImage>;
    updates?: WeeklyUpdate[];
}

/*
 * Доорх хэмжээ, өнгө, формат, слайдын туслахыг багийн загварын илтгэл (`team-deck.ts`) хуваалцана —
 * хуулбарлахгүй, нэг загвар (Arial, Hub-ийн өнгө, LAYOUT_WIDE 13.333×7.5).
 */
export const W = 13.333;
export const H = 7.5;
export const M = 0.6;
export const CW = W - M * 2;
export const FONT = 'Arial';
export const C = {
    ink: '12151C', ink2: '3A404C', muted: '5C6474', line: 'E3E6EB', surface: 'F0F2F5', white: 'FFFFFF',
    brand: '2D5FDD', brandSoft: 'EBF0FD', navy: '0E1A3A', navy2: 'A9B8E8',
    success: '13784A', successSoft: 'E5F5EC', pending: '9A5A00', pendingSoft: 'FDF2DF',
    danger: 'C0362C', dangerSoft: 'FCEBE9', neutralSoft: 'E6E9EE', gold: 'A9823F',
} as const;
export const CONTENT = 'VH_CONTENT';
export const COVER = 'VH_COVER';
export const TOP = 1.7;
export const BOTTOM = 6.85;

export const dot = (date: string) => date.replaceAll('-', '.');
const span = (range: { from: string; to: string }) => `${dot(range.from)} – ${dot(range.to)}`;
export const count = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toLocaleString('en-US');
const pct = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value}%`;
export const area = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const money = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatMNT(value);
const short = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatMNTShort(value);
export const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
export const managerShort = (name: string | null) => name?.split('.')[0]?.trim() || '—';

type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;

/** Нүүр (хар хөх) ба агуулгын мастер; агуулгын слайдын хөлд `footer` бичвэр ба слайдын дугаар. */
export function defineLayouts(pres: PptxGenJS, footer: string) {
    pres.defineSlideMaster({ title: COVER, background: { color: C.navy } });
    pres.defineSlideMaster({
        title: CONTENT,
        background: { color: C.white },
        objects: [
            { text: { text: footer, options: { x: M, y: 7.02, w: 8, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 } } },
        ],
        slideNumber: { x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, align: 'right' },
    });
}

export function header(slide: Slide, kicker: string, title: string, subtitle?: string) {
    slide.addText(kicker.toUpperCase(), { x: M, y: 0.38, w: CW, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: C.brand, charSpacing: 1, margin: 0, isTextBox: true });
    slide.addText(title, { x: M, y: 0.68, w: CW, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: C.ink, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    if (subtitle) slide.addText(subtitle, { x: M, y: 1.28, w: CW, h: 0.3, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0, isTextBox: true });
}

export function content(pres: PptxGenJS, kicker: string, title: string, subtitle?: string): Slide {
    const slide = pres.addSlide({ masterName: CONTENT });
    header(slide, kicker, title, subtitle);
    return slide;
}

export function note(slide: Slide, lines: (string | false | null | undefined)[]) {
    const text = lines.filter(Boolean).join('\n');
    if (text) slide.addNotes(text);
}

/** Тоон карт: шошго, том тоо, доор тайлбар. */
export function stat(slide: Slide, x: number, y: number, w: number, h: number, label: string, value: string, helper?: string, tone?: 'danger' | 'gold') {
    slide.addShape('roundRect', { x, y, w, h, fill: { color: C.surface }, line: { color: C.surface }, rectRadius: 0.08 });
    slide.addText(label, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted, margin: 0, isTextBox: true });
    slide.addText(value, { x: x + 0.22, y: y + 0.46, w: w - 0.44, h: 0.62, fontFace: FONT, fontSize: value.length > 14 ? 20 : 26, bold: true, color: tone === 'danger' ? C.danger : tone === 'gold' ? C.gold : C.ink, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    if (helper) slide.addText(helper, { x: x + 0.22, y: y + 1.08, w: w - 0.44, h: Math.max(0.3, h - 1.2), fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, valign: 'top', isTextBox: true });
}

export function statRow(slide: Slide, y: number, items: { label: string; value: string; helper?: string; tone?: 'danger' | 'gold' }[], h = 1.55) {
    const gap = 0.25;
    const w = (CW - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => stat(slide, M + index * (w + gap), y, w, h, item.label, item.value, item.helper, item.tone));
}

export const headCell = (text: string, align: 'left' | 'right' | 'center' = 'left'): Cell => ({ text, options: { bold: true, color: C.muted, fill: { color: C.surface }, align } });
export const bodyCell = (text: string, align: 'left' | 'right' | 'center' = 'left', extra: PptxGenJS.TableCellProps = {}): Cell => ({ text, options: { color: C.ink, align, ...extra } });

/** Хүснэгтийг шаардлагатай бол хэд хэдэн слайдад хуваана (гарчигт «1/2»). */
export function tableSlides(pres: PptxGenJS, opts: {
    kicker: string; title: string; subtitle?: string; head: Cell[]; rows: Cell[][]; footer?: Cell[];
    colW: number[]; perSlide: number; fontSize?: number; notes?: string[];
}) {
    const pages = Math.max(1, Math.ceil(opts.rows.length / opts.perSlide));
    for (let page = 0; page < pages; page++) {
        const slide = content(pres, opts.kicker, pages > 1 ? `${opts.title} (${page + 1}/${pages})` : opts.title, opts.subtitle);
        const rows = opts.rows.slice(page * opts.perSlide, (page + 1) * opts.perSlide);
        const last = page === pages - 1;
        slide.addTable([opts.head, ...rows, ...(last && opts.footer ? [opts.footer] : [])], {
            x: M, y: opts.subtitle ? TOP : TOP - 0.2, w: CW, colW: opts.colW, fontFace: FONT, fontSize: opts.fontSize ?? 11,
            border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08], autoPage: false,
        });
        note(slide, opts.notes ?? []);
    }
}

function coverSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const slide = pres.addSlide({ masterName: COVER });
    slide.addText(input.kind === 'marketing' ? 'МАРКЕТИНГИЙН АЛБА · ЛХАГВА ГАРАГИЙН ХУРАЛ' : 'БОРЛУУЛАЛТЫН АЛБА · ЛХАГВА ГАРАГИЙН ХУРАЛ', { x: M + 0.2, y: 1.6, w: CW - 0.4, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.navy2, charSpacing: 2, margin: 0, isTextBox: true });
    slide.addText(input.projectName, { x: M + 0.2, y: 2.1, w: CW - 0.4, h: 1.3, fontFace: FONT, fontSize: 44, bold: true, color: C.white, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    slide.addText(input.kind === 'marketing' ? 'Контент төлөвлөгөө ба гүйцэтгэл, долоо хоногийн тайлан' : 'Долоо хоногийн борлуулалтын тайлан', { x: M + 0.2, y: 3.45, w: CW - 0.4, h: 0.5, fontFace: FONT, fontSize: 20, color: C.white, margin: 0, isTextBox: true });
    slide.addText([
        { text: `Тайлант хугацаа: ${span(input.range)}`, options: { breakLine: true } },
        { text: `Хурал: ${dot(input.meetingDate)} · Харьцуулалт: ${span(input.previousRange)}` },
    ], { x: M + 0.2, y: 4.35, w: CW - 0.4, h: 0.8, fontFace: FONT, fontSize: 14, color: C.navy2, margin: 0, valign: 'top', isTextBox: true });
    slide.addText(`Vertmon Hub-аас бэлтгэв · ${input.generatedAt} · Улаанбаатарын цагаар`, { x: M + 0.2, y: 6.7, w: CW - 0.4, h: 0.3, fontFace: FONT, fontSize: 10, color: C.navy2, margin: 0, isTextBox: true });
    note(slide, input.notices);
}

function discussionSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const all = input.discussion.filter(item => (item.part ?? 'sales') === input.kind);
    const items = all.slice(0, 7);
    const slide = content(pres, WEEKLY_DECK_LABEL[input.kind], 'Энэ хурлаар шийдэх');
    if (!items.length) {
        slide.addText('Хадгалсан мэдээллээс хэлэлцэх асуудал илрээгүй.', { x: M, y: TOP, w: CW, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
    } else {
        const rowH = Math.min(0.95, (BOTTOM - TOP + 0.15) / items.length);
        items.forEach((item, index) => {
            const y = TOP - 0.15 + index * rowH;
            slide.addShape('ellipse', { x: M, y: y + 0.04, w: 0.42, h: 0.42, fill: { color: C.brandSoft }, line: { color: C.brandSoft } });
            slide.addText(String(index + 1), { x: M, y: y + 0.04, w: 0.42, h: 0.42, fontFace: FONT, fontSize: 14, bold: true, color: C.brand, align: 'center', valign: 'middle', margin: 0, isTextBox: true });
            slide.addText([
                { text: item.title, options: { bold: true, fontSize: 16, color: C.ink, breakLine: true } },
                { text: clip(item.detail.replace(/\s+/g, ' '), 240), options: { fontSize: 13, color: C.ink2 } },
            ], { x: M + 0.65, y, w: CW - 0.65, h: rowH - 0.08, fontFace: FONT, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true });
        });
    }
    note(slide, [all.length > items.length ? `Бусад ${all.length - items.length} асуудал хуудсанд байна.` : null, input.kind === 'sales' ? 'Лидийн ажлын дараалал нь одоогийн төлөв. Ангиллууд давхцаж болно.' : null]);
}

function salesOverviewSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const sales = input.sales;
    if (!sales) return;
    const prev = input.previousSales;
    const slide = content(pres, 'Борлуулалт', 'Борлуулалтын тойм', `${span(input.range)} · өмнөх 7 хоногтой харьцуулав`);
    const undated = sales.contracts.undatedCount;
    statRow(slide, TOP, [
        { label: 'Шинэ лид', value: count(sales.leads.newCount), helper: formatReviewChange(sales.leads.newCount, prev?.leads.newCount) },
        { label: 'Байгуулсан гэрээ', value: periodContractCount(sales.contracts.count, undated), helper: undated ? undatedContractsShort(undated) : formatReviewChange(sales.contracts.count, prev?.contracts.count) },
        { label: 'Гэрээний бүртгэлтэй дүн', value: periodContractAmount(sales.contracts.value, sales.contracts.count, undated, short),
            helper: undated ? 'Огноогүй гэрээ дүнд ороогүй' : prev ? `Өмнөх ${short(prev.contracts.value)}${prev.contracts.missingAmounts ? ' · дүн дутуу' : ''}` : 'Өмнөх хугацааны мэдээлэл байхгүй' },
        { label: 'Болсон уулзалт', value: count(sales.meetings?.completed), helper: sales.meetings ? formatReviewChange(sales.meetings.completed, prev?.meetings?.completed) : 'Уулзалтын мэдээлэл байхгүй' },
    ]);
    const meetings = sales.meetings;
    const classified = !!meetings?.classificationAvailable;
    statRow(slide, TOP + 1.85, [
        { label: 'Шинэ харилцагчтай уулзалт', value: classified ? count(meetings!.newCustomer) : '—' },
        { label: 'Давтан уулзалт', value: classified ? count(meetings!.repeatCustomer) : '—' },
        { label: 'Гэрээтэй захиалагч', value: classified ? count(meetings!.existingBuyer) : '—' },
        { label: 'Эзэнгүй / алхамгүй / хэтэрсэн лид', value: `${sales.leads.health.ownerless} / ${sales.leads.health.noNextStep} / ${sales.leads.health.overdue}`, helper: 'Одоогийн ажлын дараалал; давхцаж болно', tone: sales.leads.health.overdue ? 'danger' : undefined },
    ], 1.6);
    const products = sales.contracts.byProduct ?? [];
    if (products.length) {
        slide.addText(products.map(product => `${product.label} ${product.count} · ${short(product.value)}${product.missingAmounts ? ` (дүн дутуу ${product.missingAmounts})` : ''}`).join('   ·   '),
            { x: M, y: TOP + 3.75, w: CW, h: 0.4, fontFace: FONT, fontSize: 12, color: C.ink2, margin: 0, isTextBox: true });
    }
    note(slide, [
        'Гэрээний дүн нь мөнгөөр орсон орлогоос тусдаа.',
        sales.cash ? `Мөнгөөр орсон бүртгэл: ${money(sales.cash.receipts)} (${sales.cash.receiptCount} гүйлгээ). Банкны хуулгатай тулгаагүй.` : 'Мөнгөн орлогыг санхүүгийн эрхтэй хүн харна.',
        meetings?.basis,
        !classified ? 'Уулзалтын төрлийн ангилал системд хараахан нэвтрээгүй.' : null,
        sales.contracts.missingAmounts ? `Дүн дутуу ${sales.contracts.missingAmounts} гэрээ.` : null,
        undated ? undatedContractsHint(undated) : null,
    ]);
}

/** Сарын төлөвлөгөө ба удирдлагын баталгаажуулсан гүйцэтгэл (гэрээний тоо, дүн, орсон мөнгө). */
function monthPlanSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const month = input.monthSales?.monthlyPerformance?.months?.[0];
    const weekly = input.weeklySales;
    if (!month && !weekly) return;
    const label = `${Number((weekly?.month.month ?? input.range.to).slice(5, 7))}-р сар`;
    const slide = content(pres, 'Борлуулалт', `${label}ын төлөвлөгөө ба гүйцэтгэл`, 'Төлөвлөгөө, баталгаажуулсан гүйцэтгэлийг удирдлага оруулна. Хоосон бол тооцоогүй.');
    const ratio = (actual: number | null | undefined, target: number | null | undefined) => actual === null || actual === undefined || !target ? '—' : `${Math.round(actual / target * 100)}%`;
    // Сарын (үйл ажиллагааны) тайлан байвал гэрээний тоо, дүн «Төлөвлөгөөний биелэлт»-ийн M1 дүрмээр (гараар оруулсан блок
    // давамгайлна, бусад блок систем) — хадгалсан мөрийн нийтийг (оруулсан блокуудын нийлбэр) бүтэн сар гэж үзэхгүй.
    // Үгүй бол долоо хоногийн тайлангийн гэрээний бүртгэл.
    const resolved = month?.resolved;
    const resolvedHelper = (value: PlanResolvedValue) => value.value === null ? (value.lowerBound ? 'Огноогүй гэрээтэй — тодорхойгүй' : undefined)
        : value.source === 'manual' ? 'Удирдлагын баталгаажуулсан' : value.source === 'mixed' ? 'Холимог: гар + CRM' : 'CRM-ийн гэрээ';
    const resolvedPct = (value: PlanResolvedValue, target: number | null) => value.value === null || !target ? '—'
        : `${Math.round(value.value / target * 100)}%${value.lowerBound ? '+' : ''}`;
    // Орсон мөнгө M1 дүрмээр (блок = гараар оруулсан нүд; оруулаагүй блоктой бол «+»). Хуучин хариунд resolvedCash алга бол хадгалсан нийт.
    const cashResolved: PlanResolvedValue | null = month ? month.resolvedCash ?? (month.manual_cashflow_actual_amount === null ? null
        : { value: month.manual_cashflow_actual_amount, lowerBound: false, source: 'manual' }) : null;
    const cashActual = cashResolved?.value ?? null;
    // Төлөвлөгөөнд хамаарах огноогүй гэрээ л төлөвлөгөөтэй харьцуулсан дүнг бүрэн бус болгоно (Агуулах г.м. биш).
    const undated = weekly?.sources.undatedPlanContracts ?? 0;
    // Удирдлагын баталгаажуулсан дүн байхгүй бол гэрээний бүртгэл — зөвхөн төлөвлөгөөнд хамаарах (Б1/Б2/Зогсоол) гэрээ;
    // огноогүй гэрээтэй бол бүрэн биш («N+» эсвэл «—»).
    const planCount = weekly ? weekly.month.planCount ?? weekly.month.count : 0;
    const planTotal = weekly ? weekly.month.planTotal ?? weekly.month.total : 0;
    const outside = weekly?.month.outsidePlanCount ?? 0;
    const recorded = weekly ? knownPeriodAmount(planTotal, planCount, undated) : null;
    const contractTarget = month?.target_amount ?? weekly?.month.target ?? null;
    const countTarget = month?.contract_count_target ?? null;
    const recordedCount = weekly ? knownPeriodAmount(planCount, planCount, undated) : null;
    const source = weekly?.sources.contracts === 'erp' ? 'ERP' : 'CRM';
    // Гурван мөр картыг BOTTOM-оос дээш багтаана.
    const rowH = 1.5, rowStep = rowH + 0.15;
    statRow(slide, TOP, [
        { label: 'Гэрээний тооны төлөвлөгөө', value: countTarget === null ? '—' : countTarget.toLocaleString('en-US'), tone: 'gold' },
        resolved
            ? { label: 'Гэрээний тооны гүйцэтгэл', value: planValueText(resolved.count.value, resolved.count.lowerBound, value => value.toLocaleString('en-US')), helper: resolvedHelper(resolved.count) }
            : { label: 'Гэрээний тооны гүйцэтгэл', value: weekly ? periodContractCount(planCount, undated) : '—',
                helper: weekly ? (undated ? undatedContractsShort(undated) : `${source}-ийн гэрээ`) : undefined },
        { label: 'Гүйцэтгэлийн хувь', value: resolved ? resolvedPct(resolved.count, countTarget)
            : `${ratio(recordedCount, countTarget)}${undated && recordedCount !== null && countTarget ? '+' : ''}` },
    ], rowH);
    statRow(slide, TOP + rowStep, [
        { label: 'Гэрээний төлөвлөгөө', value: short(contractTarget), tone: 'gold' },
        resolved
            ? { label: 'Гэрээний гүйцэтгэл', value: planValueText(resolved.contract.value, resolved.contract.lowerBound, short), helper: resolvedHelper(resolved.contract) }
            : { label: 'Гэрээний гүйцэтгэл', value: weekly ? periodContractAmount(planTotal, planCount, undated, short) : '—',
                helper: weekly ? (undated ? undatedContractsShort(undated) : `${source}-ийн гэрээ, ${planCount} ш`) : undefined },
        { label: 'Гүйцэтгэлийн хувь', value: resolved ? resolvedPct(resolved.contract, contractTarget)
            : `${ratio(recorded, contractTarget)}${undated && recorded !== null && contractTarget ? '+' : ''}` },
    ], rowH);
    const cashVisible = !!input.monthSales?.monthlyPerformance?.cashflowVisible;
    statRow(slide, TOP + rowStep * 2, cashVisible ? [
        { label: 'Орсон мөнгөний төлөвлөгөө', value: short(month?.cashflow_target_amount ?? null), tone: 'gold' },
        { label: 'Орсон мөнгөний гүйцэтгэл', value: cashActual !== null ? `${short(cashActual)}${cashResolved?.lowerBound ? '+' : ''}` : short(weekly?.cash?.delta ?? null),
            helper: cashActual !== null ? (cashResolved?.lowerBound ? 'Удирдлагын оруулсан блокууд — бусад блок оруулаагүй' : 'Удирдлагын баталгаажуулсан')
                : weekly?.cash ? `ERP зөрүү ${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : undefined },
        // ERP-ийн зөрүү хоёр snapshot-ын хоорондох (ихэвчлэн долоо хоног) мөнгө — сарын төлөвлөгөөтэй харьцуулахгүй.
        { label: 'Гүйцэтгэлийн хувь', value: `${ratio(cashActual, month?.cashflow_target_amount ?? null)}${cashResolved?.lowerBound && cashActual !== null && month?.cashflow_target_amount ? '+' : ''}` },
    ] : [
        { label: 'Мөнгөн орлого (ERP)', value: short(weekly?.cash?.delta ?? null), helper: weekly?.cash ? `${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : 'Хоёр долоо хоногийн ERP экспорт хэрэгтэй' },
        { label: 'Төлбөрийн хоцролт', value: short(weekly?.receivables?.overdue ?? null), helper: weekly?.receivables ? `${weekly.receivables.overdueContracts} гэрээ · үлдэгдэл ${short(weekly.receivables.balance)}` : 'ERP гэрээний экспорт хэрэгтэй', tone: weekly?.receivables?.overdue ? 'danger' : undefined },
    ], rowH);
    note(slide, [
        weekly?.cash?.basis,
        cashVisible ? null : 'Орсон мөнгөний төлөвлөгөө, гүйцэтгэлийг санхүүгийн эрхтэй хүн харна.',
        'Гэрээний дүн, мөнгөн орлого, бартерыг холихгүй.',
        cashActual === null && weekly?.cash ? 'ERP-ийн төлсөн дүнгийн зөрүүг сарын орсон мөнгөний төлөвлөгөөтэй харьцуулж хувь гаргаагүй.' : null,
        (!resolved || resolved.contract.source !== 'manual' || resolved.count.source !== 'manual') && outside ? `Төлөвлөгөөнд хамаарахгүй ${outside} гэрээ (Агуулах, Үйлчилгээ г.м.) гүйцэтгэлд ороогүй.` : null,
        (resolved ? resolved.contract.lowerBound || resolved.count.lowerBound : undated > 0)
            ? (undated ? undatedContractsHint(undated) : '«+» — огноогүй гэрээ байгаа тул доод хязгаар; тухайн сард гэрээгүй бол «—».') : null,
    ]);
}

/** Хүснэгтийн хөлийн нийлбэр: бүгд тодорхойгүй бол «—», зарим нь бол мэдэгдэхийн нийлбэр «+» — хоосныг 0 гэж нэмэхгүй. */
export function footerSum(values: Array<number | null>): string {
    const known = values.filter((value): value is number => value !== null);
    if (!known.length) return values.length ? '—' : money(0);
    const total = money(known.reduce((sum, value) => sum + value, 0));
    return known.length < values.length ? `${total}+` : total;
}

function contractSlides(pres: PptxGenJS, report: WeeklySalesReport) {
    const head = ['Огноо', 'Бүтээгдэхүүн', 'Блок', 'Тоот', 'Захиалагч', 'м²', 'Нийт үнэ', 'Урьдчилгаа', 'Төлсөн', 'Менежер', 'Суваг']
        .map((text, index) => headCell(text, index >= 5 && index <= 8 ? 'right' : 'left'));
    const rows = report.week.lines.map(line => [
        bodyCell(line.date ? dot(line.date.slice(5)) : '—'), bodyCell(line.kindLabel), bodyCell(line.block ?? '—'), bodyCell(line.unit ?? '—'),
        bodyCell(line.customer ? clip(line.customer, 26) : '—'), bodyCell(area(line.area), 'right'), bodyCell(money(line.total), 'right'),
        bodyCell(`${money(line.advance)}${line.advanceCondition ? `\n${line.advanceCondition}` : ''}`, 'right'), bodyCell(money(line.paid), 'right'),
        bodyCell(managerShort(line.manager)), bodyCell(line.channel ? clip(line.channel, 14) : '—'),
    ]);
    const footer = [bodyCell('Нийт', 'left', { bold: true, colspan: 6 }), bodyCell(money(report.week.total), 'right', { bold: true }),
        bodyCell(footerSum(report.week.lines.map(line => line.advance)), 'right', { bold: true }),
        bodyCell(footerSum(report.week.lines.map(line => line.paid)), 'right', { bold: true }), bodyCell(''), bodyCell('')];
    const undated = report.sources.undatedContracts;
    if (!rows.length) {
        const slide = content(pres, 'Борлуулалт', 'Энэ долоо хоногийн гэрээ', span(report.range));
        slide.addText(undated ? `Гэрээний тоо тодорхойгүй. ${undatedContractsHint(undated)}` : 'Тайлант долоо хоногт гэрээ бүртгэгдээгүй.', { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, valign: 'top', isTextBox: true });
        return;
    }
    tableSlides(pres, {
        kicker: 'Борлуулалт', title: 'Энэ долоо хоногийн гэрээ',
        subtitle: `${span(report.range)} · ${report.week.byKind.map(kind => `${kind.label} ${kind.count}`).join(' · ')}${report.week.barter ? ` · бартер ${report.week.barter}` : ''}`,
        head, rows, footer, colW: [0.7, 1.15, 0.8, 0.75, 2.0, 0.65, 1.45, 1.4, 1.35, 1.0, 0.88], perSlide: 11, fontSize: 10,
        notes: ['Захиалагчийн нэрийг зөвхөн гэрээний эрхтэй хэрэглэгч харна; регистрийн дугаар гаргахгүй.', 'Хоосон дүнг 0 гэж тооцоогүй («—»).', undated ? undatedContractsHint(undated) : ''].filter(Boolean),
    });
}

function monthSlide(pres: PptxGenJS, report: WeeklySalesReport) {
    const m = report.month;
    const undated = report.sources.undatedContracts;
    const undatedPlan = report.sources.undatedPlanContracts;
    const total = periodContractAmount(m.total, m.count, undated, short);
    // Төлөвлөгөөтэй харьцуулах дүн — зөвхөн төлөвлөгөөнд хамаарах гэрээ (хувьтай нэг суурь).
    const planned = periodContractAmount(m.planTotal ?? m.total, m.planCount ?? m.count, undatedPlan, short);
    const subtitle = m.target ? `${planned} / төлөвлөгөө ${short(m.target)} · ${m.attainmentPct === null ? '—' : `${m.attainmentPct}%${undatedPlan ? '+' : ''}`}${m.outsidePlanCount ? ` · төлөвлөгөөгүй ${m.outsidePlanCount} гэрээ хассан` : ''}` : `${total} · сарын төлөвлөгөө тохируулаагүй`;
    const slide = content(pres, 'Борлуулалт', `${Number(m.month.slice(5))}-р сарын гэрээ долоо хоногоор`, subtitle);
    if (!m.byWeek.length) {
        slide.addText(undated ? `Сарын гэрээний тоо тодорхойгүй. ${undatedContractsHint(undated)}` : 'Энэ сард гэрээ бүртгэгдээгүй.', { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, valign: 'top', isTextBox: true });
        return;
    }
    const weekW = Math.min(1.6, (CW - 2.2 - 1.2 - 1.9) / m.weeks.length);
    const head = [headCell('Бүтээгдэхүүн'), ...m.weeks.map(week => headCell(`${week.label}\n${dot(week.from.slice(5))}–${dot(week.to.slice(5))}`, 'center')), headCell('Сарын нийт', 'right'), headCell('Дүн', 'right')];
    const rows = m.byWeek.map(row => [bodyCell(row.label, 'left', { bold: true }), ...row.weeks.map(value => bodyCell(value ? String(value) : '—', 'center')), bodyCell(String(row.count), 'right', { bold: true }), bodyCell(short(row.total), 'right')]);
    const footer = [bodyCell('Нийт', 'left', { bold: true }), ...m.weeks.map((_, index) => bodyCell(String(m.byWeek.reduce((sum, row) => sum + row.weeks[index], 0) || '—'), 'center', { bold: true })), bodyCell(String(m.count), 'right', { bold: true }), bodyCell(short(m.total), 'right', { bold: true })];
    slide.addTable([head, ...rows, footer], { x: M, y: TOP, w: 2.2 + weekW * m.weeks.length + 1.2 + 1.9, colW: [2.2, ...m.weeks.map(() => weekW), 1.2, 1.9], fontFace: FONT, fontSize: 13, border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1] });
    note(slide, [m.missingTotals ? `Нийт дүн хоосон ${m.missingTotals} гэрээ дүнд ороогүй.` : null, 'Долоо хоног = Лхагва–Мягмар, сарын хилээр тасална.', undated ? undatedContractsHint(undated) : null]);
}

function managerSlide(pres: PptxGenJS, report: WeeklySalesReport) {
    if (!report.byManager.length) return;
    tableSlides(pres, {
        kicker: 'Борлуулалт', title: 'Менежерээр', subtitle: `${span(report.range)} · ${Number(report.month.month.slice(5))}-р сар`,
        head: [headCell('Менежер'), headCell('7 хоног', 'right'), headCell('7 хоногийн дүн', 'right'), headCell('Сар', 'right'), headCell('Сарын дүн', 'right'), headCell('Мөнгөн орлого', 'right')],
        rows: report.byManager.map(row => [bodyCell(row.manager, 'left', { bold: true }), bodyCell(String(row.weekCount), 'right'), bodyCell(short(row.weekTotal), 'right'), bodyCell(String(row.monthCount), 'right'), bodyCell(short(row.monthTotal), 'right'), bodyCell(row.cash === null ? '—' : short(row.cash), 'right')]),
        colW: [3.6, 1.4, 2.0, 1.2, 2.0, 1.93], perSlide: 12, fontSize: 13,
        notes: [report.cash?.basis ?? 'Мөнгөн орлогыг тооцоход хоёр долоо хоногийн ERP гэрээний экспорт хэрэгтэй.'],
    });
}

function inventorySlide(pres: PptxGenJS, report: WeeklySalesReport) {
    const inventory = report.inventory;
    if (!inventory?.blocks.length) return;
    const statuses = ['available', 'ordered', 'reserved', 'sold', 'handed_over'] as const;
    tableSlides(pres, {
        kicker: 'Үлдэгдэл', title: 'Үлдэгдэл блокоор',
        subtitle: `${inventory.source.kind === 'erp' ? `ERP «${inventory.source.source}»` : inventory.source.source} · ${dot(inventory.source.date)}`,
        head: [headCell('Блок'), headCell('Төрөл'), headCell('Нийт', 'right'), ...statuses.map(status => headCell(inventory.statusLabels[status] ?? status, 'right')), headCell('Бартер', 'right')],
        rows: inventory.blocks.map(row => [bodyCell(row.block, 'left', { bold: true }), bodyCell(row.label), bodyCell(String(row.total), 'right'),
            ...statuses.map(status => bodyCell(String(row.statuses[status] ?? 0), 'right', status === 'available' ? { bold: true, color: C.brand } : {})), bodyCell(String(row.barter), 'right')]),
        colW: [1.9, 1.9, 1.0, 1.25, 1.25, 1.25, 1.25, 1.33, 1.0], perSlide: 13, fontSize: 12,
        notes: ['«Хүлээлгэсэн» байр зарагдсанд тооцогдоно, «Худалдаанд»-д хэзээ ч орохгүй.', ...(inventory.source.kind === 'contracts' ? [inventorySourceNote(inventory.source)] : [])],
    });
}

/**
 * Үлдэгдлийн эх сурвалжийн тэмдэглэл. HUB горимд (`contracts`) гэрээ, байрыг одоогийн төлөвөөр уншдаг (`report-inventory.ts`) —
 * огноо нь зөвхөн HUB гэрээний жагсаалтын сүүлийн импортынх тул «тэр өдрийн байдлаар» гэж ойлгуулахгүй.
 */
export function inventorySourceNote(source: NonNullable<WeeklySalesReport['inventory']>['source']) {
    if (source.kind === 'contracts') return `Эх сурвалж: ${source.source} — гэрээ, байр одоогийн төлөвөөр; ${source.date} нь HUB гэрээний жагсаалтын сүүлийн импортын огноо.`;
    return `Эх сурвалж: ${source.kind === 'erp' ? `ERP «${source.source}»` : source.source} (${source.date}).`;
}

const FLOOR_FILL: Record<FloorTone, string> = { sold: C.successSoft, available: C.white, barter: C.neutralSoft };
/** PowerPoint-ийн мөр таслалтын зөрүүнд үлдээх нөөц (нүдний ашиглах өргөний хувь). */
const FIT_SAFETY = 0.97;
/**
 * Нүдний бичвэр: талбай (м²), гэрээтэйд менежерийн нэр, гэрээгүй бартерт «Бартер». Нэг мөрөнд багтахгүй бол нэрийг
 * «…»-ээр товчилно — мөр хоёр болбол хүснэгт хөл, слайдын дугаар руу (22 давхар нэг слайдад) урсана.
 */
function floorCellText(cell: FloorCell, maxWidth: number, fontSize: number): { text: string; clipped: boolean } {
    const tone = floorTone(cell);
    const label = tone === 'sold' && cell.manager ? managerShort(cell.manager) : tone === 'barter' ? (cell.manager ? managerShort(cell.manager) : 'Бартер') : '';
    const base = cell.area !== null ? `${area(cell.area)} м²` : cell.code;
    if (!label) return { text: base, clipped: false };
    const fits = (text: string) => arialWidth(text, fontSize, tone === 'available') <= maxWidth * FIT_SAFETY;
    if (fits(`${base} ${label}`)) return { text: `${base} ${label}`, clipped: false };
    for (let length = label.length - 1; length >= 1; length--) {
        const text = `${base} ${label.slice(0, length).trimEnd()}…`;
        if (fits(text)) return { text, clipped: true };
    }
    return { text: base, clipped: true };
}

/** `liveContracts` — HUB горим (`contracts`): ногоон = амьд гэрээ (байрны төлөв биш); ERP, байрны бүртгэлд — төлөвөөр. */
function legend(slide: Slide, y: number, liveContracts: boolean) {
    const sold = liveContracts ? 'Амьд гэрээтэй (цуцлаагүй)' : 'Гэрээтэй (зарагдсан, хүлээлгэсэн)';
    const items: [string, string][] = [[C.successSoft, sold], [C.white, 'Худалдаанд (захиалсан, хадгалсан орно)'], [C.neutralSoft, 'Бартер']];
    let x = M;
    for (const [color, label] of items) {
        slide.addShape('rect', { x, y: y + 0.06, w: 0.18, h: 0.18, fill: { color }, line: { color: C.line, width: 0.75 } });
        slide.addText(label, { x: x + 0.25, y, w: 3, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, isTextBox: true });
        x += 0.35 + label.length * 0.075;
    }
}

/**
 * Давхрын зураглал: давхар × загвар, худалдаанд байгаа байр цагаан, гэрээтэйд менежерийн нэр.
 * `options` (багийн загварын илтгэл): толгойн дээд шошго, гарчиг (блокоор; хуваагдвал «(1/2)» нэмнэ), нэмэлт тэмдэглэл.
 */
export function floorMapSlides(pres: PptxGenJS, report: WeeklySalesReport, options: { kicker?: string; title?: (block: string) => string; notes?: string[] } = {}) {
    // Мөр ≥ 0.2" (8pt) байхаар хуваана: 23 хүртэл мөртэй блок нэг слайдад багтана, түүнээс олон бол тэнцүү хуваагдана.
    // Нэг давхар × загварт хэд хэдэн байр бол тэр давхар байрны тоогоор мөр эзэлнэ (өндрийг урьдчилан тооцно).
    const maxLines = Math.floor((BOTTOM - TOP) / 0.2) - 2;
    const liveContracts = report.inventory?.source.kind === 'contracts';
    // HUB горимд ногоон = байрны бүртгэлтэй таарсан Hub-ийн бүх амьд гэрээ (`report-inventory.ts`): HUB жагсаалтынхаас гадна
    // ERP бүтээгдэхүүний экспортоос үүссэн огноогүй хуучин гэрээ ч. Огноогүйн тоо зөвхөн CRM-ийн гэрээгээр тайлагнасан үед
    // ижил гэрээнээс (устгаагүй, цуцлаагүй) тоологдоно — ERP гэрээний экспорттой бол тэр нь экспортын мөр тул нэрлэхгүй.
    const undatedLive = liveContracts && report.sources.contracts === 'crm' ? report.sources.undatedContracts : 0;
    const liveNotes = liveContracts ? [
        'Ногоон = Hub-ийн бүх амьд (цуцлаагүй) гэрээтэй байр — зөвхөн HUB гэрээний жагсаалтаас импортолсон гэрээ биш: ERP бүтээгдэхүүний экспортоос үүссэн огноогүй хуучин гэрээ байвал тэр ч орно (бартер гэрээтэй нь саарал). Гэрээтэй байрны талбай нь гэрээлсэн талбай.',
        // Тоо нь бүх төрлийнх; зураглалд зөвхөн давхартай орон сууц, бартер нь саарал — үүнийг тэмдэглэлд хэлнэ.
        undatedLive ? `Hub-д огноогүй ${undatedLive.toLocaleString('en-US')} амьд гэрээ бий (бүх төрлөөр; ихэвчлэн HUB жагсаалтад ороогүй хуучин гэрээ) — үүнээс орон сууцных нь байр бүртгэлтэй таарвал энд ногоон (бартер бол саарал).` : null,
    ] : [];
    for (const map of report.inventory?.floorMaps ?? []) {
        const lineCount = (row: (typeof map.floors)[number]) => Math.max(1, ...map.models.map(model => row.cells[model]?.length ?? 0));
        const totalLines = map.floors.reduce((sum, row) => sum + lineCount(row), 0);
        const target = Math.ceil(totalLines / Math.max(1, Math.ceil(totalLines / maxLines)));
        const chunks: Array<typeof map.floors> = [];
        let used = 0;
        for (const row of map.floors) {
            if (!chunks.length || (used + lineCount(row) > target && chunks[chunks.length - 1].length)) { chunks.push([]); used = 0; }
            chunks[chunks.length - 1].push(row);
            used += lineCount(row);
        }
        chunks.forEach((floors, chunk) => {
            let clipped = false;
            const title = options.title ? options.title(map.block) : `Орон сууцны үлдэгдэл — ${map.block} блок`;
            const slide = content(pres, options.kicker ?? 'Үлдэгдэл', `${title}${chunks.length > 1 ? ` (${chunk + 1}/${chunks.length})` : ''}`);
            legend(slide, 1.3, liveContracts);
            const countW = 0.9;
            const floorW = 0.85;
            const margin = 0.03;
            const modelW = (CW - floorW - countW * 3) / Math.max(1, map.models.length);
            const lines = floors.map(lineCount);
            const unit = Math.min(0.42, (BOTTOM - TOP) / (lines.reduce((sum, value) => sum + value, 0) + 2));
            const fontSize = unit >= 0.3 ? 9 : 8;
            const head = [headCell('Давхар'), ...map.models.map(model => headCell(model, 'center')), headCell('Гэрээтэй', 'center'), headCell('Худалдаанд', 'center'), headCell('Бартер', 'center')]
                .map(cell => ({ ...cell, options: { ...cell.options, fontSize: 8 } }));
            const rows = floors.map(row => [
                bodyCell(`${row.floor} давхар`, 'left', { bold: true, color: C.ink2 }),
                ...map.models.map(model => {
                    const cells = row.cells[model] ?? [];
                    if (!cells.length) return bodyCell('', 'center', { fill: { color: C.surface } });
                    const tone = floorTone(cells[0]);
                    const texts = cells.map(cell => floorCellText(cell, modelW - margin * 2, fontSize));
                    clipped ||= texts.some(item => item.clipped);
                    return bodyCell(texts.map(item => item.text).join('\n'), 'center', { fill: { color: FLOOR_FILL[tone] }, color: tone === 'available' ? C.brand : C.ink, bold: tone === 'available' });
                }),
                bodyCell(String(row.counts.sold), 'center'), bodyCell(String(row.counts.available), 'center', { bold: true, color: C.brand }), bodyCell(String(row.counts.barter), 'center'),
            ]);
            const last = chunk === chunks.length - 1;
            const footer = [bodyCell('НИЙТ', 'left', { bold: true, colspan: map.models.length + 1 }), bodyCell(String(map.totals.sold), 'center', { bold: true }), bodyCell(String(map.totals.available), 'center', { bold: true, color: C.brand }), bodyCell(String(map.totals.barter), 'center', { bold: true })];
            slide.addTable([head, ...rows, ...(last ? [footer] : [])], {
                x: M, y: TOP, w: CW, colW: [floorW, ...map.models.map(() => modelW), countW, countW, countW], rowH: [unit, ...lines.map(rowLines => rowLines * unit), ...(last ? [unit] : [])],
                fontFace: FONT, fontSize, border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.01, margin, 0.01, margin], autoPage: false,
            });
            note(slide, [
                `${map.block} блок: гэрээтэй ${map.totals.sold}, худалдаанд ${map.totals.available}, бартер ${map.totals.barter}.`,
                'Цэнхэр тоо = худалдаанд байгаа байр (м²). Захиалсан, хадгалсан байр «Худалдаанд»-д орно.',
                ...liveNotes,
                clipped ? 'Нүдэнд нэг мөрөөр багтаагүй менежерийн нэрийг «…»-ээр товчилсон (бүтэн нэр — гэрээний жагсаалтад).' : null,
                ...(options.notes ?? []),
            ]);
        });
    }
}

/** Маркетингийн албаны өөрийн төсөв ба зарцуулалт (лид, гэрээгүй). */
function budgetSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const budget = input.budget;
    const spend = input.marketing?.totals;
    if (!budget && !spend) return;
    const slide = content(pres, 'Маркетинг', 'Төсөв ба зарцуулалт', span(input.range));
    if (budget) {
        const { overview, month, year } = budget;
        const ytd = overview.months.filter(row => row.month <= month);
        const ytdSpend = ytd.reduce((sum, row) => sum + row.spend, 0);
        const ytdBudget = ytd.reduce((sum, row) => sum + row.budget, 0);
        const current = overview.months[month - 1];
        const ratio = (used: number, plan: number) => plan > 0 ? `${Math.round(used / plan * 100)}%` : 'төсөвгүй';
        statRow(slide, TOP, [
            { label: `${year} оны үндсэн төсөв`, value: overview.totals.budget ? short(overview.totals.budget) : 'Оруулаагүй', tone: 'gold' },
            { label: 'Он эхнээс зарцуулсан', value: short(ytdSpend), helper: `${ratio(ytdSpend, ytdBudget)} (энэ хүртэлх сарын төсвөөс)`, tone: ytdBudget > 0 && ytdSpend > ytdBudget ? 'danger' : undefined },
            { label: `${month}-р сарын төсөв`, value: current?.budget ? short(current.budget) : 'Оруулаагүй' },
            { label: `${month}-р сард зарцуулсан`, value: short(current?.spend ?? 0), helper: current ? ratio(current.spend, current.budget) : undefined, tone: current?.status === 'over' ? 'danger' : undefined },
        ]);
    }
    if (spend) {
        statRow(slide, budget ? TOP + 1.85 : TOP, [
            { label: 'Энэ 7 хоногт бүртгэсэн зардал', value: spend.hasSpend || !spend.spendComplete ? short(spend.spend) : '—', helper: spend.spendComplete ? 'Гар бүртгэл + Meta өдрийн зардал' : 'Ханшгүй зардал нийтэд ороогүй' },
            { label: 'Дууссан кампанит ажил', value: count(spend.campaigns), helper: `Өмнөх ${input.marketing!.previous.campaigns}` },
        ]);
    }
    note(slide, ['Meta-ийн зардлыг зөвхөн хадгалсан ханшаар төгрөгт хөрвүүлнэ; ханшгүй USD зардал нийтэд орохгүй.']);
}

/** Лидийн эх сурвалж, хөрвөлт — борлуулалтын үзүүлэлт (маркетингийн албаны ажлын хэмжүүр биш). */
function leadSourceSlide(pres: PptxGenJS, marketing: MarketingPerformance | undefined) {
    const channels = marketing?.channels.filter(channel => channel.leads > 0 || channel.hasSpend || !channel.spendComplete) ?? [];
    if (!marketing || !channels.length) return;
    const t = marketing.totals;
    tableSlides(pres, {
        kicker: 'Борлуулалт', title: 'Лидийн эх сурвалж, хөрвөлт',
        subtitle: `Шинэ лид ${t.leads} · менежерт шилжсэн ${t.sales} (${pct(t.salesPct)}) · гэрээтэй ${t.deals} (${pct(t.dealPct)})`,
        head: ['Суваг', 'Лид', 'Шилжсэн', 'Гэрээтэй', 'Гэрээ %', 'Зардал (₮)', 'Нэг лид (₮)'].map((text, index) => headCell(text, index ? 'right' : 'left')),
        rows: channels.map(channel => [bodyCell(channel.name, 'left', { bold: true }), bodyCell(String(channel.leads), 'right'), bodyCell(String(channel.sales), 'right'), bodyCell(String(channel.deals), 'right'),
            bodyCell(pct(channel.dealPct), 'right'), bodyCell(channel.hasSpend || !channel.spendComplete ? `${short(channel.spend)}${channel.spendComplete ? '' : ' (ханш дутуу)'}` : '—', 'right'), bodyCell(channel.costPerLead === null ? '—' : short(channel.costPerLead), 'right')]),
        colW: [3.2, 1.2, 1.4, 1.4, 1.3, 2.0, 1.63], perSlide: 11, fontSize: 13,
        notes: ['Тухайн хугацаанд үүссэн лидээс хугацааны эцэс хүртэл шилжсэн, гэрээтэй болсон тоо.', 'Өртөг = тухайн хугацааны бүртгэсэн зардал / лидийн тоо. Ханш дутуу, зардал эсвэл тооцох суурь алга бол өртөг тооцоогүй.'],
    });
}

/** Маркетингийн албаны өөрийн төлөвлөгөө: төлөвлөсөн → нийтэлсэн, хоцорсон, төрлөөр. */
function contentPlanSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const week = input.contentPlan?.week;
    const slide = content(pres, 'Маркетинг', 'Контент төлөвлөгөө ба гүйцэтгэл', span(input.range));
    if (!week) {
        slide.addText('Контент төлөвлөгөөний мэдээлэл алга. Маркетинг → Контент календарь хэсэгт долоо хоногийн контентоо төлөвлөж, төлөвийг нь шинэчилнэ.', { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    statRow(slide, TOP, [
        { label: 'Төлөвлөсөн контент', value: count(week.planned), tone: 'gold' },
        { label: 'Нийтэлсэн', value: count(week.published), helper: week.pct === null ? 'Төлөвлөгөө алга' : `Төлөвлөгөөний ${week.pct}%` },
        { label: 'Хийгдэж буй / бэлэн', value: count(week.inProgress) },
        { label: 'Хоцорсон', value: count(week.overdue), helper: 'Огноо өнгөрсөн, нийтлээгүй', tone: week.overdue ? 'danger' : undefined },
    ]);
    if (week.byType.length) {
        const typeW = Math.min(1.6, (CW - 2.0) / week.byType.length);
        slide.addTable([
            [headCell(''), ...week.byType.map(row => headCell(row.label, 'center'))],
            [bodyCell('Төлөвлөсөн', 'left', { bold: true }), ...week.byType.map(row => bodyCell(String(row.planned), 'center'))],
            [bodyCell('Нийтэлсэн', 'left', { bold: true }), ...week.byType.map(row => bodyCell(String(row.published), 'center', { bold: true, color: C.success }))],
        ], { x: M, y: TOP + 1.9, w: 2.0 + typeW * week.byType.length, colW: [2.0, ...week.byType.map(() => typeW)], fontFace: FONT, fontSize: 14, border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1] });
    }
    note(slide, ['Цуцалсан контент төлөвлөгөөнд тооцогдохгүй.', week.cancelled ? `Цуцалсан: ${week.cancelled}.` : null, 'Эх сурвалж: Маркетинг → Контент календарь.']);
}

function contentTable(pres: PptxGenJS, title: string, subtitle: string, items: ContentItem[], overdue: ContentItem[], empty: string) {
    if (!items.length) {
        const slide = content(pres, 'Маркетинг', title, subtitle);
        slide.addText(empty, { x: M, y: TOP, w: CW, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    const tone = (item: ContentItem): PptxGenJS.TableCellProps => item.status === 'published' ? { color: C.success, bold: true }
        : overdue.includes(item) ? { color: C.danger, bold: true } : item.status === 'cancelled' ? { color: C.muted } : {};
    tableSlides(pres, {
        kicker: 'Маркетинг', title, subtitle,
        head: ['Огноо', 'Төрөл', 'Платформ', 'Контент', 'Хариуцагч', 'Төлөв'].map(text => headCell(text)),
        rows: items.map(item => [bodyCell(dot(item.scheduled_date.slice(5))), bodyCell(CONTENT_TYPE_LABEL[item.type] ?? item.type), bodyCell(contentPlatformLabel(item.platform)),
            bodyCell(clip(item.title, 90)), bodyCell(item.assigned_to ? clip(item.assigned_to, 24) : '—'), bodyCell(CONTENT_STATUS_LABEL[item.status] ?? item.status, 'left', tone(item))]),
        colW: [0.9, 1.1, 1.3, 5.4, 1.8, 1.63], perSlide: 12, fontSize: 12,
    });
}

/** Нийтэлсэн/бэлэн контент бүр постер/reel-ийн зурагтайгаа нэг слайд. */
function contentShowcase(pres: PptxGenJS, summary: ContentPlanSummary, images: Record<string, DeckImage>) {
    for (const item of summary.items.filter(entry => (entry.status === 'published' || entry.status === 'ready') && entry.image_paths.length)) {
        const loaded = item.image_paths.map(path => images[path]).filter((image): image is DeckImage => !!image);
        const meta = [CONTENT_TYPE_LABEL[item.type] ?? item.type, contentPlatformLabel(item.platform), dot(item.scheduled_date), CONTENT_STATUS_LABEL[item.status], item.assigned_to].filter(Boolean).join(' · ');
        const slide = content(pres, `Маркетинг · ${CONTENT_TYPE_LABEL[item.type] ?? item.type}`, item.title, meta);
        layoutImages(slide, loaded, (item.description ?? '').trim(), TOP);
        note(slide, [loaded.length < item.image_paths.length ? `${item.image_paths.length - loaded.length} зураг ачаалж чадсангүй — Hub-ийн контент календарьт шалгана уу.` : null]);
    }
}

function socialHelper(metric: SocialWeekMetric, rangeDays: number): string {
    if (metric.value === null) return 'Meta өгөөгүй';
    const parts: string[] = [];
    if (metric.kind === 'latest' && metric.day) parts.push(`${dot(metric.day)}-ны байдлаар`);
    else if (metric.days && metric.days < rangeDays) parts.push(`${metric.days}/${rangeDays} өдөр`);
    const against = metric.comparison === 'week-ago' ? '7 хоногийн өмнө' : metric.comparison === 'same-days' ? 'Өмнөх 7 хоногийн мөн өдрүүд' : 'Өмнөх 7 хоног';
    parts.push(`${against} ${count(metric.previous)}`);
    if (metric.delta !== null) parts.push(`${metric.delta > 0 ? '+' : ''}${count(metric.delta)}${metric.deltaPct !== null ? ` (${metric.deltaPct > 0 ? '+' : ''}${metric.deltaPct}%)` : ''}`);
    return parts.join(' · ');
}

/** Facebook хуудасны долоо хоногийн органик үзүүлэлт (хадгалсан өдрийн insights) ба нийтэлсэн постууд. */
function socialPageSlides(pres: PptxGenJS, input: WeeklyDeckInput) {
    const social = input.social;
    if (!social?.page) return;
    const pageName = social.page.name || 'Facebook хуудас';
    const known = social.metrics.filter(metric => metric.value !== null);
    const days = Math.max(0, ...social.metrics.map(metric => metric.days));
    const coverage = days && days < social.rangeDays ? ` · ${days}/${social.rangeDays} өдрийн өгөгдөл` : '';
    const slide = content(pres, 'Маркетинг · Facebook', `${pageName} — долоо хоногийн үзүүлэлт`, `${span(input.range)} · Meta-гийн өдөр (Номхон далайн цаг)${coverage}`);
    if (!known.length) {
        slide.addText(`Энэ долоо хоногийн Facebook хуудасны үзүүлэлт хадгалагдаагүй байна${social.syncedTo ? ` (сүүлийн синк ${dot(social.syncedTo)} хүртэл)` : ''}. Маркетинг → Сошиал хэсэгт хуудас холбогдсон эсэх, синкийг шалгана уу.`,
            { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
    } else {
        const card = (metric: SocialWeekMetric) => ({ label: metric.label, value: count(metric.value), helper: socialHelper(metric, social.rangeDays) });
        statRow(slide, TOP, social.metrics.slice(0, 4).map(card), 1.7);
        statRow(slide, TOP + 1.95, social.metrics.slice(4).map(card), 1.7);
    }
    note(slide, [
        'Эх сурвалж: Hub-ийн хадгалсан Facebook Page insights (Graph v26, 6 цаг тутмын синк). Meta өдрийг Номхон далайн цагаар тоолдог.',
        '«Дагагч» нь өдрийн эцсийн төлөв, бусад нь долоо хоногийн нийлбэр. Давхардалгүй хүрсэн хүнийг өдрөөр нэмэх боломжгүй тул оруулаагүй.',
        'Долоо хоног дутуу бол (хурлын өглөө Meta-гийн сүүлийн өдөр дуусаагүй) өмнөх долоо хоногийн мөн өдрүүдтэй харьцуулна. Дагагчийг 7 хоногийн өмнөх өдөртэй харьцуулна.',
        social.syncedTo && social.syncedTo < input.range.to ? `Сүүлийн синк ${social.syncedTo} хүртэл — долоо хоногийн сүүлийн өдрүүд дутуу.` : null,
    ]);

    const postText = (text: string | null) => text?.replace(/\s+/g, ' ').trim() || '(текстгүй пост)';
    const postDate = (iso: string | null) => iso ? dot(ubDateStr(new Date(iso)).slice(5)) : '—';
    if (!social.posts.length) {
        const empty = content(pres, 'Маркетинг · Facebook', 'Энэ долоо хоногт нийтэлсэн пост', span(input.range));
        empty.addText('Энэ долоо хоногт хуудсанд нийтэлсэн пост Hub-д хадгалагдаагүй байна.', { x: M, y: TOP, w: CW, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    tableSlides(pres, {
        kicker: 'Маркетинг · Facebook', title: 'Энэ долоо хоногт нийтэлсэн пост', subtitle: `${span(input.range)} · ${social.posts.length} пост, үзэлтээр эрэмбэлсэн`,
        head: [headCell('Огноо'), headCell('Пост'), ...['Үзэлт', 'Товшилт', 'Like', 'Сэтгэгдэл', 'Хуваалцсан'].map(text => headCell(text, 'right'))],
        rows: social.posts.map(post => [bodyCell(postDate(post.publishedAt)), bodyCell(clip(postText(post.content), 100)), bodyCell(count(post.views), 'right', { bold: true }),
            bodyCell(count(post.clicks), 'right'), bodyCell(count(post.likes), 'right'), bodyCell(count(post.comments), 'right'), bodyCell(count(post.shares), 'right')]),
        colW: [0.85, 5.3, 1.25, 1.15, 0.95, 1.2, 1.433], perSlide: 10, fontSize: 12,
        notes: [
            `Постын тоо нь сүүлийн синкийн${social.posts[0]?.asOf ? ` (${social.posts[0].asOf})` : ''} байдлаарх нийт дүн — пост нийтлэгдсэнээс хойш.`,
            'Meta постын давхардалгүй хүрэлтийг 0 гэж буцаадаг тул оруулаагүй. Hub хуудасны сүүлийн 25 постыг хадгалдаг.',
        ],
    });
}

function channelValue(source: ChannelSource, key: string, value: unknown, currency?: string): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string') return value;
    if (typeof value !== 'number') return '—';
    const kind = channelMetric(source, key)?.kind;
    if (kind === 'money') return `${value.toLocaleString('en-US', { maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 4 : 2 })}${currency ? ` ${currency}` : ''}`;
    if (kind === 'percent') return `${value}%`;
    if (kind === 'duration') {
        const seconds = Math.round(value);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return hours ? `${hours} ц ${minutes} мин` : `${minutes} мин ${seconds % 60} сек`;
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Meta Ads, Facebook хуудас, CallPro, SMS-ийн оруулсан экспорт (эсвэл Meta API) — гол үзүүлэлт. */
function channelExportSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const channels = input.channels;
    if (!channels) return;
    const present = CHANNEL_SOURCES.filter(source => channels[source]?.report);
    const missing = CHANNEL_SOURCES.filter(source => !channels[source]?.report);
    const slide = content(pres, 'Маркетинг', 'Сувгийн экспорт, Meta API', missing.length ? `Экспорт оруулаагүй: ${missing.map(source => CHANNEL_SOURCE_LABELS[source]).join(', ')}` : undefined);
    if (!present.length) {
        slide.addText('Энэ долоо хоногт сувгийн экспорт оруулаагүй байна. Маркетинг → Экспорт импорт хуудсанд Meta Ads, Facebook хуудас, CallPro, SMS-ийн файлаа оруулна уу.', { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    const cols = present.length >= 3 ? 2 : present.length;
    const rows = Math.ceil(present.length / cols);
    const gap = 0.25;
    const w = (CW - gap * (cols - 1)) / cols;
    const h = Math.min(2.6, (BOTTOM - TOP - gap * (rows - 1)) / rows);
    present.forEach((source, index) => {
        const x = M + (index % cols) * (w + gap);
        const y = TOP + Math.floor(index / cols) * (h + gap);
        const report = channels[source].report!;
        const currency = typeof report.totals.currency === 'string' ? report.totals.currency : undefined;
        const keys = channelKeyMetrics(source).filter(key => report.totals[key] !== undefined).slice(0, 6);
        slide.addShape('roundRect', { x, y, w, h, fill: { color: C.surface }, line: { color: C.surface }, rectRadius: 0.08 });
        slide.addText([
            { text: CHANNEL_SOURCE_LABELS[source], options: { bold: true, fontSize: 14, color: C.ink } },
            { text: `   ${dot(report.period_from)} – ${dot(report.period_to)} · ${report.origin === 'api' ? 'Meta API' : 'Экспорт файл'}`, options: { fontSize: 10, color: C.muted } },
        ], { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.35, fontFace: FONT, margin: 0, isTextBox: true });
        const metricW = (w - 0.4) / 3;
        keys.forEach((key, metricIndex) => {
            const mx = x + 0.2 + (metricIndex % 3) * metricW;
            const my = y + 0.55 + Math.floor(metricIndex / 3) * Math.min(0.9, (h - 0.7) / 2);
            const delta = channels[source].comparison?.[key];
            slide.addText([
                { text: channelMetric(source, key)?.label ?? key, options: { fontSize: 10, color: C.muted, breakLine: true } },
                { text: channelValue(source, key, report.totals[key], currency), options: { fontSize: 18, bold: true, color: C.ink, breakLine: !!(delta?.comparable && delta.delta !== null) } },
                ...(delta?.comparable && delta.delta !== null ? [{ text: `${delta.delta > 0 ? '+' : ''}${delta.delta.toLocaleString('en-US', { maximumFractionDigits: 2 })}${delta.pct !== null ? ` (${delta.pct > 0 ? '+' : ''}${delta.pct}%)` : ''}`, options: { fontSize: 10, color: delta.delta > 0 ? C.success : delta.delta < 0 ? C.danger : C.muted } }] : []),
            ], { x: mx, y: my, w: metricW - 0.1, h: 0.85, fontFace: FONT, margin: 0, valign: 'top', isTextBox: true });
        });
    });
    note(slide, ['Reach, Viewers зэрэг давхардах тоог мөрүүдээр нэмээгүй. Meta-ийн зардал зарын дансны валютаар (ихэвчлэн USD), төгрөгтэй нэмээгүй.']);
}

/**
 * Зургийн мөрүүд: мөр бүрийн зургийн тоо ба тэгш багана эсэх. ≤ 6 — тэгш багана (≤ 3 нэг мөр, 4 босоо бол нэг мөр,
 * эс бөгөөс 2×2, 5–6 гурваар, сүүлийн мөр зүүнээс). 7–9 — мөр бүр өөрийн тоогоор бүтэн өргөнд: бүгд босоо бол хоёр мөр,
 * дээр нь цөөн (9 = 4 + 5, багийн илтгэлийн 15-р слайд), эс бөгөөс гурван мөр, доор нь олон (7 = 2 + 2 + 3).
 */
export function imageGridRows(images: readonly Pick<DeckImage, 'width' | 'height'>[]): { rows: number[]; uniformCols: number | null } {
    const n = images.length;
    const portrait = images.every(image => image.height > image.width);
    if (n <= 6) {
        const cols = n <= 3 ? Math.max(1, n) : n === 4 ? (portrait ? 4 : 2) : 3;
        return { rows: Array.from({ length: Math.ceil(n / cols) }, (_, row) => Math.min(cols, n - row * cols)), uniformCols: cols };
    }
    const count = portrait ? 2 : Math.ceil(n / 3);
    const base = Math.floor(n / count);
    const extra = n % count;
    return { rows: Array.from({ length: count }, (_, row) => base + (row >= count - extra ? 1 : 0)), uniformCols: null };
}

export function imageGrid(slide: Slide, images: DeckImage[], box: { x: number; y: number; w: number; h: number }) {
    const { rows, uniformCols } = imageGridRows(images);
    const gap = 0.25;
    const cellH = (box.h - gap * (rows.length - 1)) / rows.length;
    let index = 0;
    rows.forEach((count, row) => {
        const cols = uniformCols ?? count;
        const cellW = (box.w - gap * (cols - 1)) / cols;
        for (let col = 0; col < count; col++, index++) {
            const image = images[index];
            const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
            let w = cellW;
            let h = w / ratio;
            if (h > cellH) { h = cellH; w = h * ratio; }
            const x = box.x + col * (cellW + gap) + (cellW - w) / 2;
            const y = box.y + row * (cellH + gap) + (cellH - h) / 2;
            slide.addImage({ data: image.data, x, y, w, h, altText: `Слайдын зураг ${index + 1}` });
        }
    });
}

/** «Энэ сард хийгдэх ажил»: мөр бүр нэг цэг (гараар бичсэн «•», «-» тэмдгийг хасна, хоосон мөр алгасна). */
function bulletRuns(text: string): PptxGenJS.TextProps[] {
    const lines = text.split('\n').map(line => line.trim().replace(/^[•·▪◦*\-–—]\s*/, '').trim()).filter(Boolean);
    return lines.map((line, index) => ({ text: line, options: { bullet: { indent: 18 }, breakLine: index < lines.length - 1 } }));
}

/** Зураг (≤ 9) ба тайлбар: богино тайлбар доор, урт бол баруун талд. Зураггүй бол тайлбар бүтэн слайдад. `bullets` — мөр бүр цэг. */
function layoutImages(slide: Slide, loaded: DeckImage[], text: string, top: number, bullets = false) {
    if (loaded.length) {
        const longNote = text.length > 220;
        const box = longNote
            ? { x: M, y: top, w: CW * 0.62, h: BOTTOM - top }
            : { x: M, y: top, w: CW, h: (text ? 5.95 : BOTTOM) - top };
        imageGrid(slide, loaded, box);
        if (text) {
            slide.addText(bullets ? bulletRuns(clip(text, 1400)) : clip(text, 1400), longNote
                ? { x: M + CW * 0.62 + 0.3, y: top, w: CW * 0.38 - 0.3, h: BOTTOM - top, fontFace: FONT, fontSize: 13, color: C.ink2, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true }
                : { x: M, y: 6.05, w: CW, h: 0.8, fontFace: FONT, fontSize: 14, color: C.ink2, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true });
        }
    } else if (text) {
        slide.addText(bullets ? bulletRuns(clip(text, 2000)) : clip(text, 2000), { x: M, y: top, w: CW, h: BOTTOM - top, fontFace: FONT, fontSize: text.length > 700 ? 13 : text.length > 300 ? 16 : 20, color: C.ink, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true, paraSpaceAfter: 6 });
    }
}

/** Зөвхөн зурагтай слайдын коллажийн дээд зах (толгойгүй; доод зах нь хөлийн дээр). */
const PHOTO_TOP = 0.45;

/**
 * Хэрэглэгчийн оруулсан слайд: сэдэв, зураг (≤ 9), тайлбар/дүгнэлт. Гарчиг, тайлбаргүй зурагтай слайд = зөвхөн зураг:
 * толгойгүй, захын зай доторх бүтэн коллаж (багийн илтгэлийн 14–15-р слайд). «Энэ сард хийгдэх ажил» — мөр бүр цэг.
 */
export function customSlide(pres: PptxGenJS, slideData: WeeklySlide, images: Record<string, DeckImage>) {
    const loaded = slideData.image_paths.map(path => images[path]).filter((image): image is DeckImage => !!image);
    const missing = slideData.image_paths.length - loaded.length;
    const text = slideData.note.trim();
    const label = `${WEEKLY_SLIDE_PART_LABEL[slideData.part]} · ${WEEKLY_SLIDE_SECTION_LABEL[slideData.section]}`;
    const photoOnly = !slideData.title.trim() && !text && loaded.length > 0;
    const slide = photoOnly ? pres.addSlide({ masterName: CONTENT }) : content(pres, label, slideData.title || WEEKLY_SLIDE_SECTION_LABEL[slideData.section]);
    if (photoOnly) imageGrid(slide, loaded, { x: M, y: PHOTO_TOP, w: CW, h: BOTTOM - PHOTO_TOP });
    else layoutImages(slide, loaded, text, TOP - 0.25, slideData.section === 'plan');
    note(slide, [
        photoOnly ? label : null,
        `Оруулсан: ${slideData.author_name || '—'}`,
        missing ? `${missing} зураг ачаалж чадсангүй — Hub-ийн хурлын хуудсанд шалгана уу.` : null,
        text.length > 1400 && loaded.length ? text : null,
    ]);
}

function updateSlides(pres: PptxGenJS, updates: WeeklyUpdate[], kind: WeeklyDeckKind) {
    for (const update of updates) {
        const slide = content(pres, `${WEEKLY_DECK_LABEL[kind]} · Ажлын явц`, update.author_name);
        const fields: [string, string][] = [['Хийсэн ажил', update.achievements], ['Саад, шийдэх зүйл', update.blockers], ['Дараагийн алхам', update.next_steps]];
        const gap = 0.3;
        const w = (CW - gap * 2) / 3;
        fields.forEach(([label, value], index) => {
            const x = M + index * (w + gap);
            slide.addShape('roundRect', { x, y: TOP - 0.2, w, h: BOTTOM - TOP + 0.2, fill: { color: index === 1 && value.trim() ? C.pendingSoft : C.surface }, line: { color: index === 1 && value.trim() ? C.pendingSoft : C.surface }, rectRadius: 0.08 });
            slide.addText([
                { text: label, options: { bold: true, fontSize: 14, color: C.ink, breakLine: true, paraSpaceAfter: 6 } },
                { text: clip(value.trim() || 'Тэмдэглээгүй', 900), options: { fontSize: value.length > 600 ? 12 : value.length > 250 ? 14 : 16, color: value.trim() ? C.ink2 : C.muted } },
            ], { x: x + 0.22, y: TOP - 0.05, w: w - 0.44, h: BOTTOM - TOP - 0.1, fontFace: FONT, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true });
        });
        note(slide, fields.filter(([, value]) => value.length > 900).map(([label, value]) => `${label}: ${value}`));
    }
}

function closingSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const slide = pres.addSlide({ masterName: COVER });
    slide.addText('Анхаарал хандуулсанд баярлалаа', { x: M + 0.2, y: 2.7, w: CW - 0.4, h: 1, fontFace: FONT, fontSize: 36, bold: true, color: C.white, margin: 0, valign: 'middle', isTextBox: true });
    slide.addText(`${input.projectName} · ${WEEKLY_DECK_LABEL[input.kind]} · Дараагийн хурал ${dot(nextWednesday(input.meetingDate))}`, { x: M + 0.2, y: 3.8, w: CW - 0.4, h: 0.5, fontFace: FONT, fontSize: 16, color: C.navy2, margin: 0, isTextBox: true });
}

const nextWednesday = (meetingDate: string) => new Date(Date.parse(`${meetingDate}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

/** Бүх слайдыг дарааллаар нь нэмнэ. `pres` — шинэ `new PptxGenJS()` (нэг файлд нэг удаа). */
export function buildWeeklyDeck(pres: PptxGenJS, input: WeeklyDeckInput): PptxGenJS {
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'Vertmon Hub';
    pres.company = 'Vertmon';
    pres.title = `${input.projectName} · ${WEEKLY_DECK_LABEL[input.kind]} · Лхагва гарагийн хурал ${input.meetingDate}`;
    pres.subject = `Тайлант хугацаа ${input.range.from} – ${input.range.to}`;
    pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
    defineLayouts(pres, `VERTMON HUB · ${input.projectName}`);
    const updates = (input.updates ?? []).filter(update => updatePart(update) === input.kind);

    coverSlide(pres, input);
    discussionSlide(pres, input);
    if (input.kind === 'sales') {
        salesOverviewSlide(pres, input);
        monthPlanSlide(pres, input);
        if (input.weeklySales) {
            contractSlides(pres, input.weeklySales);
            monthSlide(pres, input.weeklySales);
            managerSlide(pres, input.weeklySales);
            inventorySlide(pres, input.weeklySales);
            floorMapSlides(pres, input.weeklySales);
        }
        leadSourceSlide(pres, input.marketing);
        for (const slide of input.slides.filter(item => item.part === 'sales')) customSlide(pres, slide, input.images);
    } else {
        contentPlanSlide(pres, input);
        if (input.contentPlan) {
            const { week } = input.contentPlan;
            contentTable(pres, 'Энэ долоо хоногийн контент', span(input.range), week.items, week.overdueItems, 'Энэ долоо хоногт контент төлөвлөөгүй.');
            contentShowcase(pres, week, input.images);
        }
        socialPageSlides(pres, input);
        for (const slide of input.slides.filter(item => item.part === 'marketing')) customSlide(pres, slide, input.images);
        channelExportSlide(pres, input);
        budgetSlide(pres, input);
        if (input.contentPlan) {
            const { next } = input.contentPlan;
            const nextRange = { from: input.meetingDate, to: new Date(Date.parse(`${input.meetingDate}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10) };
            contentTable(pres, 'Дараагийн 7 хоногийн контент төлөвлөгөө', span(nextRange), next.items, [], 'Дараагийн 7 хоногт контент төлөвлөөгүй.');
        }
    }
    if (updates.length) updateSlides(pres, updates, input.kind);
    closingSlide(pres, input);
    return pres;
}

export function weeklyDeckFileName(projectName: string, meetingDate: string, kind: WeeklyDeckFileKind): string {
    const safe = projectName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Vertmon';
    return `${safe} - ${WEEKLY_DECK_LABEL[kind]} - Лхагва ${meetingDate}.pptx`;
}
