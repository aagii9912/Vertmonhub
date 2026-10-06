import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLeadScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildPipelineSummary, type PipelineLead, type PipelineSummary } from './pipeline';

/**
 * Pipeline-ийн тоолол БҮХ лидээр (1,000-аас олон байсан ч) хэрэглэгчийн хүрээгээр (`applyLeadScope`).
 * `category`: undefined = бүх лид, null = ангилалгүй, uuid = тэр ангилал (жагсаалтын `category`-тэй ижил).
 * Эрхийг дуудагч (route) шалгана; уншилт унавал алдаа шиднэ — дутуу тоо буцаахгүй.
 */
export async function loadPipelineSummary(
    db: SupabaseClient,
    options: { shopId: string; scope: SalesProjectScope; category?: string | null; now?: Date },
): Promise<PipelineSummary> {
    const leads = await fetchAllRows<PipelineLead>((from, to) => {
        let query = applyLeadScope(db.from('leads')
            .select('status, budget_min, budget_max, next_followup_at, stage_changed_at, created_at')
            .eq('shop_id', options.shopId).is('deleted_at', null)
            .order('id').range(from, to), options.scope);
        if (options.category === null) query = query.is('category_id', null);
        else if (options.category) query = query.eq('category_id', options.category);
        return query;
    });
    return buildPipelineSummary(leads, (options.now ?? new Date()).getTime());
}
