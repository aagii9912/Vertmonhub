import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLeadScope, applyProjectScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import {
    buildLeadsSummary, leadsReportInstants,
    type LeadsReportRange, type LeadsSummaryLead, type LeadsSummaryProject, type LeadsSummaryReport,
} from './leads-summary';

/**
 * Хугацаанд бүртгэгдсэн БҮХ лидийг (1,000-аас олон байсан ч) хэрэглэгчийн төслийн хүрээгээр
 * уншиж нэгтгэнэ. Эрхийг дуудагч (route) шалгана. Аль нэг уншилт унавал алдаа шиднэ —
 * хоосон, дутуу тайлан буцаахгүй.
 */
export async function loadLeadsSummary(
    db: SupabaseClient, options: { shopId: string; scope: SalesProjectScope; range: LeadsReportRange },
): Promise<LeadsSummaryReport> {
    const { start, end } = leadsReportInstants(options.range);
    const [projects, leads] = await Promise.all([
        fetchAllRows<LeadsSummaryProject>((from, to) => applyProjectScope(db.from('projects')
            .select('id, name').eq('shop_id', options.shopId).order('id').range(from, to), options.scope, 'id')),
        fetchAllRows<LeadsSummaryLead>((from, to) => applyLeadScope(db.from('leads')
            .select('status, source, project_id, sales_manager_name, category_id')
            .eq('shop_id', options.shopId).is('deleted_at', null)
            .gte('created_at', start).lt('created_at', end)
            .order('id').range(from, to), options.scope)),
    ]);
    return { range: options.range, ...buildLeadsSummary(leads, projects) };
}
