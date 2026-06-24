/**
 * executeCalculateLoan unit tests
 * Зээлийн тооцооллын валидаци ба томьёоны зөв байдал
 */

import { describe, it, expect, vi } from 'vitest';

// ToolExecutor нь модуль ачаалахдаа эдгээрийг импортолдог тул mock хийнэ.
// executeCalculateLoan өөрөө DB/push ашигладаггүй (pure тооцоо).
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ sendPushNotification: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../tools/memory', () => ({ saveCustomerPreference: vi.fn() }));

import { executeCalculateLoan } from '@/lib/ai/services/ToolExecutor';

describe('executeCalculateLoan', () => {
    it('computes a positive monthly payment for valid input', async () => {
        const res = await executeCalculateLoan({ amount: 100_000_000, years: 15, rate: 12.5 });
        expect(res.success).toBe(true);
        expect(res.data?.monthly_payment).toBeGreaterThan(0);
        expect(Number.isFinite(res.data?.monthly_payment)).toBe(true);
    });

    it('handles zero interest without dividing by zero', async () => {
        const res = await executeCalculateLoan({ amount: 12_000_000, years: 1, rate: 0 });
        expect(res.success).toBe(true);
        // 12,000,000 / 12 сар = 1,000,000
        expect(res.data?.monthly_payment).toBe(1_000_000);
        expect(res.data?.total_interest).toBe(0);
    });

    it('rejects non-positive amount', async () => {
        const res = await executeCalculateLoan({ amount: 0, years: 10 });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/дүн/);
    });

    it('rejects non-positive years', async () => {
        const res = await executeCalculateLoan({ amount: 100_000_000, years: 0 });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/хугацаа/);
    });

    it('rejects negative rate', async () => {
        const res = await executeCalculateLoan({ amount: 100_000_000, years: 10, rate: -5 });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/хүү/);
    });

    it('rejects down payment >= amount', async () => {
        const res = await executeCalculateLoan({ amount: 100_000_000, years: 10, down_payment: 100_000_000 });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/Урьдчилгаа/);
    });
});
