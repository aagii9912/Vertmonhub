import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { replyToCustomer } from '@/lib/services/CustomerOps';

export async function POST(request: NextRequest) {
    try {
        const denied = await requireWrite();
        if (denied) return denied;

        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { customerId, message, aiPauseMode = 'pause' } = await request.json();

        if (!customerId || !message) {
            return NextResponse.json({ error: 'customerId and message are required' }, { status: 400 });
        }

        const r = await replyToCustomer(supabaseAdmin(), authShop.id, customerId, message, aiPauseMode === 'off' ? 'off' : 'pause');
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });

        return NextResponse.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Reply API error:', error);
        return NextResponse.json({
            error: 'Мессеж илгээхэд алдаа гарлаа'
        }, { status: 500 });
    }
}
