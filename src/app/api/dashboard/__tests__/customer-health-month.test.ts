import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ customers: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/auth/require-permission', () => ({ requireModule: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: vi.fn().mockResolvedValue({ id: 'shop-1' }) }));
vi.mock('@/lib/sales/project-scope', () => ({
    resolveSalesProjectScope: vi.fn().mockResolvedValue({ restricted: false }),
    applyLeadScope: (query: unknown) => query,
    ProjectScopeError: class extends Error { status = 403; },
}));
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: () => ({
        from: (table: string) => {
            const result = { data: table === 'customers' ? state.customers : [], error: null };
            const chain: Record<string, unknown> = {};
            for (const method of ['select', 'eq', 'not']) chain[method] = () => chain;
            chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
            return chain;
        },
    }),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '../customer-health/route';

describe('customer health month boundary', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
        // Vercel ажилладаг шиг UTC сервер.
        process.env.TZ = 'UTC';
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
        process.env.TZ = originalTz;
    });

    it('counts new customers by the Ulaanbaatar month even on a UTC server', async () => {
        // УБ-ийн 10-01 04:00 нь UTC-ээр 09-30 хэвээр.
        vi.setSystemTime(new Date('2026-09-30T20:00:00Z'));
        state.customers = [
            { created_at: '2026-09-30T17:00:00Z' }, // УБ 10-01 01:00 → энэ сар
            { created_at: '2026-09-30T15:00:00Z' }, // УБ 09-30 23:00 → өмнөх сар
        ];
        const body = await (await GET()).json();
        expect(body.health.newThisMonth).toBe(1);
    });
});
