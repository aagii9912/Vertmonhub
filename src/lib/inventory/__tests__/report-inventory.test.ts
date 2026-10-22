import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb } from '@/test/memory-db';
import { loadReportInventory, overlayContracts } from '../report-inventory';

type Row = Record<string, unknown>;
const unit = (code: string, values: Row = {}): Row => ({
    shop_id: 's', code, block: 'Б1', floor: '12', model: 'E5', category: 'residential', rooms: 3, sale_area: '79.91', updated_sale_area: '0',
    status: 'available', raw_status: 'Худалдаанд', sales_channel: null, sales_manager: null, updated_at: '2026-10-05T00:00:00Z', ...values,
});
const contract = (id: string, unitLabel: string, values: Row = {}): Row => ({
    id, shop_id: 's', product_type: 'residential', unit_label: unitLabel, contract_status: 'active', contract_date: '2026-10-08',
    sales_manager: 'Хонгорзул.Мөнхгэрэл', sales_channel: 'Пропертис', contracted_area: '79.70', deleted_at: null, ...values,
});
const productColumns = ['Код', 'Бүтээгдэхүүний төрөл', 'Бүтээгдэхүүний төлөв', 'Давхар', 'Загвар', 'Нийт борлуулах үнэ'];
const products = (reportDate: string, rows: Row[]): Row => ({
    id: `p-${reportDate}`, shop_id: 's', source: 'Elysium ERP', report_date: reportDate, sequence: 1,
    datasets: [{ name: 'P', columns: productColumns, keyColumns: [], rows }],
});
const hub = (reportDate: string): Row => ({ shop_id: 's', report_date: reportDate, file_name: 'HUB data 1.xlsx', row_count: 83, created_at: `${reportDate}T14:32:00Z`, created_by_name: null });
const asDb = (db: unknown) => db as SupabaseClient;
// Snapshot-ын мета (жагсаалтын JSON-path сонголтыг memory-db дуурайдаггүй; Лхагвын тайлан ч метаг дамжуулдаг).
const meta = (reportDate: string) => [{ id: `p-${reportDate}`, source: 'Elysium ERP', report_date: reportDate, kind: 'products' as const }];

describe('overlayContracts', () => {
    it('marks units with a live contract as sold and folds stale sold units without a contract back to sale', () => {
        const { rows, unmatched } = overlayContracts([
            unit('Б1-53') as never,
            // ERP «Хүлээлгэсэн» гэсэн ч амьд гэрээгүй — худалдаанд; цуцалсан борлуулалтын менежер харагдахгүй.
            unit('Б1-96', { status: 'handed_over', raw_status: 'Хүлээлгэсэн', sales_manager: 'Чанцалдулам.Раднаа' }) as never,
            unit('Б1-61', { status: 'reserved', raw_status: 'Хадгалсан' }) as never,
            // Бартерыг төлөвөөр нь үлдээнэ (гэрээгүй ч).
            unit('Б2-190', { block: 'Б2', status: 'ordered', raw_status: 'Захиалга үүссэн', sales_channel: 'Бартер', sales_manager: 'Хонгорзул.Мөнхгэрэл' }) as never,
            // Ижил код өөр ангилалд (зогсоол) — гэрээ зөвхөн өөрийн ангилалд.
            unit('Б1-13 (01)', { category: 'parking', floor: '01', model: 'A-1' }) as never,
            unit('Б1-13 (01)', { category: 'industry', floor: '01', model: null }) as never,
        ], [
            contract('c1', 'Б1-53') as never,
            contract('c2', 'Б1-13 (01), Зогсоол', { product_type: 'parking', contracted_area: '12.5' }) as never,
            contract('c3', 'Б9-1') as never,
        ]);
        const byKey = new Map(rows.map(row => [row.key, row]));
        expect(byKey.get('residential|Б1-53')).toMatchObject({ status: 'sold', statusLabel: 'Гэрээтэй', manager: 'Хонгорзул.Мөнхгэрэл', area: 79.7 });
        expect(byKey.get('residential|Б1-96')).toMatchObject({ status: 'available', manager: null, statusLabel: 'Хүлээлгэсэн · амьд гэрээгүй' });
        expect(byKey.get('residential|Б1-61')).toMatchObject({ status: 'reserved', manager: null });
        expect(byKey.get('residential|Б2-190')).toMatchObject({ status: 'ordered', barter: true, manager: null });
        expect(byKey.get('parking|Б1-13 (01)')).toMatchObject({ status: 'sold', area: 12.5 });
        expect(byKey.get('industry|Б1-13 (01)')).toMatchObject({ status: 'available' });
        expect(unmatched).toBe(1);
    });

    it('never borrows a stale register manager for a live contract without one, and takes barter from the contract channel too', () => {
        const { rows } = overlayContracts([
            unit('Б1-96', { sales_manager: 'Чанцалдулам.Раднаа' }) as never,
            unit('Б1-97') as never,
        ], [
            contract('resale', 'Б1-96', { sales_manager: null }) as never,
            contract('barter', 'Б1-97', { sales_channel: 'Бартер' }) as never,
        ]);
        expect(rows[0]).toMatchObject({ status: 'sold', manager: null });
        expect(rows[1]).toMatchObject({ status: 'sold', barter: true });
    });

    it('takes the newest of several active contracts on one unit', () => {
        const { rows } = overlayContracts([unit('Б1-1') as never], [
            contract('newer', 'Б1-1', { contract_date: '2026-09-01', sales_manager: 'New' }) as never,
            contract('older', 'Б1-1', { contract_date: '2026-01-01', sales_manager: 'Old' }) as never,
        ]);
        expect(rows[0].manager).toBe('New');
        const reversed = overlayContracts([unit('Б1-1') as never], [
            contract('older', 'Б1-1', { contract_date: '2026-01-01', sales_manager: 'Old' }) as never,
            contract('newer', 'Б1-1', { contract_date: '2026-09-01', sales_manager: 'New' }) as never,
        ]);
        expect(reversed.rows[0].manager).toBe('New');
    });

    it('prefers a closed contract, then active, then the newest date when a unit has several live contracts', () => {
        const { rows } = overlayContracts([unit('Б1-1', { status: 'sold' }) as never], [
            contract('old', 'Б1-1', { contract_date: '2026-01-01', sales_manager: 'Old' }) as never,
            contract('closed', 'Б1-1', { contract_status: 'closed', contract_date: '2025-12-01', sales_manager: 'Closed' }) as never,
            contract('new', 'Б1-1', { contract_date: '2026-09-01', sales_manager: 'New' }) as never,
        ]);
        expect(rows[0]).toMatchObject({ status: 'sold', statusLabel: 'Гэрээ хаасан', manager: 'Closed' });
    });
});

