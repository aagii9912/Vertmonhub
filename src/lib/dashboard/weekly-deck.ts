import type PptxGenJS from 'pptxgenjs';
import type { OperationsReport } from './operations-report';
import type { WeeklySalesReport } from './weekly-sales';
import type { WeeklyContentPlan, WeeklyUpdate } from './weekly-review';
import { formatReviewChange, updatePart } from './weekly-review';
import { WEEKLY_SLIDE_PART_LABEL, WEEKLY_SLIDE_SECTION_LABEL, type WeeklySlide } from './weekly-slides';
import type { MarketingPerformance } from '@/lib/marketing/performance';
import type { BudgetOverview } from '@/lib/marketing/budget';
import type { ChannelReportMatches } from '@/lib/marketing/channel-reports-load';
import { CHANNEL_SOURCE_LABELS, CHANNEL_SOURCES, channelKeyMetrics, channelMetric, type ChannelSource } from '@/lib/marketing/channel-reports';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, contentPlatformLabel, type ContentItem, type ContentPlanSummary } from '@/lib/marketing/content-plan';
import { formatMNT, formatMNTShort } from '@/lib/utils/currency';
import { MONTHLY_SALES_BLOCK_LABELS, MONTHLY_SALES_BLOCKS, monthlySalesAttainment, type MonthlySalesField } from '@/lib/sales/monthly';

/**
 * Лхагва гарагийн хурлын тайланг PowerPoint (.pptx) болгоно — хурлыг слайдаар явуулдаг тул.
 * Борлуулалт, маркетинг хоёр тусдаа файл: маркетингийн алба контент бүтээж, өөрийн төлөвлөгөөгөөр
 * ажилладаг тул маркетингийн слайд лид, гэрээгээр биш контент төлөвлөгөөний гүйцэтгэл, нийтэлсэн
 * контент (постертой), сувгийн үзүүлэлт, төсөв, дараагийн 7 хоногийн төлөвлөгөөгөөр бүрдэнэ.
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
    statRow(slide, TOP, [
        { label: 'Шинэ лид', value: count(sales.leads.newCount), helper: formatReviewChange(sales.leads.newCount, prev?.leads.newCount) },
        { label: 'Байгуулсан гэрээ', value: count(sales.contracts.count), helper: formatReviewChange(sales.contracts.count, prev?.contracts.count) },
        { label: 'Гэрээний бүртгэлтэй дүн', value: short(sales.contracts.value), helper: prev ? `Өмнөх ${short(prev.contracts.value)}${prev.contracts.missingAmounts ? ' · дүн дутуу' : ''}` : 'Өмнөх хугацааны мэдээлэл байхгүй' },
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
        sales.contracts.missingAmounts || sales.contracts.undatedCount ? `Дүн дутуу ${sales.contracts.missingAmounts}, огноогүй ${sales.contracts.undatedCount} гэрээ.` : null,
    ]);
}

/**
 * Сарын төлөвлөгөө ба удирдлагын баталгаажуулсан гүйцэтгэл: Б1 / Б2 / зогсоол × гэрээний тоо,
 * гэрээний дүн, мөнгөн урсгал (эзэмшигчийн Excel-ийн бүтэц). Нийт мөрийн гүйцэтгэл оруулаагүй бол
 * ERP/CRM-ийн сарын гэрээ, ERP-ийн мөнгөн зөрүүг «*» тэмдэгтэйгээр эх сурвалжтай нь харуулна.
 */
