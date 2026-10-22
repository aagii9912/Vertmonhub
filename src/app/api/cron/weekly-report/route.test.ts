// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '@/test/memory-db';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ push: vi.fn(), email: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/notifications', () => ({ sendPushNotification: mocks.push }));
vi.mock('@/lib/email/email', () => ({ sendWeeklyReportEmail: mocks.email }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));

const db = createMemoryDb();
const contract = (id: string, values: Record<string, unknown>) => ({
    id, shop_id: 'shop-1', deleted_at: null, contract_status: 'active', created_at: '2026-10-18T10:00:00Z', ...values,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.push.mockResolvedValue({ success: 1, failed: 0 });
    mocks.email.mockResolvedValue(true);
    vi.stubEnv('DIGEST_EMAIL', 'director@example.test');
    vi.useFakeTimers();
    // Даваа 01:00 УБ (UTC-ээр ням гараг) — УБ-ийн өдөр UTC-ийнхээс өөр.
    vi.setSystemTime(new Date('2026-10-18T17:00:00Z'));
    db.failNext = {};
    db.tables = {
        shops: [{ id: 'shop-1', name: 'Туршилт төсөл' }],
        leads: [], property_viewings: [],
        property_contracts: [
            contract('first-day', { contract_date: '2026-10-12' }),
            contract('last-day', { contract_date: '2026-10-18', contract_status: 'closed' }),
            contract('no-status', { contract_date: '2026-10-15', contract_status: null }),
            contract('today', { contract_date: '2026-10-19' }),
            contract('before', { contract_date: '2026-10-11' }),
            contract('cancelled', { contract_date: '2026-10-15', contract_status: 'cancelled' }),
            contract('deleted', { contract_date: '2026-10-15', deleted_at: '2026-10-16T00:00:00Z' }),
            // Энэ долоо хоногт импортоор нэмэгдсэн хуучин гэрээ — «шинэ» биш.
            contract('imported', { contract_date: '2025-12-12' }),
            contract('undated', { contract_date: null }),
            contract('foreign', { shop_id: 'shop-2', contract_date: '2026-10-15' }),
        ],
    };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('weekly report cron', () => {
    it('шинэ гэрээг өнгөрсөн 7 УБ өдрийн гэрээний огноогоор, цуцалсан/устгасныг хасаж тоолно', async () => {
        const response = await GET(new Request('http://localhost/api/cron/weekly-report'));
        const body = await response.json();
        expect(body.results).toEqual([expect.objectContaining({ shop: 'Туршилт төсөл', newContracts: 3, emailed: true })]);
        expect(mocks.email).toHaveBeenCalledWith('director@example.test', expect.objectContaining({
            newContracts: 3, weekStart: '2026-10-12', weekEnd: '2026-10-19',
        }));
    });

    it('гэрээний уншилт алдаатай бол «0 шинэ гэрээ» гэж илгээхгүй', async () => {
        db.failNext.property_contracts = { code: '57014', message: 'timeout' };
        const body = await (await GET(new Request('http://localhost/api/cron/weekly-report'))).json();
        expect(body.results).toEqual([{ shop: 'Туршилт төсөл', error: true }]);
        expect(mocks.email).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();
        expect(mocks.logError).toHaveBeenCalledWith('[WeeklyReport] shop error:', expect.objectContaining({ shopId: 'shop-1' }));
    });
});
