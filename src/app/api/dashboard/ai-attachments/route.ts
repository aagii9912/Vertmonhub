import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

const VALID_TYPES = ['property', 'lead', 'customer', 'contract'];

/**
 * GET /api/dashboard/ai-attachments?entity_type=&entity_id=
 * Тухайн бичлэгт (байр/лийд/харилцагч/гэрээ) хавсаргасан файлуудыг буцаана (shop-scoped).
 */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const entityType = searchParams.get('entity_type') || '';
        const entityId = searchParams.get('entity_id') || '';
        if (!VALID_TYPES.includes(entityType) || !entityId) {
            return NextResponse.json({ error: 'entity_type ба entity_id шаардлагатай' }, { status: 400 });
        }

        const db = supabaseAdmin();
        // Хүснэгт байхгүй (миграци ороогүй) бол хоосон буцаана — UI эвдрэхгүй.
        const { data, error } = await db
            .from('ai_attachments')
            .select('id, url, file_name, mime_type, uploaded_by, created_at')
            .eq('shop_id', authShop.id)
            .eq('entity_type', entityType)
            .eq('entity_id', entityId)
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ attachments: [] });
        return NextResponse.json({ attachments: data || [] });
    } catch (error) {
        return safeErrorResponse(error, 'Хавсралт татахад алдаа гарлаа');
    }
}
