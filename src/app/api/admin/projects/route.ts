import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { getAdminUser } from '@/lib/admin/auth';
import { z } from 'zod';
import { fetchAllRows } from '@/lib/utils/pagination';

type ProjectCounts = { leads: number; units: number; contracts: number };
const emptyCounts = (): ProjectCounts => ({ leads: 0, units: 0, contracts: 0 });

const projectSchema = z.object({
    name: z.string().trim().min(1).max(160),
    location: z.string().trim().max(200).optional(),
    district: z.string().trim().max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(['active', 'planned', 'on_hold', 'completed']).optional(),
    /** Шинэ төсөлд хандах ажилтнууд. Үүсгэж буй super admin автоматаар нэмэгдэнэ. */
    member_ids: z.array(z.uuid()).max(200).optional(),
}).strict();

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

        // Shop = төсөл: нэг shop-д хэд хэдэн төсөл байвал салгах шаардлагатайг харуулна.
        const perShop = new Map<string, number>();
        for (const project of projects || []) perShop.set(project.shop_id, (perShop.get(project.shop_id) ?? 0) + 1);
        const memberRows = await fetchAllRows<{ shop_id: string }>((from, to) =>
            supabase.from('shop_members').select('shop_id').order('id').range(from, to));
        const members = new Map<string, number>();
        for (const row of memberRows) members.set(row.shop_id, (members.get(row.shop_id) ?? 0) + 1);

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
            projects: (projects || []).map(project => ({
                ...project,
                counts: diagnosticsError ? null : counts.get(`${project.shop_id}:${project.id}`) ?? emptyCounts(),
                members: members.get(project.shop_id) ?? 0,
                shares_shop: (perShop.get(project.shop_id) ?? 0) > 1,
            })),
            unassigned: diagnosticsError ? [] : [...unassigned].map(([shop_id, value]) => ({ shop_id, ...value })),
            diagnosticsError,
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return safeErrorResponse(error, 'Төслүүд татахад алдаа');
    }
}

/**
 * POST /api/admin/projects — Шинэ төсөл үүсгэх.
 *
 * Shop = төсөл: төсөл бүр өөрийн shop-тэй. `create_project_shop` RPC нь shop, түүний
 * ганц төслийн мөр, сонгосон ажилтнуудын гишүүнчлэл, admin audit-ийг нэг гүйлгээнд
 * хадгална. Одоо байгаа төслийн shop дотор дэд төсөл үүсгэхгүй.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const supabase = supabaseAdmin();

        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });

        const parsed = projectSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Төслийн мэдээлэл буруу байна' }, { status: 400 });
        const { member_ids, ...fields } = parsed.data;

        // Shop = төсөл: шинэ төсөл бүр өөрийн shop, төслийн мөр, гишүүнчлэлтэй нэг гүйлгээнд үүснэ.
        const { data: project, error } = await supabase.rpc('create_project_shop', {
            p_fields: fields,
            p_member_ids: member_ids ?? [],
            p_actor: userId,
        });
        if (error) {
            if (error.code === '23505') return NextResponse.json({ error: 'Ийм нэртэй төсөл аль хэдийн байна' }, { status: 409 });
            if (error.code === '22023') return NextResponse.json({ error: error.message || 'Төслийн мэдээлэл буруу байна' }, { status: 400 });
            return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');
        }

        return NextResponse.json({ project }, { status: 201 });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөл үүсгэхэд алдаа');
    }
}
