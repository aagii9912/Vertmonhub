import { describe, expect, it } from 'vitest';
import { buildWeeklyFiles, weeklyFileNote, weeklyFileState, weeklyFilesStatus } from '../weekly-files';

// Хурал 2026-11-11 (Лхагва): тайлант долоо хоног 11-04 (Лхагва) — 11-10 (Мягмар).
const range = { from: '2026-11-04', to: '2026-11-10' };

describe('weeklyFileState', () => {
    it('is fresh only from the Tuesday that closes the report week', () => {
        expect(weeklyFileState('2026-11-10', range)).toBe('fresh');
        expect(weeklyFileState('2026-11-11', range)).toBe('fresh');
        expect(weeklyFileState('2026-11-09', range)).toBe('partial');
        expect(weeklyFileState('2026-11-04', range)).toBe('partial');
        expect(weeklyFileState('2026-11-03', range)).toBe('stale');
        expect(weeklyFileState(null, range)).toBe('missing');
    });
});

describe('buildWeeklyFiles', () => {
    it('starts a project without any file from the contract list and never offers the sales export', () => {
        const files = buildWeeklyFiles({ range, hub: null, products: null, sales: null });
        expect(files.map(file => [file.kind, file.state, file.needed])).toEqual([['hub', 'missing', true], ['products', 'missing', false]]);
        expect(weeklyFilesStatus(files)).toMatchObject({ ready: false, pending: [expect.objectContaining({ kind: 'hub' })] });
    });

    it('does not ask for the product export while the newer contract list covers the inventory', () => {
        const files = buildWeeklyFiles({ range, hub: { date: '2026-11-10', name: 'hub.xlsx', by: 'Ану' }, products: { date: '2026-10-05', name: 'Elysium ERP' }, sales: null });
        expect(files).toEqual([
            { kind: 'hub', state: 'fresh', needed: true, date: '2026-11-10', name: 'hub.xlsx', by: 'Ану' },
            { kind: 'products', state: 'stale', needed: false, date: '2026-10-05', name: 'Elysium ERP', by: null },
        ]);
        expect(weeklyFilesStatus(files)).toEqual({ ready: true, pending: [] });
    });

    it('needs the product export when it is the newer inventory source, and the contract list stays needed once used', () => {
        const files = buildWeeklyFiles({ range, hub: { date: '2026-10-27', name: null }, products: { date: '2026-11-03', name: 'ERP' }, sales: null });
        expect(files.map(file => [file.kind, file.state, file.needed])).toEqual([['hub', 'stale', true], ['products', 'stale', true]]);
        expect(weeklyFilesStatus(files).pending.map(file => file.kind)).toEqual(['hub', 'products']);
    });

    it('lists the sales export only for a project that already imports it, without requiring the contract list', () => {
        const files = buildWeeklyFiles({ range, hub: null, products: { date: '2026-11-10', name: 'ERP' }, sales: { date: '2026-11-09', name: 'ERP гэрээ' } });
        expect(files.map(file => [file.kind, file.state, file.needed])).toEqual([['hub', 'missing', false], ['products', 'fresh', true], ['sales', 'partial', true]]);
        expect(weeklyFilesStatus(files)).toMatchObject({ ready: false, pending: [expect.objectContaining({ kind: 'sales' })] });
    });
});

describe('weeklyFileNote', () => {
    it('says what the file covers in the words shown on the step', () => {
        const [hub] = buildWeeklyFiles({ range, hub: { date: '2026-11-03', name: null }, products: null, sales: null });
        expect(weeklyFileNote(hub, range)).toBe('Сүүлийн файл 11-03-нийх — энэ долоо хоногийн (11-04–11-10) мэдээлэл ороогүй.');
        expect(weeklyFileNote({ ...hub, date: '2026-11-09', state: 'partial' }, range)).toBe('11-09-ний файл — 11-10 хүртэлх сүүлийн өдрүүд ороогүй байж болно.');
        expect(weeklyFileNote({ ...hub, date: '2026-11-10', state: 'fresh' }, range)).toBe('11-10-ний файл — тайлант долоо хоногийг бүтэн хамарсан.');
        expect(weeklyFileNote({ ...hub, date: null, state: 'missing' }, range)).toBe('Хараахан оруулаагүй.');
    });
});
