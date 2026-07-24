import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { sendDirectorDigestEmail } from '@/lib/email/email';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET/POST /api/cron/director-digest
// Захирлын өдрийн автомат тайлан (Resend имэйл).
// Хүлээн авагч: process.env.DIGEST_EMAIL (тохируулаагүй бол зөвхөн тооцоог буцаана).
// ============================================
async function handler(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = supabaseAdmin();
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recipient = process.env.DIGEST_EMAIL || '';

        const { data: shops } = await supabase.from('shops').select('id, name');
        const results: Array<Record<string, unknown>> = [];

        for (const shop of shops || []) {
            // Менежерийн нэгтгэл (борлуулалт/цуглуулалт + топ)
            const { data: managers } = await supabase
                .from('manager_performance')
                .select('sales_manager, contract_count, total_sales, total_collected')
                .eq('shop_id', shop.id)
                .order('total_sales', { ascending: false, nullsFirst: false });

            const totalSales = (managers || []).reduce((s, m) => s + (Number(m.total_sales) || 0), 0);
            const collected = (managers || []).reduce((s, m) => s + (Number(m.total_collected) || 0), 0);
            const topManagers = (managers || []).slice(0, 5).map((m) => ({
                name: m.sales_manager || '—',
                contracts: Number(m.contract_count) || 0,
                sales: Number(m.total_sales) || 0,
            }));

            const [{ count: newLeads }, { count: newContracts }, { count: activeContracts }, { count: overdueCount }] = await Promise.all([
                supabase.from('leads').select('*', { count: 'exact', head: true }).eq('shop_id', shop.id).gte('created_at', since),
                supabase.from('property_contracts').select('*', { count: 'exact', head: true }).eq('shop_id', shop.id).is('deleted_at', null).gte('order_date', since.slice(0, 10)),
                supabase.from('property_contracts').select('*', { count: 'exact', head: true }).eq('shop_id', shop.id).is('deleted_at', null).eq('contract_status', 'active'),
                supabase.from('property_contracts').select('*', { count: 'exact', head: true }).eq('shop_id', shop.id).is('deleted_at', null).gt('overdue_days', 0),
            ]);

            const digest = {
                shopName: shop.name || 'Vertmon',
                date: new Date(since).toISOString().slice(0, 10),
                newLeads: newLeads || 0,
                newContracts: newContracts || 0,
                activeContracts: activeContracts || 0,
                totalSales,
                collected,
                overdueCount: overdueCount || 0,
                topManagers,
            };

            let emailed = false;
            if (recipient) {
                emailed = await sendDirectorDigestEmail(recipient, digest);
            }
            results.push({ shop: shop.name, emailed, ...digest });
        }

        return NextResponse.json({ success: true, recipientConfigured: !!recipient, shops: results.length, results });
    } catch (error) {
        logger.error('[DirectorDigest] error:', { error });
        return NextResponse.json({ error: 'Тайлан үүсгэхэд алдаа гарлаа' }, { status: 500 });
    }
}

export async function GET(request: Request) { return handler(request); }
export async function POST(request: Request) { return handler(request); }
