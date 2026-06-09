import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import * as XLSX from 'xlsx';

/**
 * GET /api/dashboard/finance/reports/export — Санхүүгийн өгөгдлийг Excel-ээр (нягтланд)
 * Хуудас: Гүйлгээ (finance_transactions), Нэхэмжлэх (vendor_bills).
 */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        const [{ data: txns }, { data: bills }] = await Promise.all([
            supabase.from('finance_transactions')
                .select('txn_date, type, amount, vat_amount, method, note')
                .eq('shop_id', shopId)
                .order('txn_date', { ascending: false })
                .limit(5000),
            supabase.from('vendor_bills')
                .select('bill_date, bill_number, total_amount, paid_amount, vat_amount, status, due_date, vendors(name)')
                .eq('shop_id', shopId)
                .order('bill_date', { ascending: false })
                .limit(5000),
        ]);

        const txnRows = (txns || []).map(t => ({
            'Огноо': t.txn_date,
            'Төрөл': t.type === 'receipt' ? 'Орлого' : 'Зарлага',
            'Дүн': Number(t.amount) || 0,
            'НӨАТ': Number(t.vat_amount) || 0,
            'Хэлбэр': t.method || '',
            'Тэмдэглэл': t.note || '',
        }));

        const billRows = (bills || []).map((b) => ({
            'Огноо': b.bill_date,
            'Дугаар': b.bill_number || '',
            'Нийлүүлэгч': (b as { vendors?: { name?: string } | null }).vendors?.name || '',
            'Нийт дүн': Number(b.total_amount) || 0,
            'Төлсөн': Number(b.paid_amount) || 0,
            'Үлдэгдэл': (Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0),
            'НӨАТ': Number(b.vat_amount) || 0,
            'Төлөв': b.status,
            'Хугацаа': b.due_date || '',
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows.length ? txnRows : [{}]), 'Гүйлгээ');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(billRows.length ? billRows : [{}]), 'Нэхэмжлэх');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const filename = `finance-${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        logger.error('[Finance Export] error', { error });
        return NextResponse.json({ error: 'Export хийхэд алдаа гарлаа' }, { status: 500 });
    }
}
