// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { createMemoryDb } from '@/test/memory-db';
import { GET } from './route';

const state = vi.hoisted(() => ({ allowed: true, logError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: state.logError } }));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.allowed ? null : NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 }),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: 'shop-1' }) }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }));

const db = createMemoryDb();
type Row = Record<string, unknown>;
const contract = (id: string, values: Row = {}): Row => ({
    id, shop_id: 'shop-1', deleted_at: null, contract_status: 'active', total_price: 0, paid_amount: 0, balance: 0, overdue_days: 0, ...values,
});

beforeEach(() => {
    state.allowed = true;
    state.logError.mockClear();
    db.failNext = {};
    db.tables = { property_contracts: [], service_logs: [], surveys: [], survey_responses: [], payment_schedules: [] };
});

async function stats() {
    const response = await GET();
    return { status: response.status, body: await response.json() };
}

describe('GET /api/dashboard/contracts/stats/service', () => {
    it('устгасан, цуцалсан гэрээг тоолохгүй; 1000-аас олон гэрээг бүгдийг нь уншина', async () => {
        db.tables.property_contracts = [
            ...Array.from({ length: 1000 }, (_, i) => contract(`c${String(i).padStart(4, '0')}`, { total_price: 10, paid_amount: 4, balance: 6 })),
            contract('z-closed', { contract_status: 'closed', total_price: 100, paid_amount: 100, balance: 0 }),
            contract('z-overdue', { total_price: 50, paid_amount: 10, balance: 40, overdue_days: 9 }),
            contract('z-cancelled', { contract_status: 'cancelled', total_price: 384675000, paid_amount: 5, balance: 1, overdue_days: 30 }),
            contract('z-deleted', { total_price: 999, paid_amount: 999, deleted_at: '2026-10-02T00:00:00Z' }),
            contract('z-foreign', { shop_id: 'shop-2', total_price: 999, paid_amount: 999 }),
        ];
        const { status, body } = await stats();
        expect(status).toBe(200);
        expect(body.stats).toMatchObject({
            total_contracts: 1002, active_contracts: 1001, closed_contracts: 1,
            total_sales: 10150, total_collected: 4110, collection_rate: 40, unknown_paid: 0,
            overdue_contract_count: 1, total_overdue_amount: 40,
        });
    });

    it('төлсөн дүн тодорхойгүй (NULL) гэрээг 0 гэж тооцохгүй — цуглуулсан дүн, хувь null', async () => {
        db.tables.property_contracts = [
            contract('known', { total_price: 100, paid_amount: 60, balance: 40 }),
            contract('erp', { total_price: 900, paid_amount: null, balance: null, overdue_days: 2 }),
        ];
        const { body } = await stats();
        expect(body.stats).toMatchObject({
            total_contracts: 2, total_sales: 1000, total_collected: null, collection_rate: null, unknown_paid: 1,
            overdue_contract_count: 1, total_overdue_amount: null,
        });
    });

    it('гэрээний уншилт алдаатай бол хоосон тоо биш алдаа буцаана', async () => {
        db.failNext.property_contracts = { code: '57014', message: 'timeout' };
        const { status, body } = await stats();
        expect(status).toBe(500);
        expect(body.error).toBe('KPI татахад алдаа гарлаа');
        expect(state.logError).toHaveBeenCalledOnce();
    });

    it('гэрээний эрхгүй хэрэглэгчид 403', async () => {
        state.allowed = false;
        expect((await stats()).status).toBe(403);
    });
});
