import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLeadScope, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { QuoteAmountSchema, QuoteUnitSchema, quoteContent, type LeadQuoteInput } from '@/lib/leads/quotes';

/**
 * Түүхийн нэмэлт лог/уншилт нь best-effort. Хэрэглэгчийн үндсэн бичилт
 * (recordLeadContact) хадгалалт бүрийг шалгаж, хэсэгчилсэн алдааг ил тод буцаана.
 */

export type LeadActivityType = 'note' | 'call' | 'status' | 'manager' | 'meeting' | 'contract' | 'system' | 'quote';
/** Хэрэглэгч гараар бүртгэх холбоо барилт: тэмдэглэл, дуудлага, үнийн санал. */
export type LeadContactType = 'note' | 'call' | 'quote';

export interface LeadActivity {
    id: string;
    lead_id: string;
    type: LeadActivityType;
    content: string | null;
    meta: Record<string, unknown>;
    /** Бичсэн хэрэглэгч (auth.users) — менежерийн түүхэнд бүртгэлийн нэрээр онооход. */
    created_by?: string | null;
    created_by_name: string | null;
    created_at: string;
}

const ACTIVITY_COLUMNS = 'id, lead_id, type, content, meta, created_by, created_by_name, created_at';

export async function logLeadActivity(
    db: SupabaseClient,
    input: {
        shopId: string;
        leadId: string;
        type: LeadActivityType;
        content?: string | null;
        meta?: Record<string, unknown>;
        createdBy?: string | null;
        createdByName?: string | null;
    },
): Promise<LeadActivity | null> {
    try {
        const { data, error } = await db
            .from('lead_activities')
            .insert({
                shop_id: input.shopId,
                lead_id: input.leadId,
                type: input.type,
                content: input.content ?? null,
                meta: input.meta ?? {},
                created_by: input.createdBy ?? null,
                created_by_name: input.createdByName ?? null,
            })
            .select(ACTIVITY_COLUMNS)
            .single();
        if (error) return null;
        return data as LeadActivity;
    } catch {
        return null;
    }
}

/**
 * Сүүлийн `limit` үйлдэл, шинэ нь дээр. Алдааг хоосон жагсаалт болгож нуухгүй (throw) —
 * бүрэн түүхийг менежерийн Time-line (lib/leads/timeline-load.ts) уншина.
 */
export async function listLeadActivities(db: SupabaseClient, shopId: string, leadId: string, limit = 100): Promise<LeadActivity[]> {
    const { data, error } = await db
        .from('lead_activities')
        .select(ACTIVITY_COLUMNS)
        .eq('shop_id', shopId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []) as LeadActivity[];
}

/**
 * Дуудлага/тэмдэглэл/үнийн санал бүртгэх + лидийн last_contact_at / next_followup_at шинэчлэх —
 * API route (`POST /leads/[id]/activities`) ба AI tool (`log_call`, `set_followup`, `add_lead_note`,
 * `log_price_quote`) бүгд энд дамжина. Дуудлага ба үнийн санал нь холбоо барилт (last_contact_at);
 * үнийн санал статус өөрчлөхгүй, орлого/гэрээний дүнд орохгүй.
 * ok=true зөвхөн бүх хадгалалт амжилттай үед. partialSuccess=true бол лидийн цаг
 * шинэчлэгдсэн ч түүх хадгалагдаагүй (үнийн саналд эсрэгээр: түүх хадгалагдсан ч лидийн цаг
 * шинэчлэгдээгүй); дуудагч алдааг харуулж, дэлгэцийн өгөгдлийг шинэчилнэ.
 */
export async function recordLeadContact(
    db: SupabaseClient,
    input: {
        shopId: string; leadId: string; type: LeadContactType;
        /** Үнийн саналд хоосон бол «Үнийн санал: 450,000,000₮ · тоот» болно. */
        content: string;
        quote?: LeadQuoteInput;
        nextFollowupAt?: string | null; userId?: string | null; managerName?: string | null; scope?: SalesProjectScope;
    },
): Promise<
    { ok: true; activity: LeadActivity }
    | { ok: false; error: string; status: number; partialSuccess?: boolean }
