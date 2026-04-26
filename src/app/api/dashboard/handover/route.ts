import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/handover
// Хүлээлгэн өгөх актын жагсаалт
// ============================================
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ records: [] });
        }

        const supabase = supabaseAdmin();
        const sp = request.nextUrl.searchParams;
        const status = sp.get('status');
        const contractId = sp.get('contract_id');

        let query = supabase
            .from('handover_records')
            .select(`
                *,
                property_contracts (
                    contract_number,
                    customer_name,
                    customer_phone,
                    block_name,
                    unit_number,
                    floor,
                    rooms,
                    sales_manager
                )
            `)
            .eq('shop_id', authShop.id);

        if (status) query = query.eq('status', status);
        if (contractId) query = query.eq('contract_id', contractId);

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ records: data || [] });
    } catch (error) {
        logger.error('[Handover API] GET error:', { error });
        return NextResponse.json(
            { error: 'Хүлээлгэн өгөх акт татахад алдаа гарлаа', records: [] },
            { status: 500 }
        );
    }
}

// ============================================
// POST /api/dashboard/handover
// Шинэ handover акт үүсгэх
// ============================================
export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json();
        const supabase = supabaseAdmin();

        if (!body.contract_id) {
            return NextResponse.json({ error: 'contract_id шаардлагатай' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('handover_records')
            .insert({
                contract_id: body.contract_id,
                shop_id: authShop.id,
                handover_date: body.handover_date || null,
                status: body.status || 'scheduled',
                checklist: body.checklist || {},
                condition_notes: body.condition_notes || null,
                photos: body.photos || [],
                accepted_by: body.accepted_by || null,
                delivered_by: body.delivered_by || null,
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json(
            { record: data, message: 'Хүлээлгэн өгөх акт үүсгэлээ' },
            { status: 201 }
        );
    } catch (error) {
        logger.error('[Handover API] POST error:', { error });
        return NextResponse.json(
            { error: 'Акт үүсгэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}
