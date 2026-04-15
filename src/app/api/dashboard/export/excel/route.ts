import { NextRequest, NextResponse } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
    try {
        const authShop = await getClerkUserShop();

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
            // Export Properties
            const { data: properties } = await supabase
                .from('properties')
                .select('*')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false })
                .limit(500);

            const exportData = properties?.map(p => ({
                'Нэр': p.title || p.name || '-',
                'Төрөл': p.type || '-',
                'Байршил': p.location || p.address || '-',
                'Үнэ': Number(p.price) || 0,
                'Талбай (м²)': p.area || '-',
                'Өрөө': p.rooms || '-',
                'Төлөв': p.status === 'available' ? 'Зарагдаагүй' : p.status === 'sold' ? 'Зарагдсан' : p.status || '-',
                'Огноо': new Date(p.created_at).toLocaleDateString('mn-MN'),
            })) || [];

            workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Байрууд');
            filename = `байрууд_${new Date().toISOString().split('T')[0]}.xlsx`;

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
