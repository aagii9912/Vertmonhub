import { NextRequest, NextResponse } from 'next/server';
import { getClerkUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTextMessage } from '@/lib/facebook/messenger';

export async function POST(request: NextRequest) {
    try {
        const authShop = await getClerkUserShop();

        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { customerId, message } = await request.json();

        if (!customerId || !message) {
            return NextResponse.json({ error: 'customerId and message are required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get customer's Facebook ID
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('facebook_id')
            .eq('id', customerId)
            .eq('shop_id', authShop.id)
            .single();

        if (customerError || !customer?.facebook_id) {
            return NextResponse.json({ error: 'Customer not found or no Facebook ID' }, { status: 404 });
        }

        // Get shop's Facebook page access token
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('facebook_page_access_token')
            .eq('id', authShop.id)
            .single();

        if (shopError || !shop?.facebook_page_access_token) {
            return NextResponse.json({ error: 'Shop not configured with Facebook' }, { status: 400 });
        }

        // Send message to Facebook Messenger
        await sendTextMessage({
            recipientId: customer.facebook_id,
            message: message,
            pageAccessToken: shop.facebook_page_access_token,
        });

        // Save message to chat_history
        await supabase.from('chat_history').insert({
            shop_id: authShop.id,
            customer_id: customerId,
            message: '', // User message is empty for shop replies
            response: message, // Shop's reply goes in response
            intent: 'human_reply',
        });

        // Admin Takeover: Pause AI for 30 minutes
        const pauseTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await supabase
            .from('customers')
            .update({ ai_paused_until: pauseTime })
            .eq('id', customerId);



        return NextResponse.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Reply API error:', error);
        return NextResponse.json({
            error: 'Мессеж илгээхэд алдаа гарлаа'
        }, { status: 500 });
    }
}
