import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { recordAudit } from '@/lib/services/AuditService';
import { resolveApiUser } from '@/lib/auth/resolve-user';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
    try {
        const denied = await requireModule('contracts');
        if (denied) return denied;
        const { id } = await ctx.params;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('property_contracts')
            .select('*')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
        }

        return NextResponse.json({ contract: data });
    } catch (error) {
        logger.error('[Contract Detail API] GET error:', { error });
        return NextResponse.json({ error: 'Алдаа гарлаа' }, { status: 500 });
    }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
    try {
        const denied = await requireModuleDelete('contracts');
        if (denied) return denied;
        const { id } = await ctx.params;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Устгахын өмнөх төлөвийг аудитад үлдээхээр уншина
        const { data: before } = await supabase
            .from('property_contracts')
            .select('*')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .maybeSingle();

        if (!before) {
            return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
        }

        // ЗӨӨЛӨН устгал. Өмнө нь hard delete (.delete()) байсан тул төлбөрийн
        // хуваарь, хүлээлцэх акт каскадаар бүрмөсөн устаж, кассын гүйлгээ
        // өнчирдөг байв — сэргээх боломжгүй.
        const { error } = await supabase
            .from('property_contracts')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', authShop.id);

        if (error) throw error;

        await recordAudit({
            shopId: authShop.id,
            actorId: (await resolveApiUser())?.id ?? null,
            entity: 'contract',
            entityId: id,
            action: 'delete',
            changes: { before },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('[Contract Detail API] DELETE error:', { error });
        return NextResponse.json({ error: 'Устгахад алдаа гарлаа' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
    try {
        const denied = await requireModuleWrite('contracts');
        if (denied) return denied;
        const { id } = await ctx.params;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Зөвхөн зөвшөөрөгдсөн талбаруудыг update хийнэ
        const allowed = [
            'contract_status', 'sales_manager', 'sales_channel',
            'paid_amount', 'paid_percent', 'balance', 'penalty_amount',
            'overdue_days', 'prepayment_paid', 'prepayment_paid_cash',
            'prepayment_paid_barter', 'customer_phone', 'customer_name',
            'remaining_payment_condition', 'balance_payment_method',
            'project_id',
        ];
        const updateData: Record<string, unknown> = {};
        for (const key of allowed) {
            if (body[key] !== undefined) updateData[key] = body[key];
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'Шинэчлэх талбар алга' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('property_contracts')
            .update(updateData)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ contract: data });
    } catch (error) {
        logger.error('[Contract Detail API] PATCH error:', { error });
        return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
    }
}
