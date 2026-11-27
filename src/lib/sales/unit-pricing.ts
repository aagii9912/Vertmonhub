import { z } from 'zod';
import { PriceListKeySchema, PriceListNameSchema, pricingKey } from './pricing';

/**
 * Per-unit prices (owner decision 2026-11-27): parking spaces, storage and service space are sold at a price
 * per unit — one price, or one per payment condition, for every unit by its register code — the way
 * Mandala Garden's approved «Зогсоолын үнийн санал» lists them. Apartments stay per m² in `pricing.ts`.
 * A project has any number of such lists (a block or garage each, with its own validity window); versions,
 * archive and activation work like the apartment price lists. Client-safe.
 */
export const UNIT_PRICE_CATEGORIES = ['parking', 'industry', 'commercial'] as const;
export type UnitPriceCategory = typeof UNIT_PRICE_CATEGORIES[number];
export const MAX_UNIT_PRICE_ROWS = 3000;
export const MAX_UNIT_PRICE_CONDITIONS = 12;
export const MAX_UNIT_PRICE_LISTS = 40;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Огноо буруу байна').refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Огноо буруу байна');
const cents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;

export const UnitPriceConditionSchema = z.object({
    label: z.string().trim().min(1, 'Нөхцөлийн нэр хоосон байна').max(50),
    /** First advance in percent; never derived from the label. Null = not confirmed yet. */
    advance_percent: z.number().finite().min(0).max(100).refine(cents, 'Урьдчилгаа 2 хүртэл орны бутархайтай байна').nullable(),
}).strict();
export type UnitPriceCondition = z.infer<typeof UnitPriceConditionSchema>;

export const UnitPriceRowSchema = z.object({
    block: z.string().trim().min(1, 'Блок хоосон байна').max(50),
    /** The unit's code in the register («201-288», «Г1474-342»). */
    code: z.string().trim().min(1, 'Код хоосон байна').max(50),
    model: z.string().trim().max(50).nullable(),
    area_sqm: z.number().finite().positive().max(99_999_999.99).refine(cents, 'Талбай 2 орны нарийвчлалтай байна').nullable(),
    /** Whole tugrik per condition label; a missing label means the condition is not offered for this unit. */
    prices: z.record(z.string(), z.number().int('Үнэ бүхэл төгрөг байна').positive('Үнэ 0-ээс их байна').max(100_000_000_000)),
}).strict();
export type UnitPriceRow = z.infer<typeof UnitPriceRowSchema>;

export const UnitPriceDraftSchema = z.object({
    source: z.string().trim().max(500),
    valid_from: day.nullable(),
    /** Null = no end day («2026/10/08-с хүчинтэй»). */
    valid_until: day.nullable(),
    note: z.string().trim().max(2000),
    conditions: z.array(UnitPriceConditionSchema).max(MAX_UNIT_PRICE_CONDITIONS),
    rows: z.array(UnitPriceRowSchema).max(MAX_UNIT_PRICE_ROWS),
}).strict().superRefine((value, context) => {
    if (value.valid_from && value.valid_until && value.valid_from > value.valid_until) context.addIssue({ code: 'custom', message: 'Хүчинтэй хугацаа буруу байна' });
    const labels = new Set(value.conditions.map(condition => condition.label));
    if (labels.size !== value.conditions.length) context.addIssue({ code: 'custom', message: 'Төлбөрийн нөхцөл давхардсан байна' });
    const stray = value.rows.find(row => Object.keys(row.prices).some(label => !labels.has(label)));
    if (stray) context.addIssue({ code: 'custom', message: `${stray.code}: жагсаалтад байхгүй нөхцөлийн үнэ байна` });
});
export type UnitPriceDraft = z.infer<typeof UnitPriceDraftSchema>;
export const EMPTY_UNIT_PRICE_DRAFT: UnitPriceDraft = { source: '', valid_from: null, valid_until: null, note: '', conditions: [], rows: [] };

