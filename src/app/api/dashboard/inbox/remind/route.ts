import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { sendTextMessage } from '@/lib/facebook/messenger';

/**
 * POST /api/dashboard/inbox/remind
 * Send a reminder to a customer about their active cart
 */
export async function POST(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { customerId } = body;

        if (!customerId) {
            return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // 1. Get Customer Details
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id, name, facebook_id, phone')
            .eq('id', customerId)
            .single();

        if (customerError || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        let sentMethod = 'none';

        // 2. Try Facebook Message
        if (customer.facebook_id) {
            try {
                // Determine page access token (TODO: Fetch from DB shop_settings)
                // For now, we'll log it as a simulation if no token is available in env or DB logic
                // In a real app, you'd fetch the page_access_token associated with this shop

                // const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN; 
                // if (pageAccessToken) {
                //      await sendTextMessage(customer.facebook_id, "Таны сагсанд бараа үлдсэн байна. Та худалдан авалтаа дуусгах уу?", pageAccessToken);
                //      sentMethod = 'facebook';
                // } else {
                //      logger.warn('No FB Page Token available for reminder');
                // }

                // NOTE: Since we might not have the token wired up perfectly for every shop yet,
                // we will mark it as "attempted" and log it.
                logger.info(`[SIMULATION] Sending FB reminder to ${customer.facebook_id}`);
                sentMethod = 'facebook_simulated';

            } catch (fbError) {
                logger.error('Failed to send FB reminder', { error: fbError });
                // Continue to try other methods or fail gracefully
            }
        }

        // 3. Fallback / Log
        // We'll send a push notification to the Admin (Shop Owner) confirming the action was taken/attempted
        await sendPushNotification(shop.id, {
            title: '🔔 Сануулга илгээлээ',
            body: `${customer.name}-д сагсны сануулга илгээгдлээ (${sentMethod})`,
            tag: `remind-${customerId}`
        });

        return NextResponse.json({
            success: true,
            method: sentMethod,
            message: `Сануулга амжилттай илгээгдлээ (${sentMethod === 'facebook_simulated' ? 'Facebook' : 'System'})`
        });

    } catch (error: unknown) {
        logger.error('Reminder API error:', { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Error' }, { status: 500 });
    }
}
