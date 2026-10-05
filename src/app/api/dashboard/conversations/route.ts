import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';
import { awaitingReplyByCustomer, recentInboxMessages } from '@/lib/inbox/conversations';

export const GET = withRoute({ module: 'inbox' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();

    // Сүүлийн 200 мессеж, харилцагчийн нэртэй (устгасан харилцагчгүй) — навигацийн тоотой нэг query.
    const { data: conversations, error: convoError } = await recentInboxMessages(supabase, authShop.id);

    if (convoError) {
        console.error('Error fetching conversations:', convoError);
        return NextResponse.json({ error: 'Яриануудыг уншиж чадсангүй' }, { status: 500 });
    }

    // unread_count = сүүлийн хариунаас хойш ирсэн харилцагчийн мессеж (nav-counts-ийн «inbox»-той нэг дүрэм).
    const awaiting = awaitingReplyByCustomer(conversations ?? []);

    // Group messages by customer_id and get latest info
    const customerMap = new Map<string, any>();

    conversations?.forEach((chat: any) => {
        const customerId = chat.customer_id;
        if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
                id: customerId,
                customer_name: chat.customers?.name || 'Зочин',
                customer_avatar: null,
                last_message: chat.message || chat.response || '',
                last_message_at: chat.created_at,
                unread_count: awaiting.get(customerId) ?? 0,
                messages: []
            });
        }

        // Each chat record has both user message and assistant response
        const msgs = customerMap.get(customerId).messages;

        // Add user message if exists
        if (chat.message) {
            msgs.push({
                id: `${chat.id}-user`,
                role: 'user',
                content: chat.message,
                created_at: chat.created_at
            });
        }

        // Add assistant response if exists
        if (chat.response) {
            msgs.push({
                id: `${chat.id}-assistant`,
                role: 'assistant',
                content: chat.response,
                created_at: chat.created_at
            });
        }
    });

    // Convert map to array for response
    const groupedConversations = Array.from(customerMap.values());

    return NextResponse.json({ conversations: groupedConversations });
});
