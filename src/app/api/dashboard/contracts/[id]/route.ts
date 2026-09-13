import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule, requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { z } from 'zod';

const ContractPatchSchema = z.object({
    contract_status: z.enum(['active', 'closed', 'cancelled']).optional(),
    sales_manager: z.string().max(255).nullable().optional(),
    sales_channel: z.string().max(255).nullable().optional(),
    penalty_amount: z.coerce.number().nonnegative().max(1e15).nullable().optional(),
    overdue_days: z.coerce.number().int().nonnegative().nullable().optional(),
    customer_phone: z.string().max(100).nullable().optional(),
    customer_name: z.string().max(255).nullable().optional(),
    remaining_payment_condition: z.string().max(2000).nullable().optional(),
    balance_payment_method: z.string().max(255).nullable().optional(),
    project_id: z.string().uuid().nullable().optional(),
}).strict();

const RECEIPT_DERIVED_FIELDS = ['paid_amount', 'paid_percent', 'balance', 'prepayment_paid', 'prepayment_paid_cash', 'prepayment_paid_barter'];

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
            .is('deleted_at', null)
            .maybeSingle();

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

        // Soft delete — AI туслахын delete_contract-тай нэг зан төлөв (сэргээх боломжтой,
        // manager_monthly_sales/статистик deleted_at-аар шүүдэг). Өмнө нь hard delete байв.
        const supabase = supabaseAdmin();
        const { data, error } = await supabase
            .from('property_contracts')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
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

        const body = await request.json().catch(() => null);
        // Imported opening balances remain unchanged. New paid amounts must create dated receipts.
        if (body && typeof body === 'object' && RECEIPT_DERIVED_FIELDS.some(key => key in body)) {
            return NextResponse.json({ error: 'Төлсөн дүн, үлдэгдлийг эндээс шууд өөрчлөхгүй. Гэрээний төлбөрийн графикаар орлого бүртгэнэ үү.' }, { status: 400 });
        }
        const parsed = ContractPatchSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Гэрээний өгөгдөл буруу байна' }, { status: 400 });
        const updateData = parsed.data;
        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'Шинэчлэх талбар алга' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        if (updateData.project_id) {
            const { data: project, error } = await supabase.from('projects').select('id')
                .eq('id', updateData.project_id).eq('shop_id', authShop.id).maybeSingle();
            if (error) throw error;
            if (!project) return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 400 });
        }
        const { data, error } = await supabase
            .from('property_contracts')
            .update(updateData)
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Гэрээ олдсонгүй' }, { status: 404 });
        return NextResponse.json({ contract: data });
    } catch (error) {
        logger.error('[Contract Detail API] PATCH error:', { error });
        return NextResponse.json({ error: 'Шинэчлэхэд алдаа гарлаа' }, { status: 500 });
    }
}
