import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { REPORT_MEDIA_BUCKET } from '@/lib/dashboard/report-media';
import { ReportBrandingSaveSchema } from '@/lib/dashboard/report-branding';
import { readReportBranding, saveReportBranding } from '@/lib/dashboard/report-branding-store';

/**
 * GET /api/dashboard/report-branding — төслийн илтгэлийн брэнд (харагдах нэр, хөл бичвэр, нүүрний зураг, лого).
 * Унших: reports (илтгэл бэлтгэгч) эсвэл settings (тохиргооны хуудсанд засагч). Хүснэгт байхгүй бол бүх талбар null.
 * PUT — бүх талбарыг солино (settings write, strict Zod, `expectedUpdatedAt`-аар зэрэг засварыг 409; одоогийнхоос
 * өөр зураг storage-д байхгүй бол 400 — устгагдсан зургийн замыг бичихгүй).
 */
const headers = { 'Cache-Control': 'private, no-store' };

export const GET = withRoute({ module: ['reports', 'settings'], error: 'Илтгэлийн брэндийг уншиж чадсангүй.' }, async ({ shop }) => {
    const result = await readReportBranding(supabaseAdmin(), shop.id);
    return NextResponse.json(result, { headers });
});

export const PUT = withRoute({ module: 'settings', access: 'write', error: 'Илтгэлийн брэндийг хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = ReportBrandingSaveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Брэндийн мэдээллээ шалгана уу.' }, { status: 400 });
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const db = supabaseAdmin();
    // Шинээр сонгосон зураг storage-д байгаа эсэх (404 → false; бусад алдаа шидэгдэж 500).
    const imageExists = async (path: string) => (await db.storage.from(REPORT_MEDIA_BUCKET).exists(path)).data === true;
    const result = await saveReportBranding(db, shop.id, userId, parsed.data, imageExists);
    if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 400 });
    if ('conflict' in result) return NextResponse.json({ error: 'Брэндийг өөр хүн өөрчилсөн байна. Шинэчлээд дахин оролдоно уу.' }, { status: 409 });
    if ('unavailable' in result) return NextResponse.json({ error: 'Илтгэлийн брэнд хадгалах хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.' }, { status: 503 });
    // Солигдсон зургийг устгана (алдаа гарвал лог л үлдэнэ — брэнд хадгалагдсан).
    if (result.removed.length) {
        const { error } = await db.storage.from(REPORT_MEDIA_BUCKET).remove(result.removed);
        if (error) logger.error('[report-branding] old image cleanup failed', { error });
    }
    return NextResponse.json({ branding: result.branding, available: true }, { headers });
});
