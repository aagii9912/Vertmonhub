import { z } from 'zod';

const name = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Огноо буруу байна');
const cents = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;

/** Client-safe selection; server verifies the combination against scoped inventory. */
export const PricingSelectionSchema = z.object({
    block: name(50), model: name(50),
    area_sqm: z.number().finite().positive().max(99_999_999.99).refine(cents, 'Талбай 2 орны нарийвчлалтай байна'),
    floor: z.number().int().min(1).max(200).nullable(),
    unit_id: z.guid().nullable().optional(),
    payment_condition: name(50).nullable().optional(),
}).strict();
export type PricingSelection = z.infer<typeof PricingSelectionSchema>;

export const PricingRuleSchema = z.object({
    block: name(50), model: name(50),
    floor_min: z.number().int().min(1).max(200),
    floor_max: z.number().int().min(1).max(200),
    payment_condition: name(50),
    price_per_sqm: z.number().int().positive().max(1_000_000_000),
    advance_percent: z.number().finite().min(0).max(100).refine(cents).nullable(),
}).strict().refine(rule => rule.floor_min <= rule.floor_max, 'Давхарын эхлэл төгсгөлөөс их байна');
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const PricingDraftSchema = z.object({
    source: z.string().trim().max(500),
    valid_from: day.nullable(), valid_until: day.nullable(),
    inventory_area_confirmed: z.boolean(),
    rules: z.array(PricingRuleSchema).max(500),
}).strict().refine(value => !value.valid_from || !value.valid_until || value.valid_from <= value.valid_until, 'Хүчинтэй хугацаа буруу байна');
export type PricingDraft = z.infer<typeof PricingDraftSchema>;
/**
 * A project has one or more price lists (owner decision 2026-11-27), each with its own versions, validity
 * window and archive. «Үндсэн үнэ» (`main`) is the default; versions are numbered per list.
 */
export const MAIN_PRICE_LIST = { key: 'main', name: 'Үндсэн үнэ' } as const;
export const MAX_PRICE_LISTS = 20;
export const PriceListKeySchema = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Үнийн жагсаалт буруу байна');
export const PriceListNameSchema = z.string().trim().min(1, 'Үнийн жагсаалтын нэрээ оруулна уу').max(80, 'Үнийн жагсаалтын нэр 80 тэмдэгтээс урт байна');
export type PricingConfig = PricingDraft & {
    id: string; shop_id: string; version: number; status: 'draft' | 'active' | 'archived';
    list_key: string; list_name: string;
};
export const EMPTY_PRICING_DRAFT: PricingDraft = { source: '', valid_from: null, valid_until: null, inventory_area_confirmed: false, rules: [] };

export function pricingKey(value: string): string {
    return value.trim().toUpperCase().replace(/Б/g, 'B').replace(/Е/g, 'E');
}

export function inventoryArea(unit: { updated_sale_area?: unknown; sale_area?: unknown; contracted_area?: unknown }): number | null {
    for (const value of [unit.updated_sale_area, unit.sale_area, unit.contracted_area]) {
        if (value === null || value === undefined || value === '') continue;
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) return Math.round(number * 100) / 100;
    }
    return null;
}

export function inventoryFloor(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (!/^\d+$/.test(String(value).trim())) return null;
    const floor = Number(value);
    return Number.isInteger(floor) && floor >= 1 && floor <= 200 ? floor : null;
}

export function pricingActivationError(draft: PricingDraft): string | null {
    if (!draft.source || !draft.valid_from || !draft.valid_until) return 'Үнийн эх сурвалж, хүчинтэй хугацааг оруулна уу';
    if (!draft.inventory_area_confirmed) return 'Одоогийн нөөцийн талбайгаар тооцохыг батална уу';
    if (!draft.rules.length) return 'Баталсан үнийн мөр нэмнэ үү';
    const missing = draft.rules.filter(rule => rule.advance_percent === null);
    if (missing.length) {
        const conditions = [...new Set(missing.map(rule => rule.payment_condition))];
        return `Нөхцөл бүрийн эхний урьдчилгааны хувийг батална уу: ${missing.length} мөр хоосон (${conditions.slice(0, 6).join(', ')}${conditions.length > 6 ? ' …' : ''})`;
    }
    for (let a = 0; a < draft.rules.length; a++) for (let b = a + 1; b < draft.rules.length; b++) {
        if (rulesOverlap(draft.rules[a], draft.rules[b])) return 'Ижил блок, загвар, нөхцөлийн давхарын зааг давхардсан байна';
    }
    return null;
}

