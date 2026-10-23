/**
 * Төлөвлөгөөний биелэлт — сар × блок (Б1 · Б2 · Зогсоол) гэрээний тоо, дүн, мөнгөн урсгалын төлөвлөгөө ба гүйцэтгэл.
 * Цэвэр (DB-гүй), клиентэд аюулгүй. Ачаалагч нь `plan-performance-load.ts`.
 *
 * Дүрэм (docs/features/CONTRACT-LIST-HUB-2026-10-22.md):
 *  • Багийн гүйцэтгэл = төслийн (shop) бүх амьд, огноотой гэрээ, аль ч менежер (эзэмшигч 2026-10-22, роостероор шүүхгүй).
 *    Сар = `contract_date` (захиалга өгсөн огноо) мөрийн YYYY-MM; цуцлагдсан, устгасан гэрээ орохгүй.
 *  • Блок = `planBucketOf`. Блокоор задалсан төлөвлөгөөтэй сард бусад блокийн орон сууц, Агуулах, Үйлчилгээ
 *    «Төлөвлөгөөнд хамаарахгүй» мөрөнд; задаргаагүй (зөвхөн нийт) төлөвлөгөөтэй сард бусад блокийн орон сууц нийтэд орно.
 *  • Гар ба системийн дүнг нэг хүрээнд хэзээ ч нэмэхгүй: блокийн нүд = гараар оруулсан тоо, эс бөгөөс систем;
 *    задаргаатай үзүүлэлтийн нийт = блокуудын нийлбэр (row[f]-ийг уншихгүй); задаргаагүй гар нийт байвал түүнийг;
 *    эс бөгөөс системийн блокуудын нийлбэр.
 *  • Огноогүй амьд гэрээтэй блокийн системийн дүн доод хязгаар: тухайн сард гэрээгүй бол «—», байвал «N+».
 *    Гараар оруулсан нүд хэзээ ч «+» биш.
 *  • Ирээдүйн сарын гүйцэтгэл null, энэ сар «явцын» (хувааж таамаглахгүй).
 *  • Орсон мөнгө: гар дүн, эс бөгөөс огноотой бүртгэсэн төлбөр (бэлэн, банк, ипотек; бартер орохгүй) —
 *    амьд гэрээний төлсөн дүн бүгд мэдэгдэж байвал л бүтэн; заримынх нь NULL бол доод хязгаар; бүгд NULL бол «—».
 *    Дэвтэрт мөнгөн орлого огт бүртгэгдээгүй бол «—» (Бүртгэл алга), анхны орлогоос өмнөх сар «—» — хэзээ ч 0₮ биш.
 *    Урьдчилгааны нөхцлийн дүн, хоцролт, нийт − урьдчилгааг хэзээ ч орсон мөнгө гэж тооцохгүй.
 *  • HUB файлд «Нийт төлсөн дүн» байвал (W5/W6, эзэмшигч 2026-10-22) системийн орсон мөнгө = тухайн сард захиалсан
 *    амьд гэрээний файлын огноогоор төлсөн дүнгийн нийлбэр (cohort, `source: 'hub_paid'`); дэвтрийг уншихгүй. Файлд
 *    дүнгүй/тулгагдаагүй гэрээ, огноогүй амьд гэрээтэй блок-сар доод хязгаар. Гар блокийн дүн давамгайлна (M1).
 */
import {
    hasMonthlySalesBreakdown, MONTHLY_SALES_BLOCKS, MONTHLY_SALES_METRICS, monthlySalesAttainment,
    type MonthlySalesBlock, type MonthlySalesMetric, type MonthlySalesMonth,
} from './monthly';
import { planBucketOf, type PlanBucketSource } from './plan-buckets';
import { summarizeContracts } from '@/lib/contracts/summary';
import { unitCategoryLabel } from '@/lib/inventory/labels';
import { ubParts } from '@/lib/utils/date';

export type PlanMetricKey = MonthlySalesMetric['key'];
/** Төлөвлөгөөний хүрээ: блок, эсвэл Б1/Б2-оос бусад блокийн орон сууц (задаргаагүй төлөвлөгөөнд л нийтэд орно). */
export type PlanScope = MonthlySalesBlock | 'residential_other';
export type PlanSource = 'manual' | 'auto' | 'mixed';

export const PLAN_SOURCE_LABEL: Record<PlanSource, string> = { manual: 'Гараар', auto: 'Систем', mixed: 'Холимог' };
export const PLAN_LEGEND = '* — системээс: захиалга өгсөн огноогоор, цуцлагдсаныг хассан';
export const PLAN_CANCELLED_NOTE = 'Гүйцэтгэл одоогийн төлвөөр: дараа цуцлагдсан гэрээ захиалсан сарынхаа гүйцэтгэлээс хасагдана.';

