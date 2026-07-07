import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { logger } from '@/lib/utils/logger';
import { MANAGER_WIDGETS, mergeWidgetPrefs } from '@/lib/dashboard/widget-prefs';

/**
 * GET/PUT /api/dashboard/prefs
 * «Миний самбар»-ын виджет тохируулга (user_dashboard_prefs, хэрэглэгч+shop бүрээр).
 * user_dashboard_prefs хүснэгт байхгүй (миграци ороогүй) орчинд default
 * дараалал буцаана / хадгалалтыг чимээгүй алгасна — UI хэзээ ч эвдрэхгүй.
 */

const PutSchema = z.object({
    widgets: z
        .array(z.object({ id: z.string().max(50), hidden: z.boolean() }))
        .max(30),
});

export async function GET() {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        const defaults = mergeWidgetPrefs([], MANAGER_WIDGETS);
        if (!authShop || !uid) {
            return NextResponse.json({ widgets: defaults });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('user_dashboard_prefs')
            .select('widgets')
            .eq('user_id', uid)
            .eq('shop_id', authShop.id)
            .maybeSingle();

        if (error) {
            // Хүснэгт байхгүй г.м — default-аар үргэлжилнэ
            logger.warn(`[DashboardPrefs] read skipped: ${error.message}`);
            return NextResponse.json({ widgets: defaults });
        }

        const saved = Array.isArray(data?.widgets) ? data.widgets : [];
        return NextResponse.json({ widgets: mergeWidgetPrefs(saved, MANAGER_WIDGETS) });
    } catch (error) {
        return safeErrorResponse(error, 'Самбарын тохиргоо унших алдаа');
    }
}

export async function PUT(request: NextRequest) {
    try {
        const [authShop, uid] = await Promise.all([getUserShop(), getUserId()]);
        if (!authShop || !uid) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const parsed = PutSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Буруу тохиргоо', details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        // Registry-д байгаа id-уудаар цэвэрлэж хадгална
        const widgets = mergeWidgetPrefs(parsed.data.widgets, MANAGER_WIDGETS);

        const db = supabaseAdmin();
        const { error } = await db
            .from('user_dashboard_prefs')
            .upsert(
                {
                    user_id: uid,
                    shop_id: authShop.id,
                    widgets,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,shop_id' },
            );

        if (error) {
            // Миграци ороогүй орчинд хадгалалт боломжгүй — 500 өгөхгүй
            logger.warn(`[DashboardPrefs] save skipped: ${error.message}`);
            return NextResponse.json({ success: false });
        }

        return NextResponse.json({ success: true, widgets });
    } catch (error) {
        return safeErrorResponse(error, 'Самбарын тохиргоо хадгалах алдаа');
    }
}
