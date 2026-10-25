import { z } from 'zod';

/** Client-safe contract for the project's monthly plan and manually confirmed performance. */
export const MONTHLY_SALES_FIELDS = [
    'target_amount', 'cashflow_target_amount',
    'manual_contract_actual_amount', 'manual_cashflow_actual_amount',
    'contract_count_target', 'manual_contract_count_actual',
] as const;
export type MonthlySalesField = typeof MONTHLY_SALES_FIELDS[number];

/** Contract counts are whole numbers (ш), never money. */
const COUNT_FIELDS: ReadonlySet<MonthlySalesField> = new Set(['contract_count_target', 'manual_contract_count_actual']);
export const isMonthlySalesCount = (field: MonthlySalesField) => COUNT_FIELDS.has(field);

export const MONTHLY_SALES_LABELS: Record<MonthlySalesField, string> = {
    target_amount: 'Гэрээний төлөвлөгөө',
    cashflow_target_amount: 'Орсон мөнгөний төлөвлөгөө',
    manual_contract_actual_amount: 'Гэрээний гүйцэтгэл',
    manual_cashflow_actual_amount: 'Орсон мөнгөний гүйцэтгэл',
    contract_count_target: 'Гэрээний тооны төлөвлөгөө',
    manual_contract_count_actual: 'Гэрээний тооны гүйцэтгэл',
};

/** Plan → actual pairs in display order; the attainment % follows the actual. */
export const MONTHLY_SALES_METRICS = [
    { key: 'contract_count', label: 'Гэрээний тоо', plan: 'contract_count_target', actual: 'manual_contract_count_actual' },
    { key: 'contract', label: 'Гэрээний дүн', plan: 'target_amount', actual: 'manual_contract_actual_amount' },
    { key: 'cashflow', label: 'Мөнгөн урсгал', plan: 'cashflow_target_amount', actual: 'manual_cashflow_actual_amount' },
] as const satisfies readonly { key: string; label: string; plan: MonthlySalesField; actual: MonthlySalesField }[];
export type MonthlySalesMetric = typeof MONTHLY_SALES_METRICS[number];

export const MONTHLY_SALES_BLOCKS = ['b1', 'b2', 'parking'] as const;
export type MonthlySalesBlock = typeof MONTHLY_SALES_BLOCKS[number];
export const MONTHLY_SALES_BLOCK_LABELS: Record<MonthlySalesBlock, string> = {
    b1: 'Б1 блок', b2: 'Б2 блок', parking: 'Зогсоол',
};

/**
 * Сарын түвшний нэмэлт (stretch) төлөвлөгөө — гэрээ ба мөнгөний НИЙТ дүн, блокоор задлахгүй (W8, 20261023150000).
 * Үндсэн төлөвлөгөөн дээр нэмэх зөрүү биш, слайдад харагдах бүтэн дүн. MONTHLY_SALES_FIELDS-д орохгүй тул блокийн нүдэнд орохгүй.
 */
export const MONTHLY_SALES_STRETCH_FIELDS = ['stretch_target_amount', 'stretch_cashflow_target_amount'] as const;
export type MonthlySalesStretchField = typeof MONTHLY_SALES_STRETCH_FIELDS[number];
export const MONTHLY_SALES_STRETCH_LABELS: Record<MonthlySalesStretchField, string> = {
    stretch_target_amount: 'Нэмэлт төлөвлөгөө (гэрээ)',
    stretch_cashflow_target_amount: 'Нэмэлт төлөвлөгөө (мөнгө)',
};

/**
 * Багийн сарын идэвхжлийн төлөвлөгөө (W10, W11): hotline = загварын эхний шугам (Elysium l1 «7786»), manager_line = хоёр
 * дахь шугам (l2), meetings_new / meetings_repeat = болсон уулзалтын төрөл, chats = бүх чат суваг. Бүхэл тоо;
 * байхгүй түлхүүр = оруулаагүй («—»), 0 = оруулсан утга.
 */
