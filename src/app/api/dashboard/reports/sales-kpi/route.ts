import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logAdminAudit } from '@/lib/admin/audit';
import { resolveReportViewer } from '@/lib/sales/manager-identity';
import { KpiMonthInputSchema } from '@/lib/sales/kpi';
import { loadSalesKpi } from '@/lib/sales/kpi-load';
import { ubParts } from '@/lib/utils/date';

const periodSchema = z.object({ year: z.coerce.number().int().min(2020).max(2100), month: z.coerce.number().int().min(1).max(12) });

// Менежер (админ биш) зөвхөн өөрийн картыг харна — дүрэм нь resolveReportViewer-т.
async function viewer(shopId: string) {
    const [permissions, userId] = await Promise.all([resolvePermissions(), getUserId()]);
    return resolveReportViewer(supabaseAdmin(), shopId, { userId, role: permissions?.role, modules: permissions?.permissions.modules });
}

/** jsonb объектыг нэгтгэнэ; null утга тухайн түлхүүрийг арилгана (жишээ нь гар дуудлагын тоог CRM руу буцаах). */
function mergeJson(current: unknown, patch: Record<string, unknown> | undefined) {
    const merged: Record<string, unknown> = { ...(current && typeof current === 'object' ? current as Record<string, unknown> : {}), ...(patch ?? {}) };
    for (const [key, value] of Object.entries(merged)) if (value === null) delete merged[key];
    return merged;
}

/**
 * GET /api/dashboard/reports/sales-kpi?year=&month= — идэвхтэй төслийн менежерүүдийн сарын KPI карт.
 * PUT — сарын төлөвлөгөө, гар гүйцэтгэл (дуудлага/чат), өдрийн зорилт, удирдлагын үнэлгээг админ хадгална.
 */
export const GET = withRoute({ module: 'reports', error: 'KPI картыг гаргаж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const now = ubParts();
    const query = request.nextUrl.searchParams;
    const period = periodSchema.safeParse({ year: query.get('year') ?? now.year, month: query.get('month') ?? now.month });
    if (!period.success) return NextResponse.json({ error: 'Он, сар буруу байна' }, { status: 400 });
    const who = await viewer(shop.id);
    if (who.personal && !who.managerName) return NextResponse.json({ ...period.data, sources: null, managers: [], canEdit: false });
    const report = await loadSalesKpi(supabaseAdmin(), { shopId: shop.id, ...period.data, only: who.personal ? who.managerName : null });
    return NextResponse.json({ ...report, canEdit: who.isAdmin }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PUT = withRoute({ module: 'reports', access: 'write', error: 'KPI хадгалж чадсангүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const who = await viewer(shop.id);
    if (!who.isAdmin) return NextResponse.json({ error: 'KPI-ийн төлөвлөгөө, үнэлгээг админ оруулна' }, { status: 403 });
    const parsed = KpiMonthInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'KPI-ийн мэдээлэл буруу байна' }, { status: 400 });
    const { year, month, manager, plans, manual, daily, review } = parsed.data;
    const db = supabaseAdmin();
    const [{ data: roster, error: rosterError }, { data: current, error: readError }] = await Promise.all([
        db.from('sales_managers').select('name').eq('shop_id', shop.id).eq('name', manager).maybeSingle(),
        db.from('sales_kpi_months').select('plans, manual, daily, review').eq('shop_id', shop.id).eq('year', year).eq('month', month).eq('manager_name', manager).maybeSingle(),
    ]);
    if (rosterError) throw rosterError;
    if (readError) throw readError;
    if (!roster) return NextResponse.json({ error: 'Энэ төслийн бүртгэлд ийм менежер алга' }, { status: 404 });
    const row = {
        shop_id: shop.id, year, month, manager_name: manager,
        plans: { ...(current?.plans ?? {}), ...(plans ?? {}) },
        manual: mergeJson(current?.manual, manual),
        daily: mergeJson(current?.daily, daily),
        review: { ...(current?.review ?? {}), ...(review ?? {}) },
        updated_by: who.userId, updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('sales_kpi_months').upsert(row, { onConflict: 'shop_id,year,month,manager_name' });
    if (error) throw error;
    await logAdminAudit({ actorId: who.userId, action: 'kpi.update', targetId: manager, meta: { shop_id: shop.id, year, month, fields: Object.keys(parsed.data).filter(key => !['year', 'month', 'manager'].includes(key)) } });
    return NextResponse.json({ success: true });
});
