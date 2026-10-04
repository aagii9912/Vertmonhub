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
            let rows = table === 'customers' ? state.customers : [];
            const chain: Record<string, unknown> = {};
            for (const method of ['select', 'eq', 'not', 'is', 'order']) chain[method] = () => chain;
            chain.range = (from: number, to: number) => { rows = rows.slice(from, to + 1); return chain; };
            // PostgREST нэг хариунд дээд тал нь 1000 мөр өгдөг.
            chain.then = (resolve: (value: { data: typeof rows; error: null }) => unknown) => Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(resolve);
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

    it('counts every customer past the 1000-row response cap', async () => {
        vi.setSystemTime(new Date('2026-10-04T04:00:00Z'));
        state.customers = Array.from({ length: 1006 }, () => ({ created_at: '2026-01-01T00:00:00Z', quality_tier: 'A' }));
        const body = await (await GET()).json();
        expect(body.health.total).toBe(1006);
        expect(body.health.tiers.A).toBe(1006);
    });
});
