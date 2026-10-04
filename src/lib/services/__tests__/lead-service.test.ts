import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    tables: {} as Record<string, Row[]>,
    insertError: null as null | { code?: string; message: string },
    raceRow: null as Row | null,
}));

vi.mock('@/lib/sales/manager-identity', () => ({
    resolveManagerIdentity: async (_db: unknown, _shop: string, userId: string) => userId === 'manager-user'
        ? { isManager: true, managerName: 'Батаа' } : { isManager: false, managerName: null },
    resolveActiveManagerName: async (_db: unknown, _shop: string, name: string) => name === 'Сараа'
        ? { ok: true, managerName: 'Сараа' } : { ok: false, status: 400, error: 'Идэвхтэй менежер олдсонгүй' },
}));
vi.mock('@/lib/sales/project-scope', async (original) => ({
    ...(await original<typeof import('@/lib/sales/project-scope')>()),
    assertProjectManager: async () => undefined,
}));

import { insertLeadOnce, resolveLeadIdentity, resolveStaffLead } from '../LeadService';
import { ANONYMOUS_LEAD_CONTACT, ANONYMOUS_LEAD_LABEL, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';
import { UNRESTRICTED_SALES_SCOPE } from '@/lib/sales/project-scope';

const db = { from: (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let payload: Row | null = null;
    const first = () => (state.tables[table] || []).find((row) => filters.every((filter) => filter(row))) ?? null;
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        in: () => query,
        is: () => query,
        order: () => query,
        limit: async (count: number) => ({ data: (state.tables[table] || []).filter((row) => filters.every((filter) => filter(row))).slice(0, count), error: null }),
        insert: (row: Row) => { payload = row; return query; },
        maybeSingle: async () => ({ data: first(), error: null }),
        single: async () => {
            if (state.insertError) {
                if (state.raceRow) (state.tables[table] ||= []).push(state.raceRow);
                return { data: null, error: state.insertError };
            }
            (state.tables[table] ||= []).push(payload!);
            return { data: { id: 'new-lead', ...payload }, error: null };
        },
    };
    return query;
} } as unknown as SupabaseClient;

const project = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-0000000000aa';
const admin = { userId: 'admin-user', role: 'admin', scope: UNRESTRICTED_SALES_SCOPE };

beforeEach(() => {
    state.tables = { projects: [{ id: project, shop_id: 'shop-1' }, { id: other, shop_id: 'shop-2' }], leads: [] };
    state.insertError = null;
    state.raceRow = null;
});

describe('resolveStaffLead', () => {
    it('validates project, scope and closed status before anything else', async () => {
        expect(await resolveStaffLead(db, 'shop-1', { projectId: 'nope' }, admin)).toMatchObject({ ok: false, status: 400 });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: other }, admin)).toMatchObject({ ok: false, status: 400, error: 'Төсөл олдсонгүй' });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project }, { ...admin, scope: { projectIds: [], managerName: 'Батаа' } }))
            .toMatchObject({ ok: false, status: 403 });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project, status: 'closed_won' }, admin)).toMatchObject({ ok: false, status: 400 });
    });

    it('uses the single project of the shop when none is chosen (shop = project)', async () => {
        expect(await resolveStaffLead(db, 'shop-1', {}, admin)).toMatchObject({ ok: true, project_id: project });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: '' }, admin)).toMatchObject({ ok: true, project_id: project });
        // Хуучин олон төсөлтэй shop-д төслийг ил сонгоно.
        state.tables.projects.push({ id: '00000000-0000-4000-8000-000000000003', shop_id: 'shop-1' });
        expect(await resolveStaffLead(db, 'shop-1', {}, admin)).toMatchObject({ ok: false, status: 400, error: 'Лидийн төслийг сонгоно уу' });
        expect(await resolveStaffLead(db, 'shop-3', {}, admin)).toMatchObject({ ok: false, status: 400 });
    });

    it('stamps the creator as manager, lets only admins reassign, and normalizes status and source', async () => {
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project, status: 'contacted', source: 'google' }, { ...admin, userId: 'manager-user', role: 'sales_manager' }))
            .toMatchObject({ ok: true, status: 'contacted', source: 'google_ads', sales_manager_name: 'Батаа' });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project, assignManager: 'Сараа', status: 'weird' }, { ...admin, userId: 'manager-user', role: 'sales_manager' }))
            .toMatchObject({ ok: true, status: 'new', sales_manager_name: 'Батаа' });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project, assignManager: 'Сараа' }, admin)).toMatchObject({ ok: true, sales_manager_name: 'Сараа' });
        expect(await resolveStaffLead(db, 'shop-1', { projectId: project, assignManager: 'Байхгүй' }, admin)).toMatchObject({ ok: false, status: 400 });
    });
});