/** Two rules price the same unit and condition: same block, model and condition with overlapping floors. */
function rulesOverlap(left: PricingRule, right: PricingRule): boolean {
    return pricingKey(left.block) === pricingKey(right.block) && pricingKey(left.model) === pricingKey(right.model)
        && pricingKey(left.payment_condition) === pricingKey(right.payment_condition)
        && left.floor_min <= right.floor_max && right.floor_min <= left.floor_max;
}

/**
 * Activation check across lists: another list's active price may not cover the same unit and condition on
 * the same days — a quote never chooses between two prices. Lists of different blocks, or of the same block
 * in separate periods (a special price, then the regular one), do not conflict. The RPC enforces the same rule.
 */
export function priceListConflict(draft: PricingDraft, others: readonly PricingConfig[]): string | null {
    if (!draft.valid_from || !draft.valid_until) return null;
    for (const other of others) {
        if (other.status !== 'active' || !other.valid_from || !other.valid_until) continue;
        if (draft.valid_from > other.valid_until || other.valid_from > draft.valid_until) continue;
        const byUnit = new Map<string, PricingRule[]>();
        for (const rule of other.rules) {
            const key = `${pricingKey(rule.block)}|${pricingKey(rule.model)}|${pricingKey(rule.payment_condition)}`;
            byUnit.set(key, [...byUnit.get(key) ?? [], rule]);
        }
        for (const rule of draft.rules) {
            const key = `${pricingKey(rule.block)}|${pricingKey(rule.model)}|${pricingKey(rule.payment_condition)}`;
            if (byUnit.get(key)?.some(match => rulesOverlap(rule, match))) {
                return `«${other.list_name}» жагсаалтын идэвхтэй үнэтэй давхцаж байна: ${rule.block} · ${rule.model} · ${rule.floor_min}–${rule.floor_max} давхар · ${rule.payment_condition} (${other.valid_from} – ${other.valid_until}). Блок эсвэл хүчинтэй хугацааг ялгана уу`;
            }
        }
    }
    return null;
}

export const PricingSaveSchema = z.object({
    /** Omitted = the default list, so a client from before price lists keeps saving «Үндсэн үнэ». */
    list_key: PriceListKeySchema.default(MAIN_PRICE_LIST.key),
    list_name: PriceListNameSchema.default(MAIN_PRICE_LIST.name),
    /** The latest version of this list (0 for a new list). */
    expected_version: z.number().int().min(0),
    status: z.enum(['draft', 'active']),
    config: PricingDraftSchema,
}).strict().superRefine((value, context) => {
    const error = value.status === 'active' ? pricingActivationError(value.config) : null;
    if (error) context.addIssue({ code: 'custom', message: error, path: ['config'] });
});
export type PricingSaveInput = z.input<typeof PricingSaveSchema>;
/** Editor state of one list: its latest version (any status) and its active version. */
export interface PriceListOverview { key: string; name: string; latest: PricingConfig | null; active: PricingConfig | null }
export const PricingRetireSchema = z.object({ list_key: PriceListKeySchema, expected_version: z.number().int().min(1) }).strict();
export type PricingRetireInput = z.infer<typeof PricingRetireSchema>;

export interface PricingQuote {
    config_id: string; version: number; source: string; as_of: string;
    block: string; model: string; area_sqm: number; floor: number | null; unit_id: string | null;
    payment_condition: string; price_per_sqm: number; total_amount: number;
    advance_amount: number | null; balance_amount: number | null; advance_reason: string | null;
}
export type PricingResult = { available: false; reason: string; quote: null } | { available: true; quote: PricingQuote };
const unavailable = (reason: string): PricingResult => ({ available: false, reason, quote: null });
const roundRatio = (amount: bigint, divisor: number) => Number((amount + BigInt(divisor / 2)) / BigInt(divisor));

