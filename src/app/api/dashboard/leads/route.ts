import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/leads?status=<status>
 * Лийдийн жагсаалт (shop-scoped, сервер cookie auth + service role).
 * Soft-delete хийгдсэн лийдийг (deleted_at) хасна.
 */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        const db = supabaseAdmin();
        let query = db
            .from('leads')
            .select('*')
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) {
            return NextResponse.json({ error: 'Лийд татахад алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ leads: data || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд татахад алдаа гарлаа');
    }
}
