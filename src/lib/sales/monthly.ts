import { z } from 'zod';

/** Client-safe contract for the project's monthly plan and manually confirmed performance. */
export const MONTHLY_SALES_FIELDS = [
    'target_amount', 'cashflow_target_amount',
    'manual_contract_actual_amount', 'manual_cashflow_actual_amount',
] as const;
export type MonthlySalesField = typeof MONTHLY_SALES_FIELDS[number];

export const MONTHLY_SALES_LABELS: Record<MonthlySalesField, string> = {
    target_amount: 'Гэрээний төлөвлөгөө',
    cashflow_target_amount: 'Орсон мөнгөний төлөвлөгөө',
    manual_contract_actual_amount: 'Гэрээний гүйцэтгэл',
    manual_cashflow_actual_amount: 'Орсон мөнгөний гүйцэтгэл',
};

export const SalesYearSchema = z.number().int().min(2000).max(2100);
export const MonthlySalesAmountSchema = z.number().finite().min(0).max(1e13).multipleOf(0.01).nullable();
const values = {
    target_amount: MonthlySalesAmountSchema,
    cashflow_target_amount: MonthlySalesAmountSchema,
    manual_contract_actual_amount: MonthlySalesAmountSchema,
    manual_cashflow_actual_amount: MonthlySalesAmountSchema,
};

export const MonthlySalesMonthSchema = z.object({
    month: z.number().int().min(1).max(12),
    revision: z.number().int().min(0).max(2_147_483_646),
    ...values,
}).strict();
export type MonthlySalesMonth = z.infer<typeof MonthlySalesMonthSchema>;

export const MonthlySalesPatchSchema = z.object({
    month: z.number().int().min(1).max(12),
    expectedRevision: z.number().int().min(0).max(2_147_483_646),
    ...Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => [field, values[field].optional()])) as {
        [K in MonthlySalesField]: z.ZodOptional<typeof MonthlySalesAmountSchema>;
    },
}).strict().refine(row => MONTHLY_SALES_FIELDS.some(field => row[field] !== undefined), {
    message: 'Өөрчлөх дүнг сонгоно уу',
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
    }));
}

/** Empty is unknown; an explicitly entered zero remains zero. Invalid text is never coerced. */
export function parseMonthlySalesAmount(text: string): number | null | undefined {
    const cleaned = text.replace(/[,\s]/g, '');
    if (!cleaned) return null;
    if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return undefined;
    const parsed = MonthlySalesAmountSchema.safeParse(Number(cleaned));
    return parsed.success ? parsed.data : undefined;
}

export function monthlySalesAttainment(actual: number | null, plan: number | null): number | null {
    return actual === null || plan === null || plan <= 0 ? null : Math.round(actual / plan * 1000) / 10;
}

/** Only changed cells are submitted, against the revision read before editing. */
export function monthlySalesPatches(before: MonthlySalesMonth[], after: MonthlySalesMonth[]): MonthlySalesPatch[] {
    const previous = new Map(before.map(row => [row.month, row]));
    return after.flatMap(row => {
        const base = previous.get(row.month);
        if (!base) throw new Error('Сарын өмнөх мэдээлэл олдсонгүй');
        const fields = Object.fromEntries(MONTHLY_SALES_FIELDS.filter(field => row[field] !== base[field]).map(field => [field, row[field]]));
        return Object.keys(fields).length ? [{ month: row.month, expectedRevision: base.revision, ...fields }] : [];
    });
}

export function summarizeMonthlySales(months: MonthlySalesMonth[]) {
    const totals = Object.fromEntries(MONTHLY_SALES_FIELDS.map(field => {
        const entered = months.map(row => row[field]).filter((value): value is number => value !== null);
        return [field, { amount: entered.length ? entered.reduce((sum, value) => sum + value, 0) : null,
            filledMonths: entered.length, expectedMonths: months.length }];
    })) as Record<MonthlySalesField, { amount: number | null; filledMonths: number; expectedMonths: number }>;
    const attainment = (plan: MonthlySalesField, actual: MonthlySalesField) => {
        // A partial year is comparable only when the same months have both figures.
        const entered = months.filter(row => row[plan] !== null || row[actual] !== null);
        if (!entered.length || entered.some(row => row[plan] === null || row[actual] === null)) return null;
        return monthlySalesAttainment(totals[actual].amount, totals[plan].amount);
    };
    return { totals, contractAttainmentPct: attainment('target_amount', 'manual_contract_actual_amount'),
        cashflowAttainmentPct: attainment('cashflow_target_amount', 'manual_cashflow_actual_amount') };
}
