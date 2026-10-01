import { describe, expect, it } from 'vitest';
import { compareErp, normalizeErpSheets, erpWeek } from './import';
import { readWorkbookSheets, buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { ubDateStr } from '@/lib/utils/date';
import { ROLE_PERMISSIONS } from '@/lib/rbac';

const normalize = (rows: Record<string, unknown>[], columns = ['ID', 'Дүн']) => normalizeErpSheets([{ name: 'Гэрээ', columns, rows }], { Гэрээ: ['ID'] });
describe('ERP snapshots', () => {
    it('reads all sheets and preserves CSV identifiers and Excel dates', async () => {
        const csv = await readWorkbookSheets(Buffer.from('ID,Дүн\n0012,100\n12,200'));
        expect(normalizeErpSheets(csv, { Sheet1: ['ID'] })[0].rows.map(r => r.ID)).toEqual(['0012', '12']);
        const bytes = await buildWorkbookBuffer([{ name: 'Гэрээ', rows: [{ ID: '001', Огноо: new Date(2026, 8, 22) }] }, { name: 'Байр', rows: [{ ID: 'B1-1', Төлөв: 'Сул' }] }]);
        const sheets = await readWorkbookSheets(bytes);
        expect(sheets.map(s => s.name)).toEqual(['Гэрээ', 'Байр']);
        expect(normalizeErpSheets(sheets, { Гэрээ: ['ID'], Байр: ['ID'] })[0].rows[0]['Огноо']).toBe('2026-09-22');
    });
    it('distinguishes initial baseline, additions, changed fields, missing rows and unchanged rows independent of order', () => {
        const before = normalize([{ ID: '1', Дүн: 100 }, { ID: '2', Дүн: 200 }, { ID: '3', Дүн: 300 }]);
        expect(compareErp(null, before).totals).toMatchObject({ baseline: 3, added: 0, changed: 0 });
        const after = normalize([{ ID: '3', Дүн: '300' }, { ID: '1', Дүн: 120 }, { ID: '4', Дүн: 400 }]);
        const report = compareErp(before, after);
        expect(report.totals).toEqual({ total: 3, baseline: 0, added: 1, changed: 1, missing: 1, unchanged: 1 });
        expect(report.changes.find(c => c.kind === 'changed')).toMatchObject({ before: { Дүн: '100' }, after: { Дүн: '120' }, fields: ['Дүн'] });
        expect(before[0].rows).toHaveLength(3);
        expect(compareErp(after, after).totals.changed).toBe(0);
    });
    it('rejects duplicate or missing IDs, incomplete exports and changing the identity columns', () => {
        expect(() => normalize([{ ID: '1' }, { ID: '1' }])).toThrow('давхардсан');
        expect(() => normalize([{ Дүн: 10 }])).toThrow('хоосон');
        const old = normalize([{ ID: '1', Дүн: 100 }]);
        expect(() => compareErp(old, [])).toThrow('Бүтэн экспорт');
        expect(() => compareErp(old, [{ ...old[0], keyColumns: ['Дүн'] }])).toThrow('өмнөх ID');
        expect(compareErp(old, normalize([])).totals.missing).toBe(1);
    });
    it('keeps composite IDs collision-free and surfaces removed columns', () => {
        const rows = [{ A: 'a|b', B: 'c', Дүн: 1 }, { A: 'a', B: 'b|c', Дүн: 2 }];
        const old = normalizeErpSheets([{ name: 'Байр', columns: ['A', 'B', 'Дүн'], rows }], { Байр: ['A', 'B'] });
        const current = normalizeErpSheets([{ name: 'Байр', columns: ['B', 'A'], rows }], { Байр: ['A', 'B'] });
        const diff = compareErp(old, current);
        expect(diff.totals.changed).toBe(2);
        expect(diff.datasets[0].missingColumns).toEqual(['Дүн']);
    });
    it('uses Ulaanbaatar weeks across Monday UTC boundary and exposes ERP only to its explicit roles', () => {
        const date = ubDateStr(new Date('2026-09-21T16:01:00Z'));
        expect(erpWeek(date)).toEqual({ from: '2026-09-21', to: '2026-09-27', due: '2026-09-22' });
        expect(erpWeek('2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04', due: '2025-12-30' });
        expect(ROLE_PERMISSIONS.sales_manager.modules).toContain('erp-imports');
        expect(ROLE_PERMISSIONS.marketing.modules).not.toContain('erp-imports');
        expect(ROLE_PERMISSIONS.viewer.modules).not.toContain('erp-imports');
    });
});
