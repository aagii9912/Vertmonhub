import type PptxGenJS from 'pptxgenjs';
import type { OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import type { WeeklyContentPlan, WeeklyUpdate } from './weekly-review';
import { formatReviewChange, shiftReviewDate, updatePart } from './weekly-review';
import { knownPeriodAmount, periodContractAmount, periodContractCount, undatedContractsHint, undatedContractsShort } from './contract-dates';
import { WEEKLY_SLIDE_PART_LABEL, WEEKLY_SLIDE_SECTION_LABEL, type WeeklySlide } from './weekly-slides';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import type { BudgetOverview } from '@/lib/marketing/budget';
import { reportCoverage, type ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import { CHANNEL_SOURCE_LABELS, CHANNEL_SOURCES, channelKeyMetrics, channelMetric, formatChannelValue, periodDays, type BreakdownRow } from '@/lib/marketing/channel-reports';
import {
    META_WEEK_KEYS, channelCurrency, comparisonBlockedByCoverage, formatChannelDelta, formatChannelMetric, metaCampaignRows, metaCostText, metaResultsByType,
    metaRowTypeLabel, metaUntypedSpend,
} from '@/lib/marketing/channel-week';
import { isMetaResultType, metaResultKey } from '@/lib/marketing/meta-results';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, contentPlatformLabel, type ContentItem, type ContentPlanSummary } from '@/lib/marketing/content-plan';
import type { SocialWeek, SocialWeekMetric } from '@/lib/marketing/social-week';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { ubDateStr } from '@/lib/utils/date';

/**
 * Лхагва гарагийн хурлын тайланг PowerPoint (.pptx) болгоно — хурлыг слайдаар явуулдаг тул.
 * Борлуулалт, маркетинг хоёр тусдаа файл: маркетингийн алба контент бүтээж, өөрийн төлөвлөгөөгөөр
 * ажилладаг тул маркетингийн слайд лид, гэрээгээр биш контент төлөвлөгөөний гүйцэтгэл, нийтэлсэн
 * контент (постертой), Facebook хуудасны органик үзүүлэлт, сувгийн үзүүлэлт, Meta зар (Ads Manager-ийн
 * хураангуй: нийт, үр дүн төрлөөр, кампанит ажлаар), төсөв, дараагийн 7 хоногийн төлөвлөгөөгөөр бүрдэнэ.
 * Лидийн эх сурвалж, хөрвөлт борлуулалтын слайдад орно.
 * Цэвэр функц: өгөгдөл (хуудасны ачаалсан, эрхээр шүүгдсэн тайлангууд) + зураг → слайдууд.
 * Хөтөч (lib/dashboard/weekly-deck-export.ts) болон тест хоёулаа ашиглана.
 *
 * Дүрэм нь хуудастай ижил: хоосон дүнг 0 гэж бичихгүй («—»), гэрээний дүн, мөнгөн орлого,
 * зардлыг холихгүй, эх сурвалж ба хязгаарлалтыг слайдын тэмдэглэлд (notes) бичнэ.
 */
export interface DeckImage { data: string; width: number; height: number }

export type WeeklyDeckKind = 'sales' | 'marketing';
export const WEEKLY_DECK_LABEL: Record<WeeklyDeckKind, string> = { sales: 'Борлуулалт', marketing: 'Маркетинг' };

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

const W = 13.333;
const H = 7.5;
const M = 0.6;
const CW = W - M * 2;
const FONT = 'Arial';
const C = {
    ink: '12151C', ink2: '3A404C', muted: '5C6474', line: 'E3E6EB', surface: 'F0F2F5', white: 'FFFFFF',
    brand: '2D5FDD', brandSoft: 'EBF0FD', navy: '0E1A3A', navy2: 'A9B8E8',
    success: '13784A', successSoft: 'E5F5EC', pending: '9A5A00', pendingSoft: 'FDF2DF',
    danger: 'C0362C', dangerSoft: 'FCEBE9', neutralSoft: 'E6E9EE', gold: 'A9823F',
} as const;
const CONTENT = 'VH_CONTENT';
const COVER = 'VH_COVER';
const TOP = 1.7;
const BOTTOM = 6.85;

const dot = (date: string) => date.replaceAll('-', '.');
const span = (range: { from: string; to: string }) => `${dot(range.from)} – ${dot(range.to)}`;
const count = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toLocaleString('en-US');
const pct = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${value}%`;
const area = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const money = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatMNT(value);
const short = (value: number | null | undefined) => value === null || value === undefined ? '—' : formatMNTShort(value);
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
/** Урт нэрийг үгийн заагаар тайрна (кампанит ажлын нэр 2 мөрт багтана). */
const clipWords = (text: string, max: number) => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:—-]+$/, '')}…`;
};
const managerShort = (name: string | null) => name?.split('.')[0]?.trim() || '—';

type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;

