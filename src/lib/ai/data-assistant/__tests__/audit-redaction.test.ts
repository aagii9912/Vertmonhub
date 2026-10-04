// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts = vi.hoisted(() => [] as Array<{ table: string; row: Record<string, unknown> }>);
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => ({
            insert: async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: null }; },
        }),
    }),
}));

import { logAiAudit, redactAuditArgs } from '../audit';

beforeEach(() => { inserts.length = 0; });

describe('AI audit args', () => {
    it('stores invite_user without the staff phone value (admin-level roles read the AI audit)', async () => {
        const args = { email: 'new@example.invalid', role: 'sales_manager', full_name: 'Шинэ Менежер', phone: '99112233', shop_id: 'shop-1' };
        await logAiAudit({ shopId: 'shop-1', userId: 'actor', tool: 'invite_user', args, success: true });
        expect(inserts).toEqual([{ table: 'ai_audit_log', row: {
            shop_id: 'shop-1', user_id: 'actor', tool: 'invite_user', success: true,
            args: { email: 'new@example.invalid', role: 'sales_manager', full_name: 'Шинэ Менежер', phone: '(нуусан)', shop_id: 'shop-1' },
        } }]);
        expect(JSON.stringify(inserts)).not.toContain('99112233');
        // Дуудагчийн args-ийг өөрчлөхгүй.
        expect(args.phone).toBe('99112233');
    });

    it('keeps an absent phone absent and leaves other tools untouched', () => {
        expect(redactAuditArgs('invite_user', { email: 'a@example.invalid', phone: null })).toEqual({ email: 'a@example.invalid', phone: null });
        expect(redactAuditArgs('invite_user', { email: 'a@example.invalid' })).toEqual({ email: 'a@example.invalid' });
        const leadArgs = { customer_name: 'Бат', phone: '99112233' };
        expect(redactAuditArgs('create_lead', leadArgs)).toBe(leadArgs);
        expect(redactAuditArgs('invite_user')).toEqual({});
    });
});
