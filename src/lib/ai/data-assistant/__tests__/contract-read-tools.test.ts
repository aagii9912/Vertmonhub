import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from '@/test/memory-db';
import { fetchContractDetails, fetchContracts, fetchContractsSummary, fetchCustomerInsights } from '../functions';

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));

const db = createMemoryDb();
const baseFrom = db.from;
const selects: Array<{ table: string; columns: string }> = [];
db.from = (table: string) => {
    const query = baseFrom(table);
    const select = query.select;
    query.select = (columns: string, options?: unknown) => { selects.push({ table, columns }); return select(columns, options); };
    return query;
};

type Row = Record<string, unknown>;
const contract = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, contract_status: 'active', sales_manager: null, sales_channel: null, block_name: 'Б1',
    total_price: null, prepayment_due: null, paid_amount: null, balance: null, contracted_area: null,
    overdue_amount: null, overdue_as_of: null, overdue_days: 0, contract_date: null, ...values,
});
const LATEST = '2026-10-21';

beforeEach(() => {
    selects.length = 0;
    db.failNext = {};
    db.tables = {
        contract_transfers: [],
        contract_list_imports: [
            { shop_id: 'shop-1', report_date: '2026-10-01', file_name: 'sep.xlsx', row_count: 70, created_at: '2026-10-01T02:00:00Z' },
            { shop_id: 'shop-1', report_date: LATEST, file_name: 'oct.xlsx', row_count: 83, created_at: '2026-10-21T02:00:00Z' },
        ],
        property_contracts: [
            // ERP/HUB-аас ирсэн: төлсөн дүн тодорхойгүй (NULL), хоцролт сүүлийн файлаар.
            contract('erp-1', { total_price: '403416000.00', prepayment_due: 121024800, sales_manager: 'Туршилт Менежер', overdue_amount: '20010000.00', overdue_as_of: LATEST }),
            contract('erp-2', { total_price: 95000000, prepayment_due: 28500000, block_name: 'Б2', overdue_amount: 0, overdue_as_of: LATEST }),
            // Өмнөх файлынх (сүүлийн файлд байгаагүй) — хоцролтын нийлбэрт орохгүй.
            contract('stale', { total_price: 10000000, overdue_amount: 5000000, overdue_as_of: '2026-10-01' }),
            contract('closed', { contract_status: 'closed', total_price: 79700000, paid_amount: 79700000, balance: 0, sales_manager: 'Туршилт Менежер', overdue_days: 3 }),
            contract('cancelled', { contract_status: 'cancelled', total_price: 384675000, prepayment_due: 115402500, sales_manager: 'Туршилт Менежер', overdue_amount: 9, overdue_as_of: LATEST }),
            contract('deleted', { total_price: 999, paid_amount: 999, deleted_at: '2026-10-02T00:00:00Z' }),
            contract('foreign', { shop_id: 'shop-2', total_price: 999, paid_amount: 999 }),
        ],
    };
});

