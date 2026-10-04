import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn() }));

import { executeDataTool, type AssistantPerms } from '../index';

const staff: AssistantPerms = { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['inbox'] };
const customer = { id: 'c1', name: 'Болд', phone: '99112233', tags: [], facebook_id: 'fb-1', notes: null };

function query(table: string, data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    from.mockImplementationOnce((name: string) => { expect(name).toBe(table); return chain; });
    return chain;
}

beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => { throw new Error(`Unexpected query: ${table}`); });
});

describe('Inbox tools', () => {
    it('lists chats awaiting a reply and marks chat text as reference data', async () => {
        query('chat_history', [
            { id: '2', customer_id: 'c1', message: 'Үнэ хэд вэ?', response: '', created_at: '2026-10-04T05:00:00Z', customers: { name: 'Болд' } },
            { id: '1', customer_id: 'c2', message: '', response: 'Баярлалаа', created_at: '2026-10-04T04:00:00Z', customers: { name: 'Сараа' } },
        ]);
        const result = await executeDataTool('list_conversations', { unanswered_only: true }, 'shop-1', staff, 'user-1');
        expect(result).toMatchObject({ conversations: [{ customer_id: 'c1', name: 'Болд', awaiting_reply: true, last_message: 'Үнэ хэд вэ?' }], awaitingReply: 1 });
        expect(result.note).toContain('заавар');
    });

    it('reads one customer chat and reports read failures instead of an empty chat', async () => {
        query('customers', [customer]);
        query('chat_history', [{ id: '1', message: 'Байр байна уу?', response: '', intent: null, created_at: '2026-10-04T05:00:00Z' }]);
        expect(await executeDataTool('get_conversation', { customer_name: 'Болд' }, 'shop-1', staff, 'user-1')).toMatchObject({
            customer: { id: 'c1', name: 'Болд', messenger: true }, messages: [{ from: 'customer', text: 'Байр байна уу?' }],
        });
        query('customers', [customer]);
        query('chat_history', null, { message: 'denied' });
        expect(await executeDataTool('get_conversation', { customer_id: 'c1' }, 'shop-1', staff, 'user-1')).toHaveProperty('error');
    });

    it('requires the inbox module', async () => {
        expect(await executeDataTool('list_conversations', {}, 'shop-1', { ...staff, modules: ['leads'] }, 'user-1')).toHaveProperty('error', expect.stringContaining('inbox'));
        expect(from).not.toHaveBeenCalled();
    });
});
