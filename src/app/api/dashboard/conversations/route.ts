import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { loadInboxConversations } from '@/lib/inbox/conversations';
import { logger } from '@/lib/utils/logger';

/** GET /api/dashboard/conversations — сүүлийн 200 мессежийг харилцагчаар (nav-counts ба AI `list_conversations`-тэй нэг уншилт, нэг «хариу хүлээж буй» дүрэм). */
export const GET = withRoute({ module: 'inbox' }, async ({ shop: authShop }) => {
    try {
        const conversations = await loadInboxConversations(supabaseAdmin(), authShop.id);
        return NextResponse.json({ conversations });
    } catch (error) {
        logger.error('Error fetching conversations:', { error });
        return NextResponse.json({ error: 'Яриануудыг уншиж чадсангүй' }, { status: 500 });
    }
});
