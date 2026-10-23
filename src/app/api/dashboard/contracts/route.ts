import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/utils/pagination';
import { contractIdsByPreviousHolder } from '@/lib/services/ContractService';
import { summarizeContracts, type ContractSummaryRow } from '@/lib/contracts/summary';
import { loadLatestContractListImport } from '@/lib/contracts/live';
import { loadReferralNames } from '@/lib/sales/referral-sources-store';

/** `?sortBy=` — зөвхөн эдгээр багана (өмнө нь дурын нэр `.order()`-т орж 500 өгдөг байв). */
const SORTABLE = new Set([
    'contract_date', 'created_at', 'updated_at', 'total_price', 'paid_amount', 'balance',
    'overdue_days', 'customer_name', 'contract_number', 'contract_status', 'sales_manager',
    'block_name', 'unit_number', 'unit_label', 'sales_channel', 'product_type',
    // HUB загварын баганууд
    'order_date', 'contracted_area', 'price_per_sqm', 'prepayment_due', 'overdue_amount', 'floor', 'model',
    'prepayment_condition', 'payment_condition', 'customer_first_name', 'customer_last_name',
]);

/** Статистик, хөлийн нийлбэр, шүүлтийн сонголтод хэрэгтэй багана (бүх баганыг 1600+ мөрөөр татахгүй — review M16). */
const SUMMARY_COLUMNS = 'id, contract_status, total_price, prepayment_due, paid_amount, balance, contracted_area, overdue_amount, overdue_as_of, overdue_days, product_type, block_name, payment_condition';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILTER_TEXT_MAX = 100;

type Row = Record<string, unknown>;

const filterText = (value: string | null) => {
    const text = value?.trim();
    return text && text !== 'all' && text.length <= FILTER_TEXT_MAX ? text : null;
};

/**
 * «Сэжим (хаанаас ирсэн)»-ийн нэрийг мөр бүрт `referral_source_name` болгож нэмнэ (нэг нэмэлт уншилт; хүснэгт
 * байхгүй эсвэл сонгоогүй бол null). Илтгэл, экспорт id биш нэрийг хэвлэнэ.
 */
async function withReferralNames(supabase: ReturnType<typeof supabaseAdmin>, shopId: string, rows: Row[]): Promise<Row[]> {
    const names = await loadReferralNames(supabase, shopId, rows.map(row => row.referral_source_id as string | null | undefined));
    return rows.map(row => ({ ...row, referral_source_name: typeof row.referral_source_id === 'string' ? names.get(row.referral_source_id) ?? null : null }));
}

