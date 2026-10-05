/**
 * AI tool — лидийн ангилал: төслийн ангиллын жагсаалт (list_lead_categories) ба лидэд ангилал
 * тавих (set_lead_category, AUTO — буцаах боломжтой, лидийн түүхэнд бичигдэнэ).
 * Нэрийг `LeadCategoryService.resolveLeadCategory`-оор яг таарсныг л авна (том/жижиг үсэг, зай
 * ялгахгүй) — таамаглахгүй, таарахгүй бол боломжтой нэрсийг буцаана. Бичилт UI-ийн
 * PATCH /leads/[id]-тэй ижил: хүрээтэй (applyLeadScope) update + 'system' түүх (field: category).
 */
import { supabaseAdmin } from '@/lib/supabase';
import { applyLeadScope, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { UNCATEGORIZED_LABEL, leadDisplayName } from '@/lib/leads/labels';
import {
    leadCategoryName, listLeadCategories, logLeadCategoryChange, resolveLeadCategory,
} from '@/lib/services/LeadCategoryService';
import { findLead } from './actions';

type Args = Record<string, any>;
const db = () => supabaseAdmin();

/** Төслийн ангиллууд (архивласан нь тэмдэгтэй — шүүлтүүрт болно, шинээр оноохгүй). */
export async function listLeadCategoriesTool(shopId: string) {
    try {
        const categories = await listLeadCategories(db(), shopId, { includeArchived: true });
        return {
            categories: categories.map((category) => ({ name: category.name, description: category.description, archived: !category.is_active })),
            uncategorized: UNCATEGORIZED_LABEL,
            guidance: categories.length
                ? 'Ангиллыг яг энэ нэрээр өг; архивласан ангиллыг шинээр оноохгүй (шүүлтүүрт ашиглаж болно). Жагсаалтад байхгүй ангилал бүү зохио.'
                : 'Энэ төсөлд лидийн ангилал тохируулаагүй (Тохиргоо → Лидийн ангилал). Ангилал бүү зохио.',
        };
    } catch {
        return { error: 'Лидийн ангиллыг уншиж чадсангүй. Дахин оролдоно уу.' };
    }
}

/** Лидэд ангилал тавих / цэвэрлэх («Ангилалгүй» эсвэл хоосон). */
export async function setLeadCategory(shopId: string, args: Args, userId: string, userName: string, scope: SalesProjectScope = UNRESTRICTED_SALES_SCOPE) {
    if (args.category === undefined) return { error: `category шаардлагатай (цэвэрлэх бол «${UNCATEGORIZED_LABEL}»)` };
    const found = await findLead(shopId, args, scope);
    if ('error' in found) return found;
    const lead = found.lead;

    const { data: current, error: readError } = await applyLeadScope(db().from('leads').select('id, category_id')
        .eq('id', lead.id).eq('shop_id', shopId).is('deleted_at', null), scope).maybeSingle();
    if (readError) return { error: 'Лид шалгахад алдаа гарлаа. Дахин оролдоно уу.' };
    if (!current) return { error: 'Лид олдсонгүй' };
    const previous: string | null = current.category_id ?? null;

    const resolved = await resolveLeadCategory(db(), shopId, { name: args.category }, { current: previous });
    if (!resolved.ok) return { error: resolved.error };
    const nextName = resolved.category?.name ?? null;
    if (resolved.categoryId === previous) {
        return { success: true, unchanged: true, message: `«${leadDisplayName(lead)}» аль хэдийн «${nextName ?? UNCATEGORIZED_LABEL}» ангилалтай.`, leadId: lead.id };
    }

    const { data, error } = await applyLeadScope(db().from('leads').update({ category_id: resolved.categoryId, updated_at: new Date().toISOString() })
        .eq('id', lead.id).eq('shop_id', shopId).is('deleted_at', null), scope).select('id').maybeSingle();
    if (error) return { error: 'Лидийн ангилал шинэчлэгдсэнгүй. Дахин оролдоно уу.' };
    if (!data) return { error: 'Лид олдсонгүй. Ангилал өөрчлөгдөөгүй.' };

    const activity = await logLeadCategoryChange(db(), {
        shopId, leadId: lead.id, userId, userName: userName || null,
        from: { id: previous, name: await leadCategoryName(db(), shopId, previous) },
        to: { id: resolved.categoryId, name: nextName },
    });
    const message = `«${leadDisplayName(lead)}» лидийг «${nextName ?? UNCATEGORIZED_LABEL}» ангилалд орууллаа.`;
    if (!activity) return { error: `${message} Гэхдээ өөрчлөлтийн түүх хадгалагдсангүй. Лидээ нээж шалгана уу.`, partialSuccess: true, leadId: lead.id };
    return { success: true, message, leadId: lead.id };
}
