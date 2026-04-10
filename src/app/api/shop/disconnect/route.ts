import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/shop/disconnect
 * Disconnect a platform (Facebook or Instagram) from the shop
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getAuthUser();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { platform } = body;

        if (!platform || !['facebook', 'instagram'].includes(platform)) {
            return NextResponse.json(
                { error: 'Invalid platform. Must be "facebook" or "instagram"' },
                { status: 400 }
            );
        }

        const supabase = supabaseAdmin();

        // Get user's active shop
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
        }

        // Clear platform-specific fields
        let updateData: Record<string, null> = {};

        if (platform === 'facebook') {
            updateData = {
                facebook_page_id: null,
                facebook_page_name: null,
                facebook_page_username: null,
                facebook_page_access_token: null,
            };
        } else if (platform === 'instagram') {
            updateData = {
                instagram_business_account_id: null,
                instagram_username: null,
                instagram_access_token: null,
            };
        }

        const { error: updateError } = await supabase
            .from('shops')
            .update(updateData)
            .eq('id', shop.id);

        if (updateError) {
            logger.error('Disconnect error:', { error: updateError });
            return NextResponse.json(
                { error: 'Failed to disconnect platform' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `${platform} disconnected successfully`,
        });
    } catch (error: unknown) {
        logger.error('Disconnect API error:', { error: error });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
