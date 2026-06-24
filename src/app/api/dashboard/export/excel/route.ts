import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'properties'; // properties | leads | customers

        let workbook;
        let filename;

        if (type === 'properties') {
            // Export нэгжийн нөөц (property_units) — Мандалын 2544 нэгж (paginate)
            const CAT: Record<string, string> = { residential: 'Орон сууц', parking: 'Зогсоол', industry: 'Агуулах', commercial: 'Үйлчилгээ' };
            const STAT: Record<string, string> = { available: 'Худалдаанд', reserved: 'Хадгалсан', ordered: 'Захиалсан', sold: 'Зарагдсан', handed_over: 'Хүлээлгэсэн' };
            const PAGE = 1000;
            const units: Array<Record<string, unknown>> = [];
            for (let from = 0; ; from += PAGE) {
                const { data } = await supabase
                    .from('property_units')
                    .select('*')
                    .eq('shop_id', shopId)
                    .order('phase', { ascending: true })
                    .range(from, from + PAGE - 1);
                if (!data || data.length === 0) break;
                units.push(...data);
                if (data.length < PAGE) break;
            }

            const exportData = units.map((u) => ({
                'Код': u.code || '-',
                'Ээлж': u.phase || '-',
                'Блок': u.block || '-',
                'Давхар': u.floor || '-',
                'Ангилал': CAT[String(u.category)] || u.category || '-',
                'Айлын төрөл': u.unit_type || '-',
                'Загвар': u.model || '-',
                'Өрөө': u.rooms || '-',
                'Талбай (м²)': u.sale_area || '-',
                'Төлөв': STAT[String(u.status)] || u.status || '-',
                'Менежер': u.sales_manager || '-',
            }));

            workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Нэгжүүд');
            filename = `нэгжүүд_${new Date().toISOString().split('T')[0]}.xlsx`;

        } else if (type === 'leads') {
            // Export Leads
            const { data: leads } = await supabase
                .from('leads')
                .select('*')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false })
                .limit(500);

            const exportData = leads?.map(lead => ({
                'Нэр': lead.name || '-',
                'Утас': lead.phone || '-',
                'Имэйл': lead.email || '-',
                'Эх сурвалж': lead.source || '-',
                'Төлөв': lead.status === 'new' ? 'Шинэ' :
                    lead.status === 'contacted' ? 'Холбогдсон' :
                        lead.status === 'qualified' ? 'Баталгаажсан' :
                            lead.status === 'converted' ? 'Гэрээ' : lead.status || '-',
                'Тэмдэглэл': lead.notes || '-',
                'Огноо': new Date(lead.created_at).toLocaleDateString('mn-MN'),
            })) || [];

            workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Лийдүүд');
            filename = `лийдүүд_${new Date().toISOString().split('T')[0]}.xlsx`;

        } else if (type === 'customers') {
            // Export Customers
            const { data: customers } = await supabase
                .from('customers')
                .select('id, name, phone, email, address, notes, created_at')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false })
                .limit(500);

            const exportData = customers?.map(c => ({
                'Нэр': c.name || '-',
                'Утас': c.phone || '-',
                'Имэйл': c.email || '-',
                'Хаяг': c.address || '-',
                'Тэмдэглэл': c.notes || '-',
                'Бүртгэгдсэн': new Date(c.created_at).toLocaleDateString('mn-MN'),
            })) || [];

            workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Харилцагчид');
            filename = `харилцагчид_${new Date().toISOString().split('T')[0]}.xlsx`;

        } else if (type === 'contracts') {
            // Export Contracts (1600+ → paginate past Supabase 1000-row cap)
            const PAGE = 1000;
            const rows: Array<Record<string, unknown>> = [];
            for (let from = 0; ; from += PAGE) {
                const { data } = await supabase
                    .from('property_contracts')
                    .select('*')
                    .eq('shop_id', shopId)
                    .order('contract_date', { ascending: false, nullsFirst: false })
                    .range(from, from + PAGE - 1);
                if (!data || data.length === 0) break;
                rows.push(...data);
                if (data.length < PAGE) break;
            }

            const statusLabel = (s: string) => s === 'closed' ? 'Хаасан' : s === 'cancelled' ? 'Цуцалсан' : s === 'transferred' ? 'Тоот шилжсэн' : 'Идэвхтэй';
            const exportData = rows.map((c) => ({
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
                'Төлөв': statusLabel(String(c.contract_status)),
                'Менежер': c.sales_manager || '-',
                'Худалдан авагч': c.customer_name || '-',
                'Регистр': c.customer_registration || '-',
                'Огноо': c.contract_date ? new Date(String(c.contract_date)).toLocaleDateString('mn-MN') : '-',
            }));

            workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData), 'Гэрээнүүд');
            filename = `гэрээнүүд_${new Date().toISOString().split('T')[0]}.xlsx`;

        } else if (type === 'manager') {
            // Export Manager Performance (manager_performance view)
            const { data: managers } = await supabase
                .from('manager_performance')
                .select('*')
                .eq('shop_id', shopId)
                .order('total_sales', { ascending: false, nullsFirst: false });

            const exportData = (managers || []).map((m) => ({
                'Менежер': m.sales_manager || '-',
                'Нийт гэрээ': Number(m.contract_count) || 0,
                'Хаагдсан': Number(m.closed_count) || 0,
                'Нийт борлуулалт': Number(m.total_sales) || 0,
                'Цуглуулсан': Number(m.total_collected) || 0,
                'Үлдэгдэл': Number(m.total_outstanding) || 0,
                'Цуглуулалт %': Number(m.collection_rate_pct) || 0,
                'Харилцагч': Number(m.unique_customers) || 0,
            }));

            workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportData), 'Менежерийн гүйцэтгэл');
            filename = `менежер_гүйцэтгэл_${new Date().toISOString().split('T')[0]}.xlsx`;

        } else {
            return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
        }

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });

    } catch (error) {
        console.error('Export API error:', error);
        return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
    }
}
