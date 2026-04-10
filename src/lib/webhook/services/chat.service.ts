import { supabaseAdmin } from '@/lib/supabase';
import type { ChatMessage as AIChatMessage } from '@/types/ai';

interface ChatHistoryEntry {
    message: string;
    response: string;
}

export async function getChatHistory(shopId: string, customerId: string): Promise<AIChatMessage[]> {
    const supabase = supabaseAdmin();

    const { data: historyData } = await supabase
        .from('chat_history')
        .select('message, response')
        .eq('shop_id', shopId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5);

    const history: AIChatMessage[] = [];
    if (historyData) {
        historyData.reverse().forEach((h: ChatHistoryEntry) => {
            if (h.message) {
                history.push({ role: 'user', content: h.message });
            }
            if (h.response) {
                history.push({ role: 'assistant', content: h.response });
            }
        });
    }
    return history;
}

export async function saveChatHistory(
    shopId: string,
    customerId: string | undefined,
    message: string,
    response: string,
    intent: string
): Promise<void> {
    const supabase = supabaseAdmin();

    await supabase.from('chat_history').insert({
        shop_id: shopId,
        customer_id: customerId,
        message,
        response,
        intent
    });
}
