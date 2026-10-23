import type PptxGenJS from 'pptxgenjs';
import {
    area, bodyCell, BOTTOM, C, clip, content, count, COVER, customSlide, CW, defineLayouts, dot, floorMapSlides, FONT, footerSum,
    H, headCell, M, managerShort, money, note, statRow, tableSlides, TOP, W, WEEKLY_DECK_LABEL, type DeckImage,
} from './weekly-deck';
import type { ReportContractLine, WeeklySalesReport } from './weekly-sales';
import type { WeeklySlide, WeeklySlideSection } from './weekly-slides';
import { ACTIVITY_METRIC_LABEL, ACTIVITY_METRICS, type ActivityMetric, type SalesActivityReport } from './sales-activity';
import type { MeetingDetailsReport } from './meeting-details';
import type { NegotiationsReport, NegotiationSum } from './negotiations';
import type { ReportBranding } from './report-branding';
import { undatedContractsHint } from './contract-dates';
import { PRODUCT_KIND_LABEL } from '@/lib/erp/records';
import { MONTHLY_SALES_BLOCK_LABELS, MONTHLY_SALES_BLOCKS, type MonthlySalesBlock } from '@/lib/sales/monthly';
import {
    planValueText, PLAN_SOURCE_LABEL, type PlanCell, type PlanMetricKey, type PlanMonthRow, type PlanPerformance, type PlanScopeCells, type PlanYearScope,
} from '@/lib/sales/plan-performance';
import { formatMNT } from '@/lib/utils/currency';

/**
 * Лхагвын хурлын БОРЛУУЛАЛТЫН АЛБАНЫ ЗАГВАРЫН илтгэл (W2, `sales-team` — «Борлуулалт (албаны загвар)»).
 * Агуулга, дараалал нь борлуулалтын албаны гараар хийдэг 17 слайдтай ижил; загвар нь Hub-ийнх (Arial, Hub-ийн өнгө,
 * LAYOUT_WIDE) — `weekly-deck.ts`-ийн туслахуудыг хуваалцана. Цэвэр функц: хөтөч (`weekly-deck-export.ts`) ба тест.
 *
 * Дүрэм (W1–W17): 7 хоног = Лхагва→Мягмар; дүн бүтэн оронтой (`formatMNT`), хувь бүхэл, доод хязгаар «+»,
 * тодорхойгүй «—» (хэзээ ч 0₮ биш). «Урьдчилгаа» = нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш (W6/W7), мөнгөн
 * урсгалд нэмэхгүй. Мөнгөн урсгалыг зөвхөн санхүүгийн эрхтэйд (`cashHidden` бол тоо огт гаргахгүй). Ачаалж чадаагүй
 * эх сурвалжийн слайд «мэдээлэл ачаалж чадсангүй» гэж бичиж, шалтгааныг тэмдэглэлд — бусад слайд хэвээр.
 */

/** Багийн загварын илтгэлийн эх сурвалж (ачаалж чадаагүйг тэмдэглэлд нэрлэнэ). */
export type TeamDeckSource = 'plan' | 'activity' | 'meetings' | 'negotiations' | 'weeklySales';
export const TEAM_DECK_SOURCE_LABEL: Record<TeamDeckSource, string> = {
    plan: 'Төлөвлөгөөний биелэлт',
    activity: 'Борлуулалтын тоон мэдээлэл',
    meetings: 'Уулзалтын дэлгэрэнгүй',
    negotiations: 'Ярилцаж буй гэрээ',
    weeklySales: 'Сарын гэрээ, давхрын зураглал',
};
/** Хөлийн анхдагч бичвэр (брэндийн `footer_text` хоосон бол). */
export const TEAM_DECK_FOOTER = 'ВЕРТМОН ПРОПЕРТИС';
/** Зурагтай слайдын сэдэв (багийн илтгэлийн 14–15-р слайд), хадгалсан дарааллаар. */
export const TEAM_DECK_PHOTO_SECTIONS: readonly WeeklySlideSection[] = ['event', 'construction', 'handover', 'other'];

/** Төлөвлөгөөний биелэлтийн хариу (`/api/dashboard/reports/plan-performance`): санхүүгийн эрхгүйд `cashHidden`. */
export type TeamPlanReport = PlanPerformance & { cashHidden?: boolean };

export interface TeamDeckInput {
    projectName: string;
    meetingDate: string;
    /** Тайлант 7 хоног (Лхагва→Мягмар, W1). */
    range: { from: string; to: string };
    /** «2026.10.21 14:05» — хэзээ бэлтгэсэн. */
    generatedAt: string;
    /** Төслийн илтгэлийн брэнд; хүснэгт алга эсвэл уншиж чадаагүй бол null. */
    branding: ReportBranding | null;
    coverImage?: DeckImage | null;
    logo?: DeckImage | null;
    plan: TeamPlanReport | null;
    activity: SalesActivityReport | null;
    meetings: MeetingDetailsReport | null;
    negotiations: NegotiationsReport | null;
    weeklySales: WeeklySalesReport | null;
    /** Хурлын нэмэлт слайд (борлуулалтын хэсгийнх л ашиглагдана). */
    slides: WeeklySlide[];
    images: Record<string, DeckImage>;
    /** Ачаалж чадаагүй эх сурвалж → шалтгаан (слайдын тэмдэглэлд). */
    failed?: Partial<Record<TeamDeckSource, string>>;
}

type Slide = PptxGenJS.Slide;
type Cell = PptxGenJS.TableCell;

interface Ctx {
    input: TeamDeckInput;
    /** Харагдах нэр (брэнд) эсвэл төслийн нэр. */
    name: string;
    year: number;
    month: number;
    /** Тайлант сарын эхнээс тайлант өдөр хүртэл. */
    monthRange: { from: string; to: string };
    cashVisible: boolean;
}

const md = (date: string) => `${date.slice(5, 7)}.${date.slice(8, 10)}`;
const digits = (value: number) => Math.round(value).toLocaleString('en-US');
/** Бүхэл хувь: гүйцэтгэл / төлөвлөгөө; аль нэг нь тодорхойгүй эсвэл төлөвлөгөө 0 бол «—», доод хязгаартай бол «+». */
export function wholePct(actual: number | null | undefined, plan: number | null | undefined, lowerBound = false): string {
    return actual === null || actual === undefined || plan === null || plan === undefined || plan <= 0
        ? '—' : `${Math.round(actual / plan * 100)}%${lowerBound ? '+' : ''}`;
}
/** Нийлбэр: бүгд тодорхойгүй бол «—», зарим нь бол мэдэгдэхийн нийлбэр «+». */
function sumText(values: Array<number | null>, format: (value: number) => string): string {
    const known = values.filter((value): value is number => value !== null);
    if (!known.length) return '—';
    const total = format(Math.round(known.reduce((sum, value) => sum + value, 0) * 100) / 100);
    return known.length < values.length ? `${total}+` : total;
}
/** Ярилцаж буй гэрээний нийлбэр: бүрэн бол дүн, зарим нь тодорхойгүй бол «N+», бүгд тодорхойгүй бол «—». */
const negotiationSumText = (sum: NegotiationSum, format: (value: number) => string) =>
    sum.sum !== null ? format(sum.sum) : sum.partial ? `${format(sum.known)}+` : '—';