function defineLayouts(pres: PptxGenJS, projectName: string) {
    pres.defineSlideMaster({ title: COVER, background: { color: C.navy } });
    pres.defineSlideMaster({
        title: CONTENT,
        background: { color: C.white },
        objects: [
            { text: { text: `VERTMON HUB · ${projectName}`, options: { x: M, y: 7.02, w: 8, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 } } },
        ],
        slideNumber: { x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, align: 'right' },
    });
}

function header(slide: Slide, kicker: string, title: string, subtitle?: string) {
    slide.addText(kicker.toUpperCase(), { x: M, y: 0.38, w: CW, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: C.brand, charSpacing: 1, margin: 0, isTextBox: true });
    slide.addText(title, { x: M, y: 0.68, w: CW, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: C.ink, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    if (subtitle) slide.addText(subtitle, { x: M, y: 1.28, w: CW, h: 0.3, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0, isTextBox: true });
}

function content(pres: PptxGenJS, kicker: string, title: string, subtitle?: string): Slide {
    const slide = pres.addSlide({ masterName: CONTENT });
    header(slide, kicker, title, subtitle);
    return slide;
}

function note(slide: Slide, lines: (string | false | null | undefined)[]) {
    const text = lines.filter(Boolean).join('\n');
    if (text) slide.addNotes(text);
}

/** Тоон карт: шошго, том тоо, доор тайлбар. */
function stat(slide: Slide, x: number, y: number, w: number, h: number, label: string, value: string, helper?: string, tone?: 'danger' | 'gold') {
    slide.addShape('roundRect', { x, y, w, h, fill: { color: C.surface }, line: { color: C.surface }, rectRadius: 0.08 });
    slide.addText(label, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted, margin: 0, isTextBox: true });
    slide.addText(value, { x: x + 0.22, y: y + 0.46, w: w - 0.44, h: 0.62, fontFace: FONT, fontSize: value.length > 14 ? 20 : 26, bold: true, color: tone === 'danger' ? C.danger : tone === 'gold' ? C.gold : C.ink, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    if (helper) slide.addText(helper, { x: x + 0.22, y: y + 1.08, w: w - 0.44, h: Math.max(0.3, h - 1.2), fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, valign: 'top', isTextBox: true });
}

function statRow(slide: Slide, y: number, items: { label: string; value: string; helper?: string; tone?: 'danger' | 'gold' }[], h = 1.55) {
    const gap = 0.25;
    const w = (CW - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => stat(slide, M + index * (w + gap), y, w, h, item.label, item.value, item.helper, item.tone));
}

const headCell = (text: string, align: 'left' | 'right' | 'center' = 'left'): Cell => ({ text, options: { bold: true, color: C.muted, fill: { color: C.surface }, align } });
const bodyCell = (text: string, align: 'left' | 'right' | 'center' = 'left', extra: PptxGenJS.TableCellProps = {}): Cell => ({ text, options: { color: C.ink, align, ...extra } });

/** Хүснэгтийг шаардлагатай бол хэд хэдэн слайдад хуваана (гарчигт «1/2»). */
function tableSlides(pres: PptxGenJS, opts: {
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

/** Сарын төлөвлөгөө ба удирдлагын баталгаажуулсан гүйцэтгэл (гэрээний дүн, орсон мөнгө). */
function monthPlanSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const month = input.monthSales?.monthlyPerformance?.months?.[0];
    const weekly = input.weeklySales;
    if (!month && !weekly) return;
    const label = `${Number((weekly?.month.month ?? input.range.to).slice(5, 7))}-р сар`;
    const slide = content(pres, 'Борлуулалт', `${label}ын төлөвлөгөө ба гүйцэтгэл`, 'Төлөвлөгөө, баталгаажуулсан гүйцэтгэлийг удирдлага оруулна. Хоосон бол тооцоогүй.');
    const ratio = (actual: number | null | undefined, target: number | null | undefined) => actual === null || actual === undefined || !target ? '—' : `${Math.round(actual / target * 100)}%`;
    const contractActual = month?.manual_contract_actual_amount ?? null;
    const cashActual = month?.manual_cashflow_actual_amount ?? null;
    const undated = weekly?.sources.undatedContracts ?? 0;
    // Удирдлагын баталгаажуулсан дүн байхгүй бол гэрээний бүртгэл; огноогүй гэрээтэй бол бүрэн биш («N+» эсвэл «—»).
    const recorded = weekly ? knownPeriodAmount(weekly.month.total, weekly.month.count, undated) : null;
    const contractTarget = month?.target_amount ?? weekly?.month.target ?? null;
    statRow(slide, TOP, [
        { label: 'Гэрээний төлөвлөгөө', value: short(contractTarget), tone: 'gold' },
        { label: 'Гэрээний гүйцэтгэл', value: contractActual !== null ? short(contractActual) : weekly ? periodContractAmount(weekly.month.total, weekly.month.count, undated, short) : '—',
            helper: contractActual !== null ? 'Удирдлагын баталгаажуулсан' : weekly ? (undated ? undatedContractsShort(undated) : `${weekly.sources.contracts === 'erp' ? 'ERP' : 'CRM'}-ийн гэрээ, ${weekly.month.count} ш`) : undefined },
        { label: 'Гүйцэтгэлийн хувь', value: `${ratio(contractActual ?? recorded, contractTarget)}${contractActual === null && undated && recorded !== null && contractTarget ? '+' : ''}` },
    ]);
    const cashVisible = !!input.monthSales?.monthlyPerformance?.cashflowVisible;
    statRow(slide, TOP + 1.85, cashVisible ? [
        { label: 'Орсон мөнгөний төлөвлөгөө', value: short(month?.cashflow_target_amount ?? null), tone: 'gold' },
        { label: 'Орсон мөнгөний гүйцэтгэл', value: short(cashActual ?? weekly?.cash?.delta ?? null), helper: cashActual !== null ? 'Удирдлагын баталгаажуулсан' : weekly?.cash ? `ERP зөрүү ${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : undefined },
        { label: 'Гүйцэтгэлийн хувь', value: ratio(cashActual ?? weekly?.cash?.delta ?? null, month?.cashflow_target_amount ?? null) },
    ] : [
        { label: 'Мөнгөн орлого (ERP)', value: short(weekly?.cash?.delta ?? null), helper: weekly?.cash ? `${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : 'Хоёр долоо хоногийн ERP экспорт хэрэгтэй' },
        { label: 'Төлбөрийн хоцролт', value: short(weekly?.receivables?.overdue ?? null), helper: weekly?.receivables ? `${weekly.receivables.overdueContracts} гэрээ · үлдэгдэл ${short(weekly.receivables.balance)}` : 'ERP гэрээний экспорт хэрэгтэй', tone: weekly?.receivables?.overdue ? 'danger' : undefined },
    ]);
    note(slide, [
        weekly?.cash?.basis,
        cashVisible ? null : 'Орсон мөнгөний төлөвлөгөө, гүйцэтгэлийг санхүүгийн эрхтэй хүн харна.',
        'Гэрээний дүн, мөнгөн орлого, бартерыг холихгүй.',
        contractActual === null && undated ? undatedContractsHint(undated) : null,
    ]);
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
        bodyCell(money(report.week.lines.reduce((sum, line) => sum + (line.advance ?? 0), 0)), 'right', { bold: true }),
        bodyCell(money(report.week.lines.reduce((sum, line) => sum + (line.paid ?? 0), 0)), 'right', { bold: true }), bodyCell(''), bodyCell('')];
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
    const total = periodContractAmount(m.total, m.count, undated, short);
    const subtitle = m.target ? `${total} / төлөвлөгөө ${short(m.target)} · ${m.attainmentPct === null ? '—' : `${m.attainmentPct}%${undated ? '+' : ''}`}` : `${total} · сарын төлөвлөгөө тохируулаагүй`;
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
        notes: ['«Хүлээлгэсэн» байр зарагдсанд тооцогдоно, «Худалдаанд»-д хэзээ ч орохгүй.'],
    });
}

type FloorMap = NonNullable<WeeklySalesReport['inventory']>['floorMaps'][number];
type FloorCell = FloorMap['floors'][number]['cells'][string][number];
const floorFill = (cell: FloorCell) => cell.barter && cell.status !== 'available' ? C.neutralSoft
    : cell.status === 'sold' || cell.status === 'handed_over' ? C.successSoft
        : cell.status === 'available' ? C.white : C.pendingSoft;

function legend(slide: Slide, y: number) {
    const items: [string, string][] = [[C.successSoft, 'Гэрээтэй (зарагдсан, хүлээлгэсэн)'], [C.white, 'Худалдаанд'], [C.pendingSoft, 'Бусад (захиалсан, хадгалсан)'], [C.neutralSoft, 'Бартер']];
    let x = M;
    for (const [color, label] of items) {
        slide.addShape('rect', { x, y: y + 0.06, w: 0.18, h: 0.18, fill: { color }, line: { color: C.line, width: 0.75 } });
        slide.addText(label, { x: x + 0.25, y, w: 3, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, isTextBox: true });
        x += 0.35 + label.length * 0.075;
    }
}

/** Давхрын зураглал: давхар × загвар, худалдаанд байгаа байр цагаан, зарагдсанд менежерийн нэр. */
function floorMapSlides(pres: PptxGenJS, report: WeeklySalesReport) {
    // Мөр ≥ 0.22" (8pt) байхаар хуваана: 21-ээс олон давхартай блок 2+ слайдад тэнцүү хуваагдана.
    const maxFloors = Math.floor((BOTTOM - TOP) / 0.22) - 2;
    for (const map of report.inventory?.floorMaps ?? []) {
        const chunks = Math.max(1, Math.ceil(map.floors.length / maxFloors));
        const chunkSize = Math.ceil(map.floors.length / chunks);
        for (let chunk = 0; chunk < chunks; chunk++) {
            const floors = map.floors.slice(chunk * chunkSize, (chunk + 1) * chunkSize);
            const slide = content(pres, 'Үлдэгдэл', `Орон сууцны үлдэгдэл — ${map.block} блок${chunks > 1 ? ` (${chunk + 1}/${chunks})` : ''}`);
            legend(slide, 1.3);
            const countW = 1.0;
            const floorW = 0.75;
            const modelW = (CW - floorW - countW * 4) / Math.max(1, map.models.length);
            const rowH = Math.min(0.42, (BOTTOM - TOP) / (floors.length + 2));
            const fontSize = rowH >= 0.3 ? 9 : 8;
            const head = [headCell('Давхар'), ...map.models.map(model => headCell(model, 'center')), headCell('Гэрээтэй', 'center'), headCell('Худалдаанд', 'center'), headCell('Бусад', 'center'), headCell('Бартер', 'center')]
                .map(cell => ({ ...cell, options: { ...cell.options, fontSize: 8 } }));
            const rows = floors.map(row => [
                bodyCell(`${row.floor}`, 'left', { bold: true, color: C.ink2 }),
                ...map.models.map(model => {
                    const cells = row.cells[model] ?? [];
                    if (!cells.length) return bodyCell('', 'center', { fill: { color: C.surface } });
                    const text = cells.map(cell => `${cell.area !== null ? area(cell.area) : cell.code}${cell.status !== 'available' && cell.manager ? ` ${managerShort(cell.manager)}` : ''}`).join('\n');
                    return bodyCell(text, 'center', { fill: { color: floorFill(cells[0]) }, color: cells[0].status === 'available' ? C.brand : C.ink, bold: cells[0].status === 'available' });
                }),
                bodyCell(String(row.counts.sold), 'center'), bodyCell(String(row.counts.available), 'center', { bold: true, color: C.brand }), bodyCell(String(row.counts.other), 'center'), bodyCell(String(row.counts.barter), 'center'),
            ]);
            const last = chunk === chunks - 1;
            const footer = [bodyCell('Нийт', 'left', { bold: true, colspan: map.models.length + 1 }), bodyCell(String(map.totals.sold), 'center', { bold: true }), bodyCell(String(map.totals.available), 'center', { bold: true, color: C.brand }), bodyCell(String(map.totals.other), 'center', { bold: true }), bodyCell(String(map.totals.barter), 'center', { bold: true })];
            slide.addTable([head, ...rows, ...(last ? [footer] : [])], {
                x: M, y: TOP, w: CW, colW: [floorW, ...map.models.map(() => modelW), countW, countW, countW, countW], rowH, fontFace: FONT, fontSize,
                border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.01, 0.03, 0.01, 0.03], autoPage: false,
            });
            note(slide, [`${map.block} блок: гэрээтэй ${map.totals.sold}, худалдаанд ${map.totals.available}, бусад ${map.totals.other}, бартер ${map.totals.barter}.`, 'Цэнхэр тоо = худалдаанд байгаа байр (м²).']);
        }
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

/** Facebook хуудас, CallPro, SMS-ийн оруулсан экспорт — гол үзүүлэлт. Meta зарыг дараагийн слайдууд (`metaAdsSlides`) дэлгэрэнгүй харуулна. */
function channelExportSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const channels = input.channels;
    if (!channels) return;
    const meta = !!channels.meta_ads?.report;
    const present = CHANNEL_SOURCES.filter(source => source !== 'meta_ads' && channels[source]?.report);
    const missing = CHANNEL_SOURCES.filter(source => !channels[source]?.report);
    const slide = content(pres, 'Маркетинг', 'Сувгийн экспорт', missing.length ? `Экспорт оруулаагүй: ${missing.map(source => CHANNEL_SOURCE_LABELS[source]).join(', ')}` : undefined);
    if (!present.length) {
        slide.addText(meta
            ? 'Энэ долоо хоногт Facebook хуудас, CallPro, SMS-ийн экспорт оруулаагүй байна. Маркетинг → Экспорт импорт хуудсанд файлаа оруулна уу. Meta зарын тайлан дараагийн слайдуудад.'
            : 'Энэ долоо хоногт сувгийн экспорт оруулаагүй байна. Маркетинг → Экспорт импорт хуудсанд Meta Ads, Facebook хуудас, CallPro, SMS-ийн файлаа оруулна уу. Зарын данс холбогдсон бол Meta зарыг Meta API автоматаар татна.',
        { x: M, y: TOP, w: CW, h: 0.9, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
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
        const currency = channelCurrency(report.totals);
        const keys = channelKeyMetrics(source).filter(key => report.totals[key] !== undefined).slice(0, 6);
        slide.addShape('roundRect', { x, y, w, h, fill: { color: C.surface }, line: { color: C.surface }, rectRadius: 0.08 });
        slide.addText([
            { text: CHANNEL_SOURCE_LABELS[source], options: { bold: true, fontSize: 14, color: C.ink } },
            { text: `   ${dot(report.period_from)} – ${dot(report.period_to)} · Экспорт файл`, options: { fontSize: 10, color: C.muted } },
        ], { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: 0.35, fontFace: FONT, margin: 0, isTextBox: true });
        const metricW = (w - 0.4) / 3;
        keys.forEach((key, metricIndex) => {
            const mx = x + 0.2 + (metricIndex % 3) * metricW;
            const my = y + 0.55 + Math.floor(metricIndex / 3) * Math.min(0.9, (h - 0.7) / 2);
            const delta = channels[source].comparison?.[key];
            const change = formatChannelDelta(delta);
            slide.addText([
                { text: channelMetric(source, key)?.label ?? key, options: { fontSize: 10, color: C.muted, breakLine: true } },
                { text: formatChannelMetric(source, key, report.totals[key], currency), options: { fontSize: 18, bold: true, color: C.ink, breakLine: !!change } },
                ...(change ? [{ text: change, options: { fontSize: 10, color: delta!.delta! > 0 ? C.success : delta!.delta! < 0 ? C.danger : C.muted } }] : []),
            ], { x: mx, y: my, w: metricW - 0.1, h: 0.85, fontFace: FONT, margin: 0, valign: 'top', isTextBox: true });
        });
    });
    note(slide, ['Viewers зэрэг давхардах тоог мөрүүдээр нэмээгүй.', meta ? 'Meta зарын тайланг дараагийн слайдууд дэлгэрэнгүй харуулна.' : null]);
}

/** Задаргааны мөрийн нэг үр дүнгийн өртөг (reach бол 1000 хүнд); валютыг баганын гарчигт бичнэ. */
function metaRowCost(row: BreakdownRow): string {
    const value = row.values.cost_per_result;
    if (isMetaResultType(row.tag)) return metaCostText(row.tag, value);
    return typeof value === 'number' ? formatChannelValue(value, 'money') : '—';
}

/**
 * Meta зар — Ads Manager-ийн хураангуй шиг: (1) нийт үзүүлэлт өмнөх долоо хоногтой, (2) үр дүн
 * төрлөөр нэг үр дүнгийн өртөгтэй, (3) кампанит ажлаар. Зөвхөн хурлын долоо хоногийн `meta_ads`
 * сувгийн тайлангаас (Meta API эсвэл Ads Manager-ийн экспорт). Зардал дансны валютаар — ₮ биш,
 * төгрөгийн дүнд нэмэхгүй; үр дүнг төрөл хооронд, reach-ийг өдөр/кампанит ажлаар нэмэхгүй; CRM-ийн
 * лид, гэрээтэй холбохгүй. Тайлангүй бол слайд нэмэхгүй (сувгийн слайд дутууг нэрлэнэ).
 */
function metaAdsSlides(pres: PptxGenJS, input: WeeklyDeckInput) {
    const match = input.channels?.meta_ads;
    const report = match?.report;
    if (!match || !report) return;
    const kicker = 'Маркетинг · Meta зар';
    const totals = report.totals;
    const currency = channelCurrency(totals);
    const period = { from: report.period_from, to: report.period_to };
    const coverage = reportCoverage(report);
    const blocked = comparisonBlockedByCoverage(match.comparison);
    // Хуудастай адил харьцуулалтаас (`comparison`) уншина: өмнөх тайлангийн утгатай үзүүлэлт байвал л харьцуулна.
    const previous = match.previous;
    const compared = !blocked && Object.values(match.comparison ?? {}).some(delta => delta.previous !== null);
    const against = previous && shiftReviewDate(previous.period_to, 1) !== report.period_from ? 'Өмнөх тайлан' : 'Өмнөх 7 хоног';
    const mixedCurrency = report.warnings.some(warning => warning.code === 'mixed_currency');
    const unit = currency ? ` (${currency})` : typeof totals.spend === 'number' ? ' (валют тодорхойгүй)' : '';
    const origin = report.origin === 'api' ? 'Meta API' : 'Экспорт файл';
    const subtitle = [
        span(period), origin,
        match.longer ? `хурлын долоо хоногоос урт тайлан (${periodDays(period)} өдөр)` : match.exact ? null : 'хурлын долоо хоногтой зөрүүтэй',
        coverage?.partial ? `${coverage.covered}/${coverage.days} өдөр (${dot(report.data_from!)} – ${dot(report.data_to!)})` : null,
    ].filter(Boolean).join(' · ');
    const sourceNote = report.origin === 'api'
        ? 'Эх сурвалж: Meta Marketing API (зарын данс, 6 цаг тутмын синк). Дансны өнөөдрийг оруулдаггүй тул хурлын өглөө сүүлийн өдөр дутуу байж болно.'
        : `Эх сурвалж: Ads Manager-ийн экспорт файл${report.file_name ? ` «${report.file_name}»` : ''}.`;
    const currencyNote = `Зардал зарын дансны валютаар${currency ? ` (${currency})` : ''} — төгрөгт хөрвүүлээгүй, төгрөгийн зардал, төсөвт нэмээгүй.`;
    const untyped = metaUntypedSpend(totals);
    const untypedNote = untyped !== null ? `Үр дүнгийн төрөлд хуваарилаагүй зардал: ${formatChannelValue(untyped, 'money', currency)} (нийт зардалд орсон, төрлийн зардалд ороогүй).` : null;

    // 1. Нийт үзүүлэлт.
    const missingHelper: Record<string, string> = { reach: 'Тооцоогүй — өдрийн reach-ийг нэмэхгүй', frequency: typeof totals.reach === 'number' ? 'Тооцоогүй' : 'Reach-гүй тул тооцоогүй' };
    const card = (key: string) => {
        const def = channelMetric('meta_ads', key);
        const value = totals[key];
        const money = def?.kind === 'money';
        const parts: string[] = [];
        if (typeof value !== 'number') parts.push(money && mixedCurrency ? 'Өөр валют холилдсон — тооцоогүй' : missingHelper[key] ?? 'Тооцоогүй');
        else {
            if (money && !currency) parts.push('Валют тодорхойгүй — төгрөг биш');
            const delta = match.comparison?.[key];
            if (compared && delta) {
                if (delta.reason === 'currency') parts.push('Валют өөр — харьцуулаагүй');
                else parts.push([`${against} ${formatChannelMetric('meta_ads', key, delta.previous, currency)}`, formatChannelDelta(delta)].filter(Boolean).join(' · '));
            }
        }
        return { label: def?.label ?? key, value: typeof value === 'number' ? formatChannelMetric('meta_ads', key, value, currency) : '—', helper: parts.join(' · ') || undefined };
    };
    const summary = content(pres, kicker, 'Meta зар — долоо хоногийн тойм', subtitle);
    statRow(summary, TOP, META_WEEK_KEYS.slice(0, 4).map(card), 1.7);
    statRow(summary, TOP + 1.95, META_WEEK_KEYS.slice(4).map(card), 1.7);
    const important = report.warnings.filter(warning => warning.level === 'warning');
    const footnotes = [
        blocked ? 'Өдөр дутуу тул өмнөх долоо хоногтой харьцуулаагүй.' : !compared ? 'Өмнөх ижил хугацааны Meta тайлан алга — харьцуулаагүй.' : null,
        previous && against === 'Өмнөх тайлан' && compared ? `Харьцуулсан тайлан: ${span({ from: previous.period_from, to: previous.period_to })}.` : null,
        currencyNote,
        important.length ? `${important.length} анхааруулга — слайдын тэмдэглэлд.` : null,
    ].filter((line): line is string => !!line);
    summary.addText(footnotes.join('\n'), { x: M, y: TOP + 3.85, w: CW, h: BOTTOM - TOP - 3.9, fontFace: FONT, fontSize: 12, color: C.ink2, margin: 0, valign: 'top', isTextBox: true, paraSpaceAfter: 3 });
    note(summary, [
        sourceNote,
        currencyNote,
        'Reach = Meta-гийн тухайн хугацааны давхардалгүй хүрсэн хүн (дансны түвшинд); өдрийн reach-ийг нэмээгүй. Frequency = Impressions / Reach.',
        'CPM = зардал / харагдалт × 1000. Link CTR = link click / харагдалт.',
        compared && previous ? `Харьцуулалт: ${span({ from: previous.period_from, to: previous.period_to })} (${previous.origin === 'api' ? 'Meta API' : 'экспорт файл'}).` : null,
        untypedNote,
        ...report.warnings.map(warning => `${warning.level === 'warning' ? 'Анхааруулга' : 'Тэмдэглэл'}: ${warning.message}`),
    ]);

    // 2. Үр дүн төрлөөр — төрөл хооронд нийлбэргүй.
    const types = metaResultsByType(totals);
    if (types.length || typeof totals.results === 'number') {
        const showDelta = compared && types.some(row => match.comparison?.[metaResultKey(row.type)]);
        const head = [headCell('Үр дүн'), headCell('Тоо', 'right'), ...(showDelta ? [headCell(against, 'right')] : []), headCell(`Зардал${unit}`, 'right'), headCell(`Нэг үр дүнгийн өртөг${unit}`, 'right')];
        const muted = { color: C.muted };
        const rows: Cell[][] = types.length ? types.map(row => {
            const delta = match.comparison?.[metaResultKey(row.type)];
            const change = delta && delta.previous !== null ? [count(delta.previous), formatChannelDelta(delta)].filter(Boolean).join(' · ') : '—';
            return [
                bodyCell(row.label, 'left', { bold: true, ...(row.idle ? muted : {}) }),
                bodyCell(count(row.results), 'right', { bold: !row.idle, ...(row.idle ? muted : {}) }),
                ...(showDelta ? [bodyCell(change, 'right')] : []),
                bodyCell(row.spend === null ? '—' : formatChannelValue(row.spend, 'money'), 'right', row.idle ? muted : {}),
                bodyCell(row.idle ? 'хүргэлтгүй' : metaCostText(row.type, row.cost), 'right', row.idle ? muted : {}),
            ];
        }) : [[
            bodyCell('Results (төрөл тодорхойгүй)', 'left', { bold: true }), bodyCell(count(totals.results as number), 'right', { bold: true }),
            bodyCell('—', 'right'), bodyCell(typeof totals.cost_per_result === 'number' ? formatChannelValue(totals.cost_per_result, 'money') : '—', 'right'),
        ]];
        // Зардлын мөр: тоо (ба өмнөхтэй харьцуулалт)-ын нүд хоосон — үр дүнг төрөл хооронд нэмэхгүй.
        const spendRow = (label: string, amount: number, style: PptxGenJS.TableCellProps): Cell[] => [bodyCell(label, 'left', style),
            ...Array.from({ length: showDelta ? 2 : 1 }, () => bodyCell('', 'right')), bodyCell(formatChannelValue(amount, 'money'), 'right', style), bodyCell('', 'right')];
        if (untyped !== null) rows.push(spendRow('Үр дүнгийн төрөлгүй зардал', untyped, { italic: true, ...muted }));
        if (typeof totals.spend === 'number') rows.push(spendRow('Нийт зардал', totals.spend, { bold: true }));
        const slide = content(pres, kicker, 'Meta зар — үр дүн төрлөөр', [span(period),
            mixedCurrency ? 'өөр валют холилдсон тул зардал тооцоогүй' : 'зардлыг кампанит ажлын зорилгоор хуваарилсан', blocked ? 'өдөр дутуу тул харьцуулаагүй' : null].filter(Boolean).join(' · '));
        const fontSize = rows.length > 8 ? 12 : 14;
        slide.addTable([head, ...rows], {
            x: M, y: TOP, w: CW, colW: showDelta ? [4.333, 1.6, 2.5, 1.8, 1.9] : [5.333, 2.0, 2.2, 2.6], fontFace: FONT, fontSize,
            border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1], autoPage: false,
        });
        const approximate = report.origin === 'api' && report.warnings.some(warning => warning.code === 'field_ignored');
        const footnotes = [
            types.some(row => row.results === null) ? '«—» = хүрсэн хүнийг өдөр, кампанит ажлаар нэмэхгүй тул тоолоогүй (зардлыг харуулав).' : null,
            approximate ? 'Зарим үр дүнг ad set-ийн зорилгоор ойролцоогоор тооцсон — тэмдэглэлийг үзнэ үү.' : null,
        ].filter((line): line is string => !!line);
        // Хүснэгт богино бол (≤ 9 мөр) доод талд тайлбар; урт бол тэмдэглэлд л.
        if (footnotes.length && rows.length <= 9) {
            slide.addText(footnotes.join('\n'), { x: M, y: BOTTOM - 0.55, w: CW, h: 0.55, fontFace: FONT, fontSize: 11, color: C.muted, margin: 0, valign: 'bottom', isTextBox: true });
        }
        note(slide, [
            'Үр дүн = Meta-гийн зарын платформын үзүүлэлт (Ads Manager-ийн Results), Hub-ийн бүртгэлтэй холбож тооцоогүй. Өөр төрлийн үр дүнг нэг тоонд нэмээгүй.',
            'Төрлийн зардал = тухайн төрлийн үр дүнтэй кампанит ажлын бүх зардал. Нэг үр дүнгийн өртөг = төрлийн зардал / үр дүн; хүрсэн хүн бол 1000 хүнд.',
            types.some(row => row.idle) ? '«хүргэлтгүй» = өөр долоо хоногт идэвхтэй байсан төрөл энэ долоо хоногт зар хүргээгүй (0 үр дүн, 0 зардал).' : null,
            untypedNote,
            ...footnotes,
        ]);
    }

    // 3. Кампанит ажлаар.
    const campaigns = metaCampaignRows(report);
    if (!campaigns.length) return;
    const money = typeof totals.spend === 'number';
    const withReach = campaigns.some(row => typeof row.values.reach === 'number');
    const named = new Set(campaigns.map(row => row.label)).size;
    const truncated = report.warnings.some(warning => warning.code === 'truncated');
    const value = (row: BreakdownRow, key: string) => typeof row.values[key] === 'number' ? row.values[key] : null;
    tableSlides(pres, {
        kicker, title: 'Meta зар — кампанит ажлаар',
        subtitle: `${span(period)} · ${named} кампанит ажил${campaigns.length > named ? `, ${campaigns.length} мөр (үр дүнгийн төрлөөр)` : ''} · зардлаар эрэмбэлсэн${truncated ? ' · эхний 100 мөр' : ''}`,
        head: [headCell('Кампанит ажил'), headCell('Үр дүнгийн төрөл'), headCell('Үр дүн', 'right'), headCell(`Нэг үр дүнгийн өртөг${unit}`, 'right'), headCell(`Зардал${unit}`, 'right'),
            headCell('Impressions', 'right'), ...(withReach ? [headCell('Reach', 'right')] : []), headCell('Link clicks', 'right')],
        rows: campaigns.map(row => [
            bodyCell(clipWords(row.label.replace(/\s+/g, ' ').trim() || '(нэргүй)', 80)), bodyCell(metaRowTypeLabel(row), 'left', isMetaResultType(row.tag) ? {} : { color: C.muted }),
            bodyCell(count(value(row, 'results')), 'right', { bold: true }), bodyCell(metaRowCost(row), 'right'),
            bodyCell(money && value(row, 'spend') !== null ? formatChannelValue(value(row, 'spend')!, 'money') : '—', 'right'),
            bodyCell(count(value(row, 'impressions')), 'right'), ...(withReach ? [bodyCell(count(value(row, 'reach')), 'right')] : []), bodyCell(count(value(row, 'link_clicks')), 'right'),
        ]),
        colW: withReach ? [3.6, 1.75, 0.95, 1.6, 1.15, 1.15, 1.0, 0.933] : [4.1, 1.85, 1.05, 1.65, 1.25, 1.25, 0.983], perSlide: 11, fontSize: 11,
        notes: [
            'Кампанит ажил бүр үр дүнгийн төрлөөрөө тусдаа мөр: олон төрлийн ad set-тэй кампанит ажил хэд хэдэн мөртэй.',
            'Үр дүнг төрөл хооронд, хүрсэн хүнийг (Reach) кампанит ажил хооронд нэмэхгүй. Reach нь зөвхөн Meta-гийн давхардалгүй тоо ирсэн мөрт.',
            money ? currencyNote : 'Файлд өөр валют холилдсон тул кампанит ажлын зардал, өртгийг харуулаагүй.',
            truncated ? 'Задаргаанд зардлаар эхний 100 мөр хадгалагдсан; нийт дүнд бүх кампанит ажил орсон.' : '',
            sourceNote,
        ].filter(Boolean),
    });
}

function imageGrid(slide: Slide, images: DeckImage[], box: { x: number; y: number; w: number; h: number }) {
    const n = images.length;
    const portrait = images.every(image => image.height > image.width);
    const cols = n <= 3 ? n : n === 4 ? (portrait ? 4 : 2) : 3;
    const rows = Math.ceil(n / cols);
    const gap = 0.25;
    const cellW = (box.w - gap * (cols - 1)) / cols;
    const cellH = (box.h - gap * (rows - 1)) / rows;
    images.forEach((image, index) => {
        const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
        let w = cellW;
        let h = w / ratio;
        if (h > cellH) { h = cellH; w = h * ratio; }
        const x = box.x + (index % cols) * (cellW + gap) + (cellW - w) / 2;
        const y = box.y + Math.floor(index / cols) * (cellH + gap) + (cellH - h) / 2;
        slide.addImage({ data: image.data, x, y, w, h, altText: `Слайдын зураг ${index + 1}` });
    });
}

/** Зураг (≤ 6) ба тайлбар: богино тайлбар доор, урт бол баруун талд. Зураггүй бол тайлбар бүтэн слайдад. */
function layoutImages(slide: Slide, loaded: DeckImage[], text: string, top: number) {
    if (loaded.length) {
        const longNote = text.length > 220;
        const box = longNote
            ? { x: M, y: top, w: CW * 0.62, h: BOTTOM - top }
            : { x: M, y: top, w: CW, h: (text ? 5.95 : BOTTOM) - top };
        imageGrid(slide, loaded, box);
        if (text) {
            slide.addText(clip(text, 1400), longNote
                ? { x: M + CW * 0.62 + 0.3, y: top, w: CW * 0.38 - 0.3, h: BOTTOM - top, fontFace: FONT, fontSize: 13, color: C.ink2, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true }
                : { x: M, y: 6.05, w: CW, h: 0.8, fontFace: FONT, fontSize: 14, color: C.ink2, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true });
        }
    } else if (text) {
        slide.addText(clip(text, 2000), { x: M, y: top, w: CW, h: BOTTOM - top, fontFace: FONT, fontSize: text.length > 700 ? 13 : text.length > 300 ? 16 : 20, color: C.ink, margin: 0, valign: 'top', fit: 'shrink', isTextBox: true, paraSpaceAfter: 6 });
    }
}

/** Хэрэглэгчийн оруулсан слайд: сэдэв, зураг (≤ 6), тайлбар/дүгнэлт. */
function customSlide(pres: PptxGenJS, slideData: WeeklySlide, images: Record<string, DeckImage>) {
    const label = `${WEEKLY_SLIDE_PART_LABEL[slideData.part]} · ${WEEKLY_SLIDE_SECTION_LABEL[slideData.section]}`;
    const slide = content(pres, label, slideData.title || WEEKLY_SLIDE_SECTION_LABEL[slideData.section]);
    const loaded = slideData.image_paths.map(path => images[path]).filter((image): image is DeckImage => !!image);
    const missing = slideData.image_paths.length - loaded.length;
    const text = slideData.note.trim();
    layoutImages(slide, loaded, text, TOP - 0.25);
    note(slide, [
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
    defineLayouts(pres, input.projectName);
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
        metaAdsSlides(pres, input);
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

export function weeklyDeckFileName(projectName: string, meetingDate: string, kind: WeeklyDeckKind): string {
    const safe = projectName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Vertmon';
    return `${safe} - ${WEEKLY_DECK_LABEL[kind]} - Лхагва ${meetingDate}.pptx`;
}
