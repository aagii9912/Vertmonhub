import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin/auth';
import { logAdminAudit } from '@/lib/admin/audit';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const updateSchema = z.object({
    name: z.string().trim().min(1).max(160).optional(),
    location: z.string().trim().max(200).nullable().optional(),
    district: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(['active', 'planned', 'on_hold', 'completed']).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const admin = await getAdminUser();
        if (!admin) return NextResponse.json({ error: 'Super admin эрх шаардлагатай' }, { status: 403 });
        const { id } = await params;
        if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: 'Төслийн ID буруу байна' }, { status: 400 });
        const parsed = updateSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: 'Төслийн мэдээлэл буруу байна' }, { status: 400 });

        const db = supabaseAdmin();
        const { data: existing, error: readError } = await db.from('projects')
            .select('id, shop_id').eq('id', id).maybeSingle();
        if (readError) return safeErrorResponse(readError, 'Төсөл уншихад алдаа гарлаа');
        if (!existing) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });

        if (parsed.data.name) {
            const { data: duplicate, error: duplicateError } = await db.from('projects')
                .select('id').eq('shop_id', existing.shop_id).eq('name', parsed.data.name).neq('id', id).maybeSingle();
            if (duplicateError) return safeErrorResponse(duplicateError, 'Төслийн нэр шалгахад алдаа гарлаа');
            if (duplicate) return NextResponse.json({ error: 'Ийм нэртэй төсөл энэ байгууллагад байна' }, { status: 409 });
        }

        const { data: project, error } = await db.from('projects')
            .update(parsed.data).eq('id', id).select('*, shops(name)').single();
        if (error) return safeErrorResponse(error, 'Төсөл шинэчлэхэд алдаа гарлаа');
        await logAdminAudit({ actorId: admin.id, action: 'project.update', targetId: id, meta: { shop_id: existing.shop_id } });
        return NextResponse.json({ project });
    } catch (error) {
        return safeErrorResponse(error, 'Төсөл шинэчлэхэд алдаа гарлаа');
    }
}