function monthPlanSlide(pres: PptxGenJS, input: WeeklyDeckInput) {
    const month = input.monthSales?.monthlyPerformance?.months?.[0];
    const weekly = input.weeklySales;
    if (!month && !weekly) return;
    const label = `${Number((weekly?.month.month ?? input.range.to).slice(5, 7))}-р сар`;
    const cashVisible = !!input.monthSales?.monthlyPerformance?.cashflowVisible;
    const slide = content(pres, 'Борлуулалт', `${label}ын төлөвлөгөө ба гүйцэтгэл`, 'Төлөвлөгөө, баталгаажуулсан гүйцэтгэлийг удирдлага блокоор оруулна. Хоосон нүд «—» — оруулаагүй.');
    const system = weekly?.sources.contracts ? weekly.sources.contracts === 'erp' ? 'ERP' : 'CRM' : null;
    const fallback: Partial<Record<MonthlySalesField, number | null>> = {
        manual_contract_actual_count: system ? weekly!.month.count : null,
        manual_contract_actual_amount: system ? weekly!.month.total : null,
        manual_cashflow_actual_amount: weekly?.cash?.delta ?? null,
    };
    const groups: { label: string; plan: MonthlySalesField; actual: MonthlySalesField; format: (value: number | null) => string }[] = [
        { label: 'Гэрээний тоо', plan: 'target_count', actual: 'manual_contract_actual_count', format: count },
        { label: 'Гэрээний дүн', plan: 'target_amount', actual: 'manual_contract_actual_amount', format: short },
        ...(cashVisible ? [{ label: 'Мөнгөн урсгал', plan: 'cashflow_target_amount' as const, actual: 'manual_cashflow_actual_amount' as const, format: short }] : []),
    ];
    const attained = (actual: number | null, plan: number | null) => pct(monthlySalesAttainment(actual, plan));
    const groupCells = (plan: number | null, actual: number | null, format: (value: number | null) => string, mark = '') => [
        bodyCell(format(plan), 'right'), bodyCell(`${format(actual)}${actual === null ? '' : mark}`, 'right'),
        bodyCell(attained(actual, plan), 'right', { bold: true, color: C.gold }),
    ];
    const head: Cell[][] = [
        [{ text: 'Блок / төрөл', options: { rowspan: 2, bold: true, color: C.muted, fill: { color: C.surface }, valign: 'middle' } },
            ...groups.map(group => ({ text: group.label, options: { colspan: 3, bold: true, color: C.ink, fill: { color: C.surface }, align: 'center' as const } }))],
        groups.flatMap(() => ['Төлөвлөгөө', 'Гүйцэтгэл', '%'].map(text => ({ text, options: { ...headCell(text, 'right').options, fontSize: 11 } }))),
    ];
    const rows = MONTHLY_SALES_BLOCKS.filter(block => month?.block_amounts?.[block]).map(block => {
        const cells = month!.block_amounts![block]!;
        return [bodyCell(MONTHLY_SALES_BLOCK_LABELS[block], 'left', { bold: true }),
            ...groups.flatMap(group => groupCells(cells[group.plan] ?? null, cells[group.actual] ?? null, group.format))];
    });
    const estimated: string[] = [];
    const total = groups.flatMap(group => {
        const plan = month?.[group.plan] ?? (group.plan === 'target_amount' ? weekly?.month.target ?? null : null);
        const entered = month?.[group.actual] ?? null;
        const actual = entered ?? fallback[group.actual] ?? null;
        if (entered === null && actual !== null) estimated.push(group.label);
        return groupCells(plan, actual, group.format, entered === null ? '*' : '');
    });
    const fill = { fill: { color: C.brandSoft } };
    rows.push([bodyCell('Нийт', 'left', { bold: true, ...fill }), ...total.map(cell => ({ ...cell, options: { ...cell.options, bold: true, ...fill } }))]);
    const firstW = 1.15;
    const weights = groups.flatMap(group => group.plan === 'target_count' ? [1.2, 1.05, 0.75] : [1.6, 1.6, 0.75]);
    const scale = (CW - firstW) / weights.reduce((sum, weight) => sum + weight, 0);
    const rowH = 0.5;
    slide.addTable([...head, ...rows], {
        x: M, y: TOP, w: CW, colW: [firstW, ...weights.map(weight => weight * scale)], rowH, fontFace: FONT, fontSize: 12,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.04, 0.07, 0.04, 0.07], autoPage: false,
    });
    let y = TOP + rowH * (head.length + rows.length) + 0.12;
    if (estimated.length) {
        const sources = [
            estimated.some(label => label !== 'Мөнгөн урсгал') && system ? `${system}-ийн сарын гэрээ (${count(weekly!.month.count)} ш, ${short(weekly!.month.total)})` : null,
            estimated.includes('Мөнгөн урсгал') && weekly?.cash ? `ERP-ийн төлсөн дүнгийн зөрүү ${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : null,
        ].filter(Boolean).join('; ');
        slide.addText(`* Удирдлага гүйцэтгэл оруулаагүй тул системийн тоо: ${sources}.`, { x: M, y, w: CW, h: 0.3, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, isTextBox: true });
        y += 0.35;
    }
    if (!cashVisible) {
        statRow(slide, Math.max(y + 0.1, 5.1), [
            { label: 'Мөнгөн орлого (ERP)', value: short(weekly?.cash?.delta ?? null), helper: weekly?.cash ? `${dot(weekly.cash.from)} → ${dot(weekly.cash.to)}` : 'Хоёр долоо хоногийн ERP экспорт хэрэгтэй' },
            { label: 'Төлбөрийн хоцролт', value: short(weekly?.receivables?.overdue ?? null), helper: weekly?.receivables ? `${weekly.receivables.overdueContracts} гэрээ · үлдэгдэл ${short(weekly.receivables.balance)}` : 'ERP гэрээний экспорт хэрэгтэй', tone: weekly?.receivables?.overdue ? 'danger' : undefined },
        ], 1.45);
    }
    note(slide, [
        weekly?.cash?.basis,
        rows.length === 1 ? 'Блокийн задаргаа оруулаагүй тул зөвхөн нийт дүн.' : null,
        cashVisible ? null : 'Орсон мөнгөний төлөвлөгөө, гүйцэтгэлийг санхүүгийн эрхтэй хүн харна.',
        'Гэрээний тоо, гэрээний дүн, мөнгөн орлого, бартерыг холихгүй.',
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
    if (!rows.length) {
        const slide = content(pres, 'Борлуулалт', 'Энэ долоо хоногийн гэрээ', span(report.range));
        slide.addText('Тайлант долоо хоногт гэрээ бүртгэгдээгүй.', { x: M, y: TOP, w: CW, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    tableSlides(pres, {
        kicker: 'Борлуулалт', title: 'Энэ долоо хоногийн гэрээ',
        subtitle: `${span(report.range)} · ${report.week.byKind.map(kind => `${kind.label} ${kind.count}`).join(' · ')}${report.week.barter ? ` · бартер ${report.week.barter}` : ''}`,
        head, rows, footer, colW: [0.7, 1.15, 0.8, 0.75, 2.0, 0.65, 1.45, 1.4, 1.35, 1.0, 0.88], perSlide: 11, fontSize: 10,
        notes: ['Захиалагчийн нэрийг зөвхөн гэрээний эрхтэй хэрэглэгч харна; регистрийн дугаар гаргахгүй.', 'Хоосон дүнг 0 гэж тооцоогүй («—»).'],
    });
}

function monthSlide(pres: PptxGenJS, report: WeeklySalesReport) {
    const m = report.month;
    const slide = content(pres, 'Борлуулалт', `${Number(m.month.slice(5))}-р сарын гэрээ долоо хоногоор`, m.target ? `${short(m.total)} / төлөвлөгөө ${short(m.target)} · ${m.attainmentPct}%` : `${short(m.total)} · сарын төлөвлөгөө тохируулаагүй`);
    if (!m.byWeek.length) {
        slide.addText('Энэ сард гэрээ бүртгэгдээгүй.', { x: M, y: TOP, w: CW, h: 0.5, fontFace: FONT, fontSize: 16, color: C.muted, margin: 0, isTextBox: true });
        return;
    }
    const weekW = Math.min(1.6, (CW - 2.2 - 1.2 - 1.9) / m.weeks.length);
    const head = [headCell('Бүтээгдэхүүн'), ...m.weeks.map(week => headCell(`${week.label}\n${dot(week.from.slice(5))}–${dot(week.to.slice(5))}`, 'center')), headCell('Сарын нийт', 'right'), headCell('Дүн', 'right')];
    const rows = m.byWeek.map(row => [bodyCell(row.label, 'left', { bold: true }), ...row.weeks.map(value => bodyCell(value ? String(value) : '—', 'center')), bodyCell(String(row.count), 'right', { bold: true }), bodyCell(short(row.total), 'right')]);
    const footer = [bodyCell('Нийт', 'left', { bold: true }), ...m.weeks.map((_, index) => bodyCell(String(m.byWeek.reduce((sum, row) => sum + row.weeks[index], 0) || '—'), 'center', { bold: true })), bodyCell(String(m.count), 'right', { bold: true }), bodyCell(short(m.total), 'right', { bold: true })];
    slide.addTable([head, ...rows, footer], { x: M, y: TOP, w: 2.2 + weekW * m.weeks.length + 1.2 + 1.9, colW: [2.2, ...m.weeks.map(() => weekW), 1.2, 1.9], fontFace: FONT, fontSize: 13, border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.06, 0.1, 0.06, 0.1] });
    note(slide, [m.missingTotals ? `Нийт дүн хоосон ${m.missingTotals} гэрээ дүнд ороогүй.` : null, 'Долоо хоног = Лхагва–Мягмар, сарын хилээр тасална.']);
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

export function weeklyDeckFileName(projectName: string, meetingDate: string, kind: WeeklyDeckKind): string {
    const safe = projectName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Vertmon';
    return `${safe} - ${WEEKLY_DECK_LABEL[kind]} - Лхагва ${meetingDate}.pptx`;
}
