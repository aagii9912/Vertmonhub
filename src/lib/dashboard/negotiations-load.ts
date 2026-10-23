import type { SupabaseClient } from '@supabase/supabase-js';
import { NOT_CANCELLED_CONTRACT } from '@/lib/contracts/live';
import { loadActivePricing } from '@/lib/sales/pricing-store';
import { applyLeadScope, type SalesProjectScope } from '@/lib/sales/project-scope';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { loadViewingReferrals } from './meeting-details-load';
import { buildNegotiations, latestInterestViewings, NEGOTIATION_STATUSES, type NegotiationsInput, type NegotiationsReport } from './negotiations';

const ID_CHUNK = 100;
const chunks = <T,>(values: readonly T[]): T[][] => Array.from({ length: Math.ceil(values.length / ID_CHUNK) }, (_, index) => values.slice(index * ID_CHUNK, (index + 1) * ID_CHUNK));

/**
 * «Ярилцаж буй гэрээ»-ний эх өгөгдөл (W13): хүрээний (`applyLeadScope`) хэлэлцээрийн лид, тэдгээрийн амьд
 * гэрээ, уулзалт (сонирхол), байрны өрөө, өнөөдрийн идэвхтэй үнийн тохиргоо, уулзалтын сэжим.
 * Уншилтын алдааг хоосон тайлан болгож нуухгүй; үнийн тохиргооны алдаа `PricingSelectionError` (503).
 */
export async function loadNegotiations(db: SupabaseClient, options: { shopId: string; scope: SalesProjectScope; today?: string }): Promise<NegotiationsReport> {
    const { shopId, scope } = options;
    const today = options.today ?? ubDateStr();
    const leads = await fetchAllRows<NegotiationsInput['leads'][number]>((from, to) => applyLeadScope(db.from('leads')
        .select('id, status, sales_manager_name')
        .eq('shop_id', shopId).is('deleted_at', null).in('status', [...NEGOTIATION_STATUSES]), scope)
        .order('id').range(from, to));
    const leadIds = leads.map(lead => lead.id);

    const [contracts, viewings, pricing] = await Promise.all([
        Promise.all(chunks(leadIds).map(ids => fetchAllRows<{ lead_id: string | null }>((from, to) => db.from('property_contracts')
            .select('lead_id').eq('shop_id', shopId).is('deleted_at', null).or(NOT_CANCELLED_CONTRACT).in('lead_id', ids)
            .order('id').range(from, to)))).then(rows => rows.flat()),
        Promise.all(chunks(leadIds).map(ids => fetchAllRows<NegotiationsInput['viewings'][number]>((from, to) => db.from('property_viewings')
            .select('id, lead_id, scheduled_at, sales_manager_name, interests').eq('shop_id', shopId).is('deleted_at', null).in('lead_id', ids)
            .order('scheduled_at', { ascending: false }).order('id').range(from, to)))).then(rows => rows.flat()),
        leadIds.length ? loadActivePricing(db, shopId) : Promise.resolve(null),
    ]);

    // Өрөө: сонгосон байр эсвэл блок + загвар (блокийн бичлэгийг `pricingKey`-ээр тааруулна) — сонирхолтой уулзалт байвал л.
    const units = viewings.some(viewing => Array.isArray(viewing.interests) && viewing.interests.length)
        ? await fetchAllRows<NegotiationsInput['units'][number]>((from, to) => db.from('property_units')
            .select('id, block, model, rooms').eq('shop_id', shopId).eq('category', 'residential').not('rooms', 'is', null)
            .order('id').range(from, to))
        : [];

    const liveContractLeadIds = new Set(contracts.map(row => row.lead_id).filter((id): id is string => !!id));
    // Сэжим: гэрээгүй лидийн сонирхол авсан уулзалтынх.
    const viewingIds = [...latestInterestViewings(viewings)].filter(([leadId]) => !liveContractLeadIds.has(leadId)).map(([, entry]) => entry.viewing.id);
    const referrals = leadIds.length ? await loadViewingReferrals(db, shopId, viewingIds) : { available: true, byViewing: new Map<string, string | null>() };
    return buildNegotiations({ today, leads, viewings, units, pricing, liveContractLeadIds, referrals });
}
