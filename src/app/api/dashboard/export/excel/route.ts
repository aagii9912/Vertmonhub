import { applyLeadScope, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { buildWorkbookBuffer, type WorkbookSheetSpec } from '@/lib/utils/xlsx';
import { getManagerPerformance } from '@/lib/reports/manager-performance';
import { fetchAllRows } from '@/lib/utils/pagination';
import { leadCategoryLabel, leadDisplayName, sourceLabel, statusLabel } from '@/lib/leads/labels';
import { UNIT_STATUS_LABEL, unitCategoryLabel } from '@/lib/inventory/labels';
import { contractStatusLabel } from '@/lib/contracts/labels';
import { CONTRACT_LIST_COLUMNS, CONTRACT_LIST_COL_WIDTHS, CONTRACT_LIST_NUMFMT, contractListRow, contractUnitNumber } from '@/lib/contracts/list-format';
import { leadsReportInstants, resolveLeadsReportRange } from '@/lib/reports/leads-summary';
import { loadContractTransferSummaries } from '@/lib/services/ContractService';
import { listLeadCategories } from '@/lib/services/LeadCategoryService';

/** Export төрөл бүр өөрийн модулийн унших эрх шаардана (өмнө нь зөвхөн auth). */
const EXPORT_MODULE: Record<string, string> = {
    properties: 'properties',
    leads: 'leads',
    customers: 'customers',
    contracts: 'contracts',
    contracts_hub: 'contracts',
    manager: 'reports',
};

/** Хадгалсан дүн (numeric нь тоо эсвэл текстээр ирж болно); NULL/хоосон бол null — Excel-д хоосон нүд, 0 биш. */
function amountOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Файлын нэрийн төсөл: shop-ийн ганц төслийн нэр, эс бөгөөс shop-ийн нэр (shop = төсөл). */
async function projectFileLabel(supabase: SupabaseClient, shop: { id: string; name?: string | null }): Promise<string> {
    const { data, error } = await supabase.from('projects').select('name').eq('shop_id', shop.id).order('id').limit(2);
    if (error) throw error;
    const name = data?.length === 1 && typeof data[0].name === 'string' ? data[0].name : shop.name;
    return (name || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\s+/g, '_') || 'Төсөл';
}

const HUB_UNIT_COLLATOR = new Intl.Collator('mn', { numeric: true, sensitivity: 'base' });

/** HUB файлын дараалал: захиалга өгсөн огноо (шинэ нь эхэнд, огноогүй нь сүүлд), дараа нь байр. */
function compareHubRows(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const dateOf = (row: Record<string, unknown>) => String(row.order_date ?? row.contract_date ?? '');
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) return !da ? 1 : !db ? -1 : db.localeCompare(da);
    const unit = (row: Record<string, unknown>) => [row.product_type, row.block_name, contractUnitNumber(row), row.floor].map(v => String(v ?? '')).join('\u0000');
    return HUB_UNIT_COLLATOR.compare(unit(a), unit(b)) || String(a.id).localeCompare(String(b.id));
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'properties'; // properties | leads | customers | contracts | contracts_hub | manager

        const denied = await requireModule(EXPORT_MODULE[type] || 'reports');
        if (denied) return denied;

        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const scope = await resolveSalesProjectScope(supabase, authShop.id);
        const shopId = authShop.id;

        let sheet: WorkbookSheetSpec;
        let filename: string;

        if (type === 'properties') {
            // Export нэгжийн нөөц (property_units) — Мандалын 2544 нэгж (paginate)
            // Файлд «Худалдаанд» — импортын загвартай ижил нэр томьёо (UI-д «Чөлөөтэй»).
            const STAT: Record<string, string> = { ...UNIT_STATUS_LABEL, available: 'Худалдаанд' };
            const units = await fetchAllRows<Record<string, unknown>>((from, to) => supabase
                .from('property_units')
                .select('*')
                .eq('shop_id', shopId)
                .order('phase', { ascending: true })
                .order('id')
                .range(from, to));

            const exportData = units.map((u) => ({
                'Код': u.code || '-',
                'Ээлж': u.phase || '-',
                'Блок': u.block || '-',
                'Давхар': u.floor || '-',
                'Ангилал': u.category ? unitCategoryLabel(String(u.category)) : '-',
                'Айлын төрөл': u.unit_type || '-',
                'Загвар': u.model || '-',
                'Өрөө': u.rooms || '-',
                'Талбай (м²)': u.sale_area || '-',
                'Төлөв': STAT[String(u.status)] || u.status || '-',
                'Менежер': u.sales_manager || '-',
            }));

            sheet = { name: 'Нэгжүүд', rows: exportData };
            filename = `нэгжүүд_${ubDateStr()}.xlsx`;

        } else if (type === 'leads') {
            // Лидийн тайлангийн хуудас сонгосон хугацаагаа (from/to, УБ өдөр) дамжуулна; өгөөгүй бол бүгд.
            let period: { from: string; to: string; start: string; end: string } | null = null;
            if (searchParams.get('from') || searchParams.get('to')) {
                const resolved = resolveLeadsReportRange({ from: searchParams.get('from'), to: searchParams.get('to') });
                if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
                period = { ...resolved.range, ...leadsReportInstants(resolved.range) };
            }
            // + төслийн лидийн ангилал — архивласан нь «(архив)»-тай
            const [leads, categories] = await Promise.all([
                fetchAllRows<Record<string, any>>((from, to) => {
                    let query = supabase
                        .from('leads')
                        .select('*')
                        .eq('shop_id', shopId)
                        .is('deleted_at', null);
                    if (period) query = query.gte('created_at', period.start).lt('created_at', period.end);
                    return applyLeadScope(query
                        .order('created_at', { ascending: false })
                        .order('id').range(from, to), scope);
                }),
                listLeadCategories(supabase, shopId, { includeArchived: true }),
            ]);

            const exportData = leads?.map(lead => ({
                // Нэргүй лид шошгоор; дахин импортлоход normalizeLeadName шошгыг null болгоно.
                'Нэр': leadDisplayName(lead),
                'Утас': lead.customer_phone || '-',
                'Имэйл': lead.customer_email || '-',
                'Эх сурвалж': lead.source ? sourceLabel(lead.source) : '-',
                'Ангилал': leadCategoryLabel(categories, lead.category_id, { markArchived: true }),
                'Төлөв': statusLabel(lead.status),
                'Менежер': lead.sales_manager_name || '-',
                'Төсөл ID': lead.project_id || '-',
                'Тэмдэглэл': lead.notes || '-',
                // Сервер UTC дээр ажилладаг тул бүртгэгдсэн өдрийг Улаанбаатарын цагаар (шүүлтүүртэй ижил).
                'Огноо': ubDateStr(new Date(lead.created_at)),
            })) || [];

            sheet = { name: 'Лийдүүд', rows: exportData };
            filename = period ? `лийдүүд_${period.from}_${period.to}.xlsx` : `лийдүүд_${ubDateStr()}.xlsx`;

        } else if (type === 'customers') {
            const customers = await fetchAllRows<Record<string, any>>((from, to) => supabase
                .from('customers')
                .select('id, name, phone, email, address, notes, created_at')
                .eq('shop_id', shopId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .order('id')
                .range(from, to));

            const exportData = customers.map(c => ({
                'Нэр': c.name || '-',
                'Утас': c.phone || '-',
                'Имэйл': c.email || '-',
                'Хаяг': c.address || '-',
                'Тэмдэглэл': c.notes || '-',
                'Бүртгэгдсэн': new Date(c.created_at).toLocaleDateString('mn-MN'),
            }));

            sheet = { name: 'Харилцагчид', rows: exportData };
            filename = `харилцагчид_${ubDateStr()}.xlsx`;

        } else if (type === 'contracts') {
            // Шилжүүлсэн гэрээ: одоогийн эзэмшигч + анхны худалдан авагч, сүүлийн шилжүүлгийн огноо.
            const [rows, transfers] = await Promise.all([
                fetchAllRows<Record<string, unknown>>((from, to) => supabase
                    .from('property_contracts')
                    .select('*')
                    .eq('shop_id', shopId)
                    .is('deleted_at', null)
                    .order('contract_date', { ascending: false, nullsFirst: false })
                    .order('id')
                    .range(from, to)),
                loadContractTransferSummaries(supabase, shopId),
            ]);

            const exportData = rows.map((c) => {
                const transfer = transfers.get(String(c.id));
                return {
                    'Код': c.unit_label || '-',
                    'Ээлж/Блок': c.block_name || '-',
                    'Давхар': c.floor || '-',
                    'Айлын төрөл': c.unit_type || '-',
                    'Загвар': c.model || '-',
                    'Өрөө': c.rooms || '-',
                    'Талбай (м²)': c.contracted_area || '-',
                    // NULL (ERP-ээс ирсэн, мэдэгдэхгүй) → хоосон нүд; 0 гэж бичихгүй.
                    'М.кв үнэ': amountOrNull(c.price_per_sqm),
                    'Нийт дүн': amountOrNull(c.total_price),
                    'Төлсөн': amountOrNull(c.paid_amount),
                    'Үлдэгдэл': amountOrNull(c.balance),
                    'Төлөв': contractStatusLabel(c.contract_status as string | null),
                    'Менежер': c.sales_manager || '-',
                    'Худалдан авагч': c.customer_name || '-',
                    'Регистр': c.customer_registration || '-',
                    'Анхны худалдан авагч': transfer?.originalHolder || '-',
                    'Шилжүүлсэн огноо': transfer?.lastTransferDate || '-',
                    'Огноо': c.contract_date ? new Date(String(c.contract_date)).toLocaleDateString('mn-MN') : '-',
                };
            });

            sheet = { name: 'Гэрээнүүд', rows: exportData };
            filename = `${await projectFileLabel(supabase, authShop)}_гэрээ_дэлгэрэнгүй_${ubDateStr()}.xlsx`;

        } else if (type === 'contracts_hub') {
            // ERP-ийн HUB загвар: яг 16 багана, мөнгө/огноо/талбайн формат, тод толгой. Цуцалсан гэрээ ч орно
            // (файлтай мөр бүрээр тулгана). Дахин импортлоход өөрчлөлтгүй байх ёстой (list-format-ийн нэр томьёо).
            const [rows, label] = await Promise.all([
                fetchAllRows<Record<string, unknown>>((from, to) => supabase
                    .from('property_contracts')
                    .select('id, product_type, block_name, floor, unit_number, legacy_unit_number, unit_label, model, contracted_area, prepayment_condition, price_per_sqm, total_price, prepayment_due, overdue_amount, order_date, contract_date, contract_status, customer_name, customer_first_name, customer_last_name, payment_condition')
                    .eq('shop_id', shopId)
                    .is('deleted_at', null)
                    .order('id')
                    .range(from, to)),
                projectFileLabel(supabase, authShop),
            ]);
            sheet = {
                name: 'Гэрээ',
                columns: CONTRACT_LIST_COLUMNS,
                rows: [...rows].sort(compareHubRows).map(contractListRow),
                numFmts: CONTRACT_LIST_NUMFMT,
                colWidths: CONTRACT_LIST_COL_WIDTHS,
                headerStyle: 'bold',
            };
            filename = `${label}_гэрээ_${ubDateStr()}.xlsx`;

        } else if (type === 'manager') {
            const { managers } = await getManagerPerformance(supabase, shopId);

            const exportData = managers.map((m) => ({
                'Менежер': m.sales_manager || '-',
                'Нийт гэрээ': Number(m.contract_count) || 0,
                'Хаагдсан': Number(m.closed_count) || 0,
                'Нийт борлуулалт': Number(m.total_sales) || 0,
                'Цуглуулсан': Number(m.total_collected) || 0,
                'Үлдэгдэл': Number(m.total_outstanding) || 0,
                'Цуглуулалт %': Number(m.collection_rate_pct) || 0,
                'Харилцагч': Number(m.unique_customers) || 0,
            }));

            sheet = { name: 'Менежерийн гүйцэтгэл', rows: exportData };
            filename = `менежер_гүйцэтгэл_${ubDateStr()}.xlsx`;

        } else {
            return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
        }

        const buffer = await buildWorkbookBuffer([sheet]);

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                // filename* (RFC 5987) — хөтөч кирилл нэрийг зөв харуулна; dashboardDownload ч эндээс авна.
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            },
        });

    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Export API error:', error);
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
}
