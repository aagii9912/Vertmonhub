// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ write: vi.fn(), shop: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/auth/require-permission', () => ({ requireModule: mocks.write, requireModuleWrite: mocks.write, requireModuleDelete: mocks.write, requireAnyModule: mocks.write }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: mocks.shop }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: mocks.admin }));
import { POST } from '@/app/api/admin/pricing/import/route';
import { BASE_PRICE_CONDITION, type PricingImportFile } from '@/lib/sales/pricing-import';

async function priceList(): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('B2 Блок үнийн санал');
    sheet.mergeCells('B10:L11');
    sheet.getCell('B10').value = 'ELYSIUM Residence B2 блокийн орон сууцны үнийн санал';
    sheet.getCell('B12').value = '2026/10/20-с 2026/12/31 хүртэл хүчинтэй';
    sheet.getRow(14).values = [null, 'Давхар', 'Давхар', 'Талбай', 'Загвар', 'Ашиглалтад орсны дараах үнэ', 0.3, '10-30%'];
    sheet.getCell('G14').numFmt = '0%';
    sheet.getRow(15).values = [null, '3-4 давхар', '03', 51.64, 'D', 8_000_000, 7_200_000, 7_400_000];
    sheet.getCell('H16').value = { formula: 'H15+100000', result: 7_500_000 };
    sheet.getRow(16).getCell(2).value = '5-8 давхар';
    sheet.getRow(16).getCell(5).value = 'D';
    sheet.getRow(16).getCell(7).value = 7_300_000;
    workbook.addWorksheet('Хуучин үнэ', { state: 'hidden' }).getCell('A1').value = 'Давхар';
    return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
const upload = (body: BodyInit | null) => new NextRequest('http://localhost/api/admin/pricing/import', { method: 'POST', body });
const form = (file: Blob, name = 'Б2 үнийн санал.xlsx') => { const data = new FormData(); data.set('file', new File([file], name)); return data; };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockResolvedValue(null); mocks.shop.mockResolvedValue({ id: 'shop' }); mocks.admin.mockResolvedValue({ id: 'actor', role: 'super_admin' });
});

it('needs settings write and super admin before reading the file', async () => {
    mocks.write.mockResolvedValueOnce(NextResponse.json({}, { status: 403 }));
    expect((await POST(upload(form(new Blob([await priceList()]))))).status).toBe(403);
    expect(mocks.write).toHaveBeenCalledWith('settings');
    mocks.admin.mockResolvedValueOnce(null);
    expect((await POST(upload(form(new Blob([await priceList()]))))).status).toBe(403);
});

it('previews the price list with row numbers, cached formula results and percent headers; writes nothing', async () => {
    const response = await POST(upload(form(new Blob([await priceList()]))));
    expect(response.status).toBe(200);
    const result = await response.json() as PricingImportFile;
    expect(result.file).toBe('Б2 үнийн санал.xlsx');
    expect(result.skipped).toEqual([{ name: 'Хуучин үнэ', reason: 'Нуусан лист' }]);
    expect(result.sheets[0]).toMatchObject({ block: 'Б2', valid_from: '2026-10-20', valid_until: '2026-12-31', kind: 'residential' });
    expect(result.sheets[0].rows).toEqual([
        { row: 15, floor_min: 3, floor_max: 4, models: ['D'], prices: { [BASE_PRICE_CONDITION]: 8_000_000, '30%': 7_200_000, '10-30%': 7_400_000 } },
        { row: 16, floor_min: 5, floor_max: 8, models: ['D'], prices: { '30%': 7_300_000, '10-30%': 7_500_000 } },
    ]);
});

it('rejects a missing file, an old .xls file and unreadable content with a message', async () => {
    expect((await POST(upload(new FormData()))).status).toBe(400);
    const xls = await POST(upload(form(new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])]), 'үнэ.xls')));
    expect(xls.status).toBe(400);
    expect((await xls.json()).error).toMatch(/\.xls/);
    const broken = await POST(upload(form(new Blob([new Uint8Array([0x50, 0x4b, 1, 2, 3])]))));
    expect(broken.status).toBe(400);
});