/** No rates/advances are inferred from a condition label. Preview never writes a quote contact. */
export function calculatePricing(config: PricingConfig | null, selection: PricingSelection, asOf: string): PricingResult {
    if (!config || config.status !== 'active') return unavailable('Баталсан үнийн тохиргоо байхгүй');
    if (!config.valid_from || !config.valid_until || asOf < config.valid_from || asOf > config.valid_until) return unavailable('Үнийн хүчинтэй хугацаанд багтахгүй байна');
    if (!config.inventory_area_confirmed) return unavailable('Тооцоонд ашиглах талбай батлагдаагүй');
    if (!selection.payment_condition) return unavailable('Төлбөрийн нөхцөлөө сонгоно уу');
    const rules = config.rules.filter(rule => pricingKey(rule.block) === pricingKey(selection.block)
        && pricingKey(rule.model) === pricingKey(selection.model)
        && pricingKey(rule.payment_condition) === pricingKey(selection.payment_condition!)
        && (selection.floor === null || (selection.floor >= rule.floor_min && selection.floor <= rule.floor_max)));
    if (!rules.length) return unavailable('Энэ байр, давхар, нөхцөлийн баталсан үнэ байхгүй');
    if (rules.length !== 1) return unavailable(selection.floor === null ? 'Үнэ бодохын өмнө давхраа сонгоно уу' : 'Үнийн дүрэм давхардсан байна');
    const rule = rules[0];
    const total = roundRatio(BigInt(Math.round(selection.area_sqm * 100)) * BigInt(rule.price_per_sqm), 100);
    if (!Number.isSafeInteger(total) || total <= 0 || total > 10_000_000_000_000) return unavailable('Үнийн нийт дүн зөвшөөрсөн хязгаараас гарсан');
    const advance = rule.advance_percent === null ? null : roundRatio(BigInt(total) * BigInt(Math.round(rule.advance_percent * 100)), 10_000);
    return { available: true, quote: {
        config_id: config.id, version: config.version, source: config.source, as_of: asOf,
        block: selection.block, model: selection.model, area_sqm: selection.area_sqm,
        floor: selection.floor, unit_id: selection.unit_id ?? null, payment_condition: rule.payment_condition,
        price_per_sqm: rule.price_per_sqm, total_amount: total,
        advance_amount: advance, balance_amount: advance === null ? null : total - advance,
        advance_reason: advance === null ? 'Эхний урьдчилгааны хувь батлагдаагүй' : null,
    } };
}

/**
 * Quote from the project's active price lists. Exactly one list may price the selection on `asOf`; lists that
 * are out of their window, or do not cover the unit, give no price. With no price, the reason comes from a
 * list that covers the block (its window or missing row) rather than from an unrelated list.
 */
export function calculateListPricing(configs: readonly PricingConfig[], selection: PricingSelection, asOf: string): PricingResult {
    const active = configs.filter(config => config.status === 'active');
    if (!active.length) return calculatePricing(null, selection, asOf);
    if (active.length === 1) return calculatePricing(active[0], selection, asOf);
    const results = active.map(config => ({ config, result: calculatePricing(config, selection, asOf) }));
    const priced = results.filter(item => item.result.available);
    if (priced.length === 1) return priced[0].result;
    if (priced.length > 1) return unavailable('Үнийн дүрэм давхардсан байна');
    const block = pricingKey(selection.block);
    const covering = results.filter(item => item.config.rules.some(rule => pricingKey(rule.block) === block));
    if (!covering.length) return unavailable('Энэ байр, давхар, нөхцөлийн баталсан үнэ байхгүй');
    const inWindow = covering.find(item => !!item.config.valid_from && !!item.config.valid_until && asOf >= item.config.valid_from && asOf <= item.config.valid_until);
    return (inWindow ?? covering[0]).result;
}