export function contractPlanScope(contract: PlanBucketSource): PlanScope | null {
    const bucket = planBucketOf(contract);
    if (bucket) return bucket;
    return contract.product_type?.trim() === 'residential' ? 'residential_other' : null;
}

/** Сарын төлөвлөгөө блокоор задалсан эсэх (аль нэг төлөвлөгөөний үзүүлэлтэд блокийн нүд байвал). */
export function hasBlockPlan(blockAmounts: unknown): boolean {
    if (!blockAmounts || typeof blockAmounts !== 'object') return false;
    const plans = MONTHLY_SALES_METRICS.map(metric => metric.plan as string);
    return MONTHLY_SALES_BLOCKS.some(block => {
        const cells = (blockAmounts as Record<string, unknown>)[block];
        return !!cells && typeof cells === 'object' && plans.some(field => (cells as Record<string, unknown>)[field] !== undefined);
    });
}

/** Гэрээ тухайн сарын төлөвлөгөөтэй харьцуулах нийтэд орох эсэх. */
export function countsTowardPlan(scope: PlanScope | null, blockPlanned: boolean): boolean {
    return scope !== null && (scope !== 'residential_other' || !blockPlanned);
}

const toNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};
const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;

export interface PlanContract extends PlanBucketSource {
    id: string;
    contract_date: string | null;
    /** Захиалгын огноо — зөвхөн HUB «Нийт төлсөн дүн»-ийн тулгалтад (cohort-ын сар = contract_date). */
    order_date?: string | null;
    contract_status: string | null;
    total_price: number | string | null;
    prepayment_due?: number | string | null;
    paid_amount?: number | string | null;
    overdue_amount?: number | string | null;
    overdue_as_of?: string | null;
    unit_label?: string | null;
}

/** Огноотой бүртгэсэн мөнгөн орлого (бэлэн, банк, ипотек; бартер хассан) — сар × гэрээ. */
export interface PlanReceipt { month: string; contractId: string | null; amount: number }

export interface PlanPerformanceInput {
    year: number;
    now: Date;
    /** `getTeamMonthlySales` — 12 мөр. */
    months: MonthlySalesMonth[];
    /** Төлөвлөгөөтэй онууд (сонгогчид). */
    planYears: number[];
    /** Төслийн устгаагүй бүх гэрээ (цуцалсан орно — тэмдэглэлд). */
    contracts: PlanContract[];
    /** null = орсон мөнгө харах эрхгүй (хэсгийг бүхэлд нь нууна). */
    receipts: PlanReceipt[] | null;
    /**
     * Дэвтрийн анхны бүртгэсэн мөнгөн орлогын огноо (бүх он, YYYY-MM-DD); null = дэвтэрт орлого огт алга
     * (импортоор paid_amount мэдэгдэж байсан ч сарын орсон мөнгө тодорхойгүй). Өгөөгүй бол `receipts`-ийн хамгийн эртнийх.
     */
    ledgerSince?: string | null;
    /** Сүүлийн HUB импортын файлын огноо (хоцролтын snapshot). */
    latestImportDate: string | null;
    /** overdue_amount багана (migration 20261022140000) байхгүй бол false. */
    overdueAvailable?: boolean;
    /**
     * HUB файлын «Нийт төлсөн дүн» (`hubPaidByContract`): гэрээ → файлын огноогоор төлсөн дүн (null = мөрөнд дүн хоосон;
     * Map-д байхгүй = файлд тулгагдаагүй). Өгвөл орсон мөнгөний систем дүн = тухайн сард захиалсан гэрээний cohort.
     */
    hubPaid?: { asOf: string; paid: ReadonlyMap<string, number | null> } | null;
}

export interface PlanValue { value: number | null; lowerBound: boolean }

export interface PlanCell {
    plan: number | null;
    actual: number | null;
    /** Огноогүй гэрээ (эсвэл тодорхойгүй төлсөн дүн) байгаа тул бүрэн биш: дүнтэй бол «N+», дүнгүй бол «—». */
    lowerBound: boolean;
    source: PlanSource | null;
    /** Биелэлт % (1 орон), доод хязгаартай бол «+». */
    pct: number | null;
    /** Системийн дүн (гараар оруулсан үед ч) — «Систем: …» сануулгад. */
    auto: PlanValue;
    /** Блокийн нүд: гар нийт дүн задаргаагүй тул системийн задаргаа нийтэд ороогүй. */
    inTotal: boolean;
}

export interface PlanScopeCells {
    metrics: Partial<Record<PlanMetricKey, PlanCell>>;
    /**
     * «Нөхцлөөр төлөх урьдчилгаа» — тухайн сард захиалсан амьд гэрээний `prepayment_due`-ийн нийлбэр (орсон мөнгө биш).
     * Лхагвын илтгэлийн «Нийт» (энэ сарын гэрээний урьдчилгаа, орсон + хүлээгдэж буй; W6, `advanceOfMonth`) нь яг энэ
     * утга — мэдээлэл, мөнгөн урсгал гэж нэрлэхгүй, төлөвлөгөөтэй хувь гаргахгүй.
     */
    prepaymentDue: number | null;
    prepaymentMissing: number;
}