export const ACTIVITY_TARGET_KEYS = ['hotline', 'manager_line', 'meetings_new', 'meetings_repeat', 'chats'] as const;
export type ActivityTargetKey = typeof ACTIVITY_TARGET_KEYS[number];
/** Байхгүй эсвэл null түлхүүр = оруулаагүй (DB-д null хадгалагдахгүй, өөрчлөлтөд null = арилгах). */
export type ActivityTargets = Partial<Record<ActivityTargetKey, number | null>>;
export const ACTIVITY_TARGET_LABELS: Record<ActivityTargetKey, string> = {
    hotline: '7786 / төслийн утас', manager_line: 'Менежерийн дугаар',
    meetings_new: 'Шинэ уулзалт', meetings_repeat: 'Давтан уулзалт', chats: 'Чат',
};

/** Сарын түвшний нэмэлт талбарууд (блокгүй) — `save_team_monthly_sales`-ийн ижил хувилбар шалгалт, аудиттай. */
export const MONTHLY_SALES_EXTRA_FIELDS = [...MONTHLY_SALES_STRETCH_FIELDS, 'activity_targets'] as const;
export type MonthlySalesExtraField = typeof MONTHLY_SALES_EXTRA_FIELDS[number];

export const SalesYearSchema = z.number().int().min(2000).max(2100);
export const MonthlySalesAmountSchema = z.number().finite().min(0).max(1e13).multipleOf(0.01).nullable();
export const MONTHLY_SALES_COUNT_MAX = 1_000_000;
export const MonthlySalesCountSchema = z.number().int().min(0).max(MONTHLY_SALES_COUNT_MAX).nullable();
const ActivityTargetValueSchema = MonthlySalesCountSchema.optional();
/** Идэвхжлийн төлөвлөгөө (бүхэл тоо 0–1,000,000, DB CHECK-тэй ижил түлхүүрүүд). */
export const ActivityTargetsSchema = z.object({
    hotline: ActivityTargetValueSchema, manager_line: ActivityTargetValueSchema,
    meetings_new: ActivityTargetValueSchema, meetings_repeat: ActivityTargetValueSchema, chats: ActivityTargetValueSchema,
}).strict();
/** Өөрчлөлт: зөвхөн өгсөн түлхүүрүүд хадгалсан утга дээр нэгтгэгдэнэ, null = тэр түлхүүрийг арилгах. */
export const ActivityTargetsPatchSchema = ActivityTargetsSchema
    .refine(row => Object.values(row).some(value => value !== undefined), { message: 'Идэвхжлийн төлөвлөгөөг оруулна уу' });
export type ActivityTargetsPatch = z.infer<typeof ActivityTargetsPatchSchema>;

/**
 * Уншигчдад (идэвхжлийн тайлан): түлхүүр бүрийг тусад нь — мэдэгдэх түлхүүрийн бүхэл тоо (0–1,000,000); танихгүй түлхүүр,
 * буруу утгыг алгасна. Юу ч оруулаагүй эсвэл объект биш бол null («—»).
 */
export function readActivityTargets(raw: unknown): Partial<Record<ActivityTargetKey, number>> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const source = raw as Record<string, unknown>;
    const entered = Object.fromEntries(ACTIVITY_TARGET_KEYS.flatMap(key => {
        const parsed = MonthlySalesCountSchema.safeParse(source[key]);
        return parsed.success && parsed.data !== null ? [[key, parsed.data]] : [];
    }));
    return Object.keys(entered).length ? entered : null;
}
const values = {
    target_amount: MonthlySalesAmountSchema,
    cashflow_target_amount: MonthlySalesAmountSchema,
    manual_contract_actual_amount: MonthlySalesAmountSchema,
    manual_cashflow_actual_amount: MonthlySalesAmountSchema,
    contract_count_target: MonthlySalesCountSchema,
    manual_contract_count_actual: MonthlySalesCountSchema,
};
const blockValues = z.object(values).partial().strict()
    .refine(row => Object.values(row).some(value => value !== undefined), { message: 'Блокийн дүнг оруулна уу' });
export const MonthlySalesBlocksSchema = z.object({
    b1: blockValues.optional(), b2: blockValues.optional(), parking: blockValues.optional(),
}).strict();

export const MonthlySalesMonthSchema = z.object({
    month: z.number().int().min(1).max(12),
    revision: z.number().int().min(0).max(2_147_483_646),
    block_amounts: MonthlySalesBlocksSchema.optional(),
    ...values,
    // Сарын түвшний нэмэлт талбар: migration ороогүй бол null (тодорхойгүй).
    stretch_target_amount: MonthlySalesAmountSchema.optional(),
    stretch_cashflow_target_amount: MonthlySalesAmountSchema.optional(),
    activity_targets: ActivityTargetsSchema.nullable().optional(),
}).strict();
export type MonthlySalesMonth = z.infer<typeof MonthlySalesMonthSchema>;

