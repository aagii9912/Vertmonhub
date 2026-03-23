import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveApiUser } from '@/lib/auth/resolve-user';

/**
 * GET /api/ai-assistant/conversations
 * List all conversations for the current user + shop
 */
export async function GET(req: Request) {
    try {
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const shopId = searchParams.get('shopId');
        if (!shopId) {
            return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('ai_conversations')
            .select('id, title, mode, created_at, updated_at')
            .eq('user_id', user.id)
            .eq('shop_id', shopId)
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Failed to list conversations:', error);
            return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
        }

        return NextResponse.json({ conversations: data || [] });
    } catch (error) {
        console.error('Conversations GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/ai-assistant/conversations
 * Create a new conversation
 */
export async function POST(req: Request) {
    try {
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { shopId, title, mode } = await req.json();
        if (!shopId) {
            return NextResponse.json({ error: 'shopId is required' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('ai_conversations')
            .insert({
                user_id: user.id,
                shop_id: shopId,
                title: title || 'Шинэ харилцан яриа',
                mode: mode || 'data',
            })
            .select('id, title, mode, created_at, updated_at')
            .single();

        if (error) {
            console.error('Failed to create conversation:', error);
            return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
        }

        return NextResponse.json({ conversation: data });
    } catch (error) {
        console.error('Conversations POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
