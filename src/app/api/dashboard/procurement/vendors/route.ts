import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreateVendorSchema, validateBody } from '@/lib/validations/schemas';

/** GET /api/dashboard/procurement/vendors — Нийлүүлэгчид */
export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ vendors: [] });

        const supabase = supabaseAdmin();
        const { data: vendors, error } = await supabase
            .from('vendors')
            .select('*')
            .eq('shop_id', authShop.id)
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ vendors: vendors || [] });
    } catch (error) {
        logger.error('[Vendors] GET error', { error });
        return NextResponse.json({ error: 'Нийлүүлэгч татахад алдаа гарлаа' }, { status: 500 });
    }
}

/** POST /api/dashboard/procurement/vendors — Шинэ нийлүүлэгч */
export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const validation = validateBody(CreateVendorSchema, body);
        if (!validation.success) return validation.response;
        const d = validation.data;

        const supabase = supabaseAdmin();
        const { data: vendor, error } = await supabase
            .from('vendors')
            .insert({
                shop_id: authShop.id,
                name: d.name,
                registration: d.registration || null,
                phone: d.phone || null,
                email: d.email || null,
                bank_name: d.bank_name || null,
                account_number: d.account_number || null,
                account_name: d.account_name || null,
                note: d.note || null,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ vendor, message: 'Нийлүүлэгч нэмлээ' }, { status: 201 });
    } catch (error) {
        logger.error('[Vendors] POST error', { error });
        return NextResponse.json({ error: 'Нийлүүлэгч нэмэхэд алдаа гарлаа' }, { status: 500 });
    }
}
