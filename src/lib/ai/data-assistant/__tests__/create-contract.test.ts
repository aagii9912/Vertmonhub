import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTRACT_ORDER_DATE_MISSING_ON_CONFIRM, CONTRACT_ORDER_DATE_REQUIRED, DEFAULT_CONTRACT_SALES_CHANNEL, createContract } from '../functions';
import { NOT_CANCELLED_CONTRACT } from '@/lib/contracts/live';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: {} as Record<string, Row[]>, reads: [] as string[], inserted: [] as Row[], fail: null as string | null }));

/** Хүснэгтийн хуулбар дээр PostgREST-ийн хэрэгтэй хэсэг (eq/is/not/or/limit, insert). */
function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let insert: Row | undefined;
    let single = false;
    let cap = Infinity;
    const chain: Record<string, any> = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
        is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return chain; },
        not: (key: string, op: string, value: unknown) => { expect(op).toBe('is'); filters.push(row => (row[key] ?? null) !== value); return chain; },
        or: (expression: string) => { expect(expression).toBe(NOT_CANCELLED_CONTRACT); filters.push(row => row.contract_status !== 'cancelled'); return chain; },
        order: () => chain,
        limit: (n: number) => { cap = n; return chain; },
        insert: (row: Row) => { insert = row; return chain; },
        single: () => { single = true; return chain; },
        maybeSingle: () => { single = true; return chain; },
        then: (resolve: (value: unknown) => unknown) => {
            if (insert) {
                const row = { id: 'created', ...insert };
                (state.rows[table] ??= []).push(row);
                state.inserted.push(insert);
                return Promise.resolve({ data: single ? row : [row], error: null }).then(resolve);
            }
            state.reads.push(table);
            if (state.fail === table) return Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } }).then(resolve);
            const matches = (state.rows[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(0, cap);
            return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve);
        },
    };
    return chain;
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock('@/lib/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const contract = (values: Row): Row => ({ shop_id: 'shop', deleted_at: null, contract_status: 'active', ...values });
const base = { customer_name: 'Энхтуяа', total_price: 100, block_name: 'Б1', unit_number: '53', order_date: '2026-10-15' };

const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'UTC'; });
afterAll(() => { process.env.TZ = originalTz; });
beforeEach(() => {
    // Сервер UTC-д 10-25 16:30 — Улаанбаатарт аль хэдийн 10-26 00:30.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T16:30:00Z'));
    state.rows = { property_contracts: [], contract_list_imports: [] };
    state.reads = [];
    state.inserted = [];
    state.fail = null;
});
afterEach(() => { vi.useRealTimers(); });

describe('AI create_contract — order date', () => {
    it('asks for the order date instead of dating the contract the day the AI runs', async () => {
        for (const order_date of [undefined, '', '   ']) {
            expect(await createContract('shop', { ...base, order_date })).toEqual({ error: CONTRACT_ORDER_DATE_REQUIRED, missingFields: ['order_date'] });
            // Огноогүй карт батлагдвал ажилтанд (загварт биш) ойлгомжтой хэлж, юу ч бичихгүй.
            expect(await createContract('shop', { ...base, order_date }, true)).toEqual({ error: CONTRACT_ORDER_DATE_MISSING_ON_CONFIRM });
        }
        expect(state.reads).toEqual([]);
        expect(state.inserted).toEqual([]);
    });

    it.each([
        ['2026/10/15', 'YYYY-MM-DD'],
        ['15-10-2026', 'YYYY-MM-DD'],
        ['2026-10-5', 'YYYY-MM-DD'],
        ['2026-02-30', 'хуанлид байхгүй'],
        ['2026-13-01', 'хуанлид байхгүй'],
        ['1999-12-31', '2000 оноос өмнө'],
        ['0202-10-01', '2000 оноос өмнө'],
        ['2026-10-27', 'өнөөдрөөс хойш'],
    ])('rejects order date %s before any read or write (PATCH order_date rule)', async (orderDate, message) => {
        for (const confirm of [false, true]) {
            expect(await createContract('shop', { ...base, order_date: orderDate }, confirm)).toHaveProperty('error', expect.stringContaining(message));
        }
        expect(state.reads).toEqual([]);
        expect(state.inserted).toEqual([]);
    });

    it('accepts today in Ulaanbaatar while the server (UTC) day is still the previous one', async () => {
        expect(await createContract('shop', { ...base, order_date: '2026-10-26' })).toMatchObject({ requiresConfirmation: true });
        expect(await createContract('shop', { ...base, order_date: '2000-01-01' })).toMatchObject({ requiresConfirmation: true });
    });

    it('shows the order date and the data-vocabulary channel in the preview and keeps them in the card', async () => {
        const preview = await createContract('shop', { ...base, order_date: ' 2026-10-15 ' });
        expect(preview).toMatchObject({
            requiresConfirmation: true,
            action: { tool: 'create_contract', args: { order_date: '2026-10-15', sales_channel: 'Пропертис' } },
            preview: { 'Захиалга өгсөн огноо': '2026-10-15', Суваг: 'Пропертис' },
        });
        expect(state.reads).toEqual([]);
    });
});

