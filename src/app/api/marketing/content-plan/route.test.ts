// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const shopId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const itemId = '00000000-0000-4000-8000-000000000101';
const file = (owner: string, n: number) => `${shopId}/${owner}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.jpg`;

const state = vi.hoisted(() => ({ signedIn: true, modules: ['marketing-roi'] as string[], canWrite: true, canDelete: false, rows: [] as Row[], removed: [] as string[] }));

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: shopId }), getUserId: async () => state.signedIn ? userId : null }));
vi.mock('@/lib/auth/require-permission', () => {
    const { NextResponse } = require('next/server') as typeof import('next/server');
    const deny = (module: string, flag?: 'canWrite' | 'canDelete') => !state.signedIn ? NextResponse.json({ error: 'auth' }, { status: 401 })
        : !state.modules.includes(module) || (flag && !state[flag]) ? NextResponse.json({ error: 'denied' }, { status: 403 }) : null;
    return {
        requireModule: async (module: string) => deny(module), requireAnyModule: async (modules: string[]) => deny(modules[0]),
        requireModuleWrite: async (module: string) => deny(module, 'canWrite'), requireModuleDelete: async (module: string) => deny(module, 'canDelete'),
    };
});
function table(name: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let action: { kind: 'select' } | { kind: 'insert'; row: Row } | { kind: 'update'; patch: Row } | { kind: 'delete' } = { kind: 'select' };
    const rows = () => name === 'content_calendar' ? state.rows : [];
    const run = () => {
        if (action.kind === 'insert') { const row = { id: itemId, updated_at: '2026-10-13T00:00:00Z', color: '#3B82F6', ...action.row }; state.rows.push(row); return [structuredClone(row)]; }
        const matched = rows().filter(row => filters.every(filter => filter(row)));
        if (action.kind === 'update') { const patch = action.patch; matched.forEach(row => Object.assign(row, patch)); return structuredClone(matched); }
        if (action.kind === 'delete') { state.rows = state.rows.filter(row => !matched.includes(row)); return []; }
        return structuredClone(matched);
    };
    const builder: Record<string, unknown> = {
        select: () => builder, order: () => builder, limit: () => builder,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
        gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return builder; },
        lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return builder; },
        contains: (key: string, values: unknown[]) => { filters.push(row => values.every(value => ((row[key] as unknown[]) ?? []).includes(value))); return builder; },
        insert: (row: Row) => { action = { kind: 'insert', row }; return builder; },
        update: (patch: Row) => { action = { kind: 'update', patch }; return builder; },
        delete: () => { action = { kind: 'delete' }; return builder; },
        single: async () => ({ data: run()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
    };
    return builder;
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: table, storage: { from: () => ({ remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null }; } }) } }) }));

import { GET, POST } from './route';
import { DELETE, PATCH } from './[id]/route';

const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const row = (overrides: Row = {}): Row => ({ id: itemId, shop_id: shopId, title: 'Reel', type: 'reel', platform: 'facebook', scheduled_date: '2026-10-08', scheduled_time: null, status: 'planned',
    description: null, assigned_to: null, color: '#3B82F6', image_paths: [], created_by: otherId, updated_at: '2026-10-13T00:00:00Z', ...overrides });

beforeEach(() => { Object.assign(state, { signedIn: true, modules: ['marketing-roi'], canWrite: true, canDelete: false, rows: [], removed: [] }); });

describe('marketing content plan API', () => {
    it('reads a bounded range for marketing-roi only', async () => {
        state.rows = [row(), row({ id: 'late', scheduled_date: '2026-11-30' })];
        const res = await GET(req('GET', '/api/marketing/content-plan?from=2026-10-07&to=2026-10-20'));
        expect(res.status).toBe(200);
        expect((await res.json()).items.map((item: Row) => item.id)).toEqual([itemId]);
        expect((await GET(req('GET', '/api/marketing/content-plan?from=2026-01-01&to=2026-12-31'))).status).toBe(400);
        state.modules = ['reports'];
        expect((await GET(req('GET', '/api/marketing/content-plan?from=2026-10-07&to=2026-10-20'))).status).toBe(403);
    });

    it('creates with the server shop and creator; refuses foreign images and unknown fields', async () => {
        const res = await POST(req('POST', '/api/marketing/content-plan', { title: 'Reel', type: 'reel', scheduledDate: '2026-10-08', imagePaths: [file(userId, 1)] }));
        expect(res.status).toBe(201);
        expect(state.rows[0]).toMatchObject({ shop_id: shopId, created_by: userId, status: 'planned', image_paths: [file(userId, 1)] });
        expect((await POST(req('POST', '/api/marketing/content-plan', { title: 'x', type: 'post', scheduledDate: '2026-10-08', imagePaths: [file(otherId, 2)] }))).status).toBe(400);
        expect((await POST(req('POST', '/api/marketing/content-plan', { title: 'x', type: 'post', scheduledDate: '2026-10-08', shop_id: 'other' }))).status).toBe(400);
        state.canWrite = false;
        expect((await POST(req('POST', '/api/marketing/content-plan', { title: 'x', type: 'post', scheduledDate: '2026-10-08' }))).status).toBe(403);
        expect(state.rows).toHaveLength(1);
    });

    it('marks content published, keeps earlier posters and removes dropped files', async () => {
        state.rows = [row({ image_paths: [file(otherId, 3), file(otherId, 4)] })];
        const res = await PATCH(req('PATCH', `/api/marketing/content-plan/${itemId}`, { status: 'published', imagePaths: [file(otherId, 3), file(userId, 5)] }), params(itemId));
        expect(res.status).toBe(200);
        expect(state.rows[0]).toMatchObject({ status: 'published', image_paths: [file(otherId, 3), file(userId, 5)] });
        expect(state.removed).toEqual([file(otherId, 4)]);
        expect((await PATCH(req('PATCH', `/api/marketing/content-plan/${itemId}`, { imagePaths: [file(otherId, 6)] }), params(itemId))).status).toBe(409);
        expect((await PATCH(req('PATCH', `/api/marketing/content-plan/${itemId}`, { status: 'done' }), params(itemId))).status).toBe(400);
    });

    it("deletes own content with write access, others' only with delete access", async () => {
        state.rows = [row()];
        expect((await DELETE(req('DELETE', '/x'), params(itemId))).status).toBe(403);
        state.rows = [row({ created_by: userId, image_paths: [file(userId, 7)] })];
        expect((await DELETE(req('DELETE', '/x'), params(itemId))).status).toBe(200);
        expect(state.rows).toEqual([]);
        expect(state.removed).toEqual([file(userId, 7)]);
    });
});
