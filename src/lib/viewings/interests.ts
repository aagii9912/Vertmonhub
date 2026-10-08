import { z } from 'zod';
import { PricingSelectionSchema, type PricingQuote, type PricingSelection } from '@/lib/sales/pricing';

export type ViewingInterestInput = PricingSelection;
export const ViewingInterestInputSchema = PricingSelectionSchema;
export const ViewingInterestsSchema = z.array(ViewingInterestInputSchema).max(20);

/** A saved quote is a historical offer snapshot, never a cash receipt. */
export type ViewingInterest = ViewingInterestInput & {
    quote: PricingQuote | null;
    quote_unavailable_reason: string | null;
    /** Actual inventory number/code at the time of selection; server-owned. */
    unit_label?: string | null;
};

/** Safe picker response: inventory attributes only; buyer/manager data never enters it. */
export interface ViewingUnitOption {
    id: string;
    project_id: string | null;
    block: string;
    model: string;
    area_sqm: number;
    floor: number | null;
    unit_number: string | null;
    code: string;
    status: string;
}

export type ViewingCondition = { block: string; model: string; floor_min: number; floor_max: number; payment_condition: string };

export function viewingInterestLabel(interest: ViewingInterestInput & { unit_label?: string | null }): string {
    return [interest.block, interest.model, `${interest.area_sqm} м²`, interest.floor == null ? null : `${interest.floor}-р давхар`, interest.unit_label ? `Тоот ${interest.unit_label}` : null, interest.payment_condition].filter(Boolean).join(' · ');
}

export function viewingSelectionText(interests: readonly ViewingInterestInput[] | null | undefined, fallback?: string | null): string | null {
    return interests?.length ? interests.map(viewingInterestLabel).join('; ') : fallback || null;
}

export function interestInput(interest: ViewingInterestInput): ViewingInterestInput {
    return { block: interest.block, model: interest.model, area_sqm: interest.area_sqm, floor: interest.floor,
        unit_id: interest.unit_id ?? null, payment_condition: interest.payment_condition ?? null };
}

export function includeDraftInterest(value: ViewingInterestInput[], draft: ViewingInterestInput | null): ViewingInterestInput[] {
    if (!draft || value.some(item => JSON.stringify(interestInput(item)) === JSON.stringify(interestInput(draft)))) return value;
    return [...value, interestInput(draft)];
}
