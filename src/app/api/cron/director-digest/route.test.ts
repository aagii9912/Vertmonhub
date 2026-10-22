// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '@/test/memory-db';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ email: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: mocks.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/auth/cron', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/email/email', () => ({ sendDirectorDigestEmail: mocks.email }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));

const db = createMemoryDb();
type Row = Record<string, unknown>;
const contract = (id: string, shopId: string, values: Row): Row => ({
    id, shop_id: shopId, deleted_at: null, contract_status: 'active', contract_date: null, total_price: 0,
    paid_amount: null, balance: null, overdue_amount: null, overdue_as_of: null, overdue_days: 0, ...values,
});
const HUB_DATE = '2026-10-18';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.email.mockResolvedValue(true);
    vi.stubEnv('DIGEST_EMAIL', 'director@example.test');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z')); // 16:00 УБ → «өчигдөр» = 2026-10-19
    db.failNext = {};
    db.tables = {
        shops: [{ id: 'hub', name: 'HUB төсөл' }, { id: 'crm', name: 'CRM төсөл' }],
        leads: [
            { id: 'l-new', shop_id: 'hub', deleted_at: null, created_at: '2026-10-20T01:00:00Z' },
            { id: 'l-deleted', shop_id: 'hub', deleted_at: '2026-10-20T02:00:00Z', created_at: '2026-10-20T01:30:00Z' },
            { id: 'l-old', shop_id: 'hub', deleted_at: null, created_at: '2026-10-18T01:00:00Z' },
        ],
        sales_managers: [{ shop_id: 'hub', name: 'Туршилт Менежер', is_active: true }],
        manager_performance: [{ shop_id: 'hub', sales_manager: 'Туршилт Менежер', contract_count: 1, total_sales: 100, total_collected: null }],
        contract_list_imports: [{ shop_id: 'hub', report_date: HUB_DATE, file_name: 'hub.xlsx', row_count: 4, created_at: '2026-10-18T02:00:00Z' }],
        property_contracts: [
            // HUB/ERP төсөл: төлсөн дүн тодорхойгүй, хоцролт файлаар.
            contract('a', 'hub', { contract_date: '2026-10-19', total_price: 100, overdue_amount: 20, overdue_as_of: HUB_DATE }),
            contract('b', 'hub', { contract_date: '2026-10-20', total_price: 50, overdue_amount: 0, overdue_as_of: HUB_DATE, overdue_days: 7 }),
            contract('c', 'hub', { contract_date: '2026-09-01', total_price: 30, overdue_amount: 5, overdue_as_of: '2026-10-01', overdue_days: 2 }),
            contract('f', 'hub', { contract_status: 'closed', total_price: 70 }),
            contract('cancelled', 'hub', { contract_status: 'cancelled', contract_date: '2026-10-19', total_price: 999, overdue_amount: 100, overdue_as_of: HUB_DATE }),
            contract('deleted', 'hub', { contract_date: '2026-10-19', total_price: 999, deleted_at: '2026-10-19T00:00:00Z', overdue_days: 5 }),
            // CRM төсөл: импортгүй, хуваарийн хоцролт.
            contract('g', 'crm', { contract_date: '2026-10-19', total_price: 200, paid_amount: 50, balance: 150, overdue_days: 3 }),
            contract('h', 'crm', { contract_status: 'closed', contract_date: '2026-10-18', total_price: 100, paid_amount: 100, balance: 0 }),
            contract('i', 'crm', { total_price: 10, paid_amount: null }),
        ],
    };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const run = async () => (await GET(new Request('http://localhost/api/cron/director-digest'))).json();
const digestFor = (shopName: string) => mocks.email.mock.calls.find(([, digest]) => digest.shopName === shopName)?.[1];

describe('director digest cron', () => {
    it('устгасан, цуцалсан гэрээг хасаж; хоцролтыг HUB-ийн Төлбөр хоцролт ₮-өөр (мэдэгдэж байвал) тоолно', async () => {
        await run();
        expect(digestFor('HUB төсөл')).toMatchObject({
            date: '2026-10-19',
            newLeads: 1,
            newContracts: 2,
            // «f» (хаагдсан) огноогүй — шинэ гэрээний тоо доод хэмжээ.
            undatedContracts: 1,
            activeContracts: 3,
            totalSales: 250,
            collected: null,
            collectedPartial: false,
            overdueCount: 2,
            overdueAmount: 20,
            overdueAsOf: HUB_DATE,
            topManagers: [{ name: 'Туршилт Менежер', contracts: 1, sales: 100 }],
        });
    });

    it('импортгүй төсөлд хуваарийн хоногоор; төлсөн дүн заримдаа тодорхойгүй бол мэдэгдэж буй нийлбэр', async () => {
        await run();
        expect(digestFor('CRM төсөл')).toMatchObject({
            newLeads: 0, newContracts: 1, undatedContracts: 1, activeContracts: 2, totalSales: 310, collected: 150, collectedPartial: true,
            overdueCount: 1, overdueAmount: null, overdueAsOf: null, topManagers: [],
        });
    });

    it('нэг төслийн уншилтын алдаа бусдыг зогсоохгүй, алдаатай төслийг 0 гэж илгээхгүй', async () => {
        db.failNext.property_contracts = { code: '57014', message: 'timeout' };
        const body = await run();
        expect(body.results).toEqual([
            { shop: 'HUB төсөл', error: true },
            expect.objectContaining({ shop: 'CRM төсөл', emailed: true }),
        ]);
        expect(mocks.email).toHaveBeenCalledTimes(1);
        expect(mocks.logError).toHaveBeenCalledWith('[DirectorDigest] shop error:', expect.objectContaining({ shopId: 'hub' }));
    });
});
