import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase';
import { loadReportInventory, type ReportInventory } from '@/lib/inventory/report-inventory';
import type { ErpProduct } from '@/lib/erp/records';
import { GET } from '../route';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/inventory/report-inventory', () => ({ loadReportInventory: vi.fn() }));

const projectId = '7e96e44e-32e3-4fec-b1f7-2205d2064e7c';
const shopId = '00000000-0000-0000-0000-000000000001';

function get(authorization: string | null = 'Bearer feed-secret') {
    return new Request('http://localhost/api/integrations/orshin/inventory', {
        headers: authorization ? { authorization } : {},
    }) as Parameters<typeof GET>[0];
}

const product = (over: Partial<ErpProduct>): ErpProduct => ({
    key: 'residential|Б1-53', code: 'Б1-53', block: 'Б1', floor: 12, model: 'E5', kind: 'residential', rooms: 3, area: 79.91,
    price: 412_000_000, status: 'sold', statusLabel: 'Гэрээтэй', barter: true, manager: 'Номин.Одончимэг', ...over,
});

const inventory = (rows: ErpProduct[]): ReportInventory => ({
    info: { date: '2026-11-13', source: 'HUB гэрээ «list.xlsx» + байрны бүртгэл', kind: 'contracts' },
    rows, priceAsOf: '2026-10-05', unmatchedContracts: 2,
});

describe('Orshin inventory feed', () => {
    let project: { data: unknown; error: unknown };

    beforeEach(() => {
        vi.stubEnv('ORSHIN_INVENTORY_SECRET', 'feed-secret');
        vi.stubEnv('ORSHIN_INVENTORY_PROJECT_ID', projectId);
        project = { data: { id: projectId, shop_id: shopId, name: 'Elysium Residence' }, error: null };
        vi.mocked(supabaseAdmin).mockReturnValue({
            from(table: string) {
                if (table !== 'projects') throw new Error(`Unexpected table: ${table}`);
                return { select: () => ({ eq: () => ({ maybeSingle: async () => project }) }) };
            },
        } as never);
        vi.mocked(loadReportInventory).mockReset();
        vi.mocked(loadReportInventory).mockResolvedValue(inventory([
            product({}),
            product({ key: 'parking|Б1-1 (B1)', code: 'Б1-1 (B1)', kind: 'parking', floor: null, model: 'A-2', status: 'available', statusLabel: 'Худалдаанд' }),
            product({ key: 'residential|Б2-113', code: 'Б2-113', block: 'Б2', floor: 2, model: 'C', status: null }),
        ]));
    });

    it('тохируулаагүй бол 503, өгөгдөл уншихгүй', async () => {
        vi.stubEnv('ORSHIN_INVENTORY_SECRET', '');
        expect((await GET(get())).status).toBe(503);
        vi.stubEnv('ORSHIN_INVENTORY_SECRET', 'feed-secret');
        vi.stubEnv('ORSHIN_INVENTORY_PROJECT_ID', '');
        expect((await GET(get())).status).toBe(503);
        expect(loadReportInventory).not.toHaveBeenCalled();
    });

    it('токенгүй эсвэл буруу токен 401', async () => {
        for (const header of [null, 'Bearer wrong', 'feed-secret', 'Basic feed-secret', 'Bearer feed-secretx', 'bearer feed-secret']) {
            const response = await GET(get(header));
            expect(response.status, String(header)).toBe(401);
            expect(await response.json()).toEqual({ error: 'Unauthorized' });
        }
        expect(loadReportInventory).not.toHaveBeenCalled();
    });

    it('тохируулсан төслийн байрыг тайлангийн дүрмээр, зөвхөн таних талбар ба төлөвтэй буцаана', async () => {
        const response = await GET(get());
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(vi.mocked(loadReportInventory).mock.calls[0][1]).toBe(shopId);
        expect(vi.mocked(loadReportInventory).mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(await response.json()).toEqual({
            project: 'Elysium Residence',
            asOf: '2026-11-13',
            source: 'contracts',
            units: [
                { code: 'Б1-53', kind: 'residential', block: 'Б1', floor: 12, model: 'E5', status: 'sold' },
                { code: 'Б1-1 (B1)', kind: 'parking', block: 'Б1', floor: null, model: 'A-2', status: 'available' },
                { code: 'Б2-113', kind: 'residential', block: 'Б2', floor: 2, model: 'C', status: null },
            ],
        });
    });

    it('үнэ, менежер, талбай, бартер, дотоод тайлбар хариунд хэзээ ч гарахгүй', async () => {
        const text = await (await GET(get())).text();
        for (const secret of ['412000000', 'Номин', 'Гэрээтэй', '79.91', 'barter', 'manager', 'price', 'statusLabel', 'list.xlsx', shopId]) {
            expect(text, secret).not.toContain(secret);
        }
    });

    it('төсөл олдохгүй эсвэл байр бүртгэгдээгүй бол 503', async () => {
        project = { data: null, error: null };
        expect((await GET(get())).status).toBe(503);
        project = { data: { id: projectId, shop_id: shopId, name: 'Elysium Residence' }, error: null };
        vi.mocked(loadReportInventory).mockResolvedValue(null);
        expect((await GET(get())).status).toBe(503);
    });

    it('уншилтын алдаа 500 (хоосон нөөц гэж хариулахгүй)', async () => {
        vi.mocked(loadReportInventory).mockRejectedValue(new Error('db down'));
        const response = await GET(get());
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Байрны төлөв уншихад алдаа гарлаа' });
    });
});
