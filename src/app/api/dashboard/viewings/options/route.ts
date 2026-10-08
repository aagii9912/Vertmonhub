import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';
import { supabaseAdmin } from '@/lib/supabase';
import { canAccessProject, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { loadViewingOptions } from '@/lib/viewings/options';
import { loadViewingPricingConditions } from '@/lib/sales/pricing-store';

/** Minimal meeting picker; the unit register's buyer-enriched endpoint is not reused. */
export const GET = withRoute({ module: 'viewings', error: 'Байрны сонголтыг уншиж чадсангүй' }, async ({ request, shop }) => {
    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    const projectId = new URL(request.url).searchParams.get('project') || await soleShopProjectId(db, shop.id);
    if (!projectId || !z.guid().safeParse(projectId).success) return NextResponse.json({ error: 'Төсөл сонгоно уу' }, { status: 400 });
    if (!canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Төслийн эрхгүй' }, { status: 403 });
    const project = await db.from('projects').select('id').eq('shop_id', shop.id).eq('id', projectId).maybeSingle();
    if (project.error) throw project.error;
    if (!project.data) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
    const [units, pricing] = await Promise.all([loadViewingOptions(db, shop.id, scope, projectId), loadViewingPricingConditions(db, shop.id, scope)]);
    return NextResponse.json({ project_id: projectId, units, ...pricing });
});
