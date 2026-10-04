import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { softDeleteCustomer } from '@/lib/services/CustomerOps';
import { withRoute } from '@/lib/api/route';

// Get single customer with full details
export const GET = withRoute<{ id: string }>({ module: 'customers' }, async ({ shop: authShop, params }) => {
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
});

/** Харилцагчийг жагсаалтаас хасна (сэргээх боломжтой; чатны түүх хадгалагдана). */
export const DELETE = withRoute<{ id: string }>({ module: 'customers', access: 'delete', error: 'Харилцагчийг устгаж чадсангүй' }, async ({ shop: authShop, params }) => {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Харилцагчийн ID буруу байна' }, { status: 400 });
    const result = await softDeleteCustomer(supabaseAdmin(), authShop.id, id);
    if ('error' in result) {
        return NextResponse.json({ error: result.status === 404 ? result.error : 'Харилцагчийг устгаж чадсангүй' }, { status: result.status });
    }
    return NextResponse.json({ success: true });
});
