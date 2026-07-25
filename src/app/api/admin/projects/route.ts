import { NextRequest, NextResponse } from 'next/server';
import { auditFor } from '@/lib/api/context';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';

/**
 * GET /api/admin/projects — Бүх төслийн жагсаалт (shop-ийн нэрийн хамт)
 */
export async function GET() {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const { data: projects, error } = await supabase
            .from('projects')
            .select('*, shops(name)')
            .order('created_at', { ascending: false });

        if (error) return safeErrorResponse(error, 'Төслүүд татахад алдаа');

        return NextResponse.json({ projects: projects || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Төслүүд татахад алдаа');
    }
}

/**
 * POST /api/admin/projects — Шинэ төсөл үүсгэх
 *
 * shop_id-г ил зааж өгнө. Өмнө нь shop_id өгөөгүй үед өгөгдлийн сангийн
 * ХАМГИЙН ЭХНИЙ shop-д дур мэдэн наадаг байсан нь шинэ төслийн өгөгдлийг
 * буруу shop-ийн AI/CRM руу холих эрсдэлтэй байв. Одоо:
 *   - shop_id өгсөн бол бодитой эсэхийг шалгана;
 *   - өгөөгүй бол зөвхөн ГАНЦ shop-той орчинд түүнийг ашиглана,
 *     олон shop-той бол 400 буцааж сонголт шаардана.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const body = await request.json();
        const { name, location, district, description, shop_id } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Төслийн нэр шаардлагатай' }, { status: 400 });
        }

        let targetShopId: string | null = null;
        if (shop_id) {
            const { data: shop } = await supabase
                .from('shops')
                .select('id')
                .eq('id', shop_id)
                .maybeSingle();
            if (!shop) {
                return NextResponse.json({ error: 'Заасан shop олдсонгүй' }, { status: 400 });
            }
            targetShopId = shop.id;
        } else {
            const { data: shops } = await supabase.from('shops').select('id').limit(2);
            if (!shops || shops.length === 0) {
                return NextResponse.json({ error: 'Shop олдсонгүй' }, { status: 400 });
            }
            if (shops.length > 1) {
                return NextResponse.json(
                    { error: 'Олон shop байна — төслийг аль shop-д харьяалуулахаа сонгоно уу (shop_id)' },
                    { status: 400 }
                );
            }
            targetShopId = shops[0].id;
        }

        // Нэг shop дотор ижил нэртэй төсөл давхар үүсгэхгүй
        const { data: existing } = await supabase
            .from('projects')
            .select('id')
            .eq('shop_id', targetShopId)
            .eq('name', name.trim())
            .maybeSingle();
        if (existing) {
            return NextResponse.json(
                { error: 'Ийм нэртэй төсөл энэ shop-д аль хэдийн байна' },
                { status: 409 }
            );
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
            .select('*, shops(name)')
            .single();

        if (error) return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');

        await auditFor(request, project?.shop_id ?? null, {
            entity: 'project', entityId: project?.id ?? null, action: 'create',
            summary: `${project?.name ?? 'Нэргүй'} төсөл үүсгэв`,
            after: project as Record<string, unknown>,
        });

        return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');
    }
}
