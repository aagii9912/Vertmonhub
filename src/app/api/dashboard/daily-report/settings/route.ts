import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { DailyReportConfigSchema } from '@/lib/dashboard/daily-report';
import { DailyReportUnavailableError, loadDailyRoster, saveDailyReportConfig } from '@/lib/dashboard/daily-report-load';

const BodySchema = z.object({ config: z.unknown() }).strict();

/**
 * PUT /api/dashboard/daily-report/settings — { config } төслийн «Өдрийн тайлан»-гийн загвар (Тохиргоо
 * бичих эрх): утасны шугам (ангилалтай/нийт), чатын суваг, менежерүүдийн дараалал, товчлол.
 * Менежер нь тухайн төслийн идэвхтэй бүртгэлийн нэр байна. Шугам/сувгийн түлхүүр хадгалсан тоог
 * холбодог тул нэрийг сольж болно, түлхүүрийг клиент тогтвортой хадгална.
 */
export const PUT = withRoute({ module: 'settings', access: 'write', error: 'Өдрийн тайлангийн загварыг хадгалж чадсангүй' }, async ({ request, shop }) => {
    const body = BodySchema.safeParse(await request.json().catch(() => null));
    const parsed = body.success ? DailyReportConfigSchema.safeParse(body.data.config) : null;
    if (!parsed?.success) return NextResponse.json({ error: parsed?.error.issues[0]?.message || 'Загварын мэдээллийг шалгана уу' }, { status: 400 });
    const config = parsed.data;
    const db = supabaseAdmin();
    try {
        if (config.managers) {
            const active = new Set((await loadDailyRoster(db, shop.id)).filter(entry => entry.is_active).map(entry => entry.name));
            const unknown = config.managers.find(manager => !active.has(manager.name));
            if (unknown) return NextResponse.json({ error: `«${unknown.name}» нь энэ төслийн идэвхтэй менежер биш` }, { status: 400 });
        }
        await saveDailyReportConfig(db, shop.id, config, await getUserId());
        return NextResponse.json({ config });
    } catch (error) {
        if (error instanceof DailyReportUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
        throw error;
    }
});
