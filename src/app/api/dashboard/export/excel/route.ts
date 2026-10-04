import { applyLeadScope, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { buildWorkbookBuffer, type WorkbookSheetSpec } from '@/lib/utils/xlsx';
import { getManagerPerformance } from '@/lib/reports/manager-performance';
import { fetchAllRows } from '@/lib/utils/pagination';
import { leadDisplayName, sourceLabel, statusLabel } from '@/lib/leads/labels';
import { UNIT_STATUS_LABEL, unitCategoryLabel } from '@/lib/inventory/labels';
import { contractStatusLabel } from '@/lib/contracts/labels';
import { loadContractTransferSummaries } from '@/lib/services/ContractService';

/** Export төрөл бүр өөрийн модулийн унших эрх шаардана (өмнө нь зөвхөн auth). */
const EXPORT_MODULE: Record<string, string> = {
    properties: 'properties',
    leads: 'leads',
    customers: 'customers',
    contracts: 'contracts',
    manager: 'reports',
};

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'properties'; // properties | leads | customers | contracts | manager

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
            // Export Leads
            const leads = await fetchAllRows<Record<string, any>>((from, to) => applyLeadScope(supabase
                .from('leads')
                .select('*')
                .eq('shop_id', shopId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .order('id').range(from, to), scope));

            const exportData = leads?.map(lead => ({
                // Нэргүй лид шошгоор; дахин импортлоход normalizeLeadName шошгыг null болгоно.
                'Нэр': leadDisplayName(lead),
                'Утас': lead.customer_phone || '-',
                'Имэйл': lead.customer_email || '-',
                'Эх сурвалж': lead.source ? sourceLabel(lead.source) : '-',
                'Төлөв': statusLabel(lead.status),
                'Менежер': lead.sales_manager_name || '-',
                'Төсөл ID': lead.project_id || '-',
                'Тэмдэглэл': lead.notes || '-',
                'Огноо': new Date(lead.created_at).toLocaleDateString('mn-MN'),
            })) || [];

            sheet = { name: 'Лийдүүд', rows: exportData };
            filename = `лийдүүд_${ubDateStr()}.xlsx`;

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
                    'М.кв үнэ': Number(c.price_per_sqm) || 0,
                    'Нийт дүн': Number(c.total_price) || 0,
                    'Төлсөн': Number(c.paid_amount) || 0,
                    'Үлдэгдэл': Number(c.balance) || 0,
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
            filename = `гэрээнүүд_${ubDateStr()}.xlsx`;

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
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });

    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error('Export API error:', error);
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
}
