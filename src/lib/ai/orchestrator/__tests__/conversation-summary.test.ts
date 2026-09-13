import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadConversationSummary, maybeUpdateSummary } from '../memory';

function database() {
    const row = { id: 'known-conversation', user_id: 'owner', shop_id: 'shop-1', summary: 'Private contract discussion', summary_message_count: 12 };
    const from = vi.fn((table: string) => {
        const filters: Array<[string, unknown]> = [];
        return {
            select: vi.fn().mockReturnThis(),
            eq(column: string, value: unknown) { filters.push([column, value]); return this; },
            async maybeSingle() {
                expect(table).toBe('ai_conversations');
                return { data: filters.every(([column, value]) => row[column as keyof typeof row] === value) ? row : null, error: null };
            },
        };
    });
    return { db: { from } as unknown as SupabaseClient, from };
}

describe('conversation summary ownership with a service-role client', () => {
    it('reads only the current user and shop conversation', async () => {
        const { db } = database();
        expect(await loadConversationSummary(db, 'known-conversation', { userId: 'owner', shopId: 'shop-1' })).toMatchObject({ summary: 'Private contract discussion' });
        expect(await loadConversationSummary(db, 'known-conversation', { userId: 'other-user', shopId: 'shop-1' })).toBeNull();
        expect(await loadConversationSummary(db, 'known-conversation', { userId: 'owner', shopId: 'other-shop' })).toBeNull();
    });

    it('never reads messages or updates a summary for a known but unowned conversation', async () => {
        const { db, from } = database();
        await maybeUpdateSummary(db, 'known-conversation', { userId: 'other-user', shopId: 'shop-1' });
        expect(from).toHaveBeenCalledExactlyOnceWith('ai_conversations');
        from.mockClear();
        expect(await loadConversationSummary(db, 'known-conversation', { userId: '', shopId: 'shop-1' })).toBeNull();
        expect(from).not.toHaveBeenCalled();
    });
});
