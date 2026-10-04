// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const shopId = '00000000-0000-0000-0000-000000000001';
const projectA = '22222222-2222-4222-8222-222222222222';
const projectB = '33333333-3333-4333-8333-333333333333';
const state = vi.hoisted(() => ({
    rows: {} as Record<string, Row[]>,
    importRows: [] as Row[],
    writes: [] as Array<{ table: string; payload: Row; ids: unknown[] }>,
    failPaidRead: false,
    missingProjectColumn: false,
    failProjectInsert: false,
    beforeUpdate: null as (() => void) | null,
    adminRole: 'super_admin',
    realInventoryFile: false,
}));

vi.mock('@/lib/auth/supabase-auth', () => ({ supabaseAdmin: () => db, getUserId: async () => 'actor' }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => ({ id: 'actor', role: state.adminRole }) }));
vi.mock('@/lib/utils/xlsx', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/utils/xlsx')>();
    return {
        ...actual,
        readSheetRows: async () => state.importRows,
        readWorkbookSheets: async (buffer: Buffer) => state.realInventoryFile ? actual.readWorkbookSheets(buffer) : [{ name: 'Sheet1', rows: state.importRows }],
    };
});

const db = {
    from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let fields = '*';
        let patch: Row | null = null;
        let inserts: Row[] | null = null;
        let range: [number, number] | null = null;
        let single = false;
        const run = () => {
            if (state.missingProjectColumn && ['properties', 'property_contracts'].includes(table) && fields.includes('project_id'))
                return { data: null, error: { code: '42703', message: 'column project_id does not exist' } };
            if (state.failPaidRead && table === 'property_contracts' && fields === 'id, paid_amount')
                return { data: null, error: { message: 'paid total lookup failed' } };
            if (inserts) {
                if (state.failProjectInsert && inserts.some((row) => row.project_id))
                    return { data: null, error: { code: 'PGRST204', message: "Could not find the 'project_id' column" } };
                const added = inserts.map((row, index) => ({ id: `new-${index}`, deleted_at: null, project_id: null, ...row }));
                state.rows[table] = [...(state.rows[table] || []), ...added];
                state.writes.push({ table, payload: added[0], ids: added.map((row) => row.id) });
                return { data: added, error: null, count: added.length };
            }
            if (patch && state.beforeUpdate) {
                const callback = state.beforeUpdate;
                state.beforeUpdate = null;
                callback();
            }
            let result = (state.rows[table] || []).filter((row) => filters.every((filter) => filter(row)));
            if (range) result = result.slice(range[0], range[1] + 1);
            if (patch) {
                for (const row of result) Object.assign(row, patch);
                state.writes.push({ table, payload: { ...patch }, ids: result.map((row) => row.id) });
            }
            return { data: single ? result[0] || null : result, error: null };
        };
        const query = {
            select: (value: string) => { fields = value; return query; },
            eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
            is: (key: string, value: unknown) => { filters.push((row) => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
            order: () => query,
            limit: (value: number) => { range = [0, value - 1]; return query; },
            range: (from: number, to: number) => { range = [from, to]; return query; },
            update: (value: Row) => { patch = value; return query; },
            insert: (value: Row[]) => { inserts = value; return query; },
            upsert: (value: Row[]) => { state.writes.push({ table, payload: value[0] ?? {}, ids: [] }); return Promise.resolve({ data: null, error: null }); },
            maybeSingle: () => { single = true; return Promise.resolve(run()); },
            then: (resolve: (result: ReturnType<typeof run>) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
        };
        return query;
    },
};

import { POST } from '../import/route';

async function runImport(type: string, rows: Row[], projectId = '', options: { preview?: boolean; block?: string; content?: string; projectName?: string } = {}) {
    state.importRows = rows;
    const formData = new FormData();
    formData.set('file', new File([options.content ?? 'csv'], 'rows.csv'));
    formData.set('shopId', shopId);
    formData.set('type', type);
    if (projectId) formData.set('projectId', projectId);
    if (options.preview !== undefined) formData.set('preview', String(options.preview));
    if (options.block !== undefined) formData.set('block', options.block);
    if (options.projectName !== undefined) formData.set('projectName', options.projectName);
    return POST(new NextRequest('http://localhost/api/admin/import', { method: 'POST', body: formData }));
}

const contractRow = { contract_number: 'C-001', buyer_name: 'Buyer', property_name: 'A-101', total_price: 100, down_payment: 30 };
function contract(overrides: Row = {}): Row {
    return { id: 'live', shop_id: shopId, project_id: projectA, contract_number: 'C-001', total_price: 100, prepayment_paid: 30, paid_amount: 50, balance: 50, deleted_at: null, ...overrides };
}

beforeEach(() => {
    state.rows = {
        shops: [{ id: shopId }],
        projects: [{ id: projectA, shop_id: shopId, name: 'Project A' }, { id: projectB, shop_id: shopId, name: 'Project B' }],
    };
    state.writes = [];
    state.failPaidRead = false;
    state.missingProjectColumn = false;
    state.failProjectInsert = false;
    state.beforeUpdate = null;
    state.adminRole = 'super_admin';
    state.realInventoryFile = false;
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('block inventory import route', () => {
    const unitRow = { code: 'Б1-201', block: 'Б1', category: 'residential', status: 'available', floor: '2', sale_area: 95 };

    it('requires Super Admin and an explicit project before saving units', async () => {
        state.adminRole = 'admin';
        expect((await runImport('units', [unitRow], projectA)).status).toBe(403);
        state.adminRole = 'super_admin';
        expect((await runImport('units', [unitRow])).status).toBe(400);
        expect(state.writes).toEqual([]);
    });

    it('rejects a project in another shop without writes', async () => {
        state.rows.projects[0].shop_id = projectB;
        expect((await runImport('units', [unitRow], projectA)).status).toBe(400);
        expect(state.writes).toEqual([]);
    });

    it('previews the server-validated project, then writes only block inventory', async () => {
        const preview = await runImport('units', [unitRow], projectA, { preview: true, projectName: 'Forged Project' });
        expect(preview.status).toBe(200);
        expect(await preview.json()).toMatchObject({ success: true, preview: { total: 1, fresh: 1, existing: 0, groups: [{ phase: 'Project A', block: 'Б1', category: 'residential' }] } });
        expect(state.writes).toEqual([]);
        expect((await runImport('units', [unitRow], projectA)).status).toBe(200);
        expect(state.rows.property_units).toEqual([expect.objectContaining({ shop_id: shopId, project_id: projectA, phase: 'Project A', block: 'Б1', code: 'Б1-201', source_file: 'rows.csv' })]);
        expect(state.writes.map(write => write.table)).toEqual(['property_units']);
        expect(state.rows.properties).toBeUndefined();
    });

    it('does not save any row when the file contains invalid inventory', async () => {
        expect((await runImport('units', [unitRow, { ...unitRow, code: 'Б1-202', status: 'unknown' }], projectA)).status).toBe(400);
        expect(state.writes).toEqual([]);
    });

    it('preserves leading zeros from a real CSV and supports a single-block export', async () => {
        state.realInventoryFile = true;
        const response = await runImport('units', [], projectA, {
            block: 'Б1',
            content: 'Код,Бүтээгдэхүүний төрөл,Бүтээгдэхүүний төлөв,Давхар,Борлуулах талбай\n00123,Орон сууц,Хүлээлгэсэн,02,95\n',
        });
        expect(response.status).toBe(200);
        expect(state.rows.property_units[0]).toMatchObject({ code: '00123', floor: '02', block: 'Б1', status: 'handed_over', sale_area: 95 });
    });
});

describe('contract import preserves payment accounting', () => {
    it('retains existing paid/advance totals and every ledger/schedule row on reimport', async () => {
        state.rows.property_contracts = [contract()];
        state.rows.payment_schedules = [{ id: 'installment', paid_amount: 20 }];
        state.rows.finance_transactions = [{ id: 'receipt', amount: 20 }];
        const response = await runImport('contracts', [{ ...contractRow, down_payment: 1, total_price: 200 }], projectA);
        expect(response.status).toBe(200);
        expect(state.rows.property_contracts[0]).toMatchObject({ prepayment_paid: 30, paid_amount: 50, balance: 150, total_price: 200 });
        expect(state.rows.payment_schedules).toEqual([{ id: 'installment', paid_amount: 20 }]);
        expect(state.rows.finance_transactions).toEqual([{ id: 'receipt', amount: 20 }]);
        expect(state.writes[0].payload).not.toHaveProperty('paid_amount');
        expect(state.writes[0].payload).not.toHaveProperty('prepayment_paid');
    });

    it('still initializes a new contract with its historical advance snapshot', async () => {
        expect((await runImport('contracts', [contractRow], projectA)).status).toBe(200);
        expect(state.rows.property_contracts[0]).toMatchObject({ paid_amount: 30, prepayment_paid: 30, balance: 70, project_id: projectA });
    });

    it('aborts all writes, including fresh rows, when paid totals cannot be read', async () => {
        state.rows.property_contracts = [contract()];
        state.failPaidRead = true;
        const response = await runImport('contracts', [contractRow, { ...contractRow, contract_number: 'C-002' }], projectA);
        expect(response.status).toBe(500);
        expect(state.writes).toEqual([]);
        expect(state.rows.property_contracts[0]).toMatchObject({ paid_amount: 50, balance: 50 });
    });

    it('keeps the holder of a transferred contract while other fields still update', async () => {
        state.rows.property_contracts = [contract({ customer_name: 'Шинэ эзэмшигч', customer_phone: '88114455' }), contract({ id: 'other', contract_number: 'C-002', customer_name: 'Old' })];
        state.rows.contract_transfers = [{ id: 'transfer-1', shop_id: shopId, contract_id: 'live' }];
        const response = await runImport('contracts', [
            { ...contractRow, total_price: 200, buyer_phone: '99112233' },
            { ...contractRow, contract_number: 'C-002', buyer_name: 'New Buyer' },
        ], projectA);
        expect(response.status).toBe(200);
        expect(state.rows.property_contracts[0]).toMatchObject({ customer_name: 'Шинэ эзэмшигч', customer_phone: '88114455', total_price: 200, paid_amount: 50 });
        expect(state.rows.property_contracts[1]).toMatchObject({ customer_name: 'New Buyer' });
        const body = await response.json();
        expect(body.errors).toBeUndefined();
        expect(body.notes).toEqual([expect.stringContaining('шилжүүлсэн гэрээний эзэмшигчийг импортоор өөрчлөхгүй')]);
    });

    it('preserves a concurrent receipt and rejects stale balance updates', async () => {
        state.rows.property_contracts = [contract()];
        state.beforeUpdate = () => Object.assign(state.rows.property_contracts[0], { paid_amount: 60, balance: 40 });
        const response = await runImport('contracts', [contractRow], projectA);
        expect(response.status).toBe(400);
        expect(state.rows.property_contracts[0]).toMatchObject({ paid_amount: 60, balance: 40 });
        expect((await response.json()).errors[0]).toContain('төлбөр өөрчлөгдсөн');
    });
});

describe('import record identity and scope', () => {
    it('creates a separate project B property without moving project A data', async () => {
        state.rows.properties = [{ id: 'property-A', shop_id: shopId, project_id: projectA, name: 'A-101', price: 100, deleted_at: null }];
        const response = await runImport('properties', [{ name: 'A-101', price: 200 }], projectB);
        expect(response.status).toBe(200);
        expect(state.rows.properties[0]).toMatchObject({ id: 'property-A', project_id: projectA, price: 100 });
        expect(state.rows.properties[1]).toMatchObject({ project_id: projectB, price: 200 });
    });

    it('updates only the selected project active property ID when names repeat', async () => {
        state.rows.properties = [
            { id: 'property-A', shop_id: shopId, project_id: projectA, name: 'A-101', price: 100 },
            { id: 'property-B', shop_id: shopId, project_id: projectB, name: 'A-101', price: 150 },
            { id: 'deleted-B', shop_id: shopId, project_id: projectB, name: 'A-101', price: 50, deleted_at: '2026-09-01' },
        ];
        expect((await runImport('properties', [{ name: 'A-101', price: 200 }], projectB)).status).toBe(200);
        expect(state.rows.properties.map((row) => row.price)).toEqual([100, 200, 50]);
        expect(state.writes[0].ids).toEqual(['property-B']);
    });

    it.each(['properties', 'contracts'])('rejects ambiguous or unassigned legacy %s matches', async (type) => {
        const table = type === 'properties' ? 'properties' : 'property_contracts';
        const row = type === 'properties' ? { name: 'A-101', price: 200 } : contractRow;
        const existing = type === 'properties' ? { id: 'legacy', shop_id: shopId, name: 'A-101', price: 100 } : contract();
        state.rows[table] = [{ ...existing, project_id: null }];
        expect((await runImport(type, [row], projectA)).status).toBe(400);
        expect(state.writes).toEqual([]);
        state.rows[table] = [{ ...existing, project_id: projectA }, { ...existing, id: 'duplicate', project_id: projectA }];
        expect((await runImport(type, [row], projectA)).status).toBe(400);
        expect(state.writes).toEqual([]);
    });

    it('rejects projectless imports targeting records assigned to a project', async () => {
        state.rows.property_contracts = [contract()];
        expect((await runImport('contracts', [contractRow])).status).toBe(400);
        expect(state.writes).toEqual([]);
    });

    it('rejects another project contract number rather than reassigning it', async () => {
        state.rows.property_contracts = [contract()];
        expect((await runImport('contracts', [contractRow], projectB)).status).toBe(400);
        expect(state.writes).toEqual([]);
        expect(state.rows.property_contracts[0].project_id).toBe(projectA);
    });

    it('updates only the active contract ID and ignores deleted same-number records', async () => {
        state.rows.property_contracts = [contract(), contract({ id: 'deleted', total_price: 700, paid_amount: 600, balance: 100, deleted_at: '2026-09-01' })];
        expect((await runImport('contracts', [{ ...contractRow, total_price: 200 }], projectA)).status).toBe(200);
        expect(state.rows.property_contracts[0]).toMatchObject({ total_price: 200, paid_amount: 50, balance: 150 });
        expect(state.rows.property_contracts[1]).toMatchObject({ total_price: 700, paid_amount: 600, balance: 100 });
        expect(state.writes[0].ids).toEqual(['live']);
    });

    it.each(['properties', 'contracts'])('fails closed when %s project scope cannot be queried', async (type) => {
        state.missingProjectColumn = true;
        const response = await runImport(type, [type === 'properties' ? { name: 'A-101', price: 100 } : contractRow], projectA);
        expect(response.status).toBe(500);
        expect(state.writes).toEqual([]);
    });

    it.each(['properties', 'contracts', 'leads'])('never retries a scoped %s insert without project_id', async (type) => {
        state.failProjectInsert = true;
        const row = type === 'properties' ? { name: 'A-101', price: 100 } : type === 'leads' ? { name: 'Buyer', phone: '99112233' } : contractRow;
        const response = await runImport(type, [row], projectA);
        expect(response.status).toBe(400);
        expect(state.writes).toEqual([]);
    });
});

describe('row-level calendar validation', () => {
    it('skips the invalid date row and imports valid rows with an explicit row error', async () => {
        const response = await runImport('contracts', [
            { ...contractRow, contract_number: 'bad', contract_date: '2026-02-31' },
            { ...contractRow, contract_number: 'good', contract_date: '2024-02-29' },
        ], projectA);
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.imported).toBe(1);
        expect(result.errors).toEqual(['Мөр 2: Гэрээний огноо буруу (bad)']);
        expect(state.rows.property_contracts).toHaveLength(1);
        expect(state.rows.property_contracts[0]).toMatchObject({ contract_number: 'good', contract_date: '2024-02-29' });
    });
});

describe('project info import (shop = project)', () => {
    it('updates the workspace project instead of creating a sub-project for a different name', async () => {
        state.rows.projects = [{ id: projectA, shop_id: shopId, name: 'Elysium Residence', district: null }];
        state.rows.shops = [{ id: shopId, custom_knowledge: {} }];
        const response = await runImport('project', [{ 'Төслийн нэр': 'Элизиум хотхон', 'Дүүрэг': 'Хан-Уул', 'Нийт байрны тоо': 242 }]);
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(state.rows.projects).toEqual([expect.objectContaining({ id: projectA, name: 'Elysium Residence', district: 'Хан-Уул', total_units: 242 })]);
        expect(state.writes.filter((write) => write.table === 'projects' && write.ids.includes('new-0'))).toEqual([]);
        expect(result.errors).toEqual([expect.stringContaining('«Элизиум хотхон» нэрийг шинэ төсөл болгоогүй')]);
    });
});