/** Сарын нэмэлт (stretch) төлөвлөгөө — нийт дүн, блокгүй; null = оруулаагүй (мөнгө нь санхүүгийн эрхгүйд үргэлж null). */
export interface PlanStretch { contract: number | null; cashflow: number | null }

export interface PlanMonthRow {
    month: number;
    key: string;
    status: 'past' | 'current' | 'future';
    blockPlanned: boolean;
    stretch: PlanStretch;
    total: PlanScopeCells;
    blocks: Record<MonthlySalesBlock, PlanScopeCells>;
    /** Б1/Б2-оос бусад блокийн орон сууц: задаргаагүй төлөвлөгөөтэй сард нийтэд орсон. */
    otherResidential: { count: number; amount: number; inTotal: boolean };
    /** «Төлөвлөгөөнд хамаарахгүй»: Агуулах, Үйлчилгээ, төрөлгүй (+ задалсан төлөвлөгөөтэй сард бусад блок). */
    outside: { count: number; amount: number; missingAmounts: number; cash: number | null; byType: Array<{ label: string; count: number; amount: number }> };
    cancelled: { count: number; amount: number };
    /** «Тоот шилжсэн» төлөвтэй гэрээ (гүйцэтгэлд орсон). */
    transferred: number;
}

export interface PlanYearCell {
    plan: number | null;
    actual: number | null;
    lowerBound: boolean;
    pct: number | null;
    /** Бүтэн жилийн (1–12 сар) төлөвлөгөө ба түүнээс гүйцэтгэсэн хувь. */
    yearPlan: number | null;
    yearPct: number | null;
}

export interface PlanYearScope { metrics: Partial<Record<PlanMetricKey, PlanYearCell>> }

export interface PlanPerformance {
    year: number;
    years: number[];
    /** «Он эхнээс (1–M сар)»-ын M; ирээдүйн онд null. */
    throughMonth: number | null;
    currentMonth: number | null;
    months: PlanMonthRow[];
    /** stretch: 1–M сарын нэмэлт төлөвлөгөөний нийлбэр; аль нэг сард оруулаагүй бол null (үндсэн төлөвлөгөөний дүрэм). */
    ytd: { total: PlanYearScope; blocks: Record<MonthlySalesBlock, PlanYearScope>; stretch: PlanStretch };
    undated: {
        count: number;
        amount: number;
        byScope: Record<PlanScope | 'outside', number>;
        contracts: Array<{ id: string; label: string | null; productType: string | null; amount: number | null; scope: PlanScope | null }>;
    };
    overdue: {
        available: boolean;
        amount: number | null;
        count: number;
        asOf: string | null;
        stale: number;
        byBlock: Record<MonthlySalesBlock, { amount: number | null; count: number }>;
    };
    cancelled: { count: number; amount: number };
    transferred: number;
    /**
     * null = санхүүгийн эрхгүй (cashHidden). none = амьд гэрээний төлсөн дүн бүгд тодорхойгүй; no_ledger = дэвтэрт
     * мөнгөн орлого бүртгэгдээгүй («Бүртгэл алга»); ledgerSince-ээс өмнөх сар тодорхойгүй.
     * source 'hub_paid' = HUB файлын «Нийт төлсөн дүн» (hubPaidAsOf = файлын огноо): full = амьд гэрээ бүр файлд дүнтэй,
     * partial = unknownPaid гэрээний дүн файлд алга (тэдгээрийн блок-сар «+»).
     */
    cash: null | {
        availability: 'full' | 'partial' | 'none' | 'no_ledger'; unknownPaid: number; liveContracts: number; ledgerSince: string | null;
        source: 'ledger' | 'hub_paid'; hubPaidAsOf: string | null;
    };
}

const UNDATED_LIST_LIMIT = 100;

type ScopeAgg = { count: number; amountCents: number; missingAmounts: number; prepaymentCents: number; prepaymentKnown: number };
const emptyAgg = (): ScopeAgg => ({ count: 0, amountCents: 0, missingAmounts: 0, prepaymentCents: 0, prepaymentKnown: 0 });

/**
 * Хэсгүүдийн нийлбэр. Тодорхойгүй (null) хэсэг байвал нийлбэр нь мэдэгдэх хэсгүүдийн доод хязгаар («+») —
 * тодорхойгүйг 0 гэж нэмэхгүй (жишээ нь Б1-д гар орсон мөнгө, Б2/зогсоолынх тодорхойгүй). «0+» = тодорхойгүй.
 */
