import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreateBillSchema, validateBody } from '@/lib/validations/schemas';

/** GET /api/dashboard/procurement/bills — Нэхэмжлэхүүд (vendor нэртэй) */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ bills: [] });

        const supabase = supabaseAdmin();
        const status = request.nextUrl.searchParams.get('status');

        let query = supabase
            .from('vendor_bills')
            .select('*, vendors(name), projects(name)')
            .eq('shop_id', authShop.id)
            .order('bill_date', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data: bills, error } = await query;
        if (error) throw error;
        return NextResponse.json({ bills: bills || [] });
    } catch (error) {
        logger.error('[Bills] GET error', { error });
        return NextResponse.json({ error: 'Нэхэмжлэх татахад алдаа гарлаа' }, { status: 500 });
    }
}

/** POST /api/dashboard/procurement/bills — Шинэ нэхэмжлэх (мөрүүдтэй) */
export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const validation = validateBody(CreateBillSchema, body);
        if (!validation.success) return validation.response;
        const d = validation.data;

        const subtotal = d.lines.reduce((s, l) => s + (l.amount || 0), 0);
        const vat = d.vat_amount || 0;
        const total = subtotal + vat;

        const supabase = supabaseAdmin();
        const { data: bill, error } = await supabase
            .from('vendor_bills')
            .insert({
                shop_id: authShop.id,
                vendor_id: d.vendor_id || null,
                project_id: d.project_id || null,
                bill_number: d.bill_number || null,
                bill_date: d.bill_date || new Date().toISOString().slice(0, 10),
                due_date: d.due_date || null,
                subtotal,
                vat_amount: vat,
                total_amount: total,
                paid_amount: 0,
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;

        // Мөрүүдийг хадгална
        const lines = d.lines.map(l => ({
            bill_id: bill.id,
            description: l.description || null,
            account_id: l.account_id || null,
            amount: l.amount,
        }));
        const { error: linesError } = await supabase.from('bill_lines').insert(lines);
        if (linesError) {
            logger.warn('[Bills] lines insert failed', { error: linesError });
        }

        return NextResponse.json({ bill, message: 'Нэхэмжлэх үүсгэлээ' }, { status: 201 });
    } catch (error) {
        logger.error('[Bills] POST error', { error });
        return NextResponse.json({ error: 'Нэхэмжлэх үүсгэхэд алдаа гарлаа' }, { status: 500 });
    }
}
