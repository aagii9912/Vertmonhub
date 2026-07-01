import { NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';

/**
 * GET /api/admin/shops — Бүх shop-ийн жагсаалт (admin only)
 * Хэрэглэгч үүсгэхдээ аль shop-д гишүүнээр оноохыг сонгоход ашиглана.
 */
export async function GET() {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const { data: shops, error } = await supabase
            .from('shops')
            .select('id, name')
            .order('created_at', { ascending: true });

        if (error) return safeErrorResponse(error, 'Shop жагсаалт татахад алдаа');

        return NextResponse.json({ shops: shops || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Shop жагсаалт татахад алдаа');
    }
}
