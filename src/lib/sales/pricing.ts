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
export type PricingConfig = PricingDraft & { id: string; shop_id: string; version: number; status: 'draft' | 'active' | 'archived' };
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
    if (draft.rules.some(rule => rule.advance_percent === null)) return 'Нөхцөл бүрийн эхний урьдчилгааны хувийг батална уу';
    for (let a = 0; a < draft.rules.length; a++) for (let b = a + 1; b < draft.rules.length; b++) {
        const left = draft.rules[a], right = draft.rules[b];
        if (pricingKey(left.block) === pricingKey(right.block) && pricingKey(left.model) === pricingKey(right.model)
            && pricingKey(left.payment_condition) === pricingKey(right.payment_condition)
            && left.floor_min <= right.floor_max && right.floor_min <= left.floor_max) return 'Ижил блок, загвар, нөхцөлийн давхарын зааг давхардсан байна';
    }
    return null;
}

export const PricingSaveSchema = z.object({
    expected_version: z.number().int().min(0),
    status: z.enum(['draft', 'active']),
    config: PricingDraftSchema,
}).strict().superRefine((value, context) => {
    const error = value.status === 'active' ? pricingActivationError(value.config) : null;
    if (error) context.addIssue({ code: 'custom', message: error, path: ['config'] });
});
export type PricingSaveInput = z.infer<typeof PricingSaveSchema>;

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
