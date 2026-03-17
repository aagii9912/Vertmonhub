import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getClerkUser } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';

/**
 * GET /api/admin/projects — List all projects
 */
export async function GET() {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const { data: projects, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return safeErrorResponse(error, 'Төслүүд татахад алдаа');

        return NextResponse.json({ projects: projects || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Төслүүд татахад алдаа');
    }
}

/**
 * POST /api/admin/projects — Create a new project
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getClerkUser();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const { data: admin } = await supabase.from('admins').select('role').eq('user_id', userId).single();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const body = await request.json();
        const { name, location, district, description, shop_id } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Төслийн нэр шаардлагатай' }, { status: 400 });
        }

        // Get shopId — use provided or first shop
        let targetShopId = shop_id;
        if (!targetShopId) {
            const { data: shops } = await supabase.from('shops').select('id').limit(1);
            targetShopId = shops?.[0]?.id;
        }

        if (!targetShopId) {
            return NextResponse.json({ error: 'Shop олдсонгүй' }, { status: 400 });
        }

        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                shop_id: targetShopId,
                name: name.trim(),
                location: location?.trim() || null,
                district: district?.trim() || null,
                description: description?.trim() || null,
            })
            .select()
            .single();

        if (error) return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');

        return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');
    }
}
