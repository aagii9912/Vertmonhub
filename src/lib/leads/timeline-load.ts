import type { SupabaseClient } from '@supabase/supabase-js';
import type { SalesProjectScope } from '@/lib/sales/project-scope';
import type { ActivityRosterEntry } from '@/lib/sales/activity';
import { fetchAllRows } from '@/lib/utils/pagination';
import { normalizePhone, phoneIlikePattern } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/logger';
import { isAnonymousLead, leadDisplayName } from '@/lib/leads/labels';
import type { LeadActivity } from '@/lib/leads/activities';
import {
    buildLeadTimeline,
    type LeadTimeline, type TimelineContractInput, type TimelineDuplicates, type TimelineLeadInput, type TimelineProfile, type TimelineViewingInput,
} from '@/lib/leads/timeline';

/** Ижил утастай лидийн хайлтын дээд хязгаар (утасны баганад индексгүй тул хязгаартай). */
export const TIMELINE_DUPLICATE_LIMIT = 50;

export interface TimelineLeadRow extends TimelineLeadInput {
    customer_phone?: string | null;
}

/**
 * Лидийн менежерийн Time-line-ийн эх өгөгдөл. Дуудагч лидийг `applyLeadScope`-оор аль хэдийн
 * уншсан байх ёстой (хамрах хүрээгүй лидэд энд хүрэхгүй). Эх сурвалж бүр зэрэг уншигдаж,
 * унасныг `timeline.partial`-д нэрээр нь тэмдэглэнэ — хоосныг «холбоо бариагүй» гэж нуухгүй.
 *
 * • Түүх: fetchAllRows (100 мөрийн тасалдалгүй), created_by-тай.
 * • Ижил утас: тухайн shop (= төсөл)-ийн БҮХ лидээс (хамрах хүрээнээс гадуур — зориуд үл хамаарах дүрэм).
 *   Хязгаарлагдсан менежерт зөвхөн тоо ба бусад хариуцагчийн нэр (masked), байгууллагын эрхтэнд лидүүд.
 */
export async function loadLeadTimeline(
    db: SupabaseClient,
    shopId: string,
    lead: TimelineLeadRow,
    scope: SalesProjectScope,
): Promise<{ timeline: LeadTimeline; activities: LeadActivity[] | null }> {
    const partial: string[] = [];
    const settle = async <T,>(name: string, run: () => PromiseLike<T>, fallback: T): Promise<T> => {
        try {
            return await run();
        } catch (error) {
            partial.push(name);
            logger.warn('[lead-timeline] source failed', { leadId: lead.id, source: name, error });
            return fallback;
        }
    };

    const [activities, viewings, contracts, roster, duplicates] = await Promise.all([
        settle('activities', () => fetchAllRows<LeadActivity>((from, to) => db.from('lead_activities')
            .select('id, lead_id, type, content, meta, created_by, created_by_name, created_at')
            .eq('shop_id', shopId).eq('lead_id', lead.id)
            .order('created_at', { ascending: true }).order('id').range(from, to)), null as LeadActivity[] | null),
        settle('viewings', () => fetchAllRows<TimelineViewingInput>((from, to) => db.from('property_viewings')
            .select('id, scheduled_at, status, created_at, completed_at, sales_manager_name')
            .eq('shop_id', shopId).eq('lead_id', lead.id).is('deleted_at', null)
            .order('created_at', { ascending: true }).order('id').range(from, to)), [] as TimelineViewingInput[]),
        settle('contracts', () => fetchAllRows<TimelineContractInput>((from, to) => db.from('property_contracts')
            .select('id, contract_number, contract_status, contract_date, created_at, total_price, unit_number, block_name, sales_manager')
            .eq('shop_id', shopId).eq('lead_id', lead.id).is('deleted_at', null)
            .order('created_at', { ascending: true }).order('id').range(from, to)), [] as TimelineContractInput[]),
        settle('roster', async () => {
            const { data, error } = await db.from('sales_managers').select('name, user_id, is_active').eq('shop_id', shopId);
            if (error) throw error;
            return (data ?? []).map((row) => ({ name: row.name as string, user_id: (row.user_id as string | null) ?? null, is_active: !!row.is_active }));
        }, [] as ActivityRosterEntry[]),
        settle('duplicates', () => loadPhoneDuplicates(db, shopId, lead, scope), null as TimelineDuplicates | null),
    ]);

    // Нэргүй бичигдсэн үйлдлийн хэрэглэгчийн нэр (бүртгэлийн менежерт оноогдоогүй бол харагдах нэр).
    const unnamed = [...new Set((activities ?? []).filter((a) => a.created_by && !a.created_by_name?.trim()).map((a) => a.created_by as string))];
    const profiles = unnamed.length
        ? await settle('profiles', async () => {
            const { data, error } = await db.from('user_profiles').select('id, full_name').in('id', unnamed);
            if (error) throw error;
            return (data ?? []) as TimelineProfile[];
        }, [] as TimelineProfile[])
        : [];

    const timeline = buildLeadTimeline({
        lead, activities: activities ?? [], viewings, contracts, roster, profiles, duplicates, partial,
    });
    return { timeline, activities };
}

/** Ижил (нормчилсон) утастай, устгаагүй бусад лид — тухайн shop дотор. 8-аас цөөн оронтой утсанд хайхгүй. */
export async function loadPhoneDuplicates(
    db: SupabaseClient,
    shopId: string,
    lead: TimelineLeadRow,
    scope: SalesProjectScope,
): Promise<TimelineDuplicates | null> {
    const phone = normalizePhone(lead.customer_phone);
    const pattern = phone && phone.length >= 8 ? phoneIlikePattern(phone, 8) : null;
    if (!phone || !pattern) return null;
    const { data, error } = await db.from('leads')
        .select('id, customer_name, customer_phone, status, sales_manager_name, created_at')
        .eq('shop_id', shopId).is('deleted_at', null).neq('id', lead.id)
        .ilike('customer_phone', pattern)
        .order('created_at', { ascending: false })
        .limit(TIMELINE_DUPLICATE_LIMIT + 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; customer_name: string | null; customer_phone: string | null; status: string | null; sales_manager_name: string | null; created_at: string | null }>;
    // ilike нь зөвхөн нэр дэвшигч; улсын код/зайнаас үүссэн цифрийн давхцлыг бүтэн дугаараар шүүнэ.
    const matches = rows.filter((row) => normalizePhone(row.customer_phone) === phone).slice(0, TIMELINE_DUPLICATE_LIMIT);
    if (!matches.length) return null;
    const owner = lead.sales_manager_name?.trim() || null;
    const managers = [...new Set(matches.map((row) => row.sales_manager_name?.trim()).filter((name): name is string => !!name && name !== owner))]
        .sort((a, b) => a.localeCompare(b, 'mn'));
    const truncated = rows.length > TIMELINE_DUPLICATE_LIMIT;
    if (scope.projectIds !== null) return { count: matches.length, managers, masked: true, leads: [], truncated };
    return {
        count: matches.length, managers, masked: false, truncated,
        leads: matches.map((row) => ({
            id: row.id, name: leadDisplayName(row), anonymous: isAnonymousLead(row),
            status: row.status, sales_manager_name: row.sales_manager_name, created_at: row.created_at,
        })),
    };
}
