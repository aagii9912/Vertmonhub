import type { SupabaseClient } from '@supabase/supabase-js';
import type { SalesProjectScope } from '@/lib/sales/project-scope';
import { quoteViewingSelection, PricingSelectionError } from '@/lib/sales/pricing-store';
import { ViewingInterestsSchema, type ViewingInterest } from './interests';
import { pricingKey, type PricingSelection } from '@/lib/sales/pricing';

const selectionKey = (selection: PricingSelection) => JSON.stringify([
    pricingKey(selection.block), pricingKey(selection.model), selection.area_sqm, selection.floor,
    selection.unit_id ?? null, selection.payment_condition?.trim() || null,
]);

/** Validate every selection before writes and derive amounts from the server's price version. */
export async function prepareViewingInterests(db: SupabaseClient, shopId: string, projectId: string | null | undefined,
    input: unknown, scope: SalesProjectScope, existing: readonly ViewingInterest[] = []): Promise<ViewingInterest[]> {
    const parsed = ViewingInterestsSchema.safeParse(input);
    if (!parsed.success) throw new PricingSelectionError('Байрны сонголтоо шалгана уу', 400);
    if (!parsed.data.length) return [];
    if (!projectId || (scope.projectIds !== null && !scope.projectIds.includes(projectId))) throw new PricingSelectionError('Төсөл олдсонгүй', 404);
    const result: ViewingInterest[] = [];
    for (const selection of parsed.data) {
        const saved = existing.find(interest => selectionKey(interest) === selectionKey(selection));
        // Only trust the snapshot read from this viewing, never a quote supplied by a caller.
        if (saved) { result.push(saved); continue; }
        const quote = await quoteViewingSelection(db, shopId, selection, { ...scope, projectIds: [projectId] });
        let unitLabel: string | null = null;
        if (selection.unit_id) {
            const unit = await db.from('property_units').select('unit_number,code')
                .eq('id', selection.unit_id).eq('shop_id', shopId).eq('project_id', projectId).maybeSingle();
            if (unit.error) throw new PricingSelectionError('Тоотын мэдээллийг шалгаж чадсангүй', 503);
            if (!unit.data) throw new PricingSelectionError('Тоот олдсонгүй', 404);
            unitLabel = unit.data.unit_number || unit.data.code || null;
        }
        result.push({ ...selection, ...(selection.unit_id ? { unit_label: unitLabel } : {}), quote: quote.available ? quote.quote : null, quote_unavailable_reason: quote.available ? null : quote.reason });
    }
    return result;
}
