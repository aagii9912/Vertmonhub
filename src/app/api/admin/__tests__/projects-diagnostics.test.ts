// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: true, failedTable: '', tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserId: async () => 'actor', supabaseAdmin: () => db }));
vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => state.admin ? { id: 'actor', role: 'super_admin' } : null }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAudit: vi.fn() }));

const db = {
    from(table: string) {
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        let bounds: [number, number] | null = null;
        const query = {
            select: () => query,
            is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            order: () => query,
            range: (from: number, to: number) => { bounds = [from, to]; return query; },
            then: (resolve: (value: unknown) => unknown) => {
                const rows = (state.tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
                return Promise.resolve({ data: bounds ? rows.slice(bounds[0], bounds[1] + 1) : rows, error: state.failedTable === table ? { message: 'Read failed' } : null }).then(resolve);
            },
        };
        return query;
    },
};

import { GET } from '../projects/route';

beforeEach(() => {
    state.admin = true;
    state.failedTable = '';
    state.tables = {
        projects: [{ id: 'elysium', shop_id: 'own', name: 'Elysium Residence' }],
        leads: [{ shop_id: 'own', project_id: 'elysium', deleted_at: null }, { shop_id: 'own', project_id: 'elysium', deleted_at: '2026-01-01' }, { shop_id: 'other', project_id: 'elysium', deleted_at: null }],
        property_units: Array.from({ length: 1001 }, () => ({ shop_id: 'own', project_id: null })),
        property_contracts: [{ shop_id: 'own', project_id: null, deleted_at: null }, { shop_id: 'own', project_id: null, deleted_at: '2026-01-01' }],
    };
});

describe('admin project data diagnostics', () => {
    it('counts scoped live links and all pages of unassigned inventory without treating deleted records as current', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            projects: [{ id: 'elysium', counts: { leads: 1, units: 0, contracts: 0 } }],
            unassigned: [{ shop_id: 'own', leads: 0, units: 1001, contracts: 1 }],
        });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('keeps project information visible and marks counts unavailable when a required diagnostic read fails', async () => {
        state.failedTable = 'property_units';
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await (await GET()).json();
        expect(result.projects).toMatchObject([{ id: 'elysium', counts: null }]);
        expect(result.unassigned).toEqual([]);
        expect(result.diagnosticsError).toBeTruthy();
        log.mockRestore();
    });

    it('denies project and diagnostic reads to non-super-admin users', async () => {
        state.admin = false;
        expect((await GET()).status).toBe(403);
    });
});
