import { NextRequest, NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';

// POST - Subscribe to push notifications
export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { subscription } = body;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        // Upsert subscription (update if exists, insert if new)
        const { data, error } = await supabase
            .from('push_subscriptions')
            .upsert({
                shop_id: shopId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                user_agent: request.headers.get('user-agent') || 'unknown',
            }, {
                onConflict: 'endpoint',
                ignoreDuplicates: false,
            })
            .select()
            .single();

        if (error) {
            console.error('Subscription error:', error);
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Push notification subscribed!',
            id: data.id
        });
    } catch (error) {
        console.error('Push subscribe error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
    try {
        const authShop = await getUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { endpoint } = body;

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        return NextResponse.json({ success: true, message: 'Unsubscribed' });
    } catch (error) {
        console.error('Push unsubscribe error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
