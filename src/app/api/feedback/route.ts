/**
 * Feedback API - Save feedback to database
 */

import { NextResponse } from 'next/server';
import { getAuthUser, supabaseAdmin } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';

export async function POST(request: Request) {
    try {
        const userId = await getAuthUser();
        const supabase = supabaseAdmin();
        const body = await request.json();

        const { type, message, email } = body;

        if (!message) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        // Get shop info if logged in
        let shopId = null;
        let shopName = null;

        if (userId) {
            const { data: shop } = await supabase
                .from('shops')
                .select('id, name')
                .eq('user_id', userId)
                .single();

            if (shop) {
                shopId = shop.id;
                shopName = shop.name;
            }
        }

        // Save feedback
        const { error: insertError } = await supabase
            .from('feedback')
            .insert({
                type,
                message,
                email: email || null,
                shop_id: shopId,
                metadata: {
                    shop_name: shopName,
                    user_agent: request.headers.get('user-agent'),
                    url: request.headers.get('referer')
                }
            });

        if (insertError) {
            // If table doesn't exist, just log the feedback
            logger.info('Feedback received (table may not exist)', { type });
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        logger.error('Feedback API error:', { error: error });
        return NextResponse.json(
            { error: 'Failed to save feedback' },
            { status: 500 }
        );
    }
}
