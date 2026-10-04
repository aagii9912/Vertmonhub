import { requireModuleWrite } from '@/lib/auth/require-permission';
/**
 * AI Settings API — байгууллагын түгээмэл асуулт-хариулт (shop_faqs).
 * Dashboard AI туслахын «КОМПАНИЙН МЭДЛЭГ» блокт ордог (orchestrator/shop-knowledge.ts).
 * `type: 'faqs'` талбарыг хуучин клиенттэй нийцүүлэхээр хүлээн авна.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { z } from 'zod';
import { withRoute } from '@/lib/api/route';

const FaqUpdateSchema = z.object({
    question: z.string().min(1), answer: z.string().min(1), category: z.string(), sort_order: z.number().int(), is_active: z.boolean(),
}).partial().strict();

const invalidType = () => NextResponse.json({ error: 'Invalid type' }, { status: 400 });

// GET - Fetch FAQs
export const GET = withRoute({ module: 'ai-settings', error: 'AI тохиргоо унших үед алдаа гарлаа' }, async ({ shop }) => {
    const { data: faqs, error } = await supabaseAdmin()
        .from('shop_faqs')
        .select('*')
        .eq('shop_id', shop.id)
        .order('sort_order', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ faqs: faqs || [] });
});

// POST - Create FAQ
export const POST = withRoute({ module: 'ai-settings', access: 'write', error: 'AI тохиргоо нэмэх үед алдаа гарлаа' }, async ({ request, shop }) => {
    const { type, ...data } = await request.json();
    if (type !== 'faqs') return invalidType();

    const { data: created, error } = await supabaseAdmin()
        .from('shop_faqs')
        .insert({
            shop_id: shop.id,
            question: data.question,
            answer: data.answer,
            category: data.category || 'general',
            sort_order: data.sort_order || 0,
        })
        .select()
        .single();
    if (error) throw error;

    return NextResponse.json({ success: true, data: created });
});

// PATCH - Update FAQ
export async function PATCH(request: NextRequest) {
    try {
        const denied = await requireModuleWrite('ai-settings');
        if (denied) return denied;
        const shop = await getUserShop();
        if (!shop) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { type, id, ...data } = await request.json();
        if (!type || !id) return NextResponse.json({ error: 'Type and ID are required' }, { status: 400 });
        if (type !== 'faqs') return invalidType();

        const { data: updated, error } = await supabaseAdmin()
            .from('shop_faqs')
            .update({ ...FaqUpdateSchema.parse(data), updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', shop.id) // Security: only update own shop's items
            .select()
            .single();
        if (error) throw error;

        return NextResponse.json({ success: true, data: updated });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Буруу өгөгдөл', details: error.flatten() }, { status: 400 });
        return safeErrorResponse(error, 'AI тохиргоо шинэчлэх үед алдаа гарлаа');
    }
}

// DELETE - Remove FAQ
export const DELETE = withRoute({ module: 'ai-settings', access: 'delete', error: 'AI тохиргоо устгах үед алдаа гарлаа' }, async ({ request, shop }) => {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');
    if (!type || !id) return NextResponse.json({ error: 'Type and ID are required' }, { status: 400 });
    if (type !== 'faqs') return invalidType();

    const { error } = await supabaseAdmin()
        .from('shop_faqs')
        .delete()
        .eq('id', id)
        .eq('shop_id', shop.id); // Security: only delete own shop's items
    if (error) throw error;

    return NextResponse.json({ success: true });
});
