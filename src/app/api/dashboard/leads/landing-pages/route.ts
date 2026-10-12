import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { applyLeadScope, canAccessProject, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { fetchAllRows } from '@/lib/utils/pagination';
import { withRoute } from '@/lib/api/route';
import { ELYSIUM_SITE_PAGE, isLandingPurpose, type LandingPageOption } from '@/lib/leads/landing-attribution';

interface LandingRow {
    landing_page: string;
    landing_page_name: string | null;
    landing_page_url: string | null;
    landing_page_purpose: string | null;
}

/**
 * GET /api/dashboard/leads/landing-pages?project=<uuid>
 * Лидийн жагсаалтын «Landing page» шүүлтүүр: хэрэглэгчийн харах эрхтэй лидүүдийн хуудас ба лидийн тоо.
 * Нэр, хаяг, зориулалт нь тухайн хуудасны хамгийн сүүлийн лидээс (байхгүй бол өмнөхөөс).
 */
export const GET = withRoute({ module: 'leads', error: 'Landing page-ийн жагсаалт татахад алдаа гарлаа' }, async ({ request, shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const requested = request?.nextUrl.searchParams.get('project');
    const projectId = requested === 'all' ? null : requested;
    if (projectId && !z.uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Буруу төсөл' }, { status: 400 });
    if (projectId && !canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төслийн лид харах эрхгүй' }, { status: 403 });

    const rows = await fetchAllRows<LandingRow>((from, to) => {
        let query = applyLeadScope(db.from('leads')
            .select('landing_page, landing_page_name, landing_page_url, landing_page_purpose')
            .eq('shop_id', shop.id).is('deleted_at', null).not('landing_page', 'is', null), scope);
        if (projectId) query = query.eq('project_id', projectId);
        return query.order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to);
    });

    const pages = new Map<string, LandingPageOption>();
    for (const row of rows) {
        const page = pages.get(row.landing_page);
        if (page) {
            page.leads++;
            page.url ??= row.landing_page_url;
            page.purpose ??= isLandingPurpose(row.landing_page_purpose) ? row.landing_page_purpose : null;
            continue;
        }
        pages.set(row.landing_page, {
            key: row.landing_page,
            name: row.landing_page_name || row.landing_page,
            url: row.landing_page_url ?? null,
            purpose: isLandingPurpose(row.landing_page_purpose) ? row.landing_page_purpose : null,
            leads: 1,
        });
    }
    // Landing page-үүд лидийн тоогоор, үндсэн сайт хамгийн сүүлд.
    const landingPages = [...pages.values()].sort((a, b) => Number(a.key === ELYSIUM_SITE_PAGE) - Number(b.key === ELYSIUM_SITE_PAGE)
        || b.leads - a.leads || a.name.localeCompare(b.name, 'mn'));
    return NextResponse.json({ landingPages }, { headers: { 'Cache-Control': 'private, no-store' } });
});
