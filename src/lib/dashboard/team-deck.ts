import type PptxGenJS from 'pptxgenjs';
import {
    area, bodyCell, BOTTOM, C, clip, content, count, COVER, customSlide, CW, defineLayouts, dot, floorMapSlides, FONT, footerSum,
    H, headCell, inventorySourceNote, M, managerShort, money, note, tableSlides, TOP, W, WEEKLY_DECK_LABEL, type DeckImage,
} from './weekly-deck';
import type { ReportContractLine, WeeklySalesReport } from './weekly-sales';
import type { WeeklySlide, WeeklySlideSection } from './weekly-slides';
import { ACTIVITY_METRIC_LABEL, ACTIVITY_METRICS, type ActivityMetric, type SalesActivityReport } from './sales-activity';
import { MEETING_AREA_BANDS, type MeetingDetailsReport } from './meeting-details';
import type { NegotiationsReport, NegotiationSum } from './negotiations';
import { hasReportBranding, type ReportBranding } from './report-branding';
import { undatedContractsHint } from './contract-dates';
import { PRODUCT_KIND_LABEL } from '@/lib/erp/records';
import { MONTHLY_SALES_BLOCK_LABELS, MONTHLY_SALES_BLOCKS } from '@/lib/sales/monthly';
import {
    planValueText, type PlanCell, type PlanMetricKey, type PlanMonthRow, type PlanPerformance, type PlanScopeCells, type PlanYearScope,
} from '@/lib/sales/plan-performance';
import { formatMNT } from '@/lib/utils/currency';
import { assigneeInitialsText, workPlanProgress, type WorkPlanData } from '@/lib/sales/work-plan';

/**
 * Лхагвын хурлын БОРЛУУЛАЛТЫН АЛБАНЫ ЗАГВАРЫН илтгэл (W2, `sales-team` — «Борлуулалт (албаны загвар)»).
 * Агуулга, дараалал нь борлуулалтын албаны загварын (tailan jishee, 2026-11-13) 12 слайдтай ижил: нүүр, сарын захиалгын
 * гэрээ, яригдаж буй гэрээ, сарын ба оны төлөвлөгөө-гүйцэтгэл, тоон мэдээлэл (дуудлага; уулзалт), уулзалтын дэлгэрэнгүй,
 * давхрын зураглал, бусад ажлын төлөвлөгөө, төгсгөл — хурлын хуудсанд гараар нэмсэн слайд зөвхөн нэмсэн үед; загвар нь Hub-ийнх (Arial, Hub-ийн өнгө,
 * LAYOUT_WIDE) — `weekly-deck.ts`-ийн туслахуудыг хуваалцана. Цэвэр функц: хөтөч (`weekly-deck-export.ts`) ба тест.
 *
 * Дүрэм (W1–W17): 7 хоног = Лхагва→Мягмар; дүн бүтэн оронтой (`formatMNT`), хувь бүхэл, доод хязгаар «+»,
 * тодорхойгүй «—» (хэзээ ч 0₮ биш). Сарын гэрээний «Урьдчилгаа» багана = санхүүгийн эрхтэйд ERP-ийн «Нийт төлсөн дүн»
 * (эзэмшигчийн шийдвэр 2026-11-13), эс бөгөөс нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш (W6/W7); мөнгөн урсгалд нэмэхгүй. Мөнгөн урсгалыг зөвхөн санхүүгийн эрхтэйд (`cashHidden` бол тоо огт гаргахгүй). Ачаалж чадаагүй
 * эх сурвалжийн слайд «мэдээлэл ачаалж чадсангүй» гэж бичиж, шалтгааныг тэмдэглэлд — бусад слайд хэвээр.
 */

/** Багийн загварын илтгэлийн эх сурвалж (ачаалж чадаагүйг тэмдэглэлд нэрлэнэ). */
export type TeamDeckSource = 'plan' | 'activity' | 'meetings' | 'negotiations' | 'weeklySales' | 'workPlan';
export const TEAM_DECK_SOURCE_LABEL: Record<TeamDeckSource, string> = {
    plan: 'Төлөвлөгөөний биелэлт',
    activity: 'Борлуулалтын тоон мэдээлэл',
    meetings: 'Уулзалтын дэлгэрэнгүй',
    negotiations: 'Ярилцаж буй гэрээ',
    weeklySales: 'Сарын гэрээ, давхрын зураглал',
    workPlan: 'Сарын ажлын төлөвлөгөө',
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
    /** Сарын «бусад ажлын төлөвлөгөө»-ний жагсаалт (хариуцагч, чек); өгөөгүй / ачаалж чадаагүй бол зөвхөн нэмэлт слайдаар. */
    workPlan?: WorkPlanData | null;
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
        hasReportBranding(input.branding) ? null : 'Илтгэлийн брэнд (нүүрний зураг, лого, хөл бичвэр) тохируулаагүй эсвэл уншиж чадаагүй — анхдагч загвар.',
    ]);
}

// 2. Ярилцаж буй гэрээ (W13) + «Яригдаж буй гэрээ» сэдвийн нэмэлт слайд.
/**
 * Баганын өргөн (инч, нийт CW): толгойн үг бүр (10pt тод, захын зай 0.08") багана дотроо тасрахгүй, «Сэжим»-ийн түгээмэл
 * утга («Мандала Гарден ОС») нэг мөрөнд — Arial-ийн өргөнөөр тест шалгана (`table-layout.ts`).
 */