function muted(slide: Slide, text: string, y: number, h = 0.6, fontSize = 16) {
    slide.addText(text, { x: M, y, w: CW, h, fontFace: FONT, fontSize, color: C.muted, margin: 0, valign: 'top', isTextBox: true });
}
function sectionLabel(slide: Slide, y: number, text: string) {
    slide.addText(text, { x: M, y, w: CW, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink2, margin: 0, isTextBox: true });
}
/** Эх сурвалж ачаалж чадаагүй слайд: богино мөр, шалтгаан тэмдэглэлд. */
function unavailable(slide: Slide, ctx: Ctx, source: TeamDeckSource, y = TOP) {
    muted(slide, 'Мэдээлэл ачаалж чадсангүй.', y);
    note(slide, [
        `${TEAM_DECK_SOURCE_LABEL[source]}: ${ctx.input.failed?.[source] ?? 'мэдээлэл ирээгүй'}.`,
        'Hub-ийн «Лхагва гарагийн хурал» хуудсыг шинэчлээд дахин татна уу.',
    ]);
}
/** Зургийг хайрцагт багтаана (харьцаа хадгална). */
function placeImage(slide: Slide, image: DeckImage, box: { x: number; y: number; w: number; h: number }, align: 'left' | 'center', altText: string) {
    const ratio = image.width > 0 && image.height > 0 ? image.width / image.height : 1;
    let w = box.w;
    let h = w / ratio;
    if (h > box.h) { h = box.h; w = h * ratio; }
    slide.addImage({ data: image.data, x: align === 'left' ? box.x : box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, altText });
}
const slideOrder = (a: WeeklySlide, b: WeeklySlide) => a.position - b.position;

/** «2026 оны 10.14-10.20 хүртэлх тайлан» — Лхагва→Мягмар тайлант 7 хоног (W1). */
export function teamDeckPeriod(range: { from: string; to: string }): string {
    return `${range.to.slice(0, 4)} оны ${md(range.from)}-${md(range.to)} хүртэлх тайлан`;
}

