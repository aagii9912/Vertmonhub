import { NextResponse, NextRequest } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// PATCH /api/dashboard/service-logs/[id]
// Шийдвэрлэлт бүртгэх, status шинэчлэх
// ============================================
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getClerkUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();
        const supabase = supabaseAdmin();

        const updates: Record<string, unknown> = {};

        if (body.status) updates.status = body.status;
        if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
        if (body.resolution_notes !== undefined) updates.resolution_notes = body.resolution_notes;
        if (body.satisfaction_rating !== undefined) updates.satisfaction_rating = body.satisfaction_rating;
        if (body.priority) updates.priority = body.priority;

        // status = resolved болвол resolved_at автомат тавих
        if (body.status === 'resolved' || body.status === 'closed') {
            updates.resolved_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('service_logs')
            .update(updates)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ log: data, message: 'Хүсэлт шинэчлэгдлээ' });
    } catch (error) {
        logger.error('[ServiceLogs API] PATCH error:', { error });
        return NextResponse.json(
            { error: 'Хүсэлт шинэчлэхэд алдаа гарлаа' },
            { status: 500 }
        );
    }
}

// ============================================
// DELETE /api/dashboard/service-logs/[id]
// Устгах
// ============================================
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const authShop = await getClerkUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const { id } = await params;
        const supabase = supabaseAdmin();

        const { error } = await supabase
            .from('service_logs')
            .delete()
            .eq('id', id)
            .eq('shop_id', authShop.id);

        if (error) throw error;

        return NextResponse.json({ message: 'Хүсэлт устгагдлаа' });
    } catch (error) {
        logger.error('[ServiceLogs API] DELETE error:', { error });
        return NextResponse.json(
            { error: 'Устгахад алдаа гарлаа' },
            { status: 500 }
        );
    }
}