export function sumPlanValues(parts: PlanValue[]): PlanValue {
    const known = parts.filter(part => part.value !== null);
    const lowerBound = parts.some(part => part.lowerBound || part.value === null);
    const value = known.length ? fromCents(known.reduce((sum, part) => sum + cents(part.value!), 0)) : null;
    return { value: value === 0 && lowerBound ? null : value, lowerBound };
}
const combine = sumPlanValues;

function cell(plan: number | null, actual: PlanValue, source: PlanSource | null, auto: PlanValue, inTotal = true): PlanCell {
    return {
        plan, actual: actual.value, lowerBound: actual.lowerBound, source: actual.value === null ? null : source,
        pct: monthlySalesAttainment(actual.value, plan), auto, inTotal,
    };
}

const metricNumber = (row: MonthlySalesMonth, block: MonthlySalesBlock, field: MonthlySalesMetric['plan'] | MonthlySalesMetric['actual']) => {
    const value = row.block_amounts?.[block]?.[field];
    return typeof value === 'number' ? value : null;
};

/**
 * M1 давамгайлал: блокийн нүд = гар тоо ?? систем; задаргаатай бол нийт = блокуудын нийлбэр (+ нийтэд л хамаарах
 * системийн нэмэлт, аль нэг блок системийнх бол); задаргаагүй гар нийт байвал түүнийг; эс бөгөөс системийн нийлбэр.
 */
function resolveMetric(
    row: MonthlySalesMonth, metric: MonthlySalesMetric, autoBlocks: Record<MonthlySalesBlock, PlanValue>, extra: PlanValue | null, future: boolean,
): { total: PlanCell; blocks: Record<MonthlySalesBlock, PlanCell> } {
    const field = metric.actual;
    const none: PlanValue = { value: null, lowerBound: false };
    const autoTotal = combine([...MONTHLY_SALES_BLOCKS.map(block => autoBlocks[block]), ...(extra ? [extra] : [])]);
    const blockResolved = Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => {
        const manual = metricNumber(row, block, field);
        return [block, manual !== null ? { value: { value: manual, lowerBound: false }, source: 'manual' as const } : { value: autoBlocks[block], source: 'auto' as const }];
    })) as Record<MonthlySalesBlock, { value: PlanValue; source: 'manual' | 'auto' }>;
    const manualTotalOnly = !hasMonthlySalesBreakdown(row, field) && row[field] !== null;
    const blocks = Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => {
        const resolved = blockResolved[block];
        return [block, cell(metricNumber(row, block, metric.plan), future ? none : resolved.value, resolved.source, future ? none : autoBlocks[block], !manualTotalOnly)];
    })) as Record<MonthlySalesBlock, PlanCell>;
    let total: PlanValue;
    let source: PlanSource;
    if (hasMonthlySalesBreakdown(row, field)) {
        const anyAuto = MONTHLY_SALES_BLOCKS.some(block => blockResolved[block].source === 'auto');
        const anyManual = MONTHLY_SALES_BLOCKS.some(block => blockResolved[block].source === 'manual');
        total = combine([...MONTHLY_SALES_BLOCKS.map(block => blockResolved[block].value), ...(anyAuto && extra ? [extra] : [])]);
        source = anyAuto ? (anyManual ? 'mixed' : 'auto') : 'manual';
    } else if (row[field] !== null) {
        total = { value: row[field], lowerBound: false };
        source = 'manual';
    } else {
        total = autoTotal;
        source = 'auto';
    }
    return { total: cell(row[metric.plan], future ? none : total, source, future ? none : autoTotal), blocks };
}

/** Нэг сарын нийт гүйцэтгэл M1 дүрмээр: утга, доод хязгаар, эх сурвалж (гар / систем / холимог). */
export interface PlanResolvedValue extends PlanValue { source: PlanSource | null }

/**
 * Системийн гэрээний нүд (сар × хүрээ): тухайн хүрээнд огноогүй амьд гэрээ байвал доод хязгаар, тэр сард гэрээгүй бол
 * тодорхойгүй (null); дүн дутуу гэрээ ч доод хязгаар. Төлөвлөгөөний биелэлт ба үйл ажиллагааны тайлан нэг дүрэм.
 */
export function contractAutoValue(row: { count: number; amount: number; missingAmounts: number }, undated: number, kind: 'count' | 'amount'): PlanValue {
    if (undated > 0 && row.count === 0) return { value: null, lowerBound: true };
    return kind === 'count'
        ? { value: row.count, lowerBound: undated > 0 }
        : { value: row.amount, lowerBound: undated > 0 || row.missingAmounts > 0 };
}

/**
 * M1 давамгайллын ганц хуулбар — сарын нийт гүйцэтгэл (`resolveMetric`): блок = гар ?? систем, задаргаатай бол нийт =
 * блокуудын нийлбэр; задаргаагүй гар нийт; эс бөгөөс систем. Төлөвлөгөөний биелэлт, захирал, үйл ажиллагааны тайлан,
 * хурлын слайд бүгд үүгээр (хадгалсан мөрийн нийт `row[f]`-ийг задаргаатай үед уншихгүй).
 */