export const MonthlySalesPatchSchema = z.object({
    month: z.number().int().min(1).max(12),
    expectedRevision: z.number().int().min(0).max(2_147_483_646),
    block_amounts: MonthlySalesBlocksSchema.refine(blocks => Object.values(blocks).some(Boolean), {
        message: 'Блокийн дүнг оруулна уу',
    }).optional(),
    ...Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, values[field].optional()])) as {
        [K in MonthlySalesField]: z.ZodOptional<(typeof values)[K]>;
    },
    stretch_target_amount: MonthlySalesAmountSchema.optional(),
    stretch_cashflow_target_amount: MonthlySalesAmountSchema.optional(),
    activity_targets: ActivityTargetsPatchSchema.nullable().optional(),
}).strict().refine(row => row.block_amounts !== undefined || MONTHLY_SALES_FIELDS.some(field => row[field] !== undefined)
    || MONTHLY_SALES_EXTRA_FIELDS.some(field => row[field] !== undefined), {
    message: 'Өөрчлөх дүнг сонгоно уу',
}).refine(row => !MONTHLY_SALES_FIELDS.some(field => row[field] !== undefined
    && MONTHLY_SALES_BLOCKS.some(block => row.block_amounts?.[block]?.[field] !== undefined)), {
    message: 'Нийт дүн болон блокийн дүнг нэгэн зэрэг өөрчлөхгүй',
});
export type MonthlySalesPatch = z.infer<typeof MonthlySalesPatchSchema>;

export const MonthlySalesWriteSchema = z.object({
    shopId: z.guid(), year: SalesYearSchema,
    months: z.array(MonthlySalesPatchSchema).min(1).max(12)
        .refine(rows => new Set(rows.map(row => row.month)).size === rows.length, { message: 'Сар давхар байна' }),
}).strict();

export function emptyMonthlySales(): MonthlySalesMonth[] {
    return Array.from({ length: 12 }, (_, index) => ({
        month: index + 1, revision: 0, target_amount: null, cashflow_target_amount: null,
        manual_contract_actual_amount: null, manual_cashflow_actual_amount: null,
        contract_count_target: null, manual_contract_count_actual: null,
        stretch_target_amount: null, stretch_cashflow_target_amount: null, activity_targets: null,
    }));
}

/** `saveTeamMonthlySales`-ийн алдааны код: нэмэлт талбарын багана (migration 20261023150000) алга → API 503. */
export const MONTHLY_SALES_EXTRAS_UNAVAILABLE = 'MONTHLY_SALES_EXTRAS_UNAVAILABLE';

/** Patch-д нэмэлт талбар байгаа эсэх (migration шалгахад). */
export const hasMonthlySalesExtras = (patch: MonthlySalesPatch) => MONTHLY_SALES_EXTRA_FIELDS.some(field => patch[field] !== undefined);

/** Идэвхжлийн төлөвлөгөөний өөрчлөгдсөн түлхүүрүүд (арилсан нь null); өөрчлөлтгүй бол undefined. */
export function activityTargetsPatch(before: ActivityTargets | null | undefined, after: ActivityTargets | null | undefined): ActivityTargetsPatch | undefined {
    const changed = ACTIVITY_TARGET_KEYS.filter(key => (before?.[key] ?? null) !== (after?.[key] ?? null));
    return changed.length ? Object.fromEntries(changed.map(key => [key, after?.[key] ?? null])) as ActivityTargetsPatch : undefined;
}

/** Empty is unknown; an explicitly entered zero remains zero. Invalid text is never coerced. */
export function parseMonthlySalesAmount(text: string): number | null | undefined {
    const cleaned = text.replace(/[,\s]/g, '');
    if (!cleaned) return null;
    if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return undefined;
    const parsed = MonthlySalesAmountSchema.safeParse(Number(cleaned));
    return parsed.success ? parsed.data : undefined;
}

/** Whole contract count; empty is unknown, anything else non-integer is invalid. */
export function parseMonthlySalesCount(text: string): number | null | undefined {
    const cleaned = text.replace(/[,\s]/g, '');
    if (!cleaned) return null;
    if (!/^\d+$/.test(cleaned)) return undefined;
    const parsed = MonthlySalesCountSchema.safeParse(Number(cleaned));
    return parsed.success ? parsed.data : undefined;
}

