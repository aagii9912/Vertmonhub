// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ canRead: vi.fn(), rpc: vi.fn(), downloads: [] as string[], file: '' }));
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function query(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let limit: number | null = null;
    let bounds: [number, number] | null = null;
    const rows = () => {
        const data = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
            .sort((a, b) => Number(b.sequence ?? 0) - Number(a.sequence ?? 0));
        const limited = limit === null ? data : data.slice(0, limit);
        return bounds ? limited.slice(bounds[0], bounds[1] + 1) : limited;
    };
    const q = {
        select: () => q, order: () => q,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return q; },
        limit: (value: number) => { limit = value; return q; },
        range: (from: number, to: number) => { bounds = [from, to]; return q; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    return q;
}

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({
    from: query,
    rpc: mocks.rpc,
    storage: { from: () => ({ download: async (path: string) => { mocks.downloads.push(path); return { data: new Blob([mocks.file], { type: 'text/csv' }), error: null }; } }) },
}) }));
vi.mock('@/lib/ai/data-assistant/audit', () => ({ logAiAudit: vi.fn() }));
vi.mock('@/lib/ai/private-attachments', async (original) => ({
    ...await original<typeof import('@/lib/ai/private-attachments')>(),
    canReadPrivateAttachment: mocks.canRead,
}));

import { executeDataTool, type AssistantPerms } from '../index';
import { privateAttachmentUrl } from '@/lib/ai/private-attachments';

const SHOP = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000002';
const url = privateAttachmentUrl(`${SHOP}/${USER}/00000000-0000-4000-8000-000000000003.csv`);
const perms: AssistantPerms = { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['erp-imports'] };
const header = 'Код,Бүтээгдэхүүний төрөл,Бүтээгдэхүүний төлөв,Загвар,Өрөөний тоо';
const products = [header, 'Б1-2,Орон сууц,Худалдаанд,E2,2', 'Б1-3,Орон сууц,Гэрээ баталгаажсан,E2,2', 'Б1-9,Орон сууц,Худалдаанд,F1,3'].join('\n');
const columns = header.split(',');
const keyColumns = ['Бүтээгдэхүүний төрөл', 'Загвар', 'Код'];
const previousRow = (code: string, status: string) => ({ Код: code, 'Бүтээгдэхүүний төрөл': 'Орон сууц', 'Бүтээгдэхүүний төлөв': status, Загвар: 'E2', 'Өрөөний тоо': '2' });
const previous = {
    id: '00000000-0000-4000-8000-0000000000aa', shop_id: SHOP, source: 'Elysium ERP', report_date: '2026-09-28', sequence: 1,
    datasets: [{ name: 'Sheet1', columns, keyColumns, rows: [previousRow('Б1-2', 'Худалдаанд'), previousRow('Б1-3', 'Худалдаанд'), previousRow('Б1-4', 'Худалдаанд')] }],
};
const run = (args: Record<string, unknown>, confirm = false, p = perms) => executeDataTool('import_erp_file', args, SHOP, p, USER, confirm);

beforeEach(() => {
    tables = { erp_imports: [structuredClone(previous)] };
    mocks.file = products;
    mocks.downloads.length = 0;
    mocks.canRead.mockReset().mockResolvedValue(true);
    mocks.rpc.mockReset().mockResolvedValue({ data: 'import-1', error: null });
});

describe('import_erp_file', () => {
    it('previews the export against the previous snapshot with the remembered ID columns', async () => {
        const result = await run({ file_url: url, file_name: 'Elysium бүтээгдэхүүн.csv', report_date: '2026-10-04' });
        expect(result).toMatchObject({
            requiresConfirmation: true,
            label: 'ERP импорт: Elysium ERP (2026-10-04)',
            action: { tool: 'import_erp_file', args: { file_url: url, file_name: 'Elysium бүтээгдэхүүн.csv', source: 'Elysium ERP', report_date: '2026-10-04', keys: { Sheet1: keyColumns }, expected_previous: previous.id, request_id: expect.any(String) } },
            preview: { 'Эх үүсвэр': 'Elysium ERP', 'Өмнөх импорт': '2026-09-28', Sheet1: '3 мөр · шинэ 1 · өөрчлөгдсөн 1 · файлд байхгүй 1' },
        });
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('commits only on confirmation, idempotently by request ID', async () => {
        const preview = await run({ file_url: url, report_date: '2026-10-04' });
        const args = (preview as { action: { args: Record<string, unknown> } }).action.args;
        expect(await run(args, true)).toMatchObject({ success: true, importId: 'import-1' });
        expect(mocks.rpc).toHaveBeenCalledWith('commit_erp_import', expect.objectContaining({
            p_id: args.request_id, p_shop: SHOP, p_source: 'Elysium ERP', p_date: '2026-10-04', p_previous: previous.id, p_user: USER,
        }));
    });

    it('asks for the source when it cannot be inferred and suggests ID columns for a first import', async () => {
        tables.erp_imports.push({ ...structuredClone(previous), id: 'other', source: 'Mandala ERP', sequence: 2 });
        expect(await run({ file_url: url })).toMatchObject({ error: expect.stringContaining('Аль ERP эх үүсвэрт'), options: ['Mandala ERP', 'Elysium ERP'] });
        tables.erp_imports = [];
        expect(await run({ file_url: url })).toHaveProperty('error', expect.stringContaining('анхны ERP импорт'));
        expect(await run({ file_url: url, source: 'Tower ERP', report_date: '2026-10-04' })).toMatchObject({
            action: { args: { keys: { Sheet1: keyColumns }, expected_previous: null } }, preview: { 'Өмнөх импорт': 'Анхны суурь', Sheet1: '3 мөр (анхны суурь)' },
        });
    });

    it('never reads another project, a non-spreadsheet or a file the user cannot open', async () => {
        const foreign = privateAttachmentUrl(`00000000-0000-4000-8000-0000000000ff/${USER}/x.csv`);
        expect(await run({ file_url: foreign })).toHaveProperty('error');
        expect(await run({ file_url: privateAttachmentUrl(`${SHOP}/${USER}/x.pdf`) })).toHaveProperty('error');
        mocks.canRead.mockResolvedValue(false);
        expect(await run({ file_url: url })).toHaveProperty('error', 'Хавсралтыг унших эрх алга');
        expect(mocks.downloads).toEqual([]);
    });

    it('requires the ERP import module and write access', async () => {
        expect(await run({ file_url: url }, false, { ...perms, modules: ['reports'] })).toHaveProperty('error', expect.stringContaining('erp-imports'));
        expect(await run({ file_url: url }, false, { ...perms, canWrite: false })).toHaveProperty('error', expect.stringContaining('бичих'));
        expect(mocks.downloads).toEqual([]);
    });
});
