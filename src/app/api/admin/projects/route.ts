import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';
import { logAdminAudit } from '@/lib/admin/audit';
import { z } from 'zod';
import { fetchAllRows } from '@/lib/utils/pagination';

type ProjectCounts = { leads: number; units: number; contracts: number };
const emptyCounts = (): ProjectCounts => ({ leads: 0, units: 0, contracts: 0 });

const projectSchema = z.object({
    shop_id: z.uuid().optional(),
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().max(200).optional(),
    district: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(['active', 'planned', 'on_hold', 'completed']).optional(),
});

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

        const counts = new Map<string, ProjectCounts>();
        const unassigned = new Map<string, ProjectCounts>();
        let diagnosticsError: string | undefined;
        try {
            type Link = { shop_id: string; project_id: string | null };
            const rows = await Promise.all([
                fetchAllRows<Link>((from, to) => supabase.from('leads').select('shop_id,project_id').is('deleted_at', null).order('id').range(from, to)),
                fetchAllRows<Link>((from, to) => supabase.from('property_units').select('shop_id,project_id').order('id').range(from, to)),
                fetchAllRows<Link>((from, to) => supabase.from('property_contracts').select('shop_id,project_id').is('deleted_at', null).order('id').range(from, to)),
            ]);
            for (const [index, key] of (['leads', 'units', 'contracts'] as const).entries()) {
                for (const row of rows[index]) {
                    const target = row.project_id ? counts : unassigned;
                    const id = row.project_id ? `${row.shop_id}:${row.project_id}` : row.shop_id;
                    const value = target.get(id) ?? emptyCounts();
                    value[key]++;
                    target.set(id, value);
                }
            }
        } catch (error) {
            console.error('[Admin projects] Link diagnostics failed:', error);
            diagnosticsError = 'Төслийн бүртгэлийн тоог бүрэн уншиж чадсангүй. Дахин ачаална уу.';
        }

        return NextResponse.json({
            projects: (projects || []).map(project => ({ ...project, counts: diagnosticsError ? null : counts.get(`${project.shop_id}:${project.id}`) ?? emptyCounts() })),
            unassigned: diagnosticsError ? [] : [...unassigned].map(([shop_id, value]) => ({ shop_id, ...value })),
            diagnosticsError,
        }, { headers: { 'Cache-Control': 'private, no-store' } });
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

        const parsed = projectSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: 'Төслийн мэдээлэл буруу байна' }, { status: 400 });
        const { name, location, district, description, shop_id, status } = parsed.data;

        let targetShopId: string | null = null;
        if (shop_id) {
            const { data: shop, error: shopError } = await supabase
                .from('shops')
                .select('id')
                .eq('id', shop_id)
                .maybeSingle();
            if (shopError) return safeErrorResponse(shopError, 'Байгууллага шалгахад алдаа гарлаа');
            if (!shop) {
                return NextResponse.json({ error: 'Заасан shop олдсонгүй' }, { status: 400 });
            }
            targetShopId = shop.id;
        } else {
            const { data: shops, error: shopsError } = await supabase.from('shops').select('id').limit(2);
            if (shopsError) return safeErrorResponse(shopsError, 'Байгууллага шалгахад алдаа гарлаа');
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
        const { data: existing, error: existingError } = await supabase
            .from('projects')
            .select('id')
            .eq('shop_id', targetShopId)
            .eq('name', name.trim())
            .maybeSingle();
        if (existingError) return safeErrorResponse(existingError, 'Төслийн нэр шалгахад алдаа гарлаа');
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
                name,
                location: location || null,
                district: district || null,
                description: description || null,
                status: status || 'active',
            })
            .select('*, shops(name)')
            .single();

        if (error) return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');

        await logAdminAudit({ actorId: userId, action: 'project.create', targetId: project.id, meta: { shop_id: targetShopId } });

        return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');
    }
}