describe('get_contracts_summary', () => {
    it('цуцалсныг тоонд оруулж, дүнгээс хасна; төлсөн дүн NULL бол 0% биш, «+» доод хэмжээ', async () => {
        const result: any = await fetchContractsSummary('shop-1', {});
        expect(result).toMatchObject({
            count: 5, live_count: 4, active: 3, closed: 1, cancelled: 1,
            total_contract_value: '588,116,000₮',
            prepayment_due: '149,524,800₮',
            total_collected: '79,700,000₮+',
            total_outstanding: '0₮+',
            unknown_paid: 3,
            collection_rate_pct: null,
        });
        expect(result.paid_note).toContain('3 гэрээний төлсөн дүн тодорхойгүй');
        expect(result.basis).toContain('цуцалсан гэрээ ОРООГҮЙ');
    });

    it('Төлбөр хоцролт ₮-ийг сүүлийн HUB файлын огноотой мөрөөр, хуучирснаа тусад нь мэдээлнэ', async () => {
        const result: any = await fetchContractsSummary('shop-1', {});
        expect(result).toMatchObject({
            overdue_amount: '20,010,000₮', overdue_as_of: LATEST, overdue_amount_contracts: 1,
            overdue_stale_contracts: 1, overdue_days_contracts: 1,
        });
        expect(result.overdue_note).toContain(`${LATEST}-ны HUB файлын байдлаар`);
    });

    it('менежер, суваг, блокийн задаргаанд цуцалсан гэрээ орохгүй', async () => {
        const result: any = await fetchContractsSummary('shop-1', {});
        expect(result.topManagers).toEqual([
            { name: 'Туршилт Менежер', contracts: 2, total: '483,116,000₮', balance: '0₮+', unknown_paid: 1 },
        ]);
        expect(result.byBlock).toEqual({ Б1: 3, Б2: 1 });
    });

    it('бүх гэрээний төлсөн дүн тодорхойгүй бол цуглуулсан дүн, хувь null («—»)', async () => {
        db.tables.property_contracts = [contract('a', { total_price: 100 }), contract('b', { total_price: 50 })];
        db.tables.contract_list_imports = [];
        const result: any = await fetchContractsSummary('shop-1', {});
        expect(result).toMatchObject({
            total_contract_value: '150₮', total_collected: null, total_outstanding: null, collection_rate_pct: null,
            overdue_amount: null, overdue_as_of: null,
        });
        expect(result.paid_note).toContain('Цуглуулсан дүн, хувь мэдэгдэхгүй');
        expect(result.overdue_note).toContain('бүртгэгдээгүй');
    });

    it('бүх төлсөн дүн мэдэгдэж байвал цуглуулалтын хувийг тооцно', async () => {
        db.tables.property_contracts = [
            contract('a', { total_price: 200, paid_amount: 50, balance: 150 }),
            contract('x', { contract_status: 'cancelled', total_price: 1000, paid_amount: null }),
        ];
        const result: any = await fetchContractsSummary('shop-1', {});
        expect(result).toMatchObject({ total_collected: '50₮', total_outstanding: '150₮', collection_rate_pct: 25, unknown_paid: 0 });
        expect(result).not.toHaveProperty('paid_note');
    });

    it('1000-аас олон гэрээг бүгдийг нь нэгтгэж, блокоор шүүнэ', async () => {
        db.tables.property_contracts = [
            ...Array.from({ length: 1000 }, (_, i) => contract(`c${String(i).padStart(4, '0')}`, { total_price: 1, paid_amount: 1, balance: 0 })),
            contract('z-last', { total_price: 75, paid_amount: 0, balance: 75 }),
            contract('z-b2', { block_name: 'Б2', total_price: 5, paid_amount: 5, balance: 0 }),
        ];
        expect(await fetchContractsSummary('shop-1', {})).toMatchObject({ count: 1002, total_contract_value: '1,080₮' });
        expect(await fetchContractsSummary('shop-1', { block_name: 'Б2' })).toMatchObject({ count: 1, total_contract_value: '5₮' });
    });

    it('уншилтын алдааг хоосон статистик болгохгүй', async () => {
        db.failNext.property_contracts = { code: '57014', message: 'timeout' };
        expect(await fetchContractsSummary('shop-1', {})).toEqual({ error: 'Алдаа: timeout' });
        db.failNext.contract_list_imports = { code: '42P01', message: 'relation "contract_list_imports" does not exist' };
        expect(await fetchContractsSummary('shop-1', {})).toMatchObject({ error: expect.stringContaining('contract_list_imports') });
    });
});

describe('list_contracts', () => {
    it('HUB загварын талбарыг (захиалгын огноо, нөхцөл, хоцролт, нэр/овог) буцаана', async () => {
        db.tables.property_contracts = [contract('hub', {
            unit_label: 'Б1-19 (B1)', order_date: '2026-09-15', contract_date: '2026-09-15', payment_condition: 'Банкны зээл',
            customer_name: 'Туршилт.Нэр', customer_first_name: 'Туршилт', customer_last_name: 'Нэр',
            total_price: 403416000, prepayment_due: 121024800, overdue_amount: 20010000, overdue_as_of: LATEST,
        })];
        const result: any = await fetchContracts('shop-1', {});
        const columns = selects.find(s => s.table === 'property_contracts')!.columns;
        for (const field of ['order_date', 'payment_condition', 'overdue_amount', 'overdue_as_of', 'customer_first_name', 'customer_last_name', 'prepayment_due', 'product_type']) {
            expect(columns).toContain(field);
        }
        expect(result.contracts[0]).toMatchObject({
            order_date: '2026-09-15', payment_condition: 'Банкны зээл', overdue_as_of: LATEST,
            overdue_amount_fmt: '20,010,000₮', prepayment_due_fmt: '121,024,800₮', paid_amount_fmt: '-', balance_fmt: '-',
        });
    });

    it('«хоцролттой» нь Төлбөр хоцролт ₮ > 0 эсвэл хуваарийн хоног > 0; төлөвөөр цуцалсныг ч хайна', async () => {
        db.tables.property_contracts = [
            contract('amount', { overdue_amount: 5, overdue_days: 0, contract_date: '2026-10-03' }),
            contract('days', { overdue_amount: 0, overdue_days: 4, contract_date: '2026-10-02' }),
            contract('none', { overdue_amount: null, overdue_days: 0, contract_date: '2026-10-01' }),
            contract('gone', { contract_status: 'cancelled', contract_date: '2026-09-01' }),
        ];
        const overdue: any = await fetchContracts('shop-1', { overdue_only: true });
        expect(overdue.contracts.map((c: Row) => c.id)).toEqual(['amount', 'days']);
        const cancelled: any = await fetchContracts('shop-1', { status: 'cancelled' });
        expect(cancelled.contracts.map((c: Row) => c.id)).toEqual(['gone']);
        expect(await fetchContracts('shop-1', { status: 'идэвхтэй' })).toMatchObject({ error: expect.stringContaining('active, closed, cancelled') });
    });
});

