import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAuthorizedCron } from '@/lib/auth/cron';
import { sendDirectorDigestEmail } from '@/lib/email/email';
import { logger } from '@/lib/utils/logger';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { isOverdueContract, loadLatestContractListImport, NOT_CANCELLED_CONTRACT } from '@/lib/contracts/live';
import { summarizeContracts, type ContractSummaryRow } from '@/lib/contracts/summary';

type DigestContractRow = ContractSummaryRow & { contract_date: string | null };

// ============================================
// GET/POST /api/cron/director-digest
// Захирлын өдрийн автомат тайлан (Resend имэйл).
// Хүлээн авагч: process.env.DIGEST_EMAIL (тохируулаагүй бол зөвхөн тооцоог буцаана).
// Гэрээний тоо, дүн: устгасан, цуцалсан гэрээ орохгүй. Төлсөн дүн NULL (ERP) бол 0 гэж нэмэхгүй.
// Хоцролт: HUB файлын Төлбөр хоцролт ₮ (сүүлийн файлын огноотой) мэдэгдэж байвал түүгээр, үгүй бол хуваарийн хоногоор.
// ============================================
async function handler(request: Request) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = supabaseAdmin();
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const sinceDate = ubDateStr(new Date(since));
        const recipient = process.env.DIGEST_EMAIL || '';

        const { data: shops } = await supabase.from('shops').select('id, name');
        const results: Array<Record<string, unknown>> = [];

        for (const shop of shops || []) {
            try {
                // Менежерийн топ (manager_performance нь устгасан, цуцалсан гэрээг хасдаг) + төслийн бүх амьд гэрээ.
                const [managersRes, rosterRes, latestImport, contracts, newLeadsRes] = await Promise.all([
                    supabase.from('manager_performance')
                        .select('sales_manager, contract_count, total_sales, total_collected')
                        .eq('shop_id', shop.id)
                        .order('total_sales', { ascending: false, nullsFirst: false }),
                    supabase.from('sales_managers').select('name, is_active').eq('shop_id', shop.id),
                    loadLatestContractListImport(supabase, shop.id),
                    fetchAllRows<DigestContractRow>((from, to) => supabase.from('property_contracts')
                        .select('contract_status, contract_date, total_price, paid_amount, balance, overdue_amount, overdue_as_of, overdue_days')
                        .eq('shop_id', shop.id)
                        .is('deleted_at', null)
                        .or(NOT_CANCELLED_CONTRACT)
                        .order('id')
                        .range(from, to)),
                    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('shop_id', shop.id).is('deleted_at', null).gte('created_at', since),
                ]);
                const failed = managersRes.error || rosterRes.error || newLeadsRes.error;
                if (failed) throw new Error(failed.message);

                const managers = managersRes.data || [];
                const activeNames = new Set((rosterRes.data || []).filter((r) => r.is_active).map((r) => r.name));
                const topManagers = managers.filter((m) => activeNames.has(m.sales_manager)).slice(0, 5).map((m) => ({
                    name: m.sales_manager || '—',
                    contracts: Number(m.contract_count) || 0,
                    sales: Number(m.total_sales) || 0,
                }));

                const latestImportDate = latestImport?.report_date ?? null;
                const summary = summarizeContracts(contracts, { latestImportDate });
                // Гэрээний огноо (UI, AI, HUB импорт бүгд бөглөдөг) — өчигдрөөс хойш. Огноогүй амьд гэрээ байвал
                // тоо доод хэмжээ («N+»/«—», lib/dashboard/contract-dates.ts), 0 биш.
                const newContracts = contracts.filter((c) => !!c.contract_date && c.contract_date >= sinceDate).length;
                const undatedContracts = contracts.filter((c) => !c.contract_date).length;
                const collectedKnown = summary.unknown_paid < contracts.length;

                const digest = {
                    shopName: shop.name || 'Vertmon',
                    date: sinceDate,
                    newLeads: newLeadsRes.count || 0,
                    newContracts,
                    undatedContracts,
                    activeContracts: summary.active,
                    totalSales: summary.total_sales,
                    // Төлсөн дүн бүгд тодорхойгүй бол null («—»), зарим нь бол мэдэгдэж буй нийлбэр («+»).
                    collected: contracts.length === 0 || collectedKnown ? summary.total_paid : null,
                    collectedPartial: summary.unknown_paid > 0 && collectedKnown,
                    overdueCount: contracts.filter((c) => isOverdueContract(c, latestImportDate)).length,
                    overdueAmount: summary.overdue_amount,
                    overdueAsOf: summary.overdue_as_of,
                    topManagers,
                };

                let emailed = false;
                if (recipient) {
                    emailed = await sendDirectorDigestEmail(recipient, digest);
                }
                results.push({ shop: shop.name, emailed, ...digest });
            } catch (error) {
                // Нэг төслийн алдаа бусдыг зогсоохгүй; алдаатай төслийн тоог 0 гэж илгээхгүй.
                logger.error('[DirectorDigest] shop error:', { shopId: shop.id, error });
                results.push({ shop: shop.name, error: true });
            }
        }

        return NextResponse.json({ success: true, recipientConfigured: !!recipient, shops: results.length, results });
    } catch (error) {
        logger.error('[DirectorDigest] error:', { error });
        return NextResponse.json({ error: 'Тайлан үүсгэхэд алдаа гарлаа' }, { status: 500 });
    }
}

export async function GET(request: Request) { return handler(request); }
export async function POST(request: Request) { return handler(request); }