const NEGOTIATION_W = [0.5, 0.7, 0.95, 0.75, 0.85, 1.1, 1.25, 1.45, 1.4, 1.25, 1.933];
function negotiationSlides(pres: PptxGenJS, ctx: Ctx) {
    const title = 'ЯРИГДАЖ БУЙ ГЭРЭЭНИЙ ДЭЛГЭРЭНГҮЙ';
    const report = ctx.input.negotiations;
    if (!report) {
        unavailable(content(pres, ctx.name, title), ctx, 'negotiations', TOP - 0.2);
    } else {
        // Жагсаалт (лидийн төлөв) түүхгүй — хурлын дараа татвал хурлын өдрийнх биш, татсан өдрийнх; слайд дээр ч хэлнэ.
        const late = report.asOf > ctx.input.meetingDate;
        const asOfText = late ? ` · ${dot(report.asOf)}-ний төлөв, үнээр — хурлын (${dot(ctx.input.meetingDate)}) дараа татсан` : '';
        const notes = [
            'Эх сурвалж: CRM — «Хэлэлцэж байна» / «Санал тавьсан» төлөвтэй, амьд гэрээгүй лид; блок, давхар, талбай, урьдчилгааны хувь = сүүлийн болсон уулзалтын сонирхол.',
            late ? `Ярилцаж буй гэрээний жагсаалт түүхгүй: хурлын өдрийн (${dot(ctx.input.meetingDate)}) биш, татсан өдрийн (${dot(report.asOf)}) төлөв, үнээр — бусад слайд тайлант 7 хоногийнх.` : null,
            report.pricing
                ? `Мкв үнэ, нийт үнэ, урьдчилгаа — өнөөдрийн үнээр (${dot(report.asOf)}, баталсан үнийн тохиргоо v${report.pricing.version}).`
                : `Мкв үнэ, нийт үнэ, урьдчилгаа — өнөөдрийн үнээр (${dot(report.asOf)}); идэвхтэй үнийн тохиргоо алга бол «—».`,
            '«Урьдчилгаа нөхцөл» тодорхойлогдоогүй (W13) тул «—».',
            ...report.notes,
        ].filter((line): line is string => !!line);
        if (!report.rows.length) {
            const slide = content(pres, ctx.name, title, late ? asOfText.slice(3) : `Үнийн өдөр ${dot(report.asOf)}`);
            muted(slide, 'Ярилцаж буй гэрээ алга.', TOP);
            note(slide, notes.slice(0, late ? 2 : 1).concat(report.notes));
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
                kicker: ctx.name, title, subtitle: late ? `${totals.count} лид${asOfText}` : `${totals.count} лид · үнэ ${dot(report.asOf)}-ний байдлаар`, head, rows, footer,
                colW: NEGOTIATION_W, perSlide: 12, fontSize: 10, notes,
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
/** «Давхар», «Урьдчилгаа» хуудасласан хүснэгтийн 0.08" захтай ч тасрахгүй; «Сэжим» түгээмэл утгаараа нэг мөрөнд. */
const RESIDENTIAL_W = [0.45, 1.15, 0.75, 0.55, 0.7, 0.75, 1.45, 1.0, 1.1, 1.3, 1.3, 1.633];
/** Нэг слайдад хоёр хүснэгт багтах мөрийн дээд тоо (толгой, хөл, гарчгийг оруулаад BOTTOM-оос дээш). */
const MONTH_LINES_ONE_SLIDE = 10;
const HEAD_H = 0.42;
const ROW_H = 0.27;

/** «Урьдчилгаа» баганын утга: ERP-ийн төлсөн дүн (мэдэгдэж байвал) эсвэл нөхцлөөр төлөх урьдчилгаа — `monthContractSlides` шийднэ. */
type AdvanceOf = (line: ReportContractLine) => number | null;

function parkingTable(lines: ReportContractLine[], advanceOf: AdvanceOf): { head: Cell[]; rows: Cell[][]; footer: Cell[] } {
    return {
        head: PARKING_HEAD.map((text, index) => headCell(text, [3, 6, 7, 8].includes(index) ? 'right' : index === 0 || index === 5 ? 'center' : 'left')),
        rows: lines.map((line, index) => [
            bodyCell(String(index + 1), 'center'), bodyCell(managerShort(line.manager)), bodyCell(line.unit ?? '—'), bodyCell(area(line.area), 'right'),
            bodyCell(line.customer ? clip(line.customer, 24) : '—'), bodyCell(line.advanceCondition ?? '—', 'center'), bodyCell(money(line.total), 'right'),
            bodyCell(money(advanceOf(line)), 'right'), bodyCell('—', 'right'),
        ]),
        footer: [
            bodyCell('Нийт', 'left', { bold: true, colspan: 3 }), bodyCell(sumText(lines.map(line => line.area), value => area(value)), 'right', { bold: true }),
            bodyCell(''), bodyCell(''), bodyCell(footerSum(lines.map(line => line.total)), 'right', { bold: true }),
            bodyCell(footerSum(lines.map(advanceOf)), 'right', { bold: true }), bodyCell('—', 'right', { bold: true }),
        ],
    };
}

function residentialTable(lines: ReportContractLine[], advanceOf: AdvanceOf): { head: Cell[]; rows: Cell[][]; footer: Cell[] } {
    return {
        head: RESIDENTIAL_HEAD.map((text, index) => headCell(text, [5, 8, 9, 10].includes(index) ? 'right' : [0, 2, 3, 4, 7].includes(index) ? 'center' : 'left')),
        rows: lines.map((line, index) => [
            bodyCell(String(index + 1), 'center'), bodyCell(managerShort(line.manager)), bodyCell(line.rooms ? `${line.rooms} өрөө` : '—', 'center'),
            bodyCell(line.block ?? '—', 'center'), bodyCell(count(line.floor), 'center'), bodyCell(area(line.area), 'right'),
            bodyCell(line.customer ? clip(line.customer, 18) : '—'), bodyCell(line.advanceCondition ?? '—', 'center'), bodyCell(money(line.pricePerSqm), 'right'),
            bodyCell(money(line.total), 'right'), bodyCell(money(advanceOf(line)), 'right'), bodyCell(line.referral ? clip(line.referral, 16) : '—'),
        ]),
        footer: [
            bodyCell('Нийт', 'left', { bold: true, colspan: 5 }), bodyCell(sumText(lines.map(line => line.area), value => area(value)), 'right', { bold: true }),
            bodyCell(''), bodyCell(''), bodyCell(''), bodyCell(footerSum(lines.map(line => line.total)), 'right', { bold: true }),
            bodyCell(footerSum(lines.map(advanceOf)), 'right', { bold: true }), bodyCell(''),
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
    // «Урьдчилгаа» багана (эзэмшигчийн шийдвэр 2026-11-13): санхүүгийн эрхтэй үед ERP-ийн «Нийт төлсөн дүн» — HUB гэрээний
    // жагсаалтын файлаас гэрээгээр тулгасан дүн (`plan.contractPaid`), ERP гэрээний экспортоос уншсан сард мөрийн өөрийн
    // төлсөн дүн. Мэдэгдэхгүй нь «—» (0₮ биш). Эрхгүй эсвэл төлсөн дүнгийн файлгүй бол өмнөх шиг нөхцлөөр төлөх урьдчилгаа.
    const hubPaid = ctx.cashVisible ? ctx.input.plan?.contractPaid ?? null : null;
    const erpExport = ctx.cashVisible && report.sources.contracts === 'erp';
    const advanceOf: AdvanceOf = hubPaid ? line => hubPaid.byContract[line.key] ?? null : erpExport ? line => line.paid : line => line.advance;
    const advanceNote = hubPaid
        ? `«Урьдчилгаа» — ERP-ийн төлсөн дүн («Бэлэн төлөлт», бартер ороогүй; HUB гэрээний жагсаалт, ${hubPaid.asOf}-ний файлаар): тухайн гэрээнд өнөөг хүртэл бэлнээр орсон мөнгө. Файлд дүнгүй эсвэл тулгагдаагүй гэрээ «—» (0₮ биш); нийлбэрийн «+» = зарим нь тодорхойгүй.`
        : erpExport ? '«Урьдчилгаа» — ERP гэрээний экспортын «Нийт төлсөн дүн»: тухайн гэрээнд өнөөг хүртэл орсон мөнгө; дүнгүй бол «—».'
            : `«Урьдчилгаа» — Нөхцлөөр төлөх урьдчилгаа — орсон мөнгө биш (W7).${ctx.cashVisible ? ' «Бэлэн төлөлт» (эсвэл «Нийт төлсөн дүн») баганатай HUB файл оруулбал орсон мөнгө гарна.' : ' Орсон мөнгийг (ERP-ийн «Бэлэн төлөлт») санхүүгийн эрхтэй хэрэглэгчийн татсан илтгэл харуулна.'}`;
    const notes = [
        report.sources.contracts === 'erp' && report.sources.sales
            ? `Эх сурвалж: ERP гэрээний экспорт «${report.sources.sales.source}» (${report.sources.sales.date}).`
            : 'Эх сурвалж: Hub-ийн гэрээ (HUB гэрээний жагсаалт, захиалга өгсөн огноогоор).',
        `Сарын эхнээс тайлант өдөр (${report.range.to}) хүртэлх амьд гэрээ; цуцлагдсан орохгүй.`,
        advanceNote,
        '«Хүлээгдэж буй» — төлбөрийн мэдээлэл ороогүй тул «—» (W16).',
        'Захиалагчийн нэрийг зөвхөн гэрээний эрхтэй хэрэглэгч харна; регистрийн дугаар гаргахгүй.',
        otherKinds.length ? `Хүснэгтэд ороогүй: ${otherKinds.join(', ')}.` : null,
        undated ? undatedContractsHint(undated) : null,
    ].filter((line): line is string => !!line);
    const kinds = [
        { label: 'Дулаан зогсоол', lines: parking, table: parkingTable(parking, advanceOf), colW: PARKING_W },
        { label: 'Орон сууц', lines: residential, table: residentialTable(residential, advanceOf), colW: RESIDENTIAL_W },
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

// 4. Сарын төлөвлөгөө, гүйцэтгэл: эх сурвалж, «+»-ийн шалтгааны туслахууд (слайд нь `monthPlanSlide`).
const CASH_HIDDEN = 'Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.';

/** Мөнгөн урсгалын гүйцэтгэлийн эх сурвалж (гар / HUB «Нийт төлсөн дүн» / дэвтэр). */
function cashSource(plan: TeamPlanReport, cell: PlanCell | undefined): string | null {
    if (!plan.cash) return null;
    if (cell?.source === 'manual') return 'Мөнгөн урсгалын гүйцэтгэл: удирдлагын гараар оруулсан дүн.';
    const system = plan.cash.source === 'hub_paid'
        ? `HUB файлын төлсөн дүн («Бэлэн төлөлт», бартер ороогүй; ${plan.cash.hubPaidAsOf ?? '—'}-ний байдлаар) — тухайн сард захиалсан гэрээнээс орсон мөнгө`
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
 * «Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй)» — мэдээлэл, мөнгөн урсгал биш (W6). Урьдчилгааны дүнгүй гэрээ
 * эсвэл тухайн хүрээнд огноогүй гэрээ (энэ сарынх байж болох) байвал доод хязгаар «+» (`prepaymentLowerBound`).
 */
const prepaymentText = (cells: PlanScopeCells) => planValueText(cells.prepaymentDue, cells.prepaymentLowerBound, value => formatMNT(value));
/** Урьдчилгааны «+»-ийн шалтгаан (тэмдэглэлд). */
function prepaymentNote(cells: PlanScopeCells): string | null {
    if (cells.prepaymentDue === null || !cells.prepaymentLowerBound) return null;
    const reasons = [
        cells.prepaymentMissing ? `урьдчилгааны дүнгүй ${cells.prepaymentMissing} гэрээ` : null,
        cells.undated ? `энэ сарынх байж болох огноогүй ${cells.undated} гэрээ` : null,
    ].filter(Boolean);
    return `Энэ сарын урьдчилгаа доод хязгаар («+»): ${reasons.join(', ')}.`;
}
/** Мөнгөн урсгалд гараар ч, системд ч дүнгүй блокууд (нийт хүрээ: эдгээрээс «+» үүснэ). */
function missingCashBlocks(row: PlanMonthRow, scope: PlanScopeCells): string[] {
    if (scope !== row.total) return [];
    return MONTHLY_SALES_BLOCKS.filter(block => row.blocks[block].metrics.cashflow?.actual == null).map(block => MONTHLY_SALES_BLOCK_LABELS[block]);
}

/**
 * Системийн мөнгөн урсгал бүрэн биш байх шалтгаан (plan-performance-ийн доод хязгаарын дүрэм): HUB «Нийт төлсөн дүн»
 * горимд огноогүй гэрээний төлсөн дүн аль сард орохыг мэдэхгүй; төлсөн дүн нь тодорхойгүй гэрээ (`partial`).
 */
function systemCashCauses(plan: TeamPlanReport, undated: number): string[] {
    return [
        plan.cash?.source === 'hub_paid' && undated > 0 ? `огноогүй ${undated} гэрээний HUB-ийн төлсөн дүн аль сард орохыг мэдэхгүй` : null,
        plan.cash?.availability === 'partial' ? 'зарим гэрээний төлсөн дүн тодорхойгүй' : null,
    ].filter((cause): cause is string => !!cause);
}

/**
 * Мөнгөн урсгалын «+» / «—»-ийн шалтгаан — гэрээний «+»-ээс тусдаа: нийт хүрээнд гүйцэтгэл оруулаагүй блок, системийн
 * шалтгаан (гараар оруулаагүй блокуудын огноогүй гэрээ, тодорхойгүй төлсөн дүн). Гараар оруулсан блок системээс хамаарахгүй.
 */
function cashLowerBoundNote(plan: TeamPlanReport, row: PlanMonthRow, scope: PlanScopeCells, shown: boolean): string {
    const missing = missingCashBlocks(row, scope);
    const undated = scope === row.total
        ? MONTHLY_SALES_BLOCKS.filter(block => row.blocks[block].metrics.cashflow?.source !== 'manual').reduce((sum, block) => sum + row.blocks[block].undated, 0)
        : scope.undated;
    const causes = [...(missing.length ? [`гүйцэтгэл оруулаагүй, системд ч дүнгүй блок — ${missing.join(', ')}`] : []), ...systemCashCauses(plan, undated)];
    const head = shown ? 'Мөнгөн урсгалын «+» — доод хязгаар' : 'Мөнгөн урсгал «—» — тодорхойгүй';
    return `${head}: ${causes.length ? causes.join('; ') : 'системийн дүн бүрэн биш'}.${missing.length ? ' Мөнгө ороогүй блокт /admin/sales-targets-д 0 гэж оруулна.' : ''}`;
}

/** Сарын төлөвлөгөөний слайдын тэмдэглэл (нийт хүрээ): эх сурвалж, «+»-ийн шалтгаан, урьдчилгааны мэдээлэл. */
function planNotes(ctx: Ctx, plan: TeamPlanReport, row: PlanMonthRow, cells: PlanScopeCells): string[] {
    const contract = cells.metrics.contract;
    return [
        `Эх сурвалж: «Төлөвлөгөөний биелэлт» — ${ctx.year} оны ${ctx.month}-р сар, тайлант өдөр (${ctx.input.range.to}) хүртэл.`,
        contractSource(contract),
        ctx.cashVisible ? cashSource(plan, cells.metrics.cashflow) : 'Мөнгөн урсгалын төлөвлөгөө, гүйцэтгэлийг санхүүгийн эрхтэй хүн харна.',
        contract?.lowerBound
            ? `«+» — доод хязгаар: ${cells.undated ? `огноогүй ${cells.undated} гэрээ` : 'дүн нь тодорхойгүй гэрээ'} байна; тухайн сард мэдэгдэх дүнгүй бол «—».` : null,
        ctx.cashVisible && cells.metrics.cashflow?.lowerBound ? cashLowerBoundNote(plan, row, cells, cells.metrics.cashflow.actual !== null) : null,
        'Хувь = гүйцэтгэл / төлөвлөгөө, бүхэл тоогоор.',
        '«Энэ сарын гэрээний урьдчилгаа» = тухайн сард захиалсан амьд гэрээний нөхцлөөр төлөх урьдчилгаа (орсон + хүлээгдэж буй) — мөнгөн урсгал биш, мөнгөн урсгалд нэмэхгүй (W6).',
        prepaymentNote(cells),
    ].filter((line): line is string => !!line);
}

/**
 * 4. Сарын борлуулалтын төлөвлөгөө, гүйцэтгэл — багийн загварын НЭГ хүснэгт (2026-11-13: блок тус бүрийн карт, «нэмэлт
 * төлөвлөгөө» слайдын оронд): блок × үзүүлэлт (тоо хэмжээ, гэрээний дүн, санхүүгийн эрхтэйд мөнгөн урсгал) × төлөвлөгөө /
 * гүйцэтгэл / хувь, хувийн нүд өнгөн дүүргэлттэй. Доор нь сарын урьдчилгааны мэдээлэл (W6) ба нэмэлт төлөвлөгөө (W8) нэг
 * нэг мөрөөр; эх сурвалж, «+»-ийн шалтгаан тэмдэглэлд блокоор.
 */
const MONTH_PLAN_HEAD_H = 0.36;
const MONTH_PLAN_ROW_H = 0.32;
const MONTH_PLAN_LABEL_W = 1.7;
const MONTH_PLAN_METRIC_W = 2.0;
const MONTH_PLAN_PCT_W = 1.7;
const MONTH_PLAN_AMOUNT_W = (CW - MONTH_PLAN_LABEL_W - MONTH_PLAN_METRIC_W - MONTH_PLAN_PCT_W) / 2;
function monthPlanSlide(pres: PptxGenJS, ctx: Ctx) {
    const slide = content(pres, ctx.name, `${ctx.month}-Р САРЫН БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ`, `${dot(ctx.monthRange.from)} – ${dot(ctx.monthRange.to)} хүртэл · дүн ₮`);
    const plan = ctx.input.plan;
    const row = plan?.months[ctx.month - 1];
    if (!plan || !row) return unavailable(slide, ctx, 'plan');
    const metrics: Array<{ key: PlanMetricKey; label: string; format: (value: number) => string }> = [
        { key: 'contract_count', label: 'Тоо хэмжээ', format: value => value.toLocaleString('en-US') },
        { key: 'contract', label: 'Гэрээний дүн', format: digits },
        ...(ctx.cashVisible ? [{ key: 'cashflow' as const, label: 'Мөнгөн урсгал', format: digits }] : []),
    ];
    const scopes: Array<{ label: string; cells: PlanScopeCells; total?: boolean }> = [
        ...MONTHLY_SALES_BLOCKS.map(block => ({ label: MONTHLY_SALES_BLOCK_LABELS[block], cells: row.blocks[block] })),
        { label: 'Нийт', cells: row.total, total: true },
    ];
    const tableY = TOP - 0.05;
    const pctX = M + MONTH_PLAN_LABEL_W + MONTH_PLAN_METRIC_W + MONTH_PLAN_AMOUNT_W * 2;
    let rowIndex = 0;
    const body: Cell[][] = scopes.flatMap(scope => metrics.map((metric, index) => {
        const cell = scope.cells.metrics[metric.key];
        const pct = cell?.actual == null || cell.plan == null || cell.plan <= 0 ? null : cell.actual / cell.plan * 100;
        pctBar(slide, { x: pctX, y: tableY + MONTH_PLAN_HEAD_H + rowIndex++ * MONTH_PLAN_ROW_H, w: MONTH_PLAN_PCT_W, h: MONTH_PLAN_ROW_H }, pct);
        const extra = scope.total ? { bold: true } : {};
        return [
            ...(index === 0 ? [bodyCell(scope.label, 'left', { bold: true, rowspan: metrics.length, valign: 'middle' })] : []),
            bodyCell(metric.label, 'left', extra),
            bodyCell(planValueText(cell?.plan ?? null, false, metric.format), 'right', extra),
            bodyCell(planValueText(cell?.actual ?? null, !!cell?.lowerBound, metric.format), 'right', extra),
            bodyCell(wholePct(cell?.actual, cell?.plan, cell?.lowerBound), 'center', extra),
        ];
    }));
    slide.addTable([
        [headCell('Блок'), headCell('Үзүүлэлт'), headCell('Нийт төлөвлөгөө', 'right'), headCell('Нийт гүйцэтгэл', 'right'), headCell('Гүйцэтгэл хувиар', 'center')],
        ...body,
    ], {
        x: M, y: tableY, w: CW, colW: [MONTH_PLAN_LABEL_W, MONTH_PLAN_METRIC_W, MONTH_PLAN_AMOUNT_W, MONTH_PLAN_AMOUNT_W, MONTH_PLAN_PCT_W],
        rowH: [MONTH_PLAN_HEAD_H, ...body.map(() => MONTH_PLAN_ROW_H)], fontFace: FONT, fontSize: 12,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.02, 0.08, 0.02, 0.08], autoPage: false,
    });

    // Хүснэгтийн доорх мөрүүд: сарын урьдчилгааны мэдээлэл (мөнгөн урсгал биш), нэмэлт төлөвлөгөө, санхүүгийн эрхгүйн тайлбар.
    const contract = row.total.metrics.contract;
    const cash = row.total.metrics.cashflow;
    const stretch = [
        row.stretch.contract === null ? null : `гэрээ ${money(row.stretch.contract)} — биелэлт ${wholePct(contract?.actual, row.stretch.contract, !!contract?.lowerBound)}`,
        !ctx.cashVisible || row.stretch.cashflow === null ? null : `мөнгөн урсгал ${money(row.stretch.cashflow)} — биелэлт ${wholePct(cash?.actual, row.stretch.cashflow, !!cash?.lowerBound)}`,
    ].filter(Boolean);
    const lines = [
        `Энэ сарын гэрээний урьдчилгаа (орсон + хүлээгдэж буй): ${prepaymentText(row.total)} (${MONTHLY_SALES_BLOCKS.map(block => `${MONTHLY_SALES_BLOCK_LABELS[block]} ${prepaymentText(row.blocks[block])}`).join(', ')})`,
        stretch.length ? `Нэмэлт төлөвлөгөө: ${stretch.join('; ')}` : null,
        ctx.cashVisible ? null : CASH_HIDDEN,
    ].filter((line): line is string => !!line);
    const linesY = tableY + MONTH_PLAN_HEAD_H + body.length * MONTH_PLAN_ROW_H + 0.12;
    lines.forEach((line, index) => slide.addText(line, {
        x: M, y: linesY + index * 0.3, w: CW, h: 0.3, fontFace: FONT, fontSize: 12, color: C.ink2, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true,
    }));

    note(slide, [
        ...planNotes(ctx, plan, row, row.total),
        // Блок бүрийн эх сурвалж, «+»-ийн шалтгаан (өмнө нь блок тус бүрийн слайдын тэмдэглэлд байсан).
        ...MONTHLY_SALES_BLOCKS.map(block => {
            const cells = row.blocks[block];
            const blockCash = cells.metrics.cashflow;
            const parts = [
                contractSource(cells.metrics.contract),
                ctx.cashVisible ? cashSource(plan, blockCash) : null,
                ctx.cashVisible && blockCash?.lowerBound ? cashLowerBoundNote(plan, row, cells, blockCash.actual !== null) : null,
                prepaymentNote(cells),
            ].filter(Boolean);
            return parts.length ? `${MONTHLY_SALES_BLOCK_LABELS[block]}: ${parts.join(' ')}` : null;
        }),
        row.outside.count ? `Төлөвлөгөөнд хамаарахгүй ${row.outside.count} гэрээ (Агуулах, Үйлчилгээ г.м.) гүйцэтгэлд ороогүй.` : null,
        stretch.length ? 'Нэмэлт төлөвлөгөө — сарын нийт гэрээ (ба мөнгөн урсгал)-ний дүн, блокгүй (W8); /admin/sales-targets-д оруулна. Гүйцэтгэл нь үндсэн төлөвлөгөөнийхтэй ижил.' : null,
        'Хувийн нүдний өнгөн дүүргэлт: 100%-д нүд дүүрнэ; «—» нүд дүүргэлтгүй.',
    ]);
}

// 9. Борлуулалтын албаны тоон мэдээлэл (борлуулалтын багийн загвар, 2026-11-12): үзүүлэлт бүр нэг карт — сарын
// төлөвлөгөө, тайлант өдөр хүртэлх төлөвлөгөө, гүйцэтгэл, хувь + 7 хоног бүрийн төлөвлөгөө / гүйцэтгэл / хувь (хувийг
// Excel-ийн data bar шиг өнгөөр дүүргэнэ). Хоёр слайд: дуудлага ба чат; уулзалт.
/**
 * «N+»-ийн эх сурвалж үзүүлэлтээр (`sales-activity.ts`): дуудлага, чат — өдрийн тайлангийн тоо (`countsSince`),
 * уулзалт — CRM-ийн уулзалтын бүртгэл (`dataSince`). Хоёр нь өөр өдрөөс эхэлдэг тул тэмдэглэлд аль нь болохыг нэрлэнэ.
 */
const LOWER_BOUND_SOURCE: Record<ActivityMetric, string> = {
    hotline: 'өдрийн тайлангийн тоо', managerLine: 'өдрийн тайлангийн тоо', chats: 'өдрийн тайлангийн тоо',
    newMeetings: 'уулзалтын бүртгэл', repeatMeetings: 'уулзалтын бүртгэл',
};
const lowerBoundSources = (metrics: readonly ActivityMetric[]) =>
    [...new Set(ACTIVITY_METRICS.filter(metric => metrics.includes(metric)).map(metric => LOWER_BOUND_SOURCE[metric]))].join(' ба ');

/** Сарын төлөвлөгөөг 7 хоногт хуваах тоо (багийн дүрэм: сарын ÷ 4). */
export const WEEKLY_PLAN_PARTS = 4;
/**
 * 7 хоногийн төлөвлөгөө = сарын төлөвлөгөө ÷ 4. Сарын хилээр тасарсан богино хэсэгт өдрөөр нь (өдөр / 7) хувь
 * тэнцүүлнэ — 3 өдрийн хэсгийг бүтэн 7 хоногийн төлөвлөгөөтэй харьцуулахгүй. Төлөвлөгөөгүй бол null.
 */
export function weeklyPlan(monthly: number | null, days: number): number | null {
    return monthly === null ? null : Math.round(monthly / WEEKLY_PLAN_PARTS * Math.min(Math.max(days, 0), 7) / 7);
}

/** Хувийн нүдний өнгөн дүүргэлт (data bar): 100%-д нүд дүүрнэ. Хүснэгтээс ӨМНӨ нэмнэ — нүд дэвсгэргүй тул ард нь харагдана. */
const PCT_BAR_COLOR = 'BBD0FB';
function pctBar(slide: Slide, cell: { x: number; y: number; w: number; h: number }, pct: number | null) {
    if (pct === null || !(pct > 0)) return;
    const inset = 0.04;
    slide.addShape('rect', {
        x: cell.x + inset, y: cell.y + inset, w: (cell.w - inset * 2) * Math.min(pct, 100) / 100, h: cell.h - inset * 2,
        fill: { color: PCT_BAR_COLOR }, line: { color: PCT_BAR_COLOR, width: 0 },
    });
}

const ACTIVITY_HEAD_H = 0.32;
const ACTIVITY_ROW_H = 0.3;
function activityCard(slide: Slide, report: SalesActivityReport, metric: ActivityMetric, label: string, box: { x: number; y: number; w: number }) {
    const month = report.month.metrics[metric];
    const known = (value: number | null, plus = false) => value === null ? '—' : `${value.toLocaleString('en-US')}${plus ? '+' : ''}`;
    slide.addText(label, { x: box.x, y: box.y, w: box.w, h: 0.36, fontFace: FONT, fontSize: 16, bold: true, color: C.ink, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    const lines: Array<[string, string]> = [
        ['Сарын төлөвлөгөө', month.plan === null ? 'оруулаагүй' : known(month.plan)],
        [`${report.month.to.slice(5, 7)}/${report.month.to.slice(8, 10)} хүртэл`, known(month.planToDate)],
        ['Гүйцэтгэл', known(month.actual, month.partial)],
        ['Гүйцэтгэл хувь', month.pct === null ? '—' : `${month.pct}%`],
    ];
    slide.addText(lines.flatMap(([name, value], index) => [
        { text: `${name} – `, options: { color: C.ink2 } },
        { text: value, options: { bold: true, color: C.ink, breakLine: index < lines.length - 1 } },
    ]), { x: box.x, y: box.y + 0.42, w: box.w, h: 1.3, fontFace: FONT, fontSize: 13, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true });

    // Толгойн үг («Төлөвлөгөө», «Гүйцэтгэл») багандаа багтах доод өргөн; илүү зайг 7 хоног ба хувийн багана хуваана.
    const spare = Math.max(0, box.w - (1.0 + 1.08 + 0.93 + 0.78)) / 2;
    const colW = [1.0 + spare, 1.08, 0.93, 0.78 + spare];
    const tableY = box.y + 1.85;
    const pctX = box.x + colW[0] + colW[1] + colW[2];
    const rows = report.buckets.map((bucket, index) => {
        const plan = weeklyPlan(month.plan, bucket.days);
        const actual = bucket.values[metric];
        const pct = actual === null || !plan ? null : Math.round(actual / plan * 100);
        pctBar(slide, { x: pctX, y: tableY + ACTIVITY_HEAD_H + index * ACTIVITY_ROW_H, w: colW[3], h: ACTIVITY_ROW_H }, pct);
        return [
            bodyCell(bucket.label), bodyCell(known(plan), 'right'), bodyCell(known(actual, bucket.partial[metric]), 'right', { bold: true }),
            bodyCell(pct === null ? '—' : `${pct}%${bucket.partial[metric] ? '+' : ''}`, 'center'),
        ];
    });
    slide.addTable([[headCell('7 хоног'), headCell('Төлөвлөгөө', 'right'), headCell('Гүйцэтгэл', 'right'), headCell('Хувь', 'center')], ...rows], {
        x: box.x, y: tableY, w: box.w, colW, rowH: [ACTIVITY_HEAD_H, ...rows.map(() => ACTIVITY_ROW_H)], fontFace: FONT, fontSize: 11,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.02, 0.08, 0.02, 0.08], autoPage: false,
    });
}

/** Чат слайдад гарахгүй (багийн загвар) — сарын тоо, төлөвлөгөө, биелэлтийг тэмдэглэлд үлдээнэ. */
function chatNote(report: SalesActivityReport): string {
    const chat = report.month.metrics.chats;
    const actual = chat.actual === null ? '—' : `${chat.actual.toLocaleString('en-US')}${chat.partial ? '+' : ''}`;
    const plan = chat.plan === null ? 'төлөвлөгөө оруулаагүй' : `төлөвлөгөө ${count(chat.planToDate)}/${count(chat.plan)}, биелэлт ${chat.pct === null ? '—' : `${chat.pct}%`}`;
    return `Чат (${report.lines.chats.join(', ') || 'суваггүй'}) — слайдад гарахгүй: сарын эхнээс ${actual}, ${plan}.`;
}

function activitySlides(pres: PptxGenJS, ctx: Ctx) {
    const title = 'БОРЛУУЛАЛТЫН АЛБА-ТООН МЭДЭЭЛЭЛ';
    const report = ctx.input.activity;
    if (!report) return unavailable(content(pres, ctx.name, title), ctx, 'activity', TOP - 0.2);
    const hotline = report.lines.hotline?.trim() || ACTIVITY_METRIC_LABEL.hotline;
    const managerLine = report.lines.managerLine?.trim() || ACTIVITY_METRIC_LABEL.managerLine;
    const labels: Record<ActivityMetric, string> = { hotline, managerLine, newMeetings: 'Шинэ уулзалт', repeatMeetings: 'Давтан уулзалт', chats: 'Чат' };
    const period = `сарын эхнээс ${dot(report.month.from)} – ${dot(report.month.to)} · 7 хоног = Лхагва–Мягмар`;
    const groups: Array<{ name: string; metrics: ActivityMetric[]; source: string }> = [
        // Багийн загварт чатын карт алга (2026-11-13): чатын сарын тоо тэмдэглэлд.
        { name: 'Дуудлага', metrics: ['hotline', 'managerLine'], source: 'Эх сурвалж: менежерүүдийн өдрийн тайланд гараар оруулсан дуудлагын тоо.' },
        { name: 'Уулзалт', metrics: ['newMeetings', 'repeatMeetings'], source: 'Эх сурвалж: CRM-ийн болсон уулзалт (шинэ / давтан харилцагч).' },
    ];
    for (const group of groups) {
        const slide = content(pres, ctx.name, title, `${group.name} · ${period}`);
        const gap = 0.35;
        const w = (CW - gap * (group.metrics.length - 1)) / group.metrics.length;
        group.metrics.forEach((metric, index) => activityCard(slide, report, metric, labels[metric], { x: M + index * (w + gap), y: TOP - 0.05, w }));
        const partial = group.metrics.filter(metric => report.month.metrics[metric].partial || report.buckets.some(bucket => bucket.partial[metric]));
        note(slide, [
            group.source,
            group.metrics.includes('hotline') ? `Шугам: «${hotline}» = өдрийн тайлангийн загварын эхний шугам, «${managerLine}» = хоёр дахь шугам.` : null,
            group.metrics.includes('hotline') ? chatNote(report) : null,
            `«${report.month.to.slice(5, 7)}/${report.month.to.slice(8, 10)} хүртэл» = сарын төлөвлөгөө × min(өдөр, 30) / 30; «Гүйцэтгэл хувь» = гүйцэтгэл / тэр хүртэлх төлөвлөгөө (сарын бүтэн төлөвлөгөөтэй биш).`,
            `7 хоногийн төлөвлөгөө = сарын төлөвлөгөө ÷ ${WEEKLY_PLAN_PARTS}; сарын хилээр тасарсан богино хэсэгт өдрөөр нь (өдөр / 7). Өмнөх сарын хэсэг ч энэ сарын төлөвлөгөөгөөр.`,
            'Хувийн нүдний өнгөн дүүргэлт: 100%-д нүд дүүрнэ. «—» = тодорхойгүй (тоо оруулаагүй эсвэл төлөвлөгөөгүй), 0 биш.',
            group.metrics.includes('hotline') ? `Өдрийн тайлангийн хамрах хүрээ (тоо оруулсан өдөр / нийт өдөр): ${report.buckets.map(bucket => `${bucket.label} ${bucket.knownDays}/${bucket.days}`).join(', ')}.` : null,
            partial.length ? `«N+» — ${lowerBoundSources(partial)} хугацааны дунд эхэлсэн тул доод хязгаар (${partial.map(metric => labels[metric]).join(', ')}).` : null,
            ...report.notes,
        ]);
    }
}

// 10. Нийт уулзалтын дэлгэрэнгүй (борлуулалтын багийн загвар, 2026-11-12): сонирхсон байр м²-ийн бүлгээр 7 хоногоор
// (блок хамаарахгүй), «Сэжим», урьдчилгаа / үлдэгдэл төлбөрийн нөхцөл.
const NO_INTEREST = 'Сонголтгүй';
const MEETING_ROW_H = 0.3;
function countTable(slide: Slide, box: { x: number; y: number; w: number }, title: string, head: [string, string], rows: Array<{ label: string; count: number }>, unknown: number, total: number) {
    slide.addText(title, { x: box.x, y: box.y, w: box.w, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: C.ink2, margin: 0, valign: 'middle', fit: 'shrink', isTextBox: true });
    const body = [
        [headCell(head[0]), headCell(head[1], 'right')],
        ...rows.map(row => [bodyCell(clip(row.label, 30)), bodyCell(String(row.count), 'right')]),
        [bodyCell('Тодорхойгүй', 'left', { color: C.muted }), bodyCell(String(unknown), 'right', { color: C.muted })],
        [bodyCell('Нийт', 'left', { bold: true }), bodyCell(String(total), 'right', { bold: true })],
    ];
    slide.addTable(body, {
        x: box.x, y: box.y + 0.34, w: box.w, colW: [box.w - 1.1, 1.1], rowH: body.map(() => 0.27), fontFace: FONT, fontSize: 11,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.02, 0.08, 0.02, 0.08], autoPage: false,
    });
}

function meetingSlide(pres: PptxGenJS, ctx: Ctx) {
    const title = 'НИЙТ УУЛЗАЛТЫН ДЭЛГЭРЭНГҮЙ';
    const report = ctx.input.meetings;
    if (!report) return unavailable(content(pres, ctx.name, title), ctx, 'meetings', TOP - 0.2);
    const slide = content(pres, ctx.name, title, `Сонирхож буй байр м²-ээр, 7 хоногоор · сэжим ба төлбөрийн нөхцөл — тайлант 7 хоног (${dot(report.range.from)} – ${dot(report.range.to)})`);

    // Дээд хүснэгт: мөр = 7 хоног, багана = м²-ийн бүлэг (блок хамаарахгүй). Тоогүй нүд хоосон; бүртгэлгүй 7 хоног «—».
    const anyWithout = report.weeks.some(week => week.withoutInterest > 0);
    const columns = [...report.bands, ...(anyWithout ? [{ key: NO_INTEREST, label: NO_INTEREST }] : [])];
    const labelW = 1.7;
    const totalW = 1.0;
    const bandW = (CW - labelW - totalW) / Math.max(1, columns.length);
    const valueOf = (week: MeetingDetailsReport['weeks'][number], key: string) => key === NO_INTEREST ? week.withoutInterest : week.byBand[key] ?? 0;
    const weekRows = report.weeks.map(week => {
        // Бүртгэл эхлэхээс өмнөх 7 хоног тодорхойгүй («0» биш); дунд нь эхэлсэн бол нийт нь доод хязгаар (9-р слайдтай нэг дүрэм).
        const unknown = (week.coverage ?? 'full') === 'none' || (week.coverage === 'partial' && !week.total);
        return [
            bodyCell(week.label, 'left', { bold: true, color: C.ink2 }),
            ...columns.map(column => bodyCell(unknown ? '—' : valueOf(week, column.key) ? String(valueOf(week, column.key)) : '', 'center')),
            bodyCell(unknown ? '—' : `${week.total}${week.coverage === 'partial' ? '+' : ''}`, 'center', { bold: true }),
        ];
    });
    slide.addTable([
        [headCell('Уулзалт'), ...columns.map(column => headCell(column.label, 'center')), headCell('Нийт', 'center')],
        ...weekRows,
    ], {
        x: M, y: TOP - 0.05, w: CW, colW: [labelW, ...columns.map(() => bandW), totalW], rowH: [0.34, ...weekRows.map(() => MEETING_ROW_H)], fontFace: FONT, fontSize: 11,
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.02, 0.08, 0.02, 0.08], autoPage: false,
    });

    // Доод гурван хүснэгт: сэжим (шинэ уулзалт), урьдчилгаа ба үлдэгдэл төлбөрийн нөхцөл (бүх болсон уулзалт).
    const y = TOP - 0.05 + 0.34 + report.weeks.length * MEETING_ROW_H + 0.35;
    const gap = 0.3;
    const w = (CW - gap * 2) / 3;
    const referral = report.referral;
    const shown = referral.rows.slice(0, 7);
    const rest = referral.rows.slice(7).reduce((sum, row) => sum + row.count, 0);
    countTable(slide, { x: M, y, w }, 'Сэжим (хаанаас ирсэн) — шинэ уулзалт', ['Сэжим', 'Уулзалт'],
        [...shown, ...(rest ? [{ label: 'Бусад', count: rest }] : [])], referral.unknown, referral.total);
    const terms = report.paymentTerms;
    countTable(slide, { x: M + w + gap, y, w }, 'Урьдчилгаа төлбөрийн нөхцөл', ['Нөхцөл', 'Уулзалт'], terms.advance.rows, terms.advance.unknown, terms.total);
    countTable(slide, { x: M + (w + gap) * 2, y, w }, 'Үлдэгдэл төлбөрийн нөхцөл', ['Нөхцөл', 'Уулзалт'], terms.remainder.rows, terms.remainder.unknown, terms.total);

    note(slide, [
        'Эх сурвалж: CRM-ийн болсон уулзалт (ирээгүй, цуцалсан биш); 7 хоног = Лхагва–Мягмар.',
        `м²-ийн хүснэгт: уулзалтын эхний сонирхсон байр, блок хамаарахгүй — орон сууц талбайгаараа (${MEETING_AREA_BANDS.map(band => band.label).join(', ')}), бусад төрөл ангиллаараа. Уулзалт бүр нэг баганад; «Нийт» = тухайн 7 хоногийн уулзалт.`,
        anyWithout ? `«${NO_INTEREST}» — сонирхсон байр бүртгээгүй уулзалт.` : null,
        `«Сэжим» — тайлант 7 хоногийн (${dot(report.range.from)} – ${dot(report.range.to)}) шинэ харилцагчтай уулзалт хаанаас ирснээр; «Нийт» = шинэ уулзалтын тоо.`,
        `Төлбөрийн нөхцөл — тайлант 7 хоногийн бүх болсон уулзалт (шинэ, давтан, худалдан авагч); уулзалт бүрт төрөл тус бүрээс нэг сонголт. «Тодорхойгүй» = сонгоогүй (0 биш). Сонирхол — мөнгө биш.`,
        referral.available ? null : '«Сэжим (хаанаас ирсэн)» жагсаалт/талбар хараахан бэлэн биш (шинэчлэл суулгаагүй) — шинэ уулзалт бүгд «Тодорхойгүй».',
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
    floorMapSlides(pres, report, {
        kicker: ctx.name,
        title: block => `ДАВХРЫН ЗУРАГЛАЛ — ${name} ${block.toUpperCase()} БЛОК`,
        notes: [inventorySourceNote(report.inventory.source)],
    });
}

// 13. Оны төлөвлөгөө, гүйцэтгэл: сар, 1–N сар, бүтэн жил × блок × үзүүлэлт.
/**
 * Хувийн багана «Гүйцэтгэл» (10pt тод 0.69") тасрахгүй өргөнтэй; дүнгийн багана «19,717,922,500+» (тод 1.05") нэг мөрөнд.
 * Захын зай 0.06" хоёр талд.
 */
const YEAR_LABEL_W = 0.85;
const YEAR_METRIC_W = 1.2;
const YEAR_PCT_W = 0.88;
const YEAR_AMOUNT_W = (CW - YEAR_LABEL_W - YEAR_METRIC_W - 3 * YEAR_PCT_W) / 6;
/** Толгойн хоёр мөр (хоёр дахь нь «Нийт төлөвлөгөө» 2 мөр болж болно) ба биеийн мөрийн өндөр — хувийн дүүргэлтийн байрлалд. */
const YEAR_HEAD_H: [number, number] = [0.3, 0.48];
const YEAR_ROW_H = 0.3;
function yearTableSlide(pres: PptxGenJS, ctx: Ctx) {
    const slide = content(pres, ctx.name, `${ctx.year} ОНЫ БОРЛУУЛАЛТЫН ТӨЛӨВЛӨГӨӨ, ГҮЙЦЭТГЭЛ`, `Тайлант өдөр ${dot(ctx.input.range.to)} хүртэл · дүн ₮`);
    const plan = ctx.input.plan;
    const row = plan?.months[ctx.month - 1];
    if (!plan || !row) return unavailable(slide, ctx, 'plan');
    // Он эхнээсх баганын сар = тайлангийн өөрийн хүрээ (тайлант өдрийг өнөөдрөөр хязгаарласан): илтгэлийн сартай зөрж болно.
    const ytdMonth = plan.throughMonth ?? ctx.month;
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
        groupHead(`${ctx.month}-р сар`), groupHead(`1–${ytdMonth} сар`), groupHead(`${ctx.year} он`),
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
    // «Гүйцэтгэл хувиар» нүдний өнгөн дүүргэлт (багийн Excel-ийн data bar): мөрийн өндөр тогтмол тул нүдний байрлал тооцогдоно.
    const ratio = (actual: number | null | undefined, target: number | null | undefined) =>
        actual === null || actual === undefined || target === null || target === undefined || target <= 0 ? null : actual / target * 100;
    const tableY = TOP - 0.05;
    const groupW = YEAR_AMOUNT_W * 2 + YEAR_PCT_W;
    let rowIndex = 0;
    for (const scope of scopes) for (const metric of metrics) {
        const month = scope.month.metrics[metric.key];
        const ytd = scope.ytd.metrics[metric.key];
        const y = tableY + YEAR_HEAD_H[0] + YEAR_HEAD_H[1] + rowIndex++ * YEAR_ROW_H;
        [ratio(month?.actual, month?.plan), ratio(ytd?.actual, ytd?.plan), ratio(ytd?.actual, ytd?.yearPlan)].forEach((pct, group) =>
            pctBar(slide, { x: M + YEAR_LABEL_W + YEAR_METRIC_W + group * groupW + YEAR_AMOUNT_W * 2, y, w: YEAR_PCT_W, h: YEAR_ROW_H }, pct));
    }
    slide.addTable([head1, head2, ...body], {
        x: M, y: tableY, w: CW, colW: [YEAR_LABEL_W, YEAR_METRIC_W, ...[0, 1, 2].flatMap(() => [YEAR_AMOUNT_W, YEAR_AMOUNT_W, YEAR_PCT_W])], fontFace: FONT, fontSize: 10,
        rowH: [...YEAR_HEAD_H, ...body.map(() => YEAR_ROW_H)],
        border: { type: 'solid', pt: 0.5, color: C.line }, valign: 'middle', margin: [0.03, 0.06, 0.03, 0.06], autoPage: false,
    });
    note(slide, [
        `Эх сурвалж: «Төлөвлөгөөний биелэлт» — ${ctx.year} он, тайлант өдөр (${ctx.input.range.to}) хүртэл; гэрээ захиалга өгсөн огноогоор, цуцлагдсаныг хассан.`,
        `«${ctx.year} он»-ы гүйцэтгэл = 1–${ytdMonth} сарын гүйцэтгэл; хувь = бүтэн жилийн төлөвлөгөөнөөс. Аль нэг сард төлөвлөгөө оруулаагүй бол нийт төлөвлөгөө «—».`,
        ytdMonth !== ctx.month ? `Тайлант 7 хоног дуусаагүй тул он эхнээсх гүйцэтгэл ${ytdMonth}-р сар хүртэл (татсан өдрөөр); ${ctx.month}-р сарын гүйцэтгэл «—».` : null,
        'Хувийн нүдний өнгөн дүүргэлт: 100%-д нүд дүүрнэ; «—» нүд дүүргэлтгүй.',
        ctx.cashVisible ? cashSource(plan, row.total.metrics.cashflow) : 'Мөнгөн урсгалын мөрийг санхүүгийн эрхтэй хүн харна.',
        row.total.undated ? `Гэрээний тоо, дүнгийн «+» — огноогүй ${row.total.undated} гэрээтэй тул доод хязгаар. ${undatedContractsHint(row.total.undated)}` : null,
        ctx.cashVisible && plan.throughMonth !== null ? yearCashGapNote(plan, plan.throughMonth) : null,
        ctx.cashVisible && plan.ytd.total.metrics.cashflow?.lowerBound && systemCashCauses(plan, row.total.undated).length
            ? `Мөнгөн урсгалын «1–${ytdMonth} сар», «он»-ы «+» — ${systemCashCauses(plan, row.total.undated).join('; ')}.` : null,
    ]);
}

/**
 * Он эхнээсх мөнгөн урсгалын «+»/«—»: 1–N сарын аль нэг блокт гараар ч, системд ч дүнгүй сарууд (сар бүрийг блокоор
 * оруулах ёстой; мөнгө ороогүй бол 0). Бүх сар мэдэгдэж байвал тэмдэглэлгүй.
 */
function yearCashGapNote(plan: TeamPlanReport, throughMonth: number): string | null {
    const months = plan.months.slice(0, throughMonth)
        .filter(row => MONTHLY_SALES_BLOCKS.some(block => row.blocks[block].metrics.cashflow?.actual == null))
        .map(row => row.month);
    if (!months.length) return null;
    return `Мөнгөн урсгалын «1–${throughMonth} сар», «он»-ы «+»/«—» — ${monthSpans(months)}-р сарын зарим блокийн гүйцэтгэл оруулаагүй, системд ч дүнгүй. Сар бүрийг блокоор /admin/sales-targets-д оруулна (мөнгө ороогүй бол 0).`;
}

/** [1,2,3,5,7,8] → «1–3, 5, 7–8». */
function monthSpans(months: readonly number[]): string {
    const spans: string[] = [];
    for (let i = 0; i < months.length; i++) {
        let j = i;
        while (j + 1 < months.length && months[j + 1] === months[j] + 1) j++;
        spans.push(j > i ? `${months[i]}–${months[j]}` : String(months[i]));
        i = j;
    }
    return spans.join(', ');
}

// 16. Сарын бусад ажлын төлөвлөгөө: Hub-ийн жагсаалт (ажил, хариуцагчийн нэрийн эхний үсэг, хийгдсэн ✓) — борлуулалтын багийн
// хүсэлт 2026-11-12; дараа нь «Энэ сард хийгдэх ажил» сэдвийн нэмэлт слайдууд (мөр бүр цэг).
const WORK_PLAN_PER_SLIDE = 12;
function planWorkSlides(pres: PptxGenJS, ctx: Ctx) {
    const title = `${ctx.month}-р сарын бусад ажлын төлөвлөгөө`;
    const slides = salesSlides(ctx, ['plan']);
    const plan = ctx.input.workPlan;
    const items = plan?.items ?? [];
    if (items.length) {
        const progress = workPlanProgress(items);
        tableSlides(pres, {
            kicker: ctx.name, title, subtitle: `Хийгдсэн ${progress.done}/${progress.total} · хариуцагч — нэрийн эхний үсгээр`,
            head: [headCell('', 'center'), headCell('Ажил'), headCell('Хариуцагч')],
            rows: items.map(item => [
                bodyCell(item.done ? '✓' : '', 'center', { bold: true, color: C.success }),
                bodyCell(clip(item.title, 110), 'left', item.done ? { color: C.muted } : {}),
                bodyCell(assigneeInitialsText(item.assignees, plan!.roster) ?? '—', 'left', { bold: true }),
            ]),
            colW: [0.6, CW - 0.6 - 2.6, 2.6], perSlide: WORK_PLAN_PER_SLIDE, fontSize: 13, fitHeight: true,
            notes: [
                'Эх сурвалж: Hub-ийн «Хурлын бэлтгэл» → «Сарын ажлын төлөвлөгөө» (ажил, хариуцагч, хийгдсэн чек).',
                `Хариуцагч: ${plan!.roster.map(manager => `${assigneeInitialsText([manager], plan!.roster)} = ${manager.name}`).join(', ') || 'жагсаалт хоосон'}.`,
                '✓ = хийгдсэн гэж чеклэсэн; хоосон = хийгдээгүй.',
            ],
        });
    }
    if (!items.length && !slides.length) {
        const slide = content(pres, ctx.name, title);
        muted(slide, 'Энэ сарын ажлын төлөвлөгөө оруулаагүй. Хурлын хуудасны «Сарын ажлын төлөвлөгөө» хэсэгт ажлаа нэмж, хариуцагчийг нь сонгоно.', TOP - 0.2, 0.9);
        if (ctx.input.failed?.workPlan) note(slide, [`${TEAM_DECK_SOURCE_LABEL.workPlan}: ${ctx.input.failed.workPlan}.`, 'Hub-ийн «Лхагва гарагийн хурал» хуудсыг шинэчлээд дахин татна уу.']);
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

    // Борлуулалтын албаны загварын 12 слайдын дараалал (tailan jishee, 2026-11-13). Хурлын хуудсанд гараар нэмсэн слайд
    // (яригдаж буй гэрээний тайлбар, өдөрлөг / барилгын зураг) зөвхөн нэмсэн үед, холбогдох хэсгийнхээ дараа гарна.
    coverSlide(pres, ctx);                                                       // 1
    monthContractSlides(pres, ctx);                                              // 2
    negotiationSlides(pres, ctx);                                                // 3
    monthPlanSlide(pres, ctx);                                                   // 4
    yearTableSlide(pres, ctx);                                                   // 5
    activitySlides(pres, ctx);                                                   // 6 (дуудлага), 7 (уулзалт)
    meetingSlide(pres, ctx);                                                     // 8
    floorMaps(pres, ctx);                                                        // 9–10
    for (const slide of salesSlides(ctx, TEAM_DECK_PHOTO_SECTIONS)) customSlide(pres, slide, input.images);  // нэмсэн үед
    planWorkSlides(pres, ctx);                                                   // 11
    closingSlide(pres, ctx);                                                     // 12
    return pres;
}