describe('get_contract_details', () => {
    it('HUB талбар, хоцролтын огноо ба тодорхойгүй төлсөн дүнгийн тайлбарыг буцаана', async () => {
        db.tables.property_contracts = [contract('hub', {
            contract_number: 'EL-001', order_date: '2026-09-15', payment_condition: 'Бэлэн', notes: 'Гэрээний жагсаалтаас импортолсон.',
            customer_first_name: 'Туршилт', customer_last_name: 'Нэр', total_price: 95000000, overdue_amount: 0, overdue_as_of: LATEST,
        })];
        const result: any = await fetchContractDetails('shop-1', { contract_number: 'EL-001' });
        const columns = selects.find(s => s.table === 'property_contracts')!.columns;
        for (const field of ['order_date', 'payment_condition', 'overdue_amount', 'overdue_as_of', 'customer_first_name', 'customer_last_name', 'notes']) {
            expect(columns).toContain(field);
        }
        expect(columns.split(',').map(c => c.trim()).filter((c, i, all) => all.indexOf(c) !== i)).toEqual([]);
        expect(result.contract).toMatchObject({
            order_date: '2026-09-15', payment_condition: 'Бэлэн', overdue_amount_fmt: '0₮', paid_amount_fmt: '-',
            overdue_note: `Төлбөр хоцролт ${LATEST}-ны HUB файлын байдлаар.`,
            paid_note: expect.stringContaining('0 гэж тооцохгүй'),
        });
    });

    it('төлсөн дүн мэдэгдэж байвал тайлбар нэмэхгүй', async () => {
        db.tables.property_contracts = [contract('known', { contract_number: 'MG-1', total_price: 100, paid_amount: 40, balance: 60 })];
        const result: any = await fetchContractDetails('shop-1', { contract_number: 'MG-1' });
        expect(result.contract.paid_amount_fmt).toBe('40₮');
        expect(result.contract).not.toHaveProperty('paid_note');
        expect(result.contract).not.toHaveProperty('overdue_note');
    });
});

describe('get_customer_insights', () => {
    beforeEach(() => {
        db.tables.customers = [{ id: 'cust-1', shop_id: 'shop-1', deleted_at: null, name: 'Туршилт', phone: '99112233', created_at: '2026-10-01T00:00:00Z' }];
        db.tables.leads = [];
        db.tables.property_contracts = [
            contract('mine', { customer_phone: '99112233', contract_date: '2026-09-15', order_date: '2026-09-15', overdue_amount: 0, overdue_as_of: LATEST }),
            contract('deleted', { customer_phone: '99112233', deleted_at: '2026-10-02T00:00:00Z' }),
        ];
    });

    it('устгасан гэрээг харуулахгүй, HUB талбарыг буцаана', async () => {
        const result: any = await fetchCustomerInsights('shop-1', { customer_id: 'cust-1' });
        expect(result.contracts.map((c: Row) => c.id)).toEqual(['mine']);
        expect(result.contracts[0]).toMatchObject({ order_date: '2026-09-15', overdue_as_of: LATEST });
        expect(result).not.toHaveProperty('contracts_error');
    });

    it('гэрээний уншилтын алдааг «гэрээгүй» гэж нуухгүй', async () => {
        db.failNext.property_contracts = { code: '42703', message: 'column property_contracts.overdue_amount does not exist' };
        const result: any = await fetchCustomerInsights('shop-1', { customer_id: 'cust-1' });
        expect(result.contracts).toEqual([]);
        expect(result.contracts_error).toContain('Гэрээгүй гэж бүү дүгнэ');
    });
});
