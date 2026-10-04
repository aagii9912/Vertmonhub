import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withRoute } from '@/lib/api/route';

export const GET = withRoute({ module: 'inbox' }, async ({ shop: authShop }) => {
    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    // Сүүлийн 200 мессеж, харилцагчийн нэртэй. Жагсаалтаас хассан (deleted_at) харилцагчийн яриаг
    // хязгаараас ӨМНӨ хасна — эс бөгөөс устгасан нэг харилцагч бүх 200 мөрийг эзэлж Inbox хоосорно.
    // (Дахин мессеж бичвэл webhook харилцагчийг сэргээнэ.)
    const { data: conversations, error: convoError } = await supabase
        .from('chat_history')
        .select('id, customer_id, message, response, created_at, customers!inner(name, deleted_at)')
        .eq('shop_id', shopId)
        .is('customers.deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

    if (convoError) {
        console.error('Error fetching conversations:', convoError);
        return NextResponse.json({ error: 'Яриануудыг уншиж чадсангүй' }, { status: 500 });
    }

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
                unread_count: 0,
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
