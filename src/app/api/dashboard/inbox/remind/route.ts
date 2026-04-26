import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { sendPushNotification } from '@/lib/notifications';
import { sendTextMessage } from '@/lib/facebook/messenger';

const remindSchema = z.object({
    customerId: z.string().uuid(),
    message: z.string().min(1).max(1000).optional(),
});

const DEFAULT_MESSAGE = 'Сайн байна уу! Үзэхээр сонирхож байсан байрны талаар нэмэлт мэдээлэл хэрэгтэй юу? 😊';

/**
 * POST /api/dashboard/inbox/remind
 * Send a follow-up message to a customer over Facebook Messenger,
 * using the shop's stored page access token. Falls back to a push
 * notification to the sales manager if the customer can't be reached
 * (no facebook_id, or no shop FB integration).
 */
export async function POST(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = remindSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { customerId, message = DEFAULT_MESSAGE } = parsed.data;

        const supabase = supabaseAdmin();

        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id, name, facebook_id, phone')
            .eq('id', customerId)
            .eq('shop_id', shop.id)
            .single();

        if (customerError || !customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        const { data: shopRow } = await supabase
            .from('shops')
            .select('facebook_page_access_token')
            .eq('id', shop.id)
            .single();

        const pageAccessToken = shopRow?.facebook_page_access_token ?? process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
        let sentMethod: 'facebook' | 'none' = 'none';

        if (customer.facebook_id && pageAccessToken) {
            try {
                await sendTextMessage({
                    recipientId: customer.facebook_id,
                    message,
                    pageAccessToken,
                });
                sentMethod = 'facebook';

                await supabase.from('chat_history').insert({
                    shop_id: shop.id,
                    customer_id: customer.id,
                    message: '',
                    response: message,
                    intent: 'manager_reminder',
                });
            } catch (fbError) {
                logger.error('Failed to send FB reminder', {
                    customerId: customer.id,
                    error: fbError instanceof Error ? fbError.message : String(fbError),
                });
            }
        }

        await sendPushNotification(shop.id, {
            title: sentMethod === 'facebook' ? '🔔 Сануулга илгээгдлээ' : '⚠️ Сануулга илгээгдсэнгүй',
            body:
                sentMethod === 'facebook'
                    ? `${customer.name}-д Facebook-аар сануулга илгээлээ`
                    : `${customer.name}-руу Facebook-аар хүрч чадсангүй (${customer.phone ? 'утсаар холбогдоно уу' : 'холбоо барих утас алга'})`,
            tag: `remind-${customerId}`,
        });

        return NextResponse.json({
            success: true,
            method: sentMethod,
            sent: sentMethod === 'facebook',
        });
    } catch (error: unknown) {
        logger.error('Reminder API error:', {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Error' },
            { status: 500 }
        );
    }
}
