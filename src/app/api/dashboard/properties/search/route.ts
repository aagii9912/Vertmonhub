import { NextRequest, NextResponse } from 'next/server';
import { requireAnyModule } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { applyProjectScope, canAccessProject, ProjectScopeError, resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { z } from 'zod';

/**
 * GET /api/dashboard/properties/search?q=&limit=&project=
 * Байрны typeahead (уулзалт товлох, гэрээ үүсгэх): нэр / дүүрэг / хаягаар,
 * идэвхтэй байруудаас, shop-scoped. Хоосон q → сүүлд нэмэгдсэн 10.
 */
export async function GET(request: NextRequest) {
    try {
        const denied = await requireAnyModule(['properties', 'viewings', 'leads']);
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const q = (sp.get('q') || '').trim().replace(/[%_,()]/g, ' ').trim();
        const limit = Math.min(30, Math.max(1, Number(sp.get('limit')) || 10));
        const projectId = sp.get('project');
        if (projectId !== null && !z.uuid().safeParse(projectId).success) return NextResponse.json({ error: 'Төсөл буруу байна' }, { status: 400 });

        const db = supabaseAdmin();
        const scope = await resolveSalesProjectScope(db, authShop.id);
        if (projectId) {
            if (!canAccessProject(scope, projectId)) return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });
            const { data: project, error } = await db.from('projects').select('id')
                .eq('shop_id', authShop.id).eq('id', projectId).maybeSingle();
            if (error) throw error;
            if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }
        let query = applyProjectScope(db
            .from('properties')
            .select('id, name, district, price, rooms, size_sqm, status, type, project_id')
            .eq('shop_id', authShop.id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .limit(limit), scope);
        if (projectId) query = query.eq('project_id', projectId);
        if (q) query = query.or(`name.ilike.%${q}%,district.ilike.%${q}%,address.ilike.%${q}%`).order('name', { ascending: true });
        else query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: 'Байр хайхад алдаа гарлаа' }, { status: 500 });
        return NextResponse.json({ properties: data || [] });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Байр хайхад алдаа гарлаа');
    }
}