export type UnitPriceList = UnitPriceDraft & {
    id: string; shop_id: string; list_key: string; list_name: string; category: UnitPriceCategory;
    version: number; status: 'draft' | 'active' | 'archived';
};
/** Editor state of one list: its latest version (any status) and its active version. */
export interface UnitPriceListOverview { key: string; name: string; category: UnitPriceCategory; latest: UnitPriceList | null; active: UnitPriceList | null }

/** What must be true before a list can price units; the RPC checks the same. */
export function unitPriceActivationError(draft: UnitPriceDraft): string | null {
    if (!draft.source || !draft.valid_from) return 'Үнийн эх сурвалж, эхлэх огноог оруулна уу';
    if (!draft.conditions.length) return 'Төлбөрийн нөхцөл (үнийн багана) алга';
    if (!draft.rows.length) return 'Үнийн мөр алга';
    const empty = draft.rows.find(row => !Object.keys(row.prices).length);
    if (empty) return `${empty.code}: үнэ оруулаагүй`;
    const seen = new Set<string>();
    for (const row of draft.rows) {
        const key = pricingKey(row.code);
        if (seen.has(key)) return `${row.code.trim()} код хоёр мөрд байна`;
        seen.add(key);
    }
    return null;
}

/** The window as the page shows it; an open end stays valid from its start. */
export function unitPriceValidity(list: { valid_from: string | null; valid_until: string | null }, asOf: string): 'valid' | 'upcoming' | 'expired' {
    if (!list.valid_from) return 'expired';
    if (asOf < list.valid_from) return 'upcoming';
    return list.valid_until && asOf > list.valid_until ? 'expired' : 'valid';
}

/** Another active list of the same kind already prices one of the units on the same days: never two prices for one unit. */
export function unitPriceConflict(draft: UnitPriceDraft, category: UnitPriceCategory, others: readonly UnitPriceList[]): string | null {
    if (!draft.valid_from) return null;
    for (const other of others) {
        if (other.status !== 'active' || other.category !== category || !other.valid_from) continue;
        if ((draft.valid_until ?? '9999-12-31') < other.valid_from || (other.valid_until ?? '9999-12-31') < draft.valid_from) continue;
        const codes = new Set(other.rows.map(row => pricingKey(row.code)));
        const hit = draft.rows.find(row => codes.has(pricingKey(row.code)));
        if (hit) return `«${other.list_name}» жагсаалтын идэвхтэй үнэтэй давхцаж байна: ${hit.code}. Тоот эсвэл хүчинтэй хугацааг ялгана уу`;
    }
    return null;
}

export const UnitPriceSaveSchema = z.object({
    list_key: PriceListKeySchema,
    list_name: PriceListNameSchema,
    category: z.enum(UNIT_PRICE_CATEGORIES, { error: 'Төрлөө сонгоно уу' }),
    /** The latest version of this list (0 for a new list). */
    expected_version: z.number().int().min(0),
    status: z.enum(['draft', 'active']),
    config: UnitPriceDraftSchema,
}).strict().superRefine((value, context) => {
    const error = value.status === 'active' ? unitPriceActivationError(value.config) : null;
    if (error) context.addIssue({ code: 'custom', message: error, path: ['config'] });
});
export type UnitPriceSaveInput = z.infer<typeof UnitPriceSaveSchema>;
export const UnitPriceRetireSchema = z.object({ list_key: PriceListKeySchema, expected_version: z.number().int().min(1) }).strict();
export type UnitPriceRetireInput = z.infer<typeof UnitPriceRetireSchema>;

/** One active list as the price page shows it. */
export interface UnitPriceSheet {
    id: string; list_key: string; list_name: string; category: UnitPriceCategory; version: number;
    source: string; note: string; valid_from: string | null; valid_until: string | null;
    validity: 'valid' | 'upcoming' | 'expired';
    activated_at: string; activated_by: string | null;
    conditions: UnitPriceCondition[]; rows: UnitPriceRow[];
}
