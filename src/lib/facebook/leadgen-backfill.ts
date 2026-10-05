/**
 * Facebook Lead Ads backfill: Page-ийн бүх lead форм (`/{page_id}/leadgen_forms`) → форм бүрийн
 * сүүлийн N (≤90) хоногийн лид (`/{form_id}/leads`). Meta лидийг 90 хоног л хадгалдаг тул
 * webhook алгассан, тохиргоо дутуу байсан үеийн лидийг ингэж нөхнө. Webhook-тэй ижил
 * `saveMetaLead`-ээр бичдэг тул давтан ажиллуулахад давхар лид үүсэхгүй.
 * Эрх: Page токенд `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    LEAD_FIELDS, emptySummary, leadgenRequestId, pageGraphRead, saveMetaLead, tally,
    type LeadgenSummary, type MetaLead,
} from '@/lib/facebook/leadgen';

export const LEADGEN_RETENTION_DAYS = 90;
const MAX_PAGES = 50;

export interface BackfillSummary extends LeadgenSummary {
    forms: number;
    /** false = хугацаа дуусч эсвэл Graph алдаагаар зогссон; дахин ажиллуулахад үргэлжилнэ. */
    complete: boolean;
    /** Graph-ийн алдааны шалтгаан (token_invalid, permission_missing, graph_unavailable ...). */
    error?: string;
}

interface Page<T> { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }

type PageRead<T> = { ok: true; rows: T[]; after: string | null } | { ok: false; reason: string };

/** Нэг хуудас уншаад дараагийн cursor-ыг буцаана (paging.next URL-ыг хэзээ ч дагахгүй). */
async function readPage<T>(path: string, token: string, params: Record<string, string>, after: string | null, deadline: number): Promise<PageRead<T>> {
    const remaining = deadline - Date.now();
    if (remaining < 1000) return { ok: false, reason: 'time_budget' };
    const result = await pageGraphRead<Page<T>>(path, token, { ...params, limit: '100', ...(after ? { after } : {}) }, AbortSignal.timeout(Math.min(15_000, remaining)));
    if (!result.ok) return { ok: false, reason: result.reason };
    if (!Array.isArray(result.data.data)) return { ok: false, reason: 'graph_error' };
    const next = result.data.paging?.next ? result.data.paging.cursors?.after ?? null : null;
    return { ok: true, rows: result.data.data, after: next };
}

export async function backfillPageLeads(
    db: SupabaseClient,
    shop: { id: string; pageId: string; token: string },
    options: { days?: number; deadline: number; now?: number },
): Promise<BackfillSummary> {
    const summary: BackfillSummary = { ...emptySummary(), forms: 0, complete: false };
    const days = Math.min(LEADGEN_RETENTION_DAYS, Math.max(1, Math.floor(options.days ?? LEADGEN_RETENTION_DAYS)));
    const since = Math.floor(((options.now ?? Date.now()) - days * 86_400_000) / 1000);
    const context = { pageId: shop.pageId, origin: 'backfill' as const };
    const stop = (reason: string) => { summary.error = reason; return summary; };

    const forms: string[] = [];
    let after: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; ; page++) {
        if (page === MAX_PAGES) return stop('too_many_pages');
        const read: PageRead<{ id?: string }> = await readPage<{ id?: string }>(`${shop.pageId}/leadgen_forms`, shop.token, { fields: 'id' }, after, options.deadline);
        if (!read.ok) return stop(read.reason);
        forms.push(...read.rows.map(f => f.id).filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id)));
        if (!read.after || seen.has(read.after)) break;
        seen.add(read.after);
        after = read.after;
    }
    summary.forms = forms.length;

    const filtering = JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]);
    for (const formId of forms) {
        after = null;
        seen.clear();
        for (let page = 0; ; page++) {
            if (page === MAX_PAGES) return stop('too_many_pages');
            const read: PageRead<MetaLead> = await readPage<MetaLead>(`${formId}/leads`, shop.token, { fields: LEAD_FIELDS, filtering }, after, options.deadline);
            if (!read.ok) return stop(read.reason);
            const leads = read.rows.filter(lead => typeof lead?.id === 'string' && /^\d{1,30}$/.test(lead.id));
            // Аль хэдийн хадгалсан лидийг нэг асуулгаар таслана.
            const ids = leads.map(lead => leadgenRequestId(lead.id));
            const existing = new Set<string>();
            if (ids.length) {
                const { data, error } = await db.from('leads').select('client_request_id').eq('shop_id', shop.id).in('client_request_id', ids);
                if (error) return stop('db_error');
                for (const row of data ?? []) existing.add(row.client_request_id as string);
            }
            for (const lead of leads) {
                if (existing.has(leadgenRequestId(lead.id))) {
                    tally(summary, { status: 'saved', duplicate: true, leadId: null });
                    continue;
                }
                if (Date.now() >= options.deadline) return stop('time_budget');
                tally(summary, await saveMetaLead(db, shop.id, { form_id: formId, ...lead }, context));
            }
            if (!read.after || seen.has(read.after)) break;
            seen.add(read.after);
            after = read.after;
        }
    }
    summary.complete = true;
    return summary;
}