// 1. Нүүр: брэндийн зураг (бүтэн, тайрч багтаана) + лого, эс бөгөөс хар хөх дэвсгэр дээр төслийн нэр.
function coverSlide(pres: PptxGenJS, ctx: Ctx) {
    const { input } = ctx;
    const slide = pres.addSlide({ masterName: COVER });
    const period = teamDeckPeriod(input.range);
    if (input.coverImage) {
        const ratio = input.coverImage.width > 0 && input.coverImage.height > 0 ? input.coverImage.height / input.coverImage.width : H / W;
        slide.addImage({ data: input.coverImage.data, x: 0, y: 0, w: W, h: W * ratio, sizing: { type: 'cover', w: W, h: H }, altText: 'Илтгэлийн нүүрний зураг' });
        // Бичвэр уншигдахаар доод хэсэгт хагас тунгалаг хар хөх зурвас.
        slide.addShape('rect', { x: 0, y: H - 1.7, w: W, h: 1.7, fill: { color: C.navy, transparency: 20 }, line: { color: C.navy, transparency: 100 } });
        slide.addText([
            ...(input.logo ? [] : [{ text: ctx.name, options: { fontSize: 30, bold: true, color: C.white, breakLine: true } }]),
            { text: period, options: { fontSize: input.logo ? 28 : 20, bold: !!input.logo, color: C.white } },
        ], { x: M + 0.2, y: H - 1.55, w: CW - 0.4, h: 1.4, fontFace: FONT, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    } else {
        slide.addText(ctx.name, { x: M + 0.2, y: 2.4, w: CW - 0.4, h: 1.4, fontFace: FONT, fontSize: 48, bold: true, color: C.white, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
        slide.addText(period, { x: M + 0.2, y: 3.9, w: CW - 0.4, h: 0.6, fontFace: FONT, fontSize: 24, color: C.navy2, margin: 0, isTextBox: true });
    }
    if (input.logo) placeImage(slide, input.logo, { x: M + 0.2, y: 0.5, w: 2.8, h: 1.1 }, 'left', 'Лого');
    note(slide, [
        `Vertmon Hub-аас бэлтгэв · ${input.generatedAt} · Улаанбаатарын цагаар · Хурал: ${dot(input.meetingDate)}.`,
        `Тайлант 7 хоног (Лхагва–Мягмар): ${dot(input.range.from)} – ${dot(input.range.to)}.`,
        input.branding ? null : 'Илтгэлийн брэнд (нүүрний зураг, лого, хөл бичвэр) тохируулаагүй эсвэл уншиж чадаагүй — анхдагч загвар.',
    ]);
}

// 2. Ярилцаж буй гэрээ (W13) + «Яригдаж буй гэрээ» сэдвийн нэмэлт слайд.
function negotiationSlides(pres: PptxGenJS, ctx: Ctx) {
    const title = 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ';
    const report = ctx.input.negotiations;
    if (!report) {
        unavailable(content(pres, ctx.name, title), ctx, 'negotiations', TOP - 0.2);
    } else {
        const notes = [
            'Эх сурвалж: CRM — «Хэлэлцэж байна» / «Санал тавьсан» төлөвтэй, амьд гэрээгүй лид; блок, давхар, талбай, урьдчилгааны хувь = сүүлийн болсон уулзалтын сонирхол.',
            report.pricing
                ? `Мкв үнэ, нийт үнэ, урьдчилгаа — өнөөдрийн үнээр (${dot(report.asOf)}, баталсан үнийн тохиргоо v${report.pricing.version}).`
                : `Мкв үнэ, нийт үнэ, урьдчилгаа — өнөөдрийн үнээр (${dot(report.asOf)}); идэвхтэй үнийн тохиргоо алга бол «—».`,
            '«Урьдчилгаа нөхцөл» тодорхойлогдоогүй (W13) тул «—».',
            ...report.notes,
        ];
        if (!report.rows.length) {
            const slide = content(pres, ctx.name, title, `Үнийн өдөр ${dot(report.asOf)}`);
            muted(slide, 'Ярилцаж буй гэрээ алга.', TOP);
            note(slide, notes.slice(0, 1).concat(report.notes));
        } else {
            const head = ['Д/д', 'Блок', 'Өрөөний тоо', 'Давхар', 'м.кв', 'Урьдчилгаа хувь', 'Мкв үнэ', 'Нийт үнэ', 'Урьдчилгаа', 'Урьдчилгаа нөхцөл', 'Сэжим']
                .map((text, index) => headCell(text, [4, 6, 7, 8].includes(index) ? 'right' : index === 0 || index === 2 || index === 3 || index === 5 ? 'center' : 'left'));
            const rows = report.rows.map((row, index) => [
                bodyCell(String(index + 1), 'center'), bodyCell(row.block ?? '—'), bodyCell(count(row.rooms), 'center'), bodyCell(count(row.floor), 'center'),
                bodyCell(area(row.area), 'right'), bodyCell(row.condition ?? '—', 'center'), bodyCell(money(row.pricePerSqm), 'right'), bodyCell(money(row.total), 'right'),
                bodyCell(money(row.advance), 'right'), bodyCell('—'), bodyCell(row.referral ? clip(row.referral, 18) : '—'),
            ]);
            const totals = report.totals;
            const footer = [
                bodyCell(`Нийт (${totals.count})`, 'left', { bold: true, colspan: 4 }), bodyCell(negotiationSumText(totals.area, value => area(value)), 'right', { bold: true }),
                bodyCell(''), bodyCell(''), bodyCell(negotiationSumText(totals.total, value => money(value)), 'right', { bold: true }),
                bodyCell(negotiationSumText(totals.advance, value => money(value)), 'right', { bold: true }), bodyCell(''), bodyCell(''),
            ];
            tableSlides(pres, {
                kicker: ctx.name, title, subtitle: `${totals.count} лид · үнэ ${dot(report.asOf)}-ний байдлаар`, head, rows, footer,
                colW: [0.5, 0.7, 0.95, 0.75, 0.85, 1.1, 1.45, 1.7, 1.6, 1.25, 1.283], perSlide: 12, fontSize: 10, notes,
            });
        }
    }
    for (const slide of salesSlides(ctx, ['negotiation'])) customSlide(pres, slide, ctx.input.images);
}

const salesSlides = (ctx: Ctx, sections: readonly WeeklySlideSection[]) =>
    ctx.input.slides.filter(slide => slide.part === 'sales' && sections.includes(slide.section)).sort(slideOrder);

// 3. Сарын захиалгын гэрээ: «Дулаан зогсоол», «Орон сууц» хүснэгт.
const PARKING_HEAD = ['Д/д', 'Менежер', 'Тоот', 'Талбай', 'Нэр', 'Урьдчилгаа хувь', 'Нийт үнэ', 'Урьдчилгаа', 'Хүлээгдэж буй'];
const PARKING_W = [0.5, 1.4, 1.4, 0.9, 2.0, 1.1, 1.6, 1.6, 1.633];
const RESIDENTIAL_HEAD = ['Д/д', 'Менежер', 'Өрөө', 'Блок', 'Давхар', 'Талбай', 'Нэр', 'Урьдчилгаа хувь', 'Мкв үнэ', 'Нийт үнэ', 'Урьдчилгаа', 'Сэжим'];
const RESIDENTIAL_W = [0.5, 1.2, 0.8, 0.6, 0.65, 0.75, 1.45, 0.95, 1.15, 1.4, 1.35, 1.333];
/** Нэг слайдад хоёр хүснэгт багтах мөрийн дээд тоо (толгой, хөл, гарчгийг оруулаад BOTTOM-оос дээш). */
const MONTH_LINES_ONE_SLIDE = 10;
const HEAD_H = 0.42;
const ROW_H = 0.27;

function parkingTable(lines: ReportContractLine[]): { head: Cell[]; rows: Cell[][]; footer: Cell[] } {
    return {
        head: PARKING_HEAD.map((text, index) => headCell(text, [3, 6, 7, 8].includes(index) ? 'right' : index === 0 || index === 5 ? 'center' : 'left')),
        rows: lines.map((line, index) => [
            bodyCell(String(index + 1), 'center'), bodyCell(managerShort(line.manager)), bodyCell(line.unit ?? '—'), bodyCell(area(line.area), 'right'),
            bodyCell(line.customer ? clip(line.customer, 24) : '—'), bodyCell(line.advanceCondition ?? '—', 'center'), bodyCell(money(line.total), 'right'),
            bodyCell(money(line.advance), 'right'), bodyCell('—', 'right'),
        ]),
        footer: [
            bodyCell('Нийт', 'left', { bold: true, colspan: 3 }), bodyCell(sumText(lines.map(line => line.area), value => area(value)), 'right', { bold: true }),
            bodyCell(''), bodyCell(''), bodyCell(footerSum(lines.map(line => line.total)), 'right', { bold: true }),
            bodyCell(footerSum(lines.map(line => line.advance)), 'right', { bold: true }), bodyCell('—', 'right', { bold: true }),
        ],
    };
}

function residentialTable(lines: ReportContractLine[]): { head: Cell[]; rows: Cell[][]; footer: Cell[] } {
    return {
        head: RESIDENTIAL_HEAD.map((text, index) => headCell(text, [5, 8, 9, 10].includes(index) ? 'right' : [0, 2, 3, 4, 7].includes(index) ? 'center' : 'left')),
        rows: lines.map((line, index) => [
            bodyCell(String(index + 1), 'center'), bodyCell(managerShort(line.manager)), bodyCell(line.rooms ? `${line.rooms} өрөө` : '—', 'center'),
            bodyCell(line.block ?? '—', 'center'), bodyCell(count(line.floor), 'center'), bodyCell(area(line.area), 'right'),
            bodyCell(line.customer ? clip(line.customer, 18) : '—'), bodyCell(line.advanceCondition ?? '—', 'center'), bodyCell(money(line.pricePerSqm), 'right'),
            bodyCell(money(line.total), 'right'), bodyCell(money(line.advance), 'right'), bodyCell(line.referral ? clip(line.referral, 16) : '—'),
        ]),
        footer: [
            bodyCell('Нийт', 'left', { bold: true, colspan: 5 }), bodyCell(sumText(lines.map(line => line.area), value => area(value)), 'right', { bold: true }),
            bodyCell(''), bodyCell(''), bodyCell(''), bodyCell(footerSum(lines.map(line => line.total)), 'right', { bold: true }),
            bodyCell(footerSum(lines.map(line => line.advance)), 'right', { bold: true }), bodyCell(''),
        ],
    };
}

function monthContractSlides(pres: PptxGenJS, ctx: Ctx) {
    const title = `${ctx.month}-Р САР ЗАХИАЛГЫН ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ`;
    const report = ctx.input.weeklySales;
    if (!report) {
        unavailable(content(pres, ctx.name, title), ctx, 'weeklySales', TOP - 0.2);
        return;
    }
    // Хуучин (сарын мөргүй) хариу ирвэл хоосон гэж үзнэ.
    const lines = report.month.lines ?? [];
    const parking = lines.filter(line => line.kind === 'parking');
    const residential = lines.filter(line => line.kind === 'residential');
    const others = lines.filter(line => line.kind !== 'parking' && line.kind !== 'residential');
    const undated = report.sources.undatedPlanContracts;
    const subtitle = `${dot(ctx.monthRange.from)} – ${dot(ctx.monthRange.to)} · ${lines.length} гэрээ${undated ? ` · огноогүй ${undated} гэрээ ороогүй` : ''}`;
    const otherKinds = [...new Set(others.map(line => line.kind))].map(kind => {
        const rows = others.filter(line => line.kind === kind);
        return `${PRODUCT_KIND_LABEL[kind]} ${rows.length} гэрээ (${footerSum(rows.map(row => row.total))})`;
    });
    const notes = [
        report.sources.contracts === 'erp' && report.sources.sales
            ? `Эх сурвалж: ERP гэрээний экспорт «${report.sources.sales.source}» (${report.sources.sales.date}).`
            : 'Эх сурвалж: Hub-ийн гэрээ (HUB гэрээний жагсаалт, захиалга өгсөн огноогоор).',
        `Сарын эхнээс тайлант өдөр (${report.range.to}) хүртэлх амьд гэрээ; цуцлагдсан орохгүй.`,
        '«Урьдчилгаа» — Нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш (W7).',
        '«Хүлээгдэж буй» — төлбөрийн мэдээлэл ороогүй тул «—» (W16).',
        'Захиалагчийн нэрийг зөвхөн гэрээний эрхтэй хэрэглэгч харна; регистрийн дугаар гаргахгүй.',
        otherKinds.length ? `Хүснэгтэд ороогүй: ${otherKinds.join(', ')}.` : null,
        undated ? undatedContractsHint(undated) : null,
    ].filter((line): line is string => !!line);
    const kinds = [
        { label: 'Дулаан зогсоол', lines: parking, table: parkingTable(parking), colW: PARKING_W },
        { label: 'Орон сууц', lines: residential, table: residentialTable(residential), colW: RESIDENTIAL_W },
    ];
    const empty = undated ? `Огноотой гэрээ алга — огноогүй ${undated} гэрээтэй тул тоо тодорхойгүй.` : 'Энэ сард гэрээ бүртгэгдээгүй.';
    if (parking.length + residential.length > MONTH_LINES_ONE_SLIDE) {
        // Урт бол хүснэгт бүр өөрийн слайдад (tableSlides-ийн «(1/2)» хуудаслалт).
        const missing = kinds.filter(item => !item.lines.length).map(item => `${item.label}: ${empty}`);
        for (const kind of kinds.filter(item => item.lines.length)) {
            tableSlides(pres, { kicker: ctx.name, title, subtitle: `${kind.label} · ${subtitle}`, ...kind.table, colW: kind.colW, perSlide: 12, fontSize: 10, notes: [...notes, ...missing] });
        }
        return;
    }
    const slide = content(pres, ctx.name, title, subtitle);
    let y = TOP - 0.05;
    for (const kind of kinds) {
        sectionLabel(slide, y, kind.label);
        y += 0.32;
        if (!kind.lines.length) {
            muted(slide, empty, y, 0.35, 12);
            y += 0.5;
            continue;
        }
        const rows = [kind.table.head, ...kind.table.rows, kind.table.footer];
        slide.addTable(rows, {
            x: M, y, w: CW, colW: kind.colW, rowH: [HEAD_H, ...kind.table.rows.map(() => ROW_H), ROW_H], fontFace: FONT, fontSize: 10,
            border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.03, 0.06, 0.03, 0.06], autoPage: false,
        });
        y += HEAD_H + ROW_H * (kind.lines.length + 1) + 0.22;
    }
    note(slide, notes);
}

// 4–8. Сарын төлөвлөгөө (блок, нийт, нэмэлт): гэрээний дүн, мөнгөн урсгал (санхүүгийн эрхтэйд), урьдчилгааны мэдээлэл.
const BLOCK_TITLE: Record<MonthlySalesBlock, string> = { b1: 'Б1 БЛОК', b2: 'Б2 БЛОК', parking: 'ДУЛААН ЗОГСООЛ' };
const CASH_HIDDEN = 'Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.';

const actualText = (cell: Pick<PlanCell, 'actual' | 'lowerBound'> | undefined) => planValueText(cell?.actual ?? null, !!cell?.lowerBound, value => formatMNT(value));
const cellPct = (cell: Pick<PlanCell, 'actual' | 'plan' | 'lowerBound'> | undefined) => wholePct(cell?.actual, cell?.plan, !!cell?.lowerBound);

/** Мөнгөн урсгалын гүйцэтгэлийн эх сурвалж (гар / HUB «Нийт төлсөн дүн» / дэвтэр). */
function cashSource(plan: TeamPlanReport, cell: PlanCell | undefined): string | null {
    if (!plan.cash) return null;
    if (cell?.source === 'manual') return 'Мөнгөн урсгалын гүйцэтгэл: удирдлагын гараар оруулсан дүн.';
    const system = plan.cash.source === 'hub_paid'
        ? `HUB файлын «Нийт төлсөн дүн» (${plan.cash.hubPaidAsOf ?? '—'}-ний байдлаар) — тухайн сард захиалсан гэрээнээс орсон мөнгө`
        : plan.cash.availability === 'no_ledger' ? 'санхүүгийн дэвтэрт мөнгөн орлого бүртгэгдээгүй («—»)'
        : plan.cash.availability === 'none' ? 'амьд гэрээний төлсөн дүн тодорхойгүй («—»)'
        : `санхүүгийн дэвтрийн бүртгэсэн мөнгөн орлого${plan.cash.ledgerSince ? ` (${plan.cash.ledgerSince}-нээс)` : ''}`;
    return cell?.source === 'mixed'
        ? `Мөнгөн урсгалын гүйцэтгэл: гараар оруулсан блок + бусад блок — ${system}.`
        : `Мөнгөн урсгалын гүйцэтгэл: ${system}.`;
}

function contractSource(cell: PlanCell | undefined): string | null {
    if (!cell || cell.actual === null) return null;
    return cell.source === 'manual' ? 'Гэрээний гүйцэтгэл: удирдлагын гараар оруулсан дүн.'
        : cell.source === 'mixed' ? 'Гэрээний гүйцэтгэл: холимог — гараар оруулсан блок + системийн гэрээ.'
        : 'Гэрээний гүйцэтгэл: системийн гэрээ (захиалга өгсөн огноогоор, цуцлагдсаныг хассан).';
}

/**
 * Гүйцэтгэлийн картын тайлбар: эх сурвалж (Гараар / Систем / Холимог); гэрээний тоо нь дүнтэй ижил эх сурвалжтай бол л
 * («Гараар» дүнгийн хажууд системийн «0 гэрээ» бичихгүй).
 */
function contractHelper(contract: PlanCell | undefined, countCell: PlanCell | undefined): string | undefined {
    if (!contract?.source || contract.actual === null) return undefined;
    const label = PLAN_SOURCE_LABEL[contract.source];
    return countCell?.actual != null && countCell.source === contract.source ? `${countCell.actual}${countCell.lowerBound ? '+' : ''} гэрээ · ${label}` : label;
}

/** «Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй)» — мэдээлэл, мөнгөн урсгал биш (W6). */
const prepaymentText = (cells: PlanScopeCells) => cells.prepaymentDue === null ? '—' : `${formatMNT(cells.prepaymentDue)}${cells.prepaymentMissing ? '+' : ''}`;
function prepaymentLine(slide: Slide, cells: PlanScopeCells, y: number) {
    slide.addText(`Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): ${prepaymentText(cells)}`, { x: M, y, w: CW, h: 0.4, fontFace: FONT, fontSize: 14, color: C.ink2, margin: 0, isTextBox: true });
}

function planNotes(ctx: Ctx, plan: TeamPlanReport, cells: PlanScopeCells, undated: number): string[] {
    const contract = cells.metrics.contract;
    return [
        `Эх сурвалж: «Төлөвлөгөөний биелэлт» — ${ctx.year} оны ${ctx.month}-р сар, тайлант өдөр (${ctx.input.range.to}) хүртэл.`,
        contractSource(contract),
        ctx.cashVisible ? cashSource(plan, cells.metrics.cashflow) : 'Мөнгөн урсгалын төлөвлөгөө, гүйцэтгэлийг санхүүгийн эрхтэй хүн харна.',
        contract?.lowerBound || (ctx.cashVisible && cells.metrics.cashflow?.lowerBound)
            ? `«+» — доод хязгаар: ${undated ? `огноогүй ${undated} гэрээ` : 'дүн нь тодорхойгүй гэрээ'} байна; тухайн сард мэдэгдэх дүнгүй бол «—».` : null,
        'Хувь = гүйцэтгэл / төлөвлөгөө, бүхэл тоогоор.',
        '«Энэ сарын гэрээний урьдчилгаа» = тухайн сард захиалсан амьд гэрээний нөхцлөөр төлөх урьдчилгаа (орсон + хүлээгдэж буй) — мөнгөн урсгал биш, мөнгөн урсгалд нэмэхгүй (W6).',
        cells.prepaymentMissing ? `Урьдчилгааны дүнгүй ${cells.prepaymentMissing} гэрээ — урьдчилгаа доод хязгаар («+»).` : null,
    ].filter((line): line is string => !!line);
}

function planCardSlide(pres: PptxGenJS, ctx: Ctx, title: string, pick: (row: PlanMonthRow) => PlanScopeCells, undated: (plan: TeamPlanReport) => number, extraNotes: (row: PlanMonthRow) => Array<string | null> = () => []) {
    const slide = content(pres, ctx.name, title, `${ctx.month}-р сар · ${dot(ctx.monthRange.from)} – ${dot(ctx.monthRange.to)} хүртэл`);
    const plan = ctx.input.plan;
    const row = plan?.months[ctx.month - 1];
    if (!plan || !row) return unavailable(slide, ctx, 'plan');
    const cells = pick(row);
    const contract = cells.metrics.contract;
    const countCell = cells.metrics.contract_count;
    sectionLabel(slide, TOP - 0.05, 'Гэрээний дүн');
    statRow(slide, TOP + 0.28, [
        { label: 'ТӨЛӨВЛӨГӨӨ', value: money(contract?.plan), tone: 'gold' },
        { label: 'ГҮЙЦЭТГЭЛ', value: actualText(contract), helper: contractHelper(contract, countCell) },
        { label: 'ГҮЙЦЭТГЭЛИЙН ХУВЬ', value: cellPct(contract) },
    ], 1.45);
    if (ctx.cashVisible) {
        const cash = cells.metrics.cashflow;
        sectionLabel(slide, TOP + 1.9, 'Мөнгөн урсгал');
        statRow(slide, TOP + 2.23, [
            { label: 'ТӨЛӨВЛӨГӨӨ', value: money(cash?.plan), tone: 'gold' },
            { label: 'ГҮЙЦЭТГЭЛ', value: actualText(cash), helper: cash?.actual != null && cash.source ? PLAN_SOURCE_LABEL[cash.source] : undefined },
            { label: 'ХУВЬ', value: cellPct(cash) },
        ], 1.45);
    } else {
        muted(slide, CASH_HIDDEN, TOP + 1.95, 0.4, 13);
    }
    prepaymentLine(slide, cells, ctx.cashVisible ? TOP + 3.9 : TOP + 2.55);
    note(slide, [...planNotes(ctx, plan, cells, undated(plan)), ...extraNotes(row)]);
}

function stretchSlide(pres: PptxGenJS, ctx: Ctx) {
    const plan = ctx.input.plan;
    const row = plan?.months[ctx.month - 1];
    // Нэмэлт төлөвлөгөөгүй бол слайдгүй (тодорхойгүй эх сурвалжид ч — төлөвлөгөөний слайдууд алдааг харуулна).
    if (!plan || !row || (row.stretch.contract === null && row.stretch.cashflow === null)) return;
    const slide = content(pres, ctx.name, `${ctx.month}-Р САРЫН ГЭРЭЭНИЙ НЭМЭЛТ ТӨЛӨВЛӨГӨӨ`, `${ctx.month}-р сар · ${dot(ctx.monthRange.from)} – ${dot(ctx.monthRange.to)} хүртэл · гүйцэтгэл нь үндсэн төлөвлөгөөнийхтэй ижил`);
    const contract = row.total.metrics.contract;
    sectionLabel(slide, TOP - 0.05, 'Гэрээний дүн');
    statRow(slide, TOP + 0.28, [
        { label: 'НЭМЭЛТ ТӨЛӨВЛӨГӨӨ', value: money(row.stretch.contract), tone: 'gold' },
        { label: 'ГҮЙЦЭТГЭЛ', value: actualText(contract) },
        { label: 'ГҮЙЦЭТГЭЛИЙН ХУВЬ', value: wholePct(contract?.actual, row.stretch.contract, !!contract?.lowerBound) },
    ], 1.45);
    if (ctx.cashVisible) {
        const cash = row.total.metrics.cashflow;
        sectionLabel(slide, TOP + 1.9, 'Мөнгөн урсгал');
        if (row.stretch.cashflow === null) muted(slide, 'Мөнгөн урсгалын нэмэлт төлөвлөгөө оруулаагүй.', TOP + 2.25, 0.4, 13);
        else statRow(slide, TOP + 2.23, [
            { label: 'НЭМЭЛТ ТӨЛӨВЛӨГӨӨ', value: money(row.stretch.cashflow), tone: 'gold' },
            { label: 'ГҮЙЦЭТГЭЛ', value: actualText(cash) },
            { label: 'ХУВЬ', value: wholePct(cash?.actual, row.stretch.cashflow, !!cash?.lowerBound) },
        ], 1.45);
    } else {
        muted(slide, CASH_HIDDEN, TOP + 1.95, 0.4, 13);
    }
    prepaymentLine(slide, row.total, ctx.cashVisible ? TOP + 3.9 : TOP + 2.55);
    note(slide, [
        'Нэмэлт төлөвлөгөө — сарын нийт гэрээ (ба мөнгөн урсгал)-ний дүн, блокгүй (W8); /admin/sales-targets-д оруулна.',
        ...planNotes(ctx, plan, row.total, plan.undated.count).slice(0, 4),
    ]);
}

// 9. Борлуулалтын албаны тоон мэдээлэл: 7 хоногоор багана график (засаж болох), сарын эхнээс карт.
const CHART_METRICS: readonly ActivityMetric[] = ['hotline', 'managerLine', 'newMeetings', 'chats'];
/** Хуучин → шинэ 7 хоног (хамгийн шинэ нь Hub-ийн цэнхэр). Hex, «#»-гүй. */
const BUCKET_COLORS = ['D5DEF7', 'A9B8E8', '7F96E0', '5479DC', C.brand];

function activitySlide(pres: PptxGenJS, ctx: Ctx) {
    const title = 'БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ';
    const report = ctx.input.activity;
    if (!report) return unavailable(content(pres, ctx.name, title), ctx, 'activity', TOP - 0.2);
    const slide = content(pres, ctx.name, title, `7 хоногоор (Лхагва–Мягмар) · сарын эхнээс ${dot(report.month.from)} – ${dot(report.month.to)}`);
    const hotline = report.lines.hotline?.trim() || ACTIVITY_METRIC_LABEL.hotline;
    const managerLine = report.lines.managerLine?.trim() || ACTIVITY_METRIC_LABEL.managerLine;
    const categories = [hotline, 'Менежер дугаар', 'Шинэ уулзалт', 'Чат'];
    // Тодорхойгүй утгыг 0 биш хоосон цэг (null + dispBlanksAs=gap); нэг ч утгагүй 7 хоногийг графикт оруулахгүй.
    const charted = report.buckets.filter(bucket => CHART_METRICS.some(metric => bucket.values[metric] !== null));
    const skipped = report.buckets.filter(bucket => !charted.includes(bucket));
    const blanks = charted.some(bucket => CHART_METRICS.some(metric => bucket.values[metric] === null));
    const partial = report.buckets.some(bucket => ACTIVITY_METRICS.some(metric => bucket.partial[metric])) || ACTIVITY_METRICS.some(metric => report.month.metrics[metric].partial);
    if (charted.length) {
        const colors = BUCKET_COLORS.slice(-charted.length);
        slide.addChart('bar', charted.map(bucket => ({ name: bucket.label, labels: categories, values: CHART_METRICS.map(metric => bucket.values[metric]) })), {
            x: M, y: TOP - 0.05, w: CW, h: 3.15, barDir: 'col', barGrouping: 'clustered', barGapWidthPct: 60, chartColors: colors,
            showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 9, dataLabelFontFace: FONT, dataLabelColor: C.ink,
            showLegend: true, legendPos: 'b', legendFontSize: 10, legendFontFace: FONT, legendColor: C.ink2,
            catAxisLabelFontSize: 11, catAxisLabelFontFace: FONT, catAxisLabelColor: C.ink2, valAxisHidden: true, valGridLine: { style: 'none' },
            displayBlanksAs: 'gap', altText: `Борлуулалтын албаны тоон мэдээлэл 7 хоногоор: ${categories.join(', ')}`,
        });
    } else {
        muted(slide, 'Сүүлийн 7 хоногуудад тоон мэдээлэл оруулаагүй — тодорхойгүй.', TOP + 0.6);
    }
    const value = (metric: ActivityMetric) => {
        const cell = report.month.metrics[metric];
        return cell.actual === null ? '—' : `${cell.actual.toLocaleString('en-US')}${cell.partial ? '+' : ''}`;
    };
    const helper = (metric: ActivityMetric) => {
        const cell = report.month.metrics[metric];
        return `${cell.plan === null ? 'Төлөвлөгөө оруулаагүй' : `Төлөвлөгөө ${count(cell.planToDate)}/${count(cell.plan)}`}\nБиелэлт ${cell.pct === null ? '—' : `${cell.pct}%`}`;
    };
    const labels: Record<ActivityMetric, string> = { hotline, managerLine, newMeetings: 'Шинэ уулзалт', repeatMeetings: 'Давтан уулзалт', chats: 'Чат' };
    statRow(slide, TOP + 3.25, ACTIVITY_METRICS.map(metric => ({ label: labels[metric], value: value(metric), helper: helper(metric) })), 1.8);
    note(slide, [
        'Эх сурвалж: дуудлага, чат — менежерүүдийн өдрийн тайланд гараар оруулсан тоо; уулзалт — CRM-ийн болсон уулзалт (шинэ / давтан харилцагч).',
        `Шугам: «${hotline}» = өдрийн тайлангийн загварын эхний шугам, «${managerLine}» = хоёр дахь шугам; чат = ${report.lines.chats.join(', ') || 'суваггүй'}.`,
        `Өдрийн тайлангийн хамрах хүрээ (тоо оруулсан өдөр / нийт өдөр): ${report.buckets.map(bucket => `${bucket.label} ${bucket.knownDays}/${bucket.days}`).join(', ')}.`,
        `Төлөвлөгөө «хувь тэнцүүлсэн / сарын» = сарын төлөвлөгөө × min(өдөр, 30) / 30 (${dot(report.month.to)} хүртэл); биелэлт = гүйцэтгэл / хувь тэнцүүлсэн төлөвлөгөө.`,
        blanks ? 'Графикийн хоосон багана = тодорхойгүй (тоо оруулаагүй), 0 биш. PowerPoint-ийн «Edit Data» хүснэгтэд хоосон нүд 0 болж харагдана.' : null,
        skipped.length ? `${skipped.map(bucket => bucket.label).join(', ')}: тоон мэдээлэл огт оруулаагүй тул графикт ороогүй.` : null,
        partial ? '«N+» — уулзалтын бүртгэл хугацааны дунд эхэлсэн тул доод хязгаар (графикт мэдэгдэх тоо).' : null,
        ...report.notes,
    ]);
}

// 10. Нийт уулзалтын дэлгэрэнгүй: сонирхсон загвар 7 хоногоор (дугуй график), «Сэжим» хүснэгт.
const PIE_COLORS = ['2D5FDD', 'A9823F', '13784A', '7F96E0', '0E1A3A', 'C9A86A', '5BA67F', 'A9B8E8', '9A5A00', '3A404C'];
const NO_INTEREST = 'Сонголтгүй';
const NO_INTEREST_COLOR = 'C5CAD3';

function meetingSlide(pres: PptxGenJS, ctx: Ctx) {
    const title = 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ';
    const report = ctx.input.meetings;
    if (!report) return unavailable(content(pres, ctx.name, title), ctx, 'meetings', TOP - 0.2);
    const slide = content(pres, ctx.name, title, 'Сонирхож буй загвар 7 хоногоор · «Сэжим» — тайлант 7 хоногийн шинэ уулзалт');
    const tableW = 3.5;
    const leftW = CW - tableW - 0.3;
    // Загварын өнгө 4 графикт ижил: нийт тоогоор эрэмбэлж өнгө онооно.
    const totals = new Map<string, { label: string; count: number }>();
    for (const week of report.weeks) for (const model of week.byModel) {
        const entry = totals.get(model.key) ?? { label: model.label, count: 0 };
        entry.count += model.count;
        totals.set(model.key, entry);
    }
    const order = [...totals].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'mn', { numeric: true }));
    const colorOf = new Map(order.map(([key], index) => [key, PIE_COLORS[index % PIE_COLORS.length]]));
    const anyWithout = report.weeks.some(week => week.withoutInterest > 0);
    const pieW = leftW / Math.max(1, report.weeks.length);
    const pieH = 2.55;
    report.weeks.forEach((week, index) => {
        const x = M + index * pieW;
        if (!week.total) {
            slide.addText([{ text: week.label, options: { bold: true, breakLine: true } }, { text: 'Болсон уулзалт алга' }],
                { x, y: TOP - 0.05, w: pieW - 0.1, h: 0.9, fontFace: FONT, fontSize: 11, color: C.muted, align: 'center', margin: 0, valign: 'top', isTextBox: true });
            return;
        }
        const labels = [...week.byModel.map(model => model.label), ...(week.withoutInterest ? [NO_INTEREST] : [])];
        const values = [...week.byModel.map(model => model.count), ...(week.withoutInterest ? [week.withoutInterest] : [])];
        const colors = [...week.byModel.map(model => colorOf.get(model.key) ?? PIE_COLORS[0]), ...(week.withoutInterest ? [NO_INTEREST_COLOR] : [])];
        slide.addChart('pie', [{ name: week.label, labels, values }], {
            x, y: TOP - 0.05, w: pieW - 0.1, h: pieH, chartColors: colors, showLegend: false, showValue: true, showPercent: false,
            dataLabelPosition: 'outEnd', dataLabelFontSize: 9, dataLabelFontFace: FONT, dataLabelColor: C.ink,
            showTitle: true, title: `${week.label} · ${week.total}`, titleFontSize: 11, titleFontFace: FONT, titleColor: C.ink,
            altText: `Сонирхсон загвар ${week.label}: ${labels.map((label, i) => `${label} ${values[i]}`).join(', ')}`,
        });
    });
    // Нийтлэг тайлбар (загвар → өнгө) графикийн доор, хоёр баганаар.
    const legend = [...order.map(([key, entry]) => ({ label: entry.label, color: colorOf.get(key)! })), ...(anyWithout ? [{ label: NO_INTEREST, color: NO_INTEREST_COLOR }] : [])];
    const legendTop = TOP - 0.05 + pieH + 0.15;
    const perColumn = Math.max(1, Math.floor((BOTTOM - legendTop) / 0.27));
    const shown = legend.slice(0, perColumn * 2);
    shown.forEach((item, index) => {
        const x = M + Math.floor(index / perColumn) * (leftW / 2);
        const y = legendTop + (index % perColumn) * 0.27;
        slide.addShape('rect', { x, y: y + 0.06, w: 0.16, h: 0.16, fill: { color: item.color }, line: { color: item.color } });
        slide.addText(item.label, { x: x + 0.24, y, w: leftW / 2 - 0.3, h: 0.27, fontFace: FONT, fontSize: 10, color: C.ink2, margin: 0, valign: 'middle', isTextBox: true });
    });
    const referral = report.referral;
    const rows = referral.rows.slice(0, 12);
    const rest = referral.rows.slice(12).reduce((sum, row) => sum + row.count, 0);
    slide.addTable([
        [headCell('Сэжим'), headCell('Шинэ уулзалт', 'right')],
        ...rows.map(row => [bodyCell(clip(row.label, 28)), bodyCell(String(row.count), 'right')]),
        ...(rest ? [[bodyCell('Бусад'), bodyCell(String(rest), 'right')]] : []),
        [bodyCell('Тодорхойгүй', 'left', { color: C.muted }), bodyCell(String(referral.unknown), 'right', { color: C.muted })],
        [bodyCell('Нийт', 'left', { bold: true }), bodyCell(String(referral.total), 'right', { bold: true })],
    ], {
        x: M + leftW + 0.3, y: TOP - 0.05, w: tableW, colW: [2.4, 1.1], fontFace: FONT, fontSize: 11,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.04, 0.08, 0.04, 0.08], autoPage: false,
    });
    note(slide, [
        'Эх сурвалж: CRM-ийн болсон уулзалт (ирээгүй, цуцалсан биш), уулзалтын эхний сонирхсон байр (блок + загвар); 7 хоног = Лхагва–Мягмар.',
        `«${NO_INTEREST}» — сонирхсон загвар бүртгээгүй уулзалт.`,
        `«Сэжим» — тайлант 7 хоногийн (${dot(report.range.from)} – ${dot(report.range.to)}) шинэ харилцагчтай уулзалт хаанаас ирснээр; «Нийт» = шинэ уулзалтын тоо.`,
        referral.available ? null : '«Сэжим (хаанаас ирсэн)» жагсаалт/талбар хараахан бэлэн биш (шинэчлэл суулгаагүй) — шинэ уулзалт бүгд «Тодорхойгүй».',
        legend.length > shown.length ? `Тайлбарт багтаагүй ${legend.length - shown.length} загвар графикт байна.` : null,
        ...report.notes,
    ]);
}