export function resolveMonthMetric(
    row: MonthlySalesMonth, key: PlanMetricKey, autoBlocks: Record<MonthlySalesBlock, PlanValue>, extra: PlanValue | null,
): PlanResolvedValue {
    const metric = MONTHLY_SALES_METRICS.find(item => item.key === key)!;
    const { total } = resolveMetric(row, metric, autoBlocks, extra, false);
    return { value: total.actual, lowerBound: total.lowerBound, source: total.source };
}

/**
 * Нэмэлт төлөвлөгөөний он эхнээс (1–M сар) нийлбэр — үндсэн төлөвлөгөөний дүрэм (yearCell-ийн sumPlan): 1–M сар бүгдэд
 * оруулсан үед л; аль нэг сар дутуу бол null («—»), хэсэгчилсэн нийлбэрийг 1–M сарын гүйцэтгэлтэй харьцуулж хувь хөөргөхгүй.
 */
function stretchSum(months: PlanMonthRow[], key: keyof PlanStretch, throughMonth: number | null): number | null {
    if (throughMonth === null) return null;
    const span = months.slice(0, throughMonth).map(row => row.stretch[key]);
    return span.length && span.every(value => value !== null)
        ? fromCents(span.reduce((sum, value) => sum + cents(value ?? 0), 0)) : null;
}

