import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { applyLeadScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { PricingSelectionSchema, pricingKey } from '@/lib/sales/pricing';
import { quoteViewingSelection, loadViewingPricingConditions } from '@/lib/sales/pricing-store';
import { loadViewingOptions } from '@/lib/viewings/options';
import { ViewingInterestsSchema, viewingSelectionText, type ViewingInterest } from '@/lib/viewings/interests';
import { prepareViewingInterests } from '@/lib/viewings/prepare';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { updateViewing } from '@/lib/services/ViewingService';

const OptionsSchema = z.object({ project_id: z.guid().optional(), block: z.string().optional(), model: z.string().optional(), floor: z.number().int().optional() }).strict();

/** Return model/area groups first, exact units only after the model and floor are selected. */
export async function getViewingOptionsTool(shopId: string, args: unknown, scope: SalesProjectScope) {
    const parsed = OptionsSchema.parse(args);
    const db = supabaseAdmin();
    const [inventory, pricing] = await Promise.all([loadViewingOptions(db, shopId, scope, parsed.project_id), loadViewingPricingConditions(db, shopId, scope)]);
    const units = inventory.filter(row => (!parsed.block || pricingKey(row.block) === pricingKey(parsed.block))
        && (!parsed.model || pricingKey(row.model) === pricingKey(parsed.model)) && (parsed.floor === undefined || row.floor === parsed.floor));
    const groups = new Map<string, { block: string; model: string; area_sqm: number; floors: (number | null)[]; count: number }>();
    for (const unit of units) {
        const key = `${unit.block}|${unit.model}|${unit.area_sqm}`;
        const group = groups.get(key) ?? { block: unit.block, model: unit.model, area_sqm: unit.area_sqm, floors: [], count: 0 };
        group.count++;
        if (!group.floors.includes(unit.floor)) group.floors.push(unit.floor);
        groups.set(key, group);
    }
    return { groups: [...groups.values()], units: parsed.model && parsed.floor !== undefined ? units : [], pricing,
        guidance: 'Блок, загвар, талбайг энэ нөөцөөс сонгоно. Үнэ тооцохдоо calculate_viewing_quote ашиглана; нөхцөл болон урьдчилгааны хувийг таамаглахгүй.' };
}

export async function calculateViewingQuoteTool(shopId: string, args: unknown, scope: SalesProjectScope) {
    const result = await quoteViewingSelection(supabaseAdmin(), shopId, PricingSelectionSchema.parse(args), scope);
    return { ...result, guidance: 'Энэ нь тооцооллын санал. Харилцагчтай холбоо, гэрээ эсвэл мөнгөн орлого бүртгээгүй.' };
}

const EditSchema = z.object({
    viewing_id: z.guid(), interests: ViewingInterestsSchema.optional(),
    agent_notes: z.string().trim().max(4000).nullable().optional(),
    customer_feedback: z.string().trim().max(4000).nullable().optional(),
    meeting_type: z.enum(['new_customer', 'repeat_customer', 'existing_buyer']).optional(),
}).strict().refine(row => Object.keys(row).length > 1, 'Өөрчлөх мэдээлэл оруулна уу');

export async function updateViewingSelectionTool(shopId: string, args: unknown, confirm: boolean, userId: string, userName: string, scope: SalesProjectScope) {
    const { viewing_id: id, ...patch } = EditSchema.parse(args);
    const db = supabaseAdmin();
    const { data, error } = await applyLeadScope(db.from('property_viewings')
        .select(`id,interests,agent_notes,customer_feedback,meeting_type,${scope.projectIds === null ? 'leads' : 'leads!inner'}(project_id,sales_manager_name)`)
        .eq('shop_id', shopId).eq('id', id).is('deleted_at', null), scope, 'leads.project_id', 'leads.sales_manager_name').maybeSingle();
    if (error) return { error: 'Уулзалтын мэдээлэл уншигдсангүй' };
    if (!data) return { error: 'Уулзалт олдсонгүй' };
    const lead = Array.isArray(data.leads) ? data.leads[0] : data.leads;
    const interests = patch.interests === undefined ? undefined : await prepareViewingInterests(db, shopId, lead?.project_id ?? await soleShopProjectId(db, shopId), patch.interests, scope, (data.interests ?? []) as ViewingInterest[]);
    if (!confirm) return { requiresConfirmation: true, action: { tool: 'update_viewing', args: { viewing_id: id, ...patch } }, label: 'Уулзалтын мэдээлэл засах', preview: {
        'Өмнөх байр': viewingSelectionText(data.interests as ViewingInterest[]) ?? 'Сонгоогүй',
        ...(interests !== undefined ? { 'Шинэ байр': viewingSelectionText(interests) ?? 'Сонгоогүй', Тооцоолол: interests.map(row => row.quote ?? row.quote_unavailable_reason) } : {}),
        ...(patch.agent_notes !== undefined ? { 'Өмнөх сэжим': data.agent_notes, 'Шинэ сэжим': patch.agent_notes } : {}),
        ...(patch.customer_feedback !== undefined ? { 'Өмнөх санал': data.customer_feedback, 'Шинэ санал': patch.customer_feedback } : {}),
        ...(patch.meeting_type !== undefined ? { 'Өмнөх төрөл': data.meeting_type, 'Шинэ төрөл': patch.meeting_type } : {}),
    } };
    const result = await updateViewing(db, shopId, id, patch, { userId, managerName: userName || null, scope });
    return result.ok ? { success: true, viewingId: id, message: result.warning ?? 'Уулзалтын мэдээлэл шинэчлэгдлээ' } : { error: result.error };
}
