import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb } from '@/test/memory-db';
import { isOverdueContract, loadLatestContractListImport, NOT_CANCELLED_CONTRACT, readLatestContractListImport } from '../live';

describe('NOT_CANCELLED_CONTRACT', () => {
    it('NULL төлөвтэйг үлдээж, зөвхөн цуцалсныг хасна (IS DISTINCT FROM)', async () => {
        const db = createMemoryDb({
            property_contracts: [
                { id: 'a', contract_status: 'active' }, { id: 'n', contract_status: null },
                { id: 'c', contract_status: 'cancelled' }, { id: 't', contract_status: 'transferred' },
            ],
        });
        const { data } = await db.from('property_contracts').select('id').or(NOT_CANCELLED_CONTRACT).order('id');
        expect(data.map((row: { id: string }) => row.id)).toEqual(['a', 'n', 't']);
    });
});

describe('loadLatestContractListImport', () => {
    it('тухайн төслийн хамгийн сүүлийн файлын огноотой импортыг буцаана', async () => {
        const db = createMemoryDb({
            contract_list_imports: [
                { shop_id: 'shop-1', report_date: '2026-10-21', file_name: 'old.xlsx', row_count: 80, created_at: '2026-10-21T02:00:00Z' },
                // Хуучин файлыг дараа нь (allowOlder) импортолсон ч сүүлийн огноо хэвээр.
                { shop_id: 'shop-1', report_date: '2026-10-01', file_name: 'older.xlsx', row_count: 70, created_at: '2026-10-22T02:00:00Z' },
                { shop_id: 'shop-2', report_date: '2026-10-22', file_name: 'other.xlsx', row_count: 5, created_at: '2026-10-22T03:00:00Z' },
            ],
        });
        await expect(loadLatestContractListImport(db as unknown as SupabaseClient, 'shop-1'))
            .resolves.toEqual({ report_date: '2026-10-21', file_name: 'old.xlsx', row_count: 80, created_at: '2026-10-21T02:00:00Z', created_by_name: null });
        await expect(loadLatestContractListImport(db as unknown as SupabaseClient, 'shop-3')).resolves.toBeNull();
    });

    it('уншилтын алдааг «импортгүй» гэж нуухгүй', async () => {
        const db = createMemoryDb({ contract_list_imports: [] });
        db.failNext.contract_list_imports = { code: '42P01', message: 'relation does not exist' };
        await expect(loadLatestContractListImport(db as unknown as SupabaseClient, 'shop-1')).rejects.toThrow('relation does not exist');
        db.failNext.contract_list_imports = { code: '57014', message: 'timeout' };
        await expect(loadLatestContractListImport(db as unknown as SupabaseClient, 'shop-1')).rejects.toThrow('timeout');
    });
});

describe('readLatestContractListImport', () => {
    it('хүснэгт байхгүй бол available=false, бусад алдааг дамжуулна', async () => {
        const db = createMemoryDb({ contract_list_imports: [] });
        db.failNext.contract_list_imports = { code: '42P01', message: 'relation does not exist' };
        await expect(readLatestContractListImport(db as unknown as SupabaseClient, 'shop-1')).resolves.toEqual({ latest: null, available: false });
        await expect(readLatestContractListImport(db as unknown as SupabaseClient, 'shop-1')).resolves.toEqual({ latest: null, available: true });
        db.failNext.contract_list_imports = { code: '57014', message: 'timeout' };
        await expect(readLatestContractListImport(db as unknown as SupabaseClient, 'shop-1')).rejects.toThrow('timeout');
    });
});

describe('isOverdueContract', () => {
    const latest = '2026-10-21';
    it('сүүлийн файлын Төлбөр хоцролт ₮ мэдэгдэж байвал түүгээр шийднэ (хуваарийн хоногоос давуу)', () => {
        expect(isOverdueContract({ overdue_amount: '20010000.00', overdue_as_of: latest, overdue_days: 0 }, latest)).toBe(true);
        expect(isOverdueContract({ overdue_amount: 0, overdue_as_of: latest, overdue_days: 12 }, latest)).toBe(false);
    });

    it('хуучин файлын утга эсвэл утгагүй бол хуваарийн хоногоор', () => {
        expect(isOverdueContract({ overdue_amount: 5, overdue_as_of: '2026-10-01', overdue_days: 0 }, latest)).toBe(false);
        expect(isOverdueContract({ overdue_amount: 0, overdue_as_of: '2026-10-01', overdue_days: 3 }, latest)).toBe(true);
        expect(isOverdueContract({ overdue_amount: null, overdue_days: '4' }, latest)).toBe(true);
        expect(isOverdueContract({}, latest)).toBe(false);
    });

    it('импортгүй төсөлд хадгалсан утгыг мэдэгдэж буй гэж үзнэ', () => {
        expect(isOverdueContract({ overdue_amount: 7, overdue_as_of: '2026-09-01' }, null)).toBe(true);
        expect(isOverdueContract({ overdue_amount: null, overdue_days: 0 }, null)).toBe(false);
    });
});
