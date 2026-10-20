import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { configMetrics, DailyReportDateSchema, dailyNotePatch, type SaveDailyReportInput } from '@/lib/dashboard/daily-report';
import {
    checkDailyCellAccess, dailyReportActorName, loadDailyEditableManagers, resolveDailyReportRequest,
} from '@/lib/dashboard/daily-report-access';
import {
    DailyReportUnavailableError, loadDailyReportChange, loadDailyReportChanges, loadDailyReportConfig, saveDailyReport,
} from '@/lib/dashboard/daily-report-load';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const unavailable = (error: unknown) => error instanceof DailyReportUnavailableError
    ? NextResponse.json({ error: error.message }, { status: 503 })
    : null;

/**
 * GET /api/dashboard/daily-report/history?date=YYYY-MM-DD — тухайн өдрийн «Өдрийн тайлан»-гийн
 * өөрчлөлтийн түүх (тоо, тэмдэглэл, баталгаажуулалт, уулзалт; хэн, хэзээ, хуучин → шинэ), шинэ нь эхэнд.
 * Тайлан харах эрхтэй хүн (GET-тэй ижил) харна; `restorable` нь тухайн хүн буцааж болох мөр.
 */
export const GET = withRoute({ module: ['reports', 'dashboard'], error: 'Өдрийн тайлангийн түүхийг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const today = ubDateStr();
    const parsed = DailyReportDateSchema.safeParse(request.nextUrl.searchParams.get('date') || today);
    if (!parsed.success) return NextResponse.json({ error: 'Огноо буруу байна' }, { status: 400 });
    const date = parsed.data;
    if (date > today) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан гаргахгүй' }, { status: 400 });

    const resolved = await resolveDailyReportRequest(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { viewer, writable } = resolved;
    if (viewer.personal && !viewer.ownManager) return NextResponse.json({ error: 'Таны нэр борлуулалтын менежерийн бүртгэлд холбогдоогүй байна' }, { status: 403 });
    if (!viewer.canViewTeam) return NextResponse.json({ error: 'Багийн өдрийн тайланг харах эрхгүй' }, { status: 403 });

    try {
        const db = supabaseAdmin();
        const editable = writable ? await loadDailyEditableManagers(db, shop.id, viewer) : new Set<string>();
        const changes = await loadDailyReportChanges(db, { shopId: shop.id, shopName: shop.name || '', date, editable, canEditNotes: writable });
        return NextResponse.json({ date, changes }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});

const RestoreSchema = z.object({ changeId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();

/**
 * POST /api/dashboard/daily-report/history — { changeId } тоо/тэмдэглэлийн нэг өөрчлөлтийг буцаана
 * (хуучин утгыг нь дахин хадгална). PUT-ийн эрхийн дүрэмтэй ижил; нүд энэ хооронд дахин өөрчлөгдсөн
 * бол 409. Сэргээлт өөрөө түүхэнд `restored_from`-той бичигдэнэ.
 */
export const POST = withRoute({ module: 'dashboard', access: 'write', error: 'Өөрчлөлтийг сэргээж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const parsed = RestoreSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Сэргээх өөрчлөлтөө сонгоно уу' }, { status: 400 });

    const resolved = await resolveDailyReportRequest(shop.id);
    if (!resolved) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
    const { userId, viewer } = resolved;
    const db = supabaseAdmin();

    try {
        const change = await loadDailyReportChange(db, shop.id, parsed.data.changeId);
        if (!change) return NextResponse.json({ error: 'Өөрчлөлт олдсонгүй' }, { status: 404 });
        const isCount = change.kind === 'count' && !!change.manager_name && !!change.metric;
        const isNote = change.kind === 'note' && !!change.note_key;
        if (!isCount && !isNote) return NextResponse.json({ error: 'Энэ өөрчлөлтийг сэргээх боломжгүй' }, { status: 400 });
        if (change.report_date > ubDateStr()) return NextResponse.json({ error: 'Ирээдүйн өдрийн тайлан бөглөхгүй' }, { status: 400 });

        const denied = await checkDailyCellAccess(db, shop.id, viewer, isCount ? [change.manager_name!] : []);
        if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

        let data: SaveDailyReportInput;
        if (isCount) {
            if (change.old_value !== null && !configMetrics((await loadDailyReportConfig(db, shop.id, shop.name || '')).config).has(change.metric!)) {
                return NextResponse.json({ error: 'Тайлангийн загвар өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оруулна уу.' }, { status: 409 });
            }
            data = { date: change.report_date, cells: [{ manager: change.manager_name!, metric: change.metric!, value: change.old_value, expected: change.new_value }] };
        } else {
            data = {
                date: change.report_date, cells: [],
                notes: dailyNotePatch(change.note_key!, change.old_text ?? ''),
                notesExpected: dailyNotePatch(change.note_key!, change.new_text ?? ''),
            };
        }

        const saved = await saveDailyReport(db, { shopId: shop.id, userId, userName: dailyReportActorName(viewer), data, restoredFrom: change.id });
        if (!saved.ok) {
            return NextResponse.json({ error: 'Энэ нүд дараа нь дахин өөрчлөгдсөн байна. Түүхийг шинэчлээд дахин оролдоно уу.', conflicts: saved.conflicts }, { status: 409, headers: NO_STORE });
        }
        return NextResponse.json({ ok: true }, { headers: NO_STORE });
    } catch (error) {
        const response = unavailable(error);
        if (response) return response;
        throw error;
    }
});
