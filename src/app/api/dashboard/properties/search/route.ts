import { NextRequest, NextResponse } from 'next/server';
import { requireAnyModule } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/properties/search?q=&limit=
 * Байрны typeahead (уулзалт товлох, гэрээ үүсгэх): нэр / дүүрэг / хаягаар,
 * идэвхтэй байруудаас, shop-scoped. Хоосон q → сүүлд нэмэгдсэн 10.
 */
export async function GET(request: NextRequest) {
    try {
        const denied = await requireAnyModule(['properties', 'viewings', 'leads']);
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const q = (sp.get('q') || '').trim().replace(/[%_,()]/g, ' ').trim();
        const limit = Math.min(30, Math.max(1, Number(sp.get('limit')) || 10));

        const db = supabaseAdmin();
        let query = db
            .from('properties')
            .select('id, name, district, price, rooms, size_sqm, status, type')
            .eq('shop_id', authShop.id)
            .eq('is_active', true)
            .limit(limit);
        if (q) query = query.or(`name.ilike.%${q}%,district.ilike.%${q}%,address.ilike.%${q}%`).order('name', { ascending: true });
        else query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: 'Байр хайхад алдаа гарлаа' }, { status: 500 });
        return NextResponse.json({ properties: data || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Байр хайхад алдаа гарлаа');
    }
}