describe('loadReportInventory', () => {
    const erpRow = { 'Код': 'Б1-53', 'Бүтээгдэхүүний төрөл': 'Орон сууц', 'Бүтээгдэхүүний төлөв': 'Худалдаанд', 'Давхар': '12', 'Загвар': 'E5', 'Нийт борлуулах үнэ': '591334000' };

    it('overlays live contracts on the unit register when the HUB import is newer than the product export, with ERP prices on request', async () => {
        const db = createMemoryDb({
            erp_imports: [products('2026-09-26', [erpRow])],
            contract_list_imports: [hub('2026-10-22')],
            property_units: [unit('Б1-53'), unit('Б1-54', { model: 'E6' })],
            property_contracts: [contract('c1', 'Б1-53'), contract('gone', 'Б1-54', { contract_status: 'cancelled' }), contract('deleted', 'Б1-54', { deleted_at: '2026-10-10T00:00:00Z' })],
        });
        const inventory = await loadReportInventory(asDb(db), 's', '2026-10-28', { metas: meta('2026-09-26'), withErpPrice: true });
        expect(inventory!.info).toEqual({ date: '2026-10-22', source: 'HUB гэрээ «HUB data 1.xlsx» + байрны бүртгэл', kind: 'contracts' });
        expect(inventory!.priceAsOf).toBe('2026-09-26');
        expect(inventory!.rows.map(row => [row.code, row.status, row.price])).toEqual([['Б1-53', 'sold', 591_334_000], ['Б1-54', 'available', null]]);

        const withoutPrice = await loadReportInventory(asDb(db), 's', '2026-10-28', { metas: meta('2026-09-26') });
        expect(withoutPrice!.rows[0].price).toBeNull();
        expect(withoutPrice!.priceAsOf).toBeNull();
    });

    it('keeps the product export when it is newer than the HUB import, or for a meeting before the import', async () => {
        const db = createMemoryDb({
            erp_imports: [products('2026-10-25', [erpRow])],
            contract_list_imports: [hub('2026-10-22')],
            property_units: [unit('Б1-53')],
            property_contracts: [contract('c1', 'Б1-53')],
        });
        expect((await loadReportInventory(asDb(db), 's', '2026-10-28', { metas: meta('2026-10-25') }))!.info).toEqual({ date: '2026-10-25', source: 'Elysium ERP', kind: 'erp' });
        const before = createMemoryDb({ erp_imports: [products('2026-09-26', [erpRow])], contract_list_imports: [hub('2026-10-22')] });
        expect((await loadReportInventory(asDb(before), 's', '2026-10-14', { metas: meta('2026-09-26') }))!.info.kind).toBe('erp');
    });

    it('falls back to the unit register only when allowed, and treats a missing import table as no import', async () => {
        const db = createMemoryDb({ erp_imports: [], contract_list_imports: [], property_units: [unit('Б1-53', { status: 'sold' })] });
        db.failNext.contract_list_imports = { code: '42P01', message: 'relation does not exist' };
        const inventory = await loadReportInventory(asDb(db), 's', '2026-10-28', { metas: [] });
        expect(inventory!.info).toEqual({ date: '2026-10-05', source: 'Байрны бүртгэл (CRM)', kind: 'crm' });
        // Байрны бүртгэлийн горимд төлөвийг өөрчлөхгүй (гэрээ давхарлахгүй).
        expect(inventory!.rows[0].status).toBe('sold');
        expect(await loadReportInventory(asDb(db), 's', '2026-10-28', { metas: [], unitsFallback: false })).toBeNull();
    });

    it('surfaces read failures instead of an empty inventory', async () => {
        const db = createMemoryDb({ erp_imports: [], contract_list_imports: [hub('2026-10-22')], property_units: [], property_contracts: [] });
        db.failNext.property_contracts = { code: '57014', message: 'timeout' };
        await expect(loadReportInventory(asDb(db), 's', '2026-10-28', { metas: [] })).rejects.toBeTruthy();
    });
});
