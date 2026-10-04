import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { requireModule, requireModuleDelete } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { softDeleteCustomer } from '@/lib/services/CustomerOps';
import { logger } from '@/lib/utils/logger';

// Get single customer with full details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModule('customers');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const supabase = supabaseAdmin();

        // Get customer
        const { data: customer, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', id)
            .eq('shop_id', authShop.id)
            .is('deleted_at', null)
            .single();

        if (error || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // Get recent chat history
        const { data: chatHistory } = await supabase
            .from('chat_history')
            .select('message, response, created_at')
            .eq('customer_id', id)
            .order('created_at', { ascending: false })
            .limit(10);

        // Get service logs (requests / complaints / letters) for this customer
        const { data: serviceLogs } = await supabase
            .from('service_logs')
            .select('id, type, subject, description, status, priority, created_at, resolved_at')
            .eq('customer_id', id)
            .eq('shop_id', authShop.id)
            .order('created_at', { ascending: false })
            .limit(50);

        return NextResponse.json({
            customer: {
                ...customer,
                chat_history: chatHistory || [],
                service_logs: serviceLogs || [],
            }
        });
    } catch (error) {
        console.error('Customer detail error:', error);
        return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
    }
}

/** Харилцагчийг жагсаалтаас хасна (сэргээх боломжтой; чатны түүх хадгалагдана). */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const denied = await requireModuleDelete('customers');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Харилцагчийн ID буруу байна' }, { status: 400 });
        const result = await softDeleteCustomer(supabaseAdmin(), authShop.id, id);
        if ('error' in result) {
            return NextResponse.json({ error: result.status === 404 ? result.error : 'Харилцагчийг устгаж чадсангүй' }, { status: result.status });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('[Customers] delete failed', { error });
        return NextResponse.json({ error: 'Харилцагчийг устгаж чадсангүй' }, { status: 500 });
    }
}