describe('AI create_contract — stored fields', () => {
    it('dates a CRM project contract by its order and keeps paid 0 (column default) with balance = price', async () => {
        state.rows.property_contracts.push(contract({ id: 'old', paid_amount: 40 }), contract({ id: 'erp', paid_amount: null }));
        const result = await createContract('shop', base, true, 'Батаа');
        expect(result).toMatchObject({ success: true, contractId: 'created', message: expect.stringContaining('2026-10-15') });
        expect(state.inserted).toHaveLength(1);
        const row = state.inserted[0];
        expect(row).toMatchObject({
            shop_id: 'shop', customer_name: 'Энхтуяа', total_price: 100, balance: 100, order_date: '2026-10-15', contract_date: '2026-10-15',
            sales_channel: DEFAULT_CONTRACT_SALES_CHANNEL, sales_manager: 'Батаа', contract_status: 'active',
        });
        expect(row).not.toHaveProperty('paid_amount');
    });

    it('leaves paid and balance unknown (NULL, never 0₮) when the project keeps its contracts in the ERP HUB list', async () => {
        state.rows.contract_list_imports.push({ shop_id: 'shop', report_date: '2026-10-22', file_name: 'HUB data 1.xlsx', row_count: 83, created_at: '2026-10-22T14:32:00Z', created_by_name: 'Админ' });
        // HUB-тэй төсөлд өмнө нь гараар (paid 0-ээр) үүссэн гэрээ байсан ч ERP хөтөлсөөр.
        state.rows.property_contracts.push(contract({ id: 'manual', paid_amount: 0 }));
        const result = await createContract('shop', base, true, 'Батаа');
        expect(result).toMatchObject({ success: true, message: expect.stringContaining('«—»') });
        expect(state.inserted[0]).toMatchObject({ paid_amount: null, balance: null, total_price: 100, order_date: '2026-10-15', contract_date: '2026-10-15' });
    });

    it('leaves paid and balance unknown in an ERP product-export project (every live contract paid unknown)', async () => {
        state.rows.property_contracts.push(
            contract({ id: 'erp-1', paid_amount: null }),
            contract({ id: 'erp-2', paid_amount: null, contract_status: 'closed' }),
            // Цуцалсан, устгасан гэрээ «амьд» биш — тэдгээрийн мэдэгдэж буй дүн дүгнэлтийг өөрчлөхгүй.
            contract({ id: 'cancelled', paid_amount: 10, contract_status: 'cancelled' }),
            contract({ id: 'deleted', paid_amount: 10, deleted_at: '2026-10-01T00:00:00Z' }),
            contract({ id: 'other-shop', shop_id: 'other', paid_amount: 10 }),
        );
        expect(await createContract('shop', base, true)).toMatchObject({ success: true });
        expect(state.inserted[0]).toMatchObject({ paid_amount: null, balance: null });
    });

    it('ignores another project\'s HUB import and keeps the CRM default for an empty project', async () => {
        state.rows.contract_list_imports.push({ shop_id: 'other', report_date: '2026-10-22', row_count: 1 });
        expect(await createContract('shop', base, true)).toMatchObject({ success: true });
        expect(state.inserted[0]).toMatchObject({ balance: 100 });
        expect(state.inserted[0]).not.toHaveProperty('paid_amount');
    });

    it.each(['property_contracts', 'contract_list_imports'])('fails closed without writing when %s cannot be read', async (table) => {
        state.fail = table;
        expect(await createContract('shop', base, true)).toHaveProperty('error', expect.stringContaining('шалгаж чадсангүй'));
        expect(state.inserted).toEqual([]);
    });

    it.each([
        [undefined, 'Пропертис'],
        ['ПРОПЕРТИС', 'Пропертис'],
        [' пропертис ', 'Пропертис'],
        ['Бартер', 'Бартер'],
    ])('stores sales channel %s as %s', async (given, stored) => {
        expect(await createContract('shop', { ...base, sales_channel: given }, true)).toMatchObject({ success: true });
        expect(state.inserted[0]).toMatchObject({ sales_channel: stored });
    });
});
