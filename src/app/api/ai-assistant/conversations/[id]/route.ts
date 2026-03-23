import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveApiUser } from '@/lib/auth/resolve-user';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/ai-assistant/conversations/[id]
 * Fetch all messages for a conversation
 */
export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = supabaseAdmin();

        // Verify ownership
        const { data: conv } = await db
            .from('ai_conversations')
            .select('id, user_id, title, mode')
            .eq('id', id)
            .single();

        if (!conv || conv.user_id !== user.id) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Fetch messages
        const { data: messages, error } = await db
            .from('ai_messages')
            .select('id, role, content, chart_config, data, created_at')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Failed to fetch messages:', error);
            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
        }

        return NextResponse.json({
            conversation: { id: conv.id, title: conv.title, mode: conv.mode },
            messages: messages || [],
        });
    } catch (error) {
        console.error('Conversation GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/ai-assistant/conversations/[id]
 * Rename a conversation
 */
export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { title } = await req.json();
        if (!title || !title.trim()) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const db = supabaseAdmin();
        const { data, error } = await db
            .from('ai_conversations')
            .update({ title: title.trim() })
            .eq('id', id)
            .eq('user_id', user.id)
            .select('id, title')
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Not found or update failed' }, { status: 404 });
        }

        return NextResponse.json({ conversation: data });
    } catch (error) {
        console.error('Conversation PATCH error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/ai-assistant/conversations/[id]
 * Delete a conversation and all its messages
 */
export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const user = await resolveApiUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const db = supabaseAdmin();
        const { error } = await db
            .from('ai_conversations')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) {
            console.error('Failed to delete conversation:', error);
            return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Conversation DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
