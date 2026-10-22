// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkbookBuffer } from '@/lib/utils/xlsx';
import { CONTRACT_LIST_COLUMNS } from '@/lib/contracts/list-format';
import { CONTRACT_LIST_REDIRECT, runErpImport } from '../import-run';

/** erp_imports хоосон (анхны импорт). */
const db = (() => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    return { from: () => query } as unknown as SupabaseClient;
})();

const hubFile = async () => {
    const buffer = await buildWorkbookBuffer([{ name: 'Sheet1', columns: [...CONTRACT_LIST_COLUMNS], rows: [{ 'Төрөл': 'Орон сууц', 'Блок': 'Б1', 'Тоот': 16, 'Төлөв': 'Гэрээ үүссэн' }] }]);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};
const base = { shopId: 'shop-1', userId: 'user-1', fileName: 'HUB data.xlsx', source: 'Elysium HUB' };

describe('runErpImport with a HUB contract list', () => {
    it('flags the sheet on inspect and refuses to store it as a snapshot', async () => {
        const inspected = await runErpImport(db, { ...base, buffer: await hubFile(), action: 'inspect' });
        expect(inspected).toMatchObject({ ok: true, body: { sheets: [{ name: 'Sheet1', contractList: true }] } });
        const options = { source: base.source, reportDate: '2026-10-21', keys: { Sheet1: ['Тоот', 'Захиалга өгсөн огноо'] }, requestId: '11111111-1111-4111-8111-111111111111', expectedPrevious: null };
        for (const action of ['preview', 'commit']) {
            expect(await runErpImport(db, { ...base, buffer: await hubFile(), action, options })).toEqual({ ok: false, status: 400, error: CONTRACT_LIST_REDIRECT });
        }
    });
});
