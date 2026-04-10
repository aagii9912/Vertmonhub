import { logger } from '@/lib/utils/logger';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import {
    getAllAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
} from '@/lib/services/CommentAutomationService';

/**
 * Helper: get shop ID for authenticated user
 */
async function getShopId(request: NextRequest): Promise<string | null> {
    const userId = await getAuthUser();
    if (!userId) return null;

    const shopId = request.headers.get('x-shop-id');
    if (shopId) return shopId;

    // Fallback: get first active shop
    const supabase = supabaseAdmin();
    const { data } = await supabase
        .from('shops')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

    return data?.id || null;
}

/**
 * GET /api/dashboard/comment-automations
 * List all automations for the shop
 */
export async function GET(request: NextRequest) {
    try {
        const shopId = await getShopId(request);
        if (!shopId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const automations = await getAllAutomations(shopId);
        return NextResponse.json({ automations });
    } catch (error: unknown) {
        logger.error('GET comment-automations error:', { error: error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/dashboard/comment-automations
 * Create a new automation
 */
export async function POST(request: NextRequest) {
    try {
        const shopId = await getShopId(request);
        if (!shopId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, trigger_keywords, dm_message, match_type, action_type, reply_message, platform, post_id, post_url } = body;

        if (!name || !trigger_keywords?.length || !dm_message) {
            return NextResponse.json(
                { error: 'name, trigger_keywords, dm_message шаардлагатай' },
                { status: 400 }
            );
        }

        const automation = await createAutomation(shopId, {
            name,
            trigger_keywords,
            dm_message,
            match_type,
            action_type,
            reply_message,
            platform,
            post_id,
            post_url,
        });

        if (!automation) {
            return NextResponse.json({ error: 'Automation үүсгэж чадсангүй' }, { status: 500 });
        }

        return NextResponse.json({ automation }, { status: 201 });
    } catch (error: unknown) {
        logger.error('POST comment-automations error:', { error: error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/dashboard/comment-automations
 * Update an existing automation
 */
export async function PATCH(request: NextRequest) {
    try {
        const shopId = await getShopId(request);
        if (!shopId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });
        }

        const automation = await updateAutomation(id, shopId, updates);
        if (!automation) {
            return NextResponse.json({ error: 'Automation олдсонгүй' }, { status: 404 });
        }

        return NextResponse.json({ automation });
    } catch (error: unknown) {
        logger.error('PATCH comment-automations error:', { error: error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/dashboard/comment-automations
 * Delete an automation
 */
export async function DELETE(request: NextRequest) {
    try {
        const shopId = await getShopId(request);
        if (!shopId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id шаардлагатай' }, { status: 400 });
        }

        const success = await deleteAutomation(id, shopId);
        if (!success) {
            return NextResponse.json({ error: 'Устгаж чадсангүй' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error('DELETE comment-automations error:', { error: error });
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
