import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';

/** `?sortBy=` — зөвхөн эдгээр багана (өмнө нь дурын нэр `.order()`-т орж 500 өгдөг байв). */
const SORTABLE = new Set([
    'contract_date', 'created_at', 'updated_at', 'total_price', 'paid_amount', 'balance',
    'overdue_days', 'customer_name', 'contract_number', 'contract_status', 'sales_manager',
    'block_name', 'unit_number', 'unit_label', 'sales_channel', 'product_type',
]);

// ============================================
// GET /api/dashboard/contracts
// Жагсаалт + статистик
// ============================================
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('contracts');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ contracts: [], stats: emptyStats() });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;
        const sp = request.nextUrl.searchParams;

        // PostgREST `.or()` filter-ийн тусгай тэмдэгтүүдийг (таслал, хаалт, %/_) хасна —
        // «Болд, 9911» гэх мэт хайлт 400→500 болдог байв.
        const search = (sp.get('search') || '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
        const status = sp.get('status'); // active | closed | cancelled | null
        const manager = sp.get('manager');
        const channel = sp.get('channel');
        const overdueOnly = sp.get('overdue') === '1';
        const dateFrom = sp.get('from'); // YYYY-MM-DD
        const dateTo = sp.get('to');     // YYYY-MM-DD
        const sortBy = SORTABLE.has(sp.get('sortBy') || '') ? (sp.get('sortBy') as string) : 'contract_date';
        const sortOrder = sp.get('sortOrder') === 'asc';

        // Шүүлттэй query-г дахин барих туслах (хуудаслалт бүрт шинээр).
        // `select` — статистикт зөвхөн 5 тоон багана татна (бүх баганыг 1600+ мөрөөр
        // хуудас бүрт татдаг байсан — review M16).
        const buildQuery = (select = '*', withCount = false) => {
            let q = supabase
                .from('property_contracts')
                .select(select, withCount ? { count: 'exact' } : undefined)
                .eq('shop_id', shopId)
                .is('deleted_at', null);

            if (status) q = q.eq('contract_status', status);
            if (manager) q = q.eq('sales_manager', manager);
            if (channel) q = q.eq('sales_channel', channel);
            if (overdueOnly) q = q.gt('overdue_days', 0);
            if (dateFrom) q = q.gte('contract_date', dateFrom);
            if (dateTo) q = q.lte('contract_date', dateTo);

            if (search) {
                // Гэрээний дугаар, нэр, утас, регистр-ээр хайх
                q = q.or(
                    `contract_number.ilike.%${search}%,` +
                    `unit_label.ilike.%${search}%,` +
                    `block_name.ilike.%${search}%,` +
                    `customer_name.ilike.%${search}%,` +
                    `customer_first_name.ilike.%${search}%,` +
                    `customer_last_name.ilike.%${search}%,` +
                    `customer_phone.ilike.%${search}%,` +
                    `customer_registration.ilike.%${search}%`
                );
            }
            return q.order(sortBy, { ascending: sortOrder, nullsFirst: false }).order('id');
        };

        // Мандала гэрээ 1600+ тул жагсаалт ба статистик 1000 мөрөөр таслагдахгүй байх ёстой.
        // (`select` нь динамик тул Supabase мөрийн төрлийг гаргаж чадахгүй.)
        const fetchAll = async (select: string) =>
            (await fetchAllRows((from, to) => buildQuery(select).range(from, to))) as unknown as Array<Record<string, unknown>>;

        // v2 хуудаслалт: ?page&pageSize өгвөл зөвхөн тухайн хуудсыг серверээс (range) буцаана;
        // статистикийг зөвхөн тоон баганаар тооцно. Өгөөгүй бол v1-тэй адил бүгдийг буцаана.
        const pageRaw = sp.get('page');
        if (pageRaw !== null) {
            const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 25));
            const page = Math.max(1, Number(pageRaw) || 1);
            const from = (page - 1) * pageSize;
            const [{ data: slice, count, error: pageErr }, statRows] = await Promise.all([
                buildQuery('*', true).range(from, from + pageSize - 1),
                fetchAll('contract_status, total_price, paid_amount, balance, overdue_days'),
            ]);
            if (pageErr) throw pageErr;
            const total = count ?? statRows.length;
            return NextResponse.json({
                contracts: slice || [],
                stats: computeStats(statRows),
                pagination: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasMore: page * pageSize < total },
            });
        }

        const contracts = await fetchAll('*');
        return NextResponse.json({ contracts, stats: computeStats(contracts) });
    } catch (error) {
        logger.error('[Contracts API] GET error:', { error });
        return NextResponse.json(
            { error: 'Гэрээ татахад алдаа гарлаа', contracts: [], stats: emptyStats() },
            { status: 500 }
        );
    }
}

// ============================================
// HELPERS
// ============================================

interface Stats {
    total: number;
    closed: number;
    active: number;
    total_sales: number;
    total_paid: number;
    total_balance: number;
    overdue_count: number;
}

function emptyStats(): Stats {
    return {
        total: 0,
        closed: 0,
        active: 0,
        total_sales: 0,
        total_paid: 0,
        total_balance: 0,
        overdue_count: 0,
    };
}

function computeStats(contracts: Array<Record<string, unknown>>): Stats {
    const stats = emptyStats();
    for (const c of contracts) {
        stats.total += 1;
        if (c.contract_status === 'closed') stats.closed += 1;
        else if (c.contract_status !== 'cancelled') stats.active += 1;

        stats.total_sales += Number(c.total_price) || 0;
        stats.total_paid += Number(c.paid_amount) || 0;
        stats.total_balance += Number(c.balance) || 0;
        if (Number(c.overdue_days) > 0) stats.overdue_count += 1;
    }
    return stats;
}
