import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/marketing-roi
 * Жинхэнэ ROI: ad spend (`ad_campaigns`) ↔ lead (`facebook_campaign_id ↔ external_id`) ↔
 * орлого (`leads.conversion_value`)-ыг холбож CPL/CPA/ROAS тооцоолно.
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ roi: null });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const [{ data: leads }, { data: campaigns }] = await Promise.all([
            supabase.from('leads')
                .select('source, status, conversion_value, facebook_campaign_id')
                .eq('shop_id', shopId)
                .is('deleted_at', null),
            supabase.from('ad_campaigns')
                .select('external_id, name, spend, status')
                .eq('shop_id', shopId)
                .eq('platform', 'facebook'),
        ]);

        const leadRows = leads || [];
        const campRows = (campaigns || []).filter(c => c.external_id);

        const isWon = (s: string | null) => s === 'closed_won';
        const rev = (l: { status: string | null; conversion_value: number | null }) =>
            isWon(l.status) ? (Number(l.conversion_value) || 0) : 0;

        // ---- Кампанит ажил тус бүрийн ROI ----
        const campaignRoi = campRows.map(c => {
            const matched = leadRows.filter(l => l.facebook_campaign_id === c.external_id);
            const leadsCount = matched.length;
            const won = matched.filter(l => isWon(l.status)).length;
            const revenue = matched.reduce((s, l) => s + rev(l), 0);
            const spend = Number(c.spend) || 0;
            return {
                external_id: c.external_id,
                name: c.name,
                status: c.status,
                spend,
                leads: leadsCount,
                won,
                revenue,
                cpl: leadsCount > 0 ? Math.round(spend / leadsCount) : null,
                cpa: won > 0 ? Math.round(spend / won) : null,
                roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
                profit: revenue - spend,
            };
        }).sort((a, b) => b.spend - a.spend);

        // ---- Эх үүсвэр тус бүрийн ROI ----
        const totalFbSpend = campRows.reduce((s, c) => s + (Number(c.spend) || 0), 0);
        const bySrc = new Map<string, { leads: number; won: number; revenue: number }>();
        for (const l of leadRows) {
            const src = l.source || 'other';
            const row = bySrc.get(src) || { leads: 0, won: 0, revenue: 0 };
            row.leads++;
            if (isWon(l.status)) row.won++;
            row.revenue += rev(l);
            bySrc.set(src, row);
        }
        const sourceRoi = Array.from(bySrc.entries()).map(([source, r]) => {
            // Зарын зардал зөвхөн facebook эх үүсвэрт хамаарна
            const spend = (source === 'facebook' || source === 'facebook_ads') ? totalFbSpend : 0;
            return {
                source,
                spend,
                leads: r.leads,
                won: r.won,
                revenue: r.revenue,
                cpl: spend > 0 && r.leads > 0 ? Math.round(spend / r.leads) : null,
                cpa: spend > 0 && r.won > 0 ? Math.round(spend / r.won) : null,
                roas: spend > 0 ? Math.round((r.revenue / spend) * 100) / 100 : null,
            };
        }).sort((a, b) => b.leads - a.leads);

        // ---- Нийт ----
        const totalLeads = leadRows.length;
        const totalWon = leadRows.filter(l => isWon(l.status)).length;
        const totalRevenue = leadRows.reduce((s, l) => s + rev(l), 0);
        const totals = {
            spend: totalFbSpend,
            leads: totalLeads,
            won: totalWon,
            revenue: totalRevenue,
            cpl: totalFbSpend > 0 && totalLeads > 0 ? Math.round(totalFbSpend / totalLeads) : null,
            cpa: totalFbSpend > 0 && totalWon > 0 ? Math.round(totalFbSpend / totalWon) : null,
            roas: totalFbSpend > 0 ? Math.round((totalRevenue / totalFbSpend) * 100) / 100 : null,
            profit: totalRevenue - totalFbSpend,
        };

        return NextResponse.json({ roi: { campaigns: campaignRoi, sources: sourceRoi, totals } });
    } catch (error) {
        logger.error('[Marketing ROI] error', { error });
        return NextResponse.json({ error: 'ROI татахад алдаа гарлаа' }, { status: 500 });
    }
}
