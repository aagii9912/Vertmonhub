import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMeetingsSince } from '@/lib/dashboard/meeting-details-load';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { applyLeadScope, UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMeetingInterestSummary, type MeetingInterestStatus, type MeetingInterestSummary } from './interest-summary';

/** PostgREST `ilike` загварт хэрэглэгчийн `%`, `_`-г шууд тэмдэгт болгоно. */
const likeText = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Огнооны мужийн (УБ өдөр, хоёр захыг оруулна) устгаагүй уулзалтын сонирхлыг нэгтгэнэ. Борлуулалтын менежерт
 * `applyLeadScope` (өөрийн төсөл, өөрийн лидийн уулзалт). Уншилтын алдааг хоосон тайлан болгож нуухгүй.
 */
export async function loadMeetingInterestSummary(db: SupabaseClient, options: {
    shopId: string; from: string; to: string; status: MeetingInterestStatus; manager?: string | null; scope?: SalesProjectScope;
}): Promise<MeetingInterestSummary> {
    const { shopId, from, to, status } = options;
    const scope = options.scope ?? UNRESTRICTED_SALES_SCOPE;
    const start = ubDateStart(from).toISOString();
    const end = ubDateStart(shiftDate(to, 1)).toISOString();
    const columns = `id, scheduled_at, status, meeting_type, interests${scope.projectIds === null ? '' : ', leads!inner(project_id,sales_manager_name)'}`;
    const manager = options.manager?.trim();
    const [viewings, units, meetingsSince] = await Promise.all([
        fetchAllRows<{ id: string; scheduled_at: string; status: string; meeting_type: string | null; interests: unknown }>((first, last) => {
            let query = db.from('property_viewings').select(columns)
                .eq('shop_id', shopId).is('deleted_at', null).gte('scheduled_at', start).lt('scheduled_at', end);
            query = applyLeadScope(query, scope, 'leads.project_id', 'leads.sales_manager_name');
            if (status !== 'all') query = query.eq('status', status);
            if (manager) query = query.ilike('sales_manager_name', `%${likeText(manager)}%`);
            return query.order('scheduled_at').order('id').range(first, last) as unknown as PromiseLike<{ data: Array<{ id: string; scheduled_at: string; status: string; meeting_type: string | null; interests: unknown }> | null; error: { message: string } | null }>;
        }),
        fetchAllRows<{ block: string | null; model: string | null; rooms: number | string | null }>((first, last) => db.from('property_units')
            .select('block, model, rooms').eq('shop_id', shopId).eq('category', 'residential')
            .order('id').range(first, last)),
        loadMeetingsSince(db, shopId),
    ]);
    return buildMeetingInterestSummary({
        from, to, status, units, meetingsSince,
        meetings: viewings.map(row => ({ id: row.id, day: ubDateStr(new Date(row.scheduled_at)), status: row.status, type: row.meeting_type, interests: row.interests })),
    });
}