/** Шүүлтийн сонголт: төслийн гэрээнд байгаа блок, захиалгын нөхцөл, төрөл (эрэмбэлсэн). */
function contractFacets(rows: Row[]) {
    const distinct = (key: string) => [...new Set(rows.map(row => typeof row[key] === 'string' ? (row[key] as string).trim() : '').filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
    return { blocks: distinct('block_name'), paymentConditions: distinct('payment_condition'), productTypes: distinct('product_type') };
}

// ============================================
// GET /api/dashboard/contracts
// Жагсаалт + статистик (төслийн бүх гэрээ) + хөлийн нийлбэр (шүүсэн гэрээ)
// ============================================
export const GET = withRoute({ module: 'contracts', error: 'Гэрээ татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const supabase = supabaseAdmin();
    const shopId = shop.id;
    const sp = request.nextUrl.searchParams;

    // PostgREST `.or()` filter-ийн тусгай тэмдэгтүүдийг (таслал, хаалт, %/_) хасна —
    // «Болд, 9911» гэх мэт хайлт 400→500 болдог байв.
    const search = (sp.get('search') || '').trim().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
    const status = filterText(sp.get('status')); // active | closed | cancelled | transferred
    const manager = filterText(sp.get('manager'));
    const channel = filterText(sp.get('channel'));
    const productType = filterText(sp.get('productType'));
    const block = filterText(sp.get('block'));
    const paymentCondition = filterText(sp.get('paymentCondition'));
    const overdueOnly = sp.get('overdue') === '1';
    const undatedOnly = sp.get('undated') === '1';
    const notInLatest = sp.get('notInLatest') === '1';
    const dateFrom = DATE_RE.test(sp.get('from') || '') ? sp.get('from') : null; // «Захиалга өгсөн огноо» = contract_date
    const dateTo = DATE_RE.test(sp.get('to') || '') ? sp.get('to') : null;
    const sortBy = SORTABLE.has(sp.get('sortBy') || '') ? (sp.get('sortBy') as string) : 'contract_date';
    const sortOrder = sp.get('sortOrder') === 'asc';
    // ⌘K зэрэг хайлт статистик уншихгүй (stats=0).
    const withStats = sp.get('stats') !== '0';

    // Шилжүүлсэн гэрээ өмнөх эзэмшигчийн нэр, утас, регистрээр ч олдоно.
    const [previousHolderIds, latestImport] = await Promise.all([
        search ? contractIdsByPreviousHolder(supabase, shopId, search) : Promise.resolve([] as string[]),
        withStats || notInLatest ? loadLatestContractListImport(supabase, shopId) : Promise.resolve(null),
    ]);
    const latestDate = latestImport?.report_date ?? null;
    const filtered = !!(search || status || manager || channel || productType || block || paymentCondition || overdueOnly || undatedOnly
        || (notInLatest && latestDate) || dateFrom || dateTo);

    const baseQuery = (select: string, withCount = false) => supabase
        .from('property_contracts')
        .select(select, withCount ? { count: 'exact' } : undefined)
        .eq('shop_id', shopId)
        .is('deleted_at', null);

    // Шүүлттэй query-г дахин барих туслах (хуудаслалт бүрт шинээр).
    const buildQuery = (select = '*', withCount = false) => {
        let q = baseQuery(select, withCount);
        if (status) q = q.eq('contract_status', status);
        if (manager) q = q.eq('sales_manager', manager);
        if (channel) q = q.eq('sales_channel', channel);
        if (productType) q = q.eq('product_type', productType);
        if (block) q = q.eq('block_name', block);
        if (paymentCondition) q = q.eq('payment_condition', paymentCondition);
        // «Хоцролттой»: файлын ₮ дүн эсвэл системийн хоног (cron) — аль нэг нь.
        if (overdueOnly) q = q.or('overdue_amount.gt.0,overdue_days.gt.0');
        // «Огноогүй»: сарын гүйцэтгэлд ороогүй амьд гэрээ (цуцалсныг хассан).
        if (undatedOnly) q = q.is('contract_date', null).or('contract_status.is.null,contract_status.neq.cancelled');
        // «Сүүлийн файлд байхгүй»: хоцролтын огноо нь сүүлийн HUB файлынх биш (импорт хийсэн төсөлд л).
        if (notInLatest && latestDate) q = q.or(`overdue_as_of.is.null,overdue_as_of.neq.${latestDate}`);
        if (dateFrom) q = q.gte('contract_date', dateFrom);
        if (dateTo) q = q.lte('contract_date', dateTo);

        if (search) {
            // Гэрээний дугаар, тоот, нэр, утас, регистр-ээр хайх
            q = q.or(
                `contract_number.ilike.%${search}%,` +
                `unit_label.ilike.%${search}%,` +
                `block_name.ilike.%${search}%,` +
                `legacy_unit_number.ilike.%${search}%,` +
                `unit_number.ilike.%${search}%,` +
                `customer_name.ilike.%${search}%,` +
                `customer_first_name.ilike.%${search}%,` +
                `customer_last_name.ilike.%${search}%,` +
                `customer_phone.ilike.%${search}%,` +
                `customer_registration.ilike.%${search}%` +
                (previousHolderIds.length ? `,id.in.(${previousHolderIds.join(',')})` : '')
            );
        }
        return q.order(sortBy, { ascending: sortOrder, nullsFirst: false }).order('id');
    };

    // Мандала гэрээ 1600+ тул жагсаалт ба статистик 1000 мөрөөр таслагдахгүй байх ёстой.
    // (`select` нь динамик тул Supabase мөрийн төрлийг гаргаж чадахгүй.)
    const fetchFiltered = async (select: string) =>
        (await fetchAllRows((from, to) => buildQuery(select).range(from, to))) as unknown as Row[];
    const fetchProject = async () =>
        (await fetchAllRows((from, to) => baseQuery(SUMMARY_COLUMNS).order('id').range(from, to))) as unknown as Row[];

    /** Төслийн нийт статистик (шүүлтгүй — HUB файлын нийлбэртэй тулгана) ба шүүсэн мөрийн хөл. */
    const loadSummaries = async () => {
        if (!withStats) return null;
        const [projectRows, filteredRows] = await Promise.all([fetchProject(), filtered ? fetchFiltered(SUMMARY_COLUMNS) : Promise.resolve(null)]);
        const options = { latestImportDate: latestDate };
        return {
            stats: summarizeContracts(projectRows as ContractSummaryRow[], options),
            footer: summarizeContracts((filteredRows ?? projectRows) as ContractSummaryRow[], options),
            facets: contractFacets(projectRows),
            latestImport: latestImport && {
                report_date: latestImport.report_date, file_name: latestImport.file_name, row_count: latestImport.row_count,
                // Сүүлийн файлд байгаагүй гэрээ (overdue_as_of ≠ файлын огноо).
                not_in_file: projectRows.filter(row => row.overdue_as_of !== latestImport.report_date).length },
        };
    };

    // v2 хуудаслалт: ?page&pageSize өгвөл зөвхөн тухайн хуудсыг серверээс (range) буцаана.
    // Өгөөгүй бол v1-тэй адил бүгдийг буцаана (PDF үүсгэгчийн хайлт).
    const pageRaw = sp.get('page');
    if (pageRaw !== null) {
        const pageSize = Math.min(200, Math.max(1, Number(sp.get('pageSize')) || 25));
        const page = Math.max(1, Number(pageRaw) || 1);
        const from = (page - 1) * pageSize;
        const [{ data: slice, count, error: pageErr }, summaries] = await Promise.all([
            buildQuery('*', true).range(from, from + pageSize - 1),
            loadSummaries(),
        ]);
        if (pageErr) throw pageErr;
        const total = count ?? 0;
        return NextResponse.json({
            contracts: await withReferralNames(supabase, shopId, (slice || []) as unknown as Row[]),
            ...summaries,
            latestImport: summaries?.latestImport ?? latestImport,
            pagination: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasMore: page * pageSize < total },
        });
    }

    const contracts = await withReferralNames(supabase, shopId, await fetchFiltered('*'));
    return NextResponse.json({
        contracts,
        ...(withStats ? { stats: summarizeContracts(contracts as ContractSummaryRow[], { latestImportDate: latestDate }) } : {}),
        latestImport,
    });
});