export function parseMonthlySalesValue(field: MonthlySalesField, text: string): number | null | undefined {
    return isMonthlySalesCount(field) ? parseMonthlySalesCount(text) : parseMonthlySalesAmount(text);
}

export function monthlySalesAttainment(actual: number | null, plan: number | null): number | null {
    return actual === null || plan === null || plan <= 0 ? null : Math.round(actual / plan * 1000) / 10;
}

export function hasMonthlySalesBreakdown(row: MonthlySalesMonth, field: MonthlySalesField): boolean {
    return MONTHLY_SALES_BLOCKS.some(block => row.block_amounts?.[block]?.[field] !== undefined);
}

/** Unallocated legacy totals remain intact until that metric receives a block breakdown. */
export function monthlySalesWithBlockTotals(row: MonthlySalesMonth): MonthlySalesMonth {
    const result = { ...row };
    for (const field of MONTHLY_SALES_FIELDS) {
        if (!hasMonthlySalesBreakdown(row, field)) continue;
        const entered = MONTHLY_SALES_BLOCKS.map(block => row.block_amounts?.[block]?.[field])
            .filter((value): value is number => typeof value === 'number');
        result[field] = entered.length ? entered.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100 : null;
    }
    return result;
}

/** Only changed cells are submitted, against the revision read before editing. */
export function monthlySalesPatches(before: MonthlySalesMonth[], after: MonthlySalesMonth[]): MonthlySalesPatch[] {
    const previous = new Map(before.map(row => [row.month, row]));
    return after.flatMap(row => {
        const base = previous.get(row.month);
        if (!base) throw new Error('Сарын өмнөх мэдээлэл олдсонгүй');
        const blocks: NonNullable<MonthlySalesPatch['block_amounts']> = {};
        const derived = new Set<MonthlySalesField>();
        for (const block of MONTHLY_SALES_BLOCKS) {
            const changed = MONTHLY_SALES_FIELDS.filter(field => (row.block_amounts?.[block]?.[field] ?? null)
                !== (base.block_amounts?.[block]?.[field] ?? null));
            if (!changed.length) continue;
            blocks[block] = Object.fromEntries(changed.map(field => [field, row.block_amounts?.[block]?.[field] ?? null]));
            changed.forEach(field => derived.add(field));
        }
        const fields: Record<string, unknown> = Object.fromEntries(MONTHLY_SALES_FIELDS.filter(field => !derived.has(field) && row[field] !== base[field])
            .map(field => [field, row[field]]));
        for (const field of MONTHLY_SALES_STRETCH_FIELDS) {
            if ((row[field] ?? null) !== (base[field] ?? null)) fields[field] = row[field] ?? null;
        }
        const activity = activityTargetsPatch(base.activity_targets, row.activity_targets);
        if (activity) fields.activity_targets = activity;
        return Object.keys(fields).length || Object.keys(blocks).length
            ? [{ month: row.month, expectedRevision: base.revision, ...fields,
                ...(Object.keys(blocks).length ? { block_amounts: blocks } : {}) }] : [];
    });
}

export function summarizeMonthlySales(months: MonthlySalesMonth[]) {
    const totals = Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => {
        const entered = months.map(row => row[field]).filter((value): value is number => value !== null);
        return [field, { amount: entered.length ? entered.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100 : null,
            filledMonths: entered.length, expectedMonths: months.length }];
    })) as Record<MonthlySalesField, { amount: number | null; filledMonths: number; expectedMonths: number }>;
    const attainment = (plan: MonthlySalesField, actual: MonthlySalesField) => {
        // A partial year is comparable only when the same months have both figures.
        const entered = months.filter(row => row[plan] !== null || row[actual] !== null);
        if (!entered.length || entered.some(row => row[plan] === null || row[actual] === null)) return null;
        return monthlySalesAttainment(totals[actual].amount, totals[plan].amount);
    };
    const attainmentPct = Object.fromEntries(MONTHLY_SALES_METRICS.map(metric => [metric.key, attainment(metric.plan, metric.actual)])) as
        Record<MonthlySalesMetric['key'], number | null>;
    return { totals, attainmentPct };
}
