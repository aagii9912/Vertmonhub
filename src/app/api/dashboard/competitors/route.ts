import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// Өрсөлдөгчийн судалгаа — ai_knowledge_base (category='competitor')-д JSONB-ээр
// хадгална (тусдаа хүснэгт шаардахгүй). value = { name, location, district,
// num_blocks, planning, payment_terms, price_per_sqm, facebook_url, notes }.
// ============================================
const CATEGORY = 'competitor';

interface CompetitorValue {
    name: string;
    location?: string | null;
    district?: string | null;
    num_blocks?: number | null;
    planning?: string | null;
    payment_terms?: string | null;
    price_per_sqm?: number | null;
    facebook_url?: string | null;
    notes?: string | null;
    updated_at?: string;
}

// GET — жагсаалт
export async function GET() {
    try {
        const denied = await requireModule('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ competitors: [] });

        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('ai_knowledge_base')
            .select('id, key, value, description, updated_at')
            .eq('shop_id', authShop.id)
            .eq('category', CATEGORY)
            .order('updated_at', { ascending: false });
        if (error) throw error;

        const competitors = (data || []).map((r) => ({
            id: r.id,
            key: r.key,
            ...(r.value as CompetitorValue),
        }));
        return NextResponse.json({ competitors });
    } catch (error) {
        logger.error('[Competitors API] GET error:', { error });
        return NextResponse.json({ error: 'Өрсөлдөгчийн мэдээлэл татахад алдаа гарлаа', competitors: [] }, { status: 500 });
    }
}

// POST — нэмэх / шинэчлэх (нэрээр upsert)
export async function POST(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

        const body = await request.json();
        const name = String(body.name || '').trim();
        if (!name) return NextResponse.json({ error: 'Өрсөлдөгчийн нэр шаардлагатай' }, { status: 400 });

        const value: CompetitorValue = {
            name,
            location: body.location || null,
            district: body.district || null,
            num_blocks: body.num_blocks != null && body.num_blocks !== '' ? Number(body.num_blocks) : null,
            planning: body.planning || null,
            payment_terms: body.payment_terms || null,
            price_per_sqm: body.price_per_sqm != null && body.price_per_sqm !== '' ? Number(body.price_per_sqm) : null,
            facebook_url: body.facebook_url || null,
            notes: body.notes || null,
            updated_at: new Date().toISOString(),
        };

        const supabase = supabaseAdmin();
        const { error } = await supabase
            .from('ai_knowledge_base')
            .upsert(
                { shop_id: authShop.id, category: CATEGORY, key: name, value, description: `Өрсөлдөгч: ${name}` },
                { onConflict: 'shop_id,category,key' }
            );
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('[Competitors API] POST error:', { error });
        return NextResponse.json({ error: 'Хадгалахад алдаа гарлаа' }, { status: 500 });
    }
}

// DELETE — id-аар устгах
export async function DELETE(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('marketing-roi');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

        const id = request.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });

        const supabase = supabaseAdmin();
        const { error } = await supabase
            .from('ai_knowledge_base')
            .delete()
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .eq('category', CATEGORY);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('[Competitors API] DELETE error:', { error });
        return NextResponse.json({ error: 'Устгахад алдаа гарлаа' }, { status: 500 });
    }
}
