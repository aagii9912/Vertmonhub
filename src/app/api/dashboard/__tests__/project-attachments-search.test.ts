// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
    role: 'sales_manager', modules: ['leads', 'viewings', 'properties'],
    denied: false, rows: {} as Record<string, Row[]>, errors: {} as Record<string, Error>,
    downloads: [] as string[], reads: [] as string[],
}));
const shop = '20000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000001';
const garden = '30000000-0000-4000-8000-000000000001';
const elysium = '30000000-0000-4000-8000-000000000002';
const ownLead = '40000000-0000-4000-8000-000000000001';
const foreignLead = '40000000-0000-4000-8000-000000000002';
const colleagueLead = '40000000-0000-4000-8000-000000000003';
const file = '50000000-0000-4000-8000-000000000001';

vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserId: async () => user, getUserShop: async () => ({ id: shop }),
    assertShopAccess: async (id: string) => id === shop ? shop : null,
}));
vi.mock('@/lib/auth/require-permission', () => ({
    requireModule: async () => state.denied ? NextResponse.json({ error: 'Denied' }, { status: 403 }) : null,
    requireAnyModule: async () => state.denied ? NextResponse.json({ error: 'Denied' }, { status: 403 }) : null,
    requireModuleWrite: async () => null,
    resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules } }),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({
    from: (table: string) => {
        state.reads.push(table);
        const filters: Array<(row: Row) => boolean> = [];
        let start = 0;
        let end = Infinity;
        const run = () => ({
            data: (state.rows[table] || []).filter(row => filters.every(filter => filter(row))).slice(start, end + 1),
            error: state.errors[table] || null,
        });
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
            is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return query; },
            in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
            order: () => query, or: () => query,
            range: (from: number, to: number) => { start = from; end = to; return query; },
            limit: (count: number) => { end = count - 1; return query; },
            maybeSingle: async () => { const result = run(); return { ...result, data: result.data[0] || null }; },
            then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
        };
        return query;
    },
    storage: { from: () => ({ download: async (path: string) => {
        state.downloads.push(path); return { data: new Blob(['private fixture'], { type: 'application/pdf' }), error: null };
    } }) },
}) }));

import { GET as listAttachments } from '../ai-attachments/route';
import { GET as downloadAttachment } from '../upload/route';
import { GET as searchProperties } from '../properties/search/route';
import { privateAttachmentUrl } from '@/lib/ai/private-attachments';

const attachmentUrl = privateAttachmentUrl(`${shop}/${user}/${file}.pdf`);
const listRequest = (id: string) => new NextRequest(`http://localhost/api/dashboard/ai-attachments?entity_type=lead&entity_id=${id}`);
const search = (query = '') => new NextRequest(`http://localhost/api/dashboard/properties/search${query}`);
beforeEach(() => {
    state.role = 'sales_manager'; state.modules = ['leads', 'viewings', 'properties']; state.denied = false;
    state.errors = {}; state.downloads = []; state.reads = [];
    state.rows = {
        user_profiles: [{ id: user, full_name: 'Бат' }],
        sales_managers: [{ shop_id: shop, name: 'Бат', user_id: user, is_active: true }],
        sales_manager_projects: [{ shop_id: shop, manager_name: 'Бат', project_id: garden }],
        projects: [{ id: garden, shop_id: shop }, { id: elysium, shop_id: shop }],
        leads: [
            { id: ownLead, shop_id: shop, project_id: garden, sales_manager_name: 'Бат' },
            { id: foreignLead, shop_id: shop, project_id: elysium, sales_manager_name: 'Бат' },
            { id: colleagueLead, shop_id: shop, project_id: garden, sales_manager_name: 'Сараа' },
        ],
        ai_attachments: [{ id: file, shop_id: shop, entity_type: 'lead', entity_id: ownLead, url: attachmentUrl }],
        properties: [
            { id: 'garden-unit', shop_id: shop, project_id: garden, is_active: true },
            { id: 'elysium-unit', shop_id: shop, project_id: elysium, is_active: true },
            { id: 'garden-deleted', shop_id: shop, project_id: garden, is_active: true, deleted_at: '2026-01-01' },
        ],
    };
});

describe('lead attachment and viewing property project boundaries', () => {
    it('lists attachments only after checking own lead project and owner', async () => {
        for (const id of [foreignLead, colleagueLead]) {
            expect((await listAttachments(listRequest(id))).status).toBe(404);
        }
        expect(state.reads).not.toContain('ai_attachments');
        const response = await listAttachments(listRequest(ownLead));
        expect(response.status).toBe(200);
        expect((await response.json()).attachments).toHaveLength(1);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });
    it('denies private file bytes after reassignment or another project, including for the uploader', async () => {
        const request = () => new Request(`http://localhost${attachmentUrl}`);
        for (const entityId of [foreignLead, colleagueLead]) {
            state.rows.ai_attachments[0].entity_id = entityId;
            expect((await downloadAttachment(request())).status).toBe(403);
        }
        expect(state.downloads).toEqual([]);
        state.rows.ai_attachments[0].entity_id = ownLead;
        const response = await downloadAttachment(request());
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('private fixture');
        expect(state.downloads).toHaveLength(1);
    });
    it('fails closed on membership reads and excludes deleted lead attachments', async () => {
        state.errors.sales_manager_projects = new Error('Membership schema unavailable');
        expect((await listAttachments(listRequest(ownLead))).status).toBe(503);
        expect((await downloadAttachment(new Request(`http://localhost${attachmentUrl}`))).status).toBe(503);
        expect(state.downloads).toEqual([]);
        state.errors = {}; state.rows.leads[0].deleted_at = '2026-01-01';
        expect((await listAttachments(listRequest(ownLead))).status).toBe(404);
        expect((await downloadAttachment(new Request(`http://localhost${attachmentUrl}`))).status).toBe(403);
    });
    it('filters property choices to manager projects even without an explicit project query', async () => {
        expect((await (await searchProperties(search())).json()).properties.map((row: Row) => row.id)).toEqual(['garden-unit']);
        expect((await (await searchProperties(search(`?project=${garden}`))).json()).properties.map((row: Row) => row.id)).toEqual(['garden-unit']);
        expect((await searchProperties(search(`?project=${elysium}`))).status).toBe(403);
        expect((await searchProperties(search('?project=bad'))).status).toBe(400);
        state.rows.sales_manager_projects = [];
        expect((await (await searchProperties(search())).json()).properties).toEqual([]);
    });
    it('validates explicit organization project filters against the actual shop', async () => {
        state.role = 'admin';
        state.rows.projects[1].shop_id = 'other-shop';
        expect((await searchProperties(search(`?project=${elysium}`))).status).toBe(404);
        expect((await (await searchProperties(search(`?project=${garden}`))).json()).properties.map((row: Row) => row.id)).toEqual(['garden-unit']);
    });
});
