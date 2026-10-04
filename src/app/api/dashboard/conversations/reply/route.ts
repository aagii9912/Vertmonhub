import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { replyToCustomer } from '@/lib/services/CustomerOps';

export const POST = withRoute({ module: 'inbox', access: 'write', error: 'Мессеж илгээхэд алдаа гарлаа' }, async ({ request, shop: authShop }) => {
    const { customerId, message } = await request.json();

    if (!customerId || !message) {
        return NextResponse.json({ error: 'customerId and message are required' }, { status: 400 });
    }

    const r = await replyToCustomer(supabaseAdmin(), authShop.id, customerId, message);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

    return NextResponse.json({ success: true, message: 'Message sent successfully' });
});