/** Төлөвлөгөөний биелэлтийн цэвэр тооцоо. */
export function buildPlanPerformance(input: PlanPerformanceInput): PlanPerformance {
    const { year } = input;
    const now = ubParts(input.now);
    const throughMonth = year < now.year ? 12 : year === now.year ? now.month : null;
    const currentMonth = year === now.year ? now.month : null;
    const cashVisible = input.receipts !== null;
    const metrics = MONTHLY_SALES_METRICS.filter(metric => cashVisible || metric.key !== 'cashflow');

    const live = input.contracts.filter(contract => contract.contract_status !== 'cancelled');
    const scopeOf = new Map(input.contracts.map(contract => [contract.id, contractPlanScope(contract)]));

    // Огноогүй амьд гэрээ — аль ч сарынх байж болох тул төслийн хэмжээнд хүрээгээр тоолно.
    const undatedRows = live.filter(contract => !contract.contract_date);
    const undatedByScope: Record<PlanScope | 'outside', number> = { b1: 0, b2: 0, parking: 0, residential_other: 0, outside: 0 };
    let undatedCents = 0;
    for (const contract of undatedRows) {
        undatedByScope[scopeOf.get(contract.id) ?? 'outside']++;
        const amount = toNumber(contract.total_price);
        if (amount !== null) undatedCents += cents(amount);
    }

    // Сар × хүрээ нэгтгэл.
    const prefix = `${year}-`;
    const agg = new Map<string, ScopeAgg>(); // `${month}|${scope|outside}`
    const outsideTypes = new Map<string, Map<string, { label: string; count: number; amountCents: number }>>();
    const cancelled = new Map<number, { count: number; amountCents: number }>();
    const transferred = new Map<number, number>();
    for (const contract of input.contracts) {
        if (!contract.contract_date?.startsWith(prefix)) continue;
        const month = Number(contract.contract_date.slice(5, 7));
        if (!(month >= 1 && month <= 12)) continue;
        const amount = toNumber(contract.total_price);
        if (contract.contract_status === 'cancelled') {
            const row = cancelled.get(month) ?? { count: 0, amountCents: 0 };
            row.count++;
            if (amount !== null) row.amountCents += cents(amount);
            cancelled.set(month, row);
            continue;
        }
        if (contract.contract_status === 'transferred') transferred.set(month, (transferred.get(month) ?? 0) + 1);
        const scope = scopeOf.get(contract.id) ?? null;
        const key = `${month}|${scope ?? 'outside'}`;
        const row = agg.get(key) ?? emptyAgg();
        row.count++;
        if (amount === null) row.missingAmounts++;
        else row.amountCents += cents(amount);
        const prepayment = toNumber(contract.prepayment_due);
        if (prepayment !== null) { row.prepaymentCents += cents(prepayment); row.prepaymentKnown++; }
        agg.set(key, row);
        if (scope === null || scope === 'residential_other') {
            const type = contract.product_type?.trim() || 'unknown';
            const label = scope === 'residential_other' ? `Орон сууц · ${contract.block_name?.trim() || 'блокгүй'}` : type === 'unknown' ? 'Төрөл тодорхойгүй' : unitCategoryLabel(type);
            const typeKey = scope === 'residential_other' ? `residential|${contract.block_name?.trim() || ''}` : type;
            const types = outsideTypes.get(String(month)) ?? new Map();
            const entry = types.get(typeKey) ?? { label, count: 0, amountCents: 0 };
            entry.count++;
            if (amount !== null) entry.amountCents += cents(amount);
            types.set(typeKey, entry);
            outsideTypes.set(String(month), types);
        }
    }

    // Орсон мөнгө: амьд гэрээний төлсөн дүн мэдэгдэх эсэх, дэвтэрт орлого бүртгэгдсэн эсэх (paid_amount-ийг импорт
    // шууд бичдэг — хоосон дэвтэр нь «сард 0₮» биш, тодорхойгүй). HUB «Нийт төлсөн дүн» байвал түүгээр (W5/W6).
    const hub = cashVisible && input.hubPaid ? input.hubPaid : null;
    const unknownPaid = hub
        ? live.filter(contract => typeof hub.paid.get(contract.id) !== 'number').length
        : live.filter(contract => toNumber(contract.paid_amount) === null).length;
    const earliestReceipt = (input.receipts ?? []).reduce<string | null>((min, receipt) => (!min || receipt.month < min ? receipt.month : min), null);
    const ledgerSince = input.ledgerSince !== undefined ? input.ledgerSince : earliestReceipt ? `${earliestReceipt}-01` : null;
    const ledgerMonth = ledgerSince?.slice(0, 7) ?? null;
    const availability: 'full' | 'partial' | 'none' | 'no_ledger' = hub ? (unknownPaid > 0 ? 'partial' : 'full')
        : live.length > 0 && unknownPaid === live.length ? 'none'
        : ledgerSince === null ? 'no_ledger' : unknownPaid > 0 ? 'partial' : 'full';
    const cashAgg = new Map<string, number>(); // `${month}|${scope|outside|unassigned}` → cents
    for (const receipt of input.receipts ?? []) {
        if (!receipt.month.startsWith(prefix)) continue;
        const month = Number(receipt.month.slice(5, 7));
        const known = receipt.contractId !== null && scopeOf.has(receipt.contractId);
        const scope = known ? scopeOf.get(receipt.contractId!) ?? 'outside' : 'unassigned';
        const key = `${month}|${scope}`;
        cashAgg.set(key, (cashAgg.get(key) ?? 0) + cents(receipt.amount));
    }

    // HUB cohort: сар × хүрээ — тухайн сард захиалсан амьд гэрээний файлын төлсөн дүн (мэдэгдэх / тодорхойгүй гэрээний тоо).
    const hubAgg = new Map<string, { cents: number; known: number; unknown: number }>();
    if (hub) {
        for (const contract of live) {
            if (!contract.contract_date?.startsWith(prefix)) continue;
            const month = Number(contract.contract_date.slice(5, 7));
            if (!(month >= 1 && month <= 12)) continue;
            const key = `${month}|${scopeOf.get(contract.id) ?? 'outside'}`;
            const row = hubAgg.get(key) ?? { cents: 0, known: 0, unknown: 0 };
            const paid = hub.paid.get(contract.id);
            if (typeof paid === 'number') { row.cents += cents(paid); row.known++; } else row.unknown++;
            hubAgg.set(key, row);
        }
    }
    /** Дүнгүй/тулгагдаагүй гэрээ, эсвэл хүрээнд огноогүй амьд гэрээ байвал доод хязгаар; мэдэгдэх дүнгүй бол «—» (0 биш). */
    const hubCashAuto = (month: number, scope: string): PlanValue => {
        const row = hubAgg.get(`${month}|${scope}`) ?? { cents: 0, known: 0, unknown: 0 };
        const lowerBound = row.unknown > 0 || (undatedByScope[scope as PlanScope | 'outside'] ?? 0) > 0;
        const value = fromCents(row.cents);
        return lowerBound && (row.known === 0 || value === 0) ? { value: null, lowerBound: true } : { value, lowerBound };
    };
    const cashOf = (month: number, scope: string): PlanValue => (hub ? hubCashAuto(month, scope) : cashAuto(month, scope));

    const contractAuto = (month: number, scope: PlanScope, kind: 'count' | 'amount'): PlanValue => {
        const row = agg.get(`${month}|${scope}`) ?? emptyAgg();
        return contractAutoValue({ count: row.count, amount: fromCents(row.amountCents), missingAmounts: row.missingAmounts }, undatedByScope[scope], kind);
    };
    const cashAuto = (month: number, scope: string): PlanValue => {
        if (availability === 'none' || availability === 'no_ledger') return { value: null, lowerBound: false };
        // Дэвтрийн анхны орлогоос өмнөх сарын орлого бүртгэгдээгүй — тодорхойгүй.
        if (ledgerMonth && `${year}-${String(month).padStart(2, '0')}` < ledgerMonth) return { value: null, lowerBound: false };
        const value = fromCents(cashAgg.get(`${month}|${scope}`) ?? 0);
        if (availability === 'partial') return value ? { value, lowerBound: true } : { value: null, lowerBound: true };
        return { value, lowerBound: false };
    };
    const prepayment = (rows: ScopeAgg[]) => {
        const count = rows.reduce((sum, row) => sum + row.count, 0);
        const known = rows.reduce((sum, row) => sum + row.prepaymentKnown, 0);
        return { prepaymentDue: known ? fromCents(rows.reduce((sum, row) => sum + row.prepaymentCents, 0)) : null, prepaymentMissing: count - known };
    };

    const months: PlanMonthRow[] = input.months.map(row => {
        const month = row.month;
        const status = throughMonth === null || month > throughMonth ? 'future' : month === currentMonth ? 'current' : 'past';
        const future = status === 'future';
        const blockPlanned = hasBlockPlan(row.block_amounts);
        const blockCells = Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => [block, { metrics: {}, ...prepayment([agg.get(`${month}|${block}`) ?? emptyAgg()]) }])) as Record<MonthlySalesBlock, PlanScopeCells>;
        const otherAgg = agg.get(`${month}|residential_other`) ?? emptyAgg();
        const totalRows = [...MONTHLY_SALES_BLOCKS.map(block => agg.get(`${month}|${block}`) ?? emptyAgg()), ...(blockPlanned ? [] : [otherAgg])];
        const total: PlanScopeCells = { metrics: {}, ...prepayment(totalRows) };
        for (const metric of metrics) {
            const autoBlocks = Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => [block,
                metric.key === 'cashflow' ? cashOf(month, block) : contractAuto(month, block, metric.key === 'contract_count' ? 'count' : 'amount')])) as Record<MonthlySalesBlock, PlanValue>;
            const extraParts: PlanValue[] = [];
            if (!blockPlanned) extraParts.push(metric.key === 'cashflow' ? cashOf(month, 'residential_other') : contractAuto(month, 'residential_other', metric.key === 'contract_count' ? 'count' : 'amount'));
            // Гэрээгүй бүртгэсэн төлбөр зөвхөн дэвтэрт; HUB cohort гэрээгээр л.
            if (metric.key === 'cashflow' && !hub) extraParts.push(cashAuto(month, 'unassigned'));
            const resolved = resolveMetric(row, metric, autoBlocks, extraParts.length ? combine(extraParts) : null, future);
            total.metrics[metric.key] = resolved.total;
            for (const block of MONTHLY_SALES_BLOCKS) blockCells[block].metrics[metric.key] = resolved.blocks[block];
        }
        const outsideAgg = agg.get(`${month}|outside`) ?? emptyAgg();
        const outsideRows = blockPlanned ? [outsideAgg, otherAgg] : [outsideAgg];
        const types = [...(outsideTypes.get(String(month))?.entries() ?? [])]
            .filter(([key]) => blockPlanned || !key.startsWith('residential|'))
            .map(([, entry]) => ({ label: entry.label, count: entry.count, amount: fromCents(entry.amountCents) }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'mn'));
        const outsideCash = cashVisible ? combine([cashOf(month, 'outside'), ...(blockPlanned ? [cashOf(month, 'residential_other')] : [])]).value : null;
        const cancelledRow = cancelled.get(month) ?? { count: 0, amountCents: 0 };
        return {
            month, key: `${year}-${String(month).padStart(2, '0')}`, status, blockPlanned, total, blocks: blockCells,
            stretch: { contract: row.stretch_target_amount ?? null, cashflow: cashVisible ? row.stretch_cashflow_target_amount ?? null : null },
            otherResidential: { count: otherAgg.count, amount: fromCents(otherAgg.amountCents), inTotal: !blockPlanned },
            outside: {
                count: outsideRows.reduce((sum, item) => sum + item.count, 0), amount: fromCents(outsideRows.reduce((sum, item) => sum + item.amountCents, 0)),
                missingAmounts: outsideRows.reduce((sum, item) => sum + item.missingAmounts, 0), cash: future ? null : outsideCash, byType: types,
            },
            cancelled: { count: cancelledRow.count, amount: fromCents(cancelledRow.amountCents) },
            transferred: transferred.get(month) ?? 0,
        };
    });

    // Он эхнээс (1–M сар) ба бүтэн жилийн төлөвлөгөөнөөс.
    const yearCell = (pick: (row: PlanMonthRow) => PlanCell | undefined, planOf: (month: MonthlySalesMonth) => number | null | undefined, planTotal: (month: MonthlySalesMonth) => number | null): PlanYearCell => {
        const span = throughMonth === null ? [] : months.slice(0, throughMonth);
        const parts = span.map(row => pick(row)).filter((value): value is PlanCell => !!value)
            .map(value => ({ value: value.actual, lowerBound: value.lowerBound }));
        const actual = throughMonth === null ? { value: null, lowerBound: false } : combine(parts);
        const sumPlan = (rows: MonthlySalesMonth[]) => rows.length && rows.every(month => planTotal(month) !== null)
            ? fromCents(rows.reduce((sum, month) => sum + cents(planOf(month) ?? 0), 0)) : null;
        const plan = throughMonth === null ? null : sumPlan(input.months.slice(0, throughMonth));
        const yearPlan = sumPlan(input.months);
        return {
            plan, actual: actual.value, lowerBound: actual.value !== null && actual.lowerBound,
            pct: monthlySalesAttainment(actual.value, plan), yearPlan, yearPct: monthlySalesAttainment(actual.value, yearPlan),
        };
    };
    const ytd = {
        total: { metrics: Object.fromEntries(metrics.map(metric => [metric.key, yearCell(row => row.total.metrics[metric.key], month => month[metric.plan], month => month[metric.plan])])) },
        // Блокийн жилийн төлөвлөгөө: тухайн үзүүлэлтийн төлөвлөгөө блокоор задалсан сард блокийн нүдгүй бол 0;
        // задаргаагүй (зөвхөн нийт) сар орвол блокийн төлөвлөгөө тодорхойгүй (null).
        blocks: Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => [block, { metrics: Object.fromEntries(metrics.map(metric => [metric.key,
            yearCell(row => row.blocks[block].metrics[metric.key], month => metricNumber(month, block, metric.plan),
                month => hasMonthlySalesBreakdown(month, metric.plan) ? month[metric.plan] : null)])) }])),
        stretch: { contract: stretchSum(months, 'contract', throughMonth), cashflow: stretchSum(months, 'cashflow', throughMonth) },
    } as PlanPerformance['ytd'];

    // Төлбөр хоцролт: сүүлийн HUB файлын огноотой snapshot (гэрээний жагсаалтын хавтан, AI-тай нэг дүрэм).
    const overdueAvailable = input.overdueAvailable !== false;
    const overdueSummary = summarizeContracts(live, { latestImportDate: input.latestImportDate });
    const byBlock = Object.fromEntries(MONTHLY_SALES_BLOCKS.map(block => {
        const summary = summarizeContracts(live.filter(contract => scopeOf.get(contract.id) === block), { latestImportDate: input.latestImportDate });
        return [block, { amount: overdueAvailable ? summary.overdue_amount : null, count: overdueAvailable ? summary.overdue_count : 0 }];
    })) as PlanPerformance['overdue']['byBlock'];

    const datedYears = input.contracts.map(contract => Number(contract.contract_date?.slice(0, 4))).filter(value => Number.isInteger(value) && value >= 2000 && value <= 2100);
    const years = [...new Set([...input.planYears, ...datedYears, now.year, year])].sort((a, b) => a - b);
    const cancelledTotal = [...cancelled.values()].reduce((sum, row) => ({ count: sum.count + row.count, amountCents: sum.amountCents + row.amountCents }), { count: 0, amountCents: 0 });

    return {
        year, years, throughMonth, currentMonth, months, ytd,
        undated: {
            count: undatedRows.length, amount: fromCents(undatedCents), byScope: undatedByScope,
            contracts: undatedRows.slice(0, UNDATED_LIST_LIMIT).map(contract => ({
                id: contract.id, label: contract.unit_label ?? null, productType: contract.product_type ?? null,
                amount: toNumber(contract.total_price), scope: scopeOf.get(contract.id) ?? null,
            })),
        },
        overdue: {
            available: overdueAvailable,
            amount: overdueAvailable ? overdueSummary.overdue_amount : null,
            count: overdueAvailable ? overdueSummary.overdue_count : 0,
            asOf: overdueAvailable ? input.latestImportDate : null,
            stale: overdueAvailable ? overdueSummary.overdue_stale : 0,
            byBlock,
        },
        cancelled: { count: cancelledTotal.count, amount: fromCents(cancelledTotal.amountCents) },
        transferred: [...transferred.values()].reduce((sum, value) => sum + value, 0),
        cash: cashVisible ? {
            availability, unknownPaid, liveContracts: live.length, ledgerSince: hub ? null : ledgerSince,
            source: hub ? 'hub_paid' : 'ledger', hubPaidAsOf: hub?.asOf ?? null,
        } : null,
    };
}

/** «2,281,995,000+» — доод хязгаартай бол «+». Дүнгүй бол «—». */
export function planValueText(value: number | null, lowerBound: boolean, format: (value: number) => string): string {
    return value === null ? '—' : `${format(value)}${lowerBound ? '+' : ''}`;
}

/** «42.6%+» эсвэл «—». */
export function planPctText(pct: number | null, lowerBound: boolean): string {
    return pct === null ? '—' : `${pct}%${lowerBound ? '+' : ''}`;
}