// 11–12. Давхрын зураглал (блок бүр нэг слайд).
function floorMaps(pres: PptxGenJS, ctx: Ctx) {
    const report = ctx.input.weeklySales;
    const name = ctx.name.toUpperCase();
    if (!report) return unavailable(content(pres, ctx.name, 'ДАВХРЫН ЗУРАГЛАЛ'), ctx, 'weeklySales', TOP - 0.2);
    if (!report.inventory?.floorMaps.length) {
        const slide = content(pres, ctx.name, 'ДАВХРЫН ЗУРАГЛАЛ');
        muted(slide, 'Байрны үлдэгдлийн мэдээлэл алга (ERP бүтээгдэхүүний экспорт эсвэл байрны бүртгэл).', TOP - 0.2);
        return;
    }
    const source = report.inventory.source;
    floorMapSlides(pres, report, {
        kicker: ctx.name,
        title: block => `ДАВХРЫН ЗУРАГЛАЛ — ${name} ${block.toUpperCase()} БЛОК`,
        notes: [`Эх сурвалж: ${source.kind === 'erp' ? `ERP «${source.source}»` : source.source} (${source.date}).`],
    });
}

// 13. Оны төлөвлөгөө, гүйцэтгэл: сар, 1–N сар, бүтэн жил × блок × үзүүлэлт.
function yearTableSlide(pres: PptxGenJS, ctx: Ctx) {
    const slide = content(pres, ctx.name, `${ctx.year} ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ`, `Тайлант өдөр ${dot(ctx.input.range.to)} хүртэл · дүн ₮`);
    const plan = ctx.input.plan;
    const row = plan?.months[ctx.month - 1];
    if (!plan || !row) return unavailable(slide, ctx, 'plan');
    const metrics: Array<{ key: PlanMetricKey; label: string; format: (value: number) => string }> = [
        { key: 'contract_count', label: 'Тоо хэмжээ', format: value => value.toLocaleString('en-US') },
        { key: 'contract', label: 'Гэрээний дүн', format: digits },
        ...(ctx.cashVisible ? [{ key: 'cashflow' as const, label: 'Мөнгөн урсгал', format: digits }] : []),
    ];
    const scopes: Array<{ label: string; month: PlanScopeCells; ytd: PlanYearScope; total?: boolean }> = [
        ...MONTHLY_SALES_BLOCKS.map(block => ({ label: MONTHLY_SALES_BLOCK_LABELS[block], month: row.blocks[block], ytd: plan.ytd.blocks[block] })),
        { label: 'Нийт', month: row.total, ytd: plan.ytd.total, total: true },
    ];
    const groupHead = (text: string): Cell => ({ text, options: { bold: true, color: C.ink, fill: { color: C.surface }, align: 'center', colspan: 3 } });
    const sub = ['Нийт төлөвлөгөө', 'Нийт гүйцэтгэл', 'Гүйцэтгэл хувиар'];
    const head1: Cell[] = [
        { text: 'Блок', options: { bold: true, color: C.muted, fill: { color: C.surface }, rowspan: 2, valign: 'middle' } },
        { text: 'Үзүүлэлт', options: { bold: true, color: C.muted, fill: { color: C.surface }, rowspan: 2, valign: 'middle' } },
        groupHead(`${ctx.month}-р сар`), groupHead(`1–${ctx.month} сар`), groupHead(`${ctx.year} он`),
    ];
    const head2 = [0, 1, 2].flatMap(() => sub.map((text, index) => headCell(text, index === 2 ? 'center' : 'right')));
    const body: Cell[][] = scopes.flatMap(scope => metrics.map((metric, index) => {
        const month = scope.month.metrics[metric.key];
        const ytd = scope.ytd.metrics[metric.key];
        const fmt = (value: number | null | undefined, lowerBound = false) => planValueText(value ?? null, lowerBound, metric.format);
        const extra = scope.total ? { bold: true } : {};
        return [
            ...(index === 0 ? [bodyCell(scope.label, 'left', { bold: true, rowspan: metrics.length, valign: 'middle' })] : []),
            bodyCell(metric.label, 'left', extra),
            bodyCell(fmt(month?.plan), 'right', extra), bodyCell(fmt(month?.actual, month?.lowerBound), 'right', extra), bodyCell(wholePct(month?.actual, month?.plan, month?.lowerBound), 'center', extra),
            bodyCell(fmt(ytd?.plan), 'right', extra), bodyCell(fmt(ytd?.actual, ytd?.lowerBound), 'right', extra), bodyCell(wholePct(ytd?.actual, ytd?.plan, ytd?.lowerBound), 'center', extra),
            bodyCell(fmt(ytd?.yearPlan), 'right', extra), bodyCell(fmt(ytd?.actual, ytd?.lowerBound), 'right', extra), bodyCell(wholePct(ytd?.actual, ytd?.yearPlan, ytd?.lowerBound), 'center', extra),
        ];
    }));
    slide.addTable([head1, head2, ...body], {
        x: M, y: TOP - 0.05, w: CW, colW: [1.05, 1.48, ...[0, 1, 2].flatMap(() => [1.25, 1.25, 0.7])], fontFace: FONT, fontSize: 10,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.03, 0.06, 0.03, 0.06], autoPage: false,
    });
    note(slide, [
        `Эх сурвалж: «Төлөвлөгөөний биелэлт» — ${ctx.year} он, тайлант өдөр (${ctx.input.range.to}) хүртэл; гэрээ захиалга өгсөн огноогоор, цуцлагдсаныг хассан.`,
        `«${ctx.year} он»-ы гүйцэтгэл = 1–${ctx.month} сарын гүйцэтгэл; хувь = бүтэн жилийн төлөвлөгөөнөөс. Аль нэг сард төлөвлөгөө оруулаагүй бол нийт төлөвлөгөө «—».`,
        ctx.cashVisible ? cashSource(plan, row.total.metrics.cashflow) : 'Мөнгөн урсгалын мөрийг санхүүгийн эрхтэй хүн харна.',
        plan.undated.count ? `«+» — огноогүй ${plan.undated.count} гэрээтэй тул доод хязгаар. ${undatedContractsHint(plan.undated.count)}` : null,
    ]);
}

