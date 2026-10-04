import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { groupChatRows, loadCustomerChat } from '../conversations';

const row = (id: string, customer: string, message: string, response: string, at: string) =>
    ({ id, customer_id: customer, message, response, created_at: at, customers: { name: customer === 'c1' ? 'Болд' : 'Сараа' } });

describe('Inbox conversations shared by the API and the AI', () => {
    it('groups newest-first rows by customer and flags chats awaiting a reply', () => {
        const conversations = groupChatRows([
            row('3', 'c1', 'Үнэ хэд вэ?', '', '2026-10-04T05:00:00Z'),
            row('2', 'c2', '', 'Сайн байна уу, тусалъя', '2026-10-04T04:00:00Z'),
            row('1', 'c1', 'Сайн уу', 'Сайн байна уу', '2026-10-03T04:00:00Z'),
            row('0', 'c2', 'Байр байна уу?', '', '2026-10-03T03:00:00Z'),
        ]);
        expect(conversations.map((c) => [c.customer_name, c.awaiting_reply, c.last_message])).toEqual([
            ['Болд', true, 'Үнэ хэд вэ?'],
            ['Сараа', false, 'Сайн байна уу, тусалъя'],
        ]);
        expect(conversations[0].messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    });

    it('returns one customer chat oldest first, telling staff replies from legacy bot replies', async () => {
        const chain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [
                { id: '2', message: '', response: 'Маргааш залгая', intent: 'human_reply', created_at: '2026-10-04T05:00:00Z' },
                { id: '1', message: 'Байр байна уу?', response: 'Тийм', intent: 'property_search', created_at: '2026-10-03T05:00:00Z' },
            ], error: null }),
        };
        const db = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
        expect(await loadCustomerChat(db, 'shop-1', 'c1', 10)).toEqual([
            { from: 'customer', text: 'Байр байна уу?', at: '2026-10-03T05:00:00Z' },
            { from: 'bot', text: 'Тийм', at: '2026-10-03T05:00:00Z' },
            { from: 'staff', text: 'Маргааш залгая', at: '2026-10-04T05:00:00Z' },
        ]);
        expect(chain.eq).toHaveBeenCalledWith('shop_id', 'shop-1');
        expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1');
    });
});