describe('insertLeadOnce', () => {
    it('inserts once and replays the same request for the same project', async () => {
        const first = await insertLeadOnce(db, { shop_id: 'shop-1', project_id: project, client_request_id: requestId, customer_name: 'Бат' });
        expect(first).toMatchObject({ ok: true, duplicate: false });
        const again = await insertLeadOnce(db, { shop_id: 'shop-1', project_id: project, client_request_id: requestId, customer_name: 'Бат' });
        expect(again).toMatchObject({ ok: true, duplicate: true });
        expect(state.tables.leads).toHaveLength(1);
        expect(await insertLeadOnce(db, { shop_id: 'shop-1', project_id: other, client_request_id: requestId, customer_name: 'Бат' }))
            .toEqual({ ok: false, conflict: true });
    });

    it('resolves a concurrent unique violation and reports other errors', async () => {
        state.insertError = { code: '23505', message: 'duplicate key' };
        state.raceRow = { id: 'raced', shop_id: 'shop-1', project_id: project, client_request_id: requestId };
        expect(await insertLeadOnce(db, { shop_id: 'shop-1', project_id: project, client_request_id: requestId })).toMatchObject({ ok: true, duplicate: true, lead: { id: 'raced' } });
        state.insertError = { code: '23502', message: 'not null' };
        state.raceRow = null;
        expect(await insertLeadOnce(db, { shop_id: 'shop-1', project_id: project })).toMatchObject({ ok: false, conflict: false, error: { code: '23502' } });
    });
});

describe('resolveLeadIdentity', () => {
    it('requires a name unless the staff member explicitly chose anonymous', () => {
        expect(resolveLeadIdentity({ customer_phone: '99112233' })).toEqual({ ok: false, status: 400, error: LEAD_NAME_OR_ANONYMOUS });
        expect(resolveLeadIdentity({ customer_name: ANONYMOUS_LEAD_LABEL, customer_phone: '99112233' })).toMatchObject({ ok: false, error: LEAD_NAME_OR_ANONYMOUS });
        expect(resolveLeadIdentity({ customer_name: '  Г.  Энхжин ', customer_phone: ' ' })).toEqual({
            ok: true, customer_name: 'Г. Энхжин', customer_phone: null, customer_email: null,
        });
    });

    it('stores an anonymous lead as a null name with a reachable phone or email', () => {
        expect(resolveLeadIdentity({ anonymous: true, customer_phone: ' 9911 2233 ' })).toEqual({
            ok: true, customer_name: null, customer_phone: '9911 2233', customer_email: null,
        });
        expect(resolveLeadIdentity({ anonymous: true, customer_email: 'bold@example.com' })).toMatchObject({ ok: true, customer_name: null, customer_email: 'bold@example.com' });
        expect(resolveLeadIdentity({ anonymous: true, customer_name: 'Зохиосон нэр', customer_phone: '99112233' })).toMatchObject({ ok: true, customer_name: null });
    });

    it('rejects an anonymous lead without a way to reach the customer', () => {
        expect(resolveLeadIdentity({ anonymous: true })).toEqual({ ok: false, status: 400, error: ANONYMOUS_LEAD_CONTACT });
        expect(resolveLeadIdentity({ anonymous: true, customer_phone: '99-11', customer_email: 'bold@' })).toMatchObject({ ok: false, error: ANONYMOUS_LEAD_CONTACT });
    });
});