> {
    const scope = input.scope || UNRESTRICTED_SALES_SCOPE;
    const what = input.type === 'quote' ? 'Үнийн санал' : 'Дуудлага/тэмдэглэл';
    let quote: { amount: number; unit_label: string | null } | null = null;
    if (input.type === 'quote') {
        const amount = QuoteAmountSchema.safeParse(input.quote?.amount);
        if (!amount.success) return { ok: false, status: 400, error: amount.error.issues[0]?.message || 'Үнийн саналын дүнг оруулна уу' };
        const unit = QuoteUnitSchema.safeParse(input.quote?.unitLabel);
        if (!unit.success) return { ok: false, status: 400, error: unit.error.issues[0]?.message || 'Байр/тоот буруу байна' };
        quote = { amount: amount.data, unit_label: unit.data };
    }
    const content = input.content.trim() || (quote ? quoteContent(quote.amount, quote.unit_label) : '');
    if (!content) return { ok: false, status: 400, error: 'Тэмдэглэл хоосон байна' };

    if (scope.projectIds !== null) {
        if (!input.userId || !scope.managerName || !scope.projectIds.length) {
            return { ok: false, error: 'Лид олдсонгүй', status: 404 };
        }
        const { data, error } = await db.rpc('record_scoped_sales_lead_contact', {
            p_shop_id: input.shopId, p_lead_id: input.leadId, p_user_id: input.userId,
            p_manager_name: scope.managerName, p_project_ids: scope.projectIds,
            p_input: { type: input.type, content,
                ...(quote ? { quote: { amount: quote.amount, ...(quote.unit_label ? { unit_label: quote.unit_label } : {}) } } : {}),
                ...(input.nextFollowupAt !== undefined ? { next_followup_at: input.nextFollowupAt } : {}),
            },
        });
        if (error || !data) {
            const status = error?.code === 'P0002' ? 404
                : ['22023', '22P02', '22007', '22008'].includes(error?.code || '') ? 400 : 503;
            return { ok: false, status, error: status === 404 ? 'Лид олдсонгүй' : `${what} хадгалагдсангүй. Дахин оролдоно уу.` };
        }
        return { ok: true, activity: data as LeadActivity };
    }
    const { data: lead, error: readError } = await applyLeadScope(db.from('leads').select('id')
        .eq('id', input.leadId).eq('shop_id', input.shopId).is('deleted_at', null), scope).maybeSingle();
    if (readError) return { ok: false, error: 'Лид шалгахад алдаа гарлаа', status: 500 };
    if (!lead) return { ok: false, error: 'Лид олдсонгүй', status: 404 };

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (input.type === 'call' || input.type === 'quote') updates.last_contact_at = now;
    if (input.nextFollowupAt !== undefined) updates.next_followup_at = input.nextFollowupAt;
    const changesLead = Object.keys(updates).length > 1;
    const updateLead = () => applyLeadScope(db.from('leads').update(updates)
        .eq('id', input.leadId).eq('shop_id', input.shopId).is('deleted_at', null), scope).select('id').maybeSingle();
    const meta: Record<string, unknown> = input.nextFollowupAt !== undefined ? { next_followup_at: input.nextFollowupAt } : {};
    if (quote) {
        meta.amount = quote.amount;
        if (quote.unit_label) meta.unit_label = quote.unit_label;
    }
    const writeHistory = () => logLeadActivity(db, {
        shopId: input.shopId, leadId: input.leadId, type: input.type, content, meta,
        createdBy: input.userId ?? null, createdByName: input.managerName ?? null,
    });

    // Үнийн саналын үндсэн бүртгэл нь түүх — ЭХЛЭЭД бичнэ. Бичигдэхгүй бол (жишээ нь 20261004162000
    // migration-ий CHECK хэрэглэгдээгүй) лидэд юу ч өөрчлөгдөхгүй, хэсэгчилсэн хадгалалт үүсэхгүй.
    if (quote) {
        const activity = await writeHistory();
        if (!activity) return { ok: false, status: 500, error: 'Үнийн санал хадгалагдсангүй. Дахин оролдоно уу.' };
        const { data, error } = await updateLead();
        if (error || !data) {
            return { ok: false, status: 500, partialSuccess: true,
                error: 'Үнийн санал түүхэнд хадгалагдсан боловч лидийн холбооны цаг шинэчлэгдсэнгүй. Дахин бүү бүртгэ — лидээ нээж шалгана уу.' };
        }
        return { ok: true, activity };
    }

    if (changesLead) {
        const { data, error } = await updateLead();
        if (error) return { ok: false, error: 'Лидийн холбооны мэдээлэл шинэчлэгдсэнгүй. Бүртгэл хадгалагдаагүй.', status: 500 };
        if (!data) return { ok: false, error: 'Лид олдсонгүй. Бүртгэл хадгалагдаагүй.', status: 404 };
    }
    const activity = await writeHistory();
    if (!activity) {
        return {
            ok: false, status: 500, partialSuccess: changesLead,
            error: changesLead
                ? 'Лидийн холбооны цаг шинэчлэгдсэн боловч дуудлага/тэмдэглэлийн түүх хадгалагдсангүй. Лидээ нээж шалгана уу.'
                : 'Тэмдэглэл хадгалагдсангүй. Дахин оролдоно уу.',
        };
    }
    return { ok: true, activity };
}
