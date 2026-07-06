import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { parsePagination, buildPageMeta } from '@/lib/utils/pagination';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/** Хугацааны шүүлтүүр — гүйдэг цонх (өнөөдрөөс хойш N хоног). */
const PERIOD_DAYS: Record<string, number> = {
    week: 7,
    month: 30,
    quarter: 90,
    year: 365,
};

/**
 * GET /api/dashboard/leads?status=<status>&source=<source>&period=<week|month|quarter|year>
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
        const source = searchParams.get('source');
        const period = searchParams.get('period');

        // Хуудаслалт: их өгөгдөлд бүгдийг татаж ~1000 мөрөнд чимээгүй тасрахаас
        // сэргийлнэ. ?page&pageSize эсвэл ?limit&offset өгөөгүй бол аюулгүйн таг.
        const pagination = parsePagination(searchParams);

        const db = supabaseAdmin();
        let query = db
            .from('leads')
            .select('*', { count: 'exact' })
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(pagination.from, pagination.to);

        if (status && status !== 'all') {
            query = query.eq('status', status);
        }
        if (source && source !== 'all') {
            query = query.eq('source', source);
        }
        if (period && PERIOD_DAYS[period]) {
            const start = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
            query = query.gte('created_at', start.toISOString());
        }

        const { data, error, count } = await query;
        if (error) {
            return NextResponse.json({ error: 'Лийд татахад алдаа гарлаа' }, { status: 500 });
        }

        return NextResponse.json({ leads: data || [], pagination: buildPageMeta(count ?? 0, pagination) });
    } catch (error) {
        return safeErrorResponse(error, 'Лийд татахад алдаа гарлаа');
    }
}