// 16. Сарын бусад ажлын төлөвлөгөө («Энэ сард хийгдэх ажил» — мөр бүр цэг).
function planWorkSlides(pres: PptxGenJS, ctx: Ctx) {
    const title = `${ctx.month}-р сарын бусад ажлын төлөвлөгөө`;
    const slides = salesSlides(ctx, ['plan']);
    if (!slides.length) {
        const slide = content(pres, ctx.name, title);
        muted(slide, 'Энэ сарын ажлын төлөвлөгөө оруулаагүй. Хурлын хуудасны «Борлуулалтын нэмэлт слайд» хэсэгт «Энэ сард хийгдэх ажил» сэдвээр нэмнэ.', TOP - 0.2, 0.9);
        return;
    }
    for (const slide of slides) customSlide(pres, { ...slide, title: slide.title.trim() || title }, ctx.input.images);
}

// 17. Төгсгөл.
function closingSlide(pres: PptxGenJS, ctx: Ctx) {
    const slide = pres.addSlide({ masterName: COVER });
    if (ctx.input.logo) placeImage(slide, ctx.input.logo, { x: M, y: 1.2, w: CW, h: 1.4 }, 'center', 'Лого');
    slide.addText('Анхаарал хандуулсанд баярлалаа.', { x: M + 0.2, y: 2.9, w: CW - 0.4, h: 1.1, fontFace: FONT, fontSize: 36, bold: true, color: C.white, align: 'center', margin: 0, valign: 'middle', isTextBox: true });
    slide.addText(`${ctx.name} · ${teamDeckPeriod(ctx.input.range)}`, { x: M + 0.2, y: 4.05, w: CW - 0.4, h: 0.5, fontFace: FONT, fontSize: 16, color: C.navy2, align: 'center', margin: 0, isTextBox: true });
}

