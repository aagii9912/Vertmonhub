import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { requireAnyModule, requireModule, resolvePermissions } from '@/lib/auth/require-permission';
import { canAccessLeadAttachmentEntity } from '@/lib/ai/private-attachments';
import { ProjectScopeError } from '@/lib/sales/project-scope';
import { z } from 'zod';

const ENTITY_MODULES: Record<string, string> = {
    property: 'properties', lead: 'leads', customer: 'customers', contract: 'contracts',
};

/**
 * GET /api/dashboard/ai-attachments?entity_type=&entity_id=
 * Тухайн бичлэгт (байр/лийд/харилцагч/гэрээ) хавсаргасан файлуудыг буцаана (shop-scoped).
 */
export async function GET(request: NextRequest) {
    try {
        const deniedAny = await requireAnyModule(Object.values(ENTITY_MODULES));
        if (deniedAny) return deniedAny;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get('entity_type') || '';
        const entityId = searchParams.get('entity_id') || '';
        if (!Object.hasOwn(ENTITY_MODULES, entityType) || !z.uuid().safeParse(entityId).success) {
            return NextResponse.json({ error: 'entity_type ба entity_id шаардлагатай' }, { status: 400 });
        }
        const denied = await requireModule(ENTITY_MODULES[entityType]);
        if (denied) return denied;

        const db = supabaseAdmin();
        if (entityType === 'lead') {
            const [userId, permissions] = await Promise.all([getUserId(), resolvePermissions()]);
            if (!userId || !permissions) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
            if (!await canAccessLeadAttachmentEntity(db, entityId, {
                shopId: authShop.id, userId, perms: { role: permissions.role, modules: permissions.permissions.modules },
            })) return NextResponse.json({ error: 'Лид олдсонгүй' }, { status: 404 });
        }
        const { data, error } = await db
            .from('ai_attachments')
            .select('id, url, file_name, mime_type, uploaded_by, created_at')
            .eq('shop_id', authShop.id)
            .eq('entity_type', entityType)
            .eq('entity_id', entityId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ attachments: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
        return safeErrorResponse(error, 'Хавсралт татахад алдаа гарлаа');
    }
}
