import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/dashboard/activity — багийн ҮЙЛ АЖИЛЛАГААНЫ урсгал.
 *
 * ЯАГААД: систем өмнө нь зөвхөн ҮР ДҮНГ (гэрээ, орлого) бүртгэдэг байсан тул
 * удирдлага «хэн юу хийж байна» гэдгийг харах газар байгаагүй. Мөн
 * manager_performance нь гэрээтэй менежерийг л харуулдаг тул идэвхтэй
 * ажилласан ч гэрээ хаагаагүй хүн ОГТ харагддаггүй байв.
 *
 * Query: ?manager=&days=&kind=&limit=
 * Эрх: `reports` модуль (багийн явцыг харах эрх).
 * Миграци ороогүй орчинд 500 биш — хоосон + available:false буцаана.
 */
export async function GET(request: NextRequest) {
    try {
        const denied = await requireModule('reports');
        if (denied) return denied;

        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const days = Math.min(Math.max(parseInt(searchParams.get('days') || '7', 10) || 7, 1), 90);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 1000);
        const manager = searchParams.get('manager');
        const kind = searchParams.get('kind');

        const since = new Date();
        since.setDate(since.getDate() - (days - 1));
        since.setHours(0, 0, 0, 0);

        let query = supabaseAdmin()
            .from('activity_log')
            .select('id, actor_name, entity_type, entity_id, kind, outcome, body, source, occurred_at')
            .eq('shop_id', authShop.id)
            .gte('occurred_at', since.toISOString())
            .is('deleted_at', null)
            .order('occurred_at', { ascending: false })
            .limit(limit);

        if (manager) query = query.eq('actor_name', manager);
        if (kind) query = query.eq('kind', kind);

        const { data, error } = await query;

        if (error) {
            // Хүснэгт үүсээгүй (миграци ороогүй) — жишгийн дагуу зөөлөн доройтоно
            if (/activity_log/i.test(error.message) || error.code === '42P01') {
                return NextResponse.json({
                    available: false,
                    hint: '20260822120000_work_os_foundation.sql миграцийг ажиллуулна уу',
                    days,
                    totals: { total: 0, byManager: [], byKind: {} },
                    items: [],
                });
            }
            return safeErrorResponse(error, 'Үйл ажиллагаа уншихад алдаа гарлаа');
        }

        const rows = data || [];

        // Нэгтгэл — менежер ба төрлөөр
        const byManagerMap = new Map<string, number>();
        const byKind: Record<string, number> = {};
        for (const r of rows) {
            const name = r.actor_name || '(тодорхойгүй)';
            byManagerMap.set(name, (byManagerMap.get(name) || 0) + 1);
            byKind[r.kind] = (byKind[r.kind] || 0) + 1;
        }

        return NextResponse.json({
            available: true,
            days,
            totals: {
                total: rows.length,
                byManager: [...byManagerMap.entries()]
                    .map(([name, count]) => ({ manager: name, count }))
                    .sort((a, b) => b.count - a.count),
                byKind,
            },
            items: rows,
        });
    } catch (error) {
        return safeErrorResponse(error, 'Үйл ажиллагаа уншихад алдаа гарлаа');
    }
}