/** Бүх слайдыг багийн илтгэлийн дарааллаар нэмнэ. `pres` — шинэ `new PptxGenJS()` (нэг файлд нэг удаа). */
export function buildTeamDeck(pres: PptxGenJS, input: TeamDeckInput): PptxGenJS {
    const name = input.branding?.displayName?.trim() || input.projectName;
    const label = WEEKLY_DECK_LABEL['sales-team'];
    pres.layout = 'LAYOUT_WIDE';
    pres.author = 'Vertmon Hub';
    pres.company = 'Vertmon';
    pres.title = `${name} · ${label} · Лхагва гарагийн хурал ${input.meetingDate}`;
    pres.subject = `Тайлант хугацаа ${input.range.from} – ${input.range.to}`;
    pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
    defineLayouts(pres, input.branding?.footerText?.trim() || TEAM_DECK_FOOTER);
    const month = input.range.to.slice(0, 7);
    const ctx: Ctx = {
        input, name, year: Number(input.range.to.slice(0, 4)), month: Number(input.range.to.slice(5, 7)),
        monthRange: { from: `${month}-01`, to: input.range.to },
        cashVisible: !!input.plan && !input.plan.cashHidden && input.plan.cash !== null,
    };
    const blockUndated = (block: MonthlySalesBlock) => (plan: TeamPlanReport) => plan.undated.byScope[block];

    coverSlide(pres, ctx);                                                       // 1
    negotiationSlides(pres, ctx);                                                // 2
    monthContractSlides(pres, ctx);                                              // 3
    for (const block of MONTHLY_SALES_BLOCKS) {                                  // 4–6
        planCardSlide(pres, ctx, BLOCK_TITLE[block], row => row.blocks[block], blockUndated(block));
    }
    planCardSlide(pres, ctx, `${ctx.month}-Р САРЫН ГЭРЭЭНИЙ НИЙТ ТӨЛӨВЛӨГӨӨ`, row => row.total, plan => plan.undated.count, row => [  // 7
        row.outside.count ? `Төлөвлөгөөнд хамаарахгүй ${row.outside.count} гэрээ (Агуулах, Үйлчилгээ г.м.) гүйцэтгэлд ороогүй.` : null,
    ]);
    stretchSlide(pres, ctx);                                                     // 8
    activitySlide(pres, ctx);                                                    // 9
    meetingSlide(pres, ctx);                                                     // 10
    floorMaps(pres, ctx);                                                        // 11–12
    yearTableSlide(pres, ctx);                                                   // 13
    for (const slide of salesSlides(ctx, TEAM_DECK_PHOTO_SECTIONS)) customSlide(pres, slide, input.images);  // 14–15
    planWorkSlides(pres, ctx);                                                   // 16
    closingSlide(pres, ctx);                                                     // 17
    return pres;
}
