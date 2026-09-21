import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/utils/pagination';
import { marketingChannel, type MarketingActivity, type MarketingSpend } from './performance';

export interface MetaSpendRow {
    id: string; account_id: string; campaign_id: string; campaign_name: string; spent_at: string;
    native_amount: number | string; currency: string; timezone: string; amount_mnt: number | string | null; mnt_per_unit: number | string | null;
}
export function mergeMarketingSpend(manual: MarketingSpend[], daily: MetaSpendRow[], coverage: { spent_at: string }[], activities: Pick<MarketingActivity, 'id' | 'project_id' | 'marketing_owner_name' | 'external_campaign_id'>[]) {
    const covered = new Set(coverage.map(c => c.spent_at));
    const byCampaign = new Map(activities.filter(a => a.external_campaign_id).map(a => [a.external_campaign_id, a]));
    const manualRows = manual.map(s => ({ ...s, source: 'manual' as const,
        exclusion: marketingChannel(s.channel) === 'meta_ads' && covered.has(s.spent_at) ? 'manual_overlap' as const : null }));
    const autoRows: MarketingSpend[] = daily.map(s => {
        const activity = byCampaign.get(s.campaign_id);
        return { id: `meta:${s.id}`, spent_at: s.spent_at, amount: s.amount_mnt ?? 0, channel: 'meta_ads',
            project_id: activity?.project_id ?? null, marketing_owner_name: activity?.marketing_owner_name ?? null,
            marketing_campaign_id: activity?.id ?? null, source: 'meta', exclusion: s.amount_mnt === null ? 'missing_fx' : null,
            native_amount: Number(s.native_amount), currency: s.currency,
            note: `${s.campaign_name} · ${s.campaign_id} · ${s.account_id} · ${s.timezone} · 1 ${s.currency} = ${s.mnt_per_unit ?? '—'}₮`,
        };
    });
    return [...manualRows, ...autoRows].sort((a, b) => b.spent_at.localeCompare(a.spent_at) || a.id.localeCompare(b.id));
}
export async function loadMarketingSpend(db: SupabaseClient, shopId: string, fromDate: string, toDate: string) {
    const [manual, daily, coverage, activities] = await Promise.all([
        fetchAllRows<MarketingSpend>((from, to) => db.from('marketing_spend_entries').select('id,spent_at,amount,channel,project_id,marketing_owner_name,marketing_campaign_id,note').eq('shop_id', shopId).is('deleted_at', null).gte('spent_at', fromDate).lte('spent_at', toDate).order('id').range(from, to)),
        fetchAllRows<MetaSpendRow>((from, to) => db.from('meta_daily_spend').select('id,account_id,campaign_id,campaign_name,spent_at,native_amount,currency,timezone,amount_mnt,mnt_per_unit').eq('shop_id', shopId).gte('spent_at', fromDate).lte('spent_at', toDate).order('id').range(from, to)),
        fetchAllRows<{ spent_at: string }>((from, to) => db.from('meta_spend_coverage').select('spent_at').eq('shop_id', shopId).gte('spent_at', fromDate).lte('spent_at', toDate).order('account_id').order('spent_at').range(from, to)),
        fetchAllRows<Pick<MarketingActivity, 'id' | 'project_id' | 'marketing_owner_name' | 'external_campaign_id'>>((from, to) => db.from('marketing_campaigns').select('id,project_id,marketing_owner_name,external_campaign_id').eq('shop_id', shopId).order('id').range(from, to)),
    ]);
    return mergeMarketingSpend(manual, daily, coverage, activities);
}
